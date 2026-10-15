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
    Write-Host "PASS - offline HTML contains embedded image, content, affiliate link and copy controls"
}
finally {
    Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue
}
