# Coupang Partners

2026-10-16 사용자 요청으로 정기 글 생성과 PC 동기화 기능을 제거했습니다.

기존 수동 상품 추천 화면(`/`)과 추천·글 생성 API(`/recommend`)는 유지합니다.
네이버 자동 게시 및 자동 태그 입력 기능은 없습니다.

Cloudflare 배포 설정: `cloudflare/wrangler.jsonc`. Cron 목록은 비어 있습니다.
기존 PC 클라이언트의 `/sync/*` 요청에는 410을 반환합니다.

PC에 이미 설치된 Windows 예약 작업과 파일은 해당 PC에서 별도로 제거해야 합니다.
