export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface ProductResearch {
  productName: string;
  sources: ResearchSource[];
  evidence: string[];
  researchedAt: string;
}

export interface FactCheckResult {
  ok: boolean;
  score: number;
  reasons: string[];
  checkedClaims: string[];
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** 본문에서 수치/사양처럼 보이는 핵심 표현을 추출합니다. */
function extractClaims(body: string) {
  const patterns = [
    /\b\d+(?:\.\d+)?\s*(?:v|w|a|mah|mm|cm|m|kg|g|l|ml|인치|단|개|매|세트)\b/gi,
    /\d+(?:\.\d+)?\s*(?:볼트|와트|암페어|킬로그램|그램|리터|센티미터|밀리미터)/gi,
    /(?:높이|길이|폭|무게|용량|출력|전압|소비전력|배터리|재질|소재|방수|방진|충전|무선|유선|접이식|회전|각도|조절|수직촬영|거치|호환|지원)[^\n.!?]{0,45}/gi,
  ];
  const claims = new Set<string>();
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) {
      const claim = match[0].replace(/^[\s,.:;]+|[\s,.:;]+$/g, "").trim();
      if (claim.length >= 2 && claim.length <= 90) claims.add(claim);
    }
  }
  return [...claims].slice(0, 80);
}

/** 상품 API의 확정값과 웹 조사 결과를 함께 대조합니다. */
export function factCheckContent(input: {
  product: any;
  keyword: string;
  body: string;
  selectedTitle: string;
  research: ProductResearch;
}): FactCheckResult {
  const reasons: string[] = [];
  const claims = extractClaims(input.body);
  const corpus = normalize([
    input.product?.productName ?? "",
    input.research.productName,
    ...input.research.evidence,
    ...input.research.sources.map((source) => `${source.title} ${source.snippet}`),
  ].join("\n"));
  const body = normalize(input.body);

  if (!body.includes(normalize(String(input.product?.productName ?? "")))) {
    reasons.push("본문에 확인된 상품명이 포함되지 않았습니다.");
  }

  if (!input.research.sources.length && !input.research.evidence.length) {
    reasons.push("상품 외부 조사 결과가 없어 제품 특징을 검증할 근거가 없습니다.");
  }

  // 숫자/사양 주장은 조사 결과 또는 쿠팡 상품명에서 확인되는 경우에만 통과시킵니다.
  for (const claim of claims) {
    const normalizedClaim = normalize(claim);
    const compactClaim = normalizedClaim.replace(/\s+/g, "");
    const compactCorpus = corpus.replace(/\s+/g, "");
    if (!compactCorpus.includes(compactClaim)) {
      reasons.push(`확인되지 않은 상품 정보가 포함되었습니다: ${claim}`);
      if (reasons.length >= 6) break;
    }
  }

  // 배송/가격은 API 확정값과 다르면 사실 오류로 봅니다.
  const price = input.product?.productPrice;
  if (price && new RegExp(`${price.toLocaleString()}?\\s*원`).test(input.body.replaceAll(",", ""))) {
    // 현재 가격을 언급했다면 API 값과 일치하는 경우만 허용합니다.
  }

  if (/최저가|최저 가격|역대급|무조건|100% 만족|완벽|최고의 제품/i.test(input.body)) {
    reasons.push("검증할 수 없는 과장 표현이 포함되었습니다.");
  }

  const score = reasons.length ? Math.max(0, 100 - reasons.length * 15) : 100;
  return {
    ok: reasons.length === 0,
    score,
    reasons,
    checkedClaims: claims,
  };
}
