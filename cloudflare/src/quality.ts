/**
 * 자동 생성 콘텐츠의 최소 품질을 검사하는 모듈입니다.
 * 90점 이상만 통과하도록 하며, 생성 단계에서 재생성 여부를 판단합니다.
 */

export interface QualityInput {
  keyword: string;
  productName: string;
  titles: unknown;
  selectedTitle: unknown;
  body: unknown;
}

export interface QualityResult {
  ok: boolean;
  score: number;
  reasons: string[];
  metrics: {
    bodyLength: number;
    titleCount: number;
    uniqueTitleCount: number;
    repeatedPhraseCount: number;
    forbiddenPhraseCount: number;
  };
}

// 실제 광고/후기처럼 오해될 가능성이 높은 표현은 자동 생성 글에서 차단합니다.
const FORBIDDEN_PATTERNS = [
  /내돈내산/i,
  /직접\s*(써|사용)해보/i,
  /써보니/i,
  /사용해보니/i,
  /무조건/i,
  /100%\s*만족/i,
  /최저가/i,
  /역대급/i,
  /대박/i,
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^0-9a-z가-힣]+/gi, "").trim();
}

function titleSimilarity(a: string, b: string) {
  const left = new Set(normalize(a).match(/[가-힣]{2,}|[a-z0-9]{2,}/gi) ?? []);
  const right = new Set(normalize(b).match(/[가-힣]{2,}|[a-z0-9]{2,}/gi) ?? []);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common++;
  return common / Math.max(left.size, right.size);
}

function countRepeatedPhrases(body: string) {
  const sentences = body.split(/[.!?。！？\n]+/).map((item) => normalize(item)).filter((item) => item.length >= 18);
  let repeated = 0;
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) if (sentences[i] === sentences[j]) repeated++;
  }
  return repeated;
}

/** 생성된 콘텐츠의 품질을 검사합니다. 90점 이상이고 오류가 없어야 통과합니다. */
export function validateContentQuality(input: QualityInput): QualityResult {
  const titles = Array.isArray(input.titles)
    ? input.titles.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const selectedTitle = typeof input.selectedTitle === "string" ? input.selectedTitle.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const productName = input.productName.trim();
  const reasons: string[] = [];

  const normalizedTitles = titles.map(normalize);
  const uniqueTitleCount = new Set(normalizedTitles).size;
  const repeatedPhraseCount = countRepeatedPhrases(body);
  const forbiddenPhraseCount = FORBIDDEN_PATTERNS.reduce((count, pattern) => count + (pattern.test(body) ? 1 : 0), 0);
  const normalizedBody = normalize(body);
  const normalizedProduct = normalize(productName);
  const normalizedKeyword = normalize(input.keyword);

  if (titles.length !== 5) reasons.push("제목이 정확히 5개가 아닙니다.");
  if (uniqueTitleCount < 4) reasons.push("제목 후보가 서로 지나치게 비슷합니다.");
  if (!selectedTitle || !titles.some((title) => normalize(title) === normalize(selectedTitle))) reasons.push("선정 제목이 제목 후보에 없습니다.");
  if (body.length < 1400) reasons.push("본문이 너무 짧습니다.");
  if (body.length > 5000) reasons.push("본문이 지나치게 깁니다.");
  if (productName && !normalizedBody.includes(normalizedProduct)) reasons.push("본문에 상품명이 없습니다.");
  if (normalizedKeyword && !normalizedBody.includes(normalizedKeyword) && !normalizedProduct.includes(normalizedKeyword)) reasons.push("검색 주제와 본문의 연결이 약합니다.");
  if (repeatedPhraseCount > 0) reasons.push("동일한 문장이 반복됩니다.");
  if (forbiddenPhraseCount > 0) reasons.push("금지 또는 과장 표현이 포함되어 있습니다.");

  let highlySimilarPairs = 0;
  for (let i = 0; i < titles.length; i++) {
    for (let j = i + 1; j < titles.length; j++) if (titleSimilarity(titles[i], titles[j]) >= 0.9) highlySimilarPairs++;
  }
  if (highlySimilarPairs > 0) reasons.push("제목 구조가 반복됩니다.");

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
    metrics: { bodyLength: body.length, titleCount: titles.length, uniqueTitleCount, repeatedPhraseCount, forbiddenPhraseCount },
  };
}
