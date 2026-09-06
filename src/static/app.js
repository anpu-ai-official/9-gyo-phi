import { engineRequest, readEvents } from "./engine.js";
import {
  MAX_TEXT,
  MAX_PDF,
  words,
  minutes,
  textSegments,
  validateDocument,
  History,
} from "./core.js";
import {
  getPdfBytes,
  listDocuments,
  saveDocument,
  getSetting,
  saveSetting,
  importDocuments,
} from "./storage.js";
import { parsePdfInBrowser, verbalizeRuleBasedNative } from "./parser.js";
import { Player } from "./audio.js";

const $ = (id) => document.getElementById(id);
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
  renderTask = null,
  openGeneration = 0,
  pageGeneration = 0;
let draft = { title: "", text: "", id: null },
  draftTimer,
  draftRevision = 0,
  draftSavedRevision = 0,
  notesTimer;
const history = new History();
let settings = { engine: "system", voice: "", speed: 1, smart: true };
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
    text: 'Code, spoken clearly\n\nSome ideas become easier to understand when you hear them. This short example walks through a small C program. Turn on “Speak code naturally” in the listening companion to hear punctuation and common syntax expressed as words.\n\n#include <stdio.h>\nmain()\n{\nprintf("Hello, world!");\nreturn 0;\n}\n\nA header makes standard input and output functions available. The main function is the starting point. The print statement writes a greeting, and returning zero signals a successful exit.\n\nThis app uses local rules for familiar syntax. It does not infer what arbitrary code does. Keep the original source beside the spoken version, and use your notes to record the important ideas.',
  },
  ideas: {
    title: "Make space for ideas",
    text: "Make space for ideas\n\nA good idea rarely arrives fully formed. More often it begins as a loose thread: a question during a walk, a sentence in a book, or a small frustration that refuses to go away.\n\nGive those threads somewhere to land. A short note is enough. Write what you noticed and why it matters. You can find the perfect words later.\n\nThen change the setting. Listen to your notes while making tea. Take a different route home. Explain the idea out loud as if you were telling a friend. A new rhythm can reveal a connection you missed on the page.\n\nWhen you return, look for the smallest useful next step. Sketch a possibility. Try a tiny experiment. Ask one clear question. Progress does not need a grand entrance.\n\nLeave some room in the day for an unfinished thought. Sometimes the most productive thing you can do is let an idea breathe.",
  },
};

function closeDialog() {
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
      (filter === "all" || d.kind === filter) &&
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
      return `<article class="document-card" data-id="${escape(doc.id)}"><button class="card-cover" data-action="open" data-color="${index % 3}" aria-label="Open ${escape(doc.title)}"><span class="card-type">${doc.kind === "pdf" ? "PDF DOCUMENT" : "TEXT DOCUMENT"}</span><span class="cover-ring"></span><span class="cover-book">${icon(doc.kind === "pdf" ? "file" : "voice")}</span></button>${!doc.deleted ? `<button class="icon-button card-favorite ${doc.favorite ? "is-favorite" : ""}" data-action="favorite" aria-label="${doc.favorite ? "Unfavorite" : "Favorite"} ${escape(doc.title)}" aria-pressed="${!!doc.favorite}">${icon("star")}</button>` : ""}<div class="card-body"><button class="card-title" data-action="open" title="${escape(doc.title)}">${escape(doc.title)}</button><div class="card-meta"><span>${doc.kind === "pdf" ? `${doc.pageCount} pages` : `${words(doc.text).toLocaleString()} words`}</span><span>·</span><span>${doc.minutes || minutes(doc.text || "")} min listen</span></div><div class="card-bottom"><button class="text-button" data-action="${doc.deleted ? "restore" : "open"}">${icon(doc.deleted ? "undo" : "play")}${doc.deleted ? "Restore document" : doc.completed ? "Read again" : doc.position > 0 ? "Continue reading" : "Start reading"}</button><div>${!doc.deleted ? `<button class="icon-button" data-action="rename" aria-label="Rename ${escape(doc.title)}">${icon("edit")}</button><button class="icon-button" data-action="delete" aria-label="Delete ${escape(doc.title)}">${icon("trash")}</button>` : ""}</div></div></div><div class="card-progress"><span style="width:${progress}%"></span></div></article>`;
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
    `<p class="dialog-copy">Bring a PDF, a text file, or a fresh thought. Everything is saved privately on this device.</p><button class="dialog-option" id="chooseFiles">${icon("file")}<span><strong>Import from your device</strong><small>PDF, TXT, or Markdown · up to 25 MB per PDF</small></span>${icon("arrow")}</button><button class="dialog-option" id="writeInstead">${icon("edit")}<span><strong>Write or paste text</strong><small>A clean page for your next idea</small></span>${icon("arrow")}</button><p class="hint">PDFs need selectable text. Scanned pages require OCR in another app first.</p>`,
  );
  $("chooseFiles").onclick = () => {
    closeDialog();
    $("fileInput").click();
  };
  $("writeInstead").onclick = () => {
    closeDialog();
    newDraft();
  };
}
function newDraft() {
  // Keep an existing autosaved draft until the user explicitly clears it.
  changeView("writer");
  $("draftTitle").focus();
}
async function importFiles(files) {
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
      if (!["pdf", "txt", "md"].includes(extension))
        throw new Error("Choose a PDF, TXT, or Markdown file.");
      if (!file.size)
        throw new Error("This file is empty. Add some text and try again.");
      if (extension === "pdf" && file.size > MAX_PDF)
        throw new Error(
          "PDFs must be 25 MB or smaller. Split this document and try again.",
        );
      if (extension !== "pdf" && file.size > MAX_TEXT * 4)
        throw new Error(
          "Text files must contain fewer than 100,000 characters.",
        );
      $("saveStatus").textContent = `Importing ${file.name}…`;
      const title =
        file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Untitled document";
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
          if (!data.segments.length)
            throw new Error(
              "No readable text was found. Run OCR on this PDF and import it again.",
            );
          doc = validateDocument({ title, kind: "pdf" });
          doc.pdfBytes = bytes;
          doc.pdfSize = bytes.byteLength;
          doc.segments = data.segments;
          doc.pageCount = data.num_pages;
          doc.minutes = minutes(
            data.segments.map((s) => s.original_text).join(" "),
          );
        } finally {
          await parsed.destroy();
        }
      } else {
        const text = await file.text();
        doc = validateDocument({ title, kind: "text", text });
        doc.segments = textSegments(text);
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
  renderTask?.cancel();
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
  $("readerKind").textContent =
    doc.kind === "pdf" ? "PDF DOCUMENT" : "TEXT DOCUMENT";
  $("readerMeta").textContent =
    `${doc.kind === "pdf" ? `${doc.pageCount} pages` : `${words(doc.text).toLocaleString()} words`} · ${doc.minutes || minutes(doc.text || "")} min listen · Saved on this device`;
  $("documentNotes").value = doc.notes || "";
  $("passageSearch").value = "";
  $("editDocument").hidden = doc.kind !== "text";
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
      activePdfBytes = await getPdfBytes(doc.id);
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
      await renderPdfPage();
      updatePlayer({ state: "idle", index: doc.position });
    } catch (error) {
      report(error);
      $("playerDetail").textContent =
        "PDF preview unavailable · transcript ready";
    }
  }
}
async function renderPdfPage() {
  if (!pdf) return;
  const generation = ++pageGeneration;
  renderTask?.cancel();
  const page = await pdf.getPage(pdfPage + 1);
  if (generation !== pageGeneration) return;
  const width = Math.max(250, $("readingPaper").clientWidth - 26),
    viewport = page.getViewport({
      scale: (width / page.getViewport({ scale: 1 }).width) * pdfScale,
    });
  const density = Math.min(window.devicePixelRatio || 1, 2),
    canvas = $("pdfCanvas");
  canvas.width = Math.floor(viewport.width * density);
  canvas.height = Math.floor(viewport.height * density);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  $("pdfCanvasWrap").style.width = canvas.style.width;
  $("pageNumber").textContent = `${pdfPage + 1} / ${pdf.numPages}`;
  $("prevPage").disabled = pdfPage === 0;
  $("nextPage").disabled = pdfPage === pdf.numPages - 1;
  $("zoomReset").textContent = `${Math.round(pdfScale * 100)}%`;
  $("zoomOut").disabled = pdfScale <= 0.75;
  $("zoomIn").disabled = pdfScale >= 2;
  renderTask = page.render({
    canvasContext: canvas.getContext("2d"),
    viewport,
    transform: [density, 0, 0, density, 0, 0],
  });
  try {
    await renderTask.promise;
  } catch (error) {
    if (error.name !== "RenderingCancelledException") throw error;
  }
  if (generation === pageGeneration) renderPdfHighlights();
}
function renderPdfHighlights() {
  const segment = activeSegments[player.index];
  $("pdfHighlights").innerHTML =
    segment?.page === pdfPage
      ? (segment.boxes || [])
          .map(
            (box) =>
              `<span class="pdf-highlight" style="left:${box.x}%;top:${box.y}%;width:${box.w}%;height:${box.h}%"></span>`,
          )
          .join("")
      : "";
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
            `<button class="passage-item ${index === player.index ? "active" : ""}" data-segment="${index}" ${index === player.index ? 'aria-current="true"' : ""}>${current?.bookmarks?.includes(index) ? icon("bookmark") : `<small>${index + 1}</small>`}<span>${escape(segment.original_text)}</span></button>`,
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
          `<button class="passage ${start + offset === player.index ? "active" : ""}" data-segment="${start + offset}" ${start + offset === player.index ? 'aria-current="true"' : ""}>${escape(segment.original_text)}</button>`,
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
    if (pdf && activeSegments[index]?.page !== pdfPage && playing) {
      pdfPage = activeSegments[index].page;
      renderPdfPage().catch(report);
    } else renderPdfHighlights();
  }
  if (state === "error")
    toast(detail, { label: "Voice settings", run: showSettings }, true);
}
function playbackOptions() {
  return {
    engine: settings.engine,
    voice: settings.voice,
    speed: settings.speed,
    transform: (segment) =>
      settings.smart
        ? segment.original_text
            .split("\n")
            .map((line) => verbalizeRuleBasedNative(line).text || line)
            .join(" ")
        : segment.original_text,
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
async function seek(index) {
  index = Math.max(0, Math.min(activeSegments.length - 1, index));
  const resume = ["playing", "loading"].includes(player.state);
  player.stop();
  player.index = index;
  if (current) current.completed = false;
  updatePlayer({ state: "idle", index });
  if (pdf) {
    pdfPage = activeSegments[index].page;
    await renderPdfPage();
  }
  if (resume) await player.play(activeSegments, index, playbackOptions());
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
    `<p class="dialog-copy">Choose your listening companion. System voices are ready without a model download.</p><label class="dialog-field">Speech engine<select id="engineSelect"><option value="system">System · built into your device</option><option value="neural">Kokoro · optional neural voice</option><option value="mlx">MLX · optional local Python engine</option></select></label><p class="hint" id="engineHint"></p><label class="dialog-field">Voice<select id="voiceSelect"></select></label><label class="dialog-field">Playback speed<select id="settingsSpeed">${[0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => `<option value="${speed}">${speed}×${speed === 1 ? " · natural pace" : ""}</option>`).join("")}</select></label><div class="label-row"><label for="settingsSmart">Speak code naturally</label><input id="settingsSmart" type="checkbox" class="switch"></div><p class="hint">Uses local syntax rules. Original documents are always preserved.</p><div class="dialog-actions"><button class="secondary" id="localModels">Local models</button><button class="secondary" id="showWelcomeAgain">Quick tour</button><button class="primary" id="applySettings">Save preferences</button></div>`,
    "MADE FOR YOUR EARS",
  );
  $("engineSelect").value = settings.engine;
  $("settingsSpeed").value = settings.speed;
  $("settingsSmart").checked = settings.smart;
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
    $("engineHint").textContent =
      $("engineSelect").value === "mlx"
        ? "Connects only to your local engine. Start it using the README setup instructions, then manage optional models below."
        : neural
          ? "First play downloads a neural model (approximately 100 MB plus runtime files). Internet is required until those files are cached. Stop cancels preparation. Documents stay on your device."
          : window.__TAURI__?.core
            ? "Native macOS audio supports WAV export. No model download is needed."
            : "Browser system speech is ready to use. WAV export is available with the desktop app or a neural voice. Offline availability depends on installed system voices.";
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
    `<img class="onboarding-mark" src="./static/brand.svg" width="70" height="70" alt="9-gyo-phi book and sound mark"><p class="dialog-copy">Welcome to your listening room. A quiet home for the words you want to spend more time with.</p><div class="welcome-lines"><div>${icon("file")}<span><strong>Bring your own words.</strong><br>Import a PDF, paste an article, or start a note.</span></div><div>${icon("headphones")}<span><strong>Find your rhythm.</strong><br>Choose a voice. Set the pace. Pick up where you left off.</span></div><div>${icon("shield")}<span><strong>Keep it yours.</strong><br>No account. Local storage. Export a backup anytime.</span></div></div><div class="dialog-actions"><button class="secondary" id="skipWelcome">Explore my library</button><button class="primary" id="welcomeSample">Try a 2-minute read ${icon("arrow")}</button></div>`,
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
function showExport() {
  if (!current) return;
  dialog(
    "Take your words with you.",
    `<p class="dialog-copy">Export “${escape(current.title)}” in a format that fits your next step.</p><button class="dialog-option" id="exportText">${icon("file")}<span><strong>Plain text (.txt)</strong><small>The complete original transcript, plus your notes</small></span>${icon("download")}</button>${current.kind === "pdf" ? `<button class="dialog-option" id="exportPdf">${icon("file")}<span><strong>Original document (.pdf)</strong><small>Your PDF, exactly as imported</small></span>${icon("download")}</button>` : ""}<button class="dialog-option" id="exportWav" ${!player.buffers.length ? "disabled" : ""}>${icon("voice")}<span><strong>Recorded audio (.wav)</strong><small>${player.buffers.length ? `${Math.round(player.recordedSeconds)} seconds from this playback session · up to 30 minutes` : "Available after playback with native desktop or neural voices"}</small></span>${icon("download")}</button><p class="hint">Audio includes passages played in the current session. Browser system speech cannot be recorded. Use Backup & import to export your entire library.</p>`,
    "KEEP SOMETHING GOOD",
  );
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
  if ($("exportPdf"))
    $("exportPdf").onclick = () => {
      download(
        new Blob([activePdfBytes], { type: "application/pdf" }),
        `${current.title}.pdf`,
      );
      toast("PDF export downloaded.");
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
        (d.pdfSize || 0) * 1.34 +
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
      title: doc.title,
      text: doc.text,
      notes: doc.notes,
      favorite: doc.favorite,
      bookmarks: doc.bookmarks,
      position: doc.position,
    };
    if (doc.kind === "pdf") {
      const stored = await getPdfBytes(doc.id);
      if (!stored)
        throw new Error(
          `The PDF for ${doc.title} is missing. Reimport it before backing up.`,
        );
      const bytes = new Uint8Array(stored);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      item.pdf = btoa(binary);
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
    if (doc.kind === "pdf") {
      if (typeof raw.pdf !== "string" || raw.pdf.length > MAX_PDF * 1.34)
        throw new Error("The backup contains a missing or oversized PDF.");
      let bytes;
      try {
        bytes = Uint8Array.from(atob(raw.pdf), (c) => c.charCodeAt(0)).buffer;
      } catch {
        throw new Error("The backup contains invalid PDF data.");
      }
      const parsed = await loadPdf(bytes);
      try {
        if (parsed.numPages > 500)
          throw new Error("PDFs in backups must have 500 pages or fewer.");
        const data = await parsePdfInBrowser(parsed);
        if (!data.segments.length)
          throw new Error("A PDF in this backup has no readable text.");
        doc.pdfBytes = bytes;
        doc.pdfSize = bytes.byteLength;
        doc.segments = data.segments;
        doc.pageCount = data.num_pages;
        doc.minutes = minutes(
          data.segments.map((s) => s.original_text).join(" "),
        );
      } finally {
        await parsed.destroy();
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
  imported.forEach((doc) => delete doc.pdfBytes);
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
    await renderPdfPage();
  }
});
on("nextPage", "click", async () => {
  if (pdf && pdfPage < pdf.numPages - 1) {
    pdfPage++;
    await renderPdfPage();
  }
});
on("zoomIn", "click", async () => {
  pdfScale = Math.min(2, Math.round((pdfScale + 0.25) * 100) / 100);
  await renderPdfPage();
});
on("zoomOut", "click", async () => {
  pdfScale = Math.max(0.75, pdfScale - 0.25);
  await renderPdfPage();
});
on("zoomReset", "click", async () => {
  pdfScale = 1;
  await renderPdfPage();
});
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (view === "reader" && pdf) renderPdfPage().catch(report);
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
      (doc) => doc.kind === "text" && doc.segmentVersion !== 2,
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
      settings.engine = ["system", "neural", "mlx"].includes(preferences.engine)
        ? preferences.engine
        : "system";
      settings.voice =
        typeof preferences.voice === "string" ? preferences.voice : "";
      settings.speed = [0.75, 1, 1.25, 1.5, 1.75, 2].includes(preferences.speed)
        ? preferences.speed
        : 1;
      settings.smart = preferences.smart !== false;
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

let modelDownload = null;
async function showModels() {
  dialog(
    "Local voice models",
    `<p class="dialog-copy">Optional Apple Silicon acceleration. The Python engine runs separately on this device.</p><p class="dialog-status" id="modelStatus">Connecting to local engine…</p><div id="modelRows"></div><div class="dialog-actions"><button class="secondary" id="retryModels">Refresh</button><button class="primary" id="backToVoices">Voice preferences</button></div>`,
  );
  $("retryModels").onclick = () => showModels().catch(report);
  $("backToVoices").onclick = () => showSettings().catch(report);
  try {
    const data = await (await engineRequest("/api/models/status")).json();
    if (!$("modelRows")) return;
    $("modelStatus").textContent =
      data.active_download?.status === "downloading"
        ? `Download in progress · ${data.active_download.percent || 0}%`
        : "Local engine connected. Downloads stay on this device.";
    $("modelRows").innerHTML = data.models
      .map(
        (model) =>
          `<div class="model-row"><strong>${escape(model.name)}</strong><p class="hint">${escape(model.description)}</p><div class="model-actions"><small>${model.installed ? `Installed · ${escape(model.size_str)}` : `About ${model.size_mb} MB`}</small>${model.installed ? '<span class="status-tag">Installed</span>' : `<button class="secondary" data-model-download="${escape(model.id)}" ${data.active_download?.status === "downloading" ? "disabled" : ""}>Download</button>`}</div></div>`,
      )
      .join("");
    if (data.active_download?.status === "downloading")
      $("modelRows").insertAdjacentHTML(
        "afterbegin",
        '<button class="secondary" id="cancelModelDownload">Cancel download</button>',
      );
    if ($("cancelModelDownload"))
      $("cancelModelDownload").onclick = () =>
        cancelModelDownload().catch(report);
    $("modelRows").onclick = (event) => {
      const button = event.target.closest("[data-model-download]");
      if (button)
        startModelDownload(button.dataset.modelDownload).catch(report);
    };
  } catch (error) {
    if ($("modelStatus")) $("modelStatus").textContent = error.message;
  }
}
async function cancelModelDownload() {
  await engineRequest("/api/models/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  modelDownload?.abort();
  modelDownload = null;
  toast("Model download cancelled.");
  await showModels();
}
async function startModelDownload(id) {
  if (modelDownload) return;
  modelDownload = new AbortController();
  if ($("modelRows"))
    $("modelRows").innerHTML =
      '<button class="secondary" id="cancelModelDownload">Cancel download</button>';
  if ($("cancelModelDownload"))
    $("cancelModelDownload").onclick = () =>
      cancelModelDownload().catch(report);
  try {
    const response = await engineRequest("/api/models/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: id }),
      signal: modelDownload.signal,
    });
    await readEvents(response, (event) => {
      if (event.status === "error")
        throw new Error(
          event.message || "Model download failed. Retry when connected.",
        );
      if ($("modelStatus"))
        $("modelStatus").textContent =
          event.status === "completed"
            ? "Model downloaded."
            : `Downloading · ${event.percent || 0}%`;
    });
    if ($("modelStatus")) await showModels();
  } catch (error) {
    if (error.name !== "AbortError") throw error;
  } finally {
    modelDownload = null;
  }
}
