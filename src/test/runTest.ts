// src/test/runTest.ts — entry point for @vscode/test-electron integration tests.
import * as path from 'node:path'
import { runTests } from '@vscode/test-electron'

async function main(): Promise<void> {
	try {
		const extensionDevelopmentPath = path.resolve(__dirname, '..', '..')
		const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.js')
		await runTests({ extensionDevelopmentPath, extensionTestsPath })
	} catch (err) {
		console.error('Failed to run tests', err)
		process.exit(1)
	}
}

void main()
