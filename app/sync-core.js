// Ядро синхронізації (чисті функції, без браузера й мережі): визначення змін, слияння, застосування.
export const hashStr = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };

// колекції стану → префікс ключа запису на сервері
export const COLL = { items: 'i', notes: 'n', folders: 'f', cards: 'c', tests: 't' };
const typeToKey = t => Object.keys(COLL).find(k => COLL[k] === t);

export function collectRecords(st) {
  const m = new Map();
  for (const key of Object.keys(COLL)) for (const x of (st[key] || [])) m.set(COLL[key] + ':' + x.id, { t: COLL[key], data: x });
  m.set('s:settings', { t: 's', data: { cap: st.cap, start: st.start, ui: st.ui } });
  return m;
}

// Що змінилось локально відносно знімка snap (мітка часу = now). next коммітиться лише після успішного push.
export function diffLocal(records, snap, now) {
  const changes = [], next = {};
  for (const [k, r] of records) {
    const h = hashStr(JSON.stringify(r.data)), prev = snap[k];
    if (prev && !prev.d && prev.h === h) { next[k] = prev; continue; }
    next[k] = { h, u: now }; changes.push({ k, t: r.t, u: now, d: false, data: r.data });
  }
  for (const [k, prev] of Object.entries(snap)) {
    if (records.has(k)) continue;
    if (prev.d) { next[k] = prev; continue; }
    next[k] = { h: '', u: now, d: true }; changes.push({ k, t: k[0], u: now, d: true, data: null });
  }
  return { changes, next };
}

// Віддалені записи: застосовуємо лише новіші за те, що вже відомо.
export function mergeRemote(snap, remote) {
  const next = { ...snap }, applied = [];
  for (const r of remote) {
    const prev = next[r.k];
    if (prev && prev.u >= r.u) continue;
    applied.push(r);
    next[r.k] = r.d ? { h: '', u: r.u, d: true } : { h: hashStr(JSON.stringify(r.data)), u: r.u };
  }
  return { applied, next };
}

export function applyRecordsToState(st, applied) {
  const out = { ...st };
  for (const key of Object.keys(COLL)) out[key] = [...(st[key] || [])];
  for (const r of applied) {
    if (r.t === 's') {
      if (!r.d && r.data) {
        if (Array.isArray(r.data.cap)) out.cap = r.data.cap;
        if (r.data.start != null) out.start = r.data.start;
        if (r.data.ui) out.ui = { ...(st.ui || {}), ...r.data.ui };
      }
      continue;
    }
    const key = typeToKey(r.t); if (!key) continue;
    const id = r.k.slice(2), idx = out[key].findIndex(x => String(x.id) === id);
    if (r.d) { if (idx >= 0) out[key].splice(idx, 1); }
    else if (idx >= 0) out[key][idx] = r.data;
    else out[key].push(r.data);
  }
  return out;
}

export function batchBySize(list, maxBytes, maxCount = 200) {
  const out = []; let cur = [], size = 0;
  for (const r of list) {
    const s = JSON.stringify(r).length;
    if (cur.length && (size + s > maxBytes || cur.length >= maxCount)) { out.push(cur); cur = []; size = 0; }
    cur.push(r); size += s;
  }
  if (cur.length) out.push(cur);
  return out;
}
