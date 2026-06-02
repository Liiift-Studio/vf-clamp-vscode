// src/test/suite/index.ts — mocha test runner bootstrap.
import * as path from 'node:path'
import * as fs from 'node:fs'
import Mocha from 'mocha'

export function run(): Promise<void> {
	const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60_000 })
	const testsRoot = path.resolve(__dirname)
	return new Promise((resolve, reject) => {
		const files: string[] = []
		for (const entry of fs.readdirSync(testsRoot)) {
			if (entry.endsWith('.test.js')) files.push(path.resolve(testsRoot, entry))
		}
		files.forEach(f => mocha.addFile(f))
		try {
			mocha.run(failures => {
				if (failures > 0) reject(new Error(`${failures} tests failed.`))
				else resolve()
			})
		} catch (err) {
			reject(err)
		}
	})
}
