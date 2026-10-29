# This example requires a real desktop/display-enabled Ursina runtime.
# It will NOT open a game window in the standard E2B cloud sandbox.
from ursina import *

app = Ursina()
Entity(model="cube", color=color.azure, rotation=(25, 35, 0))
EditorCamera()
app.run()
