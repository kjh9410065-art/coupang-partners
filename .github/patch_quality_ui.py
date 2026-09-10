from pathlib import Path

# PATCH_TRIGGER_20260910_1758
root = Path("cloudflare/src")

# index.ts: 중복 titles 선언 제거 + 본문 속 중복 고지문 제거
index = root / "index.ts"
s = index.read_text(encoding="utf-8")
old = '''    const titles=[
      `${productName} 상품 정보와 구매 전 확인할 점`,
      `${keyword} 검색 결과에서 살펴본 ${productName}`,
      `구매 전에 확인할 ${productName} 기본 정보`,
      `${productName} 배송 조건과 현재 검색 정보 정리`,
      `${keyword} 상품 선택 전 체크할 ${productName} 내용`
    ];
    // AI를 사용할 수 없는 경우에도 웹 조사 결과의 문장을 근거로만 설명합니다.
'''
new = '''    // AI를 사용할 수 없는 경우에도 웹 조사 결과의 문장을 근거로만 설명합니다.
'''
if old not in s:
    raise SystemExit("index.ts: duplicate titles block not found")
s = s.replace(old, new, 1)
s = s.replace('\\n\\n${PARTNERS_DISCLOSURE}\\n\\n제품을 알아본 내용', '\\n\\n제품을 알아본 내용', 1)
index.write_text(s, encoding="utf-8")

# dashboard.ts: 제목을 별도 박스로 분리하고 본문 복사에서 제목을 제외
dashboard = root / "dashboard.ts"
s = dashboard.read_text(encoding="utf-8")
old = '''  const title = blog.selectedTitle ?? blog.titles?.[0] ?? "";
  const disclosure = blog.disclosure ?? "";
  const body = blog.body ?? "";
  const partnerUrl = blog.partnerUrl ?? blog.productUrl ?? "";
  return [title, "", disclosure, "", body, "", "상품 링크", partnerUrl].filter((v) => v !== undefined).join("\\n").trim();
'''
new = '''  // 제목은 별도 박스에서 복사하므로 게시용 본문 복사 영역에서는 제외합니다.
  const disclosure = blog.disclosure ?? "";
  const body = blog.body ?? "";
  const partnerUrl = blog.partnerUrl ?? blog.productUrl ?? "";
  return [disclosure, "", body, "", "상품 링크", partnerUrl].filter((v) => v !== undefined && v !== "").join("\\n").trim();
'''
if old not in s:
    raise SystemExit("dashboard.ts: buildCopyText block not found")
s = s.replace(old, new, 1)
old = '''    <h2>${escapeHtml(blog.selectedTitle ?? titles[0] ?? post.keyword ?? "자동 생성 콘텐츠")}</h2>
    <p class="meta">검색 주제: ${escapeHtml(post.keyword ?? "-")} · 생성: ${escapeHtml(post.savedAt ?? "-")}</p>
'''
new = '''    <div class="title-box">
      <div class="title-label">게시 제목</div>
      <div class="title-value">${escapeHtml(blog.selectedTitle ?? titles[0] ?? post.keyword ?? "자동 생성 콘텐츠")}</div>
      <button type="button" class="title-copy" onclick="copyContent('title-${escapeJs(platform)}',${escapeJs(blog.selectedTitle ?? titles[0] ?? post.keyword ?? "자동 생성 콘텐츠")})">제목 복사</button>
    </div>
    <p class="meta">검색 주제: ${escapeHtml(post.keyword ?? "-")} · 생성: ${escapeHtml(post.savedAt ?? "-")}</p>
'''
if old not in s:
    raise SystemExit("dashboard.ts: title render block not found")
s = s.replace(old, new, 1)
old = '.card h2{margin:0 0 7px;font-size:21px}.meta{margin:0 0 10px;color:#6b7280;font-size:12px}'
new = '.card h2{margin:0 0 7px;font-size:21px}.title-box{position:relative;margin:8px 0 12px;padding:14px 84px 14px 15px;border:1px solid #dbe2ea;border-radius:12px;background:#f8fafc}.title-label{font-size:11px;font-weight:800;color:#6b7280;margin-bottom:5px}.title-value{font-size:18px;font-weight:800;line-height:1.5;color:#111827}.title-copy{position:absolute;right:12px;top:12px;border:0;border-radius:8px;padding:8px 10px;background:#111827;color:#fff;font-size:12px;font-weight:700;cursor:pointer}.meta{margin:0 0 10px;color:#6b7280;font-size:12px}'
if old not in s:
    raise SystemExit("dashboard.ts: desktop CSS block not found")
s = s.replace(old, new, 1)
old = '@media(max-width:600px){.wrap{padding:18px 10px 40px}.card{padding:16px}'
new = '@media(max-width:600px){.wrap{padding:18px 10px 40px}.card{padding:16px}.title-box{padding:12px}.title-copy{position:static;margin-top:9px;width:100%}'
if old not in s:
    raise SystemExit("dashboard.ts: mobile CSS block not found")
s = s.replace(old, new, 1)
dashboard.write_text(s, encoding="utf-8")

# factcheck.ts: 가격을 적으면 현재 쿠팡 API 가격과 정확히 일치해야 통과
fact = root / "factcheck.ts"
s = fact.read_text(encoding="utf-8")
old = '''  // 배송/가격은 API 확정값과 다르면 사실 오류로 봅니다.
  const price = input.product?.productPrice;
  if (price && new RegExp(`${price.toLocaleString()}?\\\\s*원`).test(input.body.replaceAll(",", ""))) {
    // 현재 가격을 언급했다면 API 값과 일치하는 경우만 허용합니다.
  }

  if (/최저가|최저 가격|역대급|무조건|100% 만족|완벽|최고의 제품/i.test(input.body)) {
'''
new = '''  // 가격을 본문에 적는 경우에는 현재 쿠팡 API 가격과 정확히 일치해야 합니다.
  // 가격이 확인되지 않으면 가격을 사실처럼 쓰지 못하게 차단합니다.
  const priceMentions = input.body.match(/\\d{1,3}(?:,\\d{3})*\\s*원/g) ?? [];
  const price = Number(input.product?.productPrice) || 0;
  if (priceMentions.length) {
    const normalizedPrice = price.toLocaleString("ko-KR");
    const invalidPrice = price <= 0 || priceMentions.some((mention) => !mention.replace(/\\s/g, "").startsWith(`${normalizedPrice}원`));
    if (invalidPrice) reasons.push("본문의 가격 정보가 현재 쿠팡 검색 결과 가격과 일치하지 않습니다.");
  }

  if (/최저가|최저 가격|역대급|무조건|100% 만족|완벽|최고의 제품/i.test(input.body)) {
'''
if old not in s:
    raise SystemExit("factcheck.ts: price block not found")
s = s.replace(old, new, 1)
fact.write_text(s, encoding="utf-8")

print("patch complete")
