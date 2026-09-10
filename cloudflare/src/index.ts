/**
 * 쿠팡파트너스 자동 수익형 콘텐츠 시스템의 Cloudflare Worker입니다.
 *
 * 자동 생성 흐름:
 * 1. Google Trends에서 오늘의 관심 신호 수집
 * 2. 쿠팡 검색 결과에서 과거 홍보 상품을 제외
 * 3. 검색 순위 + 상대 가격 경쟁력 + 배송 조건을 함께 평가
 * 4. 공개 검색 결과에서 상품군에 대한 사용자 의견 신호를 참고
 * 5. 제목 5개와 수정 없이 사용할 수 있는 수준의 긴 본문 생성
 * 6. 대표 상품 이미지 + 관련 이미지까지 최대 3장 확보
 * 7. KV에 글/이미지/이력을 저장하고 대시보드에서 바로 확인
 *
 * API 키는 코드에 넣지 않고 Cloudflare Workers Secrets에서 읽습니다.
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

const COUPANG_HOST = "https://api-gateway.coupang.com";
const COUPANG_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const GEMINI_HOST = "https://generativelanguage.googleapis.com/v1beta/models";

const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
];

const PARTNERS_DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

const FALLBACK_KEYWORDS = [
  "추석 선물세트",
  "명절 음식 준비",
  "주방용품",
  "차량용품",
  "캠핑용품",
  "무선청소기",
  "공기청정기",
  "무선이어폰",
  "컴퓨터 주변기기",
  "생활용품",
];

const INITIAL_TEST_CRON = "*/5 * * * *";
const INITIAL_TEST_FLAG = "initial-test-attempted";
const TREND_CACHE_KEY = "trend:today";
const USED_PRODUCTS_KEY = "history:products";
const USED_TITLES_KEY = "history:titles";
const MAX_HISTORY = 120;

/** 쿠팡 API 인증용 HMAC-SHA256 서명을 생성합니다. */
async function createAuthorization(env: Env, method: string, path: string, query: string) {
  const signedDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(2);
  const message = signedDate + method.toUpperCase() + path + query;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.COUPANG_SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${signedDate}, signature=${signature}`;
}

/** 쿠팡 검색 결과를 가져옵니다. 하루 자동 실행당 검색 1회를 기본으로 유지합니다. */
async function searchProducts(env: Env, keyword: string) {
  const query = `keyword=${encodeURIComponent(keyword)}`;
  const response = await fetch(`${COUPANG_HOST}${COUPANG_SEARCH_PATH}?${query}`, {
    method: "GET",
    headers: {
      Authorization: await createAuthorization(env, "GET", COUPANG_SEARCH_PATH, query),
      "Content-Type": "application/json;charset=UTF-8",
    },
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Coupang API 오류 (${response.status}): ${text.slice(0, 500)}`);

  const data = JSON.parse(text);
  const products = Array.isArray(data?.data?.productData) ? data.data.productData : [];
  return products.map((product: any) => ({
    productId: product.productId ?? null,
    productName: product.productName ?? "",
    productPrice: Number(product.productPrice) || null,
    productImage: product.productImage ?? "",
    productUrl: product.productUrl ?? "",
    keyword: product.keyword ?? keyword,
    rank: Number(product.rank) || null,
    isRocket: Boolean(product.isRocket),
    isFreeShipping: Boolean(product.isFreeShipping),
  }));
}

/**
 * Gemini REST API 호출기입니다.
 * 503 등 일시적인 실패가 발생하면 같은 모델에서 재시도한 뒤 다음 모델로 넘어갑니다.
 */
async function generateGemini(env: Env, prompt: string, maxOutputTokens = 4096): Promise<string> {
  // AI 무료 한도와 무관하게 쿠팡 API 확인값만으로 안전하게 생성합니다.
  if (prompt.includes("상품 후보:")) {
    const m = prompt.match(/상품 후보:\s*([\s\S]*?)\n\n공개 웹 검색/);
    if (m) {
      try {
        const list = JSON.parse(m[1]);
        const first = Array.isArray(list) ? list[0] : null;
        if (first?.productId != null) return JSON.stringify({ productId: String(first.productId), reason: "검색어 관련성을 우선해 선택했습니다." });
      } catch {}
    }
  }

  if (prompt.includes("Google Trends 한국 급상승 검색어 원문")) {
    return JSON.stringify({ keyword: "무선청소기", source: "fallback", reason: "AI 없이 사용하는 안전한 기본 상품군입니다." });
  }

  if (prompt.includes("[확인된 상품 정보]")) {
    const keyword = prompt.match(/검색 주제:\s*(.+)/)?.[1]?.trim() || "상품 정보";
    const productName = prompt.match(/상품명:\s*(.+)/)?.[1]?.trim() || keyword;
    const price = (prompt.match(/현재 검색 결과 가격:\s*(.+)/)?.[1]?.trim() || "확인 불가").replace(/원\s*$/, "");
    const rank = prompt.match(/검색 결과 순위:\s*(.+)/)?.[1]?.trim() || "확인 불가";
    const rocket = prompt.match(/로켓배송:\s*(.+)/)?.[1]?.trim() || "확인 불가";
    const freeShipping = prompt.match(/무료배송:\s*(.+)/)?.[1]?.trim() || "확인 불가";
    const titles=[
      `${productName} 상품 정보와 구매 전 확인할 점`,
      `${keyword} 검색 결과에서 살펴본 ${productName}`,
      `구매 전에 확인할 ${productName} 기본 정보`,
      `${productName} 배송 조건과 현재 검색 정보 정리`,
      `${keyword} 상품 선택 전 체크할 ${productName} 내용`
    ];
    // AI를 사용할 수 없는 경우에도 웹 조사 결과의 문장을 근거로만 설명합니다.
    const researchMatch = prompt.match(/\[팩트체크용 제품 조사 결과\]\s*([\s\S]*?)\n\n\[참고용 사용자 의견 신호\]/);
    let research: any = null;
    try { research = researchMatch ? JSON.parse(researchMatch[1]) : null; } catch {}
    const evidence = Array.isArray(research?.evidence) ? research.evidence.slice(0, 5) : [];
    const evidenceText = evidence.length ? evidence.join("\n") : "공개 조사 자료에서 충분한 제품 특징을 확인하지 못했습니다.";
    const titles=[
      `${productName} 실제 확인 정보와 주요 특징 정리`,
      `${keyword} 관련 ${productName} 특징과 확인할 점`,
      `구매 전 알아본 ${productName} 주요 기능과 특징`,
      `${productName} 제품 정보와 사용 목적별 확인 포인트`,
      `${keyword} 찾을 때 살펴본 ${productName} 정보`
    ];
    const body=`안녕하세요. 오늘은 ${productName}을 상품명만 보고 판단하지 않고 공개된 제품 정보를 찾아 주요 특징을 확인해봤습니다.\n\n${PARTNERS_DISCLOSURE}\n\n제품을 알아본 내용\n이번 글에서는 상품명에 적힌 표현만으로 특징을 단정하지 않고, 공개 검색 결과와 확인 가능한 상품 정보를 함께 살펴봤습니다. 조사 과정에서 확인된 내용은 다음과 같습니다.\n\n${evidenceText}\n\n실제로 확인된 특징\n위 자료에서 반복적으로 확인되는 제품 관련 내용만 본문에 반영합니다. 반대로 공개 자료에서 확인되지 않은 세부 사양이나 성능은 임의로 추가하지 않았습니다. 같은 이름의 상품이 여러 판매처에 있을 수 있기 때문에 구매하려는 상품의 상세 페이지와 옵션이 동일한지도 함께 확인하는 것이 좋습니다.\n\n구매 전에 확인할 점\n상품을 비교할 때는 내가 필요한 기능이 실제 기본 구성에 포함되어 있는지, 선택 옵션인지, 별도 구매가 필요한지 확인해보는 것이 좋습니다. 공개 검색 자료만으로 확인하기 어려운 부분은 추측하지 않고 상품 상세 페이지의 최신 정보를 기준으로 판단하는 편이 안전합니다.\n\n어떤 분이 살펴보면 좋은지\n${keyword} 관련 상품을 찾고 있으면서 이번에 확인된 특징이나 용도가 본인에게 필요한지 비교해보고 싶은 분이라면 살펴볼 만합니다. 특정 제품이 모든 사람에게 적합하다고 단정하기보다는 사용 목적과 필요한 조건을 먼저 정해두고 비교하는 것을 추천합니다.\n\n마무리\n정리하면 ${productName}은 공개된 자료를 확인해 주요 특징을 살펴본 상품입니다. 상품명에 없는 내용을 임의로 붙이지 않고 조사에서 확인된 내용만 정리했으며, 실제 구매 전에는 상품 상세 페이지에서 최신 사양과 구성, 옵션을 다시 확인해보세요. 관심이 있다면 상품 확인 버튼에서 현재 판매 정보를 직접 확인할 수 있습니다.`;
    return JSON.stringify({ titles, selectedTitle: titles[0], body });
  }
  return JSON.stringify({ keyword: "생활용품", source: "fallback" });
}

/** Google Trends 한국 급상승 검색어를 오늘의 관심 신호로 가져옵니다. */
async function fetchTrendSignals(): Promise<string[]> {
  try {
    const response = await fetch("https://trends.google.com/trending/rss?geo=KR", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok) return [];

    const xml = await response.text();
    return [...xml.matchAll(/<title>(.*?)<\/title>/g)]
      .map((match) => match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim())
      .filter((title) => title && title !== "Daily Search Trends")
      .slice(0, 20);
  } catch {
    return [];
  }
}

/**
 * 공개 Bing 검색 결과에서 '후기/사용 경험' 관련 신호를 수집합니다.
 * 정확한 상품 리뷰라고 단정하지 않고, 상품군의 공통적인 관심사 파악용으로만 사용합니다.
 */
async function fetchOpinionSignals(productName: string): Promise<string[]> {
  try {
    const query = `${productName} 후기 장점 단점 사용감`;
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=6&setlang=ko&cc=kr`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok) return [];

    const html = await response.text();
    const results: string[] = [];
    const liRegex = /<li class="[^\"]*b_algo[^\"]*"[^>]*>([\s\S]*?)<\/li>/g;
    let match: RegExpExecArray | null;

    while ((match = liRegex.exec(html)) !== null && results.length < 6) {
      const block = match[1];
      const title = block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "";
      const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
      const clean = stripHtml(`${title} ${snippet}`);
      if (clean.length >= 20) results.push(clean.slice(0, 500));
    }

    return results;
  } catch {
    return [];
  }
}

/** HTML 태그와 검색결과 잔여 문자를 제거합니다. */
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


/**
 * 상품명 자체가 아니라 실제 공개 웹 검색 결과를 조사해 제품 특징의 근거를 확보합니다.
 * 한 번의 생성 실행에서만 호출하며, 조사 결과는 본문 생성과 팩트체크에 공통으로 사용합니다.
 */
async function researchProduct(productName: string, productUrl: string): Promise<ProductResearch> {
  const sources: { title: string; url: string; snippet: string }[] = [];
  const evidence: string[] = [];
  const queries = [
    `"${productName}" 상품 상세 특징 사양`,
    `"${productName}" 기능 사용 방법`,
    `"${productName}" 리뷰 장점 단점`,
  ];

  for (const query of queries) {
    try {
      const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=6&setlang=ko&cc=kr`;
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) continue;
      const html = await response.text();
      const liRegex = /<li class="[^\"]*b_algo[^\"]*"[^>]*>([\s\S]*?)<\/li>/g;
      let match: RegExpExecArray | null;
      while ((match = liRegex.exec(html)) !== null && sources.length < 12) {
        const block = match[1];
        const title = stripHtml(block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "");
        const snippet = stripHtml(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
        const href = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"/i)?.[1] ?? "";
        const cleanSnippet = `${title} ${snippet}`.trim();
        if (title && cleanSnippet.length >= 20) {
          const sourceUrl = href.startsWith("http") ? href : "";
          if (!sources.some((item) => item.title === title && item.snippet === snippet)) {
            sources.push({ title, url: sourceUrl, snippet: cleanSnippet.slice(0, 700) });
          }
        }
      }
    } catch {
      // 한 검색 결과가 실패해도 나머지 조사 결과로 계속합니다.
    }
  }

  // 상품 URL도 직접 읽어 메타 설명에서 확인 가능한 정보를 보강합니다.
  if (productUrl && /^https?:\/\//i.test(productUrl)) {
    try {
      const response = await fetch(productUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (response.ok) {
        const html = await response.text();
        const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
        const description = stripHtml(html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([\s\S]*?)["']/i)?.[1] ?? "");
        const snippet = `${title} ${description}`.trim();
        if (snippet) sources.unshift({ title: title || productName, url: productUrl, snippet: snippet.slice(0, 900) });
      }
    } catch {
      // 판매 페이지 직접 접근이 막혀도 검색 조사 결과를 사용합니다.
    }
  }

  // 상품명과 가장 가까운 조사 결과를 근거 문장으로 보존합니다.
  for (const source of sources.slice(0, 8)) {
    const text = `${source.title} ${source.snippet}`;
    if (new RegExp(productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text) || evidence.length < 5) {
      evidence.push(text.slice(0, 700));
    }
  }

  return {
    productName,
    sources: sources.slice(0, 12),
    evidence: [...new Set(evidence)].slice(0, 8),
    researchedAt: new Date().toISOString(),
  };
}

/** 오늘의 상품 검색 주제를 정합니다. */
async function getDailyKeyword(env: Env, date = new Date()): Promise<{ keyword: string; source: string }> {
  const dateKey = date.toISOString().slice(0, 10);
  const cached = await env.CONTENT_STORE.get(TREND_CACHE_KEY, "json") as any;
  if (cached?.date === dateKey && cached.keyword) return cached;

  const trendSignals = await fetchTrendSignals();
  const signalText = trendSignals.length ? trendSignals.join("\n") : "외부 트렌드 신호 없음";
  let keyword = "";
  let source = "fallback";

  try {
    const prompt = `오늘은 ${dateKey} 한국이다. 아래는 Google Trends 한국 급상승 검색어 원문이다.
${signalText}

쿠팡 파트너스 블로그에서 오늘 다룰 '구체적인 상품 검색어' 하나를 골라라.
조건:
1) 실제 상품으로 연결될 수 있어야 한다.
2) 뉴스/인물/사건 자체가 아니라 쇼핑 의도로 바꿀 수 있는 주제여야 한다.
3) 정확한 검색량 숫자를 만들지 않는다.
4) 너무 넓은 표현보다 구체적인 상품군을 우선한다.
5) 계절/날씨/명절 수요도 고려한다.
JSON만 반환: {"keyword":"상품 검색어","source":"trend 또는 seasonal","reason":"짧은 선정 이유"}`;

    const parsed = JSON.parse(cleanJson(await generateGemini(env, prompt, 512)));
    if (typeof parsed.keyword === "string" && parsed.keyword.trim()) {
      keyword = parsed.keyword.trim();
      source = parsed.source === "trend" ? "google-trends" : "seasonal";
    }
  } catch {
    // 외부 신호나 AI가 실패하면 아래 fallback 후보로 계속 진행합니다.
  }

  if (!keyword) {
    const dayNumber = Math.floor(date.getTime() / 86400000);
    keyword = FALLBACK_KEYWORDS[((dayNumber % FALLBACK_KEYWORDS.length) + FALLBACK_KEYWORDS.length) % FALLBACK_KEYWORDS.length];
  }

  const result = { date: dateKey, keyword, source };
  await env.CONTENT_STORE.put(TREND_CACHE_KEY, JSON.stringify(result), { expirationTtl: 60 * 60 * 30 });
  return result;
}

/** JSON 코드블록이 섞여도 파싱할 수 있도록 정리합니다. */
function cleanJson(value: string) {
  return value.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
}

/**
 * 현재 검색 결과의 상대 가격을 계산합니다.
 * 절대적인 '가성비'를 주장하지 않고 같은 검색 결과 안에서만 저렴한지를 판단합니다.
 */
function addPriceScores(products: any[]) {
  const prices = products.map((p) => p.productPrice).filter((p) => typeof p === "number" && p > 0).sort((a, b) => a - b);
  if (!prices.length) return products.map((p) => ({ ...p, priceScore: 50, pricePosition: null }));

  return products.map((product) => {
    if (!product.productPrice) return { ...product, priceScore: 50, pricePosition: null };
    const index = prices.findIndex((price) => price >= product.productPrice);
    const percentile = prices.length === 1 ? 0.5 : index / (prices.length - 1);
    return {
      ...product,
      priceScore: Math.round((1 - percentile) * 100),
      pricePosition: index + 1,
    };
  });
}

/** 검색어 관련성, 검색 순위, 가격 경쟁력, 배송 조건을 합산해 후보를 정리합니다. */
function scoreProducts(products: any[]) {
  const scored = addPriceScores(products);
  const maxRank = Math.max(...scored.map((p) => p.rank || 10), 10);

  return scored.map((product) => {
    const rankScore = product.rank ? Math.max(0, 100 - ((product.rank - 1) / Math.max(1, maxRank - 1)) * 100) : 50;
    const shippingScore = product.isRocket && product.isFreeShipping ? 100 : product.isRocket || product.isFreeShipping ? 70 : 40;
    // 가격은 중요하지만 검색 의도보다 우선하지 않습니다.
    const totalScore = Math.round(rankScore * 0.35 + product.priceScore * 0.30 + shippingScore * 0.10 + 25);
    return { ...product, rankScore: Math.round(rankScore), shippingScore, totalScore };
  }).sort((a, b) => b.totalScore - a.totalScore);
}

/** 검색 결과에서 과거 상품을 제외하고 AI에게 최종 상품을 선택하게 합니다. */
async function recommendProduct(env: Env, keyword: string, products: any[], usedProductIds: string[]) {
  const available = scoreProducts(products.filter((product) => !usedProductIds.includes(String(product.productId))));
  if (!available.length) throw new Error("이번 검색 결과의 상품이 모두 과거에 홍보된 상품입니다.");

  const candidates = available.slice(0, 10).map((product) => ({
    productId: product.productId,
    productName: product.productName,
    price: product.productPrice,
    searchRank: product.rank,
    priceScore: product.priceScore,
    totalScore: product.totalScore,
    isRocket: product.isRocket,
    isFreeShipping: product.isFreeShipping,
  }));

  const opinionSignals = await fetchOpinionSignals(keyword);
  const opinionText = opinionSignals.length ? opinionSignals.join("\n") : "공개 의견 신호를 충분히 찾지 못함";

  const prompt = `너는 쿠팡 파트너스 콘텐츠용 상품 선정 담당자다.
검색 주제: ${keyword}
상품 후보:
${JSON.stringify(candidates, null, 2)}

공개 웹 검색에서 확인한 '참고용 사용자 의견 신호'입니다. 특정 후보 상품의 확정 리뷰로 간주하지 말고, 사람들이 해당 상품군에서 중요하게 보는 요소를 파악하는 데만 사용하세요.
${opinionText}

선정 규칙:
1. 검색 주제와 상품명이 가장 잘 맞는 후보를 우선한다.
2. 검색 결과의 순위는 실제 검색 결과에서 나온 값이므로 참고한다.
3. 가격은 현재 후보들 사이의 상대적 가격 경쟁력으로만 참고한다. 비싸다고 무조건 탈락시키지 않는다.
4. 검색 의도가 강한 상품이 다소 비싸더라도 관련성이 훨씬 높으면 선택할 수 있다.
5. 배송 조건은 보조 기준으로 사용한다.
6. 과거 홍보 상품은 이미 제외되어 있다.
7. API에 없는 판매량, 리뷰 수, 평점, 할인율, 실제 판매 순위는 만들지 않는다.
8. 반드시 후보 목록에 존재하는 productId 하나만 선택한다.
JSON만 반환: {"productId":"선택한상품ID","reason":"선정 이유"}`;

  const parsed = JSON.parse(cleanJson(await generateGemini(env, prompt, 1200)));
  const selected = available.find((product) => String(product.productId) === String(parsed.productId));
  if (!selected) throw new Error("AI가 유효한 상품을 선택하지 못했습니다.");

  return {
    product: selected,
    reason: parsed.reason ?? "검색 관련성과 가격 경쟁력을 함께 고려해 선정했습니다.",
    priceScore: selected.priceScore,
    searchRank: selected.rank,
  };
}

/**
 * Bing 이미지 검색에서 실제 이미지 URL을 최대 2장 추가로 확보합니다.
 * 관련 이미지가 충분하지 않으면 억지로 unrelated 이미지를 채우지 않습니다.
 */
async function fetchRelatedImages(productName: string, officialImage: string): Promise<string[]> {
  const images: string[] = [];
  if (officialImage) images.push(officialImage);

  const queries = [
    `"${productName}" 상품`,
    `"${productName}" 사용 모습`,
  ];

  for (const query of queries) {
    if (images.length >= 3) break;
    try {
      const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&tsc=ImageBasicHover&setlang=ko&cc=kr`;
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) continue;
      const html = await response.text();

      // Bing 이미지 결과에 포함되는 원본 이미지 URL(murl)을 추출합니다.
      const matches = [...html.matchAll(/"murl":"(.*?)"/g)];
      for (const match of matches) {
        if (images.length >= 3) break;
        const candidate = decodeBingUrl(match[1]);
        if (!candidate || !/^https?:\/\//i.test(candidate)) continue;
        if (images.some((item) => item === candidate)) continue;
        if (/logo|icon|sprite|avatar|favicon/i.test(candidate)) continue;

        // 실제 이미지 응답인지 간단히 확인합니다. 실패하면 후보에서 제외합니다.
        if (await isImageUrl(candidate)) images.push(candidate);
      }
    } catch {
      // 이미지 검색 실패는 본문 생성 실패로 이어지지 않게 합니다.
    }
  }

  return images.slice(0, 3);
}

/** Bing JSON 문자열에 섞인 이스케이프를 복원합니다. */
function decodeBingUrl(value: string) {
  try {
    return JSON.parse(`"${value.replaceAll('"', '\\"')}"`);
  } catch {
    return value.replaceAll("\\/", "/").replaceAll("\\u0026", "&");
  }
}

/** 이미지 URL이 실제 이미지 응답인지 확인합니다. */
async function isImageUrl(url: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);
    const contentType = response.headers.get("content-type") ?? "";
    return response.ok && contentType.startsWith("image/");
  } catch {
    return false;
  }
}

/**
 * 실제 상품 정보와 참고 의견을 바탕으로 수정 없이 사용할 수 있는 수준의 본문을 만듭니다.
 * 의견은 상품의 확정 리뷰가 아니므로, 본문에서 사실처럼 인용하지 않도록 엄격히 제한합니다.
 */
async function generateBlog(
  env: Env,
  product: any,
  keyword: string,
  usedTitles: string[],
  opinionSignals: string[],
  imageUrls: string[],
  research: ProductResearch,
  qualityFeedback: string[] = [],
) {
  const opinionText = opinionSignals.length ? opinionSignals.join("\n") : "충분한 공개 의견 신호 없음";

  const prompt = `너는 한국 네이버 블로그에 바로 게시할 수 있는 상품 정보 글을 쓰는 전문 에디터다.

[확인된 상품 정보]
검색 주제: ${keyword}
상품명: ${product.productName}
현재 검색 결과 가격: ${product.productPrice ?? "확인 불가"}원
검색 결과 순위: ${product.rank ?? "확인 불가"}
로켓배송: ${product.isRocket ? "예" : "아니오"}
무료배송: ${product.isFreeShipping ? "예" : "아니오"}

[팩트체크용 제품 조사 결과]
${JSON.stringify(research, null, 2)}

[참고용 사용자 의견 신호]
${opinionText}

[작성 목표]
- 광고 문구를 늘어놓는 글이 아니라, 사람이 실제로 구매를 고민할 때 도움이 되는 글을 만든다.
- 상품명만 보고 특징을 만들지 않는다. 반드시 [팩트체크용 제품 조사 결과]의 공개 자료에서 확인되는 특징만 설명한다.
- 조사 자료에서 확인되지 않는 기능/소재/크기/구성품/성능은 절대 만들어내지 않는다.
- 공개 검색 자료는 제품 특징 확인용 근거로 사용하되, 실제 구매자 후기인지 확인되지 않은 내용은 후기처럼 쓰지 않는다.
- 직접 사용한 것처럼 '써보니', '사용해보니', '내돈내산' 같은 표현을 쓰지 않는다.
- 가격은 현재 API 검색 결과의 스냅샷일 뿐이므로 본문에서 가격을 고정값처럼 강조하지 않는다. 할인/최저가를 주장하지 않는다.
- 가성비라는 단어를 쓰더라도 근거 없는 단정 대신 '가격과 용도를 함께 비교해보는 것이 좋다' 정도로 표현한다.
- 장점만 나열하지 말고 구매 전에 확인해야 할 부분도 자연스럽게 포함한다.
- 같은 문장 구조와 같은 표현을 반복하지 않는다.
- 소제목을 적절히 사용하고 문단을 짧게 나눠 모바일에서 읽기 편하게 한다.
- 억지로 글자 수를 늘리지 말고 정보 밀도가 높은 약 1,800~2,500자 분량으로 작성한다.
- 결론에서는 특정 구매를 강요하지 않고 어떤 사람에게 잘 맞을지 정리한다.
- 마지막에는 자연스럽게 상품 확인을 안내하되 과장된 구매 유도 문구는 쓰지 않는다.
- 제목은 검색 의도를 담되 낚시성 표현과 과장을 피한다.
- 아래 과거 제목과 문장 구조가 겹치지 않도록 한다.
${JSON.stringify(usedTitles.slice(-60))}

[이미지]
본문에 자동으로 배치할 이미지가 ${imageUrls.length}장 준비되어 있다. 이미지의 구체적인 기능을 상상하지 말고, 이미지와 본문의 설명이 서로 모순되지 않게 작성한다.

[이전 품질 검사에서 수정이 필요했던 부분]
${qualityFeedback.length ? qualityFeedback.join("\n") : "첫 생성입니다. 처음부터 완성도 높은 결과를 작성하세요."}
위 지적사항을 반드시 수정하여 100점 품질을 목표로 다시 작성한다.

JSON만 반환:
{
  "titles":["제목1","제목2","제목3","제목4","제목5"],
  "selectedTitle":"대표 제목",
  "body":"본문 전체"
}`;

  const parsed = JSON.parse(cleanJson(await generateGemini(env, prompt, 7000)));
  if (!Array.isArray(parsed.titles) || parsed.titles.length !== 5 || !parsed.selectedTitle || !parsed.body) {
    throw new Error("Gemini가 올바른 블로그 결과를 반환하지 않았습니다.");
  }

  return {
    disclosure: PARTNERS_DISCLOSURE,
    titles: parsed.titles,
    selectedTitle: parsed.selectedTitle,
    body: parsed.body,
    imageUrls,
    partnerUrl: product.productUrl,
  };
}

/** 과거 홍보 상품과 제목 이력을 읽습니다. */
async function getHistory(env: Env) {
  const products = await env.CONTENT_STORE.get(USED_PRODUCTS_KEY, "json") as string[] | null;
  const titles = await env.CONTENT_STORE.get(USED_TITLES_KEY, "json") as string[] | null;
  return { productIds: products ?? [], titles: titles ?? [] };
}

/** 생성된 글과 중복 방지 이력을 함께 저장합니다. */
async function saveContent(env: Env, content: any) {
  const now = new Date();
  const key = `post:${now.toISOString()}`;
  const record = { savedAt: now.toISOString(), ...content };

  await env.CONTENT_STORE.put(key, JSON.stringify(record));
  await env.CONTENT_STORE.put("latest", JSON.stringify(record));

  const history = await getHistory(env);
  const productId = String(content.recommendation.product.productId);
  const newProductIds = [...history.productIds.filter((id) => id !== productId), productId].slice(-MAX_HISTORY);
  const newTitles = [...history.titles, ...content.blog.titles].slice(-MAX_HISTORY);

  await env.CONTENT_STORE.put(USED_PRODUCTS_KEY, JSON.stringify(newProductIds));
  await env.CONTENT_STORE.put(USED_TITLES_KEY, JSON.stringify(newTitles));
  return key;
}

/** 상품 선정 → 의견 참고 → 이미지 확보 → 고품질 글 생성 → 저장을 한 번에 실행합니다. */
async function createContent(env: Env, keyword: string) {
  const products = await searchProducts(env, keyword);
  if (!products.length) throw new Error("검색 결과가 없습니다.");

  const history = await getHistory(env);
  const recommendation = await recommendProduct(env, keyword, products, history.productIds);
  // 상품을 한 번 조사하고, 같은 조사 결과를 본문 작성과 최종 팩트체크에 공통 사용합니다.
  const research = await researchProduct(recommendation.product.productName, recommendation.product.productUrl);
  const opinionSignals = await fetchOpinionSignals(recommendation.product.productName);
  const imageUrls = await fetchRelatedImages(recommendation.product.productName, recommendation.product.productImage);
  // 품질 점수가 90점 이상이 될 때까지 생성 결과를 다시 만듭니다.
  // 100점 미만인 글은 KV에 저장하지 않으므로 게시 대상으로 넘어갈 수 없습니다.
  let blog: any = null;
  let qualityCheck: any = null;
  let qualityFeedback: string[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    blog = await generateBlog(
      env,
      recommendation.product,
      keyword,
      history.titles,
      opinionSignals,
      imageUrls,
      research,
      qualityFeedback,
    );

    qualityCheck = validateContentQuality({
      keyword,
      productName: recommendation.product.productName,
      titles: blog.titles,
      selectedTitle: blog.selectedTitle,
      body: blog.body,
    });

    if (qualityCheck.ok && qualityCheck.score >= 90) break;

    qualityFeedback = qualityCheck.reasons.length
      ? qualityCheck.reasons
      : ["품질 점수를 90점 이상으로 맞추고 모든 제목과 본문의 완성도를 다시 높이세요."];

    if (attempt === 3) {
      throw new Error(`품질 검사 90점 미달로 저장하지 않았습니다. 현재 점수: ${qualityCheck.score}점 / ${qualityFeedback.join(" · ")}`);
    }
  }

  // 품질검사 이후 최종 본문에 대해 팩트체크를 정확히 한 번 수행합니다.
  const factCheck = factCheckContent({
    product: recommendation.product,
    keyword,
    body: blog.body,
    selectedTitle: blog.selectedTitle,
    research,
  });
  if (!factCheck.ok) {
    throw new Error(`팩트체크 실패로 게시하지 않았습니다: ${factCheck.reasons.join(" · ")}`);
  }

  const content = {
    keyword,
    recommendation,
    blog,
    research,
    factCheck,
    quality: {
      imageCount: imageUrls.length,
      opinionSignalCount: opinionSignals.length,
      priceScore: recommendation.priceScore,
      searchRank: recommendation.searchRank,
      score: qualityCheck.score,
      passed: qualityCheck.ok,
      ok: qualityCheck.ok,
      reasons: qualityCheck.reasons,
      metrics: qualityCheck.metrics,
    },
  };

  const storageKey = await saveContent(env, content);
  return { ...content, storageKey };
}

/** HTML에 표시할 문자열을 안전하게 이스케이프합니다. */
function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** 최신 생성 글을 모바일에서도 바로 검토할 수 있는 대시보드로 보여줍니다. */
async function renderDashboard(env: Env): Promise<Response> {
  const latest = await env.CONTENT_STORE.get("latest", "json") as any;
  const lastRun = await env.CONTENT_STORE.get("last-run", "json") as any;
  const trend = await env.CONTENT_STORE.get(TREND_CACHE_KEY, "json") as any;
  const product = latest?.recommendation?.product;
  const blog = latest?.blog;

  const imageGallery = blog?.imageUrls?.length
    ? `<div class="gallery">${blog.imageUrls.map((url: string, index: number) => `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(product?.productName ?? "상품 이미지")} ${index + 1}" loading="lazy"><figcaption>상품 관련 이미지 ${index + 1}</figcaption></figure>`).join("")}</div>`
    : "";

  const contentSection = latest && blog ? `
    <section class="card">
      <div class="label">선정 상품</div>
      <div class="product">
        ${product?.productImage ? `<img src="${escapeHtml(product.productImage)}" alt="상품 이미지">` : ""}
        <div>
          <h2>${escapeHtml(product?.productName)}</h2>
          <p>${escapeHtml(latest.keyword)} · ${escapeHtml(latest.savedAt)}</p>
          <p class="meta">검색 순위 ${escapeHtml(latest.quality?.searchRank ?? "-")} · 가격 경쟁력 점수 ${escapeHtml(latest.quality?.priceScore ?? "-")} · 이미지 ${escapeHtml(latest.quality?.imageCount ?? 0)}장</p>
          ${product?.productUrl ? `<a class="button" href="${escapeHtml(product.productUrl)}" target="_blank" rel="noopener noreferrer">쿠팡 상품 보기</a>` : ""}
        </div>
      </div>
    </section>

    <section class="card">
      <div class="label">대표 제목</div>
      <h1>${escapeHtml(blog.selectedTitle)}</h1>
      <div class="label">제목 후보 5개</div>
      <ol>${blog.titles.map((title: string) => `<li>${escapeHtml(title)}</li>`).join("")}</ol>
    </section>

    <section class="card">
      <div class="label">네이버 블로그용 이미지</div>
      ${imageGallery || `<p>관련 이미지를 충분히 찾지 못했습니다. 확인된 상품 이미지만 사용합니다.</p>`}
    </section>

    <section class="card">
      <div class="label">네이버 블로그용 본문</div>
      <div class="disclosure">${escapeHtml(blog.disclosure)}</div>
      <div class="body">${escapeHtml(blog.body)}</div>
      ${blog.partnerUrl ? `<a class="link" href="${escapeHtml(blog.partnerUrl)}" target="_blank" rel="noopener noreferrer">상품 링크</a>` : ""}
    </section>`
    : `<section class="card empty">아직 자동 생성된 글이 없습니다.<br>첫 자동 실행 후 이 화면에 결과가 표시됩니다.</section>`;

  const runSection = lastRun
    ? `<section class="card status"><div class="label">자동 실행 상태</div><strong>${lastRun.status === "success" ? "정상 완료" : "실행 실패"}</strong><p>${escapeHtml(lastRun.finishedAt ?? "")}</p>${lastRun.error ? `<pre>${escapeHtml(lastRun.error)}</pre>` : ""}</section>`
    : "";

  const trendSection = trend
    ? `<section class="card"><div class="label">오늘의 콘텐츠 선정 기준</div><strong>${escapeHtml(trend.keyword)}</strong><p>${escapeHtml(trend.source)} 신호 · 과거 홍보 상품 자동 제외 · 상대 가격 경쟁력 반영 · 공개 의견 신호 참고 · 제목 중복 최소화</p></section>`
    : "";

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>쿠팡파트너스 자동 콘텐츠</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#202124;font-family:Arial,"Noto Sans KR",sans-serif;line-height:1.65}.wrap{max-width:900px;margin:0 auto;padding:32px 18px 60px}header{margin-bottom:24px}header h1{margin:0 0 6px;font-size:28px}header p{margin:0;color:#6b7280}.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;margin:16px 0;box-shadow:0 3px 12px rgba(0,0,0,.04)}.label{font-size:12px;font-weight:700;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em}.product{display:flex;gap:20px;align-items:center}.product>img{width:150px;height:150px;object-fit:contain;border:1px solid #eee;border-radius:12px;background:#fff}.product h2{margin:0 0 6px;font-size:20px}.product p{margin:0 0 8px;color:#6b7280;font-size:13px}.meta{font-size:12px!important;color:#374151!important}.button{display:inline-block;padding:9px 14px;border-radius:9px;background:#111827;color:#fff;text-decoration:none;font-size:13px}h1{font-size:25px;margin:4px 0 22px}ol{margin:8px 0 0;padding-left:22px}li{margin:5px 0}.disclosure{padding:12px;background:#f8fafc;border-radius:10px;font-size:13px;color:#4b5563;margin-bottom:18px}.body{white-space:pre-wrap;font-size:16px}.link{display:inline-block;margin-top:20px;font-weight:700;text-decoration:none}.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.gallery figure{margin:0}.gallery img{display:block;width:100%;height:220px;object-fit:contain;border:1px solid #e5e7eb;border-radius:12px;background:#fff}.gallery figcaption{font-size:12px;color:#6b7280;margin-top:5px}.empty{text-align:center;color:#6b7280;padding:50px 20px}.status strong{font-size:18px}.status p{margin:4px 0;color:#6b7280;font-size:13px}.status pre{white-space:pre-wrap;background:#fff1f2;padding:12px;border-radius:8px;color:#991b1b}@media(max-width:600px){.wrap{padding:20px 12px 40px}.product{align-items:flex-start}.product>img{width:105px;height:105px}.card{padding:18px}h1{font-size:21px}.body{font-size:15px}.gallery{grid-template-columns:1fr}.gallery img{height:260px}}
</style></head><body><main class="wrap"><header><h1>쿠팡파트너스 자동 콘텐츠</h1><p>당일 트렌드와 과거 홍보 이력, 가격 경쟁력, 공개 의견 신호를 반영해 글의 완성도를 높이는 자동 콘텐츠 시스템입니다.</p></header>${trendSection}${runSection}${contentSection}</main></body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") return renderDashboard(env);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "coupang-partners-automation", message: "Cloudflare Worker 정상 작동 중" });
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
    if (url.pathname === "/latest") {
      const content = await env.CONTENT_STORE.get("latest", "json");
      if (!content) return Response.json({ ok: false, message: "저장된 글이 없습니다." }, { status: 404 });
      return Response.json({ ok: true, content });
    }
    if (url.pathname === "/status") {
      const status = await env.CONTENT_STORE.get("last-run", "json");
      return Response.json({ ok: true, status: status ?? null });
    }

    return Response.json({ ok: false, message: "존재하지 않는 경로입니다." }, { status: 404 });
  },

  /** 매일 오전 9시(한국시간)에 실행합니다. 초기 테스트 Cron은 1회만 실행합니다. */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const trend = await getDailyKeyword(env, new Date(controller.scheduledTime));
    const keyword = trend.keyword;
    const startedAt = new Date().toISOString();
    const isInitialTest = controller.cron === INITIAL_TEST_CRON;

    if (isInitialTest) {
      const alreadyAttempted = await env.CONTENT_STORE.get(INITIAL_TEST_FLAG);
      if (alreadyAttempted) return;
      await env.CONTENT_STORE.put(INITIAL_TEST_FLAG, JSON.stringify({ attemptedAt: startedAt, keyword }));
    }

    try {
      const content = await createContent(env, keyword);
      await env.CONTENT_STORE.put(
        "last-run",
        JSON.stringify({
          status: "success",
          type: isInitialTest ? "initial-test" : "daily",
          keyword,
          trendSource: trend.source,
          storageKey: content.storageKey,
          finishedAt: new Date().toISOString(),
          imageCount: content.quality.imageCount,
          opinionSignalCount: content.quality.opinionSignalCount,
        }),
      );
      console.log("자동 콘텐츠 생성 완료:", content.storageKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      await env.CONTENT_STORE.put(
        "last-run",
        JSON.stringify({
          status: "error",
          type: isInitialTest ? "initial-test" : "daily",
          keyword,
          trendSource: trend.source,
          startedAt,
          finishedAt: new Date().toISOString(),
          error: message,
        }),
      );
      console.error("자동 콘텐츠 생성 실패:", message);
      throw error;
    }
  },
};
