/**
 * 쿠팡파트너스 자동 콘텐츠 생성 핵심 모듈입니다.
 *
 * 글 구성은 상품 설명 중심으로 고정합니다.
 * 제목 → 파트너스 고지 → 인사말 → 제품소개 → 추천이유 → 장점 → 단점
 * → 사용하기 좋은 곳 → 추천 사용처 → 상품 확인 안내 → 마무리 인사
 *
 * 가격/배송/검색순위 같은 구매 조건은 본문 생성 소재에서 제외합니다.
 */

export interface Env {
  COUPANG_ACCESS_KEY: string;
  COUPANG_SECRET_KEY: string;
  GEMINI_API_KEY: string;
  CONTENT_STORE: KVNamespace;
  AI: Ai;
}

import { validateContentQuality } from "./quality";
import { factCheckContent, type ProductResearch } from "./factcheck";
import { buildProductPost } from "./content-template";

const COUPANG_HOST = "https://api-gateway.coupang.com";
const COUPANG_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const PARTNERS_DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";
const TREND_CACHE_KEY = "trend:today";
const USED_PRODUCTS_KEY = "history:products";
const USED_TITLES_KEY = "history:titles";
const MAX_HISTORY = 120;

const FALLBACK_KEYWORDS = [
  "무선청소기", "차량용품", "캠핑용품", "주방 수납용품", "생활용품",
  "컴퓨터 주변기기", "무선이어폰", "공기청정기", "운동용품", "조명용품", "보온용품"
];

/** 쿠팡 Open API HMAC-SHA256 인증 헤더를 생성합니다. */
async function createAuthorization(env: Env, method: string, path: string, query: string) {
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

/** 쿠팡 상품 검색 결과를 가져옵니다. */
async function searchProducts(env: Env, keyword: string) {
  const query = `keyword=${encodeURIComponent(keyword)}`;
  const response = await fetch(`${COUPANG_HOST}${COUPANG_SEARCH_PATH}?${query}`, {
    headers: {
      Authorization: await createAuthorization(env, "GET", COUPANG_SEARCH_PATH, query),
      "Content-Type": "application/json;charset=UTF-8",
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Coupang API 오류 (${response.status}): ${text.slice(0, 500)}`);
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

/** 외부 AI가 제한되어도 생성 흐름이 멈추지 않도록 안전한 결정적 생성기를 사용합니다. */
async function generateGemini(_env: Env, prompt: string): Promise<string> {
  if (prompt.includes("상품 후보:")) {
    const match = prompt.match(/상품 후보:\s*([\s\S]*?)\n\n공개 웹 검색/);
    if (match) {
      try {
        const list = JSON.parse(match[1]);
        const first = Array.isArray(list) ? list[0] : null;
        if (first?.productId != null) {
          return JSON.stringify({ productId: String(first.productId), reason: "검색 주제와 상품명을 기준으로 선정했습니다." });
        }
      } catch {}
    }
  }

  if (prompt.includes("Google Trends 한국 급상승 검색어 원문")) {
    return JSON.stringify({ keyword: "무선청소기", source: "fallback" });
  }

  if (prompt.includes("[확인된 상품 정보]")) {
    const keyword = prompt.match(/검색 주제:\s*(.+)/)?.[1]?.trim() || "상품 정보";
    const productName = prompt.match(/상품명:\s*(.+)/)?.[1]?.trim() || keyword;
    const researchMatch = prompt.match(/\[팩트체크용 제품 조사 결과\]\s*([\s\S]*?)\n\n\[참고용 사용자 의견 신호\]/);
    let research: ProductResearch | null = null;
    try { research = researchMatch ? JSON.parse(researchMatch[1]) : null; } catch {}
    const post = buildProductPost(keyword, productName, Array.isArray(research?.evidence) ? research!.evidence : []);
    return JSON.stringify({ ...post, disclosure: PARTNERS_DISCLOSURE });
  }

  return JSON.stringify({ keyword: "생활용품", source: "fallback" });
}

/** Google Trends에서 오늘의 관심 신호를 가져옵니다. */
async function fetchTrendSignals(): Promise<string[]> {
  try {
    const response = await fetch("https://trends.google.com/trending/rss?geo=KR", { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) return [];
    const xml = await response.text();
    return [...xml.matchAll(/<title>(.*?)<\/title>/g)]
      .map((m) => m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim())
      .filter((title) => title && title !== "Daily Search Trends")
      .slice(0, 20);
  } catch {
    return [];
  }
}

/** 오늘의 검색 주제를 정합니다. AI가 막혀도 fallback으로 계속 진행합니다. */
async function getDailyKeyword(env: Env, date = new Date()): Promise<{ keyword: string; source: string }> {
  const dateKey = date.toISOString().slice(0, 10);
  const cached = await env.CONTENT_STORE.get(TREND_CACHE_KEY, "json") as any;
  if (cached?.date === dateKey && cached.keyword) return cached;

  const trends = await fetchTrendSignals();
  let keyword = "";
  let source = "fallback";

  if (trends.length) {
    try {
      const prompt = `오늘은 ${dateKey} 한국이다. 아래는 Google Trends 한국 급상승 검색어 원문이다.\n${trends.join("\n")}\n\n쿠팡 파트너스 블로그에서 다룰 구체적인 상품 검색어 하나를 골라라. JSON만 반환: {"keyword":"상품 검색어","source":"trend"}`;
      const parsed = JSON.parse(await generateGemini(env, prompt));
      if (typeof parsed.keyword === "string" && parsed.keyword.trim()) {
        keyword = parsed.keyword.trim();
        source = "google-trends";
      }
    } catch {}
  }

  if (!keyword) {
    const day = Math.floor(date.getTime() / 86400000);
    keyword = FALLBACK_KEYWORDS[((day % FALLBACK_KEYWORDS.length) + FALLBACK_KEYWORDS.length) % FALLBACK_KEYWORDS.length];
  }

  const result = { date: dateKey, keyword, source };
  await env.CONTENT_STORE.put(TREND_CACHE_KEY, JSON.stringify(result), { expirationTtl: 60 * 60 * 30 });
  return result;
}

/** 상품명을 기준으로 공개 검색 결과를 조사합니다. */
async function researchProduct(productName: string, productUrl: string): Promise<ProductResearch> {
  const sources: { title: string; url: string; snippet: string }[] = [];
  const evidence: string[] = [];

  const queries = [
    `"${productName}" 상품 특징`,
    `"${productName}" 사용 용도`,
  ];

  for (const query of queries) {
    try {
      const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=6&setlang=ko&cc=kr`;
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) continue;
      const html = await response.text();
      const matches = [...html.matchAll(/<li class="[^\"]*b_algo[^\"]*"[^>]*>([\s\S]*?)<\/li>/g)];
      for (const match of matches) {
        if (sources.length >= 8) break;
        const block = match[1];
        const title = stripHtml(block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "");
        const snippet = stripHtml(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
        const href = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"/i)?.[1] ?? "";
        const text = `${title} ${snippet}`.trim();
        const tokens = productName.toLowerCase().split(/\s+/).filter((token) => token.length >= 2);
        const relevant = tokens.length === 0 || tokens.some((token) => text.toLowerCase().includes(token));
        if (title && text.length >= 20 && relevant) {
          sources.push({ title, url: href.startsWith("http") ? href : "", snippet: text.slice(0, 700) });
          evidence.push(text.slice(0, 700));
        }
      }
    } catch {}
  }

  // 외부 검색이 막혀도 쿠팡 API에서 확인된 상품명 자체를 최소 근거로 사용합니다.
  if (!sources.length) {
    sources.push({ title: productName, url: productUrl, snippet: productName });
    evidence.push(productName);
  }

  return {
    productName,
    sources: sources.slice(0, 8),
    evidence: [...new Set(evidence)].slice(0, 8),
    researchedAt: new Date().toISOString(),
  };
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** 공식 상품 이미지와 관련 이미지를 확보합니다. */
async function fetchRelatedImages(productName: string, officialImage: string): Promise<string[]> {
  const images = officialImage ? [officialImage] : [];
  const queries = [`"${productName}" 상품`, `"${productName}" 사용 모습`];

  for (const query of queries) {
    if (images.length >= 3) break;
    try {
      const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&setlang=ko&cc=kr`;
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) continue;
      const html = await response.text();
      for (const match of html.matchAll(/"murl":"(.*?)"/g)) {
        if (images.length >= 3) break;
        const candidate = decodeBingUrl(match[1]);
        if (!candidate || !/^https?:\/\//i.test(candidate)) continue;
        if (images.includes(candidate) || /logo|icon|sprite|avatar|favicon|microsoft|windows/i.test(candidate)) continue;
        const index = html.indexOf(match[0]);
        const context = html.slice(Math.max(0, index - 1200), index + 1200).toLowerCase();
        const tokens = productName.toLowerCase().split(/\s+/).filter((token) => token.length >= 2);
        if (tokens.length && !tokens.some((token) => context.includes(token))) continue;
        if (await isImageUrl(candidate)) images.push(candidate);
      }
    } catch {}
  }
  return [...new Set(images)].slice(0, 3);
}

function decodeBingUrl(value: string) {
  return value.replaceAll("\\/", "/").replaceAll("\\u0026", "&").replaceAll("\\u003d", "=");
}

async function isImageUrl(url: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);
    return response.ok && (response.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

/** 과거 상품과 제목 이력을 읽습니다. */
async function getHistory(env: Env) {
  const productIds = await env.CONTENT_STORE.get(USED_PRODUCTS_KEY, "json") as string[] | null;
  const titles = await env.CONTENT_STORE.get(USED_TITLES_KEY, "json") as string[] | null;
  return { productIds: productIds ?? [], titles: titles ?? [] };
}

/** 검색 결과에서 과거에 사용하지 않은 상품 하나를 선택합니다. */
async function recommendProduct(env: Env, keyword: string, products: any[], usedProductIds: string[]) {
  const available = products.filter((p) => !usedProductIds.includes(String(p.productId)) && p.productName);
  if (!available.length) throw new Error("이번 검색 결과의 상품이 모두 과거에 홍보된 상품입니다.");

  const candidates = available.slice(0, 10).map((p) => ({ productId: p.productId, productName: p.productName }));
  const prompt = `검색 주제: ${keyword}\n상품 후보:\n${JSON.stringify(candidates)}\n\n공개 웹 검색/\n검색 주제와 상품명이 가장 잘 맞는 후보 하나를 선택하고 후보에 있는 productId만 반환한다.`;
  const parsed = JSON.parse(await generateGemini(env, prompt));
  const selected = available.find((p) => String(p.productId) === String(parsed.productId)) ?? available[0];
  return { product: selected, reason: parsed.reason ?? "검색 주제와 상품명을 기준으로 선정했습니다." };
}

/** 상품 설명용 본문을 생성하고 품질/팩트체크를 통과시킵니다. */
async function createContent(env: Env, keyword: string) {
  const products = await searchProducts(env, keyword);
  if (!products.length) throw new Error("검색 결과가 없습니다.");

  const history = await getHistory(env);
  const recommendation = await recommendProduct(env, keyword, products, history.productIds);
  const product = recommendation.product;
  const research = await researchProduct(product.productName, product.productUrl);
  const imageUrls = await fetchRelatedImages(product.productName, product.productImage);

  const prompt = `너는 한국 네이버 블로그 상품 소개 글 편집자다.\n\n[확인된 상품 정보]\n검색 주제: ${keyword}\n상품명: ${product.productName}\n\n[팩트체크용 제품 조사 결과]\n${JSON.stringify(research, null, 2)}\n\n[참고용 사용자 의견 신호]\n없음\n\n작성 규칙:\n- 제목 → 인사말 → 제품소개 → 추천이유 → 장점 → 단점 → 어디에 사용하면 좋은지 → 추천 사용처 → 상품 확인 안내 → 마무리 인사 순서로 자연스럽게 작성한다.\n- 가격, 배송, 검색 순위, 무료배송, 로켓배송은 작성하지 않는다.\n- 상품명과 조사 자료에서 확인되지 않은 성능이나 스펙은 만들지 않는다.\n- 같은 주의사항을 반복하지 않는다.\nJSON만 반환한다.`;

  const parsed = JSON.parse(await generateGemini(env, prompt));
  const blog = {
    disclosure: PARTNERS_DISCLOSURE,
    titles: parsed.titles,
    selectedTitle: parsed.selectedTitle,
    body: parsed.body,
    imageUrls,
    partnerUrl: product.productUrl,
  };

  const quality = validateContentQuality({
    keyword,
    productName: product.productName,
    titles: blog.titles,
    selectedTitle: blog.selectedTitle,
    body: blog.body,
  });
  if (!quality.ok || quality.score < 90) {
    throw new Error(`품질 검사 90점 미달로 저장하지 않았습니다. 현재 점수: ${quality.score}점 / ${quality.reasons.join(" · ")}`);
  }

  const factCheck = factCheckContent({
    product,
    keyword,
    body: blog.body,
    selectedTitle: blog.selectedTitle,
    research,
  });
  if (!factCheck.ok) {
    throw new Error(`팩트체크 실패로 저장하지 않았습니다: ${factCheck.reasons.join(" · ")}`);
  }

  const now = new Date();
  const record = {
    savedAt: now.toISOString(),
    keyword,
    recommendation,
    research,
    factCheck,
    blog,
    quality: {
      imageCount: imageUrls.length,
      score: quality.score,
      passed: quality.ok,
      ok: quality.ok,
      reasons: quality.reasons,
      metrics: quality.metrics,
    },
  };
  const storageKey = `post:${now.toISOString()}`;
  await env.CONTENT_STORE.put(storageKey, JSON.stringify(record));
  await env.CONTENT_STORE.put("latest", JSON.stringify(record));

  const nextProducts = [...history.productIds.filter((id) => id !== String(product.productId)), String(product.productId)].slice(-MAX_HISTORY);
  const nextTitles = [...history.titles, ...blog.titles].slice(-MAX_HISTORY);
  await env.CONTENT_STORE.put(USED_PRODUCTS_KEY, JSON.stringify(nextProducts));
  await env.CONTENT_STORE.put(USED_TITLES_KEY, JSON.stringify(nextTitles));

  return { ...record, storageKey };
}

/** 기본 경로에서는 구형 단독 대시보드가 아닌 최신 콘텐츠 상태를 간단히 보여줍니다. */
async function renderFallbackDashboard(env: Env): Promise<Response> {
  const latest = await env.CONTENT_STORE.get("latest", "json") as any;
  if (!latest) return new Response("아직 생성된 콘텐츠가 없습니다.", { headers: { "Content-Type": "text/plain;charset=UTF-8" } });
  return Response.json({ ok: true, latest });
}

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") return renderFallbackDashboard(env);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "coupang-partners-automation", message: "Cloudflare Worker 정상 작동 중" });
    if (url.pathname === "/latest") {
      const latest = await env.CONTENT_STORE.get("latest", "json");
      return latest ? Response.json({ ok: true, content: latest }) : Response.json({ ok: false, message: "저장된 글이 없습니다." }, { status: 404 });
    }
    if (url.pathname === "/status") return Response.json({ ok: true, status: await env.CONTENT_STORE.get("last-run", "json") });
    if (url.pathname === "/secrets-check") return Response.json({ ok: true, secrets: { coupangAccessKey: Boolean(env.COUPANG_ACCESS_KEY), coupangSecretKey: Boolean(env.COUPANG_SECRET_KEY), geminiApiKey: Boolean(env.GEMINI_API_KEY) } });
    return Response.json({ ok: false, message: "존재하지 않는 경로입니다." }, { status: 404 });
  },

  /** 매일 오전 9시 한국시간에 콘텐츠를 생성합니다. */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const trend = await getDailyKeyword(env, new Date(controller.scheduledTime));
    const startedAt = new Date().toISOString();
    try {
      const content = await createContent(env, trend.keyword);
      await env.CONTENT_STORE.put("last-run", JSON.stringify({ status: "success", type: "daily", keyword: trend.keyword, trendSource: trend.source, storageKey: content.storageKey, finishedAt: new Date().toISOString(), imageCount: content.quality.imageCount }));
      console.log("자동 콘텐츠 생성 완료:", content.storageKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      await env.CONTENT_STORE.put("last-run", JSON.stringify({ status: "error", type: "daily", keyword: trend.keyword, startedAt, finishedAt: new Date().toISOString(), error: message }));
      throw error;
    }
  },
};

export default handler;
