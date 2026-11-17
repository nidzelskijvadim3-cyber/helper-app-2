// Інтервальне повторення (FSRS-6 через ts-fsrs 5.x). Поля картки в даних (усі необов'язкові):
// due (мс), stability, difficulty, reps, lapses, last (мс), state (0 нова, 1 вивчення, 2 повторення, 3 перевивчення),
// step (крок навчання), sched (запланованих днів), first (мс першого повторення — для ліміту нових на день).
// Старе поле known лишається дзеркалом (known === state 2) для старих версій застосунку.
import { fsrs, Rating, State } from 'ts-fsrs';

const F = fsrs({ request_retention: 0.9, maximum_interval: 3650, enable_fuzz: true, enable_short_term: true });
export const NEW_PER_DAY = 20;
export const LEARN_AHEAD = 20 * 60000; // як в Anki: картки вивчення, що стануть до повторення за 20 хв, показуються в кінці сесії
export const GRADES = { again: Rating.Again, good: Rating.Good, easy: Rating.Easy };

const DAY = 864e5;
const hash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
const startOfDay = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

// Нормалізація: картки без SRS-полів (старі дані) і картки, змінені старою версією застосунку.
// known:true без стану → вже вивчена, due через 2–4 дні (розкид за id, щоб не все в один день).
// known:false без стану → нова (due = зараз). Порушене дзеркало known ↔ state означає дію старої версії:
// known:true при state≠2 → «Знаю» у старій версії → як вивчена; known:false при state=2 → «Почати спочатку» → нова.
export function normCard(c, now = Date.now()) {
  const hasSt = Number.isInteger(c.state);
  if (hasSt && (c.known === true) === (c.state === State.Review)) return c;
  if (c.known === true) {
    const days = 2 + (hash(c.id) % 3);
    return { ...c, state: State.Review, due: startOfDay(now) + days * DAY + 6 * 3600e3, stability: days, difficulty: 5, reps: Math.max(1, c.reps || 0), lapses: c.lapses || 0, last: now, step: 0, sched: days, known: true };
  }
  return { ...c, state: State.New, due: now, stability: 0, difficulty: 0, reps: 0, lapses: c.lapses || 0, last: null, step: 0, sched: 0, known: false };
}
export const needsNorm = cards => cards.some(c => normCard(c) !== c);

const toF = c => ({ due: new Date(c.due || Date.now()), stability: c.stability || 0, difficulty: c.difficulty || 0, elapsed_days: 0, scheduled_days: c.sched || 0, learning_steps: c.step || 0, reps: c.reps || 0, lapses: c.lapses || 0, state: c.state || 0, last_review: c.last ? new Date(c.last) : undefined });
const fromF = (c, k, now) => ({ ...c, due: k.due.getTime(), stability: k.stability, difficulty: k.difficulty, reps: k.reps, lapses: k.lapses, state: k.state, last: now, step: k.learning_steps, sched: k.scheduled_days, first: c.first || now, known: k.state === State.Review });

// Попередній перегляд трьох відповідей для показаної картки: { again, good, easy } → нова картка
export function preview(c, now = Date.now()) {
  const p = F.repeat(toF(normCard(c, now)), new Date(now));
  const out = {};
  for (const [k, r] of Object.entries(GRADES)) out[k] = fromF(c, p[r].card, now);
  return out;
}

// Черга: картки до повторення (due ≤ зараз, крім нових) + нові в межах денного ліміту.
// deck: null — усі набори; ahead — дозволити картки вивчення, що стануть до повторення протягом LEARN_AHEAD.
export function queue(cards, { deck = null, now = Date.now(), limit = NEW_PER_DAY, ahead = false } = {}) {
  const t0 = startOfDay(now);
  const all = cards.map(c => normCard(c, now));
  const newToday = all.filter(c => c.first && c.first >= t0).length;
  const avail = Math.max(0, limit - newToday);
  const inDeck = all.filter(c => deck == null || (c.deck || '') === deck);
  const due = inDeck.filter(c => c.state !== State.New && c.due <= now).sort((a, b) => a.due - b.due);
  const fresh = inDeck.filter(c => c.state === State.New).sort((a, b) => (a.seq || a.id) - (b.seq || b.id)).slice(0, avail);
  let list = [...due, ...fresh];
  if (!list.length && ahead) list = inDeck.filter(c => (c.state === State.Learning || c.state === State.Relearning) && c.due <= now + LEARN_AHEAD).sort((a, b) => a.due - b.due);
  return { list, nDue: due.length, nNew: fresh.length, avail, newLeft: inDeck.filter(c => c.state === State.New).length };
}

// Коли наступні картки: { ts, n } — найближчий момент і скільки карток стане до повторення в той день (або null)
export function nextUp(cards, { deck = null, now = Date.now(), limit = NEW_PER_DAY } = {}) {
  const all = cards.map(c => normCard(c, now)).filter(c => deck == null || (c.deck || '') === deck);
  const fut = all.filter(c => c.state !== State.New && c.due > now).sort((a, b) => a.due - b.due);
  const tomorrow = startOfDay(now) + DAY;
  const hasNew = all.some(c => c.state === State.New);
  let ts = fut.length ? fut[0].due : null;
  if (hasNew && (ts == null || ts >= tomorrow)) ts = ts == null ? tomorrow : Math.min(ts, tomorrow);
  if (ts == null) return null;
  const d0 = startOfDay(ts), d1 = d0 + DAY;
  let n = fut.filter(c => c.due >= d0 && c.due < d1).length;
  if (d0 === tomorrow) n += Math.min(all.filter(c => c.state === State.New).length, limit);
  return { ts, n, sameDay: d0 === startOfDay(now) };
}

export const isLearned = c => normCard(c).state === State.Review;
export const resetCard = c => ({ ...c, state: State.New, due: Date.now(), stability: 0, difficulty: 0, reps: 0, lapses: 0, last: null, step: 0, sched: 0, first: undefined, known: false });
export const newCardFields = now => ({ known: false, state: State.New, due: now, stability: 0, difficulty: 0, reps: 0, lapses: 0, last: null, step: 0, sched: 0 });

// Тривалість інтервалу для підпису під кнопкою: «1 хв», «10 хв», «3 год», «8 днів», «2 міс.», «1,5 р.»
export function ivParts(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return [m, 'min'];
  const h = Math.round(m / 60);
  if (h < 24) return [h, 'h'];
  const d = Math.round(ms / DAY);
  if (d < 31) return [d, 'd'];
  const mo = Math.round(d / 30.4);
  if (mo < 12) return [mo, 'mo'];
  return [Math.round(d / 36.5) / 10, 'y'];
}
