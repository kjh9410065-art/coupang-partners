# Run through install.bat on Windows. Keeps the sync token encrypted for this Windows account only.
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "resolve-folder.ps1")
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
} elseif ((Read-Host "Cloudflare에 기존 동기화 키가 있습니까? (y/N)") -eq "y") {
    $secureToken = Read-Host "기존 DRAFT_SYNC_TOKEN 입력 (화면에 표시되지 않음)" -AsSecureString
    if ($secureToken.Length -lt 32) { throw "동기화 키는 32자 이상이어야 합니다." }
    $encrypted = $secureToken | ConvertFrom-SecureString
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

# OneDrive가 없으면 Windows 문서 폴더에 직접 저장합니다.
# 이미 설치된 폴더가 있으면 기존 경로와 수동으로 수정한 글을 유지합니다.
$outputDir = Resolve-CoupangDraftOutputFolder -ExistingFolder ([string]$existing.outputFolder) `
    -OneDriveFolder $env:OneDrive -OneDriveConsumerFolder $env:OneDriveConsumer `
    -OneDriveCommercialFolder $env:OneDriveCommercial
$settings = [ordered]@{
    workerUrl = $workerUrl.TrimEnd("/")
    encryptedToken = $encrypted
    outputFolder = $outputDir
}
[IO.File]::WriteAllText($configFile, ($settings | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding($false)))
$sourceSync = Join-Path $PSScriptRoot "sync.ps1"
if (-not (Test-Path -LiteralPath $sourceSync)) { throw "sync.ps1 파일이 누락되었습니다." }
# ZIP 압축 해제 폴더를 지워도 계속 동작하도록 사용자 로컬 프로그램 폴더에 설치합니다.
$sync = Join-Path $configDir "sync.ps1"
Copy-Item -LiteralPath $sourceSync -Destination $sync -Force
# 완성글 HTML 생성기도 설치 파일과 함께 보관합니다.
$renderSource = Join-Path $PSScriptRoot "render-post.ps1"
if (-not (Test-Path -LiteralPath $renderSource)) { throw "render-post.ps1 파일이 누락되었습니다." }
Copy-Item -LiteralPath $renderSource -Destination (Join-Path $configDir "render-post.ps1") -Force
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
Write-Host "OneDrive는 필수가 아닙니다. 없으면 Windows 문서 폴더에 직접 저장합니다."
Write-Host "설정 파일과 인증 키는 PC의 LOCALAPPDATA에 암호화 보관됩니다."

# 최초 설치 직후에도 연결을 확인합니다. 실패하면 예약 작업이 이후 다시 시도합니다.
try { & $sync; Write-Host "최초 동기화 확인 완료. sync.log에서 내려받은 글 수를 확인하세요." }
catch { Write-Warning "최초 동기화 미완료. Worker 주소/배포/동기화 키 설정 후 다시 실행하세요." }
