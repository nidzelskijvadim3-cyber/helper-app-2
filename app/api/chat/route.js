import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

// Модель задаётся змінною ANTHROPIC_MODEL; за замовчуванням Claude Haiku 5.5.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

// Глибина міркувань: швидкі режими (чат, швидке додавання) — low; тести й перевірка — medium.
const EFFORT = { chat: 'low', parse: 'low', tutor: 'low', explain: 'low', quiz: 'medium', grade: 'medium' };

// Підпис перед кожним зображенням (наприклад «с. 4»): m.imageLabels[i] відповідає m.images[i].
const labelOf = (m, i) => (Array.isArray(m.imageLabels) && m.imageLabels[i] ? String(m.imageLabels[i]).slice(0, 80) : '');

// data:image/png;base64,... → блок зображення Claude.
function imageBlock(url) {
  const s = String(url);
  const mediaType = (s.match(/^data:([^;]+)/) || [])[1] || 'image/jpeg';
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: s.split(',')[1] || '' } };
}

// Повідомлення застосунку {role, text, images} → формат Messages API.
function toClaudeMessages(messages) {
  const out = messages
    .map(m => {
      const role = m.role === 'user' ? 'user' : 'assistant';
      const text = String(m.text || '').trim();
      const images = role === 'user' ? (m.images || []) : [];
      if (!text && !images.length) return null;
      if (!images.length) return { role, content: text };
      const blocks = [];
      images.forEach((u, i) => { const l = labelOf(m, i); if (l) blocks.push({ type: 'text', text: l + ':' }); blocks.push(imageBlock(u)); });
      return { role, content: [...blocks, { type: 'text', text: text || 'Опиши зображення.' }] };
    })
    .filter(Boolean);
  // Розмова має починатися з повідомлення користувача.
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

async function claude(system, messages, mode) {
  // Читає ANTHROPIC_API_KEY із середовища. Одна повторна спроба й таймаут 25 с,
  // щоб за потреби встигнути перейти до запасного ШІ в межах maxDuration.
  const client = new Anthropic({ maxRetries: 1, timeout: 25000 });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system,
    output_config: { effort: EFFORT[mode] || 'low' },
    messages,
  });
  if (response.stop_reason === 'refusal') return { ok: false, err: 'запит відхилено політикою безпеки' };
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  if (!text) return { ok: false, err: response.stop_reason === 'max_tokens' ? 'відповідь задовга' : 'порожня відповідь' };
  return { ok: true, text };
}

// Запасні ШІ (працюють, поки немає ключа Claude або якщо Claude недоступний).
function withTimeout(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

async function deepseek(system, appMessages) {
  const key = process.env.DEEPSEEK_API_KEY;
  const hasImages = appMessages.some(m => m.images && m.images.length);
  const model = hasImages ? (process.env.DEEPSEEK_VISION_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-flash') : (process.env.DEEPSEEK_MODEL || 'deepseek-flash');
  const to = withTimeout(25000);
  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      signal: to.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model,
        stream: false,
        max_tokens: 8192, // тест на 30 питань із поясненнями не вміщується в ліміт за замовчуванням
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }].concat(appMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.images && m.images.length ? [{ type: 'text', text: m.text }].concat(...m.images.map((u, i) => (labelOf(m, i) ? [{ type: 'text', text: labelOf(m, i) + ':' }] : []).concat([{ type: 'image_url', image_url: { url: u } }]))) : m.text })))
      })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, err: (d.error && d.error.message) || ('HTTP ' + r.status) };
    const t = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    return t && t.trim() ? { ok: true, text: t } : { ok: false, err: 'порожня відповідь' };
  } catch (e) {
    return { ok: false, err: e.name === 'AbortError' ? 'немає відповіді за 25 с' : 'немає зв’язку' };
  } finally { to.done(); }
}

async function gemini(system, appMessages) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const to = withTimeout(25000);
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      signal: to.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: appMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }].concat(...(m.images || []).map((u, i) => (labelOf(m, i) ? [{ text: labelOf(m, i) + ':' }] : []).concat([{ inlineData: { mimeType: (String(u).match(/^data:([^;]+)/) || [])[1] || 'image/jpeg', data: String(u).split(',')[1] } }]))) })),
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 }
      })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, err: (d.error && d.error.message) || ('HTTP ' + r.status) };
    const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
    const t = parts.map(p => p.text || '').join('');
    return t.trim() ? { ok: true, text: t } : { ok: false, err: 'порожня відповідь' };
  } catch (e) {
    return { ok: false, err: e.name === 'AbortError' ? 'немає відповіді за 25 с' : 'немає зв’язку' };
  } finally { to.done(); }
}

// Провайдери: беруться лише ті, для яких задано ключ. Порядок — AI_ORDER (за замовчуванням Claude першим).
const PROVIDERS = {
  claude: { key: 'ANTHROPIC_API_KEY', run: async (system, appMessages, mode) => {
    const msgs = toClaudeMessages(appMessages);
    if (!msgs.length) return { ok: false, err: 'порожній запит' };
    try { return await claude(system, msgs, mode); } catch (e) { console.error('Claude API error:', e); return { ok: false, err: errorText(e) }; }
  } },
  deepseek: { key: 'DEEPSEEK_API_KEY', run: (system, appMessages) => deepseek(system, appMessages) },
  gemini: { key: 'GEMINI_API_KEY', run: (system, appMessages) => gemini(system, appMessages) },
};

function errorText(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'невірний ANTHROPIC_API_KEY';
  if (e instanceof Anthropic.PermissionDeniedError) return 'ключ не має доступу до моделі ' + MODEL;
  if (e instanceof Anthropic.NotFoundError) return 'модель ' + MODEL + ' не знайдена';
  if (e instanceof Anthropic.RateLimitError) return 'забагато запитів, спробуйте за хвилину';
  if (e instanceof Anthropic.BadRequestError) return 'некоректний запит: ' + e.message;
  if (e instanceof Anthropic.APIConnectionError) return 'немає зв’язку з Anthropic';
  if (e instanceof Anthropic.APIError) return 'помилка Anthropic ' + e.status;
  return 'невідома помилка';
}

const ACTIONS2 = ' Також: {"type":"create_folder","name":"..","color":"#hex","parent":"id або назва папки або порожній рядок"}; {"type":"rename_folder","id":число,"name":".."}; {"type":"move_note","id":число,"folder":"id або назва папки або порожній рядок"}; {"type":"create_doc","kind":"notebook або board","title":"..","folder":"id або назва","template":"blank|lined|grid|dots"}; {"type":"rename_doc","id":число,"title":".."}; {"type":"move_doc","id":число,"folder":"id або назва або порожній рядок"}. У add_task, add_event, update_task і add_note можна вказати "folder" (id або назва папки). Папки, нотатки й документи беруться зі стану (ctx.folders, ctx.notes, ctx.docs). Якщо є ctx.screen, це опис екрана, який користувач бачить зараз (у ctx.screen.openNote текст відкритої нотатки). Якщо до повідомлення додано зображення, уважно розгляни його, опиши або використай за запитом (наприклад, розпізнай рукописний текст, склади питання, занеси події з розкладу). Видаляти документи й папки не можна.';

const ACTIONS = 'Доступні дії: {"type":"add_task","t":"назва","area":"study|work|personal|health|home","h":години числом,"due":"YYYY-MM-DD або порожній рядок","pri":1 або 2,"repeat":"none|daily|weekdays|weekly"}; {"type":"add_event","t":"назва","area":"..","date":"YYYY-MM-DD","time":"HH:MM","h":тривалість у годинах,"repeat":"none|daily|weekdays|weekly"}; {"type":"update_task","id":число,"t":"..","area":"..","h":число,"date":"YYYY-MM-DD","time":"HH:MM","pri":1 або 2,"repeat":".."} (лише поля, що змінюються); {"type":"complete_task","id":число}; {"type":"delete_task","id":число}; {"type":"set_capacity","day":від 0 до 6 (0 це неділя),"h":години}; {"type":"set_start","hour":від 0 до 23}; {"type":"add_note","text":"текст нотатки"}; {"type":"add_cards","deck":"назва колоди","cards":[{"q":"питання","a":"відповідь"}]}; {"type":"add_exam","t":"предмет","date":"YYYY-MM-DD","time":"HH:MM або порожній рядок","folder":"id або назва папки з матеріалами або порожній рядок"} (лише коли користувач прямо каже про іспит, залік або екзамен з датою).';

// Матеріал, прикріплений чипом контексту (ctx.material): нотатка — текстом, зошит/дошка/фото — зображеннями сторінок
// (у повідомленні користувача, кожне з підписом «с. N»), набір карток — списком q/a.
function materialPrompt(m) {
  if (!m || typeof m !== 'object') return '';
  const title = String(m.title || '').slice(0, 80);
  const pages = Array.isArray(m.pages) ? m.pages.filter(n => Number.isInteger(n) && n > 0).slice(0, 4) : [];
  const head = 'МАТЕРІАЛ КОРИСТУВАЧА «' + title + '». Відповідай насамперед за ним. Якщо відповіді в матеріалі немає, прямо скажи про це («У матеріалі цього немає») і лише потім, якщо доречно, коротко поясни із загальних знань, позначивши це.';
  if (m.kind === 'note') return head + '\nТекст матеріалу:\n"""\n' + String(m.text || '').slice(0, 15000) + '\n"""';
  if (m.kind === 'deck') {
    const cards = Array.isArray(m.cards) ? m.cards.filter(c => c && c.q).slice(0, 200).map(c => ({ q: String(c.q).slice(0, 500), a: String(c.a || '').slice(0, 1000) })) : [];
    return head + ' Це набір карток (q питання, a відповідь): ' + JSON.stringify(cards);
  }
  if (m.kind === 'folder') {
    const notes = Array.isArray(m.notes) ? m.notes.slice(0, 30).map(n => '--- ' + String(n.t || '').slice(0, 80) + ' ---\n' + String(n.text || '')).join('\n').slice(0, 15000) : '';
    const docs = Array.isArray(m.docs) ? m.docs.slice(0, 40).map(d => String(d).slice(0, 80)) : [];
    return head.replace('МАТЕРІАЛ', 'ПАПКА МАТЕРІАЛІВ') + (notes ? '\nТекстові нотатки папки:\n"""\n' + notes + '\n"""' : '\nТекстових нотаток у папці немає.') + (docs.length ? '\nЗошити й дошки в папці (лише назви, їхній вміст тобі не видно): ' + JSON.stringify(docs) : '');
  }
  if (m.kind === 'doc') return head + ' Сторінки додано до повідомлення як зображення, перед кожним підпис «с. N»: ' + pages.map(n => 'с. ' + n).join(', ') + '. Уважно прочитай рукописний текст і схеми. Коли спираєшся на конкретну сторінку, став позначку точно у форматі [с. N] (N — номер сторінки цифрами, наприклад [с. 4]); цю позначку не перекладай і не змінюй навіть німецькою. Не вигадуй номери сторінок, яких немає у списку.';
  return '';
}

function appPrompt(ctx, parse) {
  const { material, ...state } = ctx || {};
  return [
    'Ти особистий помічник для повсякденного життя людини: навчання, робота, особисті справи, здоров’я, дім. Відповідай українською, коротко й по суті.',
    'Ти керуєш застосунком через дії. Відповідай ТІЛЬКИ валідним JSON без markdown у форматі {"reply":"текст користувачу","actions":[...]}.',
    ACTIONS + ACTIONS2,
    'ПОДІЯ має конкретну дату й час і не переноситься (візит до лікаря, зустріч, пара, зміна): використовуй add_event. ЗАДАЧА це робота, яку можна зробити в будь-який час до терміну: використовуй add_task. Візит до лікаря ніколи не є задачею.',
    'Дати визначай за полем next21days (дата і день тижня). Не вгадуй. Якщо для події немає дати або часу, або день тижня не збігається з датою, НЕ додавай нічого: у reply постав одне коротке уточнювальне питання, actions порожній.',
    parse ? 'РЕЖИМ ШВИДКОГО ДОДАВАННЯ: перетвори фразу користувача на 1-3 дії add_task або add_event, інших дій не роби. У reply одне коротке речення (або уточнення, якщо чогось бракує).' : 'Якщо користувач лише питає або просить пояснити, actions порожній. Дії виконуй лише тоді, коли користувач про це просить. Не вигадуй id: використовуй лише id зі стану. Користувач побачить запропоновані дії як картку з підтвердженням, тому в reply не пиши, що вже все зроблено: пиши, що пропонуєш (наприклад «Пропоную 3 задачі:»).',
    parse ? '' : 'ІСПИТИ: у стані поле exams — найближчі іспити (subject, date, time, daysLeft, folder). Коли складаєш план (на день, тиждень або підготовку до іспиту), враховуй їх: розподіляй підготовку рівномірно по днях до дати іспиту, щодня не більше годин, ніж capacityByWeekday для цього дня тижня мінус години вже наявних задач і подій; не став підготовку на дату іспиту чи після неї; останній день перед іспитом — повторення й тест. Для плану підготовки використовуй add_task з due (дата дня) і h, area "study"; назви задач конкретні (тема або розділ, напр. «Анатомія: кістки черепа»), з матеріалів папки, якщо вони є. Іспит у tasks не дублюй і не змінюй без прямого прохання.',
    parse ? '' : materialPrompt(material),
    'Стан застосунку (JSON): ' + JSON.stringify(state)
  ].filter(Boolean).join('\n');
}

// Режим «Навчання»: репетитор, який веде запитаннями, а не дає готову відповідь. Контракт відповіді той самий.
function tutorPrompt(ctx) {
  const { material } = ctx || {};
  return [
    'Ти репетитор, який допомагає людині навчитися, а не списати. Відповідай українською, коротко, дружньо, без зверхності.',
    'Відповідай ТІЛЬКИ валідним JSON без markdown у форматі {"reply":"текст користувачу","actions":[...]}.',
    'ПРАВИЛА: 1) Не давай готову відповідь чи розв’язок одразу, навіть якщо просять. Спершу з’ясуй, що людина вже знає. 2) Став ОДНЕ питання за раз і чекай відповіді; не став кілька питань в одному повідомленні. 3) На відповідь людини: коротко скажи, що правильно, що ні, і чому, потім наступне питання або наступний крок. 4) Якщо людина просить підказку («підказка», «не знаю», «Tipp») — дай одну невелику підказку, а не відповідь. Повну відповідь давай лише після двох спроб або якщо людина прямо попросить «покажи відповідь». 5) Коли тема пройдена (зазвичай після 3–5 питань) або людина хоче завершити — підсумуй: що вже добре, що повторити (конкретні пункти), і запропонуй «Зробити картки з помилок».',
    'Дії: лише {"type":"add_cards","deck":"назва набору","cards":[{"q":"питання","a":"відповідь"}]} і лише тоді, коли людина прямо просить картки (наприклад «картки з помилок»): картки складай із питань, де були помилки або підказки. В усіх інших випадках actions порожній.',
    materialPrompt(material),
    'Сьогодні: ' + String(ctx && ctx.today || '')
  ].filter(Boolean).join('\n');
}

function quizPrompt(ctx) {
  const kind = ctx.kind === 'choice' ? 'лише choice' : ctx.kind === 'open' ? 'лише open' : 'приблизно 70% choice і 30% open';
  // ctx.level: easy | mixed (за замовчуванням) | hard
  const level = ctx.level === 'easy' ? 'Складність: легка (базові факти, терміни, визначення).' : ctx.level === 'hard' ? 'Складність: висока (застосування, аналіз, порівняння; правдоподібні хибні варіанти).' : 'Складність від простої до складної.';
  // ctx.cards: картки набору [{q,a}] — тест за їхнім змістом
  const cards = Array.isArray(ctx.cards) ? ctx.cards.filter(c => c && c.q).slice(0, 200).map(c => ({ q: String(c.q).slice(0, 500), a: String(c.a || '').slice(0, 1000) })) : [];
  return [
    'Ти складаєш тест для самоперевірки. Відповідай ТІЛЬКИ валідним JSON без markdown: {"quiz":{"title":"коротка назва","questions":[{"type":"choice","q":"питання","options":["А","Б","В","Г"],"answer":індекс правильного варіанта з нуля,"explain":"коротке пояснення"},{"type":"open","q":"питання","answer":"еталонна відповідь","explain":"пояснення"}]}}.',
    'Кількість питань: ' + Math.min(30, Math.max(1, Number(ctx.n) || 5)) + '. Типи питань: ' + kind + '. ' + level,
    'Питання за темою або матеріалом, який надав користувач. Якщо користувач вставив матеріал, спирайся лише на нього. Якщо тема це вивчення мови (англійська, німецька тощо), питання і варіанти пиши мовою, що вивчається, а пояснення українською.',
    cards.length ? 'Матеріал це набір карток (q питання, a відповідь). Склади питання лише за їхнім змістом, не копіюй картки дослівно, перевіряй розуміння: ' + JSON.stringify(cards) : '',
    'Для choice рівно 4 варіанти, лише один правильний, позицію правильної відповіді розподіляй випадково.'
  ].filter(Boolean).join('\n');
}

// «Поясни помилку» на екрані результатів тесту. ctx: q, options (для choice), correct, user, note (пояснення з тесту), topic, material.
function explainPrompt(ctx) {
  const c = ctx || {};
  const s = v => String(v == null ? '' : v).slice(0, 2000);
  const m = c.material && typeof c.material === 'object' ? c.material : null;
  return [
    'Ти пояснюєш людині її помилку в тесті для самоперевірки. Відповідай українською, дружньо й без зверхності.',
    'Відповідай ТІЛЬКИ валідним JSON без markdown: {"reply":"пояснення"}. Інших полів і дій не додавай.',
    'Пояснення: 2–5 коротких речень. 1) Чому правильна відповідь правильна (суть, правило або факт). 2) Чому відповідь людини хибна або неповна: яку саме плутанину вона показує. Якщо відповіді немає — просто поясни правильну. 3) За потреби одна коротка підказка, як запам’ятати. Не повторюй питання дослівно, без вступів на кшталт «Звісно».',
    m ? 'Спирайся насамперед на матеріал нижче. Якщо в матеріалі цього немає, так і скажи й коротко поясни із загальних знань.' : '',
    m && m.kind === 'doc' ? 'Коли спираєшся на конкретну сторінку, став позначку точно у форматі [с. N]; не вигадуй сторінок.' : '',
    m ? materialPrompt(m) : '',
    'Тема тесту: ' + s(c.topic),
    'Питання: ' + s(c.q),
    Array.isArray(c.options) ? 'Варіанти: ' + JSON.stringify(c.options.slice(0, 8).map(s)) : '',
    'Правильна відповідь: ' + s(c.correct),
    'Відповідь людини: ' + (s(c.user).trim() || '(немає відповіді)'),
    c.note ? 'Коротке пояснення з тесту (можна використати): ' + s(c.note) : ''
  ].filter(Boolean).join('\n');
}

const gradePrompt = 'Ти перевіряєш відкриті відповіді на тест. На вхід JSON-масив об’єктів {i,q,ref,user}, де ref це еталонна відповідь, а user відповідь людини. Відповідай ТІЛЬКИ валідним JSON: {"grades":[{"i":число,"score":від 0 до 1 (0.5 означає частково),"comment":"коротко, що вірно і чого бракує"}]}. Оцінюй за змістом, а не за формулюванням. Порожня відповідь це 0. Коментарі українською.';

export async function POST(req) {
  const pass = process.env.APP_PASSWORD;
  if (pass && req.headers.get('x-pass') !== pass) return Response.json({ error: 'Нужен пароль' }, { status: 401 });
  const { messages = [], ctx = {}, mode = 'chat', lang = 'uk' } = await req.json();
  const de = lang === 'de';
  const unavailable = de ? 'Die KI ist gerade nicht erreichbar. ' : 'ШІ зараз недоступний. ';
  const order = (process.env.AI_ORDER || 'claude,deepseek,gemini').split(',').map(s => s.trim())
    .filter(n => PROVIDERS[n] && process.env[PROVIDERS[n].key]);
  if (!order.length) return Response.json({ error: unavailable + 'не задано жодного ключа ШІ (ANTHROPIC_API_KEY, DEEPSEEK_API_KEY або GEMINI_API_KEY)' }, { status: 502 });
  const LANG_DE = '\n\nМОВА (найважливіше): усі тексти для користувача (поле reply, пояснення, назви задач і подій, питання та відповіді тестів, картки) пиши НІМЕЦЬКОЮ мовою (Deutsch), з правильною німецькою граматикою. Ключі JSON і службові значення (type, area, repeat, kind, template тощо) залишай точно за специфікацією. Питання тесту пиши мовою теми матеріалу (наприклад, англійською для англійської граматики), а пояснення до відповідей німецькою. Назви днів тижня й місяців німецькі.';
  const base = mode === 'quiz' ? quizPrompt(ctx) : mode === 'grade' ? gradePrompt : mode === 'explain' ? explainPrompt(ctx) : mode === 'tutor' ? tutorPrompt(ctx) : appPrompt(ctx, mode === 'parse');
  const system = de ? base + LANG_DE : base;
  if (!messages.some(m => m && m.role === 'user' && (String(m.text || '').trim() || (m.images || []).length))) {
    return Response.json({ error: (de ? 'Leere Anfrage.' : 'Порожній запит.') }, { status: 400 });
  }
  const errs = [];
  for (const name of order) {
    const res = await PROVIDERS[name].run(system, messages, mode);
    if (res.ok) return Response.json({ text: res.text });
    errs.push(name + ': ' + res.err);
  }
  return Response.json({ error: unavailable + errs.join(' | ') }, { status: 502 });
}
