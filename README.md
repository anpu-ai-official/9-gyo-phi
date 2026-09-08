# 9-gyo-phi · The listening room

A private listening library for PDFs, EPUB books, HTML articles, Markdown, notes, and technical writing. Import a document, choose a voice, and pick up where you left off. No account or subscription is required.

![The listening library](docs/screenshots/library-desktop.png)

## Start here

### Browser preview

Requires Node.js 22 or newer.

```sh
npm ci
npm start
```

Open **http://127.0.0.1:8766**. The server binds to loopback only. Use `PORT=9000 npm start` to change the preview port. The optional MLX engine permits the standard preview origin on port 8766; custom ports require updating its explicit CORS allowlist.

### macOS desktop app

The generated Apple Silicon installer is:

```text
src-tauri/target/release/bundle/dmg/9-gyo-phi_0.2.0_aarch64.dmg
```

The application bundle is:

```text
src-tauri/target/release/bundle/macos/9-gyo-phi.app
```

The packaged app bundles its own copy of the optional MLX engine (built by `npm run build:engine`, see below) and starts it automatically in the background on launch, so you don't need a separate Python install to use Local MLX voices. If the bundled engine is missing or fails to start, macOS system voices still work locally and support WAV export. A separate browser preview has its own library; use a backup to transfer documents into the desktop app.

This local development build is ad-hoc signed, not Developer ID signed or notarized. It is a tested build for review, not a notarized public distribution. The native target verified in this repository is macOS on Apple Silicon.

## Your first listening session

1. Follow the short welcome tour, or explore the library directly.
2. Try one of three original short reads, import a PDF/EPUB/HTML/Markdown/TXT file, paste an internet or `file:///` URL, or start in **Text studio**.
3. Open a document. Use **Play**, **Pause**, **Stop**, previous/next passage, or the reading-position slider.
4. Set a voice and speed in **Voice & preferences**. On small screens, use the sliders icon in the top bar.
5. Search passages, bookmark your current passage, and add notes. Reading progress and notes save automatically.

## What is included

- A searchable, sortable library with PDF/text filters, favorites, rename, and persistent progress.
- Recoverable deletion: **Recently deleted** retains documents until restored. A toast offers immediate Undo. There is deliberately no permanent-delete control.
- Text studio with autosaving drafts, a 100,000-character limit, undo/redo, and selection-aware code verbalization. **Clear** starts a fresh draft without deleting a saved document.
- A continuously scrollable PDF reader with lazy page rendering, zoom, highlighted passages, word-level click-or-tap-to-listen targets, and a searchable transcript. PDF.js opens immediately; Docling improves reading order in resumable 12-page background batches and preserves semantic headings, lists, tables, captions, code, and formulas.
- EPUB, HTML, and Markdown import through the same Docling document model. EPUB spine order becomes listening order; HTML navigation and footer furniture are excluded; semantic roles receive distinct reader styling. Original source files remain exportable.
- URL import in the desktop app for public HTTPS/HTTP pages and local `file:///` documents. Redirects, download time, source size, supported document signatures, credentials, and private-network destinations are validated; each successful URL becomes a saved offline library copy with source provenance.
- Local syntax rules for code reading. These transform familiar syntax, not arbitrary program semantics. The original text stays intact in the library; studio transformations are undoable.
- Notes, favorites, bookmarks, and progress saved in IndexedDB.
- Exports: original PDF, complete plain-text transcript with notes, recorded PCM WAV audio, and a full library JSON backup.
- A keyboard shortcut sheet, native accessible dialogs with focus containment and Escape dismissal, labeled controls, visible focus rings, and reduced-motion support.
- A custom book-and-sound icon, original vector illustration, and 180–200 ms interface transitions.

## Voices and connectivity

| Engine          | Setup                                                                                                   | Network use                                                                        | WAV export |
| --------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- |
| System, desktop | Installed macOS voice                                                                                   | No model download                                                                  | Yes        |
| System, browser | An installed local browser/OS voice                                                                     | Cloud browser voices are excluded                                                  | No         |
| Kokoro neural   | Select Kokoro in preferences                                                                            | Downloads a model/runtime on first play; inference runs in a worker on this device | Yes        |
| Local MLX       | Starts automatically with the desktop app; in the browser preview, start it with `npm run start:engine` | App connects to `127.0.0.1:8765`; model downloads come from Hugging Face           | Yes        |

No model is downloaded on app launch. Neural initialization runs off the main UI thread; Stop cancels preparation and discards late results. The optional neural model needs roughly 100 MB plus runtime assets. Bundled voice embeddings use module-relative URLs so they work inside the worker.

**Offline:** the desktop application includes its UI/PDF assets and can open saved documents without a web server. Installed system voices are the reliable offline choice. Neural playback requires all model/runtime files to have been cached first. In the browser preview, the local server is needed for a new page load; an already loaded text session can continue when that server is stopped. The app has no service-worker web-install/offline-reload mode.

URL import is a native desktop feature because normal browser requests cannot reliably read arbitrary websites or `file:///` paths. Internet URLs require connectivity only while importing; the downloaded source and extracted listening text are then stored locally. Static/server-rendered HTML is supported. Pages whose article text exists only after site JavaScript runs may need to be saved as HTML first.

On first access to a local URL inside Desktop, Documents, or Downloads, macOS may ask for Files & Folders access. The packaged app includes purpose descriptions for those locations. Denying access leaves the library unchanged; the same document can still be selected through the normal file picker.

**Audio exports contain played passages from the current playback session**, up to 30 minutes. Seeking or starting a new session begins a new recording. Browser system speech cannot provide PCM samples; use native desktop, Kokoro, or MLX for WAV export. Speed changes restart the current passage.

## Files, persistence, and recovery

- PDF: up to 25 MB and 500 pages, with selectable text. Image-only scans need OCR elsewhere first. Password-protected files need an unlocked copy.
- EPUB, HTML, and Markdown: up to 100 MB, with up to 5,000,000 characters of extracted listening text. Structural markup is not spoken.
- Text: UTF-8 TXT or pasted text, 1–100,000 characters.
- Notes: up to 10,000 characters per document.
- Imports: up to 20 files per batch, with a recoverable failure summary.
- URL sources: one at a time, up to 100 MB. Public HTTPS/HTTP and local `file:///` URLs are accepted; embedded credentials, private-network HTTP targets, unsupported schemes, excessive redirects, folders, and unsupported binary formats are rejected.
- Backups: versioned JSON, up to 100 MB and 200 documents. Restoring adds independent copies and commits the validated batch in one transaction. Existing records remain intact.
- Backups include PDFs, original text, notes, favorites, bookmarks, and reading positions. They exclude Recently deleted and unsaved studio drafts. Save a draft to the library before backing it up.
- Storage database: `nine-gyo-phi-library`, version 2. Metadata and PDF bytes are stored separately. Version 1 data migrates automatically. PDF bytes are loaded only when needed; progress updates do not rewrite those bytes.
- There is no cloud synchronization. Browser site-data removal or deleting application data can remove a local library. Keep exported backups. Local storage and exported backups are not encrypted by this application.

## Keyboard shortcuts

Use **⌘** on macOS and **Ctrl** on other desktop platforms.

| Action                       | Shortcut                                           |
| ---------------------------- | -------------------------------------------------- |
| Import a document            | ⌘/Ctrl O                                           |
| Search the library           | ⌘/Ctrl K                                           |
| Open Text studio             | ⌘/Ctrl N                                           |
| Save studio draft to library | ⌘/Ctrl S                                           |
| Play / pause                 | Space, outside editable fields and focused buttons |
| Previous / next passage      | Left / Right, outside editable fields              |
| Bookmark current passage     | B                                                  |
| Shortcut sheet               | ?                                                  |
| Close dialog                 | Escape                                             |
| Undo / redo studio edit      | ⌘/Ctrl Z / ⌘/Ctrl Shift Z                          |

## Optional Apple Silicon MLX engine

Apple Silicon is required for this optional path. The packaged desktop app carries its own bundled copy of the engine (see **Package for macOS**) and launches it automatically on startup — nothing to install. It only falls back to searching for a host Python if that bundled copy is missing, which is the normal case for `tauri dev` and local builds made before the first `npm run build:engine`:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python engine/server.py 8765 --no-open
```

Or just `npm run start:engine` from an environment that already has `requirements.txt` installed. The desktop app checks `127.0.0.1:8765` on launch and never starts a second copy if one — bundled, dev fallback, or manually started — is already listening there; it also stops whichever copy it started when the app quits.

Choose **MLX** in Voice preferences. **Local models** shows the catalog, cached installations, download progress, cancellation, and a connection retry. Downloads are restricted to the built-in catalog. Active models cannot be removed through the backend API. MLX warmup happens on the first explicit playback request.

The engine retains its PDF, audio, and technical verbalization APIs. Browser code transformations use deterministic local rules, including human-readable function signatures; model-specific verbalization is available through `/api/verbalize` and is used as a fallback for code with an MLX voice. The catalog does not provide arbitrary repository downloads or a model-switching UI.

The server listens on loopback and allows explicit local/Tauri origins. Do not expose it as a public network service.

## Advanced local document layout

[Docling](https://github.com/docling-project/docling) is the preferred semantic parser for PDF, EPUB, HTML, and Markdown. It is MIT-licensed, runs locally, retains bounding-box provenance for PDF tap targets, separates document furniture from body content, reconstructs tables, and exposes hierarchy/reading order through one representation. PDF.js remains the visual renderer and fast initial parser, so a book opens before advanced analysis finishes.

Selectable PDFs use Docling's layout and accurate table models with OCR disabled. This avoids changing already-correct text and prevents a hidden OCR-model download. Optional model artifacts are discovered at `~/Library/Application Support/9-gyo-phi/layout-models` or the path supplied in `DOCLING_ARTIFACTS_PATH`. In-progress PDF refinement is saved after every batch and resumes the next time the document opens.

The audio player prepares the next local-neural passage while the current passage is playing. Complex Qwen code explanations use adaptive token budgets, require complete sentence endings, and fall back to faithful syntax rather than narrating truncated model output.

## Development and verification

```sh
npm run check          # ESLint, formatting, frontend regression suite
npm run check:desktop  # Rust formatting and Clippy with warnings denied
npm run dev            # Tauri development application
npm run test:engine    # Python suite, within the optional engine environment
```

The frontend suite covers chunking without dropped code/decimals, input validation, undo/redo, WAV encoding, storage round trips, PDF metadata, cancellation races, cloud-voice exclusion, NDJSON fragmentation, and HTTP serving boundaries. Real MLX audio integration tests run when the model is already cached; they skip on uncached machines and never download a test model. Download-manager lifecycle tests use a stub worker.

The final verification record is in **AUDIT_LOG.md**. It includes computer-use journeys in both the browser and packaged macOS app, responsive screenshots, valid/invalid imports, recovery, backup restoration, native WAV inspection, and server-outage testing. Motion was inspected interactively; no claim of universal zero dropped frames is made.

The Python 3.13 test environment emits upstream PyMuPDF/SWIG deprecation notices about generated types lacking `__module__`. They are documented, not suppressed. Application JS lint, formatting, Rust compilation and strict Clippy checks pass without warnings.

## Package for macOS

Install Xcode command-line tools, Rust, and the Node dependencies, then:

```sh
npm ci
npm run check
npm run check:desktop
npm run build -- --bundles app,dmg
```

`npm run build` first runs `npm run build:engine` (`scripts/build_engine.sh`), which uses PyInstaller to freeze `engine/` into a standalone, onedir bundle at `src-tauri/binaries/9-gyo-phi-engine.zip`, zipped because Tauri's directory resource copying doesn't preserve nested folders. That needs a Python environment with `requirements.txt` **and** `requirements-build.txt` installed; point `ENGINE_PYTHON` at it if it isn't `python3` on `PATH`, e.g.:

```sh
ENGINE_PYTHON=.venv/bin/python3 npm run build
```

On non-Apple-Silicon-macOS this step is skipped (exit 0) and the app builds without a bundled engine, same as before. `tauri build` embeds the resulting zip as an app resource; on first launch the Rust side unpacks it into the app's data directory and reuses that extracted copy on later launches (re-extracting only if the bundled zip changes). Building the engine bundle is the slow, disk-heavy part of packaging — expect several hundred MB — not the Rust/Tauri compile.

Tauri embeds `src/` directly; there is no frontend bundler or framework startup step. Output goes to `src-tauri/target/release/bundle/`. Keep `productName` and the `com.ninegyophi.app` identifier stable to preserve the application's identity and local data.

Regenerate the native icons after changing the vector mark:

```sh
npx tauri icon src/static/brand.svg
```

Public distribution needs the product owner's Apple Developer ID signing identity and notarization credentials in the build environment. Those account-specific credentials are intentionally absent. Test the signed/notarized installer on a clean Mac before publication. Windows/Linux native packaging, Intel binaries, payment/license-key enforcement, store listings, and cloud sync are not included in this release.

## Code map

```text
src/index.html                 Semantic application shell
src/static/app.css             Responsive visual system and motion
src/static/app.js              Library, reader, studio, dialogs and workflows
src/static/core.js             Validation, chunking, history and WAV encoding
src/static/storage.js          Transactional metadata/PDF storage and migration
src/static/audio.js            Cancel-safe system, neural and MLX playback
src/static/neural-worker.js    Lazy Kokoro initialization and inference
src/static/engine.js           Loopback API and NDJSON transport
src/static/parser.js           PDF spatial layout and code-speaking rules
src/static/brand.svg           Custom app mark
src/static/listening-room.svg  Original listening-room illustration
src-tauri/src/lib.rs           Native URL loading, macOS voices, background speech tasks, and engine auto-start
engine/                       Optional Starlette/MLX backend
engine/build/engine.spec       PyInstaller spec for the bundled engine
scripts/serve.mjs              Local-only development server
scripts/build_engine.sh        Builds the bundled engine (see Package for macOS)
```

The inherited monolithic frontend and unused legacy visual/sample assets are preserved in ignored `work/`, outside the packaged application. The original sample book is not redistributed in the new package. Third-party notices are listed in **THIRD_PARTY_NOTICES.md**.

## Changelog

### 0.2.0 — 2026-09-07

- Replaced the transient reader/scratchpad with a persistent listening library and Text studio.
- Added original branding, responsive layouts, first-run guidance, three original starter reads, and reduced-motion-aware interactions.
- Added favorites, search, filters, sorting, rename, recoverable deletion, bookmarks, notes, and reading progress.
- Added autosave, undo/redo, selection-preserving code transformations, backup/import, and document/audio exports.
- Moved neural inference into a worker and native speech off the UI thread; made cancellation and playback restarts independent.
- Preserved every streamed audio event and corrected speech segmentation for code, decimals, URLs, and punctuation.
- Split PDF payload storage from metadata and bounded page/passage rendering.
- Added file/backup limits, batch error details, local-only voices, explicit engine recovery, and stricter API/model boundaries.
- Added frontend regression tests, strict Rust checks, setup documentation, and a verified Apple Silicon app/DMG build.
