// src/panel-helpers.ts — pure, vscode-free helpers for the panel, unit-testable in isolation.
import { safeBasename } from './security.js'
import { type FontFormat, FORMAT_REGISTRY } from './shared/messages.js'

/** Maximum length for the panel title font label before truncation. */
export const MAX_TITLE_FONT_CHARS = 60

/** Format a font path into a panel title, truncating very long basenames. */
export function formatTitle(fontPath: string): string {
	const name = safeBasename(fontPath)
	const trimmed = name.length > MAX_TITLE_FONT_CHARS
		? name.slice(0, MAX_TITLE_FONT_CHARS - 1) + '…'
		: name
	return `vf-clamp · ${trimmed}`
}

/** Return the file extension for a result, falling back to the requested output format. */
export function extensionForResult(resultFormat: string | undefined, requestedFormat: FontFormat): string {
	if (resultFormat && resultFormat in FORMAT_REGISTRY) {
		return FORMAT_REGISTRY[resultFormat as FontFormat].extension
	}
	return FORMAT_REGISTRY[requestedFormat].extension
}
