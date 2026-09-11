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


def _is_true(value):
    """배송 여부처럼 True/False 형태의 값을 판별합니다."""
    return value.lower() in ("true", "1", "yes")


def _feature_sentences(name):
    """상품명에 실제로 적힌 구성·용도를 설명형 문장으로 바꿉니다.

    상품명에 없는 기능은 만들지 않습니다. '방수팩'이 적혀 있으면 제품 자체가
    방수라고 단정하지 않고 방수팩이 포함된 구성으로만 설명합니다.
    """
    normalized = name.replace("+", " ").replace(",", " ")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    sentences = []

    if "폴딩박스" in normalized or "폴딩 박스" in normalized:
        sentences.append(
            "폴딩박스 형태라 사용하지 않을 때 접어서 보관할 수 있는 구조가 핵심입니다. "
            "차량 트렁크나 캠핑 장비처럼 여러 물건을 한곳에 정리할 때 활용할 수 있습니다."
        )

    if "손잡이형" in normalized or "손잡이" in normalized:
        sentences.append(
            "손잡이가 있는 형태라 내용물을 담은 뒤 들고 이동하기 편하도록 구성되어 있습니다. "
            "차량에서 물건을 꺼내거나 캠핑 장소로 옮기는 상황에서 손잡이를 활용할 수 있습니다."
        )

    if "우드" in normalized and "상판" in normalized:
        sentences.append(
            "상판은 우드 형태로 구성되어 있어 수납함으로만 사용하는 것이 아니라 상판을 테이블처럼 활용할 수 있습니다. "
            "캠핑처럼 수납 공간과 간단한 테이블 공간을 함께 필요로 하는 상황에 잘 맞는 구성입니다."
        )

    if "방수팩" in normalized:
        sentences.append(
            "전용 방수팩이 포함된 구성이라 수납함과 함께 별도의 방수팩을 사용할 수 있습니다. "
            "방수팩의 용량이나 방수 성능 수치처럼 제공되지 않은 내용은 임의로 단정하지 않습니다."
        )

    if "트렁크" in normalized and "정리함" in normalized:
        sentences.append(
            "트렁크 정리함 용도로 사용할 수 있어 차량 안에서 흩어지기 쉬운 캠핑용품이나 생활용품을 한곳에 모아두는 데 적합합니다."
        )

    if "캠핑" in normalized:
        sentences.append(
            "캠핑용으로 활용할 수 있어 장비를 담아 이동하고 현장에서 꺼내 사용하는 수납 방식에 초점을 맞출 수 있습니다."
        )

    return sentences


def _make_titles(prompt):
    """실제 상품명만 사용해 과장 없는 제목 5개를 만듭니다."""
    name = _clean_name(_extract(prompt, "실제 상품명"))
    if not name:
        raise Exception("상품명을 확인할 수 없습니다.")

    titles = [
        f"{name} 상품 정보와 주요 특징",
        f"{name} 구성과 활용 방법 정리",
        f"{name} 캠핑·수납 활용 정보",
        f"{name} 구매 전 알아둘 구성과 특징",
        f"{name} 핵심 정보 간단 정리",
    ]
    return "\n".join(f"{i}. {title}" for i, title in enumerate(titles, 1))


def _make_body(prompt):
    """제품명은 제목에서만 한 번 사용하고, 실제 확인 가능한 특징을 설명합니다."""
    title = _extract(prompt, "[선택한 제목]")
    name = _clean_name(_extract(prompt, "상품명"))
    rocket = _extract(prompt, "로켓배송 여부")
    free_shipping = _extract(prompt, "무료배송 여부")
    partner_url = _extract(prompt, "[마지막 링크]")

    if not name:
        raise Exception("상품명을 확인할 수 없습니다.")

    # 최종 글에서는 제품명을 제목에만 넣고 본문에서는 다시 쓰지 않습니다.
    paragraphs = [title or name]

    # AI식 도입을 없애고 바로 확인 가능한 특징을 설명합니다.
    features = _feature_sentences(name)
    if features:
        paragraphs.append("\n\n".join(features))
    else:
        paragraphs.append(
            "검색 결과에서 확인되는 상품 정보만 기준으로 정리했으며, 확인되지 않은 사양이나 기능은 임의로 추가하지 않았습니다."
        )

    delivery = []
    if _is_true(rocket):
        delivery.append("로켓배송으로 표시되어 있어 빠른 배송을 중요하게 보는 경우 배송 방식 측면에서 참고할 수 있습니다")
    elif rocket.lower() in ("false", "0", "no"):
        delivery.append("로켓배송으로 표시되지 않아 배송 속도를 중요하게 생각한다면 배송 조건을 함께 고려해야 합니다")

    if _is_true(free_shipping):
        delivery.append("무료배송으로 표시되어 있어 배송비 부담 여부를 판단할 때 참고할 수 있습니다")
    elif free_shipping.lower() in ("false", "0", "no"):
        delivery.append("무료배송으로 표시되지 않아 배송비가 발생할 수 있는 조건까지 고려해야 합니다")

    if delivery:
        paragraphs.append(". ".join(delivery) + ".")

    # 독자에게 다시 찾아보라고 하지 않고, 확인된 정보로 활용 방향을 정리합니다.
    if features:
        paragraphs.append(
            "전체적으로 수납과 이동을 함께 고려한 구성이 중심이며, 특히 캠핑이나 차량 트렁크 정리처럼 물건을 모아두고 옮겨야 하는 상황에서 활용 방향이 분명합니다."
        )

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
