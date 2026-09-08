import os
import hashlib
import hmac
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

import requests
from dotenv import load_dotenv

# .env에서 쿠팡파트너스 API 키를 읽습니다.
load_dotenv()
ACCESS_KEY = os.getenv("COUPANG_ACCESS_KEY")
SECRET_KEY = os.getenv("COUPANG_SECRET_KEY")

# 쿠팡파트너스 API 기본 주소입니다.
BASE_URL = "https://api-gateway.coupang.com"
SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search"


def _make_authorization(method, path, query):
    """쿠팡파트너스 HMAC 인증 헤더를 생성합니다."""
    if not ACCESS_KEY or not SECRET_KEY:
        raise Exception("COUPANG_ACCESS_KEY 또는 COUPANG_SECRET_KEY가 .env에 없습니다.")

    # 쿠팡은 UTC 기준 날짜/시간을 사용합니다.
    signed_date = datetime.now(timezone.utc).strftime("%y%m%dT%H%M%SZ")
    message = signed_date + method + path + query

    signature = hmac.new(
        SECRET_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return (
        "CEA algorithm=HmacSHA256, "
        f"access-key={ACCESS_KEY}, "
        f"signed-date={signed_date}, "
        f"signature={signature}"
    )


def search_products(keyword, limit=10):
    """키워드로 쿠팡파트너스 상품을 검색합니다."""
    keyword = keyword.strip()
    if not keyword:
        raise Exception("검색어를 입력해주세요.")

    # 검색 API가 허용하는 범위 안에서 최대 10개만 요청합니다.
    limit = max(1, min(int(limit), 10))
    params = {"keyword": keyword, "limit": limit}
    query = urlencode(params)

    headers = {
        "Authorization": _make_authorization("GET", SEARCH_PATH, query),
        "Content-Type": "application/json;charset=UTF-8",
    }

    response = requests.get(
        BASE_URL + SEARCH_PATH,
        params=params,
        headers=headers,
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()

    # 호출하는 쪽에서 바로 상품 목록을 사용할 수 있도록 정규화합니다.
    return extract_products(data)


def extract_products(response):
    """쿠팡 API 응답에서 상품 정보만 뽑아 일정한 형태로 만듭니다."""
    if isinstance(response, list):
        raw_products = response
    else:
        raw_products = response.get("data", {}).get("productData", [])

    products = []
    for item in raw_products:
        products.append(
            {
                "productId": item.get("productId"),
                "productName": item.get("productName", ""),
                "productPrice": item.get("productPrice", ""),
                "productImage": item.get("productImage", ""),
                # 검색 API에서 이미 파트너스 링크가 제공되는 경우 그대로 사용합니다.
                "productUrl": item.get("productUrl", ""),
                "keyword": item.get("keyword", ""),
                "rank": item.get("rank", ""),
                "isRocket": item.get("isRocket", False),
                "isFreeShipping": item.get("isFreeShipping", False),
            }
        )

    return products


def download_product_image(product):
    """상품 대표 이미지를 images 폴더에 저장하고 파일 경로를 반환합니다."""
    image_url = product.get("productImage", "")
    product_id = str(product.get("productId", "product"))

    if not image_url:
        return ""

    image_dir = Path(__file__).resolve().parent / "images"
    image_dir.mkdir(exist_ok=True)
    image_path = image_dir / f"{product_id}.jpg"

    # 이미 다운로드한 이미지가 있으면 다시 요청하지 않습니다.
    if image_path.exists() and image_path.stat().st_size > 0:
        return str(image_path)

    response = requests.get(image_url, timeout=30)
    response.raise_for_status()
    image_path.write_bytes(response.content)
    return str(image_path)


def prepare_product(product):
    """선택한 상품에 블로그 생성에 필요한 부가 정보를 붙입니다."""
    prepared = dict(product)
    prepared["partner_url"] = product.get("productUrl", "")

    try:
        image_path = download_product_image(product)
    except Exception as exc:
        print(f"[상품 이미지] 다운로드 실패: {exc}")
        image_path = ""

    prepared["image_path"] = image_path
    prepared["image_paths"] = [image_path] if image_path else []
    return prepared
