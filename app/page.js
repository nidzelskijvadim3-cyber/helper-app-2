'use client';
import { useState, useEffect, useMemo, useRef } from 'react';

const DN = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const AREA = { study: 'Учёба', work: 'Работа' };
const TABS = [['today', 'Сегодня'], ['tasks', 'Задачи'], ['plan', 'План'], ['ai', 'ИИ'], ['set', 'Ещё']];
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const r1 = x => Math.round(x * 10) / 10;
const hm = m => pad(Math.floor(m / 60) % 24) + ':' + pad(Math.round(m % 60));
const dm = s => s.slice(8) + '.' + s.slice(5, 7);

function makePlan(items, cap) {
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < 14; i++) { const d = new Date(t0); d.setDate(d.getDate() + i); days.push({ d, cap: cap[d.getDay()], blocks: [] }); }
  const open = items.filter(x => !x.done).map(x => ({ ...x, left: x.h }));
  open.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.id - b.id);
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

export default function Home() {
  const [tab, setTab] = useState('today');
  const [items, setItems] = useState([]);
  const [cap, setCap] = useState([3, 2, 2, 2, 2, 2, 3]);
  const [start, setStart] = useState(17);
  const [msgs, setMsgs] = useState([]);
  const [inp, setInp] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [f, setF] = useState({ t: '', area: 'study', h: '', due: '' });
  const endRef = useRef(null);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('helper-next') || '{}');
      if (s.items) setItems(s.items); if (s.cap) setCap(s.cap); if (s.msgs) setMsgs(s.msgs); if (s.start) setStart(s.start);
    } catch (e) {}
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem('helper-next', JSON.stringify({ items, cap, msgs, start })); }, [items, cap, msgs, start, ready]);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy, tab]);
  const plan = useMemo(() => makePlan(items, cap), [items, cap]);
  if (!ready) return null;

  const now = new Date();
  const today = ymd(now);
  const add = () => {
    if (!f.t.trim()) return;
    const h = parseFloat(f.h);
    setItems([...items, { id: Date.now(), t: f.t.trim(), area: f.area, h: h > 0 ? h : 1, due: f.due, done: false }]);
    setF({ t: '', area: f.area, h: '', due: '' }); setSheet(false);
  };
  const tog = id => setItems(items.map(i => i.id === id ? { ...i, done: !i.done, doneAt: !i.done ? today : null } : i));
  const del = id => setItems(items.filter(i => i.id !== id));

  async function ask(text) {
    if (!text.trim() || busy) return;
    const next = [...msgs, { role: 'user', text }];
    setMsgs(next); setInp(''); setBusy(true);
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-pass': localStorage.getItem('helper-pass') || '' },
        body: JSON.stringify({ messages: next.slice(-12), tasks: items.filter(i => !i.done).map(({ t, area, h, due }) => ({ t, area, h, due })) })
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { setMsgs([...next, { role: 'model', text: 'Введите пароль во вкладке «Ещё» и повторите вопрос.' }]); setTab('set'); }
      else setMsgs([...next, { role: 'model', text: d.text || d.error || 'Пустой ответ' }]);
    } catch (e) { setMsgs([...next, { role: 'model', text: 'Нет связи с сервером.' }]); }
    setBusy(false);
  }

  const row = i => (
    <div className={'it' + (i.done ? ' done' : '')} key={i.id}>
      <input type="checkbox" checked={!!i.done} onChange={() => tog(i.id)} />
      <div className="b"><div className="t">{i.t}</div>
        <div className="meta"><span className={'tag ' + i.area}>{AREA[i.area]}</span><span>{i.h} ч</span>{i.due && <span className={!i.done && i.due < today ? 'late' : ''}>до {dm(i.due)}</span>}</div></div>
      <button className="x" onClick={() => del(i.id)} aria-label="Удалить">×</button>
    </div>);
  const section = (title, list) => list.length > 0 && <div className="card"><div className="sec">{title}</div>{list.map(row)}</div>;

  const open = items.filter(i => !i.done);
  const byDue = (a, b) => a.due.localeCompare(b.due);
  const overdue = open.filter(i => i.due && i.due < today).sort(byDue);
  const soon = open.filter(i => i.due && i.due >= today).sort(byDue);
  const nodue = open.filter(i => !i.due);
  const done = items.filter(i => i.done);
  const doneToday = items.filter(i => i.done && i.doneAt === today).length;
  const openH = open.reduce((s, i) => s + i.h, 0);
  const day0 = plan.days[0];
  let m = start * 60;
  const timeline = day0.blocks.map(b => { const s = m; m += b.h * 60; return { ...b, s, e: m }; });
  const dateStr = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="wrap">
      {tab === 'today' && <>
        <div className="top"><div className="date">{dateStr}</div><h1>Сегодня</h1>
          <div className="sub">Выполнено: {doneToday}, осталось задач на {r1(openH)} ч</div></div>
        {overdue.length > 0 && <div className="card warn"><div className="sec">Просрочено</div>{overdue.map(row)}</div>}
        {timeline.length ? timeline.map(b => (
          <div className="tb" key={b.id}>
            <div className="tm">{hm(b.s)}<span>{hm(b.e)}</span></div>
            <div className={'tc ' + b.area}><div className="tt">{b.t}</div><div className="ts">{AREA[b.area]}, {r1(b.h)} ч</div></div>
            <input type="checkbox" onChange={() => tog(b.id)} aria-label="Готово" />
          </div>)) : <div className="card"><div className="empty">На сегодня ничего не запланировано. Нажмите «+», чтобы добавить задачу.</div></div>}
        <button className="btn" onClick={() => { setTab('ai'); ask('Что мне лучше сделать сегодня и в каком порядке?'); }}>Спросить ИИ, с чего начать</button>
      </>}

      {tab === 'tasks' && <>
        <div className="top"><h1>Задачи</h1><div className="sub">Всего открытых: {open.length}</div></div>
        {!items.length && <div className="card"><div className="empty">Пока пусто. Нажмите «+», чтобы добавить первую задачу.</div></div>}
        {section('Просрочено', overdue)}{section('Со сроком', soon)}{section('Без срока', nodue)}{section('Выполнено', done)}
      </>}

      {tab === 'plan' && <>
        <div className="top"><h1>План</h1><div className="sub">Ближайшие 14 дней</div></div>
        {plan.late.length > 0 && <div className="card warn"><div className="sec">Не помещается в план</div>{plan.late.map((l, i) => <div className="blk" key={i}><span>{l.t}</span><span>{r1(l.left)} ч</span></div>)}<div className="sub" style={{ marginTop: 8 }}>Добавьте часов во вкладке «Ещё» или сдвиньте срок.</div></div>}
        <div className="card">{plan.days.map((d, i) => { const used = d.blocks.reduce((s, b) => s + b.h, 0); return (
          <div className="day" key={i}><div className="dh"><b>{i === 0 ? 'Сегодня' : DN[d.d.getDay()] + ' ' + d.d.getDate() + '.' + pad(d.d.getMonth() + 1)}</b><span className="sub">{r1(used)} из {d.cap} ч</span></div>
            <div className="bar">{d.blocks.map((b, j) => <i key={j} className={b.area + '-bg'} style={{ width: (b.h / d.cap * 100) + '%' }} />)}</div>
            {d.blocks.map((b, j) => <div className="blk" key={j}><span>{b.t}</span><span className="sub">{r1(b.h)} ч</span></div>)}</div>); })}</div>
      </>}

      {tab === 'ai' && <>
        <div className="top"><h1>Помощник</h1><div className="sub">Видит ваши задачи и помогает планировать и учиться</div></div>
        <div>{[['Спланируй мою неделю', 1], ['Что делать прямо сейчас?', 1], ['Объясни тему простыми словами: ', 0], ['Составь проверочную на 5 вопросов по теме: ', 0]].map(([q, go]) =>
          <button className="chip" key={q} onClick={() => go ? ask(q) : setInp(q)}>{q.replace(': ', '…')}</button>)}</div>
        {msgs.map((x, i) => <div key={i} className={'bubble' + (x.role === 'user' ? ' me' : '')}>{x.text}</div>)}
        {busy && <div className="sub">Думаю…</div>}
        <div className="card" style={{ marginTop: 12 }}>
          <textarea rows={3} placeholder="Спросите что угодно" value={inp} onChange={e => setInp(e.target.value)} />
          <div className="row"><button className="btn" onClick={() => ask(inp)}>Отправить</button><button className="chip" style={{ margin: 0 }} onClick={() => setMsgs([])}>Очистить</button></div>
        </div>
        <div ref={endRef} />
      </>}

      {tab === 'set' && <>
        <div className="top"><h1>Ещё</h1></div>
        <div className="card"><div className="sec">Пароль приложения</div>
          <input type="password" placeholder="Пароль для ИИ" defaultValue={localStorage.getItem('helper-pass') || ''} onChange={e => localStorage.setItem('helper-pass', e.target.value)} /></div>
        <div className="card"><div className="sec">Во сколько начинаете заниматься</div>
          <input type="number" min="0" max="23" value={start} onChange={e => setStart(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))} /></div>
        <div className="card"><div className="sec">Часов в день на задачи</div>
          {[1, 2, 3, 4, 5, 6, 0].map(i => <div className="row" style={{ alignItems: 'center' }} key={i}><span style={{ width: 36 }}>{DN[i]}</span>
            <input type="number" min="0" max="16" step="0.5" value={cap[i]} onChange={e => setCap(cap.map((c, j) => j === i ? Math.max(0, parseFloat(e.target.value) || 0) : c))} /></div>)}</div>
      </>}

      {(tab === 'today' || tab === 'tasks') && <button className="fab" onClick={() => setSheet(true)} aria-label="Добавить задачу">+</button>}
      {sheet && <div className="ov" onClick={() => setSheet(false)}><div className="sheet" onClick={e => e.stopPropagation()}>
        <b>Новая задача</b>
        <input style={{ marginTop: 10 }} autoFocus placeholder="Что нужно сделать или выучить" value={f.t} onChange={e => setF({ ...f, t: e.target.value })} />
        <div className="row"><select value={f.area} onChange={e => setF({ ...f, area: e.target.value })}><option value="study">Учёба</option><option value="work">Работа</option></select>
          <input type="number" min="0.5" step="0.5" placeholder="Часов" value={f.h} onChange={e => setF({ ...f, h: e.target.value })} /></div>
        <div className="row"><input type="date" value={f.due} onChange={e => setF({ ...f, due: e.target.value })} /></div>
        <button className="btn" onClick={add}>Добавить</button>
      </div></div>}

      <nav className="tabbar">{TABS.map(([k, n]) => <button key={k} className={k === tab ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</nav>
    </div>
  );
}
