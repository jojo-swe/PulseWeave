<#
.SYNOPSIS
    Build PulseWeave desktop packages for GitHub Releases.

.DESCRIPTION
    Builds electron-builder packages for the current platform (or a specified one).
    Output goes to apps/desktop/release/.

.PARAMETER Platform
    Target platform: win, mac, linux, or all. Defaults to the current OS.

.PARAMETER SkipBuild
    Skip the electron-vite build step (use if already built).

.EXAMPLE
    .\scripts\release.ps1
    .\scripts\release.ps1 -Platform win
    .\scripts\release.ps1 -Platform all -SkipBuild
#>

param(
    [ValidateSet("win", "mac", "linux", "all")]
    [string]$Platform,

    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $ROOT) { $ROOT = Resolve-Path "$PSScriptRoot/.." }
$DESKTOP_DIR = Join-Path $ROOT "apps/desktop"
$RELEASE_DIR = Join-Path $DESKTOP_DIR "release"

function Write-Step($msg) { Write-Host "`n=> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "   $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "   $msg" -ForegroundColor Yellow }

# ---------- Detect platform ----------
if (-not $Platform) {
    if ($IsWindows -or $env:OS -eq "Windows_NT") { $Platform = "win" }
    elseif ($IsMacOS) { $Platform = "mac" }
    elseif ($IsLinux) { $Platform = "linux" }
    else { $Platform = "win" }
    Write-Warn "No platform specified — defaulting to '$Platform'"
}

# ---------- Read version ----------
$pkgJson = Get-Content (Join-Path $DESKTOP_DIR "package.json") -Raw | ConvertFrom-Json
$version = $pkgJson.version
Write-Step "Building PulseWeave Desktop v$version for: $Platform"

# ---------- Install dependencies ----------
Write-Step "Installing dependencies"
Push-Location $ROOT
try {
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }
    Write-Ok "Dependencies installed"
} finally { Pop-Location }

# ---------- Build electron-vite ----------
if (-not $SkipBuild) {
    Write-Step "Building desktop app (electron-vite)"
    Push-Location $ROOT
    try {
        pnpm --filter pulseweave-desktop build
        if ($LASTEXITCODE -ne 0) { throw "electron-vite build failed" }
        Write-Ok "Build complete"
    } finally { Pop-Location }
} else {
    Write-Warn "Skipping build (--SkipBuild)"
}

# ---------- Package ----------
Write-Step "Packaging with electron-builder ($Platform)"

$distCmd = switch ($Platform) {
    "win"   { "dist:win" }
    "mac"   { "dist:mac" }
    "linux" { "dist:linux" }
    "all"   { "dist:all" }
}

Push-Location $ROOT
try {
    pnpm --filter pulseweave-desktop $distCmd
    if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }
    Write-Ok "Packaging complete"
} finally { Pop-Location }

# ---------- Summary ----------
Write-Step "Release artifacts"
if (Test-Path $RELEASE_DIR) {
    $artifacts = Get-ChildItem $RELEASE_DIR -File -Recurse |
        Where-Object { $_.Extension -match '\.(exe|msi|dmg|zip|AppImage|deb|rpm)$' }

    if ($artifacts.Count -eq 0) {
        Write-Warn "No release artifacts found — check electron-builder output above."
    } else {
        foreach ($f in $artifacts) {
            $sizeMB = [math]::Round($f.Length / 1MB, 1)
            Write-Ok "$($f.Name)  ($sizeMB MB)"
        }
        Write-Host "`nArtifacts ready in: $RELEASE_DIR" -ForegroundColor Green
        Write-Host "Upload them to GitHub Releases or run:" -ForegroundColor Gray
        Write-Host "  gh release create v$version $RELEASE_DIR/*.exe $RELEASE_DIR/*.dmg $RELEASE_DIR/*.AppImage --draft" -ForegroundColor Gray
    }
} else {
    Write-Warn "Release directory not found: $RELEASE_DIR"
}
