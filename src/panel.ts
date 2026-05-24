// src/panel.ts — WebviewPanel class for vf-clamp; handles all font processing in the extension host
import * as vscode from 'vscode'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { randomBytes } from 'node:crypto'

// ─── Types mirrored from @liiift-studio/vf-clamp public API ──────────────────

/** A single variable font axis descriptor. */
interface AxisInfo {
	tag: string
	name: string
	minimum: number
	default: number
	maximum: number
}

/** A named instance within the font. */
interface InstanceInfo {
	name: string
	coordinates: Record<string, number>
}

/** One output slot sent from the webview to the extension host. */
interface OutputSpec {
	name: string
	instances: string[]
}

/** Supported output font formats. */
type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2'

// ─── Message shapes (webview → host) ─────────────────────────────────────────

interface LoadFontMsg { type: 'loadFont'; path: string }
interface PickFileMsg { type: 'pickFile' }
interface PickOutputDirMsg { type: 'pickOutputDir' }
interface GenerateMsg {
	type: 'generate'
	fontPath: string
	outputs: OutputSpec[]
	format: FontFormat
	outputDir: string
}

type IncomingMessage = LoadFontMsg | PickFileMsg | PickOutputDirMsg | GenerateMsg

// ─── File extension map ───────────────────────────────────────────────────────

/** Map from format string to file extension. */
const EXT: Record<FontFormat, string> = {
	ttf: 'ttf',
	otf: 'otf',
	woff: 'woff',
	woff2: 'woff2',
}

// ─── VFClampPanel ─────────────────────────────────────────────────────────────

/** Manages a single webview panel for the vf-clamp UI. */
export class VFClampPanel {
	/** The single active panel instance (singleton per editor column). */
	public static currentPanel: VFClampPanel | undefined

	private readonly _panel: vscode.WebviewPanel
	private readonly _extensionUri: vscode.Uri
	private _disposables: vscode.Disposable[] = []

	/** Create or reveal the panel. If fontPath is supplied, pre-load that font. */
	public static createOrShow(extensionUri: vscode.Uri, fontPath?: string): void {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined

		if (VFClampPanel.currentPanel) {
			VFClampPanel.currentPanel._panel.reveal(column)
			if (fontPath) {
				VFClampPanel.currentPanel._loadFont(fontPath)
			}
			return
		}

		const panel = vscode.window.createWebviewPanel(
			'vfClamp',
			'vf-clamp',
			column ?? vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [extensionUri],
				retainContextWhenHidden: true,
			},
		)

		VFClampPanel.currentPanel = new VFClampPanel(panel, extensionUri)

		if (fontPath) {
			VFClampPanel.currentPanel._loadFont(fontPath)
		}
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel
		this._extensionUri = extensionUri

		this._panel.webview.html = this._getHtml()

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

		this._panel.webview.onDidReceiveMessage(
			(message: IncomingMessage) => this._handleMessage(message),
			null,
			this._disposables,
		)
	}

	/** Route incoming messages from the webview to the appropriate handler. */
	private async _handleMessage(message: IncomingMessage): Promise<void> {
		switch (message.type) {
			case 'loadFont':
				await this._loadFont(message.path)
				break
			case 'pickFile':
				await this._pickFile()
				break
			case 'pickOutputDir':
				await this._pickOutputDir()
				break
			case 'generate':
				await this._generate(message)
				break
		}
	}

	/** Load a font file and send axis/instance data to the webview. */
	private async _loadFont(fontPath: string): Promise<void> {
		try {
			const buffer = await readFile(fontPath)
			// Dynamic import required: @liiift-studio/vf-clamp is ESM, extension host is CommonJS
			const { getInstances } = await import('@liiift-studio/vf-clamp')
			const { axes, instances } = await getInstances(buffer)
			this._panel.webview.postMessage({
				type: 'fontLoaded',
				axes,
				instances,
				path: fontPath,
				name: basename(fontPath),
			})
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			this._panel.webview.postMessage({ type: 'error', message })
		}
	}

	/** Show a file picker and send the selected path to the webview. */
	private async _pickFile(): Promise<void> {
		const uris = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: { 'Font files': ['ttf', 'otf'] },
			openLabel: 'Select Font',
		})
		if (uris && uris[0]) {
			this._panel.webview.postMessage({ type: 'filePicked', path: uris[0].fsPath })
			await this._loadFont(uris[0].fsPath)
		}
	}

	/** Show a folder picker and send the selected directory to the webview. */
	private async _pickOutputDir(): Promise<void> {
		const uris = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: 'Select Output Folder',
		})
		if (uris && uris[0]) {
			this._panel.webview.postMessage({ type: 'outputDirPicked', path: uris[0].fsPath })
		}
	}

	/** Run clampFont and write output files to disk. */
	private async _generate(msg: GenerateMsg): Promise<void> {
		try {
			this._panel.webview.postMessage({ type: 'progress', message: 'Warming up Pyodide… (~10s first run)' })

			const buffer = await readFile(msg.fontPath)
			// Dynamic import required: @liiift-studio/vf-clamp is ESM, extension host is CommonJS
			const { clampFont } = await import('@liiift-studio/vf-clamp')

			this._panel.webview.postMessage({ type: 'progress', message: 'Processing font…' })

			const results = await clampFont(buffer, {
				outputs: msg.outputs,
				format: msg.format,
			})

			// Ensure output directory exists before writing
			await mkdir(msg.outputDir, { recursive: true })

			const written: string[] = []
			for (const result of results) {
				const ext = EXT[result.format as FontFormat] ?? result.format
				const outPath = join(msg.outputDir, `${result.name}.${ext}`)
				await writeFile(outPath, result.buffer)
				written.push(outPath)
			}

			this._panel.webview.postMessage({ type: 'done', files: written })
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			this._panel.webview.postMessage({ type: 'error', message })
		}
	}

	/** Build and return the full HTML for the webview. */
	private _getHtml(): string {
		// Generate a fresh nonce for each HTML load — required for a safe script-src CSP
		const nonce = randomBytes(16).toString('base64')
		const webview = this._panel.webview
		const csp = [
			`default-src 'none'`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`script-src 'nonce-${nonce}'`,
		].join('; ')
		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="${csp}" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>vf-clamp</title>
	<style>
		*, *::before, *::after { box-sizing: border-box; }

		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			padding: 20px 24px;
			margin: 0;
			max-width: 640px;
		}

		h1 {
			font-size: 1.1em;
			font-weight: 600;
			margin: 0 0 20px;
			color: var(--vscode-foreground);
			letter-spacing: 0.02em;
		}

		section {
			margin-bottom: 24px;
		}

		label, .label {
			display: block;
			font-size: 0.85em;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.06em;
			color: var(--vscode-descriptionForeground);
			margin-bottom: 6px;
		}

		.font-path {
			font-size: 0.9em;
			color: var(--vscode-foreground);
			margin-bottom: 8px;
			word-break: break-all;
			min-height: 1.4em;
		}

		button {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 5px 12px;
			cursor: pointer;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			border-radius: 2px;
		}

		button:hover {
			background: var(--vscode-button-hoverBackground);
		}

		button:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		button.secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}

		button.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}

		.instance-controls {
			display: flex;
			gap: 8px;
			margin-bottom: 8px;
		}

		.instance-list {
			border: 1px solid var(--vscode-panel-border);
			border-radius: 2px;
			max-height: 240px;
			overflow-y: auto;
			padding: 4px 0;
		}

		.instance-item {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 4px 10px;
			cursor: pointer;
		}

		.instance-item:hover {
			background: var(--vscode-list-hoverBackground);
		}

		.instance-item input[type="checkbox"] {
			cursor: pointer;
			accent-color: var(--vscode-focusBorder);
			width: 14px;
			height: 14px;
			flex-shrink: 0;
		}

		.instance-name {
			font-size: 0.9em;
			flex: 1;
		}

		.instance-coords {
			font-size: 0.78em;
			color: var(--vscode-descriptionForeground);
			font-family: var(--vscode-editor-font-family, monospace);
		}

		.empty-state {
			padding: 12px 10px;
			color: var(--vscode-descriptionForeground);
			font-size: 0.88em;
			font-style: italic;
		}

		.row {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		input[type="text"] {
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border, transparent);
			padding: 4px 8px;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			border-radius: 2px;
			flex: 1;
		}

		input[type="text"]:focus {
			outline: 1px solid var(--vscode-focusBorder);
			border-color: var(--vscode-focusBorder);
		}

		select {
			background: var(--vscode-dropdown-background);
			color: var(--vscode-dropdown-foreground);
			border: 1px solid var(--vscode-dropdown-border, transparent);
			padding: 4px 8px;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			border-radius: 2px;
			cursor: pointer;
		}

		.output-dir-row {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.output-dir-path {
			flex: 1;
			font-size: 0.85em;
			color: var(--vscode-descriptionForeground);
			word-break: break-all;
			min-height: 1.4em;
		}

		.status {
			margin-top: 4px;
			min-height: 1.6em;
			font-size: 0.88em;
			padding: 6px 8px;
			border-radius: 2px;
		}

		.status.info {
			color: var(--vscode-descriptionForeground);
		}

		.status.progress {
			color: var(--vscode-notificationsInfoIcon-foreground, #3794ff);
			background: var(--vscode-inputValidation-infoBackground, transparent);
		}

		.status.success {
			color: var(--vscode-terminal-ansiGreen, #4ec9b0);
		}

		.status.error {
			color: var(--vscode-errorForeground, #f48771);
			background: var(--vscode-inputValidation-errorBackground, transparent);
		}

		.generate-btn {
			width: 100%;
			padding: 8px 12px;
			font-size: 1em;
			font-weight: 600;
			margin-top: 4px;
		}

		#section-instances,
		#section-output {
			display: none;
		}

		.axes-summary {
			margin-bottom: 10px;
			font-size: 0.82em;
			color: var(--vscode-descriptionForeground);
		}

		.axes-summary span {
			margin-right: 12px;
		}

		hr {
			border: none;
			border-top: 1px solid var(--vscode-panel-border);
			margin: 0 0 20px;
		}
	</style>
</head>
<body>
	<h1>vf-clamp</h1>

	<!-- Font file section -->
	<section id="section-font">
		<span class="label">Font File</span>
		<div class="font-path" id="font-path-display">No font selected</div>
		<button id="btn-select-font">Select Font…</button>
	</section>

	<hr />

	<!-- Instances section -->
	<section id="section-instances">
		<span class="label">Named Instances</span>
		<div class="axes-summary" id="axes-summary"></div>
		<div class="instance-controls">
			<button class="secondary" id="btn-select-all">Select All</button>
			<button class="secondary" id="btn-deselect-all">Deselect All</button>
		</div>
		<div class="instance-list" id="instance-list">
			<div class="empty-state">No instances loaded.</div>
		</div>
	</section>

	<!-- Output section -->
	<section id="section-output">
		<hr />
		<div style="margin-bottom:14px">
			<span class="label">Output Name</span>
			<input type="text" id="output-name" placeholder="e.g. Typeface-Light-Bold" />
		</div>
		<div style="margin-bottom:14px">
			<span class="label">Format</span>
			<select id="output-format">
				<option value="ttf">TTF</option>
				<option value="otf">OTF</option>
				<option value="woff">WOFF</option>
				<option value="woff2">WOFF2</option>
			</select>
		</div>
		<div style="margin-bottom:14px">
			<span class="label">Output Folder</span>
			<div class="output-dir-row">
				<div class="output-dir-path" id="output-dir-display">No folder selected</div>
				<button class="secondary" id="btn-pick-dir">Choose…</button>
			</div>
		</div>
		<button class="generate-btn" id="btn-generate" disabled>Generate</button>
		<div class="status info" id="status"></div>
	</section>

	<script nonce="${nonce}">
		// ─── VS Code API ──────────────────────────────────────────────────────
		const vscode = acquireVsCodeApi()

		// ─── State ────────────────────────────────────────────────────────────
		/** @type {string|null} */
		let currentFontPath = null
		/** @type {string|null} */
		let currentOutputDir = null
		/** @type {Array<{name:string,coordinates:Record<string,number>}>} */
		let currentInstances = []

		// ─── DOM refs ─────────────────────────────────────────────────────────
		const fontPathDisplay = document.getElementById('font-path-display')
		const btnSelectFont = document.getElementById('btn-select-font')
		const sectionInstances = document.getElementById('section-instances')
		const sectionOutput = document.getElementById('section-output')
		const axesSummary = document.getElementById('axes-summary')
		const instanceList = document.getElementById('instance-list')
		const btnSelectAll = document.getElementById('btn-select-all')
		const btnDeselectAll = document.getElementById('btn-deselect-all')
		const outputNameInput = document.getElementById('output-name')
		const outputFormatSelect = document.getElementById('output-format')
		const outputDirDisplay = document.getElementById('output-dir-display')
		const btnPickDir = document.getElementById('btn-pick-dir')
		const btnGenerate = document.getElementById('btn-generate')
		const statusEl = document.getElementById('status')

		// ─── Compact name helper ──────────────────────────────────────────────
		/**
		 * Generate a compact name from first and last selected instance names.
		 * Strips shared prefix/suffix tokens and joins with a dash.
		 * @param {string} first
		 * @param {string} last
		 * @returns {string}
		 */
		function compactName(first, last) {
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

		// ─── Instance list rendering ──────────────────────────────────────────

		/** Return all currently checked instance names. */
		function getCheckedInstances() {
			return Array.from(instanceList.querySelectorAll('input[type="checkbox"]:checked'))
				.map(cb => cb.value)
		}

		/** Update the output name field based on selected instances. */
		function updateOutputName() {
			const checked = getCheckedInstances()
			if (checked.length === 0) return
			outputNameInput.value = compactName(checked[0], checked[checked.length - 1])
		}

		/** Enable or disable the Generate button based on form completeness. */
		function updateGenerateButton() {
			const hasFont = !!currentFontPath
			const hasInstances = getCheckedInstances().length > 0
			const hasName = outputNameInput.value.trim().length > 0
			const hasDir = !!currentOutputDir
			btnGenerate.disabled = !(hasFont && hasInstances && hasName && hasDir)
		}

		/**
		 * Render the named instances as a checkbox list.
		 * @param {Array<{name:string,coordinates:Record<string,number>}>} instances
		 */
		function renderInstances(instances) {
			instanceList.innerHTML = ''
			if (instances.length === 0) {
				instanceList.innerHTML = '<div class="empty-state">No named instances found in this font.</div>'
				return
			}
			instances.forEach(inst => {
				const item = document.createElement('div')
				item.className = 'instance-item'

				const cb = document.createElement('input')
				cb.type = 'checkbox'
				cb.value = inst.name
				cb.id = 'inst-' + inst.name.replace(/\s+/g, '-')
				cb.addEventListener('change', () => {
					updateOutputName()
					updateGenerateButton()
				})

				const nameLabel = document.createElement('label')
				nameLabel.htmlFor = cb.id
				nameLabel.className = 'instance-name'
				nameLabel.textContent = inst.name

				const coords = document.createElement('span')
				coords.className = 'instance-coords'
				coords.textContent = Object.entries(inst.coordinates)
					.map(([k, v]) => k + ':' + v)
					.join('  ')

				item.append(cb, nameLabel, coords)
				// Clicking the row toggles the checkbox
				item.addEventListener('click', e => {
					if (e.target !== cb && e.target !== nameLabel) {
						cb.checked = !cb.checked
						cb.dispatchEvent(new Event('change'))
					}
				})
				instanceList.appendChild(item)
			})
		}

		// ─── Button handlers ──────────────────────────────────────────────────

		btnSelectFont.addEventListener('click', () => {
			vscode.postMessage({ type: 'pickFile' })
		})

		btnSelectAll.addEventListener('click', () => {
			instanceList.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true })
			updateOutputName()
			updateGenerateButton()
		})

		btnDeselectAll.addEventListener('click', () => {
			instanceList.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false })
			updateGenerateButton()
		})

		btnPickDir.addEventListener('click', () => {
			vscode.postMessage({ type: 'pickOutputDir' })
		})

		outputNameInput.addEventListener('input', updateGenerateButton)

		btnGenerate.addEventListener('click', () => {
			const checked = getCheckedInstances()
			if (checked.length === 0) {
				setStatus('Select at least one instance.', 'error')
				return
			}
			const name = outputNameInput.value.trim()
			if (!name) {
				setStatus('Enter an output name.', 'error')
				return
			}
			if (!currentOutputDir) {
				setStatus('Choose an output folder.', 'error')
				return
			}
			btnGenerate.disabled = true
			setStatus('Warming up Pyodide… (~10s first run)', 'progress')
			vscode.postMessage({
				type: 'generate',
				fontPath: currentFontPath,
				outputs: [{ name, instances: checked }],
				format: outputFormatSelect.value,
				outputDir: currentOutputDir,
			})
		})

		// ─── Status helper ────────────────────────────────────────────────────

		/**
		 * Display a status message with a given severity class.
		 * @param {string} msg
		 * @param {'info'|'progress'|'success'|'error'} cls
		 */
		function setStatus(msg, cls) {
			statusEl.textContent = msg
			statusEl.className = 'status ' + cls
		}

		// ─── Messages from extension host ─────────────────────────────────────

		window.addEventListener('message', event => {
			const msg = event.data
			switch (msg.type) {
				case 'fontLoaded': {
					currentFontPath = msg.path
					currentInstances = msg.instances
					fontPathDisplay.textContent = msg.name || msg.path

					// Detect static fonts (no axes) — show warning and hide output controls
					const isVariable = msg.axes && msg.axes.length > 0
					if (!isVariable) {
						axesSummary.textContent = ''
						instanceList.innerHTML = '<div class="empty-state">Not a variable font — no axes found.</div>'
						sectionInstances.style.display = 'block'
						sectionOutput.style.display = 'none'
						setStatus('This font has no variable axes. Select a variable font (.ttf/.otf).', 'error')
						break
					}

					// Axes summary
					axesSummary.innerHTML = msg.axes.map(ax =>
						'<span><b>' + ax.tag + '</b> ' +
						ax.minimum + '–' + ax.maximum +
						(ax.name ? ' (' + ax.name + ')' : '') +
						'</span>'
					).join('')

					renderInstances(msg.instances)
					sectionInstances.style.display = 'block'
					sectionOutput.style.display = 'block'
					setStatus('', 'info')
					updateGenerateButton()
					break
				}

				case 'filePicked': {
					// Font load follows automatically from the host — nothing to do in the webview
					break
				}

				case 'outputDirPicked': {
					currentOutputDir = msg.path
					outputDirDisplay.textContent = msg.path
					updateGenerateButton()
					break
				}

				case 'progress': {
					setStatus(msg.message, 'progress')
					break
				}

				case 'done': {
					btnGenerate.disabled = false
					updateGenerateButton()
					const fileList = msg.files.join('\n')
					setStatus('Done:\n' + fileList, 'success')
					break
				}

				case 'error': {
					btnGenerate.disabled = false
					updateGenerateButton()
					setStatus('Error: ' + msg.message, 'error')
					break
				}
			}
		})
	</script>
</body>
</html>`
	}

	/** Dispose the panel and all associated resources. */
	public dispose(): void {
		VFClampPanel.currentPanel = undefined
		this._panel.dispose()
		this._disposables.forEach(d => d.dispose())
		this._disposables = []
	}
}
