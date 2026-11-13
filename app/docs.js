'use client';
import { useState, useEffect, useRef } from 'react';
import { listMeta, getDoc, saveDoc, putMeta, putDoc, delDoc, duplicateDoc, reparentDocs, moveDoc } from './store';
import { newDoc, newId, filterDocs, sortDocs, recentDocs, folderPath, fitPage } from './lib';
import { t as tr, loc } from './i18n';
import { drawStroke, ptsOf, renderPage, drawSeg, pressureOf, synthPressure, rulerSnap, rulerProject, PENS, SHAPES } from './draw';

export { putDoc, delDoc, newDoc, reparentDocs, moveDoc };
export const listDocs = listMeta;
const TYPES = { notebook: 'Зошит', board: 'Дошка', photo: 'Фото', scan: 'Скан' };
const FILTERS = [['all', 'Усі'], ['fav', 'Обране'], ['notebook', 'Зошити'], ['board', 'Дошки'], ['img', 'Фото й скани']];
const COVERS = ['#0a84ff', '#ff375f', '#ff9f0a', '#30d158', '#bf5af2', '#64d2ff', '#8e8e93', '#1c1c1e'];
export const bridge = { info: null, getImage: null };
export async function shrink(file, max = 1024, q = 0.72) {
  const img = await loadImg(typeof file === 'string' ? file : await readFile(file));
  const sc = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
  c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
const COLORS = ['#1c1c1e', '#0a84ff', '#ff375f', '#30d158', '#ff9f0a', '#bf5af2'];

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
};
const TOOLN = { pen: 'Ручка', hl: 'Маркер', eraser: 'Гумка', shape: 'Фігури', text: 'Текст', ruler: 'Лінійка', hand: 'Рука' };
const NIBN = { ball: 'Кулькова', fountain: 'Перова', pencil: 'Олівець', brush: 'Пензель', calli: 'Каліграфія' };
const SHAPEN = { line: 'Лінія', arrow: 'Стрілка', rect: 'Рамка', oval: 'Овал', triangle: 'Трикутник' };
const PALETTE = ['#000000', '#3a3a3c', '#8e8e93', '#d1d1d6', '#ffffff', '#5d4037', '#a1887f', '#f5deb3', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#32ade6', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#b197fc'];
function EIcon({ n, size = 22 }) { return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{EI[n]}</svg>; }
function IB({ n, label, on, onClick, disabled }) { return <button className={'ib' + (on ? ' on' : '')} onClick={onClick} aria-label={label} title={label} disabled={disabled}><EIcon n={n} /></button>; }
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
  const [wd, setWd] = useState(PENS.ball.w);
  const [nib, setNib] = useState('ball');
  const [op, setOp] = useState(1);
  const [ew, setEw] = useState(28);
  const [shape, setShape] = useState('line');
  const [ruler, setRuler] = useState({ on: false, x: 200, y: 400, a: 0, len: 700 });
  const [recent, setRecent] = useState(() => { try { return JSON.parse(localStorage.getItem('helper-colors') || '[]'); } catch (e) { return []; } });
  const rdrag = useRef(null);
  const [penOnly, setPenOnly] = useState(false);
  const [pressure, setPressure] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState({ w: 300, h: 400 });
  const [tick, setTick] = useState(0);
  const [tin, setTin] = useState(null);
  const [strip, setStrip] = useState(false);
  const [pop, setPop] = useState(null);
  const [popTop, setPopTop] = useState(96);
  const barRef = useRef(null);
  const [thumbs, setThumbs] = useState([]);
  const cvRef = useRef(null), boxRef = useRef(null), imgRef = useRef(null), cur = useRef(null), hist = useRef([]), redo = useRef([]), dRef = useRef(d), piRef = useRef(0), saved = useRef(doc.pages), touches = useRef(new Map()), gest = useRef(null);
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
  const eraseAt = (x, y) => {
    const ws = page.w / 1200, r = ew * ws;
    const keep = page.strokes.filter(s => { const q = ptsOf(s, ws); for (let i = 0; i < q.length; i += 2) if (Math.hypot(q[i] - x, q[i + 1] - y) < r + (s.w || 3) * ws / 2) return false; return true; });
    if (keep.length !== page.strokes.length) { if (cur.current && !cur.current.snap) cur.current.snap = page.strokes; setPage({ ...page, strokes: keep }); }
  };
  const down = e => {
    if (tool === 'hand') return;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, [e.clientX, e.clientY]);
      const el = boxRef.current;
      if (touches.current.size >= 2) {
        cur.current = null; renderPage(cvRef.current.getContext('2d'), page, imgRef.current);
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
    if (tool === 'shape') { cur.current = { k: shape, c: color, w: wd, p: [x, y, x, y], lock: !!snap && (shape === 'line' || shape === 'arrow') }; if (op < 1) cur.current.a = op; return; }
    const isPen = e.pointerType === 'pen', usesPr = tool === 'pen' && (nib === 'fountain' || nib === 'brush');
    const st = tool === 'hl' ? { n: 'marker', c: color, w: wd * 4, a: op < 1 ? op : 0.35, p: [x, y] } : { n: nib, c: color, w: wd, p: [x, y], seed: Math.floor(Math.random() * 1e6) };
    if (tool === 'pen' && op < 1) st.a = op;
    if (tool === 'pen') { const p0 = isPen && pressure ? pressureOf(e) : (usesPr ? 0.6 : null); if (p0 != null) st.pr = [p0]; }
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
    const g = cvRef.current.getContext('2d'), ws = page.w / 1200;
    if (s.k) { let ex = x, ey = y; if (s.lock) { const q = rulerProject(ruler, x, y); ex = q.x; ey = q.y; } s.p[2] = ex; s.p[3] = ey; renderPage(g, page, imgRef.current); drawStroke(g, s, ws); return; }
    const evs = e.pointerType === 'pen' && e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) {
      let [px, py] = pos(ev);
      if (s.lock) { const q = rulerProject(ruler, px, py); px = q.x; py = q.y; }
      const qq = s.p, lx = qq[qq.length - 2], ly = qq[qq.length - 1], dist = Math.hypot(px - lx, py - ly);
      if (dist < 2) continue;
      qq.push(px, py);
      if (s.pr) s.pr.push(ev.pointerType === 'pen' && pressure ? pressureOf(ev) : synthPressure(s.pr[s.pr.length - 1], dist, s.lt != null ? ev.timeStamp - s.lt : 8));
      s.lt = ev.timeStamp;
      if (s.a < 1 || s.n === 'marker') { renderPage(g, page, imgRef.current); drawStroke(g, s, ws); }
      else { g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; drawSeg(g, s, ws, qq.length / 2 - 1, true); g.restore(); }
    }
  };
  const up = e => {
    if (e && e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      if (touches.current.size === 0 || (gest.current && !gest.current.pan && touches.current.size < 2)) gest.current = null;
    }
    const s = cur.current; cur.current = null; if (!s) return;
    if (s.erase) { if (s.snap) { hist.current.push({ pi, strokes: s.snap }); redo.current = []; } return; }
    if (s.k && Math.hypot(s.p[2] - s.p[0], s.p[3] - s.p[1]) < 4) { renderPage(cvRef.current.getContext('2d'), page, imgRef.current); return; }
    const { lock, lt, ...clean } = s;
    commit(clean);
  };
  const swap = (from, to) => { const h = from.current.pop(); if (!h) return; to.current.push({ pi: h.pi, strokes: d.pages[h.pi].strokes }); setD(o => ({ ...o, pages: o.pages.map((q, i) => i === h.pi ? { ...q, strokes: h.strokes } : q) })); };
  const addText = () => { if (tin && tin.v.trim()) commit({ k: 'text', c: color, x: tin.x, y: tin.y, t: tin.v.trim(), s: 44 }); setTin(null); };
  const goPage = n => { setPi(Math.max(0, Math.min(d.pages.length - 1, n))); hist.current = []; redo.current = []; if (boxRef.current) boxRef.current.scrollTop = 0; };
  const pickColor = c => {
    setColor(c);
    const r = [c, ...recent.filter(x => x !== c)].slice(0, 6); setRecent(r);
    try { localStorage.setItem('helper-colors', JSON.stringify(r)); } catch (e) {}
    if (tool === 'eraser' || tool === 'hand') setTool('pen');
  };
  const placeRuler = r => {
    const el = boxRef.current, sc = (fit.w * zoom) / page.w;
    return { on: true, x: (el.scrollLeft + el.clientWidth * 0.12) / sc, y: (el.scrollTop + el.clientHeight * 0.4) / sc, a: 0, len: Math.min(page.w * 0.85, (el.clientWidth * 0.76) / sc) };
  };
  const pickTool = k => {
    if (k === 'ruler') { setRuler(r => (r.on ? { ...r, on: false } : placeRuler(r))); setPop(null); return; }
    if (k === 'shape') { if (tool === 'shape') openPop('shape'); else { setTool('shape'); setPop(null); } return; }
    if (k === 'pen' && tool === 'pen') { openPop('style'); return; }
    setTool(k); setPop(null);
  };
  const rulerDown = (e, mode) => { e.stopPropagation(); e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); const [x, y] = pos(e); rdrag.current = { mode, x0: x, y0: y, r0: { ...ruler } }; };
  const rulerMove = e => {
    const d0 = rdrag.current; if (!d0) return;
    const [x, y] = pos(e);
    if (d0.mode === 'move') setRuler({ ...d0.r0, x: d0.r0.x + (x - d0.x0), y: d0.r0.y + (y - d0.y0) });
    else setRuler({ ...d0.r0, a: Math.atan2(y - d0.r0.y, x - d0.r0.x), len: Math.max(160, Math.hypot(x - d0.r0.x, y - d0.r0.y)) });
  };
  const openPop = k => { if (pop === k) { setPop(null); return; } if (barRef.current) setPopTop(Math.round(barRef.current.getBoundingClientRect().bottom + 8)); setPop(k); };
  const addPage = () => { setD(o => ({ ...o, pages: [...o.pages, { w: page.w, h: page.h, tpl: page.img ? 'blank' : page.tpl, strokes: [] }] })); setPi(d.pages.length); hist.current = []; redo.current = []; };
  const delPage = () => { if (d.pages.length < 2) return; setD(o => ({ ...o, pages: o.pages.filter((_, i) => i !== pi) })); setPi(Math.max(0, pi - 1)); hist.current = []; redo.current = []; };
  useEffect(() => {
    const h = e => {
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
  const TOOLS = ['pen', 'hl', 'eraser', 'shape', 'text', 'ruler', 'hand'];

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
        <div className="edrow2">
          {TOOLS.map(k => <IB key={k} n={k === 'shape' ? shape : k} label={tr(TOOLN[k])} on={k === 'ruler' ? ruler.on : tool === k} onClick={() => pickTool(k)} />)}
          <button className={'ib' + (pop === 'style' ? ' on' : '')} onClick={() => openPop('style')} aria-label={tr("Колір і товщина")} title={tr("Колір і товщина")}><span className="cdotbig" style={{ background: color }} /></button>
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
      {pop && <div className="popback" onClick={() => setPop(null)}><div className="pop" style={{ top: popTop }} onClick={e => e.stopPropagation()}>
        {pop === 'style' && <>
          {tool === 'pen' && <div className="prow">{Object.keys(PENS).map(k => <button key={k} className={'chip' + (nib === k ? ' on' : '')} style={{ margin: 0 }} onClick={() => { setNib(k); setWd(PENS[k].w); setOp(PENS[k].op); }}>{tr(NIBN[k])}</button>)}</div>}
          {tool === 'eraser' ? <label className="srow"><span>{tr("Розмір гумки")}</span><input type="range" min="8" max="90" value={ew} onChange={e => setEw(+e.target.value)} /><b>{ew}</b></label> : <>
            <div className="palette">{PALETTE.map(c => <button key={c} className={'pc' + (color === c ? ' on' : '')} style={{ background: c }} onClick={() => pickColor(c)} aria-label={c} />)}
              <input type="color" className="pc cpick" value={color} onChange={e => pickColor(e.target.value)} aria-label={tr("Свій колір")} /></div>
            {recent.length > 0 && <div className="prow"><span className="sub">{tr("Останні")}</span>{recent.map(c => <button key={c} className={'pc sm' + (color === c ? ' on' : '')} style={{ background: c }} onClick={() => pickColor(c)} aria-label={c} />)}</div>}
            <label className="srow"><span>{tr("Товщина")}</span><input type="range" min="1" max="40" step="0.5" value={wd} onChange={e => setWd(+e.target.value)} /><b>{wd}</b></label>
            <label className="srow"><span>{tr("Прозорість")}</span><input type="range" min="10" max="100" value={Math.round(op * 100)} onChange={e => setOp(+e.target.value / 100)} /><b>{Math.round(op * 100)}%</b></label>
            <div className="wprev"><i style={{ height: Math.max(1, Math.min(wd * (tool === 'hl' ? 4 : 1), 40)), background: color, opacity: tool === 'hl' && op >= 1 ? 0.35 : op }} /></div>
          </>}
        </>}
        {pop === 'shape' && <div className="prow">{SHAPES.map(k => <IB key={k} n={k} label={tr(SHAPEN[k])} on={shape === k} onClick={() => { setShape(k); setTool('shape'); setPop(null); }} />)}</div>}
        {pop === 'more' && <>
          <div className="prow"><IB n="zout" label={tr("Масштаб")} onClick={() => setZoom(Math.max(1, +(zoom - 0.5).toFixed(1)))} /><span className="sub">{Math.round(zoom * 100)}%</span><IB n="zin" label={tr("Масштаб")} onClick={() => setZoom(Math.min(5, +(zoom + 0.5).toFixed(1)))} /></div>
          {d.type === 'notebook' && !page.img && <div className="prow">{[['blank', 'Чиста'], ['lined', 'У лінійку'], ['grid', 'Клітинка'], ['dots', 'Крапки']].map(([k, n]) => <button key={k} className={'chip' + (page.tpl === k ? ' on' : '')} style={{ margin: 0 }} onClick={() => setPage({ ...page, tpl: k })}>{tr(n)}</button>)}</div>}
          <button className={'tg' + (penOnly ? ' on' : '')} onClick={() => setPenOnly(!penOnly)}><span>{tr("Лише Apple Pencil")}</span><b>{penOnly ? '✓' : ''}</b></button>
          <button className={'tg' + (pressure ? ' on' : '')} onClick={() => setPressure(!pressure)}><span>{tr("Чутливість до нажиму")}</span><b>{pressure ? '✓' : ''}</b></button>
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

export default function Docs({ folderId, folders, onNewNote }) {
  const [docs, setDocs] = useState([]);
  const [flt, setFlt] = useState('all');
  const [sort, setSort] = useState('new');
  const [q, setQ] = useState('');
  const [view, setView] = useState('grid');
  const [menu, setMenu] = useState(false);
  const [nb, setNb] = useState(null);
  const [ed, setEd] = useState(null);
  const [act, setAct] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState('');
  const phRef = useRef(null), scRef = useRef(null), imRef = useRef(null), lp = useRef(null), fired = useRef(false);

  useEffect(() => { try { const v = localStorage.getItem('helper-docview'); if (v === 'list' || v === 'grid') setView(v); } catch (e) {} }, []);
  const pickView = v => { setView(v); try { localStorage.setItem('helper-docview', v); } catch (e) {} };
  useEffect(() => {
    const reload = () => { listMeta().then(setDocs); };
    reload(); window.addEventListener('docs-changed', reload);
    return () => window.removeEventListener('docs-changed', reload);
  }, []);

  const fid = typeof folderId === 'number' ? folderId : '';
  const dflt = type => tr(TYPES[type]) + ' ' + new Date().toLocaleDateString(loc());
  const openDoc = async x => { try { const d = await getDoc(x.id); if (d) setEd(d); else setMsg(tr("Не вдалося відкрити документ.")); } catch (e) { setMsg(tr("Не вдалося відкрити документ.")); } };
  const start = async dd => {
    try { await saveDoc(dd, 'all'); setEd(dd); }
    catch (e) { setMsg(tr("Не вдалося зберегти документ: можливо, закінчилося місце.")); }
    setMenu(false); setNb(null);
  };
  const fromFile = async (file, type) => {
    if (!file) return;
    setMsg(tr("Обробка зображення…"));
    try {
      const im = await prepImage(file, type === 'scan');
      await start({ id: newId(), type, title: tr(TYPES[type]) + ' ' + new Date().toLocaleDateString(loc()), folder: fid, cover: '', created: Date.now(), upd: Date.now(), thumb: '', fav: false, pages: [{ w: im.w, h: im.h, tpl: 'blank', img: im.src, strokes: [] }] });
      setMsg('');
    } catch (e) { setMsg(tr("Не вдалося обробити зображення.")); setMenu(false); }
  };
  const closeAct = async () => {
    if (act) { const m = docs.find(x => x.id === act.id); const t = act.title.trim(); if (m && t && m.title !== t) { try { await putMeta({ ...m, title: t, upd: Date.now() }); } catch (e) {} } }
    setAct(null); setConfirm(false);
  };

  const list = sortDocs(filterDocs(docs, { flt, q, folderId }), sort);
  const recents = folderId == null && !q.trim() && flt === 'all' ? recentDocs(docs, 6) : [];
  const thumbEl = x => (
    <div className="dthumb" onClick={() => { if (fired.current) { fired.current = false; return; } openDoc(x); }}
      style={x.thumb && !(x.type === 'notebook' && x.cover) ? { backgroundImage: 'url(' + x.thumb + ')' } : {}}>
      {x.type === 'notebook' && x.cover ? <div className="dcover" style={{ background: x.cover }}><div className="spine" /><span>{x.title}</span></div> : (!x.thumb && <span>{tr(TYPES[x.type])}</span>)}
      {x.fav && <span className="star">★</span>}
    </div>);
  const drag = x => ({
    draggable: true,
    onDragStart: e => { e.dataTransfer.setData('text/doc', String(x.id)); e.dataTransfer.effectAllowed = 'move'; },
    onContextMenu: e => { e.preventDefault(); setAct(x); },
    onPointerDown: e => { if (e.pointerType === 'touch') { fired.current = false; lp.current = setTimeout(() => { fired.current = true; setAct(x); }, 550); } },
    onPointerUp: () => clearTimeout(lp.current), onPointerCancel: () => clearTimeout(lp.current), onPointerMove: () => {},
  });
  const card = (x, small) => (
    <div key={x.id} className={'dc' + (small ? ' sm' : '')} {...drag(x)}>
      {thumbEl(x)}
      <div className="dmeta"><div className="dt">{x.title}</div><button className="x" onClick={() => setAct(x)} aria-label={tr("Дії")}>⋯</button></div>
      {!small && <div className="sub">{new Date(x.upd).toLocaleDateString(loc())}{tr(", стор.: ")}{x.pageCount || 1}</div>}
    </div>);
  const row = x => (
    <div key={x.id} className="dl" {...drag(x)}>
      {thumbEl(x)}
      <div className="info" onClick={() => openDoc(x)}><div className="dt">{x.title}</div><div className="sub">{tr(TYPES[x.type])}, {new Date(x.upd).toLocaleDateString(loc())}{tr(", стор.: ")}{x.pageCount || 1}</div></div>
      <button className="x" onClick={() => setAct(x)} aria-label={tr("Дії")}>⋯</button>
    </div>);

  return (
    <div style={{ marginTop: 26 }}>
      <div className="sec">{tr("Документи")}</div>
      <button className="btn" onClick={() => setMenu(true)}>{tr("Створити або імпортувати")}</button>
      {msg && <div className="sub" style={{ margin: '10px 0' }}>{msg}</div>}
      {recents.length > 0 && <><div className="sec" style={{ marginTop: 18 }}>{tr("Нещодавні")}</div><div className="rrow">{recents.map(x => card(x, true))}</div></>}
      <div className="dtools" style={{ marginTop: 14 }}>
        <div className="seg">{FILTERS.map(([k, n]) => <button key={k} className={flt === k ? 'on' : ''} onClick={() => setFlt(k)}>{tr(n)}</button>)}</div>
        <div className="row" style={{ margin: 0 }}><input placeholder={tr("Пошук документів")} value={q} onChange={e => setQ(e.target.value)} />
          <select value={sort} onChange={e => setSort(e.target.value)} style={{ width: 'auto' }}><option value="new">{tr("Нові")}</option><option value="created">{tr("Створені")}</option><option value="name">{tr("За назвою")}</option></select></div>
        <div className="seg" style={{ maxWidth: 180 }}>{[['grid', tr("Сітка")], ['list', tr("Список")]].map(([k, n]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => pickView(k)}>{n}</button>)}</div>
      </div>
      {list.length ? (view === 'grid' ? <div className="dgrid">{list.map(x => card(x, false))}</div> : <div className="card dlist">{list.map(row)}</div>)
        : <div className="card"><div className="empty">{q.trim() || flt !== 'all' ? tr("Нічого не знайдено.") : tr("Документів поки немає. Створіть зошит, дошку або додайте скан.")}</div></div>}

      <input ref={phRef} type="file" accept="image/*" capture="environment" className="hidefile" onChange={e => { fromFile(e.target.files && e.target.files[0], 'photo'); e.target.value = ''; }} />
      <input ref={scRef} type="file" accept="image/*" capture="environment" className="hidefile" onChange={e => { fromFile(e.target.files && e.target.files[0], 'scan'); e.target.value = ''; }} />
      <input ref={imRef} type="file" accept="image/*" className="hidefile" onChange={e => { fromFile(e.target.files && e.target.files[0], 'photo'); e.target.value = ''; }} />

      {menu && <div className="ov" onClick={() => setMenu(false)}><div className="sheet menu" onClick={e => e.stopPropagation()}>
        <b>{tr("Створити")}</b><div style={{ height: 12 }} />
        <button onClick={() => { setMenu(false); onNewNote(true); }}>{tr("Швидка нотатка")}<small>{tr("Слова згасають, поки ви пишете")}</small></button>
        <button onClick={() => { setMenu(false); onNewNote(false); }}>{tr("Текстовий документ")}<small>{tr("Звичайний текст")}</small></button>
        <button onClick={() => { setMenu(false); setNb({ title: '', cover: COVERS[0], tpl: 'lined' }); }}>{tr("Зошит")}<small>{tr("Обкладинка, сторінки з лінійкою, клітинкою чи крапками")}</small></button>
        <button onClick={() => start(newDoc('board', dflt('board'), fid, 'blank'))}>{tr("Дошка")}<small>{tr("Велике вільне полотно")}</small></button>
        <button onClick={() => phRef.current && phRef.current.click()}>{tr("Сфотографувати")}<small>{tr("Фото, яке можна підписувати")}</small></button>
        <button onClick={() => scRef.current && scRef.current.click()}>{tr("Сканувати документ")}<small>{tr("Фото з вирівнюванням яскравості, як скан")}</small></button>
        <button onClick={() => imRef.current && imRef.current.click()}>{tr("Імпортувати зображення")}<small>{tr("З галереї або файлів")}</small></button>
      </div></div>}

      {nb && <div className="ov" onClick={() => setNb(null)}><div className="sheet" onClick={e => e.stopPropagation()}>
        <b>{tr("Новий зошит")}</b>
        <input style={{ marginTop: 12 }} autoFocus placeholder={tr("Назва (необов’язково)")} value={nb.title} onChange={e => setNb({ ...nb, title: e.target.value })} />
        <div className="sec" style={{ marginTop: 14 }}>{tr("Обкладинка")}</div>
        <div className="sw">{COVERS.map(c => <button key={c} className={'swatch' + (nb.cover === c ? ' on' : '')} style={{ background: c }} onClick={() => setNb({ ...nb, cover: c })} aria-label={c} />)}</div>
        <div className="sec" style={{ marginTop: 14 }}>{tr("Папір")}</div>
        <div className="seg">{[['blank', tr("Чиста")], ['lined', tr("У лінійку")], ['grid', tr("Клітинка")], ['dots', tr("Крапки")]].map(([k, n]) => <button key={k} className={nb.tpl === k ? 'on' : ''} onClick={() => setNb({ ...nb, tpl: k })}>{n}</button>)}</div>
        <div className="row"><button className="btn" onClick={() => start(newDoc('notebook', nb.title.trim() || dflt('notebook'), fid, nb.tpl, nb.cover))}>{tr("Створити")}</button></div>
      </div></div>}

      {act && <div className="ov" onClick={closeAct}><div className="sheet menu" onClick={e => e.stopPropagation()}>
        <input value={act.title} onChange={e => setAct({ ...act, title: e.target.value })} aria-label={tr("Назва")} style={{ marginBottom: 10 }} />
        <button onClick={() => { const x = act; setAct(null); openDoc(x); }}>{tr("Відкрити")}</button>
        <button onClick={async () => { const m = { ...act, fav: !act.fav }; try { await putMeta(m); setAct(m); } catch (e) {} }}>{act.fav ? tr("★ Прибрати з обраного") : tr("☆ Додати в обране")}</button>
        <button onClick={async () => { try { await duplicateDoc(act.id); } catch (e) { setMsg(tr("Не вдалося дублювати: можливо, закінчилося місце.")); } setAct(null); }}>{tr("Дублювати")}</button>
        <select value={act.folder === '' || act.folder == null ? '' : act.folder} style={{ marginBottom: 8 }}
          onChange={async e => { const f = e.target.value === '' ? '' : Number(e.target.value); const m = { ...act, folder: f }; try { await putMeta(m); setAct(m); } catch (er) {} }}>
          <option value="">{tr("Без папки")}</option>{folders.map(fo => <option key={fo.id} value={fo.id}>{folderPath(folders, fo.id)}</option>)}</select>
        <button className={confirm ? 'danger' : ''} onClick={async () => { if (!confirm) { setConfirm(true); return; } try { await delDoc(act.id); } catch (e) {} setAct(null); setConfirm(false); }}>{confirm ? tr("Підтвердити видалення") : tr("Видалити")}</button>
        <button onClick={closeAct}>{tr("Готово")}</button>
      </div></div>}

      {ed && <Editor doc={ed} onSave={(d, dirty) => saveDoc(d, dirty)} onClose={() => setEd(null)} />}
    </div>
  );
}
