# Windows PowerShell 5.1+ / no third-party dependencies.
# Logon and hourly scheduled task: authenticated Cloudflare KV -> signed-in OneDrive folder.
$ErrorActionPreference = "Stop"
# 로그인/시간별 실행이 겹쳐도 같은 파일을 동시에 쓰지 않습니다.
$syncMutex = New-Object System.Threading.Mutex($false, "Local\CoupangDraftSync")
$ownsMutex = $false
try {
    try { $ownsMutex = $syncMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { return }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$configFile = Join-Path $env:LOCALAPPDATA "CoupangDraftSync\settings.json"
$logFile = Join-Path $env:LOCALAPPDATA "CoupangDraftSync\sync.log"
if (-not (Test-Path -LiteralPath $configFile)) { throw "먼저 install.bat를 실행하여 동기화를 설정하세요." }
# 완성글.html 생성 함수 (상품 이미지가 다운로드된 뒤 실행)
. (Join-Path $PSScriptRoot "render-post.ps1")

function Log([string]$message) {
    $line = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + " " + $message
    Add-Content -LiteralPath $logFile -Encoding UTF8 -Value $line
}
function Save-If-Missing([string]$path, [string]$content) {
    # 수동 편집해 둔 글을 동기화 과정에서 덮어쓰지 않습니다.
    if (-not (Test-Path -LiteralPath $path)) {
        [IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
    }
}
$settings = Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
$secure = ConvertTo-SecureString $settings.encryptedToken
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

try {
    $urlBase = $settings.workerUrl.TrimEnd("/")
    $headers = @{ Authorization = "Bearer $token" }
    $response = Invoke-RestMethod -Method Get -Uri ($urlBase + "/sync/drafts") -Headers $headers -TimeoutSec 60
    if (-not $response.ok) { throw "클라우드 동기화 API 응답이 올바르지 않습니다." }
    $targetRoot = [string]$settings.outputFolder
    [IO.Directory]::CreateDirectory($targetRoot) | Out-Null
    $count = 0

    foreach ($draft in @($response.drafts)) {
        if ($null -eq $draft -or $draft.id -notmatch '^\d{4}-\d{2}-\d{2}-(morning|afternoon|evening)$') { continue }
        if ($draft.date -notmatch '^\d{4}-\d{2}-\d{2}$' -or $draft.productId -notmatch '^[0-9A-Za-z_-]{1,40}$') { continue }
        $isSite = [string]$draft.kind -eq "site"
        $category = if ($isSite) { "TCFLiCK홍보" } else { "쿠팡상품" }
        $slotName = if ($isSite) { "02_site" } elseif ([string]$draft.slot -eq "afternoon") { "02_product" } else { "01_product" }
        $dayDir = Join-Path (Join-Path $targetRoot $category) $draft.date
        $draftDir = Join-Path $dayDir ($slotName + "_" + $draft.productId)
        [IO.Directory]::CreateDirectory($draftDir) | Out-Null

        $title = [string]$draft.title
        $disclosure = [string]$draft.disclosure
        $body = [string]$draft.body
        $partnerUrl = [string]$draft.partnerUrl
        if (-not $title -or -not $body -or -not $partnerUrl -or $body.IndexOf($partnerUrl) -lt 0) {
            Log ("SKIP invalid article " + $draft.id); continue
        }
        $nl = [Environment]::NewLine
        $copyBody = if ($isSite) { $body } else { $disclosure + $nl + $nl + $body }
        Save-If-Missing (Join-Path $draftDir "title.txt") ($title + $nl)
        Save-If-Missing (Join-Path $draftDir "body.txt") ($copyBody + $nl)
        Save-If-Missing (Join-Path $draftDir "post.txt") ($title + $nl + $nl + $copyBody + $nl)
        $linkName = if ($isSite) { "site-link.txt" } else { "product-link.txt" }
        Save-If-Missing (Join-Path $draftDir $linkName) ($partnerUrl + $nl)
        $metadata = [ordered]@{
            generatedAt = $draft.createdAt
            priceCheckedAt = $draft.priceCheckedAt
            kind = if ($isSite) { "site" } else { "affiliate" }
            source = if ($isSite) { "TCFLiCK service repository" } else { "Coupang Partners API" }
            productName = $draft.productName
            priceAtGeneration = $draft.productPrice
            keyword = $draft.keyword
            productId = $draft.productId
            image = $draft.imageFilename
            note = if ($isSite) { "게시 전 사이트 기능과 접속 가능 여부를 확인하세요." } else { "게시 전에 가격 및 판매 가능 여부를 다시 확인하세요." }
        } | ConvertTo-Json -Depth 4
        Save-If-Missing (Join-Path $draftDir "meta.json") ($metadata + $nl)

        # Cloudflare KV에 저장한 원본 이미지 바이트를 내려받습니다.
        $imageName = [string]$draft.imageFilename
        if ($imageName -notmatch '^product\.(jpg|png|webp|svg)$') {
            Log ("SKIP invalid image filename " + $draft.id); continue
        }
        $imagePath = Join-Path $draftDir $imageName
        if (-not (Test-Path -LiteralPath $imagePath) -or (Get-Item -LiteralPath $imagePath).Length -eq 0) {
            $temp = $imagePath + ".download"
            try {
                Invoke-WebRequest -UseBasicParsing -Method Get -Uri ($urlBase + "/sync/drafts/" + $draft.id + "/image") -Headers $headers -TimeoutSec 60 -OutFile $temp | Out-Null
                if ((Get-Item -LiteralPath $temp).Length -eq 0) { throw "이미지가 비어 있습니다." }
                Move-Item -LiteralPath $temp -Destination $imagePath -Force
            } catch {
                Remove-Item -LiteralPath $temp -ErrorAction SilentlyContinue
                Log ("IMAGE ERROR " + $draft.id + " " + $_.Exception.Message)
                continue
            }
        }
        # 글과 이미지를 한 파일에서 볼 수 있는 오프라인 '완성글.html'도 생성합니다.
        # 사용자가 손본 파일은 덮어쓰지 않습니다.
        try {
            $readyHtml = Join-Path $draftDir "완성글.html"
            Write-CompletedPost -Draft $draft -ImagePath $imagePath -Destination $readyHtml | Out-Null
        } catch {
            Log ("HTML ERROR " + $draft.id + " " + $_.Exception.Message)
            continue
        }
        $count++
    }
    Log ("OK checked=" + @($response.drafts).Count + " ready=" + $count)
}
catch {
    Log ("ERROR " + $_.Exception.Message)
    throw
}
finally {
    $token = $null
}

} finally {
    if ($ownsMutex) { $syncMutex.ReleaseMutex() }
    $syncMutex.Dispose()
}
