const DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

/**
 * 상품명에서 특징을 추출하지 않습니다.
 * 공개 조사 결과가 있을 때만 제품 설명의 근거로 사용합니다.
 * 가격/배송/검색순위는 본문에 넣지 않습니다.
 */
export function buildProductPost(keyword: string, productName: string, researchEvidence: string[] = []) {
  const evidence = [...new Set(researchEvidence
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean))].slice(0, 3);
  const research = evidence.join(" ").slice(0, 1400);
  const hasResearch = research.length >= 20;

  const titles = [
    `${productName} 제품 소개와 추천 사용처`,
    `${productName} 제품 정보와 활용 방법`,
    `${productName} 어떤 분께 잘 맞을까?`,
    `${productName} 장점과 아쉬운 점 정리`,
    `${productName} 제품 소개부터 활용까지`,
  ];

  const intro = hasResearch
    ? `공개 조사에서 확인된 제품 정보는 다음과 같습니다. ${research}`
    : `현재 공개 조사에서 제품의 구체적인 특징을 충분히 확인하지 못했습니다. 확인되지 않은 기능이나 사양은 임의로 추가하지 않았습니다.`;

  const reason = hasResearch
    ? `공개 자료에서 확인되는 내용이 본인이 찾는 용도와 맞는다면 비교해볼 만합니다. ${research.slice(0, 450)}`
    : "현재 확인된 자료만으로 특정 기능을 근거로 추천 이유를 만들지 않았습니다.";

  const advantages = hasResearch
    ? `공개 자료에서 확인되는 제품 정보를 바탕으로 필요한 용도와 비교하기 좋습니다. ${research.slice(0, 400)}`
    : "확인되지 않은 기능을 장점으로 만들어내지 않았습니다.";

  const disadvantages = hasResearch
    ? "공개 자료만으로 실제 사용감이나 개인별 불편함까지 판단하기는 어렵습니다. 확인되지 않은 부분을 단점이라고 임의로 단정하지 않았습니다."
    : "현재 공개 자료가 부족해 특정 부분을 단점이라고 단정하지 않았습니다.";

  const goodPlace = hasResearch
    ? "공개 자료에서 확인된 용도와 실제 사용 목적이 맞는 공간에서 활용하기 좋습니다. 집이나 작업 공간 등 본인이 제품을 사용할 장소와 제품 정보를 함께 비교해보세요."
    : "구체적인 사용 장소는 확인된 제품 설명을 기준으로 정하는 것이 좋습니다.";

  const recommendedUse = hasResearch
    ? "공개 자료에서 확인된 용도와 본인의 사용 목적이 맞는 경우 추천 사용처로 고려해볼 수 있습니다. 비슷한 제품을 비교할 때도 확인된 정보를 기준으로 선택해보세요."
    : "현재 확인 가능한 자료만으로 특정 사용처를 임의로 추천하지 않았습니다.";

  const body = [
    "인사말",
    `안녕하세요. 오늘은 ${productName}을 제품 정보와 활용 방법 중심으로 편하게 소개해드릴게요.`,
    "제품소개",
    intro,
    "추천이유",
    reason,
    "장점",
    advantages,
    "단점",
    disadvantages,
    "어디에 사용하면 좋은지",
    goodPlace,
    "추천 사용처",
    recommendedUse,
    "파트너스 링크",
    "관심이 있다면 아래 상품 확인하기 버튼을 통해 판매 페이지의 상세 정보를 확인해보세요.",
    "마무리 인사",
    `오늘은 ${productName}에 대해 확인 가능한 내용을 중심으로 정리해봤습니다. 필요한 용도와 잘 맞는지 편하게 비교해보세요. 읽어주셔서 감사합니다.`,
  ].join("\n\n");

  return { titles, selectedTitle: titles[0], body, disclosure: DISCLOSURE };
}
