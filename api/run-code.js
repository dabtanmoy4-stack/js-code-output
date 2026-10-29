import { Sandbox } from "@e2b/code-interpreter";

const MAX_CODE_CHARS = 50000;
const MAX_INPUT_CHARS = 10000;
const MAX_DECLARED_PACKAGES = 3;
const MAX_AUTO_INSTALLS = 2;

// Import names and PyPI package names are not always the same.
const PACKAGE_MAP = {
  PIL: "pillow", cv2: "opencv-python-headless", sklearn: "scikit-learn",
  yaml: "pyyaml", bs4: "beautifulsoup4", dateutil: "python-dateutil",
  Crypto: "pycryptodome", fitz: "pymupdf", skimage: "scikit-image",
  wx: "wxPython", serial: "pyserial", dotenv: "python-dotenv",
  plotly: "plotly", seaborn: "seaborn", pandas: "pandas", numpy: "numpy",
  scipy: "scipy", sympy: "sympy", networkx: "networkx", trimesh: "trimesh",
  vpython: "vpython", manim: "manim", pygame: "pygame", arcade: "arcade",
  turtle: "", tkinter: "", _tkinter: "", bpy: "", torch: "torch",
  tensorflow: "tensorflow", transformers: "transformers", ultralytics: "ultralytics",
  requests: "requests", httpx: "httpx", lxml: "lxml", rich: "rich",
  openpyxl: "openpyxl", docx: "python-docx", reportlab: "reportlab",
  qrcode: "qrcode", moviepy: "moviepy", imageio: "imageio", imageio_ffmpeg: "imageio-ffmpeg"
};

function collectText(value) {
  if (Array.isArray(value)) return value.filter((x) => typeof x === "string").join("");
  return typeof value === "string" ? value : "";
}

function normalizeError(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  const name = error.name || "ExecutionError";
  const value = error.value || error.message || "Python execution failed";
  const traceback = Array.isArray(error.traceback) ? error.traceback.join("\n") : "";
  return `${name}: ${value}${traceback ? `\n${traceback}` : ""}`;
}

function withInputSupport(code, input) {
  const lines = input.split(/\r?\n/);
  const encodedLines = JSON.stringify(lines);
  return [
    "import builtins as __jsco_builtins",
    `__jsco_input_lines = iter(${encodedLines})`,
    "def __jsco_input(prompt=''):",
    "    if prompt:",
    "        print(prompt, end='')",
    "    try:",
    "        return next(__jsco_input_lines)",
    "    except StopIteration:",
    "        raise EOFError('No more input lines were provided in the Input panel')",
    "__jsco_builtins.input = __jsco_input",
    "",
    code,
  ].join("\n");
}

function declaredPackages(code) {
  // Optional first-line syntax: # pip: numpy, scipy, pillow
  // Also accepts: # requirements: numpy scipy pillow
  const found = new Set();
  for (const line of code.split(/\r?\n/).slice(0, 12)) {
    const match = line.match(/^\s*#\s*(?:pip|requirements)\s*:\s*(.*?)\s*$/i);
    if (!match) continue;
    for (const raw of match[1].split(/[\s,;]+/)) {
      const name = raw.trim().toLowerCase();
      if (/^[a-z0-9][a-z0-9._-]{0,63}$/.test(name)) found.add(name);
    }
  }
  if (found.size > MAX_DECLARED_PACKAGES) {
    throw new Error(`At most ${MAX_DECLARED_PACKAGES} packages can be declared in the code header. Remove extra packages and run again.`);
  }
  return [...found];
}

function missingModule(errorText) {
  const match = String(errorText || "").match(/No module named ['"]([^'"]+)['"]|ModuleNotFoundError:\s*([^\s]+)/);
  if (!match) return "";
  return (match[1] || match[2] || "").split(".")[0].replace(/[^A-Za-z0-9_]/g, "");
}

function packageForModule(moduleName) {
  if (!moduleName) return "";
  if (Object.prototype.hasOwnProperty.call(PACKAGE_MAP, moduleName)) return PACKAGE_MAP[moduleName];
  // Only infer simple package names; special/native modules are intentionally excluded.
  if (/^[a-z][a-z0-9_]{1,39}$/.test(moduleName)) return moduleName.replace(/_/g, "-");
  return "";
}

async function installPackage(sandbox, packageName) {
  // packageName is validated before reaching the shell; no user-supplied shell syntax.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(packageName)) {
    throw new Error("Invalid Python package name.");
  }
  const result = await sandbox.commands.run(`python -m pip install --disable-pip-version-check --no-input ${packageName}`, { timeoutMs: 15000 });
  if (result && typeof result.exitCode === "number" && result.exitCode !== 0) {
    const detail = String(result.stderr || result.stdout || "").slice(-1800);
    throw new Error(`Could not install Python package '${packageName}'. ${detail}`.trim());
  }
}

function serializeResults(execution) {
  return Array.isArray(execution.results) ? execution.results.map((item) => ({
    text: item && typeof item.text === "string" ? item.text : "",
    html: item && typeof item.html === "string" ? item.html : "",
    png: item && typeof item.png === "string" ? item.png : "",
    jpeg: item && typeof item.jpeg === "string" ? item.jpeg : "",
    svg: item && typeof item.svg === "string" ? item.svg : "",
    chart: item && typeof item.chart === "string" ? item.chart : "",
    markdown: item && typeof item.markdown === "string" ? item.markdown : ""
  })) : [];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");

  if (!process.env.E2B_API_KEY) {
    return res.status(500).json({ success: false, error: "E2B_API_KEY is not configured in Vercel Environment Variables" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const code = body.code;
  const input = body.input === undefined ? "" : body.input;
  const compiler = body.compiler || "python";
  if (compiler !== "python") {
    return res.status(400).json({ success: false, error: "This endpoint currently runs Python only. Use browser preview for HTML, CSS, and client-side JavaScript." });
  }
  if (typeof code !== "string" || !code.trim()) {
    return res.status(400).json({ success: false, error: "Python code is required" });
  }
  if (code.length > MAX_CODE_CHARS) {
    return res.status(413).json({ success: false, error: `Code is too large. Maximum is ${MAX_CODE_CHARS} characters.` });
  }
  if (typeof input !== "string") {
    return res.status(400).json({ success: false, error: "Input must be a string" });
  }
  if (input.length > MAX_INPUT_CHARS) {
    return res.status(413).json({ success: false, error: `Input is too large. Maximum is ${MAX_INPUT_CHARS} characters.` });
  }

  let packagesToInstall;
  try { packagesToInstall = declaredPackages(code); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }

  let sandbox;
  try {
    sandbox = await Sandbox.create();
    const started = Date.now();
    const installedPackages = [];
    const attemptedPackages = new Set();

    // Optional explicit dependencies are installed first. Runtime installs are per sandbox/run.
    for (const packageName of packagesToInstall) {
      await installPackage(sandbox, packageName);
      installedPackages.push(packageName);
      attemptedPackages.add(packageName.toLowerCase());
    }

    let execution;
    for (let attempt = 0; attempt <= MAX_AUTO_INSTALLS; attempt++) {
      execution = await sandbox.runCode(withInputSupport(code, input));
      const firstError = normalizeError(execution.error) || collectText(execution.logs && execution.logs.stderr);
      if (!firstError) break;
      if (attempt === MAX_AUTO_INSTALLS) break;
      const moduleName = missingModule(firstError);
      const packageName = packageForModule(moduleName);
      if (!packageName || attemptedPackages.has(packageName.toLowerCase())) break;
      // Avoid repeatedly installing packages that are not available or cannot build here.
      attemptedPackages.add(packageName.toLowerCase());
      await installPackage(sandbox, packageName);
      installedPackages.push(packageName);
    }

    const logs = execution.logs || {};
    const output = [collectText(logs.stdout), execution.text || ""].filter(Boolean).join("\n");
    const stderr = collectText(logs.stderr);
    const error = normalizeError(execution.error) || stderr;
    const results = serializeResults(execution);
    const success = !execution.error && !stderr;
    return res.status(200).json({
      success,
      status: success ? "success" : "error",
      compiler: "python",
      output,
      stdout: output,
      stderr,
      error,
      results,
      installedPackages,
      packageInstallNote: installedPackages.length ? "Some missing Python packages were installed in this temporary sandbox. They are not cached for the next run." : "",
      time: Number(((Date.now() - started) / 1000).toFixed(2))
    });
  } catch (err) {
    console.error("E2B Python execution failed:", err);
    return res.status(502).json({
      success: false,
      status: "error",
      error: err && err.message ? err.message : "Python execution request failed"
    });
  } finally {
    if (sandbox && typeof sandbox.kill === "function") {
      try { await sandbox.kill(); } catch (cleanupError) { console.warn("E2B sandbox cleanup failed:", cleanupError); }
    }
  }
}
