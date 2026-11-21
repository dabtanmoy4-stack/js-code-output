// Vercel streaming proxy. Keep the Modal secret server-side.
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const base = process.env.MODAL_C_RUNNER_URL;
  const secret = process.env.C_RUNNER_SHARED_SECRET;
  if (!base || !secret) return res.status(503).json({error:'C backend is not configured'});
  // IMPORTANT: Verify Firebase ID tokens and enforce per-user quotas before public launch.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const upstream = await fetch(base.replace(/\/$/, '') + '/run-stream', {
      method:'POST', headers:{'Content-Type':'application/json','X-Runner-Secret':secret},
      body:JSON.stringify(req.body || {}), signal:controller.signal
    });
    if (!upstream.ok || !upstream.body) {
      const error = (await upstream.text()).slice(0,2000);
      return res.status(upstream.status).json({error: error || 'Backend streaming unavailable'});
    }
    res.status(200);
    res.setHeader('Content-Type','text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control','no-cache, no-transform');
    res.setHeader('X-Accel-Buffering','no');
    res.flushHeaders?.();
    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(502).json({error:'Streaming proxy failed'});
    else res.end();
  } finally { clearTimeout(timeout); }
}
