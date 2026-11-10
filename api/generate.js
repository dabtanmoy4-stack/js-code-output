// api/generate.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is missing in Vercel Environment Variables."
    });
  }

  try {
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({
          error: "Invalid JSON body."
        });
      }
    }

    body = body || {};

    const prompt = String(body.prompt || "").trim();
    const current = String(body.current || "");

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is empty."
      });
    }

    const model = "gemini-3.6-flash";

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const history = Array.isArray(body.history)
      ? body.history.slice(-6)
      : [];

    let previous = "";

    if (history.length) {
      previous = history
        .map((item, i) => {
          return `Previous request ${i + 1}:\n${String(item?.content || "")}`;
        })
        .join("\n\n");
    }

    const instruction = `
You are MIOD, the AI coding assistant inside JS Code Output.

Modify the user's existing HTML according to the user's request.

IMPORTANT:
- Return the complete updated HTML.
- Return ONLY HTML code.
- Do not use markdown.
- Do not use code fences.
- Do not explain anything.
- Preserve the existing design.
- Preserve existing animations.
- Preserve existing functionality.
- Only change what the user requested.

USER REQUEST:
${prompt}

CURRENT HTML:
${current}

${previous ? `PREVIOUS REQUESTS:\n${previous}` : ""}

Return the complete final HTML now.
`;

    const googleResponse = await fetch(endpoint, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },

      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: instruction
              }
            ]
          }
        ],

        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 32768
        }
      })
    });

    const responseText = await googleResponse.text();

    let googleData;

    try {
      googleData = JSON.parse(responseText);
    } catch {
      googleData = {
        rawResponse: responseText
      };
    }

    if (!googleResponse.ok) {
      console.error("GEMINI ERROR:", googleData);

      return res.status(502).json({
        error:
          googleData?.error?.message ||
          `Gemini API returned HTTP ${googleResponse.status}`,

        geminiStatus: googleResponse.status,

        geminiError:
          googleData?.error || googleData
      });
    }

    const candidate = googleData?.candidates?.[0];

    if (!candidate) {
      return res.status(502).json({
        error: "Gemini returned no candidate.",
        details: googleData
      });
    }

    let html = "";

    if (Array.isArray(candidate?.content?.parts)) {
      html = candidate.content.parts
        .map(part => part?.text || "")
        .join("");
    }

    html = html.trim();

    if (!html) {
      return res.status(502).json({
        error: "Gemini returned empty output.",
        finishReason: candidate?.finishReason || "unknown"
      });
    }

    // Remove markdown fences if Gemini adds them.
    const fenced = html.match(
      /^```(?:html)?\s*([\s\S]*?)\s*```$/i
    );

    if (fenced) {
      html = fenced[1].trim();
    }

    return res.status(200).json({
      html: html,
      code: html,
      text: html
    });

  } catch (error) {
    console.error("GENERATE SERVER ERROR:", error);

    return res.status(500).json({
      error: error?.message || "Internal server error",
      errorType: error?.name || "Error"
    });
  }
}
