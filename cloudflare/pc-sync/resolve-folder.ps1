# Windows Documents folder is the no-cloud default; existing installed folder remains unchanged.
# Optional OneDrive integration is retained for users who already have it installed.
function Resolve-CoupangDraftOutputFolder {
    [CmdletBinding()]
    param(
        [string] $ExistingFolder,
        [string] $OneDriveFolder,
        [string] $OneDriveConsumerFolder,
        [string] $OneDriveCommercialFolder,
        [string] $DocumentsFolder
    )

    if ($ExistingFolder -and [IO.Directory]::Exists($ExistingFolder)) {
        # Re-running the installer must not scatter existing drafts across directories.
        return [IO.Path]::GetFullPath($ExistingFolder)
    }

    $root = $null
    foreach ($candidate in @($OneDriveFolder, $OneDriveConsumerFolder, $OneDriveCommercialFolder)) {
        if ($candidate -and [IO.Directory]::Exists($candidate)) {
            $root = $candidate
            break
        }
    }
    if (-not $root) {
        $root = $DocumentsFolder
        if (-not $root) { $root = [Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments) }
        if (-not $root) {
            if (-not $env:USERPROFILE) { throw "Windows 사용자 프로필 폴더를 찾을 수 없습니다." }
            $root = Join-Path $env:USERPROFILE "Documents"
        }
    }

    $destination = Join-Path $root "CoupangBlogDrafts"
    [IO.Directory]::CreateDirectory($destination) | Out-Null
    return [IO.Path]::GetFullPath($destination)
}
