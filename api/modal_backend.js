const MAX_CODE = 300_000;
const MAX_INPUT = 100_000;

function send(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method !== "POST") return send(res, 405, { success: false, error: "POST method required." });

  const endpoint = process.env.MODAL_RUN_URL;
  const token = process.env.MODAL_RUN_TOKEN;
  if (!endpoint || !token) {
    return send(res, 500, {
      success: false,
      error: "Modal is not configured. Set MODAL_RUN_URL and MODAL_RUN_TOKEN in Vercel Environment Variables."
    });
  }

  const body = req.body || {};
  const code = String(body.code || "");
  const input = String(body.input || "");
  if (!code.trim()) return send(res, 400, { success: false, error: "Python code is empty." });
  if (code.length > MAX_CODE || input.length > MAX_INPUT) {
    return send(res, 413, { success: false, error: "Code or input is too large." });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-JSCO-Token": token
      },
      body: JSON.stringify({ code, input }),
      signal: controller.signal
    });
    const text = await upstream.text();
    let result;
    try { result = text ? JSON.parse(text) : null; } catch { result = null; }
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return send(res, 502, {
        success: false,
        error: `Modal returned an invalid response (HTTP ${upstream.status}): ${text.slice(0, 500)}`
      });
    }
    return send(res, upstream.status, result);
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    return send(res, timedOut ? 504 : 502, {
      success: false,
      error: timedOut
        ? "Modal execution took longer than the Vercel request window. Shorten the program or increase the Vercel function duration on a plan that supports it."
        : `Could not reach Modal: ${error?.message || String(error)}`
    });
  } finally {
    clearTimeout(timer);
  }
}
