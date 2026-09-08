# Security policy

## Supported versions

| Version           | Supported                          |
| ----------------- | ---------------------------------- |
| 0.3.x             | Yes                                |
| 0.2.x and earlier | Security fixes only when practical |

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/anpu-ai-official/9-gyo-phi/security/advisories/new). Do not open a public issue for vulnerabilities, privacy leaks, path traversal, unsafe URL handling, model-supply-chain problems, or document-content exposure.

Include:

- the affected version and platform;
- reproducible steps or a minimal proof of concept;
- the security or privacy impact;
- any suggested mitigation;
- whether the report may be credited publicly.

Please remove private book content, credentials, and personal information. The maintainers aim to acknowledge a complete report within five business days and will coordinate disclosure after a fix is available. This project does not currently operate a paid bug-bounty program.

## Security model

9-gyo-φ is local-first, but it still processes untrusted documents and downloads optional model files. Important boundaries include:

- public URL imports reject embedded credentials, private-network destinations, excessive redirects, and unsupported schemes;
- model downloads use fixed upstream URLs and SHA-256 verification;
- document text is treated as data, including when passed to the local LLM;
- generated audiobooks and library data remain in application storage;
- browser cloud voices are excluded;
- the native llama.cpp server binds only to loopback.

See `docs/privacy.md` and `docs/architecture.md` for the complete data-flow description.
