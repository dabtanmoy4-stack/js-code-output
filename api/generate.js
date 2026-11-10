const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const FALLBACK_MODEL = "gemini-3.6-flash";

const SYSTEM = `
You are MIOD AI, a web app builder.

Return ONE complete, self-contained HTML document:
<!DOCTYPE html>
<html>
...
</html>

Rules:
- Output ONLY the HTML code.
- Do not use markdown code fences.
- Do not give explanations.
- Keep CSS and JavaScript inline.
- Do not use external APIs.
- If a library is needed, load it only from https://cdnjs.cloudflare.com.
- Always include a viewport meta tag.
- Make the website mobile-first and responsive.
- Make the UI modern, colourful and polished.
- Do not use localStorage or sessionStorage unless the user explicitly asks for it.
- If current project code is provided, modify that project and return the complete updated HTML.
- Preserve existing features unless the user explicitly asks to remove them.
- Do not return partial code.
- Always return the complete HTML document.
- Match the language of the user's request.
`;

function cleanHtml(text) {
  if (!text) return "";

  text = text.trim();

  // Remove markdown code fences if Gemini accidentally adds them.
  text = text.replace(/^```html\\s*/i, "");
  text = text.replace(/^```\\s*/i, "");
  text = text.replace(/\\s*```$/i, "");

  return text.trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callGemini(model, input, apiKey, signal) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
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
              text: input
            }
          ]
        }
      ],

      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 32768
      }
    }),

    signal
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const errorMessage =
      data?.error?.message ||
      `Gemini request failed with HTTP ${response.status}`;

    const error = new Error(errorMessage);

    error.status = response.status;
    error.geminiStatus = data?.error?.status || null;
    error.model = model;
    error.raw = data?.error || null;

    throw error;
  }

  const parts =
    data?.candidates?.[0]?.content?.parts || [];

  let output = "";

  for (const part of parts) {
    if (part?.text) {
      output += part.text;
    }
  }

  output = cleanHtml(output);

  if (!output) {
    const error = new Error("Gemini returned an empty response.");
    error.status = 502;
    error.model = model;
    throw error;
  }

  return output;
}

export default async function handler(req, res) {
  // Only POST is allowed.
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed. Use POST."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing.");

    return res.status(500).json({
      error: "Gemini API is not configured on the server."
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : "";

    const history = Array.isArray(body.history)
      ? body.history
      : [];

    const current =
      typeof body.current === "string"
        ? body.current.trim()
        : "";

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is required."
      });
    }

    if (prompt.length > 8000) {
      return res.status(400).json({
        error: "Prompt is too long. Maximum 8000 characters."
      });
    }

    // Keep only a small amount of previous conversation.
    const safeHistory = history
      .slice(-6)
      .map(item => {
        if (!item) return "";

        if (typeof item === "string") {
          return item.slice(0, 500);
        }

        const role =
          typeof item.role === "string"
            ? item.role
            : "user";

        const content =
          typeof item.content === "string"
            ? item.content
            : "";

        return `${role}: ${content.slice(0, 500)}`;
      })
      .filter(Boolean);

    let input = "";

    if (safeHistory.length) {
      input += `
Previous conversation:
${safeHistory.join("\n")}

`;
    }

    input += `User request:
${prompt}
`;

    if (current) {
      input += `

Current project code:
${current}

Modify the current project according to the user's request and return the COMPLETE updated HTML.
`;
    }

    /*
     * 55 second total server-side timeout.
     */
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 55000);

    try {
      /*
       * Attempt 1:
       * Primary model.
       *
       * Retry 503/429/temporary errors with exponential backoff.
       */
      let lastError = null;

      const retryDelays = [1500, 3500, 7000];

      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const html = await callGemini(
            PRIMARY_MODEL,
            input,
            apiKey,
            controller.signal
          );

          clearTimeout(timeout);

          return res.status(200).json({
            html,
            model: PRIMARY_MODEL
          });

        } catch (error) {
          lastError = error;

          const status = error?.status;

          const temporary =
            status === 503 ||
            status === 429 ||
            status === 500 ||
            status === 502 ||
            status === 504;

          if (!temporary || attempt === 3) {
            break;
          }

          console.warn(
            `Gemini ${PRIMARY_MODEL} attempt ${attempt + 1} failed ` +
            `with ${status}. Retrying in ${retryDelays[attempt]}ms...`
          );

          await sleep(retryDelays[attempt]);
        }
      }

      /*
       * Primary model failed.
       * Try fallback model once.
       */
      console.warn(
        `Primary Gemini model failed. Trying fallback: ${FALLBACK_MODEL}`
      );

      try {
        const html = await callGemini(
          FALLBACK_MODEL,
          input,
          apiKey,
          controller.signal
        );

        clearTimeout(timeout);

        return res.status(200).json({
          html,
          model: FALLBACK_MODEL,
          fallback: true
        });

      } catch (fallbackError) {
        clearTimeout(timeout);

        console.error(
          "Primary Gemini error:",
          JSON.stringify({
            status: lastError?.status,
            message: lastError?.message,
            model: PRIMARY_MODEL
          })
        );

        console.error(
          "Fallback Gemini error:",
          JSON.stringify({
            status: fallbackError?.status,
            message: fallbackError?.message,
            model: FALLBACK_MODEL
          })
        );

        /*
         * If both models fail, return useful information
         * to the frontend without exposing the API key.
         */
        return res.status(502).json({
          error: "Gemini API is temporarily unavailable.",
          details: {
            primaryModel: PRIMARY_MODEL,
            primaryStatus: lastError?.status || null,
            fallbackModel: FALLBACK_MODEL,
            fallbackStatus: fallbackError?.status || null,
            message:
              fallbackError?.message ||
              lastError?.message ||
              "Unknown Gemini API error"
          }
        });
      }

    } finally {
      clearTimeout(timeout);
    }

  } catch (error) {
    console.error("MIOD generate error:", error);

    if (error?.name === "AbortError") {
      return res.status(504).json({
        error: "Gemini request timed out. Please try again."
      });
    }

    return res.status(500).json({
      error: "Something went wrong while generating the project.",
      details: error?.message || "Unknown server error"
    });
  }
}
