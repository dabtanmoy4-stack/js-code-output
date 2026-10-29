/**
 * Optional proxy to a separately hosted, graphics-enabled Ursina runtime.
 * This route deliberately does not pretend that a standard E2B sandbox has a display.
 * Configure URSINA_RUNTIME_URL to your own trusted runtime's POST endpoint.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const endpoint = process.env.URSINA_RUNTIME_URL;
  if (!endpoint) {
    return res.status(503).json({
      success: false,
      status: "runtime_not_configured",
      error: "The separate Ursina runtime is not connected yet. Standard E2B cannot open a desktop graphics window. Set URSINA_RUNTIME_URL in Vercel only after deploying a trusted graphics-enabled Ursina service. Browser-rendered 3D examples using 'from jsco3d import Scene' work through the regular Python runner."
    });
  }
  let target;
  try { target = new URL(endpoint); } catch {
    return res.status(500).json({ success: false, error: "URSINA_RUNTIME_URL must be a valid HTTPS URL." });
  }
  if (target.protocol !== "https:" && target.hostname !== "localhost" && target.hostname !== "127.0.0.1") {
    return res.status(500).json({ success: false, error: "URSINA_RUNTIME_URL must use HTTPS." });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (typeof body.code !== "string" || !body.code.trim()) {
    return res.status(400).json({ success: false, error: "Python code is required." });
  }
  if (body.code.length > 80000 || (typeof body.input === "string" && body.input.length > 10000)) {
    return res.status(413).json({ success: false, error: "Code or input exceeds the runtime limit." });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const headers = { "Content-Type": "application/json", "Accept": "application/json" };
    if (process.env.URSINA_RUNTIME_TOKEN) headers.Authorization = `Bearer ${process.env.URSINA_RUNTIME_TOKEN}`;
    const upstream = await fetch(target.toString(), {
      method: "POST", headers,
      body: JSON.stringify({ compiler: "python", code: body.code, input: typeof body.input === "string" ? body.input : "" }),
      signal: controller.signal
    });
    const raw = await upstream.text();
    let result;
    try { result = raw ? JSON.parse(raw) : {}; } catch { result = { error: raw.slice(0, 1200) || "Ursina runtime returned an invalid response." }; }
    if (!upstream.ok) return res.status(502).json({ success: false, error: result.error || `Ursina runtime failed (HTTP ${upstream.status}).` });
    return res.status(200).json(result);
  } catch (error) {
    const timedOut = error && error.name === "AbortError";
    return res.status(timedOut ? 504 : 502).json({ success: false, error: timedOut ? "Ursina runtime timed out after 55 seconds." : "Could not reach the separate Ursina runtime. Check its URL and service health." });
  } finally {
    clearTimeout(timeout);
  }
}
