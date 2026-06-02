// src/security.ts — path safety helpers and error sanitisation for vf-clamp host.
import { resolve, sep, basename } from 'node:path'

/** Result of validating a candidate output filename. */
export interface NameValidation {
	ok: boolean
	reason?: string
	safe?: string
}

/**
 * Validate an output filename — reject path separators, null bytes, parent traversal,
 * empty/whitespace-only names, and overly long names.
 */
export function validateOutputName(name: unknown): NameValidation {
	if (typeof name !== 'string') return { ok: false, reason: 'Name must be a string.' }
	const trimmed = name.trim()
	if (trimmed.length === 0) return { ok: false, reason: 'Name cannot be empty.' }
	if (trimmed.length > 200) return { ok: false, reason: 'Name is too long (max 200 chars).' }
	if (trimmed.includes('\0')) return { ok: false, reason: 'Name contains a NUL byte.' }
	if (trimmed.includes('/') || trimmed.includes('\\')) return { ok: false, reason: 'Name cannot contain path separators.' }
	if (trimmed === '.' || trimmed === '..') return { ok: false, reason: 'Name cannot be . or ..' }
	if (trimmed.split(/[./\\]/).some(part => part === '..')) return { ok: false, reason: 'Name cannot contain ..' }
	return { ok: true, safe: trimmed }
}

/**
 * Resolve a candidate path against an allowed root and confirm it does not escape.
 * Returns the absolute resolved path if it is inside the root, otherwise null.
 */
export function resolveWithinRoot(root: string, candidate: string): string | null {
	const absRoot = resolve(root)
	const absCandidate = resolve(absRoot, candidate)
	const rootWithSep = absRoot.endsWith(sep) ? absRoot : absRoot + sep
	if (absCandidate !== absRoot && !absCandidate.startsWith(rootWithSep)) return null
	return absCandidate
}

/**
 * Strip absolute filesystem paths and other potentially sensitive data from an error
 * message before showing it to the webview / user.
 */
export function sanitizeErrorMessage(err: unknown): string {
	const raw = err instanceof Error ? err.message : String(err)
	// Drop absolute POSIX and Windows paths inside quoted segments.
	let cleaned = raw.replace(/'(?:\/|[A-Za-z]:\\)[^']*'/g, "'<path>'")
	cleaned = cleaned.replace(/"(?:\/|[A-Za-z]:\\)[^"]*"/g, '"<path>"')
	// Common file IO error: keep the errno code and a generic noun, drop the path.
	cleaned = cleaned.replace(/(ENOENT|EACCES|EISDIR|ENOTDIR|EPERM|EBUSY|EMFILE):[^,]*,\s*[a-z]+\s+'[^']*'/gi,
		(_, code) => `${code}: filesystem error`)
	return cleaned.length > 500 ? cleaned.slice(0, 500) + '…' : cleaned
}

/** Human-readable basename for status messages, never exposing the full path. */
export function safeBasename(p: string): string {
	try { return basename(p) } catch { return '<unknown>' }
}
