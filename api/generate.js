// api/generate.js

export default async function handler(req, res) {
  // Only POST allowed
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing");

    return res.status(500).json({
      error: "GEMINI_API_KEY is not configured in Vercel."
    });
  }

  try {
    // Vercel normally gives req.body as an object,
    // but this also handles string bodies safely.
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({
          error: "Invalid JSON request body."
        });
      }
    }

    body = body || {};

    const prompt = String(body.prompt || "").trim();
    const current = String(body.current || "");

    const history = Array.isArray(body.history)
      ? body.history
      : [];

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is empty."
      });
    }

    /*
      Gemini 3.6 Flash
      Direct Google Gemini API
    */
    const model = "gemini-3.6-flash";

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    /*
      Build previous conversation context.
      Your frontend sends only user history, so we keep it simple.
    */
    let historyText = "";

    if (history.length > 0) {
      historyText = history
        .slice(-6)
        .map((item, index) => {
          const content = String(item?.content || "");
          return `Previous user request ${index + 1}:\n${content}`;
        })
        .join("\n\n");
    }

    /*
      Main instruction for MIOD.
      The frontend expects HTML/code in the response.
    */
    const fullPrompt = `
You are MIOD, the AI coding assistant inside JS Code Output.

Your job is to modify or generate the user's HTML/CSS/JavaScript code.

IMPORTANT:
- Return the complete updated HTML code.
- Do not explain the code.
- Do not use Markdown.
- Do not wrap the answer in ```html or ``` blocks.
- Preserve existing functionality unless the user explicitly asks to change it.
- Preserve existing design, animations and layout unless the user asks to change them.
- If the user asks for a small change, make only that change.
- Return valid HTML that can run directly in a browser.

USER REQUEST:
${prompt}

CURRENT HTML CODE:
${current}

${historyText ? `\nPREVIOUS REQUEST CONTEXT:\n${historyText}` : ""}

Now return ONLY the complete updated HTML code.
`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: fullPrompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 65536
      }
    };

    console.log("Calling Gemini:", model);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(requestBody)
    });

    const rawText = await response.text();

    let data = {};

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {
        raw: rawText
      };
    }

    /*
      IMPORTANT:
      If Gemini itself returns an error, send the real
      Gemini error back to the frontend instead of hiding it
      behind a generic 502.
    */
    if (!response.ok) {
      console.error("Gemini API ERROR:", {
        status: response.status,
        statusText: response.statusText,
        body: data
      });

      const googleMessage =
        data?.error?.message ||
        data?.message ||
        rawText ||
        "Unknown Gemini API error";

      return res.status(response.status).json({
        error: `Gemini API error (${response.status}): ${googleMessage}`,
        geminiStatus: response.status,
        geminiStatusText: response.statusText,
        details: data?.error || data
      });
    }

    /*
      Extract generated text.
    */
    let generatedText = "";

    if (
      data?.candidates &&
      Array.isArray(data.candidates) &&
      data.candidates.length > 0
    ) {
      const candidate = data.candidates[0];

      if (candidate?.content?.parts) {
        generatedText = candidate.content.parts
          .map(part => part?.text || "")
          .join("");
      }

      // Helpful diagnostic if Gemini stopped without text
      if (!generatedText && candidate?.finishReason) {
        return res.status(502).json({
          error: `Gemini returned no code. Finish reason: ${candidate.finishReason}`,
          finishReason: candidate.finishReason
        });
      }
    }

    if (!generatedText) {
      console.error("Gemini returned empty response:", data);

      return res.status(502).json({
        error: "Gemini returned an empty response.",
        details: data
      });
    }

    /*
      Remove Markdown code fences if Gemini adds them anyway.
    */
    generatedText = generatedText.trim();

    const fenced = generatedText.match(
      /^```(?:html|HTML)?\s*([\s\S]*?)\s*```$/i
    );

    if (fenced) {
      generatedText = fenced[1].trim();
    }

    /*
      Your existing frontend expects:
        d.html
      so keep that exactly.
    */
    return res.status(200).json({
      html: generatedText,
      code: generatedText,
      text: generatedText
    });

  } catch (error) {
    console.error("generate.js SERVER ERROR:", error);

    return res.status(500).json({
      error: `Server error: ${error?.message || "Unknown error"}`,
      type: error?.name || "Error"
    });
  }
}
