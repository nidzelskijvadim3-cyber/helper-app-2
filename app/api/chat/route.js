export const maxDuration = 30;
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
      contents: messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }))
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
      model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
      stream: false,
      messages: [{ role: 'system', content: system }].concat(messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })))
    })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, err: (d.error && d.error.message) || 'ошибка DeepSeek' };
  const t = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  return { ok: true, text: t || '' };
}

const PROVIDERS = { gemini, deepseek };

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

export async function POST(req) {
  const pass = process.env.APP_PASSWORD;
  if (pass && req.headers.get('x-pass') !== pass) return Response.json({ error: 'Нужен пароль' }, { status: 401 });
  const { messages = [], tasks = [] } = await req.json();
  const system = 'Ты личный помощник по учёбе и работе для человека на дуальном обучении. Отвечай по-русски, кратко и по делу. Помогай планировать, объясняй темы простыми словами, составляй проверочные с ответами, подсказывай, что делать сейчас. Сегодня ' + new Date().toISOString().slice(0, 10) + '. Невыполненные задачи пользователя (JSON): ' + JSON.stringify(tasks);
  const order = (process.env.AI_ORDER || 'gemini,deepseek').split(',').map(s => s.trim()).filter(s => PROVIDERS[s]);
  const errs = [];
  for (const name of order) {
    const res = await withRetry(() => PROVIDERS[name](system, messages));
    if (res.ok && res.text) return Response.json({ text: res.text });
    errs.push(name + ': ' + (res.err || 'пустой ответ'));
  }
  return Response.json({ error: 'ИИ сейчас недоступен. ' + errs.join(' | ') }, { status: 502 });
}
