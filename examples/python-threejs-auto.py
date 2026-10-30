# Pyodide + Three.js starter. Select this file and press Run Code.
# The Runner automatically converts Three.js .new({...}) option dictionaries to JS objects.
import math
from js import THREE, document, window
from pyodide.ffi import create_proxy

output = document.getElementById("output")
if output is None:
    output = document.createElement("div")
    output.id = "output"
    document.body.appendChild(output)
output.innerHTML = ""
output.style.width = "100%"
output.style.height = "100%"
output.style.minHeight = "520px"
output.style.position = "relative"

scene = THREE.Scene.new()
scene.background = THREE.Color.new("#080818")
camera = THREE.PerspectiveCamera.new(60, output.clientWidth / output.clientHeight, 0.1, 100)
camera.position.set(0, 2, 13)
camera.lookAt(0, 0, 0)
renderer = THREE.WebGLRenderer.new({"antialias": True})
renderer.setPixelRatio(min(window.devicePixelRatio, 2))
renderer.setSize(output.clientWidth, output.clientHeight)
output.appendChild(renderer.domElement)
scene.add(THREE.AmbientLight.new("#ffffff", 1.8))
light = THREE.PointLight.new("#ffffff", 90)
light.position.set(0, 5, 8)
scene.add(light)

colors = ["#ff3344", "#3388ff", "#22dd99", "#bb55ff", "#ffaa22"]
balls = []
for i, color in enumerate(colors):
    geometry = THREE.SphereGeometry.new(1, 48, 48)
    material = THREE.MeshStandardMaterial.new({"color": color, "roughness": 0.25, "metalness": 0.2})
    ball = THREE.Mesh.new(geometry, material)
    ball.position.set((i - 2) * 2.5, 0, 0)
    scene.add(ball)
    balls.append(ball)

clock = THREE.Clock.new()
def animate(timestamp):
    t = clock.getElapsedTime()
    for i, ball in enumerate(balls):
        ball.rotation.y = t * (0.5 + i * 0.1)
        ball.position.y = math.sin(t * 2 + i) * 0.45
    renderer.render(scene, camera)
    window.requestAnimationFrame(animate_proxy)

animate_proxy = create_proxy(animate)
window.requestAnimationFrame(animate_proxy)
print("Pyodide + Three.js color test is running")
