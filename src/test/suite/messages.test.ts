// src/test/suite/messages.test.ts — unit tests for the shared message contract.
import * as assert from 'node:assert'
import { isIncomingMessage, isFontFormat, FORMAT_EXT } from '../../shared/messages.js'

suite('shared/messages: isIncomingMessage', () => {
	test('accepts pickFile', () => {
		assert.strictEqual(isIncomingMessage({ type: 'pickFile' }), true)
	})
	test('accepts loadFont with non-empty path', () => {
		assert.strictEqual(isIncomingMessage({ type: 'loadFont', path: '/x.ttf' }), true)
	})
	test('rejects loadFont with empty path', () => {
		assert.strictEqual(isIncomingMessage({ type: 'loadFont', path: '' }), false)
	})
	test('rejects unknown type', () => {
		assert.strictEqual(isIncomingMessage({ type: 'nope' }), false)
	})
	test('rejects null', () => {
		assert.strictEqual(isIncomingMessage(null), false)
	})
	test('accepts well-formed generate', () => {
		assert.strictEqual(isIncomingMessage({
			type: 'generate',
			fontPath: '/x.ttf',
			outputDir: '/tmp',
			format: 'woff2',
			outputs: [{ name: 'X', instances: ['Light'] }],
		}), true)
	})
	test('rejects generate with bad format', () => {
		assert.strictEqual(isIncomingMessage({
			type: 'generate',
			fontPath: '/x.ttf',
			outputDir: '/tmp',
			format: 'pdf',
			outputs: [{ name: 'X', instances: ['Light'] }],
		}), false)
	})
})

suite('shared/messages: isFontFormat', () => {
	test('valid formats', () => {
		for (const f of ['ttf', 'otf', 'woff', 'woff2']) {
			assert.strictEqual(isFontFormat(f), true)
		}
	})
	test('invalid formats', () => {
		assert.strictEqual(isFontFormat('eot'), false)
		assert.strictEqual(isFontFormat(undefined), false)
	})
})

suite('FORMAT_EXT', () => {
	test('maps every format to its extension', () => {
		assert.strictEqual(FORMAT_EXT.ttf, 'ttf')
		assert.strictEqual(FORMAT_EXT.otf, 'otf')
		assert.strictEqual(FORMAT_EXT.woff, 'woff')
		assert.strictEqual(FORMAT_EXT.woff2, 'woff2')
	})
})
