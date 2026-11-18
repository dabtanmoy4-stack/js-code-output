// Vercel serverless proxy. Keep Modal URL and secret on the server.
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const base = process.env.MODAL_C_RUNNER_URL;
  const secret = process.env.C_RUNNER_SHARED_SECRET;
  if (!base || !secret) return res.status(503).json({error:'C backend is not configured'});
  // IMPORTANT: Add Firebase ID-token verification + per-user rate limiting before public launch.
  const path = req.method === 'GET' ? '/health' : '/run';
  try {
    const upstream = await fetch(base.replace(/\/$/,'') + path, {
      method:req.method,
      headers:{'Content-Type':'application/json','X-Runner-Secret':secret},
      ...(req.method==='POST' ? {body:JSON.stringify(req.body || {})} : {}),
      signal:AbortSignal.timeout(60000)
    });
    const data = await upstream.json();
    res.setHeader('Cache-Control','no-store');
    return res.status(upstream.status).json(data);
  } catch(e) {return res.status(502).json({error:'Modal backend unavailable or timed out'});}
}
