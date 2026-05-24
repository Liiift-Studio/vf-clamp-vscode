# vf-clamp for VS Code

Generate restricted variable fonts from named instance ranges — directly inside VS Code.

A customer who licenses "Light" and "Bold" receives a micro-VF spanning exactly that range, with the font's name table updated to reflect the purchased instances.

Powered by [`@liiift-studio/vf-clamp`](https://www.vfclamp.com) and Pyodide (fonttools running in WASM).

---

## Install

**From the marketplace:**

Search for `vf-clamp` in the VS Code Extensions panel, or install via:

```
ext install liiift-studio.vf-clamp
```

**From a VSIX (local build):**

```bash
npm install
npm run compile
npx vsce package
code --install-extension vf-clamp-*.vsix
```

---

## Usage

**Option 1 — Right-click in Explorer:**

Right-click any `.ttf` or `.otf` file in the file explorer and choose **vf-clamp: Open Font File**. The panel opens pre-loaded with that font.

**Option 2 — Command Palette:**

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:

```
vf-clamp: Generate Restricted Variable Fonts
```

Then use the **Select Font…** button inside the panel.

**In the panel:**

1. Select a variable font file (`.ttf` or `.otf`)
2. Check the named instances you want to include
3. Enter an output name (auto-filled from your selection)
4. Choose a format: TTF, OTF, WOFF, or WOFF2
5. Choose an output folder
6. Click **Generate**

---

## How It Works

The extension calls `@liiift-studio/vf-clamp`, which uses fonttools running inside Pyodide (Python WASM). The font is:

1. Clamped to the axis ranges covered by the selected named instances
2. Renamed in the name table (family name, PostScript name) to reflect the range
3. Written to your chosen output folder

**First run:** Pyodide initialises on first use — expect ~10–20 seconds. Subsequent runs in the same session are ~1–2 seconds.

---

## Notes

- Only variable fonts (`.ttf` / `.otf`) are supported as input
- The font must contain named instances; static fonts will return an empty instance list
- All processing happens in the VS Code extension host — your font data never leaves your machine

---

## Links

- [vfclamp.com](https://www.vfclamp.com)
- [`@liiift-studio/vf-clamp` on npm](https://www.npmjs.com/package/@liiift-studio/vf-clamp)
- [GitHub](https://github.com/Liiift-Studio/vf-clamp-vscode)
