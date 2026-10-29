const ONLINE_COMPILER_URL = "https://api.onlinecompiler.io/api/run-code-sync/";
const MAX_CODE_CHARS = 50000;
const MAX_INPUT_CHARS = 10000;

function asText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter(v => typeof v === "string").join("\n");
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const apiKey = process.env.ONLINECOMPILER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      status: "configuration_error",
      error: "ONLINECOMPILER_API_KEY is not configured in Vercel Environment Variables."
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const requestedCompiler = typeof body.compiler === "string" ? body.compiler : "python";
  // OnlineCompiler expects versioned compiler IDs, not generic labels.
  const compilerAliases = { python: "python-3.14", javascript: "node-24", node: "node-24" };
  const compiler = compilerAliases[requestedCompiler.toLowerCase()] || requestedCompiler;
  const code = body.code;
  const input = body.input === undefined ? "" : body.input;
  if (typeof code !== "string" || !code.trim()) return res.status(400).json({ success: false, error: "Code is required." });
  if (code.length > MAX_CODE_CHARS) return res.status(413).json({ success: false, error: `Code exceeds ${MAX_CODE_CHARS} characters.` });
  if (typeof input !== "string") return res.status(400).json({ success: false, error: "Input must be a string." });
  if (input.length > MAX_INPUT_CHARS) return res.status(413).json({ success: false, error: `Input exceeds ${MAX_INPUT_CHARS} characters.` });
  if (!/^[a-zA-Z0-9_+.-]{1,40}$/.test(compiler)) return res.status(400).json({ success: false, error: "Invalid compiler name." });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  const started = Date.now();
  try {
    const upstream = await fetch(ONLINE_COMPILER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": apiKey
      },
      body: JSON.stringify({ compiler, code, input }),
      signal: controller.signal
    });
    const raw = await upstream.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; }
    catch { data = { output: raw }; }

    if (!upstream.ok) {
      const detail = asText(data.error || data.message || data.stderr || data.output) || `OnlineCompiler returned HTTP ${upstream.status}.`;
      return res.status(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502).json({ success: false, status: "error", error: detail, compiler });
    }

    // Normalize common OnlineCompiler response shapes for the existing UI.
    const nested = data.result && typeof data.result === "object" ? data.result : data.data && typeof data.data === "object" ? data.data : data;
    const output = asText(nested.output ?? nested.stdout ?? nested.console ?? nested.result ?? data.output ?? data.stdout);
    const stderr = asText(nested.stderr ?? nested.error_output ?? data.stderr);
    const error = asText(nested.error ?? data.error ?? (data.success === false ? data.message : ""));
    const exitCodeValue = nested.exit_code ?? nested.exitCode ?? nested.return_code ?? nested.returnCode ?? data.exit_code ?? data.exitCode;
    const exitCode = Number.isFinite(Number(exitCodeValue)) ? Number(exitCodeValue) : (error || stderr ? 1 : 0);
    const success = data.success === false || nested.success === false ? false : (exitCode === 0 && !error && !stderr);
    return res.status(200).json({
      success,
      status: success ? "success" : "error",
      compiler,
      output,
      stdout: output,
      stderr,
      error: error || stderr,
      exit_code: exitCode,
      time: Number(((Date.now() - started) / 1000).toFixed(2)),
      raw: undefined
    });
  } catch (err) {
    const timedOut = err && err.name === "AbortError";
    console.error("OnlineCompiler API request failed:", err);
    return res.status(timedOut ? 504 : 502).json({
      success: false,
      status: "error",
      error: timedOut ? "OnlineCompiler request timed out after 55 seconds." : "Could not reach OnlineCompiler. Check the API service and ONLINECOMPILER_API_KEY.",
      compiler
    });
  } finally {
    clearTimeout(timeout);
  }
}
