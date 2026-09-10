from pathlib import Path

p = Path("cloudflare/src/index.ts")
s = p.read_text(encoding="utf-8")
start = s.index("    const body=`안녕하세요. 오늘은 ${keyword} 검색 결과에서 확인된 ${productName}")
end = s.index("    return JSON.stringify({ titles, selectedTitle: titles[0], body });", start)

new = '''    // 상품명에서 확인되는 특징을 중심으로 자연스러운 상품 소개 글을 만듭니다.
    const nameParts = productName.split(/\\s+/).filter(Boolean);
    const featureWords = nameParts.filter((word) => /LED|링라이트|조명|촬영|핸드폰|거치대|높이조절|유튜브|수직촬영|캠핑|보온|은박|마라톤|계곡|등산|러닝|실버|방한|다보여|발톱깎이|손톱깎이|수납|접이식|휴대용|미니|대형|세트|충전|무선|유선|방수|차량용|반려동물|강아지|고양이/i.test(word));
    const features = [...new Set(featureWords.length ? featureWords : nameParts.slice(0, 8))].join(", ");
    const body = `안녕하세요. 오늘은 ${productName}을 소개해볼게요.\\n\\n${PARTNERS_DISCLOSURE}\\n\\n제품소개\\n${productName}은 상품명에서 ${features}와 같은 특징이 확인되는 제품입니다. 상품명에 표시된 내용을 보면 ${features}를 찾는 분들이 살펴볼 수 있는 제품입니다. 상품명에 없는 세부 사양이나 구성은 임의로 추가하지 않고 실제 상품 페이지에서 확인하는 것을 기준으로 합니다.\\n\\n추천이유\\n${features}처럼 원하는 특징이 분명한 제품을 찾고 있다면 비교해볼 만합니다. ${keyword} 관련 상품을 찾으면서 이런 특징을 중요하게 보는 분이라면 본인의 사용 목적과 잘 맞는지 살펴보세요.\\n\\n장점\\n상품명에서 ${features}라는 특징을 한눈에 확인할 수 있다는 점이 좋습니다. 원하는 용도나 형태를 먼저 확인한 뒤 비슷한 상품과 비교하기에도 편합니다.\\n\\n단점\\n상품명만으로는 세부적인 사양이나 실제 구성까지 모두 확인하기 어렵습니다. 상품명에 표시되지 않은 기능이나 구성은 상품 상세 페이지에서 확인하는 것이 좋습니다.\\n\\n어디에 사용하면 좋은지\\n상품명에 표시된 ${features}가 필요한 상황에서 사용을 고려할 수 있습니다. ${keyword} 관련 제품을 찾고 있다면 실제로 사용하려는 장소와 목적에 맞는지 살펴보세요.\\n\\n추천사용처\\n${keyword} 관련 제품을 찾는 가정이나 일상적인 사용 환경에서 비교해보는 것을 추천합니다. 상품명에 표시된 특징이 본인이 필요한 용도와 맞는지 확인한 뒤 선택하면 좋습니다.\\n\\n파트너스 링크\\n관심이 있다면 아래 상품 확인 버튼을 통해 현재 판매 페이지를 확인해보세요.\\n\\n마무리 인사\\n오늘은 ${productName}을 상품명에서 확인되는 특징을 중심으로 소개해봤습니다. 필요한 용도와 원하는 특징을 먼저 정해두고 비교해보시면 선택하는 데 도움이 될 거예요. 좋은 상품 잘 고르시길 바랍니다.`;
'''

s = s[:start] + new + s[end:]
p.write_text(s, encoding="utf-8")
# 구조 변경 로직 재실행을 위해 이 파일을 갱신합니다.
