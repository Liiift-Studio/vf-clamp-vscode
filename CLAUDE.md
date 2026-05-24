# vf-clamp-vscode — Claude Code Configuration

## Inherited Context

This is a plugin submodule of `@liiift-studio/vf-clamp`. When working inside the
vf-clamp parent repo checkout, Claude Code will also load `vf-clamp/CLAUDE.md` which
defines the core purpose, API, name table patching approach, and shared conventions.

## What This Is

A VS Code extension that generates restricted variable fonts from named instance ranges.
Opens a panel with an interactive UI — select a font file, choose instances, click Generate.

## Tech Stack

- TypeScript (extension host, CommonJS for VS Code compatibility)
- VS Code Extension API (vscode, WebviewPanel, commands)
- `@liiift-studio/vf-clamp` npm package (called from extension host, NOT from webview)
- Vanilla HTML/CSS/JS webview (no React, no bundler for the webview)

## Critical: Extension Host vs Webview

- `@liiift-studio/vf-clamp` runs ONLY in the extension host (Node.js process)
- The webview is sandboxed — it cannot import npm packages directly
- All font processing happens in panel.ts via message passing
- Webview sends `{ type: 'generate', ... }` → extension host calls clampFont → responds with `{ type: 'done', files }`
- `@liiift-studio/vf-clamp` is ESM; extension host is CommonJS — always use dynamic `import()` to load it

## Key Files

| File | Purpose |
|------|---------|
| `src/extension.ts` | Extension entry, command registration |
| `src/panel.ts` | WebviewPanel class, message handling, clampFont calls |

The webview HTML is inlined as a template literal inside `panel.ts` (`_getHtml()` method) — there is no separate `webview.html` file.

## Message Protocol (webview ↔ host)

### Webview → Host
| `type` | Payload | Description |
|--------|---------|-------------|
| `loadFont` | `{ path }` | Load font at path, return axes + instances |
| `pickFile` | — | Show OS file picker, then auto-load |
| `pickOutputDir` | — | Show OS folder picker |
| `generate` | `{ fontPath, outputs, format, outputDir }` | Run clampFont, write files |

### Host → Webview
| `type` | Payload | Description |
|--------|---------|-------------|
| `fontLoaded` | `{ axes, instances, path, name }` | Font loaded successfully |
| `filePicked` | `{ path }` | File selected (load follows automatically) |
| `outputDirPicked` | `{ path }` | Folder selected |
| `progress` | `{ message }` | Status update during generate |
| `done` | `{ files }` | Generation complete, list of written paths |
| `error` | `{ message }` | Any error |

## Coding Standards

- Tabs for indentation
- One-line summary at top of each file
- Comment every function
- ALL_CAPS for constants

## Build

```bash
npm install
npm run compile   # tsc -p ./
npm run watch     # tsc -watch -p ./
npm run lint      # tsc --noEmit
```

Output goes to `dist/`. The VS Code extension main is `./dist/extension.js`.

## Packaging

```bash
npx vsce package
```

Produces a `.vsix` file. Install locally with `code --install-extension vf-clamp-*.vsix`.

## Engineers to Contact If Stuck

- VS Code extension API: https://code.visualstudio.com/api
- vf-clamp / fonttools: Cosimo Lupo (@anthrotype), Behdad Esfahbod (@behdad)
- UX questions: Frank Grießhammer (@frankrolf), Yanone (@yanone)
