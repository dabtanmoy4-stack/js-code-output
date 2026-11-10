```js
// Vercel Serverless Function
// POST /api/generate
// MIOD AI -> Google Gemini API

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const SYSTEM = `
You are MIOD AI, a web app builder.

Return ONE complete, self-contained HTML document:
<!DOCTYPE html> ... </html>

Rules:
- Output ONLY the HTML code.
- Do not use markdown fences.
- Do not give explanations.
- Keep CSS and JavaScript inline.
- Do not use external APIs.
- If a library is needed, load it only from https://cdnjs.cloudflare.com.
- Always include:
  <meta name="viewport" content="width=device-width,initial-scale=1">
- Make the website mobile-first and responsive.
- Make the UI modern, colourful and functional.
- Do not use localStorage or sessionStorage unless the user explicitly asks for it.
- Keep application state in memory.
- Use console.log for useful debugging messages.
- If Current project code is provided, modify that code according to the user's new request.
- When modifying an existing project, return the COMPLETE updated HTML document.
- Do not remove existing features unless the user asks you to remove them.
- Write UI text in the same language used by the user.
`;

export default async function handler(req, res) {
  // Only POST is allowed
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  // Gemini API key
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY is not configured");

    return res.status(500).json({
      error: "GEMINI_API_KEY is not set on the server"
    });
  }

  try {
    // -----------------------------
    // Read request body
    // -----------------------------
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const {
      prompt,
      history,
      current
    } = body || {};

    // -----------------------------
    // Validate prompt
    // -----------------------------
    if (
      typeof prompt !== "string" ||
      !prompt.trim()
    ) {
      return res.status(400).json({
        error: "Prompt is empty"
      });
    }

    if (prompt.length > 8000) {
      return res.status(400).json({
        error: "Prompt too long"
      });
    }

    // -----------------------------
    // Prepare previous conversation
    // -----------------------------
    let context = "";

    if (Array.isArray(history)) {
      const past = history
        .filter(
          item =>
            item &&
            typeof item.content === "string"
        )
        .slice(-6)
        .map(
          item =>
            "- " + item.content.slice(0, 500)
        )
        .join("\n");

      if (past) {
        context +=
          "Earlier requests in this project:\n" +
          past +
          "\n\n";
      }
    }

    // -----------------------------
    // Add current project code
    // -----------------------------
    if (
      typeof current === "string" &&
      current.trim()
    ) {
      context +=
        "Current project code:\n" +
        current +
        "\n\n";
    }

    // -----------------------------
    // Add new user request
    // -----------------------------
    context +=
      "New request:\n" +
      prompt.trim();

    // -----------------------------
    // Abort after 55 seconds
    // -----------------------------
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 55000);

    let response;

    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",

          signal: controller.signal,

          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },

          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: SYSTEM
                }
              ]
            },

            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: context
                  }
                ]
              }
            ],

            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 32768
            }
          })
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    // -----------------------------
    // Read Gemini response
    // -----------------------------
    const data = await response.json();

    // -----------------------------
    // Gemini API error
    // -----------------------------
    if (!response.ok) {
      console.error(
        "Gemini API error:",
        JSON.stringify(data)
      );

      if (response.status === 429) {
        return res.status(429).json({
          error:
            "Gemini quota/rate limit reached. Please try again shortly."
        });
      }

      return res.status(502).json({
        error:
          data?.error?.message ||
          "Gemini request failed"
      });
    }

    // -----------------------------
    // Get candidate
    // -----------------------------
    const candidate =
      data?.candidates?.[0];

    if (!candidate) {
      return res.status(502).json({
        error:
          "Gemini returned no response (" +
          (data?.promptFeedback?.blockReason ||
            "unknown") +
          ")"
      });
    }

    // -----------------------------
    // Extract generated text
    // -----------------------------
    let html = "";

    const parts =
      candidate?.content?.parts || [];

    for (const part of parts) {
      if (
        part &&
        typeof part.text === "string" &&
        !part.thought
      ) {
        html += part.text;
      }
    }

    html = html.trim();

    // -----------------------------
    // Remove markdown code fences
    // -----------------------------
    const fenced =
      html.match(
        /```(?:html)?\s*([\s\S]*?)```/i
      );

    if (fenced) {
      html = fenced[1].trim();
    }

    // -----------------------------
    // Empty response
    // -----------------------------
    if (!html) {
      return res.status(502).json({
        error:
          "Gemini returned an empty response (" +
          (candidate?.finishReason ||
            "unknown") +
          ")"
      });
    }

    // -----------------------------
    // Output token limit
    // -----------------------------
    if (
      candidate?.finishReason ===
      "MAX_TOKENS"
    ) {
      return res.status(502).json({
        error:
          "Output too long. Ask MIOD for a smaller project."
      });
    }

    // -----------------------------
    // Success
    // -----------------------------
    return res.status(200).json({
      html
    });

  } catch (error) {
    console.error(
      "MIOD backend error:",
      error
    );

    if (
      error?.name === "AbortError"
    ) {
      return res.status(504).json({
        error: "Gemini request timed out"
      });
    }

    return res.status(500).json({
      error: "Server error"
    });
  }
}
```
