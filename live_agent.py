"""Per-session live display/input/camera bridge for JS CODE OUTPUT.

Runs inside an isolated Modal Sandbox. It exposes an authenticated-by-Modal
Sandbox Connect Token WebSocket on port 8765, starts an Xvfb display, launches
the user's Python program, streams JPEG screen frames, forwards browser input,
and writes browser camera frames for OpenCV's VideoCapture(0) compatibility shim.
"""
import argparse
import asyncio
import base64
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

ROOT = Path('/tmp/jsco_live')
ROOT.mkdir(parents=True, exist_ok=True)
LOG = ROOT / 'program.log'
CAMERA = ROOT / 'camera.jpg'
app = FastAPI()
program = None
xvfb = None
started_at = time.time()


def stop_program():
    global program, xvfb
    if program and program.poll() is None:
        try:
            os.killpg(program.pid, signal.SIGTERM)
            program.wait(timeout=3)
        except Exception:
            try:
                os.killpg(program.pid, signal.SIGKILL)
            except Exception:
                pass
    if xvfb and xvfb.poll() is None:
        xvfb.terminate()


@app.get('/health')
async def health():
    return {'ok': True, 'program_running': bool(program and program.poll() is None)}


@app.websocket('/ws')
async def live_socket(ws: WebSocket):
    await ws.accept()
    last_log = ''
    try:
        import pyautogui
        pyautogui.FAILSAFE = False
    except Exception:
        pyautogui = None

    async def send_frames():
        while True:
            try:
                from PIL import ImageGrab
                frame = ImageGrab.grab().convert('RGB')
                frame.thumbnail((960, 600))
                import io
                buf = io.BytesIO()
                frame.save(buf, format='JPEG', quality=62, optimize=True)
                await ws.send_json({'type': 'frame', 'data': base64.b64encode(buf.getvalue()).decode('ascii')})
            except Exception as exc:
                await ws.send_json({'type': 'warning', 'message': 'Display capture: ' + str(exc)[:180]})
            await asyncio.sleep(0.12)

    async def send_logs():
        nonlocal last_log
        while True:
            try:
                if LOG.exists():
                    current = LOG.read_text(errors='replace')[-12000:]
                    if current != last_log:
                        delta = current[len(last_log):] if current.startswith(last_log) else current
                        if delta:
                            await ws.send_json({'type': 'log', 'text': delta[-5000:]})
                        last_log = current
                if program and program.poll() is not None:
                    await ws.send_json({'type': 'exit', 'code': program.returncode})
                    return
            except Exception:
                pass
            await asyncio.sleep(0.35)

    frame_task = asyncio.create_task(send_frames())
    log_task = asyncio.create_task(send_logs())
    try:
        while True:
            msg = await ws.receive_json()
            kind = msg.get('type')
            if kind == 'stop':
                stop_program()
                await ws.send_json({'type': 'stopped'})
                break
            if kind in ('keydown', 'keyup') and pyautogui:
                key = str(msg.get('key', ''))[:32]
                key_map = {' ':'space', 'ArrowUp':'up', 'ArrowDown':'down', 'ArrowLeft':'left', 'ArrowRight':'right', 'Enter':'enter', 'Escape':'esc', 'Backspace':'backspace', 'Tab':'tab'}
                key = key_map.get(key, key.lower())
                try:
                    (pyautogui.keyDown if kind == 'keydown' else pyautogui.keyUp)(key)
                except Exception:
                    pass
            elif kind in ('mousedown', 'mouseup', 'mousemove') and pyautogui:
                x = max(0, min(1279, int(msg.get('x', 0))))
                y = max(0, min(799, int(msg.get('y', 0))))
                try:
                    if kind == 'mousemove': pyautogui.moveTo(x, y, _pause=False)
                    elif kind == 'mousedown': pyautogui.mouseDown(x=x, y=y, button='left')
                    else: pyautogui.mouseUp(x=x, y=y, button='left')
                except Exception:
                    pass
            elif kind == 'camera' and msg.get('data'):
                try:
                    raw = base64.b64decode(msg['data'], validate=True)
                    if len(raw) < 1_500_000:
                        tmp = CAMERA.with_suffix('.tmp')
                        tmp.write_bytes(raw)
                        tmp.replace(CAMERA)
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        frame_task.cancel()
        log_task.cancel()
        # A disconnected browser should not leave an interactive game/GUI consuming compute.
        stop_program()


@app.post('/stop')
async def stop_http():
    stop_program()
    return JSONResponse({'success': True})


def main():
    global program, xvfb
    parser = argparse.ArgumentParser()
    parser.add_argument('--code', default='/tmp/main_live.py')
    args = parser.parse_args()

    os.environ.update({
        'DISPLAY': ':99', 'SDL_VIDEODRIVER': 'x11', 'SDL_AUDIODRIVER': 'dummy',
        'QT_QPA_PLATFORM': 'xcb', 'KIVY_NO_ARGS': '1', 'LIBGL_ALWAYS_SOFTWARE': '1',
        'PYGAME_HIDE_SUPPORT_PROMPT': '1', 'PYTHONUNBUFFERED': '1',
        'VPYTHON_PORT': '8701', 'VPYTHON_NOBROWSER': '1',
        'JSCO_LIVE_CAMERA_FILE': str(CAMERA),
    })
    xvfb = subprocess.Popen(['Xvfb', ':99', '-screen', '0', '1280x800x24', '-ac'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    time.sleep(0.8)
    with LOG.open('w') as log:
        program = subprocess.Popen([sys.executable, args.code], cwd='/tmp', env=os.environ.copy(), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        uvicorn.run(app, host='0.0.0.0', port=8765, log_level='warning')
    finally:
        stop_program()


if __name__ == '__main__':
    main()
