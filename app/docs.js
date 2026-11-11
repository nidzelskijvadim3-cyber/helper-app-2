'use client';
import { useState, useEffect, useRef } from 'react';

const TYPES = { notebook: 'Зошит', board: 'Дошка', photo: 'Фото', scan: 'Скан', pdf: 'PDF' };
const FILTERS = [['all', 'Усі'], ['recent', 'Недавні'], ['fav', 'Обране'], ['notebook', 'Зошити'], ['board', 'Дошки'], ['pdf', 'PDF'], ['img', 'Фото й скани']];
export const bridge = { info: null, getImage: null };
export async function listDocs() { try { return await dbRun('readonly', s => s.getAll()); } catch (e) { return []; } }
export async function putDoc(d) { await dbRun('readwrite', s => s.put(d)); window.dispatchEvent(new Event('docs-changed')); }
export async function delDoc(id) { await dbRun('readwrite', s => s.delete(id)); window.dispatchEvent(new Event('docs-changed')); }
export function newDoc(type, title, folder, tpl) {
  const board = type === 'board';
  return { id: Date.now() + Math.floor(Math.random() * 1000), type: board ? 'board' : 'notebook', title: title || (board ? 'Дошка' : 'Зошит') + ' ' + new Date().toLocaleDateString('uk-UA'), folder: folder === '' || folder == null ? '' : folder, created: Date.now(), upd: Date.now(), thumb: '', pages: [{ w: board ? 1600 : 1200, h: board ? 1200 : 1600, tpl: tpl || (board ? 'blank' : 'lined'), strokes: [] }] };
}
export async function shrink(file, max = 1024, q = 0.72) {
  const img = await loadImg(typeof file === 'string' ? file : await readFile(file));
  const sc = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
  c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
const COLORS = ['#171717', '#6b7280', '#a3a3a3', '#ffffff', '#1d4ed8', '#2563eb', '#38bdf8', '#06b6d4', '#0f766e', '#16a34a', '#65a30d', '#eab308', '#f59e0b', '#ea580c', '#dc2626', '#f43f5e', '#db2777', '#9333ea', '#7c3aed', '#92400e'];
const TOOL_GLYPHS = {
  pen: <><path d="m4 20 4.2-1 10.9-10.9a2.1 2.1 0 0 0-3-3L5.2 16z"/><path d="m14.8 6.2 3 3"/></>,
  hl: <><path d="m4 16 9.8-9.8a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L8 19H4z"/><path d="M3 21h18"/></>,
  eraser: <><path d="m7 16 8.8-8.8a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L12 20H7l-4-4 4-4"/><path d="m9 14 6 6"/></>,
  line: <><path d="M5 19 19 5"/><path d="M5 5v14h14" opacity=".25"/></>,
  rect: <><rect x="4" y="5" width="16" height="14" rx="1.5"/></>,
  oval: <><ellipse cx="12" cy="12" rx="8" ry="6"/></>,
  text: <><path d="M4 6V4h16v2M12 4v16M8 20h8"/></>,
  hand: <><path d="M8 12V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v5c0 4-2.5 7-6.5 7h-1c-2 0-3.2-.8-4.5-2.5L4 15a1.7 1.7 0 0 1 2.5-2.2L8 14"/></>,
  undo: <><path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 0 14h-2"/></>,
  redo: <><path d="m15 14 5-5-5-5"/><path d="M20 9h-9a7 7 0 0 0 0 14h2"/></>,
  zoomOut: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5M7.8 10.8h6"/></>,
  zoomIn: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5M7.8 10.8h6M10.8 7.8v6"/></>,
  share: <><path d="M12 15V3m-4 4 4-4 4 4"/><path d="M5 12v8h14v-8"/></>,
  export: <><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 17v4h14v-4"/></>,
  prev: <><path d="m15 18-6-6 6-6"/></>, next: <><path d="m9 18 6-6-6-6"/></>,
  pages: <><rect x="7" y="4" width="13" height="16" rx="2"/><path d="M4 7v14h12"/></>,
  addPage: <><rect x="4" y="4" width="13" height="16" rx="2"/><path d="M19 8v8m-4-4h8"/></>,
  deletePage: <><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 10l6 6m0-6-6 6"/></>,
  blank: <><rect x="5" y="3" width="14" height="18" rx="2"/></>,
  lined: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 9h8M8 13h8M8 17h8"/></>,
  grid: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M10 3v18M15 3v18M5 9h14M5 15h14"/></>,
  dots: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h.01M13 8h.01M17 8h.01M9 12h.01M13 12h.01M17 12h.01M9 16h.01M13 16h.01M17 16h.01"/></>,
  pencil: <><path d="m4 20 4.2-1L19 8.2a2.1 2.1 0 0 0-3-3L5.2 16z"/><path d="m14.8 6.2 3 3"/></>,
  fountain: <><path d="M12 3 4 11l9 9 8-8-9-9Z"/><path d="m4 11 8-8M13 20l-1-6 6-1M8 15l-4 5"/></>
};
function ToolIcon({ name }) { return <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TOOL_GLYPHS[name]}</svg>; }

function idb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB is not available'));
    const r = indexedDB.open('helper-docs', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('docs')) r.result.createObjectStore('docs', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('Could not open document storage'));
    r.onblocked = () => rej(new Error('Document storage upgrade is blocked by another tab'));
  });
}
async function dbRun(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    let rq, settled = false;
    const finish = (ok, value) => { if (settled) return; settled = true; db.close(); ok ? res(value) : rej(value); };
    try {
      const tx = db.transaction('docs', mode); rq = fn(tx.objectStore('docs'));
      tx.oncomplete = () => finish(true, rq ? rq.result : undefined);
      tx.onerror = () => finish(false, tx.error || new Error('Document storage transaction failed'));
      tx.onabort = () => finish(false, tx.error || new Error('Document storage transaction was aborted'));
    } catch (e) { finish(false, e); }
  });
}
async function putManyDocs(items) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('docs', 'readwrite');
    items.forEach(item => tx.objectStore('docs').put(item));
    tx.oncomplete = () => { db.close(); res(); };
    tx.onerror = () => { const e = tx.error || new Error('Backup import failed'); db.close(); rej(e); };
    tx.onabort = () => { const e = tx.error || new Error('Backup import was aborted'); db.close(); rej(e); };
  });
}
const readFile = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

async function prepImage(file, scan) {
  const img = await loadImg(await readFile(file));
  const sc = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
  if (scan) {
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data, hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4) { const v = Math.round(0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]); p[i] = p[i + 1] = p[i + 2] = v; hist[v]++; }
    const tot = c.width * c.height; let lo = 0, hi = 255, a = 0;
    for (let v = 0; v < 256; v++) { a += hist[v]; if (a > tot * 0.02) { lo = v; break; } }
    a = 0; for (let v = 255; v >= 0; v--) { a += hist[v]; if (a > tot * 0.15) { hi = v; break; } }
    const k = 255 / Math.max(1, hi - lo);
    for (let i = 0; i < p.length; i += 4) { const v = Math.max(0, Math.min(255, (p[i] - lo) * k)); p[i] = p[i + 1] = p[i + 2] = v; }
    g.putImageData(d, 0, 0);
  }
  return { src: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height };
}

function drawStroke(g, s, ws) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = s.c; g.fillStyle = s.c; g.globalAlpha = s.a || 1; g.lineWidth = (s.w || 3) * ws;
  if (s.style === 'pencil') { g.globalAlpha *= 0.62; g.lineWidth *= 0.82; g.globalCompositeOperation = 'multiply'; }
  if (s.style === 'fountain') g.lineWidth *= 1.18;
  if (s.k === 'text') {
    g.font = (s.s * ws) + 'px -apple-system, system-ui, sans-serif';
    s.t.split('\n').forEach((ln, i) => g.fillText(ln, s.x, s.y + i * s.s * ws * 1.25));
    g.restore(); return;
  }
  if (s.a && s.a < 1) g.globalCompositeOperation = 'multiply';
  const p = s.p; g.beginPath();
  if (s.k === 'line') { g.moveTo(p[0], p[1]); g.lineTo(p[2], p[3]); }
  else if (s.k === 'rect') g.rect(Math.min(p[0], p[2]), Math.min(p[1], p[3]), Math.abs(p[2] - p[0]), Math.abs(p[3] - p[1]));
  else if (s.k === 'oval') g.ellipse((p[0] + p[2]) / 2, (p[1] + p[3]) / 2, Math.abs(p[2] - p[0]) / 2 || 0.1, Math.abs(p[3] - p[1]) / 2 || 0.1, 0, 0, Math.PI * 2);
  else {
    g.moveTo(p[0], p[1]);
    if (p.length <= 2) g.lineTo(p[0] + 0.1, p[1]);
    else { for (let i = 2; i < p.length - 2; i += 2) g.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2); g.lineTo(p[p.length - 2], p[p.length - 1]); }
  }
  g.stroke(); g.restore();
}
function ptsOf(s, ws) {
  if (s.k === 'text') { const w = s.t.length * s.s * ws * 0.55; return [s.x, s.y, s.x + w / 2, s.y, s.x + w, s.y, s.x, s.y - s.s * ws * 0.4]; }
  if (s.k === 'line') { const o = []; for (let i = 0; i <= 12; i++) o.push(s.p[0] + (s.p[2] - s.p[0]) * i / 12, s.p[1] + (s.p[3] - s.p[1]) * i / 12); return o; }
  if (s.k === 'rect') { const a = s.p[0], b = s.p[1], c = s.p[2], d = s.p[3], o = []; for (let i = 0; i <= 8; i++) { const t = i / 8; o.push(a + (c - a) * t, b, a + (c - a) * t, d, a, b + (d - b) * t, c, b + (d - b) * t); } return o; }
  if (s.k === 'oval') { const o = []; for (let i = 0; i < 24; i++) { const t = i / 24 * Math.PI * 2; o.push((s.p[0] + s.p[2]) / 2 + Math.cos(t) * (s.p[2] - s.p[0]) / 2, (s.p[1] + s.p[3]) / 2 + Math.sin(t) * (s.p[3] - s.p[1]) / 2); } return o; }
  return s.p;
}
function renderPage(g, p, im) {
  const ws = p.w / 1200;
  g.fillStyle = '#fff'; g.fillRect(0, 0, p.w, p.h);
  if (im) g.drawImage(im, 0, 0, p.w, p.h);
  if (p.tpl === 'lined' || p.tpl === 'grid') {
    g.strokeStyle = '#cfd8e6'; g.lineWidth = 2 * ws; g.beginPath();
    for (let y = 100 * ws; y < p.h; y += 60 * ws) { g.moveTo(0, y); g.lineTo(p.w, y); }
    if (p.tpl === 'grid') for (let x = 60 * ws; x < p.w; x += 60 * ws) { g.moveTo(x, 0); g.lineTo(x, p.h); }
    g.stroke();
  }
  if (p.tpl === 'dots') { g.fillStyle = '#b8c2d3'; for (let y = 60 * ws; y < p.h; y += 60 * ws) for (let x = 60 * ws; x < p.w; x += 60 * ws) { g.beginPath(); g.arc(x, y, 3 * ws, 0, 7); g.fill(); } }
  for (const s of p.strokes) drawStroke(g, s, ws);
}
async function makeThumb(d) {
  const p = d.pages[0]; if (!p) return '';
  const im = p.img ? await loadImg(p.img).catch(() => null) : null;
  const c = document.createElement('canvas'); c.width = 240; c.height = Math.round(240 * p.h / p.w);
  const g = c.getContext('2d'); g.scale(240 / p.w, 240 / p.w); renderPage(g, p, im);
  return c.toDataURL('image/jpeg', 0.6);
}

function Editor({ doc, onSave, onClose }) {
  const [d, setD] = useState(doc);
  const [pi, setPi] = useState(0);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [wd, setWd] = useState(2.5);
  const [colorOpen, setColorOpen] = useState(false);
  const [widthOpen, setWidthOpen] = useState(false);
  const [penOnly, setPenOnly] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState({ w: 300, h: 400 });
  const [tick, setTick] = useState(0);
  const [tin, setTin] = useState(null);
  const [strip, setStrip] = useState(false);
  const [thumbs, setThumbs] = useState([]);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [moreOpen, setMoreOpen] = useState(false);
  const cvRef = useRef(null), boxRef = useRef(null), imgRef = useRef(null), cur = useRef(null), hist = useRef([]), redo = useRef([]), dRef = useRef(d), piRef = useRef(0);
  dRef.current = d; piRef.current = pi;
  const page = d.pages[pi];
  const setPage = np => setD(o => ({ ...o, pages: o.pages.map((q, i) => i === pi ? np : q) }));

  useEffect(() => {
    bridge.info = () => ({ title: dRef.current.title, type: dRef.current.type, page: piRef.current + 1, pages: dRef.current.pages.length });
    bridge.getImage = () => {
      const cv = cvRef.current; if (!cv) return '';
      const sc = Math.min(1, 1000 / Math.max(cv.width, cv.height)); const c = document.createElement('canvas');
      c.width = Math.round(cv.width * sc); c.height = Math.round(cv.height * sc); c.getContext('2d').drawImage(cv, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    };
    return () => { bridge.info = null; bridge.getImage = null; };
  }, []);
  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const f = () => { const sc = Math.min(el.clientWidth / page.w, el.clientHeight / page.h); setFit({ w: Math.floor(page.w * sc), h: Math.floor(page.h * sc) }); };
    f(); const ro = new ResizeObserver(f); ro.observe(el); return () => ro.disconnect();
  }, [page.w, page.h]);
  useEffect(() => {
    let off = false;
    if (!page.img) { imgRef.current = null; setTick(t => t + 1); return; }
    loadImg(page.img).then(im => { if (!off) { imgRef.current = im; setTick(t => t + 1); } }).catch(() => {});
    return () => { off = true; };
  }, [pi, page.img]);
  useEffect(() => { const cv = cvRef.current; if (cv) renderPage(cv.getContext('2d'), page, imgRef.current); }, [d, pi, tick]);
  useEffect(() => {
    setSaveStatus('saving');
    const t = setTimeout(async () => {
      try { await onSave({ ...d, upd: Date.now() }); setSaveStatus('saved'); }
      catch (e) { setSaveStatus('error'); }
    }, 1200);
    return () => clearTimeout(t);
  }, [d]);
  useEffect(() => {
    if (!strip) return; let off = false;
    (async () => {
      const out = [];
      for (const p of d.pages) {
        const im = p.img ? await loadImg(p.img).catch(() => null) : null;
        const c = document.createElement('canvas'); c.width = 90; c.height = Math.round(90 * p.h / p.w);
        const g = c.getContext('2d'); g.scale(90 / p.w, 90 / p.w); renderPage(g, p, im); out.push(c.toDataURL('image/jpeg', 0.5));
      }
      if (!off) setThumbs(out);
    })();
    return () => { off = true; };
  }, [strip, d.pages]);

  const pos = e => { const cv = cvRef.current, r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  const commit = s => { hist.current.push({ pi, strokes: page.strokes }); if (hist.current.length > 40) hist.current.shift(); redo.current = []; setPage({ ...page, strokes: [...page.strokes, s] }); };
  const eraseAt = (x, y) => {
    const ws = page.w / 1200, r = 24 * ws;
    const keep = page.strokes.filter(s => { const q = ptsOf(s, ws); for (let i = 0; i < q.length; i += 2) if (Math.hypot(q[i] - x, q[i + 1] - y) < r + (s.w || 3) * ws / 2) return false; return true; });
    if (keep.length !== page.strokes.length) { if (cur.current && !cur.current.snap) cur.current.snap = page.strokes; setPage({ ...page, strokes: keep }); }
  };
  const down = e => {
    if (tool === 'hand') return;
    if (penOnly && e.pointerType === 'touch') return;
    e.preventDefault(); cvRef.current.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    if (tool === 'text') { setTin({ x, y, v: '' }); return; }
    if (tool === 'eraser') { cur.current = { erase: true }; eraseAt(x, y); return; }
    if (tool === 'line' || tool === 'rect' || tool === 'oval') { cur.current = { k: tool, c: color, w: wd, p: [x, y, x, y] }; return; }
    cur.current = { c: color, w: tool === 'hl' ? wd * 4 : tool === 'pencil' ? wd * 0.82 : tool === 'fountain' ? wd * 1.18 : wd, a: tool === 'hl' ? 0.35 : tool === 'pencil' ? 0.62 : 1, style: tool === 'pencil' ? 'pencil' : tool === 'fountain' ? 'fountain' : 'pen', p: [x, y] };
  };
  const move = e => {
    const s = cur.current; if (!s) return;
    const [x, y] = pos(e);
    if (s.erase) { eraseAt(x, y); return; }
    const g = cvRef.current.getContext('2d'), ws = page.w / 1200;
    if (s.k) { s.p[2] = x; s.p[3] = y; renderPage(g, page, imgRef.current); drawStroke(g, s, ws); return; }
    const q = s.p, lx = q[q.length - 2], ly = q[q.length - 1];
    if (Math.hypot(x - lx, y - ly) < 2) return;
    q.push(x, y);
    if (s.a < 1) { renderPage(g, page, imgRef.current); drawStroke(g, s, ws); }
    else { g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = s.c; g.globalAlpha = s.a || 1; g.lineWidth = s.w * ws; if (s.style === 'pencil') { g.globalAlpha *= 0.62; g.lineWidth *= 0.82; g.globalCompositeOperation = 'multiply'; } if (s.style === 'fountain') g.lineWidth *= 1.18; g.beginPath(); g.moveTo(lx, ly); g.lineTo(x, y); g.stroke(); g.restore(); }
  };
  const up = () => {
    const s = cur.current; cur.current = null; if (!s) return;
    if (s.erase) { if (s.snap) { hist.current.push({ pi, strokes: s.snap }); redo.current = []; } return; }
    if (s.k && Math.hypot(s.p[2] - s.p[0], s.p[3] - s.p[1]) < 4) { renderPage(cvRef.current.getContext('2d'), page, imgRef.current); return; }
    commit(s);
  };
  const swap = (from, to) => { const h = from.current.pop(); if (!h) return; to.current.push({ pi: h.pi, strokes: d.pages[h.pi].strokes }); setD(o => ({ ...o, pages: o.pages.map((q, i) => i === h.pi ? { ...q, strokes: h.strokes } : q) })); };
  const addText = () => { if (tin && tin.v.trim()) commit({ k: 'text', c: color, x: tin.x, y: tin.y, t: tin.v.trim(), s: 44 }); setTin(null); };
  const goPage = n => { setPi(Math.max(0, Math.min(d.pages.length - 1, n))); hist.current = []; redo.current = []; };
  const addPage = () => { setD(o => ({ ...o, pages: [...o.pages, { w: page.w, h: page.h, tpl: page.img ? 'blank' : page.tpl, strokes: [] }] })); setPi(d.pages.length); hist.current = []; redo.current = []; };
  const delPage = () => { if (d.pages.length < 2) return; setD(o => ({ ...o, pages: o.pages.filter((_, i) => i !== pi) })); setPi(Math.max(0, pi - 1)); hist.current = []; redo.current = []; };
  const share = () => {
    const cv = cvRef.current; if (!cv) return;
    cv.toBlob(async b => {
      if (!b) return; const f = new File([b], (d.title || 'page') + '.png', { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: d.title });
        else { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); }
      } catch (e) {}
    }, 'image/png');
  };
  const exportPdf = async () => {
    setSaveStatus('exporting');
    try {
      const { jsPDF } = await import('jspdf');
      const first = d.pages[0];
      const pdf = new jsPDF({ orientation: first.w > first.h ? 'landscape' : 'portrait', unit: 'px', format: [first.w, first.h], compress: true });
      for (let i = 0; i < d.pages.length; i++) {
        const p = d.pages[i];
        if (i > 0) pdf.addPage([p.w, p.h], p.w > p.h ? 'landscape' : 'portrait');
        const image = p.img ? await loadImg(p.img).catch(() => null) : null;
        const canvas = document.createElement('canvas'); canvas.width = p.w; canvas.height = p.h;
        renderPage(canvas.getContext('2d'), p, image);
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, p.w, p.h, undefined, 'FAST');
      }
      pdf.save((d.title || 'notebook').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) + '.pdf');
      setSaveStatus('saved');
    } catch (e) { setSaveStatus('error'); }
  };
  const close = async () => {
    try { const t = await makeThumb(d); await onSave({ ...d, thumb: t, upd: Date.now() }); setSaveStatus('saved'); onClose(); }
    catch (e) { setSaveStatus('error'); }
  };
  const TOOLS = [['pen', 'Ручка'], ['fountain', 'Перо'], ['pencil', 'Карандаш'], ['hl', 'Маркер'], ['eraser', 'Ластик'], ['line', 'Лінія'], ['rect', 'Прямокутник'], ['oval', 'Еліпс'], ['text', 'Текст'], ['hand', 'Переміщення']];

  return (
    <div className="nv">
      <div className="edtop"><button className="chip" onClick={close}>Готово</button><input value={d.title} onChange={e => setD({ ...d, title: e.target.value })} aria-label="Назва" /><span className={'save-indicator ' + saveStatus}>{saveStatus === 'saving' ? 'Збереження…' : saveStatus === 'error' ? 'Помилка збереження' : saveStatus === 'exporting' ? 'Створення PDF…' : 'Збережено'}</span></div>
      <div className="edtools edtools-top">
        <div className="edrow tool-icon-row primary-tools">
          {TOOLS.map(([k, n]) => <button key={k} type="button" className={'tool-icon' + (tool === k ? ' on' : '')} onClick={() => { setTool(k); setMoreOpen(false); }} title={n} aria-label={n}><ToolIcon name={k} /></button>)}
        </div>
        <div className="edrow compact-options">
          {tool !== 'hand' && tool !== 'eraser' && <>
            <div className="toolbar-picker-wrap">
              <button className="toolbar-picker color-picker" onClick={() => { setColorOpen(v => !v); setWidthOpen(false); }} aria-label="Вибрати колір" aria-expanded={colorOpen}><i style={{ background: color }} />Колір <ToolIcon name="next" /></button>
              {colorOpen && <div className="toolbar-picker-pop color-pop">
                <div className="palette-grid">{COLORS.map(c => <button key={c} className={'palette-swatch' + (color === c ? ' on' : '')} style={{ background: c }} onClick={() => { setColor(c); setColorOpen(false); }} aria-label={'Колір ' + c} title={c} />)}</div>
                <label className="custom-color">Свій колір <input type="color" value={color} onChange={e => setColor(e.target.value)} /></label>
              </div>}
            </div>
            <div className="toolbar-picker-wrap">
              <button className="toolbar-picker width-picker" onClick={() => { setWidthOpen(v => !v); setColorOpen(false); }} aria-label="Вибрати товщину" aria-expanded={widthOpen}><span className="width-preview" style={{ height: Math.max(2, wd * 1.2) }} />{wd.toFixed(1).replace('.0','')} px <ToolIcon name="next" /></button>
              {widthOpen && <div className="toolbar-picker-pop width-pop">
                <div className="width-pop-head"><b>Товщина пера</b><strong>{wd.toFixed(1).replace('.0','')} px</strong></div>
                <input className="width-range" type="range" min="0.5" max="20" step="0.5" value={wd} onChange={e => setWd(Number(e.target.value))} aria-label="Товщина пера" />
                <div className="width-samples"><span>Тонко</span><i style={{ height: Math.max(1, wd) }} /><span>Толсто</span></div>
              </div>}
            </div>
          </>}
          <div className="toolbar-history">
            <button className="tool-icon" onClick={() => swap(hist, redo)} title="Скасувати" aria-label="Скасувати"><ToolIcon name="undo" /></button>
            <button className="tool-icon" onClick={() => swap(redo, hist)} title="Повторити" aria-label="Повторити"><ToolIcon name="redo" /></button>
          </div>
          <button className={'tool-icon more-toggle' + (moreOpen ? ' on' : '')} onClick={() => setMoreOpen(v => !v)} title="Додаткові дії" aria-label="Додаткові дії" aria-expanded={moreOpen}><ToolIcon name="dots" /></button>
        </div>
        {moreOpen && <div className="toolbar-more">
          <div className="toolbar-more-group">
            <span>Масштаб</span>
            <div className="toolbar-more-controls">
              <button className="tool-icon" onClick={() => setZoom(Math.max(1, +(zoom - 0.5).toFixed(1)))} title="Зменшити" aria-label="Зменшити"><ToolIcon name="zoomOut" /></button>
              <b>{Math.round(zoom * 100)}%</b>
              <button className="tool-icon" onClick={() => setZoom(Math.min(4, +(zoom + 0.5).toFixed(1)))} title="Збільшити" aria-label="Збільшити"><ToolIcon name="zoomIn" /></button>
            </div>
          </div>
          <div className="toolbar-more-group">
            <span>Сторінки</span>
            <div className="toolbar-more-controls">
              <button className="tool-icon" onClick={() => goPage(pi - 1)} title="Попередня сторінка" aria-label="Попередня сторінка"><ToolIcon name="prev" /></button>
              <b>{pi + 1}/{d.pages.length}</b>
              <button className="tool-icon" onClick={() => goPage(pi + 1)} title="Наступна сторінка" aria-label="Наступна сторінка"><ToolIcon name="next" /></button>
              <button className={'tool-icon' + (strip ? ' on' : '')} onClick={() => { setStrip(v => !v); setMoreOpen(false); }} title="Мініатюри сторінок" aria-label="Мініатюри сторінок"><ToolIcon name="pages" /></button>
              <button className="tool-icon" onClick={() => { addPage(); setMoreOpen(false); }} title="Додати сторінку" aria-label="Додати сторінку"><ToolIcon name="addPage" /></button>
              {d.pages.length > 1 && <button className="tool-icon" onClick={() => { delPage(); setMoreOpen(false); }} title="Видалити сторінку" aria-label="Видалити сторінку"><ToolIcon name="deletePage" /></button>}
            </div>
          </div>
          {d.type === 'notebook' && !page.img && <div className="toolbar-more-group">
            <span>Шаблон сторінки</span>
            <div className="toolbar-more-controls">
              {['blank', 'lined', 'grid', 'dots'].map(k => <button key={k} className={'tool-icon' + (page.tpl === k ? ' on' : '')} onClick={() => { setPage({ ...page, tpl: k }); setMoreOpen(false); }} title={{ blank: 'Чиста сторінка', lined: 'Лінійка', grid: 'Клітинка', dots: 'Крапки' }[k]} aria-label={{ blank: 'Чиста сторінка', lined: 'Лінійка', grid: 'Клітинка', dots: 'Крапки' }[k]}><ToolIcon name={k} /></button>)}
            </div>
          </div>}
          <div className="toolbar-more-group">
            <span>Експорт і введення</span>
            <div className="toolbar-more-controls">
              <button className="tool-icon" onClick={() => { share(); setMoreOpen(false); }} title="Поділитися PNG" aria-label="Поділитися PNG"><ToolIcon name="share" /></button>
              <button className="tool-icon" onClick={() => { exportPdf(); setMoreOpen(false); }} title="Експорт PDF" aria-label="Експорт PDF"><ToolIcon name="export" /></button>
              <button className={'tool-icon' + (penOnly ? ' on' : '')} onClick={() => setPenOnly(v => !v)} title="Лише Apple Pencil" aria-label="Лише Apple Pencil"><ToolIcon name="pencil" /></button>
            </div>
          </div>
        </div>}
      </div>
      <div className="edbox" ref={boxRef}>
        <canvas ref={cvRef} width={page.w} height={page.h} style={{ width: fit.w * zoom * 1.06, height: fit.h * zoom * 1.06, touchAction: tool === 'hand' ? 'auto' : 'none' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      </div>
      {strip && <div className="strip">{thumbs.map((t, i) => <button key={i} className={i === pi ? 'on' : ''} onClick={() => goPage(i)} style={{ backgroundImage: 'url(' + t + ')' }} aria-label={'Сторінка ' + (i + 1)}><span>{i + 1}</span></button>)}</div>}
      {tin && <div className="ov" onClick={() => setTin(null)}><div className="sheet" onClick={e => e.stopPropagation()}>
        <b>Текст на сторінці</b>
        <textarea style={{ marginTop: 12 }} rows={3} autoFocus value={tin.v} onChange={e => setTin({ ...tin, v: e.target.value })} placeholder="Введіть текст" />
        <div className="row"><button className="btn" onClick={addText}>Додати</button></div>
      </div></div>}
    </div>
  );
}

export default function Docs({ folderId, folders, onNewNote }) {
  const [docs, setDocs] = useState([]);
  const [flt, setFlt] = useState('all');
  const [sort, setSort] = useState('new');
  const [viewMode, setViewMode] = useState('grid');
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const [ed, setEd] = useState(null);
  const [act, setAct] = useState(null);
  const [msg, setMsg] = useState('');
  const phRef = useRef(null), scRef = useRef(null), imRef = useRef(null), pdfRef = useRef(null), backupRef = useRef(null);

  useEffect(() => { dbRun('readonly', s => s.getAll()).then(setDocs).catch(() => setMsg('Сховище документів недоступне в цьому браузері.')); }, []);
  useEffect(() => { const f = () => { dbRun('readonly', s => s.getAll()).then(setDocs).catch(() => {}); }; window.addEventListener('docs-changed', f); return () => window.removeEventListener('docs-changed', f); }, []);
  const persist = async dd => {
    await dbRun('readwrite', s => s.put(dd));
    setDocs(p => p.some(x => x.id === dd.id) ? p.map(x => x.id === dd.id ? dd : x) : [dd, ...p]);
  };
  const openDoc = async x => {
    const opened = { ...x, lastOpened: Date.now() };
    try { await persist(opened); } catch (e) { setMsg('Не удалось обновить документ. Проверьте свободное место в браузере.'); }
    setEd(opened);
  };
  const duplicateDoc = async x => {
    const copy = JSON.parse(JSON.stringify(x));
    copy.id = Date.now() + Math.floor(Math.random() * 100000);
    copy.title = (x.title || 'Документ') + ' — копия';
    copy.created = Date.now(); copy.upd = Date.now(); copy.lastOpened = 0; copy.fav = false;
    try { await persist(copy); setAct(null); setMsg('Копия документа создана.'); }
    catch (e) { setMsg('Не удалось создать копию. Возможно, закончилось место в браузере.'); }
  };
  const fid = typeof folderId === 'number' ? folderId : '';
  const mk = (type, extra) => ({ id: Date.now(), type, title: TYPES[type] + ' ' + new Date().toLocaleDateString('uk-UA'), folder: fid, created: Date.now(), upd: Date.now(), thumb: '', pages: [], ...extra });
  const start = async dd => { try { await persist(dd); setEd(dd); setMenu(false); return true; } catch (e) { setMsg('Не вдалося зберегти документ: можливо, закінчилося місце.'); setMenu(false); return false; } };
  const newNotebook = () => start(mk('notebook', { pages: [{ w: 1200, h: 1600, tpl: 'lined', strokes: [] }] }));
  const newBoard = () => start(mk('board', { pages: [{ w: 1600, h: 1200, tpl: 'blank', strokes: [] }] }));
  const fromFile = async (file, type) => {
    if (!file) return;
    setMsg('Обробка зображення…');
    try { const im = await prepImage(file, type === 'scan'); await start(mk(type, { pages: [{ w: im.w, h: im.h, tpl: 'blank', img: im.src, strokes: [] }] })); setMsg(''); }
    catch (e) { setMsg('Не вдалося обробити зображення.'); setMenu(false); }
  };
  const fromPdf = async file => {
    if (!file) return;
    if (file.size > 35 * 1024 * 1024) { setMsg('PDF завеликий для імпорту в браузері (ліміт 35 МБ). Спробуйте стиснути файл.'); return; }
    setMsg('Імпорт PDF: підготовка сторінок…');
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      const pdf = await task.promise; const count = Math.min(pdf.numPages, 30); const pages = [];
      for (let i = 1; i <= count; i++) {
        setMsg(`Імпорт PDF: сторінка ${i} з ${count}…`);
        const page = await pdf.getPage(i); const base = page.getViewport({ scale: 1 });
        const scale = Math.min(1.5, 1400 / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale }); const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        pages.push({ w: canvas.width, h: canvas.height, tpl: 'blank', img: canvas.toDataURL('image/jpeg', 0.78), strokes: [], pdfPage: i });
        canvas.width = 0; canvas.height = 0;
      }
      const saved = await start({ ...mk('pdf', { pages }), title: file.name.replace(/\.pdf$/i, '') || 'PDF' });
      if (saved) setMsg(pdf.numPages > count ? `Імпортовано перші ${count} сторінок із ${pdf.numPages}.` : 'PDF імпортовано.');
      await pdf.destroy();
    } catch (e) { setMsg('Не вдалося імпортувати PDF. Перевірте файл і спробуйте ще раз.'); setMenu(false); }
  };
  const exportBackup = () => {
    const payload = { format: 'helper-docs-backup', version: 1, exportedAt: new Date().toISOString(), docs };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `helper-documents-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000); setMsg('Резервну копію підготовлено. Збережіть файл у Files або на комп’ютері.');
  };
  const importBackup = async file => {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { setMsg('Файл резервної копії перевищує 100 МБ.'); return; }
    setMsg('Перевірка резервної копії…');
    try {
      const data = JSON.parse(await file.text());
      if (data.format !== 'helper-docs-backup' || !Array.isArray(data.docs)) throw new Error('Invalid backup format');
      const existing = new Set(docs.map(x => String(x.id)));
      const restored = data.docs.filter(x => x && x.id != null && Array.isArray(x.pages) && x.pages.length && x.pages.every(p => p && Number.isFinite(p.w) && Number.isFinite(p.h) && Array.isArray(p.strokes))).map(x => {
        const item = { ...x, id: existing.has(String(x.id)) ? Date.now() + Math.floor(Math.random() * 100000000) : x.id };
        existing.add(String(item.id)); return item;
      });
      if (!restored.length) throw new Error('No valid documents in backup');
      await putManyDocs(restored); setDocs(p => [...restored, ...p]); setMsg(`Відновлено документів: ${restored.length}. Існуючі документи не перезаписувалися.`);
    } catch (e) { setMsg('Не вдалося відновити копію: файл пошкоджений або має невідомий формат.'); }
  };

  const inFolder = x => folderId === 'all' ? true : (folderId == null ? x.folder === '' || x.folder == null : x.folder === folderId);
  const list = docs.filter(inFolder)
    .filter(x => flt === 'all' || (flt === 'recent' && x.lastOpened) || (flt === 'fav' && x.fav) || x.type === flt || (flt === 'img' && (x.type === 'photo' || x.type === 'scan')))
    .filter(x => x.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title) : sort === 'recent' ? (b.lastOpened || 0) - (a.lastOpened || 0) : b.upd - a.upd);

  return (
    <div style={{ marginTop: 26 }}>
      <div className="sec">Документи</div>
      <div className="row library-actions"><button className="btn" onClick={() => setMenu(true)}>Створити або імпортувати</button><button className="btn alt" onClick={exportBackup}>Резервна копія</button><button className="btn alt" onClick={() => backupRef.current && backupRef.current.click()}>Відновити</button></div>
      {msg && <div className="sub" style={{ margin: '10px 0' }}>{msg}</div>}
      <div className="dtools" style={{ marginTop: 14 }}>
        <div className="seg">{FILTERS.map(([k, n]) => <button key={k} className={flt === k ? 'on' : ''} onClick={() => setFlt(k)}>{n}</button>)}</div>
        <div className="row" style={{ margin: 0 }}><input placeholder="Пошук документів" value={q} onChange={e => setQ(e.target.value)} />
          <select value={sort} onChange={e => setSort(e.target.value)} style={{ width: 'auto' }}><option value="new">Останні змінені</option><option value="recent">Останні відкриті</option><option value="name">За назвою</option></select>
          <div className="seg dview"><button className={viewMode === 'grid' ? 'on' : ''} onClick={() => setViewMode('grid')} aria-label="Сітка">▦</button><button className={viewMode === 'list' ? 'on' : ''} onClick={() => setViewMode('list')} aria-label="Список">☰</button></div></div>
      </div>
      {list.length ? <div className={viewMode === 'list' ? 'dlist' : 'dgrid'}>{list.map(x => (
        <div key={x.id}>
          <div className="dthumb" onClick={() => openDoc(x)} style={x.thumb ? { backgroundImage: 'url(' + x.thumb + ')' } : {}}>{!x.thumb && <span>{TYPES[x.type]}</span>}{x.fav && <span className="star">★</span>}</div>
          <div className="dmeta"><div className="dt" onClick={() => openDoc(x)}>{x.title}</div><button className="x" onClick={() => setAct(x)} aria-label="Дії">⋯</button></div>
          <div className="sub">{new Date(x.upd).toLocaleDateString('uk-UA')}, стор.: {x.pages.length}</div>
        </div>))}</div> : <div className="card"><div className="empty">Документів поки немає. Створіть зошит, дошку або додайте скан.</div></div>}

      <input ref={phRef} type="file" accept="image/*" capture="environment" className="hidefile" onChange={e => { fromFile(e.target.files && e.target.files[0], 'photo'); e.target.value = ''; }} />
      <input ref={scRef} type="file" accept="image/*" capture="environment" className="hidefile" onChange={e => { fromFile(e.target.files && e.target.files[0], 'scan'); e.target.value = ''; }} />
      <input ref={imRef} type="file" accept="image/*" className="hidefile" onChange={e => { fromFile(e.target.files && e.target.files[0], 'photo'); e.target.value = ''; }} />
      <input ref={pdfRef} type="file" accept="application/pdf,.pdf" className="hidefile" onChange={e => { fromPdf(e.target.files && e.target.files[0]); e.target.value = ''; }} />
      <input ref={backupRef} type="file" accept="application/json,.json" className="hidefile" onChange={e => { importBackup(e.target.files && e.target.files[0]); e.target.value = ''; }} />

      {menu && <div className="ov" onClick={() => setMenu(false)}><div className="sheet menu" onClick={e => e.stopPropagation()}>
        <b>Створити</b><div style={{ height: 12 }} />
        <button onClick={() => { setMenu(false); onNewNote(true); }}>Швидка нотатка<small>Слова згасають, поки ви пишете</small></button>
        <button onClick={() => { setMenu(false); onNewNote(false); }}>Текстовий документ<small>Звичайний текст</small></button>
        <button onClick={newNotebook}>Зошит<small>Сторінки з лінійкою або клітинкою, малювання від руки</small></button>
        <button onClick={newBoard}>Дошка<small>Велике вільне полотно</small></button>
        <button onClick={() => phRef.current && phRef.current.click()}>Сфотографувати<small>Фото, яке можна підписувати</small></button>
        <button onClick={() => scRef.current && scRef.current.click()}>Сканувати документ<small>Фото з вирівнюванням яскравості, як скан</small></button>
        <button onClick={() => imRef.current && imRef.current.click()}>Імпортувати зображення<small>З галереї або файлів</small></button>
        <button onClick={() => pdfRef.current && pdfRef.current.click()}>Імпортувати PDF<small>До 30 сторінок за один імпорт, з можливістю писати поверх</small></button>
      </div></div>}

      {act && <div className="ov" onClick={() => setAct(null)}><div className="sheet" onClick={e => e.stopPropagation()}>
        <b>Документ</b>
        <input style={{ marginTop: 12 }} value={act.title} onChange={e => setAct({ ...act, title: e.target.value })} />
        <div className="row"><button className="btn alt" onClick={() => setAct({ ...act, fav: !act.fav })}>{act.fav ? '★ В обраному' : '☆ Додати в обране'}</button></div>
        <div className="row"><select value={act.folder === '' || act.folder == null ? '' : act.folder} onChange={e => setAct({ ...act, folder: e.target.value === '' ? '' : Number(e.target.value) })}><option value="">Без папки</option>{folders.map(fo => <option key={fo.id} value={fo.id}>{fo.name}</option>)}</select></div>
        <div className="row"><button className="btn" onClick={async () => { try { await persist({ ...act, upd: Date.now() }); } catch (e) {} setAct(null); }}>Зберегти</button>
          <button className="btn alt" onClick={() => duplicateDoc(act)}>Дублювати</button>
          <button className="btn alt" onClick={async () => { try { await dbRun('readwrite', s => s.delete(act.id)); setDocs(p => p.filter(x => x.id !== act.id)); } catch (e) {} setAct(null); }}>Видалити</button></div>
      </div></div>}

      {ed && <Editor doc={ed} onSave={persist} onClose={() => setEd(null)} />}
    </div>
  );
}
