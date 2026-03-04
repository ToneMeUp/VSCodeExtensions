#!/bin/bash

# FWBO Viewer - Deploy to All IDEs Script
# This script deploys the FWBO Viewer extension to all compatible IDEs
# Supports: macOS, Linux, and Windows (via Git Bash/WSL)

set -e

echo "🚀 FWBO Viewer Deployment Script"
echo "================================="
echo ""

# Detect OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    CYGWIN*|MINGW*|MSYS*)    MACHINE=Windows;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

echo "🖥️  Detected OS: $MACHINE"
echo ""

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Build the extension
echo "📦 Building extension..."
npm run compile
vsce package --allow-missing-repository

VSIX_FILE="fwbo-viewer-0.0.1.vsix"

if [ ! -f "$VSIX_FILE" ]; then
    echo "❌ Error: $VSIX_FILE not found!"
    exit 1
fi

echo "✅ Extension packaged: $VSIX_FILE"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Deploy to VS Code
echo "🔵 Deploying to Visual Studio Code..."
VSCODE_INSTALLED=false

if command_exists code; then
    code --install-extension "$VSIX_FILE" --force && VSCODE_INSTALLED=true
fi

if [ "$VSCODE_INSTALLED" = false ] && [ "$MACHINE" = "Mac" ]; then
    if [ -d "/Applications/Visual Studio Code.app" ]; then
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --install-extension "$VSIX_FILE" --force && VSCODE_INSTALLED=true
    fi
fi

if [ "$VSCODE_INSTALLED" = false ] && [ "$MACHINE" = "Windows" ]; then
    # Check common Windows installation paths
    if [ -f "$PROGRAMFILES/Microsoft VS Code/bin/code.cmd" ]; then
        "$PROGRAMFILES/Microsoft VS Code/bin/code.cmd" --install-extension "$VSIX_FILE" --force && VSCODE_INSTALLED=true
    elif [ -f "$LOCALAPPDATA/Programs/Microsoft VS Code/bin/code.cmd" ]; then
        "$LOCALAPPDATA/Programs/Microsoft VS Code/bin/code.cmd" --install-extension "$VSIX_FILE" --force && VSCODE_INSTALLED=true
    fi
fi

if [ "$VSCODE_INSTALLED" = true ]; then
    echo "✅ Installed in VS Code"
else
    echo "⚠️  VS Code CLI not found. Install manually from: https://code.visualstudio.com/"
fi
echo ""

# Deploy to VS Code Insiders
echo "🔵 Deploying to Visual Studio Code Insiders..."
VSCODE_INSIDERS_INSTALLED=false

if command_exists code-insiders; then
    code-insiders --install-extension "$VSIX_FILE" --force && VSCODE_INSIDERS_INSTALLED=true
fi

if [ "$VSCODE_INSIDERS_INSTALLED" = false ]; then
    case "${MACHINE}" in
        Mac)
            if [ -d "/Applications/Visual Studio Code - Insiders.app" ]; then
                "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code" --install-extension "$VSIX_FILE" --force && VSCODE_INSIDERS_INSTALLED=true
            fi
            ;;
        Windows)
            # Check common Windows installation paths
            if [ -f "$PROGRAMFILES/Microsoft VS Code Insiders/bin/code-insiders.cmd" ]; then
                "$PROGRAMFILES/Microsoft VS Code Insiders/bin/code-insiders.cmd" --install-extension "$VSIX_FILE" --force && VSCODE_INSIDERS_INSTALLED=true
            elif [ -f "$LOCALAPPDATA/Programs/Microsoft VS Code Insiders/bin/code-insiders.cmd" ]; then
                "$LOCALAPPDATA/Programs/Microsoft VS Code Insiders/bin/code-insiders.cmd" --install-extension "$VSIX_FILE" --force && VSCODE_INSIDERS_INSTALLED=true
            fi
            ;;
    esac
fi

if [ "$VSCODE_INSIDERS_INSTALLED" = true ]; then
    echo "✅ Installed in VS Code Insiders"
else
    echo "⚠️  VS Code Insiders not found"
fi
echo ""

# Deploy to VS Codium
echo "🟣 Deploying to VS Codium..."
CODIUM_INSTALLED=false

if command_exists codium; then
    codium --install-extension "$VSIX_FILE" --force && CODIUM_INSTALLED=true
fi

if [ "$CODIUM_INSTALLED" = false ]; then
    case "${MACHINE}" in
        Windows)
            # Check common Windows installation paths
            if [ -f "$PROGRAMFILES/VSCodium/bin/codium.cmd" ]; then
                "$PROGRAMFILES/VSCodium/bin/codium.cmd" --install-extension "$VSIX_FILE" --force && CODIUM_INSTALLED=true
            elif [ -f "$LOCALAPPDATA/Programs/VSCodium/bin/codium.cmd" ]; then
                "$LOCALAPPDATA/Programs/VSCodium/bin/codium.cmd" --install-extension "$VSIX_FILE" --force && CODIUM_INSTALLED=true
            fi
            ;;
        Linux)
            if [ -f "/usr/bin/codium" ]; then
                /usr/bin/codium --install-extension "$VSIX_FILE" --force && CODIUM_INSTALLED=true
            fi
            ;;
    esac
fi

if [ "$CODIUM_INSTALLED" = true ]; then
    echo "✅ Installed in VS Codium"
else
    echo "⚠️  VS Codium not found. Install from: https://vscodium.com/"
fi
echo ""

# Deploy to Cursor
echo "🔷 Deploying to Cursor..."
CURSOR_INSTALLED=false

if command_exists cursor; then
    cursor --install-extension "$VSIX_FILE" --force && CURSOR_INSTALLED=true
fi

if [ "$CURSOR_INSTALLED" = false ]; then
    case "${MACHINE}" in
        Mac)
            if [ -d "/Applications/Cursor.app" ]; then
                "/Applications/Cursor.app/Contents/Resources/app/bin/cursor" --install-extension "$VSIX_FILE" --force && CURSOR_INSTALLED=true
            fi
            ;;
        Windows)
            # Check common Windows installation paths
            if [ -f "$LOCALAPPDATA/Programs/Cursor/Cursor.exe" ]; then
                "$LOCALAPPDATA/Programs/Cursor/Cursor.exe" --install-extension "$VSIX_FILE" --force && CURSOR_INSTALLED=true
            elif [ -f "$USERPROFILE/AppData/Local/Programs/Cursor/Cursor.exe" ]; then
                "$USERPROFILE/AppData/Local/Programs/Cursor/Cursor.exe" --install-extension "$VSIX_FILE" --force && CURSOR_INSTALLED=true
            fi
            ;;
        Linux)
            # Check common Linux installation paths
            if [ -f "$HOME/.local/share/cursor/cursor" ]; then
                "$HOME/.local/share/cursor/cursor" --install-extension "$VSIX_FILE" --force && CURSOR_INSTALLED=true
            fi
            ;;
    esac
fi

if [ "$CURSOR_INSTALLED" = true ]; then
    echo "✅ Installed in Cursor"
else
    echo "⚠️  Cursor not found. Install from: https://cursor.sh/"
fi
echo ""

# Deploy to Code - OSS
echo "🟠 Deploying to Code - OSS..."
if command_exists code-oss; then
    code-oss --install-extension "$VSIX_FILE" --force
    echo "✅ Installed in Code - OSS"
else
    echo "⚠️  Code - OSS not found"
fi
echo ""

# Deploy to Gitpod Openvscode Server
echo "🟡 Checking for OpenVSCode Server..."
if command_exists openvscode-server; then
    openvscode-server --install-extension "$VSIX_FILE" --force
    echo "✅ Installed in OpenVSCode Server"
else
    echo "⚠️  OpenVSCode Server not found"
fi
echo ""

# Manual installation instructions
echo "📋 Manual Installation Instructions"
echo "===================================="
echo ""
echo "For IDEs not automatically detected, manually install using:"
echo ""
echo "1. Open your IDE (VS Code, Cursor, etc.)"
echo "2. Go to Extensions view (Cmd+Shift+X on macOS, Ctrl+Shift+X on Windows/Linux)"
echo "3. Click the '...' menu in the Extensions view"
echo "4. Select 'Install from VSIX...'"
echo "5. Navigate to: $SCRIPT_DIR/$VSIX_FILE"
echo "6. Select the file and click 'Open'"
echo ""
echo "Or use the command line:"
echo "  VS Code:    code --install-extension $VSIX_FILE"
echo "  VS Codium:  codium --install-extension $VSIX_FILE"
echo "  Cursor:     cursor --install-extension $VSIX_FILE"
echo ""

# Create copies for web-based deployment
echo "🌐 Creating deployment packages..."
mkdir -p deploy
cp "$VSIX_FILE" deploy/
cp package.json deploy/
echo "✅ Deployment package ready in: deploy/"
echo ""

echo "🎉 Deployment complete!"
echo ""
echo "Installed extension in available IDEs."
echo "The extension will activate when you open any .fwbo file."
