'use client';
import { useState, useEffect, useRef } from 'react';
import { listMeta, getDoc, saveDoc, putMeta, putDoc, delDoc, duplicateDoc, reparentDocs, moveDoc } from './store';
import { Fragment } from 'react';
import { newDoc, newId, folderPath, fitPage, descendants, breadcrumb } from './lib';
import { t as tr, loc, plural } from './i18n';
import { drawStroke, renderPage, drawSeg, pressureOf, synthPressure, rulerSnap, rulerProject, hitStroke, splitStroke, nearlyStraight, isHl, PENS, PRESSURE_NIBS, SHAPES } from './draw';
import { FolderGlyph, FOLDER_COLORS } from './folder-icons';

export { putDoc, delDoc, newDoc, reparentDocs, moveDoc };
export const listDocs = listMeta;
const TYPES = { notebook: 'Зошит', board: 'Дошка', photo: 'Фото', scan: 'Скан', note: 'Нотатка' };
// фільтр типу в папці (етап 2): «Обране» — окремий перемикач, не тип
const TFILT = [['all', 'Усі'], ['notebook', 'Зошити'], ['board', 'Дошки'], ['img', 'Фото й скани'], ['note', 'Нотатки']];
// Палітра папок і обкладинок = токени стилю C. У даних лишається hex (сумісність зі старими версіями й синхронізацією),
// а малюється CSS-змінна, тож у світлій темі колір автоматично темніший.
export const PALETTE_C = [['#7AA2FF', 'study', 'Синій'], ['#F2A93B', 'accent', 'Бурштиновий'], ['#9BD46A', 'home', 'Зелений'], ['#C3A0FF', 'personal', 'Фіолетовий'], ['#FF9B6A', 'health', 'Помаранчевий'], ['#5FD0C0', 'work', 'Бірюзовий'], ['#8B9098', 'neutral', 'Сірий']];
const LEGACY_C = { '#0a84ff': 'study', '#ff375f': 'health', '#ff453a': 'health', '#ff9f0a': 'accent', '#ffd60a': 'accent', '#30d158': 'home', '#4cc38a': 'home', '#bf5af2': 'personal', '#c79bff': 'personal', '#64d2ff': 'work', '#8e8e93': 'neutral', '#1c1c1e': 'neutral' };
export const SOLID = { study: 'var(--c-study)', accent: 'var(--accent-tx)', home: 'var(--c-home)', personal: 'var(--c-personal)', health: 'var(--c-health)', work: 'var(--c-work)', neutral: 'var(--tx3)' };
const SOFT = { study: 'var(--c-study-bg)', accent: 'var(--accent-soft)', home: 'var(--c-home-bg)', personal: 'var(--c-personal-bg)', health: 'var(--c-health-bg)', work: 'var(--c-work-bg)', neutral: 'var(--fill)' };
export const colorKey = hex => { const h = String(hex || '').toLowerCase(); const p = PALETTE_C.find(x => x[0].toLowerCase() === h); return p ? p[1] : (LEGACY_C[h] || null); };
export const solidOf = hex => { const k = colorKey(hex); return k ? SOLID[k] : (/^#[0-9a-f]{6}$/i.test(hex || '') ? hex : SOLID.neutral); };
const COVERS = PALETTE_C.map(x => x[0]);
export const bridge = { info: null, getImage: null };
export async function shrink(file, max = 1024, q = 0.72) {
  const img = await loadImg(typeof file === 'string' ? file : await readFile(file));
  const sc = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
  c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
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

const EI = {
  check: <path d="M5 13l4 4L19 7" />,
  pen: <><path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16z" /><path d="M14 7l3 3" /></>,
  hl: <><path d="M14 4l6 6-8 8H6v-6z" /><path d="M4 21h16" /></>,
  eraser: <><path d="M4 15l8-8 8 8-4 4H8z" /><path d="M12 19h8" /></>,
  line: <path d="M5 19L19 5" />,
  rect: <rect x="4" y="6" width="16" height="12" rx="1.5" />,
  oval: <ellipse cx="12" cy="12" rx="8" ry="6" />,
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  hand: <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10M12 10V4.5a1.5 1.5 0 0 1 3 0V11M15 11V7a1.5 1.5 0 0 1 3 0v6a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2-3a1.5 1.5 0 0 1 2.5-1.6L9 14z" />,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>,
  pages: <><rect x="5" y="3" width="11" height="15" rx="2" /><path d="M8 21h9a2 2 0 0 0 2-2V8" /></>,
  share: <><path d="M12 15V3M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M5 7h14M10 7V4h4v3" /><path d="M7 7l1 13h8l1-13" /></>,
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  ruler: <><path d="M3 16L16 3l5 5L8 21z" /><path d="M7 12l2.5 2.5M10 9l2 2M13 6l2.5 2.5" /></>,
  arrow: <><path d="M5 19L19 5" /><path d="M10 5h9v9" /></>,
  triangle: <path d="M12 5l8 14H4z" />,
  zin: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4M8.5 11h5M11 8.5v5" /></>,
  zout: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4M8.5 11h5" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  star: <path d="M12 4l2.5 5 5.5.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9 5.5-.8z" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};
Object.assign(EI, {
  pencil: <><path d="M16.5 3.5l4 4L9 19l-5 1 1-5z" /><path d="M14 6l4 4" /><path d="M5.6 16.6l1.8 1.8" /></>,
  marker: <><path d="M14 3.5l6.5 6.5-7.5 7.5L6.5 11z" /><path d="M6.5 11L4 17.5 6.5 20l6.5-2.5" /><path d="M3.5 21h4" /></>,
  tune: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
});
// Інструменти тулбара (лінійка — у контекстному ряду, поруч із кольорами й товщиною)
const TOOLS = ['pen', 'pencil', 'marker', 'hl', 'eraser', 'shape', 'text', 'hand'];
const DRAW = ['pen', 'pencil', 'marker', 'hl'];
const TOOLN = { pen: 'Ручка', pencil: 'Олівець', marker: 'Маркер', hl: 'Виділювач', eraser: 'Гумка', shape: 'Фігури', text: 'Текст', ruler: 'Лінійка', hand: 'Рука' };
const NIBN = { ball: 'Кулькова', fountain: 'Перова', fineliner: 'Лайнер', brush: 'Пензель', calli: 'Каліграфія', pencil: 'Олівець', felt: 'Фломастер', chisel: 'Маркер' };
const SHAPEN = { line: 'Лінія', arrow: 'Стрілка', rect: 'Рамка', oval: 'Овал', triangle: 'Трикутник' };
// Кольори чорнила — дані документа, не токени інтерфейсу
const INK = [['#1c1c1e', 'Чорний'], ['#5b5f66', 'Графітовий'], ['#8e8e93', 'Сірий'], ['#ffffff', 'Білий'], ['#7a4a2a', 'Коричневий'], ['#8b1e3f', 'Бордовий'], ['#e5322d', 'Червоний'], ['#f28c28', 'Помаранчевий'],
  ['#f5c400', 'Жовтий'], ['#2f9e44', 'Зелений'], ['#0ca5a0', 'Бірюзовий'], ['#2b9be0', 'Блакитний'], ['#1f5fd6', 'Синій'], ['#1e2a78', 'Темно-синій'], ['#7b3fc4', 'Фіолетовий'], ['#e0408a', 'Рожевий']];
const HL_INK = [['#ffe066', 'Жовтий'], ['#ffc58a', 'Персиковий'], ['#ffb3c7', 'Рожевий'], ['#d0b8ff', 'Бузковий'], ['#9fd8ff', 'Блакитний'], ['#a5f3b5', 'Зелений'], ['#b0f0e8', 'М’ятний'], ['#d9d9d9', 'Сірий']];
const colorName = c => { const x = INK.concat(HL_INK).find(y => y[0] === String(c).toLowerCase()); return x ? tr(x[1]) : String(c); };
// Три швидкі товщини для кожного типу пера (середня — за замовчуванням)
const WSETS = { ball: [2.5, 4, 6], fountain: [4, 6, 9], fineliner: [1.5, 2.5, 4], brush: [8, 12, 18], calli: [6, 9, 13], pencil: [3, 5, 8], felt: [5, 7, 10], chisel: [10, 14, 20], hl: [14, 22, 32], shape: [2, 4, 7] };
const WN = ['Тонка', 'Середня', 'Товста'];
const TOOLCFG = {
  pen: { nibs: ['ball', 'fountain', 'fineliner', 'brush', 'calli'], nib: 'ball', favs: ['#1c1c1e', '#1f5fd6', '#e5322d'], op: 1 },
  pencil: { nibs: ['pencil'], nib: 'pencil', favs: ['#3a3a3c', '#1f5fd6', '#e5322d'], op: PENS.pencil.op },
  marker: { nibs: ['felt', 'chisel'], nib: 'felt', favs: ['#1f5fd6', '#e5322d', '#2f9e44'], op: 1 },
  hl: { nibs: ['hl'], nib: 'hl', favs: ['#ffe066', '#a5f3b5', '#ffb3c7'], op: 0.4, straight: false },
  shape: { nibs: ['shape'], nib: 'shape', favs: ['#1c1c1e', '#1f5fd6', '#e5322d'], op: 1 },
  text: { nibs: ['text'], nib: 'text', favs: ['#1c1c1e', '#1f5fd6', '#e5322d'], op: 1 },
};
const ER_SIZES = [12, 28, 56];
// Останній вибір кожного інструмента — у localStorage['helper-pens'] (тип пера, 3 улюблені кольори, слот, товщини, прозорість)
function loadPens() {
  const d = {};
  for (const k in TOOLCFG) d[k] = { nib: TOOLCFG[k].nib, favs: [...TOOLCFG[k].favs], slot: 0, op: TOOLCFG[k].op, straight: !!TOOLCFG[k].straight, w: {}, wi: {} };
  d.eraser = { mode: 'stroke', sizes: [...ER_SIZES], wi: 1, hlOnly: false };
  try {
    const s = JSON.parse(localStorage.getItem('helper-pens') || 'null');
    if (s && typeof s === 'object') for (const k in d) if (s[k] && typeof s[k] === 'object') {
      const m = { ...d[k], ...s[k] };
      if (TOOLCFG[k] && !TOOLCFG[k].nibs.includes(m.nib)) m.nib = TOOLCFG[k].nib;
      if (m.favs && (!Array.isArray(m.favs) || m.favs.length !== 3)) m.favs = d[k].favs;
      d[k] = m;
    }
  } catch (e) {}
  return d;
}
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

function EIcon({ n, size = 22 }) { return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{EI[n]}</svg>; }
function IB({ n, label, on, onClick, disabled, pressed }) { return <button className={'ib' + (on ? ' on' : '')} onClick={onClick} aria-label={label} title={label} disabled={disabled} aria-pressed={pressed}><EIcon n={n} /></button>; }
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
  const [tool, setTool] = useState(() => { const t = lsGet('helper-tool'); return TOOLS.includes(t) && t !== 'hand' ? t : 'pen'; });
  const [pens, setPens] = useState(loadPens);
  const [shape, setShape] = useState('line');
  const [ruler, setRuler] = useState({ on: false, x: 200, y: 400, a: 0, len: 700 });
  const rdrag = useRef(null);
  // «Малювати лише стилусом»: null — ще не вирішено (вмикається само, щойно з'явиться стилус)
  const [penOnly, setPenOnly] = useState(() => lsGet('helper-penonly') === '1');
  const [pressure, setPressure] = useState(true);
  const [toast, setToast] = useState('');
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState({ w: 300, h: 400 });
  const [tick, setTick] = useState(0);
  const [tin, setTin] = useState(null);
  const [strip, setStrip] = useState(false);
  const [pop, setPop] = useState(null);
  const [popTop, setPopTop] = useState(96);
  const barRef = useRef(null), holdT = useRef(null);
  const [thumbs, setThumbs] = useState([]);
  const cvRef = useRef(null), boxRef = useRef(null), imgRef = useRef(null), cur = useRef(null), hist = useRef([]), redo = useRef([]), dRef = useRef(d), piRef = useRef(0), saved = useRef(doc.pages), touches = useRef(new Map()), gest = useRef(null);
  dRef.current = d; piRef.current = pi;
  const page = d.pages[pi];
  const setPage = np => setD(o => ({ ...o, pages: o.pages.map((q, i) => i === pi ? np : q) }));

  // поточні налаштування інструмента
  // для гумки й руки кольори/товщина беруться з останнього інструмента, що малює
  const [lastT, setLastT] = useState('pen');
  useEffect(() => { if (TOOLCFG[tool]) setLastT(tool); }, [tool]);
  const ctool = TOOLCFG[tool] ? tool : lastT, tc = pens[ctool], nib = tc.nib;
  const wset = (tc.w && tc.w[nib]) || WSETS[nib] || WSETS.ball, wi = tc.wi && tc.wi[nib] != null ? tc.wi[nib] : 1, wd = wset[wi];
  const color = tc.favs[tc.slot] || tc.favs[0], op = tc.op;
  const er = pens.eraser;
  const upd = (t, patch) => setPens(p => ({ ...p, [t]: { ...p[t], ...patch } }));
  useEffect(() => { lsSet('helper-pens', JSON.stringify(pens)); }, [pens]);
  useEffect(() => { if (tool !== 'hand') lsSet('helper-tool', tool); }, [tool]);
  const setColor = c => { const f = [...tc.favs]; f[tc.slot] = c; upd(ctool, { favs: f }); };
  const setWi = i => upd(ctool, { wi: { ...tc.wi, [nib]: i } });
  const setWv = v => { const s = [...wset]; s[wi] = v; upd(ctool, { w: { ...tc.w, [nib]: s } }); };
  const togglePenOnly = () => { const v = !penOnly; setPenOnly(v); lsSet('helper-penonly', v ? '1' : '0'); };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); }, [toast]);

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
    const f = () => {
      const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return;
      const r = fitPage(page, W, H);
      if (r.pageH !== page.h) setPage({ ...page, h: r.pageH });
      setFit({ w: r.cssW, h: r.cssH });
    };
    f(); const ro = new ResizeObserver(f); ro.observe(el); return () => ro.disconnect();
  }, [page.w, page.h, page.img]);
  useEffect(() => {
    let off = false;
    if (!page.img) { imgRef.current = null; setTick(t => t + 1); return; }
    loadImg(page.img).then(im => { if (!off) { imgRef.current = im; setTick(t => t + 1); } }).catch(() => {});
    return () => { off = true; };
  }, [pi, page.img]);
  useEffect(() => { const cv = cvRef.current; if (cv) renderPage(cv.getContext('2d'), page, imgRef.current); }, [d, pi, tick]);
  const flush = async extra => {
    const pages = d.pages;
    const dirty = pages.length !== saved.current.length ? 'all' : pages.map((p, i) => p === saved.current[i] ? -1 : i).filter(i => i >= 0);
    await onSave({ ...d, ...extra, upd: Date.now() }, dirty); saved.current = pages;
  };
  useEffect(() => { const t = setTimeout(() => { flush().catch(() => {}); }, 1500); return () => clearTimeout(t); }, [d]);
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
  // Гумка: «Штрих повністю» прибирає штрих, «Точковий» вирізає шматок; «Лише виділювач» не чіпає чорнило.
  // Поточний стан штрихів тримаємо в cur.current.strokes, щоб швидкі рухи між рендерами не губили стирання.
  const eraseAt = (x, y) => {
    const ws = page.w / 1200, r = er.sizes[er.wi] * ws, c = cur.current, src = (c && c.strokes) || page.strokes;
    let changed = false; const out = [];
    for (const s of src) {
      if ((er.hlOnly && !isHl(s)) || !hitStroke(s, ws, x, y, r)) { out.push(s); continue; }
      changed = true;
      if (er.mode === 'point') out.push(...splitStroke(s, ws, x, y, r));
    }
    if (changed) { if (c && !c.snap) c.snap = page.strokes; if (c) c.strokes = out; setPage({ ...page, strokes: out }); }
  };
  const straighten = s => { const q = s.p; s.p = [q[0], q[1], q[q.length - 2], q[q.length - 1]]; if (s.pr) s.pr = [s.pr[0], s.pr[s.pr.length - 1]]; s.straight = true; };
  const down = e => {
    if (tool === 'hand') return;
    if (e.pointerType === 'pen' && lsGet('helper-penonly') == null) {
      // перший дотик стилусом: вмикаємо «лише стилус», палець далі гортає сторінку
      setPenOnly(true); lsSet('helper-penonly', '1'); setToast(tr("Стилус виявлено: пальцем тепер можна гортати й масштабувати. Змінити — у налаштуваннях інструмента."));
    }
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, [e.clientX, e.clientY]);
      const el = boxRef.current;
      if (touches.current.size >= 2) {
        cur.current = null; clearTimeout(holdT.current); renderPage(cvRef.current.getContext('2d'), page, imgRef.current);
        const [a, b] = [...touches.current.values()];
        gest.current = { d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z0: zoom, m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], sl: el.scrollLeft, st: el.scrollTop };
        return;
      }
      if (penOnly) { gest.current = { pan: true, m0: [e.clientX, e.clientY], sl: el.scrollLeft, st: el.scrollTop }; return; }
    }
    e.preventDefault(); cvRef.current.setPointerCapture(e.pointerId);
    let [x, y] = pos(e);
    if (tool === 'text') { setTin({ x, y, v: '' }); return; }
    if (tool === 'eraser') { cur.current = { erase: true }; eraseAt(x, y); return; }
    const ws = page.w / 1200, snap = ruler.on ? rulerSnap(ruler, x, y, 40 * ws) : null;
    if (snap) { x = snap.x; y = snap.y; }
    if (tool === 'shape') { cur.current = { k: shape, c: color, w: wd, p: [x, y, x, y], lock: !!snap && (shape === 'line' || shape === 'arrow') }; return; }
    let st;
    if (tool === 'hl') {
      // новий виділювач: n 'marker' (старі версії малюють його як раніше) + u: шар під чорнилом
      st = { n: 'marker', u: 1, c: color, w: wd, a: op < 1 ? op : 0.4, p: [x, y] };
      if (tc.straight) st.straight = true;
    } else {
      st = { n: nib, c: color, w: wd, p: [x, y], seed: Math.floor(Math.random() * 1e6) };
      if (tool === 'pencil') { st.v = 2; if (op < 1) st.a = op; }
      const pm = PRESSURE_NIBS[nib], isPen = e.pointerType === 'pen';
      if (pm) { const p0 = isPen && pressure ? pressureOf(e) : (pm === 'strong' ? 0.6 : null); if (p0 != null) st.pr = [p0]; }
    }
    if (snap) st.lock = true;
    cur.current = st;
  };
  const move = e => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, [e.clientX, e.clientY]);
      const g = gest.current;
      if (g) {
        const el = boxRef.current;
        if (g.pan) { el.scrollLeft = g.sl - (e.clientX - g.m0[0]); el.scrollTop = g.st - (e.clientY - g.m0[1]); }
        else if (touches.current.size >= 2) {
          const [a, b] = [...touches.current.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          setZoom(Math.max(1, Math.min(5, +(g.z0 * d / g.d0).toFixed(2))));
          el.scrollLeft = g.sl - ((a[0] + b[0]) / 2 - g.m0[0]); el.scrollTop = g.st - ((a[1] + b[1]) / 2 - g.m0[1]);
        }
        return;
      }
    }
    const s = cur.current; if (!s) return;
    const [x, y] = pos(e);
    if (s.erase) { eraseAt(x, y); return; }
    const g = cvRef.current.getContext('2d'), ws = page.w / 1200, img = imgRef.current;
    if (s.k) { let ex = x, ey = y; if (s.lock) { const q = rulerProject(ruler, x, y); ex = q.x; ey = q.y; } s.p[2] = ex; s.p[3] = ey; renderPage(g, page, img, s); return; }
    if (s.straight) { let ex = x, ey = y; if (s.lock) { const q = rulerProject(ruler, x, y); ex = q.x; ey = q.y; } s.p = [s.p[0], s.p[1], ex, ey]; renderPage(g, page, img, s); return; }
    const evs = e.pointerType === 'pen' && e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    let added = false;
    for (const ev of evs) {
      let [px, py] = pos(ev);
      if (s.lock) { const q = rulerProject(ruler, px, py); px = q.x; py = q.y; }
      const qq = s.p, lx = qq[qq.length - 2], ly = qq[qq.length - 1], dist = Math.hypot(px - lx, py - ly);
      if (dist < 2) continue;
      qq.push(px, py); added = true;
      if (s.pr) s.pr.push(ev.pointerType === 'pen' && pressure ? pressureOf(ev) : synthPressure(s.pr[s.pr.length - 1], dist, s.lt != null ? ev.timeStamp - s.lt : 8));
      s.lt = ev.timeStamp;
      if (s.a < 1 || isHl(s)) renderPage(g, page, img, s);
      else { g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; drawSeg(g, s, ws, qq.length / 2 - 1, true); g.restore(); }
    }
    // виділювач: затримали перо в кінці лінії на 0,5 с — лінія вирівнюється
    if (added && s.u) {
      clearTimeout(holdT.current);
      holdT.current = setTimeout(() => { if (cur.current !== s || s.straight || s.p.length < 6) return; straighten(s); renderPage(g, page, img, s); }, 500);
    }
  };
  const up = e => {
    if (e && e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      if (touches.current.size === 0 || (gest.current && !gest.current.pan && touches.current.size < 2)) gest.current = null;
    }
    clearTimeout(holdT.current);
    const s = cur.current; cur.current = null; if (!s) return;
    if (s.erase) { if (s.snap) { hist.current.push({ pi, strokes: s.snap }); redo.current = []; } return; }
    if (s.k && Math.hypot(s.p[2] - s.p[0], s.p[3] - s.p[1]) < 4) { renderPage(cvRef.current.getContext('2d'), page, imgRef.current); return; }
    // виділювач: майже пряму лінію вирівнюємо автоматично
    if (s.u && !s.straight && nearlyStraight(s.p, page.w / 1200)) straighten(s);
    const { lock, lt, straight, ...clean } = s;
    commit(clean);
  };
  const swap = (from, to) => { const h = from.current.pop(); if (!h) return; to.current.push({ pi: h.pi, strokes: d.pages[h.pi].strokes }); setD(o => ({ ...o, pages: o.pages.map((q, i) => i === h.pi ? { ...q, strokes: h.strokes } : q) })); };
  const addText = () => { if (tin && tin.v.trim()) commit({ k: 'text', c: color, x: tin.x, y: tin.y, t: tin.v.trim(), s: 44 }); setTin(null); };
  const goPage = n => { setPi(Math.max(0, Math.min(d.pages.length - 1, n))); hist.current = []; redo.current = []; if (boxRef.current) boxRef.current.scrollTop = 0; };
  const placeRuler = () => {
    const el = boxRef.current, sc = (fit.w * zoom) / page.w;
    return { on: true, x: (el.scrollLeft + el.clientWidth * 0.12) / sc, y: (el.scrollTop + el.clientHeight * 0.4) / sc, a: 0, len: Math.min(page.w * 0.85, (el.clientWidth * 0.76) / sc) };
  };
  const toggleRuler = () => setRuler(r => (r.on ? { ...r, on: false } : placeRuler()));
  // повторний дотик до активного інструмента — його налаштування
  const pickTool = k => {
    if (k === tool && k !== 'hand') { openPop('style'); return; }
    setTool(k); setPop(null);
  };
  const rulerDown = (e, mode) => { e.stopPropagation(); e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); const [x, y] = pos(e); rdrag.current = { mode, x0: x, y0: y, r0: { ...ruler } }; };
  const rulerMove = e => {
    const d0 = rdrag.current; if (!d0) return;
    const [x, y] = pos(e);
    if (d0.mode === 'move') setRuler({ ...d0.r0, x: d0.r0.x + (x - d0.x0), y: d0.r0.y + (y - d0.y0) });
    else setRuler({ ...d0.r0, a: Math.atan2(y - d0.r0.y, x - d0.r0.x), len: Math.max(160, Math.hypot(x - d0.r0.x, y - d0.r0.y)) });
  };
  function openPop(k) { if (pop === k) { setPop(null); return; } if (barRef.current) setPopTop(Math.round(barRef.current.getBoundingClientRect().bottom + 8)); setPop(k); }
  const addPage = () => { setD(o => ({ ...o, pages: [...o.pages, { w: page.w, h: page.h, tpl: page.img ? 'blank' : page.tpl, strokes: [] }] })); setPi(d.pages.length); hist.current = []; redo.current = []; };
  const delPage = () => { if (d.pages.length < 2) return; setD(o => ({ ...o, pages: o.pages.filter((_, i) => i !== pi) })); setPi(Math.max(0, pi - 1)); hist.current = []; redo.current = []; };
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape' && pop) { setPop(null); return; }
      if (tin || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault(); if (e.shiftKey) swap(redo, hist); else swap(hist, redo);
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });
  const share = () => {
    const cv = cvRef.current; if (!cv) return;
    cv.toBlob(async b => {
      if (!b) return; const f = new File([b], (d.title || 'page') + '.png', { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: d.title });
        else { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = f.name; a.click(); }
      } catch (e) {}
    }, 'image/png');
  };
  const close = async () => { try { const t = await makeThumb(d); await flush({ thumb: t }); } catch (e) {} onClose(); };

  const toolLabel = k => tr(k === 'marker' ? NIBN[pens.marker.nib] : TOOLN[k]);
  const toolIcon = k => (k === 'shape' ? shape : k);
  const isHlTool = ctool === 'hl';
  const pal = isHlTool ? HL_INK : INK;
  const dotOf = w => Math.max(3, Math.min(22, Math.round(w * (isHlTool ? 0.55 : ctool === 'shape' ? 1.6 : 1.2))));
  // ряд «улюблені кольори + 3 товщини + лінійка + налаштування» для поточного інструмента
  const favRow = <>{tc.favs.map((c, i) => <button key={i} className="fav" aria-pressed={tc.slot === i} aria-label={tr("Колір") + ' ' + (i + 1) + ': ' + colorName(c)} title={colorName(c)}
    onClick={() => { if (tool === 'hand' || tool === 'eraser') setTool(ctool); if (tc.slot === i) openPop('style'); else upd(ctool, { slot: i }); }}><i style={{ background: c }} /></button>)}</>;
  const widthRow = <>{wset.map((w, i) => <button key={i} className="wbtn" aria-pressed={wi === i} aria-label={tr("Товщина") + ': ' + tr(WN[i])} title={tr(WN[i])}
    onClick={() => { if (wi === i) openPop('style'); else setWi(i); }}><i style={{ width: dotOf(w), height: dotOf(w), background: 'currentColor' }} /></button>)}</>;
  const tuneBtn = <IB n="tune" label={tr("Налаштування інструмента")} on={pop === 'style'} onClick={() => openPop('style')} />;
  const ctxRow = tool === 'hand' ? <span className="sub edhint">{tr("Гортайте й масштабуйте сторінку")}</span>
    : tool === 'eraser' ? <>
      <div className="seg edseg" role="group" aria-label={tr("Режим гумки")}>{[['stroke', 'Штрих'], ['point', 'Точково']].map(([k, n]) => <button key={k} className={er.mode === k ? 'on' : ''} aria-pressed={er.mode === k} onClick={() => upd('eraser', { mode: k })}>{tr(n)}</button>)}</div>
      {er.sizes.map((w, i) => <button key={i} className="wbtn" aria-pressed={er.wi === i} aria-label={tr("Розмір гумки") + ': ' + tr(['Малий', 'Середній', 'Великий'][i])} onClick={() => upd('eraser', { wi: i })}><i className="ring" style={{ width: 6 + i * 6, height: 6 + i * 6 }} /></button>)}
      {tuneBtn}</>
    : <>{favRow}{tool !== 'text' && <><span className="edsep" aria-hidden="true" />{widthRow}<IB n="ruler" label={tr("Лінійка")} on={ruler.on} pressed={ruler.on} onClick={toggleRuler} /></>}{tuneBtn}</>;
  const stylusTg = <button className={'tg' + (penOnly ? ' on' : '')} aria-pressed={penOnly} onClick={togglePenOnly}><span>{tr("Малювати лише стилусом")}<small className="tgsub">{tr("Палець гортає й масштабує сторінку")}</small></span><b>{penOnly ? '✓' : ''}</b></button>;

  return (
    <div className="nv ed">
      <div className="edbar" ref={barRef}>
        <div className="edrow2">
          <IB n="check" label={tr("Готово")} onClick={close} />
          <input className="edtitle" value={d.title} onChange={e => setD({ ...d, title: e.target.value })} aria-label={tr("Назва")} />
          <IB n="undo" label={tr("Скасувати")} onClick={() => swap(hist, redo)} />
          <IB n="redo" label={tr("Вперед")} onClick={() => swap(redo, hist)} />
          <IB n="pages" label={tr("Сторінки")} on={strip} onClick={() => setStrip(!strip)} />
          <IB n="share" label={tr("Поділитися")} onClick={share} />
          <IB n="more" label={tr("Ще")} on={pop === 'more'} onClick={() => openPop('more')} />
        </div>
        <div className="edrow3">
          <div className="edtools" role="group" aria-label={tr("Інструменти")}>
            {TOOLS.map(k => <IB key={k} n={toolIcon(k)} label={toolLabel(k)} on={tool === k} pressed={tool === k} onClick={() => pickTool(k)} />)}
          </div>
          <div className="edctx" role="group" aria-label={tr("Колір і товщина")}>{ctxRow}</div>
        </div>
      </div>
      <div className="edbox" ref={boxRef} style={page.img ? { background: 'var(--fill)' } : undefined}>
        <div className="cvwrap" style={{ width: fit.w * zoom, height: fit.h * zoom }}>
          <canvas ref={cvRef} width={page.w} height={page.h} style={{ width: '100%', height: '100%', touchAction: tool === 'hand' ? 'auto' : 'none' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          {ruler.on && (() => { const sc = (fit.w * zoom) / page.w; return (
            <div className="ruler" style={{ left: ruler.x * sc, top: ruler.y * sc, width: ruler.len * sc, transform: 'rotate(' + ruler.a + 'rad)' }}>
              <div className="rbody" />
              <div className="rh rmove" onPointerDown={e => rulerDown(e, 'move')} onPointerMove={rulerMove} onPointerUp={() => { rdrag.current = null; }} onPointerCancel={() => { rdrag.current = null; }} />
              <div className="rh rrot" onPointerDown={e => rulerDown(e, 'rot')} onPointerMove={rulerMove} onPointerUp={() => { rdrag.current = null; }} onPointerCancel={() => { rdrag.current = null; }} />
            </div>); })()}
        </div>
      </div>
      {strip && <div className="strip">{thumbs.map((th, i) => <button key={i} className={i === pi ? 'on' : ''} onClick={() => goPage(i)} style={{ backgroundImage: 'url(' + th + ')' }} aria-label={tr("Сторінка") + ' ' + (i + 1)}><span>{i + 1}</span></button>)}</div>}
      <div className="pgnav">
        <IB n="left" label={tr("Попередня сторінка")} onClick={() => goPage(pi - 1)} disabled={pi === 0} />
        <span>{pi + 1} / {d.pages.length}</span>
        <IB n="right" label={tr("Наступна сторінка")} onClick={() => goPage(pi + 1)} disabled={pi >= d.pages.length - 1} />
        <IB n="plus" label={tr("Додати сторінку")} onClick={addPage} />
      </div>
      {toast && <div className="edtoast" role="status">{toast}</div>}
      {pop && <div className="popback" onClick={() => setPop(null)}><div className="pop" role="dialog" aria-label={pop === 'more' ? tr("Ще") : tr("Налаштування інструмента")} style={{ top: popTop, maxHeight: 'calc(100% - ' + (popTop + 12) + 'px)' }} onClick={e => e.stopPropagation()}>
        {pop === 'style' && (tool === 'eraser' ? <>
          <div className="pop-t">{tr("Гумка")}</div>
          <div className="seg" role="group" aria-label={tr("Режим гумки")}>{[['stroke', 'Штрих повністю'], ['point', 'Точковий']].map(([k, n]) => <button key={k} className={er.mode === k ? 'on' : ''} aria-pressed={er.mode === k} onClick={() => upd('eraser', { mode: k })}>{tr(n)}</button>)}</div>
          <label className="srow"><span>{tr("Розмір гумки")}</span><input type="range" min="6" max="90" value={er.sizes[er.wi]} onChange={e => { const s = [...er.sizes]; s[er.wi] = +e.target.value; upd('eraser', { sizes: s }); }} /><b>{er.sizes[er.wi]}</b></label>
          <button className={'tg' + (er.hlOnly ? ' on' : '')} aria-pressed={er.hlOnly} onClick={() => upd('eraser', { hlOnly: !er.hlOnly })}><span>{tr("Лише виділювач")}<small className="tgsub">{tr("Чорнило й фігури не стираються")}</small></span><b>{er.hlOnly ? '✓' : ''}</b></button>
          {stylusTg}
        </> : <>
          <div className="pop-t">{toolLabel(ctool)}</div>
          {ctool === 'shape' && <div className="prow" role="group" aria-label={tr("Фігура")}>{SHAPES.map(k => <IB key={k} n={k} label={tr(SHAPEN[k])} on={shape === k} pressed={shape === k} onClick={() => { setShape(k); setTool('shape'); }} />)}</div>}
          {TOOLCFG[ctool].nibs.length > 1 && <div className="prow" role="group" aria-label={tr("Тип")}>{TOOLCFG[ctool].nibs.map(k => <button key={k} className={'chip sm' + (nib === k ? ' on' : '')} aria-pressed={nib === k} onClick={() => upd(ctool, { nib: k })}>{tr(NIBN[k])}</button>)}</div>}
          <div className="pop-l" id="pl-fav">{tr("Улюблені кольори")}</div>
          <div className="prow fav-row" role="group" aria-labelledby="pl-fav">{favRow}</div>
          <div className="ipal" role="group" aria-label={tr("Палітра")}>
            {pal.map(([c, nm]) => <button key={c} className="ipc" aria-pressed={color === c} aria-label={tr(nm)} title={tr(nm)} onClick={() => setColor(c)}><i style={{ background: c }} /></button>)}
            <label className="ipc icustom" title={tr("Свій колір")}><i style={pal.some(x => x[0] === color) ? undefined : { background: color }} /><input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#000000'} onChange={e => setColor(e.target.value)} aria-label={tr("Свій колір")} /></label>
          </div>
          {ctool !== 'text' && <>
            <div className="prow" role="group" aria-label={tr("Товщина")}>{widthRow}</div>
            <label className="srow"><span>{tr("Товщина")}</span><input type="range" min="1" max={isHlTool ? 60 : 40} step="0.5" value={wd} onChange={e => setWv(+e.target.value)} /><b>{wd}</b></label>
          </>}
          {(ctool === 'pencil' || isHlTool) && <label className="srow"><span>{tr("Прозорість")}</span><input type="range" min="10" max="100" value={Math.round(op * 100)} onChange={e => upd(ctool, { op: +e.target.value / 100 })} /><b>{Math.round(op * 100)}%</b></label>}
          {ctool !== 'text' && <div className="wprev" aria-hidden="true"><i style={{ height: Math.max(1, Math.min(wd * (ctool === 'shape' ? 1 : 1), 40)), background: color, opacity: isHlTool || ctool === 'pencil' ? op : 1 }} /></div>}
          {isHlTool && <><button className={'tg' + (tc.straight ? ' on' : '')} aria-pressed={!!tc.straight} onClick={() => upd('hl', { straight: !tc.straight })}><span>{tr("Рівна лінія")}<small className="tgsub">{tr("Без цього: затримайте перо в кінці лінії, і вона вирівняється")}</small></span><b>{tc.straight ? '✓' : ''}</b></button></>}
          {DRAW.includes(ctool) && stylusTg}
        </>)}
        {pop === 'more' && <>
          <div className="prow"><IB n="zout" label={tr("Масштаб")} onClick={() => setZoom(Math.max(1, +(zoom - 0.5).toFixed(1)))} /><span className="sub">{Math.round(zoom * 100)}%</span><IB n="zin" label={tr("Масштаб")} onClick={() => setZoom(Math.min(5, +(zoom + 0.5).toFixed(1)))} /></div>
          {d.type === 'notebook' && !page.img && <div className="prow">{[['blank', 'Чиста'], ['lined', 'У лінійку'], ['grid', 'Клітинка'], ['dots', 'Крапки']].map(([k, n]) => <button key={k} className={'chip' + (page.tpl === k ? ' on' : '')} style={{ margin: 0 }} onClick={() => setPage({ ...page, tpl: k })}>{tr(n)}</button>)}</div>}
          {stylusTg}
          <button className={'tg' + (pressure ? ' on' : '')} aria-pressed={pressure} onClick={() => setPressure(!pressure)}><span>{tr("Чутливість до нажиму")}</span><b>{pressure ? '✓' : ''}</b></button>
          {d.pages.length > 1 && <button className="tg" onClick={() => { delPage(); setPop(null); }}><span>{tr("Видалити сторінку")}</span><EIcon n="trash" size={20} /></button>}
        </>}
      </div></div>}
      {tin && <div className="ov" onClick={() => setTin(null)}><div className="sheet" onClick={e => e.stopPropagation()}>
        <b>{tr("Текст на сторінці")}</b>
        <textarea style={{ marginTop: 12 }} rows={3} autoFocus value={tin.v} onChange={e => setTin({ ...tin, v: e.target.value })} placeholder={tr("Введіть текст")} />
        <div className="row"><button className="btn" onClick={addText}>{tr("Додати")}</button></div>
      </div></div>}
    </div>
  );
}


// ===== Матеріали (етап 2): одна модель — папки, усередині матеріали будь-якого типу (зошит, дошка, фото, скан, текстова нотатка) =====
const DAY = 864e5;
function when(ts) {
  if (!ts) return '';
  const d = new Date(ts), t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const d0 = new Date(d); d0.setHours(0, 0, 0, 0);
  const diff = Math.round((t0 - d0) / DAY);
  if (diff === 0) return tr("сьогодні");
  if (diff === 1) return tr("вчора");
  if (diff > 1 && diff < 7) return d.toLocaleDateString(loc(), { weekday: 'short' });
  return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' });
}
// Обкладинка: зошит — колір обкладинки; фото/скан/дошка — мініатюра; інакше нейтральний «папір»; нотатка — папір із початком тексту
function Cover({ m }) {
  const fav = m.fav && <span className="cv-fav" aria-hidden="true">★</span>;
  if (m.k === 'note') return <span className="cv paper" aria-hidden="true"><span className="cv-tx">{m.text.slice(0, 180)}</span>{fav}</span>;
  if (m.type === 'notebook' && m.cover) {
    const k = colorKey(m.cover);
    const st = k ? { '--cv': SOFT[k], '--sp': SOLID[k] } : { '--cv': m.cover, '--sp': m.cover };
    return <span className="cv nbk" style={st} aria-hidden="true">{fav}</span>;
  }
  if (m.thumb) return <span className="cv img" style={{ backgroundImage: 'url(' + m.thumb + ')' }} aria-hidden="true">{fav}</span>;
  return <span className={'cv paper' + (m.type === 'board' ? '' : ' lined')} aria-hidden="true">{fav}</span>;
}

export default function Materials({ folders, notes, fview, setFview, onOpenNote, onNewNote, onFolderForm, onNoteFav, onNoteMove, onNoteDel, onStudy, folderExtra }) {
  const [docs, setDocs] = useState([]);
  const [flt, setFlt] = useState('all');
  const [favOnly, setFavOnly] = useState(false);
  const [sort, setSort] = useState('new');
  const [view, setView] = useState('grid');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState(false);
  const [menu, setMenu] = useState(false);
  const [fmenu, setFmenu] = useState(false);
  const [nb, setNb] = useState(null);
  const [ed, setEd] = useState(null);
  const [act, setAct] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState('');
  const scRef = useRef(null), imRef = useRef(null), lp = useRef(null), fired = useRef(false), retFocus = useRef(null);

  useEffect(() => { try { const v = localStorage.getItem('helper-docview'); if (v === 'list' || v === 'grid') setView(v); } catch (e) {} }, []);
  const pickView = v => { setView(v); try { localStorage.setItem('helper-docview', v); } catch (e) {} };
  useEffect(() => {
    const reload = () => { listMeta().then(setDocs); };
    reload(); window.addEventListener('docs-changed', reload);
    return () => window.removeEventListener('docs-changed', reload);
  }, []);
  useEffect(() => { setFlt('all'); setFavOnly(false); }, [fview]);
  const anyOv = menu || fmenu || nb || act;
  const closeAll = () => { setMenu(false); setFmenu(false); setNb(null); if (act) closeAct(); };
  useEffect(() => {
    if (!anyOv) return;
    const onKey = e => { if (e.key === 'Escape') closeAll(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [anyOv, act]);
  useEffect(() => { if (!anyOv && retFocus.current) { const p = retFocus.current; retFocus.current = null; if (p && document.contains(p) && p.focus) p.focus(); } }, [anyOv]);

  const fids = new Set(folders.map(f => f.id));
  const fo = typeof fview === 'number' ? folders.find(f => f.id === fview) : null;
  const fid = fo ? fo.id : '';
  const mats = [
    ...docs.map(d => ({ k: 'doc', key: 'd' + d.id, id: d.id, type: d.type, title: d.title || tr(TYPES[d.type] || 'Зошит'), folder: fids.has(d.folder) ? d.folder : '', upd: d.upd || 0, created: d.created || 0, fav: !!d.fav, thumb: d.thumb, cover: d.cover, raw: d })),
    ...notes.filter(n => n.text && n.text.trim()).map(n => ({ k: 'note', key: 'n' + n.id, id: n.id, type: 'note', title: n.text.trim().split('\n')[0].slice(0, 60), folder: fids.has(n.folder) ? n.folder : '', upd: n.upd || n.id, created: n.id, fav: !!n.fav, text: n.text, raw: n }))
  ];
  const sorted = (l, by = sort) => { const c = [...l]; if (by === 'name') c.sort((a, b) => a.title.localeCompare(b.title, loc())); else if (by === 'created') c.sort((a, b) => b.created - a.created); else c.sort((a, b) => b.upd - a.upd); return c; };
  const countIn = id => { const s = descendants(folders, id); s.add(id); return mats.filter(m => s.has(m.folder)).length; };
  const tOk = (m, f) => f === 'all' || (f === 'img' ? (m.type === 'photo' || m.type === 'scan') : m.type === f);
  const nMat = n => n + ' ' + plural(n, "матеріал", "матеріали", "матеріалів");

  const base = fo ? mats.filter(m => m.folder === fo.id) : fview === 'all' ? mats : fview === 'fav' ? mats.filter(m => m.fav) : [];
  const showTools = base.length >= 6; // фільтри, сортування й вигляд — лише коли є що фільтрувати
  const eFlt = showTools ? flt : 'all', eFav = showTools && favOnly, eView = showTools ? view : 'grid';
  const cnt = {}; TFILT.forEach(([k]) => { cnt[k] = base.filter(m => tOk(m, k)).length; });
  const list = sorted(base.filter(m => tOk(m, eFlt) && (!eFav || m.fav)), showTools ? sort : 'new');
  const recents = sorted(mats, 'new').slice(0, 6);
  const loose = sorted(mats.filter(m => m.folder === ''), 'new');
  const top = folders.filter(f => !fids.has(f.parent));
  const subs = fo ? folders.filter(f => f.parent === fo.id) : [];
  const needle = q.trim().toLowerCase();
  const found = needle ? sorted(mats.filter(m => m.title.toLowerCase().includes(needle) || (m.text || '').toLowerCase().includes(needle)), 'new') : [];
  const pathIds = new Set(fo ? breadcrumb(folders, fo.id).map(f => f.id) : []);

  const dflt = type => tr(TYPES[type]) + ' ' + new Date().toLocaleDateString(loc());
  const openDoc = async x => { try { const d = await getDoc(x.id); if (d) setEd(d); else setMsg(tr("Не вдалося відкрити документ.")); } catch (e) { setMsg(tr("Не вдалося відкрити документ.")); } };
  const start = async dd => {
    try { await saveDoc(dd, 'all'); setEd(dd); }
    catch (e) { setMsg(tr("Не вдалося зберегти документ: можливо, закінчилося місце.")); }
    setMenu(false); setNb(null);
  };
  const fromFile = async (file, type) => {
    if (!file) return;
    setMenu(false); setMsg(tr("Обробка зображення…"));
    try {
      const im = await prepImage(file, type === 'scan');
      await start({ id: newId(), type, title: tr(TYPES[type]) + ' ' + new Date().toLocaleDateString(loc()), folder: fid, cover: '', created: Date.now(), upd: Date.now(), thumb: '', fav: false, pages: [{ w: im.w, h: im.h, tpl: 'blank', img: im.src, strokes: [] }] });
      setMsg('');
    } catch (e) { setMsg(tr("Не вдалося обробити зображення.")); }
  };
  async function closeAct() {
    if (act && act.k === 'doc') { const m = docs.find(x => x.id === act.id); const t = (act.title || '').trim(); if (m && t && m.title !== t) { try { await putMeta({ ...m, title: t, upd: Date.now() }); } catch (e) {} } }
    setAct(null); setConfirm(false);
  }
  const openM = m => { if (m.k === 'note') onOpenNote(m.id); else openDoc(m.raw); };
  const metaOf = m => tr(TYPES[m.type] || 'Зошит') + ' · ' + when(m.upd);
  const labelOf = m => m.title + ', ' + metaOf(m) + (m.fav ? ', ' + tr("в обраному") : '');
  const openAct = m => { retFocus.current = document.activeElement; setConfirm(false); setAct({ ...m }); };
  const press = m => ({
    onContextMenu: e => { e.preventDefault(); openAct(m); },
    onPointerDown: e => { if (e.pointerType === 'touch') { fired.current = false; lp.current = setTimeout(() => { fired.current = true; openAct(m); }, 550); } },
    onPointerUp: () => clearTimeout(lp.current), onPointerCancel: () => clearTimeout(lp.current),
    ...(m.k === 'doc' ? { draggable: true, onDragStart: e => { e.dataTransfer.setData('text/doc', String(m.id)); e.dataTransfer.effectAllowed = 'move'; } } : {}),
  });
  const tap = m => () => { if (fired.current) { fired.current = false; return; } openM(m); };
  const drop = target => ({
    onDragOver: e => { e.preventDefault(); e.currentTarget.classList.add('drop'); },
    onDragLeave: e => e.currentTarget.classList.remove('drop'),
    onDrop: async e => { e.preventDefault(); e.currentTarget.classList.remove('drop'); const id = Number(e.dataTransfer.getData('text/doc')); if (id) { try { await moveDoc(id, target); } catch (er) {} } },
  });
  const card = m => (
    <div key={m.key} className="mc" {...press(m)}>
      <button className="mc-o" onClick={tap(m)} aria-label={labelOf(m)}><Cover m={m} /><span className="mc-t">{m.title}</span><span className="mc-m">{metaOf(m)}</span></button>
      <button className="mc-x" onClick={() => openAct(m)} aria-label={tr("Дії") + ': ' + m.title} aria-haspopup="dialog"><EIcon n="more" size={20} /></button>
    </div>);
  const row = m => (
    <div key={m.key} className="ml" {...press(m)}>
      <button className="ml-o" onClick={tap(m)} aria-label={labelOf(m)}><Cover m={m} /><span className="ml-b"><span className="mc-t">{m.title}</span><span className="mc-m">{metaOf(m)}</span></span></button>
      <button className="mc-x" onClick={() => openAct(m)} aria-label={tr("Дії") + ': ' + m.title} aria-haspopup="dialog"><EIcon n="more" size={20} /></button>
    </div>);
  const listing = (l, v = 'grid') => (v === 'grid' ? <div className="mgrid">{l.map(card)}</div> : <div className="mlst">{l.map(row)}</div>);
  // компактна плитка папки: значок (колір, іконка, фото), назва до 2 рядків, число матеріалів
  const tile = f => { const n = countIn(f.id); return (
    <button key={f.id} className="fk" onClick={() => setFview(f.id)} aria-label={f.name + ', ' + nMat(n)} title={f.name} {...drop(f.id)}>
      <FolderGlyph color={f.color} ico={f.ico} emoji={f.icon} cover={f.cover} size={72} />
      <span className="fk-n">{f.name}</span><span className="fk-c">{n}</span>
    </button>); };
  const newTile = () => <button className="fk fk-new" onClick={newFolder}><FolderGlyph dashed size={72} /><span className="fk-n">{fo ? tr("Підпапка") : tr("Нова папка")}</span></button>;
  const tree = (list0, depth) => list0.map(f => (
    <Fragment key={f.id}>
      <button className={'sb' + (depth ? ' sub' : '')} style={depth ? { paddingLeft: 10 + depth * 16 } : undefined} aria-current={fview === f.id ? 'true' : undefined} onClick={() => setFview(f.id)} {...drop(f.id)}>
        <FolderGlyph color={f.color} ico={f.ico} emoji={f.icon} cover={f.cover} size={24} /><span className="sb-n">{f.name}</span><span className="sb-c" aria-label={nMat(countIn(f.id))}>{countIn(f.id)}</span>
      </button>
      {pathIds.has(f.id) && tree(folders.filter(x => x.parent === f.id), depth + 1)}
    </Fragment>));
  function newFolder() { onFolderForm({ name: '', color: FOLDER_COLORS[0][0], cover: '', icon: '', ico: '', parent: fid, mode: 'new' }); }
  const crumbs = fo ? breadcrumb(folders, fo.id).slice(0, -1) : [];
  const title = fo ? fo.name : fview === 'all' ? tr("Усі матеріали") : fview === 'fav' ? tr("Обране") : null;

  return (
    <div className="mat">
      <aside className="m-side" aria-label={tr("Папки")}>
        <div className="m-side-t">{tr("Матеріали")}</div>
        <button className="sb" aria-current={fview == null ? 'true' : undefined} onClick={() => setFview(null)}><EIcon n="clock" size={18} />{tr("Нещодавні")}</button>
        <button className="sb" aria-current={fview === 'fav' ? 'true' : undefined} onClick={() => setFview('fav')}><EIcon n="star" size={18} />{tr("Обране")}</button>
        <div className="sb-h" aria-hidden="true">{tr("Папки")}</div>
        {tree(top, 0)}
        <button className="sb add" onClick={newFolder}><EIcon n="plus" size={18} />{tr("Нова папка")}</button>
      </aside>

      <div className="m-main">
        <header className="mhd">
          <div className="mhd-t">
            {title != null && <nav className="crumbs" aria-label={tr("Шлях")}><button onClick={() => setFview(null)} {...drop('')}>{tr("Матеріали")}</button>{crumbs.map(c => <Fragment key={c.id}><span aria-hidden="true">›</span><button onClick={() => setFview(c.id)} {...drop(c.id)}>{c.name}</button></Fragment>)}<span aria-hidden="true">›</span></nav>}
            <h1>{title != null ? title : <><span className="phone-only">{tr("Матеріали")}</span><span className="wide-only">{tr("Нещодавні")}</span></>}</h1>
          </div>
          <div className="mhd-a">
            {fview == null && <button className="ibtn" onClick={() => setSearch(!search)} aria-pressed={search} aria-label={tr("Пошук")} title={tr("Пошук")}><EIcon n="search" size={20} /></button>}
            <button className="btn-a mcreate" onClick={() => { retFocus.current = document.activeElement; setMenu(true); }} aria-haspopup="dialog"><EIcon n="plus" size={18} />{tr("Створити")}</button>
            {fo && <button className="ibtn" onClick={() => { retFocus.current = document.activeElement; setFmenu(true); }} aria-label={tr("Дії з папкою")} title={tr("Дії з папкою")} aria-haspopup="dialog"><EIcon n="more" size={20} /></button>}
          </div>
        </header>
        {msg && <p className="sub mmsg" role="status">{msg}</p>}

        {fview == null && search && <div className="msearch">
          <label className="vh" htmlFor="mq">{tr("Пошук матеріалів")}</label>
          <input id="mq" type="search" autoFocus placeholder={tr("Пошук матеріалів")} value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn2" onClick={() => { setSearch(false); setQ(''); }}>{tr("Скасувати")}</button>
        </div>}

        {fview == null && (needle ? <section className="msec" aria-label={tr("Результати пошуку")}>{found.length ? listing(found) : <p className="mempty">{tr("Нічого не знайдено.")}</p>}</section> : <>
          {!mats.length && !folders.length && <div className="mempty"><p>{tr("Тут будуть ваші зошити, дошки, нотатки й фото.")}</p><p className="sub">{tr("Створіть перший матеріал або папку.")}</p></div>}
          {recents.length > 0 && <section className="msec" aria-labelledby="m-rec">
            <div className="msh phone-only"><h2 className="msh-t" id="m-rec">{tr("Нещодавні")}</h2><button className="lnk" onClick={() => setFview('all')}>{tr("Усі")}</button></div>
            <div className="mrow phone-only">{recents.map(card)}</div>
            <div className="wide-only"><div className="msh"><span className="flex1" /><button className="lnk" onClick={() => setFview('all')}>{tr("Усі матеріали")}</button></div>{listing(recents)}</div>
          </section>}
          {folders.length > 0 && <section className="msec" aria-labelledby="m-fold">
            <div className="msh"><h2 className="msh-t" id="m-fold">{tr("Папки")}</h2></div>
            <div className="fkgrid">{top.map(tile)}{newTile()}</div>
          </section>}
          {!folders.length && mats.length > 0 && <button className="fnew" onClick={newFolder}><EIcon n="plus" size={16} />{tr("Нова папка")}</button>}
          {loose.length > 0 && folders.length > 0 && <section className="msec" aria-labelledby="m-loose">
            <div className="msh"><h2 className="msh-t" id="m-loose">{tr("Без папки")}</h2></div>
            {listing(loose)}
          </section>}
        </>)}

        {title != null && <>
          {subs.length > 0 && <div className="fkgrid msub" role="group" aria-label={tr("Підпапки")}>{subs.map(tile)}</div>}
          {showTools && <div className="mtools">
            <div className="mt-types" role="group" aria-label={tr("Тип матеріалу")}>
              {TFILT.filter(([k]) => k === 'all' || cnt[k] > 0).map(([k, n]) => <button key={k} className="pill" aria-pressed={eFlt === k} onClick={() => setFlt(k)}>{tr(n)} · {cnt[k]}</button>)}
            </div>
            <div className="mt-more">
              {fview !== 'fav' && <button className="pill" aria-pressed={favOnly} onClick={() => setFavOnly(!favOnly)}><span aria-hidden="true">★ </span>{tr("Обране")}</button>}
              <span className="flex1" />
              <label className="vh" htmlFor="msort">{tr("Сортування")}</label>
              <select id="msort" className="msort" value={sort} onChange={e => setSort(e.target.value)}><option value="new">{tr("Спершу нові")}</option><option value="created">{tr("Спершу створені")}</option><option value="name">{tr("За назвою")}</option></select>
              <div className="mview" role="group" aria-label={tr("Вигляд")}>
                <button className="ibtn" aria-pressed={view === 'grid'} onClick={() => pickView('grid')} aria-label={tr("Сітка")} title={tr("Сітка")}><EIcon n="grid" size={20} /></button>
                <button className="ibtn" aria-pressed={view === 'list'} onClick={() => pickView('list')} aria-label={tr("Список")} title={tr("Список")}><EIcon n="list" size={20} /></button>
              </div>
            </div>
          </div>}
          {list.length ? listing(list, eView)
            : <div className="mempty"><p>{base.length ? tr("Нічого не знайдено.") : fview === 'fav' ? tr("Тут поки нічого немає.") : tr("У цій папці поки нічого немає.")}</p>
              <p className="sub">{base.length ? '' : fview === 'fav' ? tr("Позначте матеріал зірочкою в меню «⋯», і він з’явиться тут.") : tr("Створіть зошит, нотатку або імпортуйте фото.")}</p></div>}
          {fo && folderExtra && folderExtra(fo.id)}
          {fo && base.length > 0 && <div className="mhint">
            <p>{tr("З матеріалів цієї папки можна зробити картки або тест")}</p>
            <div className="mhint-a"><button className="btn2" onClick={() => onStudy('cards', fo)}>{tr("Зробити картки")}</button><button className="btn-a" onClick={() => onStudy('test', fo)}>{tr("Скласти тест")}</button></div>
          </div>}
        </>}
      </div>

      {/* один вхід створення: FAB на телефоні, «Створити» в шапці на iPad — те саме меню */}
      <button className="fab phone-only" onClick={() => { retFocus.current = document.activeElement; setMenu(true); }} aria-label={tr("Створити: зошит, дошку, нотатку, імпорт фото або папку")} title={tr("Створити")} aria-haspopup="dialog"><EIcon n="plus" size={26} /></button>
      <input ref={scRef} type="file" accept="image/*" capture="environment" className="hidefile" onChange={e => { fromFile(e.target.files && e.target.files[0], 'scan'); e.target.value = ''; }} />
      <input ref={imRef} type="file" accept="image/*" className="hidefile" onChange={e => { fromFile(e.target.files && e.target.files[0], 'photo'); e.target.value = ''; }} />

      {menu && <div className="ov" onClick={() => setMenu(false)}><div className="sheet menu" role="dialog" aria-modal="true" aria-labelledby="mk-title" onClick={e => e.stopPropagation()}>
        <div className="shd"><h2 id="mk-title">{fo ? tr("Створити в «") + fo.name + '»' : tr("Створити")}</h2><IB n="close" label={tr("Закрити")} onClick={() => setMenu(false)} /></div>
        <button autoFocus onClick={() => { setMenu(false); setNb({ title: '', cover: COVERS[0], tpl: 'lined' }); }}>{tr("Зошит")}<small>{tr("Обкладинка, сторінки з лінійкою, клітинкою чи крапками")}</small></button>
        <button onClick={() => start(newDoc('board', dflt('board'), fid, 'blank'))}>{tr("Дошка")}<small>{tr("Велике вільне полотно")}</small></button>
        <button onClick={() => { setMenu(false); onNewNote(false); }}>{tr("Текстова нотатка")}<small>{tr("Звичайний текст; з неї можна скласти тест")}</small></button>
        <button onClick={() => imRef.current && imRef.current.click()}>{tr("Імпорт фото")}<small>{tr("З галереї, файлів або камери")}</small></button>
        <button onClick={() => scRef.current && scRef.current.click()}>{tr("Сканувати")}<small>{tr("Фото з вирівнюванням яскравості, як скан")}</small></button>
        <button onClick={() => { setMenu(false); newFolder(); }}>{fo ? tr("Підпапка") : tr("Папка")}<small>{fo ? tr("Нова папка всередині цієї") : tr("Для предмета або теми")}</small></button>
      </div></div>}

      {fmenu && fo && <div className="ov" onClick={() => setFmenu(false)}><div className="sheet menu" role="dialog" aria-modal="true" aria-labelledby="fm-title" onClick={e => e.stopPropagation()}>
        <div className="shd"><h2 id="fm-title">{fo.name}</h2><IB n="close" label={tr("Закрити")} onClick={() => setFmenu(false)} /></div>
        {[['look', "Змінити вигляд"], ['name', "Перейменувати"], ['move', "Перемістити"], ['delete', "Видалити"]].map(([mode, n], i) => <button key={mode} autoFocus={i === 0} className={mode === 'delete' ? 'danger-t' : ''} onClick={() => { setFmenu(false); onFolderForm({ ...fo, mode }); }}>{tr(n)}</button>)}
      </div></div>}

      {nb && <div className="ov" onClick={() => setNb(null)}><div className="sheet" role="dialog" aria-modal="true" aria-labelledby="nb-title" onClick={e => e.stopPropagation()}>
        <div className="shd"><h2 id="nb-title">{tr("Новий зошит")}</h2><IB n="close" label={tr("Закрити")} onClick={() => setNb(null)} /></div>
        <label className="flab" htmlFor="nb-name">{tr("Назва (необов’язково)")}</label>
        <input id="nb-name" style={{ marginTop: 6 }} autoFocus value={nb.title} onChange={e => setNb({ ...nb, title: e.target.value })} />
        <div className="flab" id="nb-cov" style={{ marginTop: 14 }}>{tr("Обкладинка")}</div>
        <div className="sw" role="group" aria-labelledby="nb-cov" style={{ marginTop: 8 }}>{PALETTE_C.map(([c, k, n]) => <button key={c} className={'swatch' + (nb.cover === c ? ' on' : '')} style={{ background: SOLID[k] }} onClick={() => setNb({ ...nb, cover: c })} aria-pressed={nb.cover === c} aria-label={tr(n)} />)}</div>
        <div className="flab" id="nb-pap" style={{ marginTop: 14 }}>{tr("Папір")}</div>
        <div className="seg" role="group" aria-labelledby="nb-pap" style={{ marginTop: 8 }}>{[['blank', tr("Чиста")], ['lined', tr("У лінійку")], ['grid', tr("Клітинка")], ['dots', tr("Крапки")]].map(([k, n]) => <button key={k} className={nb.tpl === k ? 'on' : ''} aria-pressed={nb.tpl === k} onClick={() => setNb({ ...nb, tpl: k })}>{n}</button>)}</div>
        <div className="row" style={{ marginTop: 16 }}><button className="btn" onClick={() => start(newDoc('notebook', nb.title.trim() || dflt('notebook'), fid, nb.tpl, nb.cover))}>{tr("Створити")}</button></div>
      </div></div>}

      {act && <div className="ov" onClick={closeAct}><div className="sheet menu" role="dialog" aria-modal="true" aria-labelledby="act-title" onClick={e => e.stopPropagation()}>
        <div className="shd"><h2 id="act-title">{tr(TYPES[act.type] || 'Зошит')}</h2><IB n="close" label={tr("Закрити")} onClick={closeAct} /></div>
        {act.k === 'doc' ? <><label className="vh" htmlFor="act-name">{tr("Назва")}</label><input id="act-name" value={act.title} onChange={e => setAct({ ...act, title: e.target.value })} style={{ marginBottom: 10 }} /></> : <p className="act-nt">{act.title}</p>}
        <button autoFocus onClick={() => { const x = act; closeAct(); openM(x); }}>{tr("Відкрити")}</button>
        <button aria-pressed={act.fav} onClick={async () => {
          const fav = !act.fav;
          if (act.k === 'note') { onNoteFav(act.id); setAct({ ...act, fav }); return; }
          const m = docs.find(x => x.id === act.id); if (!m) return; try { await putMeta({ ...m, fav }); setAct({ ...act, fav }); } catch (e) {}
        }}>{act.fav ? tr("★ Прибрати з обраного") : tr("☆ Додати в обране")}</button>
        {act.k === 'doc' && <button onClick={async () => { try { await duplicateDoc(act.id); } catch (e) { setMsg(tr("Не вдалося дублювати: можливо, закінчилося місце.")); } setAct(null); }}>{tr("Дублювати")}</button>}
        <label className="flab" htmlFor="act-fold">{tr("Папка")}</label>
        <select id="act-fold" value={act.folder === '' || act.folder == null ? '' : act.folder} style={{ margin: '6px 0 8px' }}
          onChange={async e => {
            const f = e.target.value === '' ? '' : Number(e.target.value);
            if (act.k === 'note') { onNoteMove(act.id, f); setAct({ ...act, folder: f }); return; }
            const m = docs.find(x => x.id === act.id); if (!m) return; try { await putMeta({ ...m, folder: f }); setAct({ ...act, folder: f }); } catch (er) {}
          }}>
          <option value="">{tr("Без папки")}</option>{folders.map(f => <option key={f.id} value={f.id}>{folderPath(folders, f.id)}</option>)}</select>
        <button className={confirm ? 'danger' : 'danger-t'} onClick={async () => {
          if (!confirm) { setConfirm(true); return; }
          if (act.k === 'note') onNoteDel(act.id); else { try { await delDoc(act.id); } catch (e) {} }
          setAct(null); setConfirm(false);
        }}>{confirm ? tr("Підтвердити видалення") : tr("Видалити")}</button>
        <button onClick={closeAct}>{tr("Готово")}</button>
      </div></div>}

      {ed && <Editor doc={ed} onSave={(d, dirty) => saveDoc(d, dirty)} onClose={() => setEd(null)} />}
    </div>
  );
}
