# FWBO Viewer - Deploy to All IDEs Script (PowerShell)
# This script deploys the FWBO Viewer extension to all compatible IDEs on Windows

$ErrorActionPreference = "Stop"

Write-Host "🚀 FWBO Viewer Deployment Script" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Get the directory of this script
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Build the extension
Write-Host "📦 Building extension..." -ForegroundColor Yellow
npm run compile
vsce package

$VsixFile = "fwbo-viewer-0.0.1.vsix"

if (-not (Test-Path $VsixFile)) {
    Write-Host "❌ Error: $VsixFile not found!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Extension packaged: $VsixFile" -ForegroundColor Green
Write-Host ""

# Function to check if command exists
function Test-Command {
    param($CommandName)
    $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

# Deploy to VS Code
Write-Host "🔵 Deploying to Visual Studio Code..." -ForegroundColor Blue
if (Test-Command "code") {
    code --install-extension $VsixFile --force
    Write-Host "✅ Installed in VS Code" -ForegroundColor Green
} else {
    Write-Host "⚠️  VS Code CLI not found. Install manually from: https://code.visualstudio.com/" -ForegroundColor Yellow
}
Write-Host ""

# Deploy to VS Codium
Write-Host "🟣 Deploying to VS Codium..." -ForegroundColor Magenta
if (Test-Command "codium") {
    codium --install-extension $VsixFile --force
    Write-Host "✅ Installed in VS Codium" -ForegroundColor Green
} else {
    Write-Host "⚠️  VS Codium not found. Install from: https://vscodium.com/" -ForegroundColor Yellow
}
Write-Host ""

# Deploy to Cursor
Write-Host "🔷 Deploying to Cursor..." -ForegroundColor Cyan
if (Test-Command "cursor") {
    cursor --install-extension $VsixFile --force
    Write-Host "✅ Installed in Cursor" -ForegroundColor Green
} else {
    # Check if Cursor is installed in AppData (Windows)
    $CursorPath = "$env:LOCALAPPDATA\Programs\Cursor\Cursor.exe"
    if (Test-Path $CursorPath) {
        & $CursorPath --install-extension $VsixFile --force
        Write-Host "✅ Installed in Cursor" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Cursor not found. Install from: https://cursor.sh/" -ForegroundColor Yellow
    }
}
Write-Host ""

# Deploy to Windsurf
Write-Host "🌊 Deploying to Windsurf..." -ForegroundColor Cyan
if (Test-Command "windsurf") {
    windsurf --install-extension $VsixFile --force
    Write-Host "✅ Installed in Windsurf" -ForegroundColor Green
} else {
    # Check if Windsurf is installed in AppData (Windows)
    $WindsurfPath = "$env:LOCALAPPDATA\Programs\Windsurf\Windsurf.exe"
    if (Test-Path $WindsurfPath) {
        & $WindsurfPath --install-extension $VsixFile --force
        Write-Host "✅ Installed in Windsurf" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Windsurf not found. Install from: https://codeium.com/windsurf" -ForegroundColor Yellow
    }
}
Write-Host ""

# Deploy to Code - OSS
Write-Host "🟠 Deploying to Code - OSS..." -ForegroundColor DarkYellow
if (Test-Command "code-oss") {
    code-oss --install-extension $VsixFile --force
    Write-Host "✅ Installed in Code - OSS" -ForegroundColor Green
} else {
    Write-Host "⚠️  Code - OSS not found" -ForegroundColor Yellow
}
Write-Host ""

# Manual installation instructions
Write-Host "📋 Manual Installation Instructions" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "For IDEs not automatically detected, manually install using:"
Write-Host ""
Write-Host "1. Open your IDE (VS Code, Cursor, Windsurf, etc.)"
Write-Host "2. Go to Extensions view (Ctrl+Shift+X)"
Write-Host "3. Click the '...' menu in the Extensions view"
Write-Host "4. Select 'Install from VSIX...'"
Write-Host "5. Navigate to: $ScriptDir\$VsixFile"
Write-Host "6. Select the file and click 'Open'"
Write-Host ""
Write-Host "Or use the command line:"
Write-Host "  VS Code:    code --install-extension $VsixFile"
Write-Host "  VS Codium:  codium --install-extension $VsixFile"
Write-Host "  Cursor:     cursor --install-extension $VsixFile"
Write-Host "  Windsurf:   windsurf --install-extension $VsixFile"
Write-Host ""

# Create copies for web-based deployment
Write-Host "🌐 Creating deployment packages..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "deploy" | Out-Null
Copy-Item $VsixFile -Destination "deploy\"
Copy-Item "package.json" -Destination "deploy\"
Write-Host "✅ Deployment package ready in: deploy\" -ForegroundColor Green
Write-Host ""

Write-Host "🎉 Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Installed extension in available IDEs."
Write-Host "The extension will activate when you open any .fwbo file."
