import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  getPdfBytes,
  saveDocument,
  listDocuments,
  saveSetting,
  getSetting,
  importDocuments,
} from "../../src/static/storage.js";
test("document data, binary PDF, bookmarks and position survive storage roundtrip", async () => {
  const doc = {
    id: "roundtrip",
    title: "PDF",
    pdfBytes: Uint8Array.from([1, 2, 3]).buffer,
    bookmarks: [1, 4],
    position: 4,
    notes: "Keep this thought",
  };
  await saveDocument(doc);
  const restored = (await listDocuments()).find((d) => d.id === doc.id);
  const { pdfBytes, ...metadata } = doc;
  assert.deepEqual(restored, metadata);
  assert.deepEqual(await getPdfBytes(doc.id), pdfBytes);
  await saveDocument({ ...metadata, position: 5 });
  assert.deepEqual(await getPdfBytes(doc.id), pdfBytes);
});
test("soft deletion and restore preserve document contents", async () => {
  let doc = {
    id: "recoverable",
    text: "Do not lose this",
    deleted: Date.now(),
  };
  await saveDocument(doc);
  assert.ok((await listDocuments()).find((d) => d.id === doc.id).deleted);
  delete doc.deleted;
  await saveDocument(doc);
  assert.equal(
    (await listDocuments()).find((d) => d.id === doc.id).text,
    "Do not lose this",
  );
  assert.equal(
    (await listDocuments()).find((d) => d.id === doc.id).deleted,
    undefined,
  );
});
test("draft and preferences are independently persisted", async () => {
  await saveSetting("draft", { text: "An unfinished idea" });
  await saveSetting("preferences", { speed: 1.5 });
  assert.equal((await getSetting("draft")).text, "An unfinished idea");
  assert.equal((await getSetting("preferences")).speed, 1.5);
});
test("multi-document import commits all documents together", async () => {
  await importDocuments([
    { id: "import-1", text: "One" },
    { id: "import-2", text: "Two" },
  ]);
  const docs = await listDocuments();
  assert.equal(docs.filter((d) => d.id.startsWith("import-")).length, 2);
});
