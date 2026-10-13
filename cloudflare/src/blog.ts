/** 확인된 API 필드만 사용해 편집 가능한 블로그 소개 글을 작성합니다. */
export const DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

export function buildBlog(recommendation: any) {
  const p = recommendation.product;
  const name = String(p.productName || '').replace(/\s+/g, ' ').trim();
  if (!name || !p.partnerUrl) throw new Error('글 작성에 필요한 상품명 또는 파트너스 링크가 없습니다.');
  // 과장 표현을 새로 만들지 않고 제목에서는 일부 판매용 수식어만 덜어냅니다.
  const titleName = name.replace(/최신형|최신상|초특가|특가|흡입력 좋은/g, '').replace(/\s+/g, ' ').trim();
  const titles = [titleName + ' 구성과 가격 정리', titleName + ' 상품 정보 한눈에 보기', titleName + ' 구매 전 살펴볼 정보'];
  const options = name.split(/[,，]/).slice(1).map((s: string) => s.trim()).filter(Boolean);
  const bundle = name.split('+').slice(1).map((s: string) => s.split(/[,，]/)[0].trim()).filter(Boolean);
  const specs = [...new Set(name.match(/\d+(?:\.\d+)?\s*(?:mAh|GB|TB|mL|ml|kg|cm|mm|인치|리터|L|W|개입|매입|장입)(?![A-Za-z])/g) || [])];
  const paragraphs = [
    DISCLOSURE,
    '이번에 소개할 상품은 ' + name + '입니다. 상품 검색에서 제공된 정보를 바탕으로 구성과 가격을 간단히 정리했습니다.',
  ];
  const details: string[] = [];
  if (options.length) details.push('상품명에 표시된 옵션은 ' + options.join(', ') + '입니다.');
  if (bundle.length) details.push('구성 표기에는 ' + bundle.join(', ') + '도 포함되어 있습니다.');
  if (specs.length) details.push('상품명에서 확인할 수 있는 규격 표기는 ' + specs.join(', ') + '입니다.');
  if (details.length) paragraphs.push(details.join(' '));
  if (Number(p.productPrice) > 0) paragraphs.push('조회 당시 가격은 ' + Number(p.productPrice).toLocaleString('ko-KR') + '원입니다.' + (p.isRocket ? ' 검색 결과에는 로켓배송 상품으로 표시되어 있습니다.' : '') + ' 가격과 배송 조건은 선택 옵션과 주문 시점에 따라 달라질 수 있습니다.');
  else if (p.isRocket) paragraphs.push('검색 결과에는 로켓배송 상품으로 표시되어 있습니다. 실제 배송 일정은 주문 조건에 따라 달라질 수 있습니다.');
  paragraphs.push('구체적인 상품 구성과 현재 구매 조건은 아래 링크에서 볼 수 있습니다.');
  paragraphs.push(String(p.partnerUrl));
  return { titles, title: titles[0], body: paragraphs.join('\n\n') };
}
