import test from "node:test";
import assert from "node:assert/strict";
import {
  words,
  splitText,
  textSegments,
  validateDocument,
  History,
  wavBytes,
} from "../../src/static/core.js";
import {
  verbalizeRuleBasedNative,
  recursiveXYCut,
  parsePdfInBrowser,
} from "../../src/static/parser.js";

test("speech chunking preserves all words and bounds long passages", () => {
  const text =
    Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ") + ".";
  const chunks = splitText(text);
  assert.ok(chunks.length > 3);
  assert.equal(chunks.join(" "), text);
  assert.ok(chunks.every((c) => c.length <= 450));
});
test("an unbroken oversized token is bounded for speech", () => {
  const chunks = splitText("a".repeat(1500));
  assert.equal(chunks.join(""), "a".repeat(1500));
  assert.ok(chunks.every((c) => c.length <= 450));
});
test("empty and whitespace-only documents have no speech segments", () => {
  assert.deepEqual(textSegments(" \n\t"), []);
  assert.equal(words(" \n"), 0);
});
test("backup validation rejects unsafe schema and empty text", () => {
  for (const item of [
    null,
    {},
    { kind: "text", title: "Title", text: "" },
    { kind: "text", title: "Title", text: "x".repeat(100001) },
    { kind: "text", title: "x".repeat(121), text: "a" },
    { kind: "text", title: "Title", text: "a", notes: 2 },
  ])
    assert.throws(() => validateDocument(item));
});
test("backup schema normalizes metadata and allocates independent identities", () => {
  const raw = {
    kind: "text",
    title: " A title ",
    text: "A thought.",
    position: -4,
    bookmarks: [-1, 0, "a", 2],
    favorite: 1,
    id: "untrusted",
    deleted: 1,
  };
  const doc = validateDocument(raw);
  assert.equal(doc.title, "A title");
  assert.notEqual(doc.id, "untrusted");
  assert.equal(doc.position, 0);
  assert.deepEqual(doc.bookmarks, [0, 2]);
  assert.equal(doc.deleted, undefined);
  assert.equal(doc.favorite, true);
});
test("destructive edits support undo, redo, and branching", () => {
  const history = new History(2);
  history.push("original");
  assert.equal(history.undo("cleared"), "original");
  assert.equal(history.redo("original"), "cleared");
  history.undo("cleared");
  history.push("replacement");
  assert.equal(history.redo("replacement"), null);
  history.push("last");
  history.push("latest");
  assert.equal(history.past.length, 2);
});
test("WAV export has valid header, length, sample rate and clamped PCM", () => {
  const buffer = {
    sampleRate: 24000,
    length: 3,
    getChannelData: () => Float32Array.from([-2, 0, 2]),
  };
  const wav = wavBytes([buffer, buffer]);
  const view = new DataView(wav);
  assert.equal(wav.byteLength, 56);
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint32(40, true), 12);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(48, true), 32767);
});
test("WAV export rejects missing audio and mismatched sample rates", () => {
  assert.throws(() => wavBytes([]));
  assert.throws(() => wavBytes([{ sampleRate: 24000 }, { sampleRate: 44100 }]));
});
test("code rules speak standard headers and leave plain prose unchanged", () => {
  assert.equal(
    verbalizeRuleBasedNative("#include <stdio.h>").text,
    "hash includes standard header",
  );
  assert.equal(
    verbalizeRuleBasedNative("A quiet place to listen.").text,
    "A quiet place to listen.",
  );
});
test("spatial column order stays column-major", () => {
  const lines = [
    { text: "right-top", bbox: [200, 0, 300, 10] },
    { text: "left-bottom", bbox: [0, 20, 100, 30] },
    { text: "left-top", bbox: [0, 0, 100, 10] },
    { text: "right-bottom", bbox: [200, 20, 300, 30] },
  ];
  assert.deepEqual(
    recursiveXYCut(lines).map((l) => l.text),
    ["left-top", "left-bottom", "right-top", "right-bottom"],
  );
});
test("PDF parser produces coordinates, original text and segments", async () => {
  const doc = {
    numPages: 1,
    getPage: async () => ({
      getViewport: () => ({ width: 600, height: 800 }),
      getTextContent: async () => ({
        items: [
          {
            str: "A real sentence.",
            transform: [12, 0, 0, 12, 50, 700],
            height: 12,
            width: 100,
            fontName: "Times",
          },
          {
            str: "Another thought.",
            transform: [12, 0, 0, 12, 50, 650],
            height: 12,
            width: 110,
            fontName: "Times",
          },
        ],
      }),
    }),
  };
  const data = await parsePdfInBrowser(doc);
  assert.equal(data.num_pages, 1);
  assert.equal(data.segments.length, 2);
  assert.equal(data.segments[0].original_text, "A real sentence.");
  assert.ok(data.segments[0].boxes[0].x >= 0);
});

test("speech segmentation preserves code, decimals, URLs, and trailing punctuation", () => {
  for (const text of [
    "#include <stdio.h>",
    "The value is 3.14 today.",
    "Visit https://example.com/docs now.",
    "What?! A thought... Another.",
    'printf("Hello, world!");',
  ]) {
    assert.equal(splitText(text).join(" "), text);
  }
});
