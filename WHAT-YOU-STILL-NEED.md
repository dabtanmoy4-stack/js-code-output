# What is still needed for maximum Python compatibility

This ZIP is the code-side improvement. A ZIP cannot change cloud-provider limits or create an operating-system desktop/GPU in a browser.

## Required account-side configuration

- Vercel project with this repository deployed.
- `E2B_API_KEY` set as a server-side Vercel environment variable.
- Confirm the Vercel plan's maximum function duration. This bundle keeps `maxDuration` at 60 seconds for broad compatibility; first-time dependency installation may take longer and time out.
- For preinstalled packages, create and test an E2B custom template/image with the selected packages. Copy the resulting template ID from E2B and update the sandbox creation call in `api/run-code.js` according to the current E2B SDK/template docs. This must be done in the user's E2B account; the template ID cannot be fabricated here.

## Choose a realistic support target

Recommended preinstalled baseline: numpy, scipy, pandas, matplotlib, pillow, sympy, requests, beautifulsoup4, lxml, plotly, seaborn, networkx, openpyxl, python-docx, reportlab, pypdf, and rich.

Install heavy or platform-dependent packages only if you have tested their Python version and system requirements: torch, tensorflow, opencv, manim, pygame, panda3d, ursina, pyvista, vtk, open3d, mediapipe, and similar.

## Desktop / GPU / game engines

Ursina, Panda3D, Pygame, tkinter, turtle GUI, Blender `bpy`, CUDA/GPU workloads, and arbitrary OS-level programs require a compatible OS, system libraries, display/rendering support, and sometimes GPU. They cannot all be supported in a standard serverless Python sandbox. Use a dedicated container/VM for those workloads. If the output must be visible inside the browser, the scene must be rendered/exported to browser technologies such as HTML/JavaScript/WebGL.

## Before public launch

Add authentication and enforce per-user execution quotas, concurrency limits, request limits, and budget alerts. The API route in this starter bundle does not implement all of those production controls.
