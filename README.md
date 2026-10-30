# JS Python Runner BOOST — Pyodide + Three.js

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

- `py_runner_boost.html` — updated Runner page.
- `api/run-code.js` — existing OnlineCompiler backend route for ordinary Python execution.
- `package.json`, `vercel.json`, `.env.example` — existing Vercel deployment files.
- `examples/python-threejs-auto.py` — simple five-color sphere test.
- `examples/threejs-solar-system.py` — 3D solar-system test.

## Deploy

1. Back up the existing Runner page.
2. Replace it with `py_runner_boost.html` from this folder.
3. Keep/copy `api/run-code.js`, `package.json` and `vercel.json` into the same Vercel project.
4. Keep `ONLINECOMPILER_API_KEY` configured for ordinary Python code that uses the existing OnlineCompiler route. No Three.js API key is required.
5. Redeploy.
6. Run `examples/python-threejs-auto.py`, then `examples/threejs-solar-system.py`.

## Runtime notes

Three.js is loaded from jsDelivr and requires internet/CDN access. The browser/device must support WebGL. The runtime fixes the common Pyodide dictionary-to-JavaScript options issue, but it cannot prevent errors in user-written Python/Three.js code or guarantee that every third-party Three.js add-on works.
