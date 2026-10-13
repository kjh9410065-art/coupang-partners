# coupang-partners

쿠팡 상품 선택과 블로그 초안 작성을 돕는 반자동 도구입니다. 자동 게시하지 않습니다.

## 웹 버전

- 상품 추천, 검색 순위별 다음 상품 선택, 파트너스 단축링크 생성
- 확인된 상품명·조회 가격·배송 표시로 초안 생성 (외부 AI 호출 없음)
- 제목·본문 편집, 제목/본문/링크 복사
- 본문 복사 시 상단 고지문과 파트너스 링크 포함
- 한국 날짜 기준 캐시, 기본 추천과 검색 관심 신호 구분
- 매일 한국시간 오전 9시 추천 캐시 준비 및 실행 결과 저장

Cloudflare 배포 설정은 `cloudflare/wrangler.jsonc`, 진입점은 `cloudflare/src/worker.ts`입니다. `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY` 비밀값과 `CONTENT_STORE` KV 바인딩이 필요합니다. 기존 Worker 이름과 배포 설정은 Cloudflare 프로젝트 설정도 확인하세요.

## Windows PC 버전

1. `pip install -r requirements.txt`
2. 프로젝트 `.env`에 `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY` 설정
3. `python main.py` 실행 (자동 상품 선택 기능은 `python auto_app.py`)

`gemini_api.py`는 기존 파일명을 유지한 로컬 문장 생성기입니다. 현재 Gemini API를 호출하지 않으며 Gemini 키가 필요하지 않습니다.

API 비밀키가 들어 있는 `.env`는 저장소에 올리지 않습니다. 이미지와 블로그 게시 작업은 직접 확인 후 진행합니다.
