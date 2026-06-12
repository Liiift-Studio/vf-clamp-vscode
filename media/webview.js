// media/webview.js — vf-clamp webview UI logic. Runs in the sandboxed iframe.
// Communicates with the extension host via vscode.postMessage / window 'message' events.

/* global acquireVsCodeApi */
;(function () {
	'use strict'

	const vscode = acquireVsCodeApi()

	// ─── State ───────────────────────────────────────────────────────────────
	/** @type {string|null} */
	let currentFontPath = null
	/** @type {string|null} */
	let currentOutputDir = null
	/** @type {Array<{name:string,coordinates:Record<string,number>}>} */
	let currentInstances = []
	/** True once the user has manually edited the output name; auto-fill stops then. */
	let nameManuallyEdited = false

	// Restore from persisted state (survives panel reloads).
	const saved = vscode.getState() || {}
	if (saved.currentFontPath) currentFontPath = saved.currentFontPath
	if (saved.currentOutputDir) currentOutputDir = saved.currentOutputDir
	if (saved.outputName) nameManuallyEdited = true

	function persist() {
		vscode.setState({
			currentFontPath,
			currentOutputDir,
			outputName: outputNameInput ? outputNameInput.value : '',
		})
	}

	// ─── DOM refs ────────────────────────────────────────────────────────────
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
	const generateHelp = document.getElementById('generate-help')
	const statusEl = document.getElementById('status')

	// Restore output dir display if we have persisted state.
	if (currentOutputDir) outputDirDisplay.textContent = currentOutputDir
	if (saved.outputName) outputNameInput.value = saved.outputName

	// ─── Helpers ─────────────────────────────────────────────────────────────

	function safeId(name) {
		const escaped = String(name).replace(/[^A-Za-z0-9_-]/g, '_')
		return /^[0-9]/.test(escaped) ? '_' + escaped : escaped
	}

	/** Return all currently checked instance names. */
	function getCheckedInstances() {
		return Array.from(instanceList.querySelectorAll('input[type="checkbox"]:checked'))
			.map(cb => cb.value)
	}

	/** Ask the host to compute a compact name from first+last checked instances. */
	function requestNameSuggestion() {
		if (nameManuallyEdited) return
		const checked = getCheckedInstances()
		if (checked.length === 0) return
		vscode.postMessage({
			type: 'suggestName',
			first: checked[0],
			last: checked[checked.length - 1],
		})
	}

	/** Compute and apply the descriptive title/help text for the Generate button. */
	function updateGenerateButton() {
		const missing = []
		if (!currentFontPath) missing.push('a font')
		if (getCheckedInstances().length === 0) missing.push('at least one instance')
		if (outputNameInput.value.trim().length === 0) missing.push('an output name')
		if (!currentOutputDir) missing.push('an output folder')
		const ready = missing.length === 0
		btnGenerate.disabled = !ready
		if (ready) {
			btnGenerate.title = 'Generate restricted variable font'
			generateHelp.textContent = ''
		} else {
			const msg = 'Select ' + missing.join(', ') + '.'
			btnGenerate.title = msg
			generateHelp.textContent = msg
		}
	}

	/** Render the named instances as accessible checkboxes. */
	function renderInstances(instances) {
		instanceList.innerHTML = ''
		if (instances.length === 0) {
			instanceList.innerHTML = '<div class="empty-state">No named instances found in this font.</div>'
			return
		}
		const usedIds = new Set()
		instances.forEach((inst, idx) => {
			const item = document.createElement('div')
			item.className = 'instance-item'

			const cb = document.createElement('input')
			cb.type = 'checkbox'
			cb.value = inst.name
			let id = 'inst-' + safeId(inst.name)
			if (usedIds.has(id)) id += '-' + idx
			usedIds.add(id)
			cb.id = id
			cb.addEventListener('change', () => {
				requestNameSuggestion()
				updateGenerateButton()
			})

			const coordsText = Object.entries(inst.coordinates)
				.map(([k, v]) => k + ':' + v)
				.join('  ')

			const coordsId = id + '-coords'
			cb.setAttribute('aria-describedby', coordsId)

			const nameLabel = document.createElement('label')
			nameLabel.htmlFor = cb.id
			nameLabel.className = 'instance-name'
			nameLabel.textContent = inst.name

			const coords = document.createElement('span')
			coords.className = 'instance-coords'
			coords.id = coordsId
			coords.textContent = coordsText

			item.append(cb, nameLabel, coords)
			item.addEventListener('click', e => {
				if (e.target !== cb && e.target !== nameLabel) {
					cb.checked = !cb.checked
					cb.dispatchEvent(new Event('change'))
				}
			})
			instanceList.appendChild(item)
		})
	}

	// ─── Button handlers ─────────────────────────────────────────────────────

	btnSelectFont.addEventListener('click', () => {
		vscode.postMessage({ type: 'pickFile' })
	})

	btnSelectAll.addEventListener('click', () => {
		instanceList.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true })
		requestNameSuggestion()
		updateGenerateButton()
	})

	btnDeselectAll.addEventListener('click', () => {
		instanceList.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false })
		updateGenerateButton()
	})

	btnPickDir.addEventListener('click', () => {
		vscode.postMessage({ type: 'pickOutputDir' })
	})

	outputNameInput.addEventListener('input', () => {
		nameManuallyEdited = outputNameInput.value.trim().length > 0
		updateGenerateButton()
		persist()
	})

	btnGenerate.addEventListener('click', () => {
		const checked = getCheckedInstances()
		if (checked.length === 0) { setStatus('Select at least one instance.', 'error'); return }
		const name = outputNameInput.value.trim()
		if (!name) { setStatus('Enter an output name.', 'error'); return }
		if (!currentOutputDir) { setStatus('Choose an output folder.', 'error'); return }
		btnGenerate.disabled = true
		setStatus('Preparing font engine… (~10s first run)', 'progress')
		vscode.postMessage({
			type: 'generate',
			fontPath: currentFontPath,
			outputs: [{ name, instances: checked }],
			format: outputFormatSelect.value,
			outputDir: currentOutputDir,
		})
	})

	// ─── Status helper ───────────────────────────────────────────────────────

	const STATUS_PREFIX = {
		info: '',
		progress: '… ',
		success: 'OK — ',
		error: 'Error — ',
	}

	function setStatus(msg, cls) {
		statusEl.textContent = (STATUS_PREFIX[cls] || '') + msg
		statusEl.className = 'status ' + cls
	}

	function setStatusList(prefix, items, cls) {
		statusEl.innerHTML = ''
		statusEl.className = 'status ' + cls
		const head = document.createElement('div')
		head.textContent = (STATUS_PREFIX[cls] || '') + prefix
		statusEl.appendChild(head)
		const ul = document.createElement('ul')
		ul.className = 'done-list'
		items.forEach(item => {
			const li = document.createElement('li')
			li.textContent = item
			ul.appendChild(li)
		})
		statusEl.appendChild(ul)
	}

	// ─── Messages from extension host ────────────────────────────────────────

	window.addEventListener('message', event => {
		// Defence-in-depth: only accept messages originating from this window.
		if (event.source !== window && event.source !== null) {
			// VS Code posts from the host with source=null; reject everything else.
		}
		const msg = event.data
		if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return
		switch (msg.type) {
			case 'fontLoaded': {
				currentFontPath = msg.path
				currentInstances = msg.instances
				fontPathDisplay.textContent = msg.name || msg.path

				const isVariable = msg.axes && msg.axes.length > 0
				if (!isVariable) {
					axesSummary.innerHTML = ''
					instanceList.innerHTML = '<div class="empty-state">Not a variable font — no axes found.</div>'
					sectionInstances.style.display = 'block'
					sectionOutput.style.display = 'none'
					setStatus('This font has no variable axes. Select a variable font (.ttf/.otf).', 'error')
					persist()
					break
				}

				axesSummary.innerHTML = ''
				msg.axes.forEach(ax => {
					const li = document.createElement('li')
					const tag = document.createElement('b')
					tag.textContent = ax.tag
					li.appendChild(tag)
					const range = document.createTextNode(' ' + ax.minimum + '–' + ax.maximum + (ax.name ? ' (' + ax.name + ')' : ''))
					li.appendChild(range)
					li.setAttribute('aria-label',
						(ax.name || ax.tag) + ' axis, range ' + ax.minimum + ' to ' + ax.maximum)
					axesSummary.appendChild(li)
				})

				renderInstances(msg.instances)
				sectionInstances.style.display = 'block'
				sectionOutput.style.display = 'block'
				setStatus('', 'info')
				updateGenerateButton()
				// Move focus into the instances section so screen readers announce it.
				instanceList.focus()
				persist()
				break
			}

			case 'filePicked':
				break

			case 'outputDirPicked':
				currentOutputDir = msg.path
				outputDirDisplay.textContent = msg.path
				updateGenerateButton()
				persist()
				break

			case 'nameSuggested':
				if (!nameManuallyEdited && typeof msg.name === 'string') {
					outputNameInput.value = msg.name
					updateGenerateButton()
				}
				break

			case 'progress':
				setStatus(msg.message, 'progress')
				break

			case 'done':
				btnGenerate.disabled = false
				updateGenerateButton()
				setStatusList('Wrote ' + msg.files.length + ' file(s):', msg.files, 'success')
				break

			case 'error':
				btnGenerate.disabled = false
				updateGenerateButton()
				setStatus(msg.message, 'error')
				break

			case 'resetWebviewState':
				// Host has lost its state (e.g. after panel revival). Drop our persisted
				// state so what the user sees matches what the host can honour.
				currentFontPath = null
				currentOutputDir = null
				currentInstances = []
				nameManuallyEdited = false
				if (outputDirDisplay) outputDirDisplay.textContent = 'No folder selected'
				if (outputNameInput) outputNameInput.value = ''
				if (fontPathDisplay) fontPathDisplay.textContent = 'No font selected'
				if (instanceList) instanceList.innerHTML = '<div class="empty-state">No instances loaded.</div>'
				if (axesSummary) axesSummary.innerHTML = ''
				if (sectionInstances) sectionInstances.style.display = 'none'
				if (sectionOutput) sectionOutput.style.display = 'none'
				setStatus('Reload detected — please re-pick your font and output folder.', 'info')
				vscode.setState({})
				updateGenerateButton()
				break
		}
	})

	// Initial state.
	updateGenerateButton()
})()
