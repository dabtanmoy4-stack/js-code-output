
import { E2B } from "@e2b/code-interpreter";

const MAX_CODE_CHARS = 100_000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      status: "error",
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.E2B_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      status: "error",
      error: "E2B_API_KEY is not configured in the server environment."
    });
  }

  const body = req.body || {};
  const code = typeof body.code === "string" ? body.code : "";

  if (!code.trim()) {
    return res.status(400).json({
      status: "error",
      error: "Python code is required."
    });
  }

  if (code.length > MAX_CODE_CHARS) {
    return res.status(413).json({
      status: "error",
      error: "Code exceeds the 100,000 character limit."
    });
  }

  let sandbox;

  try {
    const started = Date.now();

    const client = new E2B({ apiKey });
    sandbox = await client.Sandbox.create();

    const execution = await sandbox.runCode(code);

    const stdout = Array.isArray(execution?.logs?.stdout)
      ? execution.logs.stdout.join("\n")
      : "";

    const stderr = Array.isArray(execution?.logs?.stderr)
      ? execution.logs.stderr.join("\n")
      : "";

    const images = [];

    for (const item of execution?.results || []) {
      const mimeType = item?.mimeType || item?.mime_type;
      const data = item?.data;

      if (
        typeof data === "string" &&
        typeof mimeType === "string" &&
        mimeType.startsWith("image/")
      ) {
        images.push({ mimeType, data });
      }
    }

    const runtimeError = execution?.error;
    const errorMessage = runtimeError
      ? String(
          runtimeError.value ||
          runtimeError.message ||
          runtimeError.name ||
          "Python execution failed"
        )
      : stderr;

    return res.status(200).json({
      status: errorMessage ? "error" : "success",
      output: stdout || execution?.text || "",
      error: errorMessage || "",
      images,
      time: ((Date.now() - started) / 1000).toFixed(2),
      exit_code: errorMessage ? 1 : 0
    });
  } catch (error) {
    console.error("E2B execution error:", error);

    return res.status(500).json({
      status: "error",
      error: String(error?.message || "E2B execution failed")
    });
  } finally {
    if (sandbox) {
      try {
        if (typeof sandbox.kill === "function") {
          await sandbox.kill();
        } else if (typeof sandbox.terminate === "function") {
          await sandbox.terminate();
        }
      } catch (cleanupError) {
        console.error("E2B sandbox cleanup error:", cleanupError);
      }
    }
  }
}
