// api/generate.js

export default async function handler(req, res) {
  // Only POST is allowed
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }

  try {
    // -----------------------------
    // Gemini API Key
    // -----------------------------
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Gemini API key is not configured on the server."
      });
    }

    // -----------------------------
    // Get data from frontend
    // -----------------------------
    const body = req.body || {};

    const prompt = String(body.prompt || "").trim();
    const current = String(body.current || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is required."
      });
    }

    // -----------------------------
    // Build conversation context
    // -----------------------------
    let conversation = "";

    if (history.length) {
      conversation += "\n\nPrevious conversation:\n";

      history.slice(-6).forEach((item) => {
        const role = item && item.role ? item.role : "user";
        const content = item && item.content
          ? String(item.content)
          : "";

        if (content) {
          conversation +=
            `${role.toUpperCase()}: ${content}\n`;
        }
      });
    }

    // -----------------------------
    // Current HTML
    // -----------------------------
    let currentCode = "";

    if (current) {
      currentCode = `
CURRENT HTML CODE:
------------------
${current}
------------------
`;
    } else {
      currentCode = `
CURRENT HTML CODE:
------------------
No existing HTML code.
------------------
`;
    }

    // -----------------------------
    // Main MIOD instruction
    // -----------------------------
    const systemInstruction = `
You are MIOD AI inside JS Code Output.

Your job is to generate or modify complete HTML projects.

IMPORTANT RULES:

1. Return ONLY the complete HTML code.
2. Do NOT use Markdown code fences.
3. Do NOT explain the code.
4. The result must be directly usable inside an HTML iframe.
5. Always include proper HTML structure when generating a new project.
6. If the user asks to modify existing code, preserve the existing functionality unless the user explicitly asks to remove it.
7. Do not unnecessarily remove existing animations, styles, buttons, sections or functionality.
8. Make the generated HTML self-contained whenever possible.
9. CSS and JavaScript may be included inside the HTML.
10. If the user asks for an animation, make it actually animated rather than static.
11. If the user asks for a website, produce a complete working website.
12. Do not return analysis, comments about what you changed, or explanations outside the HTML.
`;

    // -----------------------------
    // Final prompt
    // -----------------------------
    const finalPrompt = `
${systemInstruction}

${conversation}

${currentCode}

USER REQUEST:
${prompt}

Now generate the complete final HTML.
Return ONLY HTML.
`;

    // -----------------------------
    // Gemini model
    // -----------------------------
    // You can change this from Vercel Environment Variables:
    // GEMINI_MODEL
    //
    // Example:
    // gemini-3.8-flash
    //
    const model =
      process.env.GEMINI_MODEL ||
      "gemini-3.8-flash";

    // -----------------------------
    // Gemini API URL
    // -----------------------------
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    // -----------------------------
    // Call Gemini
    // -----------------------------
    const response = await fetch(url, {
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
                text: finalPrompt
              }
            ]
          }
        ],

        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 30000
        }
      })
    });

    // -----------------------------
    // Read Gemini response
    // -----------------------------
    const data = await response.json();

    // -----------------------------
    // Gemini API error
    // -----------------------------
    if (!response.ok) {
      console.error("Gemini API error:", data);

      const message =
        data?.error?.message ||
        `Gemini API returned HTTP ${response.status}`;

      return res.status(response.status).json({
        error: message
      });
    }

    // -----------------------------
    // Extract generated text
    // -----------------------------
    let output = "";

    if (
      data &&
      Array.isArray(data.candidates) &&
      data.candidates.length > 0
    ) {
      const candidate = data.candidates[0];

      if (
        candidate.content &&
        Array.isArray(candidate.content.parts)
      ) {
        output = candidate.content.parts
          .map((part) => part.text || "")
          .join("");
      }
    }

    if (!output.trim()) {
      console.error("Empty Gemini response:", data);

      return res.status(502).json({
        error: "Gemini returned an empty response."
      });
    }

    // -----------------------------
    // Remove accidental markdown
    // -----------------------------
    output = output.trim();

    const fenced = output.match(
      /^```(?:html|HTML)?\s*([\s\S]*?)\s*```$/
    );

    if (fenced) {
      output = fenced[1].trim();
    }

    // -----------------------------
    // Send back to frontend
    // -----------------------------
    return res.status(200).json({
      html: output
    });

  } catch (error) {
    console.error("Generate API error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Internal server error while contacting Gemini."
    });
  }
}
