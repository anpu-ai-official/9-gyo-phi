# Changelog

All notable changes are documented here. The project follows [Semantic Versioning](https://semver.org/) while below 1.0: minor releases may refine storage or model behavior, but migrations should preserve user data.

## [Unreleased]

### Planned

- Signed and notarized public macOS releases.
- Broader long-document and accessibility testing.

## [0.3.1] - 2026-09-09

### Fixed

- Preserve standalone language and variable letters at the final TTS boundary, including pronouncing “In C” as “In see” instead of dropping the language name.
- Start narration with sentence-sized units, prepare the following unit during playback, and keep background preparation from replacing the playing state.

### Changed

- Warm installed local speech engines when a document opens.
- Cache in-flight and completed LLM speech preparation for the current session.

## [0.3.0] - 2026-09-08

### Added

- Default-on native Qwen preparation for every spoken passage, with ten deterministic speech-contract categories and real-model tests.
- Native Rust/ONNX Kokoro synthesis and verified first-use model installation.
- Complete local M4B generation and an integrated position-saving audiobook player.
- PDF link navigation with a separate hover narration action.
- Local EPUB, HTML, Markdown, and TXT parsing without a Python service.
- Production 9-gyo-φ branding and regenerated desktop/mobile icon sets.
- CI, release automation, issue forms, dependency updates, security policy, contribution guide, architecture documentation, and privacy documentation.

### Changed

- Replaced the Python, MLX, Torch, and Docling runtime with native Rust, llama.cpp, ONNX Runtime, PDF.js, and browser-native document parsing.
- Updated fflate to 0.8.3 and removed an unused npm dependency chain with known vulnerabilities.
- Reduced bundled Kokoro voice packs to the five voices exposed by the interface.

### Verified

- Deterministic frontend and Rust tests, strict Clippy, npm audit, real Qwen cases, real Kokoro PCM, EPUB import, and EPUB-to-M4B playback.

## [0.2.0] - 2026-09-07

### Added

- Persistent library, Text studio, favorites, search, filters, recoverable deletion, bookmarks, notes, reading progress, backups, and document/audio exports.
- Responsive layouts, keyboard navigation, accessible dialogs, reduced-motion behavior, and the original listening-room illustration.

## [0.1.0] - 2026-09-04

- Initial local document reader and speech prototype.

[Unreleased]: https://github.com/anpu-ai-official/9-gyo-phi/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/anpu-ai-official/9-gyo-phi/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/anpu-ai-official/9-gyo-phi/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/anpu-ai-official/9-gyo-phi/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/anpu-ai-official/9-gyo-phi/releases/tag/v0.1.0
