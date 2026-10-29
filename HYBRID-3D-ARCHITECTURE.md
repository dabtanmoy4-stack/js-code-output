# JS CODE OUTPUT — Hybrid 3D architecture

## What is implemented in this bundle

1. **Browser 3D bridge for Python** — Python code can use `from jsco3d import Scene`. The Python bridge emits a bounded JSON scene marker; the frontend turns that into a sandboxed Output-panel preview powered by Three.js. This works without opening a desktop window, but needs browser internet access to load Three.js from jsDelivr.
2. **Separate Ursina runtime route** — `/api/ursina-runtime` is a secure proxy to a separately deployed service. Ursina/Panda3D imports are routed there by the UI instead of being blindly auto-installed into a headless E2B sandbox.
3. **Honest fallback** — If `URSINA_RUNTIME_URL` is not configured, the route returns a clear 503 explanation. It does not claim the actual Ursina service has been deployed.

## Browser bridge example

Open `examples/jsco3d_animation.py`, paste it into the Python editor, and run it. Supported primitives: cube, sphere, torus, cone, cylinder and plane; position, color, basic sizing, camera position, scene background, and continuous rotation. Drag to orbit and scroll to zoom.

This is **not** a compatibility layer for all Ursina/Panda3D classes, collision, physics, shaders, textures, assets, input APIs or game loops. Those require implementation-specific mappings or the desktop runtime.

## Connecting an actual Ursina runtime

Deploy a separate trusted service that can execute Python with Ursina/Panda3D in a graphics-enabled environment and return a JSON response compatible with the runner (`success`, `output`/`stdout`, optional `error`, optional `preview_html`/`animation_html` or `preview_url`). The service must implement authentication, strict execution time/memory limits, per-user isolation, process cleanup, rate limits and safe artifact delivery. A basic Xvfb process alone may allow rendering but does not automatically provide an interactive streamed window in the browser; use a purpose-built WebRTC/noVNC or frame-streaming architecture if interactive desktop visuals are required.

Then set these Vercel environment variables:

- `URSINA_RUNTIME_URL` — full HTTPS POST endpoint for your trusted service (not a public arbitrary URL supplied by a user).
- `URSINA_RUNTIME_TOKEN` — optional shared bearer token, configured identically on that service.

Redeploy after setting environment variables. Until a real service is deployed and secured, the Ursina route intentionally reports that it is not configured. Do not expose a generic unauthenticated code-execution service to the public internet.

## Current E2B route

The standard `/api/run-code` continues to handle normal Python and existing features. If code imports `ursina` or `panda3d.core`, it returns an explicit runtime-required response instead of spending time installing a package that cannot open a window in a headless sandbox. `jsco3d` bridge code runs in the standard Python route.

## Test checklist

- Run `examples/jsco3d_animation.py`; verify the 3D scene appears in Output.
- Run `examples/hello.py`; verify regular Python still prints normally.
- Run an Ursina example before configuring the service; verify a clear not-configured message.
- Only after deploying and securing the external service, configure `URSINA_RUNTIME_URL` and test on a staging deployment.
