# Exercise the real HTML renderer on Windows runners without requiring Cloudflare or OneDrive.
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "render-post.ps1")
$folder = Join-Path ([IO.Path]::GetTempPath()) ("coupang-html-test-" + [guid]::NewGuid().ToString("n"))
[IO.Directory]::CreateDirectory($folder) | Out-Null
try {
    $image = Join-Path $folder "product.png"
    $html = Join-Path $folder "완성글.html"
    $png = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2K0AAAAASUVORK5CYII=")
    [IO.File]::WriteAllBytes($image, $png)
    $affiliate = "https://link.coupang.com/a/testing"
    $draft = [pscustomobject]@{
        title = '접이식 수납함 구매 전 정보'
        body = "캠핑 장비가 많아지면 수납 위치를 먼저 정해 볼 만합니다. 여행 중에도 활용할 곳을 고려하는 것이 좋겠습니다." +
               [Environment]::NewLine + [Environment]::NewLine +
               "상품명에는 30L라고 표시되어 있습니다. 실제 수납 용량이 필요한 짐에 맞는지 살펴볼 수 있습니다." +
               [Environment]::NewLine + [Environment]::NewLine +
               "상품 정보와 현재 구매 조건" + [Environment]::NewLine + $affiliate
        disclosure = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.'
        partnerUrl = $affiliate
        productName = "상품명 예시"
        priceCheckedAt = '2026-10-15T00:00:00Z'
    }
    Write-CompletedPost -Draft $draft -ImagePath $image -Destination $html | Out-Null
    $content = [IO.File]::ReadAllText($html, [Text.Encoding]::UTF8)
    foreach ($part in @("<!doctype html>", "data:image/png;base64,", "완성글 전체 복사", "제목만 복사", "태그는 네이버에서 직접 입력", $affiliate, "캠핑 장비", "쿠팡 파트너스 활동", "<figure>", "상품명 예시")) {
        if (-not $content.Contains($part)) { throw "완성글에서 필수 요소를 찾지 못했습니다: $part" }
    }
    if ($content -match "\{\{TITLE\}\}|\{\{BODY\}\}|\{\{LINK\}\}") { throw "치환하지 않은 템플릿 변수가 남아 있습니다." }
    if (($content.Split(@("data:image/png;base64,"), [StringSplitOptions]::None).Count - 1) -ne 1) {
        throw "이미지 한 장이 정확히 한 번 포함되어야 합니다."
    }
    # Re-sync must not overwrite an edited article.
    [IO.File]::WriteAllText($html, "edited by user", [Text.Encoding]::UTF8)
    Write-CompletedPost -Draft $draft -ImagePath $image -Destination $html | Out-Null
    if ([IO.File]::ReadAllText($html) -ne "edited by user") { throw "사용자가 수정한 완성글을 덮어썼습니다." }
    # TCFLiCK service article must show its own image and link, without any Coupang affiliate language.
    $siteImage = Join-Path $folder "product.svg"
    $siteHtml = Join-Path $folder "사이트완성글.html"
    [IO.File]::WriteAllText($siteImage, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#2255ee"/></svg>', [Text.Encoding]::UTF8)
    $siteUrl = "https://tcflick.com/"
    $siteDraft = [pscustomobject]@{
        kind = 'site'
        title = 'TCFLiCK 디지털 서비스 안내'
        body = "생활 속 필요한 디지털 도구를 찾아볼 수 있는 서비스입니다." + [Environment]::NewLine + [Environment]::NewLine + "사이트 바로가기" + [Environment]::NewLine + $siteUrl
        disclosure = ''
        partnerUrl = $siteUrl
        productName = 'TCFLiCK'
        priceCheckedAt = ''
    }
    Write-CompletedPost -Draft $siteDraft -ImagePath $siteImage -Destination $siteHtml | Out-Null
    $siteContent = [IO.File]::ReadAllText($siteHtml, [Text.Encoding]::UTF8)
    foreach ($part in @("data:image/svg+xml;base64,", "서비스 홈페이지 바로가기", "TCFLiCK 디지털 서비스 안내", "완성글 전체 복사", $siteUrl)) {
        if (-not $siteContent.Contains($part)) { throw "사이트 홍보 완성글에서 필수 요소를 찾지 못했습니다: $part" }
    }
    if ($siteContent.Contains('쿠팡 파트너스') -or $siteContent.Contains('쿠팡에서 상품 정보')) {
        throw "일반 사이트 홍보글에 쿠팡 제휴 고지문이 섞였습니다."
    }
    Write-Host "PASS - affiliate and site HTML both render offline with embedded branded images"

}
finally {
    Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue
}
