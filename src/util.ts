// src/util.ts — small utility functions shared by extension host code.

/**
 * Generate a compact name from first and last selected instance names.
 * Strips shared prefix/suffix tokens and joins the divergent middles with a dash.
 * Mirrors @liiift-studio/vf-clamp src/core/utils.ts compactName(); kept in-extension
 * because the webview cannot import the npm package and we now compute the suggested
 * name in the host instead.
 */
export function compactName(first: string, last: string): string {
	if (first === last) return first
	const fw = first.split(' ')
	const lw = last.split(' ')
	let prefixLen = 0
	while (
		prefixLen < fw.length &&
		prefixLen < lw.length &&
		fw[prefixLen] === lw[prefixLen]
	) prefixLen++
	let suffixLen = 0
	while (
		suffixLen < fw.length - prefixLen &&
		suffixLen < lw.length - prefixLen &&
		fw[fw.length - 1 - suffixLen] === lw[lw.length - 1 - suffixLen]
	) suffixLen++
	const prefix = fw.slice(0, prefixLen).join(' ')
	const a = fw.slice(prefixLen, fw.length - (suffixLen || 0)).join(' ')
	const b = lw.slice(prefixLen, lw.length - (suffixLen || 0)).join(' ')
	const suffix = suffixLen > 0 ? fw.slice(fw.length - suffixLen).join(' ') : ''
	const middle = a && b ? a + '-' + b : (a || b)
	return [prefix, middle, suffix].filter(Boolean).join(' ')
}

/**
 * Produce a safe DOM-id fragment from an arbitrary instance name.
 * Replaces any character outside [A-Za-z0-9_-] with `_` and prefixes if the result
 * would start with a digit, so the result is always a valid HTML id.
 */
export function safeId(name: string): string {
	const escaped = name.replace(/[^A-Za-z0-9_-]/g, '_')
	return /^[0-9]/.test(escaped) ? '_' + escaped : escaped
}
