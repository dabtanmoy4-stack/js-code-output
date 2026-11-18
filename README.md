# JS CODE OUTPUT — Python Runner BOOST + JS C Runner

This README documents two separate runners in the same website/repository. Keep their HTML pages and backend routes separate; neither runner replaces the other.

---

# 1. JS Python Runner BOOST — Pyodide + Three.js

This focused build prioritizes one browser graphics stack: **Pyodide + Three.js**. Other Python graphics engines (Babylon.js, Plotly, VPython, Turtle) are intentionally not enabled in this build.

## What this build supports

- Run Python code in the browser with Pyodide 0.27.7.
- Use Three.js from Python with `from js import THREE, document, window`.
- Create 3D scenes, meshes, materials, lights, cameras, textures, particles and animations supported by Three.js/WebGL.
- Automatically convert Python dictionary literals passed to Three.js `.new({...})` constructors into JavaScript option objects. This is important for material colors and renderer settings.
- Automatically create the preview `#output` element if it is missing.
- Resize the renderer and PerspectiveCamera when the preview changes size, including fullscreen.
- Keep the visual runtime inside an isolated iframe so clearing `document.body` or `#output` does not erase the main IDE.
- Keep the existing OnlineCompiler API route for ordinary Python files that are not Three.js visual programs.

## Not enabled in this build

- VPython, Babylon.js, Plotly, Python Turtle and desktop GUI libraries are not part of this focused graphics runtime. The Runner displays a clear unsupported-engine message for these Python graphics imports rather than pretending they are supported.
- Tkinter, Pygame desktop windows, Ursina and other native desktop graphics frameworks cannot run as desktop apps inside a browser Pyodide iframe.
- Packages requiring unsupported native binaries, OS libraries or desktop display servers may not install or run in Pyodide.

## Files

- `py_runner_boost.html` — updated Python Runner page.
- `api/run-code.js` — existing OnlineCompiler backend route for ordinary Python execution.
- `package.json`, `vercel.json`, `.env.example` — existing Vercel deployment files.
- `examples/python-threejs-auto.py` — simple five-color sphere test.
- `examples/threejs-solar-system.py` — 3D solar-system test.

These are the Python build's documented files; they are not all included in the separate JS C Runner ZIP.

## Deploy Python Runner

1. Back up the existing Python Runner page.
2. Replace it with `py_runner_boost.html` from the Python build folder.
3. Keep/copy `api/run-code.js`, `package.json` and `vercel.json` into the same Vercel project.
4. Keep `ONLINECOMPILER_API_KEY` configured for ordinary Python code that uses the existing OnlineCompiler route. No Three.js API key is required.
5. Redeploy.
6. Run `examples/python-threejs-auto.py`, then `examples/threejs-solar-system.py`.

## Python runtime notes

Three.js is loaded from jsDelivr and requires internet/CDN access. The browser/device must support WebGL. The runtime fixes the common Pyodide dictionary-to-JavaScript options issue, but it cannot prevent errors in user-written Python/Three.js code or guarantee that every third-party Three.js add-on works.

---

# 2. JS C Runner — Modal integration starter

The existing dark/light UI, editor, explorer, Firebase logic and other controls are preserved. New: console vs Emscripten/SDL2 graphical mode, graphics iframe, Vercel proxy and Modal compiler backend.

## C Runner files

- `js_c_runner.html` — existing C IDE frontend with runner integration.
- `api/c-run.js` — Vercel proxy to the Modal C backend.
- `modal_backend/app.py` — Modal backend application and compiler setup.
- `examples/hello.c` — console test.
- `examples/sdl2_demo.c` — SDL2 browser graphics test.

## Deploy C Runner later

1. Install Modal CLI and authenticate (existing token can be reused).
2. Create a strong random shared secret. Create Modal secret `js-c-runner-auth` with environment variable `RUNNER_SHARED_SECRET` set to it.
3. From `modal_backend/`, deploy with `modal deploy app.py`. The resulting ASGI URL is the **base URL** (not `/run`).
4. Set Vercel env vars `MODAL_C_RUNNER_URL` to that base URL and `C_RUNNER_SHARED_SECRET` to the same secret. Redeploy Vercel.
5. Upload `js_c_runner.html` as the runner page, and `api/c-run.js` under the repo `api/` folder. Ensure `logo.jpeg` exists alongside the HTML.
6. Test `examples/hello.c` in Console mode and `examples/sdl2_demo.c` in WebAssembly / SDL2 Graphics mode.

## Important C scope / security

- This is an integration **starter**, not a production-secure arbitrary-code execution service. **Do not expose publicly** until Firebase ID-token verification at the Vercel proxy, per-user quotas, concurrency controls, output limits and stronger isolation are implemented. Modal function/container isolation is not equivalent to a hardened per-submission microVM. The example executes untrusted binaries inside a Modal function; assess this risk before deployment.
- Native OpenGL window streaming, GPU-accelerated desktop games, SDL3, webcam, microphone, audio, Windows programs and interactive terminal stdin are **not implemented** in this ZIP. Emscripten SDL2 browser builds are implemented; WebGL projects need compatible build options and testing.
- The compiler uses only supported internal flags, ignoring user-supplied arbitrary flags for safety.
- The graphical iframe uses a sandbox; do not enable same-origin access. HTML output may depend on external resources and browser permissions.
- Text project files are supported; the original editor's import routine reads files as text, so binary textures/audio assets need a future binary-safe upload pipeline.
- Modal execution and compilation cost money. The service requires a Modal deployment and Vercel environment configuration before Run works.
- Some existing frontend functions use its original Judge0-style result interface, which is adapted here to the Modal response.

---

# 3. Running both on the same Vercel site

- Keep the **Python** route `api/run-code.js` and the **C** route `api/c-run.js` as separate files.
- Keep both runner HTML files with distinct names and links.
- Python ordinary-code backend needs `ONLINECOMPILER_API_KEY` as before.
- C backend needs `MODAL_C_RUNNER_URL` and `C_RUNNER_SHARED_SECRET`, plus the matching Modal secret.
- Do not overwrite an existing `package.json` or `vercel.json` blindly: merge any required settings with the current project configuration.
- Never commit API keys, shared secrets or Modal tokens to GitHub.
- Deploying Vercel does **not** deploy Modal automatically; deploy the Modal app separately first to obtain its URL.

This README combines the previously supplied Python documentation with the C integration starter documentation. It does not claim that unimplemented native graphics streaming is available.
