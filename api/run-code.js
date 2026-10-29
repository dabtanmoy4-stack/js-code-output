
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.E2B_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "E2B_API_KEY is not configured"
    });
  }

  try {
    const body = req.body || {};
    const { code, input = "" } = body;
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

    if (compiler.toLowerCase() !== "python") {
      return res.status(400).json({
        success: false,
        error: "This E2B handler currently supports Python only"
      });
    }

    const { Sandbox } = await import("@e2b/code-interpreter");

    const sandbox = await Sandbox.create({
      apiKey
    });

    try {
      const execution = await sandbox.runCode(code, {
        stdin: input
      });

      const results = (execution.results || []).map((item) => ({
        text: item.text || "",
        html: item.html || undefined,
        png: item.png || undefined,
        chart: item.chart || undefined
      }));

      return res.status(200).json({
        success: true,
        output: (execution.logs?.stdout || []).join("\n"),
        error: (execution.logs?.stderr || []).join("\n"),
        results,
        executionCount: execution.executionCount
      });
    } finally {
      await sandbox.kill();
    }
  } catch (error) {
    console.error("E2B API error:", error);

    return res.status(502).json({
      success: false,
      error: "Code execution request failed",
      details: error?.message || "Unknown E2B error"
    });
  }
}
