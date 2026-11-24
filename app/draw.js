// Рушій малювання: різні типи пер, фігури, лінійка. Без React, працює з будь-яким 2D-контекстом canvas.
// Поля штриха: n — тип пера, c — колір, w — товщина, p — точки [x,y,…], pr — натиск (необов'язково), a — прозорість,
// seed — зерно текстури; нові (необов'язкові, старі штрихи без них малюються як раніше):
// u: 1 — виділювач під чорнилом; v: 2 — нова поведінка олівця (натиск = насиченість).
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pressureOf = e => clamp(e.pressure || 0.5, 0.05, 1);

// Типи пер: ширина і прозорість за замовчуванням
export const PENS = {
  ball: { w: 4, op: 1 },
  fountain: { w: 6, op: 1 },
  pencil: { w: 5, op: 0.9 },
  fineliner: { w: 2.5, op: 1 },
  felt: { w: 7, op: 1 },
  chisel: { w: 14, op: 1 },
  brush: { w: 12, op: 1 },
  calli: { w: 9, op: 1 },
};
// Пера, у яких товщина залежить від натиску/швидкості (для пальця й миші натиск синтезується зі швидкості)
export const PRESSURE_NIBS = { ball: 'light', fountain: 'strong', brush: 'strong', pencil: 'stylus' };
export const SHAPES = ['line', 'arrow', 'rect', 'oval', 'triangle'];

// "Натиск" для пальця й миші: швидше рух, тонша лінія
export function synthPressure(prev, dist, dt) {
  const target = clamp(1.15 - (dist / Math.max(1, dt)) * 0.18, 0.25, 1);
  return prev == null ? target : prev * 0.7 + target * 0.3;
}

const taper = (i, n) => 0.45 + 0.55 * Math.min(1, Math.min(i, n - 1 - i) / 5);
// Плавний детермінований «шум» для нерівного краю фломастера
const wobble = (seed, i) => 0.93 + 0.035 * (Math.sin(i * 0.83 + (seed % 97)) + Math.sin(i * 0.29 + (seed % 31) * 1.7));
export function widthAt(s, i, n, ws) {
  const base = (s.w || 3) * ws, pr = s.pr ? s.pr[i] : null, nib = s.n || 'ball';
  if (nib === 'fountain') return base * (0.4 + 1.2 * (pr == null ? 0.55 : pr)) * taper(i, n);
  if (nib === 'brush') return base * (0.25 + 1.7 * (pr == null ? 0.55 : pr)) * taper(i, n);
  if (nib === 'pencil') return base * (0.75 + 0.45 * (pr == null ? 0.5 : pr));
  if (nib === 'fineliner') return base;
  if (nib === 'felt') return base * wobble(s.seed || 7, i);
  return pr == null ? base : base * (0.7 + 0.6 * pr);
}

function rng(seed) { let x = (seed | 0) || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; }; }

// Скошений наконечник маркера: відрізок довжиною w під кутом CHISEL_A + товщина наконечника
const CHISEL_A = -1.05, CHISEL_T = 0.3;
function chiselSeg(g, s, ws, x0, y0, x1, y1) {
  const w = (s.w || 14) * ws, nx = Math.cos(CHISEL_A) * w / 2, ny = Math.sin(CHISEL_A) * w / 2;
  g.fillStyle = s.c; g.beginPath(); g.moveTo(x0 - nx, y0 - ny); g.lineTo(x0 + nx, y0 + ny); g.lineTo(x1 + nx, y1 + ny); g.lineTo(x1 - nx, y1 - ny); g.closePath(); g.fill();
  g.strokeStyle = s.c; g.lineCap = 'round'; g.lineWidth = w * CHISEL_T;
  g.beginPath(); g.moveTo(x0 - nx, y0 - ny); g.lineTo(x1 - nx, y1 - ny); g.moveTo(x0 + nx, y0 + ny); g.lineTo(x1 + nx, y1 + ny); g.stroke();
}

// Один сегмент штриха (від точки i-1 до i). Той самий код малює наживо і при повній перемальовці.
export function drawSeg(g, s, ws, i, live) {
  const p = s.p, n = live ? 1e9 : p.length / 2, x0 = p[2 * i - 2], y0 = p[2 * i - 1], x1 = p[2 * i], y1 = p[2 * i + 1], nib = s.n || 'ball';
  const w0 = widthAt(s, i - 1, n, ws), w1 = widthAt(s, i, n, ws);
  if (nib === 'pencil') {
    const r = rng(((s.seed || 7) * 131 + i * 977) | 0), d = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.ceil(d / (0.9 * ws)));
    // v2: натиск керує насиченістю (а не лише шириною)
    const sat = s.v >= 2 && s.pr ? 0.45 + 0.75 * (s.pr[i] == null ? 0.5 : s.pr[i]) : 1;
    g.fillStyle = s.c; const a0 = g.globalAlpha;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, w = w0 + (w1 - w0) * t, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t, dots = clamp(Math.round(w / ws * 1.1), 3, 14);
      for (let j = 0; j < dots; j++) { const a = r() * 6.2832, rr = Math.sqrt(r()) * w / 2; g.globalAlpha = Math.min(1, a0 * (0.28 + r() * 0.55) * sat); g.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.3 * ws, 1.3 * ws); }
    }
    g.globalAlpha = a0; return;
  }
  if (nib === 'calli') {
    const w = (s.w || 8) * ws / 2, nx = Math.cos(-Math.PI / 4) * w, ny = Math.sin(-Math.PI / 4) * w;
    g.fillStyle = s.c; g.beginPath(); g.moveTo(x0 - nx, y0 - ny); g.lineTo(x0 + nx, y0 + ny); g.lineTo(x1 + nx, y1 + ny); g.lineTo(x1 - nx, y1 - ny); g.closePath(); g.fill(); return;
  }
  if (nib === 'chisel') { chiselSeg(g, s, ws, x0, y0, x1, y1); return; }
  g.strokeStyle = s.c; g.lineCap = 'round'; g.lineWidth = (w0 + w1) / 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
}

function arrowHead(g, x0, y0, x1, y1, len) {
  const a = Math.atan2(y1 - y0, x1 - x0), k = 0.5;
  g.moveTo(x1, y1); g.lineTo(x1 - len * Math.cos(a - k), y1 - len * Math.sin(a - k));
  g.moveTo(x1, y1); g.lineTo(x1 - len * Math.cos(a + k), y1 - len * Math.sin(a + k));
}

// Виділювач: новий (u) і старий (n: 'marker' або без пера з прозорістю)
export const isHl = s => !s.k && (s.n === 'marker' || (!s.n && s.a && s.a < 1));

export function drawStroke(g, s, ws) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = s.c; g.fillStyle = s.c; g.globalAlpha = s.a || 1; g.lineWidth = (s.w || 3) * ws;
  const p = s.p;
  if (s.k === 'text') {
    g.font = (s.s * ws) + 'px ' + TEXT_FONT;
    textLines(g, s, ws).forEach((ln, i) => g.fillText(ln, s.x, s.y + i * s.s * ws * 1.25));
  } else if (s.k) {
    g.beginPath();
    if (s.k === 'line') { g.moveTo(p[0], p[1]); g.lineTo(p[2], p[3]); }
    else if (s.k === 'arrow') { g.moveTo(p[0], p[1]); g.lineTo(p[2], p[3]); arrowHead(g, p[0], p[1], p[2], p[3], Math.max(26 * ws, (s.w || 3) * ws * 4)); }
    else if (s.k === 'rect') g.rect(Math.min(p[0], p[2]), Math.min(p[1], p[3]), Math.abs(p[2] - p[0]), Math.abs(p[3] - p[1]));
    else if (s.k === 'oval') g.ellipse((p[0] + p[2]) / 2, (p[1] + p[3]) / 2, Math.abs(p[2] - p[0]) / 2 || 0.1, Math.abs(p[3] - p[1]) / 2 || 0.1, 0, 0, Math.PI * 2);
    else if (s.k === 'triangle') { g.moveTo((p[0] + p[2]) / 2, p[1]); g.lineTo(p[2], p[3]); g.lineTo(p[0], p[3]); g.closePath(); }
    g.stroke();
  } else if (isHl(s)) {
    if (s.a && s.a < 1) g.globalCompositeOperation = 'multiply';
    g.beginPath(); g.moveTo(p[0], p[1]);
    if (p.length <= 2) g.lineTo(p[0] + 0.1, p[1]);
    else { for (let i = 2; i < p.length - 2; i += 2) g.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2); g.lineTo(p[p.length - 2], p[p.length - 1]); }
    g.stroke();
  } else {
    const n = p.length / 2, nib = s.n || 'ball', alpha = s.a || 1;
    if (n === 1) {
      const w = widthAt(s, 0, 1, ws);
      if (nib === 'pencil') { const r = rng((s.seed || 7) | 0); for (let j = 0; j < 12; j++) { const a = r() * 6.2832, rr = Math.sqrt(r()) * w / 2; g.globalAlpha = alpha * (0.3 + r() * 0.4); g.fillRect(p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr, 1.1 * ws, 1.1 * ws); } }
      else if (nib === 'chisel') chiselSeg(g, s, ws, p[0], p[1], p[0] + 0.01, p[1]);
      else { g.beginPath(); g.arc(p[0], p[1], w / 2, 0, 7); g.fill(); }
    } else if (alpha < 1 && nib !== 'pencil' && g.canvas && typeof document !== 'undefined') {
      // напівпрозоре перо: малюємо непрозоро на тимчасовому полотні, щоб на стиках не було темних плям
      // тимчасове полотно — розміру буфера g, з тим самим перетворенням (холст редактора масштабований під DPR і зум)
      const off = document.createElement('canvas'); off.width = g.canvas.width; off.height = g.canvas.height;
      const og = off.getContext('2d'); og.globalAlpha = 1;
      if (g.getTransform) og.setTransform(g.getTransform());
      for (let i = 1; i < n; i++) drawSeg(og, s, ws, i);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(off, 0, 0); g.restore();
    } else for (let i = 1; i < n; i++) drawSeg(g, s, ws, i);
  }
  g.restore();
}

// ===== Текст на сторінці =====
// Об'єкт { k:'text', c, x, y (базова лінія першого рядка), t, s (кегль), w? }. w — ширина переносу в координатах сторінки,
// необов'язкова: старі записи без w малюються як раніше (рядки лише за \n). Перенос — за словами, довге слово ріжеться.
export const TEXT_FONT = '-apple-system, system-ui, sans-serif';
export function textLines(g, s, ws) {
  const raw = String(s.t || '').split('\n');
  if (!(s.w > 0) || !g || !g.measureText) return raw;
  const max = s.w, out = [], fits = t => g.measureText(t).width <= max;
  // слово довше за рядок — ріжемо по літерах
  const hard = t => { while (t.length > 1 && !fits(t)) { let i = t.length - 1; while (i > 1 && !fits(t.slice(0, i))) i--; out.push(t.slice(0, i)); t = t.slice(i); } return t; };
  for (const para of raw) {
    let ln = '';
    for (const tok of para.split(/(\s+)/)) {
      if (!tok) continue;
      if (fits(ln + tok)) { ln += tok; continue; }
      if (/^\s+$/.test(tok)) { out.push(ln); ln = ''; continue; }
      if (ln) out.push(ln.replace(/\s+$/, ''));
      ln = hard(tok);
    }
    out.push(ln);
  }
  return out;
}
let measureG = null;
const textG = () => { if (!measureG && typeof document !== 'undefined') measureG = document.createElement('canvas').getContext('2d'); return measureG; };

// Точки для гумки
export function ptsOf(s, ws) {
  if (s.k === 'text') { const b = strokeBox(s, ws), my = (b[1] + b[3]) / 2; return [b[0], my, (b[0] + b[2]) / 2, my, b[2], my, b[0], b[1], b[2], b[3]]; }
  const line = (a, b, c, d, o) => { for (let i = 0; i <= 12; i++) o.push(a + (c - a) * i / 12, b + (d - b) * i / 12); return o; };
  if (s.k === 'line' || s.k === 'arrow') return line(s.p[0], s.p[1], s.p[2], s.p[3], []);
  if (s.k === 'rect') { const a = s.p[0], b = s.p[1], c = s.p[2], d = s.p[3], o = []; for (let i = 0; i <= 8; i++) { const t = i / 8; o.push(a + (c - a) * t, b, a + (c - a) * t, d, a, b + (d - b) * t, c, b + (d - b) * t); } return o; }
  if (s.k === 'oval') { const o = []; for (let i = 0; i < 24; i++) { const t = i / 24 * Math.PI * 2; o.push((s.p[0] + s.p[2]) / 2 + Math.cos(t) * (s.p[2] - s.p[0]) / 2, (s.p[1] + s.p[3]) / 2 + Math.sin(t) * (s.p[3] - s.p[1]) / 2); } return o; }
  if (s.k === 'triangle') { const mx = (s.p[0] + s.p[2]) / 2, o = []; line(mx, s.p[1], s.p[2], s.p[3], o); line(s.p[2], s.p[3], s.p[0], s.p[3], o); line(s.p[0], s.p[3], mx, s.p[1], o); return o; }
  return s.p;
}

// ===== Ласо =====
// Рамка об'єкта в координатах сторінки: [x0, y0, x1, y1] з урахуванням товщини лінії
export function strokeBox(s, ws) {
  if (s.k === 'text') {
    const fs = s.s * ws, mg = textG();
    let w = 0, lines;
    if (mg) { mg.font = fs + 'px ' + TEXT_FONT; lines = textLines(mg, s, ws); for (const ln of lines) w = Math.max(w, mg.measureText(ln).width); }
    else { lines = String(s.t || '').split('\n'); w = Math.max(...lines.map(l => l.length)) * fs * 0.55; }
    return [s.x, s.y - fs * 0.85, s.x + w, s.y + (lines.length - 1) * fs * 1.25 + fs * 0.25];
  }
  const q = s.k ? ptsOf(s, ws) : s.p;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < q.length; i += 2) { if (q[i] < x0) x0 = q[i]; if (q[i] > x1) x1 = q[i]; if (q[i + 1] < y0) y0 = q[i + 1]; if (q[i + 1] > y1) y1 = q[i + 1]; }
  let m = (s.w || 3) * ws / 2;
  if (s.k === 'arrow') m = Math.max(m, Math.max(26 * ws, (s.w || 3) * ws * 4) * 0.5);
  else if (!s.k && s.n === 'brush') m *= 1.95; else if (!s.k && s.n === 'fountain') m *= 1.6;
  return [x0 - m, y0 - m, x1 + m, y1 + m];
}
export function boxOf(list, ws) {
  let b = null;
  for (const s of list) { const r = strokeBox(s, ws); b = b ? [Math.min(b[0], r[0]), Math.min(b[1], r[1]), Math.max(b[2], r[2]), Math.max(b[3], r[3])] : r; }
  return b;
}
const r1 = v => Math.round(v * 10) / 10;
// Перенесення й пропорційне масштабування: x' = ox + (x - ox)·k + dx. Повертає новий об'єкт тих самих полів (без нових ключів).
export function xformStroke(s, f) {
  const k = f.k == null ? 1 : f.k, X = x => r1(f.ox + (x - f.ox) * k + f.dx), Y = y => r1(f.oy + (y - f.oy) * k + f.dy);
  const o = { ...s };
  if (s.k === 'text') { o.x = X(s.x); o.y = Y(s.y); if (k !== 1) { o.s = r1(s.s * k); if (s.w > 0) o.w = r1(s.w * k); } return o; }
  if (s.p) { const p = new Array(s.p.length); for (let i = 0; i < p.length; i += 2) { p[i] = X(s.p[i]); p[i + 1] = Y(s.p[i + 1]); } o.p = p; }
  if (k !== 1 && s.w) o.w = Math.max(0.5, r1(s.w * k));
  return o;
}
export function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// Що потрапило в петлю: рукописні штрихи — якщо ≥ 50 % точок усередині; фігури й текст — ≥ 50 % контрольних точок або центр рамки
export function lassoPick(strokes, poly, ws) {
  return strokes.filter(s => {
    if (s.k === 'text') { const b = strokeBox(s, ws), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return inPoly(poly, cx, cy) || [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].filter(q => inPoly(poly, q[0], q[1])).length >= 3; }
    const q = s.k ? ptsOf(s, ws) : s.p, n = q.length / 2; if (!n) return false;
    const step = Math.max(1, Math.floor(n / 200)); let a = 0, t = 0;
    for (let i = 0; i < n; i += step) { t++; if (inPoly(poly, q[2 * i], q[2 * i + 1])) a++; }
    return a / t >= 0.5;
  });
}

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
};
// Чи зачіпає гумка радіуса r у точці (x,y) штрих
export function hitStroke(s, ws, x, y, r) {
  // текст: рамка тексту (w у тексті — ширина переносу, а не товщина лінії)
  if (s.k === 'text') { const b = strokeBox(s, ws); return x >= b[0] - r && x <= b[2] + r && y >= b[1] - r && y <= b[3] + r; }
  const q = ptsOf(s, ws), rr = r + (s.w || 3) * ws / 2;
  if (q.length === 2) return Math.hypot(q[0] - x, q[1] - y) < rr;
  for (let i = 2; i < q.length; i += 2) if (segDist(x, y, q[i - 2], q[i - 1], q[i], q[i + 1]) < rr) return true;
  return false;
}
// Точкова гумка: розрізає рукописний штрих, прибираючи точки в колі. Повертає масив штрихів-залишків (може бути порожній).
// Фігури й текст видаляються цілком.
export function splitStroke(s, ws, x, y, r) {
  if (s.k) return [];
  const p = s.p, n = p.length / 2, rr = r + (s.w || 3) * ws / 2, step = Math.max(1, r / 2);
  // ущільнюємо точки, щоб довгий відрізок між двома далекими точками теж розрізався
  const P = [], PR = s.pr ? [] : null;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const x0 = p[2 * i - 2], y0 = p[2 * i - 1], d = Math.hypot(p[2 * i] - x0, p[2 * i + 1] - y0), k = Math.floor(d / step);
      for (let j = 1; j < k; j++) { const t = j / k; P.push(x0 + (p[2 * i] - x0) * t, y0 + (p[2 * i + 1] - y0) * t); if (PR) PR.push(s.pr[i - 1] + ((s.pr[i] == null ? s.pr[i - 1] : s.pr[i]) - s.pr[i - 1]) * t); }
    }
    P.push(p[2 * i], p[2 * i + 1]); if (PR) PR.push(s.pr[i]);
  }
  const out = []; let cp = [], cpr = [];
  const flushPart = () => { if (cp.length >= 4) { const o = { ...s, p: cp }; if (PR) o.pr = cpr; out.push(o); } cp = []; cpr = []; };
  for (let i = 0; i < P.length / 2; i++) {
    if (Math.hypot(P[2 * i] - x, P[2 * i + 1] - y) < rr) flushPart();
    else { cp.push(P[2 * i], P[2 * i + 1]); if (PR) cpr.push(PR[i]); }
  }
  flushPart();
  return out;
}

// Рівна лінія: чи штрих майже прямий (відхилення від хорди мале)
export function nearlyStraight(p, ws) {
  const n = p.length / 2; if (n < 3) return false;
  const x0 = p[0], y0 = p[1], x1 = p[p.length - 2], y1 = p[p.length - 1], len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 40 * ws) return false;
  let dev = 0; for (let i = 1; i < n - 1; i++) dev = Math.max(dev, segDist(p[2 * i], p[2 * i + 1], x0, y0, x1, y1));
  return dev < Math.max(5 * ws, len * 0.035);
}

// Лінійка: r = { x, y, a (радіани), len } у координатах сторінки. Повертає проекцію точки на ребро лінійки.
export function rulerProject(r, x, y) {
  const ux = Math.cos(r.a), uy = Math.sin(r.a), t = (x - r.x) * ux + (y - r.y) * uy;
  return { x: r.x + ux * t, y: r.y + uy * t, t };
}
export function rulerSnap(r, x, y, thr) {
  const q = rulerProject(r, x, y), dist = Math.hypot(x - q.x, y - q.y);
  return dist <= thr && q.t >= -thr && q.t <= r.len + thr ? { ...q, dist } : null;
}

// extra — штрих, що малюється зараз (для виділювача під чорнилом він стає в шар «під»)
export function renderPage(g, p, im, extra) {
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
  // шар «під»: новий виділювач (u) не зафарбовує текст і чорнило
  for (const s of p.strokes) if (s.u) drawStroke(g, s, ws);
  if (extra && extra.u) drawStroke(g, extra, ws);
  for (const s of p.strokes) if (!s.u) drawStroke(g, s, ws);
  if (extra && !extra.u) drawStroke(g, extra, ws);
}
