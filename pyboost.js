/* Python Runner Boost: shared pass, currency, Razorpay checkout and the offer screen */
(function () {
  var TOTAL = 10, KEY = 'pyb_pass', CKEY = 'pyb_currency', MAIN = 'py_runner_boost.html';   // MAIN = your runner page
  var PRICES = { INR: 3, USD: 0.5, EUR: 0.5, GBP: 0.4, AED: 2, CAD: 0.7, AUD: 0.8 }; // display only; server decides the real amount
  var REGION = { US: 'USD', GB: 'GBP', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', IN: 'INR', AE: 'AED', CA: 'CAD', AU: 'AUD' };
  var FEATS = [
    ['three.js', '3D scenes in the 3D Preview tab', 'scene.add(cube)', 'rotating cube, 60 fps'],
    ['PIL', 'Create and edit images', 'Image.new("RGB", (64, 64)).size', '(64, 64)'],
    ['numpy', 'Fast arrays and math', 'np.arange(6).reshape(2, 3).sum(axis=0)', '[3 5 7]'],
    ['matplotlib', 'Charts and plots', 'plt.plot([1, 2, 3], [1, 4, 9])', 'line chart image'],
    ['sklearn', 'Machine learning models', 'LinearRegression().fit([[1],[2],[3]], [2,4,6]).coef_', '[2.]'],
    ['sympy', 'Symbolic algebra', 'solve(x**2 - 4)', '[-2, 2]'],
    ['pandas', 'Tables and data analysis', 'pd.Series([1, 2, 3]).mean()', '2.0']
  ];

  function pass() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }
  function currency() {
    var q = new URLSearchParams(location.search).get('cur'), c;
    if (q && PRICES[q.toUpperCase()]) return q.toUpperCase();
    try { c = localStorage.getItem(CKEY); } catch (e) {}
    if (c && PRICES[c]) return c;
    return REGION[((navigator.language || 'en-US').split('-')[1] || 'US').toUpperCase()] || 'USD';
  }
  function money(c) {
    var v = PRICES[c];
    return new Intl.NumberFormat(navigator.language, { style: 'currency', currency: c, minimumFractionDigits: Number.isInteger(v) ? 0 : 2 }).format(v);
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  async function api(path, body) {
    var r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }
  function loadRzp() {
    return new Promise(function (ok, no) {
      if (window.Razorpay) return ok();
      var s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = ok; s.onerror = function () { no(new Error('Could not load Razorpay checkout.')); };
      document.head.appendChild(s);
    });
  }

  // Opens Razorpay, verifies on the server, stores the signed pass (0 of 10 used)
  async function payInner(cur) {
    var o = await api('/api/create-order', { currency: cur });
    await loadRzp();
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch (e) {} }
    return new Promise(function (ok, no) {
      var rz = new Razorpay({
        key: o.key, order_id: o.id, amount: o.amount, currency: o.currency,
        name: 'Python Runner Boost', description: '10 code runs',
        image: location.origin + '/logo.jpeg', theme: { color: '#e8c77f' },
        handler: async function (resp) {
          try { var v = await api('/api/verify-payment', resp); save({ token: v.token, used: 0 }); ok(); }
          catch (e) { no(new Error('Payment received but could not be confirmed. Payment ID: ' + resp.razorpay_payment_id)); }
        },
        modal: { ondismiss: function () { no(new Error('cancelled')); } }
      });
      rz.on('payment.failed', function (e) { no(new Error((e.error && e.error.description) || 'Payment failed')); });
      rz.open();
    });
  }

  async function pay(cur) {
    window.PyB.paying = true;
    try { return await payInner(cur); } finally { window.PyB.paying = false; }
  }

  // Spends one key if the pass is real and not used up
  async function spend() {
    var p = pass();
    if (!p || p.used >= TOTAL) return false;
    try {
      var r = await api('/api/check-pass', { token: p.token });
      if (!r.valid) { try { localStorage.removeItem(KEY); } catch (e) {} return false; }
    } catch (e) { /* server unreachable: do not punish a paying user */ }
    p.used++; save(p); return true;
  }

  var CSS = '' +
    '.pb-root{position:relative;min-height:100vh;background:radial-gradient(ellipse at 12% 0%,rgba(155,118,32,.16),transparent 42%),#09090b;color:#f5f3ee;font:14px Inter,system-ui,sans-serif;white-space:normal;text-align:left}' +
    '.pb-fire{position:fixed;left:0;right:0;bottom:0;height:48vh;pointer-events:none;overflow:hidden;z-index:0}' +
    '.pb-fire:before,.pb-fire:after{content:"";position:absolute;left:-10%;right:-10%;bottom:-35%;height:95%;background:radial-gradient(ellipse at 50% 100%,rgba(255,72,56,.3),rgba(255,72,56,.08) 45%,transparent 70%);animation:pbFlick 3.2s ease-in-out infinite alternate}' +
    '.pb-fire:after{background:radial-gradient(ellipse at 28% 100%,rgba(255,150,70,.22),transparent 60%);animation-duration:4.6s;animation-delay:-1.4s}' +
    '.pb-fire i{position:absolute;bottom:-10px;width:4px;height:4px;border-radius:50%;background:#ff7a5c;box-shadow:0 0 8px 2px rgba(255,90,60,.65);opacity:0;animation:pbRise linear infinite}' +
    '@keyframes pbFlick{from{transform:scaleY(.82);opacity:.6}to{transform:scaleY(1.1);opacity:1}}' +
    '@keyframes pbRise{0%{transform:translate(0,0);opacity:0}15%{opacity:.9}100%{transform:translate(var(--dx),-42vh);opacity:0}}' +
    '@media(prefers-reduced-motion:reduce){.pb-fire i,.pb-fire:before,.pb-fire:after{animation:none}.pb-fire i{display:none}}' +
    '.pb-main{position:relative;z-index:1;max-width:1100px;margin:0 auto;padding:clamp(20px,4vw,44px) clamp(16px,4vw,48px) 90px}' +
    '.pb-brand{display:flex;align-items:center;gap:12px;margin-bottom:clamp(24px,5vw,48px)}' +
    '.pb-brand img{width:40px;height:40px;border-radius:10px;object-fit:cover;border:1px solid #e8c77f}' +
    '.pb-brand strong{font-size:16px;font-weight:800}' +
    '.pb-hero{display:grid;grid-template-columns:1.4fr 1fr;gap:30px;align-items:center;margin-bottom:38px}' +
    '.pb-hero h2{margin:0 0 12px;font-size:clamp(28px,4.6vw,46px);line-height:1.08;font-weight:900;letter-spacing:-1.2px}' +
    '.pb-hero p{margin:0;color:#a5a2aa;font-size:15px;line-height:1.6;max-width:52ch}' +
    '.pb-price{padding:24px;border:1px solid #e8c77f;border-radius:18px;background:rgba(21,21,24,.92);box-shadow:0 18px 55px rgba(0,0,0,.5),0 0 40px rgba(255,72,56,.12)}' +
    '.pb-amt{font-size:46px;font-weight:900;letter-spacing:-1.5px;color:#e8c77f;line-height:1}' +
    '.pb-sub{margin:8px 0 16px;color:#a5a2aa;font-size:13px}' +
    '.pb-price label{display:block;margin-bottom:6px;color:#a5a2aa;font-size:12px}' +
    '.pb-price select{width:100%;padding:10px 12px;margin-bottom:14px;border-radius:10px;border:1px solid #393126;background:#1b1b1f;color:#f5f3ee;font-size:13px}' +
    '.pb-pay{width:100%;padding:14px;border-radius:11px;border:1px solid #e8c77f;background:linear-gradient(180deg,#e8c77f,#b68a42);color:#2d1a04;font-size:15px;font-weight:800;cursor:pointer}' +
    '.pb-pay:disabled{opacity:.6;cursor:default}' +
    '.pb-err{min-height:18px;margin-top:10px;color:#ff7185;font-size:12.5px}' +
    '.pb-safe{margin-top:6px;color:#77747d;font-size:12px;text-align:center}' +
    '.pb-feats{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px}' +
    '.pb-feat{padding:18px;border:1px solid rgba(232,199,127,.17);border-radius:14px;background:rgba(21,21,24,.88)}' +
    '.pb-feat h4{margin:0 0 3px;font-size:15px;font-weight:800}' +
    '.pb-feat p{margin:0 0 12px;color:#a5a2aa;font-size:12.5px}' +
    '.pb-code{margin:0;padding:10px 12px;border-radius:9px;background:#0e0e11;border:1px solid rgba(232,199,127,.17);font:11.5px/1.55 "JetBrains Mono",monospace;color:#a5a2aa;overflow-x:auto;white-space:pre}' +
    '.pb-code b{display:block;color:#69e6a1;font-weight:500}' +
    '.pb-link{display:inline-block;margin-top:26px;color:#4da3ff;font-size:15px;text-decoration:underline}' +
    '@media(max-width:760px){.pb-hero{grid-template-columns:1fr}}';

  function mountOffer(el, o) {
    o = o || {};
    if (!document.getElementById('pb-css')) {
      var st = document.createElement('style'); st.id = 'pb-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    el.classList.add('pb-root');
    el.innerHTML =
      '<div class="pb-fire"></div><div class="pb-main">' +
      '<div class="pb-brand"><img src="logo.jpeg" alt=""><strong>Python Runner Boost</strong></div>' +
      '<div class="pb-hero"><div><h2>Run real Python libraries in your browser</h2>' +
      '<p>One pass gives you 10 code runs. Every run uses one key, and the meter at the top of the runner shows how many you have used.</p></div>' +
      '<div class="pb-price"><div class="pb-amt"></div><div class="pb-sub">10 code runs, one key per run</div>' +
      '<label>Currency</label><select>' + Object.keys(PRICES).map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="pb-pay"></button><div class="pb-err" role="alert"></div><div class="pb-safe">Secure checkout by Razorpay</div></div></div>' +
      '<div class="pb-feats">' + FEATS.map(function (f) {
        return '<div class="pb-feat"><h4>' + f[0] + '</h4><p>' + f[1] + '</p><pre class="pb-code">' + esc(f[2]) + '<b>' + esc(f[3]) + '</b></pre></div>';
      }).join('') + '</div>' +
      (o.more ? '<a class="pb-link" href="py_runner_boost_feature.html">More about features</a>'
              : '<a class="pb-link" href="' + MAIN + '">Back to Python Runner</a>') +
      '</div>';

    var fire = el.querySelector('.pb-fire');
    for (var i = 0; i < 16; i++) {
      var e = document.createElement('i');
      e.style.left = (Math.random() * 100) + '%';
      e.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
      e.style.animationDuration = (3 + Math.random() * 4) + 's';
      e.style.animationDelay = (-Math.random() * 6) + 's';
      fire.appendChild(e);
    }

    var sel = el.querySelector('select'), btn = el.querySelector('.pb-pay'), err = el.querySelector('.pb-err'), amt = el.querySelector('.pb-amt');
    function label() { var c = sel.value; amt.textContent = money(c); btn.textContent = 'Pay ' + money(c); }
    sel.value = currency(); label();
    sel.onchange = function () { try { localStorage.setItem(CKEY, sel.value); } catch (e) {} label(); };
    btn.onclick = async function () {
      err.textContent = ''; btn.disabled = true; btn.textContent = 'Opening secure checkout...';
      try {
        await pay(sel.value);
        btn.textContent = 'Payment successful';
        if (o.onPaid) o.onPaid();
        return;
      } catch (e) { if (e.message !== 'cancelled') err.textContent = e.message || 'Payment failed. Try again.'; }
      btn.disabled = false; label();
    };
  }

  window.PyB = { TOTAL: TOTAL, main: MAIN, pass: pass, spend: spend, pay: pay, currency: currency, money: money, mountOffer: mountOffer, paying: false };
})();
