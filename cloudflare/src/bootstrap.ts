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

/** 검색어에 맞는 정도를 상품명에서 간단히 계산합니다. */
function relevanceScore(keyword: string, productName: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, "");
  const target = normalize(keyword);
  const name = normalize(productName);
  if (!target || !name) return 0;
  if (name.includes(target)) return 100;

  // 검색어가 여러 단어라면 포함된 단어 비율로 관련성을 계산합니다.
  const words = keyword.toLowerCase().split(/\s+/).filter((word) => word.length >= 2);
  if (!words.length) return 0;
  const matched = words.filter((word) => name.includes(word)).length;
  return Math.round((matched / words.length) * 100);
}

/** 검색 결과 중 실제 상품 하나를 선택합니다. */
async function recommend(env: BootstrapEnv, keyword: string, products: any[]) {
  const prices = products.map((p) => Number(p.productPrice)).filter((p) => p > 0).sort((a, b) => a - b);
  const candidates = products.map((p) => {
    const price = Number(p.productPrice);
    const pricePosition = price > 0 ? prices.findIndex((value) => value >= price) + 1 : null;
    const priceScore = price > 0 && prices.length > 1 ? Math.round((1 - (pricePosition! - 1) / (prices.length - 1)) * 100) : 50;
    const relevance = relevanceScore(keyword, p.productName);
    const rank = Number(p.rank) || 10;
    const rankScore = Math.max(0, 100 - ((rank - 1) / 9) * 100);
    const shippingScore = p.isRocket && p.isFreeShipping ? 100 : p.isRocket || p.isFreeShipping ? 70 : 40;
    // 검색어 관련성을 가장 강하게 반영하고, 가격과 배송은 보조 기준으로 사용합니다.
    const totalScore = Math.round(relevance * 0.50 + rankScore * 0.25 + priceScore * 0.15 + shippingScore * 0.10);
    return { ...p, relevance, priceScore, pricePosition, rankScore: Math.round(rankScore), shippingScore, totalScore };
  }).sort((a, b) => b.totalScore - a.totalScore);

  // AI에는 점수가 높은 상위 5개만 전달해 엉뚱한 후보 선택 가능성을 줄입니다.
  const topCandidates = candidates.slice(0, 5);
  const prompt = `너는 쿠팡 파트너스 콘텐츠용 상품 선정 담당자다. 아래는 쿠팡 API 실제 검색 결과를 점수화한 상위 후보들이다.
검색어: ${keyword}
상품 목록: ${JSON.stringify(topCandidates.map((p) => ({ productId: p.productId, productName: p.productName, price: p.productPrice, relevance: p.relevance, rank: p.rank, rankScore: p.rankScore, priceScore: p.priceScore, shippingScore: p.shippingScore, totalScore: p.totalScore, isRocket: p.isRocket, isFreeShipping: p.isFreeShipping })))}

선정 규칙:
1. 검색어와 상품명의 실제 관련성을 최우선으로 본다.
2. totalScore는 참고용이며 관련성이 낮은 상품을 단순히 가격이 싸다는 이유로 고르지 않는다.
3. 검색 순위는 실제 API 결과의 rank를 참고한다.
4. 가격은 같은 검색 결과 안에서의 상대적 가격으로만 참고한다.
5. 배송 조건은 보조 기준이다.
6. API에 없는 판매량, 리뷰 수, 평점, 할인율, 인기 순위, 기능은 만들지 않는다.
7. 반드시 위 후보 목록에 존재하는 productId 하나만 선택한다.
JSON만 반환: {"productId":"선택한상품ID","reason":"선정 이유"}`;

  let selectedId = "";
  let reason = "";
  try {
    const parsed = JSON.parse((await gemini(env, prompt, 1200)).replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
    selectedId = String(parsed.productId ?? "");
    reason = parsed.reason ?? "";
  } catch {
    // AI 선택이 실패해도 검색 자체는 실패하지 않도록 점수 1위 상품으로 안전하게 대체합니다.
  }

  const selected = topCandidates.find((product) => String(product.productId) === selectedId) ?? topCandidates[0];
  if (!selected) throw new Error("선택 가능한 상품이 없습니다.");

  return {
    product: selected,
    reason: reason || "검색어 관련성을 가장 우선하고 검색 순위·상대 가격·배송 조건을 함께 고려해 선정했습니다.",
    priceScore: selected.priceScore,
  };
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
