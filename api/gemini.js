module.exports = async function handler(req, res) {
  // Allow only POST
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing in Vercel Environment Variables"
      });
    }

    const body = req.body || {};

    const prompt = String(body.prompt || "").trim();
    const currentCode = String(body.currentCode || "");
    const mode = body.mode || "build";

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is required"
      });
    }

    let instruction;

    if (mode === "edit" && currentCode) {
      instruction = `
You are Miod, a professional AI website builder.

USER REQUEST:
${prompt}

CURRENT WEBSITE CODE:
${currentCode}

TASK:
Modify the existing website according to the user's request.

IMPORTANT:
- Preserve all existing working features.
- Do not remove unrelated functionality.
- Return the COMPLETE HTML file.
- HTML, CSS and JavaScript must all be inside the same HTML file.
- Make the requested changes only.
- Do not explain anything.
- Do not use Markdown.
- Do not use code fences.
- Start directly with <!DOCTYPE html>.
`;
    } else {
      instruction = `
You are Miod, a professional AI website builder.

USER REQUEST:
${prompt}

TASK:
Build a complete professional website based on the user's request.

IMPORTANT:
- Return ONLY the complete HTML file.
- HTML, CSS and JavaScript must all be inside the same HTML file.
- Make it responsive for desktop, tablet and mobile.
- Make it functional, not just a visual mockup.
- Use a professional premium UI.
- Do not explain anything.
- Do not use Markdown.
- Do not use code fences.
- Start directly with <!DOCTYPE html>.
`;
    }

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
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

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Gemini API ERROR:", data);

      return res.status(500).json({
        error:
          data?.error?.message ||
          "Gemini API request failed",

        googleStatus: geminiResponse.status
      });
    }

    const generatedText =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part?.text || "")
        .join("") || "";

    if (!generatedText.trim()) {
      console.error("EMPTY GEMINI RESPONSE:", data);

      return res.status(500).json({
        error: "Gemini returned an empty response"
      });
    }

    return res.status(200).json({
      text: generatedText.trim()
    });

  } catch (error) {
    console.error("MIOD SERVER ERROR:", error);

    return res.status(500).json({
      error: error?.message || "Internal server error"
    });
  }
};
