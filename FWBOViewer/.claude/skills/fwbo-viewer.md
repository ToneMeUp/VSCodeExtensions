# FWBO Viewer Extension Skill

**Name**: fwbo-viewer
**Description**: Install, explain architecture, and work with the FWBO Viewer VS Code extension project
**Version**: 1.0.0

---

## Skill Capabilities

This skill helps users:

1. **Install the extension** - Deploy to all compatible IDEs automatically
2. **Understand the architecture** - Explain the codebase structure and design
3. **Develop features** - Guide development of new features
4. **Debug issues** - Help troubleshoot extension problems
5. **Package & distribute** - Build and share the extension

---

## Project Overview

### What is FWBO Viewer?

FWBO Viewer is a **Visual Studio Code extension** that provides a visual editor for `.fwbo` (FormWizard Binary Object) files. It's built using TypeScript and the VS Code Extension API.

### Key Features

- ✅ **Custom Editor** for `.fwbo` files
- ✅ **XML Parsing** with fast-xml-parser
- ✅ **Visual Rendering** of form wizards
- ✅ **Section Navigation** with expandable tree view
- ✅ **Cross-platform** (Windows, macOS, Linux)
- ✅ **Multi-IDE support** (VS Code, Cursor, Windsurf, etc.)

---

## Architecture Overview

### 1. **Extension Entry Point**

**File**: `src/extension.ts`

```typescript
export function activate(context: vscode.ExtensionContext) {
    // Register custom editor provider
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'fwbo.viewer',
            new FWBOEditorProvider(context),
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );
}
```

**Purpose**: Registers the custom editor when the extension activates

---

### 2. **Editor Provider**

**File**: `src/FWBOEditorProvider.ts`

```typescript
class FWBOEditorProvider implements vscode.CustomReadonlyEditorProvider {
    resolveCustomEditor(document, webviewPanel, token) {
        // 1. Read .fwbo file
        // 2. Parse XML content
        // 3. Generate HTML view
        // 4. Display in webview
    }
}
```

**Purpose**: Main controller that handles opening `.fwbo` files

**Flow**:
1. User opens `.fwbo` file
2. VS Code calls `resolveCustomEditor()`
3. Provider reads file content
4. Parses XML using fast-xml-parser
5. Generates HTML visualization
6. Displays in webview panel

---

### 3. **Core Components**

#### **FWBOParser** (`src/FWBOParser.ts`)
- Parses `.fwbo` XML files
- Extracts form wizard structure
- Handles nested sections and controls

#### **HTMLGenerator** (`src/HTMLGenerator.ts`)
- Converts parsed data to HTML
- Generates expandable sections
- Creates visual layout

#### **WebviewManager** (`src/WebviewManager.ts`)
- Manages webview lifecycle
- Handles message passing between extension and webview
- Updates content dynamically

---

### 4. **Architecture Diagram**

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code / Cursor                      │
└─────────────────────────┬───────────────────────────────┘
                          │
                          │ .fwbo file opened
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Extension Host (Node.js)                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │           extension.ts (Entry Point)             │   │
│  └───────────────────┬─────────────────────────────┘   │
│                      │                                   │
│                      ▼                                   │
│  ┌─────────────────────────────────────────────────┐   │
│  │        FWBOEditorProvider (Controller)           │   │
│  │  • resolveCustomEditor()                         │   │
│  │  • Read file from disk                           │   │
│  │  • Coordinate parsing & rendering                │   │
│  └───────┬─────────────────────────────┬───────────┘   │
│          │                             │                │
│          ▼                             ▼                │
│  ┌──────────────┐            ┌──────────────────┐      │
│  │  FWBOParser  │            │  WebviewManager  │      │
│  │              │            │                  │      │
│  │ • parseXML() │            │ • createWebview()│      │
│  │ • extract    │            │ • postMessage()  │      │
│  │   sections   │            │ • onMessage()    │      │
│  └──────┬───────┘            └────────┬─────────┘      │
│         │                             │                │
│         ▼                             ▼                │
│  ┌──────────────────────────────────────────────┐     │
│  │         HTMLGenerator (Renderer)              │     │
│  │  • generateHTML()                             │     │
│  │  • createSections()                           │     │
│  │  • applyStyles()                              │     │
│  └─────────────────────┬────────────────────────┘     │
│                        │                               │
└────────────────────────┼───────────────────────────────┘
                         │ HTML + CSS + JS
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Webview (Chromium/Electron)                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │          Interactive HTML Viewer                 │   │
│  │  • Expandable sections                           │   │
│  │  • Form field visualization                      │   │
│  │  • JavaScript interactions                       │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

### 5. **Project Structure**

```
FWBOViewer/
├── src/                        # TypeScript source code
│   ├── extension.ts            # Entry point - activates extension
│   ├── FWBOEditorProvider.ts   # Main editor controller
│   ├── FWBOParser.ts           # XML parsing logic
│   ├── HTMLGenerator.ts        # HTML rendering
│   ├── WebviewManager.ts       # Webview lifecycle management
│   ├── models/                 # Data models
│   │   ├── FWBODocument.ts     # Document model
│   │   └── Section.ts          # Section model
│   └── utils/                  # Utility functions
│       ├── fileReader.ts       # File I/O helpers
│       └── logger.ts           # Logging utilities
│
├── out/                        # Compiled JavaScript (generated)
│   └── *.js                    # Transpiled from src/
│
├── media/                      # Static assets
│   ├── styles.css              # Webview styling
│   └── icon.png                # Extension icon
│
├── node_modules/               # Dependencies
│   ├── @types/vscode/          # VS Code API types
│   ├── fast-xml-parser/        # XML parsing library
│   └── typescript/             # TypeScript compiler
│
├── deploy/                     # Deployment artifacts
│   ├── fwbo-viewer-0.0.1.vsix  # Packaged extension
│   └── package.json            # Metadata copy
│
├── package.json                # Extension manifest
├── tsconfig.json               # TypeScript configuration
├── deploy-all-ides.sh          # macOS/Linux deployment script
├── deploy-all-ides.ps1         # Windows PowerShell deployment
├── ARCHITECTURE.md             # Detailed architecture docs
├── DEPLOYMENT_README.md        # Deployment guide
├── QUICK_START.md              # Quick installation guide
└── README.md                   # Project overview
```

---

### 6. **Data Flow**

```
┌──────────────┐
│  User opens  │
│  .fwbo file  │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────┐
│  VS Code triggers extension         │
│  activationEvents: "onCustomEditor" │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  FWBOEditorProvider.resolveCustom   │
│  Editor() is called                 │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Read file content from disk        │
│  (Binary/XML format)                │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  FWBOParser.parse(content)          │
│  • Extract XML structure            │
│  • Parse sections                   │
│  • Parse form controls              │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  HTMLGenerator.generate(data)       │
│  • Create HTML structure            │
│  • Apply CSS styles                 │
│  • Add JavaScript interactions      │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  WebviewManager.setHTML(html)       │
│  • Create webview panel             │
│  • Inject HTML content              │
│  • Setup message handlers           │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Webview displays interactive UI    │
│  • User can expand/collapse         │
│  • View form structure              │
│  • Navigate sections                │
└─────────────────────────────────────┘
```

---

### 7. **Key Technologies**

| Technology | Purpose | Version |
|------------|---------|---------|
| **TypeScript** | Main language | ^5.4.5 |
| **VS Code Extension API** | IDE integration | ^1.90.0 |
| **fast-xml-parser** | XML parsing | ^4.4.0 |
| **Node.js** | Runtime | 20.x |
| **Webview API** | UI rendering | Built-in |

---

### 8. **Extension Lifecycle**

```typescript
// 1. ACTIVATION
activate(context: ExtensionContext) {
    // Register providers, commands, etc.
    // Only runs once when extension loads
}

// 2. EDITOR RESOLUTION
resolveCustomEditor(document, webviewPanel, token) {
    // Runs each time a .fwbo file is opened
    // Sets up the custom editor
}

// 3. RUNTIME
// Extension runs in Node.js environment
// Webview runs in separate Chromium process
// Communication via postMessage API

// 4. DEACTIVATION
deactivate() {
    // Cleanup resources
    // Runs when extension unloads
}
```

---

## Installation Commands

### For Users:

```bash
# Quick Install (Automated)
cd /path/to/FWBOViewer
npm install
./deploy-all-ides.sh        # Mac/Linux
.\deploy-all-ides.ps1       # Windows PowerShell
```

### For Developers:

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-compile on save)
npm run watch

# Package extension
vsce package

# Install in specific IDE
code --install-extension fwbo-viewer-0.0.1.vsix
cursor --install-extension fwbo-viewer-0.0.1.vsix
```

---

## Development Workflow

### 1. **Make Changes**
```bash
# Edit TypeScript files in src/
vim src/FWBOParser.ts
```

### 2. **Compile**
```bash
npm run compile
# or use watch mode
npm run watch
```

### 3. **Test Locally**
- Press `F5` in VS Code to launch Extension Development Host
- Open a `.fwbo` file to test
- Check Debug Console for errors

### 4. **Package**
```bash
vsce package
```

### 5. **Deploy**
```bash
./deploy-all-ides.sh
```

---

## Common Tasks

### Add a New Feature

1. Create new file in `src/features/myFeature.ts`
2. Import in `extension.ts`
3. Register in `activate()` function
4. Compile and test

### Debug Issues

```bash
# Enable extension host logging
# In VS Code: Developer Tools → Extension Host
# Or check: ~/.vscode/extensions/logs/

# View extension logs
code --log-level=trace
```

### Update Dependencies

```bash
npm update
npm audit fix
```

### Change Extension Icon

1. Replace `media/icon.png`
2. Update `package.json` → `icon` field
3. Repackage with `vsce package`

---

## Deployment Targets

### Supported IDEs:

✅ **VS Code** (Visual Studio Code)
✅ **VS Code Insiders**
✅ **Cursor** (AI-powered IDE)
✅ **Windsurf** (Codeium IDE)
✅ **VS Codium** (Open source VS Code)
✅ **OpenCode**
✅ **Code-OSS**

❌ **Visual Studio** (Full IDE) - Different architecture
❌ **JetBrains IDEs** - Different plugin system

---

## File Formats

### .fwbo File Structure

```xml
<?xml version="1.0" encoding="utf-8"?>
<FormWizard>
  <Section name="Section1">
    <Control type="TextBox">
      <Property name="Label">Enter Name</Property>
      <Property name="Required">true</Property>
    </Control>
    <Control type="Dropdown">
      <Property name="Label">Select Option</Property>
      <Options>
        <Option>Option 1</Option>
        <Option>Option 2</Option>
      </Options>
    </Control>
  </Section>
  <Section name="Section2">
    <!-- More controls -->
  </Section>
</FormWizard>
```

---

## Extension Manifest (package.json)

```json
{
  "name": "fwbo-viewer",
  "displayName": "FWBO Viewer",
  "description": "Visual viewer for .fwbo files",
  "version": "0.0.1",
  "publisher": "illumify",

  "engines": {
    "vscode": "^1.90.0"
  },

  "activationEvents": [
    "onCustomEditor:fwbo.viewer"
  ],

  "main": "./out/extension.js",

  "contributes": {
    "customEditors": [
      {
        "viewType": "fwbo.viewer",
        "displayName": "FWBO Viewer",
        "selector": [
          { "filenamePattern": "*.fwbo" }
        ],
        "priority": "default"
      }
    ]
  }
}
```

**Key Fields**:
- `activationEvents`: When to load the extension
- `contributes.customEditors`: Registers custom editor for `.fwbo` files
- `main`: Entry point (compiled JS file)

---

## Troubleshooting

### Extension Not Activating

**Check**:
1. File extension is `.fwbo`
2. `activationEvents` includes `onCustomEditor:fwbo.viewer`
3. Extension is installed: `code --list-extensions | grep fwbo`

**Fix**:
```bash
# Reload window
Cmd+Shift+P → "Developer: Reload Window"

# Check logs
Cmd+Shift+P → "Developer: Show Logs" → Extension Host
```

### Compilation Errors

```bash
# Clean build
rm -rf out/
npm run compile

# Check TypeScript config
cat tsconfig.json
```

### Deployment Script Fails

```bash
# Check Node.js
node --version  # Should be 20.x or higher

# Check npm
npm --version

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Manual installation
vsce package
code --install-extension fwbo-viewer-0.0.1.vsix
```

---

## Performance Considerations

### File Size Limits

- **Small files (<1MB)**: Instant loading
- **Medium files (1-10MB)**: May take 1-2 seconds
- **Large files (>10MB)**: Consider pagination or lazy loading

### Optimization Tips

1. **Lazy Load Sections**: Only render visible sections
2. **Virtual Scrolling**: For large lists of controls
3. **Debounce Updates**: Throttle webview refreshes
4. **Cache Parsed Data**: Avoid re-parsing on scroll

---

## Security Considerations

### Webview Security

```typescript
webviewPanel.webview.options = {
    enableScripts: true,           // Allow JavaScript
    localResourceRoots: [          // Restrict file access
        vscode.Uri.joinPath(context.extensionUri, 'media')
    ]
};
```

### Content Security Policy

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               img-src vscode-resource: https:;
               script-src 'nonce-${nonce}';
               style-src vscode-resource: 'unsafe-inline';">
```

---

## Future Enhancements

### Planned Features

1. **Edit Mode**: Allow editing `.fwbo` files (currently read-only)
2. **Validation**: Check form structure for errors
3. **Export**: Convert to other formats (JSON, HTML)
4. **Themes**: Dark/light mode support
5. **Search**: Find controls by name/type
6. **Diff View**: Compare two `.fwbo` files

### Extension Points

```typescript
// Add commands
vscode.commands.registerCommand('fwbo.export', () => {
    // Export logic
});

// Add context menus
"contributes": {
    "menus": {
        "editor/context": [
            {
                "when": "resourceExtname == .fwbo",
                "command": "fwbo.export"
            }
        ]
    }
}
```

---

## Testing

### Manual Testing

1. Create test `.fwbo` files in `test/fixtures/`
2. Open in Extension Development Host (F5)
3. Verify rendering and interactions

### Automated Testing (Future)

```typescript
// test/extension.test.ts
import * as assert from 'assert';
import { FWBOParser } from '../src/FWBOParser';

suite('FWBOParser Tests', () => {
    test('Parse valid XML', () => {
        const xml = '<?xml version="1.0"?><FormWizard></FormWizard>';
        const result = FWBOParser.parse(xml);
        assert.ok(result);
    });
});
```

---

## Distribution

### Option 1: Direct Distribution
- Share `fwbo-viewer-0.0.1.vsix` file
- Users install manually or via script

### Option 2: VS Code Marketplace
```bash
# Publish to marketplace
vsce publish

# Requires:
# 1. Publisher account
# 2. Personal Access Token
# 3. Updated README.md
```

### Option 3: Private Registry
- Host on internal server
- Use `code --install-extension https://your-server/fwbo-viewer.vsix`

---

## Resources

### Documentation
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Custom Editors Guide](https://code.visualstudio.com/api/extension-guides/custom-editors)
- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)

### Tools
- [vsce](https://github.com/microsoft/vscode-vsce) - Extension packaging
- [yo code](https://github.com/microsoft/vscode-generator-code) - Extension generator

### Community
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [VS Code API GitHub](https://github.com/microsoft/vscode)

---

## Skill Usage Examples

### Install Extension
```
User: "Install the FWBO viewer extension"
Agent: [Runs deployment script, installs to all IDEs]
```

### Explain Architecture
```
User: "How does the FWBO viewer work?"
Agent: [Explains architecture, shows diagrams, walks through code]
```

### Add Feature
```
User: "Add a search feature to find controls"
Agent: [Guides through implementation, shows where to add code]
```

### Debug Issue
```
User: "Extension not loading .fwbo files"
Agent: [Checks activation events, logs, troubleshoots]
```

### Package for Distribution
```
User: "How do I share this with my team?"
Agent: [Explains packaging, creates distribution package]
```

---

## Success Criteria

A successful interaction with this skill should:

✅ **Install**: Extension deployed to all available IDEs
✅ **Understand**: User comprehends architecture and data flow
✅ **Develop**: User can add features independently
✅ **Debug**: User can troubleshoot common issues
✅ **Distribute**: Extension packaged and shareable

---

## Skill Metadata

- **Category**: Development Tools
- **Complexity**: Intermediate
- **Prerequisites**: Basic TypeScript, VS Code knowledge
- **Time to Learn**: 30-60 minutes
- **Maintenance**: Low (stable API)

---

## Version History

- **1.0.0** (2024-02-26): Initial skill creation
  - Installation automation
  - Architecture documentation
  - Development workflows
  - Cross-platform deployment

---

## License

[Your License Here]

---

## Support

For issues or questions:
1. Read this skill documentation
2. Check DEPLOYMENT_README.md
3. Review ARCHITECTURE.md
4. Check extension logs
5. Open issue in repository
