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


def _request(model, prompt):
    """지정한 Gemini 모델에 한 번 요청하고 결과를 반환합니다."""
    api_url = (
        "https://generativelanguage.googleapis.com/"
        f"v1beta/models/{model}:generateContent"
    )

    request_data = {
        "contents": [{"parts": [{"text": prompt}]}],
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
