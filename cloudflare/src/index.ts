/**
 * 쿠팡파트너스 자동 수익형 콘텐츠 시스템의 Cloudflare Worker입니다.
 *
 * 흐름:
 * 쿠팡 상품 검색 → AI 상품 추천 → 블로그 제목/본문 생성 → Cloudflare KV 저장
 * → 웹 대시보드에서 최신 결과 확인
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

// 안정적인 Gemini 모델을 우선순위대로 사용합니다.
// 일시적인 503이 발생하면 다음 모델로 자동 전환합니다.
const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
];

const PARTNERS_DISCLOSURE =
  "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

// 매일 하나씩 순환시킬 상품 검색 주제입니다.
// 하루 1회 검색으로 쿠팡 API 호출을 불필요하게 늘리지 않습니다.
const AUTOMATION_KEYWORDS = [
  "무선청소기",
  "공기청정기",
  "무선이어폰",
  "주방용품",
  "캠핑용품",
  "차량용품",
  "컴퓨터 주변기기",
];

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
          `${GEMINI_HOST}/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // API 키를 URL에 넣지 않고 헤더로 전달해 로그 노출 가능성을 줄입니다.
              "x-goog-api-key": env.GEMINI_API_KEY,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens,
                // 블로그 생성은 빠른 응답을 우선합니다.
                thinkingConfig: { thinkingLevel: "low" },
                // AI가 JSON을 반환해야 하는 단계에서는 파싱 안정성을 높입니다.
                responseMimeType: "application/json",
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
        if (error instanceof Error) lastError = error.message;
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

선정 규칙:
1. 검색어와 상품명이 가장 잘 맞는 상품을 우선한다.
2. 블로그에서 설명하기 좋은 상품을 우선한다.
3. API에 없는 인기, 판매량, 리뷰 수, 평점, 할인율 등의 정보를 만들지 않는다.
4. 가격을 근거로 과장하지 않는다.
5. 반드시 목록에 존재하는 productId 하나만 선택한다.

다음 JSON 하나만 반환한다.
{"productId":"선택한상품ID","reason":"선정 이유"}
`.trim();

  const raw = await generateGemini(env, prompt, 1024);
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  const selected = products.find((product) => String(product.productId) === String(parsed.productId));

  if (!selected) throw new Error("AI가 실제 검색 결과에 없는 상품을 선택했습니다.");

  return {
    product: selected,
    reason: parsed.reason ?? "검색어와의 관련성이 높아 선정했습니다.",
  };
}

/** 선택된 실제 상품 정보만 사용해 블로그 제목과 본문을 생성합니다. */
async function generateBlog(env: Env, product: any, keyword: string) {
  const prompt = `
너는 한국어 상품 정보 블로그 전문 작가다.
아래 상품 정보는 쿠팡 API에서 실제로 받은 정보다.

검색어: ${keyword}
상품명: ${product.productName}
로켓배송 여부: ${product.isRocket}
무료배송 여부: ${product.isFreeShipping}

작성 규칙:
- 상품명과 API에서 확인된 정보만 사용한다.
- 구체적인 기능, 소재, 크기, 배터리, 성능, 구성품 등 API에 없는 정보는 절대 만들지 않는다.
- 실제 사용한 것처럼 쓰지 않는다.
- 가짜 리뷰나 체험담을 만들지 않는다.
- 가격, 할인, 최저가, 가성비를 본문 핵심 소재로 사용하지 않는다.
- 과장된 광고 표현을 피한다.
- 단점을 억지로 만들지 않는다.
- 같은 표현과 문장 구조를 반복하지 않는다.
- 네이버 블로그에 바로 붙여 넣기 쉬운 자연스러운 한국어로 작성한다.
- 제목은 서로 다른 방향으로 5개 만든다.
- 본문은 충분히 읽을 만한 분량으로 작성하되 의미 없는 문장을 늘리지 않는다.
- 본문 안에 상품 링크나 고지문을 직접 넣지 않는다. 시스템이 마지막에 정확히 한 번 삽입한다.

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

/** 생성된 글을 Cloudflare KV에 저장합니다. */
async function saveContent(env: Env, content: any) {
  const now = new Date();
  const key = `post:${now.toISOString()}`;
  const record = {
    savedAt: now.toISOString(),
    ...content,
  };

  await env.CONTENT_STORE.put(key, JSON.stringify(record));

  // 가장 최근 글을 빠르게 확인할 수 있도록 별도 키에도 저장합니다.
  await env.CONTENT_STORE.put("latest", JSON.stringify(record));

  return key;
}

/** 오늘 사용할 검색어를 날짜 기준으로 순환 선택합니다. */
function getDailyKeyword(date = new Date()) {
  const dayNumber = Math.floor(date.getTime() / 86400000);
  return AUTOMATION_KEYWORDS[((dayNumber % AUTOMATION_KEYWORDS.length) + AUTOMATION_KEYWORDS.length) % AUTOMATION_KEYWORDS.length];
}

/** 상품 추천부터 글 생성까지 한 번에 실행합니다. */
async function createContent(env: Env, keyword: string) {
  const products = await searchProducts(env, keyword);
  if (products.length === 0) throw new Error("검색 결과가 없습니다.");

  const recommendation = await recommendProduct(env, keyword, products);
  const blog = await generateBlog(env, recommendation.product, keyword);

  const content = {
    keyword,
    recommendation,
    blog,
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

/** 최신 생성 글을 확인하기 쉬운 웹 화면으로 보여줍니다. */
async function renderDashboard(env: Env): Promise<Response> {
  const latest = await env.CONTENT_STORE.get("latest", "json") as any;
  const lastRun = await env.CONTENT_STORE.get("last-run", "json") as any;

  const product = latest?.recommendation?.product;
  const blog = latest?.blog;

  const contentSection = latest && blog
    ? `
      <section class="card">
        <div class="label">선정 상품</div>
        <div class="product">
          ${product?.productImage ? `<img src="${escapeHtml(product.productImage)}" alt="상품 이미지">` : ""}
          <div>
            <h2>${escapeHtml(product?.productName)}</h2>
            <p>${escapeHtml(latest.keyword)} · ${escapeHtml(latest.savedAt)}</p>
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
        <div class="label">네이버 블로그용 본문</div>
        <div class="disclosure">${escapeHtml(blog.disclosure)}</div>
        <div class="body">${escapeHtml(blog.body)}</div>
        ${blog.partnerUrl ? `<a class="link" href="${escapeHtml(blog.partnerUrl)}" target="_blank" rel="noopener noreferrer">상품 링크</a>` : ""}
      </section>
    `
    : `
      <section class="card empty">
        아직 자동 생성된 글이 없습니다.<br>
        첫 자동 실행 후 이 화면에 결과가 표시됩니다.
      </section>
    `;

  const runSection = lastRun
    ? `<section class="card status"><div class="label">자동 실행 상태</div><strong>${lastRun.status === "success" ? "정상 완료" : "실행 실패"}</strong><p>${escapeHtml(lastRun.finishedAt ?? "")}</p>${lastRun.error ? `<pre>${escapeHtml(lastRun.error)}</pre>` : ""}</section>`
    : "";

  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>쿠팡파트너스 자동 콘텐츠</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#202124;font-family:Arial,"Noto Sans KR",sans-serif;line-height:1.65}.wrap{max-width:900px;margin:0 auto;padding:32px 18px 60px}header{margin-bottom:24px}header h1{margin:0 0 6px;font-size:28px}header p{margin:0;color:#6b7280}.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;margin:16px 0;box-shadow:0 3px 12px rgba(0,0,0,.04)}.label{font-size:12px;font-weight:700;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em}.product{display:flex;gap:20px;align-items:center}.product img{width:150px;height:150px;object-fit:contain;border:1px solid #eee;border-radius:12px;background:#fff}.product h2{margin:0 0 6px;font-size:20px}.product p{margin:0 0 14px;color:#6b7280;font-size:13px}.button{display:inline-block;padding:9px 14px;border-radius:9px;background:#111827;color:#fff;text-decoration:none;font-size:13px}h1{font-size:25px;margin:4px 0 22px}ol{margin:8px 0 0;padding-left:22px}li{margin:5px 0}.disclosure{padding:12px;background:#f8fafc;border-radius:10px;font-size:13px;color:#4b5563;margin-bottom:18px}.body{white-space:pre-wrap;font-size:16px}.link{display:inline-block;margin-top:20px;font-weight:700;text-decoration:none}.empty{text-align:center;color:#6b7280;padding:50px 20px}.status strong{font-size:18px}.status p{margin:4px 0;color:#6b7280;font-size:13px}.status pre{white-space:pre-wrap;background:#fff1f2;padding:12px;border-radius:8px;color:#991b1b}@media(max-width:600px){.wrap{padding:20px 12px 40px}.product{align-items:flex-start}.product img{width:105px;height:105px}.card{padding:18px}h1{font-size:21px}.body{font-size:15px}}
  </style>
</head>
<body>
  <main class="wrap">
    <header>
      <h1>쿠팡파트너스 자동 콘텐츠</h1>
      <p>매일 자동으로 생성된 최신 상품 콘텐츠를 확인하는 화면입니다.</p>
    </header>
    ${runSection}
    ${contentSection}
  </main>
</body>
</html>`;

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

    // 메인 화면: 가장 최근에 생성된 글을 사람이 보기 좋게 표시합니다.
    if (url.pathname === "/") {
      return renderDashboard(env);
    }

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

    // 가장 최근에 생성된 글을 JSON으로 확인할 수 있습니다.
    if (url.pathname === "/latest") {
      const content = await env.CONTENT_STORE.get("latest", "json");
      if (!content) return Response.json({ ok: false, message: "저장된 글이 없습니다." }, { status: 404 });
      return Response.json({ ok: true, content });
    }

    // 자동 실행의 마지막 성공/실패 상태를 확인할 수 있습니다.
    if (url.pathname === "/status") {
      const status = await env.CONTENT_STORE.get("last-run", "json");
      return Response.json({ ok: true, status: status ?? null });
    }

    return Response.json({ ok: false, message: "존재하지 않는 경로입니다." }, { status: 404 });
  },

  /**
   * 매일 오전 9시(한국시간)에 실행됩니다.
   * Cron은 UTC 기준이므로 00:00 UTC를 사용합니다.
   * 생성이 실패하면 예외를 다시 던져 Cloudflare Cron 기록에도 실패가 남도록 합니다.
   */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const keyword = getDailyKeyword(new Date(controller.scheduledTime));
    const startedAt = new Date().toISOString();

    try {
      const content = await createContent(env, keyword);

      await env.CONTENT_STORE.put("last-run", JSON.stringify({
        status: "success",
        keyword,
        storageKey: content.storageKey,
        finishedAt: new Date().toISOString(),
      }));

      console.log("자동 콘텐츠 생성 완료:", content.storageKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";

      await env.CONTENT_STORE.put("last-run", JSON.stringify({
        status: "error",
        keyword,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: message,
      }));

      console.error("자동 콘텐츠 생성 실패:", message);
      throw error;
    }
  },
};
