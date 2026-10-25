
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.ONLINECOMPILER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "ONLINECOMPILER_API_KEY is not configured"
    });
  }

  try {
    const { compiler, code, input = "" } = req.body || {};

    if (!compiler || typeof code !== "string") {
      return res.status(400).json({
        error: "compiler and code are required"
      });
    }

    const response = await fetch(
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
        })
      }
    );

    const result = await response.json();

    return res.status(response.status).json(result);
  } catch (error) {
    console.error("OnlineCompiler API error:", error);

    return res.status(500).json({
      error: "Code execution request failed"
    });
  }
}
