import { Sandbox } from "e2b";

const MAX_CODE = 300_000;
const MAX_OUTPUT = 200_000;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const INSTALL_TIMEOUT_MS = 4 * 60 * 1000;

function clampText(value, max = MAX_OUTPUT) {
  const s = String(value ?? "");
  return s.length > max
    ? s.slice(0, max) + `\n… output truncated after ${max} characters …`
    : s;
}

function json(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res.status(status).json(body);
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function mimeFor(name) {
  const ext = String(name).toLowerCase().split(".").pop();
  return ({
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    bmp: "image/bmp", pdf: "application/pdf", csv: "text/csv",
    txt: "text/plain", json: "application/json", html: "text/html",
    htm: "text/html"
  })[ext] || null;
}

function detectPackages(code) {
  const map = {
    PIL: "pillow",
    cv2: "opencv-python-headless",
    numpy: "numpy",
    pandas: "pandas",
    scipy: "scipy",
    matplotlib: "matplotlib",
    seaborn: "seaborn",
    sympy: "sympy",
    sklearn: "scikit-learn",
    requests: "requests",
    flask: "flask",
    fastapi: "fastapi",
    uvicorn: "uvicorn",
    pygame: "pygame",
    vpython: "vpython",
    pyxel: "pyxel",
    imageio: "imageio",
    plotly: "plotly",
    bs4: "beautifulsoup4",
    yaml: "pyyaml",
    lxml: "lxml",
    openpyxl: "openpyxl"
  };

  const packages = [];
  const imports = String(code).matchAll(
    /^\s*(?:import|from)\s+([A-Za-z_][A-Za-z0-9_.]*)/gm
  );

  for (const m of imports) {
    const top = m[1].split(".")[0];
    if (map[top]) packages.push(map[top]);
  }

  return unique(packages);
}

function makePrelude() {
  return String.raw`
import os as _jsco_os
import base64 as _jsco_b64

_JSCO_OUT = _jsco_os.environ.get("JSCO_OUTPUT_DIR", "/home/user/jsco_output")
_jsco_os.makedirs(_JSCO_OUT, exist_ok=True)

def _jsco_emit_image(path):
    try:
        with open(path, "rb") as _f:
            _b = _f.read()
        print(
            "IMAGE_BASE64_START" +
            _jsco_b64.b64encode(_b).decode() +
            "IMAGE_BASE64_END",
            flush=True
        )
    except Exception as _e:
        print("[JSCO image error] " + str(_e), flush=True)

# Matplotlib: headless mode + automatic image export.
try:
    import matplotlib as _jsco_mpl
    _jsco_mpl.use("Agg")
    import matplotlib.pyplot as _jsco_plt

    _jsco_old_show = _jsco_plt.show

    def _jsco_show(*args, **kwargs):
        for _i, _n in enumerate(list(_jsco_plt.get_fignums())):
            try:
                _f = _jsco_plt.figure(_n)
                _p = _jsco_os.path.join(_JSCO_OUT, f"plot_{_i + 1}.png")
                _f.savefig(_p, dpi=120, bbox_inches="tight")
                _jsco_emit_image(_p)
            except Exception:
                pass
        _jsco_old_show(*args, **kwargs)

    _jsco_plt.show = _jsco_show

    import atexit as _jsco_atexit

    def _jsco_flush_plots():
        try:
            for _i, _n in enumerate(list(_jsco_plt.get_fignums())):
                _f = _jsco_plt.figure(_n)
                _p = _jsco_os.path.join(_JSCO_OUT, f"plot_exit_{_i + 1}.png")
                _f.savefig(_p, dpi=120, bbox_inches="tight")
                _jsco_emit_image(_p)
        except Exception:
            pass

    _jsco_atexit.register(_jsco_flush_plots)
except Exception:
    pass

# Pillow: Image.show() becomes a browser-previewable output.
try:
    from PIL import Image as _JSCO_Image

    def _jsco_pil_show(self, *args, **kwargs):
        _path = _jsco_os.path.join(_JSCO_OUT, "pil_output.png")
        _im = self
        if _im.mode not in ("RGB", "RGBA", "L"):
            _im = _im.convert("RGBA")
        _im.save(_path)
        _jsco_emit_image(_path)

    _JSCO_Image.Image.show = _jsco_pil_show
except Exception:
    pass
`;
}

function wrapPython(code) {
  return `${makePrelude()}\n# --- JS CODE OUTPUT USER PROGRAM ---\n${code}\n# --- END USER PROGRAM ---\n`;
}

async function main(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method !== "POST") {
    return json(res, 405, { success: false, error: "POST only." });
  }

  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    return json(res, 500, {
      success: false,
      error: "E2B_API_KEY is not configured in Vercel Environment Variables."
    });
  }

  const body = req.body || {};
  const compiler = String(body.compiler || "python").toLowerCase();
  const code = String(body.code || "");
  const input = String(body.input || "");

  if (!["python", "python3", "py"].includes(compiler)) {
    return json(res, 400, {
      success: false,
      error: `Unsupported compiler: ${compiler}`
    });
  }

  if (!code.trim()) {
    return json(res, 400, { success: false, error: "Python code is empty." });
  }

  if (code.length > MAX_CODE) {
    return json(res, 413, {
      success: false,
      error: `Code is too large. Maximum is ${MAX_CODE} characters.`
    });
  }

  let sandbox = null;
  const started = Date.now();

  try {
    sandbox = await Sandbox.create({
      apiKey,
      template: "base",
      timeoutMs: RUN_TIMEOUT_MS
    });

    await sandbox.files.write("/home/user/main.py", wrapPython(code));
    await sandbox.files.write("/home/user/input.txt", input);
    await sandbox.commands.run("mkdir -p /home/user/jsco_output", { timeoutMs: 10000 });

    const packages = detectPackages(code);
    let installedPackages = [];
    let packageInstallNote = "";

    if (packages.length) {
      const install = await sandbox.commands.run(
        `python3 -m pip install --disable-pip-version-check --no-input --quiet ${packages.map(shellQuote).join(" ")}`,
        { timeoutMs: INSTALL_TIMEOUT_MS }
      );

      if (install.exitCode === 0) {
        installedPackages = packages;
      } else {
        packageInstallNote = `Package setup warning:\n${clampText(install.stderr || install.stdout || "Package installation failed.")}`;
      }
    }

    const run = await sandbox.commands.run(
      "cd /home/user && PYTHONUNBUFFERED=1 MPLBACKEND=Agg SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy timeout --signal=TERM --kill-after=5s 600s python3 main.py < input.txt",
      { timeoutMs: RUN_TIMEOUT_MS + 15000 }
    );

    const stdout = clampText(run.stdout);
    const stderr = clampText(run.stderr);
    const outputFiles = [];

    const list = await sandbox.commands.run(
      `find /home/user/jsco_output -maxdepth 1 -type f -size -${MAX_FILE_BYTES}c -printf '%f\\n' 2>/dev/null | sort`,
      { timeoutMs: 10000 }
    );

    const names = unique(
      String(list.stdout || "")
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean)
    );

    for (const name of names.slice(0, 20)) {
      if (!/^[A-Za-z0-9._-]+$/.test(name)) continue;
      const mime = mimeFor(name);
      if (!mime) continue;

      const b64 = await sandbox.commands.run(
        `base64 -w0 ${shellQuote("/home/user/jsco_output/" + name)}`,
        { timeoutMs: 10000 }
      );

      if (b64.exitCode === 0 && b64.stdout) {
        outputFiles.push({
          name,
          mime,
          content_base64: String(b64.stdout).trim()
        });
      }
    }

    const time = ((Date.now() - started) / 1000).toFixed(2);
    const success = run.exitCode === 0;

    return json(res, 200, {
      success,
      status: success ? "success" : "error",
      compiler: "python",
      output: stdout,
      stdout,
      stderr,
      error: success ? "" : stderr,
      exit_code: run.exitCode,
      time,
      installedPackages,
      packageInstallNote,
      files: outputFiles,
      has_image_output:
        outputFiles.length > 0 || /IMAGE_BASE64_START[\s\S]*?IMAGE_BASE64_END/.test(stdout)
    });
  } catch (err) {
    const message = clampText(
      err?.message || err?.error || err?.toString() || "E2B execution failed."
    );

    return json(res, 500, {
      success: false,
      status: "error",
      error: message,
      stderr: message,
      output: "",
      stdout: "",
      exit_code: null,
      time: ((Date.now() - started) / 1000).toFixed(2)
    });
  } finally {
    if (sandbox) {
      try { await sandbox.kill(); } catch (_) {}
    }
  }
}

export default main;
