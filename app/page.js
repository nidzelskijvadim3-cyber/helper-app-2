'use client';
import { useState, useEffect, useMemo, useRef } from 'react';

const DN = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const AREA = { study: 'Навчання', work: 'Робота' };
const TABS = [['today', 'Сьогодні'], ['tasks', 'Задачі'], ['plan', 'План'], ['notes', 'Нотатки'], ['cards', 'Картки'], ['ai', 'ШІ']];
const ICONS = {
  today: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4" /></>,
  tasks: <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" /></>,
  plan: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M7 9h6M7 13h10M7 17h4" /></>,
  cards: <><rect x="3" y="7" width="14" height="12" rx="2" /><path d="M7 4h12a2 2 0 0 1 2 2v10" /></>,
  ai: <><path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" /></>,
  notes: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
  set: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>
};
const Icon = ({ n, s = 24 }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[n]}</svg>;

const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const r1 = x => Math.round(x * 10) / 10;
const hm = m => pad(Math.floor(m / 60) % 24) + ':' + pad(Math.round(m % 60));
const dm = s => s.slice(8) + '.' + s.slice(5, 7);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const EMPTY = { t: '', area: 'study', h: '', due: '', pri: 1, note: '' };

function makePlan(items, cap) {
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < 14; i++) { const d = new Date(t0); d.setDate(d.getDate() + i); days.push({ d, cap: cap[d.getDay()], blocks: [] }); }
  const open = items.filter(x => !x.done).map(x => ({ ...x, left: x.h }));
  open.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.pri || 1) - (a.pri || 1) || a.id - b.id);
  const late = [];
  for (const it of open) {
    for (const day of days) {
      if (it.left <= 0) break;
      if (it.due && ymd(day.d) > it.due) break;
      const free = day.cap - day.blocks.reduce((s, b) => s + b.h, 0);
      if (free <= 0) continue;
      const h = Math.min(free, it.left);
      day.blocks.push({ id: it.id, t: it.t, h, area: it.area }); it.left -= h;
    }
    if (it.left > 0.001) late.push({ t: it.t, left: it.left });
  }
  return { days, late };
}

function applyActions(acts, st) {
  let items = [...st.items], cap = [...st.cap], start = st.start, cards = [...st.cards], notes = [...(st.notes || [])], n = 0, k = 0;
  const nid = () => Date.now() + (k++);
  for (const a of acts) {
    if (!a || typeof a !== 'object') continue;
    const aid = Number(a.id);
    if (a.type === 'add_task' && a.t) {
      items.push({ id: nid(), t: String(a.t), area: a.area === 'work' ? 'work' : 'study', h: Number(a.h) > 0 ? Number(a.h) : 1, due: isDate(a.due) ? a.due : '', pri: Number(a.pri) === 2 ? 2 : 1, note: '', done: false }); n++;
    } else if (a.type === 'update_task') {
      items = items.map(i => {
        if (i.id !== aid) return i; n++;
        const p = {};
        if (a.t) p.t = String(a.t);
        if (a.area) p.area = a.area === 'work' ? 'work' : 'study';
        if (Number(a.h) > 0) p.h = Number(a.h);
        if (a.due !== undefined) p.due = isDate(a.due) ? a.due : '';
        if (a.pri) p.pri = Number(a.pri) === 2 ? 2 : 1;
        return { ...i, ...p };
      });
    } else if (a.type === 'complete_task') {
      items = items.map(i => { if (i.id !== aid || i.done) return i; n++; return { ...i, done: true, doneAt: ymd(new Date()) }; });
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

function parseAI(raw) {
  const s = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { const o = JSON.parse(s); return { reply: String(o.reply || ''), actions: Array.isArray(o.actions) ? o.actions : [] }; }
  catch (e) { return { reply: String(raw), actions: [] }; }
}

export default function Home() {
  const [tab, setTab] = useState('today');
  const [items, setItems] = useState([]);
  const [cap, setCap] = useState([3, 2, 2, 2, 2, 2, 3]);
  const [start, setStart] = useState(17);
  const [cards, setCards] = useState([]);
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
  const [notes, setNotes] = useState([]);
  const [nview, setNview] = useState(null);
  const [ntext, setNtext] = useState('');
  const [flow, setFlow] = useState(false);
  const [nq, setNq] = useState('');
  const taRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('helper-next') || '{}');
      if (s.items) setItems(s.items); if (s.cap) setCap(s.cap); if (s.msgs) setMsgs(s.msgs);
      if (s.start) setStart(s.start); if (s.cards) setCards(s.cards); if (s.notes) setNotes(s.notes);
    } catch (e) {}
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem('helper-next', JSON.stringify({ items, cap, msgs, start, cards, notes })); }, [items, cap, msgs, start, cards, notes, ready]);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy, tab]);
  const plan = useMemo(() => makePlan(items, cap), [items, cap]);
  const stRef = useRef(null);
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
  const closeSheet = () => setSheet(null);
  const openNote = id => {
    if (id === 'new') { setNview(Date.now()); setNtext(''); setFlow(true); }
    else { const n = notes.find(x => x.id === id); setNview(id); setNtext(n ? n.text : ''); setFlow(false); }
  };
  const closeNote = () => { setNotes(notes.filter(n => n.text.trim())); setNview(null); setNtext(''); setFlow(false); };
  const delNote = () => { setNotes(notes.filter(n => n.id !== nview)); setNview(null); setNtext(''); setFlow(false); };
  const openNew = () => { setF(EMPTY); setSheet('new'); };
  const openEdit = i => { if (!i) return; setF({ t: i.t, area: i.area, h: String(i.h), due: i.due || '', pri: i.pri || 1, note: i.note || '' }); setSheet(i.id); };
  const saveTask = () => {
    if (!f.t.trim()) return;
    const h = parseFloat(f.h);
    const base = { t: f.t.trim(), area: f.area, h: h > 0 ? h : 1, due: f.due, pri: Number(f.pri), note: f.note.trim() };
    if (sheet === 'new') setItems([...items, { id: Date.now(), ...base, done: false }]);
    else setItems(items.map(i => i.id === sheet ? { ...i, ...base } : i));
    closeSheet();
  };
  const tog = id => setItems(items.map(i => i.id === id ? { ...i, done: !i.done, doneAt: !i.done ? today : null } : i));
  const del = id => { setItems(items.filter(i => i.id !== id)); closeSheet(); };

  async function ask(text) {
    if (!text.trim() || busy) return;
    const next = [...msgs, { role: 'user', text }];
    setMsgs(next); setInp(''); setBusy(true);
    try {
      const s0 = stRef.current;
      const ctx = {
        today, weekday: now.getDay(), start: s0.start, capacityByWeekday: s0.cap, cardsCount: s0.cards.length,
        tasks: s0.items.filter(i => !i.done).map(({ id, t, area, h, due, pri }) => ({ id, t, area, h, due, pri: pri || 1 }))
      };
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-pass': localStorage.getItem('helper-pass') || '' },
        body: JSON.stringify({ messages: next.slice(-12).map(m => ({ role: m.role, text: m.text })), ctx })
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { setMsgs([...next, { role: 'model', text: 'Введіть пароль на вкладці налаштувань (шестерня вгорі) і повторіть запит.' }]); setTab('set'); }
      else if (!d.text) setMsgs([...next, { role: 'model', text: d.error || 'Порожня відповідь' }]);
      else {
        const { reply, actions } = parseAI(d.text);
        let n = 0;
        if (actions.length) {
          const cur = stRef.current;
          const res = applyActions(actions, cur);
          n = res.n;
          if (n) { setUndo(cur); setItems(res.st.items); setCap(res.st.cap); setStart(res.st.start); setCards(res.st.cards); setNotes(res.st.notes); }
        }
        setMsgs([...next, { role: 'model', text: reply || (n ? 'Готово.' : 'Порожня відповідь'), n }]);
      }
    } catch (e) { setMsgs([...next, { role: 'model', text: 'Немає зв’язку із сервером.' }]); }
    setBusy(false);
  }
  const doUndo = () => { if (!undo) return; setItems(undo.items); setCap(undo.cap); setStart(undo.start); setCards(undo.cards); setNotes(undo.notes || []); setUndo(null); };

  const row = i => (
    <div className={'it' + (i.done ? ' done' : '')} key={i.id}>
      <input type="checkbox" checked={!!i.done} onChange={() => tog(i.id)} />
      <div className="b" onClick={() => openEdit(i)}><div className="t">{i.t}</div>
        <div className="meta"><span className={'tag ' + i.area}>{AREA[i.area]}</span><span>{i.h} год</span>{i.due && <span className={!i.done && i.due < today ? 'late' : ''}>до {dm(i.due)}</span>}{i.pri === 2 && <span className="late">Важливо</span>}</div>
        {i.note && <div className="note">{i.note}</div>}</div>
    </div>);
  const section = (title, list) => list.length > 0 && <div className="card"><div className="sec">{title}</div>{list.map(row)}</div>;

  const open = items.filter(i => !i.done);
  const byDue = (a, b) => a.due.localeCompare(b.due);
  const overdue = open.filter(i => i.due && i.due < today).sort(byDue);
  const soon = open.filter(i => i.due && i.due >= today).sort(byDue);
  const nodue = open.filter(i => !i.due);
  const doneList = items.filter(i => i.done);
  const doneToday = items.filter(i => i.done && i.doneAt === today).length;
  const openH = open.reduce((s, i) => s + i.h, 0);
  const day0 = plan.days[0];
  let m = start * 60;
  const timeline = day0.blocks.map(b => { const s = m; m += b.h * 60; return { ...b, s, e: m }; });
  const dateStr = now.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
  const left = cards.filter(c => !c.known).sort((a, b) => a.seq - b.seq);
  const cur = left[0];
  const addCard = () => { if (!cq.trim() || !ca.trim()) return; setCards([...cards, { id: Date.now(), deck: '', q: cq.trim(), a: ca.trim(), known: false, seq: Date.now() }]); setCq(''); setCa(''); };

  return (
    <div className="wrap">
      {tab !== 'set' && <button className="gear" onClick={() => setTab('set')} aria-label="Налаштування"><Icon n="set" s={22} /></button>}

      {tab === 'today' && <>
        <div className="top"><div className="date">{dateStr}</div><h1>Сьогодні</h1>
          <div className="sub">Виконано: {doneToday}, залишилось задач на {r1(openH)} год</div></div>
        {overdue.length > 0 && <div className="card warn"><div className="sec">Прострочено</div>{overdue.map(row)}</div>}
        {timeline.length ? timeline.map(b => (
          <div className="tb" key={b.id}>
            <div className="tm">{hm(b.s)}<span>{hm(b.e)}</span></div>
            <div className={'tc ' + b.area} onClick={() => openEdit(items.find(i => i.id === b.id))}><div className="tt">{b.t}</div><div className="ts">{AREA[b.area]}, {r1(b.h)} год</div></div>
            <input type="checkbox" onChange={() => tog(b.id)} aria-label="Готово" />
          </div>)) : <div className="card"><div className="empty">На сьогодні нічого не заплановано. Натисніть «+» або попросіть ШІ скласти план.</div></div>}
        <button className="btn" onClick={() => { setTab('ai'); ask('Що мені краще зробити сьогодні і в якому порядку?'); }}>Запитати ШІ, з чого почати</button>
      </>}

      {tab === 'tasks' && <>
        <div className="top"><h1>Задачі</h1><div className="sub">Відкритих: {open.length}. Торкніться задачі, щоб змінити.</div></div>
        {!items.length && <div className="card"><div className="empty">Поки порожньо. Натисніть «+», щоб додати першу задачу.</div></div>}
        {section('Прострочено', overdue)}{section('З терміном', soon)}{section('Без терміну', nodue)}{section('Виконано', doneList)}
      </>}

      {tab === 'plan' && <>
        <div className="top"><h1>План</h1><div className="sub">Найближчі 14 днів</div></div>
        {plan.late.length > 0 && <div className="card warn"><div className="sec">Не вміщується в план</div>{plan.late.map((l, i) => <div className="blk" key={i}><span>{l.t}</span><span>{r1(l.left)} год</span></div>)}<div className="sub" style={{ marginTop: 8 }}>Додайте годин у налаштуваннях або посуньте термін.</div></div>}
        <div className="card">{plan.days.map((d, i) => { const used = d.blocks.reduce((s, b) => s + b.h, 0); return (
          <div className="day" key={i}><div className="dh"><b>{i === 0 ? 'Сьогодні' : DN[d.d.getDay()] + ' ' + d.d.getDate() + '.' + pad(d.d.getMonth() + 1)}</b><span className="sub">{r1(used)} з {d.cap} год</span></div>
            <div className="bar">{d.blocks.map((b, j) => <i key={j} className={b.area + '-bg'} style={{ width: (b.h / d.cap * 100) + '%' }} />)}</div>
            {d.blocks.map((b, j) => <div className="blk" key={j}><span>{b.t}</span><span className="sub">{r1(b.h)} год</span></div>)}</div>); })}</div>
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
        <div className="top"><h1>Картки</h1><div className="sub">Залишилось {left.length} з {cards.length}</div></div>
        {cur ? <div className="flip" onClick={() => setShow(!show)}><div className="sub">{cur.deck || 'Без колоди'}</div><div className="fq">{show ? cur.a : cur.q}</div><div className="sub">{show ? 'Відповідь' : 'Торкніться, щоб побачити відповідь'}</div></div>
          : <div className="card"><div className="empty">{cards.length ? 'Усі картки вивчено!' : 'Карток ще немає. Попросіть ШІ створити їх за темою або додайте вручну.'}</div></div>}
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

      {tab === 'ai' && <>
        <div className="top"><h1>Помічник</h1><div className="sub">Може сам додавати задачі, складати графік і створювати картки</div></div>
        <div>{[['Склади план на тиждень з моїх задач', 1], ['Що робити просто зараз?', 1], ['Додай задачі: ', 0], ['Зроби картки за темою: ', 0], ['Поясни тему простими словами: ', 0]].map(([q, go]) =>
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

      {(tab === 'today' || tab === 'tasks') && <button className="fab" onClick={openNew} aria-label="Додати задачу">+</button>}
      {tab === 'notes' && <button className="fab" onClick={() => openNote('new')} aria-label="Нова нотатка">+</button>}
      {sheet && <div className="ov" onClick={closeSheet}><div className="sheet" onClick={e => e.stopPropagation()}>
        <b>{sheet === 'new' ? 'Нова задача' : 'Редагування задачі'}</b>
        <input style={{ marginTop: 10 }} autoFocus placeholder="Що потрібно зробити або вивчити" value={f.t} onChange={e => setF({ ...f, t: e.target.value })} />
        <div className="row"><select value={f.area} onChange={e => setF({ ...f, area: e.target.value })}><option value="study">Навчання</option><option value="work">Робота</option></select>
          <input type="number" min="0.5" step="0.5" placeholder="Годин" value={f.h} onChange={e => setF({ ...f, h: e.target.value })} /></div>
        <div className="row"><input type="date" value={f.due} onChange={e => setF({ ...f, due: e.target.value })} />
          <select value={f.pri} onChange={e => setF({ ...f, pri: e.target.value })}><option value={1}>Звичайна</option><option value={2}>Важлива</option></select></div>
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

      <nav className="tabbar">{TABS.map(([k, n]) => <button key={k} className={k === tab ? 'on' : ''} onClick={() => setTab(k)} aria-label={n}><Icon n={k} s={26} /></button>)}</nav>
    </div>
  );
}
