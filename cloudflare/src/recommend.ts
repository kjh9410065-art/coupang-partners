/**
 * 오늘의 쿠팡 상품 추천 기능
 *
 * 흐름:
 * 1. Google Trends 한국 급상승 검색어를 가져옵니다.
 * 2. 쿠팡 파트너스 상품 검색 API로 상품을 가져옵니다.
 * 3. 쿠팡 검색 순위 1위부터 순서대로 후보를 사용합니다.
 * 4. 상품 URL을 쿠팡 파트너스 딥링크(단축 URL)로 변환합니다.
 */

export interface RecommendEnv {
  COUPANG_ACCESS_KEY: string;
  COUPANG_SECRET_KEY: string;
  CONTENT_STORE?: KVNamespace;
}

const COUPANG_HOST = "https://api-gateway.coupang.com";
const COUPANG_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const COUPANG_DEEPLINK_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";
const DAILY_KEY = "recommend:today:v5";

const BLOCKED_WORDS = [
  "대통령", "국회", "선거", "정치", "사망", "사건", "사고", "축구", "야구", "농구",
  "선수", "배우", "가수", "연예", "드라마", "영화", "날씨", "태풍", "지진", "뉴스"
];

async function createAuthorization(env: RecommendEnv, method: string, path: string, query = "") {
  // 쿠팡 파트너스 HMAC 서명용 UTC 시간을 생성합니다.
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
  // 1~10위까지 받아서 '다른 상품 보기'에서 순위대로 넘길 수 있게 합니다.
  const query = `keyword=${encodeURIComponent(keyword)}&limit=10`;
  const response = await fetch(`${COUPANG_HOST}${COUPANG_SEARCH_PATH}?${query}`, {
    headers: {
      Authorization: await createAuthorization(env, "GET", COUPANG_SEARCH_PATH, query),
      "Content-Type": "application/json;charset=UTF-8",
    },
  });

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`쿠팡 검색 응답 오류 (${response.status})`);
  }

  if (!response.ok || data?.rCode !== "0") {
    throw new Error(`쿠팡 검색 API 오류 ${data?.rCode ? `[${data.rCode}] ` : ""}${data?.rMessage || response.status}`);
  }

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
    .filter((product: any) => product.productId && product.productName && product.productUrl)
    .filter((product: any) => product.productName.length >= 4 && product.productName.length <= 180)
    .sort((a: any, b: any) => a.rank - b.rank);
}

/**
 * 검색 API가 반환한 URL 전체를 그대로 넘기지 않고,
 * 상품 ID만 사용한 정식 상품 URL로 정규화합니다.
 * 딥링크 API의 url.convert failed(400)를 피하기 위한 처리입니다.
 */
async function createPartnerShortUrl(env: RecommendEnv, productId: string, originalUrl: string) {
  // 쿠팡 딥링크 예제에서 사용하는 가장 단순한 상품 페이지 형태로 먼저 변환합니다.
  const canonicalUrl = /^\d+$/.test(productId)
    ? `https://www.coupang.com/vp/products/${productId}`
    : originalUrl;

  const body = JSON.stringify({ coupangUrls: [canonicalUrl] });
  const response = await fetch(`${COUPANG_HOST}${COUPANG_DEEPLINK_PATH}`, {
    method: "POST",
    headers: {
      Authorization: await createAuthorization(env, "POST", COUPANG_DEEPLINK_PATH),
      "Content-Type": "application/json;charset=UTF-8",
    },
    body,
  });

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`파트너스 딥링크 응답 오류 (${response.status})`);
  }

  if (!response.ok || data?.rCode !== "0") {
    throw new Error(`파트너스 딥링크 API 오류 ${data?.rCode ? `[${data.rCode}] ` : ""}${data?.rMessage || response.status}`);
  }

  const link = data?.data?.[0];
  if (!link?.shortenUrl) throw new Error("파트너스 단축링크가 응답되지 않았습니다.");
  return String(link.shortenUrl);
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

/** 현재 순위 다음 상품을 선택합니다. 1위 → 2위 → 3위 순서입니다. */
function pickByRank(products: any[], currentRank?: number) {
  if (!products.length) return null;
  if (currentRank) {
    const next = products.find((product) => product.rank > currentRank);
    if (next) return next;
  }
  return products[0];
}

export async function getTodayRecommendation(env: RecommendEnv, refresh = false) {
  const today = new Date().toISOString().slice(0, 10);
  const cached = env.CONTENT_STORE
    ? await env.CONTENT_STORE.get(DAILY_KEY, "json") as any
    : null;

  if (!refresh && cached?.date === today && cached?.product) return cached;

  const trends = await getGoogleTrends();
  const keywords = cached?.keyword
    ? [cached.keyword, ...trends.filter((keyword) => keyword !== cached.keyword), "무선청소기", "무선이어폰", "캠핑용품", "생활용품", "주방용품"]
    : [...trends, "무선청소기", "무선이어폰", "캠핑용품", "생활용품", "주방용품"];

  let lastError = "오늘 추천할 쿠팡 상품을 찾지 못했습니다.";

  for (const keyword of keywords) {
    try {
      const products = await searchCoupang(env, keyword);
      if (!products.length) continue;

      const currentRank = refresh && cached?.keyword === keyword ? Number(cached.product?.rank) : undefined;
      const product = pickByRank(products, currentRank);
      if (!product) continue;

      // 상품 ID로 정규화한 URL을 쿠팡 파트너스 단축링크로 변환합니다.
      const partnerUrl = await createPartnerShortUrl(env, product.productId, product.productUrl);

      const result = {
        date: today,
        keyword,
        source: trends.includes(keyword) ? "Google Trends" : "fallback",
        product: { ...product, partnerUrl },
        generatedAt: new Date().toISOString(),
      };

      if (env.CONTENT_STORE) {
        await env.CONTENT_STORE.put(DAILY_KEY, JSON.stringify(result), { expirationTtl: 60 * 60 * 30 });
      }
      return result;
    } catch (error) {
      // 한 검색어/상품에서 실패하면 다음 후보로 넘어갑니다.
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
}
