import os
import time

import requests
from dotenv import load_dotenv

# .env에서 Gemini API 키를 읽습니다.
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# 한 모델에 문제가 생기면 다음 모델로 자동 전환합니다.
MODELS = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
]

# 모든 생성 요청에 공통으로 적용하는 문체 규칙입니다.
# 상품명을 억지로 반복하며 설명하는 AI식 문장을 원천적으로 금지합니다.
FINAL_WRITING_RULES = """
[추가 필수 문체 규칙]
- 절대로 다음과 같은 AI식 문장 구조를 사용하지 않는다: '상품명을 보시면', '상품명을 보면', '상품명에서 알 수 있듯이', '상품명을 통해 알 수 있듯이', '장점을 보시면', '특징을 보시면', '이름에서 알 수 있듯이'.
- 상품명을 독자에게 보여주거나 설명하는 방식으로 문장을 시작하지 않는다.
- '이 제품은 ~제품입니다', '상품명 그대로 ~', '상품명을 보면 ~'처럼 상품명 자체를 근거로 장점이나 성능을 추론하지 않는다.
- 제공된 정보에 없는 특징을 상품명만 보고 추측하지 않는다.
- 같은 상품명을 문단마다 반복하지 않는다. 필요한 경우 자연스럽게 '이 제품', '해당 제품' 등으로 지칭한다.
- 독자에게 상품명을 보라고 권하는 표현, 상품명을 분석해서 장점을 설명하는 표현을 사용하지 않는다.
- 문장을 사람이 실제 블로그에 작성한 것처럼 자연스럽게 연결하고, 정형화된 AI 도입 문구를 피한다.
"""


def _request(model, prompt):
    """지정한 Gemini 모델에 한 번 요청하고 결과를 반환합니다."""
    api_url = (
        "https://generativelanguage.googleapis.com/"
        f"v1beta/models/{model}:generateContent"
    )

    # 본문뿐 아니라 제목 생성에서도 공통 문체 규칙을 지키도록 강제합니다.
    final_prompt = f"{prompt}\n\n{FINAL_WRITING_RULES}"

    request_data = {
        "contents": [{"parts": [{"text": final_prompt}]}],
        "generationConfig": {
            "maxOutputTokens": 4096,
            "temperature": 0.7,
        },
    }

    response = requests.post(
        api_url,
        headers={
            "x-goog-api-key": GEMINI_API_KEY,
            "Content-Type": "application/json",
        },
        json=request_data,
        timeout=120,
    )

    # 503은 일시적인 서버 문제일 수 있으므로 호출부에서 재시도합니다.
    if response.status_code == 503:
        raise RuntimeError("503")

    response.raise_for_status()
    result = response.json()
    candidates = result.get("candidates", [])
    if not candidates:
        raise Exception("Gemini 응답에 생성 결과가 없습니다.")

    parts = candidates[0].get("content", {}).get("parts", [])
    text = "\n".join(part.get("text", "") for part in parts).strip()
    if not text:
        raise Exception("Gemini가 빈 응답을 반환했습니다.")

    return text


def generate_text(prompt):
    """Gemini로 글을 생성하고 서버 오류가 나면 다른 모델로 전환합니다."""
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY가 .env에 없습니다.")

    last_error = None

    # 각 모델을 최대 3번 시도한 뒤 다음 모델로 넘어갑니다.
    for model in MODELS:
        for attempt in range(3):
            try:
                print(f"[Gemini 요청] {model} / {attempt + 1}/3")
                text = _request(model, prompt)
                print(f"[Gemini 완료] {model}")
                return text

            except RuntimeError as exc:
                last_error = exc
                print(f"[Gemini 503] {model} - 잠시 후 재시도")
                time.sleep(3)

            except requests.exceptions.Timeout as exc:
                last_error = exc
                print(f"[Gemini 시간 초과] {model}")
                time.sleep(2)

            except requests.exceptions.RequestException as exc:
                last_error = exc
                print(f"[Gemini 요청 오류] {model}: {exc}")
                break

            except Exception as exc:
                last_error = exc
                print(f"[Gemini 오류] {model}: {exc}")
                break

    raise Exception(
        "Gemini API 요청에 실패했습니다.\n\n"
        f"마지막 오류: {last_error}"
    )
