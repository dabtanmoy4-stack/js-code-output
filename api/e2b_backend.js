import Sandbox from "e2b";

const MAX_CODE = 300_000;
const MAX_OUTPUT = 200_000;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000;
const INSTALL_TIMEOUT_MS = 4 * 60 * 1000;

function clamp(value, max = MAX_OUTPUT) {
  const s = String(value ?? "");
  return s.length > max ? s.slice(0, max) + `\n… output truncated after ${max} characters …` : s;
}
function json(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res.status(status).json(body);
}
function unique(a) { return [...new Set(a.filter(Boolean))]; }
function q(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }
function mime(name) {
  const e = String(name).toLowerCase().split(".").pop();
  return ({png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",svg:"image/svg+xml",bmp:"image/bmp",pdf:"application/pdf",csv:"text/csv",txt:"text/plain",json:"application/json",html:"text/html",htm:"text/html"})[e] || null;
}
function packagesFor(code) {
  const map = { PIL:"pillow", cv2:"opencv-python-headless", numpy:"numpy", pandas:"pandas", scipy:"scipy", matplotlib:"matplotlib", seaborn:"seaborn", sympy:"sympy", sklearn:"scikit-learn", requests:"requests", flask:"flask", fastapi:"fastapi", uvicorn:"uvicorn", pygame:"pygame", vpython:"vpython", pyxel:"pyxel", imageio:"imageio", plotly:"plotly", bs4:"beautifulsoup4", yaml:"pyyaml", lxml:"lxml", openpyxl:"openpyxl" };
  const out = [];
  for (const m of String(code).matchAll(/^\s*(?:import|from)\s+([A-Za-z_][A-Za-z0-9_.]*)/gm)) {
    const p = m[1].split(".")[0];
    if (map[p]) out.push(map[p]);
  }
  return unique(out);
}
function prelude() {
  return String.raw`
import os as _j_os, base64 as _j_b64, atexit as _j_atexit
_J_OUT = _j_os.environ.get("JSCO_OUTPUT_DIR", "/home/user/jsco_output")
_j_os.makedirs(_J_OUT, exist_ok=True)
def _j_emit(path):
    try:
        with open(path, "rb") as f: data=f.read()
        print("IMAGE_BASE64_START" + _j_b64.b64encode(data).decode() + "IMAGE_BASE64_END", flush=True)
    except Exception as e: print("[JSCO image error] " + str(e), flush=True)
try:
    import matplotlib as _j_mpl
    _j_mpl.use("Agg")
    import matplotlib.pyplot as _j_plt
    _j_old_show = _j_plt.show
    def _j_show(*a, **kw):
        for i,n in enumerate(list(_j_plt.get_fignums())):
            try:
                p=_j_os.path.join(_J_OUT,f"plot_{i+1}.png"); _j_plt.figure(n).savefig(p,dpi=120,bbox_inches="tight"); _j_emit(p)
            except Exception: pass
        return _j_old_show(*a, **kw)
    _j_plt.show = _j_show
    def _j_flush():
        try:
            for i,n in enumerate(list(_j_plt.get_fignums())):
                p=_j_os.path.join(_J_OUT,f"plot_exit_{i+1}.png"); _j_plt.figure(n).savefig(p,dpi=120,bbox_inches="tight"); _j_emit(p)
        except Exception: pass
    _j_atexit.register(_j_flush)
except Exception: pass
try:
    from PIL import Image as _J_Image
    def _j_pil_show(self,*a,**kw):
        im=self.convert("RGBA") if self.mode not in ("RGB","RGBA","L") else self
        p=_j_os.path.join(_J_OUT,"pil_output.png"); im.save(p); _j_emit(p)
    _J_Image.Image.show=_j_pil_show
except Exception: pass
`;
}
async function main(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "POST") return json(res, 405, {success:false,error:"POST only."});
  if (!process.env.E2B_API_KEY) return json(res,500,{success:false,error:"E2B_API_KEY is not configured in Vercel Environment Variables."});
  const body=req.body||{}; const code=String(body.code||""); const input=String(body.input||"");
  if (!code.trim()) return json(res,400,{success:false,error:"Python code is empty."});
  if (code.length>MAX_CODE) return json(res,413,{success:false,error:`Code is too large. Maximum is ${MAX_CODE} characters.`});
  let sb=null; const started=Date.now();
  try {
    // Current E2B JS SDK accepts Sandbox.create(options) and defaults template to `base`.
    sb=await Sandbox.create({apiKey:process.env.E2B_API_KEY, timeoutMs:SANDBOX_TIMEOUT_MS, allowInternetAccess:true});
    await sb.files.write("/home/user/main.py", prelude()+"\n# --- USER PROGRAM ---\n"+code+"\n# --- END USER PROGRAM ---\n");
    await sb.files.write("/home/user/input.txt",input);
    await sb.commands.run("mkdir -p /home/user/jsco_output",{timeoutMs:10000});
    const pkgs=packagesFor(code); let installedPackages=[]; let packageInstallNote="";
    if(pkgs.length){
      const ins=await sb.commands.run(`python3 -m pip install --disable-pip-version-check --no-input --quiet ${pkgs.map(q).join(" ")}`,{timeoutMs:INSTALL_TIMEOUT_MS});
      if(ins.exitCode===0) installedPackages=pkgs; else packageInstallNote=`Package setup warning:\n${clamp(ins.stderr||ins.stdout||"Package installation failed.")}`;
    }
    const run=await sb.commands.run("cd /home/user && PYTHONUNBUFFERED=1 MPLBACKEND=Agg SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy timeout --signal=TERM --kill-after=5s 600s python3 main.py < input.txt",{timeoutMs:SANDBOX_TIMEOUT_MS+15000});
    const list=await sb.commands.run(`find /home/user/jsco_output -maxdepth 1 -type f -size -${MAX_FILE_BYTES}c -printf '%f\\n' 2>/dev/null | sort`,{timeoutMs:10000});
    const files=[];
    for(const name of unique(String(list.stdout||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean)).slice(0,20)){
      if(!/^[A-Za-z0-9._-]+$/.test(name)) continue; const mt=mime(name); if(!mt) continue;
      const b=await sb.commands.run(`base64 -w0 ${q("/home/user/jsco_output/"+name)}`,{timeoutMs:10000});
      if(b.exitCode===0 && b.stdout) files.push({name,mime:mt,content_base64:String(b.stdout).trim()});
    }
    const ok=run.exitCode===0;
    return json(res,200,{success:ok,status:ok?"success":"error",compiler:"python",output:clamp(run.stdout),stdout:clamp(run.stdout),stderr:clamp(run.stderr),error:ok?"":clamp(run.stderr),exit_code:run.exitCode,time:((Date.now()-started)/1000).toFixed(2),installedPackages,packageInstallNote,files,has_image_output:files.some(f=>/^image\//.test(f.mime))||/IMAGE_BASE64_START[\s\S]*?IMAGE_BASE64_END/.test(run.stdout||"")});
  } catch(e) {
    return json(res,500,{success:false,status:"error",error:clamp(e?.message||e?.toString()||"E2B execution failed."),stdout:"",stderr:clamp(e?.message||e?.toString()),output:"",exit_code:null,time:((Date.now()-started)/1000).toFixed(2)});
  } finally { if(sb) { try{await sb.kill();}catch{} } }
}
export default main;
