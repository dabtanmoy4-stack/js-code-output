# JS CODE OUTPUT — Universal Runner Bundle

This bundle combines:
- **Python execution in an E2B cloud sandbox** via `/api/run-code`.
- **HTML/CSS/browser JavaScript preview** inside a sandboxed iframe. Browser-based WebGL/Three.js examples can run there when the browser has internet access.
- E2B result rendering for supported text, HTML, PNG/JPEG, SVG, and chart outputs.
- Line-based `input()` values from the existing Input panel. Provide one answer per line.
- Best-effort Python dependency support: common missing imports may be installed automatically and code retried (up to 2 auto-install attempts).
- Optional package header, near the top of the file: `# pip: numpy, scipy, pillow` (up to 3 package names per run).

## Deploy to Vercel

1. Upload the contents of this folder to your GitHub repository (the `public/py_runner_boost.html` file may need to be moved/renamed to match your existing route).
2. Keep `api/run-code.js` at the repository root's `api/` directory so the endpoint is `/api/run-code`.
3. In Vercel → Project → Settings → Environment Variables, add `E2B_API_KEY` with your E2B secret. Add it for the environments you deploy, then redeploy. Never put the key in HTML or GitHub.
4. Ensure the Vercel project uses Node.js 24 and install dependencies from `package.json`.
5. Open the deployed runner and test `print("Hello")`, a Matplotlib plot, and the `examples/threejs-demo.html` browser demo.

## What is supported

- `.py`: runs on E2B's Python code-interpreter runtime. It can return text and supported rich outputs (such as HTML or images). The backend can install declared packages and make a limited best-effort attempt to install a missing import.
- `.html`, `.css`, `.js`: runs as browser preview in an iframe. JavaScript here means browser-side JavaScript, not arbitrary Node.js projects. External libraries such as Three.js need network access or locally bundled assets.
- Common `turtle` commands covered by the original local compatibility renderer continue to use that renderer. It is a limited subset, not the full `turtle` package.

## Important limitations

No single runner can execute literally every programming language, every system package, every desktop GUI, Blender, every GPU feature, and every interactive 3D engine. Python packages requiring system libraries, a real display, a GPU, long-running processes, or unsupported native dependencies may not work in the standard E2B code-interpreter image. HTML/JS 3D rendering is usually the best browser route for interactive 3D. Python can generate HTML/JS or image output, but that does not make all Python GUI applications browser-compatible.

This bundle has not been deployed to your Vercel project from here. You must add the environment variable and deploy it in your account. E2B usage is subject to its current plan, quotas, and billing.

## Public-launch security note

The included API route validates request sizes but does not yet verify a signed-in Firebase user or enforce a persistent per-user quota. Do not treat it as production-cost-protected for a public launch: add Firebase ID-token verification and persistent rate limiting/usage limits before sharing it widely, otherwise visitors may consume your E2B quota. Keep `E2B_API_KEY` only in Vercel server-side environment variables.
