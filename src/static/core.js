export const MAX_TEXT = 100000;
export const MAX_PDF = 25 * 1024 * 1024;
export const MAX_DOCUMENT = 100 * 1024 * 1024;
export const MAX_IMPORTED_TEXT = 5_000_000;
export const STRUCTURED_FORMATS = new Set([
  "epub",
  "html",
  "htm",
  "xhtml",
  "md",
  "markdown",
]);
export const URL_SOURCE_FORMATS = new Set([
  "pdf",
  "epub",
  "html",
  "htm",
  "xhtml",
  "md",
  "markdown",
  "txt",
]);
export function normalizeListeningUrl(value) {
  let input = String(value || "").trim();
  if (!input) throw new Error("Enter a website or file URL.");
  if (input.startsWith("/")) input = `file://${input}`;
  else if (!/^[a-z][a-z\d+.-]*:/i.test(input)) input = `https://${input}`;
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a complete HTTPS, HTTP, or file URL.");
  }
  if (!["https:", "http:", "file:"].includes(url.protocol))
    throw new Error("Use an HTTPS, HTTP, or file URL.");
  if (url.username || url.password)
    throw new Error(
      "URLs containing usernames or passwords are not supported.",
    );
  if (
    url.protocol === "file:" &&
    url.hostname &&
    url.hostname.toLowerCase() !== "localhost"
  )
    throw new Error("Remote file hosts are not supported.");
  url.hash = "";
  if (url.protocol === "file:") url.search = "";
  if (url.href.length > 4096) throw new Error("This URL is too long.");
  return url.href;
}
export function normalizePdfLinkUrl(value) {
  const input = String(value || "").trim();
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("This PDF link is not a complete web address.");
  }
  if (!["https:", "http:", "mailto:"].includes(url.protocol))
    throw new Error("This PDF link uses an unsupported address type.");
  if (url.username || url.password)
    throw new Error("PDF links containing usernames or passwords are blocked.");
  if (url.href.length > 4096) throw new Error("This PDF link is too long.");
  return url.href;
}
export function decodeUrlSourceEnvelope(value) {
  const bytes =
    value instanceof Uint8Array
      ? value
      : value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : ArrayBuffer.isView(value)
          ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
          : Array.isArray(value)
            ? Uint8Array.from(value)
            : null;
  if (!bytes || bytes.byteLength < 5)
    throw new Error("The URL loader returned an invalid document.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const metadataLength = view.getUint32(0, false);
  if (
    !metadataLength ||
    metadataLength > 64 * 1024 ||
    metadataLength + 4 >= bytes.length
  )
    throw new Error("The URL loader returned invalid metadata.");
  let metadata;
  try {
    metadata = JSON.parse(
      new TextDecoder().decode(bytes.subarray(4, 4 + metadataLength)),
    );
  } catch {
    throw new Error("The URL loader returned invalid metadata.");
  }
  const source = bytes.slice(4 + metadataLength);
  if (
    !metadata ||
    typeof metadata.finalUrl !== "string" ||
    typeof metadata.filename !== "string" ||
    typeof metadata.contentType !== "string" ||
    metadata.size !== source.byteLength
  )
    throw new Error("The URL loader returned inconsistent metadata.");
  return { metadata, bytes: source };
}
export function inferUrlSourceFormat(url, contentType, bytes) {
  const mime = String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const sample =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (
    sample.length >= 5 &&
    new TextDecoder().decode(sample.subarray(0, 5)) === "%PDF-"
  )
    return "pdf";
  let extension = "";
  try {
    const name =
      decodeURIComponent(new URL(url).pathname).split("/").pop() || "";
    extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  } catch {
    extension = "";
  }
  if (URL_SOURCE_FORMATS.has(extension)) return extension;
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/epub+zip") return "epub";
  if (mime === "text/markdown") return "md";
  if (mime === "application/xhtml+xml") return "xhtml";
  if (mime === "text/plain") return "txt";
  if (mime === "text/html" || mime === "application/html") return "html";
  try {
    if (
      /^\s*<(?:!doctype\s+html|html)[\s>]/i.test(
        new TextDecoder().decode(sample.subarray(0, 4096)),
      )
    )
      return "html";
  } catch {
    // Binary input can fail to decode; the unsupported-type error below is clearer.
  }
  throw new Error(
    "This URL does not point to a supported PDF, EPUB, HTML, Markdown, or text document.",
  );
}
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
  const sourceFormat =
    typeof input.sourceFormat === "string"
      ? input.sourceFormat.toLowerCase()
      : input.kind === "pdf"
        ? "pdf"
        : "txt";
  let sourceUrl = "";
  if (typeof input.sourceUrl !== "undefined" && input.sourceUrl !== "") {
    if (typeof input.sourceUrl !== "string")
      throw new Error("This backup contains an invalid source URL.");
    sourceUrl = normalizeListeningUrl(input.sourceUrl);
  }
  if (
    !["txt", "pdf", ...STRUCTURED_FORMATS].includes(sourceFormat) ||
    (input.kind === "pdf" && sourceFormat !== "pdf") ||
    (input.kind === "text" && sourceFormat === "pdf")
  )
    throw new Error("This backup contains an unsupported document format.");
  const textLimit = STRUCTURED_FORMATS.has(sourceFormat)
    ? MAX_IMPORTED_TEXT
    : MAX_TEXT;
  if (
    input.kind === "text" &&
    (typeof input.text !== "string" ||
      !input.text.trim() ||
      input.text.length > textLimit)
  )
    throw new Error(
      STRUCTURED_FORMATS.has(sourceFormat)
        ? "Structured documents must contain readable text under 5,000,000 characters."
        : "Text documents must contain 1–100,000 characters.",
    );
  if (
    typeof input.notes !== "undefined" &&
    (typeof input.notes !== "string" || input.notes.length > 10000)
  )
    throw new Error("Notes must be under 10,000 characters.");
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    kind: input.kind,
    sourceFormat,
    sourceSize:
      Number.isInteger(input.sourceSize) && input.sourceSize >= 0
        ? input.sourceSize
        : 0,
    layoutParser:
      typeof input.layoutParser === "string" ? input.layoutParser : "",
    sourceUrl,
    editable:
      typeof input.editable === "boolean"
        ? input.editable
        : input.kind === "text" && sourceFormat === "txt",
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
