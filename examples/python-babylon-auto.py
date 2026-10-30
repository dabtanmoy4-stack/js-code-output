# Python + Babylon.js through Pyodide.
# Run this .py file in the Runner. The runtime provides BABYLON and renderCanvas.
from js import BABYLON, document, window
from pyodide.ffi import create_proxy

canvas = document.getElementById("renderCanvas")
if canvas is None:
    canvas = document.createElement("canvas")
    canvas.id = "renderCanvas"
    canvas.style.cssText = "width:100%;height:100%;display:block"
    document.getElementById("output").appendChild(canvas)

engine = BABYLON.Engine.new(canvas, True)
scene = BABYLON.Scene.new(engine)
scene.clearColor = BABYLON.Color4.new(0.015, 0.025, 0.08, 1)

camera = BABYLON.ArcRotateCamera.new(
    "camera", -1.2, 1.15, 9,
    BABYLON.Vector3.Zero(), scene
)
camera.attachControl(canvas, True)

light = BABYLON.HemisphericLight.new(
    "light", BABYLON.Vector3.new(0, 1, 0), scene
)
light.intensity = 1.2

box = BABYLON.MeshBuilder.CreateBox("box", {"size": 2}, scene)
material = BABYLON.StandardMaterial.new("gold", scene)
material.diffuseColor = BABYLON.Color3.new(0.95, 0.55, 0.15)
material.metallic = 0.55
material.roughness = 0.25
box.material = material

def render_loop():
    box.rotation.y += 0.012
    box.rotation.x += 0.006
    scene.render()

render_proxy = create_proxy(render_loop)
engine.runRenderLoop(render_proxy)

def resize(event=None):
    engine.resize()

resize_proxy = create_proxy(resize)
window.addEventListener("resize", resize_proxy)
print("Babylon.js Python scene started.")
