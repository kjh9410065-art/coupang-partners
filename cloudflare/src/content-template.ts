const DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

/**
 * 상품명에서 특징을 추출하지 않습니다.
 * 공개 조사 결과가 있을 때만 제품 정보를 설명합니다.
 * 가격/배송/검색순위는 본문에 넣지 않습니다.
 */
export function buildProductPost(keyword: string, productName: string, researchEvidence: string[] = []) {
  // 상품명 자체는 제품명으로만 사용하고 특징은 공개 조사 결과에서 가져옵니다.
  const evidence = [...new Set(researchEvidence
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter((x) => x && x !== productName.trim()))].slice(0, 3);
  const research = evidence.join(" ").slice(0, 1500);
  const hasResearch = research.length >= 20;

  const titles = [
    `${productName} 제품 소개와 추천 사용처`,
    `${productName} 제품 정보와 활용 방법`,
    `${productName} 어떤 분께 잘 맞을까?`,
    `${productName} 장점과 아쉬운 점 정리`,
    `${productName} 제품 소개부터 활용까지`,
  ];

  const intro = hasResearch
    ? `${productName}에 대해 공개 자료에서 확인되는 내용을 중심으로 살펴보겠습니다. ${research}`
    : `${productName}에 대해 현재 확인 가능한 공개 자료가 충분하지 않습니다. 확인되지 않은 기능이나 사양을 임의로 덧붙이지 않고 확인된 범위만 소개합니다.`;

  const reason = hasResearch
    ? `제품을 고를 때는 이름보다 실제 설명에 적힌 내용을 보는 것이 중요합니다. 이번 조사에서 확인된 정보와 본인이 찾는 용도가 맞는다면 후보로 살펴볼 수 있습니다. 특히 필요한 기능이나 사용 목적이 분명하다면 관련 설명을 먼저 비교해보는 방식이 좋습니다.`
    : `현재 확인된 자료만으로 특정 기능을 근거로 추천 이유를 단정하지 않았습니다. 필요한 용도를 먼저 정한 뒤 상세 정보를 확인하는 방식이 좋습니다.`;

  const advantages = hasResearch
    ? `공개 자료에서 확인되는 제품 정보가 있어 필요한 용도를 기준으로 비교할 수 있다는 점을 장점으로 볼 수 있습니다. 제품을 살펴볼 때 본인에게 필요한 조건과 조사된 내용을 나란히 비교하면 선택하기가 한결 편합니다.`
    : `확인되지 않은 기능을 장점으로 만들어내지 않았습니다. 실제로 필요한 조건을 정한 뒤 확인 가능한 상품 정보를 기준으로 비교하는 것이 좋습니다.`;

  const disadvantages = hasResearch
    ? `공개 자료만으로는 실제 사용감이나 사람마다 느끼는 편의성까지 판단하기 어렵습니다. 따라서 조사에서 확인되지 않은 부분을 단점이라고 단정하지 않고, 본인에게 중요한 조건이 상세 설명에 있는지 확인하는 방식으로 보는 것이 좋습니다.`
    : `현재 공개 자료가 부족해 특정 부분을 단점이라고 사실처럼 적지 않았습니다. 필요한 기능과 구성은 판매 페이지의 상세 정보를 기준으로 확인해야 합니다.`;

  const goodPlace = hasResearch
    ? `조사된 제품 설명에서 확인되는 용도가 필요한 공간에서 활용하기 좋습니다. 집에서 사용하는지, 개인 작업 공간에서 사용하는지처럼 실제 사용할 장소를 먼저 생각한 뒤 제품 정보와 맞춰보면 선택하기 편합니다.`
    : `구체적인 사용 장소는 확인된 제품 설명을 기준으로 정하는 것이 좋습니다. 평소 제품을 사용할 공간과 목적을 먼저 생각해보면 비교하기 편합니다.`;

  const recommendedUse = hasResearch
    ? `공개 자료에서 확인된 용도와 본인의 사용 목적이 일치하는 경우 추천 사용처로 고려해볼 수 있습니다. 비슷한 상품을 함께 비교할 때도 같은 기준으로 설명과 구성을 확인하면 본인에게 필요한 제품을 고르기 좋습니다.`
    : `현재 확인 가능한 자료만으로 특정 사용처를 임의로 추천하지 않았습니다. 실제 사용 목적과 판매 페이지에 안내된 용도가 맞는지 확인한 뒤 선택하는 것을 추천합니다.`;

  const body = [
    "인사말",
    `안녕하세요. 오늘은 ${keyword}와 관련해 살펴볼 만한 ${productName}을 소개해드릴게요. 복잡한 내용보다는 제품이 어떤 상품인지와 활용하기 좋은 상황을 중심으로 편하게 정리해보겠습니다.`,
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
    `오늘은 ${productName}을 확인 가능한 자료를 바탕으로 간단하게 살펴봤습니다. 필요한 용도와 잘 맞는지 천천히 비교해보시고, 관심이 있다면 상세 정보까지 확인해보세요. 읽어주셔서 감사합니다.`,
  ].join("\n\n");

  return { titles, selectedTitle: titles[0], body, disclosure: DISCLOSURE };
}
