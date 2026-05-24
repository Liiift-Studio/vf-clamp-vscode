// src/extension.ts — vf-clamp VS Code extension entry point
import * as vscode from 'vscode'
import { VFClampPanel } from './panel'

/** Activate the extension and register all commands. */
export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('vf-clamp.openPanel', () => {
			VFClampPanel.createOrShow(context.extensionUri)
		}),
		vscode.commands.registerCommand('vf-clamp.openFile', (uri: vscode.Uri) => {
			VFClampPanel.createOrShow(context.extensionUri, uri.fsPath)
		}),
	)
}

/** Deactivate the extension — nothing to clean up beyond subscriptions. */
export function deactivate(): void {}
