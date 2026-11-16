/* JS CODE OUTPUT live interactive Python bridge client. */
(function () {
  const interactivePattern = /(^|\n)\s*(?:import\s+(?:vpython|pygame|arcade|pyxel|tkinter|PyQt6|PySide6|kivy)|from\s+(?:vpython|pygame|arcade|pyxel|tkinter|PyQt6|PySide6|kivy)\b)|cv2\.VideoCapture\s*\(\s*0\s*\)/i;
  const isVPython = code => /(^|\n)\s*(?:import\s+vpython|from\s+vpython\s+import)/im.test(code);
  const needsCamera = code => /cv2\.VideoCapture\s*\(\s*0\s*\)/i.test(code);
  const el = (tag, style, text) => { const n = document.createElement(tag); if (style) n.style.cssText = style; if (text != null) n.textContent = text; return n; };

  async function start(code, ui) {
    let cameraStream = null, cameraTimer = null, socket = null, session = null;
    const preview = ui.preview;
    if (!preview) throw new Error('Live preview panel is unavailable.');

    // Request camera permission from the user's explicit Run action, before Python starts.
    if (needsCamera(code)) {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support camera access. Use HTTPS and allow camera permission.');
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 8, max: 12 } }, audio: false });
    }

    const response = await fetch('/api/modal_live_session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', code })
    });
    const payloadText = await response.text();
    let data; try { data = payloadText ? JSON.parse(payloadText) : null; } catch (_) { data = null; }
    if (!response.ok || !data?.success || !data.websocketUrl) {
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
      throw new Error(data?.error || `Could not start interactive Modal session (HTTP ${response.status}).`);
    }
    session = data;

    preview.innerHTML = '';
    preview.style.cssText = 'display:flex;flex-direction:column;position:relative;flex:1 1 0;width:100%;height:100%;min-height:520px;max-height:none;background:#080b14;border-radius:8px;overflow:hidden;color:#eee';
    const bar = el('div', 'display:flex;align-items:center;gap:8px;padding:8px 10px;background:#151518;border-bottom:1px solid #8a6a3f55;flex-wrap:wrap');
    const label = el('strong', 'font:600 12px Inter,system-ui;color:#e8c77f', 'Live Python Session');
    const state = el('span', 'font:12px Inter,system-ui;color:#a9a9ad', 'Connecting…');
    const spacer = el('span', 'flex:1');
    const cameraBtn = el('button', 'border:1px solid #9d7b43;border-radius:7px;padding:5px 9px;background:#24221f;color:#e8c77f;font:12px Inter,system-ui', cameraStream ? 'Camera enabled' : 'Enable camera');
    cameraBtn.type = 'button'; cameraBtn.disabled = !!cameraStream || !navigator.mediaDevices?.getUserMedia;
    const stopBtn = el('button', 'border:1px solid #a44;border-radius:7px;padding:5px 9px;background:#321c20;color:#ffb6bd;font:12px Inter,system-ui', 'Stop session'); stopBtn.type = 'button';
    bar.append(label, state, spacer, cameraBtn, stopBtn);
    const stage = el('div', 'position:relative;flex:1;min-height:0;overflow:hidden;background:#080b14;display:flex;align-items:center;justify-content:center;outline:none');
    stage.tabIndex = 0;
    const frame = el('img', 'display:block;width:100%;height:100%;object-fit:contain;user-select:none');
    frame.alt = 'Live Python virtual display'; frame.draggable = false;
    const log = el('pre', 'display:none;max-height:120px;overflow:auto;margin:0;padding:8px 12px;background:#101014;color:#d8d3c8;font:11px/1.45 ui-monospace,monospace;white-space:pre-wrap');
    stage.appendChild(frame);
    preview.append(bar, stage, log);
    ui.output.style.display = 'none';
    ui.showOutputTab('3dpreview');

    const vp = isVPython(code);
    if (vp && data.vpythonUrl) {
      const iframe = el('iframe', 'display:block;width:100%;height:100%;border:0;background:#080b14');
      iframe.title = 'VPython live 3D canvas'; iframe.src = data.vpythonUrl;
      stage.replaceChildren(iframe);
      state.textContent = 'VPython canvas connecting…';
    }

    const ws = new WebSocket(data.websocketUrl); socket = ws;
    const send = obj => { if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj)); };
    const sendPointer = (kind, ev) => {
      const r = stage.getBoundingClientRect();
      const x = Math.round((ev.clientX - r.left) / Math.max(1, r.width) * 1280);
      const y = Math.round((ev.clientY - r.top) / Math.max(1, r.height) * 800);
      send({ type: kind, x, y });
    };
    stage.addEventListener('pointerdown', ev => { stage.focus(); stage.setPointerCapture?.(ev.pointerId); sendPointer('mousedown', ev); });
    stage.addEventListener('pointerup', ev => sendPointer('mouseup', ev));
    let lastMove = 0; stage.addEventListener('pointermove', ev => { const now = performance.now(); if (ev.buttons || now - lastMove > 55) { lastMove = now; sendPointer('mousemove', ev); } });
    stage.addEventListener('contextmenu', ev => ev.preventDefault());
    const keyMap = ev => ({ Control: 'ctrl', Meta: 'win', Escape: 'esc', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'enter', Backspace: 'backspace', Tab: 'tab', ' ': 'space' }[ev.key] || (ev.key.length === 1 ? ev.key.toLowerCase() : ev.key.toLowerCase()));
    stage.addEventListener('keydown', ev => { if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Tab'].includes(ev.key)) ev.preventDefault(); send({ type: 'keydown', key: keyMap(ev) }); });
    stage.addEventListener('keyup', ev => send({ type: 'keyup', key: keyMap(ev) }));
    window.addEventListener('blur', () => { ['shift','ctrl','alt','space','up','down','left','right','w','a','s','d'].forEach(key => send({ type: 'keyup', key })); });

    function startCamera() {
      if (cameraStream || !navigator.mediaDevices?.getUserMedia) return;
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 8 }, audio: false }).then(stream => {
        cameraStream = stream; cameraBtn.textContent = 'Camera enabled'; cameraBtn.disabled = true;
        const video = document.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = stream;
        const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 360; const ctx = canvas.getContext('2d');
        video.play().catch(() => {});
        cameraTimer = setInterval(() => {
          if (video.readyState >= 2 && socket?.readyState === WebSocket.OPEN) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.55);
            send({ type: 'camera', data: dataUrl.split(',')[1] });
          }
        }, 180);
      }).catch(err => { state.textContent = 'Camera permission denied: ' + err.message; });
    }
    cameraBtn.addEventListener('click', startCamera);
    if (cameraStream) {
      const video = document.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = cameraStream;
      const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 360; const ctx = canvas.getContext('2d');
      video.play().catch(() => {});
      cameraTimer = setInterval(() => {
        if (video.readyState >= 2 && socket?.readyState === WebSocket.OPEN) { ctx.drawImage(video,0,0,480,360); send({type:'camera',data:canvas.toDataURL('image/jpeg',0.55).split(',')[1]}); }
      }, 180);
    }

    let stopped = false;
    async function stop() {
      if (stopped) return; stopped = true;
      send({ type: 'stop' });
      try { socket?.close(1000, 'User stopped session'); } catch (_) {}
      if (cameraTimer) clearInterval(cameraTimer);
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
      stopBtn.disabled = true; stopBtn.textContent = 'Session stopped'; state.textContent = 'Stopped';
      try { await fetch('/api/modal_live_session', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'stop',sessionId:data.sessionId}) }); } catch (_) {}
    }
    stopBtn.addEventListener('click', stop);
    ws.onopen = () => { state.textContent = vp ? 'Live session connected · VPython canvas in frame' : 'Live display connected · click preview to send keyboard/mouse'; if (!vp) stage.focus(); if (cameraStream) cameraBtn.textContent = 'Camera enabled'; };
    ws.onmessage = ev => {
      let msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (msg.type === 'frame' && !vp) frame.src = 'data:image/jpeg;base64,' + msg.data;
      else if (msg.type === 'log' && msg.text) { log.style.display = 'block'; log.textContent = (log.textContent + msg.text).slice(-12000); log.scrollTop = log.scrollHeight; }
      else if (msg.type === 'warning') state.textContent = msg.message;
      else if (msg.type === 'exit') state.textContent = `Python process exited (${msg.code}).`;
      else if (msg.type === 'stopped') state.textContent = 'Stopped';
    };
    ws.onerror = () => { state.textContent = 'Live connection error. Check Modal tunnel and deployment.'; };
    ws.onclose = () => { if (!stopped) state.textContent = 'Live connection closed. The sandbox will expire automatically.'; };
    window.addEventListener('beforeunload', () => { try { send({type:'stop'}); socket?.close(); } catch (_) {} if(cameraStream) cameraStream.getTracks().forEach(t=>t.stop()); }, { once:true });
    ui.setStatus('Interactive Python session ready');
    return { stop };
  }

  window.JSCO_LIVE = {
    shouldUse: code => interactivePattern.test(String(code || '')),
    run: start
  };
})();
