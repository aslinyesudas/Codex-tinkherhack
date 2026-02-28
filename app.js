// ============================================================
//  SafeRoute — app.js  (EmailJS Auto-Send)
// ============================================================

const SUPABASE_URL  = 'https://zyhdkxjvsdtwdrqporxd.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5aGRreGp2c2R0d2RycXBvcnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMDg5ODYsImV4cCI6MjA4Nzc4NDk4Nn0.iHDscPuVNTr0yxbjILlKGsDXjrLJUYvLaa3zVr9gT_k';
const TABLE          = 'sos_alerts';
const BROADCAST_SECS = 60;
const CRUMB_INTERVAL = 5;

// ─── EMAILJS CONFIG — Replace these 3 values ─────────────────
const EMAILJS_PUBLIC_KEY  = 'v8t5wU6pkD458p_J9';       // 🔧 Account → Public Key
const EMAILJS_SERVICE_ID  = 'service_61t28xj';       // 🔧 Email Services → Service ID
const EMAILJS_TEMPLATE_ID = 'template_e9dqp2d';      // 🔧 Email Templates → Template ID
// ─────────────────────────────────────────────────────────────

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
  selectedReason: null,
};

try {
  state.contacts = JSON.parse(localStorage.getItem('sr_contacts') || '[]');
  state.history  = JSON.parse(localStorage.getItem('sr_history')  || '[]');
} catch(e) {}

// ─── EMAILJS INIT ─────────────────────────────────────────────
emailjs.init(EMAILJS_PUBLIC_KEY);

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
const reasonOverlay    = $('reasonOverlay');
const reasonCancel     = $('reasonCancel');
const reasonConfirm    = $('reasonConfirm');
const reasonDisplay    = $('reasonDisplay');
const notifLog         = $('notifLog');

// ─── SUPABASE ─────────────────────────────────────────────────
async function insertCrumb({ lat, lng, sessionId, isInitial = false }) {
  const payload = {
    latitude: lat, longitude: lng,
    session_id: sessionId,
    is_initial: isInitial,
    accuracy: state.accuracy,
    user_agent: navigator.userAgent.slice(0, 120),
  };
  if (!navigator.onLine) { state.offlineQueue.push(payload); return; }
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
    if (!res.ok) throw new Error(`${res.status}`);
  } catch(err) {
    state.offlineQueue.push(payload);
  }
}

async function flushQueue() {
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
}
window.addEventListener('online', flushQueue);

// ─── GPS ──────────────────────────────────────────────────────
function startWatchingGPS() {
  if (!('geolocation' in navigator)) { gpsStatusText.textContent = 'GPS not supported'; return; }
  state.watchId = navigator.geolocation.watchPosition(
    pos => {
      state.lat      = pos.coords.latitude;
      state.lng      = pos.coords.longitude;
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
function getTrackerURL(sid) {
  const base = location.origin + location.pathname.replace('index.html','') + 'tracker.html';
  return `${base}?session=${sid}`;
}

// ─── EMAIL NOTIFICATIONS ──────────────────────────────────────
async function sendEmailToContact(contact, reason, trackerURL, mapsURL, index) {
  const statusEl = $(`nEmail${index}`);

  // Skip if no email
  if (!contact.email) {
    if (statusEl) { statusEl.textContent = '📧 No email'; statusEl.className = 'notif-tag fail'; }
    return;
  }

  const emailBody = `Hi ${contact.name},

🚨 SAFEROUTE EMERGENCY ALERT

${reason}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 TRACK LIVE LOCATION:
${trackerURL}

🗺️ OPEN IN GOOGLE MAPS:
${mapsURL}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This alert was sent automatically when your contact triggered their SafeRoute SOS.
The live tracker link updates every 5 seconds with their latest GPS position.

Stay safe,
SafeRoute Emergency System`;

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:   contact.email,
      to_name:    contact.name,
      from_name:  'SafeRoute SOS',
      subject:    `🚨 SafeRoute Alert — Someone needs help`,
      message:    emailBody,
      tracker_url: trackerURL,
      maps_url:   mapsURL,
      reason:     reason,
    });

    if (statusEl) { statusEl.textContent = '📧 Email sent ✓'; statusEl.className = 'notif-tag sent'; }
    return true;

  } catch(err) {
    console.error('[EmailJS]', err);
    if (statusEl) { statusEl.textContent = '📧 Failed ✗'; statusEl.className = 'notif-tag fail'; }
    return false;
  }
}

async function notifyAllContacts(sessionId, reason) {
  if (!state.contacts.length) {
    notifLog.innerHTML = `
      <div style="font-size:11px;color:var(--text-dim);padding:6px 0">
        No contacts saved — add contacts below to auto-notify them next time.
      </div>`;
    return;
  }

  const trackerURL = getTrackerURL(sessionId);
  const mapsURL    = `https://maps.google.com/?q=${state.lat},${state.lng}`;

  notifLog.innerHTML = '';

  // Build UI rows for all contacts immediately
  state.contacts.forEach((contact, i) => {
    const item = document.createElement('div');
    item.className = 'notif-item';
    item.innerHTML = `
      <div class="notif-avatar">${contact.name.charAt(0).toUpperCase()}</div>
      <div class="notif-info">
        <div class="notif-name">${contact.name}</div>
        <div class="notif-channels">
          ${contact.email
            ? `<span class="notif-tag sending" id="nEmail${i}">📧 Sending…</span>`
            : `<span class="notif-tag fail">No email saved</span>`
          }
          ${contact.phone
            ? `<span class="notif-tag sending" id="nWA${i}">📱 WhatsApp</span>`
            : ''
          }
        </div>
      </div>
    `;
    notifLog.appendChild(item);
  });

  // Send emails to ALL contacts in parallel
  const emailPromises = state.contacts.map((contact, i) =>
    sendEmailToContact(contact, reason, trackerURL, mapsURL, i)
  );

  // Also open WhatsApp for contacts with phone numbers
  const plainMsg = `🚨 SAFEROUTE ALERT\n\n${reason}\n\n📍 Track my live location:\n${trackerURL}\n\n🗺️ Google Maps:\n${mapsURL}`;

  state.contacts.forEach((contact, i) => {
    if (contact.phone) {
      const phone = contact.phone.replace(/\D/g, '');
      setTimeout(() => {
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(plainMsg)}`, `_wa_${i}`);
        const el = $(`nWA${i}`);
        if (el) { el.textContent = '📱 WhatsApp opened'; el.className = 'notif-tag sent'; }
      }, i * 1500);
    }
  });

  // Wait for all emails
  const results = await Promise.allSettled(emailPromises);
  const sent = results.filter(r => r.value === true).length;
  showToast(`✅ ${sent}/${state.contacts.length} emails sent automatically!`);
}

// ─── REASON PICKER ────────────────────────────────────────────
document.querySelectorAll('.reason-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.reason-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.selectedReason = btn.dataset.reason;
    $('customReason').value = '';
  });
});

$('customReason').addEventListener('input', () => {
  const val = $('customReason').value.trim();
  if (val) {
    document.querySelectorAll('.reason-btn').forEach(b => b.classList.remove('selected'));
    state.selectedReason = val;
  }
});

reasonCancel.addEventListener('click', () => {
  reasonOverlay.classList.add('hidden');
  state.selectedReason = null;
  document.querySelectorAll('.reason-btn').forEach(b => b.classList.remove('selected'));
  $('customReason').value = '';
});

reasonConfirm.addEventListener('click', () => {
  const custom = $('customReason').value.trim();
  if (custom) state.selectedReason = custom;
  if (!state.selectedReason) { showToast('Please select or type a reason'); return; }
  reasonOverlay.classList.add('hidden');
  activateSOS();
});

// ─── SOS ACTIVATE ─────────────────────────────────────────────
async function activateSOS() {
  if (!state.gpsReady) { showToast('⏳ Waiting for GPS lock…'); return; }
  if (state.isActive) return;

  const reason = state.selectedReason || '🆘 Emergency SOS triggered';

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
  reasonDisplay.textContent = `📢 "${reason}"`;
  reasonDisplay.style.display = 'block';
  updateTimerUI();
  progressFill.style.width = '100%';

  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);

  // Save first crumb
  await insertCrumb({ lat: state.lat, lng: state.lng, sessionId: state.sessionId, isInitial: true });
  state.crumbCount++;
  crumbCount.textContent = state.crumbCount;

  // 🔔 AUTO-SEND emails + open WhatsApp
  notifyAllContacts(state.sessionId, reason);

  // Breadcrumb interval
  state.broadcastInterval = setInterval(async () => {
    if (state.gpsReady && state.isActive) {
      await insertCrumb({ lat: state.lat, lng: state.lng, sessionId: state.sessionId });
      state.crumbCount++;
      crumbCount.textContent = state.crumbCount;
    }
  }, CRUMB_INTERVAL * 1000);

  // Countdown
  state.timerInterval = setInterval(() => {
    state.timerRemaining--;
    updateTimerUI();
    progressFill.style.width = `${(state.timerRemaining / BROADCAST_SECS) * 100}%`;
    if (state.timerRemaining <= 0) deactivateSOS('timeout');
  }, 1000);
}

function updateTimerUI() {
  timerCount.textContent = state.timerRemaining;
  timerCount.style.color = state.timerRemaining <= 10 ? '#ff8888'
                         : state.timerRemaining <= 20 ? '#ffb703'
                         : 'var(--red)';
}

function deactivateSOS(endReason = 'manual') {
  if (!state.isActive) return;
  clearInterval(state.broadcastInterval);
  clearInterval(state.timerInterval);
  state.isActive = false;
  state.selectedReason = null;

  const record = {
    sessionId: state.sessionId,
    time: new Date().toLocaleString(),
    crumbs: state.crumbCount,
    duration: BROADCAST_SECS - state.timerRemaining,
    reason: endReason,
  };
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
  reasonDisplay.style.display = 'none';
  notifLog.innerHTML = '';
  sosProgressCirc.style.strokeDashoffset = 553;
  sosProgressCirc.style.opacity = '0';
  document.querySelectorAll('.reason-btn').forEach(b => b.classList.remove('selected'));
  $('customReason').value = '';

  if (navigator.vibrate) navigator.vibrate([100,50,100,50,100]);
  setTimeout(() => setStatus('', 'STANDBY'), 4000);
  showToast(endReason === 'timeout' ? '✓ Broadcast complete' : '✓ SOS stopped');
}

function setStatus(cls, text) {
  statusChip.className = 'status-chip' + (cls ? ' ' + cls : '');
  statusText.textContent = text;
}

// ─── SHARE LINK ───────────────────────────────────────────────
shareLinkBtn.addEventListener('click', () => {
  const url = getTrackerURL(state.sessionId);
  if (navigator.share) {
    navigator.share({ title: '🚨 SafeRoute SOS', text: `${state.selectedReason || 'SOS Alert'} — Track me live:`, url });
  } else {
    navigator.clipboard.writeText(url)
      .then(() => showToast('✓ Tracker link copied!'))
      .catch(() => prompt('Copy this link:', url));
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
  if (p >= 1) {
    onHoldEnd();
    reasonOverlay.classList.remove('hidden'); // show reason picker
    return;
  }
  holdAF = requestAnimationFrame(animHold);
}
function onHoldEnd() {
  if (!holdStart) return;
  holdStart = null;
  cancelAnimationFrame(holdAF);
  sosBtn.classList.remove('pressing');
  if (!state.isActive) {
    sosProgressCirc.style.strokeDashoffset = CIRC;
    sosProgressCirc.style.opacity = '0';
  }
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
    contactsList.innerHTML = '<div style="font-size:11px;color:var(--text-dim);padding:4px 0">No contacts — add one below</div>';
    return;
  }
  contactsList.innerHTML = state.contacts.map((c, i) => `
    <div class="contact-card">
      <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div class="contact-info">
        <div class="contact-name">${c.name}</div>
        <div class="contact-phone">
          ${c.phone ? '📱 ' + c.phone : ''}
          ${c.email ? ' · 📧 ' + c.email : '<span style="color:#ff8888;font-size:10px"> ⚠ Add email for auto-notify</span>'}
        </div>
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

addContactBtn.addEventListener('click', () => {
  modalOverlay.classList.remove('hidden');
  $('contactName').focus();
});
modalCancel.addEventListener('click', () => modalOverlay.classList.add('hidden'));
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) modalOverlay.classList.add('hidden');
});
modalConfirm.addEventListener('click', () => {
  const name  = $('contactName').value.trim();
  const phone = $('contactPhone').value.trim();
  const email = $('contactEmail').value.trim();
  if (!name) { showToast('Name is required'); return; }
  if (!phone && !email) { showToast('Add at least a phone or email'); return; }
  state.contacts.push({ name, phone, email });
  localStorage.setItem('sr_contacts', JSON.stringify(state.contacts));
  $('contactName').value = $('contactPhone').value = $('contactEmail').value = '';
  modalOverlay.classList.add('hidden');
  renderContacts();
  showToast(`✓ ${name} added — email will be sent automatically on SOS`);
});

// ─── HISTORY ──────────────────────────────────────────────────
function renderHistory() {
  if (!state.history.length) {
    historyList.innerHTML = '<div class="history-empty">No sessions yet</div>';
    return;
  }
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
  if (state.isActive) { e.preventDefault(); e.returnValue = 'SOS is active!'; }
});