// Локальний розбір швидкого вводу (без ШІ): українська й німецька.
// Розпізнає дату (сьогодні/завтра/післязавтра, дні тижня, 20.11, 20 листопада), час (о 13:00, 13:30, о 13, 13 год, 13 Uhr),
// тривалість (2 год, 1,5 год, 30 хв, 2 Std., 45 Min.) і повтор (щодня, у будні, щотижня).
// Є час → подія, інакше → задача. Категорія за замовчуванням — «Навчання» (кілька очевидних слів змінюють її).
// Результат — дія у форматі ШІ (add_task / add_event), щоб використати те саме превʼю.

const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// дні тижня: 0 = неділя
const WD = [
  [0, ['неділя', 'неділю', 'неділі', 'нд', 'sonntag', 'sonntags', 'so\\.']],
  [1, ['понеділок', 'понеділка', 'пн', 'montag', 'montags', 'mo\\.']],
  [2, ['вівторок', 'вівторка', 'вт', 'dienstag', 'dienstags', 'di\\.']],
  [3, ['середа', 'середу', 'середи', 'ср', 'mittwoch', 'mittwochs', 'mi\\.']],
  [4, ['четвер', 'четверга', 'чт', 'donnerstag', 'donnerstags', 'do\\.']],
  [5, ['пʼятниця', 'пʼятницю', 'пʼятниці', 'пт', 'freitag', 'freitags', 'fr\\.']],
  [6, ['субота', 'суботу', 'суботи', 'сб', 'samstag', 'samstags', 'sa\\.']],
];
const WREP = ['неділі', 'понеділка', 'вівторка', 'середи', 'четверга', 'пʼятниці', 'суботи'];
const MON = [
  ['січня', 'січень', 'januar', 'jan\\.?'], ['лютого', 'лютий', 'februar', 'feb\\.?'], ['березня', 'березень', 'märz', 'maerz', 'mär\\.?'],
  ['квітня', 'квітень', 'april', 'apr\\.?'], ['травня', 'травень', 'mai'], ['червня', 'червень', 'juni', 'jun\\.?'],
  ['липня', 'липень', 'juli', 'jul\\.?'], ['серпня', 'серпень', 'august', 'aug\\.?'], ['вересня', 'вересень', 'september', 'sept?\\.?'],
  ['жовтня', 'жовтень', 'oktober', 'okt\\.?'], ['листопада', 'листопад', 'november', 'nov\\.?'], ['грудня', 'грудень', 'dezember', 'dez\\.?'],
];
// межі слова з кирилицею: \b у JS не працює для кирилиці, тому власні межі
const L = '(?<![\\p{L}\\p{N}])', R = '(?![\\p{L}\\p{N}])';
const re = (s, f = 'iu') => new RegExp(s, f);
const PREP = '(?:(?:у|в|на|до|о|об|am|um|bis|an|ab)\\s+)?';
const PREP_D = '(?:(?:на|до|am|bis|an|ab)\\s+)?'; // для числової дати без «о/um»: «о 9.05» — це час

const AREA_WORDS = [
  ['health', ['лікар', 'стоматолог', 'зубн', 'аналіз', 'спортзал', 'тренуванн', 'басейн', 'arzt', 'zahnarzt', 'ärztin', 'training', 'fitness', 'physio']],
  ['work', ['робот', 'змін', 'нарада', 'клієнт', 'arbeit', 'schicht', 'meeting', 'kunde']],
  ['home', ['прибира', 'прання', 'покупк', 'купити', 'магазин', 'kaufen', 'putzen', 'wäsche', 'einkauf']],
];

function cleanTitle(s) {
  let t = s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1');
  // зайві прийменники, що лишилися після вирізання дати й часу
  for (let k = 0; k < 3; k++) t = t.replace(re(L + '(?:у|в|на|до|о|об|з|am|um|bis|an|ab|für|von)\\s*$'), '').replace(re('^\\s*(?:у|в|на|о|об|am|um)' + R), '').trim();
  t = t.replace(/^[\s,.;:\-–—]+|[\s,.;:\-–—]+$/g, '').replace(/\s{2,}/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

export function localParse(text, now = new Date()) {
  let s = ' ' + String(text || '').replace(/[’'`]/g, 'ʼ') + ' ';
  const cut = m => { s = s.replace(m, ' '); };
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  let date = null, time = '', h = 0, repeat = 'none', wdRep = null;

  // ---- повтор ----
  let m;
  if ((m = s.match(re(L + '(?:щодня|кожного дня|кожен день|täglich|jeden tag)' + R)))) { repeat = 'daily'; cut(m[0]); }
  else if ((m = s.match(re(L + '(?:у будні|в будні|по буднях|щобудня|werktags|an werktagen)' + R)))) { repeat = 'weekdays'; cut(m[0]); }
  else if ((m = s.match(re(L + '(?:щотижня|кожного тижня|wöchentlich|jede woche)' + R)))) { repeat = 'weekly'; cut(m[0]); }
  else {
    // «кожен понеділок», «щопонеділка», «jeden Montag», «montags» → щотижня в цей день
    for (const [wd, names] of WD) {
      const full = names.filter(n => !n.includes('\\') && n.length > 2);
      const alt = ['(?:кожен|кожну|кожного|кожної|jeden)\\s+(?:' + full.join('|') + ')', 'що' + WREP[wd], ...full.filter(n => /s$/.test(n))];
      if ((m = s.match(re(L + '(?:' + alt.join('|') + ')' + R)))) { repeat = 'weekly'; wdRep = wd; cut(m[0]); break; }
    }
  }

  // ---- дата ----
  if ((m = s.match(re(L + PREP + '(післязавтра|übermorgen)' + R)))) { date = addDays(today, 2); cut(m[0]); }
  else if ((m = s.match(re(L + PREP + '(завтра|morgen)' + R)))) { date = addDays(today, 1); cut(m[0]); }
  else if ((m = s.match(re(L + PREP + '(сьогодні|heute)' + R)))) { date = today; cut(m[0]); }
  // 20.11 / 20.11.2026; «о 9.05» — це час, «1.5 год» — тривалість, тому не дата
  if (!date && (m = s.match(re(L + '(?<!(?:о|об|um)\\s+)' + PREP_D + '(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?(?![\\d:])(?!\\s*(?:год|годин|h(?![\\p{L}])|std|stund|хв|min))')))) {
    const d = +m[1], mo = +m[2]; let y = m[3] ? +m[3] : today.getFullYear(); if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      let dt = new Date(y, mo - 1, d); if (!m[3] && dt < today) dt = new Date(y + 1, mo - 1, d);
      if (dt.getDate() === d) { date = dt; cut(m[0]); }
    }
  }
  if (!date) {
    for (let k = 0; k < 12 && !date; k++) {
      const r = re(L + PREP + '(\\d{1,2})\\.?\\s+(?:' + MON[k].join('|') + ')' + R);
      if ((m = s.match(r))) {
        const d = +m[1]; let dt = new Date(today.getFullYear(), k, d); if (dt < today) dt = new Date(today.getFullYear() + 1, k, d);
        if (d >= 1 && d <= 31 && dt.getDate() === d) { date = dt; cut(m[0]); }
      }
    }
  }
  if (!date) {
    for (const [wd, names] of WD) {
      if ((m = s.match(re(L + PREP + '(?:' + names.join('|') + ')' + R)))) { date = addDays(today, (wd - today.getDay() + 7) % 7); cut(m[0]); break; }
    }
  }
  if (wdRep != null && !date) date = addDays(today, (wdRep - today.getDay() + 7) % 7);

  // ---- час ----
  const setT = (hh, mm) => { if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) { time = pad(hh) + ':' + pad(mm); return true; } return false; };
  if ((m = s.match(re(L + '(?:о|об|um|at|з|von|ab)?\\s*(\\d{1,2}):(\\d{2})(?:\\s*(?:год(?:ині)?|uhr))?(?![\\d])')))) { if (setT(+m[1], +m[2])) cut(m[0]); }
  if (!time && (m = s.match(re(L + '(?:о|об|um)\\s+(\\d{1,2})(?:[.](\\d{2}))?(?:\\s*(?:-?й|-?ій|год(?:ині)?|uhr))?' + R)))) { if (setT(+m[1], m[2] ? +m[2] : 0)) cut(m[0]); }
  if (!time && (m = s.match(re(L + '(\\d{1,2})(?:[.](\\d{2}))?\\s*uhr' + R)))) { if (setT(+m[1], m[2] ? +m[2] : 0)) cut(m[0]); }
  // «13 год» без прийменника: 13–23 — це час (такої довгої задачі майже не буває), 1–12 — тривалість
  if (!time && (m = s.match(re(L + '(?<!на\\s)(1[3-9]|2[0-3])\\s*год(?:ині)?' + R)))) { if (setT(+m[1], 0)) cut(m[0]); }

  // ---- тривалість ----
  if ((m = s.match(re(L + '(?:на\\s+|für\\s+)?(півгодини|пів години|halbe stunde)' + R)))) { h = 0.5; cut(m[0]); }
  else if ((m = s.match(re(L + '(?:на\\s+|für\\s+)?(\\d+(?:[.,]\\d+)?)\\s*(?:год(?:ин[иу]?|ину)?\\.?|h|std\\.?|stunden?)' + R)))) { h = parseFloat(m[1].replace(',', '.')); cut(m[0]); }
  else if ((m = s.match(re(L + '(?:на\\s+)?(годину|eine stunde)' + R)))) { h = 1; cut(m[0]); }
  if ((m = s.match(re(L + '(?:на\\s+|für\\s+)?(\\d+)\\s*(?:хв(?:илин[иу]?)?\\.?|min\\.?|minuten?)' + R)))) { h = Math.round((h + +m[1] / 60) * 100) / 100; cut(m[0]); }
  if (!(h > 0) || h > 24) h = 0;

  // ---- без дати, але з часом: сьогодні, або завтра, якщо цей час уже минув ----
  if (time && !date) {
    const nowMin = now.getHours() * 60 + now.getMinutes(), tm = +time.slice(0, 2) * 60 + +time.slice(3);
    date = tm < nowMin && repeat === 'none' ? addDays(today, 1) : today;
  }
  if (repeat !== 'none' && !date) date = today;

  const t = cleanTitle(s);
  if (!t) return null;
  const low = t.toLowerCase();
  let area = 'study';
  for (const [a, ws] of AREA_WORDS) if (ws.some(w => low.includes(w))) { area = a; break; }
  const ds = date ? ymd(date) : '';
  if (time) return { type: 'add_event', t, area, date: ds, time, h: h || 1, repeat };
  return { type: 'add_task', t, area, h: h || 1, due: ds, pri: 1, repeat };
}
