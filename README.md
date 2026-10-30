# JS CODE OUTPUT – Multi Visual Runtime

This bundle updates `py_runner_boost.html` while retaining the existing Vercel OnlineCompiler API route.

## Automatic Run behaviour

Users do not need to choose a graphics engine manually. Press **Run Code**:

- `.py` normal Python: runs through the existing `/api/run-code` OnlineCompiler endpoint.
- Python Turtle subset: uses the existing browser Canvas compatibility renderer.
- Python that references `js.THREE` / Three.js: runs in an isolated Pyodide iframe with Three.js loaded.
- Python that references Babylon.js: runs in an isolated Pyodide iframe with Babylon.js loaded.
- Python that references Plotly: loads Plotly.js and attempts to install the pure-Python Plotly package in Pyodide; `fig.show()` is bridged to the visual preview.
- Python that imports VPython: attempts to install VPython through Pyodide `micropip`. This is experimental; VPython has native/runtime dependencies and may not be installable in Pyodide. If the package install fails, the real package error is shown rather than a fake preview.
- `.js`, `.html`, `.css`: run in the browser preview. Three.js, Babylon.js and Plotly browser libraries are loaded on demand when detected in the source.

Python visual projects run in a sandboxed iframe so code that clears or edits `document.body` does not destroy the Runner UI. Python visual output, stdout and errors are reported back to the main Runner.

## Required Vercel environment variable

Set `ONLINECOMPILER_API_KEY` in Vercel Project Settings → Environment Variables for ordinary Python files that use the OnlineCompiler API. Redeploy after changing environment variables.

## Deploy

1. Copy `py_runner_boost.html` into the website root, replacing the old Runner page after keeping a backup.
2. Copy `api/run-code.js` into the project's `api/` folder.
3. Keep `package.json` and `vercel.json` from this bundle.
4. Confirm `ONLINECOMPILER_API_KEY` is configured in Vercel.
5. Deploy and test a normal `.py`, a Three.js `.js`, and a Python `js.THREE` visual example.

## Important limitations

- External visual libraries are loaded from public CDNs, so the user needs internet access and the CDN must be reachable.
- Pyodide is a browser Python runtime, not a full desktop Python installation. Packages requiring native system libraries, GUI windows, or unsupported wheels may not work.
- VPython is best-effort/experimental in this build. A full VPython compatibility guarantee is not possible with Pyodide alone.
- The Runner detects the runtime/library and reports runtime errors. It does not silently rewrite arbitrary user code or guarantee automatic repair of programming mistakes.
- WebGL availability and device performance affect 3D rendering.
