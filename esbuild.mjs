// esbuild.mjs — bundles the vf-clamp VS Code extension's own host code into dist/extension.js.
// The font-processing dependency is NOT bundled: @liiift-studio/vf-clamp is ESM and loads its
// WASM Python runtime (@web-alchemy/fonttools → pyodide) from real files on disk via createRequire,
// so it cannot live inside a single JS bundle. It stays external and ships as production
// node_modules in the VSIX (see .vscodeignore). `vscode` is external (provided by the host).
import { build, context } from 'esbuild'

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')

/** Shared esbuild options for extension host bundle. */
const baseOptions = {
	entryPoints: ['src/extension.ts'],
	bundle: true,
	outfile: 'dist/extension.js',
	// vscode is provided by the host; the font runtime ships as node_modules, not bundled.
	external: ['vscode', '@liiift-studio/vf-clamp', '@web-alchemy/fonttools', 'pyodide'],
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
