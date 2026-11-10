const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const SYSTEM = `
You are MIOD AI, a web app builder.

Return ONE complete self-contained HTML document.

Rules:
- Return only HTML code.
- Do not return markdown.
- Do not return explanations.
- Keep CSS and JavaScript inside the HTML.
- Do not use localStorage or sessionStorage unless explicitly requested.
- Make the website responsive and mobile friendly.
- Include viewport meta tag.
- If current project code is provided, modify it and return the complete updated HTML.
- Do not remove existing features unless the user asks.
- Match the language of the user's request.
`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not set on the server"
    });
  }

  try {
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (error) {
        return res.status(400).json({
          error: "Invalid JSON body"
        });
      }
    }

    const prompt =
      typeof body?.prompt === "string"
        ? body.prompt.trim()
        : "";

    const history =
      Array.isArray(body?.history)
        ? body.history
        : [];

    const current =
      typeof body?.current === "string"
        ? body.current
        : "";

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is empty"
      });
    }

    if (prompt.length > 8000) {
      return res.status(400).json({
        error: "Prompt too long"
      });
    }

    let input = "";

    const previous = history
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

    if (previous) {
      input +=
        "Earlier requests in this project:\n" +
        previous +
        "\n\n";
    }

    if (current.trim()) {
      input +=
        "Current project code:\n" +
        current +
        "\n\n";
    }

    input +=
      "New request:\n" +
      prompt;

    const controller =
      new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 55000);

    let response;

    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          MODEL
        )}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          signal: controller.signal,
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
                    text: input
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

    const data =
      await response.json();

    if (!response.ok) {
      console.error(
        "Gemini API error:",
        JSON.stringify(data)
      );

      if (response.status === 429) {
        return res.status(429).json({
          error:
            "Gemini quota or rate limit reached. Try again shortly."
        });
      }

      return res.status(502).json({
        error:
          data?.error?.message ||
          "Gemini request failed"
      });
    }

    const candidate =
      data?.candidates?.[0];

    if (!candidate) {
      return res.status(502).json({
        error:
          "Gemini returned no response: " +
          (data?.promptFeedback?.blockReason ||
            "unknown")
      });
    }

    const parts =
      candidate?.content?.parts || [];

    let html = parts
      .filter(
        part =>
          part &&
          typeof part.text === "string" &&
          !part.thought
      )
      .map(part => part.text)
      .join("")
      .trim();

    if (!html) {
      return res.status(502).json({
        error:
          "Gemini returned an empty response: " +
          (candidate?.finishReason ||
            "unknown")
      });
    }

    const fenced =
      html.match(
        /^```(?:html)?\s*([\s\S]*?)\s*```$/i
      );

    if (fenced) {
      html = fenced[1].trim();
    }

    if (
      candidate.finishReason ===
      "MAX_TOKENS"
    ) {
      return res.status(502).json({
        error:
          "Output too long. Ask MIOD for a smaller project."
      });
    }

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
      error:
        error?.message ||
        "Server error"
    });
  }
}
