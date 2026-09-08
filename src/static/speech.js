export async function prepareSpeechText(
  segment,
  { enabled = true, fallback, request, signal } = {},
) {
  const source = String(segment?.original_text || "").trim();
  const localFallback = typeof fallback === "string" ? fallback : source;
  if (!source || !enabled || typeof request !== "function")
    return localFallback;
  try {
    const result = await request(
      {
        text: source,
        is_code: !!segment?.is_code,
        use_llm: true,
        prefer_llm: true,
      },
      signal,
    );
    return typeof result?.speech_text === "string" && result.speech_text.trim()
      ? result.speech_text.trim()
      : localFallback;
  } catch {
    return localFallback;
  }
}
