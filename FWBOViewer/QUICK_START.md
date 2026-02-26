# 🚀 FWBO Viewer - Quick Start

## For Users Installing the Extension

### Prerequisites (Install These First!)

1. **Node.js** - https://nodejs.org/
2. **One of these IDEs**:
   - VS Code: https://code.visualstudio.com/
   - Cursor: https://cursor.sh/
   - Windsurf: https://codeium.com/windsurf

### Installation Steps

```bash
# 1. Navigate to the extension folder
cd /path/to/FWBOViewer

# 2. Install dependencies
npm install

# 3. Run deployment script
./deploy-all-ides.sh        # Mac/Linux
.\deploy-all-ides.ps1       # Windows PowerShell
```

That's it! The script will automatically:
- ✅ Build the extension
- ✅ Find all installed IDEs
- ✅ Install the extension everywhere

---

## What Gets Installed?

The script will install to **all** compatible IDEs it finds on your system:
- Visual Studio Code ✅
- Visual Studio Code Insiders ✅
- Cursor ✅
- Windsurf ✅
- VS Codium ✅
- OpenCode ✅

If an IDE is **not installed**, the script will skip it with a warning message.

---

## Verification

Open any `.fwbo` file in your IDE - the FWBO Viewer should automatically activate!

---

## Manual Installation (If Script Fails)

1. Open your IDE
2. Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac)
3. Click `...` menu → "Install from VSIX..."
4. Select `fwbo-viewer-0.0.1.vsix`
5. Done!

---

## Need Help?

See [DEPLOYMENT_README.md](./DEPLOYMENT_README.md) for detailed troubleshooting.
