# FWBO Viewer - Deployment Guide

## 🚀 Quick Start

Run the deployment script to automatically install the FWBO Viewer extension in all compatible IDEs on your system:

### macOS / Linux:
```bash
cd /path/to/FWBOViewer
./deploy-all-ides.sh
```

### Windows (Git Bash / WSL):
```bash
cd /path/to/FWBOViewer
./deploy-all-ides.sh
```

### Windows (PowerShell):
```powershell
cd C:\path\to\FWBOViewer
.\deploy-all-ides.ps1
```

---

## ⚠️ Prerequisites

Before running the deployment script, ensure you have:

### 1. Node.js and npm installed
- **Download**: https://nodejs.org/
- **Verify**: `node --version` and `npm --version`

### 2. Dependencies installed
```bash
npm install
```

### 3. (Optional) Install vsce globally
The script will auto-install if missing, but you can pre-install:
```bash
npm install -g @vscode/vsce
```

### 4. At least one compatible IDE installed
- VS Code: https://code.visualstudio.com/
- Cursor: https://cursor.sh/
- Windsurf: https://codeium.com/windsurf
- VS Codium: https://vscodium.com/

---

## 📋 What the Script Does

1. ✅ Detects your operating system
2. ✅ Compiles TypeScript to JavaScript
3. ✅ Packages extension as `.vsix` file
4. ✅ Auto-discovers installed IDEs
5. ✅ Installs extension to all found IDEs
6. ✅ Creates deployment package in `deploy/` folder

---

## 🖥️ Supported IDEs

### ✅ Fully Supported (VS Code-based)
- **Visual Studio Code** (Windows, macOS, Linux)
- **Visual Studio Code Insiders** (Windows, macOS, Linux)
- **Cursor** (Windows, macOS, Linux)
- **Windsurf** (Windows, macOS, Linux)
- **VS Codium** (Windows, macOS, Linux)
- **OpenCode** (macOS, Linux)
- **Code-OSS** (Linux)

### ❌ Not Supported
- **Visual Studio** (full IDE on Windows) - Different extension architecture
- **JetBrains IDEs** (IntelliJ, WebStorm, etc.) - Different plugin system
- **Eclipse** - Different plugin system
- **Sublime Text** - Different package system

---

## 🪟 Windows Installation Paths

The script automatically checks these Windows paths:

### VS Code:
- `%ProgramFiles%\Microsoft VS Code\bin\code.cmd`
- `%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd`

### VS Code Insiders:
- `%ProgramFiles%\Microsoft VS Code Insiders\bin\code-insiders.cmd`
- `%LOCALAPPDATA%\Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd`

### Cursor:
- `%LOCALAPPDATA%\Programs\Cursor\Cursor.exe`
- `%USERPROFILE%\AppData\Local\Programs\Cursor\Cursor.exe`

### Windsurf:
- `%LOCALAPPDATA%\Programs\Windsurf\Windsurf.exe`
- `%USERPROFILE%\AppData\Local\Programs\Windsurf\Windsurf.exe`

### VS Codium:
- `%ProgramFiles%\VSCodium\bin\codium.cmd`
- `%LOCALAPPDATA%\Programs\VSCodium\bin\codium.cmd`

---

## 🍎 macOS Installation Paths

The script automatically checks these macOS paths:

- `/Applications/Visual Studio Code.app`
- `/Applications/Visual Studio Code - Insiders.app`
- `/Applications/Cursor.app`
- `/Applications/Windsurf.app`
- `/Applications/OpenCode.app`

---

## 🐧 Linux Installation Paths

The script checks common Linux installation paths:
- `/usr/bin/code`
- `/usr/bin/code-insiders`
- `/usr/bin/codium`
- `$HOME/.local/share/cursor/cursor`
- `$HOME/.local/share/windsurf/windsurf`

---

## 📦 Manual Installation

If the script doesn't detect your IDE, install manually:

### Option 1: Via IDE UI
1. Open your IDE (VS Code, Cursor, etc.)
2. Go to Extensions view (`Cmd+Shift+X` on macOS, `Ctrl+Shift+X` on Windows/Linux)
3. Click the **`...`** menu in Extensions view
4. Select **"Install from VSIX..."**
5. Navigate to: `fwbo-viewer-0.0.1.vsix`
6. Click **"Open"**

### Option 2: Via Command Line
```bash
# VS Code
code --install-extension fwbo-viewer-0.0.1.vsix

# VS Code Insiders
code-insiders --install-extension fwbo-viewer-0.0.1.vsix

# Cursor
cursor --install-extension fwbo-viewer-0.0.1.vsix

# Windsurf
windsurf --install-extension fwbo-viewer-0.0.1.vsix

# VS Codium
codium --install-extension fwbo-viewer-0.0.1.vsix
```

---

## ✅ Verify Installation

### Check installed extensions:
```bash
# VS Code
code --list-extensions | grep fwbo

# Cursor
cursor --list-extensions | grep fwbo

# Windsurf
windsurf --list-extensions | grep fwbo
```

### Test the extension:
1. Open any `.fwbo` file in your IDE
2. The FWBO Viewer should automatically activate
3. You should see the visual editor interface

---

## 🔧 Troubleshooting

### Issue: "command not found: vsce"
**Solution**: Install vsce globally:
```bash
npm install -g @vscode/vsce
```

### Issue: "npm: command not found"
**Solution**: Install Node.js from https://nodejs.org/

### Issue: IDE not detected
**Solution**:
1. Check if CLI is in PATH: `which code` (or `cursor`, `windsurf`, etc.)
2. Install CLI from IDE:
   - VS Code: `Cmd+Shift+P` → "Shell Command: Install 'code' command in PATH"
   - Cursor: Similar process
3. Or use manual installation method above

### Issue: Extension doesn't activate
**Solution**:
1. Check extension is installed: IDE → Extensions → Search "fwbo"
2. Reload IDE window: `Cmd+Shift+P` → "Developer: Reload Window"
3. Check for errors: `Cmd+Shift+P` → "Developer: Show Logs" → Extension Host

### Issue: Permission denied on macOS/Linux
**Solution**: Make script executable:
```bash
chmod +x deploy-all-ides.sh
```

---

## 📊 Deployment Output

After running the script, you'll see output like:

```
🚀 FWBO Viewer Deployment Script
=================================

🖥️  Detected OS: Mac

📦 Building extension...
✅ Extension packaged: fwbo-viewer-0.0.1.vsix

🔵 Deploying to Visual Studio Code...
✅ Installed in VS Code

🔵 Deploying to Visual Studio Code Insiders...
✅ Installed in VS Code Insiders

🔷 Deploying to Cursor...
✅ Installed in Cursor

🌊 Deploying to Windsurf...
⚠️  Windsurf not found. Install from: https://codeium.com/windsurf

🎉 Deployment complete!
```

---

## 🌐 Distribution

To distribute the extension to others:

### Option 1: Share the VSIX file
Send them: `fwbo-viewer-0.0.1.vsix`
Instructions: See "Manual Installation" above

### Option 2: Share the entire project
Send them the entire `FWBOViewer` folder
Instructions: Run the deployment script

### Option 3: Publish to VS Code Marketplace
```bash
vsce publish
```
Requirements: Microsoft Publisher account

---

## 📝 Build Script Commands

```bash
# Compile TypeScript
npm run compile

# Watch mode (auto-compile on changes)
npm run watch

# Package extension
vsce package

# Deploy to all IDEs
./deploy-all-ides.sh      # Mac/Linux
.\deploy-all-ides.ps1     # Windows PowerShell
```

---

## 📄 Files Generated

After deployment, you'll have:
- `fwbo-viewer-0.0.1.vsix` - Main extension package
- `out/` - Compiled JavaScript files
- `deploy/` - Deployment package with VSIX and metadata

---

## 💡 Tips

1. **Update version**: Edit `package.json` → `version` field
2. **Rebuild after changes**: Run `npm run compile` then `vsce package`
3. **Test locally**: Install in one IDE first, test, then deploy to all
4. **CI/CD**: Integrate the script into your CI/CD pipeline
5. **Auto-update**: Consider implementing auto-update mechanism in extension

---

## 🆘 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify prerequisites are met
3. Try manual installation
4. Check IDE extension logs
5. Open an issue in the project repository

---

## 📜 License

[Add your license information here]

---

## 🙏 Credits

FWBO Viewer Extension - Visual viewer for .fwbo files
Publisher: Illumify
