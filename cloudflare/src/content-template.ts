const DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

/**
 * 쿠팡파트너스용 네이버 블로그 글 생성기입니다.
 *
 * 원칙
 * - 긴 상품명은 제목에서만 읽기 쉽게 축약합니다.
 * - 본문에는 상품명을 반복하지 않습니다.
 * - 상품명과 조사 결과에서 확인되는 내용만 사용합니다.
 * - 기계적인 장점/단점/추천 사용처/상품 확인 소제목을 만들지 않습니다.
 * - 독자에게 다른 페이지를 확인하거나 비교하라고 떠넘기지 않습니다.
 * - 상품명에 없는 성능, 수치, 재질, 인증, 사용후기는 만들어내지 않습니다.
 */
export function buildProductPost(keyword: string, productName: string, researchEvidence: string[] = []) {
  const fullName = cleanText(productName);
  const researchText = researchEvidence.map(cleanText).filter(Boolean).join(" ");
  const shortName = shortenProductName(fullName);
  const features = extractFeatures(fullName, researchText);

  const titles = makeTitles(shortName, keyword);
  // 상품명은 제목에서만 사용하고, 본문에는 제품명을 넣지 않습니다.
  const body = makeBody(keyword, features);

  return {
    titles,
    selectedTitle: titles[0],
    body,
    disclosure: DISCLOSURE,
  };
}

/** 상품명의 불필요한 공백만 정리합니다. */
function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * 긴 상품명이 제목에 그대로 노출되지 않도록 핵심 단어만 남깁니다.
 * 원본 상품명은 특징 판별에 그대로 사용합니다.
 */
function shortenProductName(name: string, maxLength = 32): string {
  if (name.length <= maxLength) return name;

  const normalized = name
    .replace(/[()[\]{}]/g, " ")
    .replace(/[+,/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const productTypes = [
    "폴딩박스", "정리함", "수납함", "테이블", "의자", "책상", "거치대",
    "청소기", "가습기", "공기청정기", "선풍기", "조명", "램프", "이어폰",
    "헤드폰", "키보드", "마우스", "모니터", "노트북", "태블릿", "충전기",
    "케이블", "가방", "백팩", "파우치", "텀블러", "보온병", "냄비", "프라이팬",
    "매트", "방석", "침구", "신발", "운동화", "자켓", "티셔츠", "바지",
    "크림", "세럼", "샴푸", "세제",
  ];

  const words = normalized.split(/\s+/).filter(Boolean);
  const selected: string[] = [];

  // 브랜드/모델처럼 앞부분에 있는 식별 단어를 하나만 보존합니다.
  for (const word of words) {
    if (isNoiseWord(word) || productTypes.includes(word)) continue;
    if (word.length >= 2) {
      selected.push(word);
      break;
    }
  }

  // 제품 종류는 원래 상품명에 실제로 포함된 것만 추가합니다.
  for (const type of productTypes) {
    if (normalized.includes(type) && !selected.includes(type)) selected.push(type);
  }

  if (selected.length === 0) {
    let result = "";
    for (const word of words) {
      const next = `${result} ${word}`.trim();
      if (next.length > maxLength) break;
      result = next;
    }
    return result || name.slice(0, maxLength).trim();
  }

  const result = selected.join(" ");
  return result.length <= maxLength ? result : result.slice(0, maxLength).trim();
}

/** 제목 축약에서 제거할 구성/홍보성 표현입니다. */
function isNoiseWord(word: string): boolean {
  return [
    "손잡이형", "전용", "구성", "세트", "특가", "추천", "인기", "신상",
    "무료배송", "당일발송", "국내배송", "대용량", "초특가", "화이트", "블랙",
    "베이지", "카키", "그레이",
  ].includes(word);
}

/** 상품명과 조사 결과에서 확인되는 특징만 추출합니다. */
function extractFeatures(name: string, researchText: string): string[] {
  const source = `${name} ${researchText}`;
  const features: string[] = [];
  const add = (condition: boolean, text: string) => {
    if (condition && !features.includes(text)) features.push(text);
  };

  add(/폴딩박스|폴딩 박스/i.test(name), "접어서 보관할 수 있는 폴딩박스 형태");
  add(/손잡이형|손잡이/i.test(name), "손잡이가 있는 형태");
  add(/우드.*상판|상판.*우드/i.test(name), "우드 상판 구성");
  add(/방수팩/i.test(name), "전용 방수팩 포함 구성");
  add(/트렁크.*정리함|정리함.*트렁크/i.test(name), "차량 트렁크 정리 용도");
  add(/캠핑/i.test(name), "캠핑 활용");

  add(/LED/i.test(source), "LED 조명");
  add(/링라이트/i.test(source), "링라이트");
  add(/높이\s*조절|높이조절/i.test(source), "높이 조절");
  add(/각도\s*조절|각도조절/i.test(source), "각도 조절");
  add(/회전/i.test(source), "회전 기능");
  add(/거치대|거치/i.test(source), "거치 기능");
  add(/스마트폰|핸드폰/i.test(source), "스마트폰 활용");
  add(/수직촬영|세로촬영|세로 촬영/i.test(source), "수직 촬영");
  add(/유튜브/i.test(source), "유튜브 촬영");
  add(/USB/i.test(source), "USB 연결");
  add(/리모컨/i.test(source), "리모컨");
  add(/밝기\s*조절|밝기조절/i.test(source), "밝기 조절");
  add(/색온도/i.test(source), "색온도 조절");
  add(/접이식/i.test(source), "접이식 구조");
  add(/무선/i.test(source), "무선 방식");
  add(/유선/i.test(source), "유선 방식");
  add(/배터리/i.test(source), "배터리 사용");
  add(/충전/i.test(source), "충전 방식");
  add(/방진/i.test(source), "방진");
  add(/필터/i.test(source), "필터");
  add(/헤드브러시/i.test(source), "헤드브러시");
  add(/침구브러시/i.test(source), "침구 브러시");
  add(/등산/i.test(source), "등산 활용");
  add(/러닝/i.test(source), "러닝 활용");
  add(/마라톤/i.test(source), "마라톤 활용");
  add(/보온/i.test(source), "보온 기능");
  add(/방한/i.test(source), "방한 용도");
  add(/차량용/i.test(source), "차량용");
  add(/주방/i.test(source), "주방용");
  add(/수납/i.test(source), "수납 용도");
  add(/이어폰/i.test(source), "이어폰");
  add(/공기청정기/i.test(source), "공기청정");
  add(/키보드/i.test(source), "키보드");
  add(/마우스/i.test(source), "마우스");
  add(/거울/i.test(source), "거울");
  add(/선풍기/i.test(source), "선풍");
  add(/가습기/i.test(source), "가습");
  add(/텀블러|보온병/i.test(source), "보온용기");

  return features.slice(0, 10);
}

/** 제목 후보 5개를 만듭니다. */
function makeTitles(shortName: string, keyword: string): string[] {
  const topic = cleanText(keyword) || "상품";
  return [
    `${shortName} 주요 특징과 활용 정보`,
    `${shortName} 구성과 사용 용도 정리`,
    `${shortName} 어떤 제품인지 간단하게 알아보기`,
    `${shortName} 활용하기 좋은 상황`,
    `${topic} 관련 ${shortName} 상품 정보`,
  ];
}

/**
 * 상품명 없이 특징을 자연스럽게 이어 붙여 블로그 본문을 만듭니다.
 * 반복적인 소제목과 외부 페이지 확인 유도 문구를 사용하지 않습니다.
 */
function makeBody(keyword: string, features: string[]): string {
  const paragraphs: string[] = [];
  const topic = cleanText(keyword) || "상품";

  paragraphs.push(
    `${topic} 관련 제품을 찾을 때는 이름에 적힌 구성과 용도를 함께 살펴보는 것이 중요합니다. ` +
    `${features.length ? "이번 상품은 표시된 구성과 활용 방향이 비교적 분명합니다." : "제공된 정보에서 확인되는 내용만 기준으로 간단하게 소개할 수 있습니다."}`
  );

  if (features.length) {
    paragraphs.push(buildFeatureParagraph(features));
  } else {
    paragraphs.push("현재 제공된 상품 정보에서 확인되는 내용은 기본적인 용도와 구성 중심으로 정리할 수 있습니다.");
  }

  // 방수팩은 상품 자체의 방수 성능으로 오해하지 않도록 별도로 설명합니다.
  if (features.includes("전용 방수팩 포함 구성")) {
    paragraphs.push("전용 방수팩이 함께 구성되어 있다는 점도 특징입니다. 이는 방수팩이 포함된 구성이라는 의미이며, 제품 자체의 방수 성능을 뜻하는 표현은 아닙니다.");
  }

  paragraphs.push(
    features.length
      ? "표시된 구성과 용도를 기준으로 보면 수납, 이동, 촬영, 생활용품 등 필요한 목적에 맞춰 활용할 수 있는 제품입니다."
      : "제공된 정보에 없는 세부 사양이나 실제 사용 경험은 임의로 덧붙이지 않고 확인된 내용만 담았습니다."
  );

  return paragraphs.join("\n\n");
}

/** 특징 배열을 반복 없이 자연스러운 문단으로 바꿉니다. */
function buildFeatureParagraph(features: string[]): string {
  const first = features.slice(0, 4);
  const second = features.slice(4, 8);
  const sentences: string[] = [];

  if (first.length) sentences.push(`주요 특징은 ${joinKorean(first)}입니다.`);

  if (features.some((feature) => feature.includes("폴딩박스"))) {
    sentences.push("접어서 보관할 수 있는 형태라 사용하지 않을 때 보관하기 좋고, 물건을 담아 이동하는 용도로도 사용할 수 있습니다.");
  }

  if (features.includes("손잡이가 있는 형태")) {
    sentences.push("손잡이가 있어 내용물을 담은 뒤 들고 옮기는 용도에 맞습니다.");
  }

  if (features.includes("우드 상판 구성")) {
    sentences.push("우드 상판이 포함된 구성이라 수납함뿐 아니라 간단한 테이블 공간으로 활용할 수 있습니다.");
  }

  if (features.includes("차량 트렁크 정리 용도")) {
    sentences.push("차량 트렁크에서 물건을 한곳에 모아 정리하는 용도로도 활용할 수 있습니다.");
  }

  if (features.includes("캠핑 활용")) {
    sentences.push("캠핑 장비를 담아 이동하고 현장에서 사용하는 수납 용도와도 잘 맞습니다.");
  }

  if (second.length) sentences.push(`그 밖에도 ${joinKorean(second)} 같은 요소가 포함되어 있습니다.`);

  return sentences.join(" ");
}

/** 한국어 나열을 자연스럽게 연결합니다. */
function joinKorean(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]}과 ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${items[items.length - 1]}`;
}
