/**
 * 쿠팡 상품 정보를 바탕으로 자연스러운 상품 소개 글을 만드는 템플릿입니다.
 *
 * 구성:
 * 제목 / 파트너스 문구 / 인사말 / 제품소개 / 추천이유 / 장점 / 단점
 * / 어디에 사용하면 좋은지 / 추천 사용처 / 파트너스 링크 / 마무리 인사
 *
 * 가격, 배송, 검색순위 등 구매 조건은 글에 넣지 않습니다.
 * 확인되지 않은 성능이나 스펙도 임의로 만들지 않습니다.
 */

export function buildProductPost(keyword: string, productName: string, researchEvidence: string[] = []) {
  const words = productName.split(/\s+/).filter(Boolean);

  // 상품명에서 제품의 용도나 형태를 설명할 수 있는 핵심 표현만 추립니다.
  const featurePattern = /LED|링라이트|조명|촬영|핸드폰|거치대|스탠드|높이조절|유튜브|수직촬영|캠핑|보온|은박|마라톤|계곡|등산|러닝|실버|방한|방풍|보온용품|주방|차량|청소|공기청정|이어폰|컴퓨터|주변기기|선물세트|무선|유선|충전|접이식|방수|대용량|휴대용|미니|대형|소형|USB|블루투스|자동|저소음|멀티|수납|정리|필터|살균|경량|휴대|여행|욕실|반려동물|사무용|가정용|차량용/i;
  const features = [...new Set(words.filter((word) => featurePattern.test(word)))];
  const featureText = features.slice(0, 6).join(", ");

  // 검색 자료는 상품과 직접 연결되는 경우에만 보조 근거로 사용합니다.
  const hasRelatedEvidence = researchEvidence.some((item) => {
    const text = item.toLowerCase();
    return words.some((word) => word.length >= 2 && text.includes(word.toLowerCase()));
  });

  const titles = [
    `${productName} 특징과 추천 사용처 알아보기`,
    `${productName} 어떤 점이 좋을까? 특징과 활용법 정리`,
    `${productName} 제품소개와 장단점, 추천 사용처`,
    `${keyword} 찾는다면 살펴볼 ${productName}`,
    `${productName} 어디에 활용하면 좋을까?`
  ];

  const productIntro = featureText
    ? `${productName}은 ${featureText}와 관련된 용도로 활용할 수 있는 제품입니다. 필요한 상황에서 어떤 용도로 사용할지 떠올리기 쉬운 제품이라 비슷한 상품을 비교할 때도 기준을 잡기 좋습니다. ${hasRelatedEvidence ? "확인 가능한 제품 관련 자료를 함께 참고해 기본적인 특징을 정리했습니다." : "확인되지 않은 세부 사양이나 성능은 임의로 추가하지 않았습니다."}`
    : `${productName}은 ${keyword}와 관련해 살펴볼 수 있는 제품입니다. 확인할 수 있는 제품 정보에서 벗어나지 않도록 기본적인 특징과 활용 방향을 중심으로 정리했습니다.`;

  const reason = featureText
    ? `${featureText.split(", ").slice(0, 3).join(", ")} 같은 용도로 사용할 제품을 찾고 있다면 후보로 살펴볼 만합니다. 사용하려는 공간과 목적이 분명하다면 비슷한 제품과 비교하면서 필요한 형태를 고르기 좋습니다.`
    : `${keyword}와 관련된 제품을 찾으면서 기본적인 제품 특징과 활용 방향을 먼저 살펴보고 싶은 경우 참고하기 좋습니다.`;

  const advantages = featureText
    ? `${featureText.split(", ").slice(0, 3).join(", ")}처럼 용도를 쉽게 떠올릴 수 있다는 점이 장점입니다. 필요한 목적이 분명하다면 여러 제품을 비교할 때 원하는 형태를 빠르게 찾는 데 도움이 됩니다.`
    : `찾고 있는 ${keyword}와 연결되는 제품이라 필요한 용도를 기준으로 비교해보기 좋다는 점이 장점입니다.`;

  // 확인되지 않은 단점을 사실처럼 단정하지 않고, 제품 특성에 맞는 고려사항만 씁니다.
  const disadvantages = features.includes("미니") || features.includes("소형")
    ? `작은 크기를 중심으로 찾는 제품인 만큼 넓은 공간이나 큰 물건을 다루는 용도가 필요하다면 사용 목적과 잘 맞는지 살펴보는 것이 좋습니다.`
    : features.includes("휴대용") || features.includes("휴대")
      ? `휴대성을 중심으로 보는 제품인 만큼 실제 사용 환경에서 크기와 구성, 휴대 방법이 편한지 확인해보는 것이 좋습니다.`
      : features.includes("무선")
        ? `무선 제품을 선택할 때는 사용 환경에 따라 충전 방식이나 필요한 구성 등이 중요한 기준이 될 수 있습니다.`
        : `현재 확인된 정보만으로는 세부 성능이나 구성까지 모두 판단하기 어렵다는 점은 고려할 필요가 있습니다. 필요한 기능이 있다면 상품 상세 정보에서 해당 내용을 확인해보는 것이 좋습니다.`;

  const goodPlace = featureText
    ? `${featureText.split(", ").slice(0, 5).join(", ")}가 필요한 공간이나 상황에 활용하기 좋습니다. 집에서 사용할지, 외출이나 작업 공간에서 사용할지처럼 실제 사용 환경을 먼저 정해두면 제품을 고르기 편합니다.`
    : `${keyword}와 관련된 제품이 필요한 일상적인 공간이나 작업 환경에서 활용 방향을 비교해보기 좋습니다.`;

  const recommendedUse = featureText
    ? `특히 ${featureText.split(", ").slice(0, 4).join(", ")} 용도로 찾고 있다면 우선 살펴볼 수 있습니다. 자주 사용할 상황을 기준으로 필요한 형태인지 비교해보세요.`
    : `${keyword}와 관련된 용도로 사용할 제품을 찾는 상황에서 추천해볼 수 있습니다. 사용 목적을 먼저 정한 뒤 비슷한 제품과 비교하면 선택하기가 편합니다.`;

  const body = [
    `파트너스 문구`,
    `이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.`,
    `인사말`,
    `안녕하세요. 오늘은 ${keyword}를 찾다가 함께 살펴볼 만한 ${productName}을 소개해드릴게요. 어렵게 비교하기보다는 어떤 제품인지, 어떤 상황에서 활용하기 좋은지 중심으로 자연스럽게 정리해보겠습니다.`,
    `제품소개`,
    productIntro,
    `추천이유`,
    reason,
    `장점`,
    advantages,
    `단점`,
    disadvantages,
    `어디에 사용하면 좋은지`,
    goodPlace,
    `추천 사용처`,
    recommendedUse,
    `파트너스 링크`,
    `관심이 있다면 아래 상품 확인하기 버튼을 통해 제품의 상세 정보와 실제 판매 페이지를 확인해보세요.`,
    `마무리 인사`,
    `오늘은 ${productName}의 특징과 활용하기 좋은 상황을 중심으로 살펴봤습니다. 필요한 용도와 잘 맞는 제품인지 비교해보시고, 본인에게 필요한 조건에 맞춰 선택해보세요. 읽어주셔서 감사합니다.`
  ].join("\n\n");

  return { titles, selectedTitle: titles[0], body };
}
