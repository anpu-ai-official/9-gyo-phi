import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareSpeechText } from "../../src/static/speech.js";

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
    assert.equal(speech, caseStudy.expected);
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
    "A P I version two",
  );
  assert.equal(
    await prepareSpeechText(segment, {
      fallback: "A P I version two",
      request: async () => {
        throw new Error("model unavailable");
      },
    }),
    "A P I version two",
  );
});
