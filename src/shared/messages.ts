// src/shared/messages.ts — typed discriminated-union message contract shared by host and webview.

/** A single variable font axis descriptor. */
export interface AxisInfo {
	tag: string
	name: string
	minimum: number
	default: number
	maximum: number
}

/** A named instance within the font. */
export interface InstanceInfo {
	name: string
	coordinates: Record<string, number>
}

/** One output slot sent from the webview to the extension host. */
export interface OutputSpec {
	name: string
	instances: string[]
}

/** Supported output font formats. */
export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2'

// ─── Webview → Host messages ─────────────────────────────────────────────────

export interface LoadFontMsg { type: 'loadFont'; path: string }
export interface PickFileMsg { type: 'pickFile' }
export interface PickOutputDirMsg { type: 'pickOutputDir' }
export interface GenerateMsg {
	type: 'generate'
	fontPath: string
	outputs: OutputSpec[]
	format: FontFormat
	outputDir: string
}
export interface CancelMsg { type: 'cancel' }
export interface SuggestNameMsg { type: 'suggestName'; first: string; last: string }

export type IncomingMessage =
	| LoadFontMsg
	| PickFileMsg
	| PickOutputDirMsg
	| GenerateMsg
	| CancelMsg
	| SuggestNameMsg

// ─── Host → Webview messages ─────────────────────────────────────────────────

export interface FontLoadedMsg {
	type: 'fontLoaded'
	axes: AxisInfo[]
	instances: InstanceInfo[]
	path: string
	name: string
}
export interface FilePickedMsg { type: 'filePicked'; path: string }
export interface OutputDirPickedMsg { type: 'outputDirPicked'; path: string }
export interface ProgressMsg { type: 'progress'; message: string }
export interface DoneMsg { type: 'done'; files: string[] }
export interface ErrorMsg { type: 'error'; message: string }
export interface NameSuggestedMsg { type: 'nameSuggested'; name: string }

export type OutgoingMessage =
	| FontLoadedMsg
	| FilePickedMsg
	| OutputDirPickedMsg
	| ProgressMsg
	| DoneMsg
	| ErrorMsg
	| NameSuggestedMsg

// ─── Runtime validation ──────────────────────────────────────────────────────

/** Type guard verifying that an unknown value matches the IncomingMessage shape. */
export function isIncomingMessage(value: unknown): value is IncomingMessage {
	if (!value || typeof value !== 'object') return false
	const v = value as { type?: unknown }
	if (typeof v.type !== 'string') return false
	switch (v.type) {
		case 'pickFile':
		case 'pickOutputDir':
		case 'cancel':
			return true
		case 'loadFont': {
			const m = v as Partial<LoadFontMsg>
			return typeof m.path === 'string' && m.path.length > 0
		}
		case 'suggestName': {
			const m = v as Partial<SuggestNameMsg>
			return typeof m.first === 'string' && typeof m.last === 'string'
		}
		case 'generate': {
			const m = v as Partial<GenerateMsg>
			if (typeof m.fontPath !== 'string' || m.fontPath.length === 0) return false
			if (typeof m.outputDir !== 'string' || m.outputDir.length === 0) return false
			if (!isFontFormat(m.format)) return false
			if (!Array.isArray(m.outputs) || m.outputs.length === 0) return false
			for (const o of m.outputs) {
				if (!o || typeof o !== 'object') return false
				if (typeof o.name !== 'string' || o.name.length === 0) return false
				if (!Array.isArray(o.instances) || o.instances.length === 0) return false
				for (const inst of o.instances) {
					if (typeof inst !== 'string') return false
				}
			}
			return true
		}
		default:
			return false
	}
}

/** Type guard for a supported font format string. */
export function isFontFormat(value: unknown): value is FontFormat {
	return value === 'ttf' || value === 'otf' || value === 'woff' || value === 'woff2'
}

/** File extension to use for each supported format. */
export const FORMAT_EXT: Record<FontFormat, string> = {
	ttf: 'ttf',
	otf: 'otf',
	woff: 'woff',
	woff2: 'woff2',
}
