/**
 * 쿠팡파트너스 자동 수익형 콘텐츠 시스템의 Cloudflare Worker입니다.
 *
 * API 키는 코드에 넣지 않고 Cloudflare Workers Secrets에서 읽습니다.
 */

export interface Env {
  COUPANG_ACCESS_KEY: string;
  COUPANG_SECRET_KEY: string;
  GEMINI_API_KEY: string;
}

const COUPANG_HOST = "https://api-gateway.coupang.com";
const COUPANG_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";

/** 쿠팡 API 인증에 필요한 HMAC-SHA256 서명을 생성합니다. */
async function createAuthorization(env: Env, method: string, path: string, query: string) {
  // 쿠팡이 사용하는 UTC 서명 시각입니다.
  const signedDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(2);
  const message = signedDate + method.toUpperCase() + path + query;

  // Secret Key를 HMAC-SHA256 키로 사용합니다.
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.COUPANG_SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message),
  );

  // 바이너리 서명을 쿠팡이 요구하는 16진수 문자열로 변환합니다.
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${signedDate}, signature=${signature}`;
}

/** 쿠팡 상품 검색 API를 호출합니다. */
async function searchProducts(env: Env, keyword: string) {
  const query = `keyword=${encodeURIComponent(keyword)}`;
  const authorization = await createAuthorization(
    env,
    "GET",
    COUPANG_SEARCH_PATH,
    query,
  );

  const response = await fetch(`${COUPANG_HOST}${COUPANG_SEARCH_PATH}?${query}`, {
    method: "GET",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json;charset=UTF-8",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Coupang API 오류 (${response.status}): ${text.slice(0, 500)}`);
  }

  const data = JSON.parse(text);
  const products = Array.isArray(data?.data?.productData) ? data.data.productData : [];

  // AI가 상품을 판단할 때 필요한 실제 API 정보만 반환합니다.
  return products.map((product: any) => ({
    productId: product.productId ?? null,
    productName: product.productName ?? "",
    productPrice: product.productPrice ?? null,
    productImage: product.productImage ?? "",
    productUrl: product.productUrl ?? "",
    keyword: product.keyword ?? keyword,
    rank: product.rank ?? null,
    isRocket: product.isRocket ?? false,
    isFreeShipping: product.isFreeShipping ?? false,
  }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "coupang-partners-automation",
        message: "Cloudflare Worker 정상 작동 중",
      });
    }

    if (url.pathname === "/secrets-check") {
      return Response.json({
        ok: true,
        secrets: {
          coupangAccessKey: Boolean(env.COUPANG_ACCESS_KEY),
          coupangSecretKey: Boolean(env.COUPANG_SECRET_KEY),
          geminiApiKey: Boolean(env.GEMINI_API_KEY),
        },
      });
    }

    // 테스트용 상품 검색: /coupang-search?keyword=무선청소기
    if (url.pathname === "/coupang-search") {
      const keyword = url.searchParams.get("keyword")?.trim() ?? "";
      if (!keyword) {
        return Response.json({ ok: false, message: "keyword가 필요합니다." }, { status: 400 });
      }

      try {
        const products = await searchProducts(env, keyword);
        return Response.json({ ok: true, keyword, count: products.length, products });
      } catch (error) {
        return Response.json(
          { ok: false, message: error instanceof Error ? error.message : "쿠팡 API 호출 실패" },
          { status: 502 },
        );
      }
    }

    return Response.json({ ok: false, message: "존재하지 않는 경로입니다." }, { status: 404 });
  },

  async scheduled(
    controller: ScheduledController,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    // 자동 상품 추천 기능은 검색 테스트가 확인된 뒤 연결합니다.
    console.log("자동화 작업 대기:", controller.cron);
  },
};
