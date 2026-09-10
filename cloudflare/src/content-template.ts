/**
 * 쿠팡 상품 정보를 바탕으로 자연스러운 상품 소개 글을 만드는 템플릿입니다.
 *
 * 구성:
 * 제목 / 파트너스 문구 / 인사말 / 제품소개 / 추천이유 / 장점 / 단점
 * / 어디에 사용하면 좋은지 / 추천 사용처 / 파트너스 링크 / 마무리 인사
 *
 * 가격, 배송, 검색순위 등 구매 조건은 글에 넣지 않습니다.
 * 확인되지 않은 성능이나 스펙은 임의로 만들지 않습니다.
 */

export function buildProductPost(keyword: string, productName: string, researchEvidence: string[] = []) {
  const words = productName.split(/\s+/).filter(Boolean);

  // 상품명에 실제로 포함된 표현만 뽑아 제품 설명의 핵심 재료로 사용합니다.
  const featurePattern = /LED|링라이트|조명|촬영|핸드폰|거치대|스탠드|높이조절|유튜브|수직촬영|캠핑|보온|은박|마라톤|계곡|등산|러닝|실버|방한|방풍|보온용품|주방|차량|청소|공기청정|이어폰|컴퓨터|주변기기|선물세트|무선|유선|충전|접이식|방수|대용량|휴대용|미니|대형|소형|USB|블루투스|자동|저소음|멀티|수납|정리|필터|살균|경량|휴대|여행|욕실|반려동물|사무용|가정용|차량용/i;
  const features = [...new Set(words.filter((word) => featurePattern.test(word)))].slice(0, 7);
  const featureText = features.join(", ");
  const mainFeatures = features.slice(0, 4);

  // 외부 조사에서 상품과 직접 연결되는 문장을 찾아 설명을 보강합니다.
  const evidenceSentences = researchEvidence
    .flatMap((item) => item.split(/[.!?。！？]+/).map((s) => s.trim()))
    .filter((sentence) => sentence.length >= 12 && words.some((word) => word.length >= 2 && sentence.toLowerCase().includes(word.toLowerCase())))
    .slice(0, 3);

  const evidenceText = evidenceSentences.length
    ? evidenceSentences.join(" ")
    : "";

  const titles = [
    `${productName} 특징과 추천 사용처`,
    `${productName} 제품소개와 장단점 알아보기`,
    `${productName} 어떤 용도로 좋을까?`,
    `${keyword} 찾는다면 살펴볼 ${productName}`,
    `${productName} 활용하기 좋은 상황 정리`
  ];

  const productIntro = featureText
    ? `${productName}은 상품명에서 ${featureText}와 관련된 특징을 확인할 수 있는 제품입니다. 특히 ${mainFeatures.join(", ")}처럼 이름에 표시된 용도를 중심으로 살펴볼 수 있습니다.${evidenceText ? ` 관련 검색 자료에서도 제품과 연결되는 내용을 확인해 기본적인 소개에 참고했습니다.` : ""}`
    : `${productName}은 ${keyword}와 관련해 살펴볼 수 있는 제품입니다. 현재 확인되는 상품명과 조사 자료를 기준으로 제품의 용도와 활용 방향을 정리했습니다.`;

  const reason = mainFeatures.length
    ? `${mainFeatures.join(", ")}처럼 특정 용도로 사용할 제품을 찾고 있다면 관심 있게 살펴볼 만합니다. 여러 기능을 무작정 나열하기보다 실제로 필요한 용도와 제품명에 표시된 특징이 맞는지를 기준으로 선택하기 좋습니다.`
    : `${keyword}와 관련된 제품을 찾으면서 제품의 기본적인 용도와 활용 방향을 먼저 확인하고 싶은 경우 살펴볼 만합니다.`;

  const advantages = mainFeatures.length
    ? `${mainFeatures.join(", ")}처럼 제품의 용도를 상품명에서 비교적 쉽게 파악할 수 있다는 점이 장점입니다. 필요한 용도가 분명하다면 비슷한 상품을 살펴볼 때 원하는 형태를 빠르게 좁혀볼 수 있습니다.`
    : `제품명을 통해 ${keyword}와의 관련성을 바로 확인할 수 있어 필요한 용도를 기준으로 비교하기 좋다는 점이 장점입니다.`;

  // 실제 상품의 결함을 알 수 없으므로 단점을 지어내지 않고 확인이 필요한 부분으로 작성합니다.
  const disadvantages = features.includes("무선")
    ? `무선 방식이 실제 사용 환경에 잘 맞는지 확인할 필요가 있습니다. 충전 방식과 사용 시간처럼 상품명만으로 알 수 없는 세부 정보는 상세 페이지에서 확인하는 것이 좋습니다.`
    : features.includes("휴대용") || features.includes("휴대")
      ? `휴대용으로 사용할 목적이라면 실제 크기와 무게, 구성품이 사용 환경에 적합한지 확인할 필요가 있습니다. 이런 세부 정보는 상품 상세 페이지에서 확인하는 것이 좋습니다.`
      : features.includes("미니") || features.includes("소형")
        ? `작은 형태를 찾는 용도에는 잘 맞을 수 있지만 실제 크기와 구성은 상품명만으로 판단하기 어렵습니다. 필요한 공간에 맞는지 상세 정보를 확인하는 것이 좋습니다.`
        : `상품명만으로는 세부 사양이나 구성까지 모두 알 수 없다는 점은 고려할 부분입니다. 필요한 기능이나 구성품이 있다면 상품 상세 페이지에서 해당 내용을 확인하는 것이 좋습니다.`;

  const goodPlace = mainFeatures.length
    ? `${mainFeatures.join(", ")} 같은 용도가 필요한 공간에서 활용하기 좋습니다. 집, 작업 공간, 차량, 야외처럼 실제로 사용할 장소를 먼저 떠올려보면 제품이 필요한 상황인지 판단하기 편합니다.`
    : `${keyword}와 관련된 용도가 필요한 일상 공간이나 작업 환경에서 활용하기 좋습니다.`;

  const recommendedUse = mainFeatures.length
    ? `특히 ${mainFeatures.join(", ")} 용도로 사용할 계획이 있다면 추천 사용처로 생각해볼 수 있습니다. 본인이 자주 사용할 상황과 제품명에 표시된 용도가 잘 맞는지 확인해보세요.`
    : `${keyword}와 관련된 제품이 필요한 상황에서 기본적인 활용처를 비교해보고 선택하는 용도로 추천합니다.`;

  const body = [
    `파트너스 문구`,
    `이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.`,
    `인사말`,
    `안녕하세요. 오늘은 ${keyword}와 관련해 살펴볼 만한 ${productName}을 소개해드릴게요. 제품명에서 확인되는 특징을 중심으로 어떤 제품인지 간단하고 자연스럽게 정리해보겠습니다.`,
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
    `관심이 있다면 아래 상품 확인하기 버튼을 통해 현재 판매 페이지에서 제품의 상세 정보를 확인해보세요.`,
    `마무리 인사`,
    `오늘은 ${productName}의 특징과 활용하기 좋은 상황을 중심으로 살펴봤습니다. 필요한 용도와 잘 맞는지 확인해보시고, 본인에게 맞는 제품인지 천천히 비교해보세요. 읽어주셔서 감사합니다.`
  ].join("\n\n");

  return { titles, selectedTitle: titles[0], body };
}
