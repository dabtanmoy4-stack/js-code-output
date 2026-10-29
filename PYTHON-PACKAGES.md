# Python package support — best effort, not universal guarantee

The API can try to install common PyPI packages when an import is missing. Explicit package hints are supported in the first 12 lines:

```python
# pip: numpy, scipy, matplotlib, plotly, pillow
import numpy as np
print(np.arange(5))
```

Up to 8 packages may be declared. The runtime has a curated import-name-to-PyPI-name map and retries up to 5 missing imports. Use ordinary package names, not shell commands or URLs. Package installs occur in a temporary E2B sandbox and are not cached for later runs. Large packages can exceed Vercel's function duration or the sandbox's memory/CPU limits.

## What this cannot magically solve

- `package.json` installs Node.js packages; it does not preinstall Python packages in E2B.
- A successful `pip install ursina` or `pygame` import does not create a desktop window inside a browser. E2B cloud sandboxes normally have no interactive desktop display/GPU.
- `tkinter`, `turtle` GUI, Blender's `bpy`, Windows-only modules, GPU/CUDA libraries, system executables, and packages requiring OS libraries may not work in this hosted runner.
- TensorFlow/PyTorch/Manim/Open3D/VTK and similar packages are heavy and can fail because of Python-version, binary-wheel, memory, or execution-time constraints.
- No finite package list can support every package that exists on PyPI.

## Recommended route by workload

- General Python, math and common data packages: use the E2B Python endpoint.
- Interactive 3D in the output panel: use browser HTML + JavaScript + WebGL/Three.js, or a Python library that exports browser HTML (for example Plotly or VPython where supported).
- Desktop GUI, GPU, Blender, OS-level/system packages, or packages that need persistent dependencies: use a separately managed container/VM with the required OS packages and display/rendering stack. This is a separate backend, not a ZIP-only change.

## Production hardening required

Before public launch, add user authentication, per-user rate limits/quotas, maximum execution time, concurrency controls, and spend alerts. Keep `E2B_API_KEY` only in Vercel server-side environment variables.
