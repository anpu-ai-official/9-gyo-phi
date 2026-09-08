let dbPromise;
export function database() {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("nine-gyo-phi-library", 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("documents"))
          db.createObjectStore("documents", { keyPath: "id" });
        if (!db.objectStoreNames.contains("settings"))
          db.createObjectStore("settings");
        if (!db.objectStoreNames.contains("contents")) {
          const contents = db.createObjectStore("contents");
          const cursor = request.transaction
            .objectStore("documents")
            .openCursor();
          cursor.onsuccess = () => {
            const item = cursor.result;
            if (!item) return;
            const doc = item.value;
            if (doc.pdfBytes) {
              contents.put(doc.pdfBytes, doc.id);
              doc.pdfSize = doc.pdfBytes.byteLength;
              delete doc.pdfBytes;
              item.update(doc);
            }
            item.continue();
          };
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(
          new Error(
            "Local storage is unavailable. Export your work and allow storage for this app.",
          ),
        );
      };
      request.onblocked = () =>
        reject(
          new Error(
            "Close other app windows and retry to update local storage.",
          ),
        );
    });
  return dbPromise;
}
async function transaction(store, mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode),
      request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () =>
      reject(
        new Error(
          "Your changes could not be saved. Storage may be full. Export a backup and retry.",
        ),
      );
  });
}
export const listDocuments = () =>
  transaction("documents", "readonly", (s) => s.getAll());
export const getDocumentBytes = (id) =>
  transaction("contents", "readonly", (s) => s.get(id));
export const getPdfBytes = getDocumentBytes;
export const getSetting = (key) =>
  transaction("settings", "readonly", (s) => s.get(key));
export const saveSetting = (key, value) =>
  transaction("settings", "readwrite", (s) => s.put(value, key));
export async function importDocuments(docs) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["documents", "contents"], "readwrite");
    for (const doc of docs) {
      const { pdfBytes, sourceBytes, ...metadata } = doc;
      const bytes = sourceBytes || pdfBytes;
      tx.objectStore("documents").put(metadata);
      if (bytes) tx.objectStore("contents").put(bytes, doc.id);
    }
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () =>
      reject(
        new Error(
          "Changes could not be saved. No documents were imported. Check available storage.",
        ),
      );
  });
}
export const saveDocument = (doc) => importDocuments([doc]);
