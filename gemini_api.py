import re

# 외부 AI API를 사용하지 않고 PC에서 바로 글을 만드는 무료 생성기입니다.
# 따라서 API 키, 월 사용료, 토큰 한도가 필요하지 않습니다.

FORBIDDEN_PHRASES = (
    "상품명을 보시면",
    "상품명을 보면",
    "상품명에서 알 수 있듯이",
    "상품명을 통해 알 수 있듯이",
    "장점을 보시면",
    "특징을 보시면",
    "이름에서 알 수 있듯이",
    "상품명 그대로",
)


def _extract(prompt, label):
    """프롬프트에서 일반 항목 또는 [섹션]의 값을 꺼냅니다."""
    if label.startswith("["):
        # [섹션] 형태는 다음 [섹션]이 시작되기 전까지의 내용을 가져옵니다.
        pattern = rf"{re.escape(label)}\s*\n?(.*?)(?=\n\[|$)"
    else:
        # 일반 항목은 같은 줄의 콜론 뒤 값을 가져옵니다.
        pattern = rf"{re.escape(label)}:\s*(.*?)(?=\n[A-Za-z가-힣].*?:|\n\[|$)"

    match = re.search(pattern, prompt, re.DOTALL)
    return match.group(1).strip() if match else ""


def _clean_name(name):
    """쿠팡 상품명에 붙은 불필요한 공백을 정리합니다."""
    return re.sub(r"\s+", " ", name).strip()


def _make_titles(prompt):
    """실제 상품명만 활용해 과장 없는 제목 5개를 만듭니다."""
    name = _clean_name(_extract(prompt, "실제 상품명"))
    if not name:
        raise Exception("상품명을 확인할 수 없습니다.")

    # 상품의 존재하지 않는 기능을 추측하지 않고 제목의 관점만 바꿉니다.
    titles = [
        f"{name} 상품 정보와 특징 정리",
        f"{name} 어떤 제품인지 간단하게 살펴보기",
        f"{name} 주요 정보 한눈에 보기",
        f"{name} 구매 전 확인할 상품 정보",
        f"{name} 상품 특징과 배송 정보 정리",
    ]
    return "\n".join(f"{i}. {title}" for i, title in enumerate(titles, 1))


def _make_body(prompt):
    """프롬프트에 들어온 확인 가능한 정보만으로 짧고 자연스러운 글을 만듭니다."""
    title = _extract(prompt, "[선택한 제목]")
    name = _clean_name(_extract(prompt, "상품명"))
    rocket = _extract(prompt, "로켓배송 여부")
    free_shipping = _extract(prompt, "무료배송 여부")
    partner_url = _extract(prompt, "[마지막 링크]")

    if not name:
        raise Exception("상품명을 확인할 수 없습니다.")

    paragraphs = []
    paragraphs.append(title or name)
    paragraphs.append(
        f"오늘 살펴볼 상품은 {name}입니다. 상품을 고를 때는 필요한 용도와 함께 "
        "현재 제공되는 상품 정보를 확인해보는 것이 좋습니다."
    )

    delivery = []
    if rocket.lower() in ("true", "1", "yes"):
        delivery.append("로켓배송이 가능한 상품으로 표시되어 있습니다.")
    elif rocket.lower() in ("false", "0", "no"):
        delivery.append("현재 상품 정보에서는 로켓배송 상품으로 표시되어 있지 않습니다.")

    if free_shipping.lower() in ("true", "1", "yes"):
        delivery.append("무료배송 상품으로 표시되어 있습니다.")
    elif free_shipping.lower() in ("false", "0", "no"):
        delivery.append("현재 상품 정보에서는 무료배송 상품으로 표시되어 있지 않습니다.")

    if delivery:
        paragraphs.append(" ".join(delivery))

    paragraphs.append(
        "상품의 세부 구성이나 기능처럼 별도로 확인이 필요한 내용은 실제 판매 페이지의 "
        "상품 정보를 기준으로 확인하는 것이 가장 정확합니다. 필요한 상품인지 살펴본 뒤 "
        "구매 여부를 결정하면 됩니다."
    )

    if partner_url:
        paragraphs.append(partner_url)

    text = "\n\n".join(paragraphs)

    # 혹시 금지 문구가 들어간 경우 즉시 제거합니다.
    for phrase in FORBIDDEN_PHRASES:
        text = text.replace(phrase, "")

    return text.strip()


def generate_text(prompt):
    """기존 Gemini 호출부와 호환되는 무료 로컬 생성 함수입니다."""
    # main.py는 제목과 본문 모두 이 함수를 호출하므로 프롬프트의 목적을 구분합니다.
    if "제목 후보를 정확히 5개" in prompt:
        return _make_titles(prompt)

    return _make_body(prompt)
