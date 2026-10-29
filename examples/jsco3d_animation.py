# JS CODE OUTPUT browser 3D bridge example
# This is a small browser renderer API, not the full Ursina API.
from jsco3d import Scene

scene = Scene(
    title="Orbiting 3D Shapes",
    background="#0b1020",
    camera=(6, 4, 8),
)
scene.add_plane(position=(0, -1, 0), color="#17243a", size=14)
scene.add_cube(position=(-1.5, 0, 0), color="#f5b942", size=1.4)
scene.add_sphere(position=(0.5, 0.2, 0), color="#38bdf8", radius=0.8)
scene.add_torus(position=(2, 0.1, 0), color="#c084fc", radius=0.7, tube=0.18)
scene.add_cone(position=(0, 1.6, -1.5), color="#fb7185", radius=0.55, height=1.3)
scene.animate(True)
scene.show()
