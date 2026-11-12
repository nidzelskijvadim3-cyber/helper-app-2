'use client';
import { splitDoc, pageKey, newId } from './lib';

// IndexedDB v2: 'docs' = легкі метадані, 'pages' = сторінки (по одній на запис).
// Міграція з v1 (де документ був одним великим записом) виконується автоматично.
const DBN = 'helper-docs';
let dbp = null;
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBN, 2);
    r.onupgradeneeded = e => {
      const db = r.result, tx = r.transaction;
      if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('pages')) db.createObjectStore('pages');
      if (e.oldVersion === 1) {
        const ds = tx.objectStore('docs'), ps = tx.objectStore('pages');
        ds.openCursor().onsuccess = ev => {
          const c = ev.target.result; if (!c) return;
          const { meta, pages } = splitDoc(c.value);
          pages.forEach((p, i) => ps.put(p, pageKey(meta.id, i)));
          c.update(meta); c.continue();
        };
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const db = () => dbp || (dbp = open().catch(e => { dbp = null; throw e; }));
async function run(stores, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(stores, mode); let out;
    try { out = fn(...stores.map(s => t.objectStore(s))); } catch (e) { rej(e); return; }
    t.oncomplete = () => res(out && typeof out === 'object' && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const range = id => IDBKeyRange.bound(id + ':', id + ':\uffff');
// Надгробки видалених документів (для синхронізації), зберігаються у localStorage.
const TOMB = 'helper-doc-tombs';
export const readTombs = () => { try { return JSON.parse(localStorage.getItem(TOMB) || '[]'); } catch (e) { return []; } };
const writeTombs = a => { try { localStorage.setItem(TOMB, JSON.stringify(a)); } catch (e) {} };
export const clearTombs = ids => writeTombs(readTombs().filter(t => !ids.includes(t.id)));
const notify = () => { try { window.dispatchEvent(new Event('docs-changed')); } catch (e) {} };

export const listMeta = async () => { try { return await run(['docs'], 'readonly', ds => ds.getAll()); } catch (e) { return []; } };
export async function getDoc(id) {
  const meta = await run(['docs'], 'readonly', ds => ds.get(id));
  if (!meta) return null;
  const pages = await run(['pages'], 'readonly', ps => ps.getAll(range(id)));
  return { ...meta, pages };
}
// dirty: 'all' або масив індексів змінених сторінок. Метадані пишуться завжди.
export async function saveDoc(d, dirty) {
  const { meta, pages } = splitDoc(d), now = Date.now();
  meta._su = now;
  await run(['docs', 'pages'], 'readwrite', (ds, ps) => {
    ds.put(meta);
    const idx = dirty === 'all' || !dirty ? pages.map((_, i) => i) : dirty;
    idx.forEach(i => { if (pages[i]) ps.put({ ...pages[i], _u: now }, pageKey(meta.id, i)); });
    if (dirty === 'all') ps.delete(IDBKeyRange.bound(pageKey(meta.id, pages.length), meta.id + ':\uffff'));
  });
  notify();
}
export async function putMeta(meta) { await run(['docs'], 'readwrite', ds => ds.put({ ...meta, _su: Date.now() })); notify(); }
export async function putDoc(d) { if (Array.isArray(d.pages)) await saveDoc(d, 'all'); else await putMeta(d); }
export async function delDoc(id) {
  await run(['docs', 'pages'], 'readwrite', (ds, ps) => { ds.delete(id); ps.delete(range(id)); });
  writeTombs([...readTombs().filter(t => t.id !== id), { id, u: Date.now() }]);
  notify();
}
// --- допоміжні функції для синхронізації (без міток часу й надгробків) ---
export const getDocMeta = id => run(['docs'], 'readonly', ds => ds.get(id));
export async function getPagesSince(id, since, fallback) {
  const rows = await run(['pages'], 'readonly', ps => ps.getAll(range(id)));
  return rows.map((page, idx) => ({ idx, page })).filter(x => (x.page._u ?? fallback ?? 0) > since);
}
export async function getPageStamp(id, idx) { const p = await run(['pages'], 'readonly', ps => ps.get(pageKey(id, idx))); return p ? (p._u ?? 0) : null; }
export async function applyRemoteMeta(meta) {
  await run(['docs', 'pages'], 'readwrite', (ds, ps) => {
    ds.put(meta);
    if (typeof meta.pageCount === 'number') ps.delete(IDBKeyRange.bound(pageKey(meta.id, meta.pageCount), meta.id + ':\uffff'));
  });
}
export const applyRemotePage = (id, idx, page) => run(['pages'], 'readwrite', ps => ps.put(page, pageKey(id, idx)));
export const delDocRaw = id => run(['docs', 'pages'], 'readwrite', (ds, ps) => { ds.delete(id); ps.delete(range(id)); });
export async function duplicateDoc(id) {
  const d = await getDoc(id); if (!d) return null;
  const nd = { ...d, id: newId(), title: String(d.title) + ' (копія)', fav: false, created: Date.now(), upd: Date.now() };
  await saveDoc(nd, 'all'); return nd;
}
// Перенести документи з однієї папки в іншу (наприклад, при видаленні папки).
export async function reparentDocs(from, to) {
  const all = await listMeta();
  for (const m of all) if (m.folder === from) await putMeta({ ...m, folder: to });
}
export async function moveDoc(id, folder) {
  const all = await listMeta(); const m = all.find(x => x.id === id);
  if (m) await putMeta({ ...m, folder });
}
