  //  FIREBASE REAL-TIME SYNC
  // ══════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════
  //  GLOBAL CONFIG
  // ══════════════════════════════════════════════════════
  // Charge categories with severity levels
  const CHARGE_CATEGORIES = [
    { id: 'mild',     label: 'Mild',     amount: 0.50, emoji: '😬', color: '#ffa726' },
    { id: 'moderate', label: 'Moderate', amount: 1.00, emoji: '🤬', color: '#e91e8c' },
    { id: 'severe',   label: 'Severe',   amount: 2.00, emoji: '🔥', color: '#ff4444' },
  ];
  // Default charge amount (backward compat)
  const CHARGE_AMOUNT = 1;
  // Maximum a single user can charge others in one calendar day (EST)
  const DAILY_LIMIT = 10;

  // ══════════════════════════════════════════════════════
  //  THEME TOGGLE
  // ══════════════════════════════════════════════════════
  const THEME_KEY = 'swearjar-theme';

  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'light') {
      document.body.classList.add('light-mode');
      updateThemeToggleButton();
    }
  }

  function toggleTheme() {
    const isLight = document.body.classList.contains('light-mode');
    if (isLight) {
      document.body.classList.remove('light-mode');
      localStorage.setItem(THEME_KEY, 'dark');
    } else {
      document.body.classList.add('light-mode');
      localStorage.setItem(THEME_KEY, 'light');
    }
    updateThemeToggleButton();
  }

  function updateThemeToggleButton() {
    const btn = document.getElementById('theme-toggle');
    const isLight = document.body.classList.contains('light-mode');
    btn.textContent = isLight ? '🌙' : '☀️';
    // Update theme-color meta tag for browser UI
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', isLight ? '#ffffff' : '#0d0d1a');
    }
  }

  const FB_CONFIG_KEY = 'swearjar2-firebase';
  let fbDb = null, fbConnected = false, fbFirstLoadDone = false, _fbSyncTimeout = null;
  let _fbInitialized = false; // guard against double-registration
  const _fbListeners = {};    // path → handler refs for .off() cleanup

  // Built-in config — every device connects automatically, no paste needed.
  // Admin can override via Settings → Firebase Sync if needed.
  const BUILT_IN_FB_CONFIG = {
    apiKey: "AIzaSyCGypt6brjLpMaahSe7z3wP_M-6ge1yDXM",
    authDomain: "swear-jar-ef967.firebaseapp.com",
    databaseURL: "https://swear-jar-ef967-default-rtdb.firebaseio.com",
    projectId: "swear-jar-ef967",
    storageBucket: "swear-jar-ef967.firebasestorage.app",
    messagingSenderId: "1032163682260",
    appId: "1:1032163682260:web:53275cad43bd8fb2cc1841",
    measurementId: "G-C21VCCV4GB"
  };

  function loadFbConfig() {
    // Use any admin-saved override first, otherwise fall back to the built-in config
    try { const s = localStorage.getItem(FB_CONFIG_KEY); if (s) return JSON.parse(s); } catch(e) {}
    return BUILT_IN_FB_CONFIG;
  }
  function saveFbConfig(cfg) { localStorage.setItem(FB_CONFIG_KEY, JSON.stringify(cfg)); }

  function fbToArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return Object.keys(val).sort((a,b) => parseInt(a) - parseInt(b)).map(k => val[k]);
  }

  function showLoadingOverlay(msg) {
    document.getElementById('loading-sub-text').textContent = msg || 'Fetching the latest data ☁️';
    document.getElementById('loading-overlay').classList.remove('hidden');
  }
  function hideLoadingOverlay() {
    document.getElementById('loading-overlay').classList.add('hidden');
  }

  function updateDbStatus() {
    const dot  = document.getElementById('db-status-dot');
    const txt  = document.getElementById('db-status-text');
    const sdot = document.getElementById('sync-dot');
    if (!dot) return;
    if (!fbDb) {
      dot.className  = 'db-status-dot local';
      txt.textContent = 'Local only — paste a Firebase config to sync';
      if (sdot) sdot.className = 'sync-dot local';
    } else if (fbConnected) {
      dot.className  = 'db-status-dot connected';
      txt.textContent = 'Connected — syncing in real time ✓';
      if (sdot) sdot.className = 'sync-dot on';
    } else {
      dot.className  = 'db-status-dot disconnected';
      txt.textContent = 'Disconnected — showing last known data';
      if (sdot) sdot.className = 'sync-dot off';
    }
  }

  function applySettingsData(newSettings) {
    settings  = newSettings;
    KIDS      = settings.map(s => s.name);
    COLORS    = Object.fromEntries(settings.map(s => [s.name, s.color]));
    COLOR_HEX = Object.fromEntries(settings.map(s => [s.name, s.color]));
    EMOJI     = Object.fromEntries(settings.map((s,i) => [s.name, SLOT_EMOJI[i] ?? '🧒']));
    PAY_INFO  = Object.fromEntries(settings.map(s => [s.name, s.paymentInfo ?? '']));
  }

  function cleanupFbListeners() {
    if (!fbDb) return;
    Object.entries(_fbListeners).forEach(([path, handler]) => {
      try { fbDb.ref(path).off('value', handler); } catch(e) {}
    });
    Object.keys(_fbListeners).forEach(k => delete _fbListeners[k]);
  }

  function initFirebase(config) {
    // Guard: only register listeners once per page load
    if (_fbInitialized) return true;

    try {
      const existingApps = typeof firebase !== 'undefined' ? firebase.apps : [];
      const app = existingApps.length ? existingApps[0] : firebase.initializeApp(config);
      fbDb = firebase.database(app);
      _fbInitialized = true;

      // Connection health listener
      const connHandler = snap => { fbConnected = !!snap.val(); updateDbStatus(); };
      fbDb.ref('.info/connected').on('value', connHandler);
      _fbListeners['.info/connected'] = connHandler;

      // Fallback: hide overlay after 8s if Firebase never responds
      _fbSyncTimeout = setTimeout(() => {
        if (!fbFirstLoadDone) {
          fbFirstLoadDone = true;
          hideLoadingOverlay();
          toast('⚠️ Sync timeout — showing local data');
        }
      }, 8000);

      // Settings listener
      const settingsHandler = snap => {
        const raw = snap.val();
        if (raw) {
          const ns = fbToArray(raw).map(x => ({ paymentInfo:'', ...x })).filter(x => x.name);
          if (ns.length > 0) {
            applySettingsData(ns);
            localStorage.setItem('swearjar2-settings', JSON.stringify(settings));
            syncUsersWithJar();
          }
        }
      };
      fbDb.ref('/swearjar/jarSettings').on('value', settingsHandler);
      _fbListeners['/swearjar/jarSettings'] = settingsHandler;

      // App users listener
      const usersHandler = snap => {
        const raw = snap.val();
        if (raw) {
          const nu = fbToArray(raw).filter(x => x && x.name);
          appUsers = nu;
          localStorage.setItem('swearjar2-users', JSON.stringify(appUsers));
          const loginEl = document.getElementById('login-screen');
          if (loginEl && !loginEl.classList.contains('hidden')) renderLoginScreen();
          if (document.getElementById('view-settings').classList.contains('active')) renderAppUsers();
        }
      };
      fbDb.ref('/swearjar/appUsers').on('value', usersHandler);
      _fbListeners['/swearjar/appUsers'] = usersHandler;

      // Game state listener — primary driver
      const gameStateHandler = snap => {
        const raw = snap.val();
        if (raw) {
          const incoming = {
            kids: raw.kids || {},
            history: fbToArray(raw.history),
            monthlyResults: fbToArray(raw.monthlyResults),
            currentMonth: raw.currentMonth || ''
          };
          incoming.monthlyResults.forEach(r => {
            if (!r.winners && r.winner) { r.winners = [r.winner]; delete r.winner; }
          });
          // Check for new charges before overwriting state
          if (fbFirstLoadDone) checkForNewCharges(incoming.history);
          state = incoming;
          localStorage.setItem('swearjar2', JSON.stringify(state));
        } else if (!fbFirstLoadDone) {
          // No remote data yet — seed Firebase with local state
          fbSave(); fbSaveSettings(settings); fbSaveUsers(appUsers);
        }
        if (!fbFirstLoadDone) {
          fbFirstLoadDone = true;
          clearTimeout(_fbSyncTimeout);
          hideLoadingOverlay();
          // Set baseline timestamp so first-load doesn't trigger notifications
          const firstReal = (state.history || []).find(e => e.type !== 'deletion');
          if (firstReal) _lastNotifTs = firstReal.ts;
          // Init admin PIN hash in background
          loadAdminPinHash();
        }
        render();
        const activeTab = document.querySelector('.nav-tab.active')?.id?.replace('tab-','');
        if (activeTab === 'history') renderHistory();
        if (activeTab === 'reports') renderReports();
        checkMonthRollover();
      };
      fbDb.ref('/swearjar/gameState').on('value', gameStateHandler);
      _fbListeners['/swearjar/gameState'] = gameStateHandler;

      return true;
    } catch(e) {
      console.error('Firebase init failed:', e);
      _fbInitialized = false; // allow retry
      fbFirstLoadDone = true;
      clearTimeout(_fbSyncTimeout);
      hideLoadingOverlay();
      toast('⚠️ Firebase error — using local data');
      updateDbStatus();
      return false;
    }
  }

  function fbSave()              { if (!fbDb) return; try { fbDb.ref('/swearjar/gameState').set(state); } catch(e) {} }
  function fbSaveSettings(s)     { if (!fbDb) return; try { fbDb.ref('/swearjar/jarSettings').set(s); } catch(e) {} }
  function fbSaveUsers(u)        { if (!fbDb) return; try { fbDb.ref('/swearjar/appUsers').set(u); } catch(e) {} }

  function saveFbConfigFromForm() {
    const raw = document.getElementById('firebase-config-input').value.trim();
    if (!raw) { toast('Paste a Firebase config first'); return; }
    try {
      const cfg = JSON.parse(raw);
      if (!cfg.databaseURL) { toast('❌ Missing "databaseURL" in config'); return; }
      saveFbConfig(cfg);
      showLoadingOverlay('Connecting to Firebase…');
      setTimeout(() => window.location.reload(), 500);
    } catch(e) { toast('❌ Invalid JSON — check your config'); }
  }

  function clearFbConfig() {
    localStorage.removeItem(FB_CONFIG_KEY);
    fbDb = null; fbConnected = false;
    updateDbStatus();
    const el = document.getElementById('firebase-config-input');
    if (el) el.value = '';
    toast('Disconnected from Firebase');
  }

  // ══════════════════════════════════════════════════════
  //  ALEXA INTEGRATION HELPERS
  // ══════════════════════════════════════════════════════
  const ALEXA_SKILL_KEY = 'swearjar2-alexa-skill-id';
  const BUILT_IN_ALEXA_SKILL_ID = 'amzn1.ask.skill.e83aeca2-900d-4e36-9a37-7cb240a09323';

  function loadAlexaSkillId() {
    return localStorage.getItem(ALEXA_SKILL_KEY) || BUILT_IN_ALEXA_SKILL_ID;
  }

  function saveAlexaSkillId(id) {
    if (id) localStorage.setItem(ALEXA_SKILL_KEY, id.trim());
    else localStorage.removeItem(ALEXA_SKILL_KEY);
  }

  function updateAlexaStatus() {
    const dot  = document.getElementById('alexa-dot');
    const text = document.getElementById('alexa-status-text');
    const inp  = document.getElementById('alexa-skill-id-input');
    if (!dot || !text) return;
    const val = (inp ? inp.value : loadAlexaSkillId()).trim();
    const isSet = val.startsWith('amzn1.ask.skill.');
    dot.className  = 'alexa-dot ' + (isSet ? 'connected' : 'disconnected');
    text.textContent = isSet
      ? '✅ Skill ID saved — Alexa is connected'
      : (val ? '⚠️ Skill ID looks incorrect (should start with amzn1.ask.skill.)' : 'Not configured — enter your Skill ID below');
  }

  function copyAlexaFbUrl() {
    const el = document.getElementById('alexa-fb-url');
    const url = el ? el.textContent.trim() : FIREBASE_DB_URL || '';
    navigator.clipboard.writeText(url).then(() => toast('📋 Firebase URL copied!')).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      toast('📋 Firebase URL copied!');
    });
  }

  function renderAlexaExamples() {
    const el = document.getElementById('alexa-examples');
    if (!el) return;
    const examples = KIDS.map(k => ({
      wake: 'Alexa, tell slyder swear jar to',
      cmd:  `charge ${k}`
    }));
    // Show first 3 examples + an alternate phrasing
    el.innerHTML = examples.slice(0, 3).map(e =>
      `<div class="alexa-example-row">
        <span class="wake">${e.wake}</span>
        <span class="command"> ${e.cmd}</span>
      </div>`
    ).join('') + `<div class="alexa-example-row">
      <span class="wake">Alexa, ask slyder swear jar to</span>
      <span class="command"> charge ${KIDS[0]||'Delaney'} ten dollars</span>
    </div>`;
  }

  // ══════════════════════════════════════════════════════
  //  ACTIVITY DELETE (with audit log)
  // ══════════════════════════════════════════════════════
  function canDeleteEntry(entry) {
    if (!currentUser) return false;
    if (entry.type === 'deletion') return false;   // can't delete a deletion log
    if (entry.addedBy === currentUser) return false; // can't delete your own recordings
    if (entry.kid === currentUser) return false;     // can't delete fees assigned to you
    return true;
  }

  function deleteActivity(idx) {
    const entry = state.history[idx];
    if (!entry || !canDeleteEntry(entry)) { toast('⛔ You can\'t delete this entry'); return; }
    
    // Confirm before deleting
    if (!confirm(`Delete this $${entry.amount || 1} charge for ${entry.kid}?\n\nThis will reverse the fee and create an audit log entry.`)) {
      return;
    }
    
    const { kid, addedBy, ts } = entry;
    const entryAmt = entry.amount || 1; // backward compat with old $1 entries

    // Reverse the fee
    if (state.kids[kid]) {
      state.kids[kid].amount = Math.max(0, state.kids[kid].amount - entryAmt);
      state.kids[kid].swears = Math.max(0, state.kids[kid].swears - 1);
    }

    // Remove the original entry
    state.history.splice(idx, 1);

    // Insert audit record at top of history
    state.history.unshift({
      type: 'deletion',
      kid,
      deletedBy: currentUser,
      originalAddedBy: addedBy,
      originalTs: ts,
      originalAmount: entryAmt,
      ts: new Date().toISOString()
    });

    if (state.history.length > 500) state.history.length = 500;
    save();
    render();
    toast(`🗑️ Deleted ${kid}'s entry`);
  }

  // ══════════════════════════════════════════════════════
  //  DAILY CHARGE LIMIT
  // ══════════════════════════════════════════════════════
  function getEstTodayStr() {
    const now = new Date();
    const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const pad = n => String(n).padStart(2,'0');
    return `${est.getFullYear()}-${pad(est.getMonth()+1)}-${pad(est.getDate())}`;
  }

  // Returns how many dollars `user` has charged others today (EST)
  function getTodayChargedBy(user) {
    if (!user) return 0;
    const todayStr = getEstTodayStr();
    let total = 0;
    (state.history || []).forEach(entry => {
      if (entry.type === 'deletion' || entry.addedBy !== user || !entry.ts) return;
      // Convert UTC timestamp to EST date string
      const entryEst = new Date(new Date(entry.ts).toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const pad = n => String(n).padStart(2,'0');
      const entryDate = `${entryEst.getFullYear()}-${pad(entryEst.getMonth()+1)}-${pad(entryEst.getDate())}`;
      if (entryDate === todayStr) total += (entry.amount || 1);
    });
    return total;
  }

  // ══════════════════════════════════════════════════════
  //  DISPUTE FLAG
  // ══════════════════════════════════════════════════════
  function disputeActivity(idx) {
    const entry = state.history[idx];
    if (!entry || entry.type === 'deletion') { toast('⛔ Cannot dispute this entry'); return; }
    if (entry.kid !== currentUser) { toast('⛔ You can only dispute your own charges'); return; }
    if (entry.disputed) { toast('⚠️ Already flagged as disputed'); return; }
    entry.disputed = true;
    entry.disputedAt = new Date().toISOString();
    entry.disputedBy = currentUser;
    save();
    render();
    toast('🚩 Flagged as disputed — a parent will review it');
  }

  function resolveDispute(idx) {
    if (!isCurrentUserParent()) { toast('⛔ Only parents and admins can resolve disputes'); return; }
    const entry = state.history[idx];
    if (!entry || !entry.disputed) { toast('⚠️ Not a disputed entry'); return; }
    if (!confirm(`Resolve dispute: remove $${entry.amount || 1} charge for ${entry.kid}?`)) return;

    const { kid, addedBy, ts } = entry;
    const entryAmt = entry.amount || 1;

    // Reverse the fee
    if (state.kids[kid]) {
      state.kids[kid].amount = Math.max(0, state.kids[kid].amount - entryAmt);
      state.kids[kid].swears = Math.max(0, state.kids[kid].swears - 1);
    }

    // Remove the original entry
    state.history.splice(idx, 1);

    // Insert audit record
    state.history.unshift({
      type: 'deletion',
      kid,
      deletedBy: currentUser,
      originalAddedBy: addedBy,
      originalTs: ts,
      originalAmount: entryAmt,
      reason: 'dispute resolved',
      ts: new Date().toISOString()
    });

    if (state.history.length > 500) state.history.length = 500;
    save(); render();
    toast(`✅ Dispute resolved — ${kid}'s charge removed`);
  }

  function dismissDispute(idx) {
    if (!isCurrentUserParent()) { toast('⛔ Only parents and admins can dismiss disputes'); return; }
    const entry = state.history[idx];
    if (!entry || !entry.disputed) { toast('⚠️ Not a disputed entry'); return; }

    delete entry.disputed;
    delete entry.disputedAt;
    delete entry.disputedBy;
    entry.disputeDismissedBy = currentUser;
    entry.disputeDismissedAt = new Date().toISOString();
    save(); render();
    toast(`❌ Dispute dismissed — charge stands`);
  }

  // ══════════════════════════════════════════════════════
  //  ADMIN PIN  (SHA-256, stored in Firebase)
  // ══════════════════════════════════════════════════════
  const DEFAULT_ADMIN_PIN = '0379';
  let _adminPinHash = null;
  let _pinBuffer    = '';

  async function sha256(str) {
    const data = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function loadAdminPinHash() {
    if (_adminPinHash) return _adminPinHash;
    if (fbDb) {
      try {
        const snap = await fbDb.ref('/swearjar/adminPin').once('value');
        if (snap.val()) { _adminPinHash = snap.val(); return _adminPinHash; }
      } catch(e) {}
    }
    // Compute default and persist to Firebase
    _adminPinHash = await sha256(DEFAULT_ADMIN_PIN);
    if (fbDb) {
      try { fbDb.ref('/swearjar/adminPin').set(_adminPinHash); } catch(e) {}
    }
    return _adminPinHash;
  }

  function showPinModal() {
    _pinBuffer = '';
    updatePinDots();
    document.getElementById('pin-error').textContent = '';
    document.getElementById('pin-overlay').classList.add('open');
    loadAdminPinHash(); // pre-load hash
  }

  function closePinModal() {
    _pinBuffer = '';
    updatePinDots();
    document.getElementById('pin-overlay').classList.remove('open');
  }

  function pinKey(digit) {
    if (_pinBuffer.length >= 4) return;
    _pinBuffer += digit;
    updatePinDots();
    document.getElementById('pin-error').textContent = '';
    if (_pinBuffer.length === 4) submitPin();
  }

  function pinBackspace() {
    _pinBuffer = _pinBuffer.slice(0, -1);
    updatePinDots();
  }

  function updatePinDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`pd${i}`);
      if (dot) dot.classList.toggle('filled', i < _pinBuffer.length);
    }
  }

  async function submitPin() {
    const hash   = await sha256(_pinBuffer);
    const stored = await loadAdminPinHash();
    if (hash === stored) {
      closePinModal();
      loginAs('admin');
    } else {
      document.getElementById('pin-error').textContent = '❌ Incorrect PIN — try again';
      _pinBuffer = '';
      updatePinDots();
    }
  }

  // ══════════════════════════════════════════════════════
  //  STREAK TRACKING
  // ══════════════════════════════════════════════════════
  // Streak milestones for gamification badges
  const STREAK_MILESTONES = [
    { days: 3,  badge: '🌱', label: 'Sprout' },
    { days: 7,  badge: '⭐', label: 'Star' },
    { days: 14, badge: '🌟', label: 'Super Star' },
    { days: 21, badge: '💎', label: 'Diamond' },
    { days: 30, badge: '👑', label: 'Royalty' },
  ];

  function getStreak(kid) {
    // Returns consecutive days with zero swears, ending today (EST)
    const estNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const pad = n => String(n).padStart(2,'0');
    const todayStr = `${estNow.getFullYear()}-${pad(estNow.getMonth()+1)}-${pad(estNow.getDate())}`;

    // Collect all days this kid swore
    const swearDays = new Set();
    (state.history || []).forEach(entry => {
      if (entry.type === 'deletion' || entry.kid !== kid || !entry.ts) return;
      swearDays.add(entry.ts.split('T')[0]);
    });

    // If they swore today, streak is 0
    if (swearDays.has(todayStr)) return 0;

    // Count backwards from yesterday
    let streak = 0;
    const d = new Date(estNow);
    d.setDate(d.getDate() - 1);
    for (let i = 0; i < 365; i++) {
      const dStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      if (swearDays.has(dStr)) break;
      streak++;
      d.setDate(d.getDate() - 1);
      if (streak >= 30) break; // cap at 30 for display
    }
    return streak;
  }

  function getStreakBadge(streak) {
    if (streak < 3) return null;
    let best = STREAK_MILESTONES[0];
    for (const m of STREAK_MILESTONES) {
      if (streak >= m.days) best = m;
    }
    return best;
  }

  function getCleanestMouth() {
    // Returns the kid(s) with the longest current streak
    let maxStreak = 0;
    let cleanest = [];
    KIDS.forEach(kid => {
      const s = getStreak(kid);
      if (s > maxStreak) { maxStreak = s; cleanest = [kid]; }
      else if (s === maxStreak && s > 0) { cleanest.push(kid); }
    });
    return { names: cleanest, streak: maxStreak };
  }

  // ══════════════════════════════════════════════════════
  //  PUSH NOTIFICATIONS  (Web Notification API, foreground)
  // ══════════════════════════════════════════════════════
  let _lastNotifTs = null;

  async function requestNotificationPermission(fromBanner) {
    if (!('Notification' in window)) {
      if (fromBanner) toast('Notifications not supported on this browser/device');
      return;
    }
    if (Notification.permission === 'granted') {
      hidePushBanner();
      if (fromBanner) toast('🔔 Notifications already enabled!');
      return;
    }
    if (Notification.permission === 'denied') {
      if (fromBanner) toast('Blocked — enable in device Settings → Safari → Notifications');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        hidePushBanner();
        toast('🔔 Notifications enabled!');
        // Store token for future FCM integration
        _storeFcmToken();
      } else {
        if (fromBanner) toast('Notifications not enabled');
      }
    } catch(e) {
      if (fromBanner) toast('Could not request notification permission');
    }
  }

  function _storeFcmToken() {
    // Placeholder: store that this user has notifications enabled in Firebase
    // This foundation supports future FCM background push via Firebase Functions
    if (!fbDb || !currentUser) return;
    try {
      fbDb.ref(`/swearjar/notifUsers/${currentUser.toLowerCase()}`).set({
        name: currentUser,
        notifEnabled: true,
        updatedAt: new Date().toISOString()
      });
    } catch(e) {}
  }

  function showPushBannerIfNeeded() {
    if (!currentUser || !KIDS.includes(currentUser)) return; // only jar kids
    if (localStorage.getItem('swearjar2-push-dismissed') === '1') return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return; // already decided
    const banner = document.getElementById('push-banner');
    if (banner) banner.classList.add('visible');
  }

  function hidePushBanner() {
    const banner = document.getElementById('push-banner');
    if (banner) banner.classList.remove('visible');
  }

  function dismissPushBanner() {
    hidePushBanner();
    localStorage.setItem('swearjar2-push-dismissed', '1');
  }

  function checkForNewCharges(newHistory) {
    if (!currentUser || !KIDS.includes(currentUser)) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const prevTs = _lastNotifTs;
    // Track the most recent real entry timestamp
    const firstReal = newHistory.find(e => e.type !== 'deletion');
    if (firstReal) _lastNotifTs = firstReal.ts;

    if (!prevTs) return; // first load — don't fire on initial sync

    // Walk new entries (at the front, newer than prevTs)
    for (const entry of newHistory) {
      if (entry.type === 'deletion') continue;
      if (!entry.ts || entry.ts <= prevTs) break; // reached already-seen entries
      if (entry.kid === currentUser && entry.addedBy !== currentUser) {
        try {
          const notif = new Notification('🤬 Swear Jar!', {
            body: `${entry.addedBy || 'Someone'} logged a $1 charge for ${currentUser}`,
            icon: '/swear-jar/icon-192.png',
            badge: '/swear-jar/icon-192.png',
            tag: 'swear-charge',
          });
          notif.onclick = () => { window.focus(); notif.close(); };
        } catch(e) {}
      }
    }
  }

  // ══════════════════════════════════════════════════════
  //  QR CODE PAYMENT MODAL
  // ══════════════════════════════════════════════════════
  let _currentQrData = null;

  function showQrPayment(name, amount, paymentType, paymentInfo, monthKey) {
    if (!paymentInfo || !paymentType) {
      toast('⚠️ No payment info configured for ' + name);
      return;
    }

    const pt = PAYMENT_TYPES.find(p => p.id === paymentType);
    if (!pt) return;

    // Build payment URL
    let paymentUrl = '';
    const amt = parseFloat(amount).toFixed(2);
    const note = `Swear Jar – ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`;
    
    switch (paymentType) {
      case 'venmo':
        // Venmo payment request URL
        paymentUrl = `https://venmo.com/?txn=charge&audience=private&recipients=${encodeURIComponent(paymentInfo.replace(/^@/, ''))}&amount=${amt}&note=${encodeURIComponent(note)}`;
        break;
      case 'applepay':
        // Apple Pay Cash (requires phone number)
        // Note: Apple Pay Cash URLs only work on iOS devices
        paymentUrl = `https://cash.me/$${paymentInfo.replace(/[^\d]/g, '')}/${amt}`;
        break;
      case 'paypal':
        paymentUrl = `https://paypal.me/${paymentInfo.replace(/^@/, '')}/${amt}`;
        break;
      case 'zelle':
        // Zelle doesn't have a universal web URL, show info for manual entry
        paymentUrl = null;
        break;
    }

    _currentQrData = { name, amount, paymentType, paymentInfo, paymentUrl, monthKey };

    // Update modal content
    document.getElementById('qr-payment-type').innerHTML = `
      <span class="qr-payment-type-icon">${pt.icon}</span>
      <span>${pt.label}</span>
    `;
    document.getElementById('qr-recipient-name').textContent = name;
    document.getElementById('qr-amount').textContent = `$${amount}`;

    // Set instructions based on payment type
    const instructions = {
      venmo: 'Open Venmo app and scan this QR code, or tap "Open App" below to pay automatically.',
      applepay: 'This will open Apple Pay Cash. Make sure you have it set up in Wallet.',
      paypal: 'Open PayPal app and scan this QR code, or tap "Open App" to pay directly.',
      zelle: 'Open your banking app and send via Zelle using the info below.'
    };
    document.getElementById('qr-instructions').textContent = instructions[paymentType] || 'Scan this code with your payment app.';

    // Generate QR code
    const qrContainer = document.getElementById('qr-code');
    qrContainer.innerHTML = ''; // Clear previous QR code
    
    const qrData = paymentUrl || paymentInfo; // Use payment info if no URL
    new QRCode(qrContainer, {
      text: qrData,
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });

    // Set up "Open App" button
    const openBtn = document.getElementById('qr-open-app');
    const appIcon = document.getElementById('qr-app-icon');
    const appText = document.getElementById('qr-app-text');
    
    if (paymentUrl) {
      openBtn.href = paymentUrl;
      openBtn.style.display = 'flex';
      appIcon.textContent = pt.icon;
      appText.textContent = `Open ${pt.label}`;
    } else {
      openBtn.style.display = 'none';
    }
    
    // Show "I've Paid This" button if user is viewing their own payment
    const markPaidBtn = document.getElementById('qr-mark-paid');
    if (monthKey && currentUser === name) {
      markPaidBtn.style.display = 'block';
      markPaidBtn.onclick = () => markAsPaid(monthKey, name);
    } else {
      markPaidBtn.style.display = 'none';
    }

    // Show modal
    document.getElementById('qr-overlay').classList.add('open');
  }

  function closeQrModal(event) {
    if (event && event.target !== document.getElementById('qr-overlay')) return;
    document.getElementById('qr-overlay').classList.remove('open');
    _currentQrData = null;
  }

  function copyPaymentInfo() {
    if (!_currentQrData) return;
    const { paymentInfo, name } = _currentQrData;
    navigator.clipboard?.writeText(paymentInfo).catch(() => {});
    toast(`📋 Copied ${name}'s payment info`);
  }
  
  // ══════════════════════════════════════════════════════
  //  PAYMENT TRACKING
  // ══════════════════════════════════════════════════════
  function markAsPaid(monthKey, payerName) {
    const monthResult = state.monthlyResults.find(r => r.month === monthKey);
    if (!monthResult || !monthResult.payments || !monthResult.payments[payerName]) {
      toast('⚠️ Payment record not found');
      return;
    }
    
    monthResult.payments[payerName].paid = true;
    monthResult.payments[payerName].paidAt = new Date().toISOString();
    monthResult.payments[payerName].paidBy = currentUser;
    
    save();
    closeQrModal();
    toast(`✅ Marked as paid!`);
    
    // Refresh announcement if visible
    const announceOverlay = document.getElementById('announce-overlay');
    if (announceOverlay && !announceOverlay.classList.contains('hidden')) {
      showWinnerAnnouncement(monthResult);
    }
  }

  // ══════════════════════════════════════════════════════
  //  CONSTANTS
  // ══════════════════════════════════════════════════════
  const SLOT_EMOJI   = ['👧','🧒','👦','🧑','👩','👨','🧔','👱','🧕','👲'];
  const EXTRA_EMOJI  = ['👩','👨','🧓','👴','👵','🧑‍💼','👷','🧑‍🦱'];
  const PALETTE      = ['#e91e8c','#00c2e0','#56c278','#ffa726','#ab47bc','#ef5350','#26c6da','#66bb6a','#ffa000','#8d6e63'];
  const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const PAYMENT_TYPES = [
    { id:'applepay', label:'Apple Pay', icon:'🍎', placeholder:'Phone number for Apple Pay Cash (e.g. 555-867-5309)' },
    { id:'venmo',    label:'Venmo',     icon:'💜', placeholder:'@handle (e.g. @markslyder)' },
    { id:'paypal',   label:'PayPal',    icon:'🔵', placeholder:'@username (e.g. @markslyder)' },
    { id:'zelle',    label:'Zelle',     icon:'⚡', placeholder:'Phone or email' },
  ];

  function getPayPlaceholder(type) {
    return PAYMENT_TYPES.find(p => p.id === type)?.placeholder ?? 'Tap a payment type above…';
  }

  // Returns a deep-link URL for supported types; null for Apple Pay / Zelle (no web link)
  function getPaymentUrl(type, handle) {
    if (!handle) return null;
    const h = handle.trim();
    switch (type) {
      case 'venmo':  return `https://venmo.com/u/${h.replace(/^@/, '')}`;
      case 'paypal': return `https://paypal.me/${h.replace(/^@/, '')}`;
      default:        return null;
    }
  }

  // Returns a URL to REQUEST money FROM a loser (charge them).
  // Venmo: pre-fills a charge request with amount + note.
  // Cash App / PayPal: opens their pay-to page with amount (loser taps confirm).
  // Apple Pay / Zelle: no web URL, caller should fall back to copy.
  function getRequestUrl(type, handle, amount, note) {
    if (!handle) return null;
    const h   = handle.trim();
    const amt = parseFloat(amount).toFixed(2);
    const enc = encodeURIComponent;
    switch (type) {
      case 'venmo':
        // txn=charge opens a Venmo charge (request money) dialog pre-filled for the loser
        return `https://venmo.com/?txn=charge&audience=private&recipients=${enc(h.replace(/^@/,''))}&amount=${amt}&note=${enc(note)}`;
      case 'paypal':
        return `https://paypal.me/${h.replace(/^@/,'')}/${amt}`;
      default:
        return null; // Apple Pay, Zelle — no web request URL
    }
  }

  function selectPayType(idx, type) {
    // Toggle: tap active chip to deselect
    settings[idx].paymentType = (settings[idx].paymentType === type) ? '' : type;
    const card = document.querySelector(`.settings-card[data-idx="${idx}"]`);
    if (!card) return;
    card.querySelectorAll('.pay-type-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.type === settings[idx].paymentType);
    });
    const inp = card.querySelector('[data-field="pay"]');
    if (inp) inp.placeholder = getPayPlaceholder(settings[idx].paymentType);
  }

  const DEFAULT_KIDS = [
    { name:'Delaney', color:'#e91e8c', paymentInfo:'' },
    { name:'Hadley',  color:'#00c2e0', paymentInfo:'' },
    { name:'Emerson', color:'#56c278', paymentInfo:'' },
    { name:'Grant',   color:'#ffa726', paymentInfo:'' },
  ];

  // ── Settings (jar people) ──
  function loadSettings() {
    try { const s = localStorage.getItem('swearjar2-settings'); if (s) return JSON.parse(s).map(x=>({paymentInfo:'',...x})); } catch(e) {}
    return DEFAULT_KIDS.map(k=>({...k}));
  }
  function saveSettings(s) { localStorage.setItem('swearjar2-settings', JSON.stringify(s)); fbSaveSettings(s); }

  let settings  = loadSettings();
  let KIDS      = settings.map(s => s.name);
  let COLORS    = Object.fromEntries(settings.map(s => [s.name, s.color]));
  let COLOR_HEX = Object.fromEntries(settings.map(s => [s.name, s.color]));
  let EMOJI     = Object.fromEntries(settings.map((s,i) => [s.name, SLOT_EMOJI[i]??'🧒']));
  let PAY_INFO  = Object.fromEntries(settings.map(s => [s.name, s.paymentInfo??'']));

  // ── App users (who can log in) ──
  function loadAppUsers() {
    try { const s = localStorage.getItem('swearjar2-users'); if (s) return JSON.parse(s); } catch(e) {}
    // Default: same as jar members
    return KIDS.map(name => ({ name }));
  }
  function saveAppUsers(u) { localStorage.setItem('swearjar2-users', JSON.stringify(u)); fbSaveUsers(u); }
  let appUsers = loadAppUsers();

  // ── Current user (session only) ──
  let currentUser = sessionStorage.getItem('swearjar2-user') || null;

  // ── Game state ──
  function defaultState() {
    const kids = {};
    KIDS.forEach(k => { kids[k] = { amount:0, swears:0 }; });
    return { kids, history:[], monthlyResults:[], currentMonth:'' };
  }
  function load() {
    try {
      const s = localStorage.getItem('swearjar2');
      if (s) {
        const data = JSON.parse(s);
        (data.monthlyResults||[]).forEach(r => { if (!r.winners&&r.winner){r.winners=[r.winner];delete r.winner;} });
        return data;
      }
    } catch(e) {}
    return defaultState();
  }
  function save() { localStorage.setItem('swearjar2', JSON.stringify(state)); fbSave(); }
  let state = load();

  // ══════════════════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════════════════
  function getDaysLeftEST() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return { left: totalDays - now.getDate(), total: totalDays };
  }

  // Always use Eastern Time so the month flips at midnight EST for the whole family
  function getESTMonthKey() {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function currentMonthKey() { return getESTMonthKey(); }

  // ── Auto month rollover ──────────────────────────────────
  function checkMonthRollover() {
    if (!fbFirstLoadDone) return; // wait for Firebase sync
    const estMonth = getESTMonthKey();
    if (!state.currentMonth) {
      state.currentMonth = estMonth; save(); return;
    }
    if (state.currentMonth === estMonth) {
      // Same month — check if this device still needs to show the announcement
      checkPendingAnnouncement(); return;
    }
    // New month detected — close out the previous one
    autoCloseMonth(estMonth);
  }

  function checkPendingAnnouncement() {
    if (!state.monthlyResults.length) return;
    const latest = state.monthlyResults[0];
    if (latest.pot > 0 && localStorage.getItem('swearjar2-announced') !== latest.month) {
      showWinnerAnnouncement(latest);
    }
  }

  function autoCloseMonth(newMonth) {
    const pot = totalPot(), winners = getWinners(), month = state.currentMonth;
    // Build the result snapshot before resetting
    const result = { month, winners, pot, kids: JSON.parse(JSON.stringify(state.kids)) };
    
    // Add payment tracking for losers
    result.payments = {};
    KIDS.forEach(kid => {
      if (!winners.includes(kid) && (state.kids[kid]?.amount ?? 0) > 0) {
        result.payments[kid] = {
          amount: state.kids[kid].amount,
          paid: false,
          paidAt: null,
          paidBy: null
        };
      }
    });
    
    state.monthlyResults.unshift(result);
    // Reset active month data
    KIDS.forEach(k => { state.kids[k] = { amount:0, swears:0 }; });
    state.history = [];
    state.currentMonth = newMonth;
    save(); render();
    if (pot > 0) showWinnerAnnouncement(result);
  }

  function showWinnerAnnouncement(result) {
    const { winners, pot, kids, month } = result;
    const sorted = [...KIDS].sort((a,b) => (kids[a]?.amount??0) - (kids[b]?.amount??0));
    const overlay = document.getElementById('announce-overlay');
    overlay.dataset.month = month;

    document.getElementById('announce-month-badge').textContent = formatMonthKey(month);
    document.getElementById('announce-trophy').textContent = winners.length > 1 ? '🤝' : '🏆';
    const wnEl = document.getElementById('announce-winner-name');
    wnEl.textContent = winners.join(' & ');
    wnEl.style.color = COLOR_HEX[winners[0]] ?? 'var(--text)';
    const prizeText = winners.length > 1
      ? `Each wins $${(pot / winners.length).toFixed(2)}`
      : `Wins $${pot}!`;
    document.getElementById('announce-prize').textContent = prizeText;

    // Leaderboard
    const medals = ['🥇','🥈','🥉','4️⃣'];
    document.getElementById('announce-rows').innerHTML = `
      <div class="announce-leaderboard">
        ${sorted.map((kid,i) => `
          <div class="announce-lb-row ${winners.includes(kid) ? 'winner-row' : ''}">
            <div style="display:flex;align-items:center;gap:10px">
              <span>${medals[i]??'•'}</span>
              <span style="font-weight:700;color:${COLOR_HEX[kid]}">${escHtml(kid)}</span>
            </div>
            <span style="color:var(--muted);font-size:14px">${kids[kid]?.swears??0} swear${(kids[kid]?.swears??0)!==1?'s':''} = $${kids[kid]?.amount??0}</span>
          </div>`).join('')}
      </div>`;

    // Payment request buttons for each loser
    const note = `Swear Jar – ${formatMonthKey(month)}`;
    const loserReqs = KIDS.filter(k => !winners.includes(k) && (kids[k]?.amount??0) > 0)
      .map(k => {
        const s = settings.find(x => x.name === k);
        const isPaid = result.payments && result.payments[k] && result.payments[k].paid;
        return { name:k, amount:kids[k]?.amount??0, info:(s?.paymentInfo??'').trim(), type:s?.paymentType??'', paid: isPaid };
      }).filter(x => x.info);
    
    // Payment summary
    const totalPayments = loserReqs.length;
    const paidCount = loserReqs.filter(x => x.paid).length;
    const paymentSummary = totalPayments > 0 ? `
      <div style="background:rgba(124,77,255,.1);border:1px solid rgba(124,77,255,.2);border-radius:14px;padding:12px;margin-bottom:12px;text-align:left">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--purple);margin-bottom:6px">💰 Payment Status</div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <div style="flex:1;height:6px;background:var(--surface2);border-radius:6px;overflow:hidden">
            <div style="height:100%;background:linear-gradient(90deg,#00c851,#00e676);width:${(paidCount/totalPayments*100)}%;transition:width .3s"></div>
          </div>
          <span style="font-size:13px;font-weight:700">${paidCount}/${totalPayments}</span>
        </div>
        <div style="font-size:11px;color:var(--muted)">${paidCount === totalPayments ? '🎉 All paid!' : `${totalPayments - paidCount} pending`}</div>
      </div>` : '';
    
    document.getElementById('announce-requests').innerHTML = loserReqs.length ? paymentSummary + `
      <div class="modal-requests" style="text-align:left;margin-top:8px;margin-bottom:0">
        <div class="modal-req-label">📤 Payment Requests</div>
        <div class="modal-req-sub">Tap QR to pay, then mark as paid</div>
        ${loserReqs.map(({name,amount,info,type,paid}) => {
          const pt  = PAYMENT_TYPES.find(p => p.id === type);
          const url = getRequestUrl(type, info, amount, note);
          const paidStyle = paid ? 'opacity:0.5;text-decoration:line-through' : '';
          return `
          <div class="modal-req-row" style="${paidStyle}">
            <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
              <span style="font-size:18px;flex-shrink:0">${paid ? '✅' : pt?.icon??'💳'}</span>
              <div style="min-width:0">
                <div style="font-weight:700;color:${COLOR_HEX[name]}">${escHtml(name)}</div>
                <div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(info)}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <span style="font-size:15px;font-weight:800">$${amount}</span>
              ${paid ? '<span style="font-size:11px;color:#00c851">Paid</span>' : `
                <button class="modal-req-btn" onclick="showQrPayment('${escHtml(name)}', ${amount}, '${type}', '${escHtml(info)}', '${month}')">📱 QR</button>
                ${url ? `<a href="${url}" target="_blank" rel="noopener" class="modal-req-btn">Request ↗</a>`
                      : `<button class="modal-req-copy" onclick="copyToClipboard('${escHtml(info)}')">📋 Copy</button>`}`}
            </div>
          </div>`;
        }).join('')}
      </div>` : '';

    overlay.classList.remove('hidden');
  }

  function dismissAnnouncement() {
    const overlay = document.getElementById('announce-overlay');
    if (overlay.dataset.month) localStorage.setItem('swearjar2-announced', overlay.dataset.month);
    overlay.classList.add('hidden');
  }
  function formatMonthKey(k) { if(!k) return '—'; const [y,m]=k.split('-'); return `${MONTHS[parseInt(m)-1]} ${y}`; }
  function totalPot() { return Object.values(state.kids).reduce((s,k)=>s+k.amount,0); }
  function getWinners() {
    const min = Math.min(...KIDS.map(k=>state.kids[k]?.amount??0));
    return KIDS.filter(k=>(state.kids[k]?.amount??0)===min);
  }
  function getWorst() {
    if (totalPot()===0) return [];
    const max = Math.max(...KIDS.map(k=>state.kids[k]?.amount??0));
    if (max===0) return [];
    return KIDS.filter(k=>(state.kids[k]?.amount??0)===max);
  }
  function relativeTime(iso) {
    const diff = (Date.now()-new Date(iso))/1000;
    if (diff<60)    return 'just now';
    if (diff<3600)  return `${Math.floor(diff/60)}m ago`;
    if (diff<86400) return `${Math.floor(diff/3600)}h ago`;
    const d=new Date(iso); return `${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}`;
  }
  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function copyToClipboard(text) { navigator.clipboard?.writeText(text).catch(()=>{}); toast(`Copied: ${text} 📋`); }

  // Color for a user name (jar member color or fallback purple)
  function userColor(name) { return COLOR_HEX[name] ?? '#7c4dff'; }
  // Emoji for a user (jar member emoji or cycle through extras)
  function userEmoji(name, idx) {
    const jarIdx = KIDS.indexOf(name);
    if (jarIdx >= 0) return SLOT_EMOJI[jarIdx] ?? '🧒';
    return EXTRA_EMOJI[idx % EXTRA_EMOJI.length];
  }

  // ══════════════════════════════════════════════════════
  //  LOGIN
  // ══════════════════════════════════════════════════════
  function renderLoginScreen() {
    const grid = document.getElementById('login-grid');
    grid.innerHTML = appUsers.map((u, i) => {
      const color = userColor(u.name);
      const emoji = userEmoji(u.name, i);
      const isJar = KIDS.includes(u.name);
      return `
        <button class="login-btn" style="border-color:${color}22"
          onclick="loginAs('${escHtml(u.name)}')"
          onmouseover="this.style.borderColor='${color}'"
          onmouseout="this.style.borderColor='${color}22'">
          <div class="login-btn-emoji">${emoji}</div>
          <div class="login-btn-info">
            <div class="login-btn-name">${escHtml(u.name)}</div>
            ${isJar ? `<div class="login-btn-sub" style="color:${color}">in the jar</div>` : '<div class="login-btn-sub">logging swears</div>'}
          </div>
          <div style="margin-left:auto; width:10px; height:10px; border-radius:50%; background:${color}; flex-shrink:0"></div>
        </button>`;
    }).join('');
    // Admin button — always at bottom, PIN protected
    grid.insertAdjacentHTML('beforeend', `
      <button class="login-btn" style="border-color:#7c4dff22;margin-top:4px"
        onclick="showPinModal()"
        onmouseover="this.style.borderColor='#7c4dff'"
        onmouseout="this.style.borderColor='#7c4dff22'">
        <div class="login-btn-emoji">🔐</div>
        <div class="login-btn-info">
          <div class="login-btn-name">Admin</div>
          <div class="login-btn-sub" style="color:#7c4dff">PIN required</div>
        </div>
        <div style="margin-left:auto; width:10px; height:10px; border-radius:50%; background:#7c4dff; flex-shrink:0"></div>
      </button>`);
    document.getElementById('login-custom-input').value = '';
  }

  async function loginAs(name) {
    // Persist identity across the reload that follows
    currentUser = name;
    sessionStorage.setItem('swearjar2-user', name);
    // Request notification permission for jar kids (non-blocking)
    if (KIDS.includes(name) && 'Notification' in window && Notification.permission === 'granted') {
      _storeFcmToken(); // re-affirm token
    }

    // Show feedback before the reload
    document.getElementById('login-screen').innerHTML = `
      <div class="login-logo" style="animation:spin 1s linear infinite">🔄</div>
      <div class="login-title" style="margin-top:16px">Loading…</div>
      <div class="login-sub">Fetching the latest version for ${escHtml(name)}</div>`;

    // Clear every SW cache so the reload fetches fresh assets from the network
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch(e) { /* ignore — non-critical */ }
    }

    // Tell any active service worker to clear its own cache too
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        reg?.active?.postMessage({ type: 'CLEAR_CACHE' });
        // Give the message a moment to process, then reload
        await new Promise(r => setTimeout(r, 150));
      } catch(e) {}
    }

    // Hard reload — SW has empty cache so it goes to network for fresh HTML/JS
    window.location.reload();
  }

  function loginCustom() {
    const val = document.getElementById('login-custom-input').value.trim();
    if (!val) {
      toast('⚠️ Please enter your name');
      return;
    }
    loginAs(val);
  }

  function promptSwitchUser() {
    currentUser = null;
    sessionStorage.removeItem('swearjar2-user');
    document.getElementById('login-custom-input').value = '';
    document.getElementById('login-screen').classList.remove('hidden');
    renderLoginScreen();
  }

  function updateUserChip() {
    if (!currentUser) return;
    document.getElementById('user-chip-name').textContent = currentUser;
    document.getElementById('user-chip-dot').style.background = userColor(currentUser);
  }

  function isCurrentUserParent() {
    if (currentUser === 'admin') return true;
    const user = appUsers.find(u => u.name === currentUser);
    return user && user.isParent;
  }

  // ══════════════════════════════════════════════════════
  //  ACTIONS
  // ══════════════════════════════════════════════════════
  function addSwear(kid, categoryId) {
    const category = CHARGE_CATEGORIES.find(c => c.id === categoryId) || CHARGE_CATEGORIES[1]; // default: moderate
    const chargeAmount = category.amount;
    // Enforce daily charge limit ($10 max per user per day)
    const todayCharged = getTodayChargedBy(currentUser);
    if (todayCharged + chargeAmount > DAILY_LIMIT) {
      toast(`🔒 You've hit your $${DAILY_LIMIT}/day limit — try again tomorrow!`);
      return;
    }
    // Haptic feedback on iOS
    if (window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }
    if (!state.kids[kid]) state.kids[kid] = { amount:0, swears:0 };
    state.kids[kid].amount += chargeAmount;
    state.kids[kid].swears++;
    state.history.unshift({
      kid, ts: new Date().toISOString(), addedBy: currentUser ?? 'Unknown',
      amount: chargeAmount, category: category.id
    });
    if (state.history.length > 500) state.history.length = 500;
    save(); render();
    const remaining = DAILY_LIMIT - (todayCharged + chargeAmount);
    const amtStr = chargeAmount % 1 === 0 ? `$${chargeAmount}` : `$${chargeAmount.toFixed(2)}`;
    toast(remaining > 0 ? `${kid} owes ${amtStr} ${category.emoji} · $${remaining.toFixed(2)} left today` : `${kid} owes ${amtStr} ${category.emoji} · Daily limit reached!`);
    const card = document.querySelector(`[data-kid="${kid}"]`);
    if (card) { card.classList.remove('pulse'); void card.offsetWidth; card.classList.add('pulse'); }
  }

  let _undoInProgress = false;
  function undoLast() {
    if (_undoInProgress) return;
    if (!state.history.length) { toast('Nothing to undo!'); return; }
    // Skip deletion log entries at the front
    const firstReal = state.history.findIndex(e => e.type !== 'deletion');
    if (firstReal === -1) { toast('Nothing to undo!'); return; }
    _undoInProgress = true;
    const entry = state.history.splice(firstReal, 1)[0];
    const entryAmt = entry.amount || 1; // backward compat with old $1 entries
    if (state.kids[entry.kid]) {
      state.kids[entry.kid].amount = Math.max(0, state.kids[entry.kid].amount - entryAmt);
      state.kids[entry.kid].swears = Math.max(0, state.kids[entry.kid].swears - 1);
    }
    save(); render();
    toast(`Undid ${entry.kid}'s charge ↩`);
    setTimeout(() => { _undoInProgress = false; }, 500);
  }

  function openEndMonth() {
    const pot=totalPot(), winners=getWinners();
    const sorted=[...KIDS].sort((a,b)=>(state.kids[a]?.amount??0)-(state.kids[b]?.amount??0));
    document.getElementById('modal-sub').textContent =
      pot===0 ? 'No swears this month — everyone wins! 🎉'
      : winners.length>1 ? `${winners.join(' & ')} tied with the fewest swears!`
      : `${winners[0]} had the fewest swears and wins the pot!`;
    const prize = winners.length>1 ? `Each wins $${(pot/winners.length).toFixed(2)}` : `Wins $${pot}!`;
    document.getElementById('modal-winner-box').innerHTML = `
      <div class="modal-trophy">${winners.length>1?'🤝':'🏆'}</div>
      <div class="modal-winner-name" style="color:${COLOR_HEX[winners[0]]}">${winners.join(' & ')}</div>
      <div class="modal-prize">${prize}</div>`;
    document.getElementById('modal-rows').innerHTML = sorted.map((kid,i)=>`
      <div class="modal-row">
        <div class="modal-row-left">
          <span>${i===0?'🥇':i===1?'🥈':i===2?'🥉':'4️⃣'}</span>
          <span style="font-weight:700;color:${COLOR_HEX[kid]}">${escHtml(kid)}</span>
        </div>
        <div class="modal-row-right">${state.kids[kid]?.swears??0} swear${(state.kids[kid]?.swears??0)!==1?'s':''} = $${state.kids[kid]?.amount??0}</div>
      </div>`).join('');
    const winnerPays = winners.map(w => {
      const s = settings.find(x => x.name === w);
      return { name: w, info: (s?.paymentInfo ?? '').trim(), type: s?.paymentType ?? '' };
    }).filter(x => x.info);
    document.getElementById('modal-payment').innerHTML = (pot>0 && winnerPays.length>0) ? `
      <div class="modal-payment">
        <div class="modal-pay-label">💸 Pay the winner</div>
        ${winnerPays.map(({name,info,type}) => {
          const pt  = PAYMENT_TYPES.find(p => p.id === type);
          const url = getPaymentUrl(type, info);
          return `
          <div class="modal-pay-row" style="flex-direction:column;align-items:stretch;gap:8px">
            <div style="display:flex;align-items:center;gap:8px">
              ${pt ? `<span style="font-size:16px">${pt.icon}</span><span style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:1px">${pt.label}</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="modal-pay-info" style="color:${COLOR_HEX[name]};flex:1">${escHtml(info)}</div>
              ${url ? `<a href="${url}" target="_blank" rel="noopener" class="modal-pay-copy" style="text-decoration:none;background:linear-gradient(135deg,var(--purple),var(--pink));color:#fff">Open ↗</a>` : ''}
              <button class="modal-pay-copy" onclick="copyToClipboard('${escHtml(info)}')">📋 Copy</button>
            </div>
          </div>`;
        }).join('')}
        <div class="modal-pay-note">Each person owes ${winners.length>1?'a share of':''} $${pot} to ${winners.join(' & ')}</div>
      </div>` : '';
    // ── Send Requests section: one row per loser who owes money ──
    const monthLabel = new Date().toLocaleString('default',{month:'long',year:'numeric'});
    const note = `Swear Jar – ${monthLabel}`;
    const losers = KIDS.filter(k => !winners.includes(k) && (state.kids[k]?.amount ?? 0) > 0);
    const loserRequests = losers.map(k => {
      const s = settings.find(x => x.name === k);
      return { name: k, amount: state.kids[k]?.amount ?? 0,
               info: (s?.paymentInfo ?? '').trim(), type: s?.paymentType ?? '' };
    }).filter(x => x.info);
    document.getElementById('modal-requests').innerHTML = (pot>0 && loserRequests.length>0) ? `
      <div class="modal-requests">
        <div class="modal-req-label">📤 Send Payment Requests</div>
        <div class="modal-req-sub">Tap each to open their app and charge them directly</div>
        ${loserRequests.map(({name, amount, info, type}) => {
          const pt  = PAYMENT_TYPES.find(p => p.id === type);
          const url = getRequestUrl(type, info, amount, note);
          return `
          <div class="modal-req-row">
            <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
              <span style="font-size:18px;flex-shrink:0">${pt?.icon ?? '💳'}</span>
              <div style="min-width:0">
                <div style="font-weight:700;color:${COLOR_HEX[name]}">${escHtml(name)}</div>
                <div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(info)}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <span style="font-size:15px;font-weight:800;color:var(--text)">$${amount}</span>
              <button class="modal-req-btn" onclick="showQrPayment('${escHtml(name)}', ${amount}, '${type}', '${escHtml(info)}')">📱 QR</button>
              ${url
                ? `<a href="${url}" target="_blank" rel="noopener" class="modal-req-btn">Request ↗</a>`
                : `<button class="modal-req-copy" onclick="copyToClipboard('${escHtml(info)}')">📋 Copy</button>`}
            </div>
          </div>`;
        }).join('')}
      </div>` : '';

    document.getElementById('overlay').classList.add('open');
  }

  function confirmEndMonth() {
    const pot=totalPot(), winners=getWinners(), month=currentMonthKey();
    state.monthlyResults.unshift({ month, winners, pot, kids: JSON.parse(JSON.stringify(state.kids)) });
    KIDS.forEach(k=>{state.kids[k]={amount:0,swears:0};});
    state.history=[];
    save(); closeModal(); render(); switchView('tracker');
    toast(`${winners.join(' & ')} win${winners.length>1?'':'s'} $${pot}! 🏆`);
  }

  function closeModal() { document.getElementById('overlay').classList.remove('open'); }
  function handleOverlayClick(e) { if (e.target===document.getElementById('overlay')) closeModal(); }

  // ══════════════════════════════════════════════════════
  //  RENDER — TRACKER
  // ══════════════════════════════════════════════════════
  function updateRoleBasedUI() {
    // Hide settings tab for non-parents
    const settingsTab = document.getElementById('tab-settings');
    if (settingsTab) {
      settingsTab.style.display = isCurrentUserParent() ? 'flex' : 'none';
    }
  }

  function render() {
    const pot=totalPot(), winners=getWinners(), worst=getWorst();
    document.getElementById('month-chip').textContent = formatMonthKey(currentMonthKey());
    document.getElementById('pot-amount').textContent = `$${pot}`;
    document.getElementById('pot-leader').textContent = pot>0 ? winners.join(' & ') : '—';
    // Cleanest Mouth award
    const cleanest = getCleanestMouth();
    const cleanEl = document.getElementById('cleanest-mouth');
    if (cleanEl) {
      if (cleanest.streak >= 3) {
        const badge = getStreakBadge(cleanest.streak);
        cleanEl.innerHTML = `${badge?.badge ?? '😇'} <strong>${cleanest.names.join(' & ')}</strong> · ${cleanest.streak}-day streak`;
        cleanEl.style.display = '';
      } else {
        cleanEl.style.display = 'none';
      }
    }
    // Days-left countdown
    const { left, total } = getDaysLeftEST();
    const dltEl = document.getElementById('days-left-text');
    const dlfEl = document.getElementById('days-left-fill');
    if (dltEl) {
      const pct = Math.round(((total - left) / total) * 100);
      dltEl.textContent = left === 0 ? '🔒 Closing tonight at midnight!'
                        : left === 1 ? '⏳ Last day of the month!'
                        : `⏳ ${left} day${left!==1?'s':''} left in ${MONTHS[new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'})).getMonth()]}`;
      dltEl.className = 'days-left-text' + (left <= 2 ? ' urgent' : '');
      if (dlfEl) dlfEl.style.width = pct + '%';
    }
    const todayCharged   = getTodayChargedBy(currentUser);
    const dailyLimitHit  = todayCharged >= DAILY_LIMIT;
    const dailyRemaining = Math.max(0, DAILY_LIMIT - todayCharged);
    document.getElementById('kids-grid').innerHTML = KIDS.map(kid=>{
      const {amount=0,swears=0}=state.kids[kid]??{};
      const isLeading=pot>0&&winners.includes(kid), isWorst=worst.includes(kid);
      const cls=['kid-card',isLeading?'leading':'',isWorst?'worst':''].filter(Boolean).join(' ');
      const streak = getStreak(kid);
      return `
        <div class="${cls}" data-kid="${kid}" style="--c:${COLORS[kid]??'#888'}">
          <div class="kid-badmouth">🤬</div>
          <div class="kid-crown">👑</div>
          <div class="kid-avatar"><span class="kid-avatar-emoji">${EMOJI[kid]??'🧒'}</span></div>
          <div class="kid-name">${escHtml(kid)}</div>
          <div class="kid-amount">$${amount}</div>
          <div class="kid-count">${swears} swear${swears!==1?'s':''}</div>
          ${streak >= 3 ? `<div class="streak-badge">${getStreakBadge(streak)?.badge ?? '🔥'} ${streak >= 30 ? '30+' : streak}-day streak · ${getStreakBadge(streak)?.label ?? ''}</div>` : ''}
          ${dailyLimitHit
            ? `<button class="swear-btn" disabled
                style="opacity:.4;cursor:not-allowed;font-size:11px;background:#555;letter-spacing:-0.2px"
                title="$${DAILY_LIMIT} daily charge limit reached">🔒 Daily limit reached</button>`
            : `<div class="charge-categories">
                ${CHARGE_CATEGORIES.map(cat => `<button class="charge-cat-btn" style="background:${cat.color}" onclick="addSwear('${escHtml(kid)}','${cat.id}')" title="${cat.label}: $${cat.amount.toFixed(2)}">${cat.emoji} $${cat.amount % 1 === 0 ? cat.amount : cat.amount.toFixed(2)}</button>`).join('')}
              </div>`}
        </div>`;
    }).join('');
    const recent=state.history.slice(0,20), actEl=document.getElementById('activity-list');
    if (!recent.length) {
      actEl.innerHTML=`<div class="empty"><div class="empty-icon">😇</div><div>No swears yet this month!</div></div>`;
    } else {
      actEl.innerHTML = recent.map((entry, idx) => {
        if (entry.type === 'deletion') {
          // Audit log row for a deletion
          return `
            <div class="activity-row deleted-log" style="--c:${COLORS[entry.kid]??'#888'}">
              <div class="activity-left">
                <div class="activity-dot" style="opacity:0.5"></div>
                <div class="activity-info">
                  <div class="activity-name" style="text-decoration:line-through;opacity:0.65">${escHtml(entry.kid)}</div>
                  <div class="activity-by">🗑️ deleted by ${escHtml(entry.deletedBy)} · was recorded by ${escHtml(entry.originalAddedBy)}</div>
                </div>
              </div>
              <div class="activity-right">
                <div class="activity-time">${relativeTime(entry.ts)}</div>
                <div class="activity-badge deleted">-$${entry.originalAmount || entry.amount || 1}</div>
              </div>
            </div>`;
        }
        const {kid,ts,addedBy} = entry;
        const canDel     = canDeleteEntry(entry);
        const canDispute = entry.kid === currentUser && !entry.disputed && entry.type !== 'deletion';
        const isDisputed = !!entry.disputed;
        return `
          <div class="activity-row${isDisputed ? ' disputed' : ''}" style="--c:${COLORS[kid]??'#888'}">
            <div class="activity-left">
              <div class="activity-dot"></div>
              <div class="activity-info">
                <div class="activity-name">${escHtml(kid)}</div>
                ${addedBy ? `<div class="activity-by">recorded by ${escHtml(addedBy)}${isDisputed ? ' · <span style="color:#ffa726">🚩 disputed</span>' : ''}</div>` : ''}
              </div>
            </div>
            <div class="activity-right">
              <div class="activity-time">${relativeTime(ts)}</div>
              ${isDisputed
                ? `<div class="activity-badge disputed-badge">🚩 Disputed</div>`
                : `<div class="activity-badge">${entry.category ? (CHARGE_CATEGORIES.find(c=>c.id===entry.category)?.emoji??'') + ' ' : ''}+$${entry.amount || 1}</div>`}
              ${canDispute ? `<button class="activity-dispute-btn" onclick="disputeActivity(${idx})" title="Flag charge as disputed">🚩</button>` : ''}
              ${isDisputed && isCurrentUserParent() ? `<button class="activity-resolve-btn" onclick="resolveDispute(${idx})" title="Resolve dispute (remove charge)">✅</button><button class="activity-dismiss-btn" onclick="dismissDispute(${idx})" title="Dismiss dispute (keep charge)">❌</button>` : ''}
              ${canDel ? `<button class="activity-del-btn" onclick="deleteActivity(${idx})" title="Delete this entry">🗑️</button>` : ''}
            </div>
          </div>`;
      }).join('');
    }
    updateRoleBasedUI();
  }

  // ══════════════════════════════════════════════════════
  //  RENDER — HISTORY
  // ══════════════════════════════════════════════════════
  function renderHistory() {
    const el=document.getElementById('history-list');
    if (!state.monthlyResults.length) {
      el.innerHTML=`<div class="empty" style="padding:40px 0"><div class="empty-icon">📋</div><div>No months completed yet</div><div style="font-size:13px;margin-top:6px;color:var(--muted)">End a month to see results here</div></div>`;
      return;
    }
    el.innerHTML=state.monthlyResults.map(r=>{
      const allKids=Object.keys(r.kids);
      const sorted=[...allKids].sort((a,b)=>(r.kids[a]?.amount??0)-(r.kids[b]?.amount??0));
      const wNames=(r.winners??[r.winner]).join(' & ');
      const wColor=COLOR_HEX[(r.winners??[r.winner])[0]]??'#fff';
      const prizeStr=r.winners?.length>1?`Each won $${(r.pot/r.winners.length).toFixed(2)}`:`Won $${r.pot}`;
      return `
        <div class="hist-card">
          <div class="hist-month">${formatMonthKey(r.month)}</div>
          <div class="hist-winner-box">
            <div class="hist-trophy">🏆</div>
            <div class="hist-winner-name" style="color:${wColor}">${wNames}</div>
            <div class="hist-prize">${prizeStr}</div>
          </div>
          <div class="hist-rows">
            ${sorted.map(kid=>`
              <div class="hist-row">
                <div class="hist-row-left"><div class="hist-row-dot" style="background:${COLOR_HEX[kid]??'#888'}"></div><span class="hist-row-name" style="color:${COLOR_HEX[kid]??'#888'}">${escHtml(kid)}</span></div>
                <div class="hist-row-amount">${r.kids[kid]?.swears??0} swears = $${r.kids[kid]?.amount??0}</div>
              </div>`).join('')}
          </div>
        </div>`;
    }).join('');
  }

  // ══════════════════════════════════════════════════════
  //  RENDER — REPORTS
  // ══════════════════════════════════════════════════════
  let reportMonthIndex=0;
  function reportMonthStep(dir) { reportMonthIndex=Math.max(0,Math.min(state.monthlyResults.length,reportMonthIndex+dir)); renderReports(); }
  function getReportData() {
    if (reportMonthIndex===0) return {monthKey:currentMonthKey(),history:state.history};
    const r=state.monthlyResults[reportMonthIndex-1];
    return r ? {monthKey:r.month,history:null,pastResult:r} : {monthKey:currentMonthKey(),history:[]};
  }
  function renderReports() {
    const max=state.monthlyResults.length;
    document.getElementById('rep-prev').disabled=(reportMonthIndex>=max);
    document.getElementById('rep-next').disabled=(reportMonthIndex<=0);
    const {monthKey,history,pastResult}=getReportData();
    document.getElementById('rep-month-label').textContent=formatMonthKey(monthKey);
    if (pastResult) { renderPastReports(pastResult); return; }
    const byDate={};
    (history||[]).forEach(({kid,ts})=>{const d=ts.split('T')[0];if(!byDate[d])byDate[d]={};byDate[d][kid]=(byDate[d][kid]||0)+1;});
    const now=new Date(), mPfx=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`, dates=[];
    for(let d=1;d<=now.getDate();d++) dates.push(`${mPfx}-${String(d).padStart(2,'0')}`);
    const maxVal=Math.max(1,...dates.map(dt=>KIDS.reduce((s,k)=>s+(byDate[dt]?.[k]??0),0)));
    drawChart(dates,byDate,maxVal);
    document.getElementById('chart-legend').innerHTML=KIDS.map(k=>`<div class="legend-item"><div class="legend-dot" style="background:${COLOR_HEX[k]??'#888'}"></div><span>${escHtml(k)}</span></div>`).join('');
    const hasAnySwears = KIDS.some(kid => (state.kids[kid]?.swears ?? 0) > 0);
    if (!hasAnySwears) {
      document.getElementById('stats-grid').innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px 0;color:var(--muted)"><div style="font-size:32px;margin-bottom:8px">😇</div><div style="font-size:15px;font-weight:600">Perfect month so far!</div><div style="font-size:13px;margin-top:4px">No swears recorded yet</div></div>`;
    } else {
      document.getElementById('stats-grid').innerHTML=KIDS.map(kid=>{
        const {amount=0,swears=0}=state.kids[kid]??{};
        let worstDay=null,worstCount=0;
        Object.entries(byDate).forEach(([dt,d])=>{const c=d[kid]??0;if(c>worstCount){worstCount=c;worstDay=dt;}});
        const wl=worstDay?`Worst: ${MONTHS[parseInt(worstDay.split('-')[1])-1].slice(0,3)} ${parseInt(worstDay.split('-')[2])} (${worstCount})`:'No swears yet!';
        return `<div class="stat-card" style="--c:${COLOR_HEX[kid]??'#888'}"><div class="stat-name">${escHtml(kid)}</div><div class="stat-swears">${swears}</div><div class="stat-label">swear${swears!==1?'s':''} = $${amount}</div><div class="stat-worst">${wl}</div></div>`;
      }).join('');
    }
  }
  function renderPastReports(r) {
    const allKids=Object.keys(r.kids);
    const totals=Object.fromEntries(allKids.map(k=>[k,r.kids[k]?.swears??0]));
    const maxVal=Math.max(1,...Object.values(totals));
    drawTotalsChart(allKids,totals,maxVal);
    document.getElementById('chart-legend').innerHTML=allKids.map(k=>`<div class="legend-item"><div class="legend-dot" style="background:${COLOR_HEX[k]??'#888'}"></div><span>${escHtml(k)}: ${r.kids[k]?.swears??0} swears</span></div>`).join('');
    document.getElementById('stats-grid').innerHTML=allKids.map(kid=>{
      const {amount=0,swears=0}=r.kids[kid]??{};
      const isW=(r.winners??[r.winner]).includes(kid);
      return `<div class="stat-card" style="--c:${COLOR_HEX[kid]??'#888'}"><div class="stat-name">${escHtml(kid)} ${isW?'🏆':''}</div><div class="stat-swears">${swears}</div><div class="stat-label">swear${swears!==1?'s':''} = $${amount}</div></div>`;
    }).join('');
  }
  function rrect(ctx,x,y,w,h,r){r=Math.min(r,h/2,w/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
  function setupCanvas(id){const c=document.getElementById(id),dpr=window.devicePixelRatio||1,W=c.offsetWidth||320,H=c.offsetHeight||180;c.width=W*dpr;c.height=H*dpr;const ctx=c.getContext('2d');ctx.scale(dpr,dpr);return{ctx,W,H};}
  function drawGrid(ctx,W,H,pad,maxVal){const cH=H-pad.top-pad.bottom,steps=Math.min(maxVal,5);for(let s=0;s<=steps;s++){const v=Math.round((s/steps)*maxVal),y=pad.top+cH-(v/maxVal)*cH;ctx.strokeStyle='rgba(255,255,255,0.06)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(W-pad.right,y);ctx.stroke();if(s>0){ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='10px -apple-system,sans-serif';ctx.textAlign='right';ctx.fillText(v,pad.left-4,y+4);}}}
  function drawChart(dates,byDate,maxVal){const{ctx,W,H}=setupCanvas('report-canvas');const pad={top:14,right:10,bottom:28,left:26},cW=W-pad.left-pad.right,cH=H-pad.top-pad.bottom;ctx.clearRect(0,0,W,H);if(!dates.length){ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='13px -apple-system,sans-serif';ctx.textAlign='center';ctx.fillText('No swears yet 😇',W/2,H/2);return;}drawGrid(ctx,W,H,pad,maxVal);const barW=Math.max(5,Math.floor(cW/dates.length*0.68)),step=cW/dates.length;dates.forEach((date,i)=>{const x=pad.left+i*step+(step-barW)/2,dayData=byDate[date]||{};if(!KIDS.reduce((s,k)=>s+(dayData[k]??0),0))return;let yOff=pad.top+cH;KIDS.forEach(kid=>{const count=dayData[kid]??0;if(!count)return;const bH=(count/maxVal)*cH;yOff-=bH;ctx.fillStyle=COLOR_HEX[kid]??'#888';rrect(ctx,x,yOff,barW,bH,3);ctx.fill();});const dn=parseInt(date.split('-')[2]),show=dates.length<=16||dn%Math.ceil(dates.length/16)===0||dn===1;if(show){ctx.fillStyle='rgba(255,255,255,0.35)';ctx.font='10px -apple-system,sans-serif';ctx.textAlign='center';ctx.fillText(dn,x+barW/2,H-8);}});}
  function drawTotalsChart(kids,totals,maxVal){const{ctx,W,H}=setupCanvas('report-canvas');const pad={top:14,right:10,bottom:28,left:26},cW=W-pad.left-pad.right,cH=H-pad.top-pad.bottom;ctx.clearRect(0,0,W,H);drawGrid(ctx,W,H,pad,maxVal);const barW=Math.max(16,Math.floor(cW/kids.length*0.55)),step=cW/kids.length;kids.forEach((kid,i)=>{const count=totals[kid]??0,x=pad.left+i*step+(step-barW)/2,bH=(count/maxVal)*cH,y=pad.top+cH-bH;ctx.fillStyle=COLOR_HEX[kid]??'#888';rrect(ctx,x,y,barW,Math.max(bH,2),4);ctx.fill();ctx.fillStyle='rgba(255,255,255,0.35)';ctx.font='10px -apple-system,sans-serif';ctx.textAlign='center';ctx.fillText(kid.slice(0,4),x+barW/2,H-8);});}

  // ══════════════════════════════════════════════════════
  //  CSV EXPORT
  // ══════════════════════════════════════════════════════
  function exportToCsv() {
    const rows = [['Date', 'Time', 'Person', 'Amount', 'Category', 'Recorded By', 'Type']];

    // Current month history
    (state.history || []).forEach(entry => {
      const d = entry.ts ? new Date(entry.ts) : new Date();
      const dateStr = d.toLocaleDateString('en-US');
      const timeStr = d.toLocaleTimeString('en-US');
      if (entry.type === 'deletion') {
        rows.push([dateStr, timeStr, entry.kid, `-$${entry.originalAmount || 1}`, '', entry.deletedBy || '', 'Deletion']);
      } else {
        const catLabel = entry.category ? (CHARGE_CATEGORIES.find(c => c.id === entry.category)?.label ?? '') : '';
        rows.push([dateStr, timeStr, entry.kid, `$${entry.amount || 1}`, catLabel, entry.addedBy || '', 'Charge']);
      }
    });

    // Past months
    (state.monthlyResults || []).forEach(result => {
      const monthLabel = formatMonthKey(result.month);
      Object.entries(result.kids || {}).forEach(([kid, data]) => {
        rows.push([monthLabel, '', kid, `$${data.amount || 0}`, '', '', `Monthly Total (${data.swears || 0} swears)`]);
      });
      if (result.winners) {
        rows.push([monthLabel, '', result.winners.join(' & '), `$${result.pot || 0}`, '', '', 'Winner']);
      }
    });

    const csvContent = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `swear-jar-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast('📊 CSV exported!');
  }

  // ══════════════════════════════════════════════════════
  //  SETTINGS — JAR PEOPLE
  // ══════════════════════════════════════════════════════
  function renderSettings() {
    document.getElementById('settings-list').innerHTML = settings.map((s,i)=>`
      <div class="settings-card" style="margin-bottom:10px" data-idx="${i}">
        <div class="settings-row-top">
          <div class="settings-slot-emoji">${SLOT_EMOJI[i]??'🧒'}</div>
          <input class="settings-name-input" type="text" value="${escHtml(s.name)}"
            placeholder="Name" maxlength="20" data-field="name" data-idx="${i}" />
          <div class="settings-color-wrap">
            <div class="settings-color-swatch" id="swatch-${i}" style="background:${s.color}"></div>
            <input class="settings-color-input" type="color" value="${s.color}" data-field="color" data-idx="${i}"
              oninput="document.getElementById('swatch-${i}').style.background=this.value" />
          </div>
          ${settings.length>1
            ?`<button class="settings-delete-btn" onclick="deleteSettingsRow(${i})">×</button>`
            :`<div style="width:30px"></div>`}
        </div>
        <div class="settings-row-pay">
          <div class="pay-type-chips">
            ${PAYMENT_TYPES.map(pt=>`<button class="pay-type-chip${(s.paymentType||'')=== pt.id?' active':''}" data-type="${pt.id}" onclick="selectPayType(${i},'${pt.id}')">${pt.icon} ${pt.label}</button>`).join('')}
          </div>
          <input class="settings-pay-input" type="text" value="${escHtml(s.paymentInfo??'')}"
            placeholder="${getPayPlaceholder(s.paymentType||'')}"
            maxlength="80" data-field="pay" data-idx="${i}" />
        </div>
      </div>`).join('');
    renderAppUsers();

    // Firebase config section — admin only
    const fbSection = document.getElementById('firebase-sync-section');
    if (fbSection) fbSection.style.display = (currentUser === 'admin') ? '' : 'none';
    if (currentUser === 'admin') {
      updateDbStatus();
      const existingCfg = loadFbConfig();
      const cfgEl = document.getElementById('firebase-config-input');
      if (cfgEl && existingCfg && !cfgEl.value.trim()) {
        cfgEl.value = JSON.stringify(existingCfg, null, 2);
      }
    }

    // Alexa integration section — admin only
    const alexaSection = document.getElementById('alexa-section');
    if (alexaSection) alexaSection.style.display = (currentUser === 'admin') ? '' : 'none';
    if (currentUser === 'admin') {
      const skillInp = document.getElementById('alexa-skill-id-input');
      if (skillInp && !skillInp.value.trim()) {
        skillInp.value = loadAlexaSkillId();
      }
      // Populate Firebase URL from the live config
      const fbUrlEl = document.getElementById('alexa-fb-url');
      if (fbUrlEl) {
        const cfg = loadFbConfig();
        fbUrlEl.textContent = (cfg && cfg.databaseURL) ? cfg.databaseURL : 'https://swear-jar-ef967-default-rtdb.firebaseio.com';
      }
      renderAlexaExamples();
      updateAlexaStatus();
    }
  }

  function addSettingsRow() {
    if (settings.length>=10){toast('Max 10 people!');return;}
    settings.push({name:`Person ${settings.length+1}`,color:PALETTE[settings.length%PALETTE.length],paymentInfo:''});
    renderSettings();
    document.getElementById('settings-list').lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function deleteSettingsRow(idx) {
    if (settings.length<=1) return;
    settings.splice(idx,1); renderSettings(); toast('Person removed');
  }
  function saveSettingsFromForm() {
    document.querySelectorAll('.settings-name-input').forEach((inp,i)=>{settings[i].name=inp.value.trim()||`Person ${i+1}`;});
    document.querySelectorAll('.settings-color-input').forEach((inp,i)=>{settings[i].color=inp.value;});
    document.querySelectorAll('.settings-pay-input').forEach((inp,i)=>{settings[i].paymentInfo=inp.value.trim();});
    const oldKids=[...KIDS];
    saveSettings(settings);
    KIDS     =settings.map(s=>s.name);
    COLORS   =Object.fromEntries(settings.map(s=>[s.name,s.color]));
    COLOR_HEX=Object.fromEntries(settings.map(s=>[s.name,s.color]));
    EMOJI    =Object.fromEntries(settings.map((s,i)=>[s.name,SLOT_EMOJI[i]??'🧒']));
    PAY_INFO =Object.fromEntries(settings.map(s=>[s.name,s.paymentInfo??'']));
    const ns={kids:{},history:state.history,monthlyResults:state.monthlyResults,currentMonth:state.currentMonth};
    KIDS.forEach((name,i)=>{const on=oldKids[i];ns.kids[name]=(on&&state.kids[on])?state.kids[on]:(state.kids[name]??{amount:0,swears:0});});
    state=ns;
    // Save Alexa Skill ID if admin
    if (currentUser === 'admin') {
      const skillInp = document.getElementById('alexa-skill-id-input');
      if (skillInp) { saveAlexaSkillId(skillInp.value.trim()); updateAlexaStatus(); }
    }
    save(); renderSettings(); render(); toast('Settings saved! ✅');
  }

  // ══════════════════════════════════════════════════════
  //  SETTINGS — APP USERS
  // ══════════════════════════════════════════════════════
  function renderAppUsers() {
    const isAdmin = currentUser === 'admin';
    document.getElementById('users-list').innerHTML = appUsers.map((u,i)=>{
      const color=userColor(u.name), emoji=userEmoji(u.name,i);
      const isJar=KIDS.includes(u.name);
      const isParent=u.isParent;
      const roleLabel = isParent ? '👨‍👩‍👧‍👦 Parent · can resolve disputes' : isJar ? 'in the jar · can log swears' : 'can log swears';
      const adminControls = isAdmin ? `<button class="user-tag-parent-toggle ${isParent?'active':''}" onclick="toggleParentRole(${i})" title="Mark as parent">${isParent?'👨‍👩‍👧':'👤'}</button>` : '';
      return `
        <div class="user-tag-row">
          <div class="user-tag-left">
            <div class="user-tag-dot" style="background:${color}"></div>
            <div>
              <div class="user-tag-name">${escHtml(u.name)}</div>
              <div class="user-tag-label">${roleLabel}</div>
            </div>
          </div>
          <div class="user-tag-controls">
            ${adminControls}
            <button class="user-tag-del" onclick="removeAppUser(${i})">×</button>
          </div>
        </div>`;
    }).join('') || `<div style="color:var(--muted);font-size:13px;padding:8px 0">No users yet — add some below</div>`;
  }

  function addAppUser() {
    const inp=document.getElementById('new-user-input');
    const name=inp.value.trim();
    if (!name){toast('Enter a name first');return;}
    if (appUsers.some(u=>u.name.toLowerCase()===name.toLowerCase())){toast('Already in the list!');return;}
    appUsers.push({name});
    saveAppUsers(appUsers);
    inp.value='';
    renderAppUsers();
    toast(`Added ${name} 👤`);
  }

  function removeAppUser(idx) {
    const name=appUsers[idx]?.name;
    appUsers.splice(idx,1);
    saveAppUsers(appUsers);
    renderAppUsers();
    toast(`Removed ${name}`);
  }

  function toggleParentRole(idx) {
    if (currentUser !== 'admin') {
      toast('Only admin can change parent roles');
      return;
    }
    appUsers[idx].isParent = !appUsers[idx].isParent;
    saveAppUsers(appUsers);
    renderAppUsers();
    const name = appUsers[idx].name;
    toast(appUsers[idx].isParent ? `${name} is now a parent 👨‍👩‍👧‍👦` : `${name} is no longer a parent`);
  }

  // Keep app users in sync with jar members: if a jar member isn't in users, add them
  function syncUsersWithJar() {
    let changed=false;
    KIDS.forEach(name=>{
      if (!appUsers.some(u=>u.name===name)){appUsers.push({name});changed=true;}
    });
    if (changed) saveAppUsers(appUsers);
  }

  // ══════════════════════════════════════════════════════
  //  NAVIGATION
  // ══════════════════════════════════════════════════════
  function switchView(v) {
    // Restrict settings view to parents and admin
    if (v === 'settings' && !isCurrentUserParent()) {
      toast('Only parents can access settings');
      return;
    }
    document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(el=>el.classList.remove('active'));
    document.getElementById(`view-${v}`).classList.add('active');
    document.getElementById(`tab-${v}`).classList.add('active');
    if (v==='history')  renderHistory();
    if (v==='settings') renderSettings();
    if (v==='reports')  {reportMonthIndex=0;renderReports();}
  }

  // ══════════════════════════════════════════════════════
  //  TOAST
  // ══════════════════════════════════════════════════════
  let _tt;
  function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(_tt);_tt=setTimeout(()=>el.classList.remove('show'),2500);}

  // ══════════════════════════════════════════════════════
  //  SERVICE WORKER
  // ══════════════════════════════════════════════════════
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(()=>{}); }

  // ══════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════
  syncUsersWithJar();

  if (currentUser) {
    // Already logged in this session
    document.getElementById('login-screen').classList.add('hidden');
    updateUserChip();
  } else {
    // Show login
    renderLoginScreen();
  }

  // Initialize theme before rendering
  initTheme();

  render();

  // Show push notification banner if needed (jar kids only)
  if (currentUser) showPushBannerIfNeeded();

  // Bootstrap Firebase (only after user is identified — login does a reload so
  // by the time we reach here sessionStorage is already set if logged in)
  // Always connect to Firebase — config is now built into the app
  const _fbCfg = loadFbConfig();
  if (currentUser) {
    showLoadingOverlay('Fetching the latest data ☁️');
  }
  initFirebase(_fbCfg);

  // Check for month rollover every 60s (catches devices left open overnight)
  setInterval(checkMonthRollover, 60000);
