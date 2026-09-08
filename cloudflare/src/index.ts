/**
 * 쿠팡파트너스 자동 수익형 콘텐츠 시스템의 Cloudflare Worker입니다.
 *
 * API 키는 코드에 넣지 않고 Cloudflare Workers Secrets에서 읽습니다.
 * 현재 단계에서는 상품 검색 → AI 상품 추천 → 블로그 글 생성까지 연결합니다.
 */

export interface Env {
  COUPANG_ACCESS_KEY: string;
  COUPANG_SECRET_KEY: string;
  GEMINI_API_KEY: string;
}

const COUPANG_HOST = "https://api-gateway.coupang.com";
const COUPANG_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const GEMINI_HOST = "https://generativelanguage.googleapis.com/v1beta/models";

// 현재 사용 가능한 안정적인 Gemini 모델을 우선순위대로 사용합니다.
// 상위 모델이 일시적인 503을 반환하면 다음 모델로 자동 전환합니다.
const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
];

const PARTNERS_DISCLOSURE =
  "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

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
  const authorization = await createAuthorization(env, "GET", COUPANG_SEARCH_PATH, query);

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

  // AI 판단에 필요한 실제 API 정보만 정리합니다.
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

/** Gemini REST API를 호출합니다. 503 발생 시 모델을 바꿔 재시도합니다. */
async function generateGemini(env: Env, prompt: string, maxOutputTokens = 4096): Promise<string> {
  let lastError = "Gemini 호출 실패";

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(
          `${GEMINI_HOST}/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens,
                thinkingConfig: { thinkingLevel: "low" },
              },
            }),
          },
        );

        const text = await response.text();

        if (response.status === 503) {
          lastError = `Gemini ${model} 503`;
          continue;
        }

        if (!response.ok) {
          throw new Error(`Gemini API 오류 (${response.status}): ${text.slice(0, 500)}`);
        }

        const data = JSON.parse(text);
        const output = data?.candidates?.[0]?.content?.parts
          ?.map((part: any) => part?.text ?? "")
          .join("")
          .trim();

        if (!output) {
          throw new Error(`Gemini ${model} 응답에 텍스트가 없습니다.`);
        }

        return output;
      } catch (error) {
        if (error instanceof Error) {
          lastError = error.message;
        }

        // 네트워크 오류도 같은 모델에서 한 번 더 시도합니다.
        if (attempt < 3) continue;
        break;
      }
    }
  }

  throw new Error(lastError);
}

/** AI가 쿠팡 검색 결과 중 콘텐츠 제작에 적합한 상품 하나를 고릅니다. */
async function recommendProduct(env: Env, keyword: string, products: any[]) {
  const compactProducts = products.map((product) => ({
    productId: product.productId,
    productName: product.productName,
    rank: product.rank,
    isRocket: product.isRocket,
    isFreeShipping: product.isFreeShipping,
  }));

  const prompt = `
너는 쿠팡 파트너스 콘텐츠용 상품 선정 담당자다.
아래는 쿠팡 API에서 실제로 받은 상품 목록이다.

검색어: ${keyword}
상품 목록:
${JSON.stringify(compactProducts, null, 2)}

목표:
1. 검색어와 상품명이 가장 잘 맞는 상품을 우선한다.
2. 블로그 콘텐츠로 설명하기 좋은 상품을 우선한다.
3. API에 없는 인기, 판매량, 리뷰 수, 평점, 할인율 등의 정보를 만들어내지 않는다.
4. 가격을 기준으로 상품을 과장하지 않는다.
5. 반드시 목록에 존재하는 productId 하나만 선택한다.

다음 JSON 하나만 반환한다.
{"productId":"선택한상품ID","reason":"선정 이유"}
`.trim();

  const raw = await generateGemini(env, prompt, 1024);
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  const selected = products.find((product) => String(product.productId) === String(parsed.productId));

  if (!selected) {
    throw new Error("AI가 실제 검색 결과에 없는 상품을 선택했습니다.");
  }

  return { product: selected, reason: parsed.reason ?? "검색어와의 관련성이 높아 선정했습니다." };
}

/** 선택된 실제 상품 정보만 사용해 블로그 제목과 본문을 생성합니다. */
async function generateBlog(env: Env, product: any, keyword: string) {
  const prompt = `
너는 한국어 상품 정보 블로그 전문 작가다.
아래 상품 정보는 쿠팡 API에서 실제로 받은 정보다.

검색어: ${keyword}
상품명: ${product.productName}
상품 이미지: ${product.productImage}
상품 링크: ${product.productUrl}
로켓배송 여부: ${product.isRocket}
무료배송 여부: ${product.isFreeShipping}

작성 규칙:
- 상품명과 API에서 확인된 정보만 사용한다.
- 제품의 구체적인 기능, 소재, 크기, 배터리, 성능, 구성품 등 API에 없는 정보는 절대 만들어내지 않는다.
- 실제 사용한 것처럼 쓰지 않는다.
- 가짜 리뷰나 체험담을 만들지 않는다.
- 가격, 할인, 최저가, 가성비를 본문 핵심 소재로 사용하지 않는다.
- 과장된 광고 표현을 피한다.
- 단점을 억지로 만들지 않는다. 확인 가능한 단점이 없으면 단점을 지어내지 않는다.
- 같은 표현과 문장 구조를 반복하지 않는다.
- 네이버 블로그에 바로 붙여 넣기 쉬운 자연스러운 한국어로 작성한다.
- 제목 5개를 먼저 만들고, 그중 하나를 대표 제목으로 선택한다.
- 본문은 충분히 읽을 만한 분량으로 작성하되 의미 없는 문장을 늘리지 않는다.
- 마지막에는 상품 링크를 한 번만 넣는다.

반드시 아래 JSON 형식 하나만 반환한다.
{
  "titles":["제목1","제목2","제목3","제목4","제목5"],
  "selectedTitle":"대표 제목",
  "body":"본문 전체"
}
`.trim();

  const raw = await generateGemini(env, prompt, 5000);
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed.titles) || parsed.titles.length !== 5 || !parsed.selectedTitle || !parsed.body) {
    throw new Error("Gemini가 올바른 블로그 결과 형식을 반환하지 않았습니다.");
  }

  return {
    disclosure: PARTNERS_DISCLOSURE,
    titles: parsed.titles,
    selectedTitle: parsed.selectedTitle,
    body: parsed.body,
    partnerUrl: product.productUrl,
  };
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

    // 쿠팡 API 직접 검색 테스트: /coupang-search?keyword=무선청소기
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

    // AI 상품 추천 테스트: 쿠팡 검색 → Gemini 선정까지 한 번에 실행합니다.
    if (url.pathname === "/recommend") {
      const keyword = url.searchParams.get("keyword")?.trim() ?? "";
      if (!keyword) {
        return Response.json({ ok: false, message: "keyword가 필요합니다." }, { status: 400 });
      }

      try {
        const products = await searchProducts(env, keyword);
        if (products.length === 0) {
          return Response.json({ ok: false, message: "검색 결과가 없습니다." }, { status: 404 });
        }

        const recommendation = await recommendProduct(env, keyword, products);
        return Response.json({ ok: true, keyword, ...recommendation });
      } catch (error) {
        return Response.json(
          { ok: false, message: error instanceof Error ? error.message : "상품 추천 실패" },
          { status: 502 },
        );
      }
    }

    // 완성 글 테스트: 쿠팡 검색 → AI 상품 선정 → 제목/본문 생성까지 실행합니다.
    if (url.pathname === "/generate") {
      const keyword = url.searchParams.get("keyword")?.trim() ?? "";
      if (!keyword) {
        return Response.json({ ok: false, message: "keyword가 필요합니다." }, { status: 400 });
      }

      try {
        const products = await searchProducts(env, keyword);
        if (products.length === 0) {
          return Response.json({ ok: false, message: "검색 결과가 없습니다." }, { status: 404 });
        }

        const recommendation = await recommendProduct(env, keyword, products);
        const blog = await generateBlog(env, recommendation.product, keyword);

        return Response.json({
          ok: true,
          keyword,
          recommendation,
          blog,
        });
      } catch (error) {
        return Response.json(
          { ok: false, message: error instanceof Error ? error.message : "콘텐츠 생성 실패" },
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
    // 저장소 연결 전까지는 예약 실행만 대기시킵니다.
    // D1/KV 저장소를 연결한 뒤 이곳에서 자동 상품 추천과 글 생성을 실행합니다.
    console.log("자동화 작업 대기:", controller.cron);
  },
};
