# ChatGPT Work 인계 문서 — 쿠팡 파트너스 + TCFLiCK 네이버 블로그 초안 자동화

작성 기준: 2026-10-15 (KST). 이 문서는 후속 ChatGPT Work 작업자가 기존 작업을 정확하게 이어받을 수 있도록 작성했습니다. **문서만으로 배포·운영·PC 설치가 완료되었다는 뜻이 아닙니다.**

## 작업 목표와 사용자가 승인한 요구
- **하루 총 2개의 네이버 블로그 게시용 글**: 오전 9시(KST) 쿠팡 파트너스 상품 1개, 오후 6시(KST) TCFLiCK 계열 사이트 홍보 1개.
- PC가 꺼져 있어도 기존 Cloudflare Workers 클라우드 환경에서 원고 및 이미지 생성/저장을 진행.
- PC를 켜면 Windows + OneDrive로 자동 동기화. **상품 또는 서비스마다 `완성글.html` 파일 하나**를 더블클릭하여 제목/본문/사진/링크가 전부 보이게. 전체 복사 및 제목 복사 버튼 제공.
- 사용자가 **네이버 블로그에 복사·붙여넣기 후 게시**. 태그는 수동 입력. **네이버 자동 발행/브라우저 자동 조작은 구현하지 않음.**
- 실제 상품/사이트 정보만 사용하고 품질 낮은 정형 문장, 가짜 사용후기, 근거 없는 가격·사양·효과·수익 주장 금지. 상품 가격은 조회 시각을 표시하고 게시 직전 재확인.
- 쿠팡 상품 글의 맨 앞 필수 고지문 (정확한 원문):
  > 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
- **TCFLiCK 자체 사이트 홍보글에는 위 쿠팡 고지문을 절대 삽입하지 않음.** 방문 링크는 해당 공식 사이트 URL 사용.
- 운영 중인 사이트 기능을 바꾸거나 불필요한 새 Cloudflare 프로젝트/새 GitHub 저장소를 만들지 않음.
- **폐기한 보고팡은 홍보 대상에서 제외**. 미확인 기능/미출시 서비스 홍보 금지.

## 현재 코드와 저장소
- 유일한 이번 자동화 저장소: `kjh9410065-art/coupang-partners`, **main**.
- 2026-10-15 확인 결과 `main`에 다음이 병합됨:
  - PR #1: 글 생성 개선 / Workers AI와 품질 가드레일.
  - PR #2: Cloudflare KV 보관 + Windows/OneDrive 동기화.
  - PR #3: ZIP 파일을 삭제해도 작업 스케줄러가 동기화할 수 있도록 PC 로컬 경로에 스크립트 설치.
  - PR #4: 사진 내장 **오프라인 완성글.html**, 전체/제목 복사.
  - PR #5: TCFLiCK 하위 서비스 홍보글 추가 + 카테고리 분리, 브랜드 이미지, 테스트. merge commit `ebb48b16873589150e517696a111e2ef1d7a7004`.
- 관련 소스:
  - `cloudflare/src/worker.ts`: Worker 진입점, cron, 초안 생성, `/recommend` 및 `/sync/` API.
  - `cloudflare/src/recommend.ts`: 쿠팡 트렌드 검색/상품조회/딥링크/30분 내 가격 캐시.
  - `cloudflare/src/blog.ts`: 쿠팡 글 AI 본문/품질 검사, 고지문은 PC 완성글에서 한 번만 삽입.
  - `cloudflare/src/site-catalog.ts`: 실제 저장소 기준 사이트·기능·공식 브랜드 이미지 목록.
  - `cloudflare/src/site-promo.ts`: 사이트 소개글 AI 생성.
  - `cloudflare/src/draft-sync.ts`: KV 문서·원본 이미지 보관, 비밀 인증 API.
  - `cloudflare/wrangler.jsonc`: Worker 이름 `coupang-partners-automation`, Workers AI 바인딩 `AI`, KV `CONTENT_STORE`, cron.
  - `cloudflare/pc-sync/install.bat`, `setup.ps1`, `sync.ps1`, `render-post.ps1`: Windows 설치, 예약 작업, 다운로드, HTML 생성.
  - `cloudflare/tests/*.test.mjs`, `cloudflare/pc-sync/test-render.ps1`, `.github/workflows/naver-copy-quality.yml`: 자동 검사.
- 서비스 소개 홍보 대상(여섯 개 순환): TCFLiCK (`tcflick.com`), 밍카 (`mingka.tcflick.com`), 너딩 (`mova.tcflick.com`), 노빅 (`noviq.tcflick.com`), 모보카 (`movoka.tcflick.com`), 문서담 (`munsudam.tcflick.com`).
- 운결 등 공개 주소와 기능 상태를 검증하지 않은 사이트는 현재 홍보 순환에 없음.

## 현재까지 확인된 것과 미확인 사항
- 코드 변경은 GitHub **main에 병합**됐고, PR #5의 GitHub Actions에서 Node 테스트와 Windows PowerShell/HTML 출력 테스트가 **success**였음.
- **아직 기존 Cloudflare Worker에 해당 코드가 실제 배포됐다는 증거 없음.**
- `CONTENT_STORE` KV 네임스페이스, `AI` 바인딩, `COUPANG_ACCESS_KEY` / `COUPANG_SECRET_KEY`, `DRAFT_SYNC_TOKEN` 실제 운영 환경 설정 여부 **미확인**. 절대로 비밀값을 GitHub 또는 답변에 노출하지 말 것.
- 실제 스케줄 크론 실행, 쿠팡 실데이터 품질, 사이트 홍보 실제 AI 글 품질, 공개된 이미지의 다운로드/인라인 렌더링, 동기화 API 인증, Windows PC OneDrive 실제 파일 생성/동기화는 **실운영 검증 전**.
- Windows PC에 OneDrive가 로그인돼 있는지, `cloudflare/pc-sync/install.bat`가 실행됐는지 **미확인**.
- 쿠팡 제휴 상품 이미지 재사용 및 서비스 이미지의 저작권/표시 제약도 게시 전 확인.
- 네이버에 HTML을 복사해 붙여넣을 때 이미지가 사라질 수 있음. PC 동기화 폴더에 별도 이미지 파일을 유지하여 수동 첨부 가능하게 함.
- Cloudflare Workers AI 호출량 및 KV 사용량에 따라 요금/할당량 제한 가능. Work는 비용이 드는 설정 변경을 일방적으로 하지 말고 계정/요금/한도 확인.

## 후속 Work가 해야 할 일 — 실행 지시
1. `main`의 실제 최신 커밋과 관련 코드 전체를 조회. 새 저장소/새 Worker를 만들지 말고 기존 프로젝트만 대상으로 작업.
2. 저장소 코드를 정적 점검해 TypeScript/PowerShell/이미지 처리/캐시/정보 신선도/중복방지/기존 사용자 편집 파일 보호/문구 정확성/비밀 토큰 보안 문제 수정. 테스트가 통과했어도 실제 문제를 추가 발견하면 해결.
3. Cloudflare 기존 Worker 프로젝트 접근 상태와 계정 배포 경로 점검. 연결 승인이 필요하면 사용자에게 연결 동작을 요청하되, 비밀 키를 채팅이나 코드에 출력/복사하지 않음.
4. 기존 Worker에 Workers AI, KV, 쿠팡 관련 비밀값과 신규 `DRAFT_SYNC_TOKEN` 존재 확인. 필요시 UI의 Secret 입력 흐름으로 사용자가 직접 연결하도록 안내. 이미 정상인 값은 다시 요구하지 말 것.
5. 동일 Worker에 배포·시험하고 수동 invocation 또는 안전한 시험 경로로 **쿠팡 상품 글과 TCFLiCK 소개 글 각각 하나**를 실제 생성하여 서비스 정보/이미지/원고 품질 검증. 공식 상품 사진 또는 사이트 소유 이미지가 포함돼야 함. 가격·품절·게시 시각 불일치 방지.
6. 예약 실행 스케줄: KST 오전 9시/오후 6시 생성, 오전 10시/오후 7시 실패 재시도. 성공한 건 다시 만들지 않고, 하루 총 2개로 제한. 스케줄 로그와 중복 방지 검증.
7. 비밀 토큰 인증을 거쳐 동기화 API에서 JSON 원고+이미지 내려받는 흐름 검증. PC를 꺼두더라도 클라우드 생성·보관되는지 확인.
8. Windows PC를 직접 제어할 수 있는 Work 데스크톱 환경 및 사용자 승인이 있으면 OneDrive 로그인/설치 작업 실행; 없으면 설치가 실제 완료됐다고 주장하지 말고 PC에서 필요한 마지막 단계만 정확히 안내. 파일 하나에 제목·본문·사진·링크 포함된 `완성글.html` 열림 및 네이버 붙여넣기 확인, 태그 수동.
9. 프로젝트를 운영 가능한 상태로 만든 뒤 **실제 완료/미완료 항목, 배포 URL(실제로 확인된 경우에만), 시험 결과, 실패 처리, 사용자에게 필요한 최소 행동**을 한국어로 간결히 보고.

## 완료 판정 기준
- GitHub `main`에 안전한 수정이 반영되고 테스트/빌드 성공.
- **실제 기존 Cloudflare Worker** 배포 성공 및 테스트 호출 성공.
- 쿠팡 글 1건과 TCFLiCK 홍보글 1건에서 원고·공식 이미지·정확한 링크가 확인됨.
- 홍보글에 쿠팡 고지문 없음; 쿠팡 글에는 정확한 고지문 한 번.
- `완성글.html`을 열었을 때 제목·본문·이미지·링크 전부 보이고, 태그 자동삽입/네이버 자동발행 없음.
- 인증된 동기화 후 OneDrive 폴더에서 파일 확인 (PC 접근 불가라면 이 항목은 미검증으로 분명히 남김).
- 비밀 키 비노출, 비용·권한 확인, 자동 실행 로그/재시도 경로 점검.

## 사용자 선호
사용자는 장황한 해설보다 실행 결과·안정성·사용 편의성을 중시합니다. 기존에 만든 것과 겹치는 질문은 다시 하지 말고 실제 저장소와 배포 상황을 먼저 확인하세요.
