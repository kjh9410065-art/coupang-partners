export interface ProductPost {
  titles: string[];
  selectedTitle: string;
  body: string;
}

/** 쿠팡 상품 정보를 바탕으로 제목 5개와 안전한 상품 소개형 본문을 생성합니다. */
export function buildProductPost(keyword: string, productName: string, evidence: string[] = []): ProductPost {
  const topic = clean(keyword) || "생활용품";
  const product = clean(productName) || topic;
  const titles = [
    `${topic} 고를 때 살펴볼 점과 상품 정보 정리`,
    `${topic} 찾는 분들을 위한 제품 선택 기준`,
    `${topic} 상품을 비교하기 전에 확인할 내용`,
    `${topic} 일상에서 활용하기 좋은 제품 살펴보기`,
    `${topic} 구매 전 알아두면 좋은 체크포인트`,
  ];
  const evidenceText = evidence
    .filter((item) => typeof item === "string" && item.trim())
    .slice(0, 2)
    .map((item) => clean(item).slice(0, 180))
    .join(" ");
  const body = [
    `${topic}을 찾고 있다면 상품명만 보고 바로 결정하기보다 어떤 상황에서 사용할지 먼저 정해두는 편이 좋습니다. 이번 글에서는 ${product}을 중심으로 제품을 살펴볼 때 확인하면 좋은 기준을 간단하게 정리합니다.`,
    `먼저 사용 목적을 생각해 보는 것이 좋습니다. 같은 ${topic} 카테고리라도 집에서 자주 사용하는지, 이동하면서 사용할지, 책상이나 특정 공간에 둘지에 따라 중요하게 보는 부분이 달라질 수 있습니다. 필요한 조건을 미리 정해두면 불필요한 비교를 줄일 수 있습니다.`,
    `다음으로 제품의 형태와 관리 방법을 살펴보는 것이 좋습니다. 자주 꺼내 쓰는 물건이라면 보관하기 편한지, 손이 닿는 부분을 관리하기 쉬운지, 사용하지 않을 때 공간을 많이 차지하지 않는지 등을 확인하면 실제 생활에서의 편의성을 판단하는 데 도움이 됩니다.`,
    `${product}을 볼 때에는 판매 페이지에 표시된 공식 상품명과 제공 정보를 기준으로 확인하는 것이 안전합니다. 비슷한 이름의 제품이 여러 개 있다면 상품명과 이미지, 구성 정보를 함께 비교해 원하는 제품이 맞는지 확인하는 과정이 필요합니다.`,
    `실제로 사용할 장소도 생각해 볼 만합니다. 주방, 거실, 침실, 사무 공간처럼 장소에 따라 필요한 형태가 달라질 수 있고, 가족과 함께 사용하는 물건이라면 보관 위치와 사용 빈도까지 고려하면 선택 기준을 조금 더 구체적으로 잡을 수 있습니다.`,
    `가격만으로 판단하기보다는 필요한 조건을 먼저 정한 뒤 여러 상품을 비교하는 방식이 편합니다. 현재 판매 정보는 시점에 따라 달라질 수 있으므로 구매하려는 순간의 상품 정보와 배송 조건을 다시 확인하는 것이 좋습니다.`,
    `이번에 살펴본 ${topic}은 일상에서 반복적으로 사용하는 제품을 찾을 때 비교해 볼 수 있는 하나의 선택지입니다. ${evidenceText ? `공개적으로 확인되는 정보에서도 ${evidenceText}와 같은 내용이 확인되는 범위에서만 제품 특징을 판단하는 것이 좋습니다.` : "제품의 구체적인 특징은 판매 페이지에 표시된 최신 정보를 기준으로 판단하는 것이 좋습니다."}`,
    `결국 좋은 선택은 다른 사람의 평가만 따라가기보다 자신의 사용 목적과 공간에 맞는지를 기준으로 정하는 것입니다. ${product}을 포함해 비슷한 상품을 살펴본다면 필요한 조건을 먼저 적어두고 하나씩 비교해 보세요. 이렇게 기준을 정해두면 ${topic}을 고를 때 선택 과정도 훨씬 간단해집니다.`,
  ].join("\n\n");
  return { titles, selectedTitle: titles[0], body };
}

function clean(value: string) {
  return String(value ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}
