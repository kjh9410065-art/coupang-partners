/**
 * 실제 서비스 저장소 홈페이지/README와 이미지 파일을 기준으로 작성된 홍보 대상 목록.
 * 폐기된 보고팡, 외부 공개 주소가 확인되지 않은 서비스는 포함하지 않습니다.
 */
export interface SitePromoTarget {
  slug: string;
  name: string;
  url: string;
  imageUrl: string;
  facts: string[];
}
export const SITE_PROMO_TARGETS: SitePromoTarget[] = [
  {
    "slug": "tcflick",
    "name": "TCFLiCK",
    "url": "https://tcflick.com/",
    "imageUrl": "https://raw.githubusercontent.com/kjh9410065-art/tcflick/main/%ED%8B%B0%EC%94%A8%ED%94%8C%EB%A6%AD%20%EB%A7%81%ED%81%AC%20%EB%AF%B8%EB%A6%AC%EB%B3%B4%EA%B8%B0.png",
    "facts": [
      "일상과 비즈니스에 필요한 디지털 서비스를 직접 만들고 제공합니다.",
      "서비스 안내와 이용 가이드를 홈페이지에서 살펴볼 수 있습니다.",
      "자동차 관련 서비스, 생활 계산기, AI 도구 찾기, 공연 정보, 문서 작성 등 여러 서비스로 연결합니다."
    ]
  },
  {
    "slug": "mingka",
    "name": "밍카 MINGKA",
    "url": "https://mingka.tcflick.com/",
    "imageUrl": "https://raw.githubusercontent.com/kjh9410065-art/mingka/main/og-image-mingka.svg",
    "facts": [
      "네 가지 질문으로 자동차 장기렌트와 리스 이용 방식을 비교하도록 돕습니다.",
      "자동차 장기렌트·리스 관련 기초 가이드를 제공합니다.",
      "실제 계약 조건과 상담 여부는 각 이용자가 별도 확인해야 합니다."
    ]
  },
  {
    "slug": "nerding",
    "name": "NERDING 너딩",
    "url": "https://mova.tcflick.com/",
    "imageUrl": "https://raw.githubusercontent.com/kjh9410065-art/mova/main/public/ChatGPT%20Image%202026%EB%85%84%209%EC%9B%94%2015%EC%9D%BC%20%EC%98%A4%ED%9B%84%2011_34_22.png",
    "facts": [
      "이미지·영상·음성 생성 및 개발 도구 등 AI 서비스를 목적별로 찾아볼 수 있습니다.",
      "서비스 검색·분류·비교 기능을 제공하는 도구 탐색 사이트입니다.",
      "외부 AI 서비스를 직접 제공한다기보다 외부 도구를 찾고 비교하도록 돕습니다."
    ]
  },
  {
    "slug": "noviq",
    "name": "NOVIQ 노빅",
    "url": "https://noviq.tcflick.com/",
    "imageUrl": "https://raw.githubusercontent.com/kjh9410065-art/noviq/main/public/og-image.jpg",
    "facts": [
      "급여·연차·대출·이자·날짜·비율 등을 계산하는 무료 생활 계산기 모음입니다.",
      "여러 종류의 생활 계산기를 한 곳에서 선택해 이용할 수 있습니다.",
      "계산 결과는 개인의 실제 계약·세무 상황과 다를 수 있습니다."
    ]
  },
  {
    "slug": "movoka",
    "name": "MOVOKA 모보카",
    "url": "https://movoka.tcflick.com/",
    "imageUrl": "https://raw.githubusercontent.com/kjh9410065-art/movoka/main/%EB%AA%A8%EB%B3%B4%EC%B9%B4%20%EB%A7%81%ED%81%AC%20%EB%AF%B8%EB%A6%AC%EB%B3%B4%EA%B8%B0.png",
    "facts": [
      "연극·뮤지컬·클래식·국악·콘서트 등 공연 정보를 장르별로 조회하는 서비스입니다.",
      "공연 일정·공연장 정보와 관련 공식 상세정보를 제공합니다.",
      "KOPIS 공연예술통합전산망 자료를 활용하며 실시간 잔여 좌석을 보장하지 않습니다."
    ]
  },
  {
    "slug": "munsudam",
    "name": "문서담 MUNSUDAM",
    "url": "https://munsudam.tcflick.com/",
    "imageUrl": "https://raw.githubusercontent.com/kjh9410065-art/MUNSUDAM/main/og-image.jpg",
    "facts": [
      "사직서·위임장·차용증 등 자주 쓰는 문서 양식을 제공합니다.",
      "문서를 선택해 내용을 입력하고 미리 본 후 인쇄할 수 있습니다.",
      "문서 양식은 사용 목적과 제출 기관 요구사항을 확인해 작성해야 합니다."
    ]
  }
];
export function pickPromoTarget(date: string): SitePromoTarget {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + "T00:00:00Z"))) {
    throw new Error("잘못된 홍보글 날짜입니다.");
  }
  const day = Math.floor(Date.parse(date + "T00:00:00Z") / 86400000);
  return SITE_PROMO_TARGETS[day % SITE_PROMO_TARGETS.length];
}
