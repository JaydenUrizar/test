// Browser stand-in for node:fs — an in-memory file map mirrored to IndexedDB so worlds and accounts persist between visits.
// Only the calls used by server/store.js and server/lobby.js exist. Call `await initFs()` before creating the server.
const files = new Map();
let db = null;
const DB_NAME = 'emberwild-server', STORE = 'files';

const idb = (mode, fn) => new Promise((resolve, reject) => {
  if (!db) return resolve();
  const tx = db.transaction(STORE, mode);
  fn(tx.objectStore(STORE));
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error);
});
const persist = (file, data) => idb('readwrite', (s) => (data === null ? s.delete(file) : s.put(data, file))).catch(() => {});

export async function initFs() {
  try {
    db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly'), s = tx.objectStore(STORE), req = s.openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { files.set(c.key, c.value); c.continue(); } };
      tx.oncomplete = resolve; tx.onerror = tx.onabort = resolve;
    });
  } catch (e) { db = null; console.warn('[fs] IndexedDB unavailable — progress will not persist:', e && e.message); }
  return !!db;
}
export const persistent = () => !!db;

const enoent = (p) => Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
const put = (p, d) => { files.set(p, d); persist(p, d); };
const del = (p) => { files.delete(p); persist(p, null); };

const fs = {
  mkdirSync() {},
  existsSync: (p) => files.has(p),
  readFileSync(p) { if (!files.has(p)) throw enoent(p); return files.get(p); },
  writeFileSync: (p, d) => put(p, String(d)),
  copyFileSync(a, b) { if (!files.has(a)) throw enoent(a); put(b, files.get(a)); },
  renameSync(a, b) { if (!files.has(a)) throw enoent(a); const d = files.get(a); del(a); put(b, d); },
  promises: {
    async writeFile(p, d) { put(p, String(d)); },
    async copyFile(a, b) { fs.copyFileSync(a, b); },
    async rename(a, b) { fs.renameSync(a, b); },
    async rm(p) { del(p); },
  },
};
export default fs;
