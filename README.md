# JS CODE OUTPUT — Universal Python + Browser 3D Runtime bundle

This is a best-effort universal runner bundle for your Vercel project. Files are at the repository root (no `public/` folder).

## Included
- `py_runner_boost.html` — existing runner UI.
- `api/run-code.js` — E2B Python endpoint with import-to-PyPI mapping, explicit package hints, expanded import-to-PyPI mapping, explicit package hints, up to five missing-package retries, and `input()` support.
- `examples/` — sample Python, browser 3D bridge, and desktop-only Ursina code.
- `api/ursina-runtime.js` — optional authenticated proxy to a separately deployed graphics-enabled Ursina service.
- `HYBRID-3D-ARCHITECTURE.md` — setup, boundaries, security requirements, and test plan.
- `package.json` — Node.js dependencies for the API only.
- `vercel.json`, `.env.example`, and deployment notes.

## Deploy
1. Extract this ZIP and upload **the contents** to your GitHub repository root.
2. In Vercel, add the server-side environment variable `E2B_API_KEY`. Never place the key in HTML or commit it to GitHub.
3. Deploy with Node.js 24 and ensure the route `/api/run-code` is present.
4. Open `py_runner_boost.html` and test `print('Hello')`, NumPy/Matplotlib, then `examples/jsco3d_animation.py` for browser-rendered 3D.
5. Run `npm run check` locally to syntax-check the API files.
6. Ursina code is routed to `/api/ursina-runtime`. It will clearly report that the service is not configured until you deploy a separate trusted graphics-enabled runtime and set `URSINA_RUNTIME_URL` (and optionally `URSINA_RUNTIME_TOKEN`) in Vercel.

## Python packages
The backend tries to install some missing imports during a run (best effort). You may declare up to five packages in the first lines of a Python file, for example:

```python
# pip: numpy, scipy, matplotlib, plotly, pillow
import numpy as np
import matplotlib.pyplot as plt
print(np.arange(5))
```

Package installs happen inside a temporary E2B sandbox and **do not persist** into the next run. Heavy packages can take a long time, fail to build, need system libraries, or exceed the execution provider's limits. Installing a package is not the same as supporting its GUI/window system.

## What can and cannot run
- Standard Python and many pure-Python/data packages: usually supported, subject to E2B's runtime and limits.
- NumPy, SciPy, Matplotlib, Pillow, pandas, SymPy, Plotly, and similar: may work after installation; first run can be slower.
- Ursina/Panda3D/Pygame/Arcade/Manim/OpenCV/Torch/TensorFlow: best effort only. These may require OS libraries, display servers, GPU access, long install time, or more RAM than a temporary cloud sandbox provides. A successful import does **not** mean a desktop window or real-time game will appear in the browser.
- `tkinter`, `bpy`/Blender, arbitrary desktop GUI apps, OS-level commands, GPU-specific code, and every possible third-party package cannot be guaranteed in this cloud runner.
- For browser-rendered 3D from Python, this bundle includes a small `jsco3d` bridge (`from jsco3d import Scene`) for cubes, spheres, toruses, cones, cylinders and planes. It renders in the Output panel with Three.js. It is not full Ursina/Panda3D API compatibility.
- For actual Ursina/Panda3D code, the new proxy route expects a separately deployed graphics-enabled service. This ZIP does not itself provision that external runtime; see `HYBRID-3D-ARCHITECTURE.md` before configuring it.

## Important: no ZIP can make literally everything work
A Node `package.json` installs JavaScript dependencies; it cannot preinstall Python packages into E2B. Persistent preinstalled Python libraries require a custom E2B template/image built separately and configured in the API. This bundle does not create that cloud template or change your E2B/Vercel account settings.

## Before public launch
The API route does not by itself enforce Firebase sign-in or durable per-user usage quotas. Add authentication, rate limiting, and spend controls before opening it to public users. Keep `E2B_API_KEY` only in Vercel server-side environment variables.


## Important limits and what you must add for broader support

This bundle improves package auto-install, but cannot guarantee literally every Python program. To get closer to broad compatibility:

1. Keep the E2B API key in Vercel Environment Variables.
2. Test on your actual Vercel plan: the function currently has a 60-second cap, so slow installs can time out. Do not increase it unless your Vercel plan supports the higher duration.
3. For frequently used heavy libraries, build an E2B custom template with those dependencies preinstalled and configure the API to use its template ID; this requires an E2B template build and account setup outside this ZIP.
4. For desktop GUI, GPU/CUDA, Blender, native system tools, or game windows, provision a separate container/VM with OS-level dependencies. These cannot be enabled by `package.json` alone.
5. For 3D that must appear in the browser preview, use HTML/JS/WebGL (Three.js).
6. Add authentication, per-user quotas, rate limiting, and spending limits before public launch.

`npm run check` validates JavaScript syntax only; it does not test a live E2B sandbox or install every Python library.

## Responsive Python Terminal (added)
- The runner now includes a Terminal tab styled for desktop and mobile, with command history, clear, `help`, `python main.py`, and `pip install <package>`.
- `python main.py` runs the currently selected Python editor file through the existing `/api/run-code` E2B endpoint.
- `pip install <package>` adds/updates a `# pip:` dependency hint at the top of the active Python file and executes it so the backend installs that dependency in the same temporary sandbox.
- This is a safe Python-runner terminal, **not an unrestricted Linux shell**. Commands such as `ls`, `cd`, arbitrary shell scripts, persistent shell sessions, and real-time interactive stdin are not implemented by this UI/API contract. The existing Input panel remains the supported way to provide `input()` data.
- Packages are installed in a temporary sandbox per execution; they do not persist across runs. A successful import does not guarantee desktop GUI, GPU, or native window support.
