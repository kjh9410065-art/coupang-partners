# Generates one self-contained HTML article with an embedded product photo.
# The HTML file opens offline by double-click. Tags are intentionally left for manual entry.
function Write-CompletedPost {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)] $Draft,
        [Parameter(Mandatory=$true)] [string] $ImagePath,
        [Parameter(Mandatory=$true)] [string] $Destination
    )

    if (-not (Test-Path -LiteralPath $ImagePath)) { throw "완성글에 필요한 상품 이미지가 없습니다." }
    if (Test-Path -LiteralPath $Destination) { return $Destination } # Preserve user edits.

    $isSite = [string]$Draft.kind -eq "site"
    $title = [System.Net.WebUtility]::HtmlEncode([string]$Draft.title)
    $disclosure = [System.Net.WebUtility]::HtmlEncode([string]$Draft.disclosure)
    $affiliateUrl = [string]$Draft.partnerUrl
    if ($affiliateUrl -notmatch '^https://') { throw "쿠팡 파트너스 링크가 올바르지 않습니다." }
    $link = [System.Net.WebUtility]::HtmlEncode($affiliateUrl)
    $productName = [System.Net.WebUtility]::HtmlEncode([string]$Draft.productName)
    $checkedAt = [System.Net.WebUtility]::HtmlEncode([string]$Draft.priceCheckedAt)

    # The generated blog body already contains the link at its end. Render that link as a real anchor once.
    $text = ([string]$Draft.body).Replace($affiliateUrl, "")
    $text = [regex]::Replace($text, '(?m)^\s*(상품 정보와 현재 구매 조건|사이트 바로가기)\s*$', '')
    $paragraphs = [regex]::Split($text.Trim(), '\r?\n\s*\r?\n') |
        ForEach-Object { $_.Trim() } | Where-Object { $_ }
    if (@($paragraphs).Count -lt 1) { throw "완성글 본문이 비어 있습니다." }

    $blocks = New-Object System.Collections.Generic.List[string]
    foreach ($para in $paragraphs) {
        $safe = [System.Net.WebUtility]::HtmlEncode($para)
        $blocks.Add('<p>' + $safe + '</p>')
    }
    # Use the single official Coupang image after the opening paragraph.
    $imageBytes = [IO.File]::ReadAllBytes($ImagePath)
    $ext = [IO.Path]::GetExtension($ImagePath).ToLowerInvariant()
    $imageMime = switch ($ext) { ".jpg" { "image/jpeg" } ".png" { "image/png" } ".webp" { "image/webp" } ".svg" { "image/svg+xml" } default { throw "지원하지 않는 상품 이미지 형식입니다." } }
    $imageSrc = "data:" + $imageMime + ";base64," + [Convert]::ToBase64String($imageBytes)
    $imageHtml = '<figure><img alt="' + $productName + '" src="' + $imageSrc + '"></figure>'
    $blocks.Insert(1, $imageHtml)

    # Offline HTML: no external fonts, scripts or tracking pixels.
    $template = @'
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>{{TITLE}} | 네이버 블로그 완성글</title>
<style>
* {box-sizing:border-box}
body {margin:0;background:#f4f6f8;color:#17202a;font-family:"Malgun Gothic","Noto Sans KR",sans-serif;line-height:1.85}
.page {max-width:790px;margin:0 auto;padding:24px 16px 66px}
.toolbar {background:#fff;border:1px solid #e5eaf0;border-radius:16px;padding:17px 20px;margin-bottom:18px;box-shadow:0 4px 20px #162a3d09}
.topline {display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.marker {font-size:12px;font-weight:800;letter-spacing:.09em;color:#64748b}
h2 {margin:4px 0;font-size:19px;line-height:1.45}
.hint {font-size:12px;color:#64748b;margin:7px 0 0}
.actions {display:flex;gap:9px;flex-wrap:wrap;margin-top:13px}
button {border:0;border-radius:10px;padding:10px 15px;font:700 13px "Malgun Gothic",sans-serif;cursor:pointer;background:#192f47;color:white}
button.secondary {background:#eaf0f6;color:#21354e}
button:focus-visible {outline:3px solid #9db7ff}
.message {font-size:12px;color:#075e46;margin-top:9px;min-height:19px}
.post {background:#fff;border:1px solid #e5eaf0;border-radius:16px;padding:36px 42px;box-shadow:0 6px 28px #162a3d0c}
.post h1 {font-size:29px;line-height:1.45;letter-spacing:-.035em;margin:0 0 22px;word-break:keep-all}
.disclosure {font-size:12px;color:#697586;background:#f7f8fa;padding:12px 14px;border-radius:8px;margin:0 0 26px}
.article-body p {font-size:16px;margin:0 0 20px;white-space:pre-line;word-break:keep-all;overflow-wrap:break-word}
figure {margin:28px 0 32px;text-align:center}
figure img {display:block;width:100%;max-height:510px;object-fit:contain;border-radius:12px;border:1px solid #e7ebef;background:white}
.product-link {margin-top:26px;padding-top:20px;border-top:1px solid #e5eaf0}
.product-link a {display:inline-block;color:#125a9e;font-weight:700;text-decoration:underline;overflow-wrap:anywhere}
.meta {font-size:12px;color:#64748b;margin-top:15px}
footer {margin:18px 4px;color:#697586;font-size:12px}
@media(max-width:620px){.page{padding:12px 10px 30px}.toolbar{padding:14px}.post{padding:24px 18px}.post h1{font-size:23px}.article-body p{font-size:15px}}
@media print {.toolbar,footer{display:none}.page{padding:0}.post{border:0;box-shadow:none;padding:0}}
</style>
</head>
<body>
<main class="page">
<div class="toolbar">
 <div class="topline"><span class="marker">NAVER BLOG · 완성글 미리보기</span><span class="marker">OFFLINE FILE</span></div>
 <h2>{{TOOLBAR_LABEL}}</h2>
 <p class="hint">이 파일 하나로 글 전체를 확인할 수 있습니다. 태그는 네이버에서 직접 입력하세요.</p>
 <div class="actions">
   <button type="button" onclick="copyPost()">완성글 전체 복사</button>
   <button type="button" class="secondary" onclick="copyTitle()">제목만 복사</button>
   <button type="button" class="secondary" onclick="window.print()">인쇄</button>
 </div>
 <div id="message" class="message" role="status" aria-live="polite"></div>
 <p class="hint">네이버 편집기가 붙여넣은 이미지를 제외할 수도 있습니다. 그때는 같은 폴더의 product 이미지 파일을 직접 첨부하세요.</p>
</div>
<article id="blog-post" class="post">
 <h1 id="post-title">{{TITLE}}</h1>
 {{DISCLOSURE_BLOCK}}
 <div class="article-body">{{BODY}}</div>
 <div class="product-link"><a id="affiliate-link" href="{{LINK}}" target="_blank" rel="noopener noreferrer">{{CTA_LABEL}}</a></div>
</article>
<footer>{{FOOTER_LABEL}}</footer>
</main>
<script>
function setMessage(text) {
 document.getElementById("message").textContent = text;
}
async function copyTitle() {
 const title = document.getElementById("post-title").innerText;
 try { await navigator.clipboard.writeText(title); setMessage("제목을 복사했습니다."); }
 catch (e) { fallbackCopy(document.getElementById("post-title")); }
}
async function copyPost() {
 const article = document.getElementById("blog-post");
 const url = document.getElementById("affiliate-link").href;
 const plain = article.innerText + "\n" + url;
 try {
   if (!navigator.clipboard || !navigator.clipboard.write || !window.ClipboardItem) throw Error("rich clipboard not available");
   const rich = new Blob([article.outerHTML], {type:"text/html"});
   const raw = new Blob([plain], {type:"text/plain"});
   await navigator.clipboard.write([new ClipboardItem({"text/html":rich,"text/plain":raw})]);
   setMessage("완성글을 복사했습니다. 네이버에 붙여넣고 이미지 표시 여부를 확인하세요.");
 } catch (e) {
   fallbackCopy(article);
 }
}
function fallbackCopy(element) {
 const selection = window.getSelection();
 const range = document.createRange();
 range.selectNodeContents(element);
 selection.removeAllRanges();
 selection.addRange(range);
 const ok = document.execCommand("copy");
 selection.removeAllRanges();
 setMessage(ok ? "내용을 복사했습니다. 네이버에서 이미지 표시도 확인하세요." : "자동 복사에 실패했습니다. 완성글을 직접 선택해 복사하세요.");
}
</script>
</body>
</html>
'@

    $disclosureBlock = if ($isSite) { '' } else { '<p class="disclosure">' + $disclosure + '</p>' }
    $toolbarLabel = if ($isSite) { '제목·소개글·서비스 이미지·사이트 링크' } else { '제목·고지문·본문·상품 이미지·제휴 링크' }
    $ctaLabel = if ($isSite) { '서비스 홈페이지 바로가기' } else { '쿠팡에서 상품 정보 확인하기' }
    $footerLabel = if ($isSite) {
        '직접 운영하는 서비스 소개 · 게시 전에 사이트 접속과 기능 확인 권장'
    } else {
        '상품: ' + $productName + ' · 가격 확인 시각: ' + $checkedAt + ' · 게시 전 가격과 판매 상태 재확인 권장'
    }
    $html = $template.Replace('{{TITLE}}', $title).
        Replace('{{DISCLOSURE_BLOCK}}', $disclosureBlock).
        Replace('{{TOOLBAR_LABEL}}', $toolbarLabel).
        Replace('{{CTA_LABEL}}', $ctaLabel).
        Replace('{{FOOTER_LABEL}}', $footerLabel).
        Replace('{{BODY}}', ($blocks -join [Environment]::NewLine)).
        Replace('{{LINK}}', $link)

    # Write atomically and never overwrite a file that the user may have edited.
    $temporary = $Destination + ".building"
    try {
        [IO.File]::WriteAllText($temporary, $html, (New-Object System.Text.UTF8Encoding($false)))
        if (-not (Test-Path -LiteralPath $Destination)) {
            Move-Item -LiteralPath $temporary -Destination $Destination
        }
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
    return $Destination
}
