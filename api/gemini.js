module.exports = async function handler(req, res) {
  // Only POST is allowed
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    // Get API key from Vercel Environment Variables
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
    const previousInteractionId =
      body.previousInteractionId
        ? String(body.previousInteractionId)
        : null;

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is required"
      });
    }

    let instruction = "";

    // EDIT MODE
    if (mode === "edit" && currentCode) {
      instruction = `
You are Miod, a professional AI website builder.

USER REQUEST:
${prompt}

CURRENT WEBSITE CODE:
${currentCode}

TASK:
Modify the existing website according to the user's request.

IMPORTANT RULES:
- Preserve ALL existing working features.
- Do NOT remove unrelated features.
- Do NOT break existing buttons, animations, layouts or JavaScript.
- Change ONLY what the user requested.
- Return the COMPLETE HTML file.
- HTML, CSS and JavaScript must remain inside ONE HTML file.
- Make the requested changes fully functional.
- Do not explain anything.
- Do not use Markdown.
- Do not use code fences.
- Start directly with <!DOCTYPE html>.
`;
    }

    // BUILD MODE
    else {
      instruction = `
You are Miod, a professional AI website builder.

USER REQUEST:
${prompt}

TASK:
Build a complete professional website based on the user's request.

IMPORTANT RULES:
- Return ONLY the complete HTML file.
- HTML, CSS and JavaScript must all be inside ONE HTML file.
- Make the website fully functional.
- Make it responsive for desktop, tablet and mobile.
- Use a professional premium UI.
- Include working interactions and JavaScript where needed.
- Do not explain anything.
- Do not use Markdown.
- Do not use code fences.
- Start directly with <!DOCTYPE html>.
`;
    }

    // Gemini Interactions API request
    const requestBody = {
      model: "gemini-3.8-flash",
      input: instruction
    };

    // Continue previous Miod conversation when available
    if (previousInteractionId) {
      requestBody.previous_interaction_id =
        previousInteractionId;
    }

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },

        body: JSON.stringify(requestBody)
      }
    );

    // Read Gemini response safely
    const responseText = await geminiResponse.text();

    let data = {};

    try {
      data = responseText
        ? JSON.parse(responseText)
        : {};
    } catch (parseError) {
      console.error(
        "GEMINI INVALID JSON RESPONSE:",
        responseText
      );

      return res.status(502).json({
        error: "Gemini returned an invalid response",
        googleStatus: geminiResponse.status
      });
    }

    // Gemini returned an error
    if (!geminiResponse.ok) {
      console.error("GEMINI API ERROR:", {
        status: geminiResponse.status,
        data
      });

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

    // Get generated text
    let generatedText = "";

    if (typeof data?.output_text === "string") {
      generatedText = data.output_text;
    }

    // Fallback for responses containing outputs
    if (!generatedText && Array.isArray(data?.outputs)) {
      generatedText = data.outputs
        .map(item => {
          if (typeof item?.text === "string") {
            return item.text;
          }

          if (Array.isArray(item?.content)) {
            return item.content
              .map(content => content?.text || "")
              .join("");
          }

          return "";
        })
        .join("");
    }

    // Fallback for step-based response
    if (!generatedText && Array.isArray(data?.steps)) {
      generatedText = data.steps
        .map(step => {
          if (typeof step?.text === "string") {
            return step.text;
          }

          if (Array.isArray(step?.content)) {
            return step.content
              .map(content => content?.text || "")
              .join("");
          }

          return "";
        })
        .join("");
    }

    if (!generatedText.trim()) {
      console.error(
        "GEMINI EMPTY RESPONSE:",
        JSON.stringify(data, null, 2)
      );

      return res.status(502).json({
        error: "Gemini returned an empty response"
      });
    }

    // Send result back to miod.html
    return res.status(200).json({
      text: generatedText.trim(),

      interactionId:
        data?.id || null
    });

  } catch (error) {
    console.error("MIOD SERVER ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Internal server error"
    });
  }
};
