# Third-party components

- **PDF.js**: Copyright Mozilla Foundation; Apache License 2.0. The bundled `pdf.min.js` and `pdf.worker.min.js` retain their original license headers.
- **Kokoro.js 1.2.1**: Apache License 2.0. The vendored `src/static/kokoro.web.js` browser runtime was retained from the original repository and adjusted to resolve local voices relative to the module URL.
- **Transformers.js 3.8.1**: Apache License 2.0. Included inside the vendored browser neural runtime.
- **kokoro-en 0.1.5**: Apache License 2.0. The pinned Rust runtime provides native desktop Kokoro inference. The maintained packaging fork selects only the execution provider appropriate to each target; its functional source remains the upstream project.
- **ONNX Runtime**: MIT License. Used by the native Kokoro runtime.
- **fflate 0.8.3**: MIT License. The vendored browser build extracts EPUB containers locally.
- **llama.cpp**: MIT License. Pinned target-specific native builds provide GGUF inference without Python.
- **OxideAV AAC, MP4, and core crates**: MIT License. These pure-Rust components encode bounded PCM frames to AAC and assemble local M4B audiobooks without an external multimedia runtime.
- **Tauri and its CLI**: Apache-2.0 OR MIT. Rust/JavaScript dependency versions are recorded in the lockfiles.
- **Model weights and voice embeddings**: their upstream model distribution terms apply independently. Five Kokoro browser voice embeddings are vendored; native Kokoro and Qwen model assets are downloaded and verified at runtime.

A copy of the Apache 2.0 license is in `licenses/Apache-2.0.txt`. `vendor-checksums.sha256` records the shipped browser assets and voice packs. Installed packages and their lockfiles retain package-specific metadata. The custom SVG mark, listening-room illustration, CSS book covers, and three starter texts were created for this upgrade. The inherited hero artwork, icon bitmap, and sample book were moved out of the distribution into `work/legacy-assets/`.
