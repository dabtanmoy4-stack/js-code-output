# JS CODE OUTPUT — Modal Graphics Python Runner (Expanded Build)

This build expands the Modal runtime for scientific Python, image/plot output, Manim rendering, and browser-connected interactive sessions. It preserves the existing `py_runner_boost.html` UI and `/api/modal_backend` route, and adds `/api/modal_live_session` plus a Modal WebSocket session service.

## 1. What this build adds

- Prepares an Xvfb virtual display and X11/SDL/Qt dependencies.
- Adds Tk support and common Linux GUI runtime libraries.
- Adds Manim, Arcade, Pyxel, PyQt6 and Kivy to the Modal image.
- Detects Manim `Scene` subclasses and attempts an automatic low-quality MP4 render.
- Adds a persistent per-run Modal Sandbox with an Xvfb virtual display and a browser WebSocket bridge.
- Streams the virtual display to the browser and forwards keyboard/mouse events for Pygame, Arcade, Pyxel, Tkinter, PyQt6 and Kivy.
- Adds a browser camera permission flow and streams JPEG camera frames to the sandbox; `cv2.VideoCapture(0)` is adapted to read those frames.
- Exposes a separate tunneled port for VPython's local browser canvas service (VPython's exact version/protocol compatibility must still be verified in the deployed environment).
- Keeps the short MP4/GIF capture fallback for one-shot runs.
- Keeps the existing Pygame finite-frame GIF capture and Matplotlib GIF/PNG export.
- Returns MP4, WebM, GIF, image, HTML, PDF, CSV, Excel and common audio files when they fit the response size limits.

## 2. Deploy Modal

Install and authenticate the Modal CLI:

```bash
python -m pip install -U modal
modal setup
```

Create a random shared token:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Create a Modal Secret named `jsco-runner-auth` with:

- `JSCO_MODAL_TOKEN` = the generated random token

Deploy from this directory:

```bash
modal deploy modal_app.py
```

Copy both deployed endpoint URLs printed by Modal:

- The original `run_python` endpoint for `/api/modal_backend`.
- The `live_sessions_app` ASGI endpoint for interactive sessions. Set its base URL as `MODAL_LIVE_URL` (do not append `/live/start`).

## 3. Configure Vercel

Set these Environment Variables:

- `MODAL_RUN_URL` = deployed `run_python` endpoint URL
- `MODAL_LIVE_URL` = deployed `live_sessions_app` ASGI endpoint base URL
- `MODAL_RUN_TOKEN` = the same token stored as `JSCO_MODAL_TOKEN` in Modal

Keep the token private. Never put it in HTML or client-side JavaScript. Redeploy Vercel after changing environment variables.

## 4. Website files

Replace the corresponding files in your Vercel project with the contents of this folder. The page calls:

- `POST /api/modal_backend` for normal finite Python jobs.
- `POST /api/modal_live_session` for interactive frameworks. The browser then connects directly to a short-lived Modal Sandbox WebSocket tunnel using a per-session connect token.

The interactive preview forwards key and mouse events to the virtual X11 display. For camera programs, the page requests camera permission and forwards low-resolution JPEG frames; Python's `cv2.VideoCapture(0)` adapter reads those frames.

The updated `vercel.json` sets both `api/modal_backend.js` and `api/modal_live_session.js` to 60 seconds. The API proxy aborts upstream requests at approximately 55 seconds, so very long renders or cold starts can still time out.

## 5. Current output behavior

- **Python / Scientific libraries:** console output, NumPy, Pandas, SciPy, Matplotlib, Seaborn, SymPy, scikit-learn, Pillow and OpenCV.
- **Matplotlib:** static PNG plots and captured `FuncAnimation` GIFs.
- **Manim:** detects standard `Scene`/`ThreeDScene` class declarations and attempts `manim -ql --format=mp4`. MathTex/Tex scenes may still fail if a specific TeX package/font is missing.
- **Pygame:** runs against Xvfb/X11; finite loops can produce GIF frames. A short MP4 desktop capture is also attempted.
- **Arcade / Pyxel:** run against the virtual X11 display; a short MP4 capture is attempted if a window is opened.
- **Tkinter / PyQt6 / Kivy:** can create windows in the virtual display; a short MP4 capture is attempted.
- **Plotly:** exports HTML for interactive chart viewing.
- **Files:** recognized image, video, HTML, PDF, CSV, JSON, text and Excel files can be previewed/downloaded within size limits.

## 6. Important limitations — read before promising users

The live-session bridge is a first implementation and must be tested after deployment with the sample programs below. It streams a virtual X11 display and forwards keyboard/mouse events, but it is not a perfect native desktop replacement.

- **VPython:** the session exposes port 8701 through a Modal Sandbox Connect Token and opens that URL in an iframe. VPython's own server startup, bind address, installed-version WebSocket behavior and iframe compatibility must be confirmed with a real VPython test; this bridge does not rewrite arbitrary VPython protocol messages.
- **Pygame / Arcade / Pyxel:** live screen streaming and keyboard/mouse forwarding are implemented through Xvfb + PyAutoGUI. Some SDL/OpenGL/game libraries may still need extra system packages or software-rendering fallbacks.
- **Tkinter / PyQt6 / Kivy:** windows are streamed from the virtual display and mouse/keyboard events are forwarded. Platform-specific widgets, file dialogs, clipboard, drag/drop and native OS integrations may differ from a desktop.
- **Webcam:** the page requests permission and sends low-resolution JPEG frames. `cv2.VideoCapture(0)` is adapted to read browser frames. This is not raw USB device access and may need code changes for programs relying on camera properties, hardware codecs or high frame rates.
- **Audio:** the virtual display uses a dummy audio driver; live audio playback/capture is not streamed in this version.
- **Three.js:** the existing browser Three.js renderer is separate from the Modal Python runtime. A normal Python import does not automatically control that renderer.
- **Compatibility:** native extensions, GPU-specific operations, OS-specific packages and arbitrary third-party libraries may still require extra system packages or may not work in a container.
- **Limits:** one-shot output files remain limited to 2 MB each and 2.5 MB total, with a roughly 48-second execution budget. Interactive sessions use a separate Sandbox with a 60-minute hard lifetime and 15-minute idle timeout; they incur Modal compute while active. The browser must remain connected for live display/input. Vercel only starts/stops the session; the live WebSocket bypasses the short Vercel request window through the Modal tunnel.

Do not describe this build as supporting every Python library or perfect desktop compatibility. It adds a live interactive bridge for common X11-based graphics/GUI programs; VPython and camera workflows still need real-account integration tests after deployment.
## 7. Security

User code runs in a separate Modal Sandbox. The endpoint authentication secret is not copied into that sandbox. Keep network access and sandbox permissions restricted to what the product requires; arbitrary user code execution is security-sensitive.

## 8. Interactive test programs

**Pygame (keyboard + mouse):**

```python
import pygame
pygame.init()
screen = pygame.display.set_mode((800, 500))
clock = pygame.time.Clock()
x, y = 400, 250
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT: running = False
        if event.type == pygame.MOUSEMOTION: x, y = event.pos
    keys = pygame.key.get_pressed()
    x += (keys[pygame.K_RIGHT] - keys[pygame.K_LEFT]) * 5
    y += (keys[pygame.K_DOWN] - keys[pygame.K_UP]) * 5
    screen.fill((12, 18, 35))
    pygame.draw.circle(screen, (240, 190, 80), (x, y), 28)
    pygame.display.flip()
    clock.tick(30)
pygame.quit()
```

**Tkinter (clickable window):**

```python
import tkinter as tk
root = tk.Tk()
root.title('JS CODE OUTPUT Live GUI')
count = 0
def click():
    global count
    count += 1
    label.config(text=f'Button clicked {count} times')
label = tk.Label(root, text='Live Tkinter Window', font=('Arial', 20))
label.pack(padx=30, pady=20)
tk.Button(root, text='Click me', command=click).pack(pady=10)
root.mainloop()
```

**Webcam (after granting camera permission in the preview toolbar):**

```python
import cv2
cap = cv2.VideoCapture(0)
for _ in range(100):
    ok, frame = cap.read()
    if not ok:
        continue
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    cv2.imshow('Browser Webcam - grayscale', gray)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break
cap.release()
cv2.destroyAllWindows()
```

**VPython:**

```python
from vpython import *
ball = sphere(radius=0.5, color=color.cyan, make_trail=True)
while True:
    rate(60)
    ball.pos.x += 0.01
```

If the VPython iframe stays blank, inspect the Modal Sandbox's port 8701 server log and verify that the installed VPython version binds to the exposed interface/port.
