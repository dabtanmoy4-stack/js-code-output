const MAX_CODE = 300_000;
function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return res.status(status).json(body);
}
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'POST method required.' });
  const base = process.env.MODAL_LIVE_URL;
  const token = process.env.MODAL_RUN_TOKEN;
  if (!base || !token) return send(res, 500, { success: false, error: 'Set MODAL_LIVE_URL and MODAL_RUN_TOKEN in Vercel Environment Variables.' });
  const body = req.body || {};
  const action = body.action === 'stop' ? 'stop' : 'start';
  if (action === 'start' && (!String(body.code || '').trim() || String(body.code).length > MAX_CODE)) {
    return send(res, 400, { success: false, error: 'Python code is empty or too large.' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 58_000);
  try {
    const url = new URL(`/live/${action}`, base);
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-JSCO-Token': token },
      body: JSON.stringify(action === 'start' ? { code: String(body.code), input: String(body.input || '') } : { sessionId: String(body.sessionId || '') }),
      signal: controller.signal
    });
    const raw = await upstream.text();
    let result;
    try { result = raw ? JSON.parse(raw) : {}; } catch { result = null; }
    if (!result || typeof result !== 'object' || Array.isArray(result)) return send(res, 502, { success: false, error: `Modal live service returned invalid JSON (${upstream.status}).` });
    return send(res, upstream.status, result);
  } catch (error) {
    return send(res, error?.name === 'AbortError' ? 504 : 502, { success: false, error: error?.name === 'AbortError' ? 'Live session startup timed out.' : `Could not reach Modal live service: ${error?.message || String(error)}` });
  } finally { clearTimeout(timer); }
}
