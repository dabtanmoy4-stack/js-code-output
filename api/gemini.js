export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured"
      });
    }

    const {
      prompt,
      currentCode = "",
      mode = "build"
    } = req.body || {};

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is required"
      });
    }

    let instruction = "";

    if (mode === "edit" && currentCode) {
      instruction = `
You are Miod, an AI website builder.

The user wants to modify an existing website.

USER REQUEST:
${prompt}

CURRENT WEBSITE CODE:
${currentCode}

Return ONLY the complete updated HTML document.

Rules:
- Return complete HTML.
- Include HTML, CSS and JavaScript in the same file.
- Do not use markdown.
- Do not use ```html fences.
- Do not explain anything.
- Preserve existing functionality unless the user explicitly asks to change it.
`;
    } else {
      instruction = `
You are Miod, an AI website builder.

Build a complete professional website based on this request:

${prompt}

Return ONLY the complete HTML document.

Rules:
- Return complete HTML.
- Include HTML, CSS and JavaScript in the same file.
- Make it responsive for PC, tablet and mobile.
- Use professional modern UI.
- Do not use markdown.
- Do not use ```html fences.
- Do not explain anything.
`;
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
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

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Gemini API request failed"
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "";

    if (!text) {
      return res.status(500).json({
        error: "Gemini returned an empty response"
      });
    }

    return res.status(200).json({
      text
    });

  } catch (error) {
    return res.status(500).json({
      error: error?.message || "Server error"
    });
  }
}
