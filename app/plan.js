// Планувальник і лічильники (чисті функції без браузерних API, їх можна тестувати в Node).
// Варіант B «навчання в центрі, життя навколо»: події будь-якої категорії — це зайнятий час,
// їхні години віднімаються від ємності дня перед розподілом задач.

const pad = n => String(n).padStart(2, '0');
export const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const isEv = i => !!i && i.kind === 'event';
export const isRep = i => !!i && !!i.repeat && i.repeat !== 'none';
export const isExam = i => !!i && i.exam === true;
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

// Чи припадає запис на дату d. until (необов'язково) — останній день повтору включно; старі записи без until повторюються без кінця.
export function occurs(i, d) {
  if (!i || !i.due) return false;
  if (!isRep(i)) return i.due === d;
  if (d < i.due) return false;
  if (isDate(i.until) && d > i.until) return false;
  const wd = new Date(d + 'T00:00:00').getDay();
  if (i.repeat === 'daily') return true;
  if (i.repeat === 'weekdays') return wd >= 1 && wd <= 5;
  if (i.repeat === 'weekly') return wd === new Date(i.due + 'T00:00:00').getDay();
  return false;
}

// Тривалість події в годинах: з даних; без тривалості — 1 год (іспит — 2 год, як при створенні іспиту і на шкалі дня).
export const evHours = e => (Number(e.h) > 0 ? Number(e.h) : isExam(e) ? 2 : 1);
// Зайнятий подіями час дня (години). Події, що перекриваються, рахуються як об'єднання інтервалів (не двічі).
// Іспит без часу займає свою тривалість без прив'язки до шкали.
export function busyHours(items, date) {
  const iv = [];
  let loose = 0;
  for (const e of items) {
    if (!isEv(e) || !occurs(e, date)) continue;
    const h = evHours(e);
    if (/^\d{2}:\d{2}$/.test(e.time || '')) { const s = +e.time.slice(0, 2) * 60 + +e.time.slice(3, 5); iv.push([s, Math.min(24 * 60, s + Math.round(h * 60))]); }
    else loose += h;
  }
  iv.sort((a, b) => a[0] - b[0]);
  let min = 0, cs = -1, ce = -1;
  for (const [s, e] of iv) { if (s > ce) { if (ce > cs) min += ce - cs; cs = s; ce = e; } else ce = Math.max(ce, e); }
  if (ce > cs) min += ce - cs;
  return Math.round((min / 60 + loose) * 100) / 100;
}

export function makePlan(items, cap, today0 = new Date()) {
  const t0 = new Date(today0); t0.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date(t0); d.setDate(d.getDate() + i);
    const date = ymd(d), base = Math.max(0, Number(cap[d.getDay()]) || 0), busy = busyHours(items, date);
    // cap — години на навчання й справи; free — що лишається після подій цього дня
    days.push({ d, date, base, busy, cap: Math.max(0, Math.round((base - busy) * 100) / 100), blocks: [] });
  }
  const tasks = items.filter(x => !isEv(x));
  // повторювані задачі стоять у свої дні завжди (як і раніше), але теж забирають ємність
  for (const it of tasks.filter(isRep)) for (const day of days) if (occurs(it, day.date)) day.blocks.push({ id: it.id, t: it.t, h: Number(it.h) || 0, area: it.area, rep: true, done: (it.doneDates || []).includes(day.date) });
  // разова задача з конкретним часом стоїть у свій день повністю (вона на шкалі в цей час), як і повторювані — забирає ємність, але не «переливається»
  const fixed = new Set();
  for (const it of tasks) {
    if (isRep(it) || it.done || !/^\d{2}:\d{2}$/.test(it.time || '') || !it.due) continue;
    const day = days.find(d => d.date === it.due); if (!day) continue;
    day.blocks.push({ id: it.id, t: it.t, h: Number(it.h) || 0, area: it.area }); fixed.add(it.id);
  }
  const open = tasks.filter(x => !isRep(x) && !x.done && !fixed.has(x.id)).map(x => ({ ...x, left: Number(x.h) || 0 }));
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
    if (it.left > 0.001) late.push({ id: it.id, t: it.t, left: it.left, due: it.due || '', overdue: !!it.due && it.due < days[0].date });
  }
  return { days, late };
}

// ===== Лічильники: одне визначення для всіх місць =====
// «Задача» — запис не-подія (kind !== 'event'). Події та іспити задачами не є і в «Виконано X з Y» не рахуються.
export const isTask = i => !!i && !isEv(i);
// «Відкриті задачі» — разові задачі, ще не виконані (повторювані сюди не входять: вони не закриваються назавжди).
export const openTasks = items => items.filter(i => isTask(i) && !isRep(i) && !i.done);
// «Без дати» — відкриті разові задачі без терміну.
export const noDateTasks = items => openTasks(items).filter(i => !i.due);
// «Виконано X з Y» для дня: унікальні задачі, показані на екрані дня (за id). list: [{id, done}]
export function dayCount(list) {
  const m = new Map();
  for (const x of list) if (x && x.id != null) m.set(x.id, (m.get(x.id) || false) || !!x.done);
  let done = 0; for (const v of m.values()) if (v) done++;
  return { done, total: m.size };
}
