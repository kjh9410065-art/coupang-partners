# Windows PowerShell 5.1+ / no third-party dependencies.
# Logon and hourly scheduled task: authenticated Cloudflare KV -> signed-in OneDrive folder.
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$configFile = Join-Path $env:LOCALAPPDATA "CoupangDraftSync\settings.json"
$logFile = Join-Path $env:LOCALAPPDATA "CoupangDraftSync\sync.log"
if (-not (Test-Path -LiteralPath $configFile)) { throw "먼저 install.bat를 실행하여 동기화를 설정하세요." }

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
        if ($null -eq $draft -or $draft.id -notmatch '^\d{4}-\d{2}-\d{2}-(morning|evening)$') { continue }
        if ($draft.date -notmatch '^\d{4}-\d{2}-\d{2}$' -or $draft.productId -notmatch '^[0-9A-Za-z_-]{1,40}$') { continue }
        $slotName = if ($draft.slot -eq "morning") { "01_morning" } else { "02_evening" }
        $dayDir = Join-Path $targetRoot $draft.date
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
        $copyBody = $disclosure + $nl + $nl + $body
        Save-If-Missing (Join-Path $draftDir "title.txt") ($title + $nl)
        Save-If-Missing (Join-Path $draftDir "body.txt") ($copyBody + $nl)
        Save-If-Missing (Join-Path $draftDir "post.txt") ($title + $nl + $nl + $copyBody + $nl)
        Save-If-Missing (Join-Path $draftDir "product-link.txt") ($partnerUrl + $nl)
        $metadata = [ordered]@{
            generatedAt = $draft.createdAt
            priceCheckedAt = $draft.priceCheckedAt
            source = "Coupang Partners API"
            productName = $draft.productName
            priceAtGeneration = $draft.productPrice
            keyword = $draft.keyword
            productId = $draft.productId
            image = $draft.imageFilename
            note = "게시 전에 가격 및 판매 가능 여부를 다시 확인하세요."
        } | ConvertTo-Json -Depth 4
        Save-If-Missing (Join-Path $draftDir "meta.json") ($metadata + $nl)

        # Cloudflare KV에 저장한 원본 이미지 바이트를 내려받습니다.
        $imageName = [string]$draft.imageFilename
        if ($imageName -notmatch '^product\.(jpg|png|webp)$') {
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
