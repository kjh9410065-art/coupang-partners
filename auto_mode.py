import re
import requests
import xml.etree.ElementTree as ET
from datetime import datetime

from coupang_api import search_products, prepare_product
from gemini_api import generate_text

# 한국에서 많이 검색되는 상품형 주제를 찾기 위한 보조 키워드입니다.
# 실시간 트렌드가 막힐 때만 fallback으로 사용합니다.
FALLBACK_KEYWORDS = [
    "노트북", "무선이어폰", "선풍기", "가습기", "텀블러", "운동화",
    "백팩", "청소기", "모니터", "키보드", "캠핑용품", "수납함",
    "보조배터리", "충전기", "생활용품", "주방용품", "여름용품",
]


def _clean_keyword(text):
    """트렌드 문구에서 검색에 방해되는 기호를 제거합니다."""
    text = re.sub(r"\s+", " ", text or "").strip()
    text = re.sub(r"[^0-9A-Za-z가-힣\s-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def get_trending_keywords(limit=12):
    """Google Trends 한국 실시간 RSS에서 현재 인기 검색어를 가져옵니다."""
    url = "https://trends.google.com/trending/rss?geo=KR"

    try:
        response = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=10,
        )
        response.raise_for_status()
        root = ET.fromstring(response.content)

        keywords = []
        # RSS의 item/title을 순회하면서 중복 없는 검색어만 보관합니다.
        for item in root.iter():
            if item.tag.endswith("item"):
                for child in item:
                    if child.tag.endswith("title") and child.text:
                        keyword = _clean_keyword(child.text)
                        if keyword and keyword not in keywords:
                            keywords.append(keyword)
                        break

        if keywords:
            return keywords[:limit]
    except Exception:
        pass

    return FALLBACK_KEYWORDS[:limit]


def _product_score(product, keyword):
    """상품을 자동 선택하기 위한 간단한 점수를 계산합니다."""
    score = 0
    name = product.get("productName", "").lower()
    keyword = keyword.lower()

    # 검색어가 상품명에 포함되면 우선합니다.
    if keyword in name:
        score += 50

    # 이미지와 파트너 링크가 모두 있는 상품을 우선합니다.
    if product.get("productImage"):
        score += 20
    if product.get("productUrl"):
        score += 30

    # 쿠팡 검색 결과의 앞 순위 상품을 조금 더 우선합니다.
    try:
        rank = int(product.get("rank") or 99)
        score += max(0, 20 - rank)
    except (TypeError, ValueError):
        pass

    return score


def choose_product():
    """오늘의 트렌드에서 쿠팡 상품을 자동으로 하나 선택합니다."""
    keywords = get_trending_keywords()

    candidates = []
    tried = set()

    # 트렌드 상위 검색어부터 쿠팡 상품을 찾아봅니다.
    for keyword in keywords:
        keyword = _clean_keyword(keyword)
        if not keyword or keyword in tried:
            continue
        tried.add(keyword)

        try:
            products = search_products(keyword, limit=10)
        except Exception:
            continue

        for product in products:
            candidates.append((
                _product_score(product, keyword),
                keyword,
                product,
            ))

        # 충분한 후보가 모이면 불필요한 API 호출을 줄입니다.
        if len(candidates) >= 30:
            break

    if not candidates:
        raise RuntimeError(
            "오늘의 트렌드에서 쿠팡 상품을 찾지 못했습니다. "
            "쿠팡파트너스 API 설정을 확인해주세요."
        )

    candidates.sort(key=lambda item: item[0], reverse=True)
    score, keyword, product = candidates[0]
    prepared = prepare_product(product)
    prepared["trend_keyword"] = keyword
    prepared["trend_score"] = score
    prepared["trend_checked_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    return prepared


def generate_auto_blog(product):
    """자동 선택된 상품을 네이버 블로그용 글로 완성합니다."""
    name = product.get("productName", "상품")
    price = product.get("productPrice", "")
    keyword = product.get("trend_keyword", "")
    partner_url = product.get("partner_url", "")

    prompt = f"""
[상품명]
{name}
[가격]
{price}
[트렌드 검색어]
{keyword}
[파트너스 링크]
{partner_url}

네이버 블로그에 바로 붙여넣을 수 있는 쿠팡파트너스 상품 소개 글을 작성해라.
상품명에 실제로 표시된 정보만 사용하고 성능, 재질, 용도, 할인, 가격 혜택을 추측하지 마라.
사용 후기나 내돈내산 경험처럼 쓰지 마라.
글은 짧고 자연스럽게 작성하며 같은 내용을 반복하지 마라.
첫 줄에는 반드시 쿠팡파트너스 고지문을 넣어라.
"""

    body = generate_text(prompt)
    return body.strip()


def create_today_post():
    """오늘의 상품 선정부터 블로그 글 생성까지 한 번에 실행합니다."""
    product = choose_product()
    post = generate_auto_blog(product)
    return product, post
