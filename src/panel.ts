// src/panel.ts — WebviewPanel class for vf-clamp; handles all font processing in the extension host.
import * as vscode from 'vscode'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

import {
	type IncomingMessage,
	type OutgoingMessage,
	type GenerateMsg,
	type FontFormat,
	type AxisInfo,
	type InstanceInfo,
	FORMAT_REGISTRY,
	isIncomingMessage,
} from './shared/messages.js'
import { compactName } from './util.js'
import { validateOutputName, resolveWithinRoot, sanitizeErrorMessage, safeBasename } from './security.js'
import { getOutputChannel } from './extension.js'

/** Minimum allowed processing timeout (ms), enforced even if user edits settings.json directly. */
const MIN_TIMEOUT_MS = 5_000
/** Maximum number of distinct font paths we will keep in the allow-list. */
const MAX_ALLOWED_FONT_PATHS = 32
/** Maximum length for the panel title font label before truncation. */
const MAX_TITLE_FONT_CHARS = 60

/** Shape of the @liiift-studio/vf-clamp ESM module we depend on. */
interface VfClampModule {
	getInstances(buf: Buffer): Promise<{ axes: AxisInfo[]; instances: InstanceInfo[] }>
	clampFont(
		buf: Buffer,
		opts: { outputs: Array<{ name: string; instances: string[] }>; format: FontFormat },
	): Promise<Array<{ name: string; format: string; buffer: Buffer }>>
}

// Hoisted memoised promise so Pyodide + vf-clamp module load only once per host lifetime.
let vfClampPromise: Promise<VfClampModule> | null = null

/** Lazily load and cache the @liiift-studio/vf-clamp ESM module. */
function loadVfClamp(): Promise<VfClampModule> {
	if (!vfClampPromise) {
		// Use Function('return import(...)') so esbuild/tsc does not downlevel to require().
		vfClampPromise = (new Function(
			'p',
			'return import(p)',
		)('@liiift-studio/vf-clamp') as Promise<VfClampModule>)
		.catch(err => {
			vfClampPromise = null
			throw err
		})
	}
	return vfClampPromise
}

/** Reset the cached vf-clamp module promise. Called from deactivate(). */
export function resetVfClampPromise(): void {
	vfClampPromise = null
}

/** Cached font buffer keyed by absolute path + mtime so we do not re-read on every generate. */
interface BufferCacheEntry {
	path: string
	mtimeMs: number
	buffer: Buffer
}

/**
 * Discriminated panel state. Replaces the implicit conjunction of fields
 * (\_bufferCache, \_lastPickedOutputDir, etc.) with a single typed value.
 */
type PanelState =
	| { kind: 'idle' }
	| { kind: 'fontLoaded'; fontPath: string }
	| { kind: 'generating' }

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

/** Manages the vf-clamp webview panel. */
export class VFClampPanel {
	/** The single active panel instance. */
	public static currentPanel: VFClampPanel | undefined

	/** ViewType used for createWebviewPanel + serializer registration. */
	public static readonly viewType = 'vfClamp'

	private readonly _panel: vscode.WebviewPanel
	private readonly _extensionUri: vscode.Uri
	private _disposables: vscode.Disposable[] = []
	private _disposed = false
	private _bufferCache: BufferCacheEntry | null = null
	private _lastPickedOutputDir: string | null = null
	private _cancelSource: vscode.CancellationTokenSource | null = null
	/** Bounded LRU of paths the user picked via OS dialog (or that activated this panel). */
	private _allowedFontPaths: string[] = []
	/** Authoritative panel state, replacing scattered booleans. */
	private _state: PanelState = { kind: 'idle' }

	/** Create or reveal the panel. If fontPath is supplied, pre-load that font. */
	public static createOrShow(extensionUri: vscode.Uri, fontPath?: string): void {
		const column = vscode.window.activeTextEditor?.viewColumn

		if (VFClampPanel.currentPanel) {
			// Preserve the user's panel column instead of jumping to the active editor's.
			VFClampPanel.currentPanel._panel.reveal(undefined, true)
			if (fontPath) {
				void VFClampPanel.currentPanel._maybeReplaceFont(fontPath)
			}
			return
		}

		const panel = vscode.window.createWebviewPanel(
			VFClampPanel.viewType,
			'vf-clamp',
			column ?? vscode.ViewColumn.One,
			{
				enableScripts: true,
				// Scope local resources to the bundled media/ folder only.
				localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
				retainContextWhenHidden: false,
			},
		)

		VFClampPanel.currentPanel = new VFClampPanel(panel, extensionUri)

		if (fontPath) void VFClampPanel.currentPanel._loadFont(fontPath)
	}

	/** Recreate the panel during VS Code's webview deserialization on reload. */
	public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): void {
		const revived = new VFClampPanel(panel, extensionUri)
		VFClampPanel.currentPanel = revived
		// On revival the host state is empty (no font loaded, no output dir picked),
		// but the webview may have restored stale state from vscode.getState(). Tell
		// the webview to clear its state so the user doesn't see a misleading
		// pre-filled output dir whose pick the host cannot honour.
		revived._postMessage({ type: 'resetWebviewState' })
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel
		this._extensionUri = extensionUri
		this._panel.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
		}
		this._panel.webview.html = this._getHtml()

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables)
		this._panel.webview.onDidReceiveMessage(
			(raw: unknown) => this._handleMessage(raw),
			null,
			this._disposables,
		)
	}

	/** Trigger the panel's file-picker flow (used when openFile is invoked without a Uri). */
	public triggerPickFile(): void {
		void this._pickFile()
	}

	/** Update the panel title to include the active font basename. */
	private _setTitleForFont(fontPath: string): void {
		this._panel.title = formatTitle(fontPath)
	}

	/** Validate and route incoming webview messages. */
	private async _handleMessage(raw: unknown): Promise<void> {
		if (!isIncomingMessage(raw)) {
			getOutputChannel().appendLine(`[warn] Rejected malformed webview message: ${JSON.stringify(raw).slice(0, 200)}`)
			return
		}
		const message: IncomingMessage = raw
		switch (message.type) {
			case 'loadFont':
				// Only allow loading paths that were previously picked through the OS dialog,
				// or that came from the explorer/context command (recorded as last picked).
				if (!this._isAllowedLoadPath(message.path)) {
					this._postError('Refusing to load a path that was not picked by the file dialog.')
					return
				}
				await this._loadFont(message.path)
				return
			case 'pickFile':
				await this._pickFile()
				return
			case 'pickOutputDir':
				await this._pickOutputDir()
				return
			case 'generate':
				// Guard against concurrent generate requests (e.g. double-click before the
				// webview disables the button). Drop the second request entirely.
				if (this._state.kind === 'generating') {
					this._postError('Generate is already in progress.')
					return
				}
				await this._generate(message)
				return
			case 'cancel':
				this._cancelSource?.cancel()
				return
			case 'suggestName':
				this._postMessage({ type: 'nameSuggested', name: compactName(message.first, message.last) })
				return
			default: {
				// Exhaustiveness check — any new message variant must be handled above.
				const _exhaustive: never = message
				void _exhaustive
				return
			}
		}
	}

	/** Record a font path so the webview can later request it via loadFont. Bounded LRU. */
	private _allowPath(p: string): void {
		const abs = resolve(p)
		// Remove any existing entry so we re-insert at the end (most-recent-used).
		const idx = this._allowedFontPaths.indexOf(abs)
		if (idx !== -1) this._allowedFontPaths.splice(idx, 1)
		this._allowedFontPaths.push(abs)
		// Evict oldest entries beyond the cap.
		while (this._allowedFontPaths.length > MAX_ALLOWED_FONT_PATHS) {
			this._allowedFontPaths.shift()
		}
	}

	/** Test whether a path is currently in the allow-list. */
	private _isAllowedLoadPath(p: string): boolean {
		try { return this._allowedFontPaths.includes(resolve(p)) } catch { return false }
	}

	/** Pre-load a font on behalf of the user (called by createOrShow). */
	private async _loadFont(fontPath: string): Promise<void> {
		this._allowPath(fontPath)

		// Trust check — refuse to read files in an untrusted workspace.
		if (!vscode.workspace.isTrusted) {
			this._postError('Workspace is not trusted. Trust the workspace before processing fonts.')
			vscode.window.showWarningMessage(
				'vf-clamp: workspace is not trusted. Click "Manage Workspace Trust" to enable font processing.',
			)
			return
		}

		const config = vscode.workspace.getConfiguration('vf-clamp')
		const maxSize = config.get<number>('maxFontSizeBytes', 200 * 1024 * 1024)

		try {
			const st = await stat(fontPath)
			if (!st.isFile()) throw new Error('Selected path is not a file.')
			if (st.size > maxSize) throw new Error(`Font file is too large (${st.size} bytes; limit ${maxSize}).`)

			const buffer = await readFile(fontPath)
			this._bufferCache = { path: resolve(fontPath), mtimeMs: st.mtimeMs, buffer }

			const vfClamp = await loadVfClamp()
			const { axes, instances } = await vfClamp.getInstances(buffer)
			this._setTitleForFont(fontPath)
			this._state = { kind: 'fontLoaded', fontPath: resolve(fontPath) }
			this._postMessage({
				type: 'fontLoaded',
				axes,
				instances,
				path: fontPath,
				name: basename(fontPath),
			})
		} catch (err) {
			const message = sanitizeErrorMessage(err)
			this._postError(message)
			vscode.window.showErrorMessage(`vf-clamp: failed to load font (${message}).`)
			getOutputChannel().appendLine(`[error] loadFont: ${err instanceof Error ? err.stack : String(err)}`)
		}
	}

	/** Prompt the user before replacing the currently loaded font. */
	private async _maybeReplaceFont(newPath: string): Promise<void> {
		const current = this._bufferCache?.path
		if (!current || resolve(current) === resolve(newPath)) {
			await this._loadFont(newPath)
			return
		}
		const choice = await vscode.window.showWarningMessage(
			`Replace ${safeBasename(current)} with ${safeBasename(newPath)}? Any in-progress selections will be lost.`,
			{ modal: true },
			'Replace', 'Cancel',
		)
		if (choice === 'Replace') await this._loadFont(newPath)
	}

	private async _pickFile(): Promise<void> {
		const uris = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			// All formats the core engine can read as input — fonttools auto-detects the
			// flavor (WOFF/WOFF2 are decompressed on read; brotli ships with Pyodide).
			filters: { 'Variable fonts': ['ttf', 'otf', 'woff', 'woff2'] },
			openLabel: 'Select Font',
		})
		const first = uris?.[0]
		if (first) {
			this._allowPath(first.fsPath)
			this._postMessage({ type: 'filePicked', path: first.fsPath })
			await this._loadFont(first.fsPath)
		}
	}

	private async _pickOutputDir(): Promise<void> {
		const uris = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: 'Select Output Folder',
		})
		const first = uris?.[0]
		if (first) {
			this._lastPickedOutputDir = resolve(first.fsPath)
			this._postMessage({ type: 'outputDirPicked', path: first.fsPath })
		}
	}

	/** Pre-flight checks for generate: trust, output-dir match, name validation, source-path allow-list. */
	private _validateGenerateRequest(msg: GenerateMsg): { ok: false; reason: string } | { ok: true; requestedOutputDir: string } {
		if (!vscode.workspace.isTrusted) {
			return { ok: false, reason: 'Workspace is not trusted.' }
		}
		const requestedOutputDir = resolve(msg.outputDir)
		if (!this._lastPickedOutputDir || requestedOutputDir !== this._lastPickedOutputDir) {
			return { ok: false, reason: 'Output folder mismatch. Pick the output folder again.' }
		}
		for (const out of msg.outputs) {
			const v = validateOutputName(out.name)
			if (!v.ok) {
				return { ok: false, reason: `Invalid output name: ${v.reason}` }
			}
		}
		if (!this._isAllowedLoadPath(msg.fontPath)) {
			return { ok: false, reason: 'Refusing to process a font path that was not picked by the file dialog.' }
		}
		return { ok: true, requestedOutputDir }
	}

	/** Run clampFont with timeout + cancellation race. */
	private async _runClampWithRace(
		buffer: Buffer,
		msg: GenerateMsg,
		timeoutMs: number,
		token: vscode.CancellationToken,
	): Promise<Array<{ name: string; format: string; buffer: Buffer }>> {
		const vfClamp = await loadVfClamp()
		let timer: NodeJS.Timeout | undefined
		try {
			return await Promise.race<Array<{ name: string; format: string; buffer: Buffer }>>([
				vfClamp.clampFont(buffer, { outputs: msg.outputs, format: msg.format }),
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error(`Processing timed out after ${Math.round(timeoutMs / 1000)} s.`)),
						timeoutMs,
					)
				}),
				new Promise<never>((_, reject) => {
					token.onCancellationRequested(() => reject(new Error('Cancelled.')))
				}),
			])
		} finally {
			if (timer) clearTimeout(timer)
		}
	}

	/** Plan output paths and detect collisions. Returns null if any path escapes the root. */
	private _planOutputPaths(
		results: Array<{ name: string; format: string }>,
		requestedFormat: FontFormat,
		requestedOutputDir: string,
	): { plannedPaths: string[]; collisions: string[] } | { escape: string } {
		const plannedPaths: string[] = []
		const collisions: string[] = []
		for (const result of results) {
			const ext = extensionForResult(result.format, requestedFormat)
			const planned = join(requestedOutputDir, `${result.name}.${ext}`)
			const resolved = resolveWithinRoot(requestedOutputDir, planned)
			if (!resolved) return { escape: result.name }
			plannedPaths.push(resolved)
			if (existsSync(resolved)) collisions.push(resolved)
		}
		return { plannedPaths, collisions }
	}

	/** Ask the user (via modal) whether to overwrite collisions. Respects cancellation token. */
	private async _confirmOverwrite(collisions: string[], token: vscode.CancellationToken): Promise<boolean> {
		if (collisions.length === 0) return true
		if (token.isCancellationRequested) return false
		const choice = await vscode.window.showWarningMessage(
			`${collisions.length} file(s) will be overwritten. Continue?`,
			{ modal: true, detail: collisions.map(p => safeBasename(p)).join('\n') },
			'Overwrite', 'Cancel',
		)
		// Re-check cancellation after the modal returns — user may have hit Cancel on
		// the progress notification while the modal was open.
		if (token.isCancellationRequested) return false
		return choice === 'Overwrite'
	}

	private async _generate(msg: GenerateMsg): Promise<void> {
		const validation = this._validateGenerateRequest(msg)
		if (!validation.ok) {
			this._postError(validation.reason)
			return
		}
		const { requestedOutputDir } = validation

		const config = vscode.workspace.getConfiguration('vf-clamp')
		const rawTimeout = config.get<number>('processingTimeoutMs', 120_000)
		// Enforce floor even if the user wrote a lower value directly into settings.json.
		const timeoutMs = Math.max(MIN_TIMEOUT_MS, rawTimeout)

		this._cancelSource?.dispose()
		this._cancelSource = new vscode.CancellationTokenSource()
		const token = this._cancelSource.token
		this._state = { kind: 'generating' }

		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'vf-clamp: generating restricted font…',
					cancellable: true,
				},
				async (progress, progressToken) => {
					progressToken.onCancellationRequested(() => this._cancelSource?.cancel())

					this._postMessage({ type: 'progress', message: 'Preparing font engine… (~10s first run)' })
					progress.report({ message: 'Preparing font engine…' })

					const buffer = await this._getFontBuffer(msg.fontPath)

					this._postMessage({ type: 'progress', message: 'Processing font…' })
					progress.report({ message: 'Processing font…' })

					const results = await this._runClampWithRace(buffer, msg, timeoutMs, token)
					if (token.isCancellationRequested) throw new Error('Cancelled.')

					await mkdir(requestedOutputDir, { recursive: true })

					const plan = this._planOutputPaths(results, msg.format, requestedOutputDir)
					if ('escape' in plan) {
						throw new Error(`Refusing to write outside the chosen folder (${plan.escape}).`)
					}

					const okOverwrite = await this._confirmOverwrite(plan.collisions, token)
					if (!okOverwrite) throw new Error('Cancelled by user.')

					const written: string[] = []
					// Per-output progress reports; writes themselves can overlap.
					await Promise.all(results.map(async (result, idx) => {
						const outPath = plan.plannedPaths[idx]
						if (!outPath) return
						this._postMessage({ type: 'progress', message: `Writing ${basename(outPath)} (${idx + 1}/${results.length})` })
						progress.report({ message: `Writing ${basename(outPath)} (${idx + 1}/${results.length})` })
						await writeFile(outPath, result.buffer)
						written.push(outPath)
					}))

					this._postMessage({ type: 'done', files: written })
					const action = await vscode.window.showInformationMessage(
						`vf-clamp: wrote ${written.length} file(s).`,
						'Reveal in File Explorer',
					)
					if (action && written[0]) {
						await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(written[0]))
					}
				},
			)
		} catch (err) {
			const message = sanitizeErrorMessage(err)
			this._postError(message)
			vscode.window.showErrorMessage(`vf-clamp: ${message}`)
			getOutputChannel().appendLine(`[error] generate: ${err instanceof Error ? err.stack : String(err)}`)
		} finally {
			this._cancelSource?.dispose()
			this._cancelSource = null
			// Return to fontLoaded if we still have a font, else idle.
			if (this._bufferCache) {
				this._state = { kind: 'fontLoaded', fontPath: this._bufferCache.path }
			} else {
				this._state = { kind: 'idle' }
			}
		}
	}

	/** Return the cached font buffer if mtime matches, else read fresh. */
	private async _getFontBuffer(fontPath: string): Promise<Buffer> {
		const abs = resolve(fontPath)
		const st = await stat(abs)
		if (
			this._bufferCache &&
			this._bufferCache.path === abs &&
			this._bufferCache.mtimeMs === st.mtimeMs
		) {
			return this._bufferCache.buffer
		}
		const buffer = await readFile(abs)
		this._bufferCache = { path: abs, mtimeMs: st.mtimeMs, buffer }
		return buffer
	}

	/** Send a typed outgoing message to the webview. */
	private _postMessage(msg: OutgoingMessage): void {
		void this._panel.webview.postMessage(msg)
	}

	/** Send a typed error message to the webview. */
	private _postError(message: string): void {
		this._postMessage({ type: 'error', message })
	}

	/** Build the webview HTML; references external media/ files via asWebviewUri. */
	private _getHtml(): string {
		const nonce = randomBytes(16).toString('base64')
		const webview = this._panel.webview
		const csp = [
			`default-src 'none'`,
			`base-uri 'none'`,
			`form-action 'none'`,
			`frame-ancestors 'none'`,
			`connect-src 'none'`,
			`img-src ${webview.cspSource}`,
			`font-src ${webview.cspSource}`,
			`style-src 'nonce-${nonce}'`,
			`script-src 'nonce-${nonce}'`,
		].join('; ')

		const mediaRoot = vscode.Uri.joinPath(this._extensionUri, 'media')
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'webview.css'))
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'webview.js'))

		// The HTML template lives in media/webview.html and is read at runtime; bundle it for
		// production by inlining via fs.
		const fs = require('node:fs') as typeof import('node:fs')
		const htmlPath = require('node:path').join(this._extensionUri.fsPath, 'media', 'webview.html')
		let html = ''
		try {
			html = fs.readFileSync(htmlPath, 'utf8')
		} catch {
			// Fallback inline shell so the panel never renders blank if media/ is missing.
			html = `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="__CSP__"></head><body><p>vf-clamp UI failed to load (missing media/webview.html).</p></body></html>`
		}
		return html
			.replace(/__CSP__/g, csp)
			.replace(/__NONCE__/g, nonce)
			.replace(/__STYLE_URI__/g, styleUri.toString())
			.replace(/__SCRIPT_URI__/g, scriptUri.toString())
	}

	/** Dispose the panel and all associated resources (idempotent). */
	public dispose(): void {
		if (this._disposed) return
		this._disposed = true
		VFClampPanel.currentPanel = undefined
		try { this._panel.dispose() } catch { /* already disposed */ }
		this._cancelSource?.dispose()
		this._cancelSource = null
		while (this._disposables.length) {
			const d = this._disposables.pop()
			try { d?.dispose() } catch { /* tolerate double-dispose */ }
		}
		this._bufferCache = null
		this._allowedFontPaths.length = 0
		this._state = { kind: 'idle' }
	}
}
