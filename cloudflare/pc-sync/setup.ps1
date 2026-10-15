# Run through install.bat on Windows. Keeps the sync token encrypted for this Windows account only.
$ErrorActionPreference = "Stop"
$onedrive = @($env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $onedrive) {
    Write-Host "OneDrive 폴더를 찾지 못했습니다. Windows OneDrive에 로그인한 뒤 다시 실행하세요." -ForegroundColor Yellow
    exit 1
}
$configDir = Join-Path $env:LOCALAPPDATA "CoupangDraftSync"
[IO.Directory]::CreateDirectory($configDir) | Out-Null
$configFile = Join-Path $configDir "settings.json"
$existing = if (Test-Path -LiteralPath $configFile) { Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }

$workerUrl = if ($existing) { [string]$existing.workerUrl } else { Read-Host "배포된 Cloudflare Worker HTTPS 주소 입력" }
try {
    $uri = New-Object Uri($workerUrl)
    if ($uri.Scheme -ne "https" -or -not $uri.Host) { throw "HTTP is not allowed" }
} catch {
    Write-Host "올바른 HTTPS Cloudflare Worker 주소가 필요합니다." -ForegroundColor Red
    exit 1
}

if ($existing -and $existing.encryptedToken) {
    $encrypted = [string]$existing.encryptedToken
    Write-Host "기존에 설정한 인증 키를 그대로 사용합니다."
} else {
    $bytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    $plainToken = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $encrypted = ConvertTo-SecureString -String $plainToken -AsPlainText -Force | ConvertFrom-SecureString
    Write-Host ""
    Write-Host "중요: Cloudflare Worker 설정의 Secrets에 DRAFT_SYNC_TOKEN 이름으로 다음 값을 넣으세요." -ForegroundColor Yellow
    Write-Host $plainToken -ForegroundColor Cyan
    Write-Host "인증 키는 공개하거나 GitHub에 올리지 마세요."
}

$outputDir = Join-Path $onedrive "CoupangBlogDrafts"
[IO.Directory]::CreateDirectory($outputDir) | Out-Null
$settings = [ordered]@{
    workerUrl = $workerUrl.TrimEnd("/")
    encryptedToken = $encrypted
    outputFolder = $outputDir
}
[IO.File]::WriteAllText($configFile, ($settings | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding($false)))
$sync = Join-Path $PSScriptRoot "sync.ps1"
if (-not (Test-Path -LiteralPath $sync)) { throw "sync.ps1 파일이 누락되었습니다." }
$scriptCommand = '"' + (Join-Path $PSHOME "powershell.exe") + '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $sync + '"'

# 작업 스케줄러에 두 개의 실행 조건을 등록합니다. PC가 꺼져 있던 시간대의 글도 다음에 받을 수 있습니다.
& schtasks.exe /Create /F /SC HOURLY /MO 1 /TN "Coupang Draft Sync Hourly" /TR $scriptCommand | Out-Null
if ($LASTEXITCODE -ne 0) { throw "시간별 자동 동기화 작업 등록에 실패했습니다." }
& schtasks.exe /Create /F /SC ONLOGON /TN "Coupang Draft Sync At Logon" /TR $scriptCommand | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "로그인 시 동기화 등록에 실패했습니다. 시간별 동기화는 유지됩니다." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "저장 폴더: $outputDir" -ForegroundColor Green
Write-Host "자동 동기화: Windows 로그인 시 및 매시간"
Write-Host "Cloudflare Worker에 새 버전 배포와 DRAFT_SYNC_TOKEN 설정이 완료된 뒤 자동 다운로드됩니다."
Write-Host "직접 동기화하려면 sync.ps1 파일을 PowerShell로 실행하세요."
Write-Host "설정 파일과 인증 키는 OneDrive가 아닌 PC의 LOCALAPPDATA에 저장됩니다."
