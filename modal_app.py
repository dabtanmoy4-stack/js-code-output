import base64
import json
import os
import re
import shlex
import time
from pathlib import Path

import modal
from fastapi import Request
from fastapi.responses import JSONResponse

APP_NAME = "jsco-python-runner"
app = modal.App(APP_NAME)

# Common scientific, image, plotting, and game libraries are baked into the image.
# Less common packages are installed on demand inside each isolated Sandbox.
RUN_IMAGE = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "libsdl2-2.0-0", "libsdl2-image-2.0-0", "libsdl2-mixer-2.0-0", "libsdl2-ttf-2.0-0",
        "libgl1", "libgl1-mesa-dri", "libegl1", "libglib2.0-0", "libsm6", "libxext6",
        "libxrender1", "libx11-6", "libxkbcommon0", "libfontconfig1", "libfreetype6",
        "libcairo2", "libpango-1.0-0", "libpangocairo-1.0-0", "libdbus-1-3",
        "libxcb-cursor0", "libxkbcommon-x11-0", "libxcb-xinerama0", "libxcb-icccm4",
        "libxcb-image0", "libxcb-keysyms1", "libxcb-randr0", "libxcb-render-util0",
        "libxcb-shape0", "libxcb-xfixes0", "xvfb", "xauth", "python3-tk", "ffmpeg",
        "pkg-config", "build-essential", "libcairo2-dev", "libpango1.0-dev", "dvisvgm",
        "texlive-latex-extra", "texlive-fonts-recommended", "ghostscript"
    )
    .pip_install(
        "numpy", "matplotlib", "pillow", "pandas", "scipy", "seaborn", "sympy",
        "scikit-learn", "opencv-python", "pygame", "vpython", "plotly",
        "imageio", "imageio-ffmpeg", "openpyxl", "requests", "beautifulsoup4",
        "lxml", "pyyaml", "fastapi[standard]", "pyvirtualdisplay", "pyautogui",
        "manim", "arcade", "pyxel", "PyQt6", "kivy", "websockets"
    )
    .add_local_file("live_agent.py", remote_path="/opt/jsco/live_agent.py")
)

MAX_CODE = 300_000
MAX_INPUT = 100_000
MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_TOTAL_FILE_BYTES = 2_500_000
MAX_FILES = 12
RUN_SECONDS = 48

PACKAGE_MAP = {
    "PIL": "pillow", "cv2": "opencv-python", "numpy": "numpy", "pandas": "pandas",
    "scipy": "scipy", "matplotlib": "matplotlib", "seaborn": "seaborn", "sympy": "sympy",
    "sklearn": "scikit-learn", "requests": "requests", "flask": "flask", "fastapi": "fastapi",
    "uvicorn": "uvicorn", "pygame": "pygame", "vpython": "vpython", "pyxel": "pyxel",
    "imageio": "imageio", "plotly": "plotly", "bs4": "beautifulsoup4", "yaml": "pyyaml",
    "lxml": "lxml", "openpyxl": "openpyxl", "xlsxwriter": "XlsxWriter", "sympy": "sympy",
    "bokeh": "bokeh", "altair": "altair", "networkx": "networkx", "trimesh": "trimesh",
    "manim": "manim", "moviepy": "moviepy", "pyglet": "pyglet", "arcade": "arcade",
    "pyxel": "pyxel", "PyQt6": "PyQt6", "PySide6": "PySide6", "kivy": "kivy",
}

PRELUDE = r'''import os, atexit, base64, io, warnings
os.environ["MPLBACKEND"] = "Agg"
os.environ.setdefault("SDL_VIDEODRIVER", "x11")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
OUT = os.environ.get("JSCO_OUTPUT_DIR", "/tmp/jsco_output")
os.makedirs(OUT, exist_ok=True)
warnings.filterwarnings("ignore", message=".*non-interactive.*")
_JSCO_ANIMS = []
_JSCO_GAME_FRAMES = []
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    _old_show = plt.show
    def _jsco_show(*a, **k):
        # Save active animations as animated GIFs before static figures.
        for i, anim in enumerate(_JSCO_ANIMS[:3]):
            try:
                from matplotlib.animation import PillowWriter
                anim.save(os.path.join(OUT, f"matplotlib_animation_{i+1}.gif"), writer=PillowWriter(fps=20), dpi=80)
            except Exception as e:
                print("[Animation export warning]", str(e))
        for i, n in enumerate(list(plt.get_fignums())):
            try: plt.figure(n).savefig(os.path.join(OUT, f"matplotlib_plot_{i+1}.png"), dpi=120, bbox_inches="tight")
            except Exception as e: print("[Plot export warning]", str(e))
    plt.show = _jsco_show
    try:
        import matplotlib.animation as _ma
        _old_init = _ma.FuncAnimation.__init__
        def _jsco_anim_init(self, *a, **k):
            _old_init(self, *a, **k)
            _JSCO_ANIMS.append(self)
        _ma.FuncAnimation.__init__ = _jsco_anim_init
    except Exception: pass
    def _jsco_matplotlib_exit():
        for i, anim in enumerate(_JSCO_ANIMS[:3]):
            path = os.path.join(OUT, f"matplotlib_animation_{i+1}.gif")
            if os.path.exists(path): continue
            try:
                from matplotlib.animation import PillowWriter
                anim.save(path, writer=PillowWriter(fps=20), dpi=80)
            except Exception as e: print("[Animation export warning]", str(e))
        for i, n in enumerate(list(plt.get_fignums())):
            try:
                path = os.path.join(OUT, f"matplotlib_plot_exit_{i+1}.png")
                if not any(x.startswith("matplotlib_plot_") for x in os.listdir(OUT)):
                    plt.figure(n).savefig(path, dpi=120, bbox_inches="tight")
            except Exception: pass
    atexit.register(_jsco_matplotlib_exit)
except Exception: pass

try:
    from PIL import Image as _PILImage
    def _jsco_pil_show(self, *a, **k):
        im = self if self.mode in ("RGB", "RGBA", "L") else self.convert("RGBA")
        im.save(os.path.join(OUT, "pillow_output.png"))
    _PILImage.Image.show = _jsco_pil_show
except Exception: pass

# Plotly figures can export self-contained HTML instead of trying to open a server-side browser.
try:
    import plotly.basedatatypes as _pbd
    _old_plotly_show = _pbd.BaseFigure.show
    def _jsco_plotly_show(self, *a, **k):
        try:
            path = os.path.join(OUT, f"plotly_{len([x for x in os.listdir(OUT) if x.startswith('plotly_')])+1}.html")
            self.write_html(path, include_plotlyjs="cdn", full_html=True, auto_open=False)
            print("Interactive Plotly chart saved:", os.path.basename(path))
        except Exception as e:
            print("[Plotly export warning]", str(e))
    _pbd.BaseFigure.show = _jsco_plotly_show
except Exception: pass

# Capture frames from Pygame's dummy SDL display so animations can be returned as GIF.
try:
    import pygame as _pg
    _old_flip = _pg.display.flip
    _old_update = _pg.display.update
    def _jsco_capture_game():
        try:
            surf = _pg.display.get_surface()
            if surf is not None and len(_JSCO_GAME_FRAMES) < 180:
                _JSCO_GAME_FRAMES.append(_PILImage.frombytes("RGB", surf.get_size(), _pg.image.tostring(surf, "RGB")))
        except Exception: pass
    def _jsco_flip(*a, **k):
        result = _old_flip(*a, **k); _jsco_capture_game(); return result
    def _jsco_update(*a, **k):
        result = _old_update(*a, **k); _jsco_capture_game(); return result
    _pg.display.flip = _jsco_flip
    _pg.display.update = _jsco_update
    def _jsco_game_exit():
        if len(_JSCO_GAME_FRAMES) > 1:
            try:
                frames = _JSCO_GAME_FRAMES
                frames[0].save(os.path.join(OUT, "pygame_animation.gif"), save_all=True, append_images=frames[1:], duration=50, loop=0, optimize=False)
            except Exception as e: print("[Pygame GIF warning]", str(e))
        elif len(_JSCO_GAME_FRAMES) == 1:
            try: _JSCO_GAME_FRAMES[0].save(os.path.join(OUT, "pygame_frame.png"))
            except Exception: pass
    atexit.register(_jsco_game_exit)
except Exception: pass
'''


def json_response(payload, status=200):
    return JSONResponse(payload, status_code=status)


def packages_for(code: str):
    found = []
    for match in re.finditer(r"^\s*(?:import|from)\s+([A-Za-z_][A-Za-z0-9_.]*)", code, re.M):
        root = match.group(1).split(".")[0]
        if root in PACKAGE_MAP:
            found.append(PACKAGE_MAP[root])
    return sorted(set(found))


def mime_for(name):
    ext = Path(name).suffix.lower()
    return {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
        ".webp": "image/webp", ".svg": "image/svg+xml", ".bmp": "image/bmp", ".pdf": "application/pdf",
        ".csv": "text/csv", ".txt": "text/plain", ".json": "application/json", ".html": "text/html",
        ".htm": "text/html", ".mp4": "video/mp4", ".webm": "video/webm", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".zip": "application/zip", ".xml": "application/xml", ".mp3": "audio/mpeg",
        ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".mov": "video/quicktime"
    }.get(ext)


def detect_manim_scenes(code: str):
    """Return Manim Scene subclasses declared in the submitted source."""
    try:
        import ast
        tree = ast.parse(code)
        names = []
        for node in tree.body:
            if isinstance(node, ast.ClassDef):
                bases = []
                for base in node.bases:
                    if isinstance(base, ast.Name): bases.append(base.id)
                    elif isinstance(base, ast.Attribute): bases.append(base.attr)
                if any(name in {"Scene", "ThreeDScene", "MovingCameraScene", "ZoomedScene", "VectorScene"} for name in bases):
                    names.append(node.name)
        return names[:5]
    except Exception:
        return []


@app.function(image=RUN_IMAGE, timeout=600, secrets=[modal.Secret.from_name("jsco-runner-auth")])
@modal.fastapi_endpoint(method="POST")
async def run_python(request: Request):
    started = time.time()
    expected = os.environ.get("JSCOMODALTOKEN", "")
    supplied = request.headers.get("x-jsco-token", "")
    if not expected or supplied != expected:
        return json_response({"success": False, "error": "Unauthorized Modal runner request."}, 401)

    try:
        body = await request.json()
    except Exception:
        return json_response({"success": False, "error": "Request body must be JSON."}, 400)

    code = str(body.get("code") or "")
    user_input = str(body.get("input") or "")
    if not code.strip():
        return json_response({"success": False, "error": "Python code is empty."}, 400)
    if len(code) > MAX_CODE or len(user_input) > MAX_INPUT:
        return json_response({"success": False, "error": "Code or input exceeds the allowed size."}, 413)

    sb = None
    try:
        # The user program runs in a separate Modal Sandbox. The endpoint's auth secret
        # is not copied into that Sandbox environment.
        sb = modal.Sandbox.create(
            "bash", "-lc", "sleep infinity",
            app=app, image=RUN_IMAGE, timeout=RUN_SECONDS + 120,
            cpu=2, memory=4096, block_network=False,
        )
        sb.filesystem.make_directory("/tmp/jsco_output")
        sb.filesystem.write_text(PRELUDE + "\n# ---- USER PROGRAM ----\n" + code + "\n", "/tmp/main.py")
        sb.filesystem.write_text(user_input, "/tmp/jsco_input.txt")

        packages = packages_for(code)
        installed = []
        install_note = ""
        if packages:
            install_cmd = "python -m pip install --disable-pip-version-check --no-input --quiet " + " ".join(shlex.quote(p) for p in packages)
            install = sb.exec("bash", "-lc", install_cmd, timeout=110, text=True)
            install.wait()
            if install.returncode == 0:
                installed = packages
            else:
                install_note = "Some requested packages could not be installed: " + (install.stderr.read() or install.stdout.read())[:3000]

        manim_scenes = detect_manim_scenes(code)
        uses_desktop_gui = bool(re.search(r"(^|\n)\s*(?:import\s+(?:tkinter|PyQt6|PySide6|kivy|arcade|pyxel)|from\s+(?:tkinter|PyQt6|PySide6|kivy|arcade|pyxel))", code))
        uses_game = bool(re.search(r"(^|\n)\s*(?:import\s+(?:pygame|arcade|pyxel)|from\s+(?:pygame|arcade|pyxel))", code))
        # Xvfb provides a virtual X11 display for GUI/game frameworks. This is a
        # headless capture environment, not a remotely interactive desktop session.
        if manim_scenes:
            render_parts = []
            for scene_name in manim_scenes:
                render_parts.append(f"manim -ql --format=mp4 --media_dir /tmp/jsco_manim /tmp/main.py {shlex.quote(scene_name)}")
            run_payload = " && ".join(render_parts) + "; rc=$?; find /tmp/jsco_manim -type f \\( -name '*.mp4' -o -name '*.gif' \\) -exec cp -f {} /tmp/jsco_output/ \\; 2>/dev/null; exit $rc"
            command = f"cd /tmp && export PYTHONUNBUFFERED=1 MPLBACKEND=Agg LIBGL_ALWAYS_SOFTWARE=1 && timeout --signal=TERM --kill-after=2s {RUN_SECONDS}s bash -lc {shlex.quote(run_payload)}"
        else:
            gui_capture = ""
            if uses_game or uses_desktop_gui:
                # Record a short preview of virtual display output for Arcade/Pyxel/GUI apps.
                gui_capture = '(ffmpeg -hide_banner -loglevel error -y -f x11grab -video_size 1280x800 -framerate 12 -i "$DISPLAY" -t 7 -vf scale=960:-2 -c:v libx264 -preset ultrafast -crf 32 -pix_fmt yuv420p /tmp/jsco_output/desktop_preview.mp4 >/tmp/jsco_ffmpeg.log 2>&1) & REC=$!; '
            inner = f"export PYTHONUNBUFFERED=1 MPLBACKEND=Agg SDL_VIDEODRIVER=x11 SDL_AUDIODRIVER=dummy LIBGL_ALWAYS_SOFTWARE=1 KIVY_NO_ARGS=1 QT_QPA_PLATFORM=xcb; {gui_capture} timeout --signal=TERM --kill-after=2s {RUN_SECONDS}s python /tmp/main.py < /tmp/jsco_input.txt; rc=$?; wait $REC 2>/dev/null || true; exit $rc"
            command = f"cd /tmp && xvfb-run -a -s '-screen 0 1280x800x24' bash -lc {shlex.quote(inner)}"
        proc = sb.exec("bash", "-lc", command, timeout=RUN_SECONDS + 20, text=True)
        proc.wait()
        stdout = (proc.stdout.read() or "")[:180000]
        stderr = (proc.stderr.read() or "")[:30000]
        exit_code = proc.returncode

        files = []
        total_file_bytes = 0
        listing = sb.exec("bash", "-lc", f"find /tmp/jsco_output -maxdepth 1 -type f -size -{MAX_FILE_BYTES}c -printf '%f\\n' | sort", timeout=10, text=True)
        listing.wait()
        names = [n.strip() for n in (listing.stdout.read() or "").splitlines() if n.strip()]
        for name in names[:MAX_FILES]:
            if not re.fullmatch(r"[A-Za-z0-9._-]+", name):
                continue
            mt = mime_for(name)
            if not mt:
                continue
            try:
                data = sb.filesystem.read_bytes("/tmp/jsco_output/" + name)
                if data and len(data) <= MAX_FILE_BYTES and total_file_bytes + len(data) <= MAX_TOTAL_FILE_BYTES:
                    files.append({"name": name, "mime": mt, "content_base64": base64.b64encode(data).decode("ascii")})
                    total_file_bytes += len(data)
            except Exception:
                pass

        notes = []
        if re.search(r"(^|\n)\s*(from\s+vpython|import\s+vpython)", code):
            notes.append("VPython's Python code can run, but this build does not yet provide its persistent browser WebSocket canvas. Use VPython's export/scene alternatives or a separate live VPython bridge for interactive 3D.")
        if uses_game:
            notes.append("Game frameworks run against a virtual X11 display. A short MP4 preview is captured when possible; this is not a live keyboard/mouse-controlled game session.")
        if uses_desktop_gui:
            notes.append("Desktop GUI frameworks run in a virtual X11 display and may produce a short MP4 preview. Native OS windows are not attached to the user's browser, and live input forwarding is not enabled.")
        if manim_scenes:
            notes.append("Manim Scene classes were detected and an automatic low-quality MP4 render was attempted. MathTex/Tex scenes may require additional LaTeX packages.")
        if re.search(r"VideoCapture\s*\(\s*0|VideoCapture\s*\(\s*['\"]0['\"]", code):
            notes.append("The Modal container cannot directly open the visitor's physical webcam. Webcam support requires browser camera permission and sending frames from the page to the Python runtime; that live camera bridge is not included yet.")

        ok = exit_code == 0
        return json_response({
            "success": ok, "status": "success" if ok else "error", "compiler": "python",
            "output": stdout, "stdout": stdout, "stderr": stderr,
            "error": "" if ok else (stderr or f"Python process exited with code {exit_code}."),
            "exit_code": exit_code, "time": round(time.time() - started, 2),
            "installedPackages": installed, "packageInstallNote": install_note,
            "files": files, "runtimeNotes": notes,
            "has_image_output": any(f["mime"].startswith("image/") for f in files),
        })
    except Exception as exc:
        return json_response({"success": False, "status": "error", "error": str(exc)[:4000], "stdout": "", "stderr": str(exc)[:4000], "output": "", "exit_code": None, "time": round(time.time() - started, 2)}, 500)
    finally:
        if sb is not None:
            try:
                sb.terminate()
            except Exception:
                pass


@app.local_entrypoint()
def main():
    print("Deploy with: modal deploy modal_app.py")


# A separate ASGI Web Function owns interactive sessions. Modal supports
# WebSockets on ASGI apps; each session runs in its own isolated Sandbox.
_LIVE_SESSIONS = {}

LIVE_CAMERA_PRELUDE = r'''# Browser-camera adapter for OpenCV VideoCapture(0).
# The browser streams permission-approved JPEG frames to this sandbox.
try:
    import cv2 as _jsco_cv2, os as _jsco_os, time as _jsco_time
    _jsco_original_videocapture = _jsco_cv2.VideoCapture
    class _JSCOBrowserCamera:
        def __init__(self, source=0, *args, **kwargs):
            self.source = source
            self.path = _jsco_os.environ.get("JSCO_LIVE_CAMERA_FILE", "/tmp/jsco_live/camera.jpg")
            self.opened = (source == 0)
        def isOpened(self): return self.opened
        def read(self):
            if not self.opened: return False, None
            deadline = _jsco_time.time() + 45
            while not _jsco_os.path.exists(self.path) and _jsco_time.time() < deadline:
                _jsco_time.sleep(0.05)
            deadline = _jsco_time.time() + 3
            previous = getattr(self, "_last_mtime", 0)
            current = 0
            while _jsco_time.time() < deadline:
                try: current = _jsco_os.path.getmtime(self.path)
                except OSError: current = 0
                if current > previous: break
                _jsco_time.sleep(0.025)
            if not current: return False, None
            self._last_mtime = current
            frame = _jsco_cv2.imread(self.path)
            return (frame is not None), frame
        def release(self): self.opened = False
        def get(self, prop):
            ok, frame = self.read()
            if not ok: return 0
            if prop == _jsco_cv2.CAP_PROP_FRAME_WIDTH: return frame.shape[1]
            if prop == _jsco_cv2.CAP_PROP_FRAME_HEIGHT: return frame.shape[0]
            return 0
    _jsco_cv2.VideoCapture = lambda source=0, *a, **k: (_JSCOBrowserCamera(source, *a, **k) if source == 0 else _jsco_original_videocapture(source, *a, **k))
except Exception:
    pass
'''

@app.function(
    image=RUN_IMAGE,
    secrets=[modal.Secret.from_name("jsco-runner-auth")],
    timeout=900,
)
@modal.concurrent(max_inputs=30)
@modal.asgi_app()
def live_sessions_app():
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    import secrets as _secrets

    web = FastAPI()

    @web.post("/live/start")
    async def start_live(request: Request):
        expected = os.environ.get("JSCOMODALTOKEN", "")
        if not expected or request.headers.get("x-jsco-token", "") != expected:
            return JSONResponse({"success": False, "error": "Unauthorized."}, status_code=401)
        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"success": False, "error": "JSON body required."}, status_code=400)
        code = str(body.get("code") or "")
        if not code.strip():
            return JSONResponse({"success": False, "error": "Python code is empty."}, status_code=400)
        if len(code) > MAX_CODE:
            return JSONResponse({"success": False, "error": "Code is too large."}, status_code=413)

        sb = None
        try:
            sb = modal.Sandbox.create(
                "bash", "-lc", "sleep infinity",
                app=app, image=RUN_IMAGE, timeout=3600, idle_timeout=900,
                cpu=2, memory=4096, block_network=False,
                encrypted_ports=[8765, 8701],
            )
            sb.filesystem.make_directory("/tmp/jsco_live")
            sb.filesystem.write_text(LIVE_CAMERA_PRELUDE + "\n# ---- USER PROGRAM ----\n" + code + "\n", "/tmp/main_live.py")
            launch = "nohup python /opt/jsco/live_agent.py --code /tmp/main_live.py >/tmp/jsco_live/agent.log 2>&1 </dev/null &"
            proc = sb.exec("bash", "-lc", launch, timeout=10, text=True)
            proc.wait()
            # Wait for the WebSocket agent to become ready before returning credentials.
            probe = sb.exec("python", "-c", "import time,urllib.request; u='http://127.0.0.1:8765/health';\nfor i in range(60):\n try: urllib.request.urlopen(u,timeout=1); break\n except Exception: time.sleep(.5)\nelse: raise SystemExit('live bridge did not start')", timeout=40, text=True)
            probe.wait()
            if probe.returncode != 0:
                raise RuntimeError((probe.stderr.read() or "Live bridge failed to start")[:1200])
            ws_creds = sb.create_connect_token(port=8765)
            vp_creds = sb.create_connect_token(port=8701)
            sid = sb.object_id
            _LIVE_SESSIONS[sid] = sb
            ws_base = ws_creds.url.rstrip("/")
            vp_base = vp_creds.url.rstrip("/")
            return {
                "success": True,
                "sessionId": sid,
                "websocketUrl": ws_base.replace("https://", "wss://") + "/ws?_modal_connect_token=" + ws_creds.token,
                "vpythonUrl": vp_base + "/?_modal_connect_token=" + vp_creds.token,
                "display": {"width": 1280, "height": 800},
                "message": "Interactive Python session started. Grant camera access from the preview toolbar if needed."
            }
        except Exception as exc:
            if sb is not None:
                try: sb.terminate()
                except Exception: pass
            return JSONResponse({"success": False, "error": str(exc)[:2500]}, status_code=500)

    @web.post("/live/stop")
    async def stop_live(request: Request):
        expected = os.environ.get("JSCOMODALTOKEN", "")
        if not expected or request.headers.get("x-jsco-token", "") != expected:
            return JSONResponse({"success": False, "error": "Unauthorized."}, status_code=401)
        try: body = await request.json()
        except Exception: body = {}
        sid = str(body.get("sessionId") or "")
        sb = _LIVE_SESSIONS.pop(sid, None)
        try:
            if sb is None and sid:
                sb = modal.Sandbox.from_id(sid)
            if sb is not None: sb.terminate()
        except Exception:
            pass
        return {"success": True}

    return web
