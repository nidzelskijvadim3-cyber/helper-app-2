'use client';
import { collectRecords, diffLocal, mergeRemote, applyRecordsToState, hashStr, batchBySize } from './sync-core';
import * as store from './store';

const KEY = 'helper-sync';
const metaIO = {
  get: () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } },
  set: o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} },
};
export const getSyncMeta = () => metaIO.get();
export const setSyncOn = on => metaIO.set({ ...metaIO.get(), on });

async function httpApi(body, pass) {
  const r = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pass': pass || '' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || 'HTTP ' + r.status); e.code = r.status; throw e; }
  return d;
}
export const syncStatus = pass => httpApi({ action: 'status' }, pass);

const pageRecKey = (id, idx) => 'p:' + id + ':' + String(idx).padStart(5, '0');

async function collectDocRecords(d, since, got) {
  const out = [];
  for (const m of await d.listMeta()) {
    const u = m._su || m.upd || 0;
    if (u <= since || got.has('m:' + m.id + '@' + u)) continue;
    out.push({ k: 'm:' + m.id, t: 'm', u, d: false, data: m });
    for (const { idx, page } of await d.getPagesSince(m.id, since, u)) {
      const pu = page._u ?? u;
      if (!got.has(pageRecKey(m.id, idx) + '@' + pu)) out.push({ k: pageRecKey(m.id, idx), t: 'p', u: pu, d: false, data: page });
    }
  }
  return out;
}

async function applyDocRecords(d, list, got) {
  let n = 0;
  for (const r of list) {
    try {
      if (r.t === 'm') {
        const id = Number(r.k.slice(2)), local = await d.getDocMeta(id), lu = local ? (local._su || local.upd || 0) : -1;
        if (r.d) { if (local && lu < r.u) { await d.delDocRaw(id); n++; } }
        else if (!local || lu < r.u) { await d.applyRemoteMeta(r.data); got.add(r.k + '@' + r.u); n++; }
      } else if (r.t === 'p') {
        const parts = r.k.split(':'), id = Number(parts[1]), idx = Number(parts[2]), st = await d.getPageStamp(id, idx);
        if (st == null || st < r.u) { await d.applyRemotePage(id, idx, r.data); got.add(r.k + '@' + r.u); n++; }
      }
    } catch (e) { /* пропускаємо пошкоджений запис */ }
  }
  return n;
}

// Одна синхронізація: спочатку отримуємо зміни з сервера, потім відправляємо свої.
export async function runSync({ getState, setState, api, meta, docs, now = Date.now }) {
  const m0 = meta.get(), started = now();
  let snap = m0.snap || {}, since = m0.since || 0, pulled = 0;
  const got = new Set();
  for (let guard = 0; guard < 500; guard++) {
    const res = await api({ action: 'pull', since });
    const rem = res.records || [];
    const docRem = rem.filter(r => r.t === 'm' || r.t === 'p'), colRem = rem.filter(r => r.t !== 'm' && r.t !== 'p');
    if (colRem.length) {
      const cur = collectRecords(getState());
      // якщо запис змінено локально після останнього знімка, віддалену версію не застосовуємо (локальна піде на сервер)
      const ok = colRem.filter(r => { const c = cur.get(r.k), sn = snap[r.k]; return !(c && sn && !sn.d && hashStr(JSON.stringify(c.data)) !== sn.h); });
      const mr = mergeRemote(snap, ok); snap = mr.next;
      if (mr.applied.length) { setState(applyRecordsToState(getState(), mr.applied)); pulled += mr.applied.length; }
    }
    if (docRem.length) pulled += await applyDocRecords(docs, docRem, got);
    since = res.last || since;
    if (!res.more) break;
  }
  const { changes, next } = diffLocal(collectRecords(getState()), snap, started);
  const docRecs = await collectDocRecords(docs, m0.lastDoc || 0, got);
  const tombs = docs.readTombs();
  const out = [...changes, ...docRecs, ...tombs.map(t => ({ k: 'm:' + t.id, t: 'm', u: t.u, d: true, data: null }))];
  for (const b of batchBySize(out, 3000000)) await api({ action: 'push', records: b });
  docs.clearTombs(tombs.map(t => t.id));
  meta.set({ ...meta.get(), snap: next, since, lastDoc: started, last: now() });
  return { pulled, pushed: out.length };
}

export async function syncNow({ getState, setState, pass }) {
  const r = await runSync({ getState, setState, api: b => httpApi(b, pass), meta: metaIO, docs: store });
  if (r.pulled) { try { window.dispatchEvent(new Event('docs-changed')); } catch (e) {} }
  return r;
}
