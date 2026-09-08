import test from "node:test";
import assert from "node:assert/strict";
import {
  words,
  splitText,
  textSegments,
  validateDocument,
  normalizeListeningUrl,
  normalizePdfLinkUrl,
  decodeUrlSourceEnvelope,
  inferUrlSourceFormat,
  History,
  wavBytes,
} from "../../src/static/core.js";
import {
  verbalizeRuleBasedNative,
  recursiveXYCut,
  parsePdfInBrowser,
} from "../../src/static/parser.js";

test("listening URLs accept public web and local file sources", () => {
  assert.equal(
    normalizeListeningUrl("example.com/article#comments"),
    "https://example.com/article",
  );
  assert.equal(
    normalizeListeningUrl("/Users/example/My Notes/read me.md"),
    "file:///Users/example/My%20Notes/read%20me.md",
  );
  assert.throws(() => normalizeListeningUrl("javascript:alert(1)"));
  assert.throws(() => normalizeListeningUrl("https://name:secret@example.com"));
  assert.throws(() =>
    normalizeListeningUrl("file://another-computer/article.html"),
  );
});

test("PDF navigation links preserve destinations and reject unsafe schemes", () => {
  assert.equal(
    normalizePdfLinkUrl("https://example.com/chapter#section"),
    "https://example.com/chapter#section",
  );
  assert.equal(
    normalizePdfLinkUrl("mailto:reader@example.com"),
    "mailto:reader@example.com",
  );
  assert.throws(() => normalizePdfLinkUrl("javascript:alert(1)"));
  assert.throws(() => normalizePdfLinkUrl("https://name:secret@example.com"));
});

test("native URL envelopes preserve metadata and raw document bytes", () => {
  const source = new TextEncoder().encode(
    "<!doctype html><title>A read</title>",
  );
  const metadata = new TextEncoder().encode(
    JSON.stringify({
      finalUrl: "https://example.com/read",
      filename: "read",
      contentType: "text/html",
      size: source.length,
    }),
  );
  const envelope = new Uint8Array(4 + metadata.length + source.length);
  new DataView(envelope.buffer).setUint32(0, metadata.length, false);
  envelope.set(metadata, 4);
  envelope.set(source, 4 + metadata.length);
  const decoded = decodeUrlSourceEnvelope(envelope.buffer);
  assert.equal(decoded.metadata.filename, "read");
  assert.deepEqual(decoded.bytes, source);
  assert.equal(
    inferUrlSourceFormat(
      decoded.metadata.finalUrl,
      decoded.metadata.contentType,
      decoded.bytes,
    ),
    "html",
  );
});

test("URL format inference trusts document signatures over misleading URLs", () => {
  assert.equal(
    inferUrlSourceFormat(
      "https://example.com/download",
      "application/octet-stream",
      new TextEncoder().encode("%PDF-1.7"),
    ),
    "pdf",
  );
  assert.throws(() =>
    inferUrlSourceFormat(
      "https://example.com/archive.bin",
      "application/octet-stream",
      Uint8Array.from([0, 1, 2]),
    ),
  );
});

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
test("structured ebook metadata supports long extracted text safely", () => {
  const doc = validateDocument({
    kind: "text",
    title: "A local book",
    text: "chapter ".repeat(20000),
    sourceFormat: "epub",
    sourceSize: 1024,
    layoutParser: "docling",
    editable: false,
  });
  assert.equal(doc.sourceFormat, "epub");
  assert.equal(doc.layoutParser, "docling");
  assert.equal(doc.editable, false);
});
test("source URLs survive document validation without credentials or fragments", () => {
  const doc = validateDocument({
    kind: "text",
    title: "A web article",
    text: "A useful article.",
    sourceFormat: "html",
    sourceUrl: "https://example.com/read#discussion",
  });
  assert.equal(doc.sourceUrl, "https://example.com/read");
  assert.throws(() =>
    validateDocument({
      kind: "text",
      title: "Bad source",
      text: "text",
      sourceFormat: "html",
      sourceUrl: "data:text/html,hello",
    }),
  );
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
test("code rules describe common function signatures as a human would", () => {
  const expected =
    "function definition for a function named func with two arguments x and y";
  assert.equal(verbalizeRuleBasedNative("def func(x, y):").text, expected);
  assert.equal(
    verbalizeRuleBasedNative("function func(x, y) {").text,
    expected,
  );
  assert.equal(
    verbalizeRuleBasedNative("int func(int x, float y);").text,
    expected,
  );
  assert.equal(
    verbalizeRuleBasedNative("def ready():").text,
    "function definition for a function named ready with no arguments",
  );
});
test("code rules describe static assertions without an open-ended LLM answer", () => {
  assert.equal(
    verbalizeRuleBasedNative("static_assert(sizeof(void*) == 8);").text,
    "static assertion requiring size of void pointer equals 8 to be true at compile time",
  );
});
test("punctuation-only cleanup leaves complex code available for the LLM", () => {
  const result = verbalizeRuleBasedNative(
    "foo<T>(bar, [](auto x) { return x.value(); });",
  );
  assert.equal(result.transformed, false);
  assert.equal(result.text, "foo<T>(bar, [](auto x) { return x.value(); });");
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
  assert.deepEqual(
    data.segments[0].word_boxes.map((word) => word.text),
    ["A", "real", "sentence."],
  );
  assert.ok(data.segments[0].word_boxes.every((word) => word.w > 0));
});

test("PDF parser orders aligned columns and removes repeated margins", async () => {
  const item = (str, x, y, width = 90) => ({
    str,
    transform: [12, 0, 0, 12, x, y],
    height: 12,
    width,
    fontName: "Times",
  });
  const pages = [1, 2].map((number) => ({
    getViewport: () => ({ width: 600, height: 800 }),
    getTextContent: async () => ({
      items: [
        item("Journal of Examples", 50, 790, 130),
        item(`Left ${number}A.`, 50, 700),
        item(`Right ${number}A.`, 330, 700),
        item(`Left ${number}B.`, 50, 670),
        item(`Right ${number}B.`, 330, 670),
        item("Confidential", 50, 10),
        item(String(number), 300, 10, 10),
      ],
    }),
  }));
  const data = await parsePdfInBrowser({
    numPages: pages.length,
    getPage: async (number) => pages[number - 1],
  });
  assert.deepEqual(
    data.segments.map((segment) => segment.original_text),
    [
      "Left 1A.",
      "Left 1B.",
      "Right 1A.",
      "Right 1B.",
      "Left 2A.",
      "Left 2B.",
      "Right 2A.",
      "Right 2B.",
    ],
  );
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
