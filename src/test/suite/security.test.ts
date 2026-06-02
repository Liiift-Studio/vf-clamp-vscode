// src/test/suite/security.test.ts — unit tests for the path / name safety helpers.
import * as assert from 'node:assert'
import * as path from 'node:path'
import {
	validateOutputName,
	resolveWithinRoot,
	sanitizeErrorMessage,
} from '../../security.js'

suite('security.validateOutputName', () => {
	test('rejects empty', () => { assert.strictEqual(validateOutputName('').ok, false) })
	test('rejects whitespace only', () => { assert.strictEqual(validateOutputName('   ').ok, false) })
	test('rejects path separator', () => { assert.strictEqual(validateOutputName('a/b').ok, false) })
	test('rejects backslash', () => { assert.strictEqual(validateOutputName('a\\b').ok, false) })
	test('rejects parent traversal', () => { assert.strictEqual(validateOutputName('..').ok, false) })
	test('rejects dotted parent traversal', () => { assert.strictEqual(validateOutputName('../etc/passwd').ok, false) })
	test('rejects NUL byte', () => { assert.strictEqual(validateOutputName('a\0b').ok, false) })
	test('rejects too long', () => { assert.strictEqual(validateOutputName('x'.repeat(250)).ok, false) })
	test('accepts plain name', () => {
		const v = validateOutputName('Typeface-Light-Bold')
		assert.strictEqual(v.ok, true)
		assert.strictEqual(v.safe, 'Typeface-Light-Bold')
	})
	test('trims whitespace', () => {
		const v = validateOutputName('  X  ')
		assert.strictEqual(v.safe, 'X')
	})
})

suite('security.resolveWithinRoot', () => {
	const root = path.resolve('/tmp/vf-clamp-test-root')
	test('inside root resolves', () => {
		const r = resolveWithinRoot(root, path.join(root, 'a.ttf'))
		assert.strictEqual(r, path.join(root, 'a.ttf'))
	})
	test('outside root rejected', () => {
		const r = resolveWithinRoot(root, '/etc/passwd')
		assert.strictEqual(r, null)
	})
	test('traversal rejected', () => {
		const r = resolveWithinRoot(root, path.join(root, '..', 'escape.ttf'))
		assert.strictEqual(r, null)
	})
})

suite('security.sanitizeErrorMessage', () => {
	test('strips POSIX path from ENOENT', () => {
		const e = new Error("ENOENT: no such file or directory, open '/etc/passwd'")
		const out = sanitizeErrorMessage(e)
		assert.ok(!out.includes('/etc/passwd'))
		assert.ok(out.includes('ENOENT'))
	})
	test('strips quoted paths', () => {
		const out = sanitizeErrorMessage(new Error("Cannot read '/Users/secret/x'"))
		assert.ok(!out.includes('/Users/secret/x'))
	})
	test('truncates very long messages', () => {
		const out = sanitizeErrorMessage(new Error('x'.repeat(2000)))
		assert.ok(out.length <= 501)
	})
})
