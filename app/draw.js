// Рушій малювання: різні типи пер, фігури, лінійка. Без React, працює з будь-яким 2D-контекстом canvas.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pressureOf = e => clamp(e.pressure || 0.5, 0.05, 1);

// Типи пер: ширина і прозорість за замовчуванням, чи залежить від натиску
export const PENS = {
  ball: { w: 4, op: 1 },
  fountain: { w: 6, op: 1 },
  pencil: { w: 5, op: 0.9 },
  brush: { w: 12, op: 1 },
  calli: { w: 9, op: 1 },
};
export const SHAPES = ['line', 'arrow', 'rect', 'oval', 'triangle'];

// "Натиск" для пальця й миші: швидше рух, тонша лінія
export function synthPressure(prev, dist, dt) {
  const target = clamp(1.15 - (dist / Math.max(1, dt)) * 0.18, 0.25, 1);
  return prev == null ? target : prev * 0.7 + target * 0.3;
}

const taper = (i, n) => 0.45 + 0.55 * Math.min(1, Math.min(i, n - 1 - i) / 5);
export function widthAt(s, i, n, ws) {
  const base = (s.w || 3) * ws, pr = s.pr ? s.pr[i] : null, nib = s.n || 'ball';
  if (nib === 'fountain') return base * (0.4 + 1.2 * (pr == null ? 0.55 : pr)) * taper(i, n);
  if (nib === 'brush') return base * (0.25 + 1.7 * (pr == null ? 0.55 : pr)) * taper(i, n);
  if (nib === 'pencil') return base * (0.75 + 0.45 * (pr == null ? 0.5 : pr));
  return pr == null ? base : base * (0.7 + 0.6 * pr);
}

function rng(seed) { let x = (seed | 0) || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; }; }

// Один сегмент штриха (від точки i-1 до i). Той самий код малює наживо і при повній перемальовці.
export function drawSeg(g, s, ws, i, live) {
  const p = s.p, n = live ? 1e9 : p.length / 2, x0 = p[2 * i - 2], y0 = p[2 * i - 1], x1 = p[2 * i], y1 = p[2 * i + 1], nib = s.n || 'ball';
  const w0 = widthAt(s, i - 1, n, ws), w1 = widthAt(s, i, n, ws);
  if (nib === 'pencil') {
    const r = rng(((s.seed || 7) * 131 + i * 977) | 0), d = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.ceil(d / (0.9 * ws)));
    g.fillStyle = s.c; const a0 = g.globalAlpha;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, w = w0 + (w1 - w0) * t, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t, dots = clamp(Math.round(w / ws * 1.1), 3, 14);
      for (let j = 0; j < dots; j++) { const a = r() * 6.2832, rr = Math.sqrt(r()) * w / 2; g.globalAlpha = a0 * (0.28 + r() * 0.55); g.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.3 * ws, 1.3 * ws); }
    }
    g.globalAlpha = a0; return;
  }
  if (nib === 'calli') {
    const w = (s.w || 8) * ws / 2, nx = Math.cos(-Math.PI / 4) * w, ny = Math.sin(-Math.PI / 4) * w;
    g.fillStyle = s.c; g.beginPath(); g.moveTo(x0 - nx, y0 - ny); g.lineTo(x0 + nx, y0 + ny); g.lineTo(x1 + nx, y1 + ny); g.lineTo(x1 - nx, y1 - ny); g.closePath(); g.fill(); return;
  }
  g.strokeStyle = s.c; g.lineCap = 'round'; g.lineWidth = (w0 + w1) / 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
}

function arrowHead(g, x0, y0, x1, y1, len) {
  const a = Math.atan2(y1 - y0, x1 - x0), k = 0.5;
  g.moveTo(x1, y1); g.lineTo(x1 - len * Math.cos(a - k), y1 - len * Math.sin(a - k));
  g.moveTo(x1, y1); g.lineTo(x1 - len * Math.cos(a + k), y1 - len * Math.sin(a + k));
}

export function drawStroke(g, s, ws) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = s.c; g.fillStyle = s.c; g.globalAlpha = s.a || 1; g.lineWidth = (s.w || 3) * ws;
  const p = s.p;
  if (s.k === 'text') {
    g.font = (s.s * ws) + 'px -apple-system, system-ui, sans-serif';
    s.t.split('\n').forEach((ln, i) => g.fillText(ln, s.x, s.y + i * s.s * ws * 1.25));
  } else if (s.k) {
    g.beginPath();
    if (s.k === 'line') { g.moveTo(p[0], p[1]); g.lineTo(p[2], p[3]); }
    else if (s.k === 'arrow') { g.moveTo(p[0], p[1]); g.lineTo(p[2], p[3]); arrowHead(g, p[0], p[1], p[2], p[3], Math.max(26 * ws, (s.w || 3) * ws * 4)); }
    else if (s.k === 'rect') g.rect(Math.min(p[0], p[2]), Math.min(p[1], p[3]), Math.abs(p[2] - p[0]), Math.abs(p[3] - p[1]));
    else if (s.k === 'oval') g.ellipse((p[0] + p[2]) / 2, (p[1] + p[3]) / 2, Math.abs(p[2] - p[0]) / 2 || 0.1, Math.abs(p[3] - p[1]) / 2 || 0.1, 0, 0, Math.PI * 2);
    else if (s.k === 'triangle') { g.moveTo((p[0] + p[2]) / 2, p[1]); g.lineTo(p[2], p[3]); g.lineTo(p[0], p[3]); g.closePath(); }
    g.stroke();
  } else if (s.n === 'marker' || (!s.n && s.a && s.a < 1)) {
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
      else { g.beginPath(); g.arc(p[0], p[1], w / 2, 0, 7); g.fill(); }
    } else if (alpha < 1 && nib !== 'pencil' && g.canvas && typeof document !== 'undefined') {
      // напівпрозоре перо: малюємо непрозоро на тимчасовому полотні, щоб на стиках не було темних плям
      const off = document.createElement('canvas'); off.width = g.canvas.width; off.height = g.canvas.height;
      const og = off.getContext('2d'); og.globalAlpha = 1;
      for (let i = 1; i < n; i++) drawSeg(og, s, ws, i);
      g.drawImage(off, 0, 0);
    } else for (let i = 1; i < n; i++) drawSeg(g, s, ws, i);
  }
  g.restore();
}

// Точки для гумки
export function ptsOf(s, ws) {
  if (s.k === 'text') { const w = s.t.length * s.s * ws * 0.55; return [s.x, s.y, s.x + w / 2, s.y, s.x + w, s.y, s.x, s.y - s.s * ws * 0.4]; }
  const line = (a, b, c, d, o) => { for (let i = 0; i <= 12; i++) o.push(a + (c - a) * i / 12, b + (d - b) * i / 12); return o; };
  if (s.k === 'line' || s.k === 'arrow') return line(s.p[0], s.p[1], s.p[2], s.p[3], []);
  if (s.k === 'rect') { const a = s.p[0], b = s.p[1], c = s.p[2], d = s.p[3], o = []; for (let i = 0; i <= 8; i++) { const t = i / 8; o.push(a + (c - a) * t, b, a + (c - a) * t, d, a, b + (d - b) * t, c, b + (d - b) * t); } return o; }
  if (s.k === 'oval') { const o = []; for (let i = 0; i < 24; i++) { const t = i / 24 * Math.PI * 2; o.push((s.p[0] + s.p[2]) / 2 + Math.cos(t) * (s.p[2] - s.p[0]) / 2, (s.p[1] + s.p[3]) / 2 + Math.sin(t) * (s.p[3] - s.p[1]) / 2); } return o; }
  if (s.k === 'triangle') { const mx = (s.p[0] + s.p[2]) / 2, o = []; line(mx, s.p[1], s.p[2], s.p[3], o); line(s.p[2], s.p[3], s.p[0], s.p[3], o); line(s.p[0], s.p[3], mx, s.p[1], o); return o; }
  return s.p;
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

export function renderPage(g, p, im) {
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
