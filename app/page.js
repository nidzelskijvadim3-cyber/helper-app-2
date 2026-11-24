'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import Materials, { bridge, listDocs, putDoc, delDoc, newDoc, shrink, reparentDocs, docMaterial, materialOf, TEXT_PAGES, PALETTE_C, SOLID, colorKey } from './docs';
import { FolderGlyph, FOLDER_COLORS, FICONS, LineIcon, isHex } from './folder-icons';
import { canMoveFolder, folderPath } from './lib';
import { syncNow, syncStatus, getSyncMeta, setSyncOn } from './sync';
import { nsKey, listAccounts, getActiveId, setActiveId, addAccount, activeAccount, deriveAccountId, validateCredentials } from './accounts';
import { t as tr, loc, setLang, getLang, plural } from './i18n';
import Assistant, { migrateChats, AiPanel } from './assistant';
import { occurs, makePlan, isEv, isRep, isExam, openTasks, dayCount } from './plan';
import { localParse } from './qparse';
import { buildBackup, downloadBlob, backupName, inspectBackup, applyBackup, getBkMeta, setBkMeta } from './backup';
import { normCard, needsNorm, preview as srsPreview, queue as srsQueue, nextUp, isLearned, resetCard, newCardFields, ivParts, NEW_PER_DAY } from './srs';

const DN = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DNF = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'п’ятниця', 'субота'];
const AREA = { study: 'Навчання', work: 'Робота', personal: 'Особисте', health: 'Здоров’я', home: 'Дім' };
const REP = { none: 'Не повторювати', daily: 'Щодня', weekdays: 'У будні', weekly: 'Щотижня' };
const REPS = { daily: 'щодня', weekdays: 'у будні', weekly: 'щотижня' };
// кольори папок = токени стилю C (у даних hex, малюються CSS-змінні, див. docs.js PALETTE_C)
const ACCENTS = PALETTE_C.map(x => x[0]);
// accent і font зафіксовані (акцент і шрифт задаються в globals.css); поля лишаються в даних для сумісності із синхронізацією, але ігноруються.
const UI0 = { theme: 'dark', accent: '#0a84ff', font: 'sf', lang: 'uk', newPerDay: NEW_PER_DAY };
// 4 розділи (стиль C): [ключ вкладки, підпис, іконка]. Колишні «Календар» і «Задачі» — види «Місяць» і «Усі» всередині Плану.
const TABS = [['today', 'План', 'plan'], ['folders', 'Матеріали', 'mat'], ['cards', 'Навчання', 'cards'], ['ai', 'Помічник', 'ai1']];
const VIEWS = [['day', 'День'], ['month', 'Місяць'], ['all', 'Усі']];
const PV_KEY = 'helper-planview';
const ICONS = {
  plan: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  mat: <><path d="M6 3h9l3 3v15H6z" /><path d="M9 11h6M9 15h6" /></>,
  ai1: <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevL: <path d="M15 6l-6 6 6 6" />,
  chevR: <path d="M9 6l6 6-6 6" />,
  chevD: <path d="M6 9l6 6 6-6" />,
  today: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  cal: <><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" /></>,
  tasks: <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" /></>,
  notes: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
  cards: <><rect x="3" y="7" width="14" height="12" rx="2" /><path d="M7 4h12a2 2 0 0 1 2 2v10" /></>,
  ai: <><path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" /></>,
  folders: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  send: <path d="M12 19V5M5 12l7-7 7 7" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  trash: <><path d="M5 7h14M10 7V4h4v3" /><path d="M7 7l1 13h8l1-13" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  set: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  sync: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></>,
  data: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M15 8l2 2" /></>
};
// чекбокс задачі: видимий квадрат 22px, зона натискання — label 44×44 (WCAG 2.5.8, HIG 44 pt)
const Ck = ({ checked, onChange, label }) => <label className="ck"><input type="checkbox" checked={!!checked} onChange={onChange} aria-label={label} /></label>;
const Icon = ({ n, s = 24 }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[n]}</svg>;

const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const r1 = x => Math.round(x * 10) / 10;
const hm = m => pad(Math.floor(m / 60) % 24) + ':' + pad(Math.round(m % 60));
const dm = s => s.slice(8) + '.' + s.slice(5, 7);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const isTime = s => /^\d{2}:\d{2}$/.test(s || '');
const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
// Іспит зберігається як подія з прапорцем exam:true (kind лишається 'event'): старі версії застосунку показують його
// як звичайну подію в цей день, а не планують як задачу (невідомий kind вони вважали б задачею і виділяли б на нього години).
const daysTo = (d, today) => Math.round((new Date(d + 'T00:00:00') - new Date(today + 'T00:00:00')) / 864e5);
const normArea = v => (tr(AREA[v]) ? v : 'personal');
const normRep = v => (REP[v] ? v : 'none');
// until — останній день повтору (необов'язково, YYYY-MM-DD); у старих записах поля немає = повтор без кінця
const EMPTY = { kind: 'task', t: '', area: 'study', h: '', due: '', time: '', pri: 1, note: '', repeat: 'none', until: '', folder: '' };
const normUntil = (v, rep, due) => (rep && rep !== 'none' && isDate(v) && (!due || v >= due) ? v : '');

// occurs / makePlan / лічильники — у plan.js (події віднімаються від ємності дня, повтор «до дати»)

function layoutDay(blocks, evs, startMin) {
  const E = evs.map(e => { const s = toMin(e.time || '09:00'); return { kind: 'event', id: e.id, t: e.t, area: e.area, rep: isRep(e), s, e: s + Math.round((e.h || 1) * 60) }; });
  const out = [...E];
  let cur = startMin;
  for (const b of blocks) {
    const d = Math.max(15, Math.round(b.h * 60));
    let s = cur, moved = true;
    while (moved) { moved = false; for (const e of E) if (s < e.e && s + d > e.s) { s = e.e; moved = true; } }
    out.push({ ...b, kind: 'task', s, e: s + d });
    cur = s + d;
  }
  return out.sort((a, b) => a.s - b.s);
}

function applyActions(acts, st) {
  let items = [...st.items], cap = [...st.cap], start = st.start, cards = [...st.cards], notes = [...(st.notes || [])], folders = [...(st.folders || [])], docOps = [], n = 0, k = 0;
  const nid = () => Date.now() + (k++);
  const today = ymd(new Date());
  const resolveF = v => {
    if (v === '' || v == null) return '';
    if (Number.isFinite(Number(v)) && folders.some(f => f.id === Number(v))) return Number(v);
    const f = folders.find(x => x.name.toLowerCase() === String(v).toLowerCase()); return f ? f.id : '';
  };
  for (const a of acts) {
    if (!a || typeof a !== 'object') continue;
    const aid = Number(a.id);
    if (a.type === 'add_task' && a.t) {
      const rep = normRep(a.repeat), due = isDate(a.due) ? a.due : (rep !== 'none' ? today : '');
      items.push({ id: nid(), kind: 'task', t: String(a.t), area: normArea(a.area), h: Number(a.h) > 0 ? Number(a.h) : 1, due, time: '', pri: Number(a.pri) === 2 ? 2 : 1, note: '', repeat: rep, until: normUntil(a.until, rep, due), folder: resolveF(a.folder), done: false }); n++;
    } else if (a.type === 'add_event' && a.t && isDate(a.date)) {
      const rep = normRep(a.repeat);
      items.push({ id: nid(), kind: 'event', t: String(a.t), area: normArea(a.area), h: Number(a.h) > 0 ? Number(a.h) : 1, due: a.date, time: isTime(a.time) ? a.time : '09:00', pri: 1, note: '', repeat: rep, until: normUntil(a.until, rep, a.date), folder: resolveF(a.folder), done: false }); n++;
    } else if (a.type === 'update_task') {
      items = items.map(i => {
        if (i.id !== aid) return i; n++;
        const p = {};
        if (a.t) p.t = String(a.t);
        if (a.area) p.area = normArea(a.area);
        if (Number(a.h) > 0) p.h = Number(a.h);
        const nd = a.date !== undefined ? a.date : a.due;
        if (nd !== undefined) p.due = isDate(nd) ? nd : '';
        if (isTime(a.time)) p.time = a.time;
        if (a.pri) p.pri = Number(a.pri) === 2 ? 2 : 1;
        if (a.repeat) p.repeat = normRep(a.repeat);
        if (a.until !== undefined || p.repeat === 'none') { const r = p.repeat || i.repeat, d = p.due !== undefined ? p.due : i.due; p.until = normUntil(a.until !== undefined ? a.until : i.until, r, d); }
        if (a.folder !== undefined) p.folder = resolveF(a.folder);
        return { ...i, ...p };
      });
    } else if (a.type === 'complete_task') {
      items = items.map(i => {
        if (i.id !== aid || isEv(i)) return i;
        if (isRep(i)) { if ((i.doneDates || []).includes(today)) return i; n++; return { ...i, doneDates: [...(i.doneDates || []), today] }; }
        if (i.done) return i; n++; return { ...i, done: true, doneAt: today };
      });
    } else if (a.type === 'delete_task') {
      const l = items.length; items = items.filter(i => i.id !== aid); if (items.length < l) n++;
    } else if (a.type === 'set_capacity') {
      const d = Number(a.day), h = Number(a.h);
      if (d >= 0 && d <= 6 && h >= 0) { cap[d] = h; n++; }
    } else if (a.type === 'set_start') {
      const h = Number(a.hour); if (h >= 0 && h <= 23) { start = h; n++; }
    } else if (a.type === 'add_note' && a.text) {
      notes.unshift({ id: nid(), text: String(a.text), upd: Date.now(), folder: resolveF(a.folder) }); n++;
    } else if (a.type === 'create_folder' && a.name) {
      folders.push({ id: nid(), name: String(a.name).slice(0, 40), color: /^#[0-9a-f]{6}$/i.test(a.color || '') ? a.color : ACCENTS[folders.length % ACCENTS.length], cover: '', icon: typeof a.icon === 'string' ? a.icon.slice(0, 4) : '', parent: resolveF(a.parent) }); n++;
    } else if (a.type === 'rename_folder' && a.name) {
      folders = folders.map(f => { if (f.id !== aid) return f; n++; return { ...f, name: String(a.name).slice(0, 40) }; });
    } else if (a.type === 'move_note') {
      notes = notes.map(x => { if (x.id !== aid) return x; n++; return { ...x, folder: resolveF(a.folder) }; });
    } else if (a.type === 'create_doc') {
      const kind = a.kind === 'board' ? 'board' : 'notebook';
      docOps.push({ op: 'create', kind, title: a.title ? String(a.title).slice(0, 60) : '', folder: resolveF(a.folder), tpl: ['blank', 'lined', 'grid', 'dots'].includes(a.template) ? a.template : (kind === 'board' ? 'blank' : 'lined') }); n++;
    } else if (a.type === 'rename_doc' && a.title) {
      docOps.push({ op: 'rename', id: aid, title: String(a.title).slice(0, 60) }); n++;
    } else if (a.type === 'move_doc') {
      docOps.push({ op: 'move', id: aid, folder: resolveF(a.folder) }); n++;
    } else if (a.type === 'add_cards' && Array.isArray(a.cards)) {
      for (const c of a.cards) if (c && c.q && c.a) { const id = nid(); cards.push({ id, deck: String(a.deck || ''), q: String(c.q), a: String(c.a), seq: id, ...newCardFields(Date.now()) }); n++; }
    } else if (a.type === 'add_exam' && a.t && isDate(a.date)) {
      items.push({ id: nid(), kind: 'event', exam: true, t: String(a.t).slice(0, 80), area: 'study', h: Number(a.h) > 0 ? Number(a.h) : 2, due: a.date, time: isTime(a.time) ? a.time : '', pri: 2, note: a.note ? String(a.note) : '', repeat: 'none', folder: resolveF(a.folder), done: false }); n++;
    }
  }
  return { st: { items, cap, start, cards, notes, folders }, n, docOps };
}

const clean = raw => String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
function parseAI(raw) {
  try { const o = JSON.parse(clean(raw)); return { reply: String(o.reply || ''), actions: Array.isArray(o.actions) ? o.actions : [] }; }
  catch (e) { return { reply: String(raw), actions: [] }; }
}
function parseQuiz(raw) {
  try {
    const o = JSON.parse(clean(raw)); const q = o.quiz || o;
    const qs = (Array.isArray(q.questions) ? q.questions : []).map(x => {
      if (!x || !x.q) return null;
      const a = Number(x.answer);
      if (x.type === 'choice' && Array.isArray(x.options) && x.options.length >= 2 && Number.isInteger(a) && a >= 0 && a < x.options.length)
        return { type: 'choice', q: String(x.q), options: x.options.map(String), answer: a, explain: String(x.explain || '') };
      return { type: 'open', q: String(x.q), answer: String(x.answer == null ? '' : x.answer), explain: String(x.explain || '') };
    }).filter(Boolean);
    return qs.length ? { title: String(q.title || ''), questions: qs } : null;
  } catch (e) { return null; }
}
const okOf = (t, q, i) => (q.type === 'choice' ? t.ans[i] === q.answer : (t.grades && t.grades[i] ? t.grades[i].score >= 0.7 : null));
const tScore = t => t.qs.reduce((s, q, i) => s + (q.type === 'choice' ? (t.ans[i] === q.answer ? 1 : 0) : (t.grades && t.grades[i] ? t.grades[i].score : 0)), 0);

async function callAI(body, signal) {
  let r;
  try {
    r = await fetch('/api/chat', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-pass': localStorage.getItem('helper-pass') || '' }, body: JSON.stringify({ ...body, lang: getLang() }) });
  } catch (e) { if (e && e.name === 'AbortError') throw e; const err = new Error(tr("Немає зв’язку із сервером.")); err.code = 0; err.detail = String(e && e.message || e); throw err; }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { const err = new Error(tr("Введіть пароль у налаштуваннях (шестерня вгорі) і повторіть запит.")); err.code = 401; throw err; }
  if (!d.text) {
    // сервер віддає людський текст у error, технічні подробиці — у detail (лише для консолі)
    if (d.detail) console.warn('[ШІ]', d.detail);
    const err = new Error(d.error || tr("Порожня відповідь")); err.code = r.status; err.detail = d.detail; throw err;
  }
  return d.text;
}

function Rich({ text }) {
  const inline = (str, k) => String(str).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => (p.length > 4 && p.startsWith('**') && p.endsWith('**') ? <b key={k + '-' + i}>{p.slice(2, -2)}</b> : p.length > 2 && p.startsWith('`') && p.endsWith('`') ? <code key={k + '-' + i}>{p.slice(1, -1)}</code> : p));
  return <>{String(text || '').split('\n').map((l, i) => {
    const m = l.match(/^\s*([-•*]|\d+[.)])\s+(.*)$/);
    if (m) return <div className="li" key={i}><span>{/\d/.test(m[1]) ? m[1] : '•'}</span><span>{inline(m[2], i)}</span></div>;
    return l.trim() === '' ? <div className="gap" key={i} /> : <div key={i}>{inline(l, i)}</div>;
  })}</>;
}
// Навчання: колір смуги набору (стабільний за назвою) — з токенів категорій
const DECKC = ['var(--c-study)', 'var(--accent-tx)', 'var(--c-home)', 'var(--c-personal)', 'var(--c-health)', 'var(--c-work)'];
const deckCol = name => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) | 0; return DECKC[Math.abs(h) % DECKC.length]; };
const QN = [5, 10, 15, 20, 25, 30];
const relDate = ts => {
  const d = new Date(ts), t0 = new Date(); t0.setHours(0, 0, 0, 0); const d0 = new Date(d); d0.setHours(0, 0, 0, 0);
  const diff = Math.round((t0 - d0) / 864e5);
  return diff === 0 ? tr("сьогодні") : diff === 1 ? tr("вчора") : d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' });
};

export default function Home() {
  const [tab, setTab] = useState('today');
  const [items, setItems] = useState([]);
  const [cap, setCap] = useState([3, 2, 2, 2, 2, 2, 3]);
  const [start, setStart] = useState(17);
  const [cards, setCards] = useState([]);
  const [notes, setNotes] = useState([]);
  const [tests, setTests] = useState([]);
  // Помічник: розмови (замість одного msgs), поточна розмова, останній відкритий матеріал.
  // aiOpen — права панель Помічника, одна на весь застосунок (вікно ≥768; ipad-layout-spec 4.1), запам'ятовується.
  const [chats, setChats] = useState([]);
  const [chatCur, setChatCur] = useState(null);
  const [lastMat, setLastMat] = useState(null);
  const [aiOpen, setAiOpenS] = useState(false);
  const setAiOpen = v => { setAiOpenS(v); try { localStorage.setItem('helper-ai-open', v ? '1' : '0'); } catch (e) {} };
  // клас вікна (навігація і режим панелі): c < 768 (вкладка) · m 768–1023 (панель поверх) · e 1024–1279 (поруч, 380) · l ≥ 1280 (поруч, 360–480)
  const [win, setWin] = useState('c');
  // клас області контенту (.region, без рейки й панелі): s < 600 · m < 860 · l < 1120 · xl — для поведінки (CSS — через @container region)
  const [rc, setRc] = useState('s');
  const regRef = useRef(null);
  const [edDoc, setEdDoc] = useState(null); // відкритий у редакторі документ — контекст панелі за замовчуванням
  const [aiPend, setAiPend] = useState(null);
  const [openReq, setOpenReq] = useState(null);
  const [undo, setUndo] = useState(null);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [f, setF] = useState(EMPTY);
  const [allSel, setAllSel] = useState(null); // «Усі» на iPad: вибраний запис і його форма
  const [af, setAfS] = useState(null);
  const [setSec, setSetSec] = useState('gen'); // Налаштування на iPad: поточний розділ
  const [show, setShow] = useState(false);
  const [cq, setCq] = useState('');
  const [ca, setCa] = useState('');
  const [nview, setNview] = useState(null);
  const [ntext, setNtext] = useState('');
  const [flow, setFlow] = useState(false);
  const [nq, setNq] = useState('');
  const [sel, setSel] = useState('');
  const [calM, setCalM] = useState(null);
  const [qa, setQa] = useState('');
  const [qaBusy, setQaBusy] = useState(false);
  const [qaMsg, setQaMsg] = useState('');
  const [preview, setPreview] = useState(null);
  const [tcfg, setTcfg] = useState({ topic: '', n: 10, kind: 'mix', src: 'topic', mat: '', pages: [], deck: null, level: 'mixed' });
  const [deckV, setDeckV] = useState(null);
  const [rev, setRev] = useState(null);
  const [ced, setCed] = useState(null);
  const [dkDel, setDkDel] = useState(false);
  const [tbusy, setTbusy] = useState(false);
  const [tmsg, setTmsg] = useState('');
  const [tview, setTview] = useState(null);
  const [xbusy, setXbusy] = useState({}); // «Поясни»: { 'testId:i': 'busy' | 'err' }
  const [xopen, setXopen] = useState({}); // розкриті пояснення
  const [ctp, setCtp] = useState(null); // превʼю «Картки з помилок»: { tid, rows:[{q,a,on}], deck, draft }
  const [toast, setToast] = useState(null); // { text, undo? }
  const [exV, setExV] = useState(null); // id іспиту, відкритого в деталях
  const [qi, setQi] = useState(0);
  const [folders, setFolders] = useState([]);
  const [ui, setUi] = useState(UI0);
  setLang(ui.lang);
  const [fview, setFview] = useState(null);
  const [fform, setFform] = useState(null);
  const [nfold, setNfold] = useState('');
  const [acf, setAcf] = useState({ name: '', pass: '', busy: false, err: '' });
  const [sy, setSy] = useState({ on: false, state: 'idle', last: 0, msg: '', configured: null });
  const [docUndo, setDocUndo] = useState([]);
  const [pv, setPv] = useState('day');
  const [more, setMore] = useState(true);
  // резервна копія: bkm — { last, snooze } з localStorage; bk — стан діалогу відновлення / збереження
  const [bkm, setBkm] = useState({});
  const [bk, setBk] = useState(null); // { step: 'pick'|'preview'|'busy'|'done'|'error', info?, mode?, msg? }
  const [bkBusy, setBkBusy] = useState(false);
  const [docMeta, setDocMeta] = useState([]); // легкі метадані документів (для банера, тесту із зошита)
  const [moreAll, setMoreAll] = useState(false); // «Ще на сьогодні» на вузьких екранах: перші 3 або всі
  const [mvId, setMvId] = useState(null); // «Перенести» відкрито для задачі id
  const [, setTick] = useState(0);
  const taRef = useRef(null);
  const stRef = useRef(null);
  const sheetPrev = useRef(null);
  const revKey = useRef(null);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(nsKey('helper-next')) || '{}');
      if (s.items) setItems(s.items); if (s.cap) setCap(s.cap); setChats(migrateChats(s)); if (s.chatCur) setChatCur(s.chatCur); if (s.aiLast) setLastMat(s.aiLast);
      if (s.start) setStart(s.start); if (s.cards) setCards(s.cards); if (s.notes) setNotes(s.notes); if (s.tests) setTests(s.tests); { const sm = getSyncMeta(); setSy(x => ({ ...x, on: !!sm.on, last: sm.last || 0 })); } if (s.folders) setFolders(s.folders.map(f => ({ parent: '', ...f }))); if (s.ui) setUi({ ...UI0, ...s.ui });
    } catch (e) {}
    try { const v = localStorage.getItem(PV_KEY); if (VIEWS.some(([k]) => k === v)) setPv(v); } catch (e) {}
    setBkm(getBkMeta());
    setReady(true);
  }, []);
  // метадані документів: для банера «дані лише на цьому пристрої» і вибору зошита в «Новий тест»
  useEffect(() => {
    let live = true;
    const load = () => listDocs().then(l => { if (live) setDocMeta(l || []); }).catch(() => {});
    load(); window.addEventListener('docs-changed', load);
    return () => { live = false; window.removeEventListener('docs-changed', load); };
  }, []);
  // SRS: картки без полів інтервального повторення (старі дані або змінені старою версією) → нормалізувати й зберегти
  useEffect(() => { if (ready && needsNorm(cards)) setCards(cs => cs.map(c => normCard(c))); }, [cards, ready]);
  // сесія повторення: клавіші (пробіл — показати, 1/2/3 — оцінка, ←/→ у перегляді, Esc — завершити)
  useEffect(() => {
    if (!rev) return;
    const h = e => revKey.current && revKey.current(e);
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  }, [rev != null]);
  useEffect(() => { if (!toast || toast.hold) return; const tm = setTimeout(() => setToast(null), 8000); return () => clearTimeout(tm); }, [toast]);
  // лінія «зараз» на шкалі дня: перемальовувати раз на хвилину
  useEffect(() => { const iv = setInterval(() => setTick(x => x + 1), 60000); return () => clearInterval(iv); }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem(nsKey('helper-next'), JSON.stringify({ items, cap, chats: chats.slice(0, 50), chatCur, aiLast: lastMat, start, cards, notes, tests, folders, ui })); } catch (e) {} } }, [items, cap, chats, chatCur, lastMat, start, cards, notes, tests, folders, ui, ready]);
  useEffect(() => {
    if (!ready) return;
    const r = document.documentElement;
    r.lang = ui.lang === 'de' ? 'de' : 'uk'; r.dataset.theme = ui.theme;
  }, [ui, ready]);
  useEffect(() => {
    if (!sheet) return;
    const onKey = e => { if (e.key === 'Escape') setSheet(null); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const p = sheetPrev.current; sheetPrev.current = null;
      if (p && typeof p.focus === 'function' && document.contains(p)) p.focus();
    };
  }, [sheet]);
  const plan = useMemo(() => makePlan(items, cap), [items, cap]);
  stRef.current = { items, cap, start, cards, notes, folders, tests, ui };
  const syncing = useRef(false);
  const switchAcc = id => { setActiveId(id); window.location.reload(); };
  const enterAcc = async () => {
    const bad = validateCredentials(acf.name, acf.pass);
    if (bad) { setAcf(a => ({ ...a, err: bad === 'name' ? tr("Введіть ім’я акаунта.") : tr("Пароль має бути не коротшим за 6 символів.") })); return; }
    setAcf(a => ({ ...a, busy: true, err: '' }));
    try { const id = await deriveAccountId(acf.name, acf.pass); addAccount(acf.name, id); setActiveId(id); window.location.reload(); }
    catch (e) { setAcf(a => ({ ...a, busy: false, err: tr("Не вдалося створити акаунт у цьому браузері.") })); }
  };
  const applySync = ns => {
    stRef.current = { ...stRef.current, ...ns };
    setItems(ns.items); setNotes(ns.notes); setFolders(ns.folders); setCards(ns.cards); setTests(ns.tests); setCap(ns.cap); setStart(ns.start); setUi(ns.ui);
  };
  const syncErr = e => (e.code === 401 ? tr("Невірний пароль") : e.code === 503 ? tr("Сервер синхронізації не налаштований. Див. інструкцію.") : (e.message || 'Error'));
  const runSync = async () => {
    if (syncing.current) return;
    syncing.current = true; setSy(s => ({ ...s, state: 'syncing', msg: '' }));
    try { await syncNow({ getState: () => stRef.current, setState: applySync, pass: localStorage.getItem('helper-pass') || '' }); setSy(s => ({ ...s, state: 'idle', last: Date.now(), msg: '' })); }
    catch (e) { setSy(s => ({ ...s, state: 'error', msg: syncErr(e) })); }
    syncing.current = false;
  };
  const toggleSync = async () => {
    if (sy.on) { setSyncOn(false); setSy(s => ({ ...s, on: false })); return; }
    try {
      const st = await syncStatus(localStorage.getItem('helper-pass') || '');
      if (!st.configured) { setSy(s => ({ ...s, configured: false, msg: tr("Сервер синхронізації не налаштований. Див. інструкцію.") })); return; }
    } catch (e) { setSy(s => ({ ...s, msg: syncErr(e) })); return; }
    setSyncOn(true); setSy(s => ({ ...s, on: true, configured: true, msg: '' }));
  };
  useEffect(() => {
    if (!ready || !sy.on) return;
    let tm; const kick = () => { if (document.visibilityState === 'visible') runSync(); };
    const later = () => { clearTimeout(tm); tm = setTimeout(kick, 4000); };
    kick();
    document.addEventListener('visibilitychange', kick); window.addEventListener('online', kick); window.addEventListener('docs-changed', later);
    const iv = setInterval(kick, 60000);
    return () => { clearTimeout(tm); clearInterval(iv); document.removeEventListener('visibilitychange', kick); window.removeEventListener('online', kick); window.removeEventListener('docs-changed', later); };
  }, [ready, sy.on]);
  useEffect(() => { if (!ready || !sy.on) return; const tm = setTimeout(() => runSync(), 4000); return () => clearTimeout(tm); }, [items, notes, folders, cards, tests, cap, start, ui, ready, sy.on]);
  useEffect(() => {
    if (nview == null || !ntext.trim()) return;
    setNotes(p => p.some(n => n.id === nview)
      ? p.map(n => n.id === nview && n.text !== ntext ? { ...n, text: ntext, upd: Date.now() } : n)
      : [{ id: nview, text: ntext, upd: Date.now(), folder: nfold }, ...p]);
  }, [ntext]);
  useEffect(() => {
    try { if (localStorage.getItem('helper-ai-open') === '1') setAiOpenS(true); } catch (e) {}
    const f = () => { const w = window.innerWidth; setWin(w < 768 ? 'c' : w < 1024 ? 'm' : w < 1280 ? 'e' : 'l'); };
    f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f);
  }, []);
  useEffect(() => {
    const el = regRef.current; if (!el) return;
    const f = () => { const w = el.clientWidth; setRc(w < 600 ? 's' : w < 860 ? 'm' : w < 1120 ? 'l' : 'xl'); };
    f(); const ro = new ResizeObserver(f); ro.observe(el); return () => ro.disconnect();
  }, [ready]);
  if (!ready) return null;

  const now = new Date();
  const today = ymd(now);
  const selDate = sel || today;
  const applySt = st => { setItems(st.items); setCap(st.cap); setStart(st.start); setCards(st.cards); setNotes(st.notes); if (st.folders) setFolders(st.folders); };
  const closeSheet = () => setSheet(null);
  const openNote = id => {
    if (id === 'new') { setNview(Date.now()); setNtext(''); setNfold(typeof fview === 'number' ? fview : ''); setFlow(true); }
    else { const n = notes.find(x => x.id === id); setNview(id); setNtext(n ? n.text : ''); setFlow(false); if (n && n.text.trim()) setLastMat({ k: 'note', id, title: n.text.trim().split('\n')[0].slice(0, 60) }); }
  };
  const closeNote = () => { setNotes(notes.filter(n => n.text.trim())); setNview(null); setNtext(''); setFlow(false); };
  const newNote = flowMode => { openNote('new'); setFlow(flowMode); };
  const delNote = () => { setNotes(notes.filter(n => n.id !== nview)); setNview(null); setNtext(''); setFlow(false); };
  // expanded=false: sheet відкривається з полем швидкого вводу зверху і згорнутою повною формою (FAB на телефоні)
  const openNew = (expanded = true, kind) => { sheetPrev.current = document.activeElement; setF({ ...EMPTY, ...(kind ? { kind } : null), due: selDate !== today ? selDate : '', folder: tab === 'folders' && typeof fview === 'number' ? fview : '' }); setMore(expanded !== false); setSheet('new'); };
  const setPlanView = v => { setPv(v); try { localStorage.setItem(PV_KEY, v); } catch (e) {} };
  const goTab = k => {
    if (k === tab) { if (k === 'today') setSel(''); if (k === 'folders') setFview(null); if (k === 'cards') setDeckV(null); return; }
    setTab(k);
  };
  const formOf = i => ({ kind: isExam(i) ? 'exam' : i.kind || 'task', t: i.t, area: i.area, h: String(i.h), due: i.due || '', time: i.time || '', pri: i.pri || 1, note: i.note || '', repeat: i.repeat || 'none', until: i.until || '', folder: i.folder || '' });
  const openEdit = i => { if (!i) return; sheetPrev.current = document.activeElement; setF(formOf(i)); setSheet(i.id); };
  // поля форми → запис (null, якщо форма невалідна); спільне для аркуша й деталі «Усі» на iPad
  const buildItem = fv => {
    if (!fv.t.trim()) return null;
    const h = parseFloat(fv.h);
    if (fv.kind === 'exam') {
      if (!isDate(fv.due)) return null;
      return { kind: 'event', exam: true, t: fv.t.trim(), area: 'study', h: h > 0 ? h : 2, due: fv.due, time: isTime(fv.time) ? fv.time : '', pri: 2, note: fv.note.trim(), repeat: 'none', folder: fv.folder === '' || fv.folder == null ? '' : Number(fv.folder) };
    }
    const ev = fv.kind === 'event';
    const rep = fv.repeat || 'none';
    const due = fv.due || (ev || rep !== 'none' || isTime(fv.time) ? selDate : '');
    if (rep !== 'none' && isDate(fv.until) && fv.until < due) return null; // кінець повтору раніше за початок — кнопка вимкнена, підказка під полем
    return { kind: fv.kind, t: fv.t.trim(), area: fv.area, h: h > 0 ? h : 1, due, time: ev ? (fv.time || '09:00') : (isTime(fv.time) ? fv.time : ''), pri: Number(fv.pri) || 1, note: fv.note.trim(), repeat: rep, until: normUntil(fv.until, rep, due), folder: fv.folder === '' || fv.folder == null ? '' : Number(fv.folder), exam: undefined };
  };
  const saveTask = () => {
    const base = buildItem(f); if (!base) return;
    if (sheet === 'new') setItems([...items, { id: Date.now(), ...base, done: false }]);
    else setItems(items.map(i => i.id === sheet ? { ...i, ...base } : i));
    closeSheet();
  };
  // «Усі» на iPad (l/xl): список + деталь; правка зберігається одразу (ipad-layout-spec 5.3)
  const pickAll = i => { setAllSel(i.id); setAfS(formOf(i)); };
  const setAf = v => { setAfS(v); const b = buildItem(v); if (b && allSel != null) setItems(its => its.map(i => i.id === allSel ? { ...i, ...b } : i)); };
  const tog = (id, date) => setItems(items.map(i => {
    if (i.id !== id) return i;
    if (isRep(i)) { const ds = i.doneDates || []; return { ...i, doneDates: ds.includes(date) ? ds.filter(x => x !== date) : [...ds, date] }; }
    return { ...i, done: !i.done, doneAt: !i.done ? today : null };
  }));
  const del = id => { setItems(items.filter(i => i.id !== id)); closeSheet(); };
  const saveFolder = () => {
    if (!fform || !fform.name.trim()) return;
    // ico — нова лінійна іконка (ключ), icon — емодзі зі старих версій (зберігається), cover — фото-тло (dataURL ≤ 256 px)
    const fo = { id: fform.id || Date.now(), name: fform.name.trim(), color: fform.color, cover: fform.cover || '', icon: fform.icon || '', parent: fform.parent == null ? '' : fform.parent };
    if (fform.ico) fo.ico = fform.ico;
    setFolders(fform.id ? folders.map(x => x.id === fo.id ? fo : x) : [...folders, fo]); setFform(null);
  };
  const delFolder = () => {
    const id = fform.id, up = fform.parent == null ? '' : fform.parent;
    setItems(items.map(i => i.folder === id ? { ...i, folder: up } : i)); setNotes(notes.map(n => n.folder === id ? { ...n, folder: up } : n));
    setFolders(folders.filter(x => x.id !== id).map(x => x.parent === id ? { ...x, parent: up } : x));
    reparentDocs(id, up).catch(() => {});
    setFform(null); setFview(up === '' ? null : up);
  };
  // Матеріали → Навчання: «Зробити картки» відкриває Помічника з підставленою темою (наявний сценарій ШІ-карток),
  // «Скласти тест» — форму тесту: джерело = текстова нотатка з папки, якщо є, інакше тема = назва папки
  const goNewTest = () => { setTimeout(() => { const el = document.getElementById('new-test'); if (el) { el.scrollIntoView({ block: 'start' }); el.focus({ preventScroll: true }); } }, 60); };
  const onStudy = (kind, fo) => {
    if (kind === 'cards') { toAI({ text: tr("Зроби картки за темою: ") + fo.name }); return; }
    const nt = notes.filter(n => n.folder === fo.id && n.text && n.text.trim()).sort((a, b) => (b.upd || 0) - (a.upd || 0))[0];
    // немає текстової нотатки → останній зошит / дошка папки (сторінка 1), інакше тема = назва папки
    const dc = nt ? null : docMeta.filter(d => d.folder === fo.id).sort((a, b) => (b.upd || 0) - (a.upd || 0))[0];
    setTcfg(c => (nt ? { ...c, src: 'mat', mat: String(nt.id), pages: [] } : dc ? { ...c, src: 'mat', mat: 'd:' + dc.id, pages: [1] } : { ...c, src: 'topic', topic: fo.name }));
    setDeckV(null); setTab('cards'); goNewTest();
  };
  const folderTasks = fid => { const il = items.filter(i => i.folder === fid); return il.length > 0 && <div className="card mtasks"><div className="sec">{tr("Задачі й події")}</div>{il.map(row)}</div>; };

  const makeCtx = () => {
    const s0 = stRef.current;
    const next21days = Array.from({ length: 21 }, (_, k) => { const d = new Date(); d.setDate(d.getDate() + k); return ymd(d) + ' ' + DNF[d.getDay()]; });
    return {
      today, weekday: DNF[now.getDay()], next21days, start: s0.start, capacityByWeekday: s0.cap,
      tasks: s0.items.filter(i => !isExam(i) && (isEv(i) || isRep(i) || !i.done) && !(isRep(i) && isDate(i.until) && i.until < today)).slice(-80).map(({ id, kind, t, area, h, due, time, repeat, pri, until }) => ({ id, kind: kind || 'task', t, area, h, due, time, repeat: repeat || 'none', ...(isRep({ repeat }) && isDate(until) ? { until } : {}), pri: pri || 1 })),
      // варіант B: години на навчання й справи по днях після віднімання подій (зайнятий час)
      freeByDate: makePlan(s0.items, s0.cap).days.slice(0, 21).map(d => ({ date: d.date, hours: d.base, busyByEvents: d.busy, free: d.cap })),
      exams: s0.items.filter(i => isExam(i) && i.due >= today).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 10).map(i => {
        const fo = (s0.folders || []).find(x => x.id === i.folder);
        return { id: i.id, subject: i.t, date: i.due, time: i.time || '', daysLeft: daysTo(i.due, today), folder: fo ? fo.name : '', note: i.note || '' };
      })
    };
  };

  async function runDocOps(ops) {
    const undoOps = [], all = await listDocs();
    for (const o of ops) {
      if (o.op === 'create') { const dd = newDoc(o.kind, o.title || (tr(o.kind === 'board' ? 'Дошка' : 'Зошит') + ' ' + new Date().toLocaleDateString(loc())), o.folder, o.tpl); await putDoc(dd); undoOps.push({ del: dd.id }); }
      else {
        const dd = all.find(x => x.id === o.id); if (!dd) continue;
        undoOps.push({ put: { ...dd } });
        await putDoc(o.op === 'rename' ? { ...dd, title: o.title, upd: Date.now() } : { ...dd, folder: o.folder, upd: Date.now() });
      }
    }
    return undoOps;
  }
  const doUndo = async () => {
    if (!undo) return;
    applySt({ ...undo, notes: undo.notes || [] });
    for (const o of docUndo) { try { if (o.del) await delDoc(o.del); else await putDoc(o.put); } catch (e) {} }
    setDocUndo([]); setUndo(null);
  };
  // Помічник: стан застосунку для ШІ (як раніше в ask) і застосування дій після підтвердження картки-превʼю
  const buildState = async () => {
    const ctx = makeCtx();
    ctx.folders = folders.map(({ id, name, parent }) => ({ id, name, parent: parent || '' }));
    ctx.notes = notes.slice(0, 40).map(n => ({ id: n.id, t: n.text.split('\n')[0].slice(0, 50), folder: n.folder || '' }));
    ctx.docs = (await listDocs()).slice(0, 60).map(({ id, title, type, folder }) => ({ id, title, type, folder: folder || '' }));
    ctx.screen = { tab };
    return ctx;
  };
  const applyAI = async acts => {
    const cur = stRef.current; const res = applyActions(acts, cur);
    if (res.n) { setUndo(cur); applySt(res.st); setDocUndo(res.docOps.length ? await runDocOps(res.docOps) : []); }
    return res.n;
  };
  const openRef = (ref, page) => {
    if (!ref) return;
    if (ref.k === 'note') { if (notes.some(n => n.id === ref.id)) openNote(ref.id); return; }
    setOpenReq({ id: ref.id, page: page || 1, t: Date.now() });
    setTab('folders');
  };
  const askFromEditor = info => {
    setLastMat({ k: 'doc', id: info.id, title: info.title, type: info.type, page: info.page });
    // ласо: info.sel — область виділення (рендериться лише вона), info.text — заготовка запиту без автонадсилання
    setAiPend({ ctx: { k: 'doc', id: info.id, title: info.title, type: info.type, pages: [info.page], ...(info.sel ? { sel: info.sel } : {}) }, ...(info.text ? { text: info.text } : {}) });
    if (window.matchMedia('(min-width:768px)').matches) setAiOpen(true); else setTab('ai');
  };
  // запит до Помічника з будь-якого розділу: на iPad — права панель (розділ лишається на місці), на телефоні — вкладка
  const toAI = pend => {
    if (pend) setAiPend(pend);
    if (tab !== 'ai' && window.matchMedia('(min-width:768px)').matches) setAiOpen(true); else setTab('ai');
  };
  // контекст розділу для панелі: відкрита папка, вибраний набір (План і Налаштування — без контексту)
  const secCtx = (() => {
    if (tab === 'folders' && edDoc) return { k: 'doc', id: edDoc.id, title: edDoc.title, type: edDoc.type, pages: [edDoc.page || 1] };
    if (tab === 'folders' && typeof fview === 'number') { const fo = folders.find(x => x.id === fview); return fo ? { k: 'folder', id: fo.id, title: fo.name } : null; }
    if (tab === 'cards' && deckV && !deckV.isNew) return { k: 'deck', id: deckV.name || '', title: deckV.name || tr("Без набору") };
    return null;
  })();
  const assistant = side => <Assistant side={side} wide={!side && (rc === 'l' || rc === 'xl')} secCtx={side ? secCtx : null} onClose={() => setAiOpen(false)} chats={chats} setChats={setChats} curId={chatCur} setCurId={setChatCur}
    call={callAI} buildState={buildState} apply={applyAI} undo={doUndo} items={items} notes={notes} cards={cards} folders={folders} lastMat={lastMat}
    pending={aiPend} clearPending={() => setAiPend(null)} onReview={() => { setTab('cards'); setDeckV(null); startRev(null); }} onOpenRef={openRef}
    rev={{ n: revQ.list.length, decks: [...new Set(revQ.list.map(c => c.deck || ''))] }} exam={nextExam ? { t: nextExam.t, days: daysTo(nextExam.due, today) } : null} onExamPlan={() => nextExam && planExam(nextExam)}
    on401={() => { setAiOpen(false); setTab('set'); }} />;
  // кнопка «Помічник» у шапці розділу (лише вікно ≥768; на телефоні Помічник — вкладка)
  const aiBtn = <button className={'hd-ai' + (aiOpen ? ' on' : '')} onClick={() => setAiOpen(!aiOpen)} aria-pressed={aiOpen} aria-label={tr("Помічник")} title={tr("Помічник")}>
    <Icon n="ai1" s={20} /><span className="hd-ai-l">{tr("Помічник")}</span></button>;

  // Швидкий ввід: спершу ШІ (mode: parse); якщо ШІ недоступний (немає ключа, 401, 502, офлайн, мережа) —
  // локальний розбір qparse.js і те саме превʼю з позначкою «Розібрано без ШІ — перевірте». Технічні деталі — лише в консоль.
  async function quickAdd() {
    const text = qa.trim();
    if (!text || qaBusy) return;
    setQaBusy(true); setQaMsg(''); setPreview(null);
    const local = why => {
      const a = localParse(text, new Date());
      if (a) setPreview({ actions: [a], reply: '', local: true, why });
      else setQaMsg(tr("Не вдалося розібрати запис. Відкрийте повну форму й заповніть поля."));
    };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { local('offline'); setQaBusy(false); return; }
    try {
      const raw = await callAI({ mode: 'parse', messages: [{ role: 'user', text }], ctx: makeCtx() });
      const { reply, actions } = parseAI(raw);
      if (actions.length) setPreview({ actions, reply });
      else setQaMsg(reply || tr("Не вдалося розібрати. Уточніть дату і час."));
    } catch (e) {
      if (e && e.name === 'AbortError') { setQaBusy(false); return; }
      console.warn('[quick add] ШІ недоступний, локальний розбір:', e && (e.detail || e.message));
      local(e && e.code === 401 ? 'pass' : 'ai');
    }
    setQaBusy(false);
  }
  // превʼю локального розбору → повна форма з підставленими полями (щоб виправити)
  const editPreview = a => {
    if (!a) return;
    const ev2 = a.type === 'add_event';
    sheetPrev.current = sheetPrev.current || document.activeElement;
    setF({ ...EMPTY, kind: ev2 ? 'event' : 'task', t: a.t || '', area: a.area || 'study', h: String(a.h || ''), due: (ev2 ? a.date : a.due) || '', time: ev2 ? a.time || '' : '', repeat: a.repeat || 'none' });
    setPreview(null); setQa(''); setQaMsg(''); setMore(true); setSheet('new');
  };
  const confirmPreview = () => {
    const cur = stRef.current; const res = applyActions(preview.actions, cur);
    if (res.n) { setUndo(cur); applySt(res.st); }
    setPreview(null); setQa('');
  };
  const nm = id => { const i = items.find(x => x.id === Number(id)); return i ? '«' + i.t + '»' : tr("задачу"); };
  const act2text = a => {
    if (a.type === 'add_event') return tr("Подія: ") + a.t + ', ' + (isDate(a.date) ? dm(a.date) : '?') + tr(" о ") + (a.time || '09:00') + (a.repeat && a.repeat !== 'none' ? ', ' + tr(REPS[a.repeat]) : '');
    if (a.type === 'add_task') return tr("Задача: ") + a.t + ', ' + (Number(a.h) > 0 ? a.h : 1) + tr(" год") + (isDate(a.due) ? tr(", до ") + dm(a.due) : '') + (a.repeat && a.repeat !== 'none' ? ', ' + tr(REPS[a.repeat]) : '');
    if (a.type === 'update_task') return tr("Змінити ") + nm(a.id);
    if (a.type === 'complete_task') return tr("Виконано: ") + nm(a.id);
    if (a.type === 'delete_task') return tr("Видалити ") + nm(a.id);
    if (a.type === 'add_exam') return tr("Іспит") + ': ' + a.t + ', ' + (isDate(a.date) ? dm(a.date) : '?') + (isTime(a.time) ? tr(" о ") + a.time : '');
    if (a.type === 'add_note') return tr("Нотатка");
    if (a.type === 'add_cards') return tr("Картки: ") + ((a.cards || []).length);
    return tr("Зміна налаштувань");
  };

  // джерело тесту: тема (як раніше) / текстова нотатка / набір карток (ctx.cards); складність — ctx.level
  async function createTest() {
    if (tbusy) return;
    const n = Number(tcfg.n) || 10, ctx = { n, kind: tcfg.kind, level: tcfg.level };
    let text = '', title = '', images = null, labels = null, docSrc = null;
    if (tcfg.src === 'mat' && selDoc) {
      // зошит / дошка / фото: обрані сторінки (до 4) ідуть зображеннями, як у Помічнику; PDF (до 10) — текстом сторінок
      const pages = (tcfg.pages || []).filter(n => n >= 1 && n <= docPages(selDoc)).slice(0, pageMax(selDoc));
      if (!pages.length) return;
      setTbusy(true); setTmsg('');
      const r = await docMaterial(selDoc.id, pages).catch(() => null);
      if (!r || !r.nums.length) { setTbusy(false); setTmsg(tr("Не вдалося підготувати сторінки. Відкрийте зошит і спробуйте ще раз.")); return; }
      title = String(selDoc.title || tr("Зошит")).slice(0, 40);
      const mo = materialOf(r, title);
      if (mo.images.length) { images = mo.images; labels = mo.labels; }
      ctx.material = mo.material;
      text = tr("Склади тест за цими сторінками") + ': ' + title + ', ' + tr("с.") + ' ' + r.nums.join(', ');
      docSrc = { k: 'doc', id: selDoc.id, title, pages: r.nums };
    }
    else if (tcfg.src === 'mat') { const nt = notes.find(x => String(x.id) === String(tcfg.mat)); if (!nt || !nt.text.trim()) return; text = nt.text.slice(0, 15000); title = nt.text.trim().split('\n')[0].slice(0, 40); }
    else if (tcfg.src === 'deck') { if (tcfg.deck == null) return; const dc = cards.filter(c => (c.deck || '') === tcfg.deck); if (!dc.length) return; ctx.cards = dc.slice(0, 200).map(({ q, a }) => ({ q, a })); title = tcfg.deck || tr("Без набору"); text = tr("Тест за набором карток: ") + title; }
    else { if (!tcfg.topic.trim()) return; text = tcfg.topic; title = tcfg.topic.trim().slice(0, 40); }
    setTbusy(true); setTmsg('');
    try {
      const raw = await callAI({ mode: 'quiz', messages: [{ role: 'user', text, ...(images ? { images, imageLabels: labels } : {}) }], ctx });
      const q = parseQuiz(raw);
      if (!q) throw new Error(tr("ШІ повернув тест у неправильному форматі. Спробуйте ще раз."));
      // src — звідки тест (для «Поясни»: той самий матеріал іде в контекст пояснення; для зошита — ті самі сторінки)
      const src = docSrc || (tcfg.src === 'mat' ? { k: 'note', id: Number(tcfg.mat) } : tcfg.src === 'deck' ? { k: 'deck', id: tcfg.deck } : { k: 'topic', topic: tcfg.topic.trim().slice(0, 200) });
      const t = { id: Date.now(), title: q.title || title, qs: q.questions, ans: {}, grades: {}, done: false, created: Date.now(), src };
      setTests([t, ...tests]); setTview(t.id); setQi(0);
    } catch (e) { setTmsg(e.message); }
    setTbusy(false);
  }
  const patchTest = (id, p) => setTests(tests.map(t => t.id === id ? { ...t, ...p } : t));
  const setAns = (t, i, v) => patchTest(t.id, { ans: { ...t.ans, [i]: v } });
  async function gradeOpen(t) {
    if (tbusy) return;
    const list = t.qs.map((q, i) => ({ i, q: q.q, ref: q.answer, user: t.ans[i] || '' })).filter((x, j) => t.qs[j].type === 'open' && x.user.trim() && !(t.grades && t.grades[x.i]));
    if (!list.length) return;
    setTbusy(true); setTmsg('');
    try {
      const raw = await callAI({ mode: 'grade', messages: [{ role: 'user', text: JSON.stringify(list) }], ctx: {} });
      const o = JSON.parse(clean(raw)); const g = { ...(t.grades || {}) };
      (o.grades || []).forEach(x => { const i = Number(x.i); if (t.qs[i]) g[i] = { score: Math.min(1, Math.max(0, Number(x.score) || 0)), comment: String(x.comment || '') }; });
      patchTest(t.id, { grades: g });
    } catch (e) { setTmsg(tr("Не вдалося оцінити відповіді. Спробуйте ще раз.")); }
    setTbusy(false);
  }
  // «Картки з помилок»: спершу превʼю (чекбокси + вибір набору), потім створення з тостом «Скасувати»
  const cardsFromTest = t => {
    const bad = t.qs.map((q, i) => ({ q, i })).filter(({ q, i }) => okOf(t, q, i) !== true);
    if (!bad.length) { setTmsg(tr("Помилок немає, картки не потрібні.")); return; }
    const rows = bad.map(({ q }) => ({ q: q.q, a: (q.type === 'choice' ? q.options[q.answer] : q.answer) + (q.explain ? '\n' + q.explain : ''), on: true }));
    const has = decks.some(d => d.name === t.title);
    setCtp({ tid: t.id, rows, deck: has ? 'd:' + t.title : 'new', draft: has ? '' : t.title });
  };
  const confirmCtp = () => {
    if (!ctp) return;
    const deck = ctp.deck === 'new' ? ctp.draft.trim() : ctp.deck.slice(2);
    const sel = ctp.rows.filter(r => r.on); if (!sel.length || (ctp.deck === 'new' && !deck)) return;
    const t0 = Date.now(), add = sel.map((r, k) => ({ id: t0 + k, deck, q: r.q, a: r.a, seq: t0 + k, ...newCardFields(t0) }));
    const ids = new Set(add.map(x => x.id));
    setCards(cs => [...cs, ...add]); setCtp(null); setTmsg('');
    setToast({ text: tr("Додано") + ' ' + add.length + ' ' + plural(add.length, "картку", "картки", "карток") + ' · ' + deckName(deck), undo: () => setCards(cs => cs.filter(c => !ids.has(c.id))) });
  };
  // «Поясни»: коротке пояснення помилки від ШІ (режим explain), зберігається в тесті (t.expl[i])
  async function explainQ(t, i) {
    const key = t.id + ':' + i; if (xbusy[key] === 'busy') return;
    setXopen(o => ({ ...o, [key]: true })); setXbusy(b => ({ ...b, [key]: 'busy' }));
    const q = t.qs[i];
    const ctx = { q: q.q, correct: q.type === 'choice' ? q.options[q.answer] : q.answer, user: q.type === 'choice' ? (t.ans[i] != null ? q.options[t.ans[i]] : '') : (t.ans[i] || ''), options: q.type === 'choice' ? q.options : undefined, note: q.explain || '', topic: t.src && t.src.k === 'topic' ? t.src.topic : t.title };
    if (t.src && t.src.k === 'note') { const nt = notes.find(x => String(x.id) === String(t.src.id)); if (nt && nt.text.trim()) ctx.material = { kind: 'note', title: noteTitle(nt), text: nt.text.slice(0, 15000) }; }
    if (t.src && t.src.k === 'deck') { const dc = cards.filter(c => (c.deck || '') === t.src.id).slice(0, 200).map(({ q, a }) => ({ q, a })); if (dc.length) ctx.material = { kind: 'deck', title: deckName(t.src.id), cards: dc }; }
    let msg = { role: 'user', text: tr("Поясни мою помилку.") };
    if (t.src && t.src.k === 'doc') {
      // тест із зошита: ті самі сторінки знову йдуть до ШІ (якщо зошит ще існує): зображеннями, а PDF — текстом
      const r = await docMaterial(t.src.id, t.src.pages || [1]).catch(() => null);
      if (r && r.nums.length) { const mo = materialOf(r, t.src.title || r.title); ctx.material = mo.material; if (mo.images.length) msg = { ...msg, images: mo.images, imageLabels: mo.labels }; }
    }
    try {
      const raw = await callAI({ mode: 'explain', messages: [msg], ctx });
      const text = parseAI(raw).reply.trim();
      if (!text) throw new Error('empty');
      setTests(ts => ts.map(x => (x.id === t.id ? { ...x, expl: { ...(x.expl || {}), [i]: text } } : x)));
      setXbusy(b => { const n = { ...b }; delete n[key]; return n; });
    } catch (e) { setXbusy(b => ({ ...b, [key]: e && e.code === 401 ? 'e401' : 'err' })); }
  }

  const exRow = i => (
    <button className="exr" key={'x' + i.id} onClick={() => setExV(i.id)}>
      <span className="exr-i" aria-hidden="true"><Icon n="flag" s={18} /></span>
      <span className="exr-b"><span className="exr-t">{tr("Іспит")}: {i.t}</span><span className="exr-m">{cap1(new Date(i.due + 'T00:00:00').toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short' }))}{i.time ? ', ' + i.time : ''} · {exWhen(i)}</span></span>
      <Icon n="chevR" s={18} />
    </button>);
  // «Усі» на iPad l/xl — список + деталь: рядок вибирає запис замість аркуша правки
  const mdAll = pv === 'all' && win !== 'c' && (rc === 'l' || rc === 'xl');
  const editRow = i => (mdAll ? pickAll(i) : openEdit(i));
  const row = i => isExam(i) ? exRow(i) : (
    <div className={'it' + (i.done ? ' done' : '') + (mdAll && allSel === i.id ? ' it-on' : '')} key={i.id}>
      {isEv(i) ? <span className="evd" /> : <Ck label={i.t} checked={isRep(i) ? (i.doneDates || []).includes(today) : !!i.done} onChange={() => tog(i.id, today)} />}
      <div className="b" role="button" tabIndex={0} aria-current={mdAll && allSel === i.id ? 'true' : undefined} onClick={() => editRow(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editRow(i); } }}><div className="t">{i.t}</div>
        <div className="meta"><span className={'tag ' + i.area}>{tr(AREA[i.area])}</span>
          {isEv(i) ? <span>{i.due && !isRep(i) ? dm(i.due) + ' ' : ''}{i.time}</span> : <span>{i.h} {tr(" год")}</span>}
          {!isEv(i) && !isRep(i) && i.due && <span className={!i.done && i.due < today ? 'late' : ''}>{tr("до ")}{dm(i.due)}</span>}
          {isRep(i) && <span>{tr(REPS[i.repeat])}{isDate(i.until) ? (i.until < today ? ' · ' + tr("завершено") + ' ' + dm(i.until) : ' ' + tr("до ") + dm(i.until)) : ''}</span>}{i.pri === 2 && <span className="late">{tr("Важливо")}</span>}</div>
        {i.note && <div className="note">{i.note}</div>}</div>
    </div>);
  const section = (title, list) => list.length > 0 && <div className="card"><div className="sec">{title}</div>{list.map(row)}</div>;

  const oneOff = items.filter(i => !isEv(i) && !isRep(i));
  const open = openTasks(items); // відкриті разові задачі — те саме визначення, що й у Помічнику (plan.js)
  const byDue = (a, b) => a.due.localeCompare(b.due);
  const overdue = open.filter(i => i.due && i.due < today).sort(byDue);
  const soon = open.filter(i => i.due && i.due >= today).sort(byDue);
  const nodue = open.filter(i => !i.due);
  const doneList = oneOff.filter(i => i.done);
  const upEv = items.filter(i => isEv(i) && !isRep(i) && i.due >= today).sort((a, b) => (a.due + (a.time || '')).localeCompare(b.due + (b.time || '')));
  const repList = items.filter(isRep);
  const exOn = d => items.filter(i => isExam(i) && i.due === d);
  const evOn = d => items.filter(i => isEv(i) && !isExam(i) && occurs(i, d)).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const doneToday = items.filter(i => !isEv(i) && ((i.done && i.doneAt === today) || (i.doneDates || []).includes(today))).length;
  const openH = open.reduce((s, i) => s + i.h, 0);
  const dayPlan = plan.days.find(d => d.date === selDate);
  const doneOnDay = oneOff.filter(i => i.done && i.doneAt === selDate);
  const shiftDay = n => { const d = new Date(selDate + 'T00:00:00'); d.setDate(d.getDate() + n); setSel(ymd(d) === today ? '' : ymd(d)); };
  const dateStr = now.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' });
  const selLabel = new Date(selDate + 'T00:00:00').toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' });
  // Навчання: черга інтервального повторення (srs.js). «До повторення» = due ≤ зараз + нові в межах ліміту на день.
  const newLim = Number.isFinite(Number(ui.newPerDay)) && Number(ui.newPerDay) >= 0 ? Number(ui.newPerDay) : NEW_PER_DAY;
  const nowTs = now.getTime();
  const revQ = srsQueue(cards, { now: nowTs, limit: newLim });
  const addCard = deck => { if (!cq.trim() || !ca.trim()) return false; const id = Date.now(); setCards([...cards, { id, deck, q: cq.trim(), a: ca.trim(), seq: id, ...newCardFields(id) }]); setCq(''); setCa(''); return true; };
  const deckName = d => d || tr("Без набору");
  const decks = (() => {
    const m = new Map();
    for (const c of cards) { const k = c.deck || ''; if (!m.has(k)) m.set(k, { name: k, all: 0, learned: 0, left: 0 }); const o = m.get(k); o.all++; if (isLearned(c)) o.learned++; }
    for (const o of m.values()) o.left = srsQueue(cards, { deck: o.name, now: nowTs, limit: newLim }).list.length;
    return [...m.values()].sort((a, b) => b.left - a.left || deckName(a.name).localeCompare(deckName(b.name), loc()));
  })();
  // «Наступні — завтра (N)»
  const nextStr = nx => {
    if (!nx) return '';
    const d = new Date(nx.ts), t1 = new Date(nowTs); t1.setHours(0, 0, 0, 0); t1.setDate(t1.getDate() + 1);
    const when = nx.sameDay ? tr("сьогодні о") + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : ymd(d) === ymd(t1) ? tr("завтра") : d.toLocaleDateString(loc(), { day: 'numeric', month: 'long' });
    return tr("Наступні —") + ' ' + when + ' (' + nx.n + ')';
  };
  const ivLabel = ms => { const [n, u] = ivParts(ms); const ns = String(n).replace('.', ','); return u === 'min' ? ns + ' ' + tr("хв") : u === 'h' ? ns + ' ' + tr("год") : u === 'd' ? ns + ' ' + plural(n, "день", "дні", "днів") : u === 'mo' ? ns + ' ' + tr("міс.") : ns + ' ' + tr("р."); };
  // Іспити: найближчі (сьогодні й далі)
  const exams = items.filter(i => isExam(i) && i.due >= today).sort((a, b) => (a.due + (a.time || '')).localeCompare(b.due + (b.time || '')));
  const nextExam = exams.find(e => daysTo(e.due, today) <= 30) || null;
  const exWhen = e => { const n = daysTo(e.due, today); return n === 0 ? tr("сьогодні") : n === 1 ? tr("завтра") : n < 0 ? tr("минув") : getLang() === 'de' ? 'in ' + n + (n === 1 ? ' Tag' : ' Tagen') : 'через ' + n + ' ' + plural(n, "день", "дні", "днів"); };
  const planExam = e => {
    const n = daysTo(e.due, today), fo = folders.find(x => x.id === e.folder);
    const text = tr("Склади план підготовки до іспиту") + ' «' + e.t + '» (' + dm(e.due) + (e.time ? ' ' + e.time : '') + ', ' + exWhen(e) + '). ' + tr("Розподіли підготовку по днях до іспиту з урахуванням моїх годин на день і вже запланованих задач; останній день перед іспитом — повторення.");
    setExV(null); toAI({ text, send: true, ctx: fo ? { k: 'folder', id: fo.id, title: fo.name } : null });
  };
  const nCards = n => n + ' ' + plural(n, "картка", "картки", "карток");
  const nQs = n => n + ' ' + plural(n, "питання", "питання", "питань");
  const textNotes = notes.filter(n => n.text && n.text.trim()).sort((a, b) => (b.upd || 0) - (a.upd || 0));
  const noteTitle = n => n.text.trim().split('\n')[0].slice(0, 50);
  const selNote = textNotes.find(n => String(n.id) === String(tcfg.mat));
  // «З матеріалу»: текстова нотатка (mat = id) або зошит / дошка / фото (mat = 'd:' + id, pages — до 4 сторінок)
  const pageDocs = [...docMeta].sort((a, b) => (b.upd || 0) - (a.upd || 0));
  const docPages = d => Math.max(1, Number(d && d.pageCount) || 1);
  const pageMax = d => (d && d.type === 'pdf' ? TEXT_PAGES : 4); // PDF іде текстом — сторінок можна більше
  const selDoc = String(tcfg.mat || '').startsWith('d:') ? pageDocs.find(d => 'd:' + d.id === tcfg.mat) || null : null;
  const selPages = selDoc ? (tcfg.pages || []).filter(n => n >= 1 && n <= docPages(selDoc)) : [];
  const hasMats = textNotes.length > 0 || pageDocs.length > 0;
  const srcReady = tcfg.src === 'mat' ? (selDoc ? selPages.length > 0 : !!selNote) :tcfg.src === 'deck' ? tcfg.deck != null && decks.some(d => d.name === tcfg.deck) : !!tcfg.topic.trim();
  const startRev = (deck, mode = 'srs') => { setRev({ deck, mode, i: 0, n: 0 }); setShow(false); };
  const newDeck = () => { setDeckV({ name: '', isNew: true, draft: '' }); setCq(''); setCa(''); setCed(null); setDkDel(false); };
  const openDeck = name => { setDeckV({ name }); setCq(''); setCa(''); setCed(null); setDkDel(false); };

  const cm = calM == null ? now.getFullYear() * 12 + now.getMonth() : calM;
  const cy = Math.floor(cm / 12), cmo = cm % 12;
  const offset = (new Date(cy, cmo, 1).getDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...Array.from({ length: new Date(cy, cmo + 1, 0).getDate() }, (_, k) => cy + '-' + pad(cmo + 1) + '-' + pad(k + 1))];
  const planDays = {}; plan.days.forEach(d => { if (d.blocks.length) planDays[d.date] = true; });
  const hasDot = d => planDays[d] || evOn(d).length > 0 || open.some(i => i.due === d);
  const hasEx = d => exOn(d).length > 0;
  // Місяць на iPad: скільки назв уміщається в клітинку за класом області (s — крапки, як на телефоні)
  const wideCal = win !== 'c';
  const mCnt = rc === 'xl' ? 3 : rc === 'l' ? 2 : rc === 'm' ? 1 : 0;
  // задачі дня: разові з терміном цього дня + повторювані, що припадають на нього
  const dayTasksOn = d => items.filter(i => !isEv(i) && (isRep(i) ? occurs(i, d) : i.due === d)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  const dayEntries = d => [
    ...exOn(d).map(e => ({ k: 'exam', id: 'x' + e.id, t: e.t, time: e.time || '' })),
    ...evOn(d).map(e => ({ k: 'ev', id: 'e' + e.id, t: e.t, time: e.time || '', area: e.area })),
    ...dayTasksOn(d).filter(i => !(isRep(i) ? (i.doneDates || []).includes(d) : i.done)).map(i => ({ k: 'task', id: 't' + i.id, t: i.t, area: i.area }))
  ];
  const monthRaw = new Date(cy, cmo, 1).toLocaleDateString(loc(), { month: 'long', year: 'numeric' });
  const monthName = monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1); // «Листопад 2026 р.»: велика лише перша літера
  const tt = tests.find(t => t.id === tview);
  const ev = f.kind === 'event';
  const exm = f.kind === 'exam';

  // ===== План · День: шкала часу та «Ще на сьогодні» (лише подання, дані й планувальник не змінюються) =====
  const addD = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
  const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
  const isToday = selDate === today;
  const selObj = new Date(selDate + 'T00:00:00');
  const relDay = isToday ? tr("Сьогодні") : selDate === addD(today, 1) ? tr("Завтра") : selDate === addD(today, -1) ? tr("Вчора") : '';
  const dayTitle = relDay || selObj.toLocaleDateString(loc(), { day: 'numeric', month: 'long' });
  const dayShort = cap1(selObj.toLocaleDateString(loc(), { weekday: 'long' })) + ' · ' + dm(selDate);
  const timedTasks = items.filter(i => !isEv(i) && isTime(i.time) && (isRep(i) ? occurs(i, selDate) : i.due === selDate));
  const timedIds = new Set(timedTasks.map(i => i.id));
  const tlRaw = [
    ...exOn(selDate).filter(e => isTime(e.time)).map(e => { const s = toMin(e.time); return { kind: 'exam', id: e.id, t: e.t, area: 'study', s, e: Math.min(24 * 60, s + Math.max(15, Math.round((Number(e.h) || 2) * 60))) }; }),
    ...evOn(selDate).map(e => { const s = toMin(isTime(e.time) ? e.time : '09:00'); return { kind: 'event', id: e.id, t: e.t, area: e.area, rep: isRep(e), s, e: Math.min(24 * 60, s + Math.max(15, Math.round((Number(e.h) || 1) * 60))) }; }),
    ...timedTasks.map(i => { const s = toMin(i.time); return { kind: 'task', id: i.id, t: i.t, area: i.area, rep: isRep(i), done: isRep(i) ? (i.doneDates || []).includes(selDate) : !!i.done, s, e: Math.min(24 * 60, s + Math.max(15, Math.round((Number(i.h) || 1) * 60))) }; })
  ].sort((a, b) => a.s - b.s || b.e - a.e);
  // перекриття: блоки, що накладаються в часі, ділять ширину на колонки (візуальний мінімум блоку ≈ 40 хв через висоту 44px)
  const tlItems = (() => {
    const out = []; let grp = [], cols = [], maxE = -1;
    const flush = () => { grp.forEach(x => { x.n = cols.length; }); grp = []; cols = []; };
    for (const b of tlRaw) {
      const ve = Math.max(b.e, b.s + 40);
      if (b.s >= maxE) { flush(); maxE = -1; }
      let c = cols.findIndex(end => end <= b.s);
      if (c < 0) { c = cols.length; cols.push(ve); } else cols[c] = ve;
      const o = { ...b, col: c }; grp.push(o); out.push(o); maxE = Math.max(maxE, ve);
    }
    flush(); return out;
  })();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // для сьогодні шкала містить поточну годину (з 6:00 до 24:00), щоб лінія «зараз» була видна; уночі шкала не розтягується
  const tlH0 = Math.max(0, Math.min(start, ...(isToday && now.getHours() >= 6 ? [now.getHours()] : []), ...tlItems.map(b => Math.floor(b.s / 60))));
  const tlH1 = Math.min(24, Math.max(22, tlH0 + 1, ...(isToday ? [now.getHours() + 1] : []), ...tlItems.map(b => Math.ceil(b.e / 60))));
  const showNow = isToday && nowMin >= tlH0 * 60 && nowMin <= tlH1 * 60;
  const hhPos = m => 'calc(var(--hh) * ' + ((m - tlH0 * 60) / 60).toFixed(4) + ')';
  const moreList = [
    ...(dayPlan ? dayPlan.blocks : []).filter(b => !timedIds.has(b.id)).map(b => { const it = items.find(x => x.id === b.id) || {}; return { id: b.id, t: b.t, h: b.h, area: b.area, rep: !!b.rep, repeat: it.repeat, done: !!b.done, pri: it.pri || 1, due: it.due || '' }; }),
    ...oneOff.filter(i => i.done && i.doneAt === selDate && !timedIds.has(i.id)).map(i => ({ id: i.id, t: i.t, h: i.h, area: i.area, rep: false, done: true, pri: i.pri || 1, due: i.due || '' }))
  ];
  const moreH = moreList.filter(x => !x.done).reduce((s, x) => s + (Number(x.h) || 0), 0);
  // «Не вміщується в план» (без прострочених: вони окремо в «Прострочено», щоб задача не стояла двічі)
  const lateList = isToday ? plan.late.filter(l => !l.overdue).map(l => ({ ...l, it: items.find(x => x.id === l.id) })).filter(l => l.it) : [];
  // «Виконано X з Y»: усі задачі (не події), показані на екрані дня, — одна функція dayCount (plan.js)
  const dayTasks = [...tlItems.filter(b => b.kind === 'task'), ...moreList, ...(isToday ? [...overdue, ...lateList.map(l => l.it)] : [])];
  const { done: dayDone, total: dayTotal } = dayCount(dayTasks);
  const dayExNT = exOn(selDate).filter(e => !isTime(e.time)); // іспити без часу — картка над шкалою
  const dayEmpty = !tlItems.length && !moreList.length && !dayExNT.length && !(isToday && (overdue.length || lateList.length));
  // варіант B: ємність дня мінус зайнятий подіями час
  const dayFree = dayPlan ? { base: dayPlan.base, busy: dayPlan.busy, free: dayPlan.cap } : null;
  const MORE_N = 3; // на телефоні й iPad-портреті «Ще на сьогодні» згорнуто до 3 рядків
  const moreClip = !moreAll && moreList.length > MORE_N + 1;
  const moreMeta = x => [r1(Number(x.h) || 0) + tr(" год"), x.pri === 2 ? tr("важлива") : '', x.rep && x.repeat ? tr(REPS[x.repeat]) : '', !x.rep && x.due && x.due !== selDate ? tr("до ") + dm(x.due) : ''].filter(Boolean).join(' · ');

  // ===== План · Усі: групи за датою =====
  const tomorrow = addD(today, 1);
  const weekEnd = addD(today, 6 - (now.getDay() + 6) % 7);
  const byWhen = (a, b) => ((a.due || '') + (a.time || '')).localeCompare((b.due || '') + (b.time || ''));
  const recs = [...open, ...items.filter(i => isEv(i) && !isExam(i) && !isRep(i) && i.due >= today)].sort(byWhen);
  const allGroups = [
    [tr("Іспити"), exams],
    [tr("Прострочені"), recs.filter(i => i.due && i.due < today), true],
    [tr("Сьогодні"), recs.filter(i => i.due === today)],
    [tr("Завтра"), recs.filter(i => i.due === tomorrow)],
    [tr("Цей тиждень"), recs.filter(i => i.due > tomorrow && i.due <= weekEnd)],
    [tr("Пізніше"), recs.filter(i => i.due > weekEnd && i.due > tomorrow)],
    [tr("Без дати"), recs.filter(i => !i.due)],
    [tr("Повторювані"), repList]
  ];
  const doneSorted = [...doneList].sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));

  // ===== Форма запису на iPad (вікно ≥768): видимі підписи «підпис зліва 160 — поле справа» (ipad-layout-spec 10, I19) =====
  // fv/setFv — стан форми (аркуш: f; деталь «Усі»: af). Телефон використовує колишню форму без змін.
  const formRows = (fv, setFv, idp, focus) => {
    const fe = fv.kind === 'event', fx = fv.kind === 'exam', set = p => setFv({ ...fv, ...p });
    const d0 = fv.due || selDate, badU = fv.repeat !== 'none' && isDate(fv.until) && fv.until < d0;
    const R = (id, label, field, hint) => <div className="frow" key={id}><label className="frow-l" htmlFor={idp + id}>{label}</label><div className="frow-f">{field}{hint}</div></div>;
    return <div className="fform">
      <div className="frow"><span className="frow-l" id={idp + 'kind'}>{tr("Тип")}</span><div className="frow-f"><div className="seg" role="group" aria-labelledby={idp + 'kind'}>
        {[['task', tr("Задача")], ['event', tr("Подія")], ['exam', tr("Іспит")]].map(([k, n]) => <button key={k} className={fv.kind === k ? 'on' : ''} aria-pressed={fv.kind === k} onClick={() => set({ kind: k })}>{n}</button>)}</div></div></div>
      {R('t', fx ? tr("Предмет") : tr("Назва"), <input id={idp + 't'} autoFocus={focus} placeholder={fx ? tr("Наприклад: Анатомія") : fe ? tr("Наприклад: стоматолог") : tr("Що потрібно зробити або вивчити")} value={fv.t} onChange={e => set({ t: e.target.value })} />)}
      {!fx && R('area', tr("Категорія"), <select id={idp + 'area'} value={fv.area} onChange={e => set({ area: e.target.value })}>{Object.entries(AREA).map(([k, v]) => <option key={k} value={k}>{tr(v)}</option>)}</select>)}
      {R('due', tr("Дата"), <input id={idp + 'due'} type="date" value={fv.due} onChange={e => set({ due: e.target.value })} />, fx && !isDate(fv.due) ? <p className="hint">{tr("Вкажіть дату іспиту.")}</p> : null)}
      {R('time', fe ? tr("Час") : tr("Час (необов’язково)"), <input id={idp + 'time'} type="time" value={fv.time} onChange={e => set({ time: e.target.value })} />)}
      {!fx && R('h', fe ? tr("Тривалість") : tr("Потрібно часу"), <span className="fsuf"><input id={idp + 'h'} type="number" min="0.5" step="0.5" value={fv.h} onChange={e => set({ h: e.target.value })} /><span>{tr(" год").trim()}</span></span>)}
      {!fe && !fx && R('pri', tr("Важливість"), <select id={idp + 'pri'} value={fv.pri} onChange={e => set({ pri: e.target.value })}><option value={1}>{tr("Звичайна")}</option><option value={2}>{tr("Важлива")}</option></select>)}
      {!fx && R('rep', tr("Повтор"), <select id={idp + 'rep'} value={fv.repeat} onChange={e => set({ repeat: e.target.value })}>{Object.entries(REP).map(([k, v]) => <option key={k} value={k}>{tr(v)}</option>)}</select>)}
      {!fx && fv.repeat !== 'none' && R('until', tr("До дати"), <input id={idp + 'until'} type="date" min={d0} value={fv.until || ''} onChange={e => set({ until: e.target.value })} aria-describedby={idp + 'until-h'} aria-invalid={badU || undefined} />,
        <p className={'hint' + (badU ? ' err' : '')} id={idp + 'until-h'}>{badU ? tr("Дата закінчення раніше за початок повтору.") : tr("Після цієї дати запис не показується й не планується.")}</p>)}
      {folders.length > 0 && R('fold', tr("Папка"), <select id={idp + 'fold'} value={fv.folder} onChange={e => set({ folder: e.target.value })}><option value="">{tr("Без папки")}</option>{folders.map(fo => <option key={fo.id} value={fo.id}>{folderPath(folders, fo.id)}</option>)}</select>)}
      {R('note', tr("Нотатка"), <textarea id={idp + 'note'} rows={2} placeholder={fx ? tr("Наприклад: аудиторія, що взяти з собою") : tr("Необов’язково")} value={fv.note} onChange={e => set({ note: e.target.value })} />)}
    </div>;
  };
  // шапка форми на iPad: «Скасувати — заголовок — Готово» (I15): основна дія завжди над клавіатурою
  const formHead = (id, title, onCancel, doneLabel, onDone, canDone) => <div className="fhd">
    <button className="fhd-b" onClick={onCancel}>{tr("Скасувати")}</button>
    <h2 id={id}>{title}</h2>
    <button className="fhd-b pri" onClick={onDone} disabled={!canDone}>{doneLabel}</button></div>;

  // ===== шапка Плану: заголовок, перемикач видів, навігація датами =====
  const curMonth = now.getFullYear() * 12 + now.getMonth();
  const planHead = (
    <header className="ph">
      <div className="ph-t">
        {pv === 'day' && <><span className="date"><span className="phone-only">{dayShort}</span><span className="wide-only">{selObj.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })}</span></span><h1>{dayTitle}</h1></>}
        {pv === 'month' && <><span className="date">{tr("План")}</span><h1>{monthName}</h1></>}
        {pv === 'all' && <><span className="date">{tr("Відкритих задач: ")}{open.length}</span><h1>{tr("Усі задачі")}</h1></>}
      </div>
      <div className="views">
        <div role="group" aria-label={tr("Вид плану")} style={{ display: 'flex', gap: 8 }}>
          {VIEWS.map(([k, n]) => <button key={k} className="pill" aria-pressed={pv === k} onClick={() => setPlanView(k)}>{tr(n)}</button>)}
        </div>
        {pv === 'day' && dayTotal > 0 && <span className="sum phone-only">{tr("Виконано")} {dayDone}{tr(" з ")}{dayTotal}</span>}
        {pv === 'day' && <div className="dnav">
          <button className="ibtn" onClick={() => shiftDay(-1)} aria-label={tr("Попередній день")} title={tr("Попередній день")}><Icon n="chevL" s={20} /></button>
          {!isToday && <button className="pill today" onClick={() => setSel('')}>{tr("Сьогодні")}</button>}
          <button className="ibtn" onClick={() => shiftDay(1)} aria-label={tr("Наступний день")} title={tr("Наступний день")}><Icon n="chevR" s={20} /></button>
        </div>}
        {pv === 'month' && <div className="dnav">
          <button className="ibtn" onClick={() => setCalM(cm - 1)} aria-label={tr("Попередній місяць")} title={tr("Попередній місяць")}><Icon n="chevL" s={20} /></button>
          {cm !== curMonth && <button className="pill today" onClick={() => { setCalM(null); }}>{tr("Сьогодні")}</button>}
          <button className="ibtn" onClick={() => setCalM(cm + 1)} aria-label={tr("Наступний місяць")} title={tr("Наступний місяць")}><Icon n="chevR" s={20} /></button>
        </div>}
      </div>
      {aiBtn}
    </header>);

  // local: розібрано без ШІ (qparse.js) — та сама картка з позначкою й кнопкою «Змінити» (повна форма з підставленими полями)
  const previewCard = inSheet => preview && (
    <div className={'card qpv' + (preview.local ? ' local' : '')} role="region" aria-labelledby={'qpv-t' + (inSheet ? 's' : '')}>
      {preview.local && <p className="qpv-why" role="status">{preview.why === 'pass' ? tr("ШІ недоступний без пароля. Запис розібрано без нього.") : preview.why === 'offline' ? tr("Немає інтернету. Запис розібрано без ШІ.") : tr("ШІ зараз недоступний. Запис розібрано без нього.")}</p>}
      <div className="sec" id={'qpv-t' + (inSheet ? 's' : '')}>{preview.local ? tr("Розібрано без ШІ — перевірте") : tr("Додати це?")}</div>
      {preview.actions.map((a, i) => <div className="blk" key={i}><span>{act2text(a)}{preview.local ? ' · ' + tr(AREA[normArea(a.area)]) : ''}</span></div>)}{preview.reply && <div className="sub" style={{ marginTop: 8 }}>{preview.reply}</div>}
      <div className="row"><button className="btn" onClick={() => { confirmPreview(); if (inSheet) closeSheet(); }}>{tr("Додати")}</button>
        {preview.local && <button className="btn alt" onClick={() => editPreview(preview.actions[0])}>{tr("Змінити")}</button>}
        <button className="btn alt" onClick={() => setPreview(null)}>{tr("Скасувати")}</button></div></div>);
  const quickInput = (id, inSheet) => (
    <div className={'qrow' + (inSheet ? '' : ' wide-only')}>
      <div className="qbar">
        <label className="vh" htmlFor={id}>{tr("Швидко додати")}</label>
        <input id={id} autoFocus={inSheet && !more} placeholder={tr("Швидко додати: стоматолог у пʼятницю о 13:00")} value={qa} onChange={e => setQa(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); quickAdd(); } }} />
        <button className="qgo" disabled={qaBusy} onClick={() => { if (qa.trim()) quickAdd(); else if (inSheet) setMore(true); else openNew(true); }}>{qaBusy ? '…' : tr("Додати")}</button>
      </div>
      {/* iPad: видимий шлях до повної форми (задача / подія / іспит) замість прихованого «Додати» при порожньому рядку */}
      {!inSheet && <button className="btn2 qfull" onClick={() => openNew(true)} title={tr("Нова задача, подія або іспит")} aria-label={tr("Новий запис: задача, подія або іспит")}><Icon n="plus" s={18} />{tr("Запис")}</button>}
    </div>);
  // «Перенести»: задача з «Прострочено» або «Не вміщується в план» отримує новий термін; тост із «Скасувати»
  const moveTask = (id, date) => {
    if (!isDate(date)) return;
    const prev = items.find(i => i.id === id); if (!prev) return;
    const old = prev.due || '';
    setItems(its => its.map(i => (i.id === id ? { ...i, due: date } : i))); setMvId(null);
    setToast({ text: tr("Перенесено на") + ' ' + dm(date), undo: () => setItems(its => its.map(i => (i.id === id ? { ...i, due: old } : i))) });
  };
  const lateRow = (i, left) => {
    const nextD = !i.due || i.due <= today ? addD(today, 1) : addD(i.due, 1);
    const op = mvId && mvId.id === i.id, pid = 'mv-' + i.id;
    return <div className="lr" key={'l' + i.id}>
      <div className={'it' + (i.done ? ' done' : '')}>
        <Ck label={i.t} checked={!!i.done} onChange={() => tog(i.id, today)} />
        <button className="b lr-b" onClick={() => openEdit(i)}><span className="t">{i.t}</span>
          <span className="meta">{left != null ? <span>{tr("бракує")} ≈ {r1(left)} {tr(" год")}</span> : <span>{i.h} {tr(" год")}</span>}{i.due && <span className={i.due < today ? 'late' : ''}>{tr("до ")}{dm(i.due)}</span>}</span></button>
        <button className="btn2 sm lr-mv" aria-expanded={!!op} aria-controls={pid} onClick={() => setMvId(op ? null : { id: i.id, d: '' })}>{tr("Перенести")}</button>
      </div>
      {op && <div className="mvp" id={pid} role="group" aria-label={tr("Перенести") + ' «' + i.t + '»'}>
        <button className="btn2 sm" autoFocus onClick={() => moveTask(i.id, nextD)}>{nextD === addD(today, 1) ? tr("На завтра") : tr("На") + ' ' + dm(nextD)}</button>
        <label className="vh" htmlFor={pid + '-d'}>{tr("Інша дата")}</label>
        <input id={pid + '-d'} type="date" min={addD(today, 1)} value={mvId.d} onChange={e => setMvId({ ...mvId, d: e.target.value })} />
        <button className="btn2 sm" disabled={!isDate(mvId.d)} onClick={() => moveTask(i.id, mvId.d)}>{tr("Перенести на дату")}</button>
      </div>}
    </div>;
  };

  // ===== резервна копія =====
  const bkState = () => ({ items, cap, start, cards, notes, tests, folders, chats: chats.slice(0, 50), chatCur, aiLast: lastMat, ui });
  const saveBackup = async () => {
    if (bkBusy) return;
    setBkBusy(true);
    try {
      const r = await buildBackup(bkState());
      downloadBlob(r.blob, backupName());
      const m = { last: Date.now(), size: r.size }; setBkMeta(m); setBkm(b => ({ ...b, ...m }));
      setToast({ text: tr("Копію збережено") + ' · ' + (r.size > 1048576 ? r1(r.size / 1048576) + ' MB' : Math.max(1, Math.round(r.size / 1024)) + ' KB') });
    } catch (e) { console.error('[backup]', e); setToast({ text: tr("Не вдалося зберегти копію. Спробуйте ще раз.") }); }
    setBkBusy(false);
  };
  const pickBackup = async file => {
    if (!file) return;
    if (!sheetPrev.current) sheetPrev.current = document.activeElement;
    setBk({ step: 'busy' });
    try {
      const text = await file.text();
      const r = inspectBackup(text);
      if (!r.ok) { setBk({ step: 'error', msg: r.err === 'version' ? tr("Копію створено новішою версією застосунку. Оновіть застосунок і спробуйте ще раз.") : tr("Це не файл резервної копії Помічника.") }); return; }
      setBk({ step: 'preview', info: r, mode: 'merge', name: file.name });
    } catch (e) { console.error('[restore]', e); setBk({ step: 'error', msg: tr("Не вдалося прочитати файл.") }); }
  };
  const doRestore = async () => {
    if (!bk || !bk.info) return;
    const mode = bk.mode; setBk({ ...bk, step: 'busy' });
    try {
      const cur = { ...bkState(), chats };
      const { state: ns, added } = await applyBackup(bk.info.data, mode, cur);
      setItems(ns.items); setCards(ns.cards); setNotes(ns.notes); setTests(ns.tests); setFolders((ns.folders || []).map(f => ({ parent: '', ...f }))); setChats(ns.chats);
      if (mode === 'replace') { if (Array.isArray(ns.cap)) setCap(ns.cap); if (ns.start != null) setStart(ns.start); setChatCur(ns.chatCur || null); setLastMat(ns.aiLast || null); if (ns.ui) setUi({ ...UI0, ...ns.ui }); }
      setUndo(null); setDocUndo([]);
      setBk({ step: 'done', mode, added });
    } catch (e) { console.error('[restore]', e); setBk({ step: 'error', msg: tr("Не вдалося відновити дані. Частину даних могло бути змінено — перевірте їх.") }); }
  };
  const closeBk = () => { setBk(null); const p = sheetPrev.current; sheetPrev.current = null; if (p && document.contains(p)) setTimeout(() => p.focus(), 30); };
  const hasData = items.length + notes.length + cards.length + docMeta.length > 0;
  const BK_EVERY = 7 * 864e5; // банер — якщо копії не було 7 днів; «Пізніше» ховає його на 7 днів
  const showBk = !sy.on && hasData && (!bkm.last || nowTs - bkm.last > BK_EVERY) && (!bkm.snooze || nowTs > bkm.snooze);
  const bkLater = () => { const m = { snooze: Date.now() + BK_EVERY }; setBkMeta(m); setBkm(b => ({ ...b, ...m })); };
  const bkWhen = bkm.last ? new Date(bkm.last).toLocaleString(loc(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  const syncCls = sy.state === 'error' ? ' err' : sy.on ? ' ok' : '';
  const syncTxt = sy.state === 'error' ? tr("Помилка синхронізації") : sy.on ? tr("Синхронізацію ввімкнено") : tr("Синхронізацію вимкнено");
  const acc = activeAccount();
  const meLetter = (acc && acc.name ? String(acc.name).trim().charAt(0).toUpperCase() : '') || tr("Я");

  return (
    <div className={'wrap' + (tab === 'ai' ? ' t-ai' : '')}>
      <button className={'me' + syncCls + (tab === 'set' ? ' cur' : '')} onClick={() => setTab('set')} aria-label={tr("Налаштування") + '. ' + syncTxt} title={tr("Налаштування") + ' · ' + syncTxt} aria-current={tab === 'set' ? 'page' : undefined}>{meLetter}<i aria-hidden="true" /></button>

      {/* .region — область контенту між рейкою і панеллю Помічника: контейнер @container region (ipad-layout-spec 1.2, 3).
          Усе position:fixed (аркуші, шари .nv, FAB, тост, рейка) — поза нею. */}
      <div className="region" ref={regRef}><div className="reg-in">
      {tab === 'today' && <>
        {planHead}
        {nextExam && <button className={'exb' + (daysTo(nextExam.due, today) <= 7 ? ' soon' : '')} onClick={() => setExV(nextExam.id)}>
          <span className="exb-i" aria-hidden="true"><Icon n="flag" s={18} /></span>
          <span className="exb-t">{tr("Іспит")}: <b>{nextExam.t}</b> · {exWhen(nextExam)}</span>
          <span className="exb-a">{tr("Деталі")}<Icon n="chevR" s={16} /></span>
        </button>}
        {quickInput('qa-main', false)}
        {!sheet && (qaMsg || preview) && <div className="wide-only">{qaMsg && <div className="sub qmsg" role="status">{qaMsg}</div>}{previewCard(false)}</div>}
        {showBk && <section className="bkb" aria-labelledby="bkb-t">
          <div className="bkb-b"><h2 className="bkb-t" id="bkb-t">{tr("Дані зберігаються лише на цьому пристрої")}</h2>
            <p className="bkb-s">{bkm.last ? tr("Остання копія") + ': ' + bkWhen + '. ' : ''}{tr("Збережіть резервну копію — з цього файлу можна все відновити.")}</p></div>
          <div className="bkb-a"><button className="btn-a sm" onClick={saveBackup} disabled={bkBusy}>{bkBusy ? tr("Зберігаю…") : tr("Зберегти копію")}</button><button className="btn2 sm" onClick={bkLater}>{tr("Пізніше")}</button></div>
        </section>}

        {pv === 'day' && <>
          {dayTotal > 0 && <p className="sum wide-only">{tr("Виконано")} {dayDone}{tr(" з ")}{dayTotal}{moreH > 0 ? ' · ' + tr("ще ≈") + ' ' + r1(moreH) + tr(" год") : ''}</p>}
          {dayFree && selDate >= today && (dayFree.base > 0 || dayFree.busy > 0) && <p className="capl">
            <span>{tr("Вільно для навчання")}: <b>≈ {r1(dayFree.free)} {tr(" год")}</b></span>
            {dayFree.busy > 0 && <span className="capl-s">{r1(dayFree.base)} {tr(" год")} {tr("мінус події")} {r1(dayFree.busy)} {tr(" год")}</span>}
          </p>}
          {isToday && revQ.list.length > 0 && <button className="rvb" onClick={() => startRev(null)}>
            <span className="rvb-i" aria-hidden="true"><Icon n="cards" s={18} /></span>
            <span className="rvb-t">{tr("Повторити")} <b>{revQ.list.length} {plural(revQ.list.length, "картку", "картки", "карток")}</b></span>
            <span className="rvb-a">{tr("Почати")}<Icon n="chevR" s={16} /></span>
          </button>}
          {dayExNT.map(exRow)}
          {(() => {
            const side = moreList.length > 0 || (isToday && overdue.length > 0) || lateList.length > 0;
            return <div className={'dayg' + (side ? ' two' : '')}>
              {side && <div className="dside">
                {moreList.length > 0 && <section className="more-day" aria-labelledby="more-title">
                  <div className="mh"><h2 className="mh-t" id="more-title">{isToday ? tr("Ще на сьогодні") : tr("Ще на цей день")}</h2>{moreH > 0 && <small>≈ {r1(moreH)} {tr(" год")}</small>}</div>
                  <div className={'mlist' + (moreClip ? ' clip' : '')} id="more-list">{moreList.map((x, k) => (
                    <div key={'m' + x.id} className={'mi' + (x.done ? ' done' : '') + (k >= MORE_N ? ' mx' : '')}>
                      <Ck checked={x.done} onChange={() => tog(x.id, selDate)} label={x.t} />
                      <button className="mbtn" onClick={() => openEdit(items.find(i => i.id === x.id))}><span className="mt">{x.t}</span><span className={'mm' + (x.pri === 2 && !x.done ? ' imp' : '')}>{moreMeta(x)}</span></button>
                    </div>))}</div>
                  {moreList.length > MORE_N + 1 && <button className="lnk mall" aria-expanded={!moreClip} aria-controls="more-list" onClick={() => setMoreAll(!moreAll)}>{moreClip ? tr("Показати всі") + ' (' + moreList.length + ')' : tr("Згорнути")}</button>}
                </section>}
                {isToday && overdue.length > 0 && <section className="card warn" aria-labelledby="ovd-t"><h2 className="sec" id="ovd-t">{tr("Прострочено")}</h2>{overdue.map(i => lateRow(i, null))}</section>}
                {lateList.length > 0 && <section className="card amber" aria-labelledby="late-t"><h2 className="sec" id="late-t">{tr("Не вміщується в план")}</h2>
                  <p className="hint late-h">{tr("Годин до терміну не вистачає. Перенесіть термін або позначте виконаним.")}</p>
                  {lateList.map(l => lateRow(l.it, l.left))}</section>}
              </div>}
              <div className="daymain">
                {dayEmpty
                  ? <div className="emptyday"><p>{selDate < today ? tr("Минулий день.") : tr("На цей день нічого немає.")}</p>
                    {selDate >= today && <button className="btn2" onClick={() => toAI({ text: tr("Що мені краще зробити сьогодні і в якому порядку?"), send: true })}>{tr("Скласти план із ШІ")}</button>}</div>
                  : tlItems.length > 0 && <section className="tl" aria-label={tr("Шкала дня")} style={{ height: 'calc(var(--hh) * ' + (tlH1 - tlH0) + ' + 8px)' }}>
                    {Array.from({ length: tlH1 - tlH0 + 1 }, (_, k) => <span key={k} className="tl-h" aria-hidden="true" style={{ top: 'calc(var(--hh) * ' + k + ')' }}>{pad((tlH0 + k) % 24 === 0 && k > 0 ? 24 : tlH0 + k)}:00</span>)}
                    <div className="tl-g" aria-hidden="true" style={{ height: 'calc(var(--hh) * ' + (tlH1 - tlH0) + ' + 1px)' }} />
                    {tlItems.map(b => {
                      const st = { top: hhPos(b.s), height: 'max(44px, calc(var(--hh) * ' + ((b.e - b.s) / 60).toFixed(4) + ' - 4px))', left: 'calc(var(--tlx) + (100% - var(--tlx)) * ' + (b.col / b.n).toFixed(4) + ')', width: 'calc((100% - var(--tlx)) / ' + b.n + (b.n > 1 ? ' - 4px' : '') + ')' };
                      const when = hm(b.s) + '–' + (b.e >= 1440 ? '24:00' : hm(b.e));
                      const it = items.find(i => i.id === b.id);
                      const ar = normArea(b.area);
                      const short = b.e - b.s < 50;
                      if (b.kind === 'exam') return <button key={'x' + b.id} className={'tlb ev ex' + (short ? ' short' : '')} style={st} onClick={() => setExV(b.id)}><span className="tlt"><Icon n="flag" s={14} /> {tr("Іспит")}: {b.t}</span><span className="tls">{when}</span></button>;
                      return b.kind === 'event'
                        ? <button key={'e' + b.id} className={'tlb ev c-' + ar + (short ? ' short' : '')} style={st} onClick={() => openEdit(it)}><span className="tlt">{b.t}</span><span className="tls">{when} · {tr(AREA[ar])}{b.rep ? tr(", повтор") : ''}</span></button>
                        : <div key={'t' + b.id} className={'tlb tk c-' + ar + (b.done ? ' done' : '') + (short ? ' short' : '')} style={st}><Ck checked={!!b.done} onChange={() => tog(b.id, selDate)} label={b.t} /><button className="tlbtn" onClick={() => openEdit(it)}><span className="tlt">{b.t}</span><span className="tls">{when}</span></button></div>;
                    })}
                    {showNow && <div className="now" style={{ top: hhPos(nowMin) }}><span className="vh">{tr("Зараз")} {hm(nowMin)}</span></div>}
                  </section>}
              </div>
            </div>;
          })()}
        </>}

        {pv === 'month' && !wideCal && <div className="monthv">
          <div className="cal">
            {[tr("Пн"), tr("Вт"), tr("Ср"), tr("Чт"), tr("Пт"), tr("Сб"), tr("Нд")].map(w => <div className="cw" key={w} aria-hidden="true">{w}</div>)}
            {cells.map((d, i) => d
              ? <button key={i} className={'cd' + (d === today ? ' td' : '') + (d === selDate && d !== today ? ' sel' : '') + (hasEx(d) ? ' ex' : '')} aria-current={d === today ? 'date' : undefined}
                  aria-label={new Date(d + 'T00:00:00').toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' }) + (hasEx(d) ? ', ' + tr("іспит") + ': ' + exOn(d).map(e => e.t).join(', ') : '') + (hasDot(d) ? ', ' + tr("є записи") : '')}
                  onClick={() => { setSel(d === today ? '' : d); setPlanView('day'); }}>{+d.slice(8)}{hasEx(d) && <span className="exm" aria-hidden="true"><Icon n="flag" s={12} /></span>}{hasDot(d) && <i className="dot" aria-hidden="true" />}</button>
              : <div key={i} />)}
          </div>
          <p className="sub" style={{ marginTop: 14 }}>{tr("Торкніться дня, щоб відкрити його план.")}</p>
        </div>}

        {/* iPad (вікно ≥768): назви подій у клітинці (m — 1, l — 2, xl — 3) + «+N», сьогодні — коло на числі, вибраний день — рамка;
            тап вибирає день, список дня праворуч (xl) або знизу; «Відкрити день» / подвійний тап — перехід у «День» (ipad-layout-spec 5.2, I6) */}
        {pv === 'month' && wideCal && <div className="monthv mw">
          <div className="cal" role="grid" aria-label={monthName}>
            {[tr("Пн"), tr("Вт"), tr("Ср"), tr("Чт"), tr("Пт"), tr("Сб"), tr("Нд")].map(w => <div className="cw" key={w} aria-hidden="true">{w}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="cd-pad" />;
              const ents = dayEntries(d), on = d === selDate, n = Math.min(mCnt, ents.length);
              const shown = ents.length > mCnt ? Math.max(0, mCnt - 1) : n; // «+N» займає останній рядок, щоб висота клітинки не росла
              return <button key={i} className={'cd' + (d === today ? ' td' : '') + (on ? ' sel' : '') + (hasEx(d) ? ' ex' : '')} aria-current={d === today ? 'date' : undefined} aria-pressed={on}
                aria-label={new Date(d + 'T00:00:00').toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' }) + (ents.length ? ': ' + ents.map(e => (e.time ? e.time + ' ' : '') + e.t).join(', ') : hasDot(d) ? ', ' + tr("є записи") : '')}
                onClick={() => setSel(d === today ? '' : d)} onDoubleClick={() => { setSel(d === today ? '' : d); setPlanView('day'); }}>
                <span className="cd-top"><span className="cd-n">{+d.slice(8)}</span>{hasEx(d) && <span className="exm" aria-hidden="true"><Icon n="flag" s={12} /></span>}</span>
                {mCnt === 0 && hasDot(d) && <i className="dot" aria-hidden="true" />}
                {ents.slice(0, shown).map(e => e.k === 'task'
                  ? <span key={e.id} className="cd-tk" aria-hidden="true"><i className={'sq ' + e.area} /><span>{e.t}</span></span>
                  : <span key={e.id} className={'cd-ev ' + (e.k === 'exam' ? 'exam' : e.area)} aria-hidden="true">{e.time && <b>{e.time}</b>}<span>{e.t}</span></span>)}
                {mCnt > 0 && ents.length > shown && <span className="cd-more" aria-hidden="true">+{ents.length - shown}</span>}
              </button>;
            })}
          </div>
          {(() => {
            const evs = evOn(selDate), exs = exOn(selDate), tks = dayTasksOn(selDate);
            const nEv = evs.length + exs.length;
            const sum = [nEv ? nEv + ' ' + plural(nEv, "подія", "події", "подій") : '', tks.length ? tks.length + ' ' + plural(tks.length, "задача", "задачі", "задач") : ''].filter(Boolean).join(' · ');
            return <section className="agd" aria-labelledby="agd-t">
              <div className="agd-h">
                <div className="agd-tt"><h2 id="agd-t">{cap1(selObj.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>{sum && <p className="agd-s">{sum}</p>}</div>
                <button className="btn2" onClick={() => setPlanView('day')}>{tr("Відкрити день")}</button>
              </div>
              {!nEv && !tks.length ? <div className="agd-e"><p>{tr("На цей день нічого немає")}</p><button className="btn2" onClick={() => openNew(true, 'event')}><Icon n="plus" s={18} />{tr("Додати подію")}</button></div>
                : <ul className="agd-l">
                  {exs.map(e => <li key={'x' + e.id}><button className="agr" onClick={() => setExV(e.id)}>
                    <span className="agr-tm">{e.time || '—'}</span><i className="agr-bar exam" aria-hidden="true" />
                    <span className="agr-b"><span className="agr-n"><Icon n="flag" s={14} /> {tr("Іспит")}: {e.t}</span><span className="agr-m">{exWhen(e)}</span></span></button></li>)}
                  {evs.map(e => <li key={'e' + e.id}><button className="agr" onClick={() => openEdit(e)}>
                    <span className="agr-tm">{e.time || '—'}</span><i className={'agr-bar ' + e.area} aria-hidden="true" />
                    <span className="agr-b"><span className="agr-n">{e.t}</span><span className="agr-m">{tr(AREA[e.area])}{Number(e.h) ? ' · ' + r1(Number(e.h)) + tr(" год") : ''}{isRep(e) ? ' · ' + tr(REPS[e.repeat]) : ''}</span></span></button></li>)}
                  {tks.map(i => { const dn = isRep(i) ? (i.doneDates || []).includes(selDate) : !!i.done; return <li key={'t' + i.id} className={'agt' + (dn ? ' done' : '')}>
                    <Ck label={i.t} checked={dn} onChange={() => tog(i.id, selDate)} />
                    <button className="agr" onClick={() => openEdit(i)}><span className="agr-b"><span className="agr-n">{i.t}</span><span className="agr-m">{tr(AREA[i.area])}{i.time ? ' · ' + i.time : ''}</span></span></button></li>; })}
                </ul>}
            </section>; })()}
        </div>}

        {pv === 'all' && (() => {
          const lst = <>
            {!recs.length && !repList.length && !exams.length && <div className="card"><div className="empty">{tr("Відкритих задач немає.")}</div></div>}
            {allGroups.map(([title, list, warn]) => list.length > 0 && <div className={'card' + (warn ? ' warn' : '')} key={title}><div className="sec">{title}<span className="cnt">{list.length}</span></div>{list.map(row)}</div>)}
            {doneSorted.length > 0 && <details className="card grp"><summary><span>{tr("Виконані")}<span className="cnt">{doneSorted.length}</span></span><Icon n="chevD" s={20} /></summary>{doneSorted.map(row)}</details>}
          </>;
          if (!mdAll) return <div className="allv">{lst}</div>;
          const cur = allSel != null && af ? items.find(i => i.id === allSel) : null;
          return <div className="allv md">
            <div className="md-l">{lst}</div>
            <section className="md-d" aria-label={tr("Деталі запису")}>
              {cur ? <>
                <h2 className="md-t">{af.kind === 'exam' ? tr("Іспит") : af.kind === 'event' ? tr("Подія") : tr("Задача")}</h2>
                <p className="md-s">{tr("Зміни зберігаються одразу.")}</p>
                {formRows(af, setAf, 'af-', false)}
                <div className="fdel"><button className="btn2 wn" onClick={() => { setItems(items.filter(i => i.id !== allSel)); setAllSel(null); setAfS(null); }}>{tr("Видалити")}</button></div>
              </> : <p className="md-e">{tr("Виберіть задачу зліва")}</p>}
            </section>
          </div>;
        })()}
      </>}

      {tab === 'folders' && <Materials folders={folders} notes={notes} fview={fview} setFview={setFview}
        onOpenNote={openNote} onNewNote={newNote} onFolderForm={x => setFform(x)} onStudy={onStudy} folderExtra={folderTasks}
        onNoteFav={id => setNotes(notes.map(n => n.id === id ? { ...n, fav: !n.fav } : n))}
        onNoteMove={(id, folder) => setNotes(notes.map(n => n.id === id ? { ...n, folder } : n))}
        onNoteDel={id => setNotes(notes.filter(n => n.id !== id))}
        onAsk={askFromEditor} aiOn={aiOpen && win !== 'c'} onAiClose={() => setAiOpen(false)} aiBtn={aiBtn} openReq={openReq} onOpenReqDone={() => setOpenReq(null)} onOpened={m => { setLastMat(m); setEdDoc(m); }} onEdClose={() => setEdDoc(null)} />}

      {tab === 'cards' && !deckV && (() => {
        const testsList = idp => tests.length > 0 && <section className="lsec" aria-labelledby={idp + '-h'}>
          <h2 className="lsh-t" id={idp + '-h'}>{tr("Останні тести")}</h2>
          {tests.map(t => { const pct = t.done && t.qs.length ? Math.round(tScore(t) / t.qs.length * 100) : null; return (
            <div className="tsr" key={t.id}>
              <button className="tsr-o" onClick={() => { setTview(t.id); setQi(0); setTmsg(''); }}>
                <span className="tsr-b"><span className="tsr-t">{t.title}</span><span className="tsr-m">{nQs(t.qs.length)} · {relDate(t.created)}</span></span>
                <span className={'tsr-p' + (pct == null ? '' : pct >= 80 ? ' hi' : pct >= 50 ? ' mid' : ' lo')}>{pct != null ? pct + '%' : tr("не завершено")}</span>
              </button>
              <button className="x" onClick={() => setTests(tests.filter(x => x.id !== t.id))} aria-label={tr("Видалити тест") + ': ' + t.title} title={tr("Видалити")}>×</button>
            </div>); })}
        </section>;
        const srcs = [
          ['topic', tr("За темою"), tcfg.topic.trim() ? tcfg.topic.trim().slice(0, 40) : tr("Напишіть тему"), true],
          ['mat', tr("З матеріалу"), !hasMats ? tr("Матеріалів ще немає") : selDoc ? String(selDoc.title || tr("Зошит")).slice(0, 40) : selNote ? noteTitle(selNote) : tr("Нотатка або зошит"), hasMats],
          ['deck', tr("З набору карток"), !decks.length ? tr("Карток ще немає") : tcfg.deck != null && decks.some(d => d.name === tcfg.deck) ? deckName(tcfg.deck) : tr("Оберіть набір"), decks.length > 0]
        ];
        const n = Number(tcfg.n) || 10;
        return <div className="lrn">
          <div className="lrn-l">
            <header className="lh"><h1>{tr("Навчання")}</h1>{aiBtn}</header>
            <section className="rv" aria-labelledby="rv-h">
              {revQ.list.length ? <>
                <h2 className="rv-l" id="rv-h">{tr("Сьогодні повторити")}</h2>
                <div className="rv-n">{nCards(revQ.list.length)}</div>
                {revQ.nNew > 0 && <p className="rv-p">{tr("з них нових")}: {revQ.nNew}</p>}
                <button className="btn-a rv-go" onClick={() => startRev(null)}>{tr("Почати повторення")}</button>
              </> : <>
                <h2 className="rv-l" id="rv-h">{cards.length ? tr("На сьогодні все.") : tr("Карток ще немає")}</h2>
                <p className="rv-p">{cards.length ? (nextStr(nextUp(cards, { now: nowTs, limit: newLim })) || tr("Додайте нові картки в набір або зробіть їх із помилок у тесті.")) : tr("Створіть набір вручну або попросіть Помічника зробити картки за темою.")}</p>
                {(() => { const ah = srsQueue(cards, { now: nowTs, limit: newLim, ahead: true }).list.length; return ah > 0 ? <button className="btn-a rv-go full" onClick={() => startRev(null)}>{tr("Продовжити вивчення")} · {ah}</button> : <button className="btn2 rv-go" onClick={newDeck}>{tr("Новий набір")}</button>; })()}
              </>}
            </section>
            <section className="lsec" aria-labelledby="dk-h">
              <div className="lsh"><h2 className="lsh-t" id="dk-h">{tr("Набори карток")}</h2>{decks.length > 0 && <button className="lnk" onClick={newDeck}>{tr("Новий набір")}</button>}</div>
              {decks.map(d => (
                <button className="dkr" key={'d:' + d.name} onClick={() => openDeck(d.name)}>
                  <span className="dkr-bar" style={{ background: deckCol(d.name) }} aria-hidden="true" />
                  <span className="dkr-b"><span className="dkr-n">{deckName(d.name)}</span><span className="dkr-m">{tr("вивчено")} {d.learned}{tr(" з ")}{d.all}</span></span>
                  {d.left > 0 && <span className="dkr-c">{d.left}<span className="vh"> {tr("до повторення")}</span></span>}
                </button>))}
              {!decks.length && <p className="sub">{tr("Наборів ще немає.")}</p>}
            </section>
            <div className="wide-only">{testsList('tl-w')}</div>
          </div>

          <div className="lrn-r">
            <section className="tf" id="new-test" tabIndex={-1} aria-labelledby="tf-h">
              <h2 className="lsh-t phone-only" aria-hidden="true">{tr("Тести")}</h2>
              <div className="tf-card">
                <div className="tf-hd"><h2 className="tf-t" id="tf-h">{tr("Новий тест")}</h2><p className="hint wide-only">{tr("Помічник складе питання з вашої нотатки, набору карток або теми")}</p></div>
                <div className="fld">
                  <span className="flab" id="tf-src">{tr("Звідки питання")}</span>
                  <div className="srcs" role="group" aria-labelledby="tf-src">
                    {srcs.map(([k, nm, s, en]) => <button key={k} className="src" aria-pressed={tcfg.src === k} disabled={!en} onClick={() => setTcfg(c => ({ ...c, src: k }))}><span className="src-n">{nm}</span><span className="src-s">{s}</span></button>)}
                  </div>
                  {tcfg.src === 'topic' && <><label className="vh" htmlFor="tf-topic">{tr("Тема")}</label><textarea id="tf-topic" rows={3} placeholder={tr("Наприклад: Present Perfect, німецькі артиклі, анатомія зуба")} value={tcfg.topic} onChange={e => setTcfg(c => ({ ...c, topic: e.target.value }))} /></>}
                  {tcfg.src === 'mat' && <><label className="vh" htmlFor="tf-mat">{tr("Матеріал")}</label>
                    <select id="tf-mat" value={selDoc ? 'd:' + selDoc.id : selNote ? String(selNote.id) : ''} onChange={e => { const v = e.target.value; setTcfg(c => ({ ...c, mat: v, pages: v.startsWith('d:') ? [1] : [] })); }} aria-describedby="tf-mat-h">
                      <option value="">{tr("Оберіть матеріал")}</option>
                      {textNotes.length > 0 && <optgroup label={tr("Нотатки")}>{textNotes.map(x => <option key={x.id} value={String(x.id)}>{noteTitle(x)}</option>)}</optgroup>}
                      {pageDocs.length > 0 && <optgroup label={tr("Зошити, дошки, фото й PDF")}>{pageDocs.map(d => <option key={'d' + d.id} value={'d:' + d.id}>{String(d.title || tr("Без назви")).slice(0, 50)} · {docPages(d)} {tr("с.")}</option>)}</optgroup>}
                    </select>
                    {selDoc && <><p className="flab" id="tf-pg" style={{ marginTop: 12 }}>{selDoc.type === 'pdf' ? tr("Сторінки (до 10)") : tr("Сторінки (до 4)")}</p>
                      <div className="a-pgs tf-pgs" role="group" aria-labelledby="tf-pg">{Array.from({ length: docPages(selDoc) }, (_, k) => k + 1).map(n => { const on = selPages.includes(n); return <button key={n} className="a-pgb" aria-pressed={on} disabled={!on && selPages.length >= pageMax(selDoc)} onClick={() => setTcfg(c => ({ ...c, pages: on ? selPages.filter(x => x !== n) : [...selPages, n].sort((a, b) => a - b) }))} aria-label={tr("Сторінка") + ' ' + n}>{n}</button>; })}</div></>}
                    <p className="hint" id="tf-mat-h">{selDoc ? (selDoc.type === 'pdf' ? tr("До ШІ піде текст сторінок PDF; сторінки без тексту (скан) або з вашими позначками — зображеннями.") : tr("Сторінки підуть до ШІ зображеннями. ШІ розпізнає рукопис, можливі помилки — перевіряйте питання.")) : tr("Текстова нотатка або сторінки зошита, дошки чи фото.")}</p></>}
                  {tcfg.src === 'deck' && <><label className="vh" htmlFor="tf-deck">{tr("Набір карток")}</label>
                    <select id="tf-deck" value={tcfg.deck == null ? '' : 'd:' + tcfg.deck} onChange={e => setTcfg(c => ({ ...c, deck: e.target.value === '' ? null : e.target.value.slice(2) }))}><option value="">{tr("Оберіть набір")}</option>{decks.map(d => <option key={d.name} value={'d:' + d.name}>{deckName(d.name)} · {nCards(d.all)}</option>)}</select></>}
                </div>
                <div className="fld">
                  <span className="flab" id="tf-n">{tr("Кількість питань")}</span>
                  <div className="qns" role="group" aria-labelledby="tf-n">{QN.map(k => <button key={k} className="qn" aria-pressed={n === k} onClick={() => setTcfg(c => ({ ...c, n: k }))}>{k}</button>)}</div>
                  <span className="hint">{tr("≈")} {Math.max(1, Math.round(n * 0.8))} {tr("хв")}</span>
                </div>
                <div className="fld2">
                  <div className="fld"><span className="flab" id="tf-k">{tr("Тип питань")}</span>
                    <div className="sg3" role="group" aria-labelledby="tf-k">{[['mix', "Змішані"], ['choice', "З варіантами"], ['open', "Відкриті"]].map(([k, nm]) => <button key={k} aria-pressed={tcfg.kind === k} onClick={() => setTcfg(c => ({ ...c, kind: k }))}>{tr(nm)}</button>)}</div></div>
                  <div className="fld"><span className="flab" id="tf-l">{tr("Складність")}</span>
                    <div className="sg3" role="group" aria-labelledby="tf-l">{[['easy', "Легко"], ['mixed', "Наростає"], ['hard', "Складно"]].map(([k, nm]) => <button key={k} aria-pressed={tcfg.level === k} onClick={() => setTcfg(c => ({ ...c, level: k }))}>{tr(nm)}</button>)}</div></div>
                </div>
                <div className="tf-go">
                  <button className="btn-a big" onClick={createTest} disabled={tbusy || !srcReady}>{tbusy ? tr("Складаю тест…") : tr("Скласти тест") + ' · ' + nQs(n)}</button>
                  <span className="hint">{tr("Помилки з тесту можна одним дотиком перетворити на картки")}</span>
                </div>
                {tmsg && <p className="sub" role="status" style={{ margin: 0 }}>{tmsg}</p>}
              </div>
            </section>
            <div className="phone-only">{testsList('tl-p')}</div>
          </div>
        </div>;
      })()}

      {tab === 'cards' && deckV && (() => {
        const dn = deckV.isNew ? deckV.draft.trim() : deckV.name;
        const dc = deckV.isNew ? [] : cards.filter(c => (c.deck || '') === dn);
        const dq = deckV.isNew ? null : srsQueue(cards, { deck: dn, now: nowTs, limit: newLim });
        const dl = dq ? dq.list.length : 0, dLearned = dc.filter(isLearned).length;
        const cst = c => { const x = normCard(c, nowTs); return x.state === 0 ? [tr("Нова"), ' due'] : x.state === 2 ? (x.due <= nowTs ? [tr("До повторення"), ' due'] : [tr("Вивчено") + ' · ' + new Date(x.due).toLocaleDateString(loc(), { day: 'numeric', month: 'short' }), '']) : [tr("Вивчається"), ' due']; };
        const add = () => { if (deckV.isNew && !dn) return; if (addCard(dn) && deckV.isNew) setDeckV({ name: dn }); };
        return <div className="dkv">
          <header className="lh">
            {aiBtn}
            <nav className="crumbs" aria-label={tr("Шлях")}><button onClick={() => setDeckV(null)}>{tr("Навчання")}</button><span aria-hidden="true">›</span></nav>
            {deckV.isNew ? <><h1 className="vh">{tr("Новий набір")}</h1><label className="vh" htmlFor="dk-name">{tr("Назва набору")}</label><input id="dk-name" className="dk-name" autoFocus placeholder={tr("Назва набору")} value={deckV.draft} onChange={e => setDeckV({ ...deckV, draft: e.target.value })} /></>
              : <h1>{deckName(dn)}</h1>}
          </header>
          {!deckV.isNew && <p className="sub dk-sum">{tr("вивчено")} {dLearned}{tr(" з ")}{dc.length}{dl ? ' · ' + tr("до повторення") + ' ' + dl : dc.length ? ' · ' + (nextStr(nextUp(cards, { deck: dn, now: nowTs, limit: newLim })) || '') : ''}</p>}
          {!deckV.isNew && dc.length > 0 && <div className="dk-prog" role="progressbar" aria-label={tr("Вивчено")} aria-valuemin={0} aria-valuemax={dc.length} aria-valuenow={dLearned}><i style={{ width: (dLearned / dc.length * 100) + '%' }} /></div>}
          {!deckV.isNew && <div className="dk-act">
            <button className="btn-a" disabled={!dl} onClick={() => startRev(dn)}>{tr("Повторити")}{dl ? ' · ' + dl : ''}</button>
            <button className="btn2" disabled={!dc.length} onClick={() => { setTcfg(c => ({ ...c, src: 'deck', deck: dn })); setDeckV(null); goNewTest(); }}>{tr("Тест")}</button>
            <button className="btn2" disabled={!dc.length} onClick={() => startRev(dn, 'browse')}>{tr("Переглянути всі")}</button>
            {dc.some(c => normCard(c, nowTs).state !== 0) && <button className="btn2" onClick={() => setCards(cards.map(c => (c.deck || '') === dn ? resetCard(c) : c))}>{tr("Почати спочатку")}</button>}
          </div>}
          <div className="card dk-new"><h2 className="sec" id="dk-add">{tr("Нова картка")}</h2>
            <label className="vh" htmlFor="dk-q">{tr("Питання")}</label><input id="dk-q" placeholder={tr("Питання")} value={cq} onChange={e => setCq(e.target.value)} />
            <label className="vh" htmlFor="dk-a">{tr("Відповідь")}</label><textarea id="dk-a" rows={2} style={{ marginTop: 8 }} placeholder={tr("Відповідь")} value={ca} onChange={e => setCa(e.target.value)} />
            <div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={add} disabled={!cq.trim() || !ca.trim() || (deckV.isNew && !dn)}>{tr("Додати картку")}</button></div>
            {deckV.isNew && !dn && <p className="hint">{tr("Спершу напишіть назву набору.")}</p>}
          </div>
          {dc.length > 0 && <ul className="dk-list" aria-label={tr("Картки")}>{dc.map(c => <li key={c.id} className="dk-i">
            {ced && ced.id === c.id ? <>
              <label className="vh" htmlFor={'eq' + c.id}>{tr("Питання")}</label><input id={'eq' + c.id} autoFocus value={ced.q} onChange={e => setCed({ ...ced, q: e.target.value })} />
              <label className="vh" htmlFor={'ea' + c.id}>{tr("Відповідь")}</label><textarea id={'ea' + c.id} rows={2} style={{ marginTop: 8 }} value={ced.a} onChange={e => setCed({ ...ced, a: e.target.value })} />
              <div className="dk-row"><span className="flex1" /><button className="chip sm" onClick={() => setCed(null)}>{tr("Скасувати")}</button><button className="chip sm on" disabled={!ced.q.trim() || !ced.a.trim()} onClick={() => { setCards(cards.map(x => x.id === c.id ? { ...x, q: ced.q.trim(), a: ced.a.trim() } : x)); setCed(null); }}>{tr("Зберегти")}</button></div>
            </> : <>
              <div className="dk-q">{c.q}</div><div className="dk-ans">{c.a}</div>
              <div className="dk-row"><span className={'dk-st' + cst(c)[1]}>{cst(c)[0]}</span>
                <button className="chip sm" onClick={() => setCed({ id: c.id, q: c.q, a: c.a })} aria-label={tr("Змінити картку") + ': ' + c.q}>{tr("Змінити")}</button>
                <button className="chip sm" onClick={() => setCards(cards.filter(x => x.id !== c.id))} aria-label={tr("Видалити картку") + ': ' + c.q}>{tr("Видалити")}</button></div>
            </>}
          </li>)}</ul>}
          {!deckV.isNew && dc.length > 0 && <button className={'btn2 ' + (dkDel ? 'danger' : 'danger-t')} onClick={() => { if (!dkDel) { setDkDel(true); return; } setCards(cards.filter(c => (c.deck || '') !== dn)); setDeckV(null); setDkDel(false); }}>{dkDel ? tr("Підтвердити: видалити набір і всі картки") : tr("Видалити набір")}</button>}
        </div>;
      })()}

      {tab === 'ai' && assistant(false)}

      {tab === 'set' && (() => {
        const cLang = <div className="card"><div className="sec">Мова / Sprache</div><div className="seg">{[['uk', 'Українська'], ['de', 'Deutsch']].map(([k, n]) => <button key={k} className={ui.lang === k ? 'on' : ''} onClick={() => setUi({ ...ui, lang: k })}>{n}</button>)}</div></div>;
        const cAcc = <div className="card"><div className="sec">{tr("Акаунт")}</div>
          <div className="sub" style={{ marginBottom: 10 }}>{activeAccount() ? tr("Вхід виконано як") + ': ' + activeAccount().name : tr("Локальний профіль (без акаунта)")}</div>
          {(listAccounts().length > 0) && <div className="prow">{listAccounts().map(a => <button key={a.id} className={'chip' + (a.id === getActiveId() ? ' on' : '')} style={{ margin: 0 }} onClick={() => switchAcc(a.id)}>{a.name}</button>)}{getActiveId() && <button className="chip" style={{ margin: 0 }} onClick={() => switchAcc('')}>{tr("Локальний профіль")}</button>}</div>}
          <div className="sec" style={{ marginTop: 14 }}>{tr("Створити акаунт або увійти")}</div>
          <input placeholder={tr("Ім’я акаунта")} value={acf.name} autoCapitalize="none" autoCorrect="off" onChange={e => setAcf({ ...acf, name: e.target.value })} />
          <input type="password" style={{ marginTop: 8 }} placeholder={tr("Пароль акаунта (від 6 символів)")} value={acf.pass} onChange={e => setAcf({ ...acf, pass: e.target.value })} />
          {acf.err && <div className="sub" style={{ color: 'var(--wn)', marginTop: 8 }}>{acf.err}</div>}
          <button className="btn" style={{ marginTop: 12 }} onClick={enterAcc} disabled={acf.busy}>{acf.busy ? tr("Зачекайте…") : tr("Увійти або створити")}</button>
          <div className="sub" style={{ marginTop: 10 }}>{tr("Той самий акаунт на іншому пристрої: введіть те саме ім’я та пароль.")}</div></div>;
        const cSync = <div className="card"><div className="sec">{tr("Синхронізація")}</div>
          <div className="sub" style={{ marginBottom: 10 }}>{sy.on ? tr("Увімкнено") : tr("Вимкнено")}{sy.last ? ', ' + tr("остання синхронізація") + ': ' + new Date(sy.last).toLocaleString(loc(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</div>
          {sy.msg && <div className="sub" style={{ color: 'var(--wn)', marginBottom: 10 }}>{sy.msg}</div>}
          <button className="btn" onClick={() => { if (sy.on) runSync(); else toggleSync(); }} disabled={sy.state === 'syncing'}>{sy.state === 'syncing' ? tr("Синхронізую…") : tr("Синхронізувати зараз")}</button>
          <button className={'tg' + (sy.on ? ' on' : '')} onClick={toggleSync}><span>{tr("Автосинхронізація")}</span><b>{sy.on ? '✓' : ''}</b></button></div>;
        /* резервна копія: один JSON-файл (записи, картки, тести, папки, нотатки, розмови, налаштування, документи зі сторінками) */
        const cData = <section className="card bkc" aria-labelledby="bk-h"><h2 className="sec" id="bk-h">{tr("Дані")}</h2>
          <p className="sub" style={{ margin: '0 0 4px' }}>{bkm.last ? tr("Остання копія") + ': ' + bkWhen : tr("Резервних копій ще не було.")}</p>
          <p className="hint" style={{ margin: '0 0 12px' }}>{sy.on ? tr("Синхронізацію ввімкнено, але копія не завадить: файл можна зберегти в iCloud Drive, Google Drive або на комп’ютер.") : tr("Дані зберігаються лише на цьому пристрої. Копія — файл, з якого можна все відновити на цьому або іншому пристрої.")}</p>
          <div className="bkc-a"><button className="btn-a" onClick={saveBackup} disabled={bkBusy}>{bkBusy ? tr("Зберігаю…") : tr("Зберегти резервну копію")}</button>
            <button className="btn2" onClick={() => { sheetPrev.current = document.activeElement; const el = document.getElementById('bk-file'); if (el) el.click(); }}>{tr("Відновити з копії")}</button>
            <input id="bk-file" type="file" accept="application/json,.json" className="hidefile" tabIndex={-1} aria-hidden="true" onChange={e => { pickBackup(e.target.files && e.target.files[0]); e.target.value = ''; }} /></div>
        </section>;
        const cTheme = <div className="card"><div className="sec">{tr("Тема")}</div><div className="seg">{[['dark', tr("Темна")], ['light', tr("Світла")], ['auto', tr("Авто")]].map(([k, n]) => <button key={k} className={ui.theme === k ? 'on' : ''} onClick={() => setUi({ ...ui, theme: k })}>{n}</button>)}</div></div>;
        /* варіант B: налаштування говорять про навчання; події з часом віднімаються від цих годин (plan.js) */
        const cStart = <div className="card"><label className="sec" htmlFor="set-start">{tr("О котрій зазвичай починаєте навчання")}</label>
          <input id="set-start" type="number" min="0" max="23" value={start} aria-describedby="set-start-h" onChange={e => setStart(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))} />
          <p className="hint" id="set-start-h" style={{ marginTop: 8 }}>{tr("Година від 0 до 23. З неї План розставляє задачі на шкалі дня.")}</p></div>;
        const cCap = <div className="card"><h2 className="sec" id="set-cap">{tr("Годин на навчання й справи на день")}</h2>
          <p className="hint" id="set-cap-h" style={{ margin: '0 0 6px' }}>{tr("Події з часом віднімаються від цих годин автоматично.")}</p>
          <div role="group" aria-labelledby="set-cap" aria-describedby="set-cap-h">
          {[1, 2, 3, 4, 5, 6, 0].map(i => <div className="row" style={{ alignItems: 'center' }} key={i}><label htmlFor={'cap-' + i} style={{ width: 36 }}>{tr(DN[i])}</label>
            <input id={'cap-' + i} type="number" min="0" max="16" step="0.5" value={cap[i]} onChange={e => setCap(cap.map((c, j) => j === i ? Math.max(0, parseFloat(e.target.value) || 0) : c))} /></div>)}</div></div>;
        const cNew = <div className="card"><label className="sec" htmlFor="set-new">{tr("Нових карток на день")}</label>
          <input id="set-new" type="number" min="0" max="200" step="1" value={newLim} aria-describedby="set-new-h" onChange={e => setUi({ ...ui, newPerDay: Math.min(200, Math.max(0, parseInt(e.target.value, 10) || 0)) })} />
          <p className="hint" id="set-new-h" style={{ marginTop: 8 }}>{tr("Скільки нових карток додавати до щоденного повторення. Картки, які вже вчите, показуються завжди, коли настає їхній час.")}</p></div>;
        const cPass = <div className="card"><div className="sec" id="pass-title">{tr("Пароль доступу до ШІ та синхронізації")}</div>
          <div className="sub" id="pass-hint" style={{ marginBottom: 10 }}>{tr("Потрібен, якщо власник застосунку встановив пароль. Без нього ШІ та синхронізація не працюватимуть.")}</div>
          <input type="password" placeholder={tr("Пароль")} aria-labelledby="pass-title" aria-describedby="pass-hint" defaultValue={localStorage.getItem('helper-pass') || ''} onChange={e => localStorage.setItem('helper-pass', e.target.value)} /></div>;
        const back = <button className="btn alt" onClick={() => setTab('today')}>{tr("Назад")}</button>;
        const head = <div className="top"><h1>{tr("Налаштування")}</h1>{aiBtn}</div>;
        // телефон і клас s: як було (картки підряд, «Назад»)
        if (win === 'c' || rc === 's') return <>{head}{cLang}{cAcc}{cSync}{cData}{cTheme}{cStart}{cCap}{cNew}{cPass}{back}</>;
        // iPad: розділи (ipad-layout-spec 9, I7). m — одна колонка 640 з розділами підряд; l/xl — список розділів + деталі ≤560
        const passSet = (() => { try { return !!localStorage.getItem('helper-pass'); } catch (e) { return false; } })();
        const SECS = [
          ['gen', tr("Загальні"), 'set', (ui.lang === 'de' ? 'Deutsch' : 'Українська') + ' · ' + tr({ dark: "Темна", light: "Світла", auto: "Авто" }[ui.theme] || "Авто"), tr("Мова інтерфейсу й тема."), <>{cLang}{cTheme}</>],
          ['acc', tr("Акаунт"), 'user', activeAccount() ? activeAccount().name : tr("Локальний профіль"), tr("Один акаунт на кількох пристроях."), cAcc],
          ['sync', tr("Синхронізація"), 'sync', sy.on ? tr("Увімкнено") : tr("Вимкнено"), tr("Обмін даними між пристроями цього акаунта."), cSync],
          ['data', tr("Дані"), 'data', bkm.last ? new Date(bkm.last).toLocaleDateString(loc(), { day: 'numeric', month: 'short' }) : '', tr("Резервна копія у файл і відновлення з неї."), cData],
          ['learn', tr("Навчання"), 'cards', '', tr("Початок навчання, години на день і нові картки."), <>{cStart}{cCap}{cNew}</>],
          ['ai', tr("Доступ до ШІ"), 'key', passSet ? tr("Пароль задано") : '', tr("Пароль для Помічника й синхронізації."), cPass]
        ];
        if (rc === 'm') return <div className="setw one">{head}{SECS.map(([k, n, , , d, body]) => <section key={k} className="setd" aria-labelledby={'sd-' + k}><h2 className="setd-t" id={'sd-' + k}>{n}</h2><p className="setd-s">{d}</p>{body}</section>)}</div>;
        const cur = SECS.find(s => s[0] === setSec) || SECS[0];
        return <div className="setw two">
          <nav className="setn" aria-label={tr("Розділи налаштувань")}>
            {head}
            {SECS.map(([k, n, ic, v]) => <button key={k} className="setn-i" aria-current={cur[0] === k ? 'true' : undefined} onClick={() => setSetSec(k)}>
              <span className="setn-ic" aria-hidden="true"><Icon n={ic} s={20} /></span><span className="setn-n">{n}</span>{v && <span className="setn-v">{v}</span>}</button>)}
          </nav>
          <section className="setd" aria-labelledby="sd-cur"><h2 className="setd-t" id="sd-cur">{cur[1]}</h2><p className="setd-s">{cur[4]}</p>{cur[5]}</section>
        </div>;
      })()}
      </div></div>

      {win !== 'c' && tab !== 'ai' && <AiPanel open={aiOpen} mode={win === 'm' ? 'over' : 'dock'} large={win === 'l'} onClose={() => setAiOpen(false)}>{assistant(true)}</AiPanel>}

      {/* один «+» на екран: План — FAB лише на телефоні (на iPad — рядок швидкого вводу); Матеріали — нова папка */}
      {/* один «+» на екран: План — FAB лише на телефоні (на iPad — рядок швидкого вводу); Матеріали — FAB/«Створити» всередині Materials */}
      {tab === 'today' && <button className="fab phone-only" onClick={() => openNew(false)} aria-label={tr("Додати задачу або подію")} title={tr("Додати задачу або подію")}><Icon n="plus" s={26} /></button>}

      {sheet && win !== 'c' && (() => {
        const ttl = sheet === 'new' ? (!more ? tr("Новий запис") : exm ? tr("Новий іспит") : ev ? tr("Нова подія") : tr("Нова задача")) : (exm ? tr("Змінити іспит") : ev ? tr("Змінити подію") : tr("Змінити задачу"));
        return <div className="ov ovt" onClick={closeSheet}><div className="sheet fsh wide" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={e => e.stopPropagation()}>
          {formHead('sheet-title', ttl, closeSheet, sheet === 'new' ? tr("Додати") : tr("Готово"), saveTask, !!buildItem(f))}
          <div className="fbody">
            {sheet === 'new' && <>
              {quickInput('qa-sheet', true)}
              {qaMsg && <div className="sub qmsg" role="status">{qaMsg}</div>}
              {previewCard(true)}
              <button className="more" aria-expanded={more} aria-controls="full-form" onClick={() => setMore(!more)}><span>{tr("Більше параметрів")}</span><Icon n="chevD" s={20} /></button>
            </>}
            {(sheet !== 'new' || more) && <div id="full-form">{formRows(f, setF, 'sf-', sheet !== 'new' || more)}</div>}
            {sheet !== 'new' && <div className="fdel"><button className="btn2 wn" onClick={() => del(sheet)}>{exm ? tr("Видалити іспит") : tr("Видалити")}</button></div>}
          </div>
        </div></div>; })()}
      {sheet && win === 'c' && <div className="ov" onClick={closeSheet}><div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={e => e.stopPropagation()}>
        <div className="shd"><h2 id="sheet-title">{sheet === 'new' ? (!more ? tr("Новий запис") : exm ? tr("Новий іспит") : ev ? tr("Нова подія") : tr("Нова задача")) : (exm ? tr("Змінити іспит") : ev ? tr("Змінити подію") : tr("Змінити задачу"))}</h2>
          <button className="ib" onClick={closeSheet} aria-label={tr("Закрити")} title={tr("Закрити")}><Icon n="close" s={22} /></button></div>
        {sheet === 'new' && <>
          {quickInput('qa-sheet', true)}
          {qaMsg && <div className="sub qmsg" role="status">{qaMsg}</div>}
          {previewCard(true)}
          <button className="more" aria-expanded={more} aria-controls="full-form" onClick={() => setMore(!more)}><span>{tr("Більше параметрів")}</span><Icon n="chevD" s={20} /></button>
        </>}
        {(sheet !== 'new' || more) && <div id="full-form">
        <div className="seg" role="group" aria-label={tr("Тип запису")}><button className={f.kind === 'task' ? 'on' : ''} aria-pressed={f.kind === 'task'} onClick={() => setF({ ...f, kind: 'task' })}>{tr("Задача")}</button><button className={ev ? 'on' : ''} aria-pressed={ev} onClick={() => setF({ ...f, kind: 'event' })}>{tr("Подія")}</button><button className={exm ? 'on' : ''} aria-pressed={exm} onClick={() => setF({ ...f, kind: 'exam' })}>{tr("Іспит")}</button></div>
        {exm ? <div className="exf">
          <label className="flab" htmlFor="ex-t">{tr("Предмет")}</label>
          <input id="ex-t" autoFocus={sheet !== 'new' || more} placeholder={tr("Наприклад: Анатомія")} value={f.t} onChange={e => setF({ ...f, t: e.target.value })} />
          <div className="row"><div className="exf-c"><label className="flab" htmlFor="ex-d">{tr("Дата")}</label><input id="ex-d" type="date" value={f.due} onChange={e => setF({ ...f, due: e.target.value })} aria-describedby={!isDate(f.due) ? 'ex-dh' : undefined} /></div>
            <div className="exf-c"><label className="flab" htmlFor="ex-tm">{tr("Час (необов’язково)")}</label><input id="ex-tm" type="time" value={f.time} onChange={e => setF({ ...f, time: e.target.value })} /></div></div>
          {!isDate(f.due) && <p className="hint" id="ex-dh">{tr("Вкажіть дату іспиту.")}</p>}
          {folders.length > 0 && <><label className="flab" htmlFor="ex-f">{tr("Папка з матеріалами (необов’язково)")}</label>
            <select id="ex-f" value={f.folder} onChange={e => setF({ ...f, folder: e.target.value })}><option value="">{tr("Без папки")}</option>{folders.map(fo => <option key={fo.id} value={fo.id}>{folderPath(folders, fo.id)}</option>)}</select></>}
          <label className="flab" htmlFor="ex-n">{tr("Нотатка")}</label>
          <textarea id="ex-n" rows={2} placeholder={tr("Наприклад: аудиторія, що взяти з собою")} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
          <div className="row"><button className="btn" onClick={saveTask} disabled={!f.t.trim() || !isDate(f.due)}>{sheet === 'new' ? tr("Додати іспит") : tr("Зберегти")}</button>
            {sheet !== 'new' && <button className="btn alt" onClick={() => del(sheet)}>{tr("Видалити")}</button>}</div>
        </div> : <>
        <input style={{ marginTop: 12 }} autoFocus={sheet !== 'new' || more} placeholder={ev ? tr("Наприклад: стоматолог") : tr("Що потрібно зробити або вивчити")} value={f.t} onChange={e => setF({ ...f, t: e.target.value })} />
        <div className="row"><select value={f.area} onChange={e => setF({ ...f, area: e.target.value })}>{Object.entries(AREA).map(([k, v]) => <option key={k} value={k}>{tr(v)}</option>)}</select>
          {ev ? <input type="time" aria-label={tr("Час")} title={tr("Час")} value={f.time} onChange={e => setF({ ...f, time: e.target.value })} /> : <input type="number" min="0.5" step="0.5" placeholder={tr("Годин")} value={f.h} onChange={e => setF({ ...f, h: e.target.value })} />}</div>
        <div className="row"><input type="date" aria-label={tr("Дата")} title={tr("Дата")} value={f.due} onChange={e => setF({ ...f, due: e.target.value })} />
          {ev ? <input type="number" min="0.5" step="0.5" placeholder={tr("Тривалість, год")} value={f.h} onChange={e => setF({ ...f, h: e.target.value })} /> : <select value={f.pri} onChange={e => setF({ ...f, pri: e.target.value })}><option value={1}>{tr("Звичайна")}</option><option value={2}>{tr("Важлива")}</option></select>}</div>
        <div className="row"><select value={f.repeat} onChange={e => setF({ ...f, repeat: e.target.value })}>{Object.entries(REP).map(([k, v]) => <option key={k} value={k}>{tr(v)}</option>)}</select>
          {!ev && <input type="time" aria-label={tr("Час (необов’язково)")} title={tr("Час (необов’язково)")} value={f.time} onChange={e => setF({ ...f, time: e.target.value })} />}</div>
        {f.repeat !== 'none' && (() => { const d0 = f.due || selDate, bad = isDate(f.until) && f.until < d0; return <div className="untl">
          <label className="flab" htmlFor="f-until">{tr("До дати (необов’язково)")}</label>
          <input id="f-until" type="date" min={d0} value={f.until || ''} onChange={e => setF({ ...f, until: e.target.value })} aria-describedby="f-until-h" aria-invalid={bad || undefined} />
          <p className={'hint' + (bad ? ' err' : '')} id="f-until-h">{bad ? tr("Дата закінчення раніше за початок повтору.") : tr("Після цієї дати запис не показується й не планується.")}</p>
        </div>; })()}
        {folders.length > 0 && <div className="row"><select value={f.folder} onChange={e => setF({ ...f, folder: e.target.value })}><option value="">{tr("Без папки")}</option>{folders.map(fo => <option key={fo.id} value={fo.id}>{fo.name}</option>)}</select></div>}
        <textarea rows={2} placeholder={tr("Нотатка (необов’язково)")} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
        <div className="row"><button className="btn" onClick={saveTask} disabled={f.repeat !== 'none' && isDate(f.until) && f.until < (f.due || selDate)}>{sheet === 'new' ? tr("Додати") : tr("Зберегти")}</button>
          {sheet !== 'new' && <button className="btn alt" onClick={() => del(sheet)}>{tr("Видалити")}</button>}</div>
        </>}
        </div>}
      </div></div>}

      {/* папка: створення та дії з меню «⋯» (перейменувати / колір / перемістити / видалити). Обкладинка й іконка зі старих версій зберігаються в даних. */}
      {fform && (() => {
        const mode0 = fform.mode || (fform.id ? 'name' : 'new'), mode = mode0 === 'color' ? 'look' : mode0, full = mode === 'new' || mode === 'look';
        const up = fform.parent == null || fform.parent === '' ? null : folders.find(x => x.id === fform.parent);
        const ttl = { new: fform.parent !== '' && fform.parent != null ? tr("Нова підпапка") : tr("Нова папка"), look: tr("Папка"), name: tr("Перейменувати папку"), move: tr("Перемістити папку"), delete: tr("Видалити папку?") }[mode];
        const hex = isHex(fform.color) ? fform.color.toLowerCase() : '';
        const inPal = FOLDER_COLORS.some(([c]) => c.toLowerCase() === hex);
        // старі папки без нової іконки: показуємо емодзі як раніше, у виборі «Без іконки» не позначено
        const curIco = fform.ico || (fform.icon ? '' : 'none');
        const pickCover = async file => {
          if (!file) return;
          setFform(p => ({ ...p, busy: true, err: '' }));
          try { const c = await shrink(file, 256, 0.75); setFform(p => (p ? { ...p, cover: c, busy: false } : p)); }
          catch (e) { setFform(p => (p ? { ...p, busy: false, err: tr("Не вдалося обробити зображення.") } : p)); }
        };
        // iPad: форма — зверху з шапкою «Скасувати — назва — Створити/Зберегти»; видалення — підтвердження 420 по центру
        const wideF = win !== 'c', headF = wideF && mode !== 'delete';
        return <div className={'ov' + (headF ? ' ovt' : '')} onClick={() => setFform(null)} onKeyDown={e => { if (e.key === 'Escape') setFform(null); }}><div className={'sheet' + (full ? ' ffe' : '') + (headF ? ' fsh' : '') + (wideF && mode === 'delete' ? ' conf' : '')} role="dialog" aria-modal="true" aria-labelledby="ff-title" onClick={e => e.stopPropagation()}>
          {headF ? formHead('ff-title', ttl, () => setFform(null), mode === 'new' ? tr("Створити") : tr("Зберегти"), saveFolder, !!fform.name.trim())
            : <div className="shd"><h2 id="ff-title">{ttl}</h2><button className="ib" onClick={() => setFform(null)} aria-label={tr("Закрити")} title={tr("Закрити")}><Icon n="close" s={22} /></button></div>}
          <div className={headF ? 'fbody' : undefined} style={headF ? undefined : { display: 'contents' }}>
          {full && <div className="ffe-prev" aria-hidden="true"><FolderGlyph color={fform.color} ico={fform.ico} emoji={fform.icon} cover={fform.cover} size={96} /><span>{fform.name.trim() || tr("Нова папка")}</span></div>}
          {(full || mode === 'name') && <><label className="flab" htmlFor="ff-name">{tr("Назва папки")}</label>
            <input id="ff-name" style={{ marginTop: 6 }} autoFocus={mode !== 'look'} value={fform.name} maxLength={40} onChange={e => setFform({ ...fform, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') saveFolder(); }} /></>}
          {full && <>
            <div className="flab" id="ff-col" style={{ marginTop: 16 }}>{tr("Колір")}</div>
            <div className="fcols" role="group" aria-labelledby="ff-col">
              {FOLDER_COLORS.map(([c, nm], i) => { const on = c.toLowerCase() === hex; return <button key={c} autoFocus={mode === 'look' && (inPal ? on : i === 0)} className="fcol" aria-pressed={on} aria-label={tr(nm)} title={tr(nm)} onClick={() => setFform({ ...fform, color: c })}><i style={{ background: c }} /></button>; })}
              <label className={'fcol fcustom' + (hex && !inPal ? ' on' : '')} title={tr("Свій колір")}><i style={hex && !inPal ? { background: hex } : undefined} /><input type="color" value={hex || '#7aa2ff'} onChange={e => setFform({ ...fform, color: e.target.value })} aria-label={tr("Свій колір")} /></label>
            </div>
            <div className="flab" id="ff-ico" style={{ marginTop: 16 }}>{tr("Іконка")}</div>
            <div className="ficos" role="group" aria-labelledby="ff-ico">
              {FICONS.map(([k, nm]) => <button key={k} className="fico" aria-pressed={curIco === k} aria-label={tr(nm)} title={tr(nm)} onClick={() => setFform({ ...fform, ico: k })}><LineIcon k={k} size={22} /></button>)}
            </div>
            <div className="flab" style={{ marginTop: 16 }}>{tr("Фото на фон")}</div>
            <div className="row ffe-ph">
              <button className="chip sm" disabled={fform.busy} onClick={() => { const el = document.getElementById('ff-file'); if (el) el.click(); }}>{fform.busy ? tr("Обробка…") : fform.cover ? tr("Замінити фото") : tr("Завантажити")}</button>
              <input id="ff-file" type="file" accept="image/*" className="hidefile" tabIndex={-1} aria-hidden="true" onChange={e => { pickCover(e.target.files && e.target.files[0]); e.target.value = ''; }} />
              {fform.cover && <button className="chip sm" onClick={() => setFform({ ...fform, cover: '' })}>{tr("Прибрати")}</button>}
            </div>
            {fform.err && <p className="sub" role="alert" style={{ color: 'var(--wn)', margin: '4px 0 0' }}>{fform.err}</p>}
          </>}
          {mode === 'move' && <><label className="flab" htmlFor="ff-par">{tr("Розташування")}</label>
            <select id="ff-par" style={{ marginTop: 6 }} autoFocus value={fform.parent == null ? '' : fform.parent} onChange={e => setFform({ ...fform, parent: e.target.value === '' ? '' : Number(e.target.value) })}>
              <option value="">{tr("Головний рівень")}</option>{folders.filter(x => x.id !== fform.id && (!fform.id || canMoveFolder(folders, fform.id, x.id))).map(x => <option key={x.id} value={x.id}>{folderPath(folders, x.id)}</option>)}</select></>}
          {mode === 'delete' && <p className="ff-p">{tr("Папку «")}{fform.name}{tr("» буде видалено. Її матеріали, задачі й підпапки не зникнуть: вони перейдуть у ")}{up ? '«' + up.name + '»' : tr("«Матеріали» (без папки)")}.</p>}
          {!headF && <div className="row" style={{ marginTop: 16 }}>{mode === 'delete'
            ? <><button className="btn danger" autoFocus onClick={delFolder}>{tr("Видалити папку")}</button><button className="btn alt" onClick={() => setFform(null)}>{tr("Скасувати")}</button></>
            : <button className="btn" onClick={saveFolder} disabled={!fform.name.trim()}>{mode === 'new' ? tr("Створити") : tr("Зберегти")}</button>}</div>}
          </div>
        </div></div>;
      })()}

      {/* сесія повторення: фокус-режим без навігації */}
      {rev && (() => {
        const tNow = Date.now();
        const end = () => { setRev(null); setShow(false); };
        const browse = rev.mode === 'browse';
        const all = browse ? cards.filter(c => rev.deck == null || (c.deck || '') === rev.deck).sort((a, b) => (a.seq || a.id) - (b.seq || b.id)) : [];
        const qd = browse ? all : srsQueue(cards, { deck: rev.deck, now: tNow, limit: newLim, ahead: true }).list;
        const c = browse ? all[Math.min(rev.i, all.length - 1)] : qd[0];
        const pv = !browse && show && c && rev.pvId === c.id ? rev.pv : null;
        const reveal = () => { if (!c) return; if (browse) { setShow(!show); return; } if (show) { setShow(false); return; } setRev(r => ({ ...r, pv: srsPreview(c, Date.now()), pvId: c.id })); setShow(true); };
        const grade = k => {
          if (!pv) return; const nc = pv[k];
          setCards(cs => cs.map(x => (x.id === c.id ? nc : x)));
          setRev(r => ({ ...r, n: r.n + 1, pv: null, pvId: null, said: tr("Збережено. Наступне повторення через") + ' ' + ivLabel(nc.due - tNow) }));
          setShow(false);
        };
        const go = d => { setRev(r => ({ ...r, i: Math.max(0, Math.min(all.length - 1, r.i + d)) })); setShow(false); };
        revKey.current = e => {
          if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
          if (e.target && e.target.closest && e.target.closest('.aip')) return; // фокус у панелі Помічника — клавіші сесії не діють
          if (e.key === 'Escape') { end(); return; }
          if (!c) return;
          if (e.key === ' ' && !(e.target && e.target.tagName === 'BUTTON' && !(e.target.classList && e.target.classList.contains('flip')))) { e.preventDefault(); if (!e.repeat) reveal(); return; }
          if (browse) { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); return; }
          if (pv && e.key === '1') grade('again'); else if (pv && e.key === '2') grade('good'); else if (pv && e.key === '3') grade('easy');
        };
        const isNewC = c && normCard(c, tNow).state === 0;
        const title = (rev.deck == null ? tr("Повторення") : deckName(rev.deck)) + (browse ? ' · ' + tr("перегляд") : '');
        // iPad (вікно ≥768): шапка «Завершити — назва — Помічник», смуга прогресу, колонка 680 по центру (ipad-layout-spec 8.2).
        // Панель Помічника в сесії — звичайна (поруч / поверх), тому шар не модальний, поки вона відкрита.
        const wideS = win !== 'c', pgDone = browse ? rev.i + 1 : rev.n, pgAll = browse ? all.length : rev.n + qd.length;
        return <div className={'nv rvs' + (wideS ? ' nvw' : '')} role="dialog" aria-modal={wideS && aiOpen ? undefined : 'true'} aria-labelledby="rvs-t">
          <div className="nvbar"><button className="chip" onClick={end}>{tr("Завершити")}</button><span className="sub" id="rvs-t">{title}{c ? ' · ' + (browse ? (rev.i + 1) + tr(" з ") + all.length : tr("залишилось") + ' ' + qd.length) : ''}</span>{wideS ? aiBtn : <span style={{ width: 44 }} />}</div>
          {wideS && pgAll > 0 && <div className="nvpg" role="progressbar" aria-label={tr("Прогрес")} aria-valuemin={0} aria-valuemax={pgAll} aria-valuenow={pgDone}><i style={{ width: (100 * pgDone / pgAll) + '%' }} /></div>}
          <div className="vh" aria-live="polite" role="status">{rev.said || ''}</div>
          <div className="nvcol">
          {c ? <>
            <button className="flip" autoFocus key={c.id + (browse ? ':' + rev.i : '')} onClick={reveal} onKeyUp={e => { if (e.key === ' ') e.preventDefault(); }} aria-describedby="rvs-hint">
              <span className="sub">{show ? tr("Відповідь") : (c.deck ? c.deck : tr("Питання"))}{!browse && isNewC && !show ? ' · ' + tr("нова") : ''}</span>
              {wideS ? <><span className="fq">{c.q}</span>{show && <><span className="fdiv" aria-hidden="true" /><span className="fa" aria-live="polite">{c.a}</span></>}</>
                : <><span className="fq" aria-live="polite">{show ? c.a : c.q}</span>
                {show && <span className="fqq">{c.q}</span>}</>}
              <span className="sub" id="rvs-hint">{show ? (browse ? tr("Торкніться, щоб знову побачити питання") : tr("Оцініть, чи пам’ятали відповідь")) : tr("Торкніться або натисніть пробіл, щоб побачити відповідь")}</span>
            </button>
            {!browse && !show && <div className="rvs-a"><button className="btn-a big" onClick={reveal}>{tr("Показати відповідь")}</button></div>}
            {!browse && pv && <div className="rvs-g" role="group" aria-label={tr("Оцінка")}>
              <button className="rg again" onClick={() => grade('again')} aria-keyshortcuts="1"><span className="rg-t">{tr("Не пам’ятаю")}</span><span className="rg-s">{ivLabel(pv.again.due - tNow)}</span></button>
              <button className="rg good" onClick={() => grade('good')} aria-keyshortcuts="2"><span className="rg-t">{tr("Пам’ятаю")}</span><span className="rg-s">{ivLabel(pv.good.due - tNow)}</span></button>
              <button className="rg easy" onClick={() => grade('easy')} aria-keyshortcuts="3"><span className="rg-t">{tr("Легко")}</span><span className="rg-s">{ivLabel(pv.easy.due - tNow)}</span></button>
            </div>}
            {!browse && <p className="hint rvs-k wide-only">{show ? tr("Клавіші: 1 — не пам’ятаю, 2 — пам’ятаю, 3 — легко") : tr("Пробіл — показати відповідь")}</p>}
            {browse && <div className="row rvs-a"><button className="btn alt" disabled={rev.i <= 0} onClick={() => go(-1)}>{tr("Назад")}</button><button className="btn" disabled={rev.i >= all.length - 1} onClick={() => go(1)}>{tr("Далі")}</button></div>}
          </> : <div className="rv-done"><h2>{tr("На сьогодні все.")}</h2>
            <p className="sub">{rev.n ? tr("Повторено") + ': ' + nCards(rev.n) + '. ' : ''}{nextStr(nextUp(cards, { deck: rev.deck, now: tNow, limit: newLim }))}</p>
            <button className="btn" autoFocus onClick={end}>{tr("Готово")}</button></div>}
          </div>
        </div>;
      })()}
      {nview != null && <div className="nv">
        <div className="nvbar"><button className="chip" onClick={closeNote}>{tr("Закрити")}</button><span className="sub">{ntext.split(/\s+/).filter(Boolean).length} {tr(" слів")}</span>
          {flow ? <button className="chip" onClick={() => setFlow(false)}>{tr("Готово")}</button> : <button className="chip" onClick={() => setFlow(true)}>{tr("Писати в потоці")}</button>}</div>
        {flow ? (() => { const ws = ntext.split(/\s+/).filter(Boolean); const tail = ws.slice(-7); return (
          <div className="flow" onClick={() => taRef.current && taRef.current.focus()}>
            <textarea ref={taRef} className="hid" autoFocus value={ntext} onChange={e => setNtext(e.target.value)} />
            <div className="fade">{tail.map((w, i) => <span key={ws.length - tail.length + i} style={{ opacity: Math.pow((i + 1) / tail.length, 2) }}>{w} </span>)}<span className="cur" /></div>
            <div className="sub fh">{tr("Пишіть без зупинки. Текст з’явиться, коли натиснете «Готово»")}</div>
          </div>); })() : <>
          <textarea className="ned" value={ntext} onChange={e => setNtext(e.target.value)} placeholder={tr("Почніть писати…")} />
          {folders.length > 0 && <select value={(notes.find(n => n.id === nview) || {}).folder || ''} onChange={e => setNotes(notes.map(n => n.id === nview ? { ...n, folder: e.target.value === '' ? '' : Number(e.target.value) } : n))} style={{ marginBottom: 10 }}><option value="">{tr("Без папки")}</option>{folders.map(fo => <option key={fo.id} value={fo.id}>{fo.name}</option>)}</select>}
          <button className="chip" onClick={delNote}>{tr("Видалити нотатку")}</button></>}
      </div>}

      {tt && <div className={'nv' + (win !== 'c' ? ' nvw tst' : '')}>
        <div className="nvbar"><button className="chip" onClick={() => setTview(null)}>{tr("Закрити")}</button><span className="sub">{tt.done ? tr("Результат") : (qi + 1) + tr(" з ") + tt.qs.length}</span>{win !== 'c' ? aiBtn : <span />}</div>
        {win !== 'c' && !tt.done && <div className="nvpg" role="progressbar" aria-label={tr("Прогрес")} aria-valuemin={0} aria-valuemax={tt.qs.length} aria-valuenow={qi + 1}><i style={{ width: (100 * (qi + 1) / tt.qs.length) + '%' }} /></div>}
        {!tt.done ? (() => { const q = tt.qs[qi]; return (
          <div className="quiz">
            <div className="qq">{q.q}</div>
            {q.type === 'choice' ? q.options.map((o, j) => <button key={j} className={'opt' + (tt.ans[qi] === j ? ' on' : '')} aria-pressed={win !== 'c' ? tt.ans[qi] === j : undefined} onClick={() => setAns(tt, qi, j)}>{win !== 'c' ? <><span className="opt-k" aria-hidden="true">{String.fromCharCode(65 + j)}</span><span className="opt-t">{o}</span></> : o}</button>)
              : <textarea rows={6} value={tt.ans[qi] || ''} onChange={e => setAns(tt, qi, e.target.value)} placeholder={tr("Ваша відповідь")} />}
            <div className={'row' + (win !== 'c' ? ' qnav' : '')} style={{ marginTop: 16 }}>{qi > 0 && <button className="btn alt" onClick={() => setQi(qi - 1)}>{tr("Назад")}</button>}
              {qi < tt.qs.length - 1 ? <button className="btn" onClick={() => setQi(qi + 1)}>{tr("Далі")}</button> : <button className="btn" onClick={() => patchTest(tt.id, { done: true })}>{tr("Завершити")}</button>}</div>
          </div>); })() : (
          <div className="quiz">
            <div className="big">{r1(tScore(tt))} {tr(" з ")}{tt.qs.length}</div><div className="sub" style={{ marginBottom: 16 }}>{Math.round(tScore(tt) / tt.qs.length * 100)}%</div>
            {tt.qs.some((q, i) => q.type === 'open' && (tt.ans[i] || '').trim() && !(tt.grades && tt.grades[i])) && <button className="btn" style={{ marginBottom: 14 }} onClick={() => gradeOpen(tt)} disabled={tbusy}>{tbusy ? tr("Перевіряю…") : tr("Оцінити відкриті відповіді через ШІ")}</button>}
            {tt.qs.map((q, i) => { const ok = okOf(tt, q, i); return (
              <div className="card" key={i}><div className="sec">{tr("Питання ")}{i + 1}</div><div className="t">{q.q}</div>
                <div className={'verdict ' + (ok === true ? 'ok' : ok === false ? 'bad' : '')}>{ok === true ? tr("Вірно") : ok === false ? tr("Невірно") : tr("Чекає на оцінку")}</div>
                {q.type === 'choice' ? <><div className="sub">{tr("Ваша відповідь: ")}{tt.ans[i] != null ? q.options[tt.ans[i]] : '—'}</div>{ok === false && <div className="sub">{tr("Правильна: ")}{q.options[q.answer]}</div>}</>
                  : <><div className="sub">{tr("Ваша відповідь: ")}{tt.ans[i] || '—'}</div><div className="sub">{tr("Еталон: ")}{q.answer}</div>{tt.grades && tt.grades[i] && <div className="sub">{r1(tt.grades[i].score)}: {tt.grades[i].comment}</div>}</>}
                {q.explain && <div className="note">{q.explain}</div>}
                {ok === false && (() => {
                  const key = tt.id + ':' + i, st = xbusy[key], txt = tt.expl && tt.expl[i], op = !!xopen[key], bid = 'xp-' + tt.id + '-' + i;
                  return <div className="xpl">
                    <button className="chip sm xpl-b" aria-expanded={op && (!!txt || !!st)} aria-controls={bid} onClick={() => { if (txt) setXopen(o => ({ ...o, [key]: !op })); else explainQ(tt, i); }} disabled={st === 'busy'}>
                      <Icon n="ai" s={16} />{txt ? (op ? tr("Сховати пояснення") : tr("Пояснення")) : tr("Поясни")}</button>
                    <div id={bid} className="xpl-o" aria-live="polite">
                      {op && st === 'busy' && <p className="xpl-l"><span className="typing" aria-hidden="true"><i /><i /><i /></span>{tr("Пояснюю…")}</p>}
                      {op && (st === 'err' || st === 'e401') && <div className="xpl-e" role="alert"><span>{st === 'e401' ? tr("Введіть пароль у налаштуваннях (шестерня вгорі) і повторіть запит.") : tr("Не вдалося отримати пояснення.")}</span><button className="chip sm" onClick={() => explainQ(tt, i)}>{tr("Повторити")}</button></div>}
                      {op && txt && !st && <div className="xpl-t"><Rich text={txt} /></div>}
                    </div>
                  </div>; })()}</div>); })}
            <div className="row"><button className="btn alt" onClick={() => cardsFromTest(tt)}>{tr("Картки з помилок")}</button><button className="btn alt" onClick={() => { patchTest(tt.id, { ans: {}, grades: {}, done: false }); setQi(0); setTmsg(''); }}>{tr("Пройти знову")}</button></div>
            {tmsg && <div className="sub">{tmsg}</div>}
          </div>)}
      </div>}


      {ctp && (() => {
        const nSel = ctp.rows.filter(r => r.on).length, dname = ctp.deck === 'new' ? ctp.draft.trim() : ctp.deck.slice(2);
        return <div className="ov" onClick={() => setCtp(null)} onKeyDown={e => { if (e.key === 'Escape') setCtp(null); }}><div className="sheet ctp" role="dialog" aria-modal="true" aria-labelledby="ctp-t" onClick={e => e.stopPropagation()}>
          <div className="shd"><h2 id="ctp-t">{tr("Картки з помилок")}</h2><button className="ib" onClick={() => setCtp(null)} aria-label={tr("Закрити")} title={tr("Закрити")}><Icon n="close" s={22} /></button></div>
          <label className="flab" htmlFor="ctp-deck">{tr("Набір")}</label>
          <select id="ctp-deck" autoFocus value={ctp.deck} onChange={e => setCtp({ ...ctp, deck: e.target.value })}>
            <option value="new">{tr("Новий набір…")}</option>{decks.map(d => <option key={d.name} value={'d:' + d.name}>{deckName(d.name)} · {nCards(d.all)}</option>)}</select>
          {ctp.deck === 'new' && <><label className="vh" htmlFor="ctp-name">{tr("Назва набору")}</label><input id="ctp-name" style={{ marginTop: 8 }} placeholder={tr("Назва набору")} value={ctp.draft} onChange={e => setCtp({ ...ctp, draft: e.target.value })} /></>}
          <div className="ctp-h"><span className="flab" id="ctp-l">{tr("Картки")} · {nSel}{tr(" з ")}{ctp.rows.length}</span>
            <button className="lnk" onClick={() => setCtp({ ...ctp, rows: ctp.rows.map(r => ({ ...r, on: nSel < ctp.rows.length })) })}>{nSel < ctp.rows.length ? tr("Позначити всі") : tr("Зняти всі")}</button></div>
          <ul className="ctp-l" aria-labelledby="ctp-l">{ctp.rows.map((r, k) => <li key={k}><label className="a-pvr">
            <input type="checkbox" checked={r.on} onChange={() => setCtp({ ...ctp, rows: ctp.rows.map((x, j) => (j === k ? { ...x, on: !x.on } : x)) })} />
            <span className="a-pvt"><span className="a-pvn">{r.q}</span><span className="a-pvm">{r.a}</span></span></label></li>)}</ul>
          <div className="row" style={{ marginTop: 14 }}><button className="btn-a" disabled={!nSel || !dname} onClick={confirmCtp}>{tr("Додати")} {nSel ? nSel + ' ' + plural(nSel, "картку", "картки", "карток") : ''}</button><button className="btn2" onClick={() => setCtp(null)}>{tr("Скасувати")}</button></div>
          {ctp.deck === 'new' && !dname && <p className="hint">{tr("Спершу напишіть назву набору.")}</p>}
        </div></div>;
      })()}

      {/* відновлення з резервної копії: превʼю → вибір «Додати до наявних» / «Замінити все» → підтвердження. Скасування нічого не змінює. */}
      {bk && (() => {
        const c = bk.info && bk.info.counts, busy = bk.step === 'busy';
        const when = bk.info && bk.info.created ? new Date(bk.info.created).toLocaleString(loc(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const close = () => { if (!busy) closeBk(); };
        return <div className="ov" onClick={close} onKeyDown={e => { if (e.key === 'Escape') close(); }}><div className="sheet bkd" role="dialog" aria-modal="true" aria-labelledby="bkd-t" aria-busy={busy || undefined} onClick={e => e.stopPropagation()}>
          <div className="shd"><h2 id="bkd-t">{bk.step === 'done' ? tr("Дані відновлено") : bk.step === 'error' ? tr("Не вдалося відновити") : tr("Відновити з копії")}</h2>
            <button className="ib" onClick={close} disabled={busy} aria-label={tr("Закрити")} title={tr("Закрити")}><Icon n="close" s={22} /></button></div>
          {busy && <p className="sub" role="status">{tr("Зачекайте…")}</p>}
          {bk.step === 'error' && <><p className="sub" role="alert">{bk.msg}</p><div className="row" style={{ marginTop: 14 }}><button className="btn2" autoFocus onClick={closeBk}>{tr("Закрити")}</button></div></>}
          {bk.step === 'preview' && c && <>
            <p className="bkd-f">{bk.name}{when ? ' · ' + tr("створено") + ' ' + when : ''}{bk.info.account ? ' · ' + bk.info.account : ''}</p>
            <p className="bkd-n" role="status">{tr("Знайдено")} {c.records} {plural(c.records, "запис", "записи", "записів")}, {c.docs} {plural(c.docs, "документ", "документи", "документів")}</p>
            <ul className="bkd-l">
              <li>{tr("Задачі, події й іспити")}: {c.items}</li><li>{tr("Нотатки")}: {c.notes}</li><li>{tr("Картки")}: {c.cards}</li>
              <li>{tr("Тести")}: {c.tests}</li><li>{tr("Папки")}: {c.folders}</li><li>{tr("Розмови з Помічником")}: {c.chats}</li>
              <li>{tr("Зошити, дошки, фото й PDF")}: {c.docs} ({c.pages} {tr("с.")})</li>
            </ul>
            <div className="flab" id="bkd-m">{tr("Як відновити")}</div>
            <div className="bkd-ms" role="radiogroup" aria-labelledby="bkd-m">
              {[['merge', tr("Додати до наявних"), tr("Поточні дані лишаються. З копії додається те, чого тут ще немає.")], ['replace', tr("Замінити все"), tr("Поточні записи, матеріали й налаштування буде замінено даними з копії.")]].map(([k, n, s]) =>
                <label key={k} className={'bkd-o' + (bk.mode === k ? ' on' : '')}><input type="radio" name="bkd-mode" checked={bk.mode === k} onChange={() => setBk({ ...bk, mode: k })} /><span><b>{n}</b><small>{s}</small></span></label>)}
            </div>
            {bk.mode === 'replace' && <p className="hint err bkd-w">{tr("Те, чого немає в копії, буде видалено. Якщо поточні дані потрібні, спершу збережіть їх.")} <button className="lnk" onClick={saveBackup} disabled={bkBusy}>{tr("Зберегти поточні дані")}</button></p>}
            <div className="row" style={{ marginTop: 14 }}>
              <button className={'btn' + (bk.mode === 'replace' ? ' danger' : '')} onClick={doRestore}>{bk.mode === 'replace' ? tr("Замінити все") : tr("Додати дані")}</button>
              <button className="btn alt" onClick={closeBk}>{tr("Скасувати")}</button></div>
          </>}
          {bk.step === 'done' && <><p className="sub" role="status">{bk.mode === 'replace' ? tr("Відновлено з копії") : tr("Додано з копії")}: {bk.added.records} {plural(bk.added.records, "запис", "записи", "записів")}, {bk.added.docs} {plural(bk.added.docs, "документ", "документи", "документів")}.</p>
            <div className="row" style={{ marginTop: 14 }}><button className="btn" autoFocus onClick={() => { closeBk(); setTab('today'); }}>{tr("Готово")}</button></div></>}
        </div></div>;
      })()}

      {exV != null && (() => {
        const e = items.find(i => i.id === exV); if (!e) return null;
        const n = daysTo(e.due, today), fo = folders.find(x => x.id === e.folder);
        const fNotes = fo ? notes.filter(x => x.folder === fo.id && x.text && x.text.trim()) : [];
        const close = () => setExV(null);
        return <div className="ov" onClick={close} onKeyDown={k => { if (k.key === 'Escape') close(); }}><div className="sheet exd" role="dialog" aria-modal="true" aria-labelledby="exd-t" onClick={k => k.stopPropagation()}>
          <div className="shd"><h2 id="exd-t"><span className="ex-k"><Icon n="flag" s={18} />{tr("Іспит")}</span>{e.t}</h2><button className="ib" autoFocus onClick={close} aria-label={tr("Закрити")} title={tr("Закрити")}><Icon n="close" s={22} /></button></div>
          <div className={'exd-cd' + (n >= 0 && n <= 7 ? ' soon' : '')}><b>{n > 1 ? n : n === 1 ? tr("Завтра") : n === 0 ? tr("Сьогодні") : tr("Минув")}</b>{n > 1 && <span>{getLang() === 'de' ? (n === 1 ? 'Tag' : 'Tage') : plural(n, "день", "дні", "днів")} {tr("до іспиту")}</span>}</div>
          <dl className="exd-l">
            <div><dt>{tr("Дата")}</dt><dd>{cap1(new Date(e.due + 'T00:00:00').toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}{e.time ? ', ' + e.time : ''}</dd></div>
            <div><dt>{tr("Матеріали")}</dt><dd>{fo ? <button className="lnk" onClick={() => { close(); setFview(fo.id); setTab('folders'); }}>{fo.name}{fNotes.length ? ' · ' + fNotes.length + ' ' + plural(fNotes.length, "нотатка", "нотатки", "нотаток") : ''}</button> : <span className="sub">{tr("Папку не вибрано")}</span>}</dd></div>
            {e.note && <div><dt>{tr("Нотатка")}</dt><dd>{e.note}</dd></div>}
          </dl>
          <button className="btn-a big exd-go" onClick={() => planExam(e)} disabled={n < 0}><Icon n="ai" s={20} />{tr("Скласти план підготовки")}</button>
          <p className="hint">{tr("Помічник запропонує задачі по днях до іспиту з урахуванням ваших годин на день. Ви переглянете їх перед додаванням.")}</p>
          <div className="row" style={{ marginTop: 12 }}><button className="btn2" onClick={() => { close(); openEdit(e); }}>{tr("Змінити")}</button></div>
        </div></div>;
      })()}

      {toast && <div className="toast" role="status" onMouseEnter={() => setToast(t => t && { ...t, hold: true })} onMouseLeave={() => setToast(t => t && { ...t, hold: false })} onFocus={() => setToast(t => t && { ...t, hold: true })} onBlur={() => setToast(t => t && { ...t, hold: false })}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
        <span>{toast.text}</span>{toast.undo && <button className="a-tl" onClick={() => { toast.undo(); setToast({ text: tr("Скасовано") }); }}>{tr("@undo:Скасувати")}</button>}</div>}

      <nav className="nav" aria-label={tr("Розділи")}>{TABS.map(([k, n, ic]) => <button key={k} onClick={() => goTab(k)} aria-current={k === tab ? 'page' : undefined}><Icon n={ic} s={24} /><span className="lbl">{tr(n)}</span></button>)}</nav>
    </div>
  );
}
