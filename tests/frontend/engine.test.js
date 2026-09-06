import test from "node:test";
import assert from "node:assert/strict";
import { readEvents } from "../../src/static/engine.js";
test("NDJSON consumes every event across fragmented transport chunks", async () => {
  const source = [
    '{"audio_b64":"first"}\n{"au',
    'dio_b64":"second"}\n',
    '{"done":true}',
  ];
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of source)
        controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
  const events = [];
  await readEvents(new Response(stream), (event) => events.push(event));
  assert.deepEqual(events, [
    { audio_b64: "first" },
    { audio_b64: "second" },
    { done: true },
  ]);
});
test("malformed NDJSON fails explicitly rather than dropping audio", async () => {
  await assert.rejects(() => readEvents(new Response("{invalid}\n"), () => {}));
});
