// src/extension.ts — vf-clamp VS Code extension entry point.
// Registers commands, wires up the webview panel serializer, and exposes a shared
// OutputChannel so panel errors can be diagnosed even when the webview itself fails.
import * as vscode from 'vscode'
import { VFClampPanel, resetVfClampPromise } from './panel.js'

/** Shared OutputChannel for diagnostic logging. */
let output: vscode.OutputChannel | undefined

/** Lazily create (or return) the shared OutputChannel. */
export function getOutputChannel(): vscode.OutputChannel {
	if (!output) output = vscode.window.createOutputChannel('vf-clamp')
	return output
}

/** Activate the extension and register all commands. */
export function activate(context: vscode.ExtensionContext): void {
	const channel = getOutputChannel()
	channel.appendLine('vf-clamp activated.')

	context.subscriptions.push(
		channel,
		vscode.commands.registerCommand('vf-clamp.openPanel', () => {
			VFClampPanel.createOrShow(context.extensionUri)
		}),
		vscode.commands.registerCommand('vf-clamp.openFile', (uri: unknown) => {
			// Defensive: command may be invoked from the palette with no argument.
			if (uri instanceof vscode.Uri) {
				VFClampPanel.createOrShow(context.extensionUri, uri.fsPath)
			} else {
				VFClampPanel.createOrShow(context.extensionUri)
				// Trigger the panel-internal pickFile flow so the user can still proceed.
				VFClampPanel.currentPanel?.triggerPickFile()
			}
		}),
	)

	// Restore the panel across VS Code restarts.
	if (vscode.window.registerWebviewPanelSerializer) {
		context.subscriptions.push(
			vscode.window.registerWebviewPanelSerializer('vfClamp', {
				async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel): Promise<void> {
					VFClampPanel.revive(webviewPanel, context.extensionUri)
				},
			}),
		)
	}
}

/** Deactivate the extension and explicitly dispose any live panel. */
export function deactivate(): void {
	VFClampPanel.currentPanel?.dispose()
	output?.dispose()
	output = undefined
	// Clear the cached vf-clamp module promise so a subsequent activation gets a
	// fresh Pyodide heap rather than reusing the previous activation's WASM state.
	resetVfClampPromise()
}
