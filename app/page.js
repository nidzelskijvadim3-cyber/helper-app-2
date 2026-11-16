'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import Docs, { bridge, listDocs, putDoc, delDoc, newDoc, shrink, reparentDocs, moveDoc } from './docs';
import { canMoveFolder, folderPath, shade } from './lib';
import { syncNow, syncStatus, getSyncMeta, setSyncOn } from './sync';
import { nsKey, listAccounts, getActiveId, setActiveId, addAccount, activeAccount, deriveAccountId, validateCredentials } from './accounts';
import { t as tr, loc, setLang, getLang } from './i18n';

const DN = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DNF = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'п’ятниця', 'субота'];
const AREA = { study: 'Навчання', work: 'Робота', personal: 'Особисте', health: 'Здоров’я', home: 'Дім' };
const REP = { none: 'Не повторювати', daily: 'Щодня', weekdays: 'У будні', weekly: 'Щотижня' };
const REPS = { daily: 'щодня', weekdays: 'у будні', weekly: 'щотижня' };
const ACCENTS = ['#0a84ff', '#ff375f', '#ff9f0a', '#30d158', '#bf5af2', '#64d2ff', '#ffd60a', '#ff453a'];
// accent і font зафіксовані (акцент і шрифт задаються в globals.css); поля лишаються в даних для сумісності із синхронізацією, але ігноруються.
const UI0 = { theme: 'dark', accent: '#0a84ff', font: 'sf', lang: 'uk' };
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
  set: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>
};
const Icon = ({ n, s = 24 }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[n]}</svg>;

const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const r1 = x => Math.round(x * 10) / 10;
const hm = m => pad(Math.floor(m / 60) % 24) + ':' + pad(Math.round(m % 60));
const dm = s => s.slice(8) + '.' + s.slice(5, 7);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const isTime = s => /^\d{2}:\d{2}$/.test(s || '');
const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const isEv = i => i.kind === 'event';
const isRep = i => !!i.repeat && i.repeat !== 'none';
const normArea = v => (tr(AREA[v]) ? v : 'personal');
const normRep = v => (REP[v] ? v : 'none');
const EMPTY = { kind: 'task', t: '', area: 'study', h: '', due: '', time: '', pri: 1, note: '', repeat: 'none', folder: '' };

function occurs(i, d) {
  if (!i.due) return false;
  if (!isRep(i)) return i.due === d;
  if (d < i.due) return false;
  const wd = new Date(d + 'T00:00:00').getDay();
  if (i.repeat === 'daily') return true;
  if (i.repeat === 'weekdays') return wd >= 1 && wd <= 5;
  if (i.repeat === 'weekly') return wd === new Date(i.due + 'T00:00:00').getDay();
  return false;
}

function makePlan(items, cap) {
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < 60; i++) { const d = new Date(t0); d.setDate(d.getDate() + i); days.push({ d, date: ymd(d), cap: cap[d.getDay()], blocks: [] }); }
  const tasks = items.filter(x => !isEv(x));
  for (const it of tasks.filter(isRep)) for (const day of days) if (occurs(it, day.date)) day.blocks.push({ id: it.id, t: it.t, h: it.h, area: it.area, rep: true, done: (it.doneDates || []).includes(day.date) });
  const open = tasks.filter(x => !isRep(x) && !x.done).map(x => ({ ...x, left: x.h }));
  open.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.pri || 1) - (a.pri || 1) || a.id - b.id);
  const late = [];
  for (const it of open) {
    for (const day of days) {
      if (it.left <= 0) break;
      if (it.due && day.date > it.due) break;
      const free = day.cap - day.blocks.reduce((s, b) => s + b.h, 0);
      if (free <= 0) continue;
      const h = Math.min(free, it.left);
      day.blocks.push({ id: it.id, t: it.t, h, area: it.area }); it.left -= h;
    }
    if (it.left > 0.001) late.push({ t: it.t, left: it.left });
  }
  return { days, late };
}

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
      items.push({ id: nid(), kind: 'task', t: String(a.t), area: normArea(a.area), h: Number(a.h) > 0 ? Number(a.h) : 1, due: isDate(a.due) ? a.due : '', time: '', pri: Number(a.pri) === 2 ? 2 : 1, note: '', repeat: normRep(a.repeat), folder: resolveF(a.folder), done: false }); n++;
    } else if (a.type === 'add_event' && a.t && isDate(a.date)) {
      items.push({ id: nid(), kind: 'event', t: String(a.t), area: normArea(a.area), h: Number(a.h) > 0 ? Number(a.h) : 1, due: a.date, time: isTime(a.time) ? a.time : '09:00', pri: 1, note: '', repeat: normRep(a.repeat), folder: resolveF(a.folder), done: false }); n++;
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
      for (const c of a.cards) if (c && c.q && c.a) { cards.push({ id: nid(), deck: String(a.deck || ''), q: String(c.q), a: String(c.a), known: false, seq: nid() }); n++; }
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

async function callAI(body) {
  let r;
  try {
    r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pass': localStorage.getItem('helper-pass') || '' }, body: JSON.stringify({ ...body, lang: getLang() }) });
  } catch (e) { throw new Error(tr("Немає зв’язку із сервером.")); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { const err = new Error(tr("Введіть пароль у налаштуваннях (шестерня вгорі) і повторіть запит.")); err.code = 401; throw err; }
  if (!d.text) throw new Error(d.error || tr("Порожня відповідь"));
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
const FOLDER_ICONS = ['📁', '🦷', '📚', '✏️', '🧪', '🔬', '💉', '🩺', '🇩🇪', '🇬🇧', '🇺🇦', '💼', '🏠', '🛒', '✈️', '🎓', '📝', '💡', '⭐', '❤️', '🎨', '🎵', '📌', '🧠', '💻', '🍎', '🏃', '💰', '🌸', '🌿', '🐱', '☕'];
function FolderArt({ fo, name, sub }) {
  const c = fo.color || '#0a84ff';
  return (
    <div className="fold" style={{ '--fb': shade(c, -0.28), '--ff': shade(c, 0.14), '--fc': c }}>
      <div className="fback"><i className="ftab" /></div>
      <div className="fsheet" />
      <div className="ffront" style={fo.cover ? { backgroundImage: 'url(' + fo.cover + ')' } : undefined}>
        {fo.cover && <div className="fshade" />}
        {fo.icon ? <span className={'fglyph' + (fo.cover ? ' sm' : '')}>{fo.icon}</span> : null}
        <div className="fname">{name}</div>{sub != null && <div className="fsub">{sub}</div>}
      </div>
    </div>);
}

export default function Home() {
  const [tab, setTab] = useState('today');
  const [items, setItems] = useState([]);
  const [cap, setCap] = useState([3, 2, 2, 2, 2, 2, 3]);
  const [start, setStart] = useState(17);
  const [cards, setCards] = useState([]);
  const [notes, setNotes] = useState([]);
  const [tests, setTests] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [undo, setUndo] = useState(null);
  const [inp, setInp] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [f, setF] = useState(EMPTY);
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
  const [stab, setStab] = useState('cards');
  const [tcfg, setTcfg] = useState({ topic: '', n: 5, kind: 'mix' });
  const [tbusy, setTbusy] = useState(false);
  const [tmsg, setTmsg] = useState('');
  const [tview, setTview] = useState(null);
  const [qi, setQi] = useState(0);
  const [folders, setFolders] = useState([]);
  const [ui, setUi] = useState(UI0);
  setLang(ui.lang);
  const [fview, setFview] = useState(null);
  const [fform, setFform] = useState(null);
  const [nfold, setNfold] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [acf, setAcf] = useState({ name: '', pass: '', busy: false, err: '' });
  const [sy, setSy] = useState({ on: false, state: 'idle', last: 0, msg: '', configured: null });
  const [see, setSee] = useState(false);
  const [att, setAtt] = useState([]);
  const [docUndo, setDocUndo] = useState([]);
  const [pv, setPv] = useState('day');
  const [more, setMore] = useState(true);
  const [, setTick] = useState(0);
  const taRef = useRef(null);
  const endRef = useRef(null);
  const stRef = useRef(null);
  const sheetPrev = useRef(null);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(nsKey('helper-next')) || '{}');
      if (s.items) setItems(s.items); if (s.cap) setCap(s.cap); if (s.msgs) setMsgs(s.msgs);
      if (s.start) setStart(s.start); if (s.cards) setCards(s.cards); if (s.notes) setNotes(s.notes); if (s.tests) setTests(s.tests); { const sm = getSyncMeta(); setSy(x => ({ ...x, on: !!sm.on, last: sm.last || 0 })); } if (s.folders) setFolders(s.folders.map(f => ({ parent: '', ...f }))); if (s.ui) setUi({ ...UI0, ...s.ui });
    } catch (e) {}
    try { const v = localStorage.getItem(PV_KEY); if (VIEWS.some(([k]) => k === v)) setPv(v); } catch (e) {}
    setReady(true);
  }, []);
  // лінія «зараз» на шкалі дня: перемальовувати раз на хвилину
  useEffect(() => { const iv = setInterval(() => setTick(x => x + 1), 60000); return () => clearInterval(iv); }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem(nsKey('helper-next'), JSON.stringify({ items, cap, msgs, start, cards, notes, tests, folders, ui })); } catch (e) {} } }, [items, cap, msgs, start, cards, notes, tests, folders, ui, ready]);
  useEffect(() => {
    if (!ready) return;
    const r = document.documentElement;
    r.lang = ui.lang === 'de' ? 'de' : 'uk'; r.dataset.theme = ui.theme;
  }, [ui, ready]);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'end' }); }, [msgs, busy, tab]);
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
  if (!ready) return null;

  const now = new Date();
  const today = ymd(now);
  const selDate = sel || today;
  const applySt = st => { setItems(st.items); setCap(st.cap); setStart(st.start); setCards(st.cards); setNotes(st.notes); if (st.folders) setFolders(st.folders); };
  const closeSheet = () => setSheet(null);
  const openNote = id => {
    if (id === 'new') { setNview(Date.now()); setNtext(''); setNfold(typeof fview === 'number' ? fview : ''); setFlow(true); }
    else { const n = notes.find(x => x.id === id); setNview(id); setNtext(n ? n.text : ''); setFlow(false); }
  };
  const closeNote = () => { setNotes(notes.filter(n => n.text.trim())); setNview(null); setNtext(''); setFlow(false); };
  const newNote = flowMode => { openNote('new'); setFlow(flowMode); };
  const delNote = () => { setNotes(notes.filter(n => n.id !== nview)); setNview(null); setNtext(''); setFlow(false); };
  // expanded=false: sheet відкривається з полем швидкого вводу зверху і згорнутою повною формою (FAB на телефоні)
  const openNew = (expanded = true) => { sheetPrev.current = document.activeElement; setF({ ...EMPTY, due: selDate !== today ? selDate : '', folder: tab === 'folders' && typeof fview === 'number' ? fview : '' }); setMore(expanded !== false); setSheet('new'); };
  const setPlanView = v => { setPv(v); try { localStorage.setItem(PV_KEY, v); } catch (e) {} };
  const goTab = k => {
    if (k === tab) { if (k === 'today') setSel(''); if (k === 'folders') setFview(null); return; }
    setTab(k);
  };
  const openEdit = i => { if (!i) return; sheetPrev.current = document.activeElement; setF({ kind: i.kind || 'task', t: i.t, area: i.area, h: String(i.h), due: i.due || '', time: i.time || '', pri: i.pri || 1, note: i.note || '', repeat: i.repeat || 'none', folder: i.folder || '' }); setSheet(i.id); };
  const saveTask = () => {
    if (!f.t.trim()) return;
    const h = parseFloat(f.h);
    const ev = f.kind === 'event';
    const rep = f.repeat || 'none';
    const base = { kind: f.kind, t: f.t.trim(), area: f.area, h: h > 0 ? h : 1, due: f.due || (ev || rep !== 'none' || isTime(f.time) ? selDate : ''), time: ev ? (f.time || '09:00') : (isTime(f.time) ? f.time : ''), pri: Number(f.pri) || 1, note: f.note.trim(), repeat: rep, folder: f.folder === '' || f.folder == null ? '' : Number(f.folder) };
    if (sheet === 'new') setItems([...items, { id: Date.now(), ...base, done: false }]);
    else setItems(items.map(i => i.id === sheet ? { ...i, ...base } : i));
    closeSheet();
  };
  const tog = (id, date) => setItems(items.map(i => {
    if (i.id !== id) return i;
    if (isRep(i)) { const ds = i.doneDates || []; return { ...i, doneDates: ds.includes(date) ? ds.filter(x => x !== date) : [...ds, date] }; }
    return { ...i, done: !i.done, doneAt: !i.done ? today : null };
  }));
  const del = id => { setItems(items.filter(i => i.id !== id)); closeSheet(); };
  const saveFolder = () => {
    if (!fform || !fform.name.trim()) return;
    const fo = { id: fform.id || Date.now(), name: fform.name.trim(), color: fform.color, cover: fform.cover || '', icon: fform.icon || '', parent: fform.parent == null ? '' : fform.parent };
    setFolders(fform.id ? folders.map(x => x.id === fo.id ? fo : x) : [...folders, fo]); setFform(null);
  };
  const delFolder = () => {
    const id = fform.id, up = fform.parent == null ? '' : fform.parent;
    setItems(items.map(i => i.folder === id ? { ...i, folder: up } : i)); setNotes(notes.map(n => n.folder === id ? { ...n, folder: up } : n));
    setFolders(folders.filter(x => x.id !== id).map(x => x.parent === id ? { ...x, parent: up } : x));
    reparentDocs(id, up).catch(() => {});
    setFform(null); setFview(up === '' ? null : up);
  };
  const dropDoc = async (e, fid) => {
    e.preventDefault(); e.currentTarget.classList.remove('drop');
    const id = Number(e.dataTransfer.getData('text/doc'));
    if (id) { try { await moveDoc(id, fid); } catch (er) {} }
  };
  const folderTile = fo => (
    <div className="foldw" key={fo.id} data-fid={fo.id} onClick={() => setFview(fo.id)}
      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drop'); }} onDragLeave={e => e.currentTarget.classList.remove('drop')} onDrop={e => dropDoc(e, fo.id)}>
      <FolderArt fo={fo} name={fo.name} sub={notes.filter(n => n.folder === fo.id).length + items.filter(i => i.folder === fo.id).length + folders.filter(x => x.parent === fo.id).length} />
    </div>);
  const pickCover = file => {
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => { const img = new Image(); img.onload = () => {
      const sc = Math.min(1, 700 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      setFform(p => ({ ...p, cover: c.toDataURL('image/jpeg', 0.72) }));
    }; img.src = rd.result; };
    rd.readAsDataURL(file);
  };

  const makeCtx = () => {
    const s0 = stRef.current;
    const next21days = Array.from({ length: 21 }, (_, k) => { const d = new Date(); d.setDate(d.getDate() + k); return ymd(d) + ' ' + DNF[d.getDay()]; });
    return {
      today, weekday: DNF[now.getDay()], next21days, start: s0.start, capacityByWeekday: s0.cap,
      tasks: s0.items.filter(i => isEv(i) || isRep(i) || !i.done).slice(-80).map(({ id, kind, t, area, h, due, time, repeat, pri }) => ({ id, kind: kind || 'task', t, area, h, due, time, repeat: repeat || 'none', pri: pri || 1 }))
    };
  };

  const screenInfo = () => {
    const o = { tab };
    if (tab === 'today') { o.date = selDate; o.view = pv; }
    if (tab === 'folders' && fview != null) { const fo = folders.find(x => x.id === fview); o.folder = fo ? fo.name : tr("Усі нотатки"); }
    if (nview != null) o.openNote = ntext.slice(0, 3000);
    if (bridge.info) o.openDocument = bridge.info();
    return o;
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
  async function ask(text) {
    if (busy || (!text.trim() && !att.length)) return;
    const imgs = [...att];
    if (see && bridge.getImage) { try { const im = bridge.getImage(); if (im) imgs.push(im); } catch (e) {} }
    const next = [...msgs, { role: 'user', text: text.trim() || tr("Подивись на зображення."), pics: imgs.length }];
    setMsgs(next); setInp(''); setAtt([]); setBusy(true);
    try {
      const ctx = makeCtx();
      ctx.folders = folders.map(({ id, name, parent }) => ({ id, name, parent: parent || '' }));
      ctx.notes = notes.slice(0, 40).map(n => ({ id: n.id, t: n.text.split('\n')[0].slice(0, 50), folder: n.folder || '' }));
      ctx.docs = (await listDocs()).slice(0, 60).map(({ id, title, type, folder }) => ({ id, title, type, folder: folder || '' }));
      ctx.screen = see ? screenInfo() : { tab };
      const raw = await callAI({ messages: next.slice(-12).map((m, i, arr) => ({ role: m.role, text: m.text, images: i === arr.length - 1 && imgs.length ? imgs : undefined })), ctx });
      const { reply, actions } = parseAI(raw);
      let n = 0;
      if (actions.length) {
        const cur = stRef.current; const res = applyActions(actions, cur); n = res.n;
        if (n) { setUndo(cur); applySt(res.st); setDocUndo(res.docOps.length ? await runDocOps(res.docOps) : []); }
      }
      setMsgs([...next, { role: 'model', text: reply || (n ? tr("Готово.") : tr("Порожня відповідь")), n }]);
    } catch (e) {
      if (e.code === 401) { setAiOpen(false); setTab('set'); }
      setMsgs([...next, { role: 'model', text: e.message }]);
    }
    setBusy(false);
  }
  const doUndo = async () => {
    if (!undo) return;
    applySt({ ...undo, notes: undo.notes || [] });
    for (const o of docUndo) { try { if (o.del) await delDoc(o.del); else await putDoc(o.put); } catch (e) {} }
    setDocUndo([]); setUndo(null);
  };
  const addPics = async files => {
    const out = [];
    for (const f of Array.from(files || []).slice(0, 3 - att.length)) { try { out.push(await shrink(f, 1024, 0.72)); } catch (e) {} }
    if (out.length) setAtt(p => [...p, ...out].slice(0, 3));
  };
  const grow = el => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; };
  const aiPanel = sheetMode => {
    const SUGG = [[tr("Склади план на тиждень з моїх задач"), tr("Автоматично розкласти задачі за днями"), true], [tr("Що робити просто зараз?"), tr("Підказка, з чого почати"), true], [tr("Створи зошит для предмета: "), tr("Новий зошит у потрібній папці"), false], [tr("Зроби картки за темою: "), tr("Питання й відповіді за темою"), false]];
    return (
      <div className={'aiw ' + (sheetMode ? 'sm' : 'tab')}>
        <div className="aihd">
          <span className="avatar"><Icon n="ai" s={18} /></span>
          <div className="aht"><b>{tr("Помічник")}</b><small>{busy ? tr("Думаю…") : tr("Керує задачами, подіями, папками й документами")}</small></div>
          {msgs.length > 0 && <button className="ib" onClick={() => setMsgs([])} aria-label={tr("Очистити")} title={tr("Очистити")}><Icon n="trash" s={20} /></button>}
          {sheetMode && <button className="ib" onClick={() => setAiOpen(false)} aria-label={tr("Закрити")} title={tr("Закрити")}><Icon n="close" s={22} /></button>}
        </div>
        <div className="amsgs">
          {!msgs.length && <div className="empty-ai"><div className="avatar big"><Icon n="ai" s={26} /></div><h2>{tr("Чим допомогти?")}</h2>
            <div className="sugg">{SUGG.map(([q, d, go]) => <button className="sg" key={q} onClick={() => (go ? ask(q) : setInp(q))}>{q.replace(': ', '…')}<small>{d}</small></button>)}</div></div>}
          {msgs.map((x, i) => x.role === 'user'
            ? <div className="um" key={i}>{x.text}{x.pics > 0 && <div className="applied" style={{ color: 'inherit', opacity: 0.8 }}>{tr("Додано зображень:")} {x.pics}</div>}</div>
            : <div className="am" key={i}><span className="avatar sm"><Icon n="ai" s={13} /></span><div className="at"><Rich text={x.text} />{x.n > 0 && <div className="chg">{tr("Внесено змін:")} {x.n}</div>}</div></div>)}
          {busy && <div className="am"><span className="avatar sm"><Icon n="ai" s={13} /></span><div className="at"><span className="typing"><i /><i /><i /></span></div></div>}
          {undo && <div className="undoc"><span>{tr("ШІ змінив застосунок")}</span><button className="chip" onClick={doUndo}>{tr("Скасувати зміни")}</button></div>}
          <div ref={endRef} />
        </div>
        <div className="comp">
          {att.length > 0 && <div className="atts">{att.map((u, i) => <div className="att" key={i} style={{ backgroundImage: 'url(' + u + ')' }}><button onClick={() => setAtt(att.filter((_, j) => j !== i))} aria-label={tr("Прибрати")}>×</button></div>)}</div>}
          <div className="cbox">
            <textarea className="cta" rows={1} placeholder={tr("Напишіть, що зробити або що пояснити")} value={inp}
              onChange={e => { setInp(e.target.value); grow(e.target); }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 700) { e.preventDefault(); ask(inp); } }} />
            <div className="crow">
              <label className="cb" aria-label={tr("Фото")} title={tr("Фото")}><Icon n="image" s={21} /><input type="file" accept="image/*" multiple className="hidefile" onChange={e => { addPics(e.target.files); e.target.value = ''; }} /></label>
              <button className={'cb' + (see ? ' on' : '')} onClick={() => setSee(!see)} aria-label={tr("Показати ШІ цей екран")} title={tr("Показати ШІ цей екран")}><Icon n="eye" s={21} />{see && <span className="cbl">{tr("Екран")}</span>}</button>
              <span className="flex1" />
              <button className="send" onClick={() => ask(inp)} disabled={busy || (!inp.trim() && !att.length)} aria-label={tr("Надіслати")} title={tr("Надіслати")}><Icon n="send" s={20} /></button>
            </div>
          </div>
        </div>
      </div>);
  };

  async function quickAdd() {
    const text = qa.trim();
    if (!text || qaBusy) return;
    setQaBusy(true); setQaMsg(''); setPreview(null);
    try {
      const raw = await callAI({ mode: 'parse', messages: [{ role: 'user', text }], ctx: makeCtx() });
      const { reply, actions } = parseAI(raw);
      if (actions.length) setPreview({ actions, reply });
      else setQaMsg(reply || tr("Не вдалося розібрати. Уточніть дату і час."));
    } catch (e) { setQaMsg(e.message); }
    setQaBusy(false);
  }
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
    if (a.type === 'add_note') return tr("Нотатка");
    if (a.type === 'add_cards') return tr("Картки: ") + ((a.cards || []).length);
    return tr("Зміна налаштувань");
  };

  async function createTest() {
    if (!tcfg.topic.trim() || tbusy) return;
    setTbusy(true); setTmsg('');
    try {
      const raw = await callAI({ mode: 'quiz', messages: [{ role: 'user', text: tcfg.topic }], ctx: { n: Number(tcfg.n), kind: tcfg.kind } });
      const q = parseQuiz(raw);
      if (!q) throw new Error(tr("ШІ повернув тест у неправильному форматі. Спробуйте ще раз."));
      const t = { id: Date.now(), title: q.title || tcfg.topic.slice(0, 40), qs: q.questions, ans: {}, grades: {}, done: false, created: Date.now() };
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
  const cardsFromTest = t => {
    const bad = t.qs.map((q, i) => ({ q, i })).filter(({ q, i }) => okOf(t, q, i) !== true);
    const add = bad.map(({ q }, k) => ({ id: Date.now() + k, deck: t.title, q: q.q, a: (q.type === 'choice' ? q.options[q.answer] : q.answer) + (q.explain ? '\n' + q.explain : ''), known: false, seq: Date.now() + k }));
    setCards([...cards, ...add]); setTmsg(add.length ? tr("Додано карток: ") + add.length : tr("Помилок немає, картки не потрібні."));
  };

  const row = i => (
    <div className={'it' + (i.done ? ' done' : '')} key={i.id}>
      {isEv(i) ? <span className="evd" /> : <input type="checkbox" aria-label={i.t} checked={isRep(i) ? (i.doneDates || []).includes(today) : !!i.done} onChange={() => tog(i.id, today)} />}
      <div className="b" role="button" tabIndex={0} onClick={() => openEdit(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(i); } }}><div className="t">{i.t}</div>
        <div className="meta"><span className={'tag ' + i.area}>{tr(AREA[i.area])}</span>
          {isEv(i) ? <span>{i.due && !isRep(i) ? dm(i.due) + ' ' : ''}{i.time}</span> : <span>{i.h} {tr(" год")}</span>}
          {!isEv(i) && !isRep(i) && i.due && <span className={!i.done && i.due < today ? 'late' : ''}>{tr("до ")}{dm(i.due)}</span>}
          {isRep(i) && <span>{tr(REPS[i.repeat])}</span>}{i.pri === 2 && <span className="late">{tr("Важливо")}</span>}</div>
        {i.note && <div className="note">{i.note}</div>}</div>
    </div>);
  const section = (title, list) => list.length > 0 && <div className="card"><div className="sec">{title}</div>{list.map(row)}</div>;

  const oneOff = items.filter(i => !isEv(i) && !isRep(i));
  const open = oneOff.filter(i => !i.done);
  const byDue = (a, b) => a.due.localeCompare(b.due);
  const overdue = open.filter(i => i.due && i.due < today).sort(byDue);
  const soon = open.filter(i => i.due && i.due >= today).sort(byDue);
  const nodue = open.filter(i => !i.due);
  const doneList = oneOff.filter(i => i.done);
  const upEv = items.filter(i => isEv(i) && !isRep(i) && i.due >= today).sort((a, b) => (a.due + (a.time || '')).localeCompare(b.due + (b.time || '')));
  const repList = items.filter(isRep);
  const evOn = d => items.filter(i => isEv(i) && occurs(i, d)).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const doneToday = items.filter(i => !isEv(i) && ((i.done && i.doneAt === today) || (i.doneDates || []).includes(today))).length;
  const openH = open.reduce((s, i) => s + i.h, 0);
  const dayPlan = plan.days.find(d => d.date === selDate);
  const doneOnDay = oneOff.filter(i => i.done && i.doneAt === selDate);
  const shiftDay = n => { const d = new Date(selDate + 'T00:00:00'); d.setDate(d.getDate() + n); setSel(ymd(d) === today ? '' : ymd(d)); };
  const dateStr = now.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' });
  const selLabel = new Date(selDate + 'T00:00:00').toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' });
  const left = cards.filter(c => !c.known).sort((a, b) => a.seq - b.seq);
  const cur = left[0];
  const addCard = () => { if (!cq.trim() || !ca.trim()) return; setCards([...cards, { id: Date.now(), deck: '', q: cq.trim(), a: ca.trim(), known: false, seq: Date.now() }]); setCq(''); setCa(''); };

  const cm = calM == null ? now.getFullYear() * 12 + now.getMonth() : calM;
  const cy = Math.floor(cm / 12), cmo = cm % 12;
  const offset = (new Date(cy, cmo, 1).getDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...Array.from({ length: new Date(cy, cmo + 1, 0).getDate() }, (_, k) => cy + '-' + pad(cmo + 1) + '-' + pad(k + 1))];
  const planDays = {}; plan.days.forEach(d => { if (d.blocks.length) planDays[d.date] = true; });
  const hasDot = d => planDays[d] || evOn(d).length > 0 || open.some(i => i.due === d);
  const monthRaw = new Date(cy, cmo, 1).toLocaleDateString(loc(), { month: 'long', year: 'numeric' });
  const monthName = monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1); // «Листопад 2026 р.»: велика лише перша літера
  const tt = tests.find(t => t.id === tview);
  const ev = f.kind === 'event';

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
  const dayTasks = [...tlItems.filter(b => b.kind === 'task'), ...moreList];
  const dayDone = dayTasks.filter(x => x.done).length;
  const dayEmpty = !tlItems.length && !moreList.length;
  const moreMeta = x => [r1(Number(x.h) || 0) + tr(" год"), x.pri === 2 ? tr("важлива") : '', x.rep && x.repeat ? tr(REPS[x.repeat]) : '', !x.rep && x.due && x.due !== selDate ? tr("до ") + dm(x.due) : ''].filter(Boolean).join(' · ');

  // ===== План · Усі: групи за датою =====
  const tomorrow = addD(today, 1);
  const weekEnd = addD(today, 6 - (now.getDay() + 6) % 7);
  const byWhen = (a, b) => ((a.due || '') + (a.time || '')).localeCompare((b.due || '') + (b.time || ''));
  const recs = [...open, ...items.filter(i => isEv(i) && !isRep(i) && i.due >= today)].sort(byWhen);
  const allGroups = [
    [tr("Прострочені"), recs.filter(i => i.due && i.due < today), true],
    [tr("Сьогодні"), recs.filter(i => i.due === today)],
    [tr("Завтра"), recs.filter(i => i.due === tomorrow)],
    [tr("Цей тиждень"), recs.filter(i => i.due > tomorrow && i.due <= weekEnd)],
    [tr("Пізніше"), recs.filter(i => i.due > weekEnd && i.due > tomorrow)],
    [tr("Без дати"), recs.filter(i => !i.due)],
    [tr("Повторювані"), repList]
  ];
  const doneSorted = [...doneList].sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));

  // ===== шапка Плану: заголовок, перемикач видів, навігація датами =====
  const curMonth = now.getFullYear() * 12 + now.getMonth();
  const planHead = (
    <header className="ph">
      <div className="ph-t">
        {pv === 'day' && <><span className="date"><span className="phone-only">{dayShort}</span><span className="wide-only">{selObj.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })}</span></span><h1>{dayTitle}</h1></>}
        {pv === 'month' && <><span className="date">{tr("План")}</span><h1>{monthName}</h1></>}
        {pv === 'all' && <><span className="date">{tr("Відкритих: ")}{open.length}</span><h1>{tr("Усі задачі")}</h1></>}
      </div>
      <div className="views">
        <div role="group" aria-label={tr("Вид плану")} style={{ display: 'flex', gap: 8 }}>
          {VIEWS.map(([k, n]) => <button key={k} className="pill" aria-pressed={pv === k} onClick={() => setPlanView(k)}>{tr(n)}</button>)}
        </div>
        {pv === 'day' && !dayEmpty && <span className="sum phone-only">{tr("Виконано")} {dayDone}{tr(" з ")}{dayTasks.length}</span>}
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
    </header>);

  // підтвердження розібраного швидкого вводу (наявний парсер) — у рядку на iPad і в sheet на телефоні
  const previewCard = inSheet => preview && (
    <div className="card"><div className="sec">{tr("Додати це?")}</div>{preview.actions.map((a, i) => <div className="blk" key={i}><span>{act2text(a)}</span></div>)}{preview.reply && <div className="sub" style={{ marginTop: 8 }}>{preview.reply}</div>}
      <div className="row"><button className="btn" onClick={() => { confirmPreview(); if (inSheet) closeSheet(); }}>{tr("Додати")}</button><button className="btn alt" onClick={() => setPreview(null)}>{tr("Скасувати")}</button></div></div>);
  const quickInput = (id, inSheet) => (
    <div className={'qbar' + (inSheet ? '' : ' wide-only')}>
      <label className="vh" htmlFor={id}>{tr("Швидко додати")}</label>
      <input id={id} autoFocus={inSheet && !more} placeholder={tr("Швидко додати: стоматолог у пʼятницю о 13:00")} value={qa} onChange={e => setQa(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); quickAdd(); } }} />
      <button className="qgo" disabled={qaBusy} onClick={() => { if (qa.trim()) quickAdd(); else if (inSheet) setMore(true); else openNew(true); }}>{qaBusy ? '…' : tr("Додати")}</button>
    </div>);

  const syncCls = sy.state === 'error' ? ' err' : sy.on ? ' ok' : '';
  const syncTxt = sy.state === 'error' ? tr("Помилка синхронізації") : sy.on ? tr("Синхронізацію ввімкнено") : tr("Синхронізацію вимкнено");
  const acc = activeAccount();
  const meLetter = (acc && acc.name ? String(acc.name).trim().charAt(0).toUpperCase() : '') || tr("Я");

  return (
    <div className="wrap">
      <button className={'me' + syncCls + (tab === 'set' ? ' cur' : '')} onClick={() => setTab('set')} aria-label={tr("Налаштування") + '. ' + syncTxt} title={tr("Налаштування") + ' · ' + syncTxt} aria-current={tab === 'set' ? 'page' : undefined}>{meLetter}<i aria-hidden="true" /></button>

      {tab === 'today' && <>
        {planHead}
        {quickInput('qa-main', false)}
        {!sheet && (qaMsg || preview) && <div className="wide-only">{qaMsg && <div className="sub qmsg">{qaMsg}</div>}{previewCard(false)}</div>}

        {pv === 'day' && <>
          {!dayEmpty && <p className="sum wide-only">{tr("Виконано")} {dayDone}{tr(" з ")}{dayTasks.length}{moreH > 0 ? ' · ' + tr("ще ≈") + ' ' + r1(moreH) + tr(" год") : ''}</p>}
          <div className={'dayg' + (moreList.length ? ' two' : '')}>
            <div className="daymain">
              {isToday && overdue.length > 0 && <div className="card warn"><div className="sec">{tr("Прострочено")}</div>{overdue.map(row)}</div>}
              {dayEmpty
                ? <div className="emptyday"><p>{selDate < today ? tr("Минулий день.") : tr("На цей день нічого немає.")}</p>
                  {selDate >= today && <button className="btn2" onClick={() => { setTab('ai'); ask(tr("Що мені краще зробити сьогодні і в якому порядку?")); }}>{tr("Скласти план із ШІ")}</button>}</div>
                : tlItems.length > 0 && <section className="tl" aria-label={tr("Шкала дня")} style={{ height: 'calc(var(--hh) * ' + (tlH1 - tlH0) + ' + 8px)' }}>
                  {Array.from({ length: tlH1 - tlH0 + 1 }, (_, k) => <span key={k} className="tl-h" aria-hidden="true" style={{ top: 'calc(var(--hh) * ' + k + ')' }}>{pad((tlH0 + k) % 24 === 0 && k > 0 ? 24 : tlH0 + k)}:00</span>)}
                  <div className="tl-g" aria-hidden="true" style={{ height: 'calc(var(--hh) * ' + (tlH1 - tlH0) + ' + 1px)' }} />
                  {tlItems.map(b => {
                    const st = { top: hhPos(b.s), height: 'max(44px, calc(var(--hh) * ' + ((b.e - b.s) / 60).toFixed(4) + ' - 4px))', left: 'calc(var(--tlx) + (100% - var(--tlx)) * ' + (b.col / b.n).toFixed(4) + ')', width: 'calc((100% - var(--tlx)) / ' + b.n + (b.n > 1 ? ' - 4px' : '') + ')' };
                    const when = hm(b.s) + '–' + (b.e >= 1440 ? '24:00' : hm(b.e));
                    const it = items.find(i => i.id === b.id);
                    const ar = normArea(b.area);
                    const short = b.e - b.s < 50;
                    return b.kind === 'event'
                      ? <button key={'e' + b.id} className={'tlb ev c-' + ar + (short ? ' short' : '')} style={st} onClick={() => openEdit(it)}><span className="tlt">{b.t}</span><span className="tls">{when} · {tr(AREA[ar])}{b.rep ? tr(", повтор") : ''}</span></button>
                      : <div key={'t' + b.id} className={'tlb tk c-' + ar + (b.done ? ' done' : '') + (short ? ' short' : '')} style={st}><input type="checkbox" checked={!!b.done} onChange={() => tog(b.id, selDate)} aria-label={b.t} /><button className="tlbtn" onClick={() => openEdit(it)}><span className="tlt">{b.t}</span><span className="tls">{when}</span></button></div>;
                  })}
                  {showNow && <div className="now" style={{ top: hhPos(nowMin) }}><span className="vh">{tr("Зараз")} {hm(nowMin)}</span></div>}
                </section>}
              {isToday && plan.late.length > 0 && <div className="card warn"><div className="sec">{tr("Не вміщується в план")}</div>{plan.late.map((l, i) => <div className="blk" key={i}><span>{l.t}</span><span>{r1(l.left)} {tr(" год")}</span></div>)}</div>}
            </div>
            {moreList.length > 0 && <aside className="more-day" aria-labelledby="more-title">
              <div className="mh"><h2 className="mh-t" id="more-title">{isToday ? tr("Ще на сьогодні") : tr("Ще на цей день")}</h2>{moreH > 0 && <small>≈ {r1(moreH)} {tr(" год")}</small>}</div>
              <div className="mlist">{moreList.map(x => (
                <div key={'m' + x.id} className={'mi' + (x.done ? ' done' : '')}>
                  <input type="checkbox" checked={x.done} onChange={() => tog(x.id, selDate)} aria-label={x.t} />
                  <button className="mbtn" onClick={() => openEdit(items.find(i => i.id === x.id))}><span className="mt">{x.t}</span><span className={'mm' + (x.pri === 2 && !x.done ? ' imp' : '')}>{moreMeta(x)}</span></button>
                </div>))}</div>
            </aside>}
          </div>
        </>}

        {pv === 'month' && <div className="monthv">
          <div className="cal">
            {[tr("Пн"), tr("Вт"), tr("Ср"), tr("Чт"), tr("Пт"), tr("Сб"), tr("Нд")].map(w => <div className="cw" key={w} aria-hidden="true">{w}</div>)}
            {cells.map((d, i) => d
              ? <button key={i} className={'cd' + (d === today ? ' td' : '') + (d === selDate && d !== today ? ' sel' : '')} aria-current={d === today ? 'date' : undefined}
                  aria-label={new Date(d + 'T00:00:00').toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' }) + (hasDot(d) ? ', ' + tr("є записи") : '')}
                  onClick={() => { setSel(d === today ? '' : d); setPlanView('day'); }}>{+d.slice(8)}{hasDot(d) && <i className="dot" aria-hidden="true" />}</button>
              : <div key={i} />)}
          </div>
          <p className="sub" style={{ marginTop: 14 }}>{tr("Торкніться дня, щоб відкрити його план.")}</p>
        </div>}

        {pv === 'all' && <div className="allv">
          {!recs.length && !repList.length && <div className="card"><div className="empty">{tr("Відкритих задач немає.")}</div></div>}
          {allGroups.map(([title, list, warn]) => list.length > 0 && <div className={'card' + (warn ? ' warn' : '')} key={title}><div className="sec">{title}<span className="cnt">{list.length}</span></div>{list.map(row)}</div>)}
          {doneSorted.length > 0 && <details className="card grp"><summary><span>{tr("Виконані")}<span className="cnt">{doneSorted.length}</span></span><Icon n="chevD" s={20} /></summary>{doneSorted.map(row)}</details>}
        </div>}
      </>}

      {tab === 'folders' && fview == null && <>
        <div className="top"><h1>{tr("Матеріали")}</h1><div className="sub">{tr("Групуйте нотатки й задачі. Торкніться плитки, щоб відкрити, або «+», щоб створити папку.")}</div></div>
        <div className="fgrid">
          <div className="foldw" onClick={() => setFview('all')}><FolderArt fo={{ color: '#8e8e93', icon: '🗂️' }} name={tr("Усі нотатки")} sub={notes.length} /></div>
          {folders.filter(fo => fo.parent === '').map(folderTile)}
        </div>
        <Docs folderId={null} folders={folders} onNewNote={newNote} />
      </>}

      {tab === 'folders' && fview != null && (() => {
        const fo = folders.find(x => x.id === fview);
        const nl = notes.filter(n => fview === 'all' || n.folder === fview).filter(n => n.text.toLowerCase().includes(nq.toLowerCase()));
        const il = fo ? items.filter(i => i.folder === fo.id) : [];
        return <>
          <div className="top"><button className="chip" data-fid={fo && fo.parent !== '' && fo.parent != null ? fo.parent : ''} onClick={() => { setFview(fo && fo.parent !== '' && fo.parent != null ? fo.parent : null); setNq(''); }} onDragOver={e => e.preventDefault()} onDrop={e => dropDoc(e, fo && fo.parent !== '' && fo.parent != null ? fo.parent : '')}>‹ {fo && fo.parent !== '' && fo.parent != null ? ((folders.find(x => x.id === fo.parent) || {}).name || tr("Назад")) : tr("Матеріали")}</button><h1>{fo ? fo.name : tr("Усі нотатки")}</h1>{fo && <div className="sub">{folderPath(folders, fo.id)}</div>}
            <div className="daynav"><button className="chip" onClick={() => openNote('new')}>{tr("Нова нотатка")}</button>{fo && <button className="chip" onClick={() => openNew(true)}>{tr("Нова задача")}</button>}{fo && <button className="chip" onClick={() => setFform({ name: '', color: ACCENTS[0], cover: '', parent: fo.id })}>{tr("Нова підпапка")}</button>}{fo && <button className="chip" onClick={() => setFform({ ...fo })}>{tr("Змінити")}</button>}</div></div>
          {fo && folders.some(x => x.parent === fo.id) && <div className="fgrid" style={{ marginBottom: 16 }}>{folders.filter(x => x.parent === fo.id).map(folderTile)}</div>}
          <input placeholder={tr("Пошук нотаток")} value={nq} onChange={e => setNq(e.target.value)} style={{ marginBottom: 14 }} />
          {il.length > 0 && <div className="card"><div className="sec">{tr("Задачі й події")}</div>{il.map(row)}</div>}
          {nl.map(n => (
            <div className="card" key={n.id} onClick={() => openNote(n.id)}>
              <div className="t" style={{ fontWeight: 600 }}>{n.text.split('\n')[0].slice(0, 60)}</div>
              <div className="note">{n.text.slice(0, 120)}</div>
              <div className="meta"><span>{new Date(n.upd).toLocaleDateString(loc())}</span><span>{n.text.split(/\s+/).filter(Boolean).length} {tr(" слів")}</span></div>
            </div>))}
          {!nl.length && !il.length && <div className="card"><div className="empty">{tr("Тут поки порожньо.")}</div></div>}
          <Docs folderId={fview} folders={folders} onNewNote={newNote} />
        </>;
      })()}

      {tab === 'cards' && <>
        <div className="top"><h1>{tr("Навчання")}</h1>
          <div className="seg" style={{ marginTop: 14 }}><button className={stab === 'cards' ? 'on' : ''} onClick={() => setStab('cards')}>{tr("Картки")}</button><button className={stab === 'tests' ? 'on' : ''} onClick={() => setStab('tests')}>{tr("Тести")}</button></div></div>

        {stab === 'cards' && <>
          <div className="sub" style={{ marginBottom: 12 }}>{tr("Залишилось ")}{left.length} {tr(" з ")}{cards.length}</div>
          {cur ? <div className="flip" onClick={() => setShow(!show)}><div className="sub">{cur.deck || tr("Без колоди")}</div><div className="fq">{show ? cur.a : cur.q}</div><div className="sub">{show ? tr("Відповідь") : tr("Торкніться, щоб побачити відповідь")}</div></div>
            : <div className="card"><div className="empty">{cards.length ? tr("Усі картки вивчено!") : tr("Карток ще немає. Попросіть ШІ створити їх за темою, додайте вручну або створіть із помилок у тесті.")}</div></div>}
          {cur && show && <div className="row">
            <button className="btn" onClick={() => { setCards(cards.map(c => c.id === cur.id ? { ...c, known: true } : c)); setShow(false); }}>{tr("Знаю")}</button>
            <button className="btn alt" onClick={() => { setCards(cards.map(c => c.id === cur.id ? { ...c, seq: Date.now() } : c)); setShow(false); }}>{tr("Ще раз")}</button></div>}
          <div className="card"><div className="sec">{tr("Нова картка")}</div>
            <input placeholder={tr("Питання")} value={cq} onChange={e => setCq(e.target.value)} />
            <div className="row"><input placeholder={tr("Відповідь")} value={ca} onChange={e => setCa(e.target.value)} /></div>
            <button className="btn" onClick={addCard}>{tr("Додати картку")}</button>
            {cards.length > 0 && <div style={{ marginTop: 10 }}><button className="chip" onClick={() => setCards(cards.map(c => ({ ...c, known: false })))}>{tr("Почати спочатку")}</button>{cur && <button className="chip" onClick={() => { setCards(cards.filter(c => c.id !== cur.id)); setShow(false); }}>{tr("Видалити цю картку")}</button>}</div>}
          </div>
        </>}

        {stab === 'tests' && <>
          <div className="card"><div className="sec">{tr("Новий тест")}</div>
            <textarea rows={4} placeholder={tr("Тема або матеріал. Наприклад: Present Perfect, німецькі артиклі, анатомія зуба, або вставте свій конспект")} value={tcfg.topic} onChange={e => setTcfg({ ...tcfg, topic: e.target.value })} />
            <div className="row"><select value={tcfg.n} onChange={e => setTcfg({ ...tcfg, n: e.target.value })}><option value={5}>{tr("5 питань")}</option><option value={10}>{tr("10 питань")}</option><option value={15}>{tr("15 питань")}</option><option value={20}>{tr("20 питань")}</option><option value={25}>{tr("25 питань")}</option><option value={30}>{tr("30 питань")}</option></select>
              <select value={tcfg.kind} onChange={e => setTcfg({ ...tcfg, kind: e.target.value })}><option value="mix">{tr("Змішаний")}</option><option value="choice">{tr("Тільки з варіантами")}</option><option value="open">{tr("Відкриті питання")}</option></select></div>
            <button className="btn" onClick={createTest} disabled={tbusy}>{tbusy ? tr("Складаю тест…") : tr("Створити тест")}</button>
            {tmsg && <div className="sub" style={{ marginTop: 10 }}>{tmsg}</div>}</div>
          {tests.length > 0 && <div className="card"><div className="sec">{tr("Мої тести")}</div>{tests.map(t => (
            <div className="it" key={t.id}><div className="b" onClick={() => { setTview(t.id); setQi(0); setTmsg(''); }}><div className="t">{t.title}</div>
              <div className="meta"><span>{new Date(t.created).toLocaleDateString(loc())}</span><span>{t.done ? r1(tScore(t)) + tr(" з ") + t.qs.length : tr("не завершено")}</span></div></div>
              <button className="x" onClick={() => setTests(tests.filter(x => x.id !== t.id))} aria-label={tr("Видалити")}>×</button></div>))}</div>}
        </>}
      </>}

      {tab === 'ai' && aiPanel(false)}

      {tab === 'set' && <>
        <div className="top"><h1>{tr("Налаштування")}</h1></div>
        <div className="card"><div className="sec">Мова / Sprache</div><div className="seg">{[['uk', 'Українська'], ['de', 'Deutsch']].map(([k, n]) => <button key={k} className={ui.lang === k ? 'on' : ''} onClick={() => setUi({ ...ui, lang: k })}>{n}</button>)}</div></div>
        <div className="card"><div className="sec">{tr("Акаунт")}</div>
          <div className="sub" style={{ marginBottom: 10 }}>{activeAccount() ? tr("Вхід виконано як") + ': ' + activeAccount().name : tr("Локальний профіль (без акаунта)")}</div>
          {(listAccounts().length > 0) && <div className="prow">{listAccounts().map(a => <button key={a.id} className={'chip' + (a.id === getActiveId() ? ' on' : '')} style={{ margin: 0 }} onClick={() => switchAcc(a.id)}>{a.name}</button>)}{getActiveId() && <button className="chip" style={{ margin: 0 }} onClick={() => switchAcc('')}>{tr("Локальний профіль")}</button>}</div>}
          <div className="sec" style={{ marginTop: 14 }}>{tr("Створити акаунт або увійти")}</div>
          <input placeholder={tr("Ім’я акаунта")} value={acf.name} autoCapitalize="none" autoCorrect="off" onChange={e => setAcf({ ...acf, name: e.target.value })} />
          <input type="password" style={{ marginTop: 8 }} placeholder={tr("Пароль акаунта (від 6 символів)")} value={acf.pass} onChange={e => setAcf({ ...acf, pass: e.target.value })} />
          {acf.err && <div className="sub" style={{ color: 'var(--wn)', marginTop: 8 }}>{acf.err}</div>}
          <button className="btn" style={{ marginTop: 12 }} onClick={enterAcc} disabled={acf.busy}>{acf.busy ? tr("Зачекайте…") : tr("Увійти або створити")}</button>
          <div className="sub" style={{ marginTop: 10 }}>{tr("Той самий акаунт на іншому пристрої: введіть те саме ім’я та пароль.")}</div></div>
        <div className="card"><div className="sec">{tr("Синхронізація")}</div>
          <div className="sub" style={{ marginBottom: 10 }}>{sy.on ? tr("Увімкнено") : tr("Вимкнено")}{sy.last ? ', ' + tr("остання синхронізація") + ': ' + new Date(sy.last).toLocaleString(loc(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</div>
          {sy.msg && <div className="sub" style={{ color: 'var(--wn)', marginBottom: 10 }}>{sy.msg}</div>}
          <button className="btn" onClick={() => { if (sy.on) runSync(); else toggleSync(); }} disabled={sy.state === 'syncing'}>{sy.state === 'syncing' ? tr("Синхронізую…") : tr("Синхронізувати зараз")}</button>
          <button className={'tg' + (sy.on ? ' on' : '')} onClick={toggleSync}><span>{tr("Автосинхронізація")}</span><b>{sy.on ? '✓' : ''}</b></button></div>
        <div className="card"><div className="sec">{tr("Тема")}</div><div className="seg">{[['dark', tr("Темна")], ['light', tr("Світла")], ['auto', tr("Авто")]].map(([k, n]) => <button key={k} className={ui.theme === k ? 'on' : ''} onClick={() => setUi({ ...ui, theme: k })}>{n}</button>)}</div></div>
        <div className="card"><div className="sec">{tr("О котрій годині починаєте займатися")}</div>
          <input type="number" min="0" max="23" value={start} onChange={e => setStart(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))} /></div>
        <div className="card"><div className="sec">{tr("Годин на день для задач")}</div>
          {[1, 2, 3, 4, 5, 6, 0].map(i => <div className="row" style={{ alignItems: 'center' }} key={i}><span style={{ width: 36 }}>{tr(DN[i])}</span>
            <input type="number" min="0" max="16" step="0.5" value={cap[i]} onChange={e => setCap(cap.map((c, j) => j === i ? Math.max(0, parseFloat(e.target.value) || 0) : c))} /></div>)}</div>
        <div className="card"><div className="sec" id="pass-title">{tr("Пароль доступу до ШІ та синхронізації")}</div>
          <div className="sub" id="pass-hint" style={{ marginBottom: 10 }}>{tr("Потрібен, якщо власник застосунку встановив пароль. Без нього ШІ та синхронізація не працюватимуть.")}</div>
          <input type="password" placeholder={tr("Пароль")} aria-labelledby="pass-title" aria-describedby="pass-hint" defaultValue={localStorage.getItem('helper-pass') || ''} onChange={e => localStorage.setItem('helper-pass', e.target.value)} /></div>
        <button className="btn alt" onClick={() => setTab('today')}>{tr("Назад")}</button>
      </>}

      {/* один «+» на екран: План — FAB лише на телефоні (на iPad — рядок швидкого вводу); Матеріали — нова папка */}
      {tab === 'today' && <button className="fab phone-only" onClick={() => openNew(false)} aria-label={tr("Додати задачу або подію")} title={tr("Додати задачу або подію")}><Icon n="plus" s={26} /></button>}
      {tab === 'folders' && fview == null && <button className="fab" onClick={() => setFform({ name: '', color: ACCENTS[0], cover: '', parent: '' })} aria-label={tr("Нова папка")} title={tr("Нова папка")}><Icon n="plus" s={26} /></button>}

      {sheet && <div className="ov" onClick={closeSheet}><div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={e => e.stopPropagation()}>
        <div className="shd"><h2 id="sheet-title">{sheet === 'new' ? (!more ? tr("Новий запис") : ev ? tr("Нова подія") : tr("Нова задача")) : (ev ? tr("Змінити подію") : tr("Змінити задачу"))}</h2>
          <button className="ib" onClick={closeSheet} aria-label={tr("Закрити")} title={tr("Закрити")}><Icon n="close" s={22} /></button></div>
        {sheet === 'new' && <>
          {quickInput('qa-sheet', true)}
          {qaMsg && <div className="sub qmsg">{qaMsg}</div>}
          {previewCard(true)}
          <button className="more" aria-expanded={more} aria-controls="full-form" onClick={() => setMore(!more)}><span>{tr("Більше параметрів")}</span><Icon n="chevD" s={20} /></button>
        </>}
        {(sheet !== 'new' || more) && <div id="full-form">
        <div className="seg"><button className={!ev ? 'on' : ''} onClick={() => setF({ ...f, kind: 'task' })}>{tr("Задача")}</button><button className={ev ? 'on' : ''} onClick={() => setF({ ...f, kind: 'event' })}>{tr("Подія")}</button></div>
        <input style={{ marginTop: 12 }} autoFocus={sheet !== 'new' || more} placeholder={ev ? tr("Наприклад: стоматолог") : tr("Що потрібно зробити або вивчити")} value={f.t} onChange={e => setF({ ...f, t: e.target.value })} />
        <div className="row"><select value={f.area} onChange={e => setF({ ...f, area: e.target.value })}>{Object.entries(AREA).map(([k, v]) => <option key={k} value={k}>{tr(v)}</option>)}</select>
          {ev ? <input type="time" aria-label={tr("Час")} title={tr("Час")} value={f.time} onChange={e => setF({ ...f, time: e.target.value })} /> : <input type="number" min="0.5" step="0.5" placeholder={tr("Годин")} value={f.h} onChange={e => setF({ ...f, h: e.target.value })} />}</div>
        <div className="row"><input type="date" aria-label={tr("Дата")} title={tr("Дата")} value={f.due} onChange={e => setF({ ...f, due: e.target.value })} />
          {ev ? <input type="number" min="0.5" step="0.5" placeholder={tr("Тривалість, год")} value={f.h} onChange={e => setF({ ...f, h: e.target.value })} /> : <select value={f.pri} onChange={e => setF({ ...f, pri: e.target.value })}><option value={1}>{tr("Звичайна")}</option><option value={2}>{tr("Важлива")}</option></select>}</div>
        <div className="row"><select value={f.repeat} onChange={e => setF({ ...f, repeat: e.target.value })}>{Object.entries(REP).map(([k, v]) => <option key={k} value={k}>{tr(v)}</option>)}</select>
          {!ev && <input type="time" aria-label={tr("Час (необов’язково)")} title={tr("Час (необов’язково)")} value={f.time} onChange={e => setF({ ...f, time: e.target.value })} />}</div>
        {folders.length > 0 && <div className="row"><select value={f.folder} onChange={e => setF({ ...f, folder: e.target.value })}><option value="">{tr("Без папки")}</option>{folders.map(fo => <option key={fo.id} value={fo.id}>{fo.name}</option>)}</select></div>}
        <textarea rows={2} placeholder={tr("Нотатка (необов’язково)")} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
        <div className="row"><button className="btn" onClick={saveTask}>{sheet === 'new' ? tr("Додати") : tr("Зберегти")}</button>
          {sheet !== 'new' && <button className="btn alt" onClick={() => del(sheet)}>{tr("Видалити")}</button>}</div>
        </div>}
      </div></div>}

      {fform && <div className="ov" onClick={() => setFform(null)}><div className="sheet" onClick={e => e.stopPropagation()}>
        <b>{fform.id ? tr("Папка") : tr("Нова папка")}</b>
        <div className="foldprev"><FolderArt fo={fform} name={fform.name || tr("Назва папки")} /></div>
        <input style={{ marginTop: 12 }} autoFocus placeholder={tr("Назва папки")} value={fform.name} onChange={e => setFform({ ...fform, name: e.target.value })} />
        <div className="sec" style={{ marginTop: 14 }}>{tr("Розташування")}</div>
        <select value={fform.parent == null ? '' : fform.parent} onChange={e => setFform({ ...fform, parent: e.target.value === '' ? '' : Number(e.target.value) })}>
          <option value="">{tr("Головний рівень")}</option>{folders.filter(x => x.id !== fform.id && (!fform.id || canMoveFolder(folders, fform.id, x.id))).map(x => <option key={x.id} value={x.id}>{folderPath(folders, x.id)}</option>)}</select>
        <div className="sec" style={{ marginTop: 14 }}>{tr("Колір")}</div>
        <div className="sw">{ACCENTS.map(c => <button key={c} className={'swatch' + (fform.color === c ? ' on' : '')} style={{ background: c }} onClick={() => setFform({ ...fform, color: c })} aria-label={c} />)}
          <input type="color" className="cpick" value={fform.color} onChange={e => setFform({ ...fform, color: e.target.value })} aria-label={tr("Свій колір")} /></div>
        <div className="sec" style={{ marginTop: 14 }}>{tr("Іконка")}</div>
        <div className="icogrid"><button className={'ico' + (!fform.icon ? ' on' : '')} onClick={() => setFform({ ...fform, icon: '' })} aria-label={tr("Без іконки")}>∅</button>{FOLDER_ICONS.map(ic => <button key={ic} className={'ico' + (fform.icon === ic ? ' on' : '')} onClick={() => setFform({ ...fform, icon: ic })}>{ic}</button>)}</div>
        <div className="sec" style={{ marginTop: 14 }}>{tr("Обкладинка")}</div>
        <div className="row"><label className="chip fileb">{tr("Обрати фото")}<input type="file" accept="image/*" className="hidefile" onChange={e => { pickCover(e.target.files && e.target.files[0]); e.target.value = ''; }} /></label>
          {fform.cover && <button className="chip" onClick={() => setFform({ ...fform, cover: '' })}>{tr("Прибрати фото")}</button>}</div>
        <div className="row"><button className="btn" onClick={saveFolder}>{tr("Зберегти")}</button>{fform.id && <button className="btn alt" onClick={delFolder}>{tr("Видалити")}</button>}</div>
      </div></div>}

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

      {tt && <div className="nv">
        <div className="nvbar"><button className="chip" onClick={() => setTview(null)}>{tr("Закрити")}</button><span className="sub">{tt.done ? tr("Результат") : (qi + 1) + tr(" з ") + tt.qs.length}</span><span /></div>
        {!tt.done ? (() => { const q = tt.qs[qi]; return (
          <div className="quiz">
            <div className="qq">{q.q}</div>
            {q.type === 'choice' ? q.options.map((o, j) => <button key={j} className={'opt' + (tt.ans[qi] === j ? ' on' : '')} onClick={() => setAns(tt, qi, j)}>{o}</button>)
              : <textarea rows={6} value={tt.ans[qi] || ''} onChange={e => setAns(tt, qi, e.target.value)} placeholder={tr("Ваша відповідь")} />}
            <div className="row" style={{ marginTop: 16 }}>{qi > 0 && <button className="btn alt" onClick={() => setQi(qi - 1)}>{tr("Назад")}</button>}
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
                {q.explain && <div className="note">{q.explain}</div>}</div>); })}
            <div className="row"><button className="btn alt" onClick={() => cardsFromTest(tt)}>{tr("Картки з помилок")}</button><button className="btn alt" onClick={() => { patchTest(tt.id, { ans: {}, grades: {}, done: false }); setQi(0); setTmsg(''); }}>{tr("Пройти знову")}</button></div>
            {tmsg && <div className="sub">{tmsg}</div>}
          </div>)}
      </div>}

      {aiOpen && <div className="ov ai" onClick={() => setAiOpen(false)}><div className="sheet aisheet" onClick={e => e.stopPropagation()}>{aiPanel(true)}</div></div>}

      <nav className="nav" aria-label={tr("Розділи")}>{TABS.map(([k, n, ic]) => <button key={k} onClick={() => goTab(k)} aria-current={k === tab ? 'page' : undefined}><Icon n={ic} s={24} /><span className="lbl">{tr(n)}</span></button>)}</nav>
    </div>
  );
}
