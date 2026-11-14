const { Sandbox } = require('e2b');

const MAX_CODE = 300_000;
const MAX_OUTPUT = 200_000;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const INSTALL_TIMEOUT_MS = 4 * 60 * 1000;

function clampText(value, max = MAX_OUTPUT) {
  const s = String(value ?? '');
  return s.length > max ? s.slice(0, max) + `\n… output truncated after ${max} characters …` : s;
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function detectPackages(code) {
  const packages = new Set();
  const add = (name) => packages.add(name);

  const imports = [...String(code).matchAll(/^\s*(?:import|from)\s+([A-Za-z_][A-Za-z0-9_.-]*)/gm)];
  for (const m of imports) {
    const top = m[1].split('.')[0];
    const map = {
      PIL: 'pillow', cv2: 'opencv-python-headless', numpy: 'numpy', pandas: 'pandas',
      scipy: 'scipy', matplotlib: 'matplotlib', seaborn: 'seaborn', sympy: 'sympy',
      sklearn: 'scikit-learn', requests: 'requests', flask: 'flask', fastapi: 'fastapi',
      uvicorn: 'uvicorn', pygame: 'pygame', vpython: 'vpython', pyxel: 'pyxel',
      imageio: 'imageio', plotly: 'plotly', bs4: 'beautifulsoup4', yaml: 'pyyaml',
      lxml: 'lxml', openpyxl: 'openpyxl'
    };
    if (map[top]) add(map[top]);
  }

  // Packages that are especially common in the JS Code Output runner.
  if (/\bfrom\s+PIL\b|\bimport\s+PIL\b/.test(code)) add('pillow');
  if (/\bimport\s+cv2\b/.test(code)) add('opencv-python-headless');
  if (/\bimport\s+sklearn\b/.test(code)) add('scikit-learn');
  if (/\bimport\s+bs4\b/.test(code)) add('beautifulsoup4');

  return [...packages];
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function makePrelude() {
  return String.raw`
import os as _jsco_os
import io as _jsco_io
import base64 as _jsco_b64
import json as _jsco_json

_JSCO_OUT = _jsco_os.environ.get('JSCO_OUTPUT_DIR', '/home/user/jsco_output')
_jsco_os.makedirs(_JSCO_OUT, exist_ok=True)

def _jsco_emit_image(path, mime='image/png'):
    try:
        with open(path, 'rb') as _f:
            _b = _f.read()
        print('IMAGE_BASE64_START' + _jsco_b64.b64encode(_b).decode() + 'IMAGE_BASE64_END', flush=True)
    except Exception as _e:
        print('[JSCO image error] ' + str(_e), flush=True)

def _jsco_save_image(obj, name='output.png'):
    path = _jsco_os.path.join(_JSCO_OUT, name)
    try:
        obj.save(path)
        return path
    except Exception:
        return None

# Matplotlib: use a non-interactive backend and automatically export figures.
try:
    import matplotlib as _jsco_mpl
    _jsco_mpl.use('Agg')
    import matplotlib.pyplot as _jsco_plt
    _jsco_old_show = _jsco_plt.show
    def _jsco_show(*args, **kwargs):
        nums = list(_jsco_plt.get_fignums())
        for _i, _n in enumerate(nums):
            _f = _jsco_plt.figure(_n)
            _p = _jsco_os.path.join(_JSCO_OUT, f'plot_{_i+1}.png')
            _f.savefig(_p, dpi=120, bbox_inches='tight')
            _jsco_emit_image(_p)
        _jsco_old_show(*args, **kwargs)
    _jsco_plt.show = _jsco_show
    import atexit as _jsco_atexit
    def _jsco_flush_plots():
        try:
            nums = list(_jsco_plt.get_fignums())
            for _i, _n in enumerate(nums):
                _f = _jsco_plt.figure(_n)
                _p = _jsco_os.path.join(_JSCO_OUT, f'plot_exit_{_i+1}.png')
                _f.savefig(_p, dpi=120, bbox_inches='tight')
                _jsco_emit_image(_p)
        except Exception:
            pass
    _jsco_atexit.register(_jsco_flush_plots)
except Exception:
    pass

# Pillow: Image.show() becomes a file/image result instead of opening a desktop window.
try:
    from PIL import Image as _JSCO_Image
    def _jsco_pil_show(self, *args, **kwargs):
        _name = 'pil_output.png'
        _path = _jsco_os.path.join(_JSCO_OUT, _name)
        _im = self
        if _im.mode not in ('RGB', 'RGBA', 'L'):
            _im = _im.convert('RGBA')
        _im.save(_path)
        _jsco_emit_image(_path)
    _JSCO_Image.Image.show = _jsco_pil_show
except Exception:
    pass
`;
}

function makeCaptureWrapper(code) {
  const prelude = makePrelude();
  // The user program is intentionally left almost untouched. This wrapper only
  // gives graphics/data libraries a predictable headless output directory.
  return `${prelude}\n# --- JS CODE OUTPUT USER PROGRAM ---\n${code}\n# --- END USER PROGRAM ---\n`;
}

function buildFiles(files) {
  return files.map(f => ({
    name: f.name,
    mime: f.mime,
    content_base64: f.content_base64
  }));
}

async function main(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { success: false, error: 'POST only.' });
  }

  if (!process.env.E2B_API_KEY) {
    return json(res, 500, {
      success: false,
      error: 'E2B_API_KEY is not configured on the server.'
    });
  }

  const body = req.body || {};
  const compiler = String(body.compiler || 'python').toLowerCase();
  const code = String(body.code || '');
  const input = String(body.input || '');

  if (compiler !== 'python') {
    return json(res, 400, { success: false, error: `Unsupported compiler: ${compiler}` });
  }
  if (!code.trim()) {
    return json(res, 400, { success: false, error: 'Python code is empty.' });
  }
  if (code.length > MAX_CODE) {
    return json(res, 413, { success: false, error: `Code is too large. Maximum is ${MAX_CODE} characters.` });
  }

  let sandbox;
  const started = Date.now();

  try {
    // E2B provides an isolated Linux microVM per sandbox session. The API key
    // remains server-side in Vercel and is never sent to the browser.
    sandbox = await Sandbox.create({ timeoutMs: RUN_TIMEOUT_MS });

    await sandbox.files.write('/home/user/main.py', makeCaptureWrapper(code));
    await sandbox.files.write('/home/user/input.txt', input);

    const packages = detectPackages(code);
    let installedPackages = [];
    let packageInstallNote = '';

    if (packages.length) {
      const install = await sandbox.commands.run(
        `python3 -m pip install --disable-pip-version-check --no-input --quiet ${packages.map(shellQuote).join(' ')}`,
        { timeoutMs: INSTALL_TIMEOUT_MS }
      );
      if (install.exitCode !== 0) {
        const installErr = clampText(install.stderr || install.stdout || 'Package installation failed.');
        // Some environments already contain a package even if pip returned a warning.
        // Verify imports below through the actual program run; don't hide the real error.
        packageInstallNote = `Package setup warning:\n${installErr}`;
      } else {
        installedPackages = packages;
      }
    }

    const run = await sandbox.commands.run(
      `cd /home/user && PYTHONUNBUFFERED=1 MPLBACKEND=Agg SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy timeout --signal=TERM --kill-after=5s 600s python3 main.py < input.txt`,
      { timeoutMs: RUN_TIMEOUT_MS + 15_000 }
    );

    const stdout = clampText(run.stdout);
    const stderr = clampText(run.stderr);
    const outputFiles = [];

    // Read image/artifact files generated by the Python program. This keeps the
    // existing frontend's file preview contract: {name,mime,content_base64}.
    const list = await sandbox.commands.run(
      `find /home/user/jsco_output -maxdepth 1 -type f -size -${MAX_FILE_BYTES}c -printf '%f\\n' 2>/dev/null | sort`,
      { timeoutMs: 10_000 }
    );

    const names = unique(String(list.stdout || '').split(/\r?\n/).map(s => s.trim()));
    for (const name of names.slice(0, 20)) {
      if (!/^[A-Za-z0-9._-]+$/.test(name)) continue;
      const mime = mimeFor(name);
      if (!mime) continue;
      const b64 = await sandbox.commands.run(`base64 -w0 ${shellQuote('/home/user/jsco_output/' + name)}`, { timeoutMs: 10_000 });
      if (b64.exitCode === 0 && b64.stdout) {
        outputFiles.push({ name, mime, content_base64: String(b64.stdout).trim() });
      }
    }

    const executionTime = ((Date.now() - started) / 1000).toFixed(2);
    const combined = [stdout, stderr].filter(Boolean).join('\n');
    const hasImageMarkers = /IMAGE_BASE64_START[\s\S]*?IMAGE_BASE64_END/.test(combined);

    return json(res, 200, {
      success: run.exitCode === 0,
      status: run.exitCode === 0 ? 'success' : 'error',
      compiler: 'python',
      output: stdout,
      stdout,
      stderr,
      error: stderr,
      exit_code: run.exitCode,
      time: executionTime,
      installedPackages,
      packageInstallNote,
      files: buildFiles(outputFiles),
      // The frontend already knows how to render IMAGE_BASE64 markers. We leave
      // them in stdout so PIL/matplotlib output can appear immediately as well.
      has_image_output: hasImageMarkers || outputFiles.length > 0
    });
  } catch (err) {
    const message = clampText(err && (err.message || err.error || err.toString()) || 'E2B execution failed.');
    return json(res, 500, {
      success: false,
      status: 'error',
      error: message,
      stderr: message,
      output: '',
      exit_code: null,
      time: ((Date.now() - started) / 1000).toFixed(2)
    });
  } finally {
    if (sandbox) {
      try { await sandbox.kill(); } catch (_) {}
    }
  }
}

function mimeFor(name) {
  const ext = String(name).toLowerCase().split('.').pop();
  return ({
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain',
    json: 'application/json', html: 'text/html', htm: 'text/html'
  })[ext] || null;
}

module.exports = main;
