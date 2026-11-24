// Чисті допоміжні функції (без браузерних API), їх можна тестувати в Node.
export const newId = () => Date.now() + Math.floor(Math.random() * 1000);
export const pageKey = (id, i) => id + ':' + String(i).padStart(5, '0');

// Розділяє документ на метадані (легкі) і сторінки (важкі).
export function splitDoc(d) {
  const { pages, ...meta } = d;
  if (Array.isArray(pages)) meta.pageCount = pages.length;
  return { meta, pages: Array.isArray(pages) ? pages : [] };
}

// Усі вкладені папки (без самої папки).
export function descendants(folders, id) {
  const out = new Set();
  const walk = p => folders.forEach(f => { if (f.parent === p && !out.has(f.id)) { out.add(f.id); walk(f.id); } });
  walk(id);
  return out;
}
// Чи можна перемістити папку id в parent (без циклів).
export function canMoveFolder(folders, id, parent) {
  if (parent === '' || parent == null) return true;
  if (id === parent) return false;
  return !descendants(folders, id).has(parent);
}
// Ланцюжок від кореня до папки.
export function breadcrumb(folders, id) {
  const out = [], seen = new Set();
  let cur = folders.find(f => f.id === id);
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); out.unshift(cur); cur = folders.find(f => f.id === cur.parent); }
  return out;
}
export const folderPath = (folders, id) => breadcrumb(folders, id).map(f => f.name).join(' / ');

export function filterDocs(list, { flt = 'all', q = '', folderId = null } = {}) {
  const needle = q.trim().toLowerCase();
  return list.filter(x => {
    const inF = folderId === 'all' ? true : folderId == null ? (x.folder === '' || x.folder == null) : x.folder === folderId;
    if (!inF) return false;
    if (flt === 'fav' && !x.fav) return false;
    if (flt === 'notebook' && x.type !== 'notebook') return false;
    if (flt === 'board' && x.type !== 'board') return false;
    if (flt === 'img' && x.type !== 'photo' && x.type !== 'scan') return false;
    return !needle || String(x.title || '').toLowerCase().includes(needle);
  });
}
export function sortDocs(list, by = 'new') {
  const c = [...list];
  if (by === 'name') return c.sort((a, b) => String(a.title).localeCompare(String(b.title), 'uk'));
  if (by === 'created') return c.sort((a, b) => (b.created || 0) - (a.created || 0));
  return c.sort((a, b) => (b.upd || 0) - (a.upd || 0));
}
export const recentDocs = (list, n = 6) => sortDocs(list, 'new').slice(0, n);

export function newDoc(type, title, folder, tpl, cover) {
  const board = type === 'board';
  return {
    id: newId(), type: board ? 'board' : 'notebook',
    title: title || (board ? 'Дошка' : 'Зошит') + ' ' + new Date().toLocaleDateString('uk-UA'),
    folder: folder === '' || folder == null ? '' : folder, cover: board ? '' : (cover || ''),
    created: Date.now(), upd: Date.now(), thumb: '', fav: false,
    pages: [{ w: board ? 1600 : 1200, h: board ? 1200 : 1600, tpl: tpl || (board ? 'blank' : 'lined'), strokes: [] }],
  };
}

// Підгонка сторінки під екран — лише відображення, розмір сторінки (p.w × p.h) тут не змінюється.
// Формат сторінки — властивість документа; від ширини вікна, повороту чи панелі Помічника він не залежить.
// W × H — доступна область (без поля навколо сторінки). Режими масштабу (I3):
//   'width' — по ширині, 'page' — сторінка цілком, '100' — 1 px сторінки = 1 CSS px.
// pageScale — масштаб «сторінка цілком» (нижня межа щипка на iPad).
export const ZOOM_MODES = ['width', 'page', '100'];
export function fitMode(p, W, H, mode) {
  const sw = W / p.w, sp = Math.min(W / p.w, H / p.h);
  const sc = mode === '100' ? 1 : mode === 'page' ? sp : sw;
  return { scale: sc, pageScale: sp, cssW: Math.round(p.w * sc), cssH: Math.round(p.h * sc) };
}
// Режим за замовчуванням: альбом — «сторінка цілком»; портрет — по ширині, фото/скани — цілком (як раніше).
export const defaultZoomMode = (landscape, hasImg) => (landscape || hasImg ? 'page' : 'width');

// Освітлити (amt > 0) або затемнити (amt < 0) колір #rrggbb.
export function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = c => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, '0')).join('');
}
