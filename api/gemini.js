module.exports = async function handler(req, res) {
  // Only POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    // Get Gemini API key from Vercel
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing in Vercel Environment Variables"
      });
    }

    const body = req.body || {};

    const prompt = String(body.prompt || "").trim();
    const currentCode = String(body.currentCode || "");
    const mode = String(body.mode || "build");

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is required"
      });
    }

    let instruction = "";

    // =========================
    // EDIT EXISTING WEBSITE
    // =========================
    if (mode === "edit" && currentCode) {
      instruction = `
You are Miod, a professional AI website builder.

USER REQUEST:
${prompt}

CURRENT WEBSITE CODE:
${currentCode}

TASK:
Modify the existing website according to the user's request.

VERY IMPORTANT:
- Preserve ALL existing working features.
- Do NOT remove unrelated features.
- Do NOT break existing buttons.
- Do NOT break existing JavaScript.
- Do NOT break existing animations.
- Do NOT break existing responsive layouts.
- Change ONLY what the user requested.
- Keep all existing useful functionality.
- Return the COMPLETE HTML file.
- HTML, CSS and JavaScript must remain inside ONE HTML file.
- The result must be fully functional.
- Do not explain anything.
- Do not use Markdown.
- Do not use code fences.
- Start directly with <!DOCTYPE html>.
`;

    } else {

      // =========================
      // BUILD NEW WEBSITE
      // =========================
      instruction = `
You are Miod, a professional AI website builder.

USER REQUEST:
${prompt}

TASK:
Build a complete professional website based on the user's request.

IMPORTANT:
- Return ONLY the complete HTML file.
- HTML, CSS and JavaScript must all be inside ONE HTML file.
- Make the website fully functional.
- Make it responsive on desktop, tablet and mobile.
- Use a professional premium UI.
- Add working interactions and JavaScript when needed.
- Do not explain anything.
- Do not use Markdown.
- Do not use code fences.
- Start directly with <!DOCTYPE html>.
`;
    }

    // =========================
    // GEMINI 3.8 FLASH
    // GENERATE CONTENT API
    // =========================
    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
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
            temperature: 0.7,
            maxOutputTokens: 30000
          }
        })
      }
    );

    // =========================
    // READ GEMINI RESPONSE
    // =========================
    const responseText = await geminiResponse.text();

    let data = {};

    try {
      data = responseText
        ? JSON.parse(responseText)
        : {};
    } catch (error) {
      console.error(
        "GEMINI INVALID JSON:",
        responseText
      );

      return res.status(502).json({
        error: "Gemini returned an invalid response",
        googleStatus: geminiResponse.status
      });
    }

    // =========================
    // GEMINI ERROR
    // =========================
    if (!geminiResponse.ok) {
      console.error(
        "GEMINI API ERROR:",
        JSON.stringify(data, null, 2)
      );

      return res.status(geminiResponse.status).json({
        error:
          data?.error?.message ||
          "Gemini API request failed",

        googleStatus: geminiResponse.status,

        googleStatusText:
          data?.error?.status ||
          geminiResponse.statusText ||
          ""
      });
    }

    // =========================
    // GET GENERATED TEXT
    // =========================
    let generatedText = "";

    if (
      data?.candidates &&
      Array.isArray(data.candidates)
    ) {
      for (const candidate of data.candidates) {
        const parts =
          candidate?.content?.parts;

        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (typeof part?.text === "string") {
              generatedText += part.text;
            }
          }
        }
      }
    }

    // =========================
    // EMPTY RESPONSE
    // =========================
    if (!generatedText.trim()) {
      console.error(
        "GEMINI EMPTY RESPONSE:",
        JSON.stringify(data, null, 2)
      );

      return res.status(502).json({
        error: "Gemini returned an empty response"
      });
    }

    // =========================
    // CLEAN MARKDOWN CODE FENCE
    // =========================
    generatedText = generatedText.trim();

    if (generatedText.startsWith("```html")) {
      generatedText = generatedText
        .replace(/^```html\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    } else if (generatedText.startsWith("```")) {
      generatedText = generatedText
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

    // =========================
    // SEND TO MIOD.HTML
    // =========================
    return res.status(200).json({
      text: generatedText
    });

  } catch (error) {

    console.error(
      "MIOD SERVER ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Internal server error"
    });
  }
};
