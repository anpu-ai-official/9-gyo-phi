import test from "node:test";
import assert from "node:assert/strict";
import { Player } from "../../src/static/audio.js";

globalThis.window = {};
globalThis.speechSynthesis = { cancel() {}, pause() {}, resume() {} };
const segments = [
  { original_text: "One sentence." },
  { original_text: "A second sentence." },
  { original_text: "The end." },
];
const options = { engine: "system", speed: 1, voice: "" };
test("stop during synthesis prevents stale audio and later passages", async () => {
  const player = new Player(() => {});
  let release,
    started = 0;
  player.synthesize = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  player.playBuffer = async () => {
    started++;
  };
  const task = player.play(segments, 0, options);
  player.stop();
  release({ duration: 1 });
  await task;
  assert.equal(started, 0);
  assert.equal(player.state, "idle");
  assert.equal(player.buffers.length, 0);
});
test("restart invalidates earlier synthesis independently", async () => {
  const player = new Player(() => {});
  const pending = [];
  const spoken = [];
  player.synthesize = (text) =>
    new Promise((resolve) => pending.push({ text, resolve }));
  player.playBuffer = async (buffer) => spoken.push(buffer.text);
  const old = player.play(segments, 0, options);
  const latest = player.play(segments, 2, options);
  pending[0].resolve({ text: "STALE", duration: 1 });
  pending[1].resolve({ text: "LATEST", duration: 1 });
  await Promise.all([old, latest]);
  assert.deepEqual(spoken, ["LATEST"]);
  assert.equal(player.state, "finished");
});
test("playback reaches every passage exactly once", async () => {
  const states = [],
    played = [];
  const player = new Player((state) => states.push(state));
  player.synthesize = async (text) => ({ text, duration: 0.1 });
  player.playBuffer = async (buffer) => played.push(buffer.text);
  await player.play(segments, 0, options);
  assert.deepEqual(
    played,
    segments.map((s) => s.original_text),
  );
  assert.equal(player.buffers.length, 3);
  assert.equal(states.at(-1).state, "finished");
});
test("neural playback prepares the next passage while current audio plays", async () => {
  const player = new Player(() => {}),
    synthesized = [];
  let releaseFirst;
  player.synthesize = async (text) => {
    synthesized.push(text);
    return { text, duration: 0.1 };
  };
  player.playBuffer = (buffer) =>
    buffer.text === segments[0].original_text
      ? new Promise((resolve) => {
          releaseFirst = resolve;
        })
      : Promise.resolve();
  const playback = player.play(segments, 0, {
    ...options,
    engine: "neural",
  });
  while (!releaseFirst) await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(synthesized.slice(0, 2), [
    segments[0].original_text,
    segments[1].original_text,
  ]);
  releaseFirst();
  await playback;
});
test("offline neural synthesis returns PCM without a live audio context", async () => {
  const OriginalWorker = globalThis.Worker;
  const OriginalAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = class {
    constructor() {
      assert.fail("Offline audiobook synthesis must not create AudioContext");
    }
  };
  globalThis.Worker = class {
    postMessage({ id }) {
      queueMicrotask(() =>
        this.onmessage({
          data: { id, audio: new Float32Array([0, 0.5, -0.5]), rate: 24000 },
        }),
      );
    }
    terminate() {}
  };
  try {
    const player = new Player(() => {});
    const result = await player.synthesize(
      "Offline narration",
      { engine: "neural", voice: "af_heart", speed: 1, offline: true },
      0,
    );
    assert.equal(result.sampleRate, 24000);
    assert.equal(result.duration, 3 / 24000);
    assert.deepEqual([...result.getChannelData(0)], [0, 0.5, -0.5]);
  } finally {
    globalThis.Worker = OriginalWorker;
    globalThis.AudioContext = OriginalAudioContext;
  }
});
test("playback awaits an asynchronous code verbalizer", async () => {
  const player = new Player(() => {}),
    played = [];
  player.synthesize = async (text) => ({ text, duration: 0.1 });
  player.playBuffer = async (buffer) => played.push(buffer.text);
  await player.play([segments[0]], 0, {
    ...options,
    transform: async () => "human-readable code",
  });
  assert.deepEqual(played, ["human-readable code"]);
});
test("word-level starts trim only the first selected passage", async () => {
  const player = new Player(() => {}),
    played = [];
  player.synthesize = async (text) => ({ text, duration: 0.1 });
  player.playBuffer = async (buffer) => played.push(buffer.text);
  await player.play(segments.slice(0, 2), 0, {
    ...options,
    firstText: "sentence.",
  });
  assert.deepEqual(played, ["sentence.", "A second sentence."]);
});
test("synthesis failures produce a recoverable error and stop the loop", async () => {
  const player = new Player(() => {});
  let attempts = 0;
  player.synthesize = async () => {
    attempts++;
    throw new Error("Voice offline");
  };
  await player.play(segments, 0, options);
  assert.equal(attempts, 1);
  assert.equal(player.state, "error");
});
test("stop releases pending speech and terminates a loading neural worker", () => {
  const player = new Player(() => {});
  let cancelled = false,
    terminated = false;
  player.workerPending = true;
  player.worker = {
    terminate() {
      terminated = true;
    },
  };
  player.cancelWait = () => {
    cancelled = true;
    player.workerPending = false;
  };
  player.stop();
  assert.equal(cancelled, true);
  assert.equal(terminated, true);
  assert.equal(player.worker, null);
});
test("recording guard prevents unbounded audio memory", async () => {
  const player = new Player(() => {});
  player.synthesize = async () => ({ duration: 1801 });
  player.playBuffer = async () => assert.fail("Over-limit audio must not play");
  await player.play(segments, 0, options);
  assert.equal(player.state, "error");
  assert.equal(player.buffers.length, 0);
});

test("browser speech excludes cloud voices and chooses an installed voice", async () => {
  const original = globalThis.speechSynthesis;
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  const local = { name: "Local voice", localService: true },
    remote = { name: "Cloud voice", localService: false };
  let selected;
  const synthesis = {
    getVoices: () => [remote, local],
    speak: (utterance) => {
      selected = utterance.voice;
      utterance.onstart();
      utterance.onend();
    },
    cancel() {},
  };
  globalThis.speechSynthesis = synthesis;
  window.speechSynthesis = synthesis;
  try {
    const player = new Player(() => {});
    await player.speak(
      "Keep this private.",
      { voice: "Cloud voice", speed: 1 },
      0,
    );
    assert.equal(selected, local);
    synthesis.getVoices = () => [remote];
    await assert.rejects(
      () => player.speak("Private words", { speed: 1 }, 0),
      /Cloud browser voices are excluded/,
    );
  } finally {
    globalThis.speechSynthesis = original;
    delete window.speechSynthesis;
    delete globalThis.SpeechSynthesisUtterance;
  }
});

test("a late cancellation event cannot clear the next speech session", async () => {
  const original = globalThis.speechSynthesis;
  globalThis.SpeechSynthesisUtterance = class {};
  const utterances = [];
  const synthesis = {
    getVoices: () => [{ name: "Local", localService: true }],
    speak: (utterance) => utterances.push(utterance),
    cancel() {},
  };
  globalThis.speechSynthesis = synthesis;
  window.speechSynthesis = synthesis;
  try {
    const player = new Player(() => {});
    const first = player.speak("First", { speed: 1 }, 0);
    player.stop();
    const second = player.speak("Second", { speed: 1 }, 1);
    const cancel = player.cancelWait;
    utterances[0].onerror({ error: "canceled" });
    assert.equal(player.cancelWait, cancel);
    player.stop();
    await Promise.all([first, second]);
  } finally {
    globalThis.speechSynthesis = original;
    delete window.speechSynthesis;
    delete globalThis.SpeechSynthesisUtterance;
  }
});
