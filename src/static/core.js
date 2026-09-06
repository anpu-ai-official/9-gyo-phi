export const MAX_TEXT = 100000;
export const MAX_PDF = 25 * 1024 * 1024;
export const words = (text) => (text.trim().match(/\S+/g) || []).length;
export const minutes = (text) => Math.max(1, Math.ceil(words(text) / 180));
export function splitText(text, limit = 450) {
  const result = [];
  for (const paragraph of text.split(/\n+/).filter((p) => p.trim())) {
    for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
      let chunk = "";
      for (const word of sentence.trim().split(/\s+/)) {
        if (chunk && chunk.length + word.length + 1 > limit) {
          result.push(chunk);
          chunk = "";
        }
        // Bound even unbroken input so platform speech cannot receive huge chunks.
        if (word.length > limit) {
          if (chunk) {
            result.push(chunk);
            chunk = "";
          }
          for (let i = 0; i < word.length; i += limit)
            result.push(word.slice(i, i + limit));
        } else chunk += (chunk ? " " : "") + word;
      }
      if (chunk) result.push(chunk);
    }
  }
  return result;
}
export function textSegments(text) {
  return splitText(text).map((text, id) => ({
    id,
    page: 0,
    original_text: text,
    speech_text: text,
    boxes: [],
  }));
}
export function validateDocument(input) {
  if (!input || !["text", "pdf"].includes(input.kind))
    throw new Error("This backup contains an unsupported document.");
  if (
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > 120
  )
    throw new Error("Document titles must be 1–120 characters.");
  if (
    input.kind === "text" &&
    (typeof input.text !== "string" ||
      !input.text.trim() ||
      input.text.length > MAX_TEXT)
  )
    throw new Error("Text documents must contain 1–100,000 characters.");
  if (
    typeof input.notes !== "undefined" &&
    (typeof input.notes !== "string" || input.notes.length > 10000)
  )
    throw new Error("Notes must be under 10,000 characters.");
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    kind: input.kind,
    text: input.kind === "text" ? input.text : "",
    notes: input.notes || "",
    favorite: Boolean(input.favorite),
    position:
      Number.isInteger(input.position) && input.position >= 0
        ? input.position
        : 0,
    bookmarks: Array.isArray(input.bookmarks)
      ? input.bookmarks
          .filter((n) => Number.isInteger(n) && n >= 0)
          .slice(0, 1000)
      : [],
    created: Date.now(),
    updated: Date.now(),
  };
}
export class History {
  constructor(limit = 40) {
    this.limit = limit;
    this.past = [];
    this.future = [];
  }
  push(value) {
    this.past.push(value);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo(current) {
    if (!this.past.length) return null;
    this.future.push(current);
    return this.past.pop();
  }
  redo(current) {
    if (!this.future.length) return null;
    this.past.push(current);
    return this.future.pop();
  }
}
export function wavBytes(buffers) {
  if (!buffers.length)
    throw new Error("Listen with a recordable voice before exporting audio.");
  const rate = buffers[0].sampleRate;
  if (buffers.some((b) => b.sampleRate !== rate))
    throw new Error(
      "Voice sample rates changed. Start a fresh recording before exporting.",
    );
  const length = buffers.reduce((n, b) => n + b.length, 0);
  if (length > rate * 60 * 30)
    throw new Error("Export a recording shorter than 30 minutes.");
  const output = new ArrayBuffer(44 + length * 2),
    view = new DataView(output);
  const str = (at, s) =>
    [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const buffer of buffers)
    for (const sample of buffer.getChannelData(0)) {
      const value = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, value < 0 ? value * 32768 : value * 32767, true);
      offset += 2;
    }
  return output;
}
