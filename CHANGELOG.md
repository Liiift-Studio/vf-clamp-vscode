# Changelog

All notable changes to the **vf-clamp** VS Code extension are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-06-01

### Added
- esbuild bundler so the published VSIX no longer needs to ship `node_modules/`.
- Untrusted-workspace gating and explicit `extensionKind` declaration.
- Webview lifted out of the host module into `media/webview.{html,css,js}`.
- Typed message contract in `src/shared/messages.ts` with runtime validation.
- Mocha + `@vscode/test-electron` integration tests and unit tests for path safety, name validation, message validation, panel lifecycle, and CSP nonce parity.
- `contributes.configuration` for processing timeout, default format, default output directory, and max font size.
- Native progress notification with cancellation token, alongside in-panel status.
- Overwrite confirmation before writing files that already exist.
- Information toast on success with "Reveal in File Explorer" action.
- Webview accessibility: `role="status" aria-live`, `<main>`/`<section>` landmarks, fieldset semantics for the instance list, labelled controls, and keyboard-focusable scroll region.
- Shared `OutputChannel` for diagnostic logs.

### Changed
- `module`/`moduleResolution` set to `Node16` so dynamic `import()` is preserved.
- `compactName` is computed in the host and pushed to the webview via a `nameSuggested` message; the duplicate webview-side implementation is gone.
- Explorer context menu group moved out of `navigation` into `7_modification` and now matches `.TTF/.OTF` case-insensitively.
- File picker filter narrowed to the actually-supported `ttf` / `otf` inputs.
- `retainContextWhenHidden` disabled in favour of `vscode.setState` persistence.
- User-facing copy says "font engine" rather than "Pyodide".

### Security
- Output filenames are validated for path separators, NUL bytes, parent traversal, and length.
- Generate validates that `outputDir` matches the last picked folder, and that source paths were previously picked through a dialog.
- Error messages are sanitised before being surfaced to the webview.

### Removed
- The identity `EXT` map; the canonical `FORMAT_EXT` lives in `shared/messages.ts`.

## [0.1.0] — Initial release
- Generate restricted variable fonts from named instance ranges.
- Webview panel with file picker, instance list, output format selection.
