// api/generate.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is missing in Vercel."
    });
  }

  try {
    let body = req.body;

    // Vercel normally gives an object,
    // but handle string JSON too.
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({
          error: "Invalid JSON request body."
        });
      }
    }

    body = body || {};

    const prompt = String(body.prompt || "").trim();
    const current = String(body.current || "");

    const history = Array.isArray(body.history)
      ? body.history.slice(-6)
      : [];

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is empty."
      });
    }

    /*
      Try models in this order.

      If one model is temporarily busy/unavailable,
      automatically try the next one.
    */
    const models = [
      "gemini-3.8-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash-lite"
    ];

    let previous = "";

    if (history.length > 0) {
      previous = history
        .map((item, index) => {
          return (
            `Previous user request ${index + 1}:\n` +
            String(item?.content || "")
          );
        })
        .join("\n\n");
    }

    const fullPrompt = `
You are MIOD, the AI coding assistant inside JS Code Output.

Your job is to modify or generate the user's HTML/CSS/JavaScript code.

IMPORTANT RULES:
- Return the complete updated HTML code.
- Return ONLY the HTML code.
- Do not explain the code.
- Do not use Markdown.
- Do not use code fences.
- Preserve the existing design.
- Preserve existing animations.
- Preserve existing functionality.
- Do not remove existing features unless the user asks.
- If the user requests a small change, make only that change.

USER REQUEST:
${prompt}

CURRENT HTML:
${current}

${previous ? `
PREVIOUS USER REQUESTS:
${previous}
` : ""}

Now return ONLY the complete final HTML code.
`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: fullPrompt
            }
          ]
        }
      ],

      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 65536
      }
    };

    let lastError = null;

    /*
      Try each Gemini model.
    */
    for (const model of models) {

      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      try {
        console.log(`Trying Gemini model: ${model}`);

        const response = await fetch(url, {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },

          body: JSON.stringify(requestBody)
        });

        const rawText = await response.text();

        let data = {};

        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch {
          data = {
            rawResponse: rawText
          };
        }

        /*
          Successful response.
        */
        if (response.ok) {

          const candidate = data?.candidates?.[0];

          if (!candidate) {
            lastError = {
              model,
              status: response.status,
              message: "Gemini returned no candidate.",
              details: data
            };

            continue;
          }

          let html = "";

          if (Array.isArray(candidate?.content?.parts)) {
            html = candidate.content.parts
              .map(part => part?.text || "")
              .join("");
          }

          html = html.trim();

          /*
            If model produced no text, try another model.
          */
          if (!html) {
            lastError = {
              model,
              status: response.status,
              message: "Gemini returned empty output.",
              finishReason:
                candidate?.finishReason || "unknown"
            };

            continue;
          }

          /*
            Remove ```html ... ``` if Gemini adds it.
          */
          const fenced = html.match(
            /^```(?:html|HTML)?\s*([\s\S]*?)\s*```$/i
          );

          if (fenced) {
            html = fenced[1].trim();
          }

          console.log(`Gemini success with model: ${model}`);

          /*
            Your existing frontend already expects d.html
          */
          return res.status(200).json({
            html,
            code: html,
            text: html,
            model
          });
        }

        /*
          Gemini request failed.
        */
        const message =
          data?.error?.message ||
          data?.message ||
          `Gemini returned HTTP ${response.status}`;

        console.error(`Gemini ${model} error:`, {
          status: response.status,
          message,
          details: data
        });

        lastError = {
          model,
          status: response.status,
          message,
          details: data?.error || data
        };

        /*
          These are generally temporary/server/model availability
          errors, so try the next model.
        */
        const retryableStatuses = [
          429, // rate limit
          500,
          502,
          503,
          504
        ];

        /*
          404 can happen for model availability/eligibility,
          so allow fallback as well.
        */
        if (
          retryableStatuses.includes(response.status) ||
          response.status === 404
        ) {
          continue;
        }

        /*
          Authentication, invalid request, etc.
          should NOT be hidden by another model attempt.
        */
        return res.status(response.status).json({
          error: `Gemini API error: ${message}`,
          model,
          details: data?.error || data
        });

      } catch (modelError) {

        console.error(
          `Network/server error with ${model}:`,
          modelError
        );

        lastError = {
          model,
          status: 0,
          message:
            modelError?.message ||
            "Unable to reach Gemini"
        };

        /*
          Try the next model.
        */
        continue;
      }
    }

    /*
      All models failed.
    */
    return res.status(502).json({
      error:
        "Gemini is temporarily unavailable. All configured models failed.",

      lastModelError: lastError
    });

  } catch (error) {

    console.error("GENERATE.JS ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Internal server error",

      errorType:
        error?.name ||
        "Error"
    });
  }
}
