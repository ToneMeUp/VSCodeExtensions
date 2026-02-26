# FWBO Viewer Claude Skills

This directory contains Claude agent skills for working with the FWBO Viewer extension project.

## Available Skills

### `fwbo-viewer` Skill

**Purpose**: Help users install, understand, and develop the FWBO Viewer VS Code extension

**Capabilities**:
1. 🚀 **Install Extension** - Deploy to all compatible IDEs automatically
2. 📚 **Explain Architecture** - Understand codebase structure and design patterns
3. 🛠️ **Guide Development** - Help add new features and functionality
4. 🐛 **Troubleshoot Issues** - Debug common problems
5. 📦 **Package & Distribute** - Build and share the extension

---

## How to Use

### Automatic Activation

The skill automatically activates when you mention keywords like:
- "install fwbo"
- "deploy fwbo viewer"
- "explain fwbo architecture"
- "how does fwbo work"
- "fwbo project structure"

### Manual Activation

You can explicitly invoke the skill:

```
User: Use the fwbo-viewer skill to help me install the extension
```

---

## Example Interactions

### 1. Installing the Extension

**User**: "Install the FWBO viewer extension on my machine"

**Agent Response**:
- ✅ Checks prerequisites (Node.js, npm)
- ✅ Runs `npm install` to install dependencies
- ✅ Executes deployment script
- ✅ Reports which IDEs were detected
- ✅ Confirms installation success

### 2. Understanding Architecture

**User**: "How does the FWBO viewer work?"

**Agent Response**:
- 📋 Explains the architecture overview
- 🎨 Shows component diagram
- 📊 Describes data flow
- 💡 Highlights key technologies
- 📁 Walks through file structure

### 3. Adding Features

**User**: "I want to add a search feature to find controls"

**Agent Response**:
- 🔍 Identifies where to add code
- 📝 Shows implementation steps
- 💻 Provides code examples
- 🧪 Suggests testing approach
- 📦 Guides through repackaging

### 4. Debugging

**User**: "The extension isn't loading .fwbo files"

**Agent Response**:
- 🔧 Checks activation events
- 📋 Reviews extension logs
- ✅ Verifies file associations
- 💡 Suggests fixes
- 🎯 Tests the solution

### 5. Distribution

**User**: "How do I share this with my team?"

**Agent Response**:
- 📦 Explains packaging options
- 🌐 Shows distribution methods
- 📝 Provides installation instructions
- 🚀 Creates deployment package
- ✅ Verifies functionality

---

## Skill Files

### Core Files

- **`fwbo-viewer.md`** - Complete skill documentation (architecture, workflows, examples)
- **`fwbo-viewer.json`** - Skill configuration (triggers, capabilities, commands)
- **`README.md`** - This file (skill overview and usage)

### Referenced Documentation

- **`../../ARCHITECTURE.md`** - Detailed technical architecture
- **`../../DEPLOYMENT_README.md`** - Comprehensive deployment guide
- **`../../QUICK_START.md`** - Quick installation instructions

---

## Skill Triggers

The skill activates on these keywords:

### Primary Keywords
- `fwbo`
- `fwbo viewer`
- `fwbo extension`

### Action Keywords
- `install fwbo`
- `deploy fwbo`
- `fwbo architecture`
- `how does fwbo work`
- `fwbo structure`

### Technical Keywords
- `vs code extension`
- `vscode extension`
- `custom editor`
- `webview extension`

### Patterns (Regex)
- `install.*fwbo`
- `deploy.*fwbo`
- `explain.*fwbo`
- `architecture.*fwbo`
- `how.*fwbo.*work`
- `add.*feature.*fwbo`
- `debug.*fwbo`

---

## Prerequisites

To use this skill effectively, ensure you have:

1. **Node.js** (v20.x or higher)
2. **npm** (v10.x or higher)
3. **At least one compatible IDE**:
   - VS Code
   - Cursor
   - Windsurf
   - VS Codium
   - etc.

---

## Skill Commands

The skill can execute these commands:

### Install Dependencies
```bash
npm install
```

### Compile TypeScript
```bash
npm run compile
```

### Watch Mode (Development)
```bash
npm run watch
```

### Package Extension
```bash
vsce package
```

### Deploy to All IDEs
```bash
./deploy-all-ides.sh        # Mac/Linux
.\deploy-all-ides.ps1       # Windows PowerShell
```

---

## Architecture Quick Reference

```
┌─────────────────────────────────┐
│    VS Code / Cursor / IDE        │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│    Extension Host (Node.js)      │
│  ┌─────────────────────────┐   │
│  │   extension.ts          │   │
│  └──────────┬──────────────┘   │
│             ▼                    │
│  ┌─────────────────────────┐   │
│  │  FWBOEditorProvider      │   │
│  └──────┬───────────┬──────┘   │
│         │           │            │
│         ▼           ▼            │
│  ┌──────────┐  ┌──────────┐   │
│  │  Parser  │  │ Webview  │   │
│  └──────┬───┘  └────┬─────┘   │
│         │           │            │
│         ▼           ▼            │
│  ┌──────────────────────────┐  │
│  │   HTMLGenerator          │  │
│  └──────────────────────────┘  │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│    Webview (Chromium)            │
│  Interactive .fwbo Viewer        │
└─────────────────────────────────┘
```

---

## Project Structure

```
FWBOViewer/
├── src/                    # TypeScript source
│   ├── extension.ts        # Entry point
│   ├── FWBOEditorProvider.ts
│   ├── FWBOParser.ts
│   ├── HTMLGenerator.ts
│   └── WebviewManager.ts
├── out/                    # Compiled JS
├── media/                  # Assets
├── deploy/                 # Distribution
├── .claude/                # Claude skills
│   └── skills/
│       ├── fwbo-viewer.md
│       ├── fwbo-viewer.json
│       └── README.md       # You are here
├── package.json            # Manifest
├── tsconfig.json           # TS config
├── deploy-all-ides.sh      # Deployment
└── *.md                    # Documentation
```

---

## Supported IDEs

✅ **Fully Supported** (VS Code-based editors):
- Visual Studio Code
- Visual Studio Code Insiders
- Cursor
- Windsurf
- VS Codium
- OpenCode
- Code-OSS

❌ **Not Supported**:
- Visual Studio (full IDE)
- JetBrains IDEs
- Eclipse
- Sublime Text

---

## Success Metrics

After using this skill, users should be able to:

✅ Install the extension on their machine
✅ Understand the architecture and data flow
✅ Navigate the codebase confidently
✅ Add new features independently
✅ Debug common issues
✅ Package and distribute the extension

---

## Troubleshooting

### Skill Not Activating

**Check**:
1. Mention keywords like "fwbo" or "install fwbo"
2. Verify skill files exist in `.claude/skills/`
3. Restart Claude agent if needed

### Commands Failing

**Check**:
1. Run from correct directory: `FWBOViewer/`
2. Dependencies installed: `npm install`
3. Node.js version: `node --version` (should be 20.x+)

### Extension Not Installing

**Check**:
1. IDE is installed and in PATH
2. Run deployment script with proper permissions
3. Check logs in deployment output

---

## Advanced Usage

### Custom Installation

```bash
# Install to specific IDE only
code --install-extension fwbo-viewer-0.0.1.vsix

# Install with specific version
vsce package --out custom-name.vsix
cursor --install-extension custom-name.vsix
```

### Development Workflow

```bash
# 1. Make changes to src/
vim src/FWBOParser.ts

# 2. Compile
npm run compile

# 3. Test in dev host
# Press F5 in VS Code

# 4. Package
vsce package

# 5. Deploy
./deploy-all-ides.sh
```

---

## Contributing to the Skill

To improve this skill:

1. **Add Examples**: Update `fwbo-viewer.md` with more use cases
2. **Add Triggers**: Update `fwbo-viewer.json` keywords
3. **Add Commands**: Register new automation scripts
4. **Update Docs**: Keep architecture docs current

---

## Related Skills

If you're working on similar projects, consider creating skills for:
- Custom VS Code extensions
- Webview-based editors
- TypeScript development
- Extension deployment automation

---

## Resources

### Documentation
- [Skill Documentation](./fwbo-viewer.md)
- [Architecture Guide](../../ARCHITECTURE.md)
- [Deployment Guide](../../DEPLOYMENT_README.md)
- [Quick Start](../../QUICK_START.md)

### External Links
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Custom Editors Guide](https://code.visualstudio.com/api/extension-guides/custom-editors)
- [Claude Agent Skills](https://docs.anthropic.com/claude/docs/agent-skills)

---

## Version History

- **1.0.0** (2024-02-26)
  - Initial skill creation
  - Installation automation
  - Architecture documentation
  - Development workflows
  - Cross-platform deployment

---

## License

[Your License Here]

---

## Support

For help with this skill:
1. Read the skill documentation (`fwbo-viewer.md`)
2. Check troubleshooting section above
3. Review example interactions
4. Ask Claude: "Help me use the fwbo-viewer skill"

---

**Happy Coding! 🚀**
