module.exports = async function handler(req, res) {
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
    const previousInteractionId =
      body.previousInteractionId || null;

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is required"
      });
    }

    let instruction = "";

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
- Do not break existing buttons, animations, layouts or JavaScript.
- Make only the requested changes.
- Return the COMPLETE HTML file.
- HTML, CSS and JavaScript must all remain inside the same HTML file.
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
- Make it fully functional.
- Make it responsive for desktop, tablet and mobile.
- Use a professional premium UI.
- Do not explain anything.
- Do not use Markdown.
- Do not use code fences.
- Start directly with <!DOCTYPE html>.
`;
    }

    const requestBody = {
      model: "gemini-3.8-flash",
      input: instruction,
      generation_config: {
        thinking_level: "medium"
      }
    };

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

    /*
      Interactions API returns the interaction ID
      and model output.
    */

    const interactionId = data?.id || null;

    let generatedText = "";

    if (typeof data?.output_text === "string") {
      generatedText = data.output_text;
    }

    if (!generatedText && Array.isArray(data?.outputs)) {
      generatedText = data.outputs
        .filter(item =>
          item &&
          (item.type === "text" || item.type === "model_output")
        )
        .map(item => item.text || "")
        .join("");
    }

    if (!generatedText && Array.isArray(data?.steps)) {
      generatedText = data.steps
        .filter(step =>
          step &&
          (step.type === "model_output" || step.type === "text")
        )
        .map(step => {
          if (typeof step.text === "string") {
            return step.text;
          }

          if (Array.isArray(step.content)) {
            return step.content
              .map(item => item?.text || "")
              .join("");
          }

          return "";
        })
        .join("");
    }

    if (!generatedText.trim()) {
      console.error(
        "EMPTY GEMINI RESPONSE:",
        JSON.stringify(data, null, 2)
      );

      return res.status(500).json({
        error: "Gemini returned an empty response"
      });
    }

    return res.status(200).json({
      text: generatedText.trim(),
      interactionId
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
