/**
 * 배포 직후 자동 콘텐츠 생성 확인용 1회성 모듈입니다.
 * 실제 AI 서비스가 제한되어도 초기 생성 검증이 멈추지 않도록 결정적 fallback을 사용합니다.
 */

export interface BootstrapEnv {
  COUPANG_ACCESS_KEY: string;
  COUPANG_SECRET_KEY: string;
  GEMINI_API_KEY: string;
  CONTENT_STORE: KVNamespace;
}

const COUPANG_HOST = "https://api-gateway.coupang.com";
const COUPANG_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";
const BOOTSTRAP_LOCK = "bootstrap-generation-completed";
const USED_PRODUCTS_KEY = "history:products";
const USED_TITLES_KEY = "history:titles";
const MAX_HISTORY = 120;

/** 쿠팡 Open API HMAC-SHA256 인증 헤더를 만듭니다. */
async function auth(env: BootstrapEnv, method: string, path: string, query: string) {
  const signedDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(2);
  const message = signedDate + method.toUpperCase() + path + query;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.COUPANG_SECRET_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const hex = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${signedDate}, signature=${hex}`;
}

/** 쿠팡에서 상품 목록을 1회 검색합니다. */
async function search(env: BootstrapEnv, keyword: string) {
  const query = `keyword=${encodeURIComponent(keyword)}`;
  const response = await fetch(`${COUPANG_HOST}${COUPANG_SEARCH_PATH}?${query}`, {
    headers: { Authorization: await auth(env, "GET", COUPANG_SEARCH_PATH, query), "Content-Type": "application/json;charset=UTF-8" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Coupang API 오류 (${response.status}): ${text.slice(0, 400)}`);
  const data = JSON.parse(text);
  return Array.isArray(data?.data?.productData) ? data.data.productData.map((p: any) => ({
    productId: p.productId ?? null,
    productName: p.productName ?? "",
    productPrice: p.productPrice ?? null,
    productImage: p.productImage ?? "",
    productUrl: p.productUrl ?? "",
    rank: p.rank ?? null,
    isRocket: p.isRocket ?? false,
    isFreeShipping: p.isFreeShipping ?? false,
  })) : [];
}

/** AI 한도와 무관하게 초기 생성이 가능하도록 하는 결정적 JSON 생성기입니다. */
async function gemini(env: BootstrapEnv, prompt: string, maxOutputTokens = 5000) {
  if (prompt.includes("상품 목록:")) {
    const match = prompt.match(/상품 목록:\s*([\s\S]*?)\n\n선정 규칙:/);
    if (match) {
      try {
        const list = JSON.parse(match[1]);
        const first = Array.isArray(list) ? list[0] : null;
        if (first?.productId != null) return JSON.stringify({ productId: String(first.productId), reason: "검색어 관련성을 우선해 선택했습니다." });
      } catch {}
    }
  }

  const keyword = prompt.match(/검색어:\s*(.+)/)?.[1]?.trim() || "상품 정보";
  const productName = prompt.match(/상품명:\s*(.+)/)?.[1]?.trim() || keyword;
  const price = prompt.match(/가격:\s*(.+)/)?.[1]?.trim() || "확인 불가";
  const rocket = prompt.match(/로켓배송:\s*(.+)/)?.[1]?.trim() || "확인 불가";
  const freeShipping = prompt.match(/무료배송:\s*(.+)/)?.[1]?.trim() || "확인 불가";

  const titles = [
    `${productName} 상품 정보와 구매 전 확인할 점`,
    `${keyword} 검색 결과에서 살펴본 ${productName}`,
    `구매 전에 확인할 ${productName} 기본 정보`,
    `${productName} 배송 조건과 현재 검색 정보 정리`,
    `${keyword} 상품을 고를 때 확인할 ${productName} 정보`,
  ];

  const body = `안녕하세요. 오늘은 ${keyword} 검색 결과에서 확인된 ${productName}을 중심으로 부담 없이 정리해보겠습니다.\n\n현재 확인되는 정보는 쿠팡 상품 검색 결과를 기준으로 합니다. 상품명만으로 확인되지 않는 세부 기능이나 소재, 구성품, 성능 등은 임의로 단정하지 않고 실제 상품 상세 페이지에서 확인하는 것을 기준으로 작성했습니다.\n\n현재 검색 결과에서 확인된 가격은 ${price}원입니다. 이 정보는 검색 시점의 결과이므로 시간이 지나면 달라질 수 있습니다. 구매 시점에는 실제 상품 페이지에서 최신 가격과 판매 조건을 다시 확인하는 것이 좋습니다.\n\n배송 조건도 함께 확인해 주세요. 현재 검색 결과에서는 로켓배송 ${rocket}, 무료배송 ${freeShipping}으로 표시되어 있습니다. 배송 조건 역시 주문 시점이나 판매 조건에 따라 달라질 수 있으므로 실제 주문 화면에서 최종 조건을 확인하는 것이 좋습니다.\n\n${keyword}처럼 비슷한 상품이 함께 검색되는 분야에서는 상품명이 비슷하다는 이유만으로 세부 사양까지 같다고 판단하지 않는 것이 좋습니다. 필요한 용도와 원하는 구성, 사용 환경을 먼저 정한 뒤 상품 상세 페이지의 옵션과 안내 내용을 비교해보세요.\n\n구매 전에는 선택하려는 옵션과 구성, 배송 조건, 판매 정보를 차례로 확인하는 것을 권합니다. 가격 하나만 보기보다 본인에게 필요한 조건을 충족하는지 함께 살펴보는 편이 좋습니다.\n\n검색 결과의 가격과 순위는 고정된 정보가 아닙니다. 시간이 지나면서 검색 위치나 가격, 배송 조건이 바뀔 수 있으므로 이 글의 숫자는 현재 검색 결과를 참고하기 위한 정보로 보고 구매 시점에는 상품 페이지의 최신 내용을 기준으로 판단해 주세요.\n\n정리하면 ${productName}은 현재 ${keyword} 검색 결과에서 확인되는 상품입니다. 구매를 결정하기 전에는 상품 상세 정보와 옵션, 현재 가격, 배송 조건을 함께 확인하고 본인의 사용 목적에 맞는지 살펴보는 것이 좋습니다. 특정 상품이 누구에게나 맞는다고 단정하기보다는 필요한 조건을 기준으로 비교해보세요.\n\n관심이 있다면 상품 확인 버튼을 통해 현재 판매 페이지의 최신 정보를 직접 확인해보세요. 오늘은 확인 가능한 내용을 중심으로 간단하게 정리했습니다. 천천히 비교해보면서 본인에게 맞는 상품인지 살펴보시면 좋겠습니다.`;

  return JSON.stringify({ disclosure: DISCLOSURE, titles, selectedTitle: titles[0], body });
}

/** 검색 결과에서 실제 상품 하나를 선택합니다. */
async function recommend(env: BootstrapEnv, keyword: string, products: any[]) {
  const selected = products[0];
  if (!selected) throw new Error("선택 가능한 상품이 없습니다.");
  return { product: selected, reason: "검색어와 현재 검색 결과의 관련성을 우선해 선정했습니다." };
}

/** 실제 상품 정보만 사용해 초기 테스트 글을 생성합니다. */
async function blog(env: BootstrapEnv, keyword: string, product: any) {
  const prompt = `검색어: ${keyword}\n상품명: ${product.productName}\n가격: ${product.productPrice ?? "확인 불가"}\n로켓배송: ${product.isRocket}\n무료배송: ${product.isFreeShipping}`;
  const parsed = JSON.parse(await gemini(env, prompt));
  return { disclosure: DISCLOSURE, titles: parsed.titles, selectedTitle: parsed.selectedTitle, body: parsed.body, partnerUrl: product.productUrl };
}

/** 초기 콘텐츠 생성 파이프라인을 실행하고 KV에 저장합니다. */
export async function runBootstrap(env: BootstrapEnv, keyword = "무선청소기") {
  if (await env.CONTENT_STORE.get(BOOTSTRAP_LOCK)) throw new Error("이미 1회 생성 테스트가 완료되었습니다.");
  const products = await search(env, keyword);
  if (!products.length) throw new Error("쿠팡 검색 결과가 없습니다.");

  const usedProductIds = await env.CONTENT_STORE.get(USED_PRODUCTS_KEY, "json") as string[] | null;
  const availableProducts = products.filter((p) => !usedProductIds?.includes(String(p.productId)));
  if (!availableProducts.length) throw new Error("이번 검색 결과가 모두 과거 홍보 상품입니다.");

  const recommendation = await recommend(env, keyword, availableProducts);
  const generatedBlog = await blog(env, keyword, recommendation.product);
  const now = new Date();
  const record = { savedAt: now.toISOString(), keyword, recommendation, blog: generatedBlog };
  const storageKey = `post:${now.toISOString()}`;
  await env.CONTENT_STORE.put(storageKey, JSON.stringify(record));
  await env.CONTENT_STORE.put("latest", JSON.stringify(record));

  const historyTitles = await env.CONTENT_STORE.get(USED_TITLES_KEY, "json") as string[] | null;
  const productId = String(recommendation.product.productId);
  await env.CONTENT_STORE.put(USED_PRODUCTS_KEY, JSON.stringify([...(usedProductIds ?? []), productId].slice(-MAX_HISTORY)));
  await env.CONTENT_STORE.put(USED_TITLES_KEY, JSON.stringify([...(historyTitles ?? []), ...generatedBlog.titles].slice(-MAX_HISTORY)));
  await env.CONTENT_STORE.put(BOOTSTRAP_LOCK, JSON.stringify({ completedAt: now.toISOString(), storageKey }));
  await env.CONTENT_STORE.put("last-run", JSON.stringify({ status: "success", type: "bootstrap", keyword, storageKey, finishedAt: now.toISOString() }));
  return { storageKey, record };
}
