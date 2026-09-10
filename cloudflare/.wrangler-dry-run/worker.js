var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/quality.ts
var FORBIDDEN_PATTERNS = [
  /내돈내산/i,
  /직접\s*(써|사용)해보/i,
  /써보니/i,
  /사용해보니/i,
  /무조건/i,
  /100%\s*만족/i,
  /최저가/i,
  /역대급/i,
  /대박/i
];
function normalize(value) {
  return value.toLowerCase().replace(/[^0-9a-z가-힣]+/gi, "").trim();
}
__name(normalize, "normalize");
function titleSimilarity(a, b) {
  const left = new Set(normalize(a).match(/[가-힣]{2,}|[a-z0-9]{2,}/gi) ?? []);
  const right = new Set(normalize(b).match(/[가-힣]{2,}|[a-z0-9]{2,}/gi) ?? []);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common++;
  return common / Math.max(left.size, right.size);
}
__name(titleSimilarity, "titleSimilarity");
function countRepeatedPhrases(body) {
  const sentences = body.split(/[.!?。！？\n]+/).map((item) => normalize(item)).filter((item) => item.length >= 18);
  let repeated = 0;
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) if (sentences[i] === sentences[j]) repeated++;
  }
  return repeated;
}
__name(countRepeatedPhrases, "countRepeatedPhrases");
function validateContentQuality(input) {
  const titles = Array.isArray(input.titles) ? input.titles.filter((item) => typeof item === "string" && item.trim().length > 0) : [];
  const selectedTitle = typeof input.selectedTitle === "string" ? input.selectedTitle.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const productName = input.productName.trim();
  const reasons = [];
  const normalizedTitles = titles.map(normalize);
  const uniqueTitleCount = new Set(normalizedTitles).size;
  const repeatedPhraseCount = countRepeatedPhrases(body);
  const forbiddenPhraseCount = FORBIDDEN_PATTERNS.reduce((count, pattern) => count + (pattern.test(body) ? 1 : 0), 0);
  const normalizedBody = normalize(body);
  const normalizedProduct = normalize(productName);
  const normalizedKeyword = normalize(input.keyword);
  if (titles.length !== 5) reasons.push("\uC81C\uBAA9\uC774 \uC815\uD655\uD788 5\uAC1C\uAC00 \uC544\uB2D9\uB2C8\uB2E4.");
  if (uniqueTitleCount < 4) reasons.push("\uC81C\uBAA9 \uD6C4\uBCF4\uAC00 \uC11C\uB85C \uC9C0\uB098\uCE58\uAC8C \uBE44\uC2B7\uD569\uB2C8\uB2E4.");
  if (!selectedTitle || !titles.some((title) => normalize(title) === normalize(selectedTitle))) reasons.push("\uC120\uC815 \uC81C\uBAA9\uC774 \uC81C\uBAA9 \uD6C4\uBCF4\uC5D0 \uC5C6\uC2B5\uB2C8\uB2E4.");
  if (body.length < 1400) reasons.push("\uBCF8\uBB38\uC774 \uB108\uBB34 \uC9E7\uC2B5\uB2C8\uB2E4.");
  if (body.length > 5e3) reasons.push("\uBCF8\uBB38\uC774 \uC9C0\uB098\uCE58\uAC8C \uAE41\uB2C8\uB2E4.");
  if (productName && !normalizedBody.includes(normalizedProduct)) reasons.push("\uBCF8\uBB38\uC5D0 \uC0C1\uD488\uBA85\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
  if (normalizedKeyword && !normalizedBody.includes(normalizedKeyword) && !normalizedProduct.includes(normalizedKeyword)) reasons.push("\uAC80\uC0C9 \uC8FC\uC81C\uC640 \uBCF8\uBB38\uC758 \uC5F0\uACB0\uC774 \uC57D\uD569\uB2C8\uB2E4.");
  if (repeatedPhraseCount > 0) reasons.push("\uB3D9\uC77C\uD55C \uBB38\uC7A5\uC774 \uBC18\uBCF5\uB429\uB2C8\uB2E4.");
  if (forbiddenPhraseCount > 0) reasons.push("\uAE08\uC9C0 \uB610\uB294 \uACFC\uC7A5 \uD45C\uD604\uC774 \uD3EC\uD568\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
  let highlySimilarPairs = 0;
  for (let i = 0; i < titles.length; i++) {
    for (let j = i + 1; j < titles.length; j++) if (titleSimilarity(titles[i], titles[j]) >= 0.9) highlySimilarPairs++;
  }
  if (highlySimilarPairs > 0) reasons.push("\uC81C\uBAA9 \uAD6C\uC870\uAC00 \uBC18\uBCF5\uB429\uB2C8\uB2E4.");
  let score = 100;
  score -= Math.max(0, 5 - uniqueTitleCount) * 8;
  score -= Math.min(25, Math.max(0, 1400 - body.length) / 20);
  score -= Math.min(20, highlySimilarPairs * 7);
  score -= Math.min(20, repeatedPhraseCount * 10);
  score -= Math.min(30, forbiddenPhraseCount * 10);
  if (reasons.length > 0) score = Math.min(99, score);
  score = Math.max(0, Math.round(score));
  return {
    ok: reasons.length === 0 && score >= 90,
    score,
    reasons,
    metrics: { bodyLength: body.length, titleCount: titles.length, uniqueTitleCount, repeatedPhraseCount, forbiddenPhraseCount }
  };
}
__name(validateContentQuality, "validateContentQuality");

// src/factcheck.ts
function normalize2(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
__name(normalize2, "normalize");
function extractClaims(body) {
  const patterns = [
    /\b\d+(?:\.\d+)?\s*(?:v|w|a|mah|mm|cm|m|kg|g|l|ml|인치|단|개|매|세트)\b/gi,
    /\d+(?:\.\d+)?\s*(?:볼트|와트|암페어|킬로그램|그램|리터|센티미터|밀리미터)/gi,
    // 기능 키워드 자체만 검사합니다. 뒤의 일반 문장까지 붙잡으면
    // "무선청소기 관련 상품을 찾고 있다" 같은 정상 문장을 오탐할 수 있습니다.
    /(?:높이|길이|폭|무게|용량|출력|전압|소비전력|배터리|재질|소재|방수|방진|충전|무선|유선|접이식|회전|각도|조절|수직촬영|거치|호환|지원)/gi
  ];
  const claims = /* @__PURE__ */ new Set();
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) {
      const claim = match[0].replace(/^[\s,.:;]+|[\s,.:;]+$/g, "").trim();
      if (claim.length >= 2 && claim.length <= 90) claims.add(claim);
    }
  }
  return [...claims].slice(0, 80);
}
__name(extractClaims, "extractClaims");
function factCheckContent(input) {
  const reasons = [];
  const claims = extractClaims(input.body);
  const corpus = normalize2([
    input.product?.productName ?? "",
    input.research.productName,
    ...input.research.evidence,
    ...input.research.sources.map((source) => `${source.title} ${source.snippet}`)
  ].join("\n"));
  const body = normalize2(input.body);
  if (!body.includes(normalize2(String(input.product?.productName ?? "")))) {
    reasons.push("\uBCF8\uBB38\uC5D0 \uD655\uC778\uB41C \uC0C1\uD488\uBA85\uC774 \uD3EC\uD568\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  }
  if (!input.research.sources.length && !input.research.evidence.length) {
    reasons.push("\uC0C1\uD488 \uC678\uBD80 \uC870\uC0AC \uACB0\uACFC\uAC00 \uC5C6\uC5B4 \uC81C\uD488 \uD2B9\uC9D5\uC744 \uAC80\uC99D\uD560 \uADFC\uAC70\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  for (const claim of claims) {
    const normalizedClaim = normalize2(claim);
    const compactClaim = normalizedClaim.replace(/\s+/g, "");
    const compactCorpus = corpus.replace(/\s+/g, "");
    if (!compactCorpus.includes(compactClaim)) {
      reasons.push(`\uD655\uC778\uB418\uC9C0 \uC54A\uC740 \uC0C1\uD488 \uC815\uBCF4\uAC00 \uD3EC\uD568\uB418\uC5C8\uC2B5\uB2C8\uB2E4: ${claim}`);
      if (reasons.length >= 6) break;
    }
  }
  const priceMentions = input.body.match(/\d+(?:,\d{3})*\s*원/g) ?? [];
  const price = Number(input.product?.productPrice) || 0;
  if (priceMentions.length) {
    const normalizedPrice = price.toLocaleString("ko-KR");
    const invalidPrice = price <= 0 || priceMentions.some((mention) => !mention.replace(/\s/g, "").startsWith(`${normalizedPrice}\uC6D0`));
    if (invalidPrice) reasons.push("\uBCF8\uBB38\uC758 \uAC00\uACA9 \uC815\uBCF4\uAC00 \uD604\uC7AC \uCFE0\uD321 \uAC80\uC0C9 \uACB0\uACFC \uAC00\uACA9\uACFC \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  }
  if (/최저가|최저 가격|역대급|무조건|100% 만족|완벽|최고의 제품/i.test(input.body)) {
    reasons.push("\uAC80\uC99D\uD560 \uC218 \uC5C6\uB294 \uACFC\uC7A5 \uD45C\uD604\uC774 \uD3EC\uD568\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
  }
  const score = reasons.length ? Math.max(0, 100 - reasons.length * 15) : 100;
  return {
    ok: reasons.length === 0,
    score,
    reasons,
    checkedClaims: claims
  };
}
__name(factCheckContent, "factCheckContent");

// src/index.ts
var COUPANG_HOST = "https://api-gateway.coupang.com";
var COUPANG_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
var PARTNERS_DISCLOSURE = "\uC774 \uD3EC\uC2A4\uD305\uC740 \uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uD65C\uB3D9\uC758 \uC77C\uD658\uC73C\uB85C, \uC774\uC5D0 \uB530\uB978 \uC77C\uC815\uC561\uC758 \uC218\uC218\uB8CC\uB97C \uC81C\uACF5\uBC1B\uC2B5\uB2C8\uB2E4.";
var FALLBACK_KEYWORDS = [
  "\uCD94\uC11D \uC120\uBB3C\uC138\uD2B8",
  "\uBA85\uC808 \uC74C\uC2DD \uC900\uBE44",
  "\uC8FC\uBC29\uC6A9\uD488",
  "\uCC28\uB7C9\uC6A9\uD488",
  "\uCEA0\uD551\uC6A9\uD488",
  "\uBB34\uC120\uCCAD\uC18C\uAE30",
  "\uACF5\uAE30\uCCAD\uC815\uAE30",
  "\uBB34\uC120\uC774\uC5B4\uD3F0",
  "\uCEF4\uD4E8\uD130 \uC8FC\uBCC0\uAE30\uAE30",
  "\uC0DD\uD65C\uC6A9\uD488"
];
var INITIAL_TEST_CRON = "*/5 * * * *";
var INITIAL_TEST_FLAG = "initial-test-attempted";
var TREND_CACHE_KEY = "trend:today";
var USED_PRODUCTS_KEY = "history:products";
var USED_TITLES_KEY = "history:titles";
var MAX_HISTORY = 120;
async function createAuthorization(env, method, path, query) {
  const signedDate = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(2);
  const message = signedDate + method.toUpperCase() + path + query;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.COUPANG_SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  const signature = Array.from(new Uint8Array(signatureBuffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${signedDate}, signature=${signature}`;
}
__name(createAuthorization, "createAuthorization");
async function searchProducts(env, keyword) {
  const query = `keyword=${encodeURIComponent(keyword)}`;
  const response = await fetch(`${COUPANG_HOST}${COUPANG_SEARCH_PATH}?${query}`, {
    method: "GET",
    headers: {
      Authorization: await createAuthorization(env, "GET", COUPANG_SEARCH_PATH, query),
      "Content-Type": "application/json;charset=UTF-8"
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Coupang API \uC624\uB958 (${response.status}): ${text.slice(0, 500)}`);
  const data = JSON.parse(text);
  const products = Array.isArray(data?.data?.productData) ? data.data.productData : [];
  return products.map((product) => ({
    productId: product.productId ?? null,
    productName: product.productName ?? "",
    productPrice: Number(product.productPrice) || null,
    productImage: product.productImage ?? "",
    productUrl: product.productUrl ?? "",
    keyword: product.keyword ?? keyword,
    rank: Number(product.rank) || null,
    isRocket: Boolean(product.isRocket),
    isFreeShipping: Boolean(product.isFreeShipping)
  }));
}
__name(searchProducts, "searchProducts");
async function generateGemini(env, prompt, maxOutputTokens = 4096) {
  if (prompt.includes("\uC0C1\uD488 \uD6C4\uBCF4:")) {
    const m = prompt.match(/상품 후보:\s*([\s\S]*?)\n\n공개 웹 검색/);
    if (m) {
      try {
        const list = JSON.parse(m[1]);
        const first = Array.isArray(list) ? list[0] : null;
        if (first?.productId != null) return JSON.stringify({ productId: String(first.productId), reason: "\uAC80\uC0C9\uC5B4 \uAD00\uB828\uC131\uC744 \uC6B0\uC120\uD574 \uC120\uD0DD\uD588\uC2B5\uB2C8\uB2E4." });
      } catch {
      }
    }
  }
  if (prompt.includes("Google Trends \uD55C\uAD6D \uAE09\uC0C1\uC2B9 \uAC80\uC0C9\uC5B4 \uC6D0\uBB38")) {
    return JSON.stringify({ keyword: "\uBB34\uC120\uCCAD\uC18C\uAE30", source: "fallback", reason: "AI \uC5C6\uC774 \uC0AC\uC6A9\uD558\uB294 \uC548\uC804\uD55C \uAE30\uBCF8 \uC0C1\uD488\uAD70\uC785\uB2C8\uB2E4." });
  }
  if (prompt.includes("[\uD655\uC778\uB41C \uC0C1\uD488 \uC815\uBCF4]")) {
    const keyword = prompt.match(/검색 주제:\s*(.+)/)?.[1]?.trim() || "\uC0C1\uD488 \uC815\uBCF4";
    const productName = prompt.match(/상품명:\s*(.+)/)?.[1]?.trim() || keyword;
    const price = (prompt.match(/현재 검색 결과 가격:\s*(.+)/)?.[1]?.trim() || "\uD655\uC778 \uBD88\uAC00").replace(/원\s*$/, "");
    const rank = prompt.match(/검색 결과 순위:\s*(.+)/)?.[1]?.trim() || "\uD655\uC778 \uBD88\uAC00";
    const rocket = prompt.match(/로켓배송:\s*(.+)/)?.[1]?.trim() || "\uD655\uC778 \uBD88\uAC00";
    const freeShipping = prompt.match(/무료배송:\s*(.+)/)?.[1]?.trim() || "\uD655\uC778 \uBD88\uAC00";
    const researchMatch = prompt.match(/\[팩트체크용 제품 조사 결과\]\s*([\s\S]*?)\n\n\[참고용 사용자 의견 신호\]/);
    let research = null;
    try {
      research = researchMatch ? JSON.parse(researchMatch[1]) : null;
    } catch {
    }
    const evidence = Array.isArray(research?.evidence) ? research.evidence.slice(0, 5) : [];
    const evidenceText = evidence.length ? `\uACF5\uAC1C \uC790\uB8CC ${evidence.length}\uAC74\uC744 \uB300\uC870\uD574 \uC0C1\uD488\uBA85\uACFC \uC77C\uCE58\uD558\uB294 \uC815\uBCF4\uB97C \uC6B0\uC120 \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4. \uAC80\uC0C9 \uACB0\uACFC\uC758 \uC81C\uBAA9\uC774\uB098 \uC2A4\uB2C8\uD3AB\uC744 \uADF8\uB300\uB85C \uC62E\uAE30\uC9C0 \uC54A\uACE0, \uC11C\uB85C \uB9DE\uC9C0 \uC54A\uB294 \uC790\uB8CC\uB294 \uC81C\uC678\uD588\uC2B5\uB2C8\uB2E4.` : "\uACF5\uAC1C \uC870\uC0AC \uC790\uB8CC\uC5D0\uC11C \uC0C1\uD488\uACFC \uC9C1\uC811 \uC77C\uCE58\uD558\uB294 \uC81C\uD488 \uD2B9\uC9D5\uC744 \uCDA9\uBD84\uD788 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
    const titles = [
      `${productName} \uC2E4\uC81C \uD655\uC778 \uC815\uBCF4\uC640 \uC8FC\uC694 \uD2B9\uC9D5 \uC815\uB9AC`,
      `${keyword} \uAD00\uB828 ${productName} \uD2B9\uC9D5\uACFC \uD655\uC778\uD560 \uC810`,
      `\uAD6C\uB9E4 \uC804 \uC54C\uC544\uBCF8 ${productName} \uC8FC\uC694 \uAE30\uB2A5\uACFC \uD2B9\uC9D5`,
      `${productName} \uC81C\uD488 \uC815\uBCF4\uC640 \uC0AC\uC6A9 \uBAA9\uC801\uBCC4 \uD655\uC778 \uD3EC\uC778\uD2B8`,
      `${keyword} \uCC3E\uC744 \uB54C \uC0B4\uD3B4\uBCF8 ${productName} \uC815\uBCF4`
    ];
    const body = `\uC548\uB155\uD558\uC138\uC694. \uC624\uB298\uC740 ${productName}\uC744 \uC0C1\uD488\uBA85\uB9CC \uBCF4\uACE0 \uD310\uB2E8\uD558\uC9C0 \uC54A\uACE0 \uACF5\uAC1C\uB41C \uC81C\uD488 \uC815\uBCF4\uB97C \uCC3E\uC544 \uC8FC\uC694 \uD2B9\uC9D5\uC744 \uD655\uC778\uD574\uBD24\uC2B5\uB2C8\uB2E4.

\uC81C\uD488\uC744 \uC54C\uC544\uBCF8 \uB0B4\uC6A9
\uC774\uBC88 \uAE00\uC5D0\uC11C\uB294 \uC0C1\uD488\uBA85\uC5D0 \uC801\uD78C \uD45C\uD604\uB9CC\uC73C\uB85C \uD2B9\uC9D5\uC744 \uB2E8\uC815\uD558\uC9C0 \uC54A\uACE0, \uACF5\uAC1C \uAC80\uC0C9 \uACB0\uACFC\uC640 \uD655\uC778 \uAC00\uB2A5\uD55C \uC0C1\uD488 \uC815\uBCF4\uB97C \uD568\uAED8 \uC0B4\uD3B4\uBD24\uC2B5\uB2C8\uB2E4. \uC870\uC0AC \uACFC\uC815\uC5D0\uC11C \uD655\uC778\uB41C \uB0B4\uC6A9\uC740 \uB2E4\uC74C\uACFC \uAC19\uC2B5\uB2C8\uB2E4.

${evidenceText}

\uC2E4\uC81C\uB85C \uD655\uC778\uB41C \uD2B9\uC9D5
\uC704 \uC790\uB8CC\uC5D0\uC11C \uBC18\uBCF5\uC801\uC73C\uB85C \uD655\uC778\uB418\uB294 \uC81C\uD488 \uAD00\uB828 \uB0B4\uC6A9\uB9CC \uBCF8\uBB38\uC5D0 \uBC18\uC601\uD569\uB2C8\uB2E4. \uBC18\uB300\uB85C \uACF5\uAC1C \uC790\uB8CC\uC5D0\uC11C \uD655\uC778\uB418\uC9C0 \uC54A\uC740 \uC138\uBD80 \uC0AC\uC591\uC774\uB098 \uC131\uB2A5\uC740 \uC784\uC758\uB85C \uCD94\uAC00\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uAC19\uC740 \uC774\uB984\uC758 \uC0C1\uD488\uC774 \uC5EC\uB7EC \uD310\uB9E4\uCC98\uC5D0 \uC788\uC744 \uC218 \uC788\uAE30 \uB54C\uBB38\uC5D0 \uAD6C\uB9E4\uD558\uB824\uB294 \uC0C1\uD488\uC758 \uC0C1\uC138 \uD398\uC774\uC9C0\uC640 \uC635\uC158\uC774 \uB3D9\uC77C\uD55C\uC9C0\uB3C4 \uD568\uAED8 \uD655\uC778\uD558\uB294 \uAC83\uC774 \uC88B\uC2B5\uB2C8\uB2E4.

\uAD6C\uB9E4 \uC804\uC5D0 \uD655\uC778\uD560 \uC810
\uC0C1\uD488\uC744 \uBE44\uAD50\uD560 \uB54C\uB294 \uB0B4\uAC00 \uD544\uC694\uD55C \uAE30\uB2A5\uC774 \uC2E4\uC81C \uAE30\uBCF8 \uAD6C\uC131\uC5D0 \uD3EC\uD568\uB418\uC5B4 \uC788\uB294\uC9C0, \uC120\uD0DD \uC635\uC158\uC778\uC9C0, \uBCC4\uB3C4 \uAD6C\uB9E4\uAC00 \uD544\uC694\uD55C\uC9C0 \uD655\uC778\uD574\uBCF4\uB294 \uAC83\uC774 \uC88B\uC2B5\uB2C8\uB2E4. \uACF5\uAC1C \uAC80\uC0C9 \uC790\uB8CC\uB9CC\uC73C\uB85C \uD655\uC778\uD558\uAE30 \uC5B4\uB824\uC6B4 \uBD80\uBD84\uC740 \uCD94\uCE21\uD558\uC9C0 \uC54A\uACE0 \uC0C1\uD488 \uC0C1\uC138 \uD398\uC774\uC9C0\uC758 \uCD5C\uC2E0 \uC815\uBCF4\uB97C \uAE30\uC900\uC73C\uB85C \uD310\uB2E8\uD558\uB294 \uD3B8\uC774 \uC548\uC804\uD569\uB2C8\uB2E4.

\uC5B4\uB5A4 \uBD84\uC774 \uC0B4\uD3B4\uBCF4\uBA74 \uC88B\uC740\uC9C0
${keyword} \uAD00\uB828 \uC0C1\uD488\uC744 \uCC3E\uACE0 \uC788\uC73C\uBA74\uC11C \uC774\uBC88\uC5D0 \uD655\uC778\uB41C \uD2B9\uC9D5\uC774\uB098 \uC6A9\uB3C4\uAC00 \uBCF8\uC778\uC5D0\uAC8C \uD544\uC694\uD55C\uC9C0 \uBE44\uAD50\uD574\uBCF4\uACE0 \uC2F6\uC740 \uBD84\uC774\uB77C\uBA74 \uC0B4\uD3B4\uBCFC \uB9CC\uD569\uB2C8\uB2E4. \uD2B9\uC815 \uC81C\uD488\uC774 \uBAA8\uB4E0 \uC0AC\uB78C\uC5D0\uAC8C \uC801\uD569\uD558\uB2E4\uACE0 \uB2E8\uC815\uD558\uAE30\uBCF4\uB2E4\uB294 \uC0AC\uC6A9 \uBAA9\uC801\uACFC \uD544\uC694\uD55C \uC870\uAC74\uC744 \uBA3C\uC800 \uC815\uD574\uB450\uACE0 \uBE44\uAD50\uD558\uB294 \uAC83\uC744 \uCD94\uCC9C\uD569\uB2C8\uB2E4.

\uB9C8\uBB34\uB9AC
\uC815\uB9AC\uD558\uBA74 ${productName}\uC740 \uACF5\uAC1C\uB41C \uC790\uB8CC\uB97C \uD655\uC778\uD574 \uC8FC\uC694 \uD2B9\uC9D5\uC744 \uC0B4\uD3B4\uBCF8 \uC0C1\uD488\uC785\uB2C8\uB2E4. \uC0C1\uD488\uBA85\uC5D0 \uC5C6\uB294 \uB0B4\uC6A9\uC744 \uC784\uC758\uB85C \uBD99\uC774\uC9C0 \uC54A\uACE0 \uC870\uC0AC\uC5D0\uC11C \uD655\uC778\uB41C \uB0B4\uC6A9\uB9CC \uC815\uB9AC\uD588\uC73C\uBA70, \uC2E4\uC81C \uAD6C\uB9E4 \uC804\uC5D0\uB294 \uC0C1\uD488 \uC0C1\uC138 \uD398\uC774\uC9C0\uC5D0\uC11C \uCD5C\uC2E0 \uC0AC\uC591\uACFC \uAD6C\uC131, \uC635\uC158\uC744 \uB2E4\uC2DC \uD655\uC778\uD574\uBCF4\uC138\uC694. \uAD00\uC2EC\uC774 \uC788\uB2E4\uBA74 \uC0C1\uD488 \uD655\uC778 \uBC84\uD2BC\uC5D0\uC11C \uD604\uC7AC \uD310\uB9E4 \uC815\uBCF4\uB97C \uC9C1\uC811 \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`;
    return JSON.stringify({ titles, selectedTitle: titles[0], body });
  }
  return JSON.stringify({ keyword: "\uC0DD\uD65C\uC6A9\uD488", source: "fallback" });
}
__name(generateGemini, "generateGemini");
async function fetchTrendSignals() {
  try {
    const response = await fetch("https://trends.google.com/trending/rss?geo=KR", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return [...xml.matchAll(/<title>(.*?)<\/title>/g)].map((match) => match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()).filter((title) => title && title !== "Daily Search Trends").slice(0, 20);
  } catch {
    return [];
  }
}
__name(fetchTrendSignals, "fetchTrendSignals");
async function fetchOpinionSignals(productName) {
  try {
    const query = `${productName} \uD6C4\uAE30 \uC7A5\uC810 \uB2E8\uC810 \uC0AC\uC6A9\uAC10`;
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=6&setlang=ko&cc=kr`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!response.ok) return [];
    const html = await response.text();
    const results = [];
    const liRegex = /<li class="[^\"]*b_algo[^\"]*"[^>]*>([\s\S]*?)<\/li>/g;
    let match;
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
__name(fetchOpinionSignals, "fetchOpinionSignals");
function stripHtml(value) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&#039;/gi, "'").replace(/\s+/g, " ").trim();
}
__name(stripHtml, "stripHtml");
async function researchProduct(productName, productUrl) {
  const sources = [];
  const evidence = [];
  const queries = [
    `"${productName}" \uC0C1\uD488 \uC0C1\uC138 \uD2B9\uC9D5 \uC0AC\uC591`,
    `"${productName}" \uAE30\uB2A5 \uC0AC\uC6A9 \uBC29\uBC95`,
    `"${productName}" \uB9AC\uBDF0 \uC7A5\uC810 \uB2E8\uC810`
  ];
  for (const query of queries) {
    try {
      const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=6&setlang=ko&cc=kr`;
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) continue;
      const html = await response.text();
      const liRegex = /<li class="[^\"]*b_algo[^\"]*"[^>]*>([\s\S]*?)<\/li>/g;
      let match;
      while ((match = liRegex.exec(html)) !== null && sources.length < 12) {
        const block = match[1];
        const title = stripHtml(block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "");
        const snippet = stripHtml(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
        const href = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"/i)?.[1] ?? "";
        const cleanSnippet = `${title} ${snippet}`.trim();
        if (title && cleanSnippet.length >= 20) {
          const sourceUrl = href.startsWith("http") ? href : "";
          const productTokens2 = productName.toLowerCase().split(/\s+/).filter((token) => token.length >= 2);
          const searchable = cleanSnippet.toLowerCase();
          const relevant = productTokens2.length === 0 || productTokens2.some((token) => searchable.includes(token));
          if (relevant && !sources.some((item) => item.title === title && item.snippet === snippet)) {
            sources.push({ title, url: sourceUrl, snippet: cleanSnippet.slice(0, 700) });
          }
        }
      }
      if (!sources.length) {
        try {
          const rssUrl = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
          const rssResponse = await fetch(rssUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
          if (rssResponse.ok) {
            const rss = await rssResponse.text();
            for (const item of rss.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
              if (sources.length >= 12) break;
              const block = item[1];
              const title = stripHtml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
              const href = stripHtml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
              const description = stripHtml(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "");
              const snippet = `${title} ${description}`.trim();
              if (title && snippet.length >= 20) {
                const productTokens2 = productName.toLowerCase().split(/\s+/).filter((token) => token.length >= 2);
                const searchable = snippet.toLowerCase();
                const relevant = productTokens2.length === 0 || productTokens2.some((token) => searchable.includes(token));
                if (relevant) {
                  sources.push({ title, url: href.startsWith("http") ? href : "", snippet: snippet.slice(0, 700) });
                }
              }
            }
          }
        } catch {
        }
      }
    } catch {
    }
  }
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
    }
  }
  const productTokens = productName.toLowerCase().split(/\s+/).filter((token) => token.length >= 2);
  for (const source of sources.slice(0, 8)) {
    const text = `${source.title} ${source.snippet}`;
    const searchable = text.toLowerCase();
    const relevant = productTokens.length === 0 || productTokens.some((token) => searchable.includes(token));
    if (relevant) evidence.push(text.slice(0, 700));
  }
  return {
    productName,
    sources: sources.slice(0, 12),
    evidence: [...new Set(evidence)].slice(0, 8),
    researchedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(researchProduct, "researchProduct");
async function getDailyKeyword(env, date = /* @__PURE__ */ new Date()) {
  const dateKey = date.toISOString().slice(0, 10);
  const cached = await env.CONTENT_STORE.get(TREND_CACHE_KEY, "json");
  if (cached?.date === dateKey && cached.keyword) return cached;
  const trendSignals = await fetchTrendSignals();
  const signalText = trendSignals.length ? trendSignals.join("\n") : "\uC678\uBD80 \uD2B8\uB80C\uB4DC \uC2E0\uD638 \uC5C6\uC74C";
  let keyword = "";
  let source = "fallback";
  try {
    const prompt = `\uC624\uB298\uC740 ${dateKey} \uD55C\uAD6D\uC774\uB2E4. \uC544\uB798\uB294 Google Trends \uD55C\uAD6D \uAE09\uC0C1\uC2B9 \uAC80\uC0C9\uC5B4 \uC6D0\uBB38\uC774\uB2E4.
${signalText}

\uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uBE14\uB85C\uADF8\uC5D0\uC11C \uC624\uB298 \uB2E4\uB8F0 '\uAD6C\uCCB4\uC801\uC778 \uC0C1\uD488 \uAC80\uC0C9\uC5B4' \uD558\uB098\uB97C \uACE8\uB77C\uB77C.
\uC870\uAC74:
1) \uC2E4\uC81C \uC0C1\uD488\uC73C\uB85C \uC5F0\uACB0\uB420 \uC218 \uC788\uC5B4\uC57C \uD55C\uB2E4.
2) \uB274\uC2A4/\uC778\uBB3C/\uC0AC\uAC74 \uC790\uCCB4\uAC00 \uC544\uB2C8\uB77C \uC1FC\uD551 \uC758\uB3C4\uB85C \uBC14\uAFC0 \uC218 \uC788\uB294 \uC8FC\uC81C\uC5EC\uC57C \uD55C\uB2E4.
3) \uC815\uD655\uD55C \uAC80\uC0C9\uB7C9 \uC22B\uC790\uB97C \uB9CC\uB4E4\uC9C0 \uC54A\uB294\uB2E4.
4) \uB108\uBB34 \uB113\uC740 \uD45C\uD604\uBCF4\uB2E4 \uAD6C\uCCB4\uC801\uC778 \uC0C1\uD488\uAD70\uC744 \uC6B0\uC120\uD55C\uB2E4.
5) \uACC4\uC808/\uB0A0\uC528/\uBA85\uC808 \uC218\uC694\uB3C4 \uACE0\uB824\uD55C\uB2E4.
JSON\uB9CC \uBC18\uD658: {"keyword":"\uC0C1\uD488 \uAC80\uC0C9\uC5B4","source":"trend \uB610\uB294 seasonal","reason":"\uC9E7\uC740 \uC120\uC815 \uC774\uC720"}`;
    const parsed = JSON.parse(cleanJson(await generateGemini(env, prompt, 512)));
    if (typeof parsed.keyword === "string" && parsed.keyword.trim()) {
      keyword = parsed.keyword.trim();
      source = parsed.source === "trend" ? "google-trends" : "seasonal";
    }
  } catch {
  }
  if (!keyword) {
    const dayNumber = Math.floor(date.getTime() / 864e5);
    keyword = FALLBACK_KEYWORDS[(dayNumber % FALLBACK_KEYWORDS.length + FALLBACK_KEYWORDS.length) % FALLBACK_KEYWORDS.length];
  }
  const result = { date: dateKey, keyword, source };
  await env.CONTENT_STORE.put(TREND_CACHE_KEY, JSON.stringify(result), { expirationTtl: 60 * 60 * 30 });
  return result;
}
__name(getDailyKeyword, "getDailyKeyword");
function cleanJson(value) {
  return value.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
}
__name(cleanJson, "cleanJson");
function addPriceScores(products) {
  const prices = products.map((p) => p.productPrice).filter((p) => typeof p === "number" && p > 0).sort((a, b) => a - b);
  if (!prices.length) return products.map((p) => ({ ...p, priceScore: 50, pricePosition: null }));
  return products.map((product) => {
    if (!product.productPrice) return { ...product, priceScore: 50, pricePosition: null };
    const index = prices.findIndex((price) => price >= product.productPrice);
    const percentile = prices.length === 1 ? 0.5 : index / (prices.length - 1);
    return {
      ...product,
      priceScore: Math.round((1 - percentile) * 100),
      pricePosition: index + 1
    };
  });
}
__name(addPriceScores, "addPriceScores");
function scoreProducts(products) {
  const scored = addPriceScores(products);
  const maxRank = Math.max(...scored.map((p) => p.rank || 10), 10);
  return scored.map((product) => {
    const rankScore = product.rank ? Math.max(0, 100 - (product.rank - 1) / Math.max(1, maxRank - 1) * 100) : 50;
    const shippingScore = product.isRocket && product.isFreeShipping ? 100 : product.isRocket || product.isFreeShipping ? 70 : 40;
    const totalScore = Math.round(rankScore * 0.35 + product.priceScore * 0.3 + shippingScore * 0.1 + 25);
    return { ...product, rankScore: Math.round(rankScore), shippingScore, totalScore };
  }).sort((a, b) => b.totalScore - a.totalScore);
}
__name(scoreProducts, "scoreProducts");
async function recommendProduct(env, keyword, products, usedProductIds) {
  const available = scoreProducts(products.filter((product) => !usedProductIds.includes(String(product.productId))));
  if (!available.length) throw new Error("\uC774\uBC88 \uAC80\uC0C9 \uACB0\uACFC\uC758 \uC0C1\uD488\uC774 \uBAA8\uB450 \uACFC\uAC70\uC5D0 \uD64D\uBCF4\uB41C \uC0C1\uD488\uC785\uB2C8\uB2E4.");
  const candidates = available.slice(0, 10).map((product) => ({
    productId: product.productId,
    productName: product.productName,
    price: product.productPrice,
    searchRank: product.rank,
    priceScore: product.priceScore,
    totalScore: product.totalScore,
    isRocket: product.isRocket,
    isFreeShipping: product.isFreeShipping
  }));
  const opinionSignals = await fetchOpinionSignals(keyword);
  const opinionText = opinionSignals.length ? opinionSignals.join("\n") : "\uACF5\uAC1C \uC758\uACAC \uC2E0\uD638\uB97C \uCDA9\uBD84\uD788 \uCC3E\uC9C0 \uBABB\uD568";
  const prompt = `\uB108\uB294 \uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uCF58\uD150\uCE20\uC6A9 \uC0C1\uD488 \uC120\uC815 \uB2F4\uB2F9\uC790\uB2E4.
\uAC80\uC0C9 \uC8FC\uC81C: ${keyword}
\uC0C1\uD488 \uD6C4\uBCF4:
${JSON.stringify(candidates, null, 2)}

\uACF5\uAC1C \uC6F9 \uAC80\uC0C9\uC5D0\uC11C \uD655\uC778\uD55C '\uCC38\uACE0\uC6A9 \uC0AC\uC6A9\uC790 \uC758\uACAC \uC2E0\uD638'\uC785\uB2C8\uB2E4. \uD2B9\uC815 \uD6C4\uBCF4 \uC0C1\uD488\uC758 \uD655\uC815 \uB9AC\uBDF0\uB85C \uAC04\uC8FC\uD558\uC9C0 \uB9D0\uACE0, \uC0AC\uB78C\uB4E4\uC774 \uD574\uB2F9 \uC0C1\uD488\uAD70\uC5D0\uC11C \uC911\uC694\uD558\uAC8C \uBCF4\uB294 \uC694\uC18C\uB97C \uD30C\uC545\uD558\uB294 \uB370\uB9CC \uC0AC\uC6A9\uD558\uC138\uC694.
${opinionText}

\uC120\uC815 \uADDC\uCE59:
1. \uAC80\uC0C9 \uC8FC\uC81C\uC640 \uC0C1\uD488\uBA85\uC774 \uAC00\uC7A5 \uC798 \uB9DE\uB294 \uD6C4\uBCF4\uB97C \uC6B0\uC120\uD55C\uB2E4.
2. \uAC80\uC0C9 \uACB0\uACFC\uC758 \uC21C\uC704\uB294 \uC2E4\uC81C \uAC80\uC0C9 \uACB0\uACFC\uC5D0\uC11C \uB098\uC628 \uAC12\uC774\uBBC0\uB85C \uCC38\uACE0\uD55C\uB2E4.
3. \uAC00\uACA9\uC740 \uD604\uC7AC \uD6C4\uBCF4\uB4E4 \uC0AC\uC774\uC758 \uC0C1\uB300\uC801 \uAC00\uACA9 \uACBD\uC7C1\uB825\uC73C\uB85C\uB9CC \uCC38\uACE0\uD55C\uB2E4. \uBE44\uC2F8\uB2E4\uACE0 \uBB34\uC870\uAC74 \uD0C8\uB77D\uC2DC\uD0A4\uC9C0 \uC54A\uB294\uB2E4.
4. \uAC80\uC0C9 \uC758\uB3C4\uAC00 \uAC15\uD55C \uC0C1\uD488\uC774 \uB2E4\uC18C \uBE44\uC2F8\uB354\uB77C\uB3C4 \uAD00\uB828\uC131\uC774 \uD6E8\uC52C \uB192\uC73C\uBA74 \uC120\uD0DD\uD560 \uC218 \uC788\uB2E4.
5. \uBC30\uC1A1 \uC870\uAC74\uC740 \uBCF4\uC870 \uAE30\uC900\uC73C\uB85C \uC0AC\uC6A9\uD55C\uB2E4.
6. \uACFC\uAC70 \uD64D\uBCF4 \uC0C1\uD488\uC740 \uC774\uBBF8 \uC81C\uC678\uB418\uC5B4 \uC788\uB2E4.
7. API\uC5D0 \uC5C6\uB294 \uD310\uB9E4\uB7C9, \uB9AC\uBDF0 \uC218, \uD3C9\uC810, \uD560\uC778\uC728, \uC2E4\uC81C \uD310\uB9E4 \uC21C\uC704\uB294 \uB9CC\uB4E4\uC9C0 \uC54A\uB294\uB2E4.
8. \uBC18\uB4DC\uC2DC \uD6C4\uBCF4 \uBAA9\uB85D\uC5D0 \uC874\uC7AC\uD558\uB294 productId \uD558\uB098\uB9CC \uC120\uD0DD\uD55C\uB2E4.
JSON\uB9CC \uBC18\uD658: {"productId":"\uC120\uD0DD\uD55C\uC0C1\uD488ID","reason":"\uC120\uC815 \uC774\uC720"}`;
  const parsed = JSON.parse(cleanJson(await generateGemini(env, prompt, 1200)));
  const selected = available.find((product) => String(product.productId) === String(parsed.productId));
  if (!selected) throw new Error("AI\uAC00 \uC720\uD6A8\uD55C \uC0C1\uD488\uC744 \uC120\uD0DD\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  return {
    product: selected,
    reason: parsed.reason ?? "\uAC80\uC0C9 \uAD00\uB828\uC131\uACFC \uAC00\uACA9 \uACBD\uC7C1\uB825\uC744 \uD568\uAED8 \uACE0\uB824\uD574 \uC120\uC815\uD588\uC2B5\uB2C8\uB2E4.",
    priceScore: selected.priceScore,
    searchRank: selected.rank
  };
}
__name(recommendProduct, "recommendProduct");
async function fetchRelatedImages(productName, officialImage) {
  const images = [];
  if (officialImage) images.push(officialImage);
  const queries = [
    `"${productName}" \uC0C1\uD488`,
    `"${productName}" \uC0AC\uC6A9 \uBAA8\uC2B5`
  ];
  for (const query of queries) {
    if (images.length >= 3) break;
    try {
      const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&tsc=ImageBasicHover&setlang=ko&cc=kr`;
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) continue;
      const html = await response.text();
      const matches = [...html.matchAll(/"murl":"(.*?)"/g)];
      for (const match of matches) {
        if (images.length >= 3) break;
        const candidate = decodeBingUrl(match[1]);
        if (!candidate || !/^https?:\/\//i.test(candidate)) continue;
        if (images.some((item) => item === candidate)) continue;
        if (/logo|icon|sprite|avatar|favicon|microsoft|windows/i.test(candidate)) continue;
        const matchIndex = html.indexOf(match[0]);
        const context = html.slice(Math.max(0, matchIndex - 1200), Math.min(html.length, matchIndex + 1200)).toLowerCase();
        const productTokens = productName.toLowerCase().split(/\s+/).filter((token) => token.length >= 2);
        const relevant = productTokens.length === 0 || productTokens.some((token) => context.includes(token));
        if (!relevant) continue;
        if (await isImageUrl(candidate)) images.push(candidate);
      }
    } catch {
    }
  }
  return images.slice(0, 3);
}
__name(fetchRelatedImages, "fetchRelatedImages");
function decodeBingUrl(value) {
  try {
    return JSON.parse(`"${value.replaceAll('"', '\\"')}"`);
  } catch {
    return value.replaceAll("\\/", "/").replaceAll("\\u0026", "&");
  }
}
__name(decodeBingUrl, "decodeBingUrl");
async function isImageUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4e3);
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);
    const contentType = response.headers.get("content-type") ?? "";
    return response.ok && contentType.startsWith("image/");
  } catch {
    return false;
  }
}
__name(isImageUrl, "isImageUrl");
async function generateBlog(env, product, keyword, usedTitles, opinionSignals, imageUrls, research, qualityFeedback = []) {
  const opinionText = opinionSignals.length ? opinionSignals.join("\n") : "\uCDA9\uBD84\uD55C \uACF5\uAC1C \uC758\uACAC \uC2E0\uD638 \uC5C6\uC74C";
  const prompt = `\uB108\uB294 \uD55C\uAD6D \uB124\uC774\uBC84 \uBE14\uB85C\uADF8\uC5D0 \uBC14\uB85C \uAC8C\uC2DC\uD560 \uC218 \uC788\uB294 \uC0C1\uD488 \uC815\uBCF4 \uAE00\uC744 \uC4F0\uB294 \uC804\uBB38 \uC5D0\uB514\uD130\uB2E4.

[\uD655\uC778\uB41C \uC0C1\uD488 \uC815\uBCF4]
\uAC80\uC0C9 \uC8FC\uC81C: ${keyword}
\uC0C1\uD488\uBA85: ${product.productName}
\uD604\uC7AC \uAC80\uC0C9 \uACB0\uACFC \uAC00\uACA9: ${product.productPrice ?? "\uD655\uC778 \uBD88\uAC00"}\uC6D0
\uAC80\uC0C9 \uACB0\uACFC \uC21C\uC704: ${product.rank ?? "\uD655\uC778 \uBD88\uAC00"}
\uB85C\uCF13\uBC30\uC1A1: ${product.isRocket ? "\uC608" : "\uC544\uB2C8\uC624"}
\uBB34\uB8CC\uBC30\uC1A1: ${product.isFreeShipping ? "\uC608" : "\uC544\uB2C8\uC624"}

[\uD329\uD2B8\uCCB4\uD06C\uC6A9 \uC81C\uD488 \uC870\uC0AC \uACB0\uACFC]
${JSON.stringify(research, null, 2)}

[\uCC38\uACE0\uC6A9 \uC0AC\uC6A9\uC790 \uC758\uACAC \uC2E0\uD638]
${opinionText}

[\uC791\uC131 \uBAA9\uD45C]
- \uAD11\uACE0 \uBB38\uAD6C\uB97C \uB298\uC5B4\uB193\uB294 \uAE00\uC774 \uC544\uB2C8\uB77C, \uC0AC\uB78C\uC774 \uC2E4\uC81C\uB85C \uAD6C\uB9E4\uB97C \uACE0\uBBFC\uD560 \uB54C \uB3C4\uC6C0\uC774 \uB418\uB294 \uAE00\uC744 \uB9CC\uB4E0\uB2E4.
- \uC0C1\uD488\uBA85\uB9CC \uBCF4\uACE0 \uD2B9\uC9D5\uC744 \uB9CC\uB4E4\uC9C0 \uC54A\uB294\uB2E4. \uBC18\uB4DC\uC2DC [\uD329\uD2B8\uCCB4\uD06C\uC6A9 \uC81C\uD488 \uC870\uC0AC \uACB0\uACFC]\uC758 \uACF5\uAC1C \uC790\uB8CC\uC5D0\uC11C \uD655\uC778\uB418\uB294 \uD2B9\uC9D5\uB9CC \uC124\uBA85\uD55C\uB2E4.
- \uC870\uC0AC \uC790\uB8CC\uC5D0\uC11C \uD655\uC778\uB418\uC9C0 \uC54A\uB294 \uAE30\uB2A5/\uC18C\uC7AC/\uD06C\uAE30/\uAD6C\uC131\uD488/\uC131\uB2A5\uC740 \uC808\uB300 \uB9CC\uB4E4\uC5B4\uB0B4\uC9C0 \uC54A\uB294\uB2E4.
- \uACF5\uAC1C \uAC80\uC0C9 \uC790\uB8CC\uB294 \uC81C\uD488 \uD2B9\uC9D5 \uD655\uC778\uC6A9 \uADFC\uAC70\uB85C \uC0AC\uC6A9\uD558\uB418, \uC2E4\uC81C \uAD6C\uB9E4\uC790 \uD6C4\uAE30\uC778\uC9C0 \uD655\uC778\uB418\uC9C0 \uC54A\uC740 \uB0B4\uC6A9\uC740 \uD6C4\uAE30\uCC98\uB7FC \uC4F0\uC9C0 \uC54A\uB294\uB2E4.
- \uC9C1\uC811 \uC0AC\uC6A9\uD55C \uAC83\uCC98\uB7FC '\uC368\uBCF4\uB2C8', '\uC0AC\uC6A9\uD574\uBCF4\uB2C8', '\uB0B4\uB3C8\uB0B4\uC0B0' \uAC19\uC740 \uD45C\uD604\uC744 \uC4F0\uC9C0 \uC54A\uB294\uB2E4.
- \uAC00\uACA9\uC740 \uD604\uC7AC API \uAC80\uC0C9 \uACB0\uACFC\uC758 \uC2A4\uB0C5\uC0F7\uC77C \uBFD0\uC774\uBBC0\uB85C \uBCF8\uBB38\uC5D0\uC11C \uAC00\uACA9\uC744 \uACE0\uC815\uAC12\uCC98\uB7FC \uAC15\uC870\uD558\uC9C0 \uC54A\uB294\uB2E4. \uD560\uC778/\uCD5C\uC800\uAC00\uB97C \uC8FC\uC7A5\uD558\uC9C0 \uC54A\uB294\uB2E4.
- \uAC00\uC131\uBE44\uB77C\uB294 \uB2E8\uC5B4\uB97C \uC4F0\uB354\uB77C\uB3C4 \uADFC\uAC70 \uC5C6\uB294 \uB2E8\uC815 \uB300\uC2E0 '\uAC00\uACA9\uACFC \uC6A9\uB3C4\uB97C \uD568\uAED8 \uBE44\uAD50\uD574\uBCF4\uB294 \uAC83\uC774 \uC88B\uB2E4' \uC815\uB3C4\uB85C \uD45C\uD604\uD55C\uB2E4.
- \uC7A5\uC810\uB9CC \uB098\uC5F4\uD558\uC9C0 \uB9D0\uACE0 \uAD6C\uB9E4 \uC804\uC5D0 \uD655\uC778\uD574\uC57C \uD560 \uBD80\uBD84\uB3C4 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uD3EC\uD568\uD55C\uB2E4.
- \uAC19\uC740 \uBB38\uC7A5 \uAD6C\uC870\uC640 \uAC19\uC740 \uD45C\uD604\uC744 \uBC18\uBCF5\uD558\uC9C0 \uC54A\uB294\uB2E4.
- \uC18C\uC81C\uBAA9\uC744 \uC801\uC808\uD788 \uC0AC\uC6A9\uD558\uACE0 \uBB38\uB2E8\uC744 \uC9E7\uAC8C \uB098\uB220 \uBAA8\uBC14\uC77C\uC5D0\uC11C \uC77D\uAE30 \uD3B8\uD558\uAC8C \uD55C\uB2E4.
- \uC5B5\uC9C0\uB85C \uAE00\uC790 \uC218\uB97C \uB298\uB9AC\uC9C0 \uB9D0\uACE0 \uC815\uBCF4 \uBC00\uB3C4\uAC00 \uB192\uC740 \uC57D 1,800~2,500\uC790 \uBD84\uB7C9\uC73C\uB85C \uC791\uC131\uD55C\uB2E4.
- \uACB0\uB860\uC5D0\uC11C\uB294 \uD2B9\uC815 \uAD6C\uB9E4\uB97C \uAC15\uC694\uD558\uC9C0 \uC54A\uACE0 \uC5B4\uB5A4 \uC0AC\uB78C\uC5D0\uAC8C \uC798 \uB9DE\uC744\uC9C0 \uC815\uB9AC\uD55C\uB2E4.
- \uB9C8\uC9C0\uB9C9\uC5D0\uB294 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC0C1\uD488 \uD655\uC778\uC744 \uC548\uB0B4\uD558\uB418 \uACFC\uC7A5\uB41C \uAD6C\uB9E4 \uC720\uB3C4 \uBB38\uAD6C\uB294 \uC4F0\uC9C0 \uC54A\uB294\uB2E4.
- \uC81C\uBAA9\uC740 \uAC80\uC0C9 \uC758\uB3C4\uB97C \uB2F4\uB418 \uB09A\uC2DC\uC131 \uD45C\uD604\uACFC \uACFC\uC7A5\uC744 \uD53C\uD55C\uB2E4.
- \uC544\uB798 \uACFC\uAC70 \uC81C\uBAA9\uACFC \uBB38\uC7A5 \uAD6C\uC870\uAC00 \uACB9\uCE58\uC9C0 \uC54A\uB3C4\uB85D \uD55C\uB2E4.
${JSON.stringify(usedTitles.slice(-60))}

[\uC774\uBBF8\uC9C0]
\uBCF8\uBB38\uC5D0 \uC790\uB3D9\uC73C\uB85C \uBC30\uCE58\uD560 \uC774\uBBF8\uC9C0\uAC00 ${imageUrls.length}\uC7A5 \uC900\uBE44\uB418\uC5B4 \uC788\uB2E4. \uC774\uBBF8\uC9C0\uC758 \uAD6C\uCCB4\uC801\uC778 \uAE30\uB2A5\uC744 \uC0C1\uC0C1\uD558\uC9C0 \uB9D0\uACE0, \uC774\uBBF8\uC9C0\uC640 \uBCF8\uBB38\uC758 \uC124\uBA85\uC774 \uC11C\uB85C \uBAA8\uC21C\uB418\uC9C0 \uC54A\uAC8C \uC791\uC131\uD55C\uB2E4.

[\uC774\uC804 \uD488\uC9C8 \uAC80\uC0AC\uC5D0\uC11C \uC218\uC815\uC774 \uD544\uC694\uD588\uB358 \uBD80\uBD84]
${qualityFeedback.length ? qualityFeedback.join("\n") : "\uCCAB \uC0DD\uC131\uC785\uB2C8\uB2E4. \uCC98\uC74C\uBD80\uD130 \uC644\uC131\uB3C4 \uB192\uC740 \uACB0\uACFC\uB97C \uC791\uC131\uD558\uC138\uC694."}
\uC704 \uC9C0\uC801\uC0AC\uD56D\uC744 \uBC18\uB4DC\uC2DC \uC218\uC815\uD558\uC5EC 100\uC810 \uD488\uC9C8\uC744 \uBAA9\uD45C\uB85C \uB2E4\uC2DC \uC791\uC131\uD55C\uB2E4.

JSON\uB9CC \uBC18\uD658:
{
  "titles":["\uC81C\uBAA91","\uC81C\uBAA92","\uC81C\uBAA93","\uC81C\uBAA94","\uC81C\uBAA95"],
  "selectedTitle":"\uB300\uD45C \uC81C\uBAA9",
  "body":"\uBCF8\uBB38 \uC804\uCCB4"
}`;
  const parsed = JSON.parse(cleanJson(await generateGemini(env, prompt, 7e3)));
  if (!Array.isArray(parsed.titles) || parsed.titles.length !== 5 || !parsed.selectedTitle || !parsed.body) {
    throw new Error("Gemini\uAC00 \uC62C\uBC14\uB978 \uBE14\uB85C\uADF8 \uACB0\uACFC\uB97C \uBC18\uD658\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  }
  return {
    disclosure: PARTNERS_DISCLOSURE,
    titles: parsed.titles,
    selectedTitle: parsed.selectedTitle,
    body: parsed.body,
    imageUrls,
    partnerUrl: product.productUrl
  };
}
__name(generateBlog, "generateBlog");
async function getHistory(env) {
  const products = await env.CONTENT_STORE.get(USED_PRODUCTS_KEY, "json");
  const titles = await env.CONTENT_STORE.get(USED_TITLES_KEY, "json");
  return { productIds: products ?? [], titles: titles ?? [] };
}
__name(getHistory, "getHistory");
async function saveContent(env, content) {
  const now = /* @__PURE__ */ new Date();
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
__name(saveContent, "saveContent");
async function createContent(env, keyword) {
  const products = await searchProducts(env, keyword);
  if (!products.length) throw new Error("\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const history = await getHistory(env);
  const recommendation = await recommendProduct(env, keyword, products, history.productIds);
  const research = await researchProduct(recommendation.product.productName, recommendation.product.productUrl);
  const opinionSignals = await fetchOpinionSignals(recommendation.product.productName);
  const imageUrls = await fetchRelatedImages(recommendation.product.productName, recommendation.product.productImage);
  let blog2 = null;
  let qualityCheck = null;
  let qualityFeedback = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    blog2 = await generateBlog(
      env,
      recommendation.product,
      keyword,
      history.titles,
      opinionSignals,
      imageUrls,
      research,
      qualityFeedback
    );
    qualityCheck = validateContentQuality({
      keyword,
      productName: recommendation.product.productName,
      titles: blog2.titles,
      selectedTitle: blog2.selectedTitle,
      body: blog2.body
    });
    if (qualityCheck.ok && qualityCheck.score >= 90) break;
    qualityFeedback = qualityCheck.reasons.length ? qualityCheck.reasons : ["\uD488\uC9C8 \uC810\uC218\uB97C 90\uC810 \uC774\uC0C1\uC73C\uB85C \uB9DE\uCD94\uACE0 \uBAA8\uB4E0 \uC81C\uBAA9\uACFC \uBCF8\uBB38\uC758 \uC644\uC131\uB3C4\uB97C \uB2E4\uC2DC \uB192\uC774\uC138\uC694."];
    if (attempt === 3) {
      throw new Error(`\uD488\uC9C8 \uAC80\uC0AC 90\uC810 \uBBF8\uB2EC\uB85C \uC800\uC7A5\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uD604\uC7AC \uC810\uC218: ${qualityCheck.score}\uC810 / ${qualityFeedback.join(" \xB7 ")}`);
    }
  }
  const factCheck = factCheckContent({
    product: recommendation.product,
    keyword,
    body: blog2.body,
    selectedTitle: blog2.selectedTitle,
    research
  });
  if (!factCheck.ok) {
    throw new Error(`\uD329\uD2B8\uCCB4\uD06C \uC2E4\uD328\uB85C \uAC8C\uC2DC\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4: ${factCheck.reasons.join(" \xB7 ")}`);
  }
  const content = {
    keyword,
    recommendation,
    blog: blog2,
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
      metrics: qualityCheck.metrics
    }
  };
  const storageKey = await saveContent(env, content);
  return { ...content, storageKey };
}
__name(createContent, "createContent");
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
__name(escapeHtml, "escapeHtml");
async function renderDashboard(env) {
  const latest = await env.CONTENT_STORE.get("latest", "json");
  const lastRun = await env.CONTENT_STORE.get("last-run", "json");
  const trend = await env.CONTENT_STORE.get(TREND_CACHE_KEY, "json");
  const product = latest?.recommendation?.product;
  const blog2 = latest?.blog;
  const imageGallery = blog2?.imageUrls?.length ? `<div class="gallery">${blog2.imageUrls.map((url, index) => `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(product?.productName ?? "\uC0C1\uD488 \uC774\uBBF8\uC9C0")} ${index + 1}" loading="lazy"><figcaption>\uC0C1\uD488 \uAD00\uB828 \uC774\uBBF8\uC9C0 ${index + 1}</figcaption></figure>`).join("")}</div>` : "";
  const contentSection = latest && blog2 ? `
    <section class="card">
      <div class="label">\uC120\uC815 \uC0C1\uD488</div>
      <div class="product">
        ${product?.productImage ? `<img src="${escapeHtml(product.productImage)}" alt="\uC0C1\uD488 \uC774\uBBF8\uC9C0">` : ""}
        <div>
          <h2>${escapeHtml(product?.productName)}</h2>
          <p>${escapeHtml(latest.keyword)} \xB7 ${escapeHtml(latest.savedAt)}</p>
          <p class="meta">\uAC80\uC0C9 \uC21C\uC704 ${escapeHtml(latest.quality?.searchRank ?? "-")} \xB7 \uAC00\uACA9 \uACBD\uC7C1\uB825 \uC810\uC218 ${escapeHtml(latest.quality?.priceScore ?? "-")} \xB7 \uC774\uBBF8\uC9C0 ${escapeHtml(latest.quality?.imageCount ?? 0)}\uC7A5</p>
          ${product?.productUrl ? `<a class="button" href="${escapeHtml(product.productUrl)}" target="_blank" rel="noopener noreferrer">\uCFE0\uD321 \uC0C1\uD488 \uBCF4\uAE30</a>` : ""}
        </div>
      </div>
    </section>

    <section class="card">
      <div class="label">\uB300\uD45C \uC81C\uBAA9</div>
      <h1>${escapeHtml(blog2.selectedTitle)}</h1>
      <div class="label">\uC81C\uBAA9 \uD6C4\uBCF4 5\uAC1C</div>
      <ol>${blog2.titles.map((title) => `<li>${escapeHtml(title)}</li>`).join("")}</ol>
    </section>

    <section class="card">
      <div class="label">\uB124\uC774\uBC84 \uBE14\uB85C\uADF8\uC6A9 \uC774\uBBF8\uC9C0</div>
      ${imageGallery || `<p>\uAD00\uB828 \uC774\uBBF8\uC9C0\uB97C \uCDA9\uBD84\uD788 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uD655\uC778\uB41C \uC0C1\uD488 \uC774\uBBF8\uC9C0\uB9CC \uC0AC\uC6A9\uD569\uB2C8\uB2E4.</p>`}
    </section>

    <section class="card">
      <div class="label">\uB124\uC774\uBC84 \uBE14\uB85C\uADF8\uC6A9 \uBCF8\uBB38</div>
      <div class="disclosure">${escapeHtml(blog2.disclosure)}</div>
      <div class="body">${escapeHtml(blog2.body)}</div>
      ${blog2.partnerUrl ? `<a class="link" href="${escapeHtml(blog2.partnerUrl)}" target="_blank" rel="noopener noreferrer">\uC0C1\uD488 \uB9C1\uD06C</a>` : ""}
    </section>` : `<section class="card empty">\uC544\uC9C1 \uC790\uB3D9 \uC0DD\uC131\uB41C \uAE00\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.<br>\uCCAB \uC790\uB3D9 \uC2E4\uD589 \uD6C4 \uC774 \uD654\uBA74\uC5D0 \uACB0\uACFC\uAC00 \uD45C\uC2DC\uB429\uB2C8\uB2E4.</section>`;
  const runSection = lastRun ? `<section class="card status"><div class="label">\uC790\uB3D9 \uC2E4\uD589 \uC0C1\uD0DC</div><strong>${lastRun.status === "success" ? "\uC815\uC0C1 \uC644\uB8CC" : "\uC2E4\uD589 \uC2E4\uD328"}</strong><p>${escapeHtml(lastRun.finishedAt ?? "")}</p>${lastRun.error ? `<pre>${escapeHtml(lastRun.error)}</pre>` : ""}</section>` : "";
  const trendSection = trend ? `<section class="card"><div class="label">\uC624\uB298\uC758 \uCF58\uD150\uCE20 \uC120\uC815 \uAE30\uC900</div><strong>${escapeHtml(trend.keyword)}</strong><p>${escapeHtml(trend.source)} \uC2E0\uD638 \xB7 \uACFC\uAC70 \uD64D\uBCF4 \uC0C1\uD488 \uC790\uB3D9 \uC81C\uC678 \xB7 \uC0C1\uB300 \uAC00\uACA9 \uACBD\uC7C1\uB825 \uBC18\uC601 \xB7 \uACF5\uAC1C \uC758\uACAC \uC2E0\uD638 \uCC38\uACE0 \xB7 \uC81C\uBAA9 \uC911\uBCF5 \uCD5C\uC18C\uD654</p></section>` : "";
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>\uCFE0\uD321\uD30C\uD2B8\uB108\uC2A4 \uC790\uB3D9 \uCF58\uD150\uCE20</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#202124;font-family:Arial,"Noto Sans KR",sans-serif;line-height:1.65}.wrap{max-width:900px;margin:0 auto;padding:32px 18px 60px}header{margin-bottom:24px}header h1{margin:0 0 6px;font-size:28px}header p{margin:0;color:#6b7280}.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;margin:16px 0;box-shadow:0 3px 12px rgba(0,0,0,.04)}.label{font-size:12px;font-weight:700;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em}.product{display:flex;gap:20px;align-items:center}.product>img{width:150px;height:150px;object-fit:contain;border:1px solid #eee;border-radius:12px;background:#fff}.product h2{margin:0 0 6px;font-size:20px}.product p{margin:0 0 8px;color:#6b7280;font-size:13px}.meta{font-size:12px!important;color:#374151!important}.button{display:inline-block;padding:9px 14px;border-radius:9px;background:#111827;color:#fff;text-decoration:none;font-size:13px}h1{font-size:25px;margin:4px 0 22px}ol{margin:8px 0 0;padding-left:22px}li{margin:5px 0}.disclosure{padding:12px;background:#f8fafc;border-radius:10px;font-size:13px;color:#4b5563;margin-bottom:18px}.body{white-space:pre-wrap;font-size:16px}.link{display:inline-block;margin-top:20px;font-weight:700;text-decoration:none}.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.gallery figure{margin:0}.gallery img{display:block;width:100%;height:220px;object-fit:contain;border:1px solid #e5e7eb;border-radius:12px;background:#fff}.gallery figcaption{font-size:12px;color:#6b7280;margin-top:5px}.empty{text-align:center;color:#6b7280;padding:50px 20px}.status strong{font-size:18px}.status p{margin:4px 0;color:#6b7280;font-size:13px}.status pre{white-space:pre-wrap;background:#fff1f2;padding:12px;border-radius:8px;color:#991b1b}@media(max-width:600px){.wrap{padding:20px 12px 40px}.product{align-items:flex-start}.product>img{width:105px;height:105px}.card{padding:18px}h1{font-size:21px}.body{font-size:15px}.gallery{grid-template-columns:1fr}.gallery img{height:260px}}
</style></head><body><main class="wrap"><header><h1>\uCFE0\uD321\uD30C\uD2B8\uB108\uC2A4 \uC790\uB3D9 \uCF58\uD150\uCE20</h1><p>\uB2F9\uC77C \uD2B8\uB80C\uB4DC\uC640 \uACFC\uAC70 \uD64D\uBCF4 \uC774\uB825, \uAC00\uACA9 \uACBD\uC7C1\uB825, \uACF5\uAC1C \uC758\uACAC \uC2E0\uD638\uB97C \uBC18\uC601\uD574 \uAE00\uC758 \uC644\uC131\uB3C4\uB97C \uB192\uC774\uB294 \uC790\uB3D9 \uCF58\uD150\uCE20 \uC2DC\uC2A4\uD15C\uC785\uB2C8\uB2E4.</p></header>${trendSection}${runSection}${contentSection}</main></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
__name(renderDashboard, "renderDashboard");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") return renderDashboard(env);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "coupang-partners-automation", message: "Cloudflare Worker \uC815\uC0C1 \uC791\uB3D9 \uC911" });
    if (url.pathname === "/secrets-check") {
      return Response.json({
        ok: true,
        secrets: {
          coupangAccessKey: Boolean(env.COUPANG_ACCESS_KEY),
          coupangSecretKey: Boolean(env.COUPANG_SECRET_KEY),
          geminiApiKey: Boolean(env.GEMINI_API_KEY)
        }
      });
    }
    if (url.pathname === "/latest") {
      const content = await env.CONTENT_STORE.get("latest", "json");
      if (!content) return Response.json({ ok: false, message: "\uC800\uC7A5\uB41C \uAE00\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, { status: 404 });
      return Response.json({ ok: true, content });
    }
    if (url.pathname === "/status") {
      const status = await env.CONTENT_STORE.get("last-run", "json");
      return Response.json({ ok: true, status: status ?? null });
    }
    return Response.json({ ok: false, message: "\uC874\uC7AC\uD558\uC9C0 \uC54A\uB294 \uACBD\uB85C\uC785\uB2C8\uB2E4." }, { status: 404 });
  },
  /** 매일 오전 9시(한국시간)에 실행합니다. 초기 테스트 Cron은 1회만 실행합니다. */
  async scheduled(controller, env) {
    const trend = await getDailyKeyword(env, new Date(controller.scheduledTime));
    const keyword = trend.keyword;
    const startedAt = (/* @__PURE__ */ new Date()).toISOString();
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
          finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
          imageCount: content.quality.imageCount,
          opinionSignalCount: content.quality.opinionSignalCount
        })
      );
      console.log("\uC790\uB3D9 \uCF58\uD150\uCE20 \uC0DD\uC131 \uC644\uB8CC:", content.storageKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958";
      await env.CONTENT_STORE.put(
        "last-run",
        JSON.stringify({
          status: "error",
          type: isInitialTest ? "initial-test" : "daily",
          keyword,
          trendSource: trend.source,
          startedAt,
          finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
          error: message
        })
      );
      console.error("\uC790\uB3D9 \uCF58\uD150\uCE20 \uC0DD\uC131 \uC2E4\uD328:", message);
      throw error;
    }
  }
};

// src/bootstrap.ts
var COUPANG_HOST2 = "https://api-gateway.coupang.com";
var COUPANG_SEARCH_PATH2 = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
var DISCLOSURE = "\uC774 \uD3EC\uC2A4\uD305\uC740 \uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uD65C\uB3D9\uC758 \uC77C\uD658\uC73C\uB85C, \uC774\uC5D0 \uB530\uB978 \uC77C\uC815\uC561\uC758 \uC218\uC218\uB8CC\uB97C \uC81C\uACF5\uBC1B\uC2B5\uB2C8\uB2E4.";
var BOOTSTRAP_LOCK = "bootstrap-generation-completed";
var USED_PRODUCTS_KEY2 = "history:products";
var USED_TITLES_KEY2 = "history:titles";
var MAX_HISTORY2 = 120;
async function auth(env, method, path, query) {
  const signedDate = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(2);
  const message = signedDate + method.toUpperCase() + path + query;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.COUPANG_SECRET_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const hex = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${signedDate}, signature=${hex}`;
}
__name(auth, "auth");
async function search(env, keyword) {
  const query = `keyword=${encodeURIComponent(keyword)}`;
  const response = await fetch(`${COUPANG_HOST2}${COUPANG_SEARCH_PATH2}?${query}`, {
    headers: { Authorization: await auth(env, "GET", COUPANG_SEARCH_PATH2, query), "Content-Type": "application/json;charset=UTF-8" }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Coupang API \uC624\uB958 (${response.status}): ${text.slice(0, 400)}`);
  const data = JSON.parse(text);
  return Array.isArray(data?.data?.productData) ? data.data.productData.map((p) => ({
    productId: p.productId ?? null,
    productName: p.productName ?? "",
    productPrice: p.productPrice ?? null,
    productImage: p.productImage ?? "",
    productUrl: p.productUrl ?? "",
    rank: p.rank ?? null,
    isRocket: p.isRocket ?? false,
    isFreeShipping: p.isFreeShipping ?? false
  })) : [];
}
__name(search, "search");
async function gemini(env, prompt, maxOutputTokens = 5e3) {
  if (prompt.includes("\uC0C1\uD488 \uBAA9\uB85D:")) {
    const match = prompt.match(/상품 목록:\s*([\s\S]*?)\n\n선정 규칙:/);
    if (match) {
      try {
        const list = JSON.parse(match[1]);
        const first = Array.isArray(list) ? list[0] : null;
        if (first?.productId != null) return JSON.stringify({ productId: String(first.productId), reason: "\uAC80\uC0C9\uC5B4 \uAD00\uB828\uC131\uC744 \uC6B0\uC120\uD574 \uC120\uD0DD\uD588\uC2B5\uB2C8\uB2E4." });
      } catch {
      }
    }
  }
  const keyword = prompt.match(/검색어:\s*(.+)/)?.[1]?.trim() || "\uC0C1\uD488 \uC815\uBCF4";
  const productName = prompt.match(/상품명:\s*(.+)/)?.[1]?.trim() || keyword;
  const price = prompt.match(/가격:\s*(.+)/)?.[1]?.trim() || "\uD655\uC778 \uBD88\uAC00";
  const rocket = prompt.match(/로켓배송:\s*(.+)/)?.[1]?.trim() || "\uD655\uC778 \uBD88\uAC00";
  const freeShipping = prompt.match(/무료배송:\s*(.+)/)?.[1]?.trim() || "\uD655\uC778 \uBD88\uAC00";
  const titles = [
    `${productName} \uC0C1\uD488 \uC815\uBCF4\uC640 \uAD6C\uB9E4 \uC804 \uD655\uC778\uD560 \uC810`,
    `${keyword} \uAC80\uC0C9 \uACB0\uACFC\uC5D0\uC11C \uC0B4\uD3B4\uBCF8 ${productName}`,
    `\uAD6C\uB9E4 \uC804\uC5D0 \uD655\uC778\uD560 ${productName} \uAE30\uBCF8 \uC815\uBCF4`,
    `${productName} \uBC30\uC1A1 \uC870\uAC74\uACFC \uD604\uC7AC \uAC80\uC0C9 \uC815\uBCF4 \uC815\uB9AC`,
    `${keyword} \uC0C1\uD488\uC744 \uACE0\uB97C \uB54C \uD655\uC778\uD560 ${productName} \uC815\uBCF4`
  ];
  const body = `\uC548\uB155\uD558\uC138\uC694. \uC624\uB298\uC740 ${keyword} \uAC80\uC0C9 \uACB0\uACFC\uC5D0\uC11C \uD655\uC778\uB41C ${productName}\uC744 \uC911\uC2EC\uC73C\uB85C \uBD80\uB2F4 \uC5C6\uC774 \uC815\uB9AC\uD574\uBCF4\uACA0\uC2B5\uB2C8\uB2E4.

\uD604\uC7AC \uD655\uC778\uB418\uB294 \uC815\uBCF4\uB294 \uCFE0\uD321 \uC0C1\uD488 \uAC80\uC0C9 \uACB0\uACFC\uB97C \uAE30\uC900\uC73C\uB85C \uD569\uB2C8\uB2E4. \uC0C1\uD488\uBA85\uB9CC\uC73C\uB85C \uD655\uC778\uB418\uC9C0 \uC54A\uB294 \uC138\uBD80 \uAE30\uB2A5\uC774\uB098 \uC18C\uC7AC, \uAD6C\uC131\uD488, \uC131\uB2A5 \uB4F1\uC740 \uC784\uC758\uB85C \uB2E8\uC815\uD558\uC9C0 \uC54A\uACE0 \uC2E4\uC81C \uC0C1\uD488 \uC0C1\uC138 \uD398\uC774\uC9C0\uC5D0\uC11C \uD655\uC778\uD558\uB294 \uAC83\uC744 \uAE30\uC900\uC73C\uB85C \uC791\uC131\uD588\uC2B5\uB2C8\uB2E4.

\uD604\uC7AC \uAC80\uC0C9 \uACB0\uACFC\uC5D0\uC11C \uD655\uC778\uB41C \uAC00\uACA9\uC740 ${price}\uC6D0\uC785\uB2C8\uB2E4. \uC774 \uC815\uBCF4\uB294 \uAC80\uC0C9 \uC2DC\uC810\uC758 \uACB0\uACFC\uC774\uBBC0\uB85C \uC2DC\uAC04\uC774 \uC9C0\uB098\uBA74 \uB2EC\uB77C\uC9C8 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uAD6C\uB9E4 \uC2DC\uC810\uC5D0\uB294 \uC2E4\uC81C \uC0C1\uD488 \uD398\uC774\uC9C0\uC5D0\uC11C \uCD5C\uC2E0 \uAC00\uACA9\uACFC \uD310\uB9E4 \uC870\uAC74\uC744 \uB2E4\uC2DC \uD655\uC778\uD558\uB294 \uAC83\uC774 \uC88B\uC2B5\uB2C8\uB2E4.

\uBC30\uC1A1 \uC870\uAC74\uB3C4 \uD568\uAED8 \uD655\uC778\uD574 \uC8FC\uC138\uC694. \uD604\uC7AC \uAC80\uC0C9 \uACB0\uACFC\uC5D0\uC11C\uB294 \uB85C\uCF13\uBC30\uC1A1 ${rocket}, \uBB34\uB8CC\uBC30\uC1A1 ${freeShipping}\uC73C\uB85C \uD45C\uC2DC\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uBC30\uC1A1 \uC870\uAC74 \uC5ED\uC2DC \uC8FC\uBB38 \uC2DC\uC810\uC774\uB098 \uD310\uB9E4 \uC870\uAC74\uC5D0 \uB530\uB77C \uB2EC\uB77C\uC9C8 \uC218 \uC788\uC73C\uBBC0\uB85C \uC2E4\uC81C \uC8FC\uBB38 \uD654\uBA74\uC5D0\uC11C \uCD5C\uC885 \uC870\uAC74\uC744 \uD655\uC778\uD558\uB294 \uAC83\uC774 \uC88B\uC2B5\uB2C8\uB2E4.

${keyword}\uCC98\uB7FC \uBE44\uC2B7\uD55C \uC0C1\uD488\uC774 \uD568\uAED8 \uAC80\uC0C9\uB418\uB294 \uBD84\uC57C\uC5D0\uC11C\uB294 \uC0C1\uD488\uBA85\uC774 \uBE44\uC2B7\uD558\uB2E4\uB294 \uC774\uC720\uB9CC\uC73C\uB85C \uC138\uBD80 \uC0AC\uC591\uAE4C\uC9C0 \uAC19\uB2E4\uACE0 \uD310\uB2E8\uD558\uC9C0 \uC54A\uB294 \uAC83\uC774 \uC88B\uC2B5\uB2C8\uB2E4. \uD544\uC694\uD55C \uC6A9\uB3C4\uC640 \uC6D0\uD558\uB294 \uAD6C\uC131, \uC0AC\uC6A9 \uD658\uACBD\uC744 \uBA3C\uC800 \uC815\uD55C \uB4A4 \uC0C1\uD488 \uC0C1\uC138 \uD398\uC774\uC9C0\uC758 \uC635\uC158\uACFC \uC548\uB0B4 \uB0B4\uC6A9\uC744 \uBE44\uAD50\uD574\uBCF4\uC138\uC694.

\uAD6C\uB9E4 \uC804\uC5D0\uB294 \uC120\uD0DD\uD558\uB824\uB294 \uC635\uC158\uACFC \uAD6C\uC131, \uBC30\uC1A1 \uC870\uAC74, \uD310\uB9E4 \uC815\uBCF4\uB97C \uCC28\uB840\uB85C \uD655\uC778\uD558\uB294 \uAC83\uC744 \uAD8C\uD569\uB2C8\uB2E4. \uAC00\uACA9 \uD558\uB098\uB9CC \uBCF4\uAE30\uBCF4\uB2E4 \uBCF8\uC778\uC5D0\uAC8C \uD544\uC694\uD55C \uC870\uAC74\uC744 \uCDA9\uC871\uD558\uB294\uC9C0 \uD568\uAED8 \uC0B4\uD3B4\uBCF4\uB294 \uD3B8\uC774 \uC88B\uC2B5\uB2C8\uB2E4.

\uAC80\uC0C9 \uACB0\uACFC\uC758 \uAC00\uACA9\uACFC \uC21C\uC704\uB294 \uACE0\uC815\uB41C \uC815\uBCF4\uAC00 \uC544\uB2D9\uB2C8\uB2E4. \uC2DC\uAC04\uC774 \uC9C0\uB098\uBA74\uC11C \uAC80\uC0C9 \uC704\uCE58\uB098 \uAC00\uACA9, \uBC30\uC1A1 \uC870\uAC74\uC774 \uBC14\uB014 \uC218 \uC788\uC73C\uBBC0\uB85C \uC774 \uAE00\uC758 \uC22B\uC790\uB294 \uD604\uC7AC \uAC80\uC0C9 \uACB0\uACFC\uB97C \uCC38\uACE0\uD558\uAE30 \uC704\uD55C \uC815\uBCF4\uB85C \uBCF4\uACE0 \uAD6C\uB9E4 \uC2DC\uC810\uC5D0\uB294 \uC0C1\uD488 \uD398\uC774\uC9C0\uC758 \uCD5C\uC2E0 \uB0B4\uC6A9\uC744 \uAE30\uC900\uC73C\uB85C \uD310\uB2E8\uD574 \uC8FC\uC138\uC694.

\uC815\uB9AC\uD558\uBA74 ${productName}\uC740 \uD604\uC7AC ${keyword} \uAC80\uC0C9 \uACB0\uACFC\uC5D0\uC11C \uD655\uC778\uB418\uB294 \uC0C1\uD488\uC785\uB2C8\uB2E4. \uAD6C\uB9E4\uB97C \uACB0\uC815\uD558\uAE30 \uC804\uC5D0\uB294 \uC0C1\uD488 \uC0C1\uC138 \uC815\uBCF4\uC640 \uC635\uC158, \uD604\uC7AC \uAC00\uACA9, \uBC30\uC1A1 \uC870\uAC74\uC744 \uD568\uAED8 \uD655\uC778\uD558\uACE0 \uBCF8\uC778\uC758 \uC0AC\uC6A9 \uBAA9\uC801\uC5D0 \uB9DE\uB294\uC9C0 \uC0B4\uD3B4\uBCF4\uB294 \uAC83\uC774 \uC88B\uC2B5\uB2C8\uB2E4. \uD2B9\uC815 \uC0C1\uD488\uC774 \uB204\uAD6C\uC5D0\uAC8C\uB098 \uB9DE\uB294\uB2E4\uACE0 \uB2E8\uC815\uD558\uAE30\uBCF4\uB2E4\uB294 \uD544\uC694\uD55C \uC870\uAC74\uC744 \uAE30\uC900\uC73C\uB85C \uBE44\uAD50\uD574\uBCF4\uC138\uC694.

\uAD00\uC2EC\uC774 \uC788\uB2E4\uBA74 \uC0C1\uD488 \uD655\uC778 \uBC84\uD2BC\uC744 \uD1B5\uD574 \uD604\uC7AC \uD310\uB9E4 \uD398\uC774\uC9C0\uC758 \uCD5C\uC2E0 \uC815\uBCF4\uB97C \uC9C1\uC811 \uD655\uC778\uD574\uBCF4\uC138\uC694. \uC624\uB298\uC740 \uD655\uC778 \uAC00\uB2A5\uD55C \uB0B4\uC6A9\uC744 \uC911\uC2EC\uC73C\uB85C \uAC04\uB2E8\uD558\uAC8C \uC815\uB9AC\uD588\uC2B5\uB2C8\uB2E4. \uCC9C\uCC9C\uD788 \uBE44\uAD50\uD574\uBCF4\uBA74\uC11C \uBCF8\uC778\uC5D0\uAC8C \uB9DE\uB294 \uC0C1\uD488\uC778\uC9C0 \uC0B4\uD3B4\uBCF4\uC2DC\uBA74 \uC88B\uACA0\uC2B5\uB2C8\uB2E4.`;
  return JSON.stringify({ disclosure: DISCLOSURE, titles, selectedTitle: titles[0], body });
}
__name(gemini, "gemini");
async function recommend(env, keyword, products) {
  const selected = products[0];
  if (!selected) throw new Error("\uC120\uD0DD \uAC00\uB2A5\uD55C \uC0C1\uD488\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
  return { product: selected, reason: "\uAC80\uC0C9\uC5B4\uC640 \uD604\uC7AC \uAC80\uC0C9 \uACB0\uACFC\uC758 \uAD00\uB828\uC131\uC744 \uC6B0\uC120\uD574 \uC120\uC815\uD588\uC2B5\uB2C8\uB2E4." };
}
__name(recommend, "recommend");
async function blog(env, keyword, product) {
  const prompt = `\uAC80\uC0C9\uC5B4: ${keyword}
\uC0C1\uD488\uBA85: ${product.productName}
\uAC00\uACA9: ${product.productPrice ?? "\uD655\uC778 \uBD88\uAC00"}
\uB85C\uCF13\uBC30\uC1A1: ${product.isRocket}
\uBB34\uB8CC\uBC30\uC1A1: ${product.isFreeShipping}`;
  const parsed = JSON.parse(await gemini(env, prompt));
  return { disclosure: DISCLOSURE, titles: parsed.titles, selectedTitle: parsed.selectedTitle, body: parsed.body, partnerUrl: product.productUrl };
}
__name(blog, "blog");
async function runBootstrap(env, keyword = "\uBB34\uC120\uCCAD\uC18C\uAE30") {
  if (await env.CONTENT_STORE.get(BOOTSTRAP_LOCK)) throw new Error("\uC774\uBBF8 1\uD68C \uC0DD\uC131 \uD14C\uC2A4\uD2B8\uAC00 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
  const products = await search(env, keyword);
  if (!products.length) throw new Error("\uCFE0\uD321 \uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const usedProductIds = await env.CONTENT_STORE.get(USED_PRODUCTS_KEY2, "json");
  const availableProducts = products.filter((p) => !usedProductIds?.includes(String(p.productId)));
  if (!availableProducts.length) throw new Error("\uC774\uBC88 \uAC80\uC0C9 \uACB0\uACFC\uAC00 \uBAA8\uB450 \uACFC\uAC70 \uD64D\uBCF4 \uC0C1\uD488\uC785\uB2C8\uB2E4.");
  const recommendation = await recommend(env, keyword, availableProducts);
  const generatedBlog = await blog(env, keyword, recommendation.product);
  const now = /* @__PURE__ */ new Date();
  const record = { savedAt: now.toISOString(), keyword, recommendation, blog: generatedBlog };
  const storageKey = `post:${now.toISOString()}`;
  await env.CONTENT_STORE.put(storageKey, JSON.stringify(record));
  await env.CONTENT_STORE.put("latest", JSON.stringify(record));
  const historyTitles = await env.CONTENT_STORE.get(USED_TITLES_KEY2, "json");
  const productId = String(recommendation.product.productId);
  await env.CONTENT_STORE.put(USED_PRODUCTS_KEY2, JSON.stringify([...usedProductIds ?? [], productId].slice(-MAX_HISTORY2)));
  await env.CONTENT_STORE.put(USED_TITLES_KEY2, JSON.stringify([...historyTitles ?? [], ...generatedBlog.titles].slice(-MAX_HISTORY2)));
  await env.CONTENT_STORE.put(BOOTSTRAP_LOCK, JSON.stringify({ completedAt: now.toISOString(), storageKey }));
  await env.CONTENT_STORE.put("last-run", JSON.stringify({ status: "success", type: "bootstrap", keyword, storageKey, finishedAt: now.toISOString() }));
  return { storageKey, record };
}
__name(runBootstrap, "runBootstrap");

// src/tistory.ts
var GEMINI_HOST = "https://generativelanguage.googleapis.com/v1beta/models";
var GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"];
var TISTORY_DISCLOSURE = "\uC774 \uD3EC\uC2A4\uD305\uC740 \uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uD65C\uB3D9\uC758 \uC77C\uD658\uC73C\uB85C, \uC774\uC5D0 \uB530\uB978 \uC77C\uC815\uC561\uC758 \uC218\uC218\uB8CC\uB97C \uC81C\uACF5\uBC1B\uC2B5\uB2C8\uB2E4.";
function cleanJson2(value) {
  return value.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
}
__name(cleanJson2, "cleanJson");
async function generateGemini2(env, prompt, maxOutputTokens = 7e3) {
  let lastError = "Gemini \uD638\uCD9C \uC2E4\uD328";
  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(`${GEMINI_HOST}/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens, thinkingConfig: { thinkingLevel: "low" }, responseMimeType: "application/json" }
          })
        });
        const text = await response.text();
        if (response.status === 503) {
          lastError = `Gemini ${model} 503`;
          continue;
        }
        if (!response.ok) throw new Error(`Gemini API \uC624\uB958 (${response.status}): ${text.slice(0, 500)}`);
        const data = JSON.parse(text);
        const output = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text ?? "").join("").trim();
        if (!output) throw new Error(`Gemini ${model} \uC751\uB2F5\uC5D0 \uD14D\uC2A4\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`);
        return output;
      } catch (error) {
        if (error instanceof Error) lastError = error.message;
        if (attempt >= 3) break;
      }
    }
  }
  throw new Error(lastError);
}
__name(generateGemini2, "generateGemini");
async function generateTistoryContent(env, product, keyword, usedTitles = []) {
  for (let generationAttempt = 1; generationAttempt <= 2; generationAttempt++) {
    const prompt = `\uB108\uB294 \uD55C\uAD6D \uD2F0\uC2A4\uD1A0\uB9AC \uBE14\uB85C\uADF8\uC758 \uC815\uBCF4\uD615 \uCF58\uD150\uCE20 \uC804\uBB38 \uD3B8\uC9D1\uC790\uB2E4.

\uAC80\uC0C9 \uC8FC\uC81C: ${keyword}
\uC0C1\uD488\uBA85: ${product.productName}
\uD604\uC7AC \uAC80\uC0C9 \uACB0\uACFC \uAC00\uACA9: ${product.productPrice ?? "\uD655\uC778 \uBD88\uAC00"}\uC6D0
\uAC80\uC0C9 \uACB0\uACFC \uC21C\uC704: ${product.rank ?? "\uD655\uC778 \uBD88\uAC00"}
\uB85C\uCF13\uBC30\uC1A1: ${product.isRocket ? "\uC608" : "\uC544\uB2C8\uC624"}
\uBB34\uB8CC\uBC30\uC1A1: ${product.isFreeShipping ? "\uC608" : "\uC544\uB2C8\uC624"}

\uC791\uC131 \uADDC\uCE59:
- \uB124\uC774\uBC84\uC6A9 \uAE00\uACFC \uB2E4\uB978 \uCC28\uBD84\uD55C \uC815\uBCF4\uD615 \uAD6C\uC131\uC73C\uB85C \uC791\uC131\uD55C\uB2E4.
- \uC0C1\uD488\uBA85\uACFC \uC704 API \uD655\uC778 \uC815\uBCF4\uB9CC \uC0AC\uC2E4\uB85C \uC0AC\uC6A9\uD55C\uB2E4.
- \uD655\uC778\uB418\uC9C0 \uC54A\uC740 \uAE30\uB2A5, \uC18C\uC7AC, \uD06C\uAE30, \uC131\uB2A5, \uAD6C\uC131\uD488, \uBC30\uD130\uB9AC, \uD310\uB9E4\uB7C9, \uD3C9\uC810, \uB9AC\uBDF0\uB97C \uB9CC\uB4E4\uC9C0 \uC54A\uB294\uB2E4.
- \uC9C1\uC811 \uC0AC\uC6A9\uD55C \uAC83\uCC98\uB7FC \uC4F0\uC9C0 \uC54A\uB294\uB2E4.
- \uAC00\uACA9/\uD560\uC778/\uCD5C\uC800\uAC00\uB97C \uACFC\uC7A5\uD558\uC9C0 \uC54A\uB294\uB2E4.
- \uC81C\uBAA9 5\uAC1C\uB294 \uC11C\uB85C \uB2E4\uB978 \uBC29\uD5A5\uC73C\uB85C \uC791\uC131\uD55C\uB2E4.
- \uC57D 1,600~2,200\uC790\uC758 \uC815\uBCF4\uB7C9\uC744 \uC720\uC9C0\uD55C\uB2E4.
- \uAC80\uC0C9 \uC8FC\uC81C\uB294 \uBCF8\uBB38\uC5D0\uC11C \uC5B5\uC9C0\uC2A4\uB7FD\uC9C0 \uC54A\uAC8C \uCD5C\uC18C 1\uD68C \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC5B8\uAE09\uD55C\uB2E4.
- \uC0C1\uD488\uBA85\uB3C4 \uBCF8\uBB38\uC5D0\uC11C \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC5B8\uAE09\uD55C\uB2E4.
- \uACFC\uAC70 \uC81C\uBAA9\uACFC \uBB38\uC7A5 \uAD6C\uC870\uAC00 \uACB9\uCE58\uC9C0 \uC54A\uAC8C \uD55C\uB2E4.
${generationAttempt > 1 ? "\uC774\uC804 \uACB0\uACFC\uAC00 \uD488\uC9C8 \uAE30\uC900\uC744 \uD1B5\uACFC\uD558\uC9C0 \uBABB\uD588\uB2E4. \uD45C\uD604\uACFC \uC81C\uBAA9 \uAD6C\uC870\uB97C \uD06C\uAC8C \uBC14\uAFD4 \uB2E4\uC2DC \uC791\uC131\uD55C\uB2E4." : ""}

\uACFC\uAC70 \uC81C\uBAA9:
${JSON.stringify(usedTitles.slice(-60))}

JSON\uB9CC \uBC18\uD658:
{"titles":["\uC81C\uBAA91","\uC81C\uBAA92","\uC81C\uBAA93","\uC81C\uBAA94","\uC81C\uBAA95"],"selectedTitle":"\uB300\uD45C \uC81C\uBAA9","body":"\uD2F0\uC2A4\uD1A0\uB9AC \uBCF8\uBB38 \uC804\uCCB4"}`;
    const parsed = JSON.parse(cleanJson2(await generateGemini2(env, prompt)));
    if (!Array.isArray(parsed.titles) || parsed.titles.length !== 5 || !parsed.selectedTitle || !parsed.body) {
      throw new Error("\uD2F0\uC2A4\uD1A0\uB9AC \uCF58\uD150\uCE20 \uACB0\uACFC \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    }
    const quality = validateContentQuality({ keyword, productName: product.productName, titles: parsed.titles, selectedTitle: parsed.selectedTitle, body: parsed.body });
    if (quality.ok) {
      return {
        platform: "tistory",
        disclosure: TISTORY_DISCLOSURE,
        titles: parsed.titles,
        selectedTitle: parsed.selectedTitle,
        body: parsed.body,
        productUrl: product.productUrl ?? "",
        productImage: product.productImage ?? "",
        quality
      };
    }
    if (generationAttempt === 2) {
      throw new Error(`\uD2F0\uC2A4\uD1A0\uB9AC \uCF58\uD150\uCE20 \uD488\uC9C8 \uAC80\uC0AC \uC2E4\uD328: ${quality.reasons.join(" / ")}`);
    }
  }
  throw new Error("\uD2F0\uC2A4\uD1A0\uB9AC \uCF58\uD150\uCE20 \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
}
__name(generateTistoryContent, "generateTistoryContent");

// src/image.ts
var MIN_WIDTH = 300;
var MIN_HEIGHT = 300;
var MIN_RATIO = 0.33;
var MAX_RATIO = 3;
async function validateImageUrl(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/logo|icon|sprite|avatar|favicon|badge|banner/i.test(url)) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-65535" },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) return false;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) return false;
    const dimensions = readImageDimensions(new Uint8Array(await response.arrayBuffer()), contentType);
    if (!dimensions) return false;
    if (dimensions.width < MIN_WIDTH || dimensions.height < MIN_HEIGHT) return false;
    const ratio = dimensions.width / dimensions.height;
    return ratio >= MIN_RATIO && ratio <= MAX_RATIO;
  } catch {
    return false;
  }
}
__name(validateImageUrl, "validateImageUrl");
function readImageDimensions(bytes, contentType) {
  if (contentType.includes("png") && bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    return { width: readUint32(bytes, 16), height: readUint32(bytes, 20) };
  }
  if (contentType.includes("gif") && bytes.length >= 10 && bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70) {
    return { width: bytes[6] | bytes[7] << 8, height: bytes[8] | bytes[9] << 8 };
  }
  if (contentType.includes("webp") && bytes.length >= 30 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80 && bytes[12] === 86 && bytes[13] === 80 && bytes[14] === 56 && bytes[15] === 88) {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    };
  }
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) return null;
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 255) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 216 || marker === 217) {
        offset += 2;
        continue;
      }
      const length = bytes[offset + 2] << 8 | bytes[offset + 3];
      if (length < 2 || offset + length + 2 > bytes.length) return null;
      const isFrameMarker = marker >= 192 && marker <= 195 || marker >= 197 && marker <= 199 || marker >= 201 && marker <= 203 || marker >= 205 && marker <= 207;
      if (isFrameMarker) return { height: bytes[offset + 5] << 8 | bytes[offset + 6], width: bytes[offset + 7] << 8 | bytes[offset + 8] };
      offset += length + 2;
    }
  }
  return null;
}
__name(readImageDimensions, "readImageDimensions");
function readUint32(bytes, offset) {
  return bytes[offset] * 16777216 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3] >>> 0;
}
__name(readUint32, "readUint32");

// src/publish-queue.ts
var QUEUE_INDEX_KEY = "publish:queue";
async function getQueue(env) {
  const value = await env.CONTENT_STORE.get(QUEUE_INDEX_KEY, "json");
  return Array.isArray(value) ? value : [];
}
__name(getQueue, "getQueue");
async function getReadyPublishQueue(env) {
  const queue = await getQueue(env);
  return queue.filter((item) => item.status === "ready");
}
__name(getReadyPublishQueue, "getReadyPublishQueue");

// src/dashboard.ts
function escapeHtml2(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
__name(escapeHtml2, "escapeHtml");
function escapeJs(value) {
  return JSON.stringify(String(value ?? "")).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
__name(escapeJs, "escapeJs");
function getBlog(post) {
  return post?.blog ?? post?.content ?? post ?? {};
}
__name(getBlog, "getBlog");
async function getValidImages(post) {
  const blog2 = getBlog(post);
  const officialImage = post?.recommendation?.product?.productImage ?? blog2?.productImage ?? "";
  const relatedImages = Array.isArray(blog2?.imageUrls) ? blog2.imageUrls : [];
  const candidates = [officialImage, ...relatedImages].filter(Boolean);
  const uniqueCandidates = [...new Set(candidates)].slice(0, 3);
  const checked = await Promise.all(uniqueCandidates.map(async (url) => ({ url, valid: await validateImageUrl(url) })));
  const valid = checked.filter((item) => item.valid).map((item) => item.url);
  if (!valid.length && officialImage) return [officialImage];
  return valid;
}
__name(getValidImages, "getValidImages");
function renderQuality(post) {
  const quality = post?.quality ?? post?.content?.quality;
  if (!quality) return `<div class="quality unknown">\uD488\uC9C8 \uAC80\uC0AC \uAE30\uB85D \uC5C6\uC74C</div>`;
  if (quality.passed || quality.ok) return `<div class="quality pass">\uD488\uC9C8 \uAC80\uC0AC \uD1B5\uACFC \xB7 ${escapeHtml2(quality.score)}\uC810</div>`;
  const reasons = Array.isArray(quality.reasons) ? quality.reasons : [];
  return `<div class="quality fail">\uD488\uC9C8 \uAC80\uC0AC \uBBF8\uD1B5\uACFC \xB7 ${escapeHtml2(quality.score)}\uC810${reasons.length ? `<br><small>${escapeHtml2(reasons.join(" \xB7 "))}</small>` : ""}</div>`;
}
__name(renderQuality, "renderQuality");
function buildCopyText(post) {
  const blog2 = getBlog(post);
  const disclosure = blog2.disclosure ?? "";
  const body = blog2.body ?? "";
  const partnerUrl = blog2.partnerUrl ?? blog2.productUrl ?? "";
  return [disclosure, "", body, "", "\uC0C1\uD488 \uB9C1\uD06C", partnerUrl].filter((v) => v !== void 0 && v !== "").join("\n").trim();
}
__name(buildCopyText, "buildCopyText");
function renderCopyArea(post, platform) {
  if (!post) return "";
  const blog2 = getBlog(post);
  const copyText = buildCopyText(post);
  const quality = post?.quality ?? blog2?.quality;
  const ready = quality?.passed === true || quality?.ok === true;
  const id = `${platform.toLowerCase()}-copy`;
  return `<div class="copy-area">
    <div class="copy-head"><strong>${escapeHtml2(platform)} \uAC8C\uC2DC\uC6A9</strong><button type="button" onclick="copyContent(${escapeJs(id)},${escapeJs(copyText)})">\uC804\uCCB4 \uBCF5\uC0AC</button></div>
    <p class="copy-help">\uC81C\uBAA9\uBD80\uD130 \uACE0\uC9C0\uBB38\xB7\uBCF8\uBB38\xB7\uC0C1\uD488 \uB9C1\uD06C\uAE4C\uC9C0 \uD55C \uBC88\uC5D0 \uBCF5\uC0AC\uD569\uB2C8\uB2E4.</p>
    <textarea id="${escapeHtml2(id)}" readonly>${escapeHtml2(copyText)}</textarea>
    ${ready ? `<div class="ready">\uAC8C\uC2DC \uC900\uBE44 \uC644\uB8CC</div>` : `<div class="not-ready">\uD488\uC9C8\uAC80\uC0AC \uD1B5\uACFC \uC804\uC5D0\uB294 \uAC8C\uC2DC\uD558\uC9C0 \uC54A\uB294 \uAC83\uC744 \uAD8C\uC7A5\uD569\uB2C8\uB2E4.</div>`}
  </div>`;
}
__name(renderCopyArea, "renderCopyArea");
function renderBodyWithImages(body, images) {
  const paragraphs = body.split(/\n\s*\n|\n/).map((item) => item.trim()).filter(Boolean);
  if (!images.length) return escapeHtml2(body);
  const output = [];
  const usedImages = /* @__PURE__ */ new Set();
  paragraphs.forEach((paragraph, index) => {
    output.push(`<p>${escapeHtml2(paragraph)}</p>`);
    const imageIndex = index === 1 ? 0 : index === 4 ? 1 : index === 7 ? 2 : -1;
    if (imageIndex >= 0 && imageIndex < images.length) {
      usedImages.add(imageIndex);
      output.push(
        `<figure class="body-image-wrap"><img class="body-image" src="${escapeHtml2(images[imageIndex])}" alt="\uC0C1\uD488 \uC774\uBBF8\uC9C0 ${imageIndex + 1}" loading="lazy"><figcaption>\uC0C1\uD488 \uC774\uBBF8\uC9C0 ${imageIndex + 1}</figcaption></figure>`
      );
    }
  });
  images.forEach((url, index) => {
    if (usedImages.has(index)) return;
    output.push(
      `<figure class="body-image-wrap"><img class="body-image" src="${escapeHtml2(url)}" alt="\uC0C1\uD488 \uC774\uBBF8\uC9C0 ${index + 1}" loading="lazy"><figcaption>\uC0C1\uD488 \uC774\uBBF8\uC9C0 ${index + 1}</figcaption></figure>`
    );
  });
  return output.join("");
}
__name(renderBodyWithImages, "renderBodyWithImages");
async function renderPost(title, post, platform) {
  if (!post) return `<section class="card empty"><h2>${escapeHtml2(title)}</h2><p>\uC544\uC9C1 \uC0DD\uC131\uB41C \uCF58\uD150\uCE20\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p></section>`;
  const blog2 = getBlog(post);
  const product = post.recommendation?.product;
  const titles = Array.isArray(blog2.titles) ? blog2.titles : [];
  const images = await getValidImages(post);
  return `<section class="card">
    <div class="platform">${escapeHtml2(platform)}</div>
    ${renderQuality(post)}
    <div class="title-box">
      <div class="title-label">\uAC8C\uC2DC \uC81C\uBAA9</div>
      <div class="title-value">${escapeHtml2(blog2.selectedTitle ?? titles[0] ?? post.keyword ?? "\uC790\uB3D9 \uC0DD\uC131 \uCF58\uD150\uCE20")}</div>
      <button type="button" class="title-copy" onclick="copyContent('title-${escapeJs(platform)}',${escapeJs(blog2.selectedTitle ?? titles[0] ?? post.keyword ?? "\uC790\uB3D9 \uC0DD\uC131 \uCF58\uD150\uCE20")})">\uC81C\uBAA9 \uBCF5\uC0AC</button>
    </div>
    <p class="meta">\uAC80\uC0C9 \uC8FC\uC81C: ${escapeHtml2(post.keyword ?? "-")} \xB7 \uC0DD\uC131: ${escapeHtml2(post.savedAt ?? "-")}</p>
    ${product?.productName ? `<div class="product-name">\uC120\uC815 \uC0C1\uD488 \xB7 ${escapeHtml2(product.productName)}</div>` : ""}
    <div class="disclosure">${escapeHtml2(blog2.disclosure ?? "")}</div>
    <div class="body body-with-images">${renderBodyWithImages(blog2.body ?? "", images)}</div>
    ${blog2.partnerUrl || blog2.productUrl ? `<a class="link" href="${escapeHtml2(blog2.partnerUrl ?? blog2.productUrl)}" target="_blank" rel="noopener noreferrer">\uC0C1\uD488 \uB9C1\uD06C \uC5F4\uAE30</a>` : ""}
    ${renderCopyArea(post, platform)}
    ${titles.length ? `<details><summary>\uC81C\uBAA9 \uD6C4\uBCF4 ${titles.length}\uAC1C</summary><ol>${titles.map((item) => `<li>${escapeHtml2(item)}</li>`).join("")}</ol></details>` : ""}
  </section>`;
}
__name(renderPost, "renderPost");
async function renderCombinedDashboard(env) {
  const [naver, tistory, status, quality, queue] = await Promise.all([
    env.CONTENT_STORE.get("latest", "json"),
    env.CONTENT_STORE.get("latest:tistory", "json"),
    env.CONTENT_STORE.get("last-run", "json"),
    env.CONTENT_STORE.get("latest:quality", "json"),
    getReadyPublishQueue(env)
  ]);
  const [naverHtml, tistoryHtml] = await Promise.all([
    renderPost("\uB124\uC774\uBC84 \uBE14\uB85C\uADF8", naver, "NAVER BLOG"),
    renderPost("\uD2F0\uC2A4\uD1A0\uB9AC", tistory, "TISTORY")
  ]);
  const qualitySummary = quality ? `<div class="status"><strong>\uCD5C\uADFC \uD488\uC9C8 \uAC80\uC0AC</strong> \xB7 ${quality.passed || quality.ok ? "\uD1B5\uACFC" : "\uBBF8\uD1B5\uACFC"} \xB7 ${escapeHtml2(quality.score)}\uC810 \xB7 ${escapeHtml2(quality.checkedAt ?? "-")}</div>` : "";
  const queueSummary = `<div class="status"><strong>\uAC8C\uC2DC \uB300\uAE30</strong> \xB7 ${queue.length}\uAC74 \xB7 \uD488\uC9C8\uAC80\uC0AC \uD1B5\uACFC \uCF58\uD150\uCE20\uB9CC \uB300\uAE30\uC5F4\uC5D0 \uB4F1\uB85D\uB429\uB2C8\uB2E4.</div>`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>\uCFE0\uD321\uD30C\uD2B8\uB108\uC2A4 \uC790\uB3D9 \uCF58\uD150\uCE20</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#202124;font-family:Arial,"Noto Sans KR",sans-serif;line-height:1.65}.wrap{max-width:960px;margin:auto;padding:22px 14px 60px}header{margin-bottom:18px}header h1{margin:0;font-size:27px}header p{margin:5px 0;color:#6b7280;font-size:14px}.actions{display:flex;gap:10px;margin:16px 0}.generate-button{border:0;border-radius:11px;padding:12px 18px;background:#111827;color:#fff;font-size:15px;font-weight:700;cursor:pointer}.generate-button:disabled{opacity:.55;cursor:wait}.generate-status{font-size:13px;color:#6b7280;align-self:center}.status{padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;font-size:13px;margin-bottom:14px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:20px;margin:14px 0;box-shadow:0 2px 10px rgba(0,0,0,.04)}.platform{font-size:12px;font-weight:700;color:#6b7280;letter-spacing:.05em;margin-bottom:4px}.quality{display:inline-block;padding:5px 9px;border-radius:7px;font-size:12px;font-weight:700;margin-bottom:9px}.quality.pass{background:#ecfdf5;color:#047857}.quality.fail{background:#fff1f2;color:#be123c}.quality.unknown{background:#f3f4f6;color:#6b7280}.card h2{margin:0 0 7px;font-size:21px}.title-box{position:relative;margin:8px 0 12px;padding:14px 84px 14px 15px;border:1px solid #dbe2ea;border-radius:12px;background:#f8fafc}.title-label{font-size:11px;font-weight:800;color:#6b7280;margin-bottom:5px}.title-value{font-size:18px;font-weight:800;line-height:1.5;color:#111827}.title-copy{position:absolute;right:12px;top:12px;border:0;border-radius:8px;padding:8px 10px;background:#111827;color:#fff;font-size:12px;font-weight:700;cursor:pointer}.meta{margin:0 0 10px;color:#6b7280;font-size:12px}.product-name{font-size:14px;font-weight:600;margin:10px 0}.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}.gallery img{width:100%;height:190px;object-fit:contain;border:1px solid #e5e7eb;border-radius:10px;background:#fff}.disclosure{padding:10px;background:#f8fafc;border-radius:9px;color:#4b5563;font-size:12px;margin:12px 0}.body{font-size:15px}.body-with-images p{margin:0 0 16px}.body-image-wrap{margin:18px 0;text-align:center}.body-image{display:block;width:100%;max-height:420px;object-fit:contain;border:1px solid #e5e7eb;border-radius:10px;background:#fff}.body-image-wrap figcaption{margin-top:5px;color:#6b7280;font-size:11px}.link{display:inline-block;margin-top:16px;font-weight:700;text-decoration:none}.copy-area{margin-top:20px;padding-top:16px;border-top:1px solid #eee}.copy-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.copy-head button{border:0;border-radius:9px;padding:9px 14px;font-weight:700;cursor:pointer;background:#111827;color:#fff}.copy-help{margin:7px 0;color:#6b7280;font-size:12px}.copy-area textarea{width:100%;min-height:300px;resize:vertical;border:1px solid #d1d5db;border-radius:10px;padding:12px;font:14px/1.7 Arial,"Noto Sans KR",sans-serif;background:#fafafa}.ready,.not-ready{margin-top:8px;font-size:12px;font-weight:700}.ready{color:#047857}.not-ready{color:#b45309}.empty{text-align:center;color:#6b7280;padding:35px}.empty h2{color:#202124}details{margin-top:18px;border-top:1px solid #eee;padding-top:12px}summary{cursor:pointer;font-weight:600}ol{padding-left:22px}@media(max-width:600px){.wrap{padding:18px 10px 40px}.card{padding:16px}.title-box{padding:12px}.title-copy{position:static;margin-top:9px;width:100%}.gallery{grid-template-columns:1fr}.gallery img{height:250px}.body{font-size:15px}.body-with-images p{margin:0 0 16px}.body-image-wrap{margin:18px 0;text-align:center}.body-image{display:block;width:100%;max-height:420px;object-fit:contain;border:1px solid #e5e7eb;border-radius:10px;background:#fff}.body-image-wrap figcaption{margin-top:5px;color:#6b7280;font-size:11px}.copy-area textarea{min-height:360px}.actions{flex-direction:column}.generate-status{align-self:auto}}
</style></head><body><main class="wrap"><header><h1>\uCFE0\uD321\uD30C\uD2B8\uB108\uC2A4 \uC790\uB3D9 \uCF58\uD150\uCE20</h1><p>\uC790\uB3D9 \uC0DD\uC131 \u2192 \uD488\uC9C8 \uAC80\uC0AC \u2192 \uCFE0\uD321 \uB2E8\uCD95 \uB9C1\uD06C \u2192 \uAC8C\uC2DC \uC900\uBE44 \u2192 \uBCF5\uC0AC\uAE4C\uC9C0 \uD55C \uD654\uBA74\uC5D0\uC11C \uCC98\uB9AC\uD569\uB2C8\uB2E4.</p></header>
<div class="actions"><button id="generateButton" class="generate-button" type="button" onclick="manualGenerate()">\uC9C0\uAE08 \uAE00 1\uAC1C \uC0DD\uC131\uD558\uAE30</button><span id="generateStatus" class="generate-status">\uC6D0\uD560 \uB54C\uB9CC \uB20C\uB7EC\uC11C \uC0DD\uC131\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</span></div>
<div class="status"><strong>\uCD5C\uADFC \uC790\uB3D9 \uC2E4\uD589</strong> \xB7 ${escapeHtml2(status?.status ?? "\uAE30\uB85D \uC5C6\uC74C")} \xB7 ${escapeHtml2(status?.finishedAt ?? "-")}</div>
${qualitySummary}${queueSummary}${naverHtml}${tistoryHtml}
</main><script>
function copyContent(id,text){
  navigator.clipboard?.writeText(text).then(()=>showCopied(id)).catch(()=>{const el=document.getElementById(id);el.focus();el.select();document.execCommand('copy');showCopied(id);});
}
function showCopied(id){const el=document.getElementById(id);const button=el?.parentElement?.querySelector('button');if(button){const old=button.textContent;button.textContent='\uBCF5\uC0AC \uC644\uB8CC';setTimeout(()=>button.textContent=old,1500);}}

// \uC0AC\uC6A9\uC790\uAC00 \uBC84\uD2BC\uC744 \uB20C\uB800\uC744 \uB54C\uB9CC \uC218\uB3D9 \uC0DD\uC131 API\uB97C \uD638\uCD9C\uD569\uB2C8\uB2E4.
async function manualGenerate(){
  const button=document.getElementById('generateButton');
  const status=document.getElementById('generateStatus');
  if(!button || !status) return;
  button.disabled=true;
  button.textContent='\uC0DD\uC131 \uC911...';
  status.textContent='\uC0C1\uD488 \uC120\uC815 \u2192 \uC774\uBBF8\uC9C0 \u2192 \uC81C\uBAA9 \u2192 \uBCF8\uBB38\uC744 \uC0DD\uC131\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.';
  try{
    const response=await fetch('/generate',{method:'GET',cache:'no-store'});
    const result=await response.json();
    if(!response.ok || !result.ok) throw new Error(result.message || '\uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.');
    status.textContent='\uC0DD\uC131 \uC644\uB8CC! \uCD5C\uC2E0 \uAE00\uC744 \uBD88\uB7EC\uC635\uB2C8\uB2E4.';
    window.location.reload();
  }catch(error){
    status.textContent='\uC0DD\uC131 \uC2E4\uD328: '+(error?.message || '\uC54C \uC218 \uC5C6\uB294 \uC624\uB958');
    button.disabled=false;
    button.textContent='\uC9C0\uAE08 \uAE00 1\uAC1C \uC0DD\uC131\uD558\uAE30';
  }
}
<\/script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
__name(renderCombinedDashboard, "renderCombinedDashboard");

// src/landing.ts
function renderLandingDashboard() {
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>\uCFE0\uD321\uD30C\uD2B8\uB108\uC2A4 \uC790\uB3D9 \uCF58\uD150\uCE20</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#f4f5f7;color:#202124;font-family:Arial,"Noto Sans KR",sans-serif}
    .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .box{width:min(560px,100%);background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:36px 24px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.05)}
    h1{margin:0 0 8px;font-size:27px}
    p{margin:0 0 24px;color:#6b7280;font-size:14px}
    button{border:0;border-radius:11px;padding:14px 22px;background:#111827;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
    button:disabled{opacity:.55;cursor:wait}
    #status{margin-top:14px;color:#6b7280;font-size:13px;min-height:21px}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="box">
      <h1>\uCFE0\uD321\uD30C\uD2B8\uB108\uC2A4 \uC790\uB3D9 \uCF58\uD150\uCE20</h1>
      <p>\uC544\uC9C1 \uD45C\uC2DC\uD560 \uC0DD\uC131 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
      <button id="generateButton" type="button" onclick="generateContent()">\uC9C0\uAE08 \uAE00 1\uAC1C \uC0DD\uC131\uD558\uAE30</button>
      <div id="status"></div>
    </section>
  </main>
  <script>
    // \uAE30\uBCF8 \uD654\uBA74\uC5D0\uC11C\uB294 \uC544\uBB34 \uCF58\uD150\uCE20\uB3C4 \uBD88\uB7EC\uC624\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.
    // \uBC84\uD2BC\uC744 \uB20C\uB800\uC744 \uB54C\uB9CC \uC2E4\uC81C \uC0DD\uC131 API\uB97C \uD638\uCD9C\uD569\uB2C8\uB2E4.
    async function generateContent(){
      const button=document.getElementById('generateButton');
      const status=document.getElementById('status');
      button.disabled=true;
      button.textContent='\uC0DD\uC131 \uC911...';
      status.textContent='\uC0C1\uD488 \uC120\uC815 \u2192 \uC774\uBBF8\uC9C0 \u2192 \uC81C\uBAA9 \u2192 \uBCF8\uBB38\uC744 \uC0DD\uC131\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.';
      try{
        const response=await fetch('/generate',{method:'GET',cache:'no-store'});
        const result=await response.json();
        if(!response.ok || !result.ok) throw new Error(result.message || '\uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.');
        // \uC0DD\uC131\uC774 \uB05D\uB09C \uB4A4 \uC804\uC6A9 \uBBF8\uB9AC\uBCF4\uAE30 \uD654\uBA74\uC744 \uBC14\uB85C \uC5FD\uB2C8\uB2E4.
        window.location.href='/preview';
      }catch(error){
        status.textContent='\uC0DD\uC131 \uC2E4\uD328: '+(error?.message || '\uC54C \uC218 \uC5C6\uB294 \uC624\uB958');
        button.disabled=false;
        button.textContent='\uC9C0\uAE08 \uAE00 1\uAC1C \uC0DD\uC131\uD558\uAE30';
      }
    }
  <\/script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
__name(renderLandingDashboard, "renderLandingDashboard");

// src/preview.ts
function escapeHtml3(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
__name(escapeHtml3, "escapeHtml");
function getBlog2(record) {
  return record?.blog ?? record?.content ?? {};
}
__name(getBlog2, "getBlog");
function renderBody(body, images) {
  const paragraphs = body.split(/\n\s*\n|\n/).map((item) => item.trim()).filter(Boolean);
  const output = [];
  const imageCount = Math.min(images.length, 3);
  paragraphs.forEach((paragraph, index) => {
    if (/^#{1,3}\s+/.test(paragraph)) {
      output.push(`<h2>${escapeHtml3(paragraph.replace(/^#{1,3}\s+/, ""))}</h2>`);
    } else {
      output.push(`<p>${escapeHtml3(paragraph)}</p>`);
    }
    const target = imageCount === 1 ? index === 2 ? 0 : -1 : imageCount === 2 ? index === 2 ? 0 : index === 6 ? 1 : -1 : index === 2 ? 0 : index === 5 ? 1 : index === 8 ? 2 : -1;
    if (target >= 0 && target < imageCount) {
      output.push(`<figure><img src="${escapeHtml3(images[target])}" alt="\uC0C1\uD488 \uC774\uBBF8\uC9C0 ${target + 1}" loading="lazy"><figcaption>\uC0C1\uD488 \uC774\uBBF8\uC9C0 ${target + 1}</figcaption></figure>`);
    }
  });
  for (let index = 0; index < imageCount; index++) {
    const marker = `\uC0C1\uD488 \uC774\uBBF8\uC9C0 ${index + 1}`;
    if (!output.some((item) => item.includes(marker))) {
      output.push(`<figure><img src="${escapeHtml3(images[index])}" alt="${marker}" loading="lazy"><figcaption>${marker}</figcaption></figure>`);
    }
  }
  return output.join("\n");
}
__name(renderBody, "renderBody");
async function renderPreview(env) {
  const record = await env.CONTENT_STORE.get("latest", "json");
  if (!record) {
    return new Response("\uBBF8\uB9AC \uBCFC \uC0DD\uC131 \uAE00\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uAE00\uC744 \uC0DD\uC131\uD574\uC8FC\uC138\uC694.", {
      status: 404,
      headers: { "Content-Type": "text/plain;charset=UTF-8" }
    });
  }
  const blog2 = getBlog2(record);
  const product = record?.recommendation?.product ?? {};
  const images = Array.isArray(blog2?.imageUrls) ? blog2.imageUrls.filter(Boolean).slice(0, 3) : product.productImage ? [product.productImage] : [];
  const title = blog2.selectedTitle ?? blog2.titles?.[0] ?? "\uC790\uB3D9 \uC0DD\uC131 \uCF58\uD150\uCE20";
  const partnerUrl = blog2.partnerUrl ?? blog2.productUrl ?? "";
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml3(title)} - \uBBF8\uB9AC\uBCF4\uAE30</title><style>
*{box-sizing:border-box}
body{margin:0;background:#f4f5f7;color:#222;font-family:Arial,"Noto Sans KR",sans-serif;line-height:1.8}
.wrap{max-width:760px;margin:auto;padding:24px 14px 60px}
.preview-bar{background:#111827;color:#fff;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:13px}
.post{background:#fff;border-radius:18px;padding:28px 24px;box-shadow:0 3px 18px rgba(0,0,0,.06)}
.section-label{font-size:12px;font-weight:800;letter-spacing:.04em;color:#6b7280;margin:0 0 8px}
.title-box{background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:22px}
.title-box h1{font-size:26px;line-height:1.45;margin:0;font-weight:800;color:#111827}
.title-copy{margin-top:10px;border:1px solid #d1d5db;background:#fff;border-radius:8px;padding:7px 11px;font-size:12px;font-weight:700;cursor:pointer}
.disclosure{background:#f8fafc;border-radius:10px;padding:12px 14px;color:#5b6470;font-size:12px;margin-bottom:22px}
.product{padding:14px;background:#f8fafc;border-radius:12px;margin:0 0 24px;font-size:13px}
.body-label{padding-top:4px;border-top:1px solid #eee;margin-bottom:14px}
.body{font-size:16px}
.body p{margin:0 0 18px}
h2{font-size:20px;line-height:1.5;margin:28px 0 12px;border-left:4px solid #111827;padding-left:10px}
figure{margin:26px 0 28px;text-align:center}
figure img{display:block;width:100%;max-height:460px;object-fit:contain;border-radius:12px;border:1px solid #e5e7eb;background:#fff}
figcaption{font-size:11px;color:#8a919b;margin-top:5px}
.partner{display:inline-block;margin-top:10px;padding:12px 18px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700}
.fact{margin-top:20px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;font-size:12px;color:#666}
@media(max-width:600px){.wrap{padding:16px 10px 40px}.post{padding:22px 17px}.title-box h1{font-size:23px}.body{font-size:15px}figure{margin:22px 0 26px}figure img{max-height:430px}}
</style></head><body><main class="wrap">
<div class="preview-bar">\u{1F4F1} \uAC8C\uC2DC \uC804 \uBBF8\uB9AC\uBCF4\uAE30 \xB7 \uC2E4\uC81C \uBE14\uB85C\uADF8\uC5D0 \uC62C\uB9AC\uAE30 \uC804 \uCD5C\uC885 \uD655\uC778\uC6A9</div>
<article class="post">
  <section class="title-box">
    <div class="section-label">\uAC8C\uC2DC \uC81C\uBAA9</div>
    <h1>${escapeHtml3(title)}</h1>
    <button class="title-copy" type="button" onclick="navigator.clipboard.writeText(${JSON.stringify(title).replace(/</g, "\\u003c")});this.textContent='\uBCF5\uC0AC \uC644\uB8CC'">\uC81C\uBAA9 \uBCF5\uC0AC</button>
  </section>
  <div class="disclosure">${escapeHtml3(blog2.disclosure ?? "")}</div>
  <div class="product"><strong>\uC120\uC815 \uC0C1\uD488</strong><br>${escapeHtml3(product.productName ?? "")}</div>
  <section class="body-section">
    <div class="section-label body-label">\uBCF8\uBB38</div>
    <div class="body">${renderBody(blog2.body ?? "", images)}</div>
  </section>
  ${partnerUrl ? `<a class="partner" href="${escapeHtml3(partnerUrl)}" target="_blank" rel="noopener noreferrer">\uC0C1\uD488 \uD655\uC778\uD558\uAE30</a>` : ""}
  <div class="fact">\uC0C1\uD488 \uC815\uBCF4\uC640 \uBC30\uC1A1 \uC870\uAC74\uC740 \uC0DD\uC131 \uB2F9\uC2DC \uCFE0\uD321 API \uAC80\uC0C9 \uACB0\uACFC\uB97C \uAE30\uC900\uC73C\uB85C \uC791\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC2E4\uC81C \uD310\uB9E4 \uD398\uC774\uC9C0\uC758 \uCD5C\uC2E0 \uC815\uBCF4\uC640 \uCC28\uC774\uAC00 \uC788\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</div>
</article></main></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}
__name(renderPreview, "renderPreview");

// src/quality-run.ts
async function validateLatestContent(env) {
  const latest = await env.CONTENT_STORE.get("latest", "json");
  const blog2 = latest?.blog;
  const product = latest?.recommendation?.product;
  if (!blog2 || !product?.productName) return null;
  const result = validateContentQuality({
    keyword: String(latest.keyword ?? ""),
    productName: String(product.productName),
    titles: blog2.titles,
    selectedTitle: blog2.selectedTitle,
    body: blog2.body
  });
  await env.CONTENT_STORE.put("latest:quality", JSON.stringify({ checkedAt: (/* @__PURE__ */ new Date()).toISOString(), ...result }));
  latest.quality = {
    ...latest.quality ?? {},
    ...result.metrics,
    score: result.score,
    passed: result.ok,
    reasons: result.reasons
  };
  await env.CONTENT_STORE.put("latest", JSON.stringify(latest));
  return result;
}
__name(validateLatestContent, "validateLatestContent");

// src/affiliate.ts
var COUPANG_HOST3 = "https://api-gateway.coupang.com";
var DEEPLINK_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";
async function createAuthorization2(env, method, path) {
  const signedDate = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(2);
  const message = signedDate + method.toUpperCase() + path;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.COUPANG_SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const signature = Array.from(new Uint8Array(signatureBuffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${signedDate}, signature=${signature}`;
}
__name(createAuthorization2, "createAuthorization");
async function createShortAffiliateLink(env, productId, subId) {
  const id = String(productId).trim();
  if (!/^\d+$/.test(id)) throw new Error("\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uCFE0\uD321 \uC0C1\uD488 ID\uC785\uB2C8\uB2E4.");
  const coupangUrl = `https://www.coupang.com/vp/products/${id}`;
  const body = { coupangUrls: [coupangUrl] };
  if (subId?.trim()) body.subId = subId.trim().slice(0, 50);
  const response = await fetch(`${COUPANG_HOST3}${DEEPLINK_PATH}`, {
    method: "POST",
    headers: {
      Authorization: await createAuthorization2(env, "POST", DEEPLINK_PATH),
      "Content-Type": "application/json;charset=UTF-8"
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`\uCFE0\uD321 Deeplink API \uC624\uB958 (${response.status}): ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const item = Array.isArray(data?.data) ? data.data[0] : null;
  const shortenUrl = typeof item?.shortenUrl === "string" ? item.shortenUrl.trim() : "";
  if (data?.rCode !== "0" || !shortenUrl) {
    throw new Error(`\uCFE0\uD321 Deeplink \uBCC0\uD658 \uC2E4\uD328: ${data?.rMessage || "\uB2E8\uCD95 \uB9C1\uD06C\uAC00 \uBC18\uD658\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."}`);
  }
  return shortenUrl;
}
__name(createShortAffiliateLink, "createShortAffiliateLink");

// src/generate.ts
var MANUAL_KEYWORDS = [
  "\uBB34\uC120\uCCAD\uC18C\uAE30",
  "\uCC28\uB7C9\uC6A9 \uCCAD\uC18C\uAE30",
  "\uCEA0\uD551\uC6A9\uD488",
  "\uC8FC\uBC29 \uC218\uB0A9\uC6A9\uD488",
  "\uC0DD\uD65C\uC6A9\uD488",
  "\uCEF4\uD4E8\uD130 \uC8FC\uBCC0\uAE30\uAE30",
  "\uBB34\uC120\uC774\uC5B4\uD3F0",
  "\uACF5\uAE30\uCCAD\uC815\uAE30",
  "\uC6B4\uB3D9\uC6A9\uD488",
  "\uCC28\uB7C9\uC6A9\uD488",
  "\uC5EC\uD589\uC6A9\uD488",
  "\uC695\uC2E4\uC6A9\uD488",
  "\uC870\uBA85\uC6A9\uD488",
  "\uBCF4\uC628\uC6A9\uD488",
  "\uBC18\uB824\uB3D9\uBB3C\uC6A9\uD488"
];
var MANUAL_KEYWORD_HISTORY = "history:manual-keywords";
var TREND_CACHE_KEY2 = "trend:today";
var MAX_MANUAL_KEYWORD_HISTORY = 30;
function getGenerateKeyword(request) {
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword")?.trim();
  return keyword ? keyword.slice(0, 100) : null;
}
__name(getGenerateKeyword, "getGenerateKeyword");
async function getManualKeyword(env, requestedKeyword) {
  if (requestedKeyword) return requestedKeyword;
  const history = await env.CONTENT_STORE.get(MANUAL_KEYWORD_HISTORY, "json");
  const daily = await env.CONTENT_STORE.get(TREND_CACHE_KEY2, "json");
  const used = /* @__PURE__ */ new Set([...history ?? [], daily?.keyword ?? ""]);
  const selected = MANUAL_KEYWORDS.find((keyword) => !used.has(keyword)) ?? MANUAL_KEYWORDS[0];
  const nextHistory = [...history ?? [], selected].slice(-MAX_MANUAL_KEYWORD_HISTORY);
  await env.CONTENT_STORE.put(MANUAL_KEYWORD_HISTORY, JSON.stringify(nextHistory));
  return selected;
}
__name(getManualKeyword, "getManualKeyword");
async function runWithManualKeyword(env, ctx, keyword) {
  const previousTrend = await env.CONTENT_STORE.get(TREND_CACHE_KEY2);
  const previousTrendExpiration = previousTrend ? 60 * 60 * 30 : void 0;
  await env.CONTENT_STORE.put(
    TREND_CACHE_KEY2,
    JSON.stringify({ date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), keyword, source: "manual" }),
    previousTrendExpiration ? { expirationTtl: previousTrendExpiration } : void 0
  );
  try {
    const controller = { scheduledTime: Date.now(), cron: "manual" };
    await index_default.scheduled(controller, env, ctx);
  } finally {
    if (previousTrend) {
      await env.CONTENT_STORE.put(TREND_CACHE_KEY2, previousTrend, { expirationTtl: previousTrendExpiration });
    } else {
      await env.CONTENT_STORE.delete(TREND_CACHE_KEY2);
    }
  }
}
__name(runWithManualKeyword, "runWithManualKeyword");
async function attachManualAffiliateLink(env) {
  const latest = await env.CONTENT_STORE.get("latest", "json");
  const productId = latest?.recommendation?.product?.productId;
  if (!productId) throw new Error("\uC0DD\uC131\uB41C \uCF58\uD150\uCE20\uC5D0\uC11C \uCFE0\uD321 \uC0C1\uD488 ID\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const subId = `flick-manual-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replaceAll("-", "")}`;
  const shortUrl = await createShortAffiliateLink(env, productId, subId);
  latest.blog = {
    ...latest.blog ?? {},
    partnerUrl: shortUrl,
    productUrl: shortUrl
  };
  latest.affiliate = {
    ...latest.affiliate ?? {},
    originalProductId: productId,
    shortUrl,
    subId,
    platform: "manual",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await env.CONTENT_STORE.put("latest", JSON.stringify(latest));
  return shortUrl;
}
__name(attachManualAffiliateLink, "attachManualAffiliateLink");
async function runManualGenerate(request, env, ctx) {
  const requestedKeyword = getGenerateKeyword(request);
  const manualKeyword = await getManualKeyword(env, requestedKeyword);
  try {
    await runWithManualKeyword(env, ctx, manualKeyword);
    const shortUrl = await attachManualAffiliateLink(env);
    const quality = await validateLatestContent(env);
    return Response.json({
      ok: true,
      message: "\uC218\uB3D9 \uCF58\uD150\uCE20 \uC0DD\uC131\uACFC \uD488\uC9C8 \uAC80\uC0AC \uBC0F \uB2E8\uCD95 \uB9C1\uD06C \uCC98\uB9AC\uAC00 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
      requestedKeyword,
      keyword: manualKeyword,
      shortUrl,
      quality
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958";
    return Response.json({ ok: false, message, requestedKeyword, keyword: manualKeyword }, { status: 500 });
  }
}
__name(runManualGenerate, "runManualGenerate");

// src/worker.ts
var DAILY_LOCK_PREFIX = "lock:daily:";
var DAILY_LOCK_TTL = 45 * 60;
var TISTORY_LATEST_KEY = "latest:tistory";
var USED_TITLES_KEY3 = "history:titles";
var MAX_TITLE_HISTORY = 120;
function getRunDate(controller) {
  return new Date(controller.scheduledTime).toISOString().slice(0, 10);
}
__name(getRunDate, "getRunDate");
function getLatestProduct(record) {
  const product = record?.recommendation?.product;
  if (!product?.productId || !product?.productName) return null;
  return { productId: product.productId, productName: product.productName, productPrice: product.productPrice ?? null, productImage: product.productImage ?? "", productUrl: product.productUrl ?? "", keyword: record.keyword ?? product.keyword ?? "", rank: product.rank ?? null, isRocket: Boolean(product.isRocket), isFreeShipping: Boolean(product.isFreeShipping) };
}
__name(getLatestProduct, "getLatestProduct");
async function saveTistoryContent(env, content, sourceRecord) {
  const now = /* @__PURE__ */ new Date();
  const record = { savedAt: now.toISOString(), keyword: sourceRecord.keyword ?? "", sourcePostKey: sourceRecord.savedAt ? `post:${sourceRecord.savedAt}` : null, content };
  const storageKey = `tistory:post:${now.toISOString()}`;
  await env.CONTENT_STORE.put(storageKey, JSON.stringify(record));
  await env.CONTENT_STORE.put(TISTORY_LATEST_KEY, JSON.stringify({ storageKey, ...record }));
  return { storageKey, record };
}
__name(saveTistoryContent, "saveTistoryContent");
async function saveTistoryTitleHistory(env, titles) {
  if (!Array.isArray(titles)) return;
  const current = await env.CONTENT_STORE.get(USED_TITLES_KEY3, "json");
  const validTitles = titles.filter((title) => typeof title === "string" && title.trim().length > 0).map((title) => title.trim());
  if (!validTitles.length) return;
  await env.CONTENT_STORE.put(USED_TITLES_KEY3, JSON.stringify([...current ?? [], ...validTitles].slice(-MAX_TITLE_HISTORY)));
}
__name(saveTistoryTitleHistory, "saveTistoryTitleHistory");
async function attachAffiliateLink(env, record, platform) {
  const product = record?.recommendation?.product;
  if (!product?.productId) return { record, shortUrl: "" };
  const subId = `flick-${platform}-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replaceAll("-", "")}`;
  const shortUrl = await createShortAffiliateLink(env, product.productId, subId);
  record.blog = { ...record.blog ?? {}, partnerUrl: shortUrl, productUrl: shortUrl };
  record.affiliate = { ...record.affiliate ?? {}, originalProductId: product.productId, shortUrl, subId, platform, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
  return { record, shortUrl };
}
__name(attachAffiliateLink, "attachAffiliateLink");
async function attachTistoryAffiliateLink(env, content, product) {
  if (!product?.productId) return { content, shortUrl: "" };
  const subId = `flick-tistory-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replaceAll("-", "")}`;
  const shortUrl = await createShortAffiliateLink(env, product.productId, subId);
  return { content: { ...content, partnerUrl: shortUrl, productUrl: shortUrl, affiliate: { originalProductId: product.productId, shortUrl, subId, platform: "tistory", createdAt: (/* @__PURE__ */ new Date()).toISOString() } }, shortUrl };
}
__name(attachTistoryAffiliateLink, "attachTistoryAffiliateLink");
var handler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      const showLatest = url.searchParams.get("view") === "latest" || request.headers.get("Cookie")?.includes("show_latest=1");
      if (!showLatest) return renderLandingDashboard();
      const response = await renderCombinedDashboard(env);
      if (!url.searchParams.get("view")) {
        const headers = new Headers(response.headers);
        headers.append("Set-Cookie", "show_latest=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      }
      return response;
    }
    if (url.pathname === "/preview") return renderPreview(env);
    if (url.pathname === "/generate-bootstrap") {
      try {
        const keyword = url.searchParams.get("keyword")?.trim() || "\uBB34\uC120\uCCAD\uC18C\uAE30";
        const result = await runBootstrap(env, keyword);
        return Response.json({ ok: true, message: "\uCD08\uAE30 \uCF58\uD150\uCE20 \uC0DD\uC131\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.", ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958";
        return Response.json({ ok: false, message }, { status: 500 });
      }
    }
    if (url.pathname === "/generate") {
      const response = await runManualGenerate(request, env, ctx);
      if (response.ok) {
        const headers = new Headers(response.headers);
        headers.append("Set-Cookie", "show_latest=1; Max-Age=120; Path=/; HttpOnly; SameSite=Lax");
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      }
      return response;
    }
    if (url.pathname === "/latest-tistory") {
      const latest = await env.CONTENT_STORE.get(TISTORY_LATEST_KEY, "json");
      return Response.json(latest ?? { ok: true, message: "\uC544\uC9C1 \uD2F0\uC2A4\uD1A0\uB9AC \uCF58\uD150\uCE20\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." });
    }
    return index_default.fetch(request, env, ctx);
  },
  /** 매일 오전 9시(한국시간)에 네이버 → 품질검사 → 단축 링크 → 티스토리 순서로 자동 생성합니다. */
  async scheduled(controller, env, ctx) {
    const runDate = getRunDate(controller);
    const lockKey = `${DAILY_LOCK_PREFIX}${runDate}`;
    if (await env.CONTENT_STORE.get(lockKey)) return;
    await env.CONTENT_STORE.put(lockKey, JSON.stringify({ startedAt: (/* @__PURE__ */ new Date()).toISOString(), cron: controller.cron }), { expirationTtl: DAILY_LOCK_TTL });
    try {
      await index_default.scheduled(controller, env, ctx);
      const quality = await validateLatestContent(env);
      if (quality && !quality.ok) {
        await env.CONTENT_STORE.put("last-run:quality", JSON.stringify({ status: "rejected", runDate, quality, finishedAt: (/* @__PURE__ */ new Date()).toISOString() }));
        return;
      }
      const latest = await env.CONTENT_STORE.get("latest", "json");
      if (latest?.recommendation?.product?.productId) {
        try {
          const linked = await attachAffiliateLink(env, latest, "naver");
          await env.CONTENT_STORE.put("latest", JSON.stringify(linked.record));
          await env.CONTENT_STORE.put("last-run:affiliate", JSON.stringify({ status: "success", runDate, platform: "naver", shortUrl: linked.shortUrl, finishedAt: (/* @__PURE__ */ new Date()).toISOString() }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958";
          await env.CONTENT_STORE.put("last-run:affiliate", JSON.stringify({ status: "error", runDate, platform: "naver", message, finishedAt: (/* @__PURE__ */ new Date()).toISOString() }));
        }
      }
      await env.CONTENT_STORE.put("last-run:quality", JSON.stringify({ status: "passed", runDate, quality, finishedAt: (/* @__PURE__ */ new Date()).toISOString() }));
      const latestWithLink = await env.CONTENT_STORE.get("latest", "json");
      const product = getLatestProduct(latestWithLink);
      if (product && quality?.ok) {
        try {
          const usedTitles = await env.CONTENT_STORE.get(USED_TITLES_KEY3, "json");
          const tistoryContent = await generateTistoryContent(env, product, latestWithLink.keyword ?? product.keyword ?? "", usedTitles ?? []);
          const linkedTistory = await attachTistoryAffiliateLink(env, tistoryContent, product);
          const saved = await saveTistoryContent(env, linkedTistory.content, latestWithLink);
          await saveTistoryTitleHistory(env, linkedTistory.content.titles);
          await env.CONTENT_STORE.put("last-run:tistory", JSON.stringify({ status: "success", runDate, storageKey: saved.storageKey, shortUrl: linkedTistory.shortUrl, finishedAt: (/* @__PURE__ */ new Date()).toISOString() }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958";
          await env.CONTENT_STORE.put("last-run:tistory", JSON.stringify({ status: "error", runDate, message, finishedAt: (/* @__PURE__ */ new Date()).toISOString() }));
        }
      }
    } finally {
      await env.CONTENT_STORE.delete(lockKey);
    }
  }
};
var worker_default = handler;
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
