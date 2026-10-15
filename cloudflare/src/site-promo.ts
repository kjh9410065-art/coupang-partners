import type { SitePromoTarget } from "./site-catalog";

/** 특정 사이트 저장소에 근거한 사실만 사용하도록 제한한 네이버용 홍보글 생성기입니다. */
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function validatePromoDraft(text: string, site: SitePromoTarget): string[] {
  const problems: string[] = [];
  if (text.length < 160 || text.length > 1200) problems.push("본문 길이가 적절하지 않습니다.");
  if (text.split(/\n\s*\n/).filter(Boolean).length < 2) problems.push("문단이 구분되지 않았습니다.");
  if (/https?:\/\/|#[가-힣a-z]|<[^>]+>|\*\*|\x60{3}/i.test(text)) problems.push("불필요한 링크 또는 마크업이 포함됐습니다.");
  if (/직접\s*(써|사용|이용)해|내돈내산|써보니|사용해보니|100%\s*만족|국내\s*1위|최저가|압도적인|무조건/i.test(text)) {
    problems.push("꾸며낸 이용 경험 또는 과장된 홍보가 포함됐습니다.");
  }
  if (/공짜\s*수익|수익을\s*보장|방문자\s*폭증|누구나\s*성공|절대\s*실패하지/i.test(text)) problems.push("검증되지 않은 성과 약속이 포함됐습니다.");
  if (/\d+\s*(?:명|건|%|위)\b/.test(text) && !site.facts.some(f=>/\d+\s*(?:명|건|%|위)\b/.test(f))) {
    problems.push("검증되지 않은 통계 또는 순위가 포함됐습니다.");
  }
  return problems;
}

/** 사이트 서비스 개요와 기능만 AI에 입력하고 링크는 서버 코드로 고정합니다. */
export async function buildSitePromo(site: SitePromoTarget, ai?: Ai): Promise<{ title: string; titles: string[]; body: string }> {
  if (!ai) throw new Error("Workers AI 바인딩이 없어 사이트 홍보글을 생성하지 않았습니다.");
  if (!site?.url?.startsWith("https://") || !site.facts?.length) throw new Error("검증된 사이트 정보가 없습니다.");

  const titles = [
    site.name + ", 어떤 서비스를 제공할까?",
    site.name + " 이용 방법과 주요 기능 정리",
    site.name + "에서 알아볼 수 있는 서비스",
  ];
  const prompt = [
    "네이버 블로그에 게시할 한국어 서비스 소개 글을 작성한다.",
    "근거는 아래 verifiedFacts 목록뿐이다. 다른 서비스·기능·인기·가격·방문자·효과·운영 현황을 상상하지 않는다.",
    "형식은 2~4개 자연스러운 문단의 일반 텍스트. 200~700자.",
    "읽는 사람의 목적을 언급한 뒤 실제 제공 기능을 소개하고 이용 전 알아둘 점으로 마무리한다.",
    "같은 서비스를 매번 똑같이 소개하는 광고 문구를 피하고, 무리하게 분량을 늘리지 않는다.",
    "직접 이용한 것처럼 서술하지 않고, 보장/효과/수익/독보적이라고 과장하지 않는다.",
    "쿠팡 고지문, 광고 제휴 고지, 사이트 URL, 제목, 태그, 해시태그, 마크다운 표시는 쓰지 않는다.",
    "사이트는 자사 서비스이므로 타사의 객관적 리뷰인 것처럼 가장하지 않는다.",
    "본문만 출력한다.",
  ].join(" ");
  let issues = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await ai.run(MODEL, {
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify({ siteName: site.name, verifiedFacts: site.facts, correction: issues }) },
      ],
      temperature: 0.45,
      max_tokens: 950,
    } as any);
    const response = String((result as any)?.response ?? "").trim();
    const found = validatePromoDraft(response, site);
    if (found.length) { issues = found.join(" "); continue; }
    return {
      title: titles[0], titles,
      body: response + "\n\n사이트 바로가기\n" + site.url,
    };
  }
  throw new Error("사이트 홍보글이 품질 검사를 통과하지 못했습니다: " + issues);
}
