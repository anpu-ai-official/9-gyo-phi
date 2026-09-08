# Product audit — 2026-09-06–07

## God-tier reading upgrade — 2026-09-08

- Added native URL import for public web documents and local `file:///` sources. The loader avoids browser CORS restrictions, follows at most five validated redirects, rejects credential-bearing/private-network targets, enforces a 45-second/100 MB ceiling, preserves raw source bytes, and records source provenance for offline listening and backups.
- Exercised `file:///Users/user/Desktop/agentic-evals-course/01-foundations.html` in the final packaged app: macOS protected-folder access completed, article extraction removed search/navigation controls, 1,720 words became 104 passages, and bundled Kokoro advanced playback. A public `https://example.com` import resolved through macOS-native TLS, retained the page title and hostname, produced three passages, and played through the native UI.
- Added Docling as the preferred local semantic parser while retaining PDF.js for immediate rendering and fallback extraction.
- Verified Docling against its nine-page technical report: 121 ordered segments with headings, lists, tables, captions, code, footnotes, and normalized page coordinates in 21.5 seconds in the development runtime.
- Advanced PDF analysis now runs in resumable 12-page background batches; fast reading remains available immediately and completed semantic output is swapped only while playback is idle.
- Added real EPUB, HTML, and Markdown import, semantic reader styling, original-source persistence/export/backup, and HTML furniture exclusion. Browser UI imports and EPUB Kokoro playback were exercised through computer use.
- Added word-level PDF hit targets. Clicking a word trims only the first passage and continuous playback resumes with full later passages; advanced Docling blocks inherit matching PDF.js word geometry.
- Added one-passage neural prefetch to synthesize the next Kokoro/MLX passage while current audio plays.
- Qwen narration now uses concise one-sentence prompting, extracts only the first complete sentence, retries incomplete generations, and no longer treats semicolon removal as a successful transformation. Common static assertions use a deterministic faithful rule.
- Current automated result: 40 frontend tests and 75 Python tests passed; ESLint, Prettier, Rust Clippy, Python compilation, and diff checks were clean.

## Baseline

Tested the original UI at http://127.0.0.1:8766 through computer-use. The repository is not a Git checkout; the original frontend is preserved in work/index.original.html.

| Severity | Finding                                                                            | Evidence                                                                                             | Resolution                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Critical | Neural model initializes on startup and blocks interaction                         | Initial status stayed “Loading Kokoro”; playback caused a 22-second browser snapshot timeout         | Fixed: lazy model loading and inference in a worker; responsive cancellation verified                                           |
| Critical | Stop can race an awaited synthesis, allowing late audio to start                   | Playback functions share mutable global abort controller and do not validate generation after awaits | Fixed: generation tokens, per-session cancellation, worker termination; late native/browser results covered by regression tests |
| High     | Scratchpad has no persistence or undo for Clear/Verbalize                          | Clear removed sample immediately; code has no storage                                                | Fixed: IndexedDB autosave, undo/redo, recoverable library deletion                                                              |
| High     | No library, saved reading position, or document replacement toolbar                | Imported sample is 120 pages; only initial drop zone can open files                                  | Fixed: persistent library, progress, notes, favorites, import toolbar and backups                                               |
| High     | Modal Escape dismissal and focus containment absent                                | Escape left Model Manager open                                                                       | Fixed: native dialog semantics; keyboard loop, Escape and focus restoration exercised                                           |
| High     | Model download/delete buttons call missing functions                               | onclick handlers refer to undefined downloadModel/deleteModel/cancelActiveDownload                   | Replaced: working catalog/download/cancel/retry UI; no unsupported delete/switch controls; active model deletion blocked by API |
| High     | “LLM Verbalize” replaces whole draft even when selection exists                    | Tested sample transformation; inspected replacement assignment                                       | Fixed: selection-aware local rules with undo; surrounding text preserved                                                        |
| High     | Backend speech consumes only first NDJSON audio event                              | synthesizeAudio returns inside first event iteration                                                 | Fixed: all NDJSON events decoded and joined; Python pipeline chunks also merged with token time offsets                         |
| Medium   | Inaccurate engine and product claims                                               | “zero RAM/disk footprint”, “<15 MB”, “LLM ON” despite rules; shipped voices alone are 27 MB          | Fixed: truthful local rules/engine/download/export descriptions and documented requirements                                     |
| Medium   | PDF zoom recreates every page and all hit targets                                  | createPageShells called on each zoom; 2,737 sample segments                                          | Fixed: active-page PDF rendering and bounded text/passages; PDF bytes separated from metadata                                   |
| Medium   | Narrow-window layout has fixed sidebar/player widths                               | Source uses 320 px sidebar, 720 px page, fixed player                                                | Fixed: responsive navigation, companion and player; 390–1440 px browser layouts inspected                                       |
| Medium   | Empty audio input reports error but oversized/corrupt imports lack safe validation | Empty synthesis tested; loadPdfFile uses blocking alert and no size guard                            | Fixed: validated limits, per-file import failures, recovery dialogs and non-blocking toasts                                     |
| Medium   | Accessibility gaps                                                                 | Unlabelled selects/close button, no modal semantics, no reduced-motion handling                      | Fixed: labeled controls, focus styles, skip link, native dialogs, reduced-motion CSS                                            |
| Medium   | Tests require one developer's cached models and can download real models           | Python suite code inspection                                                                         | Fixed: real audio tests skip uncached models; download lifecycle uses a stub worker                                             |
| Medium   | No README or reproducible frontend checks                                          | Repository inventory                                                                                 | Fixed: setup, packaging, changelog, 27 frontend regressions, strict lint/format/Rust checks                                     |

## Baseline paths exercised

Reader and Scratchpad navigation; sample PDF import; zoom in/out; narration toggle; empty synthesis; sample code; verbalization; Clear; Model Manager open/close; Escape; playback attempt. Browser neural work stalled the remaining baseline playback checks. The replacement was tested with the additional edge cases below.

## Architecture

Original: one 3,051-line HTML file with inline styles/state, PDF.js, Kokoro on the main thread, optional Starlette/MLX server, and a Rust/Tauri macOS shell. Existing Python tests cover layout, PDF parsing, audio prosody, verbalization and model routes. No frontend test runner or documentation existed.

## Verification after implementation

Verified on macOS Apple Silicon, the Codex in-app browser at `http://127.0.0.1:8766`, and the built Tauri application at `tauri://localhost`. All documents used for QA were original starter reads or synthetic fixtures.

| Journey / edge case  | Result                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First run            | Welcome tour in browser and native application; dismiss, quick-start and all three starter documents worked                                                                              |
| Library              | Create, rename, favorites, search/no-results, PDF/text filters, delete/Undo and Recently deleted restore exercised                                                                       |
| Studio               | Empty save/play rejected; clear/undo/redo; selection transformation preserved prefix/suffix; autosave survived reload; save/edit round trip passed                                       |
| Large text           | 100,002 characters rejected, including programmatic input beyond HTML maxlength; a 100,000-character document rendered 70 passage controls from 223 segments without horizontal overflow |
| PDF                  | Imported a generated two-page PDF; next/previous page, zoom in/out/reset, passage search, bookmarks and persisted original preview passed                                                |
| Invalid imports      | Corrupt PDF, empty TXT, oversized TXT and image-only PDF rejected without changing the library; batch failures preserve recoverable context                                              |
| Reader               | Passage seeking, progress, bookmark and note persistence verified; backup restoration retained PDF, notes and bookmarks                                                                  |
| Browser system audio | Installed local voice played; pause/resume, next/previous and Stop worked; final build rechecked after cloud-voice exclusion                                                             |
| Kokoro neural        | Worker initialization and short multi-passage playback completed; preparation could be canceled quickly; voice embedding URL corrected for worker-relative loading                       |
| Local MLX            | Short multi-passage playback completed using the cached local engine; installed catalog visible; connection failure displayed retry guidance                                             |
| Native macOS         | Built app launched, onboarding completed, native speech progressed, Stop worked, and saved library survived quit/relaunch of final release build                                         |
| Export               | Downloaded transcript inspected; library JSON restored through UI; native WAV verified as mono 48 kHz PCM, 28.358 seconds / 2,722,428 bytes                                              |
| Outage               | Stopped both local servers. Already-loaded saved text, note saving and installed system speech continued; MLX failure remained recoverable                                               |
| Keyboard             | Cmd+K, Cmd+N, dialog Tab focus loop, Escape dismissal and focus return exercised; focus and accessible names inspected                                                                   |
| Responsive           | 390×844, 800×650, 1280×720 and 1440×1000 inspected. Fixed mobile Stop/settings access and compact-height sidebar scrolling                                                               |
| Motion               | Hover, click, modal and view transitions inspected interactively; animations are 180–200 ms and reduced-motion overrides are present                                                     |

### Regressions found and fixed during verification

- Sentence splitting dropped a C header before punctuation. Replaced it with non-dropping segmentation and added code/decimal/URL fixtures; existing text documents migrate to the corrected segmentation.
- Toasts outside a modal were obscured by the native dialog top layer. Dialog-scoped notices now remain visible and actionable.
- Narrow layouts obscured the Stop control and voice/shortcut settings. Added compact top-bar controls and adjusted the player/nav layout.
- Worker-based Kokoro inherited a document-relative voice URL. Bundled embeddings now resolve relative to the Kokoro module.
- Late browser cancellation events could clear a newer speech wait. Session ownership now prevents the race and has a dedicated regression.
- Both browser NDJSON consumption and Python pipeline result handling could omit later audio chunks. Both paths now preserve the complete result.

### Automated checks and package

- `npm run check`: **27 frontend tests passed**; ESLint (including undefined globals) and Prettier clean.
- `work/test-venv/bin/python -m pytest -q`: **63 Python tests passed**, including real cached-model audio integration, API validation and merged audio/token offsets.
- `npm run check:desktop`: Rust formatting and Clippy with `-D warnings` passed.
- `npm run build -- --bundles app,dmg`: release compilation succeeded and produced version 0.2.0 Apple Silicon `.app` and `.dmg` bundles.
- Five upstream PyMuPDF/SWIG deprecation warnings remain in Python 3.13 (`SwigPyPacked`, `SwigPyObject`, `swigvarlink` missing `__module__`, plus a shutdown notice). They are not compiler/linter warnings and are not suppressed. Updating PyMuPDF to 1.27 did not remove them in this environment.
- Product screenshots: `docs/screenshots/library-desktop.png` and `docs/screenshots/reader-mobile.png`.

### Performance and verification limits

Neural startup no longer runs on the main UI thread or on launch. Native synthesis uses a blocking-task pool. PDF bytes load separately from library metadata and are not rewritten on progress updates. Only the current PDF page and a bounded passage window render, avoiding the original all-pages zoom rebuild.

Motion was assessed visually, without an instrumented frame trace or a universal zero-stutter claim. Reduced-motion rules were inspected in source; an OS preference toggle was not exercised. The outage test stopped local servers rather than changing the host network configuration. Fresh browser loads still require the preview server; this is not an offline-installable PWA. Model downloads require connectivity until their runtime/model assets are cached.

The installer is **ad-hoc signed** with no Developer ID identity or notarization. Public commercial distribution still needs the owner's Apple credentials and clean-machine verification of that signed build. Only macOS Apple Silicon native packaging was built and exercised. No payment/license enforcement or store publication was requested or performed.
