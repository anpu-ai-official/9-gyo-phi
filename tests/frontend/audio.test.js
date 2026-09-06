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
