import { Sandbox } from "@e2b/code-interpreter";

const MAX_CODE_CHARS = 100_000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ status: "error", error: "Method not allowed" });
  }

  if (!process.env.E2B_API_KEY) {
    return res.status(500).json({
      status: "error",
      error: "E2B_API_KEY is not configured in the server environment."
    });
  }

  try {
    const body = req.body || {};
    const code = typeof body.code === "string" ? body.code : "";

    if (!code.trim()) {
      return res.status(400).json({ status: "error", error: "Python code is required." });
    }
    if (code.length > MAX_CODE_CHARS) {
      return res.status(413).json({ status: "error", error: "Code is too large (100 KB character limit)." });
    }

    const started = Date.now();
    const sandbox = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });

    try {
      const execution = await sandbox.runCode(code);
      const stdout = Array.isArray(execution?.logs?.stdout) ? execution.logs.stdout.join("\\n") : "";
      const stderr = Array.isArray(execution?.logs?.stderr) ? execution.logs.stderr.join("\\n") : "";
      const results = Array.isArray(execution?.results) ? execution.results : [];

      // Return notebook-style image results when available. The frontend can render these separately.
      const images = [];
      for (const item of results) {
        const mimeType = item?.mimeType || item?.mime_type;
        const data = item?.data;
        if (typeof data === "string" && typeof mimeType === "string" && mimeType.startsWith("image/")) {
          images.push({ mimeType, data });
        }
      }

      return res.status(200).json({
        status: stderr ? "error" : "success",
        output: stdout,
        error: stderr,
        images,
        time: ((Date.now() - started) / 1000).toFixed(2),
        exit_code: stderr ? 1 : 0
      });
    } finally {
      try { await sandbox.kill(); } catch {}
    }
  } catch (error) {
    const message = String(error?.message || error || "E2B execution failed");
    return res.status(500).json({ status: "error", error: message });
  }
}
