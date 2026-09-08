# Speech preparation contract

Every passage may contain written forms that a text-to-speech model will pronounce poorly. When **Use native local LLM to prepare speech** is enabled, the desktop app sends every passage—not only code—through a Qwen GGUF model running in llama.cpp before the selected voice receives it. The original document is never changed. If Qwen is unavailable, the app falls back to deterministic local rules or the original passage.

## Ten common use cases and case studies

1. **Programming syntax and comments:** a C pointer signature with an inline `--` comment must describe pointers without calling the punctuation “decrement.”
2. **Mathematical notation:** inequalities, superscripts, Greek letters, and scientific notation must become unambiguous spoken math.
3. **Measurements:** decimals, abbreviated units, rates, and temperatures must expand into pronounceable units.
4. **Finance:** currency symbols, percentages, decimals, and compact magnitudes such as `M` must retain their values and currencies.
5. **Dates and times:** ISO dates, 24-hour time, and time-zone initials must become natural, unambiguous speech.
6. **Network addresses:** email addresses, protocols, domains, paths, and versioned URL components must be spoken rather than guessed as prose.
7. **Acronyms and versions:** initialisms, named acronyms, protocol versions, and software versions need context-sensitive pronunciation.
8. **Scholarly references:** section marks, figures, “et al.,” and bracketed citations must be expanded without losing reference numbers.
9. **Structured procedures:** compact numbered steps must retain their order and quantities when flattened for audio.
10. **Quoted and untrusted content:** quoted instructions and Unicode punctuation must be narrated as content, never treated as commands for the model or application.

The canonical inputs, target readings, required semantic concepts, and forbidden regressions live in `tests/fixtures/speech_preparation_cases.json`.

## Testing strategy

- Frontend contract tests prove deterministically that every content class is routed through the LLM independently of whether it is code and that model failure falls back safely.
- Rust contract tests cover prompt isolation, native audio framing, and safe local paths; frontend fakes prove LLM-first precedence without depending on model wording.
- Fixture validation ensures every case has a unique category and an explicit semantic oracle.
- Opt-in native-model tests run the same cases through the real Qwen GGUF with deterministic decoding. Kokoro is exercised through the native Rust/ONNX runtime and the packaged M4B journey.

For a local or future model-enabled CI runner:

```sh
npm run test:native-models
```

The normal test suite never downloads models and remains deterministic.
