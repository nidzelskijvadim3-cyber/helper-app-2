'use client';
// Резервна копія: один JSON-файл зі станом застосунку (localStorage) і документами з IndexedDB разом зі сторінками.
// Формат (version 1):
// { app: 'helper-app-2', kind: 'backup', version: 1, created: ISO, account: 'ім’я' | null,
//   state: { items, cap, start, cards, notes, tests, folders, chats, chatCur, aiLast, ui },
//   docs: [ { ...метадані документа, pages: [ { w, h, tpl, strokes, img?, ... } ] } ] }
import { listMeta, getDoc, saveDoc, delDoc, clearTombs } from './store';
import { nsKey, activeAccount } from './accounts';

export const BK_APP = 'helper-app-2', BK_VER = 1;
const metaKey = () => nsKey('helper-backup');
// { last: ts останньої збереженої копії, snooze: ts, до якого банер не показувати }
export const getBkMeta = () => { try { return JSON.parse(localStorage.getItem(metaKey()) || '{}') || {}; } catch (e) { return {}; } };
export const setBkMeta = p => { try { localStorage.setItem(metaKey(), JSON.stringify({ ...getBkMeta(), ...p })); } catch (e) {} };

const STATE_KEYS = ['items', 'cap', 'start', 'cards', 'notes', 'tests', 'folders', 'chats', 'chatCur', 'aiLast', 'ui'];
const clean = p => { if (!p || typeof p !== 'object') return p; const { _u, ...rest } = p; return rest; };

// Збирає Blob частинами: великі сторінки (фото, скани) не склеюються в один рядок у пам'яті.
export async function buildBackup(state) {
  const metas = await listMeta();
  const acc = activeAccount();
  const head = { app: BK_APP, kind: 'backup', version: BK_VER, created: new Date().toISOString(), account: acc ? acc.name : null, state: {} };
  for (const k of STATE_KEYS) if (state[k] !== undefined) head.state[k] = state[k];
  const parts = [JSON.stringify(head).slice(0, -1) + ',"docs":['];
  let nDocs = 0, nPages = 0;
  for (const m of metas) {
    const d = await getDoc(m.id).catch(() => null); if (!d) continue;
    const { _su, ...meta } = d;
    const pages = (d.pages || []).map(clean);
    parts.push((nDocs ? ',' : '') + JSON.stringify({ ...meta, pages }));
    nDocs++; nPages += pages.length;
  }
  parts.push(']}');
  const blob = new Blob(parts, { type: 'application/json' });
  return { blob, nDocs, nPages, size: blob.size };
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export const backupName = (d = new Date()) => 'helper-backup-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json';

// Перевірка файлу. Повертає { ok, err?, data?, counts? }. Нічого не змінює.
export function inspectBackup(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { return { ok: false, err: 'json' }; }
  if (!o || o.app !== BK_APP || o.kind !== 'backup' || typeof o.state !== 'object' || !o.state) return { ok: false, err: 'format' };
  if (Number(o.version) > BK_VER) return { ok: false, err: 'version' };
  const s = o.state, arr = v => (Array.isArray(v) ? v : []);
  const docs = arr(o.docs).filter(d => d && d.id != null && Array.isArray(d.pages));
  const counts = { items: arr(s.items).length, notes: arr(s.notes).length, cards: arr(s.cards).length, tests: arr(s.tests).length, folders: arr(s.folders).length, chats: arr(s.chats).length, docs: docs.length, pages: docs.reduce((n, d) => n + d.pages.length, 0) };
  counts.records = counts.items + counts.notes + counts.cards + counts.tests + counts.folders + counts.chats;
  return { ok: true, data: { ...o, docs }, counts, created: o.created || '', account: o.account || null };
}

// Застосування. mode: 'replace' — замінити все; 'merge' — додати записи й документи, яких ще немає (за id).
// cur — поточний стан (той самий набір ключів). Повертає { state, added } — новий стан для React; документи пише сама.
export async function applyBackup(data, mode, cur) {
  const s = data.state || {}, arr = v => (Array.isArray(v) ? v : []);
  const added = { records: 0, docs: 0 };
  let next;
  if (mode === 'replace') {
    next = { ...cur };
    for (const k of STATE_KEYS) if (s[k] !== undefined) next[k] = s[k];
    for (const k of ['items', 'cards', 'notes', 'tests', 'folders', 'chats']) next[k] = arr(next[k]);
    added.records = ['items', 'cards', 'notes', 'tests', 'folders', 'chats'].reduce((n, k) => n + next[k].length, 0);
  } else {
    next = { ...cur };
    for (const k of ['items', 'cards', 'notes', 'tests', 'folders', 'chats']) {
      const have = new Set(arr(cur[k]).map(x => x && x.id));
      const add = arr(s[k]).filter(x => x && x.id != null && !have.has(x.id));
      next[k] = [...arr(cur[k]), ...add]; added.records += add.length;
    }
  }
  const local = await listMeta();
  const keep = new Set(data.docs.map(d => d.id));
  if (mode === 'replace') {
    // документи, яких немає в копії, видаляються (з надгробками для синхронізації); решта перезаписується з копії
    for (const m of local) if (!keep.has(m.id)) await delDoc(m.id);
    clearTombs([...keep]);
    for (const d of data.docs) { await saveDoc(d, 'all'); added.docs++; }
  } else {
    const have = new Set(local.map(m => m.id));
    for (const d of data.docs) if (!have.has(d.id)) { await saveDoc(d, 'all'); added.docs++; }
  }
  return { state: next, added };
}
