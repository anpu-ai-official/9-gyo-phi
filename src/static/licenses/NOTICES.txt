# Third-party components

- **PDF.js**: Copyright Mozilla Foundation; Apache License 2.0. The bundled `pdf.min.js` and `pdf.worker.min.js` retain their original license headers.
- **Kokoro.js 1.2.1**: Apache License 2.0, as declared by the installed package. `src/static/kokoro.web.js` was retained from the original repository. Its local-voice lookup was changed to resolve relative to the module URL for worker compatibility.
- **Transformers.js 3.8.1**: Apache License 2.0, as declared by the installed package. Included in the inherited neural runtime.
- **Tauri and its CLI**: Apache-2.0 OR MIT. Rust/JavaScript dependency versions are recorded in the lockfiles.
- **Model weights and voice embeddings**: retained/downloaded separately from the application code; their upstream model distribution terms apply independently. Model downloads are opt-in, from the catalog shown in the app.

A copy of the Apache 2.0 license is in `licenses/Apache-2.0.txt`. Installed packages and their lockfiles retain package-specific metadata. The custom SVG mark, listening-room illustration, CSS book covers, and three starter texts were created for this upgrade. The inherited hero artwork, icon bitmap, and sample book were moved out of the distribution into `work/legacy-assets/`.
