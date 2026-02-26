# VS Code Extensions by ToneMeUp

Collection of Visual Studio Code extensions and IDE plugins developed by the ToneMeUp team.

---

## 📦 Extensions

### [FWBO Viewer](./FWBOViewer)

**Version**: 0.0.1
**Status**: ✅ Ready for Use

A Visual Studio Code extension that provides a visual editor for `.fwbo` (FormWizard Binary Object) files.

#### Features
- ✅ Custom editor for `.fwbo` files
- ✅ XML and JSON format support
- ✅ Visual rendering of form wizard structures
- ✅ Expandable section navigation
- ✅ Cross-platform (Windows, macOS, Linux)

#### Quick Install
```bash
cd FWBOViewer
npm install
./deploy-all-ides.sh        # Mac/Linux
.\deploy-all-ides.ps1       # Windows PowerShell
```

#### Supported IDEs
- Visual Studio Code
- VS Code Insiders
- Cursor
- Windsurf
- VS Codium
- OpenCode
- Code-OSS

#### Documentation
- [Quick Start Guide](./FWBOViewer/QUICK_START.md)
- [Deployment Guide](./FWBOViewer/DEPLOYMENT_README.md)
- [Architecture Documentation](./FWBOViewer/ARCHITECTURE.md)
- [Claude Agent Skill](./FWBOViewer/.claude/skills/README.md)

---

## 🚀 Installation

### Option 1: Automated Deployment
Each extension includes deployment scripts that automatically install to all compatible IDEs:

```bash
cd <extension-folder>
./deploy-all-ides.sh        # Mac/Linux
.\deploy-all-ides.ps1       # Windows PowerShell
```

### Option 2: Manual Installation
1. Download the `.vsix` file from the extension folder
2. Open your IDE
3. Go to Extensions view (`Cmd+Shift+X` or `Ctrl+Shift+X`)
4. Click `...` menu → "Install from VSIX..."
5. Select the `.vsix` file

### Option 3: Command Line
```bash
code --install-extension path/to/extension.vsix
cursor --install-extension path/to/extension.vsix
windsurf --install-extension path/to/extension.vsix
```

---

## 🛠️ Development

### Prerequisites
- Node.js 20.x or higher
- npm 10.x or higher
- TypeScript 5.x

### Build an Extension
```bash
cd <extension-folder>
npm install
npm run compile
vsce package
```

### Test Locally
1. Open extension folder in VS Code
2. Press `F5` to launch Extension Development Host
3. Test the extension functionality
4. Check Debug Console for errors

---

## 📚 Documentation

Each extension includes comprehensive documentation:
- `README.md` - Extension overview and features
- `QUICK_START.md` - Fast installation guide
- `DEPLOYMENT_README.md` - Detailed deployment instructions
- `ARCHITECTURE.md` - Technical architecture
- `.claude/skills/` - Claude agent skills for development assistance

---

## 🤖 Claude Agent Skills

Extensions include Claude agent skills that help with:
- 🚀 Automated installation
- 📚 Architecture explanations
- 🛠️ Feature development guidance
- 🐛 Debugging assistance
- 📦 Packaging and distribution

To use a skill, just ask Claude:
```
"Install the FWBO viewer extension"
"Explain how FWBO viewer works"
"Add a search feature to FWBO"
```

---

## 🌐 Supported Platforms

All extensions support:
- ✅ macOS
- ✅ Windows
- ✅ Linux

Tested on:
- ✅ VS Code 1.90+
- ✅ Cursor (latest)
- ✅ Windsurf (latest)

---

## 📋 Repository Structure

```
VSCodeExtensions/
├── README.md                    # This file
├── .gitignore                   # Git ignore rules
│
├── FWBOViewer/                  # FWBO Viewer extension
│   ├── src/                     # TypeScript source
│   ├── media/                   # Assets
│   ├── deploy/                  # Distribution files
│   ├── .claude/skills/          # Claude agent skills
│   ├── package.json             # Extension manifest
│   ├── deploy-all-ides.sh       # Deployment script
│   ├── fwbo-viewer-0.0.1.vsix   # Packaged extension
│   └── *.md                     # Documentation
│
└── [Future Extensions]/         # Additional extensions
```

---

## 🔧 Technologies

- **Language**: TypeScript
- **Framework**: VS Code Extension API
- **Build Tool**: TypeScript Compiler, vsce
- **Package Manager**: npm
- **Testing**: VS Code Extension Test Runner

---

## 📝 Contributing

### Adding a New Extension

1. Create a new folder for your extension
2. Initialize with `yo code` or use existing template
3. Implement extension features
4. Create deployment scripts (copy from FWBOViewer)
5. Write comprehensive documentation
6. Add Claude agent skill (optional but recommended)
7. Test on all platforms
8. Update this README

### Development Workflow

1. Clone the repository
2. Navigate to extension folder
3. Install dependencies: `npm install`
4. Make changes to source code
5. Compile: `npm run compile`
6. Test: Press `F5` in VS Code
7. Package: `vsce package`
8. Commit and push changes

---

## 🐛 Troubleshooting

### Extension Not Loading
- Check VS Code version compatibility
- Reload window: `Cmd+Shift+P` → "Developer: Reload Window"
- Check extension logs: `Cmd+Shift+P` → "Developer: Show Logs" → Extension Host

### Compilation Errors
```bash
rm -rf node_modules out
npm install
npm run compile
```

### Deployment Script Fails
- Verify Node.js and npm are installed
- Check IDE is in PATH
- Try manual installation
- Check logs in script output

---

## 📄 License

[Add your license information here]

---

## 🙏 Credits

Developed by **ToneMeUp**
Extensions built with assistance from **Claude Sonnet 4.5**

---

## 📧 Support

For issues or questions:
1. Check extension documentation
2. Review troubleshooting section
3. Open an issue in this repository
4. Contact the development team

---

## 🎯 Roadmap

### Planned Extensions
- [ ] Additional FormWizard tools
- [ ] Database schema viewer
- [ ] API documentation viewer
- [ ] Custom snippet manager

### Improvements
- [ ] Publish to VS Code Marketplace
- [ ] Add automated testing
- [ ] Create CI/CD pipeline
- [ ] Add telemetry and analytics

---

**Last Updated**: February 26, 2024
**Repository**: https://github.com/ToneMeUp/VSCodeExtensions

---

**Happy Coding! 🚀**
