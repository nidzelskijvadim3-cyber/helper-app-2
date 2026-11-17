'use client';
// Папки: власна SVG-форма (тіло з вкладкою), 12 кольорів + свій, набір лінійних іконок (stroke 1.8, скруглення), фото на тлі.
// Дані папки: { color: '#rrggbb', ico: ключ іконки (нове), icon: емодзі (старі версії), cover: dataURL фото }.
import { useId } from 'react';

// Колір папки — дані, не токен: малюється як є в обох темах. Перші 7 — колишня палітра етапу 2 (старі папки лишаються «вибраними»).
export const FOLDER_COLORS = [
  ['#7AA2FF', 'Синій'], ['#3E63DD', 'Темно-синій'], ['#5FD0C0', 'Бірюзовий'], ['#9BD46A', 'Зелений'],
  ['#F5D547', 'Жовтий'], ['#F2A93B', 'Бурштиновий'], ['#FF9B6A', 'Помаранчевий'], ['#E5484D', 'Червоний'],
  ['#FF7EB0', 'Рожевий'], ['#C3A0FF', 'Фіолетовий'], ['#8B9098', 'Сірий'], ['#4A5160', 'Графітовий'],
];
export const isHex = h => /^#[0-9a-f]{6}$/i.test(h || '');
export const folderHex = h => (isHex(h) ? h : '#8B9098');

// WCAG: відносна яскравість і контраст
export const lum = hex => {
  const h = folderHex(hex).slice(1), c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const INK_LIGHT = '#FFFFFF', INK_DARK = '#16181C';
// Колір іконки на папці: білий або темний — що контрастніше до кольору папки (завжди ≥ 4.3:1, вимога ≥ 3:1)
export const inkOn = hex => (contrast(INK_LIGHT, hex) >= contrast(INK_DARK, hex) ? INK_LIGHT : INK_DARK);

// Іконки 24×24, лінійні. Порядок = порядок у виборі.
export const FICONS = [
  ['none', 'Без іконки', null],
  ['book', 'Книга', <><path d="M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-13c-4 0-6.5.5-8 2z" /><path d="M12 6.5v13" /></>],
  ['notebook', 'Зошит', <><rect x="6" y="3" width="13" height="18" rx="2" /><path d="M6 7.5H4M6 12H4M6 16.5H4M10 8h5M10 12h5" /></>],
  ['flask', 'Хімія', <><path d="M9 3h6M10 3v6l-5.2 8.8A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-3.2L14 9V3" /><path d="M7.5 15h9" /></>],
  ['atom', 'Фізика', <><circle cx="12" cy="12" r="1.4" /><ellipse cx="12" cy="12" rx="9" ry="3.6" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-60 12 12)" /></>],
  ['brain', 'Мозок', <><path d="M11.5 5.5A2.8 2.8 0 0 0 6.3 6.6 2.8 2.8 0 0 0 4.5 11a2.8 2.8 0 0 0 1 4.6 2.8 2.8 0 0 0 3.2 3.6 2.6 2.6 0 0 0 2.8.3z" /><path d="M12.5 5.5a2.8 2.8 0 0 1 5.2 1.1 2.8 2.8 0 0 1 1.8 4.4 2.8 2.8 0 0 1-1 4.6 2.8 2.8 0 0 1-3.2 3.6 2.6 2.6 0 0 1-2.8.3z" /><path d="M12 5v14.5M8.5 10.5c1 0 1.8.6 2 1.5M15.5 10.5c-1 0-1.8.6-2 1.5" /></>],
  ['heart', 'Медицина', <><path d="M12 20s-7-4.4-8.6-9A4.6 4.6 0 0 1 12 7.3a4.6 4.6 0 0 1 8.6 3.7C19 15.6 12 20 12 20z" /><path d="M7 12.5h2.6l1.4-2 2 4 1.4-2H17" /></>],
  ['bone', 'Анатомія', <path d="M8.3 5.2a2.4 2.4 0 1 0-3.4 3.2 2.4 2.4 0 1 0 2.4 3.3l5 5a2.4 2.4 0 1 0 3.3 2.4 2.4 2.4 0 1 0 3.2-3.4 2.4 2.4 0 1 0-3.3-2.4l-5-5a2.4 2.4 0 1 0-2.2-3.1z" />],
  ['pill', 'Ліки', <><rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="M9.5 9.5l5 5" /></>],
  ['calc', 'Математика', <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8.5 7h7v3h-7z" /><path d="M8.5 14h.01M12 14h.01M15.5 14h.01M8.5 17.5h.01M12 17.5h.01M15.5 17.5h.01" /></>],
  ['globe', 'Географія', <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.4 2.5 3.7 5.5 3.7 9s-1.3 6.5-3.7 9c-2.4-2.5-3.7-5.5-3.7-9S9.6 5.5 12 3z" /></>],
  ['lang', 'Мови', <><path d="M3.5 5.5h9M8 3.5v2M10.5 5.5c-.6 3-2.7 5.8-6 7.5M6 8.5c1.1 2 2.9 3.4 5 4.3" /><path d="M13 20.5l3.8-8.5 3.7 8.5M14.3 17.5h5" /></>],
  ['music', 'Музика', <><path d="M9 17.5V5.5l11-2v12" /><circle cx="6.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="15.5" r="2.5" /></>],
  ['palette', 'Мистецтво', <><path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-.9 2-1.9 0-1.2-1-1.5-1-2.6 0-.9.7-1.5 1.7-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" /><path d="M7.5 11.5h.01M9.5 7.5h.01M14.5 7h.01M17.5 10.5h.01" /></>],
  ['code', 'Код', <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15" />],
  ['laptop', 'Ноутбук', <><rect x="4.5" y="5" width="15" height="10.5" rx="1.5" /><path d="M2.5 19h19" /></>],
  ['briefcase', 'Робота', <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18" /></>],
  ['home', 'Дім', <path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />],
  ['dumbbell', 'Спорт', <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />],
  ['leaf', 'Біологія', <><path d="M5 19C5 10.5 10 5.5 20 4c-1.2 10-6.2 15-15 15z" /><path d="M5 19l8.5-8.5" /></>],
  ['star', 'Зірка', <path d="M12 4l2.5 5 5.5.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9 5.5-.8z" />],
  ['flag', 'Прапорець', <path d="M5.5 21V4M5.5 4.5h11.5l-2.3 4 2.3 4H5.5" />],
  ['bulb', 'Ідея', <><path d="M9.5 18h5M10.5 21h3" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" /></>],
  ['chart', 'Графік', <path d="M4 4v16h16M8.5 16v-4M12.5 16V8M16.5 16v-6" />],
  ['camera', 'Фото', <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></>],
  ['plane', 'Подорожі', <path d="M21 3.5L3 11l7.2 2.8L13 21zM10.2 13.8L21 3.5" />],
  ['money', 'Гроші', <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5h.01M17.5 14.5h.01" /></>],
  ['calendar', 'Календар', <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M8.5 3v4M15.5 3v4" /></>],
  ['archive', 'Архів', <><rect x="3" y="4" width="18" height="5" rx="1.2" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></>],
  ['lock', 'Замок', <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2" /></>],
];
const ICO = Object.fromEntries(FICONS.map(x => [x[0], x[2]]));
export const icoLabel = k => (FICONS.find(x => x[0] === k) || [])[1];

export function LineIcon({ k, size = 22 }) {
  const ch = ICO[k];
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ch || <path d="M6 18L18 6" opacity=".5" />}</svg>;
}

// Форма папки 64×52: задня частина з вкладкою + передня панель (на ній іконка або фото)
const BACK = 'M2 8a4 4 0 0 1 4-4h14.2a3 3 0 0 1 2.3 1.1L25.6 9H58a4 4 0 0 1 4 4v33a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z';
const FRONT = 'M2 18a4 4 0 0 1 4-4h52a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z';
// Затемнення фото: при rgba(0,0,0,.45) навіть біле фото дає сірий #8C8C8C → білий значок 3.37:1 (≥ 3:1)
export const COVER_SHADE = 0.45;

export function FolderGlyph({ color, ico, emoji, cover, size = 64, dashed }) {
  const uid = useId().replace(/:/g, '');
  const h = Math.round(size * 52 / 64);
  if (dashed) return <svg width={size} height={h} viewBox="0 0 64 52" aria-hidden="true" className="fg">
    <path d={BACK} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
    <path d="M32 24v14M25 31h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>;
  const c = folderHex(color), hasIco = ico && ico !== 'none' && ICO[ico];
  const ink = cover ? INK_LIGHT : inkOn(c);
  const big = size >= 40;
  return <svg width={size} height={h} viewBox="0 0 64 52" aria-hidden="true" className="fg">
    <defs><clipPath id={'fc' + uid}><path d={FRONT} /></clipPath></defs>
    <path d={BACK} fill={c} />
    <path d={BACK} fill="#000" opacity=".22" />
    <path d={FRONT} fill={c} />
    {cover && <g clipPath={'url(#fc' + uid + ')'}>
      <image href={cover} x="2" y="14" width="60" height="36" preserveAspectRatio="xMidYMid slice" />
      <rect x="2" y="14" width="60" height="36" fill="#000" opacity={COVER_SHADE} />
    </g>}
    {big && <path d="M6 14.6h52" stroke="#fff" strokeOpacity=".28" strokeWidth="1" />}
    <path d={BACK} fill="none" stroke="#000" strokeOpacity=".14" strokeWidth="1" />
    {hasIco ? <svg x={big ? 21 : 19} y={big ? 21 : 19} width={big ? 22 : 26} height={big ? 22 : 26} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={big ? 1.8 : 2.4} strokeLinecap="round" strokeLinejoin="round">{ICO[ico]}</svg>
      : (!ico && emoji ? <text x="32" y="33" textAnchor="middle" dominantBaseline="middle" fontSize={big ? 17 : 20}>{emoji}</text> : null)}
  </svg>;
}
