module.exports = async function handler(req, res) {
  // Only POST is allowed
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    // Read API key from Vercel Environment Variables
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured in Vercel."
      });
    }

    const {
      prompt,
      currentCode = "",
      previousInteractionId = null,
      mode = "build"
    } = req.body || {};

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        error: "Prompt is required."
      });
    }

    let instruction = "";

    // =========================
    // EDIT MODE
    // =========================
    if (mode === "edit" && currentCode) {
      instruction = `
You are Miod, an AI website builder and coding assistant.

The user wants to modify their existing website.

USER REQUEST:
${prompt}

CURRENT WEBSITE CODE:
${currentCode}

Your task:
Modify the existing website according to the user's request.

IMPORTANT RULES:
- Return ONLY the complete updated HTML document.
- Include HTML, CSS and JavaScript in the same HTML file.
- Preserve existing functionality unless the user explicitly asks to change it.
- Do not remove unrelated features.
- Do not explain the changes.
- Do not use Markdown.
- Do not use code fences.
- The response must start with <!DOCTYPE html> or <html>.
- Return the complete website, not only the changed section.
`;
    }

    // =========================
    // BUILD MODE
    // =========================
    else {
      instruction = `
You are Miod, an AI website builder.

Build a complete professional website based on the user's request.

USER REQUEST:
${prompt}

IMPORTANT RULES:
- Return ONLY the complete HTML document.
- Include HTML, CSS and JavaScript in the same HTML file.
- Make the website responsive for desktop, tablet and mobile.
- Use professional modern UI.
- Make the website functional, not just a visual mockup.
- Do not explain anything.
- Do not use Markdown.
- Do not use code fences.
- The response must start with <!DOCTYPE html> or <html>.
`;
    }

    // =========================
    // GEMINI API REQUEST
    // =========================
    const response = await fetch(
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

    // Read Gemini response
    const data = await response.json();

    // =========================
    // GEMINI API ERROR
    // =========================
    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          `Gemini API request failed (${response.status})`,
        details: data?.error || null
      });
    }

    // =========================
    // EXTRACT TEXT
    // =========================
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part?.text || "")
        .join("") || "";

    if (!text.trim()) {
      console.error("Empty Gemini response:", data);

      return res.status(500).json({
        error: "Gemini returned an empty response.",
        details: data
      });
    }

    // =========================
    // SUCCESS
    // =========================
    return res.status(200).json({
      text: text.trim(),

      // Kept for compatibility with the current Miod frontend.
      // generateContent itself does not create an interaction ID.
      interactionId: previousInteractionId || null
    });

  } catch (error) {
    console.error("Gemini server error:", error);

    return res.status(500).json({
      error: error?.message || "Internal server error"
    });
  }
};
