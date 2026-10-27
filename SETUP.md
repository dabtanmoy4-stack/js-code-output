# JS Python Runner BOOST — IG / OG modes

## What changed
- Pressing **Run Code** (or Ctrl/Cmd+Enter) opens two runtime cards.
- **Boost IG** calls your existing `/api/run-code` endpoint; its behavior is preserved.
- **Boost OG** calls `/api/e2b-run` for `.py` files using E2B Code Interpreter.
- The E2B API key stays on the server and is read from `process.env.E2B_API_KEY`.

## Install the E2B SDK
Run this from the root of your existing project (do not replace your existing package.json):
```bash
npm install @e2b/code-interpreter
```

## Add the endpoint
Copy `api/e2b-run.mjs` into your existing project's `api/` folder. If your deployment setup only supports `.js` functions, rename it to `e2b-run.js` and adapt the module syntax to your existing project's module configuration.

## Configure the key
In your hosting dashboard (for example Vercel → Project → Settings → Environment Variables), add:
- Name: `E2B_API_KEY`
- Value: your E2B API key
Then redeploy the project.

## Important limits
- IG continues using the existing `/api/run-code` route.
- OG currently accepts Python `.py` files only.
- E2B execution can support many Python packages, but it does not guarantee every module, native GUI, real-time desktop animation, or every 3D engine will work.
- This endpoint returns stdout/stderr and image MIME data when exposed by the SDK. The current runner's output panel primarily displays text; image/3D rendering needs a compatible frontend renderer.
- For production, add authentication, rate limiting, execution time/resource limits and usage quotas before exposing this endpoint publicly.
