"""Modal compiler service. Deployment required. Treat as a starter, not a hardened public multi-tenant sandbox."""
import modal
app = modal.App('js-code-output-c-runner')
image = (modal.Image.debian_slim(python_version='3.11')
         .apt_install('gcc','clang','libc6-dev','emscripten','libsdl2-dev','mesa-common-dev','libgl1-mesa-dev')
         .pip_install('fastapi[standard]'))

@app.function(image=image, timeout=90, cpu=2, memory=2048, secrets=[modal.Secret.from_name('js-c-runner-auth')])
@modal.asgi_app()
def api():
    from fastapi import FastAPI, Header, HTTPException
    from pydantic import BaseModel, Field
    import os, pathlib, subprocess, tempfile, time, re
    server = FastAPI()
    class Request(BaseModel):
        source: str = Field(max_length=300000)
        stdin: str = Field(default='', max_length=50000)
        files: dict[str,str] = Field(default_factory=dict)
        entry: str | None = None
        mode: str = 'console'
        compiler: str = 'gcc'
        flags: str = ''
    def auth(token):
        import hmac
        if not hmac.compare_digest(token or '', os.environ['RUNNER_SHARED_SECRET']):
            raise HTTPException(401, 'Unauthorized')
    @server.get('/health')
    def health(x_runner_secret: str | None = Header(None)):
        auth(x_runner_secret)
        return {'ok':True,'compiler':'gcc/clang/emscripten'}
    @server.post('/run')
    def run(body:Request, x_runner_secret: str | None = Header(None)):
        auth(x_runner_secret)
        if body.mode not in ('console','web'): raise HTTPException(400,'Unsupported mode')
        if len(body.files)>80 or sum(len(x) for x in body.files.values())>600000:
            raise HTTPException(413,'Project too large')
        def safe_path(path):
            p=pathlib.PurePosixPath(path)
            return (not p.is_absolute() and '..' not in p.parts and len(path)<180
                    and all(re.fullmatch(r'[A-Za-z0-9_. -]+',part) for part in p.parts))
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)
            for name, content in body.files.items():
                if not safe_path(name) or not isinstance(content,str):
                    raise HTTPException(400,'Invalid project path or content')
                path=root/name
                path.parent.mkdir(parents=True,exist_ok=True)
                path.write_text(content)
            sources=sorted(str(p.relative_to(root)) for p in root.rglob('*.c'))
            if not sources:
                (root/'main.c').write_text(body.source)
                sources=['main.c']
            elif body.entry and safe_path(body.entry) and body.entry in sources:
                (root/body.entry).write_text(body.source) if len(sources)==1 else None
            # Only allow a known-safe set of build flags, never shell expansion.
            flags=['-O1','-Wall','-Wextra','-std=gnu17']
            start=time.monotonic()
            if body.mode=='web':
                cmd=['emcc',*sources,'-o','index.html','-sSINGLE_FILE=1','-sALLOW_MEMORY_GROWTH=1',
                     '-sUSE_SDL=2','-sMAXIMUM_MEMORY=268435456','-O1']
            else:
                cc=body.compiler if body.compiler in ('gcc','clang') else 'gcc'
                cmd=[cc,*sources,'-o','program',*flags,'-lm','-pthread']
            try:
                comp=subprocess.run(cmd,cwd=root,capture_output=True,text=True,timeout=35)
            except subprocess.TimeoutExpired:
                return {'ok':False,'status_id':5,'status':'Compile timeout','compile_output':'Compilation timed out'}
            if comp.returncode:
                return {'ok':False,'status_id':6,'status':'Compilation Error','compile_output':comp.stderr[:30000]}
            if body.mode=='web':
                html=(root/'index.html').read_text()
                if len(html)>9_000_000:
                    return {'ok':False,'status_id':6,'compile_output':'Web build exceeds 9 MB preview limit'}
                return {'ok':True,'status_id':3,'status':'Web build ready','html':html,
                        'compile_output':comp.stderr[:10000],'time':round(time.monotonic()-start,3)}
            try:
                proc=subprocess.run(['./program'],input=body.stdin,cwd=root,capture_output=True,
                                    text=True,timeout=8,errors='replace')
            except subprocess.TimeoutExpired:
                return {'ok':False,'status_id':5,'status':'Execution timeout','stderr':'Execution exceeded 8 seconds'}
            return {'ok':proc.returncode==0,'status_id':3 if proc.returncode==0 else 11,
                    'status':'Finished' if proc.returncode==0 else 'Runtime Error',
                    'stdout':proc.stdout[:50000],'stderr':proc.stderr[:50000],
                    'compile_output':comp.stderr[:30000],'exit_code':proc.returncode,
                    'time':round(time.monotonic()-start,3)}
    return server
