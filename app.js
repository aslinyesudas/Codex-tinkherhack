// ============================================================
//  SafeRoute — app.js  (Production)
// ============================================================

const SUPABASE_URL  = 'https://zyhdkxjvsdtwdrqporxd.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5aGRreGp2c2R0d2RycXBvcnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMDg5ODYsImV4cCI6MjA4Nzc4NDk4Nn0.iHDscPuVNTr0yxbjILlKGsDXjrLJUYvLaa3zVr9gT_k';
const TABLE          = 'sos_alerts';
const BROADCAST_SECS = 60;
const CRUMB_INTERVAL = 5;

// ─── STATE ───────────────────────────────────────────────────
let state = {
  lat: null, lng: null, accuracy: null,
  gpsReady: false,
  sessionId: null,
  isActive: false,
  timerRemaining: BROADCAST_SECS,
  crumbCount: 0,
  watchId: null,
  broadcastInterval: null,
  timerInterval: null,
  offlineQueue: [],
  contacts: [],
  history: [],
};

try {
  state.contacts = JSON.parse(localStorage.getItem('sr_contacts') || '[]');
  state.history  = JSON.parse(localStorage.getItem('sr_history')  || '[]');
} catch(e) {}

// ─── DOM REFS ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const latDisplay       = $('latDisplay');
const lngDisplay       = $('lngDisplay');
const accDisplay       = $('accDisplay');
const gpsStatus        = $('gpsStatus');
const gpsStatusText    = $('gpsStatusText');
const sosBtn           = $('sosBtn');
const sosBtnLabel      = $('sosBtnLabel');
const sosBtnSub        = $('sosBtnSub');
const sosProgressCirc  = $('sosProgressSvg').querySelector('circle');
const statusChip       = $('statusChip');
const statusText       = $('statusText');
const bgPulse          = $('bgPulse');
const broadcastCard    = $('broadcastCard');
const timerCount       = $('timerCount');
const progressFill     = $('progressFill');
const crumbCount       = $('crumbCount');
const stopBar          = $('stopBar');
const stopBtn          = $('stopBtn');
const sessionIdDisplay = $('sessionIdDisplay');
const contactsList     = $('contactsList');
const historyList      = $('historyList');
const addContactBtn    = $('addContactBtn');
const modalOverlay     = $('modalOverlay');
const modalCancel      = $('modalCancel');
const modalConfirm     = $('modalConfirm');
const toast            = $('toast');
const shareLinkBtn     = $('shareLinkBtn');

// ─── SUPABASE ─────────────────────────────────────────────────
async function insertCrumb({ lat, lng, sessionId, isInitial = false }) {
  const payload = {
    latitude: lat, longitude: lng,
    session_id: sessionId,
    is_initial: isInitial,
    accuracy: state.accuracy,
    user_agent: navigator.userAgent.slice(0, 120),
  };
  if (!navigator.onLine) { state.offlineQueue.push(payload); showToast('⚠️ Offline — queued'); return; }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  } catch(err) {
    console.error('[SafeRoute]', err);
    state.offlineQueue.push(payload);
    showToast('⚠️ Sync error — queued');
  }
}

async function flushQueue() {
  if (!state.offlineQueue.length) return;
  const batch = [...state.offlineQueue];
  state.offlineQueue = [];
  for (const item of batch) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify(item),
      });
    } catch(e) { state.offlineQueue.push(item); }
  }
  if (!state.offlineQueue.length) showToast('✓ Offline queue synced');
}
window.addEventListener('online', flushQueue);

// ─── GPS ──────────────────────────────────────────────────────
function startWatchingGPS() {
  if (!('geolocation' in navigator)) { gpsStatusText.textContent = 'GPS not supported'; return; }
  state.watchId = navigator.geolocation.watchPosition(
    pos => {
      state.lat = pos.coords.latitude;
      state.lng = pos.coords.longitude;
      state.accuracy = pos.coords.accuracy;
      state.gpsReady = true;
      latDisplay.textContent = state.lat.toFixed(6);
      lngDisplay.textContent = state.lng.toFixed(6);
      accDisplay.textContent = `±${Math.round(state.accuracy)}m`;
      gpsStatus.classList.add('locked');
      gpsStatusText.textContent = `GPS locked · ±${Math.round(state.accuracy)}m`;
    },
    err => {
      gpsStatus.classList.remove('locked');
      gpsStatusText.textContent = `GPS error: ${err.message}`;
      state.gpsReady = false;
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 }
  );
}

// ─── SESSION ──────────────────────────────────────────────────
function generateSessionId() {
  return 'SR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
}

function getTrackerURL(sessionId) {
  const base = location.origin + location.pathname.replace('index.html', '') + 'tracker.html';
  return `${base}?session=${sessionId}`;
}

// ─── SOS ACTIVATE ─────────────────────────────────────────────
async function activateSOS() {
  if (!state.gpsReady) { showToast('⏳ Waiting for GPS lock…'); return; }
  if (state.isActive) return;

  state.isActive       = true;
  state.sessionId      = generateSessionId();
  state.timerRemaining = BROADCAST_SECS;
  state.crumbCount     = 0;

  sosBtn.classList.add('triggered');
  sosBtnLabel.textContent = 'LIVE';
  sosBtnSub.textContent   = 'BROADCASTING';
  setStatus('active', 'BROADCASTING');
  bgPulse.classList.add('active');
  broadcastCard.classList.remove('hidden');
  stopBar.classList.remove('hidden');
  sessionIdDisplay.textContent = state.sessionId;
  updateTimerUI();
  progressFill.style.width = '100%';

  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

  await insertCrumb({ lat: state.lat, lng: state.lng, sessionId: state.sessionId, isInitial: true });
  state.crumbCount++;
  crumbCount.textContent = state.crumbCount;

  state.broadcastInterval = setInterval(async () => {
    if (state.gpsReady && state.isActive) {
      await insertCrumb({ lat: state.lat, lng: state.lng, sessionId: state.sessionId });
      state.crumbCount++;
      crumbCount.textContent = state.crumbCount;
    }
  }, CRUMB_INTERVAL * 1000);

  state.timerInterval = setInterval(() => {
    state.timerRemaining--;
    updateTimerUI();
    progressFill.style.width = `${(state.timerRemaining / BROADCAST_SECS) * 100}%`;
    if (state.timerRemaining <= 0) deactivateSOS('timeout');
  }, 1000);

  showToast('🚨 SOS activated! Share tracker link with family →');
}

function updateTimerUI() {
  timerCount.textContent = state.timerRemaining;
  timerCount.style.color = state.timerRemaining <= 10 ? '#ff8888' : state.timerRemaining <= 20 ? '#ffb703' : 'var(--red)';
}

function deactivateSOS(reason = 'manual') {
  if (!state.isActive) return;
  clearInterval(state.broadcastInterval);
  clearInterval(state.timerInterval);
  state.isActive = false;

  const record = { sessionId: state.sessionId, time: new Date().toLocaleString(), crumbs: state.crumbCount, duration: BROADCAST_SECS - state.timerRemaining, reason };
  state.history.unshift(record);
  if (state.history.length > 20) state.history = state.history.slice(0, 20);
  localStorage.setItem('sr_history', JSON.stringify(state.history));
  renderHistory();

  sosBtn.classList.remove('triggered');
  sosBtnLabel.textContent = 'SOS';
  sosBtnSub.textContent   = 'HOLD 2s TO ACTIVATE';
  setStatus('ok', 'SAFE');
  bgPulse.classList.remove('active');
  broadcastCard.classList.add('hidden');
  stopBar.classList.add('hidden');
  sosProgressCirc.style.strokeDashoffset = 553;
  sosProgressCirc.style.opacity = '0';

  if (navigator.vibrate) navigator.vibrate([100,50,100,50,100]);
  setTimeout(() => setStatus('', 'STANDBY'), 4000);
  showToast(reason === 'timeout' ? '✓ Broadcast complete' : '✓ SOS stopped');
}

function setStatus(cls, text) {
  statusChip.className = 'status-chip' + (cls ? ' ' + cls : '');
  statusText.textContent = text;
}

// ─── SHARE TRACKER ────────────────────────────────────────────
shareLinkBtn.addEventListener('click', () => {
  const url = getTrackerURL(state.sessionId);
  if (navigator.share) {
    navigator.share({ title: '🚨 SafeRoute SOS — Track my location', text: 'I triggered an SOS. Track my live location:', url });
  } else {
    navigator.clipboard.writeText(url).then(() => showToast('✓ Tracker link copied!')).catch(() => {
      prompt('Copy this link and send to family:', url);
    });
  }
});

// ─── HOLD BUTTON ──────────────────────────────────────────────
const HOLD_MS = 2000;
const CIRC    = 2 * Math.PI * 88;
let holdStart = null, holdAF = null;

function onHoldStart(e) {
  e.preventDefault();
  if (state.isActive) return;
  holdStart = Date.now();
  sosBtn.classList.add('pressing');
  sosProgressCirc.style.strokeDashoffset = CIRC;
  sosProgressCirc.style.opacity = '1';
  animHold();
}
function animHold() {
  if (!holdStart) return;
  const p = Math.min((Date.now() - holdStart) / HOLD_MS, 1);
  sosProgressCirc.style.strokeDashoffset = CIRC * (1 - p);
  if (p >= 1) { onHoldEnd(); activateSOS(); return; }
  holdAF = requestAnimationFrame(animHold);
}
function onHoldEnd() {
  if (!holdStart) return;
  holdStart = null;
  cancelAnimationFrame(holdAF);
  sosBtn.classList.remove('pressing');
  if (!state.isActive) { sosProgressCirc.style.strokeDashoffset = CIRC; sosProgressCirc.style.opacity = '0'; }
}

sosBtn.addEventListener('mousedown',   onHoldStart);
sosBtn.addEventListener('touchstart',  onHoldStart, { passive: false });
sosBtn.addEventListener('mouseup',     onHoldEnd);
sosBtn.addEventListener('mouseleave',  onHoldEnd);
sosBtn.addEventListener('touchend',    onHoldEnd);
sosBtn.addEventListener('touchcancel', onHoldEnd);
stopBtn.addEventListener('click', () => deactivateSOS('manual'));

// ─── CONTACTS ─────────────────────────────────────────────────
function renderContacts() {
  if (!state.contacts.length) {
    contactsList.innerHTML = '<div style="font-size:11px;color:var(--text-dim);padding:4px 0">No contacts added</div>';
    return;
  }
  contactsList.innerHTML = state.contacts.map((c, i) => `
    <div class="contact-card">
      <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div class="contact-info">
        <div class="contact-name">${c.name}</div>
        <div class="contact-phone">${c.phone}${c.email ? ' · ' + c.email : ''}</div>
      </div>
      <button class="contact-delete" data-idx="${i}">✕</button>
    </div>
  `).join('');
  contactsList.querySelectorAll('.contact-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      state.contacts.splice(+btn.dataset.idx, 1);
      localStorage.setItem('sr_contacts', JSON.stringify(state.contacts));
      renderContacts();
    });
  });
}

addContactBtn.addEventListener('click', () => { modalOverlay.classList.remove('hidden'); $('contactName').focus(); });
modalCancel.addEventListener('click', () => modalOverlay.classList.add('hidden'));
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) modalOverlay.classList.add('hidden'); });
modalConfirm.addEventListener('click', () => {
  const name  = $('contactName').value.trim();
  const phone = $('contactPhone').value.trim();
  const email = $('contactEmail').value.trim();
  if (!name || !phone) { showToast('Name and phone required'); return; }
  state.contacts.push({ name, phone, email });
  localStorage.setItem('sr_contacts', JSON.stringify(state.contacts));
  $('contactName').value = $('contactPhone').value = $('contactEmail').value = '';
  modalOverlay.classList.add('hidden');
  renderContacts();
  showToast(`✓ ${name} added`);
});

// ─── HISTORY ──────────────────────────────────────────────────
function renderHistory() {
  if (!state.history.length) { historyList.innerHTML = '<div class="history-empty">No sessions yet</div>'; return; }
  historyList.innerHTML = state.history.slice(0, 5).map(h => `
    <div class="history-item">
      <div>
        <div style="font-size:11px;color:var(--text)">${h.time}</div>
        <div class="history-session">${h.sessionId}</div>
      </div>
      <div style="text-align:right">
        <div class="history-crumbs">◉ ${h.crumbs} crumbs</div>
        <div class="history-time">${h.duration}s · ${h.reason}</div>
      </div>
    </div>
  `).join('');
}

// ─── TOAST ────────────────────────────────────────────────────
let toastT;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastT);
  toastT = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ─── INIT ─────────────────────────────────────────────────────
startWatchingGPS();
renderContacts();
renderHistory();
window.addEventListener('beforeunload', e => {
  if (state.isActive) { e.preventDefault(); e.returnValue = 'SOS is active! Are you sure?'; }
});