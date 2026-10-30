# VPython compatibility note

This Runner detects `vpython` imports and attempts to install the `vpython` Python package inside Pyodide. This is experimental, not a guaranteed full VPython implementation: the upstream package may require native/runtime services that are not available in WebAssembly/Pyodide. If installation fails, the Runner surfaces the package/runtime error. Do not describe this build as fully VPython-compatible until a real `from vpython import *` animation has been tested in the deployed environment.
