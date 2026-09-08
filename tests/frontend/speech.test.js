import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeSpeechForTts,
  prepareSpeechText,
} from "../../src/static/speech.js";

const fixture = JSON.parse(
  await readFile(
    new URL("../fixtures/speech_preparation_cases.json", import.meta.url),
    "utf8",
  ),
);

for (const caseStudy of fixture.cases) {
  test(`speech preparation routes ${caseStudy.id} through the LLM`, async () => {
    let payload;
    const speech = await prepareSpeechText(
      {
        original_text: caseStudy.source,
        is_code: caseStudy.is_code,
      },
      {
        enabled: true,
        fallback: "deterministic fallback",
        request: async (requestPayload) => {
          payload = requestPayload;
          return { speech_text: caseStudy.expected };
        },
      },
    );
    assert.equal(speech, normalizeSpeechForTts(caseStudy.expected));
    assert.deepEqual(payload, {
      text: caseStudy.source,
      is_code: caseStudy.is_code,
      use_llm: true,
      prefer_llm: true,
    });
  });
}

test("speech preparation deterministically falls back when disabled or unavailable", async () => {
  const segment = { original_text: "API v2", is_code: false };
  assert.equal(
    await prepareSpeechText(segment, {
      enabled: false,
      fallback: "A P I version two",
      request: () => assert.fail("disabled preparation must not call the LLM"),
    }),
    "ay pee eye version two",
  );
  assert.equal(
    await prepareSpeechText(segment, {
      fallback: "A P I version two",
      request: async () => {
        throw new Error("model unavailable");
      },
    }),
    "ay pee eye version two",
  );
});

test("standalone language letters remain audible after speech preparation", async () => {
  assert.equal(
    normalizeSpeechForTts("In C, a pointer stores an address."),
    "In see, a pointer stores an address.",
  );
  assert.equal(
    await prepareSpeechText(
      { original_text: "In C, a pointer stores an address." },
      {
        fallback: "In C, a pointer stores an address.",
        request: async () => ({
          speech_text: "In C, a pointer stores an address.",
        }),
      },
    ),
    "In see, a pointer stores an address.",
  );
});

test("concurrent preparation reuses the same bounded cache entry", async () => {
  const cache = new Map();
  let requests = 0;
  const request = async () => {
    requests++;
    await Promise.resolve();
    return { speech_text: "A P I version two" };
  };
  const segment = { original_text: "API v2" };
  const options = { cache, request };
  const results = await Promise.all([
    prepareSpeechText(segment, options),
    prepareSpeechText(segment, options),
  ]);
  assert.deepEqual(results, [
    "ay pee eye version two",
    "ay pee eye version two",
  ]);
  assert.equal(requests, 1);
});
