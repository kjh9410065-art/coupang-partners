/**
 * 쿠팡파트너스 자동 수익형 콘텐츠 시스템의 Cloudflare Worker입니다.
 *
 * 흐름:
 * 오늘의 트렌드 수집 → 중복 제외 → 쿠팡 상품 검색 → AI 상품 선정
 * → 제목/본문 생성 → KV 저장 → 웹 대시보드 표시
 *
 * API 키는 코드에 넣지 않고 Cloudflare Workers Secrets에서 읽습니다.
 */

export interface Env {
  COUPANG_ACCESS_KEY: string;
  COUPANG_SECRET_KEY: string;
  GEMINI_API_KEY: string;
  CONTENT_STORE: KVNamespace;
}

const COUPANG_HOST = "https://api-gateway.coupang.com";
const COUPANG_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const GEMINI_HOST = "https://generativelanguage.googleapis.com/v1beta/models";

const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"];
const PARTNERS_DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

// 트렌드 수집이 실패했을 때 사용하는 계절/상시 후보입니다.
// 실제 검색량이라고 표시하지 않고 '후보'로만 사용합니다.
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

/** 쿠팡 API 인증에 필요한 HMAC-SHA256 서명을 생성합니다. */
async function createAuthorization(env: Env, method: string, path: string, query: string) {
  const signedDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(2);
  const message = signedDate + method.toUpperCase() + path + query;
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.COUPANG_SECRET_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  const signature = Array.from(new Uint8Array(signatureBuffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${signedDate}, signature=${signature}`;
}

/** 쿠팡 상품 검색 API를 호출합니다. */
async function searchProducts(env: Env, keyword: string) {
  const query = `keyword=${encodeURIComponent(keyword)}`;
  const response = await fetch(`${COUPANG_HOST}${COUPANG_SEARCH_PATH}?${query}`, {
    method: "GET",
    headers: { Authorization: await createAuthorization(env, "GET", COUPANG_SEARCH_PATH, query), "Content-Type": "application/json;charset=UTF-8" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Coupang API 오류 (${response.status}): ${text.slice(0, 500)}`);
  const data = JSON.parse(text);
  const products = Array.isArray(data?.data?.productData) ? data.data.productData : [];
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
        const response = await fetch(`${GEMINI_HOST}/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens, thinkingConfig: { thinkingLevel: "low" }, responseMimeType: "application/json" },
          }),
        });
        const text = await response.text();
        if (response.status === 503) { lastError = `Gemini ${model} 503`; continue; }
        if (!response.ok) throw new Error(`Gemini API 오류 (${response.status}): ${text.slice(0, 500)}`);
        const data = JSON.parse(text);
        const output = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text ?? "").join("").trim();
        if (!output) throw new Error(`Gemini ${model} 응답에 텍스트가 없습니다.`);
        return output;
      } catch (error) {
        if (error instanceof Error) lastError = error.message;
        if (attempt < 3) continue;
        break;
      }
    }
  }
  throw new Error(lastError);
}

/**
 * Google Trends 한국 RSS와 현재 계절 신호를 읽습니다.
 * 검색량 숫자를 직접 받는 API는 아니므로, '현재 급상승 신호'로만 취급합니다.
 */
async function fetchTrendSignals(): Promise<string[]> {
  const signals: string[] = [];
  try {
    const response = await fetch("https://trends.google.com/trending/rss?geo=KR", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (response.ok) {
      const xml = await response.text();
      const titles = [...xml.matchAll(/<title>(.*?)<\/title>/g)]
        .map((match) => match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim())
        .filter((title) => title && title !== "Daily Search Trends")
        .slice(0, 20);
      signals.push(...titles);
    }
  } catch {
    // 외부 트렌드가 잠시 실패해도 fallback 후보로 자동 진행합니다.
  }
  return signals;
}

/**
 * 오늘 사용할 검색어를 결정합니다.
 * 이미 사용한 상품/제목은 피하고, 오늘의 트렌드 신호를 우선합니다.
 */
async function getDailyKeyword(env: Env, date = new Date()): Promise<{ keyword: string; source: string }> {
  const dateKey = date.toISOString().slice(0, 10);
  const cached = await env.CONTENT_STORE.get(TREND_CACHE_KEY, "json") as any;
  if (cached?.date === dateKey && cached.keyword) return cached;

  const trendSignals = await fetchTrendSignals();
  const signalText = trendSignals.length ? trendSignals.join("\n") : "외부 트렌드 신호 없음";

  // Gemini에게 오늘 실제로 관심을 받을 가능성이 높은 '상품 검색 주제'만 고르게 합니다.
  // 숫자 검색량이나 인기 순위를 AI가 만들어내지 못하도록 명시합니다.
  let keyword = "";
  let source = "fallback";
  try {
    const prompt = `오늘은 ${dateKey} 한국이다. 아래는 Google Trends 한국 급상승 검색어 원문이다.\n${signalText}\n\n상품 추천 블로그에 사용할 검색 주제 하나를 골라라.\n조건: 1) 실제 상품으로 연결될 수 있어야 한다. 2) 뉴스/인물/사건 자체가 아니라 쇼핑 의도로 바꿀 수 있는 주제여야 한다. 3) 정확한 검색량 숫자를 만들지 않는다. 4) 너무 넓은 '생활용품' 같은 표현보다 구체적인 상품군을 우선한다. 5) 추석, 가을, 날씨 등 날짜에 맞는 계절 수요도 고려한다.\nJSON만 반환: {"keyword":"상품 검색어","source":"trend 또는 seasonal","reason":"짧은 선정 이유"}`;
    const parsed = JSON.parse((await generateGemini(env, prompt, 512)).replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
    if (typeof parsed.keyword === "string" && parsed.keyword.trim()) {
      keyword = parsed.keyword.trim();
      source = parsed.source === "trend" ? "google-trends" : "seasonal";
    }
  } catch {
    // AI/트렌드 실패 시 날짜 기반 fallback을 사용합니다.
  }

  if (!keyword) {
    const dayNumber = Math.floor(date.getTime() / 86400000);
    keyword = FALLBACK_KEYWORDS[((dayNumber % FALLBACK_KEYWORDS.length) + FALLBACK_KEYWORDS.length) % FALLBACK_KEYWORDS.length];
  }

  const result = { date: dateKey, keyword, source };
  await env.CONTENT_STORE.put(TREND_CACHE_KEY, JSON.stringify(result), { expirationTtl: 60 * 60 * 30 });
  return result;
}

/** AI가 검색 결과 중 콘텐츠 제작에 적합한 상품 하나를 고릅니다. */
async function recommendProduct(env: Env, keyword: string, products: any[], usedProductIds: string[]) {
  const compactProducts = products
    .filter((product) => !usedProductIds.includes(String(product.productId)))
    .map((product) => ({ productId: product.productId, productName: product.productName, rank: product.rank, isRocket: product.isRocket, isFreeShipping: product.isFreeShipping }));

  if (!compactProducts.length) throw new Error("이번 검색 결과의 상품이 모두 과거에 홍보된 상품입니다.");

  const prompt = `너는 쿠팡 파트너스 콘텐츠용 상품 선정 담당자다.\n검색어: ${keyword}\n상품 목록: ${JSON.stringify(compactProducts, null, 2)}\n\n선정 규칙:\n1. 검색어와 상품명이 가장 잘 맞는 상품을 우선한다.\n2. 블로그에서 설명하기 좋은 상품을 우선한다.\n3. 과거에 홍보된 상품은 이미 제외되어 있다.\n4. API에 없는 인기, 판매량, 리뷰 수, 평점, 할인율 등의 정보를 만들지 않는다.\n5. 반드시 목록에 존재하는 productId 하나만 선택한다.\nJSON만 반환: {"productId":"선택한상품ID","reason":"선정 이유"}`;
  const parsed = JSON.parse((await generateGemini(env, prompt, 1024)).replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
  const selected = products.find((product) => String(product.productId) === String(parsed.productId) && !usedProductIds.includes(String(product.productId)));
  if (!selected) throw new Error("AI가 사용 이력이 있는 상품을 선택했습니다.");
  return { product: selected, reason: parsed.reason ?? "검색어와의 관련성이 높아 선정했습니다." };
}

/** 선택된 실제 상품 정보만 사용해 블로그 제목과 본문을 생성합니다. */
async function generateBlog(env: Env, product: any, keyword: string, usedTitles: string[]) {
  const prompt = `너는 한국어 상품 정보 블로그 전문 작가다.\n검색어: ${keyword}\n상품명: ${product.productName}\n로켓배송 여부: ${product.isRocket}\n무료배송 여부: ${product.isFreeShipping}\n\n작성 규칙:\n- 상품명과 API에서 확인된 정보만 사용한다.\n- API에 없는 기능, 소재, 크기, 배터리, 성능, 구성품을 만들지 않는다.\n- 실제 사용 경험이나 가짜 리뷰를 쓰지 않는다.\n- 가격, 할인, 최저가, 가성비를 본문 핵심 소재로 사용하지 않는다.\n- 과장된 광고 표현을 피한다.\n- 제목과 본문 표현을 이전 글과 최대한 다르게 한다.\n- 아래는 과거에 사용한 제목 목록이다. 비슷한 문구와 구조를 피한다.\n${JSON.stringify(usedTitles.slice(-60))}\n- 제목은 서로 다른 방향으로 5개 만든다.\n- 본문은 충분히 읽을 만한 분량의 자연스러운 한국어로 작성한다.\n- 본문에 상품 링크나 고지문을 직접 넣지 않는다.\nJSON만 반환: {"titles":["제목1","제목2","제목3","제목4","제목5"],"selectedTitle":"대표 제목","body":"본문 전체"}`;
  const parsed = JSON.parse((await generateGemini(env, prompt, 5000)).replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
  if (!Array.isArray(parsed.titles) || parsed.titles.length !== 5 || !parsed.selectedTitle || !parsed.body) throw new Error("Gemini가 올바른 블로그 결과를 반환하지 않았습니다.");
  return { disclosure: PARTNERS_DISCLOSURE, titles: parsed.titles, selectedTitle: parsed.selectedTitle, body: parsed.body, partnerUrl: product.productUrl };
}

/** 과거에 사용한 상품 ID와 제목을 읽습니다. */
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

/** 상품 추천부터 글 생성까지 한 번에 실행합니다. */
async function createContent(env: Env, keyword: string) {
  const products = await searchProducts(env, keyword);
  if (!products.length) throw new Error("검색 결과가 없습니다.");
  const history = await getHistory(env);
  const recommendation = await recommendProduct(env, keyword, products, history.productIds);
  const blog = await generateBlog(env, recommendation.product, keyword, history.titles);
  const content = { keyword, recommendation, blog };
  const storageKey = await saveContent(env, content);
  return { ...content, storageKey };
}

/** HTML에 표시할 문자열을 안전하게 이스케이프합니다. */
function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

/** 최신 생성 글을 확인하기 쉬운 웹 화면으로 보여줍니다. */
async function renderDashboard(env: Env): Promise<Response> {
  const latest = await env.CONTENT_STORE.get("latest", "json") as any;
  const lastRun = await env.CONTENT_STORE.get("last-run", "json") as any;
  const trend = await env.CONTENT_STORE.get(TREND_CACHE_KEY, "json") as any;
  const product = latest?.recommendation?.product;
  const blog = latest?.blog;

  const contentSection = latest && blog ? `
      <section class="card"><div class="label">선정 상품</div><div class="product">${product?.productImage ? `<img src="${escapeHtml(product.productImage)}" alt="상품 이미지">` : ""}<div><h2>${escapeHtml(product?.productName)}</h2><p>${escapeHtml(latest.keyword)} · ${escapeHtml(latest.savedAt)}</p>${product?.productUrl ? `<a class="button" href="${escapeHtml(product.productUrl)}" target="_blank" rel="noopener noreferrer">쿠팡 상품 보기</a>` : ""}</div></div></section>
      <section class="card"><div class="label">대표 제목</div><h1>${escapeHtml(blog.selectedTitle)}</h1><div class="label">제목 후보 5개</div><ol>${blog.titles.map((title: string) => `<li>${escapeHtml(title)}</li>`).join("")}</ol></section>
      <section class="card"><div class="label">네이버 블로그용 본문</div><div class="disclosure">${escapeHtml(blog.disclosure)}</div><div class="body">${escapeHtml(blog.body)}</div>${blog.partnerUrl ? `<a class="link" href="${escapeHtml(blog.partnerUrl)}" target="_blank" rel="noopener noreferrer">상품 링크</a>` : ""}</section>` : `<section class="card empty">아직 자동 생성된 글이 없습니다.<br>첫 자동 실행 후 이 화면에 결과가 표시됩니다.</section>`;

  const runSection = lastRun ? `<section class="card status"><div class="label">자동 실행 상태</div><strong>${lastRun.status === "success" ? "정상 완료" : "실행 실패"}</strong><p>${escapeHtml(lastRun.finishedAt ?? "")}</p>${lastRun.error ? `<pre>${escapeHtml(lastRun.error)}</pre>` : ""}</section>` : "";
  const trendSection = trend ? `<section class="card"><div class="label">오늘의 콘텐츠 선정 기준</div><strong>${escapeHtml(trend.keyword)}</strong><p>${escapeHtml(trend.source)} 신호를 바탕으로 선정 · 과거 홍보 상품 자동 제외 · 제목 중복 최소화</p></section>` : "";

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>쿠팡파트너스 자동 콘텐츠</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#202124;font-family:Arial,"Noto Sans KR",sans-serif;line-height:1.65}.wrap{max-width:900px;margin:0 auto;padding:32px 18px 60px}header{margin-bottom:24px}header h1{margin:0 0 6px;font-size:28px}header p{margin:0;color:#6b7280}.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;margin:16px 0;box-shadow:0 3px 12px rgba(0,0,0,.04)}.label{font-size:12px;font-weight:700;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em}.product{display:flex;gap:20px;align-items:center}.product img{width:150px;height:150px;object-fit:contain;border:1px solid #eee;border-radius:12px;background:#fff}.product h2{margin:0 0 6px;font-size:20px}.product p{margin:0 0 14px;color:#6b7280;font-size:13px}.button{display:inline-block;padding:9px 14px;border-radius:9px;background:#111827;color:#fff;text-decoration:none;font-size:13px}h1{font-size:25px;margin:4px 0 22px}ol{margin:8px 0 0;padding-left:22px}li{margin:5px 0}.disclosure{padding:12px;background:#f8fafc;border-radius:10px;font-size:13px;color:#4b5563;margin-bottom:18px}.body{white-space:pre-wrap;font-size:16px}.link{display:inline-block;margin-top:20px;font-weight:700;text-decoration:none}.empty{text-align:center;color:#6b7280;padding:50px 20px}.status strong{font-size:18px}.status p{margin:4px 0;color:#6b7280;font-size:13px}.status pre{white-space:pre-wrap;background:#fff1f2;padding:12px;border-radius:8px;color:#991b1b}@media(max-width:600px){.wrap{padding:20px 12px 40px}.product{align-items:flex-start}.product img{width:105px;height:105px}.card{padding:18px}h1{font-size:21px}.body{font-size:15px}}</style></head><body><main class="wrap"><header><h1>쿠팡파트너스 자동 콘텐츠</h1><p>당일 트렌드와 과거 홍보 이력을 반영해 중복을 줄이는 자동 콘텐츠 시스템입니다.</p></header>${trendSection}${runSection}${contentSection}</main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") return renderDashboard(env);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "coupang-partners-automation", message: "Cloudflare Worker 정상 작동 중" });
    if (url.pathname === "/secrets-check") return Response.json({ ok: true, secrets: { coupangAccessKey: Boolean(env.COUPANG_ACCESS_KEY), coupangSecretKey: Boolean(env.COUPANG_SECRET_KEY), geminiApiKey: Boolean(env.GEMINI_API_KEY) } });
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
      await env.CONTENT_STORE.put("last-run", JSON.stringify({ status: "success", type: isInitialTest ? "initial-test" : "daily", keyword, trendSource: trend.source, storageKey: content.storageKey, finishedAt: new Date().toISOString() }));
      console.log("자동 콘텐츠 생성 완료:", content.storageKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      await env.CONTENT_STORE.put("last-run", JSON.stringify({ status: "error", type: isInitialTest ? "initial-test" : "daily", keyword, trendSource: trend.source, startedAt, finishedAt: new Date().toISOString(), error: message }));
      console.error("자동 콘텐츠 생성 실패:", message);
      throw error;
    }
  },
};