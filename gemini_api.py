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
    "비교해 보세요", "더 자세히 알아보세요",
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
    return value.lower() in ("true", "1", "yes")


def _make_titles(prompt):
    """실제 상품명만 사용해 과장 없는 제목 5개를 만듭니다."""
    name = _clean_name(_extract(prompt, "실제 상품명"))
    if not name:
        raise Exception("상품명을 확인할 수 없습니다.")

    titles = [
        f"{name} 상품 정보와 주요 특징",
        f"{name} 배송 조건과 상품 정보 정리",
        f"{name} 구매 전 알아둘 정보",
        f"{name} 상품 구성과 이용 정보",
        f"{name} 핵심 정보 간단 정리",
    ]
    return "\n".join(f"{i}. {title}" for i, title in enumerate(titles, 1))


def _make_body(prompt):
    """제품명은 제목에서만 한 번 사용하고, 확보된 정보를 설명형 문장으로 풀어냅니다."""
    title = _extract(prompt, "[선택한 제목]")
    name = _clean_name(_extract(prompt, "상품명"))
    rocket = _extract(prompt, "로켓배송 여부")
    free_shipping = _extract(prompt, "무료배송 여부")
    partner_url = _extract(prompt, "[마지막 링크]")

    if not name:
        raise Exception("상품명을 확인할 수 없습니다.")

    # 최종 글에서는 제목에서만 제품명을 노출하고 본문에서는 '이 상품'으로 지칭합니다.
    paragraphs = [title or name]
    paragraphs.append(
        "이번 상품은 현재 확보된 정보 기준으로 배송 조건과 기본 상품 정보를 중심으로 정리할 수 있습니다. "
        "확인된 내용을 단순히 나열하지 않고 실제 구매 판단에 연결되는 부분을 중심으로 설명했습니다."
    )

    delivery = []
    if _is_true(rocket):
        delivery.append(
            "로켓배송으로 표시되어 있어 배송 속도를 중요하게 생각하는 경우 배송 방식 측면에서 참고할 수 있습니다"
        )
    elif rocket.lower() in ("false", "0", "no"):
        delivery.append(
            "로켓배송으로 표시되지 않아 빠른 배송 여부를 배송 방식의 기준으로 삼는 경우에는 해당 조건을 고려해야 합니다"
        )

    if _is_true(free_shipping):
        delivery.append(
            "무료배송으로 표시되어 있어 배송비가 별도로 추가되는 상품과 비교할 때 배송 조건을 파악하기 쉽습니다"
        )
    elif free_shipping.lower() in ("false", "0", "no"):
        delivery.append(
            "무료배송으로 표시되지 않아 배송비가 발생할 수 있는 조건까지 함께 고려하는 것이 적절합니다"
        )

    if delivery:
        paragraphs.append(". ".join(delivery) + ".")

    paragraphs.append(
        "현재 검색 결과에서 확인된 정보만으로는 소재, 크기, 무게, 구성품, 세부 기능이나 성능 같은 속성을 확정할 수 없습니다. "
        "그래서 확인되지 않은 내용을 임의로 덧붙이지 않고, 실제로 확인된 정보가 구매 판단에 어떤 의미가 있는지만 정리했습니다."
    )

    if partner_url:
        paragraphs.append(partner_url)

    text = "\n\n".join(paragraphs)

    # 반복적인 AI식 표현은 최종 결과에서도 한 번 더 차단합니다.
    for phrase in FORBIDDEN_PHRASES:
        text = text.replace(phrase, "")

    return text.strip()


def generate_text(prompt):
    """기존 main.py와 호환되도록 제목/본문 생성 요청을 구분합니다."""
    if "제목 후보를 정확히 5개" in prompt:
        return _make_titles(prompt)
    return _make_body(prompt)
