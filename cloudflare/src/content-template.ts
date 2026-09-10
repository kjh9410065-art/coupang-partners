/**
 * 쿠팡 상품 정보를 바탕으로 네이버 블로그용 상품 소개 글을 만듭니다.
 *
 * 고정 구성:
 * 제목 / 파트너스 문구 / 인사말 / 제품소개 / 추천이유 / 장점 / 단점
 * / 어디에 사용하면 좋은지 / 추천 사용처 / 파트너스 링크 / 마무리 인사
 *
 * 가격, 배송, 검색순위 같은 구매 조건은 본문에 넣지 않습니다.
 * 상품명과 확인된 정보로 설명할 수 없는 성능·스펙·후기는 만들지 않습니다.
 */

const DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

export function buildProductPost(keyword: string, productName: string, _researchEvidence: string[] = []) {
  const words = productName.split(/\s+/).filter(Boolean);

  // 상품명에 실제로 적혀 있는 표현만 제품 특징으로 사용합니다.
  const featurePattern = /LED|링라이트|조명|촬영|핸드폰|거치대|스탠드|높이조절|유튜브|수직촬영|캠핑|보온|은박|마라톤|계곡|등산|러닝|실버|방한|방풍|보온용품|주방|차량|청소|공기청정|이어폰|컴퓨터|주변기기|선물세트|무선|유선|충전|접이식|방수|대용량|휴대용|미니|대형|소형|USB|블루투스|자동|저소음|멀티|수납|정리|필터|살균|경량|휴대|여행|욕실|반려동물|사무용|가정용|차량용/i;
  const features = [...new Set(words.filter((word) => featurePattern.test(word)))].slice(0, 7);
  const mainFeatures = features.slice(0, 4);
  const featureText = mainFeatures.length ? mainFeatures.join(", ") : "상품명에 표시된 용도";

  const titles = [
    `${productName} 제품소개와 추천 사용처`,
    `${productName} 특징과 장단점 정리`,
    `${productName} 어떤 용도로 사용하면 좋을까?`,
    `${keyword} 관련 ${productName} 제품 살펴보기`,
    `${productName} 특징부터 활용 방법까지`
  ];

  // 확인되지 않은 스펙 대신 상품명에 드러난 특징을 자연스럽게 설명합니다.
  const productIntro = mainFeatures.length
    ? `${productName}은 상품명에서 ${featureText}와 같은 특징을 확인할 수 있는 제품입니다. 상품명에 표시된 내용을 기준으로 보면 ${featureText}와 관련된 용도로 살펴볼 수 있습니다. 세부 사양이나 구성은 상품 상세 페이지의 안내를 기준으로 확인하는 것이 좋습니다.`
    : `${productName}은 ${keyword}와 관련해 살펴볼 수 있는 제품입니다. 현재 확인되는 상품명을 기준으로 제품의 기본적인 용도와 활용 방향을 소개합니다. 세부 사양과 구성은 상품 상세 페이지의 안내를 기준으로 확인하는 것이 좋습니다.`;

  const reason = mainFeatures.length
    ? `${featureText}처럼 원하는 용도가 분명한 분이라면 상품명만으로도 어떤 방향의 제품인지 빠르게 파악할 수 있습니다. 특히 필요한 용도와 제품명에 표시된 특징이 잘 맞는지 비교해보고 선택하기 좋습니다.`
    : `${keyword}와 관련된 제품을 찾으면서 먼저 기본적인 용도와 활용 방향을 확인하고 싶은 분이라면 살펴볼 만합니다.`;

  const advantages = mainFeatures.length
    ? `상품명에서 ${featureText}와 같은 주요 특징을 한눈에 확인할 수 있다는 점이 장점입니다. 필요한 용도가 명확하다면 비슷한 상품을 비교할 때 원하는 형태의 제품을 찾기 편합니다.`
    : `제품명에서 ${keyword}와 관련된 상품이라는 점을 바로 확인할 수 있어 필요한 용도를 기준으로 비교하기 편합니다.`;

  // 상품의 실제 결함을 확인할 수 없으므로 단점을 지어내지 않고 확인할 점으로 표현합니다.
  const disadvantages = mainFeatures.length
    ? `상품명만으로는 ${featureText}의 세부 사양이나 실제 구성까지 알 수 없다는 점은 확인할 필요가 있습니다. 필요한 기능이나 구성품이 있다면 구매 전에 상품 상세 페이지에서 해당 내용을 확인하는 것이 좋습니다.`
    : `상품명만으로는 세부 사양과 구성까지 모두 확인하기 어렵습니다. 필요한 기능이나 구성품이 있다면 상품 상세 페이지에서 해당 내용을 확인하는 것이 좋습니다.`;

  const goodPlace = mainFeatures.length
    ? `${featureText}와 관련된 작업이나 콘텐츠를 준비하는 공간에서 활용하기 좋습니다. 집이나 작업 공간, 차량, 야외 등 실제로 사용할 환경을 먼저 생각해보면 제품의 활용도를 판단하기 쉽습니다.`
    : `${keyword}와 관련된 용도가 필요한 일상 공간이나 작업 환경에서 활용하기 좋습니다.`;

  const recommendedUse = mainFeatures.length
    ? `특히 ${featureText} 용도로 사용할 계획이 있다면 추천 사용처로 생각해볼 수 있습니다. 본인이 자주 사용할 상황과 상품명에 표시된 용도가 맞는지 확인해보세요.`
    : `${keyword}와 관련된 제품이 필요한 상황에서 기본적인 활용처를 비교해보고 선택하는 용도로 추천합니다.`;

  // 네이버에 붙여 넣었을 때 읽기 쉽도록 섹션을 분리하되, 문장 자체는 자연스럽게 작성합니다.
  const body = [
    "파트너스 문구",
    DISCLOSURE,
    "인사말",
    `안녕하세요. 오늘은 ${keyword}와 관련해 살펴볼 만한 ${productName}을 소개해드릴게요. 상품명에서 확인되는 특징을 중심으로 어떤 제품인지 편하게 정리해보겠습니다.`,
    "제품소개",
    productIntro,
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
    "관심이 있다면 아래 상품 확인하기 버튼을 통해 제품의 상세 정보를 직접 확인해보세요.",
    "마무리 인사",
    `오늘은 ${productName}의 특징과 활용하기 좋은 상황을 중심으로 살펴봤습니다. 필요한 용도와 잘 맞는지 확인해보시고 본인에게 맞는 제품인지 비교해보세요. 읽어주셔서 감사합니다.`
  ].join("\n\n");

  return { titles, selectedTitle: titles[0], body, disclosure: DISCLOSURE };
}
