import {
  MAX_TEXT,
  MAX_PDF,
  MAX_DOCUMENT,
  STRUCTURED_FORMATS,
  normalizeListeningUrl,
  normalizePdfLinkUrl,
  decodeUrlSourceEnvelope,
  inferUrlSourceFormat,
  words,
  minutes,
  textSegments,
  validateDocument,
  History,
} from "./core.js";
import {
  getDocumentBytes,
  listDocuments,
  saveDocument,
  getSetting,
  saveSetting,
  importDocuments,
  getAudiobookForDocument,
  saveAudiobook,
} from "./storage.js";
import { parsePdfInBrowser, verbalizeRuleBasedNative } from "./parser.js";
import { Player } from "./audio.js";
import { prepareSpeechText } from "./speech.js";

const $ = (id) => document.getElementById(id);
const PDF_PARSER_VERSION = 2;
const paths = {
  plus: "M12 5v14M5 12h14",
  library: "M4 4v16h4V4ZM12 4v16M16 4l4 15",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z",
  edit: "m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14Z",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  headphones: "M4 15v-3a8 8 0 0 1 16 0v3M4 13H3v7h4v-7ZM20 13h1v7h-4v-7Z",
  sliders: "M4 7h16M4 17h16M8 4v6M16 14v6",
  keyboard:
    "M3 5h18v14H3ZM6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8",
  archive: "M4 8h16v12H4ZM3 3h18v5H3ZM10 12h4",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  back: "M20 12H4m6-6-6 6 6 6",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  leaf: "M4 20C3 8 11 3 21 3c0 13-6 18-15 14M4 20 16 8",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5ZM12 14v3",
  undo: "M9 5 4 10l5 5M4 10h11a5 5 0 0 1 0 10",
  redo: "m15 5 5 5-5 5M20 10H9a5 5 0 0 0 0 10",
  play: "m8 5 11 7-11 7Z",
  pause: "M7 5h3v14H7ZM14 5h3v14h-3Z",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  bookmark: "M6 3h12v18l-6-4-6 4Z",
  skipBack: "M5 5v14m14-14L8 12l11 7Z",
  skipNext: "M19 5v14M5 5l11 7-11 7Z",
  stop: "M6 6h12v12H6Z",
  voice: "M5 9v6M9 5v14M13 2v20M17 6v12M21 10v4",
  close: "m6 6 12 12M6 18 18 6",
  file: "M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h5",
  link: "M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1",
  check: "m5 12 4 4L19 6",
  refresh: "M20 8a8 8 0 1 0 0 8M20 3v5h-5",
};
function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
}
function hydrate(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.outerHTML = icon(el.dataset.icon);
  });
}
function escape(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function report(error) {
  toast(error.message || String(error), null, true);
  $("saveStatus").textContent = "Check notification";
}
function on(id, event, fn) {
  $(id).addEventListener(event, (e) => {
    Promise.resolve()
      .then(() => fn(e))
      .catch(report);
  });
}
let toastTimer;
function toast(message, action, error = false) {
  clearTimeout(toastTimer);
  const el = document.createElement("div");
  el.className = `toast${error ? " error" : ""}`;
  const label = document.createElement("span");
  label.textContent = message;
  el.append(label);
  if (action) {
    const button = document.createElement("button");
    button.textContent = action.label;
    button.onclick = () =>
      Promise.resolve(action.run())
        .then(() => el.remove())
        .catch(report);
    el.append(button);
  }
  if ($("appDialog").open) {
    let notice = $("dialogNotice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "dialogNotice";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      $("dialogBody").append(notice);
    }
    notice.replaceChildren(el);
  } else $("toastRegion").replaceChildren(el);
  toastTimer = setTimeout(() => el.remove(), error || action ? 12000 : 5000);
}
let docs = [],
  view = "library",
  filter = "all",
  query = "",
  current = null,
  activeSegments = [],
  pdf = null,
  activePdfBytes = null,
  pdfPage = 0,
  pdfScale = 1,
  pdfRenderTasks = new Map(),
  renderedPdfPages = new Set(),
  pdfSegmentsByPage = new Map(),
  pdfPageLabels = [],
  pdfScrollFrame = 0,
  openGeneration = 0,
  pageGeneration = 0;
let draft = { title: "", text: "", id: null },
  draftTimer,
  draftRevision = 0,
  draftSavedRevision = 0,
  notesTimer;
let audiobookController = null,
  audiobookPositionTimer;
const history = new History();
let settings = {
  engine: "neural",
  voice: "af_heart",
  speed: 1,
  smart: true,
  llm: true,
};
let systemVoices = [],
  busyImport = false,
  currentIsDraft = false;
const player = new Player(updatePlayer);
const TEMPLATES = {
  focus: {
    title: "The art of paying attention",
    text: "The art of paying attention\n\nAttention is a small act of generosity. When we give a thought, a person, or a page our full attention, we make room for something that a hurried glance can never reveal.\n\nBegin with one thing. Put the other tabs away. Find a comfortable place, soften your shoulders, and let the next few minutes belong to a single idea. You do not have to finish everything. You only have to begin.\n\nListening offers a different kind of focus. A sentence has a rhythm. An argument unfolds at a human pace. Freed from a glowing screen, your mind can wander just far enough to make a new connection.\n\nTry taking your next article on a walk. Notice which ideas follow you around the corner. Pause when a sentence asks for a little more thought. Leave yourself a note when something feels worth keeping.\n\nThe goal is not to consume more. It is to notice more. A useful question, a surprising detail, a phrase that changes how you understand your work: these are the small rewards of paying attention.\n\nThere will always be another notification. For now, there is this thought, this moment, and a little space to listen.",
  },
  code: {
    title: "Code, spoken clearly",
    text: 'Code, spoken clearly\n\nSome ideas become easier to understand when you hear them. This short example walks through a small C program. Keep “Prepare text for natural speech” enabled in the listening companion to hear punctuation and common syntax expressed as words.\n\n#include <stdio.h>\nmain()\n{\nprintf("Hello, world!");\nreturn 0;\n}\n\nA header makes standard input and output functions available. The main function is the starting point. The print statement writes a greeting, and returning zero signals a successful exit.\n\nThis app uses a local language model to prepare all content for speech, with faithful rules as a fallback. Keep the original source beside the spoken version, and use your notes to record the important ideas.',
  },
  ideas: {
    title: "Make space for ideas",
    text: "Make space for ideas\n\nA good idea rarely arrives fully formed. More often it begins as a loose thread: a question during a walk, a sentence in a book, or a small frustration that refuses to go away.\n\nGive those threads somewhere to land. A short note is enough. Write what you noticed and why it matters. You can find the perfect words later.\n\nThen change the setting. Listen to your notes while making tea. Take a different route home. Explain the idea out loud as if you were telling a friend. A new rhythm can reveal a connection you missed on the page.\n\nWhen you return, look for the smallest useful next step. Sketch a possibility. Try a tiny experiment. Ask one clear question. Progress does not need a grand entrance.\n\nLeave some room in the day for an unfinished thought. Sometimes the most productive thing you can do is let an idea breathe.",
  },
};

function closeDialog() {
  if (audiobookController) {
    audiobookController.abort();
    audiobookController = null;
  }
  $("appDialog").close();
}
function dialog(title, body, eyebrow = "YOUR LISTENING ROOM") {
  $("dialogTitle").textContent = title;
  $("dialogEyebrow").textContent = eyebrow;
  $("dialogBody").innerHTML = body;
  hydrate($("dialogBody"));
  if (!$("appDialog").open) $("appDialog").showModal();
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function persist(doc, notify = false) {
  $("saveStatus").textContent = "Saving…";
  await saveDocument(doc);
  delete doc.pdfBytes;
  delete doc.sourceBytes;
  $("saveStatus").textContent = "All changes saved";
  if (notify) toast("Saved to your library.");
}
async function persistDraft() {
  clearTimeout(draftTimer);
  draft.title = $("draftTitle").value;
  draft.text = $("draftText").value;
  if (draft.text.length > MAX_TEXT) {
    $("draftSaved").textContent = "Shorten this draft to save it";
    throw new Error(
      "Drafts support up to 100,000 characters. Shorten this text before saving.",
    );
  }
  const revision = ++draftRevision;
  $("draftSaved").textContent = "Saving…";
  await saveSetting("draft", { ...draft });
  draftSavedRevision = revision;
  $("draftSaved").textContent = "Draft saved on this device";
}
async function persistNotes() {
  clearTimeout(notesTimer);
  if (current && !currentIsDraft) {
    current.notes = $("documentNotes").value;
    await persist(current);
  }
}
function changeView(next) {
  $("libraryCount").textContent = docs.filter((d) => !d.deleted).length;
  if (view === "writer") persistDraft().catch(report);
  if (view === "reader") persistNotes().catch(report);
  view = next;
  $("libraryView").hidden = !["library", "favorites", "trash"].includes(view);
  $("writerView").hidden = view !== "writer";
  $("readerView").hidden = view !== "reader";
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active =
      button.dataset.view === view ||
      (view === "reader" && button.dataset.view === "library");
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  $("pageLabel").textContent = {
    library: "My library",
    favorites: "Favorites",
    trash: "Recently deleted",
    writer: "Text studio",
    reader: "Reader",
  }[view];
  if (["library", "favorites", "trash"].includes(view)) renderLibrary();
  if (view === "writer") {
    $("draftTitle").value = draft.title;
    $("draftText").value = draft.text;
    updateDraftCounts();
  }
  window.scrollTo({ top: 0 });
}
function documentFormat(doc) {
  const format = doc.sourceFormat || (doc.kind === "pdf" ? "pdf" : "txt");
  if (["html", "htm", "xhtml"].includes(format)) return "html";
  if (format === "markdown") return "md";
  return format;
}
function documentTypeLabel(doc) {
  const format = documentFormat(doc);
  return format === "txt"
    ? "TEXT DOCUMENT"
    : `${format.toUpperCase()} DOCUMENT`;
}
function documentMeasure(doc) {
  return doc.kind === "pdf"
    ? `${doc.pageCount} pages`
    : `${words(doc.text || "").toLocaleString()} words`;
}
function sourceDescription(doc) {
  if (!doc.sourceUrl) return "Saved on this device";
  try {
    const url = new URL(doc.sourceUrl);
    return url.protocol === "file:"
      ? "From a local file · saved on this device"
      : `From ${url.hostname} · saved on this device`;
  } catch {
    return "Saved on this device";
  }
}
function renderLibrary() {
  $("libraryCount").textContent = docs.filter((d) => !d.deleted).length;
  let collection = docs.filter((d) =>
    view === "trash"
      ? d.deleted
      : !d.deleted && (view !== "favorites" || d.favorite),
  );
  $("collectionTitle").firstChild.textContent =
    {
      library: "My library ",
      favorites: "Favorites ",
      trash: "Recently deleted ",
    }[view] || "My library ";
  $("collectionCount").textContent = collection.length;
  $("hero").hidden = view !== "library";
  $("starterArea").hidden = view !== "library";
  $("newText").hidden = view === "trash";
  $("libraryEyebrow").textContent =
    view === "trash" ? "RESTORE WHENEVER YOU NEED" : "YOUR PERSONAL COLLECTION";
  collection = collection.filter(
    (d) =>
      (filter === "all" ||
        (filter === "pdf" ? d.kind === "pdf" : d.kind !== "pdf")) &&
      `${d.title} ${d.text || ""} ${d.notes || ""}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const sort = $("sortSelect").value;
  collection.sort((a, b) =>
    sort === "title"
      ? a.title.localeCompare(b.title)
      : sort === "oldest"
        ? a.created - b.created
        : b.updated - a.updated,
  );
  $("documentGrid").innerHTML = collection
    .map((doc, index) => {
      const count = doc.segments?.length || 1,
        progress = doc.completed
          ? 100
          : Math.round(((doc.position || 0) / count) * 100);
      return `<article class="document-card" data-id="${escape(doc.id)}"><button class="card-cover" data-action="open" data-color="${index % 3}" aria-label="Open ${escape(doc.title)}"><span class="card-type">${documentTypeLabel(doc)}</span><span class="cover-ring"></span><span class="cover-book">${icon(doc.kind === "pdf" ? "file" : "voice")}</span></button>${!doc.deleted ? `<button class="icon-button card-favorite ${doc.favorite ? "is-favorite" : ""}" data-action="favorite" aria-label="${doc.favorite ? "Unfavorite" : "Favorite"} ${escape(doc.title)}" aria-pressed="${!!doc.favorite}">${icon("star")}</button>` : ""}<div class="card-body"><button class="card-title" data-action="open" title="${escape(doc.title)}">${escape(doc.title)}</button><div class="card-meta"><span>${documentMeasure(doc)}</span><span>·</span><span>${doc.minutes || minutes(doc.text || "")} min listen</span></div><div class="card-bottom"><button class="text-button" data-action="${doc.deleted ? "restore" : "open"}">${icon(doc.deleted ? "undo" : "play")}${doc.deleted ? "Restore document" : doc.completed ? "Read again" : doc.position > 0 ? "Continue reading" : "Start reading"}</button><div>${!doc.deleted ? `<button class="icon-button" data-action="rename" aria-label="Rename ${escape(doc.title)}">${icon("edit")}</button><button class="icon-button" data-action="delete" aria-label="Delete ${escape(doc.title)}">${icon("trash")}</button>` : ""}</div></div></div><div class="card-progress"><span style="width:${progress}%"></span></div></article>`;
    })
    .join("");
  $("emptyState").hidden = collection.length > 0;
  $("emptyState").querySelector("h3").textContent = query
    ? "No matches just yet."
    : view === "trash"
      ? "Nothing in recently deleted."
      : view === "favorites"
        ? "Keep your best reads close."
        : filter !== "all"
          ? `Your ${filter === "pdf" ? "PDF" : "text"} collection starts here.`
          : "A home for your next idea.";
  $("emptyState").querySelector("p").textContent = query
    ? "Try another word or clear your search."
    : view === "trash"
      ? "Deleted documents stay here until you restore them."
      : view === "favorites"
        ? "Tap the star on a document to find it here."
        : "Add a PDF or save a note. We’ll keep your place.";
}
async function addTemplate(key) {
  const template = TEMPLATES[key];
  if (!template) return;
  let doc = docs.find((d) => d.template === key && !d.deleted);
  if (!doc) {
    doc = validateDocument({ kind: "text", ...template });
    doc.template = key;
    doc.segments = textSegments(doc.text);
    doc.minutes = minutes(doc.text);
    await persist(doc);
    docs.unshift(doc);
  }
  closeDialog();
  await openDocument(doc.id);
  toast("A short read, ready when you are.");
}
function showImport() {
  dialog(
    "What would you like to read?",
    `<p class="dialog-copy">Bring a book, article, PDF, or fresh thought. Everything is saved privately on this device.</p><button class="dialog-option" id="chooseFiles">${icon("file")}<span><strong>Import from your device</strong><small>PDF, EPUB, HTML, Markdown, or TXT</small></span>${icon("arrow")}</button><button class="dialog-option" id="chooseUrl">${icon("link")}<span><strong>Listen from a URL</strong><small>Web articles or local file:/// links</small></span>${icon("arrow")}</button><button class="dialog-option" id="writeInstead">${icon("edit")}<span><strong>Write or paste text</strong><small>A clean page for your next idea</small></span>${icon("arrow")}</button><p class="hint">Format-aware local parsing preserves useful reading order and structure without uploading your book.</p>`,
  );
  $("chooseFiles").onclick = () => {
    closeDialog();
    $("fileInput").click();
  };
  $("chooseUrl").onclick = showUrlImport;
  $("writeInstead").onclick = () => {
    closeDialog();
    newDraft();
  };
}
function showUrlImport() {
  dialog(
    "Listen from a URL",
    `<form id="urlImportForm"><label class="dialog-field">Website or local file URL<input id="urlInput" type="text" inputmode="url" autocomplete="url" spellcheck="false" maxlength="4096" placeholder="https://example.com/article" aria-describedby="urlImportHint"></label><p class="hint" id="urlImportHint">Use an internet address or a local link such as <code>file:///Users/you/Documents/article.html</code>. The app saves a private local copy for listening offline.</p><div class="dialog-actions"><button class="secondary" type="button" id="backToImport">Back</button><button class="primary" type="submit">Import URL</button></div></form>`,
    "FROM LINK TO LISTENING",
  );
  $("backToImport").onclick = showImport;
  $("urlImportForm").onsubmit = (event) => {
    event.preventDefault();
    importUrl($("urlInput").value).catch(report);
  };
  $("urlInput").focus();
}
function urlFilename(name, format) {
  let filename;
  try {
    filename = decodeURIComponent(String(name || ""));
  } catch {
    filename = String(name || "");
  }
  filename = filename
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f:]/g, "-")
    .trim();
  const extension = filename.includes(".")
    ? filename.split(".").pop().toLowerCase()
    : "";
  const equivalent =
    extension === format ||
    (["html", "htm", "xhtml"].includes(extension) &&
      ["html", "htm", "xhtml"].includes(format)) ||
    (["md", "markdown"].includes(extension) &&
      ["md", "markdown"].includes(format));
  if (equivalent) return filename.slice(0, 180);
  const stem = filename.replace(/\.[^.]+$/, "").slice(0, 160) || "web-document";
  return `${stem}.${format}`;
}
function htmlDocumentTitle(bytes) {
  try {
    const html = new TextDecoder().decode(bytes.subarray(0, 1024 * 1024));
    return new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector("title")
      ?.textContent?.replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  } catch {
    return "";
  }
}
async function importUrl(value) {
  if (busyImport) throw new Error("An import is already in progress.");
  if (!window.__TAURI__?.core)
    throw new Error("URL imports are available in the desktop app.");
  const requestedUrl = normalizeListeningUrl(value);
  closeDialog();
  $("addDocument").disabled = true;
  $("heroImport").disabled = true;
  $("saveStatus").textContent =
    new URL(requestedUrl).protocol === "file:"
      ? "Opening local URL…"
      : "Downloading article…";
  try {
    const envelope = await window.__TAURI__.core.invoke("load_url_source", {
      rawUrl: requestedUrl,
    });
    const { metadata, bytes } = decodeUrlSourceEnvelope(envelope);
    const format = inferUrlSourceFormat(
      metadata.finalUrl || requestedUrl,
      metadata.contentType,
      bytes,
    );
    const filename = urlFilename(metadata.filename, format);
    const preferredTitle = ["html", "htm", "xhtml"].includes(format)
      ? htmlDocumentTitle(bytes)
      : "";
    await importFiles(
      [new File([bytes], filename, { type: metadata.contentType })],
      {
        sourceUrl: metadata.finalUrl || requestedUrl,
        preferredTitle,
      },
    );
  } finally {
    $("addDocument").disabled = false;
    $("heroImport").disabled = false;
    if ($("saveStatus").textContent !== "All changes saved")
      $("saveStatus").textContent = "All changes saved";
  }
}
function newDraft() {
  // Keep an existing autosaved draft until the user explicitly clears it.
  changeView("writer");
  $("draftTitle").focus();
}
async function importFiles(files, options = {}) {
  if (busyImport) return toast("An import is already in progress.");
  if (!files.length) return;
  if (files.length > 20) throw new Error("Import up to 20 files at a time.");
  busyImport = true;
  $("addDocument").disabled = true;
  $("heroImport").disabled = true;
  let imported = 0,
    last;
  const failures = [];
  for (const file of files) {
    try {
      const extension = file.name.split(".").pop().toLowerCase();
      if (
        ![
          "pdf",
          "epub",
          "html",
          "htm",
          "xhtml",
          "md",
          "markdown",
          "txt",
        ].includes(extension)
      )
        throw new Error("Choose a PDF, EPUB, HTML, Markdown, or TXT file.");
      if (!file.size)
        throw new Error("This file is empty. Add some text and try again.");
      if (extension === "pdf" && file.size > MAX_PDF)
        throw new Error(
          "PDFs must be 25 MB or smaller. Split this document and try again.",
        );
      if (extension === "txt" && file.size > MAX_TEXT * 4)
        throw new Error(
          "Text files must contain fewer than 100,000 characters.",
        );
      if (STRUCTURED_FORMATS.has(extension) && file.size > MAX_DOCUMENT)
        throw new Error(
          "EPUB, HTML, and Markdown documents must be 100 MB or smaller.",
        );
      $("saveStatus").textContent = `Understanding ${file.name}…`;
      const title =
        options.preferredTitle ||
        file.name.replace(/\.[^.]+$/, "").slice(0, 120) ||
        "Untitled document";
      let doc;
      if (extension === "pdf") {
        const bytes = await file.arrayBuffer();
        if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-"))
          throw new Error(
            "This file is not a valid PDF. Export it again and retry.",
          );
        const parsed = await loadPdf(bytes);
        try {
          if (parsed.numPages > 500)
            throw new Error(
              "Import a PDF of 500 pages or fewer. Split longer books into chapters.",
            );
          const data = await parsePdfInBrowser(parsed);
          data.parser = "pdfjs-fallback";
          if (!data.segments.length)
            throw new Error(
              "No readable text was found. Run OCR on this PDF and import it again.",
            );
          doc = validateDocument({
            title,
            kind: "pdf",
            sourceUrl: options.sourceUrl || "",
          });
          doc.pdfBytes = bytes;
          doc.pdfSize = bytes.byteLength;
          doc.sourceFormat = "pdf";
          doc.sourceSize = bytes.byteLength;
          doc.layoutParser = data.parser;
          doc.segments = data.segments;
          doc.pageCount = data.num_pages;
          doc.pdfPages = data.pages;
          doc.pdfParserVersion = PDF_PARSER_VERSION;
          doc.minutes = minutes(
            data.segments.map((s) => s.original_text).join(" "),
          );
        } finally {
          await parsed.destroy();
        }
      } else if (extension === "txt") {
        const text = await file.text();
        doc = validateDocument({
          title,
          kind: "text",
          text,
          sourceFormat: "txt",
          editable: true,
          sourceUrl: options.sourceUrl || "",
        });
        doc.segments = textSegments(text);
        doc.minutes = minutes(text);
      } else {
        const bytes = await file.arrayBuffer();
        const data = parseStructuredDocument(file.name, bytes);
        const text = data.segments
          .map((segment) => segment.original_text)
          .join("\n\n")
          .trim();
        doc = validateDocument({
          title,
          kind: "text",
          text,
          sourceFormat: extension,
          sourceSize: bytes.byteLength,
          layoutParser: data.parser,
          editable: false,
          sourceUrl: options.sourceUrl || "",
        });
        doc.sourceBytes = bytes;
        doc.segments = data.segments;
        doc.segmentVersion = 3;
        doc.pageCount = data.num_pages || 0;
        doc.minutes = minutes(text);
      }
      await persist(doc);
      docs.unshift(doc);
      last = doc;
      imported++;
    } catch (error) {
      failures.push(
        `${file.name}: ${error.name === "PasswordException" ? "Password-protected PDF. Save an unlocked copy and retry." : error.message}`,
      );
    }
  }
  busyImport = false;
  $("addDocument").disabled = false;
  $("heroImport").disabled = false;
  $("fileInput").value = "";
  if (imported) {
    changeView("library");
    toast(
      `${imported} document${imported === 1 ? "" : "s"} added to your library.`,
    );
    if (imported === 1) await openDocument(last.id);
  }
  if (failures.length) {
    toast(
      `${failures.length} file${failures.length === 1 ? " was" : "s were"} not imported.`,
      {
        label: "Details",
        run: () =>
          dialog(
            "A few files need attention",
            failures
              .map(
                (message) => `<p class="inline-error">${escape(message)}</p>`,
              )
              .join("") +
              `<p class="hint">Your existing library is unchanged. Correct these files and import them again.</p>`,
          ),
      },
      true,
    );
  }
}
async function loadPdf(bytes) {
  if (!window.pdfjsLib)
    throw new Error(
      "The PDF reader did not load. Reload the app and try again.",
    );
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "./static/pdf.worker.min.js";
  return window.pdfjsLib.getDocument({
    data: bytes.slice(0),
    isEvalSupported: false,
  }).promise;
}

function cleanHtmlDocument(source) {
  const document = new DOMParser().parseFromString(source, "text/html");
  document
    .querySelectorAll(
      "script,style,noscript,template,svg,canvas,form,button,nav,footer,aside",
    )
    .forEach((element) => element.remove());
  const root = document.querySelector("article,main") || document.body;
  const blocks = [...root.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,pre")]
    .filter((element) => !element.closest("pre") || element.matches("pre"))
    .map((element) => element.textContent.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return blocks.length
    ? blocks.join("\n\n")
    : root.textContent.replace(/\s+/g, " ").trim();
}

function resolveArchivePath(base, relative) {
  const parts = base.split("/");
  parts.pop();
  for (const part of relative.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function parseEpub(bytes) {
  if (!window.fflate)
    throw new Error("The EPUB reader did not load. Reload the app and retry.");
  let files;
  try {
    files = window.fflate.unzipSync(new Uint8Array(bytes));
  } catch {
    throw new Error("This EPUB archive is damaged or unsupported.");
  }
  const decode = (path) => {
    const data = files[path];
    if (!data) throw new Error(`The EPUB is missing ${path}.`);
    return new TextDecoder().decode(data);
  };
  const container = new DOMParser().parseFromString(
    decode("META-INF/container.xml"),
    "application/xml",
  );
  const packagePath = container
    .getElementsByTagNameNS("*", "rootfile")[0]
    ?.getAttribute("full-path");
  if (!packagePath) throw new Error("The EPUB has no package document.");
  const packageDocument = new DOMParser().parseFromString(
    decode(packagePath),
    "application/xml",
  );
  const manifest = new Map(
    [...packageDocument.getElementsByTagNameNS("*", "item")].map((item) => [
      item.getAttribute("id"),
      item.getAttribute("href"),
    ]),
  );
  const chapters = [...packageDocument.getElementsByTagNameNS("*", "itemref")]
    .map((item) => manifest.get(item.getAttribute("idref")))
    .filter(Boolean)
    .map((href) => decode(resolveArchivePath(packagePath, href.split("#")[0])))
    .map(cleanHtmlDocument)
    .filter(Boolean);
  if (!chapters.length)
    throw new Error("The EPUB has no readable spine content.");
  return chapters.join("\n\n");
}

function parseStructuredDocument(filename, bytes) {
  const extension = filename.split(".").pop().toLowerCase();
  const decoded =
    extension === "epub" ? parseEpub(bytes) : new TextDecoder().decode(bytes);
  const text = ["html", "htm", "xhtml"].includes(extension)
    ? cleanHtmlDocument(decoded)
    : decoded.trim();
  const segments = textSegments(text);
  if (!segments.length) throw new Error("No readable content was found.");
  return { segments, parser: "native-web", num_pages: 0 };
}
async function openDocument(id) {
  const doc = docs.find((d) => d.id === id);
  if (!doc) return;
  if (doc.deleted) {
    await restore(doc);
    return;
  }
  if (view === "reader") await persistNotes();
  player.stop();
  const generation = ++openGeneration;
  ++pageGeneration;
  for (const task of pdfRenderTasks.values()) task.cancel();
  pdfRenderTasks.clear();
  renderedPdfPages.clear();
  pdfPageLabels = [];
  cancelAnimationFrame(pdfScrollFrame);
  $("pdfPages").replaceChildren();
  if (pdf) {
    await pdf.destroy();
    pdf = null;
  }
  player.buffers = [];
  player.recordedSeconds = 0;
  current = doc;
  currentIsDraft = false;
  activeSegments = doc.segments || textSegments(doc.text);
  doc.position = Math.min(
    doc.position || 0,
    Math.max(0, activeSegments.length - 1),
  );
  player.index = doc.position;
  pdfScale = 1;
  pdfPage = activeSegments[doc.position]?.page || 0;
  $("readerTitle").textContent = doc.title;
  $("readerKind").textContent = documentTypeLabel(doc);
  $("readerMeta").textContent =
    `${documentMeasure(doc)} · ${doc.minutes || minutes(doc.text || "")} min listen · ${sourceDescription(doc)}`;
  $("documentNotes").value = doc.notes || "";
  $("passageSearch").value = "";
  $("editDocument").hidden = doc.kind !== "text" || doc.editable === false;
  $("pdfToolbar").hidden = doc.kind !== "pdf";
  $("pdfViewport").hidden = doc.kind !== "pdf";
  $("textContent").hidden = doc.kind === "pdf";
  $("favoriteReader").classList.toggle("is-favorite", !!doc.favorite);
  $("favoriteReader").setAttribute("aria-pressed", !!doc.favorite);
  changeView("reader");
  $("playerTitle").textContent = doc.title;
  $("playButton").disabled = false;
  $("positionRange").max = Math.max(0, activeSegments.length - 1);
  $("positionRange").disabled = false;
  $("textContent").replaceChildren();
  renderPassages();
  updatePlayer({ state: "idle", index: doc.position });
  if (doc.kind === "pdf") {
    $("playerDetail").textContent = "Opening PDF…";
    try {
      activePdfBytes = await getDocumentBytes(doc.id);
      if (!activePdfBytes)
        throw new Error(
          "The saved PDF could not be found. Reimport the original file.",
        );
      const loaded = await loadPdf(activePdfBytes);
      if (generation !== openGeneration) {
        await loaded.destroy();
        return;
      }
      pdf = loaded;
      await renderPdfDocument();
      updatePlayer({ state: "idle", index: doc.position });
    } catch (error) {
      report(error);
      $("playerDetail").textContent =
        "PDF preview unavailable · transcript ready";
    }
  }
}
function updatePdfToolbar() {
  if (!pdf) return;
  $("pageNumber").textContent = `${pdfPage + 1} / ${pdf.numPages}`;
  $("prevPage").disabled = pdfPage === 0;
  $("nextPage").disabled = pdfPage === pdf.numPages - 1;
  $("zoomReset").textContent = `${Math.round(pdfScale * 100)}%`;
  $("zoomOut").disabled = pdfScale <= 0.75;
  $("zoomIn").disabled = pdfScale >= 2;
}

async function getPdfPageMetadata() {
  if (current?.pdfPages?.length === pdf.numPages) return current.pdfPages;
  const pages = [];
  for (let index = 0; index < pdf.numPages; index++) {
    const page = await pdf.getPage(index + 1);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ page: index, width: viewport.width, height: viewport.height });
  }
  if (current) current.pdfPages = pages;
  return pages;
}

function pdfSegmentLabel(segment) {
  const text = segment.original_text?.replace(/\s+/g, " ").trim() || "passage";
  return `Read from here: ${text.slice(0, 120)}`;
}

function pdfLinkSpeechStart(pageIndex, rect) {
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  let segmentMatch = null;
  for (const { segment, index } of pdfSegmentsByPage.get(pageIndex) || []) {
    for (const [wordIndex, box] of (segment.word_boxes || []).entries()) {
      if (
        centerX >= box.x &&
        centerX <= box.x + box.w &&
        centerY >= box.y &&
        centerY <= box.y + box.h
      )
        return { segmentIndex: index, wordIndex };
    }
    if (
      !segmentMatch &&
      (segment.boxes || []).some(
        (box) =>
          centerX >= box.x &&
          centerX <= box.x + box.w &&
          centerY >= box.y &&
          centerY <= box.y + box.h,
      )
    )
      segmentMatch = { segmentIndex: index };
  }
  return segmentMatch;
}

function pdfAnnotationRect(annotation, viewport) {
  if (!Array.isArray(annotation.rect) || annotation.rect.length !== 4)
    return null;
  const converted = viewport.convertToViewportRectangle(annotation.rect);
  const left = Math.max(0, Math.min(converted[0], converted[2]));
  const top = Math.max(0, Math.min(converted[1], converted[3]));
  const right = Math.min(viewport.width, Math.max(converted[0], converted[2]));
  const bottom = Math.min(
    viewport.height,
    Math.max(converted[1], converted[3]),
  );
  if (right <= left || bottom <= top) return null;
  return {
    x: (left / viewport.width) * 100,
    y: (top / viewport.height) * 100,
    w: ((right - left) / viewport.width) * 100,
    h: ((bottom - top) / viewport.height) * 100,
  };
}

function pdfLinkLabel(annotation) {
  if (annotation.url) {
    try {
      return `Open link to ${new URL(annotation.url).hostname || annotation.url}`;
    } catch {
      return "Open PDF link";
    }
  }
  return "Go to linked page";
}

async function populatePdfLinks(page, pageIndex, viewport, layer) {
  const annotations = await page.getAnnotations({ intent: "display" });
  if (layer.dataset.linksPopulated === "true") return;
  for (const annotation of annotations) {
    if (!annotation.url && !annotation.dest && !annotation.action) continue;
    const rect = pdfAnnotationRect(annotation, viewport);
    if (!rect) continue;
    let url = "";
    if (annotation.url) {
      try {
        url = normalizePdfLinkUrl(annotation.url);
      } catch {
        continue;
      }
    }

    const region = document.createElement("span");
    region.className = "pdf-link-region";
    region.style.left = `${rect.x}%`;
    region.style.top = `${rect.y}%`;
    region.style.width = `${rect.w}%`;
    region.style.height = `${rect.h}%`;

    const link = document.createElement("a");
    link.className = "pdf-link-target";
    link.href = url || `#pdf-page-${pageIndex + 1}`;
    link.setAttribute("aria-label", pdfLinkLabel(annotation));
    link.title = pdfLinkLabel(annotation);
    if (url) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.dataset.pdfUrl = url;
    } else {
      link._pdfDestination = annotation.dest;
      link.dataset.pdfAction = annotation.action || "";
    }
    region.append(link);

    const start = pdfLinkSpeechStart(pageIndex, rect);
    if (start) {
      const play = document.createElement("button");
      play.type = "button";
      play.className = "pdf-link-play";
      play.dataset.segment = start.segmentIndex;
      if (Number.isInteger(start.wordIndex))
        play.dataset.word = start.wordIndex;
      play.setAttribute("aria-label", "Listen from this link");
      play.title = "Listen from this link";
      play.innerHTML = icon("play");
      region.append(play);
    }
    layer.append(region);
  }
  layer.dataset.linksPopulated = "true";
}

async function goToPdfDestination(destination, action = "") {
  let pageIndex;
  if (destination) {
    const resolved =
      typeof destination === "string"
        ? await pdf.getDestination(destination)
        : destination;
    const reference = resolved?.[0];
    pageIndex = Number.isInteger(reference)
      ? reference
      : reference
        ? await pdf.getPageIndex(reference)
        : undefined;
  } else {
    pageIndex = {
      FirstPage: 0,
      LastPage: pdf.numPages - 1,
      NextPage: pdfPage + 1,
      PrevPage: pdfPage - 1,
    }[action];
  }
  if (!Number.isInteger(pageIndex)) return;
  pdfPage = Math.max(0, Math.min(pdf.numPages - 1, pageIndex));
  updatePdfToolbar();
  scrollToPdfPage(pdfPage);
}

function goToPdfPage(pageIndex) {
  if (!Number.isInteger(pageIndex)) return;
  pdfPage = Math.max(0, Math.min(pdf.numPages - 1, pageIndex));
  updatePdfToolbar();
  scrollToPdfPage(pdfPage);
}

async function openPdfUrl(url) {
  if (window.__TAURI__?.core)
    return window.__TAURI__.core.invoke("open_external_url", { rawUrl: url });
  window.open(url, "_blank", "noopener,noreferrer");
}

async function renderPdfDocument({ keepPage = pdfPage } = {}) {
  if (!pdf) return;
  const generation = ++pageGeneration;
  for (const task of pdfRenderTasks.values()) task.cancel();
  pdfRenderTasks.clear();
  renderedPdfPages.clear();
  const pages = await getPdfPageMetadata();
  if (!pdfPageLabels.length) {
    const labels = await pdf.getPageLabels();
    pdfPageLabels =
      labels?.length === pdf.numPages
        ? labels
        : pages.map((_, index) => String(index + 1));
  }
  if (generation !== pageGeneration) return;

  pdfSegmentsByPage = new Map();
  activeSegments.forEach((segment, index) => {
    if (!pdfSegmentsByPage.has(segment.page))
      pdfSegmentsByPage.set(segment.page, []);
    pdfSegmentsByPage.get(segment.page).push({ segment, index });
  });
  const width = Math.max(250, $("readingPaper").clientWidth - 26) * pdfScale;
  const fragment = document.createDocumentFragment();
  for (const meta of pages) {
    const shell = document.createElement("section");
    shell.className = "pdf-page";
    shell.dataset.page = meta.page;
    shell.setAttribute("aria-label", `Page ${meta.page + 1}`);
    shell.style.width = `${width}px`;
    shell.style.height = `${width * (meta.height / meta.width)}px`;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    shell.append(canvas);
    const placeholder = document.createElement("span");
    placeholder.className = "pdf-page-placeholder";
    placeholder.textContent = `Page ${meta.page + 1}`;
    shell.append(placeholder);
    const layer = document.createElement("div");
    layer.className = "pdf-text-layer";
    layer.dataset.page = meta.page;
    shell.append(layer);
    fragment.append(shell);
  }
  $("pdfPages").replaceChildren(fragment);
  pdfPage = Math.max(0, Math.min(pdf.numPages - 1, keepPage));
  updatePdfToolbar();
  renderPdfHighlights();
  requestAnimationFrame(() => {
    if (generation !== pageGeneration) return;
    scrollToPdfPage(pdfPage, "instant");
    renderVisiblePdfPages();
  });
}

function populatePdfTextTargets(index) {
  const layer = $("pdfPages").querySelector(
    `.pdf-text-layer[data-page="${index}"]`,
  );
  if (!layer || layer.dataset.populated === "true") return;
  const fragment = document.createDocumentFragment();
  for (const { segment, index: segmentIndex } of pdfSegmentsByPage.get(index) ||
    []) {
    for (const [boxIndex, box] of (segment.boxes || []).entries()) {
      const target = document.createElement("button");
      target.type = "button";
      target.className = `pdf-text-target${segmentIndex === player.index ? " active" : ""}`;
      target.dataset.segment = segmentIndex;
      if (boxIndex === 0)
        target.setAttribute("aria-label", pdfSegmentLabel(segment));
      else {
        target.tabIndex = -1;
        target.setAttribute("aria-hidden", "true");
      }
      target.title = "Read from here";
      target.style.left = `${box.x}%`;
      target.style.top = `${box.y}%`;
      target.style.width = `${box.w}%`;
      target.style.height = `${box.h}%`;
      fragment.append(target);
    }
    for (const [wordIndex, box] of (segment.word_boxes || []).entries()) {
      const target = document.createElement("button");
      target.type = "button";
      target.className = "pdf-word-target";
      target.dataset.segment = segmentIndex;
      target.dataset.word = wordIndex;
      target.tabIndex = -1;
      target.setAttribute("aria-hidden", "true");
      target.title = `Read from “${box.text}”`;
      target.style.left = `${box.x}%`;
      target.style.top = `${box.y}%`;
      target.style.width = `${box.w}%`;
      target.style.height = `${box.h}%`;
      fragment.append(target);
    }
  }
  layer.append(fragment);
  layer.dataset.populated = "true";
}

function pdfTextItemRect(item, viewport) {
  const transformed = window.pdfjsLib.Util.transform(
    viewport.transform,
    item.transform,
  );
  const height = Math.max(4, Math.hypot(transformed[2], transformed[3]));
  return {
    text: item.str.trim(),
    x: (transformed[4] / viewport.width) * 100,
    y: ((transformed[5] - height) / viewport.height) * 100,
    w: ((item.width * viewport.scale) / viewport.width) * 100,
    h: (height / viewport.height) * 100,
  };
}

function pdfTextLines(items, viewport) {
  const words = items
    .filter((item) => item.str?.trim())
    .map((item) => pdfTextItemRect(item, viewport))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const word of words) {
    let line = lines.find(
      (candidate) =>
        Math.abs(candidate.y - word.y) <=
        Math.max(0.35, Math.min(candidate.h, word.h) * 0.5),
    );
    if (!line) {
      line = { y: word.y, h: word.h, words: [] };
      lines.push(line);
    }
    line.words.push(word);
    line.h = Math.max(line.h, word.h);
  }
  for (const line of lines) line.words.sort((a, b) => a.x - b.x);
  return lines;
}

async function populateInferredPdfLinks(page, pageIndex, viewport, layer) {
  if (
    layer.dataset.inferredLinksPopulated === "true" ||
    layer.querySelector(".pdf-link-target:not([data-pdf-url])")
  )
    return;
  const { items = [] } = await page.getTextContent({
    normalizeWhitespace: false,
  });
  const lines = pdfTextLines(items, viewport);
  if (
    !lines.some((line) =>
      /\bcontents\b/i.test(line.words.map((word) => word.text).join(" ")),
    )
  ) {
    layer.dataset.inferredLinksPopulated = "true";
    return;
  }
  const fallbackSegment = (pdfSegmentsByPage.get(pageIndex) || [])[0];
  if (!fallbackSegment) return;

  for (const line of lines) {
    const lineText = line.words
      .map((word) => word.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const match = lineText.match(
      /^(.*?[a-z][^\n]*?)\s+(\d{1,4}|[ivxlcdm]+)\s*$/i,
    );
    if (!match) continue;
    const printedPage = match[2];
    const destinationPage = pdfPageLabels.indexOf(printedPage);
    if (destinationPage < 0) continue;
    const label = match[1].replace(/\s*\.{2,}\s*/g, " ").trim();

    const left = Math.min(...line.words.map((word) => word.x));
    const top = Math.min(...line.words.map((word) => word.y));
    const right = Math.max(...line.words.map((word) => word.x + word.w));
    const bottom = Math.max(...line.words.map((word) => word.y + word.h));
    const region = document.createElement("span");
    region.className = "pdf-link-region";
    region.style.left = `${left}%`;
    region.style.top = `${top}%`;
    region.style.width = `${right - left}%`;
    region.style.height = `${bottom - top}%`;

    const link = document.createElement("a");
    link.className = "pdf-link-target";
    link.href = `#pdf-page-${destinationPage + 1}`;
    link.dataset.pdfPage = destinationPage;
    link.setAttribute("aria-label", `Open ${label}, page ${printedPage}`);
    link.title = `Go to page ${printedPage}`;
    region.append(link);

    const play = document.createElement("button");
    play.type = "button";
    play.className = "pdf-link-play";
    const start = pdfLinkSpeechStart(pageIndex, {
      x: left,
      y: top,
      w: right - left,
      h: bottom - top,
    });
    play.dataset.segment = start?.segmentIndex ?? fallbackSegment.index;
    if (Number.isInteger(start?.wordIndex)) play.dataset.word = start.wordIndex;
    else play.dataset.firstText = label;
    play.setAttribute("aria-label", `Listen from ${label}`);
    play.title = "Listen from this link";
    play.innerHTML = icon("play");
    region.append(play);
    layer.append(region);
  }
  layer.dataset.inferredLinksPopulated = "true";
}

async function renderPdfPage(index, generation = pageGeneration) {
  if (
    !pdf ||
    generation !== pageGeneration ||
    renderedPdfPages.has(index) ||
    pdfRenderTasks.has(index)
  )
    return;
  const shell = $("pdfPages").querySelector(`[data-page="${index}"]`);
  if (!shell) return;
  const reservation = {
    cancelled: false,
    cancel() {
      this.cancelled = true;
    },
  };
  let task = reservation;
  pdfRenderTasks.set(index, reservation);
  try {
    populatePdfTextTargets(index);
    const page = await pdf.getPage(index + 1);
    if (generation !== pageGeneration || reservation.cancelled) return;
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: shell.clientWidth / base.width,
    });
    await populatePdfLinks(
      page,
      index,
      viewport,
      shell.querySelector(".pdf-text-layer"),
    );
    await populateInferredPdfLinks(
      page,
      index,
      viewport,
      shell.querySelector(".pdf-text-layer"),
    );
    if (generation !== pageGeneration || reservation.cancelled) return;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = shell.querySelector("canvas");
    canvas.width = Math.floor(viewport.width * density);
    canvas.height = Math.floor(viewport.height * density);
    task = page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
      transform: [density, 0, 0, density, 0, 0],
    });
    pdfRenderTasks.set(index, task);
    await task.promise;
    if (generation === pageGeneration) {
      renderedPdfPages.add(index);
      shell.classList.add("rendered");
    }
  } catch (error) {
    if (error.name !== "RenderingCancelledException") throw error;
  } finally {
    if (pdfRenderTasks.get(index) === task) pdfRenderTasks.delete(index);
  }
}

function renderVisiblePdfPages() {
  if (!pdf) return;
  const viewportRect = $("pdfViewport").getBoundingClientRect();
  $("pdfPages")
    .querySelectorAll(".pdf-page")
    .forEach((shell) => {
      const rect = shell.getBoundingClientRect(),
        index = Number(shell.dataset.page);
      if (
        rect.bottom >= viewportRect.top - 700 &&
        rect.top <= viewportRect.bottom + 900
      )
        renderPdfPage(index).catch(report);
      else if (
        rect.bottom < viewportRect.top - 2100 ||
        rect.top > viewportRect.bottom + 2500
      ) {
        pdfRenderTasks.get(index)?.cancel();
        pdfRenderTasks.delete(index);
        renderedPdfPages.delete(index);
        shell.classList.remove("rendered");
        const canvas = shell.querySelector("canvas"),
          layer = shell.querySelector(".pdf-text-layer");
        canvas.width = 1;
        canvas.height = 1;
        layer.replaceChildren();
        delete layer.dataset.populated;
        delete layer.dataset.linksPopulated;
        delete layer.dataset.inferredLinksPopulated;
      }
    });
}

function syncPdfPageFromScroll() {
  const viewportRect = $("pdfViewport").getBoundingClientRect();
  const center = viewportRect.top + viewportRect.height / 2;
  let nearest = pdfPage,
    distance = Infinity;
  $("pdfPages")
    .querySelectorAll(".pdf-page")
    .forEach((shell) => {
      const rect = shell.getBoundingClientRect();
      const candidate = Math.abs((rect.top + rect.bottom) / 2 - center);
      if (candidate < distance) {
        distance = candidate;
        nearest = Number(shell.dataset.page);
      }
    });
  pdfPage = nearest;
  updatePdfToolbar();
  renderVisiblePdfPages();
}

function scrollToPdfPage(index, behavior = "smooth") {
  const shell = $("pdfPages").querySelector(`[data-page="${index}"]`);
  if (!shell) return;
  const container = $("pdfViewport");
  container.scrollTo({
    top: shell.offsetTop - $("pdfPages").offsetTop,
    behavior,
  });
}

function revealPdfSegment(index, behavior = "smooth") {
  const page = activeSegments[index]?.page;
  if (Number.isInteger(page)) populatePdfTextTargets(page);
  const target = $("pdfPages").querySelector(`[data-segment="${index}"]`);
  if (!target) return;
  const container = $("pdfViewport"),
    containerRect = container.getBoundingClientRect(),
    targetRect = target.getBoundingClientRect();
  if (
    targetRect.top < containerRect.top ||
    targetRect.bottom > containerRect.bottom
  )
    container.scrollTo({
      top:
        container.scrollTop +
        targetRect.top -
        containerRect.top -
        container.clientHeight / 3,
      behavior,
    });
}

function renderPdfHighlights() {
  $("pdfPages")
    .querySelectorAll(".pdf-text-target.active")
    .forEach((target) => target.classList.remove("active"));
  $("pdfPages")
    .querySelectorAll(`[data-segment="${player.index}"]`)
    .forEach((target) => target.classList.add("active"));
}
function segmentRole(segment) {
  return [
    "heading",
    "paragraph",
    "list-item",
    "code",
    "formula",
    "table",
    "caption",
    "footnote",
  ].includes(segment?.role)
    ? segment.role
    : "paragraph";
}
function renderPassages() {
  const search = $("passageSearch").value.toLowerCase();
  const matching = activeSegments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) =>
      segment.original_text.toLowerCase().includes(search),
    );
  let visible;
  if (search) visible = matching.slice(0, 100);
  else {
    const start = Math.max(0, player.index - 3);
    visible = matching.slice(start, start + 60);
  }
  $("passageList").innerHTML = visible.length
    ? visible
        .map(
          ({ segment, index }) =>
            `<button class="passage-item role-${segmentRole(segment)} ${index === player.index ? "active" : ""}" data-segment="${index}" ${index === player.index ? 'aria-current="true"' : ""}>${current?.bookmarks?.includes(index) ? icon("bookmark") : `<small>${index + 1}</small>`}<span>${escape(segment.original_text)}</span></button>`,
        )
        .join("")
    : '<p class="hint">No matching passages.</p>';
  if (search && matching.length > 100)
    $("passageList").insertAdjacentHTML(
      "beforeend",
      '<p class="hint">Showing 100 matches. Refine your search for more.</p>',
    );
  if (current?.kind !== "pdf") {
    // A bounded reading window keeps even large pasted documents responsive.
    const start = Math.max(0, player.index - 8),
      end = Math.min(activeSegments.length, start + 70);
    $("textContent").innerHTML = activeSegments
      .slice(start, end)
      .map(
        (segment, offset) =>
          `<button class="passage role-${segmentRole(segment)} ${start + offset === player.index ? "active" : ""}" data-segment="${start + offset}" ${start + offset === player.index ? 'aria-current="true"' : ""}>${escape(segment.original_text)}</button>`,
      )
      .join("");
  }
  $("bookmarkPassage").classList.toggle(
    "is-favorite",
    !!current?.bookmarks?.includes(player.index),
  );
  $("bookmarkPassage").setAttribute(
    "aria-pressed",
    !!current?.bookmarks?.includes(player.index),
  );
}
let lastRenderedIndex = -1;
function updatePlayer({ state, index, detail }) {
  if (!$("playButton")) return;
  const playing = state === "playing",
    paused = state === "paused",
    loading = state === "loading",
    busy = playing || paused || loading;
  $("playButton").innerHTML = icon(
    playing ? "pause" : loading ? "stop" : "play",
  );
  $("playButton").setAttribute(
    "aria-label",
    playing
      ? "Pause"
      : paused
        ? "Resume"
        : loading
          ? "Cancel preparation"
          : "Play",
  );
  $("stopButton").disabled = !busy;
  $("previousPassage").disabled = !activeSegments.length || index <= 0;
  $("nextPassage").disabled =
    !activeSegments.length || index >= activeSegments.length - 1;
  $("playerDetail").textContent =
    detail ||
    {
      idle: activeSegments.length
        ? "Ready when you are"
        : "Choose something good to read",
      playing: "Now playing · on your device",
      paused: "Paused · take your time",
      finished: "A good read, well listened",
      loading: "Preparing voice…",
      error: "Choose a voice and try again",
    }[state];
  $("positionRange").value = index;
  $("progressLabel").textContent =
    `${activeSegments.length ? index + 1 : 0} / ${activeSegments.length}`;
  $("durationLabel").textContent = activeSegments.length
    ? `~${Math.max(1, Math.ceil((current?.minutes || 1) / settings.speed))}m`
    : "—";
  if (
    current &&
    current.position !== index &&
    ["playing", "loading", "idle"].includes(state)
  ) {
    current.position = index;
    if (!currentIsDraft) persist(current).catch(report);
  }
  if (state === "finished" && current) {
    current.completed = true;
    if (!currentIsDraft) persist(current).catch(report);
    toast("You’ve reached the end. Nice listening.");
  }
  if (activeSegments.length && view === "reader") {
    if (lastRenderedIndex !== index) {
      renderPassages();
      lastRenderedIndex = index;
      const active = $("textContent").querySelector(".passage.active");
      if (playing && active) {
        const rect = active.getBoundingClientRect();
        if (rect.bottom > innerHeight - 130 || rect.top < 30)
          active.scrollIntoView({
            block: "center",
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
          });
      }
    }
    if (pdf) {
      const activePage = activeSegments[index]?.page;
      if (Number.isInteger(activePage) && activePage !== pdfPage && playing) {
        pdfPage = activePage;
        updatePdfToolbar();
      }
      renderPdfHighlights();
      if (playing) revealPdfSegment(index);
    }
  }
  if (state === "error")
    toast(detail, { label: "Voice settings", run: showSettings }, true);
}
function playbackOptions() {
  return {
    engine: settings.engine,
    voice: settings.voice,
    speed: settings.speed,
    transform: async (segment, { signal } = {}) => {
      if (!settings.smart) return segment.original_text;
      const local = segment.original_text
        .split("\n")
        .map((line) => {
          const result = verbalizeRuleBasedNative(line);
          return result.text || line;
        })
        .join(" ");
      return prepareSpeechText(segment, {
        enabled: settings.llm,
        fallback: local,
        signal,
        request: window.__TAURI__?.core
          ? (payload) =>
              window.__TAURI__.core.invoke("prepare_speech_native", {
                text: payload.text,
                isCode: payload.is_code,
              })
          : null,
      });
    },
  };
}
async function playToggle() {
  if (!activeSegments.length) return;
  if (player.state === "loading") player.stop();
  else if (["playing", "paused"].includes(player.state))
    await player.togglePause();
  else {
    if (current.completed && player.index === activeSegments.length - 1)
      player.index = 0;
    current.completed = false;
    await player.play(activeSegments, player.index, playbackOptions());
  }
}
async function seek(
  index,
  { autoplay = false, reveal = true, firstText = "" } = {},
) {
  index = Math.max(0, Math.min(activeSegments.length - 1, index));
  const resume = autoplay || ["playing", "loading"].includes(player.state);
  player.stop();
  player.index = index;
  if (current) current.completed = false;
  updatePlayer({ state: "idle", index });
  if (pdf) {
    pdfPage = activeSegments[index].page;
    updatePdfToolbar();
    renderPdfHighlights();
    if (reveal) revealPdfSegment(index);
  }
  if (resume)
    await player.play(activeSegments, index, {
      ...playbackOptions(),
      firstText,
    });
}
async function toggleFavorite(doc) {
  const old = doc.favorite;
  doc.favorite = !old;
  try {
    await persist(doc);
  } catch (error) {
    doc.favorite = old;
    throw error;
  }
  if (view === "reader") {
    $("favoriteReader").classList.toggle("is-favorite", doc.favorite);
    $("favoriteReader").setAttribute("aria-pressed", doc.favorite);
  } else renderLibrary();
}
async function remove(doc) {
  doc.deleted = Date.now();
  try {
    await persist(doc);
  } catch (error) {
    delete doc.deleted;
    throw error;
  }
  if (current?.id === doc.id) {
    player.stop();
    activeSegments = [];
    current = null;
    $("playButton").disabled = true;
    $("positionRange").disabled = true;
    $("playerTitle").textContent = "Your listening space";
    updatePlayer({ state: "idle", index: 0 });
  }
  renderLibrary();
  toast("Moved to Recently deleted.", {
    label: "Undo",
    run: () => restore(doc),
  });
}
async function restore(doc) {
  const deleted = doc.deleted;
  delete doc.deleted;
  try {
    await persist(doc);
  } catch (error) {
    doc.deleted = deleted;
    throw error;
  }
  renderLibrary();
  toast("Document restored to your library.");
}
function rename(doc) {
  dialog(
    "A new name, same good read.",
    `<label class="dialog-field">Document title<input id="renameInput" maxlength="120" value="${escape(doc.title)}"></label><div class="dialog-actions"><button class="secondary" id="cancelRename">Cancel</button><button class="primary" id="saveRename">Save name</button></div>`,
  );
  $("cancelRename").onclick = closeDialog;
  const save = async () => {
    const title = $("renameInput").value.trim();
    if (!title) return toast("Give your document a title.", null, true);
    const previous = doc.title;
    doc.title = title;
    try {
      await persist(doc);
    } catch (error) {
      doc.title = previous;
      throw error;
    }
    closeDialog();
    renderLibrary();
    if (current?.id === doc.id) {
      $("playerTitle").textContent = title;
      $("readerTitle").textContent = title;
    }
    toast("Document renamed.");
  };
  $("saveRename").onclick = () => save().catch(report);
  $("renameInput").onkeydown = (e) => {
    if (e.key === "Enter") save().catch(report);
  };
  $("renameInput").focus();
  $("renameInput").select();
}
function updateDraftCounts() {
  const text = $("draftText").value;
  $("draftCount").textContent =
    `${words(text).toLocaleString()} words · ${text.length.toLocaleString()} / 100,000 characters`;
  $("undoEdit").disabled = !history.past.length;
  $("redoEdit").disabled = !history.future.length;
}
function draftSnapshot() {
  return {
    title: $("draftTitle").value,
    text: $("draftText").value,
    id: draft.id,
  };
}
async function restoreDraft(snapshot) {
  if (!snapshot) return;
  draft = snapshot;
  $("draftTitle").value = draft.title;
  $("draftText").value = draft.text;
  updateDraftCounts();
  await persistDraft();
}
async function saveDraftToLibrary(open = false) {
  await persistDraft();
  if (!draft.text.trim())
    throw new Error("Add some words before saving your document.");
  const title =
    draft.title.trim() || draft.text.trim().split("\n")[0].slice(0, 70);
  const valid = validateDocument({ kind: "text", title, text: draft.text });
  let doc = docs.find((d) => d.id === draft.id && !d.deleted);
  if (doc) {
    doc = {
      ...doc,
      title,
      text: draft.text,
      position: 0,
      completed: false,
      bookmarks: [],
      updated: Date.now(),
    };
  } else doc = valid;
  doc.segments = textSegments(doc.text);
  doc.minutes = minutes(doc.text);
  await persist(doc);
  const index = docs.findIndex((d) => d.id === doc.id);
  if (index >= 0) docs[index] = doc;
  else docs.unshift(doc);
  draft.id = doc.id;
  await persistDraft();
  if (current?.id === doc.id) {
    player.stop();
    current = doc;
    activeSegments = doc.segments;
    player.index = 0;
    $("playerTitle").textContent = doc.title;
    updatePlayer({ state: "idle", index: 0 });
  }
  toast("Saved to your library.", {
    label: "Open reader",
    run: () => openDocument(doc.id),
  });
  if (open) await openDocument(doc.id);
  renderLibrary();
}
async function listenDraft() {
  await saveDraftToLibrary(true);
  await playToggle();
}
async function clearDraft() {
  history.push(draftSnapshot());
  draft = { title: "", text: "", id: null };
  await restoreDraft(draft);
  toast("Draft cleared.", {
    label: "Undo",
    run: () => restoreDraft(history.undo(draftSnapshot())),
  });
}
async function verbalizeDraft() {
  const input = $("draftText"),
    before = draftSnapshot(),
    start = input.selectionStart,
    end = input.selectionEnd;
  const selected = end > start,
    text = selected ? input.value.slice(start, end) : input.value;
  if (!text.trim())
    throw new Error("Add code or select a passage to make it speakable.");
  const transformed = text
    .split("\n")
    .map((line) => verbalizeRuleBasedNative(line).text || line)
    .join("\n");
  const next = selected
    ? input.value.slice(0, start) + transformed + input.value.slice(end)
    : transformed;
  if (next.length > MAX_TEXT)
    throw new Error(
      "This transformation would exceed the 100,000-character limit. Select a smaller passage.",
    );
  history.push(before);
  input.value = next;
  updateDraftCounts();
  await persistDraft();
  toast("Made speakable with local rules.", {
    label: "Undo",
    run: () => restoreDraft(history.undo(draftSnapshot())),
  });
}
async function loadVoices() {
  if (window.__TAURI__?.core) {
    try {
      systemVoices = await window.__TAURI__.core.invoke("get_system_voices");
    } catch {
      systemVoices = [];
    }
  }
  if (
    (!window.__TAURI__?.core || !systemVoices.length) &&
    window.speechSynthesis
  )
    systemVoices = speechSynthesis
      .getVoices()
      .filter((v) => v.localService)
      .map((v) => ({ name: v.name, lang: v.lang }));
  systemVoices.sort(
    (a, b) =>
      (b.lang.startsWith("en") ? 1 : 0) - (a.lang.startsWith("en") ? 1 : 0) ||
      a.name.localeCompare(b.name),
  );
  if (!settings.voice && systemVoices.some((v) => v.name === "Samantha"))
    settings.voice = "Samantha";
  updateVoiceLabel();
}
function updateVoiceLabel() {
  $("voiceName").textContent =
    settings.engine !== "system"
      ? "Kokoro voice"
      : settings.voice || "System voice";
}
async function showSettings() {
  await loadVoices();
  dialog(
    "A voice that feels right.",
    `<p class="dialog-copy">Choose your listening companion. Everything runs locally without Python.</p><label class="dialog-field">Speech engine<select id="engineSelect"><option value="system">System · built into your device</option><option value="neural">Kokoro · local neural voice</option></select></label><p class="hint" id="engineHint"></p><label class="dialog-field">Voice<select id="voiceSelect"></select></label><label class="dialog-field">Playback speed<select id="settingsSpeed">${[0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => `<option value="${speed}">${speed}×${speed === 1 ? " · natural pace" : ""}</option>`).join("")}</select></label><div class="label-row"><label for="settingsSmart">Prepare text for natural speech</label><input id="settingsSmart" type="checkbox" class="switch"></div><p class="hint">Makes code, notation, abbreviations, measurements, links, and other written forms easier to hear. Original documents are always preserved.</p><div class="label-row"><label for="settingsLlm">Use native local LLM to prepare speech</label><input id="settingsLlm" type="checkbox" class="switch"></div><p class="hint">Enabled by default for every passage and every voice. A compact llama.cpp model runs with Metal and rules provide the fallback.</p><div class="dialog-actions"><button class="secondary" id="localModels">Local model</button><button class="secondary" id="showWelcomeAgain">Quick tour</button><button class="primary" id="applySettings">Save preferences</button></div>`,
    "MADE FOR YOUR EARS",
  );
  document.querySelector('label[for="settingsLlm"]').textContent =
    "Use native local LLM to prepare speech";
  $("engineSelect").value = settings.engine;
  $("settingsSpeed").value = settings.speed;
  $("settingsSmart").checked = settings.smart;
  $("settingsLlm").checked = settings.llm;
  const syncLlmSetting = () => {
    $("settingsLlm").disabled = !$("settingsSmart").checked;
  };
  syncLlmSetting();
  $("settingsSmart").onchange = syncLlmSetting;
  const populate = () => {
    const neural = $("engineSelect").value !== "system";
    $("voiceSelect").innerHTML = neural
      ? [
          ["af_heart", "Heart · warm American"],
          ["af_bella", "Bella · expressive American"],
          ["am_adam", "Adam · deep American"],
          ["bf_emma", "Emma · conversational British"],
          ["bm_george", "George · formal British"],
        ]
          .map(([value, label]) => `<option value="${value}">${label}</option>`)
          .join("")
      : `<option value="">Device default</option>${systemVoices.map((voice) => `<option value="${escape(voice.name)}">${escape(voice.name)} · ${escape(voice.lang)}</option>`).join("")}`;
    if (
      [...$("voiceSelect").options].some(
        (option) => option.value === settings.voice,
      )
    )
      $("voiceSelect").value = settings.voice;
    $("engineHint").textContent = neural
      ? "First play downloads the quantized Kokoro model. Desktop inference then runs in native Rust without Python; browser preview uses a worker."
      : window.__TAURI__?.core
        ? "Native macOS audio supports WAV export. No model download is needed."
        : "Browser system speech is ready to use. Offline availability depends on installed system voices.";
  };
  populate();
  $("engineSelect").onchange = populate;
  $("showWelcomeAgain").onclick = showWelcome;
  $("localModels").onclick = () => showModels().catch(report);
  $("applySettings").onclick = async () => {
    try {
      const next = {
        engine: $("engineSelect").value,
        voice: $("voiceSelect").value,
        speed: Number($("settingsSpeed").value),
        smart: $("settingsSmart").checked,
        llm: $("settingsLlm").checked,
      };
      await saveSetting("preferences", next);
      player.stop();
      settings = next;
      $("speedSelect").value = settings.speed;
      $("smartCode").checked = settings.smart;
      updateVoiceLabel();
      closeDialog();
      toast("Your listening preferences are saved.");
    } catch (error) {
      report(error);
    }
  };
}
function showShortcuts() {
  const mod = navigator.platform.includes("Mac") ? "⌘" : "Ctrl";
  dialog(
    "Stay in the flow.",
    `<p class="dialog-copy">A few shortcuts for a little less clicking.</p>${[
      ["Add a document", `${mod} O`],
      ["Search your library", `${mod} K`],
      ["Text studio", `${mod} N`],
      ["Save draft to library", `${mod} S`],
      ["Play / pause", "Space"],
      ["Previous / next passage", "← / →"],
      ["Bookmark current passage", "B"],
      ["Show shortcuts", "?"],
      ["Close a dialog", "Esc"],
      ["Undo / redo draft edit", `${mod} Z / ${mod} Shift Z`],
    ]
      .map(
        ([label, key]) =>
          `<div class="shortcut-row"><span>${label}</span><kbd>${key}</kbd></div>`,
      )
      .join(
        "",
      )}<p class="hint">Reading shortcuts stay out of the way while you type. Undo buttons also recover Clear and code transformations.</p>`,
    "SMALL SHORTCUTS. MORE FOCUS.",
  );
}
function showWelcome() {
  dialog(
    "A little more room to listen.",
    `<img class="onboarding-mark" src="./static/brand-symbol.svg" width="70" height="70" alt="9-gyo-phi document and sound mark"><p class="dialog-copy">Welcome to your listening room. A quiet home for the words you want to spend more time with.</p><div class="welcome-lines"><div>${icon("file")}<span><strong>Bring your own words.</strong><br>Import a PDF, EPUB, HTML article, Markdown file, or start a note.</span></div><div>${icon("headphones")}<span><strong>Find your rhythm.</strong><br>Choose a voice. Set the pace. Pick up where you left off.</span></div><div>${icon("shield")}<span><strong>Keep it yours.</strong><br>No account. Local storage. Export a backup anytime.</span></div></div><div class="dialog-actions"><button class="secondary" id="skipWelcome">Explore my library</button><button class="primary" id="welcomeSample">Try a 2-minute read ${icon("arrow")}</button></div>`,
    "WELCOME TO 9-GYO-PHI",
  );
  const finish = async (sample) => {
    await saveSetting("onboarded", true);
    closeDialog();
    if (sample) await addTemplate("focus");
  };
  $("skipWelcome").onclick = () => finish(false).catch(report);
  $("welcomeSample").onclick = () => finish(true).catch(report);
}
function audiobookUrl(audiobook) {
  if (audiobook.path && window.__TAURI__?.core?.convertFileSrc)
    return window.__TAURI__.core.convertFileSrc(audiobook.path);
  return audiobook.path || "";
}

async function createAudiobook(existing = null) {
  if (!current || !window.__TAURI__?.core)
    throw new Error("Complete M4B creation is available in the desktop app.");
  const sourceDocument = current;
  const audiobookId = existing?.id || crypto.randomUUID();
  player.stop();
  audiobookController?.abort();
  audiobookController = new AbortController();
  const signal = audiobookController.signal;
  const studio = new Player(({ state, detail }) => {
    const status = $("audiobookStatus");
    if (status && state === "loading" && detail) status.textContent = detail;
  });
  signal.addEventListener("abort", () => studio.stop(), { once: true });
  dialog(
    "Creating your audiobook.",
    `<p class="dialog-copy">Preparing every passage locally, then recording with Kokoro and packaging an M4B audiobook. Keep the app open until encoding finishes.</p><progress id="audiobookProgress" max="100" value="0"></progress><p class="dialog-status" id="audiobookStatus">Starting Kokoro…</p><div class="dialog-actions"><button class="secondary" id="cancelAudiobook">Cancel</button></div>`,
    "LOCAL AUDIOBOOK STUDIO",
  );
  $("cancelAudiobook").onclick = closeDialog;
  try {
    await window.__TAURI__.core.invoke("start_audiobook", { id: audiobookId });
    const options = playbackOptions();
    const voice = /^.[fm]_/.test(settings.voice) ? settings.voice : "af_heart";
    for (const [index, segment] of activeSegments.entries()) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const prepared = options.transform
        ? await options.transform(segment, { signal })
        : segment.original_text;
      const buffer = await studio.synthesize(
        prepared,
        { engine: "neural", voice, speed: settings.speed, offline: true },
        studio.generation,
      );
      if (!buffer || signal.aborted)
        throw new DOMException("Cancelled", "AbortError");
      const floats = buffer.getChannelData(0);
      for (let offset = 0; offset < floats.length; offset += 32_768) {
        const end = Math.min(floats.length, offset + 32_768);
        const samples = new Int16Array(end - offset);
        for (let sample = offset; sample < end; sample++)
          samples[sample - offset] = Math.round(
            Math.max(-1, Math.min(1, floats[sample])) * 32_767,
          );
        await window.__TAURI__.core.invoke("append_audiobook_pcm", {
          id: audiobookId,
          samples: Array.from(samples),
        });
      }
      await window.__TAURI__.core.invoke("append_audiobook_pcm", {
        id: audiobookId,
        samples: Array(Math.round(24_000 * 0.22)).fill(0),
      });
      const percent = Math.round(((index + 1) / activeSegments.length) * 100);
      $("audiobookProgress").value = percent;
      $("audiobookStatus").textContent =
        `Narrating passage ${(index + 1).toLocaleString()} of ${activeSegments.length.toLocaleString()} · ${percent}%`;
    }
    $("audiobookStatus").textContent = "Encoding M4B audiobook…";
    const completed = await window.__TAURI__.core.invoke("finish_audiobook", {
      id: audiobookId,
    });
    studio.stop();
    studio.worker?.terminate();
    await studio.ctx?.close();
    const audiobook = {
      id: completed.id,
      docId: sourceDocument.id,
      title: sourceDocument.title,
      duration: completed.duration,
      size: completed.size,
      path: completed.path,
      position: existing?.position || 0,
      created: Date.now(),
    };
    await saveAudiobook(audiobook);
    audiobookController = null;
    await showExport();
    toast("Your local M4B audiobook is ready.");
  } catch (error) {
    const cancelled = error.name === "AbortError";
    studio.stop();
    studio.worker?.terminate();
    await studio.ctx?.close();
    await window.__TAURI__.core
      .invoke("cancel_audiobook", { id: audiobookId })
      .catch(() => {});
    audiobookController = null;
    if (!cancelled) throw error;
  }
}

async function showExport() {
  if (!current) return;
  const sourceFormat = documentFormat(current);
  const hasOriginal = sourceFormat !== "txt";
  let audiobook = await getAudiobookForDocument(current.id);
  if (audiobook && window.__TAURI__?.core && !audiobook.path) {
    try {
      audiobook.path = await window.__TAURI__.core.invoke(
        "get_audiobook_path",
        { id: audiobook.id },
      );
      await saveAudiobook(audiobook);
    } catch {
      audiobook = null;
    }
  }
  const audiobookMarkup = audiobook
    ? `<section class="audiobook-card"><div><strong>Local audiobook</strong><small>${Math.max(1, Math.round(audiobook.duration / 60)).toLocaleString()} min · ${(audiobook.size / 1024 / 1024).toFixed(1)} MB · M4B</small></div><audio id="audiobookPlayer" controls preload="metadata" src="${audiobookUrl(audiobook)}"></audio><div class="dialog-actions"><button class="secondary" id="rebuildAudiobook">Rebuild</button><button class="secondary" id="downloadAudiobook">Download .m4b</button></div></section>`
    : `<button class="dialog-option" id="createAudiobook" ${window.__TAURI__?.core ? "" : "disabled"}>${icon("headphones")}<span><strong>Create complete audiobook (.m4b)</strong><small>All passages · local speech preparation · Kokoro narration · saved on this device</small></span>${icon("arrow")}</button>`;
  dialog(
    "Take your words with you.",
    `<p class="dialog-copy">Export “${escape(current.title)}” in a format that fits your next step.</p>${audiobookMarkup}<button class="dialog-option" id="exportText">${icon("file")}<span><strong>Plain text (.txt)</strong><small>The complete listening transcript, plus your notes</small></span>${icon("download")}</button>${hasOriginal ? `<button class="dialog-option" id="exportOriginal">${icon("file")}<span><strong>Original document (.${sourceFormat})</strong><small>Your source file, exactly as imported</small></span>${icon("download")}</button>` : ""}<button class="dialog-option" id="exportWav" ${!player.buffers.length ? "disabled" : ""}>${icon("voice")}<span><strong>Recorded session (.wav)</strong><small>${player.buffers.length ? `${Math.round(player.recordedSeconds)} seconds from this playback session · up to 30 minutes` : "Available after playback with native desktop or neural voices"}</small></span>${icon("download")}</button><p class="hint">M4B audiobooks include the complete imported PDF, EPUB, HTML, Markdown, or text book and remain in local app storage for playback. Session WAV contains only passages already played.</p>`,
    "KEEP SOMETHING GOOD",
  );
  if ($("createAudiobook"))
    $("createAudiobook").onclick = () => createAudiobook().catch(report);
  if (audiobook) {
    const audio = $("audiobookPlayer");
    audio.onloadedmetadata = () => {
      if (audiobook.position > 0 && audiobook.position < audio.duration)
        audio.currentTime = audiobook.position;
    };
    audio.onplay = () => player.stop();
    audio.ontimeupdate = () => {
      clearTimeout(audiobookPositionTimer);
      audiobookPositionTimer = setTimeout(() => {
        audiobook = { ...audiobook, position: audio.currentTime };
        saveAudiobook(audiobook).catch(report);
      }, 800);
    };
    $("rebuildAudiobook").onclick = () =>
      createAudiobook(audiobook).catch(report);
    $("downloadAudiobook").onclick = async () => {
      try {
        const response = await fetch(audiobookUrl(audiobook));
        if (!response.ok)
          throw new Error("The local audiobook could not be read.");
        download(await response.blob(), `${current.title}.m4b`);
        toast("M4B audiobook downloaded.");
      } catch (error) {
        report(error);
      }
    };
  }
  $("exportText").onclick = () => {
    download(
      new Blob(
        [
          `${current.title}\n\n${current.kind === "text" ? current.text : current.segments.map((s) => s.original_text).join("\n\n")}${current.notes ? `\n\nMY NOTES\n${current.notes}` : ""}`,
        ],
        { type: "text/plain;charset=utf-8" },
      ),
      `${current.title}.txt`,
    );
    toast("Text export downloaded.");
  };
  if ($("exportOriginal"))
    $("exportOriginal").onclick = async () => {
      try {
        const bytes = await getDocumentBytes(current.id);
        if (!bytes)
          throw new Error("The saved source file could not be found.");
        download(
          new Blob([bytes], {
            type:
              sourceFormat === "pdf"
                ? "application/pdf"
                : sourceFormat === "epub"
                  ? "application/epub+zip"
                  : sourceFormat === "html"
                    ? "text/html"
                    : "text/markdown",
          }),
          `${current.title}.${sourceFormat}`,
        );
        toast("Original document downloaded.");
      } catch (error) {
        report(error);
      }
    };
  $("exportWav").onclick = () => {
    try {
      download(player.export(), `${current.title}.wav`);
      toast("Audio export downloaded.");
    } catch (error) {
      report(error);
    }
  };
}
function showBackup() {
  dialog(
    "Your library, to keep.",
    `<p class="dialog-copy">Backups include documents, PDFs, notes, favorites, bookmarks, and reading positions. Store a copy somewhere safe before clearing app data.</p><button class="dialog-option" id="exportBackup">${icon("download")}<span><strong>Export library backup</strong><small>${docs.filter((d) => !d.deleted).length} documents · JSON file · excludes recently deleted</small></span>${icon("arrow")}</button><button class="dialog-option" id="importBackup">${icon("archive")}<span><strong>Restore from a backup</strong><small>Import as new copies. Existing documents stay intact.</small></span>${icon("arrow")}</button><p class="hint">Backups contain the full document text. Keep them private. Maximum backup size: 100 MB and 200 documents.</p>`,
    "ALWAYS YOURS",
  );
  $("exportBackup").onclick = () => exportBackup().catch(report);
  $("importBackup").onclick = () => {
    closeDialog();
    $("backupInput").click();
  };
}
async function exportBackup() {
  if (view === "reader") await persistNotes();
  const collection = docs.filter((d) => !d.deleted);
  if (collection.length > 200)
    throw new Error(
      "This library exceeds the 200-document backup limit. Export individual documents.",
    );
  if (
    collection.reduce(
      (n, d) =>
        n +
        (d.sourceSize || d.pdfSize || 0) * 1.34 +
        (d.text?.length || 0) * 4 +
        (d.notes?.length || 0) * 4,
      0,
    ) >
    95 * 1024 * 1024
  )
    throw new Error(
      "This backup would exceed 100 MB. Export individual PDFs from the reader.",
    );
  const items = [];
  for (const doc of collection) {
    const item = {
      kind: doc.kind,
      sourceFormat: documentFormat(doc),
      sourceSize: doc.sourceSize || doc.pdfSize || 0,
      layoutParser: doc.layoutParser || "",
      sourceUrl: doc.sourceUrl || "",
      editable: doc.editable !== false,
      title: doc.title,
      text: doc.text,
      notes: doc.notes,
      favorite: doc.favorite,
      bookmarks: doc.bookmarks,
      position: doc.position,
    };
    if (documentFormat(doc) !== "txt") {
      const stored = await getDocumentBytes(doc.id);
      if (!stored)
        throw new Error(
          `The source file for ${doc.title} is missing. Reimport it before backing up.`,
        );
      const bytes = new Uint8Array(stored);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      item.source = btoa(binary);
      if (doc.kind === "pdf") item.pdf = item.source;
    }
    items.push(item);
  }
  download(
    new Blob(
      [
        JSON.stringify({
          format: "9-gyo-phi",
          version: 1,
          exportedAt: new Date().toISOString(),
          documents: items,
        }),
      ],
      { type: "application/json" },
    ),
    `9-gyo-phi-backup-${new Date().toISOString().slice(0, 10)}.json`,
  );
  toast("Library backup downloaded.");
}
async function restoreBackup(file) {
  if (!file) return;
  if (file.size > 100 * 1024 * 1024)
    throw new Error("Choose a backup smaller than 100 MB.");
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    throw new Error("This is not valid JSON. Choose a 9-gyo-phi backup file.");
  }
  if (
    !backup ||
    typeof backup !== "object" ||
    backup.format !== "9-gyo-phi" ||
    backup.version !== 1 ||
    !Array.isArray(backup.documents) ||
    backup.documents.length > 200
  )
    throw new Error(
      "Unsupported backup. Choose a version 1 backup with at most 200 documents.",
    );
  const imported = [];
  for (const raw of backup.documents) {
    const doc = validateDocument(raw);
    const sourceFormat = documentFormat(doc);
    if (sourceFormat !== "txt") {
      const encoded = raw.source || (sourceFormat === "pdf" ? raw.pdf : null);
      const sourceLimit = sourceFormat === "pdf" ? MAX_PDF : MAX_DOCUMENT;
      if (typeof encoded !== "string" || encoded.length > sourceLimit * 1.34)
        throw new Error(
          "The backup contains a missing or oversized source document.",
        );
      let bytes;
      try {
        bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)).buffer;
      } catch {
        throw new Error("The backup contains invalid source document data.");
      }
      doc.sourceBytes = bytes;
      doc.sourceSize = bytes.byteLength;
      if (sourceFormat === "pdf") {
        const parsed = await loadPdf(bytes);
        try {
          if (parsed.numPages > 500)
            throw new Error("PDFs in backups must have 500 pages or fewer.");
          const data = await parsePdfInBrowser(parsed);
          data.parser = "pdfjs";
          if (!data.segments.length)
            throw new Error("A PDF in this backup has no readable text.");
          doc.segments = data.segments;
          doc.pageCount = data.num_pages;
          doc.pdfPages = data.pages;
          doc.layoutParser = data.parser;
          doc.pdfParserVersion = PDF_PARSER_VERSION;
          doc.minutes = minutes(
            data.segments.map((s) => s.original_text).join(" "),
          );
        } finally {
          await parsed.destroy();
        }
      } else {
        const data = parseStructuredDocument(
          `${doc.title}.${sourceFormat}`,
          bytes,
        );
        doc.segments = data.segments;
        doc.segmentVersion = 3;
        doc.text = data.segments
          .map((segment) => segment.original_text)
          .join("\n\n");
        doc.layoutParser = data.parser;
        doc.pageCount = data.num_pages || 0;
        doc.minutes = minutes(doc.text);
      }
    } else {
      doc.segments = textSegments(doc.text);
      doc.minutes = minutes(doc.text);
    }
    doc.position = Math.min(doc.position, Math.max(0, doc.segments.length - 1));
    doc.bookmarks = doc.bookmarks.filter((n) => n < doc.segments.length);
    imported.push(doc);
  }
  await importDocuments(imported);
  imported.forEach((doc) => {
    delete doc.pdfBytes;
    delete doc.sourceBytes;
  });
  $("saveStatus").textContent = "All changes saved";
  docs.unshift(...imported);
  changeView("library");
  toast(`${imported.length} documents restored as new copies.`);
}

hydrate();
document.querySelector(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  changeView("library");
});
document
  .querySelectorAll("[data-view]")
  .forEach(
    (button) => (button.onclick = () => changeView(button.dataset.view)),
  );
document.querySelectorAll("[data-filter]").forEach(
  (button) =>
    (button.onclick = () => {
      filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((b) => {
        b.classList.toggle("active", b === button);
        b.setAttribute("aria-pressed", b === button);
      });
      renderLibrary();
    }),
);
document
  .querySelectorAll("[data-template]")
  .forEach(
    (button) =>
      (button.onclick = () =>
        addTemplate(button.dataset.template).catch(report)),
  );
on("addDocument", "click", showImport);
on("heroImport", "click", showImport);
on("trySample", "click", () => addTemplate("focus"));
on("newText", "click", newDraft);
on("backLibrary", "click", () => changeView("library"));
on("closeDialog", "click", closeDialog);
on("appDialog", "click", (event) => {
  if (event.target === $("appDialog")) {
    const r = $("appDialog").getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      closeDialog();
  }
});
on("voiceSettings", "click", showSettings);
on("mobileSettings", "click", showSettings);
on("mobileShortcuts", "click", showShortcuts);
on("playerVoice", "click", showSettings);
on("shortcuts", "click", showShortcuts);
on("backupButton", "click", showBackup);
on("exportDocument", "click", showExport);
on("fileInput", "change", (event) => importFiles([...event.target.files]));
on("backupInput", "change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  await restoreBackup(file);
});
let searchTimer;
on("librarySearch", "input", () => {
  query = $("librarySearch").value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderLibrary, 100);
});
on("sortSelect", "change", renderLibrary);
on("documentGrid", "click", async (event) => {
  const button = event.target.closest("[data-action]"),
    card = event.target.closest("[data-id]");
  if (!button || !card) return;
  const doc = docs.find((d) => d.id === card.dataset.id);
  if (!doc) return;
  button.disabled = true;
  try {
    switch (button.dataset.action) {
      case "open":
        await openDocument(doc.id);
        break;
      case "favorite":
        await toggleFavorite(doc);
        break;
      case "delete":
        await remove(doc);
        break;
      case "restore":
        await restore(doc);
        break;
      case "rename":
        rename(doc);
        break;
    }
  } finally {
    button.disabled = false;
  }
});
for (const id of ["draftTitle", "draftText"]) {
  $(id).addEventListener("beforeinput", () => {
    history.push(draftSnapshot());
  });
  on(id, "input", () => {
    updateDraftCounts();
    draftSavedRevision = -1;
    clearTimeout(draftTimer);
    $("draftSaved").textContent = "Saving…";
    draftTimer = setTimeout(() => persistDraft().catch(report), 350);
  });
}
on("undoEdit", "click", () => restoreDraft(history.undo(draftSnapshot())));
on("redoEdit", "click", () => restoreDraft(history.redo(draftSnapshot())));
on("clearDraft", "click", clearDraft);
on("verbalizeDraft", "click", verbalizeDraft);
on("saveDraft", "click", () => saveDraftToLibrary());
on("listenDraft", "click", listenDraft);
on("editDocument", "click", async () => {
  if (!current || current.kind !== "text") return;
  if (draft.text.trim() && draft.id !== current.id) {
    dialog(
      "Keep your current draft?",
      `<p class="dialog-copy">You have an unfinished draft in Text studio. Save it before editing this document, or replace it with a recoverable edit.</p><div class="dialog-actions"><button class="secondary" id="keepDraft">Go to draft</button><button class="primary" id="replaceDraft">Edit this document</button></div>`,
    );
    $("keepDraft").onclick = () => {
      closeDialog();
      changeView("writer");
    };
    $("replaceDraft").onclick = () => {
      history.push({ ...draft });
      loadCurrentIntoDraft().catch(report);
    };
  } else await loadCurrentIntoDraft();
});
async function loadCurrentIntoDraft() {
  draft = { title: current.title, text: current.text, id: current.id };
  closeDialog();
  changeView("writer");
  await persistDraft();
}
on("favoriteReader", "click", () => current && toggleFavorite(current));
on("bookmarkPassage", "click", async () => {
  if (!current) return;
  const index = player.index,
    previous = [...(current.bookmarks || [])];
  current.bookmarks = previous.includes(index)
    ? previous.filter((n) => n !== index)
    : [...previous, index];
  try {
    await persist(current);
  } catch (error) {
    current.bookmarks = previous;
    throw error;
  }
  renderPassages();
  toast(
    current.bookmarks.includes(index)
      ? "Passage bookmarked."
      : "Bookmark removed.",
  );
});
on("documentNotes", "input", () => {
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => persistNotes().catch(report), 350);
});
on("passageSearch", "input", renderPassages);
for (const id of ["passageList", "textContent"])
  on(id, "click", (event) => {
    const target = event.target.closest("[data-segment]");
    if (target) return seek(Number(target.dataset.segment));
  });
on("pdfPages", "click", (event) => {
  const playLink = event.target.closest(".pdf-link-play[data-segment]");
  if (playLink) {
    event.preventDefault();
    const index = Number(playLink.dataset.segment);
    const wordIndex = Number(playLink.dataset.word);
    const firstText =
      playLink.dataset.firstText ||
      (Number.isInteger(wordIndex)
        ? (activeSegments[index]?.word_boxes || [])
            .slice(wordIndex)
            .map((word) => word.text)
            .join(" ")
        : "");
    return seek(index, { autoplay: true, reveal: false, firstText });
  }
  const link = event.target.closest(".pdf-link-target");
  if (link) {
    event.preventDefault();
    if (link.dataset.pdfUrl) return openPdfUrl(link.dataset.pdfUrl);
    if (link.dataset.pdfPage !== undefined)
      return goToPdfPage(Number(link.dataset.pdfPage));
    return goToPdfDestination(link._pdfDestination, link.dataset.pdfAction);
  }
  const target = event.target.closest(
    ".pdf-text-target[data-segment], .pdf-word-target[data-segment]",
  );
  if (target) {
    const index = Number(target.dataset.segment);
    const wordIndex = Number(target.dataset.word);
    const firstText = Number.isInteger(wordIndex)
      ? (activeSegments[index]?.word_boxes || [])
          .slice(wordIndex)
          .map((word) => word.text)
          .join(" ")
      : "";
    return seek(Number(target.dataset.segment), {
      autoplay: true,
      reveal: false,
      firstText,
    });
  }
});
on("pdfViewport", "scroll", () => {
  cancelAnimationFrame(pdfScrollFrame);
  pdfScrollFrame = requestAnimationFrame(syncPdfPageFromScroll);
});
on("playButton", "click", playToggle);
on("stopButton", "click", () => player.stop());
on("previousPassage", "click", () => seek(player.index - 1));
on("nextPassage", "click", () => seek(player.index + 1));
on("positionRange", "change", (event) => seek(Number(event.target.value)));
on("speedSelect", "change", async () => {
  settings.speed = Number($("speedSelect").value);
  await saveSetting("preferences", settings);
  const resume = player.state === "playing";
  player.stop();
  if (resume)
    await player.play(activeSegments, player.index, playbackOptions());
  else toast(`Playback speed set to ${settings.speed}×.`);
});
on("smartCode", "change", async () => {
  settings.smart = $("smartCode").checked;
  await saveSetting("preferences", settings);
  toast(settings.smart ? "Natural code reading on." : "Reading original text.");
});
on("prevPage", "click", async () => {
  if (pdfPage > 0) {
    pdfPage--;
    updatePdfToolbar();
    scrollToPdfPage(pdfPage);
    renderVisiblePdfPages();
  }
});
on("nextPage", "click", async () => {
  if (pdf && pdfPage < pdf.numPages - 1) {
    pdfPage++;
    updatePdfToolbar();
    scrollToPdfPage(pdfPage);
    renderVisiblePdfPages();
  }
});
on("zoomIn", "click", async () => {
  pdfScale = Math.min(2, Math.round((pdfScale + 0.25) * 100) / 100);
  await renderPdfDocument();
});
on("zoomOut", "click", async () => {
  pdfScale = Math.max(0.75, pdfScale - 0.25);
  await renderPdfDocument();
});
on("zoomReset", "click", async () => {
  pdfScale = 1;
  await renderPdfDocument();
});
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (view === "reader" && pdf) renderPdfDocument().catch(report);
  }, 180);
});
window.addEventListener("keydown", (event) => {
  const editing = event.target.matches(
      'input,textarea,select,[contenteditable="true"]',
    ),
    mod = event.metaKey || event.ctrlKey;
  if ($("appDialog").open) return;
  let action;
  if (mod && event.key.toLowerCase() === "o") action = showImport;
  else if (mod && event.key.toLowerCase() === "k")
    action = () => {
      changeView("library");
      $("librarySearch").focus();
    };
  else if (mod && event.key.toLowerCase() === "n") action = newDraft;
  else if (mod && event.key.toLowerCase() === "s" && view === "writer")
    action = () => saveDraftToLibrary();
  else if (mod && event.key.toLowerCase() === "z" && view === "writer")
    action = () =>
      restoreDraft(
        event.shiftKey
          ? history.redo(draftSnapshot())
          : history.undo(draftSnapshot()),
      );
  else if (!editing && !mod) {
    if (event.key === "?") action = showShortcuts;
    else if (
      event.key === " " &&
      activeSegments.length &&
      !event.target.closest("button,a")
    )
      action = playToggle;
    else if (event.key === "ArrowRight" && activeSegments.length)
      action = () => seek(player.index + 1);
    else if (event.key === "ArrowLeft" && activeSegments.length)
      action = () => seek(player.index - 1);
    else if (event.key.toLowerCase() === "b" && view === "reader")
      action = () => $("bookmarkPassage").click();
  }
  if (action) {
    event.preventDefault();
    if (!event.repeat) Promise.resolve().then(action).catch(report);
  }
});
window.addEventListener("dragover", (event) => {
  if (event.dataTransfer.types.includes("Files")) {
    event.preventDefault();
    document.body.classList.add("drop-active");
  }
});
window.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget) document.body.classList.remove("drop-active");
});
window.addEventListener("drop", (event) => {
  event.preventDefault();
  document.body.classList.remove("drop-active");
  if (event.dataTransfer.files.length)
    importFiles([...event.dataTransfer.files]).catch(report);
});
window.addEventListener("offline", () => {
  $("connectionLabel").textContent = "Offline. Your library is here.";
  toast(
    "You’re offline. Saved documents and installed system voices remain available.",
  );
});
window.addEventListener("online", () => {
  $("connectionLabel").textContent = "Private. On your device.";
});
window.addEventListener("pagehide", () => {
  player.stop();
  if (view === "writer") persistDraft().catch(() => {});
  if (view === "reader") persistNotes().catch(() => {});
});
window.addEventListener("beforeunload", (event) => {
  if (view === "writer" && draftSavedRevision !== draftRevision) {
    event.preventDefault();
    event.returnValue = "";
  }
});
if (window.speechSynthesis)
  speechSynthesis.addEventListener("voiceschanged", () =>
    loadVoices().catch(report),
  );
async function initialize() {
  $("documentGrid").innerHTML =
    '<div class="loading-grid"></div><div class="loading-grid"></div><div class="loading-grid"></div>';
  try {
    const [storedDocs, storedDraft, preferences, onboarded] = await Promise.all(
      [
        listDocuments(),
        getSetting("draft"),
        getSetting("preferences"),
        getSetting("onboarded"),
      ],
    );
    docs = storedDocs;
    const migratedText = docs.filter(
      (doc) =>
        doc.kind === "text" &&
        (!doc.sourceFormat || doc.sourceFormat === "txt") &&
        doc.segmentVersion !== 2,
    );
    for (const doc of migratedText) {
      doc.segments = textSegments(doc.text);
      doc.segmentVersion = 2;
      doc.position = Math.min(
        doc.position || 0,
        Math.max(0, doc.segments.length - 1),
      );
    }
    if (migratedText.length) await importDocuments(migratedText);
    if (
      storedDraft &&
      typeof storedDraft.text === "string" &&
      typeof storedDraft.title === "string"
    )
      draft = {
        title: storedDraft.title.slice(0, 120),
        text: storedDraft.text.slice(0, MAX_TEXT),
        id: storedDraft.id || null,
      };
    if (preferences) {
      settings.engine = preferences.engine === "system" ? "system" : "neural";
      settings.voice =
        typeof preferences.voice === "string" ? preferences.voice : "";
      settings.speed = [0.75, 1, 1.25, 1.5, 1.75, 2].includes(preferences.speed)
        ? preferences.speed
        : 1;
      settings.smart = preferences.smart !== false;
      settings.llm = preferences.llm !== false;
    }
    $("speedSelect").value = settings.speed;
    $("smartCode").checked = settings.smart;
    renderLibrary();
    await loadVoices();
    if (!onboarded) showWelcome();
  } catch (error) {
    $("documentGrid").replaceChildren();
    $("emptyState").hidden = false;
    $("emptyState").querySelector("h3").textContent =
      "Let’s reconnect your library.";
    $("emptyState").querySelector("p").textContent =
      "Local storage could not open. Reload the app, or allow storage in your browser.";
    report(error);
  }
}
initialize();

async function showModels() {
  dialog(
    "Local speech model",
    `<p class="dialog-copy">Qwen runs through a small native llama.cpp binary with Metal acceleration. Python is not installed or started.</p><p class="dialog-status" id="modelStatus">Checking local model…</p><div id="modelRows"></div><div class="dialog-actions"><button class="secondary" id="retryModels">Refresh</button><button class="primary" id="backToVoices">Voice preferences</button></div>`,
  );
  $("retryModels").onclick = () => showModels().catch(report);
  $("backToVoices").onclick = () => showSettings().catch(report);
  try {
    if (!window.__TAURI__?.core)
      throw new Error(
        "Native model management is available in the desktop app.",
      );
    const data = await window.__TAURI__.core.invoke("native_llm_status");
    if (!$("modelRows")) return;
    $("modelStatus").textContent = data.installed
      ? data.running
        ? "Native model ready."
        : "Installed · starting automatically when needed."
      : "Optional model download · about 2.1 GB.";
    $("modelRows").innerHTML =
      `<div class="model-row"><strong>${escape(data.modelName)}</strong><p class="hint">Deterministic Q4 speech preparation on Apple Silicon Metal. Original passages remain unchanged.</p><div class="model-actions"><small>${data.installed ? `Installed · ${(data.size / 1024 / 1024 / 1024).toFixed(1)} GB` : "Not installed"}</small>${data.installed ? '<span class="status-tag">Installed</span>' : '<button class="secondary" id="downloadNativeLlm">Download</button>'}</div></div>`;
    if ($("downloadNativeLlm"))
      $("downloadNativeLlm").onclick = () => startModelDownload().catch(report);
  } catch (error) {
    if ($("modelStatus")) $("modelStatus").textContent = error.message;
  }
}
async function cancelModelDownload() {
  await window.__TAURI__.core.invoke("cancel_native_llm_download");
  toast("Model download cancelled.");
}
async function startModelDownload() {
  if ($("modelRows"))
    $("modelRows").innerHTML =
      '<button class="secondary" id="cancelModelDownload">Cancel download</button>';
  if ($("cancelModelDownload"))
    $("cancelModelDownload").onclick = () =>
      cancelModelDownload().catch(report);
  let unlisten;
  try {
    unlisten = await window.__TAURI__.event.listen(
      "native-llm-download",
      ({ payload }) => {
        if ($("modelStatus"))
          $("modelStatus").textContent =
            `Downloading native model · ${payload.percent || 0}%`;
      },
    );
    await window.__TAURI__.core.invoke("download_native_llm");
    if ($("modelStatus")) {
      toast("Native speech model installed.");
      await showModels();
    }
  } finally {
    unlisten?.();
  }
}
