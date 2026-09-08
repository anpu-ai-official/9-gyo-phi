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
