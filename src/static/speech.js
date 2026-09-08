const SPOKEN_SINGLE_LETTERS = Object.freeze({
  A: "ay",
  B: "bee",
  C: "see",
  D: "dee",
  E: "ee",
  F: "eff",
  G: "gee",
  H: "aitch",
  I: "eye",
  J: "jay",
  K: "kay",
  L: "ell",
  M: "em",
  N: "en",
  O: "oh",
  P: "pee",
  Q: "cue",
  R: "are",
  S: "ess",
  T: "tee",
  U: "you",
  V: "vee",
  W: "double u",
  X: "ex",
  Y: "why",
  Z: "zee",
});

export function normalizeSpeechForTts(value) {
  return String(value || "")
    .trim()
    .replace(/\b(?:[A-Z]\s+){1,}[A-Z]\b/g, (initialism) =>
      initialism
        .split(/\s+/)
        .map((letter) => SPOKEN_SINGLE_LETTERS[letter])
        .join(" "),
    )
    .replace(/\b([B-HJ-Z])\b/g, (letter) => SPOKEN_SINGLE_LETTERS[letter]);
}

export async function prepareSpeechText(
  segment,
  { enabled = true, fallback, request, signal, cache } = {},
) {
  const source = String(segment?.original_text || "").trim();
  const localFallback = normalizeSpeechForTts(
    typeof fallback === "string" ? fallback : source,
  );
  if (!source || !enabled || typeof request !== "function")
    return localFallback;
  const cacheKey = `${segment?.is_code ? "code" : "prose"}\u0000${source}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey);
  const pending = request(
    {
      text: source,
      is_code: !!segment?.is_code,
      use_llm: true,
      prefer_llm: true,
    },
    signal,
  ).then((result) =>
    typeof result?.speech_text === "string" && result.speech_text.trim()
      ? normalizeSpeechForTts(result.speech_text)
      : localFallback,
  );
  if (cache) {
    if (cache.size >= 256) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, pending);
  }
  try {
    return await pending;
  } catch {
    cache?.delete(cacheKey);
    return localFallback;
  }
}
