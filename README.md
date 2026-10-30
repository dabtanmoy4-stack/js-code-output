# JS CODE OUTPUT – Multi Visual Runtime

This bundle updates `py_runner_boost.html` and retains the existing Vercel OnlineCompiler API route, project structure, and API key configuration.

## Automatic Run behaviour

Press **Run Code**; the Runner detects the file type and graphics library.

| Code / library | Execution path | Support level |
|---|---|---|
| Ordinary `.py` | Existing `/api/run-code` → OnlineCompiler | Depends on OnlineCompiler's Python compiler and installed packages |
| Python + Three.js (`from js import THREE`) | Pyodide in an isolated browser preview | Supported for browser-compatible Three.js APIs |
| Python + Babylon.js (`from js import BABYLON`) | Pyodide in an isolated browser preview | Supported for browser-compatible Babylon.js APIs; use the provided `renderCanvas` element |
| Python + Plotly (`plotly.express`, `graph_objects`) | Pyodide + `micropip` Plotly install + `fig.show()` bridge | Supported when Plotly and its pure-Python dependencies install successfully |
| Python VPython (`from vpython import ...`) | Best-effort package install in Pyodide | Experimental only; not full VPython compatibility |
| Python Turtle | Built-in browser Canvas compatibility renderer | Limited subset only; not the complete Tkinter turtle module |
| `.js`, `.html`, `.css` | Browser preview; Three.js/Babylon.js/Plotly loaded on demand | Supported subject to browser/CDN/WebGL support |

## Visual runtime fixes in this build

- The isolated Pyodide visual iframe always contains an `#output` element before user Python runs. Code using `document.getElementById("output").innerHTML = ""` will no longer fail because the element is missing.
- A `#renderCanvas` canvas is provided for Python Babylon.js projects.
- Three.js uses the classic global `THREE` build (`0.159.0`) so `from js import THREE` works with this global-script integration.
- The Three.js renderer and perspective camera are resized as the preview area changes, including output-panel fullscreen changes.
- Plotly `fig.show()` is bridged to a responsive Plotly.js preview inside the visual output area.
- Visual code runs in an isolated iframe, so clearing `document.body` or `#output` cannot erase the main Runner interface.
- Standard output and Python errors are sent back to the Runner console.

## Required Vercel environment variable

Set `ONLINECOMPILER_API_KEY` in Vercel Project Settings → Environment Variables for ordinary Python files that use the OnlineCompiler API. Keep the key server-side. Redeploy after changing environment variables.

## Deploy

1. Copy `py_runner_boost.html` to the website root, replacing the old Runner page after keeping a backup.
2. Copy `api/run-code.js` into the project's `api/` folder.
3. Keep `package.json` and `vercel.json` from this bundle.
4. Confirm `ONLINECOMPILER_API_KEY` is configured in Vercel.
5. Deploy and test the included Three.js, Babylon.js, and Plotly examples.

## Important limitations

- No browser runner can guarantee that arbitrary user code runs without errors. Syntax errors, missing variables, unsupported APIs, WebGL failures, package installation failures, and CDN/network failures can still produce errors.
- Pyodide is Python compiled to WebAssembly, not a full desktop Python installation. Packages requiring native extensions, OS libraries, GUI windows, subprocesses, or unsupported wheels may not work.
- **VPython is not fully supported in this bundle.** The upstream VPython package depends on browser/Jupyter/GlowScript runtime pieces that are not reliably available in Pyodide. Its install is best-effort and a `from vpython import ...` project may fail. Do not treat VPython as production-ready without testing the exact project in the deployed Vercel environment.
- Python Turtle support is a small compatibility renderer; it does not provide Tkinter or every feature of the desktop `turtle` module.
- Three.js and Babylon.js require WebGL and a modern browser. Rendering speed depends on the user's GPU/device.
- Visual libraries are loaded from public CDNs, so internet access and CDN availability are required.
- Ordinary Python uses OnlineCompiler and therefore requires a valid Vercel `ONLINECOMPILER_API_KEY` and the upstream service to be available.
- The Runner does not silently rewrite arbitrary user code or hide genuine programming errors.
