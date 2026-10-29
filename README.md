# JS CODE OUTPUT — OnlineCompiler + Three.js

This bundle uses the existing OnlineCompiler API for Python execution and runs HTML/CSS/JavaScript previews in a sandboxed browser iframe. Three.js is loaded from jsDelivr for browser-based 3D previews; no Three.js API key is required.

## Vercel setup

1. Upload the files in this folder to the root of your existing repository.
2. In Vercel > Project Settings > Environment Variables, add `ONLINECOMPILER_API_KEY` with your OnlineCompiler API key.
3. Deploy. The server-side proxy uses `https://api.onlinecompiler.io/api/run-code-sync/` and sends `Authorization: apiKey YOUR_KEY`.

## Three.js preview

- Open the Python Runner page and click **Three.js Starter**.
- It creates `scene.js` with a Three.js scene, perspective camera, WebGL renderer, lighting, animation loop, resize handling, and drag-to-orbit / wheel-to-zoom controls.
- Click **Run Code**. The browser-rendered scene appears in **3D Preview**.
- Internet access is required for the Three.js CDN script.

## Important limitations

- Three.js renders in the user's browser; it does not run Ursina/Panda3D.
- OnlineCompiler API behavior, supported compiler identifiers, quotas, and output fields depend on the user's OnlineCompiler account/service. This ZIP was syntax-checked locally, but the live API key and deployment were not tested.
- The API key must remain only in Vercel Environment Variables; never place it in frontend code.
