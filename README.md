# coupang-partners

쿠팡 상품을 자동으로 선정하고 실제 Workers AI로 검증 가능한 네이버 블로그 글을 작성하는 도구입니다. 네이버 자동 게시 기능은 없습니다.

## 클라우드에서 하루 2회 글과 상품 이미지 생성

- 한국시간 오전 9시(UTC 00:00) 1건, 오후 6시(UTC 09:00) 1건 자동 생성
- 오전 10시 / 오후 7시 재시도: 이미 성공한 글은 중복 생성하지 않음
- 오전·오후에 서로 다른 상품을 선택하고 쿠팡 API 조회 시점 가격·파트너스 단축링크 사용
- 상품명으로 검증되지 않은 내용을 꾸며내지 않고, 품질 검사를 통과한 글만 저장
- 글 본문·제목·고지문·가격 메타데이터 및 쿠팡의 공식 상품 이미지 1장을 KV에 최대 120일 보관
- PC가 꺼져 있어도 Cloudflare에서 원고와 이미지 생성 (Cloudflare Worker 실제 배포 필요)
- 동기화 API `GET /sync/drafts`, `GET /sync/drafts/{id}/image`는 인증키 없이는 접근 불가

## Windows + OneDrive 자동 동기화 설치

1. **OneDrive 앱에 로그인**하여 PC의 OneDrive 폴더가 있는지 확인합니다.
2. GitHub의 저장소 ZIP을 내려받아 압축을 풉니다.
3. `cloudflare/pc-sync/install.bat`를 더블클릭합니다.
4. 기존 Cloudflare Worker HTTPS 주소를 입력합니다. 예: `https://<actual-worker>.workers.dev`.
5. 설치 프로그램이 보여주는 **동기화 키**를 복사해 Cloudflare의 기존 Worker **Settings → Variables and Secrets**에서 `DRAFT_SYNC_TOKEN` 이름의 **Secret**으로 등록합니다. 정확히 같은 값이어야 합니다.
6. 기존 Cloudflare Worker 프로젝트에 업데이트된 코드를 배포하고 `CONTENT_STORE` KV, 쿠팡 API 비밀 키, `AI` 바인딩이 연결됐는지 확인합니다.
7. PC를 다시 켜거나 로그인하면 자동 동기화됩니다. 로그인 후 매시간 자동 확인합니다.

PC 파일 저장 위치: `OneDrive\CoupangBlogDrafts\YYYY-MM-DD\01_morning_상품ID\` 및 `02_evening_상품ID\`.

폴더마다:
- `완성글.html`: **더블클릭해서 바로 여는 오프라인 완성글**. 제목, 제휴 고지문, 본문, 삽입된 공식 상품 이미지 1장, 링크를 한 화면에서 확인. 전체 복사 및 제목 복사 버튼 포함
- `title.txt`: 네이버 글 제목
- `body.txt`: 광고 고지문을 포함한 블로그 본문과 쿠팡 파트너스 링크
- `post.txt`: 제목부터 본문까지 전체 복사용
- `product-link.txt`: 쿠팡 파트너스 링크
- `product.jpg` 또는 `product.png` / `product.webp`: 공식 상품 이미지 1장
- `meta.json`: 가격과 조회 시각 및 상품 데이터

`완성글.html`은 상품 이미지 데이터까지 파일 내부에 포함하므로 사진 파일 없이도 열 수 있습니다. 글을 네이버에 복사할 때 브라우저/네이버 편집기에 따라 이미지가 빠질 수 있으니, 그때는 같은 폴더의 `product.jpg/png/webp` 파일을 직접 첨부하세요. **태그는 자동 생성하지 않으며 네이버에서 직접 작성합니다.**

동기화 클라이언트는 수동으로 수정한 파일을 덮어쓰지 않습니다. PC가 꺼져 있던 동안 생성된 글은 다음 로그인 시점에 내려받으며, OneDrive 자체 동기화도 적용됩니다. Cloudflare KV 저장 만료 기간은 **120일**입니다. 상품 가격·품절·배송 조건은 변할 수 있으므로 **게시 직전 최신 상태를 다시 확인**하세요.

원고 생성은 AI 사용량에 따라 비용이 발생할 수 있습니다. Cloudflare Secret은 GitHub 저장소나 OneDrive에 올리지 마세요. PC 인증 키는 Windows 로그인 사용자에게 묶인 암호화 저장소(`%LOCALAPPDATA%\CoupangDraftSync\settings.json`)에 보관됩니다.

## 설치가 아직 끝나지 않았을 때

GitHub에 코드를 반영하는 것만으로 Cloudflare의 실제 배포와 Windows 동기화 설정이 완료되는 것은 아닙니다. 설정이 되기 전에는 스케줄이 실행되지 않거나 `401 Unauthorized`가 반환될 수 있습니다.

## Windows 기존 로컬 도구

`python main.py` 및 `python auto_app.py`로 구동하는 로컬 보조 도구는 그대로 유지됩니다. 데스크톱의 `gemini_api.py`는 정형 문장 생성기이고, 새 Cloudflare Workers AI 글 작성기와는 다릅니다.
