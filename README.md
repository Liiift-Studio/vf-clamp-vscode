# vf-clamp for VS Code

Generate restricted variable fonts from named instance ranges — directly inside VS Code.

A customer who licenses "Light" and "Bold" receives a micro-VF spanning exactly that range, with the font's name table updated to reflect the purchased instances.

Powered by [`@liiift-studio/vf-clamp`](https://www.vfclamp.com) and Pyodide (fonttools running in WASM).

---

## Requirements

- Visual Studio Code **1.85** or newer.
- The extension runs in the local workspace; it requires `extensionKind: workspace` and is not available in virtual workspaces.
- ~200 MB of disk for the bundled Pyodide / fonttools runtime, loaded lazily on first generate.

## Install

**From the marketplace** — open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:

```
>ext install liiift-studio.vf-clamp
```

(The leading `>` enters Command Palette mode; this is *not* a terminal command.) You can also search for **vf-clamp** in the Extensions view.

**From a VSIX (local build):**

```bash
npm install
npm run package
npx vsce package
code --install-extension vf-clamp-*.vsix
```

---

## Commands

| Command | Title in palette |
|---------|------------------|
| `vf-clamp.openPanel` | **vf-clamp: Generate Restricted Variable Fonts** |
| `vf-clamp.openFile` | **vf-clamp: Open Font File in vf-clamp** |

The extension contributes no default keybindings. Bind either command via *Preferences → Keyboard Shortcuts* (`keybindings.json`) if you want a hotkey.

## Usage

**Option 1 — Right-click in Explorer:** Right-click any `.ttf` / `.otf` file in the file explorer and choose **vf-clamp: Open Font File**. The panel opens pre-loaded with that font.

**Option 2 — Command Palette:** Open the Command Palette and run **vf-clamp: Generate Restricted Variable Fonts**. Then use the **Select Font** button inside the panel.

**In the panel:**

1. Select a variable font file (`.ttf` or `.otf`)
2. Check the named instances you want to include
3. Confirm the auto-suggested output name (or type your own)
4. Choose a format: TTF, OTF, WOFF, or WOFF2
5. Choose an output folder
6. Click **Generate**

> Screenshots and a workflow GIF coming with the first marketplace release.

---

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `vf-clamp.processingTimeoutMs` | `120000` | Max wait before aborting font processing. |
| `vf-clamp.defaultFormat` | `ttf` | Preselected output format. |
| `vf-clamp.defaultOutputDir` | `""` | Optional default output directory. |
| `vf-clamp.maxFontSizeBytes` | `209715200` | Maximum accepted font file size. |

---

## How It Works

The extension calls `@liiift-studio/vf-clamp`, which uses fonttools running inside Pyodide (Python WASM). The font is:

1. Clamped to the axis ranges covered by the selected named instances
2. Renamed in the name table (family name, PostScript name) to reflect the range
3. Written to your chosen output folder

**First run:** the font engine initialises on first use — expect ~10–20 seconds. Subsequent runs in the same session are ~1–2 seconds. Long generates can be cancelled from the native progress notification.

---

## Known Issues

- Only variable fonts (`.ttf` / `.otf`) with named instances are supported as input. Static fonts return an empty instance list.
- The font engine stays resident for the lifetime of the VS Code window once loaded.
- Files in untrusted workspaces are not processed until you trust the workspace.

## Notes

- All processing happens in the VS Code extension host — your font data never leaves your machine.
- Output filenames are validated; path separators, `..`, and NUL bytes are rejected.

---

## License

[MIT](./LICENSE).

## Links

- [vfclamp.com](https://www.vfclamp.com)
- [`@liiift-studio/vf-clamp` on npm](https://www.npmjs.com/package/@liiift-studio/vf-clamp)
- [GitHub](https://github.com/Liiift-Studio/vf-clamp-vscode)
- [Issue tracker](https://github.com/Liiift-Studio/vf-clamp-vscode/issues)
