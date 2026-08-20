$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$extensionRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$distRoot = Join-Path $extensionRoot "dist"
$sourceAllowlist = @(
    "assets/fonts/Amiri-Bold.woff2",
    "assets/fonts/Amiri-Regular.woff2",
    "assets/fonts/OFL.txt",
    "assets/fonts/Outfit-Medium.woff2",
    "assets/fonts/Outfit-Regular.woff2",
    "assets/fonts/Outfit-SemiBold.woff2",
    "atlas/atlas.css",
    "atlas/atlas.html",
    "atlas/atlas.js",
    "background.js",
    "data/vocabulary.json",
    "data/vocabulary-metadata.json",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
    "manifest.chrome.json",
    "manifest.firefox.json",
    "popup/popup.css",
    "popup/popup.html",
    "popup/popup.js",
    "PRIVACY.md",
    "shared/date.js",
    "shared/export.js",
    "shared/lookup.js",
    "shared/review-policy.js",
    "shared/review-session.js",
    "shared/speech.js",
    "shared/selector.js",
    "shared/state.js",
    "shared/streak.js",
    "shared/theme.css",
    "shared/theme-init.js",
    "shared/theme.js",
    "shared/vocabulary.js",
    "tests/background.test.js",
    "tests/export.test.js",
    "tests/package.test.js",
    "tests/review_sync.test.js",
    "tests/selector.test.js",
    "tests/speech.test.js",
    "tests/state.test.js",
    "tests/streak.test.js",
    "tests/theme.test.js",
    "tests/ui.test.js",
    "tests/vocabulary.test.js",
    "tools/convert-vocabulary.js",
    "tools/package.ps1"
)
$runtimeFiles = @(
    "assets/fonts/Amiri-Bold.woff2",
    "assets/fonts/Amiri-Regular.woff2",
    "assets/fonts/OFL.txt",
    "assets/fonts/Outfit-Medium.woff2",
    "assets/fonts/Outfit-Regular.woff2",
    "assets/fonts/Outfit-SemiBold.woff2",
    "atlas/atlas.css",
    "atlas/atlas.html",
    "atlas/atlas.js",
    "background.js",
    "data/vocabulary.json",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
    "popup/popup.css",
    "popup/popup.html",
    "popup/popup.js",
    "shared/date.js",
    "shared/export.js",
    "shared/lookup.js",
    "shared/review-policy.js",
    "shared/review-session.js",
    "shared/speech.js",
    "shared/selector.js",
    "shared/state.js",
    "shared/streak.js",
    "shared/theme.css",
    "shared/theme-init.js",
    "shared/theme.js",
    "shared/vocabulary.js"
)

$distPrefix = ([IO.Path]::GetFullPath($distRoot)).TrimEnd('\') + '\'
$sourceFiles = @(Get-ChildItem -LiteralPath $extensionRoot -File -Recurse |
    Where-Object { -not $_.FullName.StartsWith($distPrefix, [StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object { $_.FullName.Substring($extensionRoot.Length + 1).Replace('\', '/') })
$unexpected = @($sourceFiles | Where-Object { $_ -notin $sourceAllowlist })
$missing = @($sourceAllowlist | Where-Object { $_ -notin $sourceFiles })
if ($unexpected.Count) { throw "Unexpected extension source file(s): $($unexpected -join ', ')" }
if ($missing.Count) { throw "Missing extension source file(s): $($missing -join ', ')" }

if (Test-Path -LiteralPath $distRoot) {
    $distItem = Get-Item -LiteralPath $distRoot -Force
    if (-not $distItem.PSIsContainer -or (($distItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
        throw "Refusing to package through an unsafe dist target: $distRoot"
    }
} else {
    New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
}

$reports = @()
foreach ($browser in "chrome", "firefox") {
    $target = Join-Path $distRoot $browser
    if (Test-Path -LiteralPath $target) {
        $targetItem = Get-Item -LiteralPath $target -Force
        $expectedTarget = [IO.Path]::GetFullPath($target).TrimEnd('\')
        $actualTarget = [IO.Path]::GetFullPath($targetItem.FullName).TrimEnd('\')
        if (-not $targetItem.PSIsContainer -or (($targetItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or -not $actualTarget.Equals($expectedTarget, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove an unvalidated package target: $target"
        }
        Remove-Item -LiteralPath $target -Recurse -Force
    }
    New-Item -ItemType Directory -Path $target -Force | Out-Null

    foreach ($relativePath in $runtimeFiles) {
        $source = Join-Path $extensionRoot $relativePath
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing runtime source: $relativePath" }
        $destination = Join-Path $target $relativePath
        $destinationParent = Split-Path -Parent $destination
        if (-not (Test-Path -LiteralPath $destinationParent)) { New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null }
        Copy-Item -LiteralPath $source -Destination $destination -Force
    }

    $manifestSource = Join-Path $extensionRoot "manifest.$browser.json"
    $manifest = Get-Content -Raw -LiteralPath $manifestSource | ConvertFrom-Json
    if ($manifest.manifest_version -ne 3 -or $manifest.version -ne "0.3.0" -or $null -eq $manifest.content_security_policy.extension_pages) {
        throw "Invalid $browser manifest."
    }
    if ($browser -eq "firefox" -and ($manifest.browser_specific_settings.gecko.id -ne "kalimat@assem130.github.io" -or $null -eq $manifest.browser_specific_settings.gecko.data_collection_permissions -or $manifest.browser_specific_settings.gecko.data_collection_permissions.required -ne @("none"))) {
        throw "Invalid Firefox store disclosure."
    }
    Copy-Item -LiteralPath $manifestSource -Destination (Join-Path $target "manifest.json") -Force

    $vocabularyBytes = [int64](Get-Item -LiteralPath (Join-Path $target "data/vocabulary.json")).Length
    $popupBytes = [int64]((Get-ChildItem -LiteralPath (Join-Path $target "popup") -File | Measure-Object -Property Length -Sum).Sum)
    if ($vocabularyBytes -ge 2097152) { throw "$browser vocabulary exceeds 2 MiB: $vocabularyBytes bytes" }
    if ($popupBytes -ge 102400) { throw "$browser popup code exceeds 100 KiB: $popupBytes bytes" }
    $fileItems = @(Get-ChildItem -LiteralPath $target -File -Recurse)
    $totalBytes = [int64](($fileItems | Measure-Object -Property Length -Sum).Sum)

    $archivePath = Join-Path $distRoot "kalimat-$browser-0.3.0.zip"
    if (Test-Path -LiteralPath $archivePath) {
        $archiveItem = Get-Item -LiteralPath $archivePath -Force
        $expectedArchive = [IO.Path]::GetFullPath($archivePath).TrimEnd('\')
        $actualArchive = [IO.Path]::GetFullPath($archiveItem.FullName).TrimEnd('\')
        if ($archiveItem.PSIsContainer -or (($archiveItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or -not $actualArchive.Equals($expectedArchive, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove an unvalidated package archive: $archivePath"
        }
        Remove-Item -LiteralPath $archivePath -Force
    }
    $archiveStream = [IO.File]::Open($archivePath, [IO.FileMode]::CreateNew)
    try {
        $archive = New-Object IO.Compression.ZipArchive($archiveStream, [IO.Compression.ZipArchiveMode]::Create, $false)
        try {
            foreach ($relativePath in @($runtimeFiles + "manifest.json")) {
                $entry = $archive.CreateEntry($relativePath, [IO.Compression.CompressionLevel]::Optimal)
                $input = [IO.File]::OpenRead((Join-Path $target $relativePath))
                $output = $entry.Open()
                try {
                    $input.CopyTo($output)
                } finally {
                    $output.Dispose()
                    $input.Dispose()
                }
            }
        } finally {
            $archive.Dispose()
        }
    } finally {
        $archiveStream.Dispose()
    }
    $archiveBytes = [int64](Get-Item -LiteralPath $archivePath).Length
    $reports += "Packaged $browser`: $($fileItems.Count) files, $totalBytes bytes (archive $archiveBytes bytes; vocabulary $vocabularyBytes bytes; popup $popupBytes bytes)."
}

Write-Output ($reports -join [Environment]::NewLine)
