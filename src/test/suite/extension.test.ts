// src/test/suite/extension.test.ts — integration tests verifying activation + command registration.
import * as assert from 'node:assert'
import * as vscode from 'vscode'

suite('vf-clamp extension activation', () => {
	test('Extension is present and activates', async () => {
		const ext = vscode.extensions.getExtension('overpunch.vf-clamp')
		assert.ok(ext, 'Extension not found')
		await ext!.activate()
		assert.strictEqual(ext!.isActive, true)
	})

	test('Both commands are registered', async () => {
		const ext = vscode.extensions.getExtension('overpunch.vf-clamp')
		await ext!.activate()
		const commands = await vscode.commands.getCommands(true)
		assert.ok(commands.includes('vf-clamp.openPanel'), 'openPanel missing')
		assert.ok(commands.includes('vf-clamp.openFile'), 'openFile missing')
	})

	test('openFile with no argument does not throw', async () => {
		const ext = vscode.extensions.getExtension('overpunch.vf-clamp')
		await ext!.activate()
		await vscode.commands.executeCommand('vf-clamp.openFile')
	})
})
