# Roadmap

The roadmap describes direction, not promised dates. Privacy, accessibility, listening quality, and maintainability take precedence over feature count.

## Now: make 0.3 dependable

- Harden PDF link navigation and hover-to-listen behavior.
- Expand deterministic speech-preparation coverage.
- Improve native-model download recovery and progress visibility.
- Validate long-book M4B generation, cancellation, and disk-pressure behavior.
- Establish signed and notarized macOS releases.
- Exercise Intel macOS, Windows x64, and Linux x64 artifacts through the native-model and M4B smoke suites.
- Add Windows signing and Linux package signatures before promoting cross-platform installers from release candidates.

## Next

- Richer chapter metadata and cover art for M4B exports.
- OCR as an explicit local add-on for image-only PDFs.
- Better EPUB navigation, footnotes, tables, and pronunciation controls.
- Import diagnostics that explain reading-order decisions without exposing content.
- Performance profiling on additional Apple Silicon generations.
- Optional Vulkan acceleration for Windows and Linux while preserving CPU fallback.

## Later

- Windows ARM64 and Linux ARM64 after the Tier-1 desktop support contract is met.
- Pluggable local speech and language models with verified manifests.
- Optional encrypted library backups.
- A stable extension interface for importers and narration transforms.

## Non-goals for the current release

- Cloud accounts, analytics, advertising, or document synchronization.
- DRM removal or bypassing access controls.
- Automatic upload of documents, notes, or speech text.
- Vision, image generation, and Janus model integration.
