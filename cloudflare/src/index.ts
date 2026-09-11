/**
 * 쿠팡파트너스 자동 생성 핵심 Worker 모듈입니다.
 * 트렌드 → 쿠팡 상품 검색 → 미사용 상품 선정 → 공개 정보 조사 → 본문 생성 → 품질 검사 → KV 저장 순서로 실행합니다.
 */

import { validateContentQuality } from "./quality";
import { factCheckContent, type ProductResearch } from "./factcheck";
import { buildProductPost } from "./content-template-fixed";

export interface Env {
  COUPANG_ACCESS_KEY: string;
  COUPANG_SECRET_KEY: string;
  GEMINI_API_KEY?: string;
  CONTENT_STORE: KVNamespace;
  AI?: Ai;
}

const COUPANG_HOST = "https://api-gateway.coupang.com";
const COUPANG_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const PARTNERS_DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";
const TREND_CACHE_KEY = "trend:today";
const USED_PRODUCTS_KEY = "history:products";
const USED_TITLES_KEY = "history:titles";
const MAX_HISTORY = 120;

const FALLBACK_KEYWORDS = [
  "무선청소기", "차량용품", "캠핑용품", "주방 수납용품", "생활용품",
  "컴퓨터 주변기기", "무선이어폰", "공기청정기", "운동용품", "조명용품", "보온용품",
];

/** 쿠팡 Open API HMAC 인증 헤더를 생성합니다. */
async function createAuthorization(env: Env, method: string, path: string, query: string) {
  const signedDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(2);
  const message = signedDate + method.toUpperCase() + path + query;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.COUPANG_SECRET_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const hex = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${signedDate}, signature=${hex}`;
}

/** 쿠팡에서 검색어에 맞는 상품을 가져옵니다. */
async function searchProducts(env: Env, keyword: string) {
  const query = `keyword=${encodeURIComponent(keyword)}`;
  const response = await fetch(`${COUPANG_HOST}${COUPANG_SEARCH_PATH}?${query}`, {
    headers: { Authorization: await createAuthorization(env, "GET", COUPANG_SEARCH_PATH, query), "Content-Type": "application/json;charset=UTF-8" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`쿠팡 API 오류 (${response.status}): ${text.slice(0, 400)}`);
  const data = JSON.parse(text);
  const products = Array.isArray(data?.data?.productData) ? data.data.productData : [];
  return products.map((p: any) => ({
    productId: p.productId ?? null,
    productName: p.productName ?? "",
    productPrice: Number(p.productPrice) || null,
    productImage: p.productImage ?? "",
    productUrl: p.productUrl ?? "",
    keyword: p.keyword ?? keyword,
    rank: Number(p.rank) || null,
    isRocket: Boolean(p.isRocket),
    isFreeShipping: Boolean(p.isFreeShipping),
  }));
}

/** Google Trends 한국 급상승 검색어를 가져옵니다. */
async function fetchTrendSignals() {
  try {
    const response = await fetch("https://trends.google.com/trending/rss?geo=KR", { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) return [] as string[];
    const xml = await response.text();
    return [...xml.matchAll(/<title>(.*?)<\/title>/g)]
      .map((m) => m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim())
      .filter((title) => title && title !== "Daily Search Trends")
      .slice(0, 30);
  } catch {
    return [] as string[];
  }
}

/** 일반 검색 트렌드 중 상품으로 연결하기 쉬운 주제를 고릅니다. */
async function getDailyKeyword(env: Env, date = new Date()): Promise<{ keyword: string; source: string }> {
  const dateKey = date.toISOString().slice(0, 10);
  const cached = await env.CONTENT_STORE.get(TREND_CACHE_KEY, "json") as any;
  if (cached?.date === dateKey && cached.keyword) return cached;

  const trends = await fetchTrendSignals();
  const productHints = [
    "청소", "이어폰", "충전", "노트북", "키보드", "마우스", "모니터", "선풍기", "가습기",
    "텀블러", "운동화", "백팩", "수납", "캠핑", "주방", "조명", "보조배터리", "생활용품",
  ];
  const matched = trends.find((trend) => productHints.some((hint) => trend.includes(hint)));
  const keyword = matched || FALLBACK_KEYWORDS[Math.floor(date.getTime() / 86400000) % FALLBACK_KEYWORDS.length];
  const result = { date: dateKey, keyword, source: matched ? "google-trends" : "fallback" };
  await env.CONTENT_STORE.put(TREND_CACHE_KEY, JSON.stringify(result), { expirationTtl: 60 * 60 * 30 });
  return result;
}

/** 상품명과 검색 주제에 대한 공개 웹 근거를 수집합니다. */
async function researchProduct(productName: string, productUrl: string): Promise<ProductResearch> {
  const sources: { title: string; url: string; snippet: string }[] = [];
  const evidence: string[] = [];
  const queries = [`"${productName}" 상품 특징`, `"${productName}" 사용 용도`];

  for (const query of queries) {
    try {
      const response = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=6&setlang=ko&cc=kr`, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) continue;
      const html = await response.text();
      for (const match of html.matchAll(/<li class="[^\"]*b_algo[^\"]*"[^>]*>([\s\S]*?)<\/li>/g)) {
        if (sources.length >= 8) break;
        const block = match[1];
        const title = stripHtml(block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "");
        const snippet = stripHtml(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
        const href = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"/i)?.[1] ?? "";
        const text = `${title} ${snippet}`.trim();
        if (!title || text.length < 20) continue;
        sources.push({ title, url: href.startsWith("http") ? href : "", snippet: text.slice(0, 700) });
        evidence.push(text.slice(0, 700));
      }
    } catch {}
  }

  if (!sources.length) {
    sources.push({ title: productName, url: productUrl, snippet: productName });
    evidence.push(productName);
  }

  return { productName, sources: sources.slice(0, 8), evidence: [...new Set(evidence)].slice(0, 8), researchedAt: new Date().toISOString() };
}

/** HTML 태그를 제거합니다. */
function stripHtml(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&#039;/gi, "'").replace(/\s+/g, " ").trim();
}

/** 과거에 사용한 상품/제목 이력을 읽습니다. */
async function getHistory(env: Env) {
  const productIds = await env.CONTENT_STORE.get(USED_PRODUCTS_KEY, "json") as string[] | null;
  const titles = await env.CONTENT_STORE.get(USED_TITLES_KEY, "json") as string[] | null;
  return { productIds: productIds ?? [], titles: titles ?? [] };
}

/** 검색 결과에서 과거에 사용하지 않은 상품을 고릅니다. */
function recommendProduct(keyword: string, products: any[], usedProductIds: string[]) {
  const available = products.filter((p) => p.productName && !usedProductIds.includes(String(p.productId)));
  if (!available.length) throw new Error("이번 검색 결과의 상품이 모두 과거에 홍보된 상품입니다.");
  const scored = available.map((product) => {
    const name = String(product.productName).toLowerCase();
    const tokens = keyword.toLowerCase().split(/\s+/).filter((x) => x.length >= 2);
    const matchScore = tokens.reduce((score, token) => score + (name.includes(token) ? 12 : 0), 0);
    return { product, score: matchScore + Math.max(0, 12 - (Number(product.rank) || 12)) + (product.productImage ? 5 : 0) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].product;
}

/** 관련 이미지를 최대 2장 추가로 찾습니다. 실패하면 공식 상품 이미지만 사용합니다. */
async function fetchRelatedImages(productName: string, officialImage: string) {
  const images = officialImage ? [officialImage] : [];
  try {
    const response = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(`"${productName}" 상품`)}&form=HDRSC2&setlang=ko&cc=kr`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (response.ok) {
      const html = await response.text();
      for (const match of html.matchAll(/"murl":"(.*?)"/g)) {
        if (images.length >= 3) break;
        const candidate = match[1].replaceAll("\\/", "/").replaceAll("\\u0026", "&");
        if (!/^https?:\/\//i.test(candidate) || images.includes(candidate) || /logo|icon|sprite|avatar|favicon|microsoft|windows/i.test(candidate)) continue;
        if (await isImageUrl(candidate)) images.push(candidate);
      }
    }
  } catch {}
  return [...new Set(images)].slice(0, 3);
}

async function isImageUrl(url: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);
    return response.ok && (response.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

/** 오늘의 자동 콘텐츠를 한 건 생성하고 KV에 저장합니다. */
export async function generateToday(env: Env, forcedKeyword?: string) {
  const trend = forcedKeyword ? { keyword: forcedKeyword, source: "manual" } : await getDailyKeyword(env);
  const history = await getHistory(env);
  const products = await searchProducts(env, trend.keyword);
  const product = recommendProduct(trend.keyword, products, history.productIds);
  const research = await researchProduct(product.productName, product.productUrl);
  const images = await fetchRelatedImages(product.productName, product.productImage);
  const generated = buildProductPost(trend.keyword, product.productName, research.evidence);
  const quality = validateContentQuality({ keyword: trend.keyword, productName: product.productName, titles: generated.titles, selectedTitle: generated.selectedTitle, body: generated.body });
  const factcheck = factCheckContent({ product, keyword: trend.keyword, body: generated.body, selectedTitle: generated.selectedTitle, research });

  const now = new Date();
  const record = {
    savedAt: now.toISOString(),
    keyword: trend.keyword,
    trendSource: trend.source,
    recommendation: { product, reason: "검색 주제와 상품명을 기준으로 선정했습니다." },
    research,
    factcheck,
    quality,
    blog: {
      disclosure: PARTNERS_DISCLOSURE,
      titles: generated.titles,
      selectedTitle: generated.selectedTitle,
      body: generated.body,
      imageUrls: images,
      partnerUrl: product.productUrl,
      productUrl: product.productUrl,
    },
  };

  const storageKey = `post:${now.toISOString()}`;
  await env.CONTENT_STORE.put(storageKey, JSON.stringify(record));
  await env.CONTENT_STORE.put("latest", JSON.stringify(record));
  await env.CONTENT_STORE.put("latest:quality", JSON.stringify(quality));
  await env.CONTENT_STORE.put("last-run", JSON.stringify({ status: quality.ok && factcheck.ok ? "success" : "quality-failed", keyword: trend.keyword, storageKey, finishedAt: now.toISOString() }));
  await env.CONTENT_STORE.put(USED_PRODUCTS_KEY, JSON.stringify([...(history.productIds ?? []), String(product.productId)].slice(-MAX_HISTORY)));
  await env.CONTENT_STORE.put(USED_TITLES_KEY, JSON.stringify([...(history.titles ?? []), ...generated.titles].slice(-MAX_HISTORY)));

  return { storageKey, record };
}

/** Cloudflare Worker에서 사용하는 자동 생성 진입점입니다. */
const app = {
  async fetch(_request: Request, _env: Env, _ctx: ExecutionContext) {
    return Response.json({ ok: true, service: "coupang-partners", message: "자동 콘텐츠 생성 Worker" });
  },

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    await generateToday(env);
  },
};

export default app;
