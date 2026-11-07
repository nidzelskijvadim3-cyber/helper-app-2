export const maxDuration = 60;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gemini(system, messages) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, status: 0, err: 'нет GEMINI_API_KEY' };
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }].concat((m.images || []).map(u => ({ inlineData: { mimeType: (String(u).match(/^data:([^;]+)/) || [])[1] || 'image/jpeg', data: String(u).split(',')[1] } }))) })),
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, err: (d.error && d.error.message) || 'ошибка Gemini' };
  const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
  return { ok: true, text: parts.map(p => p.text || '').join('') };
}

async function deepseek(system, messages) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { ok: false, status: 0, err: 'нет DEEPSEEK_API_KEY' };
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: messages.some(m => m.images && m.images.length) ? (process.env.DEEPSEEK_VISION_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-flash') : (process.env.DEEPSEEK_MODEL || 'deepseek-flash'),
      stream: false,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }].concat(messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.images && m.images.length ? [{ type: 'text', text: m.text }].concat(m.images.map(u => ({ type: 'image_url', image_url: { url: u } }))) : m.text })))
    })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, err: (d.error && d.error.message) || 'ошибка DeepSeek' };
  const t = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  return { ok: true, text: t || '' };
}

const PROVIDERS = { gemini, deepseek };
const ACTIONS2 = ' Також: {"type":"create_folder","name":"..","color":"#hex","parent":"id або назва папки або порожній рядок"}; {"type":"rename_folder","id":число,"name":".."}; {"type":"move_note","id":число,"folder":"id або назва папки або порожній рядок"}; {"type":"create_doc","kind":"notebook або board","title":"..","folder":"id або назва","template":"blank|lined|grid|dots"}; {"type":"rename_doc","id":число,"title":".."}; {"type":"move_doc","id":число,"folder":"id або назва або порожній рядок"}. У add_task, add_event, update_task і add_note можна вказати "folder" (id або назва папки). Папки, нотатки й документи беруться зі стану (ctx.folders, ctx.notes, ctx.docs). Якщо є ctx.screen, це опис екрана, який користувач бачить зараз (у ctx.screen.openNote текст відкритої нотатки). Якщо до повідомлення додано зображення, уважно розгляни його, опиши або використай за запитом (наприклад, розпізнай рукописний текст, склади питання, занеси події з розкладу). Видаляти документи й папки не можна.';

async function withRetry(fn) {
  let last = { ok: false, status: 0, err: 'нет ответа' };
  for (let i = 0; i < 3; i++) {
    last = await fn();
    if (last.ok) return last;
    if (![429, 500, 503, 504].includes(last.status)) return last;
    if (i < 2) await sleep(1500 * (i + 1));
  }
  return last;
}

const ACTIONS = 'Доступні дії: {"type":"add_task","t":"назва","area":"study|work|personal|health|home","h":години числом,"due":"YYYY-MM-DD або порожній рядок","pri":1 або 2,"repeat":"none|daily|weekdays|weekly"}; {"type":"add_event","t":"назва","area":"..","date":"YYYY-MM-DD","time":"HH:MM","h":тривалість у годинах,"repeat":"none|daily|weekdays|weekly"}; {"type":"update_task","id":число,"t":"..","area":"..","h":число,"date":"YYYY-MM-DD","time":"HH:MM","pri":1 або 2,"repeat":".."} (лише поля, що змінюються); {"type":"complete_task","id":число}; {"type":"delete_task","id":число}; {"type":"set_capacity","day":від 0 до 6 (0 це неділя),"h":години}; {"type":"set_start","hour":від 0 до 23}; {"type":"add_note","text":"текст нотатки"}; {"type":"add_cards","deck":"назва колоди","cards":[{"q":"питання","a":"відповідь"}]}.';

function appPrompt(ctx, parse) {
  return [
    'Ти особистий помічник для повсякденного життя людини: навчання, робота, особисті справи, здоров’я, дім. Відповідай українською, коротко й по суті.',
    'Ти керуєш застосунком через дії. Відповідай ТІЛЬКИ валідним JSON без markdown у форматі {"reply":"текст користувачу","actions":[...]}.',
    ACTIONS + ACTIONS2,
    'ПОДІЯ має конкретну дату й час і не переноситься (візит до лікаря, зустріч, пара, зміна): використовуй add_event. ЗАДАЧА це робота, яку можна зробити в будь-який час до терміну: використовуй add_task. Візит до лікаря ніколи не є задачею.',
    'Дати визначай за полем next21days (дата і день тижня). Не вгадуй. Якщо для події немає дати або часу, або день тижня не збігається з датою, НЕ додавай нічого: у reply постав одне коротке уточнювальне питання, actions порожній.',
    parse ? 'РЕЖИМ ШВИДКОГО ДОДАВАННЯ: перетвори фразу користувача на 1-3 дії add_task або add_event, інших дій не роби. У reply одне коротке речення (або уточнення, якщо чогось бракує).' : 'Якщо користувач лише питає або просить пояснити, actions порожній. Дії виконуй лише тоді, коли користувач про це просить. Не вигадуй id: використовуй лише id зі стану.',
    'Стан застосунку (JSON): ' + JSON.stringify(ctx)
  ].join('\n');
}

function quizPrompt(ctx) {
  const kind = ctx.kind === 'choice' ? 'лише choice' : ctx.kind === 'open' ? 'лише open' : 'приблизно 70% choice і 30% open';
  return [
    'Ти складаєш тест для самоперевірки. Відповідай ТІЛЬКИ валідним JSON без markdown: {"quiz":{"title":"коротка назва","questions":[{"type":"choice","q":"питання","options":["А","Б","В","Г"],"answer":індекс правильного варіанта з нуля,"explain":"коротке пояснення"},{"type":"open","q":"питання","answer":"еталонна відповідь","explain":"пояснення"}]}}.',
    'Кількість питань: ' + (Number(ctx.n) || 5) + '. Типи питань: ' + kind + '. Складність від простої до складної.',
    'Питання за темою або матеріалом, який надав користувач. Якщо користувач вставив матеріал, спирайся лише на нього. Якщо тема це вивчення мови (англійська, німецька тощо), питання і варіанти пиши мовою, що вивчається, а пояснення українською.',
    'Для choice рівно 4 варіанти, лише один правильний, позицію правильної відповіді розподіляй випадково.'
  ].join('\n');
}

const gradePrompt = 'Ти перевіряєш відкриті відповіді на тест. На вхід JSON-масив об’єктів {i,q,ref,user}, де ref це еталонна відповідь, а user відповідь людини. Відповідай ТІЛЬКИ валідним JSON: {"grades":[{"i":число,"score":від 0 до 1 (0.5 означає частково),"comment":"коротко, що вірно і чого бракує"}]}. Оцінюй за змістом, а не за формулюванням. Порожня відповідь це 0. Коментарі українською.';

export async function POST(req) {
  const pass = process.env.APP_PASSWORD;
  if (pass && req.headers.get('x-pass') !== pass) return Response.json({ error: 'Нужен пароль' }, { status: 401 });
  const { messages = [], ctx = {}, mode = 'chat', lang = 'uk' } = await req.json();
  const de = lang === 'de';
  const LANG_DE = '\n\nМОВА (найважливіше): усі тексти для користувача (поле reply, пояснення, назви задач і подій, питання та відповіді тестів, картки) пиши НІМЕЦЬКОЮ мовою (Deutsch), з правильною німецькою граматикою. Ключі JSON і службові значення (type, area, repeat, kind, template тощо) залишай точно за специфікацією. Питання тесту пиши мовою теми матеріалу (наприклад, англійською для англійської граматики), а пояснення до відповідей німецькою. Назви днів тижня й місяців німецькі.';
  const base = mode === 'quiz' ? quizPrompt(ctx) : mode === 'grade' ? gradePrompt : appPrompt(ctx, mode === 'parse');
  const system = de ? base + LANG_DE : base;
  const order = (process.env.AI_ORDER || 'gemini,deepseek').split(',').map(s => s.trim()).filter(s => PROVIDERS[s]);
  const errs = [];
  for (const name of order) {
    const res = await withRetry(() => PROVIDERS[name](system, messages));
    if (res.ok && res.text) return Response.json({ text: res.text });
    errs.push(name + ': ' + (res.err || 'пустой ответ'));
  }
  return Response.json({ error: (de ? 'Die KI ist gerade nicht erreichbar. ' : 'ШІ зараз недоступний. ') + errs.join(' | ') }, { status: 502 });
}
