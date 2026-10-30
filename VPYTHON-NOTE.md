# VPython compatibility note

This Runner detects VPython imports and makes a best-effort attempt to install the upstream `vpython` package with Pyodide's `micropip`.

This is **experimental, not full VPython support**. VPython commonly relies on GlowScript/Jupyter widget services and runtime behaviour that are not guaranteed in Pyodide/WebAssembly. A successful package install does not prove that all VPython scene primitives, animation loops, widgets, or controls will work.

For reliable browser 3D scenes, use the supported Python-to-Three.js bridge (`from js import THREE`) or Python-to-Babylon.js bridge (`from js import BABYLON`). Do not advertise this build as fully VPython-compatible until the exact VPython projects have been tested after deployment.
