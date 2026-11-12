export const maxDuration = 30;

const baseUrl = () => (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const secretKey = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const configured = () => !!(baseUrl() && secretKey());
let lastSrv = 0;

function headers(extra) {
  const k = secretKey(), h = { apikey: k, 'Content-Type': 'application/json', ...extra };
  if (k.startsWith('eyJ')) h.Authorization = 'Bearer ' + k; // старий формат ключа (JWT); нові ключі sb_secret_ передаються лише в apikey
  return h;
}
async function sb(path, opts = {}) {
  const r = await fetch(baseUrl() + '/rest/v1/' + path, { ...opts, headers: headers(opts.headers) });
  const text = await r.text(); let j = null;
  try { j = text ? JSON.parse(text) : null; } catch (e) {}
  if (!r.ok) throw new Error((j && (j.message || j.hint || j.error)) || 'Supabase ' + r.status);
  return j;
}
const inList = keys => 'in.(' + keys.map(k => '"' + String(k).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + ')';

export async function POST(req) {
  const pass = process.env.APP_PASSWORD;
  if (pass && req.headers.get('x-pass') !== pass) return Response.json({ error: 'Password required' }, { status: 401 });
  let body; try { body = await req.json(); } catch (e) { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  if (body.action === 'status') return Response.json({ configured: configured() });
  if (!configured()) return Response.json({ error: 'Sync is not configured on the server' }, { status: 503 });
  try {
    if (body.action === 'pull') {
      const since = Number(body.since) || 0;
      const rows = await sb('sync_records?select=k,t,u,srv,d,data&srv=gt.' + since + '&order=srv.asc&limit=100');
      const out = []; let size = 0;
      for (const r of rows) { const n = JSON.stringify(r).length; if (out.length && size + n > 3000000) break; out.push(r); size += n; }
      return Response.json({ records: out, last: out.length ? Number(out[out.length - 1].srv) : since, more: out.length < rows.length || rows.length === 100 });
    }
    if (body.action === 'push') {
      const recs = (Array.isArray(body.records) ? body.records : []).filter(r => r && typeof r.k === 'string' && typeof r.t === 'string' && typeof r.u === 'number');
      const existing = {};
      for (let i = 0; i < recs.length; i += 80) {
        const chunk = recs.slice(i, i + 80).map(r => r.k);
        const rows = await sb('sync_records?select=k,u&k=' + encodeURIComponent(inList(chunk)));
        for (const x of rows || []) existing[x.k] = Number(x.u);
      }
      const fresh = recs.filter(r => !(r.k in existing) || r.u > existing[r.k]);
      const rows = fresh.map(r => { lastSrv = Math.max(Date.now() * 1000, lastSrv + 1); return { k: r.k, t: r.t.slice(0, 2), u: r.u, srv: lastSrv, d: !!r.d, data: r.d ? null : r.data }; });
      if (rows.length) await sb('sync_records?on_conflict=k', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
      return Response.json({ accepted: rows.length, skipped: recs.length - rows.length });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e.message || e).slice(0, 300) }, { status: 502 });
  }
}
