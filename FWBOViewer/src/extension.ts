import * as vscode from 'vscode';
import { FwboEditorProvider } from './FwboEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('FWBO Viewer is now active!');
    vscode.window.showInformationMessage('FWBO Viewer extension is active!');
    context.subscriptions.push(FwboEditorProvider.register(context));
}
