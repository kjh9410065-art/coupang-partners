# Coupang Partners API v2 · 호출 계약

## 인증
/health와 / 이외의 새 API는 비밀 환경변수 BLOG_API_TOKEN에 의한 Bearer 인증이 필요합니다.
COUPANG_ACCESS_KEY와 COUPANG_SECRET_KEY는 쿠팡 Open API HMAC 서명에만 사용합니다.
GitHub, 블로그 원고, 링크 URL, 브라우저 콘솔에 토큰을 기록하지 않습니다.
Cloudflare 대시보드에서 Secret을 등록하거나:
  cd cloudflare
  npx wrangler secret put BLOG_API_TOKEN
기존 Worker를 곧바로 바꾸지 말고 별도 staging 배포에서 먼저 검증하세요.

## 요청/응답
Content-Type: application/json
Authorization: Bearer <BLOG_API_TOKEN>

### GET /health
200: {"ok":true,"service":"coupang-partners","version":"2.0.0","status":"alive"}
인증키, 쿠팡 upstream 동작까지 확인하는 health check는 아닙니다.

### POST /v1/products/search
요청: {"keyword":"주방용품","limit":5}
응답: {"ok":true,"keyword":"주방용품","count":2,"products":[{"productId":"12345678","productName":"...","productImage":"https://...","productUrl":"https://www.coupang.com/...","rank":1,"isRocket":true}]}
limit 1~10, 생략 시 10. 금액은 응답하지 않습니다.
상품 이미지는 URL 참고용이며 게시 권한이 자동 부여되는 것은 아닙니다.

### POST /v1/links
요청: {"productId":"12345678"}
응답: {"ok":true,"productId":"12345678","productUrl":"https://www.coupang.com/vp/products/12345678","partnerUrl":"https://link.coupang.com/..."}
제휴 링크는 쿠팡 응답을 그대로 사용하며 임의로 만들지 않습니다.

### POST /v1/recommend
요청: {"keywords":["주방용품","생활용품"],"count":2,"excludeProductIds":["12345678"]}
응답: {"ok":true,"count":2,"products":[{"keyword":"생활용품","productId":"...","productName":"...","productImage":"...","productUrl":"...","partnerUrl":"...","rank":2,"isRocket":false}]}
키워드 최대 5개, count 1 또는 2, excludeProductIds 최대 100건.
오늘의 과거 사용 상품 목록은 호출자가 GitHub history에서 가져와 요청에 넣어야 합니다.
서버는 과거 게시물 이력이나 임시저장 데이터를 직접 관리하지 않습니다.

## 오류
401 UNAUTHORIZED, 503 SERVICE_NOT_CONFIGURED, 400 INVALID_KEYWORD/INVALID_PRODUCT_ID 등,
502 UPSTREAM_REJECTED/UPSTREAM_INVALID_DATA/UPSTREAM_INVALID_LINK/UPSTREAM_UNREACHABLE,
404 NO_AVAILABLE_PRODUCT.
원본 쿠팡 응답, HMAC 서명, 인증키는 외부 오류에 포함하지 않습니다.

## 호환성과 주의
기존 /recommend 화면 및 글 생성 인터페이스는 v2에서 제거됩니다(410).
기존 배포에 의존한 자동화가 없다는 것을 다시 확인하고 배포하세요.
GitHub main 반영과 Cloudflare 배포는 별도로 확인해야 합니다. Cloudflare 배포 전 Secret 설정 및 실제 API 호출 검증을 수행합니다.
