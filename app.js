// ============================================================
//  SafeRoute — app.js  FINAL
// ============================================================

// ─── CONFIG ──────────────────────────────────────────────────
const SUPABASE_URL    = 'https://zyhdkxjvsdtwdrqporxd.supabase.co';
const SUPABASE_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5aGRreGp2c2R0d2RycXBvcnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMDg5ODYsImV4cCI6MjA4Nzc4NDk4Nn0.iHDscPuVNTr0yxbjILlKGsDXjrLJUYvLaa3zVr9gT_k';
const EMAILJS_KEY     = 'v8t5wU6pkD458p_J9';
const EMAILJS_SERVICE = 'service_61t28xj';
const EMAILJS_TEMPLATE= 'template_e9dqp2d';
const TABLE           = 'sos_alerts';
const BROADCAST_SECS  = 60;
const CRUMB_INTERVAL  = 5;

// ─── INIT EMAILJS ─────────────────────────────────────────────
emailjs.init(EMAILJS_KEY);

// ─── STATE ───────────────────────────────────────────────────
let state = {
  lat: null, lng: null, accuracy: null,
  gpsReady: false,
  sessionId: null,
  isActive: false,
  timerRemaining: BROADCAST_SECS,
  crumbCount: 0,
  broadcastInterval: null,
  timerInterval: null,
  offlineQueue: [],
  contacts: [],
  history: [],
  selectedReason: null,
};

try {
  state.contacts = JSON.parse(localStorage.getItem('sr_contacts') || '[]');
  state.history  = JSON.parse(localStorage.getItem('sr_history')  || '[]');
} catch(e) {}

// ─── DOM ─────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── GPS ─────────────────────────────────────────────────────
function startGPS() {
  if (!('geolocation' in navigator)) {
    $('gpsStatusText').textContent = 'GPS not supported on this device';
    return;
  }
  navigator.geolocation.watchPosition(
    pos => {
      state.lat      = pos.coords.latitude;
      state.lng      = pos.coords.longitude;
      state.accuracy = pos.coords.accuracy;
      state.gpsReady = true;
      $('latDisplay').textContent    = state.lat.toFixed(6);
      $('lngDisplay').textContent    = state.lng.toFixed(6);
      $('accDisplay').textContent    = `±${Math.round(state.accuracy)}m`;
      $('gpsStatus').classList.add('locked');
      $('gpsStatusText').textContent = `GPS locked · ±${Math.round(state.accuracy)}m`;
    },
    err => {
      $('gpsStatus').classList.remove('locked');
      $('gpsStatusText').textContent = `GPS error: ${err.message}`;
      state.gpsReady = false;
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 }
  );
}

// ─── HELPERS ─────────────────────────────────────────────────
function genSessionId() {
  return 'SR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
}

function getTrackerURL(sid) {
  return location.origin + location.pathname.replace('index.html','') + 'tracker.html?session=' + sid;
}

function setStatus(cls, text) {
  $('statusChip').className = 'status-chip' + (cls ? ' '+cls : '');
  $('statusText').textContent = text;
}

let toastTimer;
function showToast(msg, duration = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), duration);
}

// ─── SUPABASE ─────────────────────────────────────────────────
async function insertCrumb(lat, lng, sessionId, isInitial) {
  const payload = { latitude: lat, longitude: lng, session_id: sessionId, is_initial: isInitial, accuracy: state.accuracy, user_agent: navigator.userAgent.slice(0,120) };
  if (!navigator.onLine) { state.offlineQueue.push(payload); return; }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(r.status);
  } catch(e) { state.offlineQueue.push(payload); }
}

window.addEventListener('online', async () => {
  const batch = [...state.offlineQueue]; state.offlineQueue = [];
  for (const p of batch) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify(p),
      });
    } catch(e) { state.offlineQueue.push(p); }
  }
});

// ─── EMAIL ────────────────────────────────────────────────────
async function sendEmails(sessionId, reason) {
  if (!state.contacts.length) {
    $('notifLog').innerHTML = '<div style="font-size:11px;color:var(--text-dim)">No contacts saved — add contacts to notify them automatically.</div>';
    return;
  }

  const trackerURL = getTrackerURL(sessionId);
  const mapsURL    = `https://maps.google.com/?q=${state.lat},${state.lng}`;
  const body       = `Hi,

🚨 SAFEROUTE EMERGENCY ALERT

${reason}

━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Track live location (updates every 5s):
${trackerURL}

🗺️ Open in Google Maps:
${mapsURL}
━━━━━━━━━━━━━━━━━━━━━━━━━

Sent automatically by SafeRoute SOS.`;

  $('notifLog').innerHTML = '';

  for (let i = 0; i < state.contacts.length; i++) {
    const c = state.contacts[i];

    // Build UI row
    const row = document.createElement('div');
    row.className = 'notif-item';
    row.innerHTML = `
      <div class="notif-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div class="notif-info">
        <div class="notif-name">${c.name}</div>
        <div class="notif-channels">
          ${c.email ? `<span class="notif-tag sending" id="tag_email_${i}">📧 Sending…</span>` : `<span class="notif-tag fail">No email</span>`}
          ${c.phone ? `<span class="notif-tag sending" id="tag_wa_${i}">📱 WhatsApp</span>`     : ``}
        </div>
      </div>`;
    $('notifLog').appendChild(row);

    // Send email
    if (c.email) {
      try {
        await emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, {
          to_email:   c.email,
          to_name:    c.name,
          from_name:  'SafeRoute SOS',
          subject:    `🚨 SafeRoute Alert — ${c.name}, someone needs help!`,
          content:    body,
          message:    body,
          reply_to:   'noreply@saferoute.app',
        });
        const el = $(`tag_email_${i}`);
        if (el) { el.textContent = '📧 Email sent ✓'; el.className = 'notif-tag sent'; }
      } catch(err) {
        console.error('[EmailJS]', err);
        const el = $(`tag_email_${i}`);
        if (el) { el.textContent = '📧 Failed'; el.className = 'notif-tag fail'; }
      }
    }

    // Open WhatsApp
    if (c.phone) {
      const phone = c.phone.replace(/\D/g,'');
      const msg   = `🚨 SAFEROUTE ALERT\n\n${reason}\n\n📍 Track live location:\n${trackerURL}\n\n🗺️ Google Maps:\n${mapsURL}`;
      setTimeout(() => {
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
        const el = $(`tag_wa_${i}`);
        if (el) { el.textContent = '📱 WhatsApp ✓'; el.className = 'notif-tag sent'; }
      }, i * 1000);
    }
  }
}

// ─── SOS ACTIVATE ─────────────────────────────────────────────
async function activateSOS() {
  if (state.isActive) return;

  // Get GPS if not ready
  if (!state.gpsReady) {
    showToast('⏳ Getting GPS fix…');
    await new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          state.lat = pos.coords.latitude;
          state.lng = pos.coords.longitude;
          state.accuracy = pos.coords.accuracy;
          state.gpsReady = true;
          resolve();
        },
        () => {
          if (!state.lat) { state.lat = 0; state.lng = 0; state.accuracy = 9999; }
          resolve();
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });
  }

  const reason = state.selectedReason || '🆘 Emergency SOS triggered';
  state.isActive       = true;
  state.sessionId      = genSessionId();
  state.timerRemaining = BROADCAST_SECS;
  state.crumbCount     = 0;

  // Update UI
  $('sosBtn').classList.add('triggered');
  $('sosBtnLabel').textContent = 'LIVE';
  $('sosBtnSub').textContent   = 'BROADCASTING';
  setStatus('active', 'BROADCASTING');
  $('bgPulse').classList.add('active');
  $('broadcastCard').classList.remove('hidden');
  $('stopBar').classList.remove('hidden');
  $('sessionIdDisplay').textContent = state.sessionId;
  $('reasonDisplay').textContent    = `📢 "${reason}"`;
  $('reasonDisplay').style.display  = 'block';
  $('progressFill').style.width     = '100%';
  updateTimerUI();

  if (navigator.vibrate) navigator.vibrate([200,100,200,100,200]);

  // First crumb
  await insertCrumb(state.lat, state.lng, state.sessionId, true);
  state.crumbCount++;
  $('crumbCount').textContent = state.crumbCount;

  // Send notifications
  sendEmails(state.sessionId, reason);

  // Breadcrumb loop
  state.broadcastInterval = setInterval(async () => {
    if (!state.isActive) return;
    await insertCrumb(state.lat, state.lng, state.sessionId, false);
    state.crumbCount++;
    $('crumbCount').textContent = state.crumbCount;
  }, CRUMB_INTERVAL * 1000);

  // Countdown
  state.timerInterval = setInterval(() => {
    state.timerRemaining--;
    updateTimerUI();
    $('progressFill').style.width = `${(state.timerRemaining / BROADCAST_SECS) * 100}%`;
    if (state.timerRemaining <= 0) stopSOS('timeout');
  }, 1000);
}

function updateTimerUI() {
  $('timerCount').textContent = state.timerRemaining;
  $('timerCount').style.color = state.timerRemaining <= 10 ? '#ff8888'
                              : state.timerRemaining <= 20 ? '#ffb703'
                              : 'var(--red)';
}

function stopSOS(reason = 'manual') {
  if (!state.isActive) return;
  clearInterval(state.broadcastInterval);
  clearInterval(state.timerInterval);
  state.isActive = false;

  // Save history
  state.history.unshift({ sessionId: state.sessionId, time: new Date().toLocaleString(), crumbs: state.crumbCount, duration: BROADCAST_SECS - state.timerRemaining, reason });
  if (state.history.length > 20) state.history.length = 20;
  localStorage.setItem('sr_history', JSON.stringify(state.history));
  renderHistory();

  // Reset UI
  $('sosBtn').classList.remove('triggered');
  $('sosBtnLabel').textContent         = 'SOS';
  $('sosBtnSub').textContent           = 'HOLD 2s TO ACTIVATE';
  $('broadcastCard').classList.add('hidden');
  $('stopBar').classList.add('hidden');
  $('bgPulse').classList.remove('active');
  $('reasonDisplay').style.display     = 'none';
  $('notifLog').innerHTML              = '';
  $('sosProgressSvg').querySelector('circle').style.strokeDashoffset = '553';
  $('sosProgressSvg').querySelector('circle').style.opacity = '0';
  document.querySelectorAll('.reason-btn').forEach(b => b.classList.remove('selected'));
  state.selectedReason = null;

  setStatus('ok', 'SAFE');
  setTimeout(() => setStatus('', 'STANDBY'), 4000);
  if (navigator.vibrate) navigator.vibrate([100,50,100,50,100]);
  showToast(reason === 'timeout' ? '✓ Broadcast complete' : '✓ SOS stopped');
}

// ─── SHARE ───────────────────────────────────────────────────
$('shareLinkBtn').addEventListener('click', () => {
  const url = getTrackerURL(state.sessionId);
  if (navigator.share) {
    navigator.share({ title: '🚨 SafeRoute SOS', text: `${state.selectedReason || 'SOS Alert'} — Track me:`, url });
  } else {
    navigator.clipboard.writeText(url)
      .then(() => showToast('✓ Link copied!'))
      .catch(()  => prompt('Share this link:', url));
  }
});

// ─── HOLD TO ACTIVATE ────────────────────────────────────────
const HOLD_MS = 2000;
const CIRC    = 553; // 2 * PI * 88
let holdStart = null, holdAF = null;
const circle  = $('sosProgressSvg').querySelector('circle');

function holdBegin(e) {
  e.preventDefault();
  if (state.isActive) return;
  holdStart = Date.now();
  $('sosBtn').classList.add('pressing');
  circle.style.opacity          = '1';
  circle.style.strokeDashoffset = CIRC;
  tick();
}
function tick() {
  if (!holdStart) return;
  const p = Math.min((Date.now() - holdStart) / HOLD_MS, 1);
  circle.style.strokeDashoffset = CIRC * (1 - p);
  if (p >= 1) {
    holdEnd();
    $('reasonOverlay').classList.remove('hidden'); // show reason picker
    return;
  }
  holdAF = requestAnimationFrame(tick);
}
function holdEnd() {
  if (!holdStart) return;
  holdStart = null;
  cancelAnimationFrame(holdAF);
  $('sosBtn').classList.remove('pressing');
  if (!state.isActive) {
    circle.style.strokeDashoffset = CIRC;
    circle.style.opacity          = '0';
  }
}

const btn = $('sosBtn');
btn.addEventListener('mousedown',   holdBegin);
btn.addEventListener('touchstart',  holdBegin, { passive: false });
btn.addEventListener('mouseup',     holdEnd);
btn.addEventListener('mouseleave',  holdEnd);
btn.addEventListener('touchend',    holdEnd);
btn.addEventListener('touchcancel', holdEnd);
$('stopBtn').addEventListener('click', () => stopSOS('manual'));

// ─── REASON PICKER ───────────────────────────────────────────
document.querySelectorAll('.reason-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.reason-btn').forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    state.selectedReason = b.dataset.reason;
    $('customReason').value = '';
  });
});
$('customReason').addEventListener('input', () => {
  const v = $('customReason').value.trim();
  if (v) {
    document.querySelectorAll('.reason-btn').forEach(x => x.classList.remove('selected'));
    state.selectedReason = v;
  }
});
$('reasonCancel').addEventListener('click', () => {
  $('reasonOverlay').classList.add('hidden');
  state.selectedReason = null;
  document.querySelectorAll('.reason-btn').forEach(x => x.classList.remove('selected'));
  $('customReason').value = '';
});
$('reasonConfirm').addEventListener('click', () => {
  const v = $('customReason').value.trim();
  if (v) state.selectedReason = v;
  if (!state.selectedReason) { showToast('Please pick or type a reason'); return; }
  $('reasonOverlay').classList.add('hidden');
  activateSOS();
});

// ─── CONTACTS ────────────────────────────────────────────────
function renderContacts() {
  const el = $('contactsList');
  if (!state.contacts.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--text-dim);padding:4px 0">No contacts yet — add one below to auto-notify on SOS</div>';
    return;
  }
  el.innerHTML = state.contacts.map((c,i) => `
    <div class="contact-card">
      <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div class="contact-info">
        <div class="contact-name">${c.name}</div>
        <div class="contact-phone">
          ${c.phone ? '📱 '+c.phone : ''}
          ${c.email ? ' · 📧 '+c.email : '<span style="color:#ff6666;font-size:10px"> ⚠ Add email for auto-alert</span>'}
        </div>
      </div>
      <button class="contact-delete" data-i="${i}">✕</button>
    </div>`).join('');
  el.querySelectorAll('.contact-delete').forEach(b =>
    b.addEventListener('click', () => {
      state.contacts.splice(+b.dataset.i, 1);
      localStorage.setItem('sr_contacts', JSON.stringify(state.contacts));
      renderContacts();
    })
  );
}

$('addContactBtn').addEventListener('click', () => {
  $('modalOverlay').classList.remove('hidden');
  $('contactName').focus();
});
$('modalCancel').addEventListener('click',  () => $('modalOverlay').classList.add('hidden'));
$('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) $('modalOverlay').classList.add('hidden'); });
$('modalConfirm').addEventListener('click', () => {
  const name  = $('contactName').value.trim();
  const phone = $('contactPhone').value.trim();
  const email = $('contactEmail').value.trim();
  if (!name)          { showToast('Name is required'); return; }
  if (!phone && !email) { showToast('Add a phone or email'); return; }
  state.contacts.push({ name, phone, email });
  localStorage.setItem('sr_contacts', JSON.stringify(state.contacts));
  $('contactName').value = $('contactPhone').value = $('contactEmail').value = '';
  $('modalOverlay').classList.add('hidden');
  renderContacts();
  showToast(`✓ ${name} will be auto-notified on SOS`);
});

// ─── HISTORY ─────────────────────────────────────────────────
function renderHistory() {
  const el = $('historyList');
  if (!state.history.length) { el.innerHTML = '<div class="history-empty">No sessions yet</div>'; return; }
  el.innerHTML = state.history.slice(0,5).map(h => `
    <div class="history-item">
      <div>
        <div style="font-size:11px;color:var(--text)">${h.time}</div>
        <div class="history-session">${h.sessionId}</div>
      </div>
      <div style="text-align:right">
        <div class="history-crumbs">◉ ${h.crumbs} crumbs</div>
        <div class="history-time">${h.duration}s · ${h.reason}</div>
      </div>
    </div>`).join('');
}

// ─── INIT ────────────────────────────────────────────────────
startGPS();
renderContacts();
renderHistory();
window.addEventListener('beforeunload', e => {
  if (state.isActive) { e.preventDefault(); e.returnValue = 'SOS is active!'; }
});
