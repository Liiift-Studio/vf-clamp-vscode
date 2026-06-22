// src/test/suite/webview-csp.test.ts — guards the webview against inline style mutations.
// A strict CSP with a style-src nonce blocks `element.style.* = ...` writes (the property
// path, not CSSOM) inconsistently across VS Code versions; toggling CSS classes is the
// supported, future-proof approach. This test fails if anyone reintroduces inline styling.
import * as assert from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Walk up from a starting dir until media/webview.js is found; returns its contents. */
function readWebviewJs(): string {
	let dir = __dirname
	for (let i = 0; i < 8; i++) {
		const candidate = join(dir, 'media', 'webview.js')
		if (existsSync(candidate)) return readFileSync(candidate, 'utf8')
		const parent = dirname(dir)
		if (parent === dir) break
		dir = parent
	}
	throw new Error('Could not locate media/webview.js from ' + __dirname)
}

suite('webview CSP: no inline style mutations', () => {
	const src = readWebviewJs()

	test('does not assign to element.style.* properties', () => {
		// e.g. `foo.style.display = 'block'` — blocked by a strict style-src nonce.
		assert.ok(!/\.style\.[A-Za-z]/.test(src),
			'webview.js must toggle CSS classes, not mutate element.style.* (CSP style-src nonce)')
	})
	test('does not use cssText or a string style attribute', () => {
		assert.ok(!/\.cssText\s*=/.test(src), 'webview.js must not assign cssText')
		assert.ok(!/setAttribute\(\s*['"]style['"]/.test(src), 'webview.js must not setAttribute("style", …)')
	})
	test('uses classList to toggle section visibility', () => {
		assert.ok(/classList\.(add|remove|toggle)\(\s*['"]is-visible['"]/.test(src),
			'section visibility should be controlled by the is-visible class')
	})
})
