// src/test/suite/panel.test.ts — integration tests for the VFClampPanel lifecycle and webview HTML.
import * as assert from 'node:assert'
import * as vscode from 'vscode'
import { VFClampPanel } from '../../panel.js'

suite('VFClampPanel lifecycle', () => {
	test('createOrShow creates a singleton', async () => {
		const ext = vscode.extensions.getExtension('liiift-studio.vf-clamp')
		await ext!.activate()
		VFClampPanel.createOrShow(ext!.extensionUri)
		assert.ok(VFClampPanel.currentPanel)
		const first = VFClampPanel.currentPanel
		VFClampPanel.createOrShow(ext!.extensionUri)
		assert.strictEqual(VFClampPanel.currentPanel, first, 'Should reuse singleton')
		VFClampPanel.currentPanel?.dispose()
		assert.strictEqual(VFClampPanel.currentPanel, undefined)
	})

	test('dispose is idempotent', async () => {
		const ext = vscode.extensions.getExtension('liiift-studio.vf-clamp')
		await ext!.activate()
		VFClampPanel.createOrShow(ext!.extensionUri)
		const panel = VFClampPanel.currentPanel!
		panel.dispose()
		panel.dispose() // should not throw
		assert.strictEqual(VFClampPanel.currentPanel, undefined)
	})

	test('Webview HTML uses matching nonces across style, script, and CSP', async () => {
		const ext = vscode.extensions.getExtension('liiift-studio.vf-clamp')
		await ext!.activate()
		VFClampPanel.createOrShow(ext!.extensionUri)
		const html = (VFClampPanel.currentPanel as unknown as { _panel: vscode.WebviewPanel })._panel.webview.html
		const scriptNonce = html.match(/<script[^>]*nonce="([^"]+)"/)?.[1]
		const styleNonce = html.match(/<link[^>]*nonce="([^"]+)"/)?.[1]
		const cspNonce = html.match(/script-src 'nonce-([^']+)'/)?.[1]
		assert.ok(scriptNonce && scriptNonce === styleNonce && scriptNonce === cspNonce,
			`Nonce mismatch: script=${scriptNonce} style=${styleNonce} csp=${cspNonce}`)
		VFClampPanel.currentPanel?.dispose()
	})
})
