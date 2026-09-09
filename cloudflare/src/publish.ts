/**
 * 실제 외부 블로그에 게시하기 전에 콘텐츠가 게시 가능한 상태인지 판정합니다.
 *
 * 이 모듈은 '게시 API 호출'을 하지 않습니다.
 * 품질검사, 고지문, 파트너 링크, 상품 이미지 등 기본 조건을 모두 확인한 뒤
 * publishReady=true인 콘텐츠만 다음 게시 단계로 넘길 수 있게 만드는 안전장치입니다.
 */

export interface PublishCheckInput {
  platform: string;
  disclosure?: string;
  productUrl?: string;
  selectedTitle?: string;
  body?: string;
  productImage?: string;
  quality?: {
    ok?: boolean;
    score?: number;
  };
}

export interface PublishCheckResult {
  publishReady: boolean;
  reasons: string[];
  checkedAt: string;
}

/** 게시에 필요한 최소 조건을 검사합니다. */
export function checkPublishReady(input: PublishCheckInput): PublishCheckResult {
  const reasons: string[] = [];
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const title = typeof input.selectedTitle === "string" ? input.selectedTitle.trim() : "";
  const disclosure = typeof input.disclosure === "string" ? input.disclosure.trim() : "";
  const productUrl = typeof input.productUrl === "string" ? input.productUrl.trim() : "";
  const productImage = typeof input.productImage === "string" ? input.productImage.trim() : "";

  if (!input.platform) reasons.push("플랫폼 정보가 없습니다.");
  if (!title) reasons.push("선정 제목이 없습니다.");
  if (!body) reasons.push("본문이 없습니다.");
  if (!disclosure) reasons.push("파트너스 고지문이 없습니다.");
  if (!productUrl || !/^https?:\/\//i.test(productUrl)) reasons.push("파트너 상품 링크가 없습니다.");
  if (!productImage || !/^https?:\/\//i.test(productImage)) reasons.push("대표 상품 이미지가 없습니다.");
  if (input.quality?.ok !== true) reasons.push("콘텐츠 품질검사를 통과하지 못했습니다.");
  if (typeof input.quality?.score === "number" && input.quality.score < 75) reasons.push("품질 점수가 게시 기준보다 낮습니다.");

  return {
    publishReady: reasons.length === 0,
    reasons,
    checkedAt: new Date().toISOString(),
  };
}
