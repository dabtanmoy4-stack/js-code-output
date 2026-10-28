
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.ONLINECOMPILER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "ONLINECOMPILER_API_KEY is not configured"
    });
  }

  try {
    const body = req.body || {};
    const { code, input = "" } = body;

    // Python default; frontend may still specify other compilers.
    const compiler = body.compiler || "python";

    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({
        success: false,
        error: "Code is required"
      });
    }

    if (typeof input !== "string") {
      return res.status(400).json({
        success: false,
        error: "Input must be a string"
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    let response;

    try {
      response = await fetch(
        "https://api.onlinecompiler.io/api/run-code-sync/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": apiKey
          },
          body: JSON.stringify({
            compiler,
            code,
            input
          }),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const raw = await response.text();

    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      result = { output: raw };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error:
          result.error ||
          result.message ||
          `OnlineCompiler returned HTTP ${response.status}`,
        details: result
      });
    }

    // Preserve the provider's original result fields, including
    // any preview/HTML fields it may support.
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("OnlineCompiler API error:", error);

    const timedOut = error.name === "AbortError";

    return res.status(timedOut ? 504 : 502).json({
      success: false,
      error: timedOut
        ? "OnlineCompiler request timed out"
        : "Code execution request failed"
    });
  }
}
