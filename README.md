# TCFLiCK Coupang Partners API v2

기존의 수동 추천·글쓰기 화면과 Windows PC 동기화, Cloudflare AI 원고 생성 로직을 제거하고, **쿠팡 공식 API 상품 검색·제휴 단축링크 발급에만 집중하는 서버**로 재설계한 소스입니다.

## 현재 상태
- 개발 브랜치: refactor/coupang-api-v2
- 운영 배포: 변경하지 않음 (기존 main 유지)
- 기존 코드 백업: backup/pre-api-rebuild-20261112
- 사용 목적: ChatGPT 조사/집필 → GitHub tcflick-blog-queue 원고 저장 → Work 게시
- GitHub에 API 인증키를 저장하지 않음. 새 API 토큰은 Cloudflare Secret에만 설정.
- 실제 배포와 쿠팡 API 실호출, ChatGPT/Work 연동은 별도 단계입니다.

## 주요 엔드포인트
- GET /health : 공개 생존 확인 (쿠팡 인증 성공을 의미하지 않음)
- POST /v1/products/search : 키워드로 상품 조회 (가격 제외)
- POST /v1/links : 상품 ID를 쿠팡 파트너스 단축링크로 변환
- POST /v1/recommend : 중복 ID를 제외하고 1~2개 제품 선정 + 링크 발급
- GET /recommend, /sync/* : 410 (과거 기능 제거)

POST API에는 반드시 Authorization: Bearer <BLOG_API_TOKEN> 헤더가 필요합니다.
서버는 브라우저용 공개 API가 아닙니다. 요청 로그·링크에 토큰을 포함하면 안 됩니다.

## 개발
- JavaScript ES module / Cloudflare Workers / Node.js 22 테스트
- cd cloudflare && npm test
- 소스: cloudflare/src
- 테스트: cloudflare/tests
- 상세 계약: docs/API.md
- Cloudflare 설정: cloudflare/wrangler.jsonc

## 배포 전 필수 조치
1. Cloudflare에 기존 COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY가 설정되어 있는지 검증.
2. 새 BLOG_API_TOKEN을 **24자 이상의 무작위 비밀값**으로 설정.
3. staging Worker에서 /health 와 인증 거부/성공을 테스트.
4. 상품 조회·단축링크 실발급 및 중복 추천 2개 테스트.
5. GitHub tcflick-blog-queue를 통한 후속 연결을 검증.
6. **이 단계 전까지 운영 main/Worker를 교체하지 않음.**

자세한 배포·보안 주의사항은 docs/API.md 참고.
