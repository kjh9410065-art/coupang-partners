/**
 * AI를 사용하지 못하는 경우에도 상품명에서 확인 가능한 정보만으로
 * 자연스러운 상품 소개 글을 만드는 안전한 템플릿입니다.
 */

export function buildProductPost(keyword: string, productName: string, researchEvidence: string[] = []) {
  const nameParts = productName.split(/\s+/).filter(Boolean);

  // 상품명에 실제로 들어 있는 용도/특징 표현만 추립니다.
  const featurePattern = /LED|링라이트|조명|촬영|핸드폰|거치대|스탠드|높이조절|유튜브|수직촬영|캠핑|보온|은박|마라톤|계곡|등산|러닝|실버|방한|방풍|보온용품|주방|차량|청소|공기청정|이어폰|컴퓨터|주변기기|선물세트|명절|무선|유선|충전|접이식|방수|대용량|휴대용|미니|대형|소형|USB|블루투스|자동|저소음|멀티|수납|정리|필터|살균|경량|휴대|여행|욕실|반려동물|사무용|가정용|차량용/i;
  const features = [...new Set(nameParts.filter((word) => featurePattern.test(word)))];
  const featureText = features.length ? features.join(", ") : productName;

  // 조사 자료가 상품과 직접 연결되는 경우에만 '확인했다'고 표현합니다.
  const hasEvidence = researchEvidence.some((item) => {
    const lower = item.toLowerCase();
    const tokens = nameParts.filter((word) => word.length >= 2).map((word) => word.toLowerCase());
    return tokens.some((token) => lower.includes(token));
  });

  const titles = [
    `${productName} 특징과 활용법 알아보기`,
    `${keyword} 찾는다면 ${productName} 어떤 상품일까?`,
    `${productName} 제품 특징과 추천 사용처 정리`,
    `${keyword} 관련 ${productName} 장점과 활용 방법`,
    `${productName} 어디에 사용하면 좋을까?`
  ];

  const body = [
    `안녕하세요. 오늘은 ${keyword} 검색에서 확인한 ${productName}을 소개해보겠습니다. 상품명에 표시된 내용과 확인 가능한 자료를 바탕으로 어떤 특징이 있는지, 어디에 활용하기 좋은지 중심으로 자연스럽게 정리해볼게요.`,
    `## 제품소개`,
    `${productName}은 상품명에서 ${featureText} 등의 특징과 용도가 확인되는 제품입니다. 특히 ${features.length ? `${features.slice(0, 4).join(", ")}와 같이 사용 목적이 비교적 분명하게 표시되어 있습니다.` : "상품명만으로는 구체적인 세부 사양을 확인하기 어려운 제품입니다."} ${hasEvidence ? "공개된 제품 자료에서도 상품과 관련된 정보를 확인해 글에 반영했습니다." : "확인되지 않은 세부 사양은 임의로 덧붙이지 않았습니다."} 상품을 고를 때는 이름에서 보이는 핵심 용도와 실제 필요한 상황이 잘 맞는지 먼저 살펴보면 좋습니다.`,
    `## 추천이유`,
    `이 제품을 살펴볼 만한 이유는 상품명에 사용 목적이 비교적 분명하게 드러나 있기 때문입니다. ${features.length ? `${features.slice(0, 3).join(", ")}처럼 필요한 용도를 찾고 있다면 비슷한 상품과 비교해보기 좋습니다.` : `${keyword}와 관련된 상품을 찾으면서 상품 자체의 정보를 먼저 확인하고 싶은 경우 살펴볼 수 있습니다.`} 처음부터 모든 세부 정보를 판단하기보다 필요한 용도를 기준으로 후보를 좁혀보는 방식이 편합니다.`,
    `## 장점`,
    `가장 눈에 띄는 장점은 ${features.length ? `${features.slice(0, 3).join(", ")}처럼 상품명에서 확인되는 용도가 구체적이라는 점입니다.` : "검색 주제와 연결되는 상품이라는 점입니다."} 필요한 목적이 분명한 경우 상품명을 보고 후보를 빠르게 좁혀볼 수 있습니다. 또한 어떤 용도로 소개되는 제품인지 한눈에 파악하기 쉽다는 점도 장점으로 볼 수 있습니다.`,
    `## 단점`,
    `반대로 상품명만으로는 ${features.length ? "세부 성능이나 실제 구성" : "구체적인 기능과 구성"}까지 모두 확인하기 어렵습니다. 따라서 필요한 기능이나 구성품이 있는 경우에는 상품 상세 페이지에서 해당 내용을 추가로 확인하는 과정이 필요합니다. 상품명에서 확인되는 특징과 실제 상세 정보는 구분해서 보는 것이 좋습니다.`,
    `## 어디에 사용하면 좋은지`,
    `${features.length ? `${features.slice(0, 5).join(", ")}와 같은 용도로 표시된 만큼, 해당 목적의 제품을 찾는 상황에서 먼저 살펴보기 좋습니다.` : `${keyword}와 관련된 제품을 찾고 있고 상품의 기본적인 용도를 비교하고 싶은 상황에서 살펴보기 좋습니다.`} 실제 사용 환경에 필요한 조건이 무엇인지 먼저 정해두면 비슷한 상품을 비교할 때도 편합니다.`,
    `## 추천 사용처`,
    `${features.length ? `상품명에 표시된 ${features.slice(0, 5).join(", ")} 관련 상황을 우선 추천 사용처로 볼 수 있습니다.` : `현재 검색 주제인 ${keyword}와 관련된 일상적인 사용 환경에서 비교해볼 수 있습니다.`} 필요한 용도가 명확하다면 비슷한 상품을 함께 살펴보면서 본인에게 맞는 구성을 비교해보세요. 상품명만으로 확인되지 않는 세부 조건은 실제 상품 상세 정보와 옵션을 기준으로 판단하는 것이 좋습니다.`,
    `## 파트너스 링크`,
    `관심이 있다면 아래 파트너스 링크를 통해 현재 판매 페이지에서 상품의 상세 정보와 선택 가능한 옵션을 직접 확인해보세요.`,
    `## 마무리 인사`,
    `오늘은 ${productName}의 이름에서 확인되는 특징과 활용처를 중심으로 정리해봤습니다. 필요한 용도와 맞는지 차분히 비교해보시고, 본인에게 필요한 조건을 기준으로 선택해보시면 좋겠습니다. 읽어주셔서 감사합니다.`
  ].join("\n\n");

  return { titles, selectedTitle: titles[0], body };
}
