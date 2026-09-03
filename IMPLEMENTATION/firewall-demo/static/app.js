/* ── Three.js background ─────────────────────────────────── */
const canvas = document.getElementById('bg');
const renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true});
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 1000);
camera.position.z = 30;
const geo = new THREE.BufferGeometry();
const n = 800;
const pos = new Float32Array(n*3);
for (let i=0;i<n*3;i++) pos[i] = (Math.random()-0.5)*90;
geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
const mat = new THREE.PointsMaterial({color:0x4F8BF9, size:0.35, transparent:true, opacity:0.7});
const points = new THREE.Points(geo, mat);
scene.add(points);
(function animate(){ requestAnimationFrame(animate); points.rotation.y+=0.0006; points.rotation.x+=0.0002; renderer.render(scene,camera); })();
addEventListener('resize', ()=>{ renderer.setSize(innerWidth,innerHeight); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); });

/* ── App state ───────────────────────────────────────────── */
const app = document.getElementById('app');
let currentUser = null; // { email, name, role }

async function main() {
  const me = await fetch('/api/me').then(r=>r.json());
  if (me.logged_in) {
    currentUser = { email: me.email, name: me.name, role: me.role };
    renderDashboard();
  } else {
    renderLogin();
  }
}

/* ── Login / Signup ──────────────────────────────────────── */

function renderLogin() {
  app.innerHTML = `<div class="glass rounded-2xl p-10 text-center max-w-sm w-full">
    <h1 class="text-3xl font-bold mb-2">LLM Firewall</h1>
    <p class="text-gray-400 text-sm mb-6">Multi-Agent Security Pipeline</p>
    <div id="auth-form"></div>
    <div id="auth-error" class="text-red-400 text-sm mt-3 hidden"></div>
    <div class="mt-4 text-gray-500 text-xs">
      <span id="toggle-auth" class="cursor-pointer hover:text-blue-400 transition-colors"></span>
    </div>
    <div class="mt-4 relative">
      <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-white/10"></div></div>
      <div class="relative flex justify-center text-xs"><span class="bg-transparent px-2 text-gray-500">or</span></div>
    </div>
    <a href="/login" class="mt-4 inline-block px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 font-medium text-sm transition-colors">Log in with Google</a>
  </div>`;
  showLoginForm();
}

function showLoginForm() {
  document.getElementById('auth-form').innerHTML = `
    <input id="auth-email" class="auth-input mb-3" placeholder="Email" type="email">
    <input id="auth-pass" class="auth-input mb-4" placeholder="Password" type="password">
    <button id="auth-btn" class="w-full px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 font-medium transition-colors">Log In</button>`;
  document.getElementById('toggle-auth').textContent = "Don't have an account? Sign up";
  document.getElementById('toggle-auth').onclick = showSignupForm;
  document.getElementById('auth-btn').onclick = doLogin;
  document.getElementById('auth-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

function showSignupForm() {
  document.getElementById('auth-form').innerHTML = `
    <input id="auth-name" class="auth-input mb-3" placeholder="Name" type="text">
    <input id="auth-email" class="auth-input mb-3" placeholder="Email" type="email">
    <input id="auth-pass" class="auth-input mb-4" placeholder="Password" type="password">
    <button id="auth-btn" class="w-full px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-medium transition-colors">Sign Up</button>`;
  document.getElementById('toggle-auth').textContent = "Already have an account? Log in";
  document.getElementById('toggle-auth').onclick = showLoginForm;
  document.getElementById('auth-btn').onclick = doSignup;
  document.getElementById('auth-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doSignup(); });
}

async function doLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-pass').value;
  if (!email || !password) return showAuthError('Please fill in all fields');
  const r = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password})});
  const d = await r.json();
  if (!r.ok) return showAuthError(d.error || 'Login failed');
  currentUser = { email, role: d.role };
  renderDashboard();
}

async function doSignup() {
  const name = document.getElementById('auth-name').value.trim();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-pass').value;
  if (!name || !email || !password) return showAuthError('Please fill in all fields');
  const r = await fetch('/api/signup', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password, name})});
  const d = await r.json();
  if (!r.ok) return showAuthError(d.error || 'Signup failed');
  currentUser = { email, name, role: d.role };
  renderDashboard();
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg; el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

/* ── Dashboard shell ─────────────────────────────────────── */

function renderDashboard() {
  app.className = "min-h-screen flex";
  const adminNav = currentUser?.role === 'admin'
    ? `<button id="tab-admin" class="text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-2">
         <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
         Admin</button>` : '';

  app.innerHTML = `
    <aside class="w-64 p-6 glass m-4 rounded-2xl flex flex-col gap-4 h-fit" style="min-height: calc(100vh - 2rem)">
      <div class="mb-2">
        <h2 class="text-lg font-bold flex items-center gap-2">
          <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          LLM Firewall
        </h2>
      </div>
      <div class="glass rounded-xl p-3">
        <p class="text-xs text-gray-400">Logged in as</p>
        <p class="text-sm break-all font-medium mt-1">${currentUser?.email || ''}</p>
        ${currentUser?.role === 'admin' ? '<span class="inline-block mt-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs font-medium">Admin</span>' : ''}
      </div>
      <nav class="flex flex-col gap-1 mt-2">
        <button id="tab-chat" class="text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-2 nav-active">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          Chat</button>
        <button id="tab-logs" class="text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          Logs</button>
        ${adminNav}
      </nav>
      <div class="mt-auto">
        <a href="/logout" class="block px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-center text-sm text-gray-400 hover:text-white transition-colors">Log out</a>
      </div>
    </aside>
    <main class="flex-1 p-6 overflow-auto"><div id="view"></div></main>`;

  // Bind nav
  const setActive = (btn) => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('nav-active'));
    btn.classList.add('nav-active');
  };
  document.getElementById('tab-chat').onclick = function() { setActive(this); renderChat(); };
  document.getElementById('tab-logs').onclick = function() { setActive(this); renderLogs(); };
  if (document.getElementById('tab-admin')) {
    document.getElementById('tab-admin').onclick = function() { setActive(this); renderAdmin(); };
  }
  renderChat();
}

/* ── Chat view ───────────────────────────────────────────── */

function renderChat() {
  document.getElementById('view').innerHTML = `
    <h1 class="text-2xl font-bold mb-6">Secure Chat</h1>
    <div id="messages" class="flex flex-col gap-4 mb-4 max-w-3xl" style="max-height: calc(100vh - 220px); overflow-y: auto;"></div>
    <div class="flex gap-2 max-w-3xl">
      <input id="prompt" class="flex-1 glass rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-blue-500/50 transition-all" placeholder="Ask something...">
      <button id="send" class="px-5 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 font-medium transition-colors">Send</button>
    </div>`;
  document.getElementById('send').onclick = sendMessage;
  document.getElementById('prompt').addEventListener('keydown', e => { if (e.key==='Enter') sendMessage(); });
}

function renderTraceChips(trace) {
  if (!trace || !trace.length) return '';
  return `<div class="flex flex-wrap gap-1.5 mt-3">
    ${trace.map(t => {
      const cls = t.status === 'pass' ? 'pass' : t.status === 'fail' ? 'fail' : 'unknown';
      return `<span class="trace-chip ${cls}"><span class="dot"></span>${t.stage.replace(/_/g, ' ')}</span>`;
    }).join('')}
  </div>`;
}

async function sendMessage() {
  const input = document.getElementById('prompt');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const messages = document.getElementById('messages');

  // User bubble
  messages.insertAdjacentHTML('beforeend',
    `<div class="glass rounded-xl p-4 self-end max-w-lg ml-auto border-blue-500/20">${escapeHtml(text)}</div>`);

  // Loading indicator
  messages.insertAdjacentHTML('beforeend',
    `<div id="loading-msg" class="glass rounded-xl p-4 max-w-lg">
      <div class="flex items-center gap-2 text-gray-400"><span class="loading-pulse">●</span> Analyzing through security pipeline...</div>
    </div>`);
  messages.scrollTop = messages.scrollHeight;

  const res = await fetch('/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({prompt:text})}).then(r=>r.json());

  // Remove loading
  const loadEl = document.getElementById('loading-msg');
  if (loadEl) loadEl.remove();

  const actionCls = res.action === 'block' ? 'action-block' : res.action === 'review' ? 'action-review' : 'action-allow';
  const actionLabel = res.action || 'unknown';

  // Build the raw response section for blocked prompts
  let rawSection = '';
  if (res.action === 'block' && res.raw_response) {
    rawSection = `
      <div class="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 overflow-hidden">
        <button onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('span').textContent = this.nextElementSibling.classList.contains('hidden') ? '▶' : '▼';"
                class="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2">
          <span>▶</span>
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
          Raw LLM Response (blocked by firewall)
        </button>
        <div class="hidden px-3 pb-3">
          <p class="text-xs text-gray-500 mb-1">⚠️ This is what the LLM would have responded without the firewall:</p>
          <p class="text-sm text-red-300/70 leading-relaxed">${escapeHtml(res.raw_response)}</p>
        </div>
      </div>`;
  }

  messages.insertAdjacentHTML('beforeend', `
    <div class="glass rounded-xl p-4 max-w-lg ${res.action === 'block' ? 'border-red-500/20' : ''}">
      <p class="leading-relaxed">${res.response ? escapeHtml(res.response) : '<em class="text-gray-500">(blocked by security pipeline)</em>'}</p>
      ${rawSection}
      ${renderTraceChips(res.trace)}
      <div class="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
        <div class="flex gap-3 text-xs text-gray-500">
          <span>risk: <span class="font-medium ${res.risk_score >= 0.7 ? 'text-red-400' : res.risk_score >= 0.4 ? 'text-yellow-400' : 'text-green-400'}">${(res.risk_score || 0).toFixed(2)}</span></span>
        </div>
        <span class="text-xs font-semibold uppercase tracking-wider ${actionCls}">${actionLabel}</span>
      </div>
    </div>`);
  messages.scrollTop = messages.scrollHeight;
}

/* ── Logs view ───────────────────────────────────────────── */

async function renderLogs() {
  document.getElementById('view').innerHTML = '<h1 class="text-2xl font-bold mb-6">Request Logs</h1><p class="text-gray-400 loading-pulse">Loading logs...</p>';
  const r = await fetch('/api/logs');
  if (r.status === 403) {
    document.getElementById('view').innerHTML = '<h1 class="text-2xl font-bold mb-6">Request Logs</h1><p class="text-yellow-400">Admin access required to view logs.</p>';
    return;
  }
  const logs = await r.json();
  const total = logs.length;
  const blocked = logs.filter(l => l.action === 'block' || l.final_action === 'blocked').length;
  const reviewed = logs.filter(l => l.action === 'review').length;

  document.getElementById('view').innerHTML = `
    <h1 class="text-2xl font-bold mb-6">Request Logs</h1>
    <div class="flex gap-4 mb-6">
      <div class="metric-card flex-1"><p class="metric-value text-blue-400">${total}</p><p class="metric-label">Total Requests</p></div>
      <div class="metric-card flex-1"><p class="metric-value text-red-400">${blocked}</p><p class="metric-label">Blocked</p></div>
      <div class="metric-card flex-1"><p class="metric-value text-yellow-400">${reviewed}</p><p class="metric-label">Under Review</p></div>
    </div>
    <div class="glass rounded-2xl overflow-hidden">
    <table class="w-full text-sm">
      <thead><tr class="text-left border-b border-white/10 text-gray-400">
        <th class="p-3">Time</th><th class="p-3">Prompt</th><th class="p-3">Action</th><th class="p-3">Risk Score</th><th class="p-3">Flags</th>
      </tr></thead>
      <tbody>${logs.map(l => {
        const act = l.action || l.final_action || '';
        const acCls = act === 'block' || act === 'blocked' ? 'action-block' : act === 'review' ? 'action-review' : 'action-allow';
        let flagList = 'none';
        try {
          const f = typeof l.flags === 'string' ? JSON.parse(l.flags) : l.flags;
          if (f) flagList = Object.entries(f).filter(([,v])=>v).map(([k])=>k).join(', ') || 'none';
        } catch(e) {
          flagList = [l.injection_flag && 'injection', l.hallucination_flag && 'hallucination', l.safety_flag && 'unsafe'].filter(Boolean).join(', ') || 'none';
        }
        return `<tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
          <td class="p-3 text-gray-400 whitespace-nowrap">${(l.timestamp||'').slice(0,19)}</td>
          <td class="p-3 max-w-xs truncate">${escapeHtml(l.prompt||'')}</td>
          <td class="p-3 font-semibold ${acCls}">${act}</td>
          <td class="p-3">${(l.risk_score || 0).toFixed(2)}</td>
          <td class="p-3 text-gray-400">${flagList}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
}

/* ── Admin view ──────────────────────────────────────────── */

async function renderAdmin() {
  const view = document.getElementById('view');
  view.innerHTML = `<h1 class="text-2xl font-bold mb-6 flex items-center gap-2">
    <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
    Admin Dashboard</h1>
    <p class="text-gray-400 loading-pulse mb-4">Running model evaluation...</p>`;

  // Fetch eval + logs in parallel
  const [evalRes, logsRes] = await Promise.all([
    fetch('/api/eval').then(r => r.json()),
    fetch('/api/logs').then(r => r.json()),
  ]);

  const logs = Array.isArray(logsRes) ? logsRes : [];

  view.innerHTML = `
    <h1 class="text-2xl font-bold mb-6 flex items-center gap-2">
      <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
      Admin Dashboard
    </h1>

    <h2 class="text-lg font-semibold mb-4 text-gray-300">Model Evaluation</h2>
    <div class="flex gap-4 mb-8">
      <div class="metric-card flex-1">
        <p class="metric-value" style="color: ${evalRes.accuracy >= 0.9 ? '#4ade80' : evalRes.accuracy >= 0.7 ? '#fbbf24' : '#f87171'}">${(evalRes.accuracy * 100).toFixed(1)}%</p>
        <p class="metric-label">Accuracy</p>
      </div>
      <div class="metric-card flex-1">
        <p class="metric-value" style="color: ${evalRes.precision >= 0.9 ? '#4ade80' : evalRes.precision >= 0.7 ? '#fbbf24' : '#f87171'}">${(evalRes.precision * 100).toFixed(1)}%</p>
        <p class="metric-label">Precision</p>
      </div>
      <div class="metric-card flex-1">
        <p class="metric-value" style="color: ${evalRes.recall >= 0.9 ? '#4ade80' : evalRes.recall >= 0.7 ? '#fbbf24' : '#f87171'}">${(evalRes.recall * 100).toFixed(1)}%</p>
        <p class="metric-label">Recall</p>
      </div>
    </div>

    <div class="flex gap-4 mb-8">
      <div class="glass rounded-xl p-4 flex-1 text-center"><span class="text-green-400 font-bold text-xl">${evalRes.tp}</span><p class="text-xs text-gray-500 mt-1">True Pos</p></div>
      <div class="glass rounded-xl p-4 flex-1 text-center"><span class="text-red-400 font-bold text-xl">${evalRes.fp}</span><p class="text-xs text-gray-500 mt-1">False Pos</p></div>
      <div class="glass rounded-xl p-4 flex-1 text-center"><span class="text-green-400 font-bold text-xl">${evalRes.tn}</span><p class="text-xs text-gray-500 mt-1">True Neg</p></div>
      <div class="glass rounded-xl p-4 flex-1 text-center"><span class="text-red-400 font-bold text-xl">${evalRes.fn}</span><p class="text-xs text-gray-500 mt-1">False Neg</p></div>
    </div>

    <h2 class="text-lg font-semibold mb-4 text-gray-300">Audit Log</h2>
    <div class="glass rounded-2xl overflow-hidden">
    <table class="w-full text-sm">
      <thead><tr class="text-left border-b border-white/10 text-gray-400">
        <th class="p-3">Time</th><th class="p-3">Prompt</th><th class="p-3">Response</th><th class="p-3">Action</th><th class="p-3">Risk</th><th class="p-3">Flags</th>
      </tr></thead>
      <tbody>${logs.map(l => {
        const act = l.action || l.final_action || '';
        const acCls = act === 'block' || act === 'blocked' ? 'action-block' : act === 'review' ? 'action-review' : 'action-allow';
        let flagList = 'none';
        try {
          const f = typeof l.flags === 'string' ? JSON.parse(l.flags) : l.flags;
          if (f) flagList = Object.entries(f).filter(([,v])=>v).map(([k])=>k).join(', ') || 'none';
        } catch(e) { flagList = 'none'; }
        return `<tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
          <td class="p-3 text-gray-400 whitespace-nowrap">${(l.timestamp||'').slice(0,19)}</td>
          <td class="p-3 max-w-[200px] truncate">${escapeHtml(l.prompt||'')}</td>
          <td class="p-3 max-w-[200px] truncate text-gray-400">${escapeHtml((l.response||'').slice(0,80))}</td>
          <td class="p-3 font-semibold ${acCls}">${act}</td>
          <td class="p-3">${(l.risk_score || 0).toFixed(2)}</td>
          <td class="p-3 text-gray-400 text-xs">${flagList}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
}

/* ── Helpers ──────────────────────────────────────────────── */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ── Init ─────────────────────────────────────────────────── */
main();
