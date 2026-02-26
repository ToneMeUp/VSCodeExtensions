import * as vscode from 'vscode';
import * as http from 'http';
import { FwboDataProviderFactory } from './FwboDataProviderFactory';
import * as path from 'path';
import * as fs from 'fs';

export class FwboEditorProvider implements vscode.CustomTextEditorProvider {

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new FwboEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(FwboEditorProvider.viewType, provider);
        return providerRegistration;
    }

    private static readonly viewType = 'fwbo.viewer';

    private currentData: any;
    private activeDocument: vscode.TextDocument | null = null;
    private updateWebviewCallback: (() => void) | null = null;

    constructor(
        private readonly context: vscode.ExtensionContext
    ) { }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
            ]
        };

        this.activeDocument = document;

        let debounceTimeout: NodeJS.Timeout | undefined;
        let lastDocumentVersion = -1;
        
        const updateWebview = (force: boolean = false) => {
            if (debounceTimeout) {
                clearTimeout(debounceTimeout);
            }
            
            const currentVersion = document.version;
            if (!force && currentVersion === lastDocumentVersion) {
                return;
            }
            
            debounceTimeout = setTimeout(() => {
                try {
                    const text = document.getText();

                    const diagramPath = document.fileName + '.diagram';
                    let diagramContent = '';
                    if (fs.existsSync(diagramPath)) {
                        diagramContent = fs.readFileSync(diagramPath, 'utf8');
                    }

                    // Use factory to auto-detect format and get appropriate provider
                    const provider = FwboDataProviderFactory.createProvider(text);
                    const data = provider.parse(text, diagramContent);
                    this.currentData = data;
                    lastDocumentVersion = document.version;

                    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, data);
                } catch (e) {
                    console.error('Error updating webview:', e);
                    webviewPanel.webview.html = `<html><body><h3>Error parsing FWBO file</h3><pre>${e}</pre></body></html>`;
                }
            }, 50);
        };

        this.updateWebviewCallback = updateWebview;

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });

        webviewPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.type) {
                    case 'addEntity':
                        this.sendRequest('AddEntity', {
                            ModelPath: document.fileName,
                            EntityName: message.name
                        });
                        return;
                    case 'moveShape':
                        this.sendRequest('MoveShape', {
                            ModelPath: document.fileName,
                            ShapeId: message.shapeId,
                            X: message.x,
                            Y: message.y,
                            Width: message.width,
                            Height: message.height
                        });
                        return;
                    case 'requestAddProperty':
                        const propName = await vscode.window.showInputBox({ prompt: 'Enter Property Name' });
                        if (!propName) return;

                        const propTypes = ['String', 'Int32', 'Boolean', 'DateTime', 'Decimal', 'Guid', 'Double', 'Int64'];
                        const propType = await vscode.window.showQuickPick(propTypes, { placeHolder: 'Select Property Type', canPickMany: false });
                        if (!propType) return;

                        const isNullableStr = await vscode.window.showQuickPick(['True', 'False'], { placeHolder: 'Is Nullable?', canPickMany: false });
                        if (!isNullableStr) return;

                        this.sendRequest('AddProperty', {
                            ModelPath: document.fileName,
                            EntityName: message.entityName,
                            PropertyName: propName,
                            PropertyType: propType,
                            IsNullable: isNullableStr === 'True'
                        });
                        return;
                    case 'requestAddAssociation':
                        if (!this.currentData || !this.currentData.entities) return;
                        const targets = this.currentData.entities.map((e: any) => e.name);
                        const targetName = await vscode.window.showQuickPick(targets, { placeHolder: 'Select Target Entity' });
                        if (targetName) {
                            this.sendRequest('AddAssociation', {
                                ModelPath: document.fileName,
                                SourceEntityName: message.sourceEntityName,
                                TargetEntityName: targetName
                            });
                        }
                        return;
                }
            },
            undefined,
            this.context.subscriptions
        );

        // Make sure we get rid of the listener when our editor is closed.
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });

        updateWebview();
    }

    private getHtmlForWebview(webview: vscode.Webview, data: any): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.file(
            path.join(this.context.extensionPath, 'media', 'fwbo.js')
        ));
        const styleUri = webview.asWebviewUri(vscode.Uri.file(
            path.join(this.context.extensionPath, 'media', 'fwbo.css')
        ));

        const dataJson = JSON.stringify(data);

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet" />
            <title>FWBO Viewer</title>
        </head>
        <body>
            <div id="ui-layer">
                <div id="search-container">
                    <input type="text" id="search-input" placeholder="Search entities..." />
                    <button id="search-button">Search</button>
                    <span id="search-count"></span>
                </div>
            </div>
            <div id="diagram-container"></div>
            <script>
                const fwboData = ${dataJson};
            </script>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    private sendRequest(operation: string, payload: any) {
        const data = JSON.stringify(payload);
        const options = {
            hostname: 'localhost',
            port: 5458,
            path: `/ToolsFrameworksConverterEngine/${operation}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = http.request(options, res => {
            let responseBody = '';
            res.on('data', chunk => {
                responseBody += chunk;
            });

            res.on('end', () => {
                if (res.statusCode !== 200) {
                    vscode.window.showErrorMessage(`Operation ${operation} failed: ${res.statusCode}`);
                } else {
                    try {
                        const response = JSON.parse(responseBody);
                        if (response.Success === false) {
                            vscode.window.showErrorMessage(`Operation ${operation} failed: ${response.Message || 'Unknown error'}`);
                        } else {
                            vscode.window.showInformationMessage(`${operation} completed successfully`);
                            // Force a file reload from disk
                            setTimeout(async () => {
                                if (this.activeDocument && this.updateWebviewCallback) {
                                    // Close and reopen the document to force VS Code to reload from disk
                                    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                                    await vscode.commands.executeCommand('vscode.open', this.activeDocument.uri);
                                }
                            }, 100);
                        }
                    } catch (e) {
                        console.error('Failed to parse response:', e);
                    }
                }
            });
        });

        req.on('error', error => {
            vscode.window.showErrorMessage(`Error calling backend: ${error.message}`);
        });

        req.write(data);
        req.end();
    }
}
