'use client';
import { useState, useEffect, useMemo, useRef } from 'react';

const DN = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DNF = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'п’ятниця', 'субота'];
const AREA = { study: 'Навчання', work: 'Робота', personal: 'Особисте', health: 'Здоров’я', home: 'Дім' };
const REP = { none: 'Не повторювати', daily: 'Щодня', weekdays: 'У будні', weekly: 'Щотижня' };
const REPS = { daily: 'щодня', weekdays: 'у будні', weekly: 'щотижня' };
const TABS = [['today', 'План'], ['cal', 'Календар'], ['tasks', 'Задачі'], ['notes', 'Нотатки'], ['cards', 'Навчання'], ['ai', 'ШІ']];
const ICONS = {
  today: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  cal: <><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" /></>,
  tasks: <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" /></>,
  notes: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
  cards: <><rect x="3" y="7" width="14" height="12" rx="2" /><path d="M7 4h12a2 2 0 0 1 2 2v10" /></>,
  ai: <><path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" /></>,
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
const normArea = v => (AREA[v] ? v : 'personal');
const normRep = v => (REP[v] ? v : 'none');
const EMPTY = { kind: 'task', t: '', area: 'study', h: '', due: '', time: '', pri: 1, note: '', repeat: 'none' };

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
  let items = [...st.items], cap = [...st.cap], start = st.start, cards = [...st.cards], notes = [...(st.notes || [])], n = 0, k = 0;
  const nid = () => Date.now() + (k++);
  const today = ymd(new Date());
  for (const a of acts) {
    if (!a || typeof a !== 'object') continue;
    const aid = Number(a.id);
    if (a.type === 'add_task' && a.t) {
      items.push({ id: nid(), kind: 'task', t: String(a.t), area: normArea(a.area), h: Number(a.h) > 0 ? Number(a.h) : 1, due: isDate(a.due) ? a.due : '', time: '', pri: Number(a.pri) === 2 ? 2 : 1, note: '', repeat: normRep(a.repeat), done: false }); n++;
    } else if (a.type === 'add_event' && a.t && isDate(a.date)) {
      items.push({ id: nid(), kind: 'event', t: String(a.t), area: normArea(a.area), h: Number(a.h) > 0 ? Number(a.h) : 1, due: a.date, time: isTime(a.time) ? a.time : '09:00', pri: 1, note: '', repeat: normRep(a.repeat), done: false }); n++;
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
      notes.unshift({ id: nid(), text: String(a.text), upd: Date.now() }); n++;
    } else if (a.type === 'add_cards' && Array.isArray(a.cards)) {
      for (const c of a.cards) if (c && c.q && c.a) { cards.push({ id: nid(), deck: String(a.deck || ''), q: String(c.q), a: String(c.a), known: false, seq: nid() }); n++; }
    }
  }
  return { st: { items, cap, start, cards, notes }, n };
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
    r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pass': localStorage.getItem('helper-pass') || '' }, body: JSON.stringify(body) });
  } catch (e) { throw new Error('Немає зв’язку із сервером.'); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { const err = new Error('Введіть пароль у налаштуваннях (шестерня вгорі) і повторіть запит.'); err.code = 401; throw err; }
  if (!d.text) throw new Error(d.error || 'Порожня відповідь');
  return d.text;
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
  const taRef = useRef(null);
  const endRef = useRef(null);
  const stRef = useRef(null);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('helper-next') || '{}');
      if (s.items) setItems(s.items); if (s.cap) setCap(s.cap); if (s.msgs) setMsgs(s.msgs);
      if (s.start) setStart(s.start); if (s.cards) setCards(s.cards); if (s.notes) setNotes(s.notes); if (s.tests) setTests(s.tests);
    } catch (e) {}
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem('helper-next', JSON.stringify({ items, cap, msgs, start, cards, notes, tests })); }, [items, cap, msgs, start, cards, notes, tests, ready]);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy, tab]);
  const plan = useMemo(() => makePlan(items, cap), [items, cap]);
  stRef.current = { items, cap, start, cards, notes };
  useEffect(() => {
    if (nview == null || !ntext.trim()) return;
    setNotes(p => p.some(n => n.id === nview)
      ? p.map(n => n.id === nview && n.text !== ntext ? { ...n, text: ntext, upd: Date.now() } : n)
      : [{ id: nview, text: ntext, upd: Date.now() }, ...p]);
  }, [ntext]);
  if (!ready) return null;

  const now = new Date();
  const today = ymd(now);
  const selDate = sel || today;
  const applySt = st => { setItems(st.items); setCap(st.cap); setStart(st.start); setCards(st.cards); setNotes(st.notes); };
  const closeSheet = () => setSheet(null);
  const openNote = id => {
    if (id === 'new') { setNview(Date.now()); setNtext(''); setFlow(true); }
    else { const n = notes.find(x => x.id === id); setNview(id); setNtext(n ? n.text : ''); setFlow(false); }
  };
  const closeNote = () => { setNotes(notes.filter(n => n.text.trim())); setNview(null); setNtext(''); setFlow(false); };
  const delNote = () => { setNotes(notes.filter(n => n.id !== nview)); setNview(null); setNtext(''); setFlow(false); };
  const openNew = () => { setF({ ...EMPTY, due: selDate !== today ? selDate : '' }); setSheet('new'); };
  const openEdit = i => { if (!i) return; setF({ kind: i.kind || 'task', t: i.t, area: i.area, h: String(i.h), due: i.due || '', time: i.time || '', pri: i.pri || 1, note: i.note || '', repeat: i.repeat || 'none' }); setSheet(i.id); };
  const saveTask = () => {
    if (!f.t.trim()) return;
    const h = parseFloat(f.h);
    const ev = f.kind === 'event';
    const rep = f.repeat || 'none';
    const base = { kind: f.kind, t: f.t.trim(), area: f.area, h: h > 0 ? h : 1, due: f.due || (ev || rep !== 'none' ? selDate : ''), time: ev ? (f.time || '09:00') : '', pri: Number(f.pri) || 1, note: f.note.trim(), repeat: rep };
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

  const makeCtx = () => {
    const s0 = stRef.current;
    const next21days = Array.from({ length: 21 }, (_, k) => { const d = new Date(); d.setDate(d.getDate() + k); return ymd(d) + ' ' + DNF[d.getDay()]; });
    return {
      today, weekday: DNF[now.getDay()], next21days, start: s0.start, capacityByWeekday: s0.cap,
      tasks: s0.items.filter(i => isEv(i) || isRep(i) || !i.done).slice(-80).map(({ id, kind, t, area, h, due, time, repeat, pri }) => ({ id, kind: kind || 'task', t, area, h, due, time, repeat: repeat || 'none', pri: pri || 1 }))
    };
  };

  async function ask(text) {
    if (!text.trim() || busy) return;
    const next = [...msgs, { role: 'user', text }];
    setMsgs(next); setInp(''); setBusy(true);
    try {
      const raw = await callAI({ messages: next.slice(-12).map(m => ({ role: m.role, text: m.text })), ctx: makeCtx() });
      const { reply, actions } = parseAI(raw);
      let n = 0;
      if (actions.length) { const cur = stRef.current; const res = applyActions(actions, cur); n = res.n; if (n) { setUndo(cur); applySt(res.st); } }
      setMsgs([...next, { role: 'model', text: reply || (n ? 'Готово.' : 'Порожня відповідь'), n }]);
    } catch (e) {
      if (e.code === 401) setTab('set');
      setMsgs([...next, { role: 'model', text: e.message }]);
    }
    setBusy(false);
  }
  const doUndo = () => { if (!undo) return; applySt({ ...undo, notes: undo.notes || [] }); setUndo(null); };

  async function quickAdd() {
    const text = qa.trim();
    if (!text || qaBusy) return;
    setQaBusy(true); setQaMsg(''); setPreview(null);
    try {
      const raw = await callAI({ mode: 'parse', messages: [{ role: 'user', text }], ctx: makeCtx() });
      const { reply, actions } = parseAI(raw);
      if (actions.length) setPreview({ actions, reply });
      else setQaMsg(reply || 'Не вдалося розібрати. Уточніть дату і час.');
    } catch (e) { setQaMsg(e.message); }
    setQaBusy(false);
  }
  const confirmPreview = () => {
    const cur = stRef.current; const res = applyActions(preview.actions, cur);
    if (res.n) { setUndo(cur); applySt(res.st); }
    setPreview(null); setQa('');
  };
  const nm = id => { const i = items.find(x => x.id === Number(id)); return i ? '«' + i.t + '»' : 'задачу'; };
  const act2text = a => {
    if (a.type === 'add_event') return 'Подія: ' + a.t + ', ' + (isDate(a.date) ? dm(a.date) : '?') + ' о ' + (a.time || '09:00') + (a.repeat && a.repeat !== 'none' ? ', ' + REPS[a.repeat] : '');
    if (a.type === 'add_task') return 'Задача: ' + a.t + ', ' + (Number(a.h) > 0 ? a.h : 1) + ' год' + (isDate(a.due) ? ', до ' + dm(a.due) : '') + (a.repeat && a.repeat !== 'none' ? ', ' + REPS[a.repeat] : '');
    if (a.type === 'update_task') return 'Змінити ' + nm(a.id);
    if (a.type === 'complete_task') return 'Виконано: ' + nm(a.id);
    if (a.type === 'delete_task') return 'Видалити ' + nm(a.id);
    if (a.type === 'add_note') return 'Нотатка';
    if (a.type === 'add_cards') return 'Картки: ' + ((a.cards || []).length);
    return 'Зміна налаштувань';
  };

  async function createTest() {
    if (!tcfg.topic.trim() || tbusy) return;
    setTbusy(true); setTmsg('');
    try {
      const raw = await callAI({ mode: 'quiz', messages: [{ role: 'user', text: tcfg.topic }], ctx: { n: Number(tcfg.n), kind: tcfg.kind } });
      const q = parseQuiz(raw);
      if (!q) throw new Error('ШІ повернув тест у неправильному форматі. Спробуйте ще раз.');
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
    } catch (e) { setTmsg('Не вдалося оцінити відповіді. Спробуйте ще раз.'); }
    setTbusy(false);
  }
  const cardsFromTest = t => {
    const bad = t.qs.map((q, i) => ({ q, i })).filter(({ q, i }) => okOf(t, q, i) !== true);
    const add = bad.map(({ q }, k) => ({ id: Date.now() + k, deck: t.title, q: q.q, a: (q.type === 'choice' ? q.options[q.answer] : q.answer) + (q.explain ? '\n' + q.explain : ''), known: false, seq: Date.now() + k }));
    setCards([...cards, ...add]); setTmsg(add.length ? 'Додано карток: ' + add.length : 'Помилок немає, картки не потрібні.');
  };

  const row = i => (
    <div className={'it' + (i.done ? ' done' : '')} key={i.id}>
      {isEv(i) ? <span className="evd" /> : <input type="checkbox" checked={isRep(i) ? (i.doneDates || []).includes(today) : !!i.done} onChange={() => tog(i.id, today)} />}
      <div className="b" onClick={() => openEdit(i)}><div className="t">{i.t}</div>
        <div className="meta"><span className={'tag ' + i.area}>{AREA[i.area]}</span>
          {isEv(i) ? <span>{i.due && !isRep(i) ? dm(i.due) + ' ' : ''}{i.time}</span> : <span>{i.h} год</span>}
          {!isEv(i) && !isRep(i) && i.due && <span className={!i.done && i.due < today ? 'late' : ''}>до {dm(i.due)}</span>}
          {isRep(i) && <span>{REPS[i.repeat]}</span>}{i.pri === 2 && <span className="late">Важливо</span>}</div>
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
  const timeline = layoutDay(dayPlan ? dayPlan.blocks : [], evOn(selDate), start * 60);
  const doneOnDay = oneOff.filter(i => i.done && i.doneAt === selDate);
  const shiftDay = n => { const d = new Date(selDate + 'T00:00:00'); d.setDate(d.getDate() + n); setSel(ymd(d) === today ? '' : ymd(d)); };
  const dateStr = now.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
  const selLabel = new Date(selDate + 'T00:00:00').toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
  const left = cards.filter(c => !c.known).sort((a, b) => a.seq - b.seq);
  const cur = left[0];
  const addCard = () => { if (!cq.trim() || !ca.trim()) return; setCards([...cards, { id: Date.now(), deck: '', q: cq.trim(), a: ca.trim(), known: false, seq: Date.now() }]); setCq(''); setCa(''); };

  const cm = calM == null ? now.getFullYear() * 12 + now.getMonth() : calM;
  const cy = Math.floor(cm / 12), cmo = cm % 12;
  const offset = (new Date(cy, cmo, 1).getDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...Array.from({ length: new Date(cy, cmo + 1, 0).getDate() }, (_, k) => cy + '-' + pad(cmo + 1) + '-' + pad(k + 1))];
  const planDays = {}; plan.days.forEach(d => { if (d.blocks.length) planDays[d.date] = true; });
  const hasDot = d => planDays[d] || evOn(d).length > 0 || open.some(i => i.due === d);
  const monthName = new Date(cy, cmo, 1).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
  const tt = tests.find(t => t.id === tview);
  const ev = f.kind === 'event';

  return (
    <div className="wrap">
      {tab !== 'set' && <button className="gear" onClick={() => setTab('set')} aria-label="Налаштування"><Icon n="set" s={22} /></button>}

      {tab === 'today' && <>
        <div className="top"><div className="date">{selDate === today ? dateStr : selLabel}</div><h1>{selDate === today ? 'Сьогодні' : 'План дня'}</h1>
          <div className="sub">{selDate === today ? 'Виконано: ' + doneToday + ', залишилось задач на ' + r1(openH) + ' год' : 'Записів у плані: ' + timeline.length}</div>
          <div className="daynav"><button className="chip" onClick={() => shiftDay(-1)} aria-label="Попередній день">‹</button>{selDate !== today && <button className="chip" onClick={() => setSel('')}>Сьогодні</button>}<button className="chip" onClick={() => shiftDay(1)} aria-label="Наступний день">›</button></div></div>
        <div className="qa"><input placeholder="Швидко додати: стоматолог у пʼятницю о 13:00" value={qa} onChange={e => setQa(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') quickAdd(); }} /><button className="qab" onClick={quickAdd} disabled={qaBusy} aria-label="Додати">{qaBusy ? '…' : '+'}</button></div>
        {qaMsg && <div className="sub" style={{ margin: '-8px 0 16px' }}>{qaMsg}</div>}
        {preview && <div className="card"><div className="sec">Додати це?</div>{preview.actions.map((a, i) => <div className="blk" key={i}><span>{act2text(a)}</span></div>)}{preview.reply && <div className="sub" style={{ marginTop: 8 }}>{preview.reply}</div>}
          <div className="row"><button className="btn" onClick={confirmPreview}>Додати</button><button className="btn alt" onClick={() => setPreview(null)}>Скасувати</button></div></div>}
        {selDate === today && overdue.length > 0 && <div className="card warn"><div className="sec">Прострочено</div>{overdue.map(row)}</div>}
        {timeline.length ? timeline.map(b => (
          <div className="tb" key={b.kind + b.id + '-' + b.s}>
            <div className="tm">{hm(b.s)}<span>{hm(b.e)}</span></div>
            <div className={'tc ' + (b.kind === 'event' ? 'event' : b.area)} onClick={() => openEdit(items.find(i => i.id === b.id))}><div className="tt">{b.t}</div><div className="ts">{b.kind === 'event' ? 'Подія' : AREA[b.area]}{b.rep ? ', повтор' : ''}, {r1((b.e - b.s) / 60)} год</div></div>
            {b.kind === 'event' ? <span /> : <input type="checkbox" checked={!!b.done} onChange={() => tog(b.id, selDate)} aria-label="Готово" />}
          </div>)) : <div className="empty">{selDate < today ? 'Минулий день.' : 'На цей день нічого немає. Додайте рядком вище або кнопкою «+».'}</div>}
        {selDate < today && doneOnDay.length > 0 && <div className="card"><div className="sec">Виконано</div>{doneOnDay.map(row)}</div>}
        {selDate === today && plan.late.length > 0 && <div className="card warn"><div className="sec">Не вміщується в план</div>{plan.late.map((l, i) => <div className="blk" key={i}><span>{l.t}</span><span>{r1(l.left)} год</span></div>)}</div>}
        {selDate === today && <button className="btn" onClick={() => { setTab('ai'); ask('Що мені краще зробити сьогодні і в якому порядку?'); }}>Запитати ШІ, з чого почати</button>}
      </>}

      {tab === 'cal' && <>
        <div className="top"><h1>Календар</h1><div className="sub">Крапка означає, що в цей день щось заплановано</div></div>
        <div className="cmh"><button className="chip" onClick={() => setCalM(cm - 1)} aria-label="Попередній місяць">‹</button><span>{monthName}</span><button className="chip" onClick={() => setCalM(cm + 1)} aria-label="Наступний місяць">›</button></div>
        <div className="cal">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map(w => <div className="cw" key={w}>{w}</div>)}
          {cells.map((d, i) => d ? <button key={i} className={'cd' + (d === today ? ' td' : '') + (d === selDate ? ' sel' : '')} onClick={() => setSel(d === today ? '' : d)}>{+d.slice(8)}{hasDot(d) && <i className="dot" />}</button> : <div key={i} />)}
        </div>
        <div className="card" style={{ marginTop: 22 }}>
          <div className="sec">{selLabel}</div>
          {evOn(selDate).map(e => <div className="blk" key={'e' + e.id} onClick={() => openEdit(e)}><span>{e.time} {e.t}</span><span className="sub">Подія</span></div>)}
          {dayPlan && dayPlan.blocks.map((b, i) => <div className="blk" key={'p' + i} onClick={() => openEdit(items.find(x => x.id === b.id))}><span>{b.t}</span><span className="sub">{r1(b.h)} год</span></div>)}
          {open.filter(i => i.due === selDate).map(row)}
          {!evOn(selDate).length && !(dayPlan && dayPlan.blocks.length) && !open.some(i => i.due === selDate) && <div className="empty">На цей день нічого немає.</div>}
          <div style={{ marginTop: 12 }}><button className="chip" onClick={() => setTab('today')}>Відкрити план дня</button></div>
        </div>
      </>}

      {tab === 'tasks' && <>
        <div className="top"><h1>Задачі</h1><div className="sub">Відкритих: {open.length}. Торкніться запису, щоб змінити.</div></div>
        {!items.length && <div className="card"><div className="empty">Поки порожньо. Натисніть «+», щоб додати задачу або подію.</div></div>}
        {section('Прострочено', overdue)}{section('Події', upEv)}{section('З терміном', soon)}{section('Без терміну', nodue)}{section('Повторювані', repList)}{section('Виконано', doneList)}
      </>}

      {tab === 'notes' && <>
        <div className="top"><h1>Нотатки</h1><div className="sub">Пишіть думки в режимі потоку: слова згасають, поки ви друкуєте</div></div>
        <input placeholder="Пошук" value={nq} onChange={e => setNq(e.target.value)} style={{ marginBottom: 12 }} />
        {notes.filter(n => n.text.toLowerCase().includes(nq.toLowerCase())).map(n => (
          <div className="card" key={n.id} onClick={() => openNote(n.id)}>
            <div className="t" style={{ fontWeight: 600 }}>{n.text.split('\n')[0].slice(0, 60)}</div>
            <div className="note">{n.text.slice(0, 120)}</div>
            <div className="meta"><span>{new Date(n.upd).toLocaleDateString('uk-UA')}</span><span>{n.text.split(/\s+/).filter(Boolean).length} слів</span></div>
          </div>))}
        {!notes.length && <div className="card"><div className="empty">Нотаток поки немає. Натисніть «+» і пишіть без редагування.</div></div>}
      </>}

      {tab === 'cards' && <>
        <div className="top"><h1>Навчання</h1>
          <div className="seg" style={{ marginTop: 14 }}><button className={stab === 'cards' ? 'on' : ''} onClick={() => setStab('cards')}>Картки</button><button className={stab === 'tests' ? 'on' : ''} onClick={() => setStab('tests')}>Тести</button></div></div>

        {stab === 'cards' && <>
          <div className="sub" style={{ marginBottom: 12 }}>Залишилось {left.length} з {cards.length}</div>
          {cur ? <div className="flip" onClick={() => setShow(!show)}><div className="sub">{cur.deck || 'Без колоди'}</div><div className="fq">{show ? cur.a : cur.q}</div><div className="sub">{show ? 'Відповідь' : 'Торкніться, щоб побачити відповідь'}</div></div>
            : <div className="card"><div className="empty">{cards.length ? 'Усі картки вивчено!' : 'Карток ще немає. Попросіть ШІ створити їх за темою, додайте вручну або створіть із помилок у тесті.'}</div></div>}
          {cur && show && <div className="row">
            <button className="btn" onClick={() => { setCards(cards.map(c => c.id === cur.id ? { ...c, known: true } : c)); setShow(false); }}>Знаю</button>
            <button className="btn alt" onClick={() => { setCards(cards.map(c => c.id === cur.id ? { ...c, seq: Date.now() } : c)); setShow(false); }}>Ще раз</button></div>}
          <div className="card"><div className="sec">Нова картка</div>
            <input placeholder="Питання" value={cq} onChange={e => setCq(e.target.value)} />
            <div className="row"><input placeholder="Відповідь" value={ca} onChange={e => setCa(e.target.value)} /></div>
            <button className="btn" onClick={addCard}>Додати картку</button>
            {cards.length > 0 && <div style={{ marginTop: 10 }}><button className="chip" onClick={() => setCards(cards.map(c => ({ ...c, known: false })))}>Почати спочатку</button>{cur && <button className="chip" onClick={() => { setCards(cards.filter(c => c.id !== cur.id)); setShow(false); }}>Видалити цю картку</button>}</div>}
          </div>
        </>}

        {stab === 'tests' && <>
          <div className="card"><div className="sec">Новий тест</div>
            <textarea rows={4} placeholder="Тема або матеріал. Наприклад: Present Perfect, німецькі артиклі, анатомія зуба, або вставте свій конспект" value={tcfg.topic} onChange={e => setTcfg({ ...tcfg, topic: e.target.value })} />
            <div className="row"><select value={tcfg.n} onChange={e => setTcfg({ ...tcfg, n: e.target.value })}><option value={5}>5 питань</option><option value={10}>10 питань</option><option value={15}>15 питань</option></select>
              <select value={tcfg.kind} onChange={e => setTcfg({ ...tcfg, kind: e.target.value })}><option value="mix">Змішаний</option><option value="choice">Тільки з варіантами</option><option value="open">Відкриті питання</option></select></div>
            <button className="btn" onClick={createTest} disabled={tbusy}>{tbusy ? 'Складаю тест…' : 'Створити тест'}</button>
            {tmsg && <div className="sub" style={{ marginTop: 10 }}>{tmsg}</div>}</div>
          {tests.length > 0 && <div className="card"><div className="sec">Мої тести</div>{tests.map(t => (
            <div className="it" key={t.id}><div className="b" onClick={() => { setTview(t.id); setQi(0); setTmsg(''); }}><div className="t">{t.title}</div>
              <div className="meta"><span>{new Date(t.created).toLocaleDateString('uk-UA')}</span><span>{t.done ? r1(tScore(t)) + ' з ' + t.qs.length : 'не завершено'}</span></div></div>
              <button className="x" onClick={() => setTests(tests.filter(x => x.id !== t.id))} aria-label="Видалити">×</button></div>))}</div>}
        </>}
      </>}

      {tab === 'ai' && <>
        <div className="top"><h1>Помічник</h1><div className="sub">Може сам додавати задачі й події, складати графік і створювати картки</div></div>
        <div>{[['Склади план на тиждень з моїх задач', 1], ['Що робити просто зараз?', 1], ['Додай: ', 0], ['Зроби картки за темою: ', 0], ['Поясни тему простими словами: ', 0]].map(([q, go]) =>
          <button className="chip" key={q} onClick={() => go ? ask(q) : setInp(q)}>{q.replace(': ', '…')}</button>)}</div>
        {msgs.map((x, i) => <div key={i} className={'bubble' + (x.role === 'user' ? ' me' : '')}>{x.text}{x.n > 0 && <div className="applied">Внесено змін: {x.n}</div>}</div>)}
        {busy && <div className="sub">Думаю…</div>}
        {undo && <div className="card undo"><span className="sub">ШІ змінив застосунок</span><button className="chip" style={{ margin: 0 }} onClick={doUndo}>Скасувати зміни</button></div>}
        <div className="card" style={{ marginTop: 12 }}>
          <textarea rows={3} placeholder="Напишіть, що зробити або що пояснити" value={inp} onChange={e => setInp(e.target.value)} />
          <div className="row"><button className="btn" onClick={() => ask(inp)}>Надіслати</button><button className="chip" style={{ margin: 0 }} onClick={() => setMsgs([])}>Очистити</button></div>
        </div>
        <div ref={endRef} />
      </>}

      {tab === 'set' && <>
        <div className="top"><h1>Налаштування</h1></div>
        <div className="card"><div className="sec">Пароль застосунку для ШІ</div>
          <input type="password" placeholder="Пароль" defaultValue={localStorage.getItem('helper-pass') || ''} onChange={e => localStorage.setItem('helper-pass', e.target.value)} /></div>
        <div className="card"><div className="sec">О котрій годині починаєте займатися</div>
          <input type="number" min="0" max="23" value={start} onChange={e => setStart(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))} /></div>
        <div className="card"><div className="sec">Годин на день для задач</div>
          {[1, 2, 3, 4, 5, 6, 0].map(i => <div className="row" style={{ alignItems: 'center' }} key={i}><span style={{ width: 36 }}>{DN[i]}</span>
            <input type="number" min="0" max="16" step="0.5" value={cap[i]} onChange={e => setCap(cap.map((c, j) => j === i ? Math.max(0, parseFloat(e.target.value) || 0) : c))} /></div>)}</div>
        <button className="btn alt" onClick={() => setTab('today')}>Назад</button>
      </>}

      {(tab === 'today' || tab === 'tasks' || tab === 'cal') && <button className="fab" onClick={openNew} aria-label="Додати">+</button>}
      {tab === 'notes' && <button className="fab" onClick={() => openNote('new')} aria-label="Нова нотатка">+</button>}

      {sheet && <div className="ov" onClick={closeSheet}><div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="seg"><button className={!ev ? 'on' : ''} onClick={() => setF({ ...f, kind: 'task' })}>Задача</button><button className={ev ? 'on' : ''} onClick={() => setF({ ...f, kind: 'event' })}>Подія</button></div>
        <input style={{ marginTop: 12 }} autoFocus placeholder={ev ? 'Наприклад: стоматолог' : 'Що потрібно зробити або вивчити'} value={f.t} onChange={e => setF({ ...f, t: e.target.value })} />
        <div className="row"><select value={f.area} onChange={e => setF({ ...f, area: e.target.value })}>{Object.entries(AREA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          {ev ? <input type="time" value={f.time} onChange={e => setF({ ...f, time: e.target.value })} /> : <input type="number" min="0.5" step="0.5" placeholder="Годин" value={f.h} onChange={e => setF({ ...f, h: e.target.value })} />}</div>
        <div className="row"><input type="date" value={f.due} onChange={e => setF({ ...f, due: e.target.value })} />
          {ev ? <input type="number" min="0.5" step="0.5" placeholder="Тривалість, год" value={f.h} onChange={e => setF({ ...f, h: e.target.value })} /> : <select value={f.pri} onChange={e => setF({ ...f, pri: e.target.value })}><option value={1}>Звичайна</option><option value={2}>Важлива</option></select>}</div>
        <div className="row"><select value={f.repeat} onChange={e => setF({ ...f, repeat: e.target.value })}>{Object.entries(REP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <textarea rows={2} placeholder="Нотатка (необов’язково)" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
        <div className="row"><button className="btn" onClick={saveTask}>{sheet === 'new' ? 'Додати' : 'Зберегти'}</button>
          {sheet !== 'new' && <button className="btn alt" onClick={() => del(sheet)}>Видалити</button>}</div>
      </div></div>}

      {nview != null && <div className="nv">
        <div className="nvbar"><button className="chip" onClick={closeNote}>Закрити</button><span className="sub">{ntext.split(/\s+/).filter(Boolean).length} слів</span>
          {flow ? <button className="chip" onClick={() => setFlow(false)}>Готово</button> : <button className="chip" onClick={() => setFlow(true)}>Писати в потоці</button>}</div>
        {flow ? (() => { const ws = ntext.split(/\s+/).filter(Boolean); const tail = ws.slice(-7); return (
          <div className="flow" onClick={() => taRef.current && taRef.current.focus()}>
            <textarea ref={taRef} className="hid" autoFocus value={ntext} onChange={e => setNtext(e.target.value)} />
            <div className="fade">{tail.map((w, i) => <span key={ws.length - tail.length + i} style={{ opacity: Math.pow((i + 1) / tail.length, 2) }}>{w} </span>)}<span className="cur" /></div>
            <div className="sub fh">Пишіть без зупинки. Текст з’явиться, коли натиснете «Готово»</div>
          </div>); })() : <>
          <textarea className="ned" value={ntext} onChange={e => setNtext(e.target.value)} placeholder="Почніть писати…" />
          <button className="chip" onClick={delNote}>Видалити нотатку</button></>}
      </div>}

      {tt && <div className="nv">
        <div className="nvbar"><button className="chip" onClick={() => setTview(null)}>Закрити</button><span className="sub">{tt.done ? 'Результат' : (qi + 1) + ' з ' + tt.qs.length}</span><span /></div>
        {!tt.done ? (() => { const q = tt.qs[qi]; return (
          <div className="quiz">
            <div className="qq">{q.q}</div>
            {q.type === 'choice' ? q.options.map((o, j) => <button key={j} className={'opt' + (tt.ans[qi] === j ? ' on' : '')} onClick={() => setAns(tt, qi, j)}>{o}</button>)
              : <textarea rows={6} value={tt.ans[qi] || ''} onChange={e => setAns(tt, qi, e.target.value)} placeholder="Ваша відповідь" />}
            <div className="row" style={{ marginTop: 16 }}>{qi > 0 && <button className="btn alt" onClick={() => setQi(qi - 1)}>Назад</button>}
              {qi < tt.qs.length - 1 ? <button className="btn" onClick={() => setQi(qi + 1)}>Далі</button> : <button className="btn" onClick={() => patchTest(tt.id, { done: true })}>Завершити</button>}</div>
          </div>); })() : (
          <div className="quiz">
            <div className="big">{r1(tScore(tt))} з {tt.qs.length}</div><div className="sub" style={{ marginBottom: 16 }}>{Math.round(tScore(tt) / tt.qs.length * 100)}%</div>
            {tt.qs.some((q, i) => q.type === 'open' && (tt.ans[i] || '').trim() && !(tt.grades && tt.grades[i])) && <button className="btn" style={{ marginBottom: 14 }} onClick={() => gradeOpen(tt)} disabled={tbusy}>{tbusy ? 'Перевіряю…' : 'Оцінити відкриті відповіді через ШІ'}</button>}
            {tt.qs.map((q, i) => { const ok = okOf(tt, q, i); return (
              <div className="card" key={i}><div className="sec">Питання {i + 1}</div><div className="t">{q.q}</div>
                <div className={'verdict ' + (ok === true ? 'ok' : ok === false ? 'bad' : '')}>{ok === true ? 'Вірно' : ok === false ? 'Невірно' : 'Чекає на оцінку'}</div>
                {q.type === 'choice' ? <><div className="sub">Ваша відповідь: {tt.ans[i] != null ? q.options[tt.ans[i]] : '—'}</div>{ok === false && <div className="sub">Правильна: {q.options[q.answer]}</div>}</>
                  : <><div className="sub">Ваша відповідь: {tt.ans[i] || '—'}</div><div className="sub">Еталон: {q.answer}</div>{tt.grades && tt.grades[i] && <div className="sub">{r1(tt.grades[i].score)}: {tt.grades[i].comment}</div>}</>}
                {q.explain && <div className="note">{q.explain}</div>}</div>); })}
            <div className="row"><button className="btn alt" onClick={() => cardsFromTest(tt)}>Картки з помилок</button><button className="btn alt" onClick={() => { patchTest(tt.id, { ans: {}, grades: {}, done: false }); setQi(0); setTmsg(''); }}>Пройти знову</button></div>
            {tmsg && <div className="sub">{tmsg}</div>}
          </div>)}
      </div>}

      <nav className="tabbar">{TABS.map(([k, n]) => <button key={k} className={k === tab ? 'on' : ''} onClick={() => setTab(k)} aria-label={n}><Icon n={k} s={26} /></button>)}</nav>
    </div>
  );
}
