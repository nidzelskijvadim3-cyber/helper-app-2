'use client';
// Помічник (стиль C): розмови з історією, стартові дії з даних, картка-превʼю дій, режим «Навчання»,
// контекст (матеріал / набір / фото), посилання [с. N], голосовий ввід. Дії застосовує page.js (applyActions) через apply().
import { useState, useEffect, useRef } from 'react';
import { t as tr, loc, getLang, plural } from './i18n';
import { listDocs, getDocFull, docPageImages, shrink } from './docs';

const P = {
  ai: <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />,
  hist: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v4l3 2" /></>,
  newc: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  send: <path d="M12 19V5M5 12l7-7 7 7" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="2" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M15 6l-6 6 6 6" />,
  trash: <><path d="M5 7h14M10 7V4h4v3" /><path d="M7 7l1 13h8l1-13" /></>,
  plan: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  cards: <><rect x="3" y="7" width="14" height="12" rx="2" /><path d="M7 4h12a2 2 0 0 1 2 2v10" /></>,
  doc: <><path d="M6 3h9l3 3v15H6z" /><path d="M9 11h6M9 15h4" /></>,
  now: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></>,
  check: <path d="M5 13l4 4L19 7" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>
};
const I = ({ n, s = 20 }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[n]}</svg>;

const MAX_CHATS = 50;
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const isTime = s => /^\d{2}:\d{2}$/.test(s || '');
const r1 = x => Math.round(x * 10) / 10;
const AREA = { study: 'Навчання', work: 'Робота', personal: 'Особисте', health: 'Здоров’я', home: 'Дім' };
const REPS = { daily: 'щодня', weekdays: 'у будні', weekly: 'щотижня' };
const DNF = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'п’ятниця', 'субота'];
const clean = raw => String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
function parseAI(raw) {
  try { const o = JSON.parse(clean(raw)); return { reply: String(o.reply || ''), actions: Array.isArray(o.actions) ? o.actions.filter(a => a && typeof a === 'object' && typeof a.type === 'string') : [] }; }
  catch (e) { return { reply: String(raw), actions: [] }; }
}
// Назва розмови — перші слова першого запиту
export const chatTitle = s => { const w = String(s || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 7).join(' '); return w.length > 48 ? w.slice(0, 47) + '…' : (w || tr("Розмова")); };
// Старі дані: один масив msgs → перша розмова
export function migrateChats(s) {
  if (Array.isArray(s.chats)) return s.chats;
  if (Array.isArray(s.msgs) && s.msgs.length) {
    const first = s.msgs.find(m => m && m.role === 'user');
    return [{ id: Date.now(), title: chatTitle(first ? first.text : ''), mode: 'chat', ctx: null, msgs: s.msgs, upd: Date.now() }];
  }
  return [];
}
const pagesStr = ps => {
  const a = [...new Set(ps)].sort((x, y) => x - y), out = [];
  for (let i = 0; i < a.length; i++) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; out.push(j > i ? a[i] + '–' + a[j] : String(a[i])); i = j; }
  return out.join(', ');
};
export const ctxLabel = c => (!c ? '' : c.k === 'doc' && c.pages && c.pages.length ? c.title + ' · ' + tr("с.") + ' ' + pagesStr(c.pages) : c.title);
const whenStr = ts => {
  const d = new Date(ts), t0 = new Date(); t0.setHours(0, 0, 0, 0); const d0 = new Date(d); d0.setHours(0, 0, 0, 0);
  const diff = Math.round((t0 - d0) / 864e5);
  if (diff === 0) return tr("сьогодні") + ', ' + d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return tr("вчора");
  return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' });
};
const dayStr = s => new Date(s + 'T00:00:00').toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short' });
const durStr = h => { const v = Number(h) > 0 ? Number(h) : 1; return v < 1 ? Math.round(v * 60) + ' ' + tr("хв") : r1(v) + ' ' + tr("год"); };

// Групи дій у картці-превʼю
const GROUP = t => (t === 'add_task' || t === 'add_event' || t === 'add_exam' ? 'plan' : t === 'delete_task' ? 'del' : ['add_note', 'add_cards', 'create_folder', 'create_doc'].includes(t) ? 'create' : 'change');
const GORDER = ['plan', 'create', 'change', 'del'];

// Розмітка відповіді: **жирний**, `код`, списки, посилання на сторінки [с. N]
const REF_RE = /(\*\*[^*]+\*\*|`[^`]+`|\[(?:с|c|С|S|s)\.?\s*\d+(?:\s*[–-]\s*\d+)?\])/g;
function AText({ text, refDoc, onRef }) {
  const inline = (str, k) => String(str).split(REF_RE).map((p, i) => {
    const key = k + '-' + i;
    const m = p.match(/^\[(?:с|c|С|S|s)\.?\s*(\d+)(?:\s*[–-]\s*(\d+))?\]$/);
    if (m) {
      const n = Number(m[1]), lab = tr("с.") + ' ' + m[1] + (m[2] ? '–' + m[2] : '');
      return refDoc ? <button key={key} className="a-pg" onClick={() => onRef(n)} aria-label={tr("Відкрити") + ' «' + refDoc.title + '», ' + tr("сторінка") + ' ' + n}>{lab}</button> : <span key={key} className="a-pg off">{lab}</span>;
    }
    if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) return <b key={key}>{p.slice(2, -2)}</b>;
    if (p.length > 2 && p.startsWith('`') && p.endsWith('`')) return <code key={key}>{p.slice(1, -1)}</code>;
    return p;
  });
  return <>{String(text || '').split('\n').map((l, i) => {
    const m = l.match(/^\s*([-•*]|\d+[.)])\s+(.*)$/);
    if (m) return <div className="li" key={i}><span>{/\d/.test(m[1]) ? m[1] : '•'}</span><span>{inline(m[2], i)}</span></div>;
    return l.trim() === '' ? <div className="gap" key={i} /> : <p key={i}>{inline(l, i)}</p>;
  })}</>;
}

const SR = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null);

export default function Assistant(props) {
  const { side, onClose, chats, setChats, curId, setCurId, call, buildState, apply, undo, items, notes, cards, folders, lastMat, pending, clearPending, onReview, onOpenRef, on401, rev, exam, onExamPlan } = props;
  const [draft, setDraft] = useState({ mode: 'chat', ctx: null });
  const [view, setView] = useState('chat'); // chat | history
  const [inp, setInp] = useState('');
  const [att, setAtt] = useState([]);
  const [busy, setBusy] = useState(null); // id розмови, що чекає відповіді
  const [online, setOnline] = useState(true);
  const [menu, setMenu] = useState(false);
  const [pick, setPick] = useState(null); // { step: 'mat'|'pages'|'deck', ... }
  const [mats, setMats] = useState([]);
  const [toast, setToast] = useState(null);
  const [live, setLive] = useState('');
  const [copied, setCopied] = useState(null);
  const [rec, setRec] = useState(false);
  const [voiceErr, setVoiceErr] = useState('');
  const [hasSR, setHasSR] = useState(false);
  const [delAsk, setDelAsk] = useState(null);
  const taRef = useRef(null), endRef = useRef(null), abortRef = useRef(null), plusRef = useRef(null), menuRef = useRef(null), histBtn = useRef(null), histH = useRef(null), recRef = useRef(null), fileRef = useRef(null), lastPics = useRef([]), pickRet = useRef(null);

  const saved = chats.find(c => c.id === curId) || null;
  const cur = saved || { id: null, title: '', mode: draft.mode, ctx: draft.ctx, msgs: [] };
  const msgs = cur.msgs;
  const learn = cur.mode === 'learn';
  const isBusy = busy != null;
  const busyHere = busy != null && busy === cur.id;

  const upChat = (id, fn) => setChats(cs => cs.map(c => (c.id === id ? fn(c) : c)));
  const setMode = m => { if (saved) upChat(saved.id, c => ({ ...c, mode: m })); else setDraft(d => ({ ...d, mode: m })); };
  const setCtx = x => { if (saved) upChat(saved.id, c => ({ ...c, ctx: x })); else setDraft(d => ({ ...d, ctx: x })); };

  useEffect(() => {
    setHasSR(!!SR());
    const up = () => setOnline(navigator.onLine !== false); up();
    window.addEventListener('online', up); window.addEventListener('offline', up);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', up); if (recRef.current) try { recRef.current.abort(); } catch (e) {} };
  }, []);
  // контекст / текст ззовні: з редактора («Помічник» у шапці), «Зробити картки» в Матеріалах, «Скласти план із ШІ» в порожньому дні
  useEffect(() => {
    if (!pending) return;
    if (pending.ctx) setCtx(pending.ctx);
    if (pending.text && pending.send) send(pending.text, pending.ctx ? { ctx: pending.ctx } : {});
    else if (pending.text) { setInp(pending.text); setTimeout(() => taRef.current && taRef.current.focus(), 50); }
    else setTimeout(() => taRef.current && taRef.current.focus(), 50);
    clearPending();
  }, [pending]);
  useEffect(() => { if (endRef.current && view === 'chat') endRef.current.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'end' }); }, [msgs.length, busyHere, curId, view]);
  // поле: автозбільшення до 5 рядків
  useEffect(() => {
    const el = taRef.current; if (!el) return;
    el.style.height = 'auto';
    if (!inp) { el.style.overflowY = 'hidden'; return; } // порожнє поле: висота за rows=1 (довгий плейсхолдер не розтягує)
    const cs = getComputedStyle(el), lh = parseFloat(cs.lineHeight) || 22, pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const max = lh * 5 + pad;
    el.style.height = Math.min(el.scrollHeight, max) + 'px'; el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [inp, view]);
  // тост «Готово · Скасувати»: 10 с, таймер на паузі, поки тост під курсором або у фокусі
  useEffect(() => { if (!toast || toast.hold) return; const t = setTimeout(() => setToast(null), 10000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(null), 2000); return () => clearTimeout(t); }, [copied]);
  // меню «+»: фокус на першому пункті, Esc і клік поза меню закривають, фокус повертається на «+»
  useEffect(() => {
    if (!menu) return;
    const el = menuRef.current; if (el) { const b = el.querySelector('button,label'); if (b) b.focus(); }
    const key = e => { if (e.key === 'Escape') { setMenu(false); plusRef.current && plusRef.current.focus(); } };
    const out = e => { if (menuRef.current && !menuRef.current.contains(e.target) && plusRef.current && !plusRef.current.contains(e.target)) setMenu(false); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', out);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', out); };
  }, [menu]);
  useEffect(() => {
    if (!pick) return;
    const key = e => { if (e.key === 'Escape') closePick(); };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [pick]);
  useEffect(() => { if (view === 'history' && histH.current) histH.current.focus(); }, [view]);

  // ===== дані для стартових дій і пікерів =====
  // «Повторити N карток»: N — черга інтервального повторення з page.js (due ≤ зараз + нові в межах ліміту)
  const revN = rev ? rev.n : 0;
  const leftDecks = rev ? rev.decks : [];
  const noTime = items.filter(i => i.kind !== 'event' && !(i.repeat && i.repeat !== 'none') && !i.done && !isTime(i.time));
  const decks = (() => { const m = new Map(); for (const c of cards) { const k = c.deck || ''; m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()]; })();
  const deckName = d => d || tr("Без набору");
  const lastOk = lastMat && (lastMat.k === 'doc' || notes.some(n => n.id === lastMat.id && n.text && n.text.trim())) ? lastMat : null;
  const lastCtx = lastOk ? (lastOk.k === 'doc' ? { k: 'doc', id: lastOk.id, title: lastOk.title, type: lastOk.type, pages: [lastOk.page || 1] } : { k: 'note', id: lastOk.id, title: lastOk.title }) : null;

  const hr = new Date().getHours();
  const hello = hr >= 5 && hr < 12 ? tr("Добрий ранок.") : hr >= 12 && hr < 18 ? tr("Добрий день.") : tr("Добрий вечір.");
  const starts = [];
  if (revN) starts.push({ k: 'rev', ic: 'cards', hot: true, t: tr("Повторити") + ' ' + revN + ' ' + plural(revN, "картку", "картки", "карток"), s: leftDecks.length === 1 ? deckName(leftDecks[0]) : leftDecks.length + ' ' + plural(leftDecks.length, "набір", "набори", "наборів"), go: () => onReview() });
  if (exam && onExamPlan) starts.push({ k: 'exam', ic: 'flag', tone: 'health', t: tr("План підготовки до іспиту") + ' ' + exam.t, s: exam.days === 0 ? tr("Іспит сьогодні") : exam.days === 1 ? tr("Іспит завтра") : getLang() === 'de' ? 'in ' + exam.days + ' Tagen' : 'через ' + exam.days + ' ' + plural(exam.days, "день", "дні", "днів"), go: () => onExamPlan() });
  if (noTime.length) starts.push({ k: 'tom', ic: 'plan', tone: 'home', t: tr("Скласти план на завтра"), s: noTime.length + ' ' + plural(noTime.length, "задача", "задачі", "задач") + ' ' + tr("без дати або часу"), go: () => send(tr("Склади план на завтра з моїх задач без дати або часу. Врахуй години на задачі й події, що вже є."), { mode: 'chat' }) });
  if (lastCtx) starts.push({ k: 'ask', ic: 'doc', tone: 'study', t: tr("Запитати про") + ' «' + lastCtx.title + '»', s: tr("Останній відкритий матеріал"), go: () => { setCtx(lastCtx); taRef.current && taRef.current.focus(); } });
  starts.push({ k: 'now', ic: 'now', tone: 'health', t: tr("Що робити просто зараз?"), s: items.length ? tr("З урахуванням плану на сьогодні") : tr("Підказка, з чого почати"), go: () => send(tr("Що робити просто зараз?")) });
  if (lastCtx && starts.length < 4) starts.push({ k: 'mk', ic: 'cards', tone: 'personal', t: tr("Зроби картки з") + ' «' + lastCtx.title + '»', s: tr("Питання й відповіді з матеріалу"), go: () => send(tr("Зроби картки з цього матеріалу."), { ctx: lastCtx }) });
  if (starts.length < 2) {
    starts.push({ k: 'week', ic: 'plan', tone: 'home', t: tr("Склади план на тиждень"), s: tr("Розкласти задачі за днями"), go: () => send(tr("Склади план на тиждень з моїх задач")) });
    starts.push({ k: 'topic', ic: 'cards', tone: 'personal', t: tr("Зроби картки за темою…"), s: tr("Напишіть тему в полі нижче"), go: () => { setInp(tr("Зроби картки за темою: ")); taRef.current && taRef.current.focus(); } });
  }
  const startList = starts.slice(0, 4);

  // ===== надсилання =====
  async function loadMaterial(c) {
    if (!c) return { material: null, images: [], labels: [] };
    if (c.k === 'note') { const n = notes.find(x => x.id === c.id); if (!n) throw new Error(tr("Матеріал не знайдено. Приберіть його з контексту.")); return { material: { kind: 'note', title: c.title, text: n.text.slice(0, 15000) }, images: [], labels: [] }; }
    // папка (напр. матеріали іспиту): текстові нотатки папки + назви зошитів/дошок (їхні сторінки не надсилаються)
    if (c.k === 'folder') {
      const ns = notes.filter(x => x.folder === c.id && x.text && x.text.trim()).sort((a, b) => (b.upd || 0) - (a.upd || 0));
      let budget = 15000; const nl = [];
      for (const x of ns) { if (budget <= 0) break; const tx = x.text.slice(0, budget); budget -= tx.length; nl.push({ t: x.text.trim().split('\n')[0].slice(0, 60), text: tx }); }
      const ds = (await listDocs().catch(() => [])).filter(d => d.folder === c.id).slice(0, 40).map(d => d.title || tr("Без назви"));
      return { material: { kind: 'folder', title: c.title, notes: nl, docs: ds }, images: [], labels: [] };
    }
    if (c.k === 'deck') { const dc = cards.filter(x => (x.deck || '') === c.id).slice(0, 200).map(({ q, a }) => ({ q, a })); return { material: { kind: 'deck', title: c.title, cards: dc }, images: [], labels: [] }; }
    const r = await docPageImages(c.id, c.pages && c.pages.length ? c.pages : [1]).catch(() => null);
    if (!r) throw new Error(tr("Матеріал не знайдено. Приберіть його з контексту."));
    return { material: { kind: 'doc', title: c.title, pages: r.imgs.map(x => x.page) }, images: r.imgs.map(x => x.url), labels: r.imgs.map(x => 'с. ' + x.page) };
  }
  const forAI = m => {
    if (m.role !== 'model' || !m.prev) return m.text || '';
    const st = m.prev.state === 'applied' ? 'користувач застосував' : m.prev.state === 'cancelled' ? 'користувач скасував' : m.prev.state === 'undone' ? 'користувач застосував, потім скасував' : 'ще не підтверджено';
    return (m.text || '') + '\n[Запропоновані дії: ' + m.prev.acts.length + '; ' + st + ']';
  };
  async function run(id, hist, mode, ctx, pics) {
    setBusy(id); setLive(tr("Думаю…"));
    const ac = new AbortController(); abortRef.current = ac;
    const add = m => upChat(id, c => ({ ...c, msgs: [...c.msgs, { ...m, ts: Date.now() }], upd: Date.now() }));
    try {
      const base = await buildState();
      const { material, images, labels } = await loadMaterial(ctx);
      pics.forEach((u, i) => { images.push(u); labels.push(tr("Фото") + ' ' + (i + 1)); });
      const list = hist.filter(m => !m.err && !m.stopped).slice(-12);
      const messages = list.map((m, i) => ({ role: m.role, text: forAI(m), ...(i === list.length - 1 && images.length ? { images, imageLabels: labels } : {}) }));
      const raw = await call({ mode: mode === 'learn' ? 'tutor' : 'chat', messages, ctx: { ...base, material } }, ac.signal);
      let { reply, actions } = parseAI(raw);
      if (mode === 'learn') actions = actions.filter(a => a.type === 'add_cards');
      const ref = ctx && (ctx.k === 'doc' || ctx.k === 'note') ? { k: ctx.k, id: ctx.id, title: ctx.title } : undefined;
      const m = { role: 'model', text: reply || (actions.length ? '' : tr("Порожня відповідь")), ref };
      if (actions.length) m.prev = { acts: actions, sel: actions.map(a => a.type !== 'delete_task'), state: 'pending' };
      add(m);
      setLive(tr("Помічник відповів") + ': ' + (reply || '').slice(0, 160) + (actions.length ? ' ' + tr("Є пропозиція дій, перевірте й застосуйте.") : ''));
    } catch (e) {
      if (e && e.name === 'AbortError') { add({ role: 'model', stopped: true, text: tr("Зупинено.") }); setLive(tr("Зупинено.")); }
      else { if (e && e.code === 401 && on401) on401(); const t = (e && e.message) || tr("Не вдалося отримати відповідь."); add({ role: 'model', err: true, text: t }); setLive(tr("Помилка") + ': ' + t); }
    }
    abortRef.current = null; setBusy(null);
  }
  function send(text, o = {}) {
    const t = String(text || '').trim();
    if (isBusy || (!t && !att.length) || !online) return;
    const pics = [...att]; lastPics.current = pics;
    const mode = o.mode || cur.mode, ctx = o.ctx !== undefined ? o.ctx : cur.ctx;
    const um = { role: 'user', text: t || tr("Подивись на зображення."), pics: pics.length || undefined, ctx: ctx ? ctxLabel(ctx) : undefined, ts: Date.now() };
    let id = cur.id, hist;
    if (!id) {
      id = Date.now();
      const c = { id, title: chatTitle(um.text), mode, ctx, msgs: [um], upd: Date.now() };
      setChats(cs => [c, ...cs].slice(0, MAX_CHATS)); setCurId(id); setDraft({ mode, ctx: null }); hist = [um];
    } else {
      upChat(id, c => ({ ...c, mode, ctx, msgs: [...c.msgs, um], upd: Date.now() })); hist = [...msgs, um];
    }
    setInp(''); setAtt([]); setView('chat');
    run(id, hist, mode, ctx, pics);
  }
  const stop = () => { if (abortRef.current) abortRef.current.abort(); };
  const retry = () => {
    if (isBusy || !saved || !online) return;
    let ms = [...saved.msgs]; while (ms.length && (ms[ms.length - 1].err || ms[ms.length - 1].stopped)) ms.pop();
    if (!ms.length || ms[ms.length - 1].role !== 'user') return;
    upChat(saved.id, c => ({ ...c, msgs: ms }));
    run(saved.id, ms, saved.mode, saved.ctx, lastPics.current || []);
  };
  const newChat = () => { stop(); setCurId(null); setDraft({ mode: 'chat', ctx: null }); setInp(''); setAtt([]); setView('chat'); setTimeout(() => taRef.current && taRef.current.focus(), 50); };
  const openChat = id => { setCurId(id); setView('chat'); setDelAsk(null); setTimeout(() => taRef.current && taRef.current.focus({ preventScroll: true }), 50); };
  const delChat = id => { setChats(cs => cs.filter(c => c.id !== id)); if (curId === id) setCurId(null); setDelAsk(null); setLive(tr("Розмову видалено")); setTimeout(() => histH.current && histH.current.focus(), 30); };
  const onKey = e => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    // Enter надсилає лише там, де є клавіатура (дрібний вказівник або широкий екран); на телефоні — перенос рядка
    if (window.matchMedia('(pointer: fine)').matches || window.innerWidth >= 768) { e.preventDefault(); send(inp); }
  };

  // ===== картка-превʼю дій =====
  const nm = id => { const i = items.find(x => x.id === Number(id)); return i ? '«' + i.t + '»' : tr("запис"); };
  const fname = v => { if (v === '' || v == null) return ''; const f = folders.find(x => x.id === Number(v) || x.name.toLowerCase() === String(v).toLowerCase()); return f ? f.name : String(v); };
  const desc = a => {
    const rep = a.repeat && a.repeat !== 'none' && REPS[a.repeat] ? tr(REPS[a.repeat]) : '';
    const fo = a.folder !== undefined && a.folder !== '' ? tr("папка") + ' ' + fname(a.folder) : '';
    const j = l => l.filter(Boolean).join(' · ');
    switch (a.type) {
      case 'add_task': return { t: a.t, m: j([isDate(a.due) ? tr("до") + ' ' + dayStr(a.due) : tr("без дати"), durStr(a.h), Number(a.pri) === 2 ? tr("важлива") : '', rep, fo]) };
      case 'add_event': return { t: a.t, m: j([isDate(a.date) ? dayStr(a.date) : '?', isTime(a.time) ? a.time : '09:00', durStr(a.h), rep, fo]) };
      case 'update_task': {
        const ch = [];
        if (a.t) ch.push(tr("назва") + ' → «' + a.t + '»');
        const nd = a.date !== undefined ? a.date : a.due; if (nd !== undefined) ch.push(tr("дата") + ' → ' + (isDate(nd) ? dayStr(nd) : tr("без дати")));
        if (isTime(a.time)) ch.push(tr("час") + ' → ' + a.time);
        if (Number(a.h) > 0) ch.push(tr("тривалість") + ' → ' + durStr(a.h));
        if (a.pri) ch.push(Number(a.pri) === 2 ? tr("важлива") : tr("звичайна"));
        if (a.area && AREA[a.area]) ch.push(tr(AREA[a.area]));
        if (rep) ch.push(rep); if (fo) ch.push(fo);
        return { t: tr("Змінити") + ' ' + nm(a.id), m: ch.join(' · ') };
      }
      case 'add_exam': return { t: tr("Іспит") + ': ' + (a.t || ''), m: j([isDate(a.date) ? dayStr(a.date) : '?', isTime(a.time) ? a.time : '', fo]) };
      case 'complete_task': return { t: tr("Позначити виконаною") + ' ' + nm(a.id), m: '' };
      case 'delete_task': return { t: tr("Видалити") + ' ' + nm(a.id), m: tr("Запис зникне з Плану") };
      case 'set_capacity': return { t: tr("Годин на задачі") + ': ' + tr(DNF[Number(a.day)] || '?'), m: r1(Number(a.h) || 0) + ' ' + tr("год") };
      case 'set_start': return { t: tr("Початок занять"), m: String(a.hour).padStart(2, '0') + ':00' };
      case 'add_note': return { t: tr("Нотатка") + ': ' + String(a.text || '').trim().split('\n')[0].slice(0, 60), m: fo };
      case 'add_cards': { const n = (a.cards || []).filter(c => c && c.q && c.a).length; return { t: n + ' ' + plural(n, "картка", "картки", "карток") + ' ' + tr("у набір") + ' «' + (a.deck || tr("Без набору")) + '»', m: (a.cards || []).slice(0, 2).map(c => c && c.q).filter(Boolean).join(' · ') }; }
      case 'create_folder': return { t: tr("Папка") + ' «' + (a.name || '') + '»', m: a.parent ? tr("у") + ' ' + fname(a.parent) : '' };
      case 'create_doc': return { t: (a.kind === 'board' ? tr("Дошка") : tr("Зошит")) + ' «' + (a.title || '') + '»', m: fo };
      case 'rename_folder': return { t: tr("Перейменувати папку"), m: '→ «' + (a.name || '') + '»' };
      case 'rename_doc': return { t: tr("Перейменувати документ"), m: '→ «' + (a.title || '') + '»' };
      case 'move_note': case 'move_doc': return { t: tr("Перемістити матеріал"), m: a.folder ? '→ ' + fname(a.folder) : tr("без папки") };
      default: return { t: tr("Зміна налаштувань"), m: '' };
    }
  };
  const groupTitle = (g, acts) => {
    const n = acts.length;
    if (g === 'plan') return tr("Додати в План") + ' · ' + n + ' ' + (acts.every(a => a.type === 'add_task') ? plural(n, "задача", "задачі", "задач") : acts.every(a => a.type === 'add_event') ? plural(n, "подія", "події", "подій") : plural(n, "запис", "записи", "записів"));
    if (g === 'create') return tr("Створити") + ' · ' + n;
    if (g === 'del') return tr("Видалити") + ' · ' + n;
    return tr("Змінити") + ' · ' + n;
  };
  const sumOf = (acts, n) => {
    if (!n) return tr("Нічого не змінено: записи вже змінені або не знайдені");
    if (acts.every(a => a.type === 'add_task')) return tr("Додано") + ' ' + n + ' ' + plural(n, "задачу", "задачі", "задач");
    if (acts.every(a => a.type === 'add_task' || a.type === 'add_event')) return tr("Додано в План") + ': ' + n;
    if (acts.every(a => a.type === 'add_cards')) return tr("Додано") + ' ' + n + ' ' + plural(n, "картку", "картки", "карток");
    return tr("Застосовано змін") + ': ' + n;
  };
  const setPrev = (mi, fn) => upChat(cur.id, c => ({ ...c, msgs: c.msgs.map((m, i) => (i === mi ? { ...m, prev: fn(m.prev) } : m)) }));
  const applyPrev = async mi => {
    const m = msgs[mi]; if (!m || !m.prev || m.prev.state !== 'pending') return;
    const acts = m.prev.acts.filter((_, i) => m.prev.sel[i]); if (!acts.length) return;
    const n = await apply(acts);
    const sum = sumOf(acts, n);
    setPrev(mi, p => ({ ...p, state: 'applied', n, sum }));
    if (n) setToast({ id: cur.id, mi, sum, t: Date.now() });
    setLive(sum);
  };
  const cancelPrev = mi => { setPrev(mi, p => ({ ...p, state: 'cancelled' })); setLive(tr("Скасовано")); };
  const undoToast = async () => { const t = toast; if (!t) return; await undo(); upChat(t.id, c => ({ ...c, msgs: c.msgs.map((m, i) => (i === t.mi && m.prev ? { ...m, prev: { ...m.prev, state: 'undone' } } : m)) })); setToast(null); setLive(tr("Зміни скасовано")); };

  const prevCard = (m, mi) => {
    const p = m.prev, k = 'pv' + cur.id + '-' + mi;
    if (p.state !== 'pending') return <div className={'a-pvdone' + (p.state === 'applied' && p.n ? ' ok' : '')}>
      <I n={p.state === 'applied' && p.n ? 'check' : 'close'} s={16} />
      <span>{p.state === 'applied' ? p.sum : p.state === 'undone' ? tr("Зміни скасовано") : tr("Скасовано")}</span></div>;
    const groups = GORDER.map(g => ({ g, rows: p.acts.map((a, i) => ({ a, i })).filter(x => GROUP(x.a.type) === g) })).filter(x => x.rows.length);
    const nSel = p.sel.filter(Boolean).length;
    const one = groups.length === 1;
    const head = one ? groupTitle(groups[0].g, groups[0].rows.map(x => x.a)) : tr("Пропозиція") + ' · ' + p.acts.length + ' ' + plural(p.acts.length, "дія", "дії", "дій");
    return <section className="a-pv" aria-labelledby={k + '-h'}>
      <div className="a-pvh"><I n={one && groups[0].g === 'plan' ? 'plan' : one && groups[0].g === 'create' ? 'plus' : 'edit'} s={18} /><h3 id={k + '-h'}>{head}</h3><span className="a-pvs">{tr("ще не збережено")}</span></div>
      {groups.map(({ g, rows }) => <div key={g} role="group" aria-label={groupTitle(g, rows.map(x => x.a))}>
        {!one && <div className={'a-pvg' + (g === 'del' ? ' del' : '')}>{groupTitle(g, rows.map(x => x.a))}</div>}
        {rows.map(({ a, i }) => { const d = desc(a); return <label key={i} className={'a-pvr' + (g === 'del' ? ' del' : '')}>
          <input type="checkbox" checked={!!p.sel[i]} onChange={() => setPrev(mi, q => ({ ...q, sel: q.sel.map((v, j) => (j === i ? !v : v)) }))} />
          <span className="a-pvt"><span className="a-pvn">{d.t}</span>{d.m && <span className="a-pvm">{d.m}</span>}</span></label>; })}
      </div>)}
      {p.acts.some(a => a.type === 'delete_task') && <p className="a-pvnote">{tr("Видалення не позначене. Позначте, якщо справді хочете видалити.")}</p>}
      <div className="a-pvb">
        <button className="btn2" onClick={() => cancelPrev(mi)}>{tr("Скасувати")}</button>
        <button className="btn-a" disabled={!nSel} onClick={() => applyPrev(mi)}>{tr("Застосувати")} {nSel}</button>
      </div>
    </section>;
  };

  // ===== контекст: меню «+», пікер матеріалу / сторінок / набору, фото =====
  const closePick = () => { setPick(null); const r = pickRet.current; pickRet.current = null; setTimeout(() => (r && document.contains(r) ? r : plusRef.current) && (r && document.contains(r) ? r : plusRef.current).focus(), 30); };
  const openPick = async step => {
    setMenu(false); pickRet.current = plusRef.current;
    if (step === 'mat') {
      const ds = await listDocs().catch(() => []);
      const list = [...ds.map(d => ({ k: 'doc', id: d.id, type: d.type, title: d.title || tr("Без назви"), upd: d.upd || 0 })),
        ...notes.filter(n => n.text && n.text.trim()).map(n => ({ k: 'note', id: n.id, type: 'note', title: n.text.trim().split('\n')[0].slice(0, 60), upd: n.upd || n.id }))].sort((a, b) => b.upd - a.upd);
      setMats(list);
    }
    setPick({ step });
  };
  const TYPEN = { notebook: 'Зошит', board: 'Дошка', photo: 'Фото', scan: 'Скан', note: 'Нотатка' };
  const pickMat = async m => {
    if (m.k === 'note') { setCtx({ k: 'note', id: m.id, title: m.title }); closePick(); return; }
    const d = await getDocFull(m.id).catch(() => null); const n = d ? d.pages.length : 1;
    if (n <= 1) { setCtx({ k: 'doc', id: m.id, title: m.title, type: m.type, pages: [1] }); closePick(); return; }
    const pre = cur.ctx && cur.ctx.k === 'doc' && cur.ctx.id === m.id ? cur.ctx.pages : lastMat && lastMat.id === m.id && lastMat.page ? [lastMat.page] : [1];
    setPick({ step: 'pages', m, n, sel: pre.filter(x => x <= n) });
  };
  const addPics = async files => {
    const out = [];
    for (const f of Array.from(files || []).slice(0, 3 - att.length)) { try { out.push(await shrink(f, 1024, 0.72)); } catch (e) {} }
    if (out.length) setAtt(p => [...p, ...out].slice(0, 3));
  };

  // ===== голос =====
  const voice = () => {
    if (rec) { try { recRef.current && recRef.current.stop(); } catch (e) {} return; }
    const C = SR(); if (!C) return;
    const r = new C(); recRef.current = r; setVoiceErr('');
    r.lang = getLang() === 'de' ? 'de-DE' : 'uk-UA'; r.interimResults = true; r.continuous = true;
    const base = inp.trim() ? inp.replace(/\s*$/, ' ') : '';
    r.onresult = e => { let s = ''; for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript; setInp(base + s.trim()); };
    r.onerror = e => { setVoiceErr(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? tr("Немає доступу до мікрофона. Дозвольте його в налаштуваннях браузера.") : e.error === 'no-speech' ? tr("Не почув мовлення. Спробуйте ще раз.") : tr("Голосовий ввід не спрацював.")); };
    r.onend = () => { setRec(false); recRef.current = null; setTimeout(() => taRef.current && taRef.current.focus(), 30); };
    try { r.start(); setRec(true); } catch (e) { setRec(false); }
  };

  // ===== розмітка =====
  const H = side ? 'h2' : 'h1';
  const header = view === 'history'
    ? <header className="a-hd a-hd-h">
      <button className="a-ib"  onClick={() => { setView('chat'); setTimeout(() => histBtn.current && histBtn.current.focus(), 30); }} aria-label={tr("Назад до розмови")} title={tr("Назад")}><I n="back" /></button>
      <H className="a-ht" tabIndex={-1} ref={histH}>{tr("Історія розмов")}</H>
      <button className="a-ib bd" onClick={newChat} aria-label={tr("Нова розмова")} title={tr("Нова розмова")}><I n="newc" /></button>
      {side && <button className="a-ib" onClick={onClose} aria-label={tr("Закрити панель Помічника")} title={tr("Закрити")}><I n="close" /></button>}
    </header>
    : !saved || side
      ? <header className="a-hd">
        <H className="a-ht">{tr("Помічник")}</H>
        <button className="a-ib bd" ref={histBtn} onClick={() => setView('history')} aria-label={tr("Історія розмов")} title={tr("Історія розмов")}><I n="hist" /></button>
        <button className="a-ib bd" onClick={newChat} aria-label={tr("Нова розмова")} title={tr("Нова розмова")}><I n="newc" /></button>
        {side && <button className="a-ib" onClick={onClose} aria-label={tr("Закрити панель Помічника")} title={tr("Закрити")}><I n="close" /></button>}
      </header>
      : <header className="a-hd a-hd-c">
        <button className="a-ib" ref={histBtn} onClick={() => setView('history')} aria-label={tr("Історія розмов")} title={tr("Історія розмов")}><I n="hist" /></button>
        <div className="a-hc"><H className="a-hct">{saved.title}</H><span className="a-hcs">{(saved.mode === 'learn' ? tr("Навчання") + ' · ' : '') + whenStr(saved.upd)}</span></div>
        <button className="a-ib" onClick={newChat} aria-label={tr("Нова розмова")} title={tr("Нова розмова")}><I n="newc" /></button>
      </header>;

  const sorted = [...chats].sort((a, b) => b.upd - a.upd);
  const historyView = <div className="a-hist">
    {!sorted.length ? <p className="a-empty">{tr("Розмов ще немає. Почніть нову — вона з’явиться тут.")}</p>
      : <ul className="a-hl" aria-label={tr("Розмови")}>{sorted.map(c => <li key={c.id} className={'a-hi' + (c.id === curId ? ' is-cur' : '')}>
        {delAsk === c.id ? <div className="a-hdel" role="group" aria-label={tr("Підтвердження видалення")}>
          <span>{tr("Видалити розмову")} «{c.title}»?</span>
          <div className="a-hdb"><button className="btn2" autoFocus onClick={() => setDelAsk(null)}>{tr("Скасувати")}</button><button className="btn2 danger" onClick={() => delChat(c.id)}>{tr("Видалити")}</button></div>
        </div> : <>
          <button className="a-ho" onClick={() => openChat(c.id)} aria-current={c.id === curId ? 'true' : undefined}>
            <span className="a-hn">{c.title}</span>
            <span className="a-hm">{whenStr(c.upd)}{c.mode === 'learn' ? ' · ' + tr("Навчання") : ''}{c.ctx ? ' · ' + ctxLabel(c.ctx) : ''}</span>
          </button>
          <button className="a-ib" onClick={() => setDelAsk(c.id)} aria-label={tr("Видалити розмову") + ': ' + c.title} title={tr("Видалити")}><I n="trash" /></button>
        </>}
      </li>)}</ul>}
    {sorted.length >= MAX_CHATS && <p className="a-hint">{tr("Зберігаються останні 50 розмов.")}</p>}
  </div>;

  const startView = <div className="a-start">
    <span className="a-logo" aria-hidden="true"><I n="ai" s={22} /></span>
    <h2 className="a-hello">{hello}<br />{tr("З чого почнемо?")}</h2>
    <p className="a-sub">{tr("Підказки зібрані з вашого плану й навчання")}</p>
    <div className="a-starts">{startList.map(s => <button key={s.k} className={'a-st' + (s.hot ? ' hot' : '')} onClick={s.go} disabled={!online && s.k !== 'rev' && s.k !== 'ask' && s.k !== 'topic'}>
      <span className={'a-sti' + (s.tone ? ' t-' + s.tone : '')} aria-hidden="true"><I n={s.ic} s={18} /></span>
      <span className="a-stt"><span className="a-stn">{s.t}</span><span className="a-sts">{s.s}</span></span></button>)}</div>
  </div>;

  const lastModel = (() => { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'model') return i; return -1; })();
  const chatView = <div className="a-msgs">
    {msgs.map((m, i) => m.role === 'user'
      ? <div className="a-um" key={i}>{m.text}{(m.ctx || m.pics) && <span className="a-umc">{m.ctx && <><I n="doc" s={13} />{m.ctx}</>}{m.pics ? (m.ctx ? ' · ' : '') + tr("фото") + ': ' + m.pics : ''}</span>}</div>
      : m.err || m.stopped
        ? <div className={'a-am ' + (m.err ? 'a-err' : 'a-stop')} key={i}><p>{m.text}</p>{i === msgs.length - 1 && <button className="btn2 sm" onClick={retry} disabled={isBusy || !online}>{tr("Повторити")}</button>}</div>
        : <div className="a-am" key={i}>
          {m.text && <div className="a-at"><AText text={m.text} refDoc={m.ref && m.ref.k === 'doc' ? m.ref : null} onRef={n => onOpenRef(m.ref, n)} /></div>}
          {m.prev && prevCard(m, i)}
          {m.text && <div className="a-ma"><button className="a-tb" onClick={() => { try { navigator.clipboard.writeText(String(m.text).replace(/\[(?:с|c|С|S|s)\.?\s*(\d+(?:\s*[–-]\s*\d+)?)\]/g, '(' + tr("с.") + ' $1)')).then(() => setCopied(i), () => {}); } catch (e) {} }}>
            <I n={copied === i ? 'check' : 'copy'} s={16} />{copied === i ? tr("Скопійовано") : tr("Скопіювати")}</button></div>}
          {i === lastModel && m.text && m.ref && m.ref.k === 'note' && <div className="a-ma"><button className="a-tb" onClick={() => onOpenRef(m.ref)}><I n="doc" s={16} />{tr("Відкрити")} «{m.ref.title}»</button></div>}
        </div>)}
    {busyHere && <div className="a-think"><span className="typing" aria-hidden="true"><i /><i /><i /></span><span>{tr("Думаю…")}</span><button className="btn2 sm" onClick={stop}><I n="stop" s={16} />{tr("Зупинити")}</button></div>}
    <div ref={endRef} />
  </div>;

  const ctx = cur.ctx;
  const composer = <section className="a-comp" aria-label={tr("Поле запиту")}>
    {toast && toast.id === cur.id && <div className="a-toast" role="status" onMouseEnter={() => setToast(t => t && { ...t, hold: true })} onMouseLeave={() => setToast(t => t && { ...t, hold: false })} onFocus={() => setToast(t => t && { ...t, hold: true })} onBlur={() => setToast(t => t && { ...t, hold: false })}><I n="check" s={18} /><span>{tr("Готово")} · {toast.sum}</span><button className="a-tl" onClick={undoToast}>{tr("Скасувати")}</button></div>}
    {(ctx || att.length > 0) && <div className="a-chips">
      {ctx && <span className="a-chip"><I n={ctx.k === 'deck' ? 'cards' : ctx.k === 'folder' ? 'folder' : 'doc'} s={14} /><span className="a-chipt">{ctxLabel(ctx)}</span><button onClick={() => setCtx(null)} aria-label={tr("Прибрати контекст") + ' ' + ctxLabel(ctx)} title={tr("Прибрати")}>×</button></span>}
      {att.map((u, i) => <span className="a-chip ph" key={i}><span className="a-thumb" style={{ backgroundImage: 'url(' + u + ')' }} aria-hidden="true" /><span className="a-chipt">{tr("Фото")} {i + 1}</span><button onClick={() => setAtt(att.filter((_, j) => j !== i))} aria-label={tr("Прибрати фото") + ' ' + (i + 1)} title={tr("Прибрати")}>×</button></span>)}
    </div>}
    <div className="a-mode">
      <div className="a-seg" role="group" aria-label={tr("Режим")}>
        <button aria-pressed={!learn} onClick={() => setMode('chat')}>{tr("Звичайний")}</button>
        <button aria-pressed={learn} onClick={() => setMode('learn')}>{tr("Навчання")}</button>
      </div>
      <span className="a-modec">{tr("Навчання — питає, а не відповідає")}</span>
    </div>
    <div className={'a-box' + (!online ? ' off' : '')}>
      <div className="a-plusw">
        <button ref={plusRef} className="a-cb" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-haspopup="true" aria-controls="a-menu" aria-label={tr("Додати контекст: матеріал, набір карток або фото")} title={tr("Додати контекст")} disabled={!online}><I n="plus" s={22} /></button>
        {menu && <div className="a-menu" id="a-menu" ref={menuRef} role="group" aria-label={tr("Додати контекст")}>
          <button onClick={() => openPick('mat')}><I n="doc" s={18} /><span>{tr("Матеріал")}<small>{tr("Нотатка, зошит, дошка або фото з Матеріалів")}</small></span></button>
          <button onClick={() => openPick('deck')} disabled={!decks.length}><I n="cards" s={18} /><span>{tr("Набір карток")}<small>{decks.length ? tr("Питання й відповіді набору") : tr("Карток ще немає")}</small></span></button>
          <button onClick={() => { setMenu(false); fileRef.current && fileRef.current.click(); }} disabled={att.length >= 3}><I n="image" s={18} /><span>{tr("Фото з пристрою")}<small>{tr("До 3 зображень")}</small></span></button>
        </div>}
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidefile" tabIndex={-1} aria-hidden="true" onChange={e => { addPics(e.target.files); e.target.value = ''; }} />
      </div>
      <label className="vh" htmlFor={side ? 'a-in-side' : 'a-in'}>{tr("Запит до Помічника")}</label>
      <textarea id={side ? 'a-in-side' : 'a-in'} ref={taRef} className="a-ta" rows={1} value={inp} disabled={!online}
        placeholder={!online ? tr("Немає зв’язку") : learn ? tr("Що хочете зрозуміти?") : ctx ? tr("Запитайте про матеріал…") : saved ? tr("Уточніть або попросіть ще…") : tr("Запитайте або попросіть щось зробити…")}
        aria-describedby={!online ? 'a-off' : undefined}
        onChange={e => setInp(e.target.value)} onKeyDown={onKey} />
      {hasSR && <button className={'a-cb' + (rec ? ' rec' : '')} onClick={voice} disabled={!online} aria-pressed={rec} aria-label={rec ? tr("Зупинити запис голосу") : tr("Голосовий ввід")} title={rec ? tr("Стоп") : tr("Голосовий ввід")}>
        <I n={rec ? 'stop' : 'mic'} s={22} />{rec && <span className="a-recl">{tr("Стоп")}</span>}</button>}
      <button className="a-send" onClick={() => send(inp)} disabled={isBusy || !online || (!inp.trim() && !att.length)} aria-label={tr("Надіслати")} title={tr("Надіслати")}><I n="send" s={20} /></button>
    </div>
    {rec && <p className="a-st-l"><span className="a-dot" aria-hidden="true" />{tr("Слухаю… Говоріть, потім натисніть «Стоп».")}</p>}
    {voiceErr && !rec && <p className="a-st-l err">{voiceErr}</p>}
    {!online && <p className="a-st-l" id="a-off">{tr("Немає інтернету. Помічник запрацює, щойно з’явиться зв’язок; історія розмов доступна.")}</p>}
  </section>;

  const pickSheet = pick && <div className="ov" onClick={closePick}><div className="sheet menu a-pick" role="dialog" aria-modal="true" aria-labelledby="a-pick-t" onClick={e => e.stopPropagation()}>
    <div className="shd"><h2 id="a-pick-t">{pick.step === 'deck' ? tr("Набір карток") : pick.step === 'pages' ? pick.m.title : tr("Матеріал")}</h2>
      <button className="ib" onClick={closePick} aria-label={tr("Закрити")} title={tr("Закрити")}><I n="close" s={22} /></button></div>
    {pick.step === 'mat' && (mats.length ? mats.map((m, i) => <button key={m.k + m.id} autoFocus={i === 0} onClick={() => pickMat(m)}>{m.title}<small>{tr(TYPEN[m.type] || 'Зошит')}{m.upd ? ' · ' + whenStr(m.upd) : ''}</small></button>)
      : <p className="sub">{tr("У Матеріалах поки нічого немає.")}</p>)}
    {pick.step === 'deck' && decks.map(([d, n], i) => <button key={'d' + d} autoFocus={i === 0} onClick={() => { setCtx({ k: 'deck', id: d, title: deckName(d) }); closePick(); }}>{deckName(d)}<small>{n} {plural(n, "картка", "картки", "карток")}</small></button>)}
    {pick.step === 'pages' && <>
      <p className="sub" id="a-pg-h">{tr("Оберіть до 4 сторінок. Помічник побачить їх як зображення.")}</p>
      <div className="a-pgs" role="group" aria-labelledby="a-pg-h">{Array.from({ length: pick.n }, (_, k) => k + 1).map(n => { const on = pick.sel.includes(n); return <button key={n} className="a-pgb" aria-pressed={on} disabled={!on && pick.sel.length >= 4} onClick={() => setPick(p => ({ ...p, sel: on ? p.sel.filter(x => x !== n) : [...p.sel, n] }))} aria-label={tr("Сторінка") + ' ' + n}>{n}</button>; })}</div>
      <div className="row" style={{ marginTop: 14 }}><button className="btn-a" disabled={!pick.sel.length} onClick={() => { setCtx({ k: 'doc', id: pick.m.id, title: pick.m.title, type: pick.m.type, pages: [...pick.sel].sort((a, b) => a - b) }); closePick(); }}>{tr("Додати")}{pick.sel.length ? ' · ' + tr("с.") + ' ' + pagesStr(pick.sel) : ''}</button>
        <button className="btn2" onClick={() => setPick({ step: 'mat' })}>{tr("Назад")}</button></div>
    </>}
  </div></div>;

  return <div className={'asst ' + (side ? 'side' : 'tab')}>
    {header}
    <div className="vh" aria-live="polite" role="status">{live}</div>
    <div className="a-body">{view === 'history' ? historyView : msgs.length ? chatView : startView}</div>
    {view === 'chat' && composer}
    {pickSheet}
  </div>;
}
