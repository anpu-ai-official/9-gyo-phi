# Contributing to 9-gyo-φ

Thank you for helping build a calmer, more private way to listen to documents. Contributions are welcome across accessibility, document parsing, speech quality, performance, testing, design, and documentation.

## Before you begin

- Search existing issues and discussions first.
- Open an issue before investing in a large feature, storage migration, model change, or new network dependency.
- Keep the product local-first. A feature that transmits document content needs explicit user consent, a clear privacy explanation, and maintainer agreement.
- Never commit model weights, copyrighted books, credentials, private documents, generated application data, or build artifacts.

## Development setup

The browser preview works with Node.js 22 LTS or Node.js 24 and newer. Native development currently targets Apple Silicon macOS 13 or newer.

```sh
git clone https://github.com/anpu-ai-official/9-gyo-phi.git
cd 9-gyo-phi
npm ci
npm start
```

For the desktop app, install stable Rust, CMake, and the Xcode command-line tools, then run:

```sh
npm run dev
```

The first production build compiles a pinned llama.cpp sidecar. Model weights are downloaded at runtime and are never stored in Git.

## Quality bar

Run the complete local gate before opening a pull request:

```sh
npm run verify
```

Behavioral changes should include deterministic tests. Native-model tests are intentionally opt-in because they require approximately 2.2 GB of local model data:

```sh
npm run test:native-models
```

For interface changes, verify keyboard operation, visible focus, narrow layouts, reduced motion, and a screen-reader-friendly accessible name. For narration changes, preserve the original document and test both the model path and deterministic fallback.

## Pull requests

- Keep each pull request focused and explain the user-visible outcome first.
- Add screenshots or sanitized audio evidence for interface and narration changes.
- Update `CHANGELOG.md`, relevant docs, and `THIRD_PARTY_NOTICES.md` when behavior or dependencies change.
- Call out storage migrations, new model downloads, network access, or platform limitations explicitly.
- Do not rewrite unrelated files or replace hand-authored changes without discussion.

Maintainers may ask to split broad changes so they remain reviewable. By contributing, you agree that your work is provided under this repository's MIT license.
