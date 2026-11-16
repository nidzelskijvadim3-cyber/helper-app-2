import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

// Модель задаётся змінною ANTHROPIC_MODEL; за замовчуванням Claude Haiku 5.5.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

// Глибина міркувань: швидкі режими (чат, швидке додавання) — low; тести й перевірка — medium.
const EFFORT = { chat: 'low', parse: 'low', quiz: 'medium', grade: 'medium' };

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
      return { role, content: [...images.map(imageBlock), { type: 'text', text: text || 'Опиши зображення.' }] };
    })
    .filter(Boolean);
  // Розмова має починатися з повідомлення користувача.
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

async function claude(system, messages, mode) {
  const client = new Anthropic(); // читає ANTHROPIC_API_KEY із середовища
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
  const unavailable = de ? 'Die KI ist gerade nicht erreichbar. ' : 'ШІ зараз недоступний. ';
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: unavailable + 'не задано ANTHROPIC_API_KEY' }, { status: 502 });
  const LANG_DE = '\n\nМОВА (найважливіше): усі тексти для користувача (поле reply, пояснення, назви задач і подій, питання та відповіді тестів, картки) пиши НІМЕЦЬКОЮ мовою (Deutsch), з правильною німецькою граматикою. Ключі JSON і службові значення (type, area, repeat, kind, template тощо) залишай точно за специфікацією. Питання тесту пиши мовою теми матеріалу (наприклад, англійською для англійської граматики), а пояснення до відповідей німецькою. Назви днів тижня й місяців німецькі.';
  const base = mode === 'quiz' ? quizPrompt(ctx) : mode === 'grade' ? gradePrompt : appPrompt(ctx, mode === 'parse');
  const system = de ? base + LANG_DE : base;
  const msgs = toClaudeMessages(messages);
  if (!msgs.length) return Response.json({ error: (de ? 'Leere Anfrage.' : 'Порожній запит.') }, { status: 400 });
  try {
    const res = await claude(system, msgs, mode);
    if (res.ok) return Response.json({ text: res.text });
    return Response.json({ error: unavailable + res.err }, { status: 502 });
  } catch (e) {
    console.error('Claude API error:', e);
    return Response.json({ error: unavailable + errorText(e) }, { status: 502 });
  }
}
