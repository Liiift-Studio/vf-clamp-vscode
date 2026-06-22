# Changelog

All notable changes to the **vf-clamp** VS Code extension are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.4] — 2026-06-22

### Fixed
- **Bundled `@liiift-studio/vf-clamp` core upgraded 2.0.1 → 2.1.4**, picking up the
  upstream font-table fixes that were previously inherited as open issues. The VSIX
  was still pinning core 2.0.1 despite the `^2.0.1` range, so these fixes were not
  actually shipping. Now resolved in generated fonts:
  - nameID 2 (Subfamily) reset to `Regular` and nameID 3 (Unique ID) regenerated;
    nameID 4 (Full name) no longer hardcoded (#69).
  - STAT Format 1/2/3/4 records and LinkedValue references that point at a pruned
    axis are now removed/remapped (#70).
  - OS/2 `usWeightClass`/`fsSelection` and `head.macStyle` updated to the new wght
    default for ranged outputs (#71).

## [0.2.3] — 2026-06-22

### Fixed
- **Missing unit-test file silently skipped.** `test:unit` referenced
  `panel-helpers.test.js` which never existed, so `formatTitle` and
  `extensionForResult` shipped with no coverage. The two pure helpers now live in
  `src/panel-helpers.ts` (re-exported from `panel.ts`) and have a real test file
  exercising long basenames, RTL characters, and format-extension fallback (#76).

### Changed
- **Webview section visibility is now class-driven, not inline-style-driven.** The
  six `style.display` mutations on the instances/output sections are replaced with
  `.is-visible` `classList` toggles so a strict CSP `style-src` nonce cannot block
  them. A guard test (`webview-csp.test.js`) fails if inline style mutations return (#81).
- **README** gained a *Try it live* section linking the [vfclamp.com](https://vfclamp.com)
  interactive web demo, which runs the same core engine in the browser.

## [0.2.2] — 2026-06-17

### Fixed
- **Extension failed to load fonts** with `Cannot find package '@liiift-studio/vf-clamp'`.
  The dependency was hidden from esbuild (via the `new Function('return import(p)')`
  loader) so it was never bundled, while `.vscodeignore` excluded all of `node_modules/`
  — so the runtime module shipped neither bundled nor on disk. The font runtime
  (`@liiift-studio/vf-clamp` → `@web-alchemy/fonttools` → `pyodide`) cannot be bundled
  (it loads WASM/Python assets from real files on disk), so it is now marked `external`
  in esbuild and the production `node_modules` subtree ships in the VSIX (~15 MB).

### Changed
- Input now accepts web font formats. The file picker and the Explorer right-click
  menu match `.ttf`, `.otf`, `.woff`, and `.woff2` — the core engine already reads all
  four (fonttools decompresses WOFF/WOFF2 on read).

## [0.2.1] — 2026-06-11

Hardening pass from the cross-apply deep-review.

### Added
- `FORMAT_REGISTRY` in `src/shared/messages.ts` — single source of truth
  for supported output formats (extension + display label) so adding a
  format touches one structure instead of several call sites.
- `ResetWebviewStateMsg` so the host can ask the webview to clear any
  cached selection when the underlying font changes.
- Defensive constants in `panel.ts`: `MIN_TIMEOUT_MS`, `MAX_ALLOWED_FONT_PATHS`,
  and `MAX_TITLE_FONT_CHARS` — enforced even when the user edits
  `settings.json` directly.
- `resetVfClampPromise()` so `deactivate()` can drop the cached module
  promise and let GC reclaim the Pyodide runtime.

### Changed
- `FORMAT_EXT` kept as a thin compatibility shim; new code reads
  `FORMAT_REGISTRY[fmt].extension`.
- `panel.ts` resolves paths without an unused `dirname` import.

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
