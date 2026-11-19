'use client';
// Імпорт PDF (pdf.js) і експорт у PDF (jsPDF). Лише клієнт: обидві бібліотеки підвантажуються динамічно,
// тож не потрапляють у початковий бандл і не виконуються на сервері.
//
// pdf.js: legacy-збірка (полiфіли для старіших Safari/iPadOS, де немає Promise.withResolvers тощо).
// Worker — окремий файл public/pdf.worker.min.mjs, копія node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs
// тієї самої версії (копіюється скриптом postinstall; версії бібліотеки й worker мають збігатися).
import { renderPage } from './draw';

export const PDF_MAX_PAGES = 50;
export const PDF_MAX_BYTES = 50 * 1024 * 1024;
const RENDER_W = 1600, RENDER_MAX_H = 2400, JPEG_Q = 0.75; // 0.75: ~30 % менше за 0.85 (щільна сторінка ≈ 0,7 МБ замість ≈ 1 МБ), різниці на тексті майже не видно
const WORKER_SRC = '/pdf.worker.min.mjs';

let libP = null;
function pdfjs() {
  if (!libP) libP = import('pdfjs-dist/legacy/build/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = WORKER_SRC; return m; }).catch(e => { libP = null; throw e; });
  return libP;
}

export const isPdf = f => !!f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
const tick = () => new Promise(r => setTimeout(r, 0));
const blobToUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
const canvasBlob = (c, type, q) => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), type, q));
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const abortErr = () => { const e = new Error('aborted'); e.code = 'abort'; return e; };

// Помилка з кодом для інтерфейсу: size | password | invalid | read | abort
const fail = (code, cause) => { const e = new Error(code); e.code = code; e.cause = cause; return e; };

// Відкрити файл. Повертає { pdf, numPages } або кидає помилку з code.
export async function openPdf(file) {
  if (file.size > PDF_MAX_BYTES) throw fail('size');
  let lib;
  try { lib = await pdfjs(); } catch (e) { throw fail('read', e); }
  let data;
  try { data = new Uint8Array(await file.arrayBuffer()); } catch (e) { throw fail('read', e); }
  try {
    const pdf = await lib.getDocument({ data, isEvalSupported: false }).promise;
    return { pdf, numPages: pdf.numPages };
  } catch (e) {
    const n = e && e.name;
    throw fail(n === 'PasswordException' ? 'password' : n === 'InvalidPDFException' ? 'invalid' : 'read', e);
  }
}

// Текстовий шар сторінки: рядки як у PDF, без зайвих пробілів. Нічого не малюється.
function textOf(tc) {
  let s = '';
  for (const it of tc.items || []) { if (typeof it.str !== 'string') continue; s += it.str; if (it.hasEOL) s += '\n'; }
  return s.replace(/[ \t ]+/g, ' ').split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20000);
}
// Чи має сторінка справжній текст (не скан усередині PDF)
export const pageHasText = p => !!p && typeof p.text === 'string' && p.text.replace(/\s/g, '').length >= 20;

// Сторінки from..to (з 1) → сторінки документа: растровий фон img (як у скана), текст, розмір у пунктах (pw/ph) для експорту.
// Рендер по одній сторінці з паузою між ними — інтерфейс не замерзає. onPage(done, total) — прогрес.
export async function renderPdfPages(pdf, from, to, { onPage, signal } = {}) {
  const out = [], total = to - from + 1;
  for (let n = from; n <= to; n++) {
    if (signal && signal.aborted) throw abortErr();
    const pg = await pdf.getPage(n);
    const v1 = pg.getViewport({ scale: 1 });
    const scale = Math.min(RENDER_W / v1.width, RENDER_MAX_H / v1.height);
    const vp = pg.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    // «Зупинити» скасовує й поточний рендер, а не лише наступні сторінки
    const task = pg.render({ canvasContext: g, viewport: vp });
    const stop = () => task.cancel();
    if (signal) signal.addEventListener('abort', stop);
    try { await task.promise; }
    catch (e) { if (signal && signal.aborted) throw abortErr(); throw e; }
    finally { if (signal) signal.removeEventListener('abort', stop); }
    const img = await blobToUrl(await canvasBlob(c, 'image/jpeg', JPEG_Q));
    let text = '';
    try { text = textOf(await pg.getTextContent()); } catch (e) {}
    out.push({ w: c.width, h: c.height, tpl: 'blank', img, text, strokes: [], pw: Math.round(v1.width * 100) / 100, ph: Math.round(v1.height * 100) / 100, src: n });
    pg.cleanup(); c.width = c.height = 0; // звільнити пам'ять полотна (важливо на iPad)
    if (onPage) onPage(n - from + 1, total);
    await tick();
  }
  return out;
}

// Текст для пошуку (у метаданих документа): сторінки через \f, щоб знайти номер сторінки збігу.
export const SEARCH_MAX = 40000;
export const searchText = pages => pages.map(p => (typeof p.text === 'string' ? p.text.replace(/\s+/g, ' ') : '')).join('\f').slice(0, SEARCH_MAX);
// Номер сторінки (з 1), де знайдено needle у searchText, або 0
export function searchPage(st, needle) {
  if (!st || !needle) return 0;
  const i = st.toLowerCase().indexOf(needle); if (i < 0) return 0;
  let n = 1; for (let k = 0; k < i; k++) if (st.charCodeAt(k) === 12) n++;
  return n;
}

// ===== Експорт =====
// Розмір сторінки PDF у пунктах: імпортований PDF — початковий розмір; інше — за пропорціями сторінки,
// ширина 1200 px = ширина A4 (595 pt): зошит ≈ A4, дошка 1600×1200 — альбомна сторінка.
const PT_PER_PX = 595.28 / 1200;
export const pageSizePt = p => (p.pw > 0 && p.ph > 0 && p.img ? [p.pw, p.ph] : [p.w * PT_PER_PX, p.h * PT_PER_PX]);

// doc — повний документ (зі сторінками), nums — номери сторінок з 1. Повертає Blob.
export async function exportPdf(doc, nums, { onPage, signal } = {}) {
  const { jsPDF } = await import('jspdf');
  let pdf = null;
  for (let k = 0; k < nums.length; k++) {
    if (signal && signal.aborted) throw abortErr();
    const p = doc.pages[nums[k] - 1]; if (!p) continue;
    const im = p.img ? await loadImg(p.img).catch(() => null) : null;
    // фон-зображення — у його власній роздільності; зошит/дошка — до 2× (довша сторона ≤ 2400 px), щоб лінії й текст були чіткі
    const sc = p.img ? 1 : Math.min(2, 2400 / Math.max(p.w, p.h));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(p.w * sc)); c.height = Math.max(1, Math.round(p.h * sc));
    const g = c.getContext('2d'); g.scale(sc, sc); renderPage(g, p, im);
    const bytes = new Uint8Array(await (await canvasBlob(c, 'image/jpeg', 0.9)).arrayBuffer());
    c.width = c.height = 0;
    const [w, h] = pageSizePt(p), o = w > h ? 'landscape' : 'portrait';
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation: o, compress: true });
    else pdf.addPage([w, h], o);
    pdf.addImage(bytes, 'JPEG', 0, 0, w, h, undefined, 'NONE');
    if (onPage) onPage(k + 1, nums.length);
    await tick();
  }
  if (!pdf) throw new Error('empty');
  pdf.setProperties({ title: String(doc.title || '') });
  return pdf.output('blob');
}

export const pdfName = title => (String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'document') + '.pdf';

// Зберегти: <a download> з blob URL (звичайний браузер). iOS Safari теж уміє, а в режимі «На початковий екран» — ні:
// там краще «Поділитися» (sharePdf) → «Зберегти у Файли».
export function savePdf(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export const canSharePdf = (blob, name) => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: 'application/pdf' })] })); } catch (e) { return false; } };
export async function sharePdf(blob, name, title) {
  const f = new File([blob], name, { type: 'application/pdf' });
  await navigator.share({ files: [f], title: title || name });
}
// Запасний шлях: відкрити PDF у новій вкладці (переглядач браузера має свою кнопку «Поділитися / Зберегти»)
export function openPdfTab(blob) {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return !!w;
}
// iOS / iPadOS (iPad з iPadOS 13+ видає себе за Mac, тому ще й перевірка дотику)
export const isIOS = () => typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
