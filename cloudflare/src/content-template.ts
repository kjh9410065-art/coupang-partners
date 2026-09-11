const DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

/**
 * 실제 공개 웹 검색 결과를 바탕으로 상품 소개 글을 만듭니다.
 *
 * 구성: 제목 → 고지문 → 인사말 → 제품소개 → 추천이유 → 장점 → 단점
 * → 어디에 사용하면 좋은지 → 추천 사용처 → 파트너스 링크 안내 → 마무리 인사
 *
 * 가격/배송/검색순위는 넣지 않습니다.
 * 상품명이나 외부 조사 결과에서 확인되지 않은 성능·스펙은 만들지 않습니다.
 */
export function buildProductPost(keyword: string, productName: string, researchEvidence: string[] = []) {
  const researchText = researchEvidence.join(" ").replace(/\s+/g, " ").trim();

  // 상품명과 공개 검색 결과에서 실제로 확인되는 특징을 뽑습니다.
  const featureRules: Array<[RegExp, string]> = [
    [/LED/i, "LED 조명"],
    [/링라이트/i, "링라이트"],
    [/조명/i, "촬영 조명"],
    [/높이\s*조절|높이조절/i, "높이 조절"],
    [/각도\s*조절|각도조절/i, "각도 조절"],
    [/회전/i, "회전 기능"],
    [/거치대|거치/i, "거치 기능"],
    [/핸드폰|스마트폰/i, "스마트폰 촬영"],
    [/수직촬영|세로 촬영|세로촬영/i, "수직 촬영"],
    [/유튜브/i, "유튜브 촬영"],
    [/USB/i, "USB 연결"],
    [/리모컨/i, "리모컨"],
    [/밝기\s*조절|밝기조절/i, "밝기 조절"],
    [/색온도/i, "색온도 조절"],
    [/접이식/i, "접이식 구조"],
    [/무선/i, "무선 방식"],
    [/유선/i, "유선 방식"],
    [/배터리/i, "배터리"],
    [/충전/i, "충전 방식"],
    [/방수/i, "방수"],
    [/방진/i, "방진"],
    [/필터/i, "필터"],
    [/헤드브러시/i, "헤드브러시"],
    [/침구브러시/i, "침구 브러시"],
    [/캠핑/i, "캠핑 활용"],
    [/등산/i, "등산 활용"],
    [/러닝/i, "러닝 활용"],
    [/마라톤/i, "마라톤 활용"],
    [/보온/i, "보온"],
    [/방한/i, "방한"],
    [/차량용/i, "차량용"],
    [/주방/i, "주방용"],
    [/수납/i, "수납"],
    [/이어폰/i, "이어폰"],
    [/공기청정기/i, "공기청정"],
    [/키보드/i, "키보드"],
    [/마우스/i, "마우스"],
    [/거울/i, "거울"],
    [/선풍기/i, "선풍"],
    [/가습기/i, "가습"],
    [/텀블러|보온병/i, "보온용기"],
  ];

  const featureSet = new Set<string>();
  for (const [pattern, label] of featureRules) {
    if (pattern.test(productName) || pattern.test(researchText)) featureSet.add(label);
  }
  const features = [...featureSet].slice(0, 10);

  // 검색 결과에서 상품의 특징을 설명하는 짧은 근거 문장을 추립니다.
  const evidenceSentences = researchEvidence
    .flatMap((item) => item.split(/(?<=[.!?。！？])\s+/))
    .map((item) => item.trim())
    .filter((item) => item.length >= 18 && item.length <= 220)
    .filter((item) => {
      const lower = item.toLowerCase();
      const nameToken = productName.split(/\s+/).find((token) => token.length >= 3)?.toLowerCase();
      const featureHit = features.some((feature) => lower.includes(feature.toLowerCase().replace(" 활용", "")));
      return featureHit || (nameToken ? lower.includes(nameToken) : false);
    })
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 3);

  const featureText = features.length ? features.join(", ") : "상품명과 공개 검색 결과에서 확인되는 주요 특징";
  const researchSummary = evidenceSentences.length
    ? evidenceSentences.map((item) => item.replace(/^[-•]+\s*/, "")).join(" ")
    : "공개 검색 결과에서 확인되는 상품명과 용도 중심으로 살펴볼 수 있습니다.";

  const introduction = features.length
    ? `${productName}은 ${featureText} 등의 특징을 확인할 수 있는 제품입니다. 공개 검색 결과에서도 ${researchSummary} 상품명에 표시된 표현과 외부에서 확인되는 내용을 기준으로 보면, 단순히 이름만 보는 것보다 실제로 어떤 기능과 용도로 소개되고 있는지 살펴보는 것이 좋습니다.`
    : `${productName}은 ${keyword}와 관련해 찾아볼 수 있는 제품입니다. 공개 검색 결과에서 확인되는 상품 정보와 용도를 중심으로 어떤 제품인지 살펴보겠습니다. ${researchSummary}`;

  const recommendation = features.length
    ? `${featureText}이 필요한 분이라면 관심 있게 살펴볼 만합니다. 특히 ${features.slice(0, 4).join(", ")} 같은 특징을 실제 사용 목적과 연결해서 보면 이 제품이 필요한 상황인지 판단하기 쉽습니다.`
    : `${keyword}와 관련된 제품을 찾고 있고 상품명에 표시된 용도가 본인의 목적과 맞는다면 비교해볼 만합니다.`;

  const advantages = features.length
    ? `${features.slice(0, 5).join(", ")}처럼 필요한 기능이나 용도를 한눈에 파악하기 쉬운 것이 장점입니다. 사용 목적이 분명한 경우 원하는 조건과 맞는지 비교하기도 편합니다.`
    : `상품명과 공개 검색 결과를 통해 기본적인 용도와 특징을 확인하면서 필요한 제품인지 비교하기 쉽다는 점이 장점입니다.`;

  const disadvantages = evidenceSentences.length
    ? `반대로 공개 검색 결과만으로는 제품의 모든 세부 사양이나 실제 사용감까지 판단하기 어렵습니다. 특히 ${features.slice(0, 3).join(", ") || "세부 기능"} 외에 필요한 조건이 있다면 상품 상세 페이지에서 추가로 확인하는 것이 좋습니다.`
    : `확인된 자료만으로는 세부 사양이나 실제 사용감까지 단정하기 어렵다는 점은 아쉬운 부분입니다. 필요한 조건은 상품 상세 페이지에서 확인하는 것이 좋습니다.`;

  const goodPlace = (() => {
    if (features.some((x) => /촬영|링라이트|스마트폰|거치|높이 조절|각도 조절|유튜브/.test(x))) {
      return "집이나 사무실의 책상, 촬영 공간처럼 스마트폰이나 카메라를 두고 촬영하는 곳에 잘 어울립니다.";
    }
    if (features.some((x) => /청소|헤드브러시|침구 브러시|필터/.test(x))) {
      return "집 안에서 청소가 필요한 공간에 활용하기 좋습니다. 바닥이나 침구처럼 상품에 표시된 용도에 맞춰 사용하는 것이 좋습니다.";
    }
    if (features.some((x) => /캠핑|등산|러닝|마라톤|보온|방한/.test(x))) {
      return "상품명에 표시된 야외활동이나 계절 관련 용도가 필요한 상황에서 활용하기 좋습니다.";
    }
    if (features.includes("차량용")) return "차량 안에서 해당 용도의 제품이 필요한 경우 사용하기 좋습니다.";
    if (features.some((x) => /주방용|수납|보온용기|가습|선풍/.test(x))) return "집이나 생활 공간에서 해당 용도의 제품이 필요한 곳에 활용하기 좋습니다.";
    return `${keyword} 제품이 필요한 생활 공간이나 작업 공간에서 활용할 수 있습니다.`;
  })();

  const recommendedUse = (() => {
    if (features.some((x) => /촬영|링라이트|스마트폰|유튜브/.test(x))) return "유튜브 영상, 쇼츠, 라이브 방송, 제품 촬영처럼 스마트폰을 활용한 촬영이 필요한 경우에 추천할 수 있습니다.";
    if (features.some((x) => /청소|헤드브러시|침구 브러시/.test(x))) return "일상적인 집안 청소나 상품명에 표시된 브러시 활용이 필요한 경우 추천 사용처로 볼 수 있습니다.";
    if (features.some((x) => /캠핑|등산|러닝|마라톤/.test(x))) return "캠핑, 등산, 러닝, 마라톤처럼 상품명에 표시된 활동을 준비할 때 활용하기 좋습니다.";
    if (features.includes("차량용")) return "차량 안에서 해당 용도의 제품이 필요한 경우 추천 사용처로 생각해볼 수 있습니다.";
    return `${keyword}와 관련된 제품이 필요한 상황에서 본인의 사용 목적에 맞춰 활용할 수 있습니다.`;
  })();

  const titles = [
    `${productName} 특징과 활용법 알아보기`,
    `${productName} 제품 소개와 추천 사용처`,
    `${productName} 장점과 단점 정리`,
    `${productName} 어디에 사용하면 좋을까`,
    `${keyword} 찾는다면 살펴볼 ${productName}`,
  ];

  // 본문은 사용자가 원하는 순서를 그대로 따르되, 딱딱한 목록처럼 보이지 않게 소제목과 문단으로 구성합니다.
  const body = [
    `안녕하세요. 오늘은 ${keyword}를 찾다가 눈에 들어온 ${productName}을 소개해드릴게요. 어떤 특징이 있는지, 또 어디에 활용하면 좋은지 중심으로 자연스럽게 살펴보겠습니다.`,
    `### 제품 소개\n${introduction}`,
    `### 추천하는 이유\n${recommendation}`,
    `### 장점\n${advantages}`,
    `### 단점\n${disadvantages}`,
    `### 어디에 사용하면 좋을까요?\n${goodPlace}`,
    `### 추천 사용처\n${recommendedUse}`,
    `### 상품 확인\n관심이 있다면 아래 상품 확인하기 버튼을 눌러 현재 판매 페이지의 상품 정보와 상세 내용을 확인해보세요.`,
    `오늘은 ${productName}의 특징과 활용처를 중심으로 살펴봤습니다. 본인에게 필요한 용도와 잘 맞는지 천천히 비교해보시면 좋겠습니다. 읽어주셔서 감사합니다.`,
  ].join("\n\n");

  return { titles, selectedTitle: titles[0], body, disclosure: DISCLOSURE };
}
