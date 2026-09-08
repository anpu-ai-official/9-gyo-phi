# Verification record

## Current outcome

- PDF links navigate by default. Hovering a link reveals a separate play control, so navigation and narration are independent actions.
- Natural-speech preparation is enabled by default and applies to every passage, not only code. A native Qwen model handles the primary rewrite and deterministic rules are the fallback.
- Desktop Kokoro inference runs through the pinned `kokoro-en` Rust runtime and quantized ONNX Runtime. The browser preview retains the worker implementation.
- PDF, EPUB, HTML, Markdown, and TXT books can be converted passage-by-passage to AAC M4B without retaining a whole-book waveform in browser memory.
- Generated M4B files stay in application data and open in an integrated player that saves position.
- The packaged application contains no Python, MLX, Docling, or Torch runtime. The replaced implementation is archived under `work/legacy-python-source` and is excluded from packaging.
- Janus, vision, and image generation are intentionally out of scope.
- The supplied 9-gyo-φ identity sheet is now represented by vector-first compact, lockup, reversed, and app-icon masters; all platform icon sizes were regenerated from the new master.

## Native architecture

| Capability         | Runtime                                                   | Model storage                                                                    |
| ------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Speech preparation | Target-specific llama.cpp; Metal or portable CPU baseline | SHA-256-verified Qwen 2.5 Coder 3B Q4_K_M GGUF in application data               |
| Neural narration   | Native Rust `kokoro-en` with ONNX Runtime                 | SHA-256-verified quantized Kokoro model and five voice packs in application data |
| Audiobook encoding | Streaming pure-Rust AAC and MP4/M4B muxing                | M4B in application data                                                          |
| Document import    | PDF.js and local EPUB/HTML/Markdown/TXT parsing           | IndexedDB, with original bytes retained                                          |

## Verification

- 56 deterministic frontend tests pass.
- Six regular Rust tests pass; the real-model Rust test is opt-in.
- Ten real Qwen speech-contract cases pass with deterministic decoding.
- Real native Kokoro produces non-silent 24 kHz PCM.
- Packaged EPUB import produced the expected two passages.
- The portable audiobook test writes a 24 kHz mono AAC M4B without external tools, reopens it through an independent demux path, verifies its codec, rate, channels, packets, and bounded output, and passes the macOS system decoder's `afinfo` inspection.
- Rust formatting and strict Clippy checks pass.
- Current packaged size is 93 MB for the app and 32 MB for the DMG; model weights are separate.

## Cross-platform build evidence

Recorded on 2026-09-09 for commit `009eb4b`:

- [CI run 34279383331](https://github.com/anpu-ai-official/9-gyo-phi/actions/runs/34279383331) passed the frontend gate and Rust format, strict Clippy, and test gates on macOS ARM64, Windows x64, and Ubuntu 22.04 x64.
- [CodeQL run 34279383210](https://github.com/anpu-ai-official/9-gyo-phi/actions/runs/34279383210) passed.
- [Release smoke run 34280049570](https://github.com/anpu-ai-official/9-gyo-phi/actions/runs/34280049570) built and uploaded both macOS DMGs, the Windows NSIS installer, and Linux AppImage/deb packages from clean hosted runners.
- Both downloaded DMGs passed `hdiutil verify`; independent file inspection identified the Windows artifact as an NSIS PE executable, the Linux artifacts as a Debian package and x86-64 AppImage, respectively.

Artifact SHA-256 values from that release smoke run:

| Artifact                         | SHA-256                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| `9-gyo-phi_0.4.0_aarch64.dmg`    | `0cc3e026232a6e9fbe385017391c072b9b8951a03aa1c93a0a04ce6d068fbcd4` |
| `9-gyo-phi_0.4.0_x64.dmg`        | `e2bea97ebeff18d3ae997f2a4ae5d01dbc458e414683a3b9a9c5352d0de0220f` |
| `9-gyo-phi_0.4.0_x64-setup.exe`  | `1e18c9a7ce7d21cf32fae64fb813b45b35606e68e5ac5aa4ff0193a113136f53` |
| `9-gyo-phi_0.4.0_amd64.AppImage` | `7a546f2fd0d526b45473a6b32e62396ce45c4be2a68d6acfd75c60e34405219c` |
| `9-gyo-phi_0.4.0_amd64.deb`      | `6e1a444fc3fa79ace9fef882ede763732c27a17a814622256ac0696969647a02` |

These results establish clean build and package candidates. The unsigned Windows and macOS artifacts remain release candidates—not supported public binaries—until the signing, installation, real-hardware model, upgrade, and end-to-end audiobook gates in the platform support contract are completed.
