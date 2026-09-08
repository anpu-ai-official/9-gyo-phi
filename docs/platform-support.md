# Platform support contract

9-gyo-φ calls a platform supported only when its installer, native LLM, Kokoro narration, document import, M4B creation, integrated playback, and update path have passed on real hardware. A successful compilation alone produces a release candidate, not a support claim.

## Desktop matrix

| Target          |    Build     | Native LLM |    Kokoro    |     M4B      |    Signing    | Status                                                      |
| --------------- | :----------: | :--------: | :----------: | :----------: | :-----------: | ----------------------------------------------------------- |
| macOS 13+ ARM64 |      ✓       |   Metal    |      ✓       |      ✓       |    Pending    | Verified development target; public installer remains draft |
| macOS 13+ x64   | CI candidate |    CPU     | CI candidate | CI candidate |    Pending    | Release candidate                                           |
| Windows x64     | CI candidate |    CPU     | CI candidate | CI candidate |    Pending    | Release candidate                                           |
| Linux x64       | CI candidate |    CPU     | CI candidate | CI candidate | Checksum only | Release candidate                                           |
| Windows ARM64   |   Planned    |     —      |      —       |      —       |       —       | Unsupported                                                 |
| Linux ARM64     |   Planned    |     —      |      —       |      —       |       —       | Unsupported                                                 |

Kokoro is the consistent default voice. macOS and Windows expose installed operating-system voices when discovery succeeds. Linux uses Kokoro because there is no dependable system-wide voice provider across distributions.

## Release gates

A target moves to **Supported** only after all of the following are recorded in `docs/verification.md`:

1. The clean GitHub runner builds its target-specific llama.cpp sidecar and installer.
2. The deterministic frontend and Rust suites pass on the target OS.
3. All ten real Qwen narration cases pass.
4. Real Kokoro produces correctly framed, non-silent PCM.
5. A representative EPUB converts to M4B, reopens, seeks, resumes, and completes playback.
6. PDF links navigate on click and expose narration only through the separate hover control.
7. Installation, upgrade, uninstall, model repair, low-disk behavior, and offline restart are exercised.
8. The installer and updater are signed according to platform conventions.

## Packaging policy

- GitHub Releases is the source of truth. One release contains every supported target and a generated `SHA256SUMS` file.
- Platform jobs upload artifacts independently; a final job creates the draft only if every target succeeds.
- Model weights remain optional, on-demand, resumable, and SHA-256 verified.
- Release artifacts never contain Python, MLX, Torch, Docling, private documents, or model weights.
- Homebrew, WinGet, and Flathub listings follow only after the corresponding GitHub installer has completed the support gates.
