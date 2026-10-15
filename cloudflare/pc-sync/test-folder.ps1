# Verify Windows-only installation can save to a local Documents folder.
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "resolve-folder.ps1")
$root = Join-Path ([IO.Path]::GetTempPath()) ("draft-folder-test-" + [guid]::NewGuid().ToString("n"))
[IO.Directory]::CreateDirectory($root) | Out-Null
try {
    $documents = Join-Path $root "Documents"
    $oneDrive = Join-Path $root "OneDrive"
    $existing = Join-Path $root "PreviouslyInstalled"
    [IO.Directory]::CreateDirectory($documents) | Out-Null

    $local = Resolve-CoupangDraftOutputFolder -DocumentsFolder $documents
    if ($local -ne (Join-Path $documents "CoupangBlogDrafts")) { throw "OneDrive 없을 때 문서 폴더로 저장해야 합니다." }
    if (-not [IO.Directory]::Exists($local)) { throw "로컬 초안 폴더가 만들어지지 않았습니다." }
    [IO.File]::WriteAllText((Join-Path $local "existing.txt"), "keep", [Text.Encoding]::UTF8)

    [IO.Directory]::CreateDirectory($oneDrive) | Out-Null
    $cloud = Resolve-CoupangDraftOutputFolder -DocumentsFolder $documents -OneDriveFolder $oneDrive
    if ($cloud -ne (Join-Path $oneDrive "CoupangBlogDrafts")) { throw "기존 OneDrive 설정이 유지되지 않습니다." }

    [IO.Directory]::CreateDirectory($existing) | Out-Null
    $preserved = Resolve-CoupangDraftOutputFolder -ExistingFolder $existing -DocumentsFolder $documents -OneDriveFolder $oneDrive
    if ($preserved -ne $existing) { throw "재설치 시 기존 저장 위치가 변경됐습니다." }
    if ([IO.File]::ReadAllText((Join-Path $local "existing.txt")) -ne "keep") { throw "기존 글이 손상됐습니다." }

    Write-Host "PASS - local Documents without OneDrive, optional OneDrive, existing folder preservation"
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
