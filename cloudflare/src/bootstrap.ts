/**
 * 배포 직후 자동 콘텐츠 생성이 실제로 되는지 확인하기 위한 1회용 생성 모듈입니다.
 *
 * /generate-bootstrap 경로에서 한 번만 실행할 수 있고,
 * 성공하면 KV에 사용 기록을 남겨 다시 실행되지 않도록 합니다.
 */

export interface BootstrapEnv {
  COUPANG_ACCESS_KEY: string;
  COUPANG_SECRET_KEY: string;
  GEMINI_API_KEY: string;
  CONTENT_STORE: KVNamespace;
}

const COUPANG_HOST = "https://api-gateway.coupang.com";
const COUPANG_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const GEMINI_HOST = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"];
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

/** Gemini JSON 응답을 생성합니다. */
async function gemini(env: BootstrapEnv, prompt: string, maxOutputTokens = 5000) {
  let lastError = "Gemini 호출 실패";
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(`${GEMINI_HOST}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens, thinkingConfig: { thinkingLevel: "low" }, responseMimeType: "application/json" } }),
      });
      const text = await response.text();
      if (response.status === 503) { lastError = `Gemini ${model} 503`; continue; }
      if (!response.ok) throw new Error(`Gemini API 오류 (${response.status}): ${text.slice(0, 400)}`);
      const data = JSON.parse(text);
      const output = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("").trim();
      if (!output) throw new Error("Gemini 응답에 텍스트가 없습니다.");
      return output;
    }
  }
  throw new Error(lastError);
}

/** 검색 결과 중 실제 상품 하나를 선택합니다. */
async function recommend(env: BootstrapEnv, keyword: string, products: any[]) {
  const prices = products.map((p) => Number(p.productPrice)).filter((p) => p > 0).sort((a, b) => a - b);
  const candidates = products.map((p) => {
    const price = Number(p.productPrice);
    const pricePosition = price > 0 ? prices.findIndex((value) => value >= price) + 1 : null;
    const priceScore = price > 0 && prices.length > 1 ? Math.round((1 - (pricePosition! - 1) / (prices.length - 1)) * 100) : 50;
    return { ...p, priceScore, pricePosition };
  });

  const prompt = `너는 쿠팡 파트너스 콘텐츠용 상품 선정 담당자다. 아래는 쿠팡 API 실제 검색 결과다.\n검색어: ${keyword}\n상품 목록: ${JSON.stringify(candidates.map((p) => ({ productId: p.productId, productName: p.productName, price: p.productPrice, priceScore: p.priceScore, rank: p.rank, isRocket: p.isRocket, isFreeShipping: p.isFreeShipping })))}\n\n규칙: 검색어와 상품명이 가장 잘 맞는 상품을 우선하고, 같은 수준의 후보라면 상대 가격 경쟁력과 배송 조건을 고려한다. 비싼 상품도 검색 의도가 강하면 선택할 수 있다. 가격만 싸다고 품질이 좋다고 주장하지 않는다. API에 없는 리뷰수, 평점, 인기, 판매량, 기능은 만들지 않는다. 반드시 목록의 productId 하나만 선택한다. JSON만 반환: {"productId":"...","reason":"..."}`;
  const parsed = JSON.parse((await gemini(env, prompt, 1200)).replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
  const product = products.find((p) => String(p.productId) === String(parsed.productId));
  if (!product) throw new Error("AI가 검색 결과에 없는 상품을 선택했습니다.");
  const scored = candidates.find((p) => String(p.productId) === String(product.productId));
  return { product: { ...product, priceScore: scored?.priceScore ?? 50 }, reason: parsed.reason ?? "검색어와의 관련성과 가격 경쟁력을 함께 고려해 선정했습니다." };
}

/** 실제 상품 정보만 사용해 제목 5개와 본문을 생성합니다. */
async function blog(env: BootstrapEnv, keyword: string, product: any) {
  const prompt = `너는 한국어 상품 정보 블로그 전문 작가다.\n검색어: ${keyword}\n상품명: ${product.productName}\n가격: ${product.productPrice ?? "확인 불가"}\n로켓배송: ${product.isRocket}\n무료배송: ${product.isFreeShipping}\n작성 규칙: 상품명과 API 확인 정보만 사용한다. API에 없는 기능/소재/크기/배터리/성능/구성품을 만들지 않는다. 실제 사용 경험이나 가짜 리뷰를 쓰지 않는다. 가격/할인/최저가를 과장하지 않는다. 가성비라는 표현은 근거가 있을 때만 조심스럽게 사용한다. 과장 광고를 피한다. 제목 5개는 서로 다른 방향으로 만든다. 본문은 충분한 분량의 자연스러운 네이버 블로그 글로 작성한다. 링크와 고지문은 넣지 않는다. JSON만 반환: {"titles":["1","2","3","4","5"],"selectedTitle":"대표 제목","body":"본문"}`;
  const parsed = JSON.parse((await gemini(env, prompt)).replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
  if (!Array.isArray(parsed.titles) || parsed.titles.length !== 5 || !parsed.selectedTitle || !parsed.body) throw new Error("Gemini 블로그 결과 형식이 올바르지 않습니다.");
  return { disclosure: DISCLOSURE, titles: parsed.titles, selectedTitle: parsed.selectedTitle, body: parsed.body, partnerUrl: product.productUrl };
}

/** 실제 생성 파이프라인을 실행하고 최신 글로 저장합니다. */
export async function runBootstrap(env: BootstrapEnv, keyword = "무선청소기") {
  if (await env.CONTENT_STORE.get(BOOTSTRAP_LOCK)) throw new Error("이미 1회 생성 테스트가 완료되었습니다.");
  const products = await search(env, keyword);
  if (!products.length) throw new Error("쿠팡 검색 결과가 없습니다.");

  // 일일 자동 생성과 동일하게 기존 홍보 상품은 초기 테스트에서도 제외합니다.
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

  // 초기 테스트에서 선택한 상품과 제목도 정식 중복 방지 이력에 기록합니다.
  const historyTitles = await env.CONTENT_STORE.get(USED_TITLES_KEY, "json") as string[] | null;
  const productId = String(recommendation.product.productId);
  const productHistory = [...(usedProductIds ?? []), productId].slice(-MAX_HISTORY);
  const titleHistory = [...(historyTitles ?? []), ...generatedBlog.titles].slice(-MAX_HISTORY);
  await env.CONTENT_STORE.put(USED_PRODUCTS_KEY, JSON.stringify(productHistory));
  await env.CONTENT_STORE.put(USED_TITLES_KEY, JSON.stringify(titleHistory));

  await env.CONTENT_STORE.put(BOOTSTRAP_LOCK, JSON.stringify({ completedAt: now.toISOString(), storageKey }));
  await env.CONTENT_STORE.put("last-run", JSON.stringify({ status: "success", type: "bootstrap", keyword, storageKey, finishedAt: now.toISOString() }));
  return { storageKey, record };
}
