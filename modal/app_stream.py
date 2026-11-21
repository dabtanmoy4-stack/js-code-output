"""Modal C compiler service. Starter only: not a hardened public multi-tenant sandbox."""
import modal

app = modal.App('js-code-output-c-runner')

image = (
    modal.Image.debian_slim(python_version='3.11')
    .apt_install('gcc', 'clang', 'libc6-dev', 'emscripten', 'libsdl2-dev',
                 'mesa-common-dev', 'libgl1-mesa-dev', 'nodejs', 'npm')
    .run_commands('npm install -g html-minifier-terser',
                  'EM_FROZEN_CACHE=0 embuilder build sdl2')
    .pip_install('fastapi[standard]')
)

@app.function(image=image, timeout=90, cpu=2, memory=2048,
              secrets=[modal.Secret.from_name('js-c-runner-auth')])
@modal.asgi_app()
def api():
    from fastapi import FastAPI, Header, HTTPException
    from pydantic import BaseModel, Field
    import os
    import pathlib
    import subprocess
    import tempfile
    import time
    import re
    import hmac

    server = FastAPI()

    class Request(BaseModel):
        source: str = Field(max_length=300000)
        stdin: str = Field(default='', max_length=50000)
        files: dict[str, str] = Field(default_factory=dict)
        entry: str | None = None
        mode: str = 'console'
        compiler: str = 'gcc'
        flags: str = ''

    def auth(token):
        secret = os.environ.get('RUNNER_SHARED_SECRET')
        if not secret:
            raise HTTPException(503, 'Runner authentication is not configured')
        if not hmac.compare_digest(token or '', secret):
            raise HTTPException(401, 'Unauthorized')

    @server.get('/health')
    def health(x_runner_secret: str | None = Header(None)):
        auth(x_runner_secret)
        return {'ok': True, 'compiler': 'gcc/clang/emscripten'}

    @server.post('/run')
    def run(body: Request, x_runner_secret: str | None = Header(None)):
        auth(x_runner_secret)
        if body.mode not in ('console', 'web'):
            raise HTTPException(400, 'Unsupported mode')
        if len(body.files) > 80 or sum(len(x) for x in body.files.values()) > 600000:
            raise HTTPException(413, 'Project too large')

        def safe_path(path):
            p = pathlib.PurePosixPath(path)
            return (not p.is_absolute() and '..' not in p.parts and len(path) < 180
                    and all(re.fullmatch(r'[A-Za-z0-9_. -]+', part) for part in p.parts))

        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            for name, content in body.files.items():
                if not safe_path(name) or not isinstance(content, str):
                    raise HTTPException(400, 'Invalid project path or content')
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)

            sources = sorted(str(p.relative_to(root)) for p in root.rglob('*.c'))
            if not sources:
                (root / 'main.c').write_text(body.source)
                sources = ['main.c']
            elif body.entry and safe_path(body.entry) and body.entry in sources:
                if len(sources) == 1:
                    (root / body.entry).write_text(body.source)

            start = time.monotonic()
            if body.mode == 'web':
                # SDL2 is opt-in, not forced for every web build.
                # Accept a constrained compiler selector without changing the API contract.
                use_sdl = body.compiler.lower() in ('sdl2', 'emscripten-sdl2', 'emcc-sdl2')
                cmd = ['emcc', *sources, '-o', 'index.html',
                       '-sSINGLE_FILE=1', '-sALLOW_MEMORY_GROWTH=1',
                       '-sMAXIMUM_MEMORY=268435456', '-O1', '--profiling']
                if use_sdl:
                    cmd.append('-sUSE_SDL=2')
            else:
                cc = body.compiler if body.compiler in ('gcc', 'clang') else 'gcc'
                cmd = [cc, *sources, '-o', 'program', '-O1', '-Wall', '-Wextra',
                       '-std=gnu17', '-lm', '-pthread']

            try:
                comp = subprocess.run(cmd, cwd=root, capture_output=True,
                                      text=True, timeout=35)
            except subprocess.TimeoutExpired:
                return {'ok': False, 'status_id': 5, 'status': 'Compile timeout',
                        'compile_output': 'Compilation timed out'}
            if comp.returncode:
                return {'ok': False, 'status_id': 6, 'status': 'Compilation Error',
                        'compile_output': comp.stderr[:30000]}

            if body.mode == 'web':
                html = (root / 'index.html').read_text()
                if len(html) > 9_000_000:
                    return {'ok': False, 'status_id': 6,
                            'compile_output': 'Web build exceeds 9 MB preview limit'}
                return {'ok': True, 'status_id': 3, 'status': 'Web build ready',
                        'html': html, 'compile_output': comp.stderr[:10000],
                        'time': round(time.monotonic() - start, 3)}

            try:
                proc = subprocess.run(['./program'], input=body.stdin, cwd=root,
                                      capture_output=True, text=True, timeout=8,
                                      errors='replace')
            except subprocess.TimeoutExpired:
                return {'ok': False, 'status_id': 5, 'status': 'Execution timeout',
                        'stderr': 'Execution exceeded 8 seconds'}
            return {'ok': proc.returncode == 0,
                    'status_id': 3 if proc.returncode == 0 else 11,
                    'status': 'Finished' if proc.returncode == 0 else 'Runtime Error',
                    'stdout': proc.stdout[:50000], 'stderr': proc.stderr[:50000],
                    'compile_output': comp.stderr[:30000], 'exit_code': proc.returncode,
                    'time': round(time.monotonic() - start, 3)}


    @server.post('/run-stream')
    def run_stream(body: Request, x_runner_secret: str | None = Header(None)):
        from fastapi.responses import StreamingResponse
        import json, queue, threading
        auth(x_runner_secret)
        if body.mode != 'console':
            raise HTTPException(400, 'Streaming supports console mode only')
        if len(body.files) > 80 or sum(len(v) for v in body.files.values()) > 600000:
            raise HTTPException(413, 'Project too large')
        def event(kind, **kwargs):
            return 'data: ' + json.dumps({'type': kind, **kwargs}) + '\n\n'
        def generate():
            with tempfile.TemporaryDirectory() as tmp:
                root = pathlib.Path(tmp)
                def safe_path(path):
                    p = pathlib.PurePosixPath(path)
                    return (not p.is_absolute() and '..' not in p.parts and len(path) < 180
                            and all(re.fullmatch(r'[A-Za-z0-9_. -]+', part) for part in p.parts))
                for name, content in body.files.items():
                    if not isinstance(content, str) or not safe_path(name):
                        yield event('error', message='Invalid project path or content'); return
                    target = root / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(content)
                sources = sorted(str(f.relative_to(root)) for f in root.rglob('*.c'))
                if not sources:
                    (root/'main.c').write_text(body.source)
                    sources = ['main.c']
                elif body.entry and body.entry in sources and len(sources) == 1:
                    (root/body.entry).write_text(body.source)
                cc = body.compiler if body.compiler in ('gcc','clang') else 'gcc'
                cmd = [cc, *sources, '-o', 'program', '-O1', '-Wall', '-Wextra', '-std=gnu17', '-lm', '-pthread']
                yield event('status', message='Compiling')
                try:
                    comp = subprocess.run(cmd, cwd=root, capture_output=True, text=True, timeout=35)
                except subprocess.TimeoutExpired:
                    yield event('error', message='Compilation timed out'); return
                if comp.stderr:
                    yield event('compile', text=comp.stderr[:30000])
                if comp.returncode:
                    yield event('error', message='Compilation failed'); return
                yield event('status', message='Running')
                # A PTY makes C stdout line-buffered and preserves carriage returns and ANSI codes.
                import pty, select, signal
                master, slave = pty.openpty()
                proc = None
                try:
                    proc = subprocess.Popen(['./program'], cwd=root, stdin=subprocess.PIPE,
                        stdout=slave, stderr=slave, start_new_session=True, close_fds=True)
                    os.close(slave)
                    slave = -1
                    if proc.stdin:
                        try:
                            proc.stdin.write(body.stdin.encode('utf-8'))
                            proc.stdin.close()
                        except BrokenPipeError:
                            pass
                    deadline = time.monotonic() + 8
                    total = 0
                    while time.monotonic() < deadline:
                        ready, _, _ = select.select([master], [], [], 0.12)
                        if ready:
                            try: chunk = os.read(master, 4096)
                            except OSError: break
                            if not chunk: break
                            total += len(chunk)
                            if total > 50000:
                                yield event('error', message='Output limit exceeded'); break
                            yield event('stdout', text=chunk.decode('utf-8', 'replace'))
                        if proc.poll() is not None and not ready:
                            break
                    if proc.poll() is None:
                        os.killpg(proc.pid, signal.SIGKILL)
                        yield event('error', message='Execution exceeded 8 seconds')
                    else:
                        yield event('done', exit_code=proc.returncode)
                finally:
                    if slave >= 0: os.close(slave)
                    os.close(master)
                    if proc and proc.poll() is None:
                        os.killpg(proc.pid, signal.SIGKILL)
                        proc.wait()
        return StreamingResponse(generate(), media_type='text/event-stream', headers={
            'Cache-Control':'no-cache, no-transform', 'X-Accel-Buffering':'no'})

    return server
