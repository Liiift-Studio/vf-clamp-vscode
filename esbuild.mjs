// esbuild.mjs — bundles the vf-clamp VS Code extension into a single dist/extension.js
// Bundles all dependencies (including @liiift-studio/vf-clamp) so node_modules/ does not
// need to ship in the VSIX. Only `vscode` is external (provided by the runtime host).
import { build, context } from 'esbuild'

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')

/** Shared esbuild options for extension host bundle. */
const baseOptions = {
	entryPoints: ['src/extension.ts'],
	bundle: true,
	outfile: 'dist/extension.js',
	external: ['vscode'],
	format: 'cjs',
	platform: 'node',
	target: 'node18',
	sourcemap: !production,
	minify: production,
	logLevel: 'info',
	// pyodide / fonttools may reference node:* protocol imports — keep them external-stable.
	mainFields: ['module', 'main'],
}

if (watch) {
	const ctx = await context(baseOptions)
	await ctx.watch()
	console.log('Watching for changes…')
} else {
	await build(baseOptions)
	console.log(production ? 'Built production bundle.' : 'Built development bundle.')
}
