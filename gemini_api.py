import re

# 외부 AI API 없이 PC에서 바로 글을 만드는 무료 생성기입니다.
# API 키나 AI 사용료가 필요하지 않습니다.

FORBIDDEN_PHRASES = (
    "상품명을 보시면", "상품명을 보면", "상품명에서 알 수 있듯이",
    "상품명을 통해 알 수 있듯이", "장점을 보시면", "특징을 보시면",
    "이름에서 알 수 있듯이", "상품명 그대로", "자세히 보면",
    "자세히 살펴보면", "찾아보면", "확인해보면", "판매 페이지에서 확인",
    "상품 정보를 확인해보는 것이 좋습니다", "별도로 확인이 필요한",
    "확인해보세요", "확인해 보세요", "찾아보세요", "비교해보세요",
    "비교해 보세요", "더 자세히 알아보세요", "직접 확인하세요",
    "상세 페이지에서", "상세페이지에서", "상품 페이지에서", "상품 상세에서",
    "추가로 확인", "확인하는 것이 좋습니다",
)

# 긴 상품명을 제목에서 읽기 쉬운 핵심 이름으로 줄일 때 우선적으로 남기는 단어입니다.
PRODUCT_KEYWORDS = (
    "노트북", "태블릿", "모니터", "키보드", "마우스", "이어폰", "헤드폰",
    "스피커", "충전기", "케이블", "거치대", "파우치", "가방", "백팩",
    "지갑", "시계", "의자", "테이블", "책상", "수납함", "정리함", "폴딩박스",
    "캠핑", "텐트", "의류", "자켓", "티셔츠", "바지", "신발", "운동화",
    "화장품", "크림", "세럼", "샴푸", "비누", "세제", "식품", "커피",
    "차", "조리도구", "냄비", "프라이팬", "식기", "청소기", "선풍기",
    "가습기", "공기청정기", "조명", "램프", "수건", "침구", "매트", "방석",
)

# 제목을 길게 만드는 옵션/홍보성 단어는 축약할 때 제거합니다.
REMOVE_FROM_SHORT_NAME = (
    "손잡이형", "전용", "구성", "세트", "특가", "추천", "인기", "신상",
    "무료배송", "당일발송", "국내배송", "대용량", "초특가",
)


def _extract(prompt, label):
    """프롬프트에서 일반 항목이나 [섹션]의 값을 가져옵니다."""
    if label.startswith("["):
        pattern = rf"{re.escape(label)}\s*\n?(.*?)(?=\n\[|$)"
    else:
        pattern = rf"{re.escape(label)}:\s*(.*?)(?=\n[A-Za-z가-힣].*?:|\n\[|$)"
    match = re.search(pattern, prompt, re.DOTALL)
    return match.group(1).strip() if match else ""


def _clean_name(name):
    """상품명의 불필요한 공백을 정리합니다."""
    return re.sub(r"\s+", " ", name).strip()


def _short_name(name, max_length=34):
    """긴 상품명을 제목에서만 자연스럽게 축약합니다.

    원래 상품명은 특징 판별에 그대로 사용하고, 제목 표시용 이름만 줄입니다.
    """
    name = _clean_name(name)
    if len(name) <= max_length:
        return name

    # 괄호, +, 쉼표 등을 단어 구분자로 바꿔 핵심 단어를 추립니다.
    normalized = re.sub(r"[()\[\]{}]", " ", name)
    normalized = normalized.replace("+", " ").replace(",", " ").replace("/", " ")
    words = [w for w in re.split(r"\s+", normalized) if w]

    selected = []
    for word in words:
        if word in REMOVE_FROM_SHORT_NAME:
            continue
        if word in PRODUCT_KEYWORDS and word not in selected:
            selected.append(word)

    # 제품 종류가 없는 상품은 원래 이름을 단어 단위로 잘라 읽기 좋게 만듭니다.
    if not selected:
        result = ""
        for word in words:
            candidate = f"{result} {word}".strip()
            if len(candidate) > max_length:
                break
            result = candidate
        return result or name[:max_length].rstrip()

    # 브랜드나 모델명처럼 식별에 도움이 되는 앞부분은 하나만 보존합니다.
    for word in words:
        if word in PRODUCT_KEYWORDS or word in REMOVE_FROM_SHORT_NAME:
            continue
        if len(word) >= 2 and word not in selected:
            candidate = " ".join([word] + selected)
            if len(candidate) <= max_length:
                selected.insert(0, word)
                break

    return " ".join(selected)[:max_length].rstrip()


def _is_true(value):
    """배송 여부처럼 True/False 형태의 값을 판별합니다."""
    return value.lower() in ("true", "1", "yes")


def _feature_sentences(name):
    """상품명에 실제로 적힌 구성과 용도만 자연스러운 문장으로 변환합니다.

    상품명에 없는 성능이나 사양은 만들지 않습니다.
    특히 '방수팩'은 제품 자체가 방수라고 해석하지 않고 포함 구성으로만 설명합니다.
    """
    normalized = name.replace("+", " ").replace(",", " ")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    sentences = []

    if "폴딩박스" in normalized or "폴딩 박스" in normalized:
        sentences.append(
            "폴딩박스 형태라 사용하지 않을 때 접어서 보관할 수 있는 구조가 특징입니다. "
            "차량 트렁크나 캠핑 장비처럼 여러 물건을 한곳에 정리할 때 활용할 수 있습니다."
        )

    if "손잡이형" in normalized or "손잡이" in normalized:
        sentences.append(
            "손잡이가 있는 형태라 내용물을 담은 뒤 들고 이동하기 편하도록 구성되어 있습니다. "
            "차량에서 물건을 꺼내거나 캠핑 장소로 옮길 때 손잡이를 활용할 수 있습니다."
        )

    if "우드" in normalized and "상판" in normalized:
        sentences.append(
            "우드 상판이 포함된 구성이라 수납함으로만 사용하는 것이 아니라 상판을 테이블처럼 활용할 수 있습니다. "
            "수납 공간과 간단한 테이블 공간을 함께 필요로 하는 상황에 어울립니다."
        )

    if "방수팩" in normalized:
        sentences.append(
            "전용 방수팩이 포함된 구성이라 수납과 함께 방수팩을 별도로 활용할 수 있습니다."
        )

    if "트렁크" in normalized and "정리함" in normalized:
        sentences.append(
            "트렁크 정리함 용도로 사용할 수 있어 차량 안에서 흩어지기 쉬운 물건을 한곳에 모아두는 데 활용할 수 있습니다."
        )

    if "캠핑" in normalized:
        sentences.append(
            "캠핑용으로 활용할 수 있어 장비를 담아 이동하고 현장에서 꺼내 사용하는 수납 방식에 잘 맞습니다."
        )

    if "무선" in normalized and ("이어폰" in normalized or "헤드폰" in normalized):
        sentences.append("무선 방식의 이어폰·헤드폰으로 선 연결 없이 사용할 수 있는 형태입니다.")

    if "이어폰" in normalized and "무선" not in normalized:
        sentences.append("이어폰 제품으로 음악이나 영상 등을 들을 때 사용할 수 있는 형태입니다.")

    if "충전기" in normalized:
        sentences.append("충전기 제품으로 기기 충전에 사용하는 용도의 구성입니다.")

    if "케이블" in normalized:
        sentences.append("케이블이 포함된 제품이라 연결이나 충전 용도로 사용할 수 있습니다.")

    return sentences


def _make_titles(prompt):
    """긴 상품명은 자연스럽게 축약해 과장 없는 제목 5개를 만듭니다."""
    full_name = _clean_name(_extract(prompt, "실제 상품명"))
    if not full_name:
        raise Exception("상품명을 확인할 수 없습니다.")

    name = _short_name(full_name)
    titles = [
        f"{name} 상품 정보와 주요 특징",
        f"{name} 구성과 활용 방법 정리",
        f"{name} 활용 정보 간단 정리",
        f"{name} 구매 전 알아둘 구성과 특징",
        f"{name} 핵심 정보 간단 정리",
    ]
    return "\n".join(f"{i}. {title}" for i, title in enumerate(titles, 1))


def _make_body(prompt):
    """제품명은 제목에서만 사용하고, 실제 확인 가능한 특징을 설명합니다."""
    title = _extract(prompt, "[선택한 제목]")
    name = _clean_name(_extract(prompt, "상품명"))
    rocket = _extract(prompt, "로켓배송 여부")
    free_shipping = _extract(prompt, "무료배송 여부")
    partner_url = _extract(prompt, "[마지막 링크]")

    if not name:
        raise Exception("상품명을 확인할 수 없습니다.")

    # 제목과 본문을 분리해 제품명이 본문에서 반복되지 않도록 합니다.
    paragraphs = [title or _short_name(name)]

    features = _feature_sentences(name)
    if features:
        paragraphs.append("\n\n".join(features))
    else:
        paragraphs.append("검색 결과에서 확인되는 상품 정보만 기준으로 간단하게 정리했습니다.")

    delivery = []
    if _is_true(rocket):
        delivery.append("로켓배송으로 표시되어 있어 배송 속도를 중요하게 보는 경우 배송 방식 측면에서 참고할 수 있습니다")
    elif rocket.lower() in ("false", "0", "no"):
        delivery.append("로켓배송으로 표시되지 않아 배송 속도를 중요하게 본다면 배송 조건까지 함께 고려할 필요가 있습니다")

    if _is_true(free_shipping):
        delivery.append("무료배송으로 표시되어 있어 배송비 부담 없이 주문할 수 있는 조건입니다")
    elif free_shipping.lower() in ("false", "0", "no"):
        delivery.append("무료배송으로 표시되지 않아 배송비가 발생할 수 있습니다")

    if delivery:
        paragraphs.append(". ".join(delivery) + ".")

    # 특정 상품군을 가정하지 않고, 실제 추출된 특징을 기준으로 자연스럽게 마무리합니다.
    if features:
        paragraphs.append("제공된 구성과 특징을 기준으로 보면 일상적인 사용 목적에 맞춰 활용하기 좋은 상품입니다.")

    if partner_url:
        paragraphs.append(partner_url)

    text = "\n\n".join(paragraphs)

    # 최종 결과에서도 금지 표현을 한 번 더 제거합니다.
    for phrase in FORBIDDEN_PHRASES:
        text = text.replace(phrase, "")

    return text.strip()


def generate_text(prompt):
    """기존 main.py와 호환되도록 제목/본문 생성 요청을 구분합니다."""
    if "제목 후보를 정확히 5개" in prompt:
        return _make_titles(prompt)
    return _make_body(prompt)
