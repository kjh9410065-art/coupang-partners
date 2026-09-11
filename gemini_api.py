import re

# 외부 AI API 없이 PC에서 바로 글을 만드는 무료 생성기입니다.
# API 키나 AI 사용료가 필요하지 않습니다.

FORBIDDEN_PHRASES = (
    "상품명을 보시면", "상품명을 보면", "상품명에서 알 수 있듯이",
    "상품명을 통해 알 수 있듯이", "장점을 보시면", "특징을 보시면",
    "이름에서 알 수 있듯이", "상품명 그대로", "자세히 보면",
    "자세히 살펴보면", "찾아보면", "확인해보면", "판매 페이지에서 확인",
    "상품 정보를 확인해보는 것이 좋습니다", "별도로 확인이 필요한",
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


def _make_titles(prompt):
    """실제 상품명만 사용해 과장 없는 제목 5개를 만듭니다."""
    name = _clean_name(_extract(prompt, "실제 상품명"))
    if not name:
        raise Exception("상품명을 확인할 수 없습니다.")

    titles = [
        f"{name} 상품 정보와 특징 정리",
        f"{name} 주요 정보 한눈에 보기",
        f"{name} 구매 전 알아둘 정보",
        f"{name} 상품 구성과 배송 정보",
        f"{name} 어떤 상품인지 간단 정리",
    ]
    return "\n".join(f"{i}. {title}" for i, title in enumerate(titles, 1))


def _make_body(prompt):
    """제품명은 제목에서만 한 번 사용하고, 제공된 정보의 의미를 설명합니다."""
    title = _extract(prompt, "[선택한 제목]")
    name = _clean_name(_extract(prompt, "상품명"))
    rocket = _extract(prompt, "로켓배송 여부")
    free_shipping = _extract(prompt, "무료배송 여부")
    partner_url = _extract(prompt, "[마지막 링크]")

    if not name:
        raise Exception("상품명을 확인할 수 없습니다.")

    # 제목에 상품명이 포함되므로 본문에서는 제품명을 다시 언급하지 않습니다.
    paragraphs = [title or name]

    paragraphs.append(
        "상품을 선택할 때는 이름만 보고 판단하기보다 실제로 제공되는 정보와 "
        "배송 조건을 함께 보는 것이 좋습니다. 이 글에서는 확인된 내용만 간단하게 정리했습니다."
    )

    delivery = []
    if rocket.lower() in ("true", "1", "yes"):
        delivery.append("로켓배송이 가능한 상품으로 표시되어 있습니다")
    elif rocket.lower() in ("false", "0", "no"):
        delivery.append("로켓배송 상품으로 표시되어 있지 않습니다")

    if free_shipping.lower() in ("true", "1", "yes"):
        delivery.append("무료배송 상품으로 표시되어 있습니다")
    elif free_shipping.lower() in ("false", "0", "no"):
        delivery.append("무료배송 상품으로 표시되어 있지 않습니다")

    if delivery:
        paragraphs.append(
            "배송 조건은 " + " 또한 ".join(delivery) + ". "
            "배송 방식을 중요하게 생각한다면 이 부분을 기준으로 선택하면 됩니다."
        )

    paragraphs.append(
        "현재 프로그램에서 확인할 수 있는 상품 정보는 위 내용까지입니다. "
        "확인되지 않은 사양이나 기능을 임의로 추가하지 않고, 실제 정보만으로 판단할 수 있도록 구성했습니다."
    )

    if partner_url:
        paragraphs.append(partner_url)

    text = "\n\n".join(paragraphs)

    # 반복적인 AI 표현은 최종 결과에서도 한 번 더 차단합니다.
    for phrase in FORBIDDEN_PHRASES:
        text = text.replace(phrase, "")

    return text.strip()


def generate_text(prompt):
    """기존 main.py와 호환되도록 제목/본문 생성 요청을 구분합니다."""
    if "제목 후보를 정확히 5개" in prompt:
        return _make_titles(prompt)
    return _make_body(prompt)
