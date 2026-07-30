$ErrorActionPreference = "Stop"

$extensionRoot = Split-Path -Parent $PSScriptRoot
$sourceAllowlist = @(
    "background.js",
    "data/vocabulary.json",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
    "manifest.chrome.json",
    "manifest.firefox.json",
    "popup/popup.html",
    "shared/api.js",
    "shared/date.js",
    "shared/state.js",
    "shared/vocabulary.js",
    "tests/package.test.js",
    "tests/state.test.js",
    "tests/vocabulary.test.js",
    "tools/convert-vocabulary.js",
    "tools/package.ps1"
)
$runtimeFiles = @(
    "background.js",
    "data/vocabulary.json",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
    "popup/popup.html",
    "shared/api.js",
    "shared/date.js",
    "shared/state.js",
    "shared/vocabulary.js"
)

$sourceFiles = Get-ChildItem -LiteralPath $extensionRoot -File -Recurse |
    Where-Object { $_.FullName -notlike "$extensionRoot\dist\*" } |
    ForEach-Object { $_.FullName.Substring($extensionRoot.Length + 1).Replace("\", "/") }
$unexpected = $sourceFiles | Where-Object { $_ -notin $sourceAllowlist }
$missing = $sourceAllowlist | Where-Object { $_ -notin $sourceFiles }
if ($unexpected) { throw "Unexpected extension source file(s): $($unexpected -join ', ')" }
if ($missing) { throw "Missing extension source file(s): $($missing -join ', ')" }

$distRoot = Join-Path $extensionRoot "dist"
if (Test-Path -LiteralPath $distRoot) { Remove-Item -LiteralPath $distRoot -Recurse -Force }
foreach ($browser in "chrome", "firefox") {
    $target = Join-Path $distRoot $browser
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    foreach ($relativePath in $runtimeFiles) {
        $source = Join-Path $extensionRoot $relativePath
        $destination = Join-Path $target $relativePath
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination
    }
    Copy-Item -LiteralPath (Join-Path $extensionRoot "manifest.$browser.json") -Destination (Join-Path $target "manifest.json")
    Get-Content -Raw -LiteralPath (Join-Path $target "manifest.json") | ConvertFrom-Json | Out-Null
}

Write-Output "Packaged Chrome and Firefox extension directories."
