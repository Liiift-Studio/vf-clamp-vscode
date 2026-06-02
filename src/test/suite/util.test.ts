// src/test/suite/util.test.ts — unit tests for compactName and safeId.
import * as assert from 'node:assert'
import { compactName, safeId } from '../../util.js'

suite('util.compactName', () => {
	test('identical inputs return the same name', () => {
		assert.strictEqual(compactName('Light', 'Light'), 'Light')
	})
	test('strips shared prefix', () => {
		assert.strictEqual(compactName('Typeface Light', 'Typeface Bold'), 'Typeface Light-Bold')
	})
	test('strips shared suffix', () => {
		assert.strictEqual(compactName('Light Italic', 'Bold Italic'), 'Light-Bold Italic')
	})
})

suite('util.safeId', () => {
	test('replaces slashes', () => {
		assert.strictEqual(safeId('a/b'), 'a_b')
	})
	test('replaces dots', () => {
		assert.strictEqual(safeId('a.b'), 'a_b')
	})
	test('prefixes leading digit', () => {
		assert.strictEqual(safeId('1weight'), '_1weight')
	})
	test('preserves valid characters', () => {
		assert.strictEqual(safeId('Light-Bold_300'), 'Light-Bold_300')
	})
})
