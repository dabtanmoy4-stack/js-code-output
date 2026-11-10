// api/generate.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        error: "GEMINI_API_KEY is missing in Vercel Environment Variables."
      });
    }

    const {
      prompt = "",
      history = [],
      current = ""
    } = req.body || {};

    if (!prompt.trim()) {
      return res.status(400).json({
        error: "Prompt is empty."
      });
    }

    const model =
      process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    let previous = "";

    if (Array.isArray(history)) {
      previous = history
        .slice(-6)
        .map(x => {
          return `${x.role || "user"}: ${x.content || ""}`;
        })
        .join("\n");
    }

    const instruction = `
You are MIOD AI inside JS Code Output.

Generate complete working HTML based on the user's request.

Rules:
- Return ONLY HTML.
- Do not use markdown code fences.
- Do not explain the answer.
- If existing HTML is provided, modify it instead of unnecessarily replacing unrelated features.
- Preserve existing animations and functionality unless the user asks to change them.
- CSS and JavaScript can be included inside the HTML.
- The result must work directly in an iframe.

Previous conversation:
${previous}

Existing HTML:
${current || "(No existing HTML)"}

User request:
${prompt}
`;

    const geminiResponse = await fetch(apiUrl, {
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
          temperature: 0.3,
          maxOutputTokens: 30000
        }
      })
    });

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Gemini error:", data);

      return res.status(502).json({
        error:
          data?.error?.message ||
          `Gemini API error: ${geminiResponse.status}`
      });
    }

    let result = "";

    const candidates = data?.candidates || [];

    if (
      candidates[0]?.content?.parts &&
      Array.isArray(candidates[0].content.parts)
    ) {
      result = candidates[0].content.parts
        .map(part => part.text || "")
        .join("");
    }

    if (!result.trim()) {
      return res.status(502).json({
        error: "Gemini returned an empty response."
      });
    }

    result = result.trim();

    // Remove ```html ... ``` if Gemini accidentally adds it
    const match = result.match(
      /^```(?:html)?\s*([\s\S]*?)\s*```$/i
    );

    if (match) {
      result = match[1].trim();
    }

    return res.status(200).json({
      html: result
    });

  } catch (error) {
    console.error("generate.js error:", error);

    return res.status(503).json({
      error: error?.message || "Gemini service unavailable."
    });
  }
}
