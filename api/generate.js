// Vercel serverless function: POST /api/generate -> Gemini Flash
// Needs GEMINI_API_KEY in Vercel Environment Variables (server-side only).

// Google retired gemini-2.5-flash for new users. The alias below always points to the latest Flash model.
// To pin one, set GEMINI_MODEL in Vercel (e.g. the exact name Google's error message suggested).
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

const SYSTEM = `You are MIOD AI, a web app builder.
Return ONE complete, self-contained HTML document (<!DOCTYPE html> ... </html>) with inline CSS and JS.
Rules:
- Output ONLY the code, no explanation, no markdown fences.
- No external files or APIs. If a library is needed, load it only from https://cdnjs.cloudflare.com.
- Mobile-first, responsive, modern and colourful. Add <meta name="viewport" content="width=device-width,initial-scale=1">.
- Do not use localStorage/sessionStorage unless the user asks; keep state in memory.
- Use console.log for useful debug messages.
- If "Current project code" is given, modify that code according to the new request and return the full updated document.
- Write UI text in the language the user wrote their request in.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server' });

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const { prompt, history, current } = body || {};
    if (typeof prompt !== 'string' || !prompt.trim()) return res.status(400).json({ error: 'Prompt is empty' });
    if (prompt.length > 8000) return res.status(400).json({ error: 'Prompt too long' });

    const past = Array.isArray(history)
      ? history.filter(h => h && typeof h.content === 'string').slice(-6).map(h => '- ' + h.content.slice(0, 300)).join('\n')
      : '';
    let text = '';
    if (past) text += `Earlier requests in this project:\n${past}\n\n`;
    if (typeof current === 'string' && current.trim()) text += `Current project code:\n${current}\n\n`;
    text += `New request:\n${prompt.trim()}`;

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 55000);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 32768
        }
      })
    }).finally(() => clearTimeout(timer));

    const data = await r.json();
    if (!r.ok) {
      console.error('Gemini error:', JSON.stringify(data));
      const code = r.status === 429 ? 429 : 502;
      return res.status(code).json({ error: code === 429 ? 'Gemini quota/rate limit reached. Try again shortly.' : (data.error?.message || 'Gemini request failed') });
    }
    const cand = data.candidates && data.candidates[0];
    if (!cand) return res.status(502).json({ error: 'Blocked: ' + (data.promptFeedback?.blockReason || 'no response') });

    let out = (cand.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join('');
    const m = out.match(/```(?:html)?\n([\s\S]*?)```/);
    if (m) out = m[1];
    out = out.trim();
    if (!out) return res.status(502).json({ error: 'Empty response (' + (cand.finishReason || 'unknown') + ')' });
    if (cand.finishReason === 'MAX_TOKENS') return res.status(502).json({ error: 'Output too long. Ask for a smaller project.' });

    return res.status(200).json({ html: out });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.name === 'AbortError' ? 'Gemini timed out' : 'Server error' });
  }
}
