/**
 * 오늘의 쿠팡 상품 추천 기능
 *
 * 흐름:
 * 1. Google Trends 한국 급상승 검색어를 가져옵니다.
 * 2. 상품으로 연결할 수 있는 검색어를 순서대로 쿠팡에서 검색합니다.
 * 3. 실제 쿠팡 검색 결과가 있는 상품 중 하나를 골라 보여줍니다.
 * 4. 같은 날짜에는 같은 추천 상품을 보여주도록 KV에 저장합니다.
 */

export interface RecommendEnv {
  COUPANG_ACCESS_KEY: string;
  COUPANG_SECRET_KEY: string;
  CONTENT_STORE?: KVNamespace;
}

const COUPANG_HOST = "https://api-gateway.coupang.com";
const COUPANG_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const DAILY_KEY = "recommend:today";

// 뉴스/인물처럼 상품으로 연결하기 어려운 검색어를 우선 제외합니다.
const BLOCKED_WORDS = [
  "대통령", "국회", "선거", "정치", "사망", "사건", "사고", "축구", "야구", "농구",
  "선수", "배우", "가수", "연예", "드라마", "영화", "날씨", "태풍", "지진", "뉴스"
];

async function createAuthorization(env: RecommendEnv, method: string, path: string, query: string) {
  const signedDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(2);
  const message = signedDate + method.toUpperCase() + path + query;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.COUPANG_SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const hex = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${signedDate}, signature=${hex}`;
}

async function searchCoupang(env: RecommendEnv, keyword: string) {
  const query = `keyword=${encodeURIComponent(keyword)}`;
  const response = await fetch(`${COUPANG_HOST}${COUPANG_SEARCH_PATH}?${query}`, {
    headers: {
      Authorization: await createAuthorization(env, "GET", COUPANG_SEARCH_PATH, query),
      "Content-Type": "application/json;charset=UTF-8",
    },
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`쿠팡 검색 오류 (${response.status})`);

  const data = JSON.parse(text);
  const products = Array.isArray(data?.data?.productData) ? data.data.productData : [];

  return products
    .map((product: any) => ({
      productId: String(product.productId ?? ""),
      productName: String(product.productName ?? "").trim(),
      productPrice: Number(product.productPrice) || 0,
      productImage: String(product.productImage ?? ""),
      productUrl: String(product.productUrl ?? ""),
      rank: Number(product.rank) || 999,
      isRocket: Boolean(product.isRocket),
    }))
    .filter((product: any) => product.productId && product.productName && product.productUrl);
}

async function getGoogleTrends(): Promise<string[]> {
  try {
    const response = await fetch("https://trends.google.com/trending/rss?geo=KR", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok) return [];

    const xml = await response.text();
    return [...xml.matchAll(/<title>(.*?)<\/title>/g)]
      .map((match) => decodeXml(match[1]).trim())
      .filter((title) => title && title !== "Daily Search Trends")
      .filter((title) => !BLOCKED_WORDS.some((word) => title.includes(word)))
      .slice(0, 20);
  } catch {
    return [];
  }
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isUsefulProduct(product: any) {
  // 지나치게 긴 상품명이나 상품이 아닌 검색 결과를 조금 걸러냅니다.
  return product.productName.length >= 4 && product.productName.length <= 180;
}

export async function getTodayRecommendation(env: RecommendEnv) {
  const today = new Date().toISOString().slice(0, 10);

  // 하루 동안 추천 상품을 고정해 새로고침할 때마다 상품이 바뀌지 않게 합니다.
  if (env.CONTENT_STORE) {
    const cached = await env.CONTENT_STORE.get(DAILY_KEY, "json") as any;
    if (cached?.date === today && cached?.product) return cached;
  }

  const trends = await getGoogleTrends();
  // Google Trends가 막히는 경우에도 서비스가 빈 화면이 되지 않도록 기본 상품 검색어를 사용합니다.
  const keywords = [...trends, "무선청소기", "무선이어폰", "캠핑용품", "생활용품", "주방용품"];

  for (const keyword of keywords) {
    try {
      const products = (await searchCoupang(env, keyword)).filter(isUsefulProduct);
      if (!products.length) continue;

      // 검색어가 오늘의 트렌드 상위에 있을수록 우선하고,
      // 같은 검색어 안에서는 쿠팡 검색 순위가 높은 상품을 선택합니다.
      const product = products[0];
      const result = {
        date: today,
        keyword,
        source: trends.includes(keyword) ? "Google Trends" : "fallback",
        product,
        generatedAt: new Date().toISOString(),
      };

      if (env.CONTENT_STORE) {
        await env.CONTENT_STORE.put(DAILY_KEY, JSON.stringify(result), { expirationTtl: 60 * 60 * 30 });
      }
      return result;
    } catch {
      // 한 검색어의 API 오류가 전체 추천을 막지 않도록 다음 검색어로 넘어갑니다.
    }
  }

  throw new Error("오늘 추천할 쿠팡 상품을 찾지 못했습니다.");
}
