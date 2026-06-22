// src/test/suite/panel-helpers.test.ts — unit tests for the vscode-free panel helpers.
import * as assert from 'node:assert'
import { formatTitle, extensionForResult, MAX_TITLE_FONT_CHARS } from '../../panel-helpers.js'

suite('panel-helpers: formatTitle', () => {
	test('uses the basename, not the full path', () => {
		assert.strictEqual(formatTitle('/Users/x/fonts/Inter.ttf'), 'vf-clamp · Inter.ttf')
	})
	test('handles a bare filename with no directory', () => {
		assert.strictEqual(formatTitle('Inter.ttf'), 'vf-clamp · Inter.ttf')
	})
	test('truncates very long basenames with an ellipsis', () => {
		const long = 'A'.repeat(120) + '.ttf'
		const title = formatTitle('/tmp/' + long)
		const label = title.replace('vf-clamp · ', '')
		assert.strictEqual(label.length, MAX_TITLE_FONT_CHARS)
		assert.ok(label.endsWith('…'), 'truncated label should end with an ellipsis')
	})
	test('does not truncate a name exactly at the limit', () => {
		const name = 'B'.repeat(MAX_TITLE_FONT_CHARS)
		const label = formatTitle('/tmp/' + name).replace('vf-clamp · ', '')
		assert.strictEqual(label, name)
	})
	test('preserves RTL characters in short names', () => {
		// Arabic basename — must pass through unmodified when under the limit.
		const label = formatTitle('/tmp/خط.ttf').replace('vf-clamp · ', '')
		assert.strictEqual(label, 'خط.ttf')
	})
	test('never throws on an empty path', () => {
		assert.doesNotThrow(() => formatTitle(''))
	})
})

suite('panel-helpers: extensionForResult', () => {
	test('uses the result format when it is a known format', () => {
		assert.strictEqual(extensionForResult('woff2', 'ttf'), 'woff2')
	})
	test('falls back to the requested format when result format is unknown', () => {
		assert.strictEqual(extensionForResult('garbage', 'otf'), 'otf')
	})
	test('falls back to the requested format when result format is undefined', () => {
		assert.strictEqual(extensionForResult(undefined, 'woff'), 'woff')
	})
})
