# Python + Three.js through Pyodide. Select this .py file and press Run.
import js
from pyodide.ffi import create_proxy

THREE = js.THREE
scene = THREE.Scene.new()
scene.background = THREE.Color.new("#10172a")
camera = THREE.PerspectiveCamera.new(60, js.window.innerWidth/js.window.innerHeight, 0.1, 100)
camera.position.set(3, 2, 5)
renderer = THREE.WebGLRenderer.new(js.Object.new(antialias=True))
renderer.setSize(js.window.innerWidth, js.window.innerHeight)
js.document.body.innerHTML = ""
js.document.body.style.cssText = "margin:0;overflow:hidden"
js.document.body.appendChild(renderer.domElement)
scene.add(THREE.HemisphereLight.new("#ffffff", "#334466", 2))
mesh = THREE.Mesh.new(THREE.TorusKnotGeometry.new(1, .3, 120, 16), THREE.MeshStandardMaterial.new(js.Object.new(color="#ffc857", metalness=.6, roughness=.25)))
scene.add(mesh)
def animate():
    mesh.rotation.x += .006
    mesh.rotation.y += .009
    renderer.render(scene, camera)
    js.requestAnimationFrame(callback)
callback = create_proxy(animate)
animate()
