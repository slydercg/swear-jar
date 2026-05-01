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
  // Default per-person allocation per month
  const DEFAULT_PER_PERSON = 10;

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

  // ══════════════════════════════════════════════════════
  //  POT CARD THEME
  // ══════════════════════════════════════════════════════
  const POT_THEME_KEY = 'swearjar-pot-theme';
  const POT_THEMES = [
    { id: 'midnight',  label: 'Midnight' },
    { id: 'ocean',     label: 'Ocean' },
    { id: 'forest',    label: 'Forest' },
    { id: 'ember',     label: 'Ember' },
    { id: 'slate',     label: 'Slate' },
    { id: 'royal',     label: 'Royal' },
    { id: 'charcoal',  label: 'Charcoal' },
  ];

  function loadPotTheme() {
    return localStorage.getItem(POT_THEME_KEY) || 'midnight';
  }
  function savePotTheme(themeId) {
    localStorage.setItem(POT_THEME_KEY, themeId);
    if (fbDb) { try { fbDb.ref('/swearjar/potTheme').set(themeId); } catch(e) {} }
  }
  function applyPotTheme(themeId) {
    const card = document.querySelector('.pot-card');
    if (!card) return;
    // Remove all theme classes
    POT_THEMES.forEach(t => card.classList.remove('theme-' + t.id));
    // Add selected theme
    card.classList.add('theme-' + (themeId || 'midnight'));
  }
  function renderThemePicker() {
    const el = document.getElementById('theme-picker');
    if (!el) return;
    const current = loadPotTheme();
    el.innerHTML = POT_THEMES.map(t =>
      `<button class="theme-swatch theme-swatch-${t.id} ${t.id === current ? 'active' : ''}"
        onclick="selectPotTheme('${t.id}')" title="${t.label}"></button>`
    ).join('');
  }
  function selectPotTheme(themeId) {
    savePotTheme(themeId);
    applyPotTheme(themeId);
    renderThemePicker();
    toast(`Theme: ${POT_THEMES.find(t=>t.id===themeId)?.label}`);
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
    AVATARS   = Object.fromEntries(settings.map(s => [s.name, s.avatar ?? '']));
  }

  function cleanupFbListeners() {
    if (!fbDb) return;
    Object.entries(_fbListeners).forEach(([path, handler]) => {
      try { fbDb.ref(path).off('value', handler); } catch(e) {}
    });
    Object.keys(_fbListeners).forEach(k => delete _fbListeners[k]);
  }

  async function initFirebase(config) {
    // Guard: only register listeners once per page load
    if (_fbInitialized) return true;

    try {
      const existingApps = typeof firebase !== 'undefined' ? firebase.apps : [];
      const app = existingApps.length ? existingApps[0] : firebase.initializeApp(config);
      fbDb = firebase.database(app);
      _fbInitialized = true;

      // Authenticate anonymously so Firebase security rules (auth != null) work
      try {
        const auth = firebase.auth(app);
        if (!auth.currentUser) {
          await auth.signInAnonymously();
        }
      } catch(authErr) {
        console.warn('Auth setup incomplete');
      }

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

      // Pot theme listener
      const potThemeHandler = snap => {
        const val = snap.val();
        if (val && typeof val === 'string') {
          localStorage.setItem(POT_THEME_KEY, val);
          applyPotTheme(val);
        }
      };
      fbDb.ref('/swearjar/potTheme').on('value', potThemeHandler);
      _fbListeners['/swearjar/potTheme'] = potThemeHandler;

      // Game state listener — primary driver
      const gameStateHandler = snap => {
        const raw = snap.val();
        if (raw) {
          const incoming = {
            kids: raw.kids || {},
            history: fbToArray(raw.history),
            monthlyResults: fbToArray(raw.monthlyResults),
            currentMonth: raw.currentMonth || '',
            budgets: raw.budgets || {}
          };
          incoming.monthlyResults.forEach(r => {
            if (!r.winners && r.winner) { r.winners = [r.winner]; delete r.winner; }
          });
          // Sanitize kid data — ensure numeric fields are numbers, not NaN/undefined
          Object.values(incoming.kids).forEach(k => {
            if (typeof k.deducted !== 'number' || isNaN(k.deducted)) k.deducted = 0;
            if (typeof k.penalty !== 'number' || isNaN(k.penalty)) k.penalty = 0;
            if (typeof k.swears !== 'number' || isNaN(k.swears)) k.swears = 0;
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
      console.warn('Database connection failed');
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
  function fbTransaction(path, updateFn) {
    if (!fbDb) return Promise.resolve();
    return fbDb.ref(path).transaction(updateFn).catch(() => {});
  }
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
    idx = parseInt(idx);
    if (isNaN(idx) || idx < 0 || idx >= state.history.length) { toast('⛔ Invalid entry'); return; }
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
      state.kids[kid].deducted = Math.max(0, (state.kids[kid].deducted || 0) - entryAmt);
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
    idx = parseInt(idx);
    if (isNaN(idx) || idx < 0 || idx >= state.history.length) { toast('⛔ Invalid entry'); return; }
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
    idx = parseInt(idx);
    if (isNaN(idx) || idx < 0 || idx >= state.history.length) { toast('⛔ Invalid entry'); return; }
    if (!isCurrentUserParent()) { toast('⛔ Only parents and admins can resolve disputes'); return; }
    const entry = state.history[idx];
    if (!entry || !entry.disputed) { toast('⚠️ Not a disputed entry'); return; }
    if (!confirm(`Resolve dispute: remove $${entry.amount || 1} charge for ${entry.kid}?`)) return;

    const { kid, addedBy, ts } = entry;
    const entryAmt = entry.amount || 1;

    // Reverse the fee
    if (state.kids[kid]) {
      state.kids[kid].deducted = Math.max(0, (state.kids[kid].deducted || 0) - entryAmt);
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
    idx = parseInt(idx);
    if (isNaN(idx) || idx < 0 || idx >= state.history.length) { toast('⛔ Invalid entry'); return; }
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
  const DEFAULT_ADMIN_PIN = '037900';
  const PIN_LENGTH = 6;
  const PIN_MAX_ATTEMPTS = 5;
  const PIN_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
  let _adminPinHash = null;
  let _pinBuffer    = '';
  let _pinAttempts  = 0;
  let _pinLockedUntil = 0;

  async function sha256(str) {
    const data = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function loadAdminPinHash() {
    if (_adminPinHash) return _adminPinHash;
    // Try localStorage first (PIN hash cached after initial setup)
    const cached = localStorage.getItem('swearjar2-pin-hash');
    if (cached && cached.length === 64) { _adminPinHash = cached; return _adminPinHash; }
    // Compute default and persist (adminPin is write-only in Firebase)
    _adminPinHash = await sha256(DEFAULT_ADMIN_PIN);
    localStorage.setItem('swearjar2-pin-hash', _adminPinHash);
    if (fbDb) { try { fbDb.ref('/swearjar/adminPin').set(_adminPinHash); } catch(e) {} }
    return _adminPinHash;
  }
  function updateAdminPinHash(newHash) {
    _adminPinHash = newHash;
    localStorage.setItem('swearjar2-pin-hash', newHash);
    if (fbDb) { try { fbDb.ref('/swearjar/adminPin').set(newHash); } catch(e) {} }
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
    if (Date.now() < _pinLockedUntil) {
      const secs = Math.ceil((_pinLockedUntil - Date.now()) / 1000);
      document.getElementById('pin-error').textContent = `🔒 Locked — wait ${secs}s`;
      return;
    }
    if (_pinBuffer.length >= PIN_LENGTH) return;
    _pinBuffer += digit;
    updatePinDots();
    document.getElementById('pin-error').textContent = '';
    if (_pinBuffer.length === PIN_LENGTH) submitPin();
  }

  function pinBackspace() {
    _pinBuffer = _pinBuffer.slice(0, -1);
    updatePinDots();
  }

  function updatePinDots() {
    for (let i = 0; i < PIN_LENGTH; i++) {
      const dot = document.getElementById(`pd${i}`);
      if (dot) dot.classList.toggle('filled', i < _pinBuffer.length);
    }
  }

  function generateSessionToken() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function submitPin() {
    if (Date.now() < _pinLockedUntil) return;
    const hash   = await sha256(_pinBuffer);
    const stored = await loadAdminPinHash();
    if (hash === stored) {
      _pinAttempts = 0;
      // Generate admin session token and store in both sessionStorage and Firebase
      const token = generateSessionToken();
      sessionStorage.setItem('swearjar2-admin-token', token);
      if (fbDb) { try { fbDb.ref('/swearjar/adminSession').set({ token, ts: new Date().toISOString() }); } catch(e) {} }
      closePinModal();
      loginAs('admin');
    } else {
      _pinAttempts++;
      if (_pinAttempts >= PIN_MAX_ATTEMPTS) {
        _pinLockedUntil = Date.now() + PIN_LOCKOUT_MS;
        document.getElementById('pin-error').textContent = `🔒 Too many attempts — locked for 5 minutes`;
      } else {
        document.getElementById('pin-error').textContent = `❌ Incorrect PIN (${PIN_MAX_ATTEMPTS - _pinAttempts} attempts left)`;
      }
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
    if (markPaidBtn) {
      if (monthKey && currentUser === name) {
        markPaidBtn.style.display = 'block';
        markPaidBtn.onclick = () => markAsPaid(monthKey, name);
      } else {
        markPaidBtn.style.display = 'none';
      }
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

  function markLoserPaid(monthKey, payerName) {
    const monthResult = state.monthlyResults.find(r => r.month === monthKey);
    if (!monthResult || !monthResult.payments || !monthResult.payments[payerName]) {
      toast('⚠️ Payment record not found');
      return;
    }
    monthResult.payments[payerName].paid = true;
    monthResult.payments[payerName].paidAt = new Date().toISOString();
    monthResult.payments[payerName].paidBy = currentUser;
    save();
    toast(`✅ ${payerName} marked as paid!`);
    // Refresh announcement
    const announceOverlay = document.getElementById('announce-overlay');
    if (announceOverlay && !announceOverlay.classList.contains('hidden')) {
      showWinnerAnnouncement(monthResult);
    }
    // Refresh history if visible
    const activeTab = document.querySelector('.nav-tab.active')?.id?.replace('tab-','');
    if (activeTab === 'history') renderHistory();
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
  let AVATARS   = Object.fromEntries(settings.map(s => [s.name, s.avatar??'']));

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
    KIDS.forEach(k => { kids[k] = { deducted:0, swears:0, penalty:0 }; });
    return { kids, history:[], monthlyResults:[], currentMonth:'', budgets:{} };
  }
  function load() {
    try {
      const s = localStorage.getItem('swearjar2');
      if (s) {
        // Verify integrity signature (warn but don't block — Firebase is source of truth)
        const storedSig = localStorage.getItem(STATE_SIGN_KEY);
        if (storedSig) {
          verifyState(s, storedSig).then(valid => {
            if (!valid) console.warn('State signature mismatch — localStorage may have been tampered. Firebase data will override.');
          });
        }
        const data = JSON.parse(s);
        if (!data.budgets) data.budgets = {};
        // Migrate old amount-based data to new deducted model
        Object.values(data.kids || {}).forEach(k => {
          if (k.amount !== undefined && k.deducted === undefined) {
            k.deducted = k.amount; k.penalty = 0; delete k.amount;
          }
          if (k.deducted === undefined) k.deducted = 0;
          if (k.penalty === undefined) k.penalty = 0;
        });
        (data.monthlyResults||[]).forEach(r => { if (!r.winners&&r.winner){r.winners=[r.winner];delete r.winner;} });
        return data;
      }
    } catch(e) {}
    return defaultState();
  }
  const STATE_SIGN_KEY = 'swearjar2-sig';
  async function signState(stateStr) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('swearjar-integrity-v1'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stateStr));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
  }
  async function verifyState(stateStr, sig) {
    const expected = await signState(stateStr);
    return expected === sig;
  }
  function save() {
    const stateStr = JSON.stringify(state);
    localStorage.setItem('swearjar2', stateStr);
    signState(stateStr).then(sig => localStorage.setItem(STATE_SIGN_KEY, sig));
    fbSave();
  }
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
    const month = state.currentMonth;
    const budget = getMonthBudget(month);
    const alloc = KIDS.length > 0 ? Math.round((budget / KIDS.length) * 100) / 100 : 0;
    const winners = getWinners();
    const totalDed = totalDeductedAll();
    const winnerPrize = Math.max(0, Math.round((budget - totalDed) * 100) / 100);

    // Build result snapshot with remaining balances
    const kidsSnapshot = {};
    KIDS.forEach(kid => {
      const rem = getKidRemaining(kid);
      kidsSnapshot[kid] = {
        deducted: state.kids[kid]?.deducted ?? 0,
        swears: state.kids[kid]?.swears ?? 0,
        remaining: Math.max(0, rem),
        allocation: alloc,
      };
    });

    // Build payment records: each non-winner owes their lost amount
    const payments = {};
    KIDS.forEach(kid => {
      if (winners.includes(kid)) return;
      const rem = getKidRemaining(kid);
      const lost = Math.max(0, alloc - Math.max(0, rem));
      if (lost > 0) {
        const s = settings.find(x => x.name === kid);
        payments[kid] = {
          amount: Math.round(lost * 100) / 100,
          paid: false,
          paidAt: null,
          paymentType: s?.paymentType ?? '',
          paymentInfo: (s?.paymentInfo ?? '').trim(),
        };
      }
    });

    const result = { month, winners, budget, allocation: alloc, winnerPrize, kids: kidsSnapshot, payments };

    state.monthlyResults.unshift(result);

    // Reset for new month
    KIDS.forEach(k => {
      state.kids[k] = { deducted: 0, swears: 0, penalty: 0 };
    });
    state.history = [];
    state.currentMonth = newMonth;
    save(); render();
    if (budget > 0) showWinnerAnnouncement(result);
  }

  function showWinnerAnnouncement(result) {
    const { winners, kids, month, budget, allocation, winnerPrize } = result;
    // Sort by remaining (highest first)
    const allKids = Object.keys(kids);
    const sorted = [...allKids].sort((a,b) => (kids[b]?.remaining??0) - (kids[a]?.remaining??0));
    const overlay = document.getElementById('announce-overlay');
    overlay.dataset.month = month;

    document.getElementById('announce-month-badge').textContent = formatMonthKey(month);
    document.getElementById('announce-trophy').textContent = winners.length > 1 ? '🤝' : '🏆';
    const wnEl = document.getElementById('announce-winner-name');
    wnEl.textContent = winners.join(' & ');
    wnEl.style.color = COLOR_HEX[winners[0]] ?? 'var(--text)';
    const wp = winnerPrize ?? 0;
    const prizeText = winners.length > 1
      ? `Split $${wp.toFixed ? wp.toFixed(2) : wp} ($${(wp / winners.length).toFixed(2)} each)`
      : `Wins $${wp.toFixed ? wp.toFixed(2) : wp}!`;
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
            <span style="color:var(--muted);font-size:14px">${kids[kid]?.swears??0} swear${(kids[kid]?.swears??0)!==1?'s':''} · $${(kids[kid]?.remaining??0).toFixed(2)} left</span>
          </div>`).join('')}
      </div>`;

    // Payment section — one-tap pay buttons for each loser
    const payments = result.payments || {};
    const loserNames = Object.keys(payments).filter(k => payments[k].amount > 0);
    const winnerInfo = winners.map(w => {
      const s = settings.find(x => x.name === w);
      return { name: w, type: s?.paymentType ?? '', info: (s?.paymentInfo ?? '').trim() };
    }).filter(x => x.info);
    const winnerName = winners[0] || '';
    const note = `Swear Jar – ${formatMonthKey(month)}`;

    if (loserNames.length > 0 && winnerInfo.length > 0) {
      const wi = winnerInfo[0]; // primary winner payment info
      const paidCount = loserNames.filter(k => payments[k].paid).length;
      const totalOwed = loserNames.reduce((s,k) => s + payments[k].amount, 0);

      document.getElementById('announce-requests').innerHTML = `
        <div style="text-align:left;margin-top:16px">
          <div style="background:rgba(124,77,255,.1);border:1px solid rgba(124,77,255,.2);border-radius:14px;padding:12px;margin-bottom:12px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--purple);margin-bottom:6px">💰 Payment Status</div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
              <div style="flex:1;height:6px;background:var(--surface2);border-radius:6px;overflow:hidden">
                <div style="height:100%;background:linear-gradient(90deg,#00c851,#00e676);width:${loserNames.length>0?(paidCount/loserNames.length*100):0}%;transition:width .3s"></div>
              </div>
              <span style="font-size:13px;font-weight:700">${paidCount}/${loserNames.length}</span>
            </div>
            <div style="font-size:12px;color:var(--muted)">${paidCount === loserNames.length ? '🎉 All paid!' : `$${(totalOwed - loserNames.filter(k=>payments[k].paid).reduce((s,k)=>s+payments[k].amount,0)).toFixed(2)} outstanding`}</div>
          </div>

          <div class="modal-requests" style="margin-bottom:0">
            <div class="modal-req-label">📤 Pay ${escHtml(winnerName)}</div>
            <div class="modal-req-sub">Each person's forfeited amount goes to the winner</div>
            ${loserNames.map(name => {
              const p = payments[name];
              const payUrl = getRequestUrl(wi.type, wi.info, p.amount, note);
              const directPayUrl = getPaymentUrl(wi.type, wi.info);
              const isPaid = p.paid;
              const paidStyle = isPaid ? 'opacity:0.5' : '';
              const pt = PAYMENT_TYPES.find(t => t.id === wi.type);
              return `
              <div class="modal-req-row" style="${paidStyle}">
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
                  <span style="font-size:18px;flex-shrink:0">${isPaid ? '✅' : (AVATARS[name] ? `<img src="${AVATARS[name]}" style="width:28px;height:28px;border-radius:50%;object-fit:cover" />` : (pt?.icon ?? '💳'))}</span>
                  <div style="min-width:0">
                    <div style="font-weight:700;color:${COLOR_HEX[name]}">${escHtml(name)}</div>
                    <div style="font-size:11px;color:var(--muted)">${isPaid ? 'Paid ✓' : `owes $${p.amount.toFixed(2)} to ${escHtml(winnerName)}`}</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                  <span style="font-size:15px;font-weight:800">$${p.amount.toFixed(2)}</span>
                  ${isPaid ? '' : `
                    ${payUrl ? `<a href="${payUrl}" target="_blank" rel="noopener" class="modal-req-btn" style="font-size:11px">${pt?.icon??'💳'} Pay Now</a>` : ''}
                    <button class="modal-req-btn" style="font-size:11px;background:linear-gradient(135deg,#00c851,#00e676)" onclick="markLoserPaid('${month}','${escAttr(name)}')">✅ Paid</button>
                  `}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    } else {
      document.getElementById('announce-requests').innerHTML = '';
    }

    // Charity donation option
    const charity = getCharitySetting();
    if (charity && wp > 0) {
      const charityHtml = `
        <div style="text-align:center;margin-top:12px;padding:14px;background:rgba(0,200,100,.08);border:1px solid rgba(0,200,100,.2);border-radius:16px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#56c278;margin-bottom:6px">🎁 Charity Option</div>
          <div style="font-size:14px;margin-bottom:10px">Donate <strong>$${wp.toFixed ? wp.toFixed(2) : wp}</strong> to <strong>${escHtml(charity.name)}</strong> instead?</div>
          <button class="modal-req-btn" style="font-size:13px;background:linear-gradient(135deg,#56c278,#2e7d32);padding:10px 20px" onclick="donateToCharity(${wp},'${month}');dismissAnnouncement()">💝 Donate Now</button>
        </div>`;
      document.getElementById('announce-requests').insertAdjacentHTML('beforeend', charityHtml);
    }

    // Play celebration animation
    playCelebration(localStorage.getItem('swearjar2-celebration') || 'confetti');

    overlay.classList.remove('hidden');
  }

  function dismissAnnouncement() {
    const overlay = document.getElementById('announce-overlay');
    if (overlay.dataset.month) localStorage.setItem('swearjar2-announced', overlay.dataset.month);
    overlay.classList.add('hidden');
  }
  function formatMonthKey(k) { if(!k) return '—'; const [y,m]=k.split('-'); return `${MONTHS[parseInt(m)-1]} ${y}`; }
  // ── Pot / Budget helpers ──
  function getDefaultBudget() { return DEFAULT_PER_PERSON * KIDS.length; }
  function getMonthBudget(monthKey) {
    if (state.budgets && state.budgets[monthKey] !== undefined) return state.budgets[monthKey];
    if (state.budgets && state.budgets['default'] !== undefined) return state.budgets['default'];
    return getDefaultBudget();
  }
  function getCurrentAllocation() {
    const budget = getMonthBudget(currentMonthKey());
    return KIDS.length > 0 ? Math.round((budget / KIDS.length) * 100) / 100 : 0;
  }
  function getKidRemaining(kid) {
    const alloc = getCurrentAllocation();
    const deducted = parseFloat(state.kids[kid]?.deducted) || 0;
    const penalty = parseFloat(state.kids[kid]?.penalty) || 0;
    return Math.round((alloc - deducted - penalty) * 100) / 100;
  }
  function totalDeductedAll() { return Object.values(state.kids).reduce((s,k)=>s+(k.deducted||0),0); }
  function totalPotRemaining() {
    return KIDS.reduce((s,kid) => s + Math.max(0, getKidRemaining(kid)), 0);
  }
  function getWinners() {
    if (!KIDS.length) return [];
    const remainings = KIDS.map(k => getKidRemaining(k));
    const max = Math.max(...remainings);
    return KIDS.filter(k => getKidRemaining(k) === max);
  }
  function getWorst() {
    if (!KIDS.length || totalDeductedAll() === 0) return [];
    const remainings = KIDS.map(k => getKidRemaining(k));
    const min = Math.min(...remainings);
    return KIDS.filter(k => getKidRemaining(k) === min);
  }
  function relativeTime(iso) {
    const diff = (Date.now()-new Date(iso))/1000;
    if (diff<60)    return 'just now';
    if (diff<3600)  return `${Math.floor(diff/60)}m ago`;
    if (diff<86400) return `${Math.floor(diff/3600)}h ago`;
    const d=new Date(iso); return `${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}`;
  }
  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/`/g,'&#96;'); }

  // Payment info obfuscation — prevents casual Firebase browsing
  const _payKey = 'swearjar-pay-v1';
  function obfuscatePayInfo(plain) {
    if (!plain) return '';
    return btoa(Array.from(plain).map((c,i) => String.fromCharCode(c.charCodeAt(0) ^ _payKey.charCodeAt(i % _payKey.length))).join(''));
  }
  function deobfuscatePayInfo(encoded) {
    if (!encoded) return '';
    try {
      const decoded = atob(encoded);
      return Array.from(decoded).map((c,i) => String.fromCharCode(c.charCodeAt(0) ^ _payKey.charCodeAt(i % _payKey.length))).join('');
    } catch(e) { return encoded; }
  }
  function escAttr(s) { return escHtml(String(s)).replace(/\\/g, '\\\\'); }
  function copyToClipboard(text) { navigator.clipboard?.writeText(text).catch(()=>{}); toast(`Copied: ${text} 📋`); }

  // Color for a user name (jar member color or fallback purple)
  function userColor(name) { return COLOR_HEX[name] ?? '#7c4dff'; }
  // Emoji for a user (jar member emoji or cycle through extras)
  function userEmoji(name, idx) {
    const jarIdx = KIDS.indexOf(name);
    if (jarIdx >= 0) return SLOT_EMOJI[jarIdx] ?? '🧒';
    return EXTRA_EMOJI[idx % EXTRA_EMOJI.length];
  }
  // Avatar for a user — returns photo URL or empty string
  function userAvatar(name) { return AVATARS[name] ?? ''; }

  // Render an avatar element: photo if available, emoji fallback
  function renderAvatar(name, size, emoji, color) {
    const avatar = userAvatar(name);
    if (avatar) {
      return `<div class="avatar-photo" style="width:${size}px;height:${size}px;border-color:${color||userColor(name)}"><img src="${avatar}" alt="${escHtml(name)}" /></div>`;
    }
    return `<div class="kid-avatar" style="width:${size}px;height:${size}px;--c:${color||userColor(name)}"><span class="kid-avatar-emoji" style="font-size:${Math.round(size*0.48)}px">${emoji||'🧒'}</span></div>`;
  }

  // Handle avatar file upload — resize to 200x200 and convert to base64
  function handleAvatarUpload(idx, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('⚠️ Please select an image file'); return; }
    if (file.size > 2 * 1024 * 1024) { toast('⚠️ Image must be under 2MB'); return; }

    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const size = 100;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const srcSize = Math.min(img.width, img.height);
        const sx = (img.width - srcSize) / 2;
        const sy = (img.height - srcSize) / 2;
        ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        // Reject if compressed result is still too large (>30KB)
        if (dataUrl.length > 40000) {
          toast('⚠️ Image too complex — try a simpler photo');
          return;
        }
        settings[idx].avatar = dataUrl;

        // Update the preview immediately
        const preview = document.getElementById(`avatar-preview-${idx}`);
        if (preview) {
          preview.innerHTML = `<img src="${dataUrl}" alt="avatar" />`;
          preview.className = 'settings-avatar-preview has-photo';
        }
        const removeBtn = document.getElementById(`avatar-remove-${idx}`);
        if (removeBtn) removeBtn.style.display = '';

        toast(`📸 Photo set for ${settings[idx].name}`);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function removeAvatar(idx) {
    settings[idx].avatar = '';
    const preview = document.getElementById(`avatar-preview-${idx}`);
    if (preview) {
      preview.innerHTML = `<span>${SLOT_EMOJI[idx]??'🧒'}</span>`;
      preview.className = 'settings-avatar-preview';
    }
    const removeBtn = document.getElementById(`avatar-remove-${idx}`);
    if (removeBtn) removeBtn.style.display = 'none';
    toast('Photo removed');
  }

  // ══════════════════════════════════════════════════════
  //  LOGIN
  // ══════════════════════════════════════════════════════
  function renderLoginScreen() {
    const grid = document.getElementById('login-grid');
    grid.innerHTML = appUsers.map((u, i) => {
      const color = userColor(u.name);
      const emoji = userEmoji(u.name, i);
      const avatar = userAvatar(u.name);
      const isJar = KIDS.includes(u.name);
      return `
        <button class="login-btn" style="border-color:${color}22"
          onclick="loginAs('${escAttr(u.name)}')"
          onmouseover="this.style.borderColor='${color}'"
          onmouseout="this.style.borderColor='${color}22'">
          ${avatar
            ? `<div class="login-btn-avatar"><img src="${avatar}" alt="${escHtml(u.name)}" /></div>`
            : `<div class="login-btn-emoji">${emoji}</div>`}
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
    const dotEl = document.getElementById('user-chip-dot');
    const avatar = userAvatar(currentUser);
    if (avatar) {
      dotEl.style.background = `url(${avatar}) center/cover`;
      dotEl.style.width = '22px';
      dotEl.style.height = '22px';
    } else {
      dotEl.style.background = userColor(currentUser);
      dotEl.style.width = '8px';
      dotEl.style.height = '8px';
    }
  }

  let _adminTokenVerified = false;
  function isValidAdminSession() {
    if (currentUser !== 'admin') return false;
    const token = sessionStorage.getItem('swearjar2-admin-token');
    if (!token) return false;
    // Async verification against Firebase (non-blocking; cached after first check)
    if (!_adminTokenVerified && fbDb) {
      fbDb.ref('/swearjar/adminSession/token').once('value').then(snap => {
        if (snap.val() !== token) {
          sessionStorage.removeItem('swearjar2-admin-token');
          _adminTokenVerified = false;
          toast('⚠️ Admin session expired — please log in again');
          promptSwitchUser();
        } else {
          _adminTokenVerified = true;
        }
      }).catch(() => {});
    }
    return true;
  }

  function isCurrentUserParent() {
    if (currentUser === 'admin') return isValidAdminSession();
    const user = appUsers.find(u => u.name === currentUser);
    return user && user.isParent;
  }

  // ══════════════════════════════════════════════════════
  //  ACTIONS
  // ══════════════════════════════════════════════════════
  function addSwear(kid, categoryId) {
    const jarCats = getActiveJar().categories || CHARGE_CATEGORIES;
    const category = jarCats.find(c => c.id === categoryId) || jarCats[1] || CHARGE_CATEGORIES[1];
    const chargeAmount = category.amount;
    // Check remaining balance before charging
    if (!state.kids[kid]) state.kids[kid] = { deducted:0, swears:0, penalty:0 };
    if (typeof state.kids[kid].deducted !== 'number' || isNaN(state.kids[kid].deducted)) state.kids[kid].deducted = 0;
    if (typeof state.kids[kid].penalty !== 'number' || isNaN(state.kids[kid].penalty)) state.kids[kid].penalty = 0;
    const remaining = getKidRemaining(kid);
    if (remaining <= 0) {
      toast(`⛔ ${kid} has $0 left — no more charges this month`);
      return;
    }
    if (chargeAmount > remaining) {
      toast(`⛔ ${kid} only has $${remaining.toFixed(2)} left — can't charge $${chargeAmount.toFixed(2)}`);
      return;
    }
    // Haptic feedback on iOS
    haptic('medium');
    state.kids[kid].deducted += chargeAmount;
    state.kids[kid].swears++;
    state.history.unshift({
      kid, ts: new Date().toISOString(), addedBy: currentUser ?? 'Unknown',
      amount: chargeAmount, category: category.id, jar: activeJarId
    });
    if (state.history.length > 500) state.history.length = 500;
    // Use transaction for the kid's deducted value to prevent race conditions
    fbTransaction(`/swearjar/gameState/kids/${kid}/deducted`, current => (parseFloat(current) || 0) + chargeAmount);
    save(); render();
    const newRemaining = getKidRemaining(kid);
    const amtStr = chargeAmount % 1 === 0 ? `$${chargeAmount}` : `$${chargeAmount.toFixed(2)}`;
    if (newRemaining <= 0) {
      toast(`${kid} -${amtStr} ${category.emoji} · $0.00 remaining — tapped out!`);
    } else {
      toast(`${kid} -${amtStr} ${category.emoji} · $${newRemaining.toFixed(2)} remaining`);
    }
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
    const entryAmt = entry.amount || 1;
    if (state.kids[entry.kid]) {
      state.kids[entry.kid].deducted = Math.max(0, (state.kids[entry.kid].deducted || 0) - entryAmt);
      state.kids[entry.kid].swears = Math.max(0, state.kids[entry.kid].swears - 1);
    }
    save(); render();
    toast(`Undid ${entry.kid}'s charge ↩`);
    setTimeout(() => { _undoInProgress = false; }, 500);
  }

  function openEndMonth() {
    const budget = getMonthBudget(currentMonthKey());
    const alloc = getCurrentAllocation();
    const winners = getWinners();
    // Sort by remaining (highest first = winner)
    const sorted = [...KIDS].sort((a,b) => getKidRemaining(b) - getKidRemaining(a));
    const totalDed = totalDeductedAll();
    const potLeft = Math.max(0, Math.round((budget - totalDed) * 100) / 100);
    document.getElementById('modal-sub').textContent =
      totalDed === 0 ? 'No swears this month — everyone splits the pot! 🎉'
      : winners.length>1 ? `${winners.join(' & ')} tied — they split $${potLeft.toFixed(2)}!`
      : `${winners[0]} wins the remaining $${potLeft.toFixed(2)}!`;
    const prize = winners.length > 1 ? `Split $${potLeft.toFixed(2)} (${(potLeft/winners.length).toFixed(2)} each)` : `Wins $${potLeft.toFixed(2)}!`;
    document.getElementById('modal-winner-box').innerHTML = `
      <div class="modal-trophy">${winners.length>1?'🤝':'🏆'}</div>
      <div class="modal-winner-name" style="color:${COLOR_HEX[winners[0]]}">${winners.join(' & ')}</div>
      <div class="modal-prize">${prize}</div>`;
    document.getElementById('modal-rows').innerHTML = sorted.map((kid,i)=>{
      const rem = getKidRemaining(kid);
      const swears = state.kids[kid]?.swears??0;
      return `
      <div class="modal-row">
        <div class="modal-row-left">
          <span>${i===0?'🥇':i===1?'🥈':i===2?'🥉':'4️⃣'}</span>
          <span style="font-weight:700;color:${COLOR_HEX[kid]}">${escHtml(kid)}</span>
        </div>
        <div class="modal-row-right">${swears} swear${swears!==1?'s':''} · $${rem.toFixed(2)} remaining</div>
      </div>`;
    }).join('');
    document.getElementById('modal-payment').innerHTML = '';
    document.getElementById('modal-requests').innerHTML = '';
    document.getElementById('overlay').classList.add('open');
  }

  function confirmEndMonth() {
    backupStateForUndo();
    const winners = getWinners(), month = currentMonthKey();
    const budget = getMonthBudget(month);
    const alloc = getCurrentAllocation();
    const totalDed = totalDeductedAll();
    const winnerPrize = Math.max(0, Math.round((budget - totalDed) * 100) / 100);
    // Build result snapshot
    const kidsSnapshot = {};
    KIDS.forEach(kid => {
      const rem = getKidRemaining(kid);
      kidsSnapshot[kid] = { deducted: state.kids[kid]?.deducted??0, swears: state.kids[kid]?.swears??0, remaining: Math.max(0,rem), allocation: alloc };
    });
    // Build payment records
    const payments = {};
    KIDS.forEach(kid => {
      if (winners.includes(kid)) return;
      const rem = getKidRemaining(kid);
      const lost = Math.max(0, alloc - Math.max(0, rem));
      if (lost > 0) {
        const s = settings.find(x => x.name === kid);
        payments[kid] = {
          amount: Math.round(lost * 100) / 100,
          paid: false,
          paidAt: null,
          paymentType: s?.paymentType ?? '',
          paymentInfo: (s?.paymentInfo ?? '').trim(),
        };
      }
    });
    state.monthlyResults.unshift({ month, winners, budget, allocation: alloc, winnerPrize, kids: kidsSnapshot, payments });
    KIDS.forEach(k=>{state.kids[k]={deducted:0,swears:0,penalty:0};});
    state.history=[];
    save(); closeModal(); render(); switchView('tracker');
    // Show the winner announcement with payment buttons
    const latestResult = state.monthlyResults[0];
    if (budget > 0) showWinnerAnnouncement(latestResult);
    const prizePerWinner = winners.length > 1 ? (winnerPrize / winners.length).toFixed(2) : winnerPrize.toFixed(2);
    toast(`${winners.join(' & ')} win${winners.length>1?'':'s'} $${prizePerWinner}${winners.length>1?' each':''}! 🏆`);
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
    applyPotTheme(loadPotTheme());
    // Show active jar in header
    const titleEl = document.getElementById('app-title');
    const jar = getActiveJar();
    if (titleEl) titleEl.textContent = `${jar.icon} ${jar.name}`;
    const budget = getMonthBudget(currentMonthKey());
    const alloc = getCurrentAllocation();
    const potRemaining = totalPotRemaining();
    const winners = getWinners(), worst = getWorst();
    document.getElementById('month-chip').textContent = formatMonthKey(currentMonthKey());
    const totalDed = totalDeductedAll();
    const potLeft = Math.max(0, Math.round((budget - totalDed) * 100) / 100);
    document.getElementById('pot-amount').textContent = `$${potLeft.toFixed(2)}`;
    // Show per-person breakdown
    const potLabelEl = document.getElementById('pot-label');
    if (potLabelEl) potLabelEl.textContent = `${getActiveJar().icon} Remaining of $${budget.toFixed(0)}`;
    const potSubEl = document.getElementById('pot-sub');
    if (potSubEl) potSubEl.textContent = `${KIDS.length} participants · $${alloc.toFixed(2)} each`;
    // Show who's winning and their remaining amount
    const potLeaderEl = document.getElementById('pot-leader');
    if (totalDed > 0 && winners.length > 0) {
      const winnerNames = winners.length > 2
        ? `${winners[0]} +${winners.length - 1} more`
        : winners.join(' & ');
      const prizePerWinner = winners.length > 1 ? (potLeft / winners.length).toFixed(2) : potLeft.toFixed(2);
      potLeaderEl.innerHTML = `<span>${escHtml(winnerNames)}</span><span class="pot-leader-amount">wins $${prizePerWinner}</span>`;
    } else {
      potLeaderEl.textContent = '—';
    }
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
    document.getElementById('kids-grid').innerHTML = KIDS.map(kid=>{
      const {swears=0, penalty=0}=state.kids[kid]??{};
      const remaining = getKidRemaining(kid);
      const pctLeft = alloc > 0 ? Math.max(0, Math.round((Math.max(0,remaining) / alloc) * 100)) : 100;
      const isLeading = totalDeductedAll()>0 && winners.includes(kid), isWorst = worst.includes(kid);
      const isOver = remaining < 0;
      const cls=['kid-card',isLeading?'leading':'',isWorst?'worst':'',isOver?'overdrawn':''].filter(Boolean).join(' ');
      const streak = getStreak(kid);
      return `
        <div class="${cls}" data-kid="${kid}" style="--c:${COLORS[kid]??'#888'}">
          <div class="kid-badmouth">🤬</div>
          <div class="kid-crown">👑</div>
          ${renderAvatar(kid, 56, EMOJI[kid]??'🧒', COLORS[kid]??'#888')}
          <div class="kid-name">${escHtml(kid)}</div>
          <div class="kid-amount ${isOver ? 'overdrawn-amount' : ''}">${isOver ? '-' : ''}$${Math.abs(remaining).toFixed(2)} <span class="kid-amount-total">/ $${alloc.toFixed(2)}</span></div>
          <div class="kid-count">${swears} swear${swears!==1?'s':''}${penalty > 0 ? ` · -$${penalty.toFixed(2)} penalty` : ''}</div>
          <div class="kid-balance-bar"><div class="kid-balance-fill" style="width:${pctLeft}%;background:${isOver?'#ff4444':COLORS[kid]??'#888'}"></div></div>
          ${streak >= 3 ? `<div class="streak-badge">${getStreakBadge(streak)?.badge ?? '🔥'} ${streak >= 30 ? '30+' : streak}-day streak · ${getStreakBadge(streak)?.label ?? ''}</div>` : ''}
          ${remaining <= 0
            ? `<div class="charge-tapped-out">⛔ Tapped out for the month</div>`
            : `<div class="charge-categories">
                ${(getActiveJar().categories || CHARGE_CATEGORIES).map(cat => {
                  const canAfford = remaining >= cat.amount;
                  return `<button class="charge-cat-btn" style="background:${canAfford ? cat.color : '#555'}" onclick="addSwear('${escAttr(kid)}','${cat.id}')" ${canAfford ? '' : 'disabled'} title="${cat.label}: -$${cat.amount.toFixed(2)}">${cat.emoji} -$${cat.amount % 1 === 0 ? cat.amount : cat.amount.toFixed(2)}</button>`;
                }).join('')}
              </div>
              <button class="charge-photo-btn" onclick="capturePhotoEvidence('${escAttr(kid)}','${(getActiveJar().categories||CHARGE_CATEGORIES)[1]?.id||'moderate'}')" title="Charge with photo evidence">📸</button>`}
        </div>`;
    }).join('');
    const recent=state.history.slice(0,_activityShown), actEl=document.getElementById('activity-list');
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
                <div class="activity-badge deleted">+$${entry.originalAmount || entry.amount || 1} restored</div>
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
              ${AVATARS[kid] ? `<div class="activity-avatar"><img src="${AVATARS[kid]}" alt="${escHtml(kid)}" /></div>` : `<div class="activity-dot"></div>`}
              <div class="activity-info">
                <div class="activity-name">${escHtml(kid)}</div>
                ${addedBy ? `<div class="activity-by">recorded by ${escHtml(addedBy)}${isDisputed ? ' · <span style="color:#ffa726">🚩 disputed</span>' : ''}</div>` : ''}
              </div>
            </div>
            <div class="activity-right">
              <div class="activity-time">${relativeTime(ts)}</div>
              ${isDisputed
                ? `<div class="activity-badge disputed-badge">🚩 Disputed</div>`
                : `<div class="activity-badge">${entry.category ? (CHARGE_CATEGORIES.find(c=>c.id===entry.category)?.emoji??'') + ' ' : ''}-$${entry.amount || 1}${entry.photo ? ' 📸' : ''}</div>`}
              ${canDispute ? `<button class="activity-dispute-btn" onclick="disputeActivity(${idx})" title="Flag charge as disputed">🚩</button>` : ''}
              ${isDisputed && isCurrentUserParent() ? `<button class="activity-resolve-btn" onclick="resolveDispute(${idx})" title="Resolve dispute (remove charge)">✅</button><button class="activity-dismiss-btn" onclick="dismissDispute(${idx})" title="Dismiss dispute (keep charge)">❌</button>` : ''}
              ${canDel ? `<button class="activity-del-btn" onclick="deleteActivity(${idx})" title="Delete this entry">🗑️</button>` : ''}
            </div>
          </div>`;
      }).join('');
      if (state.history.length > _activityShown) {
        actEl.insertAdjacentHTML('beforeend', `<button class="btn-show-more" onclick="showMoreActivity()">Show more (${state.history.length - _activityShown} remaining)</button>`);
      }
    }
    updateRoleBasedUI();
  }

  // ══════════════════════════════════════════════════════
  //  RENDER — HISTORY
  // ══════════════════════════════════════════════════════
  let _activityShown = 10;
  function showMoreActivity() {
    _activityShown += 10;
    render();
  }

  // Debounce rapid renders (e.g. Firebase sync + local save firing together)
  let _renderTimer = null;
  const _origRender = render;
  render = function() {
    if (_renderTimer) clearTimeout(_renderTimer);
    _renderTimer = setTimeout(_origRender, 16);
  };

  // ── Winners tab: month-by-month full announcement view ──
  let winnersMonthIndex = 0;

  function winnersMonthStep(dir) {
    winnersMonthIndex = Math.max(0, Math.min(state.monthlyResults.length - 1, winnersMonthIndex + dir));
    renderHistory();
  }

  function renderHistory() {
    const nav = document.getElementById('winners-nav');
    const el = document.getElementById('winners-content');
    if (!state.monthlyResults.length) {
      if (nav) nav.style.display = 'none';
      el.innerHTML = `<div class="winners-empty"><div class="winners-empty-icon">🏆</div><div style="font-size:17px;font-weight:700;margin-bottom:6px">No winners yet</div><div style="font-size:13px">Complete a month to see results here</div></div>`;
      return;
    }

    // Show nav and clamp index
    if (nav) nav.style.display = '';
    const max = state.monthlyResults.length;
    winnersMonthIndex = Math.max(0, Math.min(max - 1, winnersMonthIndex));
    document.getElementById('win-prev').disabled = (winnersMonthIndex >= max - 1);
    document.getElementById('win-next').disabled = (winnersMonthIndex <= 0);

    const r = state.monthlyResults[winnersMonthIndex];
    document.getElementById('win-month-label').textContent = formatMonthKey(r.month);

    // Build the full announcement card inline
    const winners = r.winners ?? [r.winner];
    const allKids = Object.keys(r.kids);
    const sorted = [...allKids].sort((a,b) => (r.kids[b]?.remaining??0) - (r.kids[a]?.remaining??0));
    const wColor = COLOR_HEX[winners[0]] ?? 'var(--text)';
    const prize = r.winnerPrize ?? r.pot ?? 0;
    const prizeStr = winners.length > 1
      ? `Split $${prize.toFixed ? prize.toFixed(2) : prize} ($${(prize / winners.length).toFixed(2)} each)`
      : `Wins $${prize.toFixed ? prize.toFixed(2) : prize}!`;
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣'];

    // Payment section
    const payments = r.payments || {};
    const loserNames = Object.keys(payments).filter(k => payments[k]?.amount > 0);
    const winnerInfo = winners.map(w => {
      const s = settings.find(x => x.name === w);
      return { name: w, type: s?.paymentType ?? '', info: (s?.paymentInfo ?? '').trim() };
    }).filter(x => x.info);
    const winnerName = winners[0] || '';
    const note = `Swear Jar – ${formatMonthKey(r.month)}`;

    let paymentHtml = '';
    if (loserNames.length > 0) {
      const wi = winnerInfo.length > 0 ? winnerInfo[0] : null;
      const paidCount = loserNames.filter(k => payments[k].paid).length;
      const totalOwed = loserNames.reduce((s,k) => s + payments[k].amount, 0);
      const outstanding = totalOwed - loserNames.filter(k=>payments[k].paid).reduce((s,k)=>s+payments[k].amount, 0);

      paymentHtml = `
        <div style="text-align:left;margin-top:16px">
          <div style="background:rgba(124,77,255,.1);border:1px solid rgba(124,77,255,.2);border-radius:14px;padding:12px;margin-bottom:12px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--purple);margin-bottom:6px">💰 Payment Status</div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
              <div style="flex:1;height:6px;background:var(--surface2);border-radius:6px;overflow:hidden">
                <div style="height:100%;background:linear-gradient(90deg,#00c851,#00e676);width:${loserNames.length>0?(paidCount/loserNames.length*100):0}%;transition:width .3s"></div>
              </div>
              <span style="font-size:13px;font-weight:700">${paidCount}/${loserNames.length}</span>
            </div>
            <div style="font-size:12px;color:var(--muted)">${paidCount === loserNames.length ? '🎉 All paid!' : `$${outstanding.toFixed(2)} outstanding`}</div>
          </div>

          <div class="modal-requests" style="margin-bottom:0">
            <div class="modal-req-label">📤 Pay ${escHtml(winnerName)}</div>
            ${loserNames.map(name => {
              const p = payments[name];
              const payUrl = wi ? getRequestUrl(wi.type, wi.info, p.amount, note) : null;
              const isPaid = p.paid;
              const paidStyle = isPaid ? 'opacity:0.5' : '';
              const pt = wi ? PAYMENT_TYPES.find(t => t.id === wi.type) : null;
              return `
              <div class="modal-req-row" style="${paidStyle}">
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
                  <span style="font-size:18px;flex-shrink:0">${isPaid ? '✅' : (AVATARS[name] ? `<img src="${AVATARS[name]}" style="width:28px;height:28px;border-radius:50%;object-fit:cover" />` : (pt?.icon ?? '💳'))}</span>
                  <div style="min-width:0">
                    <div style="font-weight:700;color:${COLOR_HEX[name]}">${escHtml(name)}</div>
                    <div style="font-size:11px;color:var(--muted)">${isPaid ? `Paid ✓${p.paidAt ? ' · '+relativeTime(p.paidAt) : ''}` : `owes $${p.amount.toFixed(2)}`}</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                  <span style="font-size:15px;font-weight:800">$${p.amount.toFixed(2)}</span>
                  ${isPaid ? '' : `
                    ${payUrl ? `<a href="${payUrl}" target="_blank" rel="noopener" class="modal-req-btn" style="font-size:11px">${pt?.icon??'💳'} Pay</a>` : ''}
                    <button class="modal-req-btn" style="font-size:11px;background:linear-gradient(135deg,#00c851,#00e676)" onclick="markLoserPaid('${r.month}','${escAttr(name)}');renderHistory()">✅ Paid</button>
                  `}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }

    el.innerHTML = `
      <div class="winners-card">
        <div class="winners-month-badge">${formatMonthKey(r.month)} · Budget $${r.budget ?? '?'}</div>
        <div class="winners-trophy">${winners.length > 1 ? '🤝' : '🏆'}</div>
        <div class="winners-headline">Month's Winner</div>
        <div class="winners-name" style="color:${wColor}">${winners.join(' & ')}</div>
        <div class="winners-prize">${prizeStr}</div>

        <div class="winners-leaderboard">
          ${sorted.map((kid,i) => `
            <div class="winners-lb-row ${winners.includes(kid) ? 'winner-row' : ''}">
              <div style="display:flex;align-items:center;gap:10px">
                <span>${medals[i]??'•'}</span>
                ${AVATARS[kid] ? `<img src="${AVATARS[kid]}" style="width:24px;height:24px;border-radius:50%;object-fit:cover" />` : ''}
                <span style="font-weight:700;color:${COLOR_HEX[kid]}">${escHtml(kid)}</span>
              </div>
              <span style="color:var(--muted);font-size:13px">${r.kids[kid]?.swears??0} swear${(r.kids[kid]?.swears??0)!==1?'s':''} · $${(r.kids[kid]?.remaining??0).toFixed(2)} left</span>
            </div>`).join('')}
        </div>

        ${paymentHtml}
      </div>

      <div style="text-align:center;padding:8px 0;font-size:12px;color:var(--muted)">
        ${winnersMonthIndex + 1} of ${max} month${max!==1?'s':''}
      </div>`;
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
    document.getElementById('rep-prev').disabled=(reportMonthIndex>=max);  // ‹ disabled when at oldest month
    document.getElementById('rep-next').disabled=(reportMonthIndex<=0);    // › disabled when at current month
    const {monthKey,history,pastResult}=getReportData();
    document.getElementById('rep-month-label').textContent=formatMonthKey(monthKey);
    if (pastResult) { renderPastReports(pastResult); return; }
    const byDate={};
    (history||[]).forEach(entry => {
      if (!entry || entry.type === 'deletion' || !entry.ts || !entry.kid) return;
      const d = entry.ts.split('T')[0];
      if (!byDate[d]) byDate[d] = {};
      byDate[d][entry.kid] = (byDate[d][entry.kid] || 0) + 1;
    });
    // Use EST date to match the month key system
    const estNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const mPfx = `${estNow.getFullYear()}-${String(estNow.getMonth()+1).padStart(2,'0')}`;
    const dates = [];
    for (let d = 1; d <= estNow.getDate(); d++) dates.push(`${mPfx}-${String(d).padStart(2,'0')}`);
    const maxVal = Math.max(1, ...dates.map(dt => KIDS.reduce((s,k) => s + (byDate[dt]?.[k] ?? 0), 0)));
    drawChart(dates, byDate, maxVal);
    document.getElementById('chart-legend').innerHTML = KIDS.map(k => `<div class="legend-item"><div class="legend-dot" style="background:${COLOR_HEX[k]??'#888'}"></div><span>${escHtml(k)}</span></div>`).join('');
    const hasAnySwears = KIDS.some(kid => (state.kids[kid]?.swears ?? 0) > 0);
    if (!hasAnySwears) {
      document.getElementById('stats-grid').innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px 0;color:var(--muted)"><div style="font-size:32px;margin-bottom:8px">😇</div><div style="font-size:15px;font-weight:600">Perfect month so far!</div><div style="font-size:13px;margin-top:4px">No swears recorded yet</div></div>`;
    } else {
      const alloc = getCurrentAllocation();
      document.getElementById('stats-grid').innerHTML=KIDS.map(kid=>{
        const {swears=0}=state.kids[kid]??{};
        const remaining = getKidRemaining(kid);
        let worstDay=null,worstCount=0;
        Object.entries(byDate).forEach(([dt,d])=>{const c=d[kid]??0;if(c>worstCount){worstCount=c;worstDay=dt;}});
        const wl=worstDay?`Worst: ${MONTHS[parseInt(worstDay.split('-')[1])-1].slice(0,3)} ${parseInt(worstDay.split('-')[2])} (${worstCount})`:'Clean!';
        return `<div class="stat-card" style="--c:${COLOR_HEX[kid]??'#888'}"><div class="stat-name">${escHtml(kid)}</div><div class="stat-swears">${swears}</div><div class="stat-label">swear${swears!==1?'s':''} · $${remaining.toFixed(2)} / $${alloc.toFixed(2)}</div><div class="stat-worst">${wl}</div></div>`;
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
      const swears = r.kids[kid]?.swears ?? 0;
      const remaining = r.kids[kid]?.remaining ?? 0;
      const allocation = r.kids[kid]?.allocation ?? r.allocation ?? 0;
      const isW=(r.winners??[r.winner]).includes(kid);
      return `<div class="stat-card" style="--c:${COLOR_HEX[kid]??'#888'}"><div class="stat-name">${escHtml(kid)} ${isW?'🏆':''}</div><div class="stat-swears">${swears}</div><div class="stat-label">swear${swears!==1?'s':''} · $${remaining.toFixed ? remaining.toFixed(2) : remaining} / $${allocation.toFixed ? allocation.toFixed(2) : allocation}</div></div>`;
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

    // Past months with payment status
    (state.monthlyResults || []).forEach(result => {
      const monthLabel = formatMonthKey(result.month);
      Object.entries(result.kids || {}).forEach(([kid, data]) => {
        const payment = result.payments?.[kid];
        const payStatus = payment ? (payment.paid ? 'Paid' : `Owes $${payment.amount}`) : (result.winners?.includes(kid) ? 'Winner' : '');
        rows.push([monthLabel, '', kid, `$${data.remaining ?? data.amount ?? 0} remaining`, '', payStatus, `Monthly (${data.swears || 0} swears)`]);
      });
      if (result.winners) {
        rows.push([monthLabel, '', result.winners.join(' & '), `$${result.winnerPrize ?? result.pot ?? 0}`, '', '', 'Winner']);
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
          <div class="settings-avatar-wrap">
            <div class="settings-avatar-preview ${s.avatar ? 'has-photo' : ''}" id="avatar-preview-${i}" onclick="document.getElementById('avatar-input-${i}').click()">
              ${s.avatar ? `<img src="${s.avatar}" alt="avatar" />` : `<span>${SLOT_EMOJI[i]??'🧒'}</span>`}
            </div>
            <div class="settings-avatar-upload-hint">📷</div>
            <input type="file" id="avatar-input-${i}" accept="image/*" style="display:none" onchange="handleAvatarUpload(${i}, this)" />
            <button class="settings-avatar-remove" id="avatar-remove-${i}" onclick="removeAvatar(${i})" style="${s.avatar ? '' : 'display:none'}" title="Remove photo">×</button>
          </div>
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

    // Budget section — admin only
    // Theme picker — admin only
    const themeSection = document.getElementById('theme-section');
    if (themeSection) themeSection.style.display = (currentUser === 'admin') ? '' : 'none';
    if (currentUser === 'admin') renderThemePicker();

    const budgetSection = document.getElementById('budget-section');
    if (budgetSection) budgetSection.style.display = (currentUser === 'admin') ? '' : 'none';
    const familySection = document.getElementById('family-section');
    if (familySection) familySection.style.display = (currentUser === 'admin') ? '' : 'none';

    // Jar selector
    const jarSel = document.getElementById('jar-selector');
    if (jarSel) {
      jarSel.innerHTML = customJars.map(j => `
        <button class="jar-chip ${j.id===activeJarId?'active':''}" onclick="switchJar('${j.id}')">
          ${j.icon} ${escHtml(j.name)}
          ${j.id !== 'swear' ? `<span class="jar-chip-remove" onclick="event.stopPropagation();removeCustomJar('${j.id}')">×</span>` : ''}
        </button>`).join('');
    }
    const jarTemplates = document.getElementById('jar-templates');
    const jarTemplateList = document.getElementById('jar-template-list');
    if (jarTemplates && currentUser === 'admin') {
      jarTemplates.style.display = '';
      const existing = customJars.map(j => j.id);
      const available = JAR_TEMPLATES.filter(t => !existing.includes(t.id));
      jarTemplateList.innerHTML = available.length ? available.map(t =>
        `<button class="jar-chip" onclick="addCustomJar('${t.id}');renderSettings()">${t.icon} ${t.name}</button>`
      ).join('') : '<span style="font-size:12px;color:var(--muted)">All jars added</span>';
    }

    // Family theme picker (admin only)
    const themeSection = document.getElementById('family-theme-section');
    if (themeSection) themeSection.style.display = (currentUser === 'admin') ? '' : 'none';
    if (currentUser === 'admin') {
      const picker = document.getElementById('family-theme-picker');
      if (picker) {
        const current = loadFamilyTheme();
        picker.innerHTML = FAMILY_THEMES.map(t =>
          `<button class="jar-chip ${t.id===current?'active':''}" onclick="applyFamilyTheme('${t.id}');renderSettings()">
            ${t.name} ${t.premium?'👑':''}
          </button>`).join('');
      }
    }

    // Charity picker (admin only)
    const charitySection = document.getElementById('charity-section');
    if (charitySection) charitySection.style.display = (currentUser === 'admin') ? '' : 'none';
    if (currentUser === 'admin') {
      const charityPicker = document.getElementById('charity-picker');
      if (charityPicker) {
        const current = getCharitySetting();
        charityPicker.innerHTML = CHARITY_OPTIONS.map(c =>
          `<button class="jar-chip ${current?.id===c.id?'active':''}" onclick="setCharitySetting(${c.id==='custom'?'null':JSON.stringify(c).replace(/"/g,'&quot;')});renderSettings()" style="margin-bottom:4px">
            ${c.icon} ${c.name}
          </button>`).join('') +
          (current ? `<div style="font-size:12px;color:var(--muted);margin-top:4px">✅ ${current.name} selected — pot will be donated at month end</div>` : '');
      }
    }

    // Annual report (admin only)
    const annualSection = document.getElementById('annual-report-section');
    if (annualSection) annualSection.style.display = (currentUser === 'admin') ? '' : 'none';
    if (currentUser === 'admin') renderBudgetList();
  }

  function renderBudgetList() {
    const el = document.getElementById('budget-list');
    if (!el) return;
    const mk = currentMonthKey();
    const defaultBudget = getDefaultBudget();
    // Build current + 12 future month keys
    const monthKeys = [];
    const [y,m] = mk.split('-').map(Number);
    for (let i = 0; i < 13; i++) {
      const month = ((m-1+i) % 12) + 1;
      const year = y + Math.floor((m-1+i)/12);
      monthKeys.push(`${year}-${String(month).padStart(2,'0')}`);
    }

    // Default row at top
    const currentDefault = state.budgets?.['default'] ?? defaultBudget;
    const defPerPerson = KIDS.length > 0 ? (currentDefault / KIDS.length).toFixed(2) : currentDefault.toFixed(2);

    let html = `
      <div class="budget-row budget-default-row">
        <div class="budget-row-label">
          <span class="budget-month-name">Default</span>
          <span class="budget-default-badge">All months</span>
        </div>
        <div class="budget-row-input-wrap">
          <span class="budget-dollar">$</span>
          <input type="number" class="budget-input" id="budget-default-input" value="${currentDefault}" min="0" step="5"
            oninput="previewBudgetDefault(this.value)" />
        </div>
        <div class="budget-per-person" id="budget-default-pp">$${defPerPerson}/person</div>
        <div style="width:24px"></div>
      </div>
      <div class="budget-divider"></div>`;

    // All 13 months
    html += monthKeys.map(k => {
      const isCurrent = k === mk;
      const hasOverride = state.budgets && state.budgets[k] !== undefined;
      const val = hasOverride ? state.budgets[k] : currentDefault;
      const perPerson = KIDS.length > 0 ? (val / KIDS.length).toFixed(2) : val.toFixed(2);
      return `
        <div class="budget-row ${hasOverride ? 'budget-has-override' : ''}" data-month="${k}">
          <div class="budget-row-label">
            <span class="budget-month-name">${formatMonthKey(k)}</span>
            ${isCurrent ? '<span class="budget-current-badge">Current</span>' : ''}
            ${hasOverride ? '<span class="budget-override-badge">Custom</span>' : ''}
          </div>
          <div class="budget-row-input-wrap">
            <span class="budget-dollar">$</span>
            <input type="number" class="budget-input budget-month-input ${hasOverride ? '' : 'budget-input-default'}" value="${val}" min="0" step="5"
              data-month="${k}"
              oninput="previewBudgetMonth(this)"
              ${isCurrent && totalDeductedAll() > 0 ? 'disabled title="Cannot change — month in progress"' : ''}
              placeholder="${currentDefault}" />
          </div>
          <div class="budget-per-person" id="budget-pp-${k.replace('-','_')}">$${perPerson}/person</div>
          ${hasOverride && !(isCurrent && totalDeductedAll() > 0) ? `<button class="budget-remove-btn" onclick="removeBudget('${k}')" title="Reset to default">↩</button>` : '<div style="width:24px"></div>'}
        </div>`;
    }).join('');

    el.innerHTML = html;
  }

  // Live preview: update per-person text as the default input changes
  function previewBudgetDefault(value) {
    const val = parseFloat(value);
    if (isNaN(val) || val < 0) return;
    const pp = KIDS.length > 0 ? (val / KIDS.length).toFixed(2) : val.toFixed(2);
    const ppEl = document.getElementById('budget-default-pp');
    if (ppEl) ppEl.textContent = `$${pp}/person`;
  }

  // Live preview: update per-person text as a month input changes
  function previewBudgetMonth(inp) {
    const val = parseFloat(inp.value);
    if (isNaN(val) || val < 0) return;
    const pp = KIDS.length > 0 ? (val / KIDS.length).toFixed(2) : val.toFixed(2);
    const monthKey = inp.dataset.month;
    if (monthKey) {
      const ppEl = document.getElementById('budget-pp-' + monthKey.replace('-','_'));
      if (ppEl) ppEl.textContent = `$${pp}/person`;
    }
    // Mark as edited (visual feedback)
    inp.classList.remove('budget-input-default');
  }

  // Read all budget inputs and save to state — called by "Save Changes"
  function saveBudgetsFromForm() {
    if (!state.budgets) state.budgets = {};

    // Read the default input
    const defInput = document.getElementById('budget-default-input');
    if (defInput) {
      const defVal = parseFloat(defInput.value);
      if (!isNaN(defVal) && defVal >= 0) {
        state.budgets['default'] = defVal;
      }
    }
    const currentDefault = state.budgets['default'] ?? getDefaultBudget();

    // Read each month input
    document.querySelectorAll('.budget-month-input').forEach(inp => {
      const monthKey = inp.dataset.month;
      if (!monthKey || inp.disabled) return;
      const val = parseFloat(inp.value);
      if (isNaN(val) || val < 0) return;
      // Only store as override if it differs from the default
      if (val === currentDefault) {
        delete state.budgets[monthKey];
      } else {
        state.budgets[monthKey] = val;
      }
    });

    // Persist budgets to Firebase
    if (fbDb) { try { fbDb.ref('/swearjar/gameState/budgets').set(state.budgets); } catch(e) {} }
  }

  function removeBudget(monthKey) {
    if (state.budgets) delete state.budgets[monthKey];
    save();
    if (fbDb) { try { fbDb.ref('/swearjar/gameState/budgets').set(state.budgets); } catch(e) {} }
    renderBudgetList();
    render();
    toast(`${formatMonthKey(monthKey)} reset to default`);
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
    AVATARS  =Object.fromEntries(settings.map(s=>[s.name,s.avatar??'']));
    const ns={kids:{},history:state.history,monthlyResults:state.monthlyResults,currentMonth:state.currentMonth,budgets:state.budgets||{}};
    KIDS.forEach((name,i)=>{const on=oldKids[i];ns.kids[name]=(on&&state.kids[on])?state.kids[on]:(state.kids[name]??{deducted:0,swears:0,penalty:0});});
    state=ns;
    // Save budgets from admin form
    if (currentUser === 'admin') {
      saveBudgetsFromForm();
    }
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
  //  ONBOARDING TUTORIAL
  // ══════════════════════════════════════════════════════
  const ONBOARD_STEPS = [
    { emoji: '🤐', title: 'Welcome to Swear Jar!', text: 'A fun family challenge to keep language clean. Set a monthly budget, and every swear costs money from the pot.' },
    { emoji: '💰', title: 'How it works', text: 'Each month starts with a pot (e.g. $60). It\'s divided equally among all participants. Every time someone swears, money is deducted from their share.' },
    { emoji: '🏆', title: 'Winning', text: 'At month\'s end, the person with the most money left wins the entire remaining pot! Ties split it evenly.' },
    { emoji: '😬🤬🔥', title: '3 severity levels', text: 'Mild ($0.50), Moderate ($1.00), and Severe ($2.00). Choose the right level when logging a charge.' },
    { emoji: '🔐', title: 'Admin controls', text: 'Log in as Admin with your PIN to manage budgets, participants, and payment settings. Parents can resolve disputes.' },
  ];
  let _onboardStep = 0;
  function showOnboarding() {
    if (localStorage.getItem('swearjar2-onboarded') === '1') return;
    _onboardStep = 0;
    renderOnboardStep();
    document.getElementById('onboarding-overlay').classList.remove('hidden');
  }
  function renderOnboardStep() {
    const step = ONBOARD_STEPS[_onboardStep];
    document.getElementById('onboard-step').innerHTML = `
      <div class="onboarding-emoji">${step.emoji}</div>
      <div class="onboarding-title">${step.title}</div>
      <div class="onboarding-text">${step.text}</div>`;
    document.getElementById('onboard-dots').innerHTML = ONBOARD_STEPS.map((_,i) =>
      `<div class="onboarding-dot ${i===_onboardStep?'active':''}"></div>`).join('');
    document.getElementById('onboard-btn').textContent = _onboardStep < ONBOARD_STEPS.length - 1 ? 'Next →' : 'Get Started!';
  }
  function advanceOnboarding() {
    _onboardStep++;
    if (_onboardStep >= ONBOARD_STEPS.length) { skipOnboarding(); return; }
    renderOnboardStep();
  }
  function skipOnboarding() {
    localStorage.setItem('swearjar2-onboarded', '1');
    document.getElementById('onboarding-overlay').classList.add('hidden');
  }

  // ══════════════════════════════════════════════════════
  //  KID-SAFE MODE
  // ══════════════════════════════════════════════════════
  function isKidSafeUser() {
    if (!currentUser) return false;
    if (currentUser === 'admin') return false;
    if (isCurrentUserParent()) return false;
    return KIDS.includes(currentUser);
  }

  // ══════════════════════════════════════════════════════
  //  MONTH-END UNDO
  // ══════════════════════════════════════════════════════
  let _lastMonthEndBackup = null;
  let _undoMonthTimer = null;

  function backupStateForUndo() {
    _lastMonthEndBackup = JSON.parse(JSON.stringify(state));
    clearTimeout(_undoMonthTimer);
    _undoMonthTimer = setTimeout(() => { _lastMonthEndBackup = null; }, 30000);
  }

  function undoMonthEnd() {
    if (!_lastMonthEndBackup) { toast('⚠️ Undo window expired'); return; }
    state = _lastMonthEndBackup;
    _lastMonthEndBackup = null;
    clearTimeout(_undoMonthTimer);
    save(); render();
    toast('↩ Month-end reset undone!');
  }

  // ══════════════════════════════════════════════════════
  //  END-OF-MONTH REMINDER
  // ══════════════════════════════════════════════════════
  function checkEndOfMonthReminder() {
    if (!currentUser || !('Notification' in window) || Notification.permission !== 'granted') return;
    const { left } = getDaysLeftEST();
    const reminderKey = `swearjar2-eom-remind-${currentMonthKey()}`;
    if (left <= 3 && left > 0 && !localStorage.getItem(reminderKey)) {
      localStorage.setItem(reminderKey, '1');
      try {
        new Notification('🏆 Swear Jar', {
          body: `Only ${left} day${left!==1?'s':''} left this month! Who's going to win?`,
          icon: '/swear-jar/icon-192.png',
          tag: 'eom-reminder',
        });
      } catch(e) {}
    }
  }

  // ══════════════════════════════════════════════════════
  //  ACCESSIBILITY — KEYBOARD NAV
  // ══════════════════════════════════════════════════════
  function initKeyboardNav() {
    document.addEventListener('keydown', function(e) {
      const pinOverlay = document.getElementById('pin-overlay');
      if (pinOverlay && pinOverlay.classList.contains('open')) {
        if (e.key >= '0' && e.key <= '9') { pinKey(e.key); e.preventDefault(); }
        else if (e.key === 'Backspace') { pinBackspace(); e.preventDefault(); }
        else if (e.key === 'Escape') { closePinModal(); e.preventDefault(); }
      }
      const overlay = document.getElementById('overlay');
      if (overlay && overlay.classList.contains('open') && e.key === 'Escape') {
        closeModal(); e.preventDefault();
      }
      const announce = document.getElementById('announce-overlay');
      if (announce && !announce.classList.contains('hidden') && e.key === 'Escape') {
        dismissAnnouncement(); e.preventDefault();
      }
    });
  }

  // ══════════════════════════════════════════════════════
  //  CUSTOM JARS (Premium Feature)
  // ══════════════════════════════════════════════════════
  const DEFAULT_JARS = [
    { id: 'swear', name: 'Swear Jar', icon: '🤐', categories: [
      { id: 'mild', label: 'Mild', amount: 0.50, emoji: '😬', color: '#ffa726' },
      { id: 'moderate', label: 'Moderate', amount: 1.00, emoji: '🤬', color: '#e91e8c' },
      { id: 'severe', label: 'Severe', amount: 2.00, emoji: '🔥', color: '#ff4444' },
    ]},
  ];
  const JAR_TEMPLATES = [
    { id: 'chore', name: 'Chore Jar', icon: '🧹', categories: [
      { id: 'skip', label: 'Skipped', amount: 1.00, emoji: '😒', color: '#ff7043' },
      { id: 'late', label: 'Late', amount: 0.50, emoji: '⏰', color: '#ffa726' },
      { id: 'forgot', label: 'Forgot', amount: 0.75, emoji: '🤷', color: '#ab47bc' },
    ]},
    { id: 'homework', name: 'Homework Jar', icon: '📚', categories: [
      { id: 'missing', label: 'Missing', amount: 2.00, emoji: '📝', color: '#ff4444' },
      { id: 'late', label: 'Late', amount: 1.00, emoji: '⏰', color: '#ffa726' },
      { id: 'incomplete', label: 'Incomplete', amount: 0.50, emoji: '😬', color: '#e91e8c' },
    ]},
    { id: 'screentime', name: 'Screen Time Jar', icon: '📱', categories: [
      { id: 'over30', label: '30min Over', amount: 0.50, emoji: '📱', color: '#ffa726' },
      { id: 'over60', label: '1hr Over', amount: 1.00, emoji: '🎮', color: '#e91e8c' },
      { id: 'sneaky', label: 'Sneaky Use', amount: 2.00, emoji: '🫣', color: '#ff4444' },
    ]},
    { id: 'kindness', name: 'Kindness Jar', icon: '💝', categories: [
      { id: 'mean', label: 'Mean Words', amount: 1.00, emoji: '😠', color: '#ff4444' },
      { id: 'nohelp', label: 'Refused Help', amount: 0.50, emoji: '🙅', color: '#ffa726' },
      { id: 'fight', label: 'Fighting', amount: 1.50, emoji: '👊', color: '#e91e8c' },
    ]},
  ];

  function loadJars() {
    try { const s = localStorage.getItem('swearjar2-jars'); if (s) return JSON.parse(s); } catch(e) {}
    return DEFAULT_JARS.map(j => ({...j}));
  }
  function saveJars(jars) {
    localStorage.setItem('swearjar2-jars', JSON.stringify(jars));
    if (fbDb) { try { fbDb.ref('/swearjar/jars').set(jars); } catch(e) {} }
  }
  let customJars = loadJars();
  let activeJarId = localStorage.getItem('swearjar2-active-jar') || 'swear';

  function getActiveJar() {
    return customJars.find(j => j.id === activeJarId) || customJars[0] || DEFAULT_JARS[0];
  }
  function switchJar(jarId) {
    activeJarId = jarId;
    localStorage.setItem('swearjar2-active-jar', jarId);
    render();
    toast(`Switched to ${getActiveJar().name} ${getActiveJar().icon}`);
  }
  function addCustomJar(templateId) {
    const template = JAR_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;
    if (customJars.find(j => j.id === template.id)) { toast('Jar already exists'); return; }
    customJars.push({...template, categories: template.categories.map(c => ({...c}))});
    saveJars(customJars);
    toast(`${template.icon} ${template.name} added!`);
  }
  function removeCustomJar(jarId) {
    if (jarId === 'swear') { toast('Cannot remove the default jar'); return; }
    customJars = customJars.filter(j => j.id !== jarId);
    if (activeJarId === jarId) activeJarId = 'swear';
    saveJars(customJars);
    localStorage.setItem('swearjar2-active-jar', activeJarId);
    toast('Jar removed');
  }

  // ══════════════════════════════════════════════════════
  //  FAMILY THEMES (Premium Feature)
  // ══════════════════════════════════════════════════════
  const FAMILY_THEMES = [
    { id: 'default', name: 'Classic', premium: false, vars: {} },
    { id: 'candy', name: 'Candy Pop', premium: true, vars: { '--purple': '#ff6b9d', '--pink': '#c44dff', '--surface': '#1a1028', '--surface2': '#251838' } },
    { id: 'ocean', name: 'Deep Ocean', premium: true, vars: { '--purple': '#00bcd4', '--pink': '#0091ea', '--surface': '#0a1628', '--surface2': '#102038' } },
    { id: 'forest', name: 'Enchanted Forest', premium: true, vars: { '--purple': '#66bb6a', '--pink': '#2e7d32', '--surface': '#0a1a12', '--surface2': '#122a1a' } },
    { id: 'sunset', name: 'Sunset Vibes', premium: true, vars: { '--purple': '#ff8a65', '--pink': '#ff5722', '--surface': '#1a1210', '--surface2': '#2a1a14' } },
    { id: 'neon', name: 'Neon Nights', premium: true, vars: { '--purple': '#e040fb', '--pink': '#00e5ff', '--surface': '#0d0d1a', '--surface2': '#1a1a2e' } },
  ];
  const CELEBRATION_ANIMATIONS = [
    { id: 'confetti', name: 'Confetti', premium: false },
    { id: 'fireworks', name: 'Fireworks', premium: true },
    { id: 'balloons', name: 'Balloons', premium: true },
    { id: 'stars', name: 'Star Burst', premium: true },
  ];

  function applyFamilyTheme(themeId) {
    const theme = FAMILY_THEMES.find(t => t.id === themeId);
    if (!theme) return;
    const root = document.documentElement;
    // Reset to defaults first
    FAMILY_THEMES.forEach(t => Object.keys(t.vars).forEach(k => root.style.removeProperty(k)));
    // Apply new theme vars
    Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    localStorage.setItem('swearjar2-family-theme', themeId);
  }
  function loadFamilyTheme() { return localStorage.getItem('swearjar2-family-theme') || 'default'; }

  function playCelebration(animId) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden';
    document.body.appendChild(overlay);
    const particles = animId === 'fireworks' ? '🎆✨💫⭐🌟' : animId === 'balloons' ? '🎈🎈🎈🎈🎈' : animId === 'stars' ? '⭐🌟✨💫⭐' : '🎊🎉✨🎊🎉';
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      const char = particles[Math.floor(Math.random() * particles.length)];
      p.textContent = char;
      p.style.cssText = `position:absolute;font-size:${20+Math.random()*20}px;left:${Math.random()*100}%;top:100%;animation:celebFloat ${1.5+Math.random()*2}s ease-out forwards;animation-delay:${Math.random()*0.5}s`;
      overlay.appendChild(p);
    }
    setTimeout(() => overlay.remove(), 4000);
  }

  // ══════════════════════════════════════════════════════
  //  ANNUAL FAMILY REPORT
  // ══════════════════════════════════════════════════════
  function generateAnnualReport(year) {
    year = year || new Date().getFullYear();
    const yearResults = (state.monthlyResults || []).filter(r => r.month && r.month.startsWith(String(year)));
    if (!yearResults.length) { toast('No data for ' + year); return null; }

    const allKids = new Set();
    const stats = {};
    let totalSwears = 0, totalBudget = 0;
    const winCounts = {};

    yearResults.forEach(r => {
      Object.entries(r.kids || {}).forEach(([kid, data]) => {
        allKids.add(kid);
        if (!stats[kid]) stats[kid] = { swears: 0, deducted: 0, wins: 0, months: 0 };
        stats[kid].swears += (data.swears || 0);
        stats[kid].deducted += (data.deducted || 0);
        stats[kid].months++;
        totalSwears += (data.swears || 0);
      });
      totalBudget += (r.budget || 0);
      (r.winners || []).forEach(w => {
        if (!winCounts[w]) winCounts[w] = 0;
        winCounts[w]++;
        if (stats[w]) stats[w].wins++;
      });
    });

    const sortedBySwears = [...allKids].sort((a,b) => (stats[b]?.swears||0) - (stats[a]?.swears||0));
    const sortedByWins = [...allKids].sort((a,b) => (stats[b]?.wins||0) - (stats[a]?.wins||0));
    const mostImproved = [...allKids].sort((a,b) => {
      const aFirst = yearResults[yearResults.length-1]?.kids?.[a]?.swears || 0;
      const aLast = yearResults[0]?.kids?.[a]?.swears || 0;
      const bFirst = yearResults[yearResults.length-1]?.kids?.[b]?.swears || 0;
      const bLast = yearResults[0]?.kids?.[b]?.swears || 0;
      return (aLast - aFirst) - (bLast - bFirst);
    });

    return {
      year, months: yearResults.length, totalSwears, totalBudget,
      kids: [...allKids], stats, winCounts,
      biggestOffender: sortedBySwears[0],
      mostWins: sortedByWins[0],
      mostImproved: mostImproved[0],
      cleanest: sortedBySwears[sortedBySwears.length - 1],
    };
  }

  function showAnnualReport() {
    const year = new Date().getFullYear();
    const report = generateAnnualReport(year);
    if (!report) return;

    const overlay = document.createElement('div');
    const isDark = !document.body.classList.contains('light-mode');
    overlay.style.cssText = `position:fixed;inset:0;z-index:960;background:${isDark?'rgba(0,0,0,.9)':'rgba(0,0,0,.5)'};display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto`;
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    document.addEventListener('keydown', function _esc(e) { if (e.key==='Escape') { overlay.remove(); document.removeEventListener('keydown',_esc); } });

    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:28px;padding:28px 22px;max-width:440px;width:100%;text-align:center;border:1px solid var(--border)">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:var(--purple);margin-bottom:12px">📊 ${report.year} Year in Review</div>
        <div style="font-size:36px;margin-bottom:4px">📅</div>
        <div style="font-size:22px;font-weight:900;margin-bottom:16px">${report.year} Family Report</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center;margin-bottom:18px">
          <div style="background:var(--surface2);border-radius:14px;padding:14px"><div style="font-size:24px;font-weight:900">${report.months}</div><div style="font-size:11px;color:var(--muted)">Months</div></div>
          <div style="background:var(--surface2);border-radius:14px;padding:14px"><div style="font-size:24px;font-weight:900">${report.totalSwears}</div><div style="font-size:11px;color:var(--muted)">Total Swears</div></div>
          <div style="background:var(--surface2);border-radius:14px;padding:14px"><div style="font-size:24px;font-weight:900">$${report.totalBudget}</div><div style="font-size:11px;color:var(--muted)">Total Budget</div></div>
          <div style="background:var(--surface2);border-radius:14px;padding:14px"><div style="font-size:24px;font-weight:900">${report.kids.length}</div><div style="font-size:11px;color:var(--muted)">Participants</div></div>
        </div>

        <div style="text-align:left;margin-bottom:16px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px">🏆 Awards</div>
          ${report.mostWins ? `<div style="background:rgba(124,77,255,.1);border:1px solid rgba(124,77,255,.2);border-radius:12px;padding:10px 14px;margin-bottom:6px;display:flex;justify-content:space-between"><span>👑 Most Wins</span><strong style="color:${COLOR_HEX[report.mostWins]||'var(--text)'}">${escHtml(report.mostWins)} (${report.winCounts[report.mostWins]})</strong></div>` : ''}
          ${report.biggestOffender ? `<div style="background:rgba(255,68,68,.08);border:1px solid rgba(255,68,68,.2);border-radius:12px;padding:10px 14px;margin-bottom:6px;display:flex;justify-content:space-between"><span>🤬 Biggest Offender</span><strong style="color:${COLOR_HEX[report.biggestOffender]||'var(--text)'}">${escHtml(report.biggestOffender)} (${report.stats[report.biggestOffender]?.swears})</strong></div>` : ''}
          ${report.cleanest ? `<div style="background:rgba(0,200,100,.08);border:1px solid rgba(0,200,100,.2);border-radius:12px;padding:10px 14px;margin-bottom:6px;display:flex;justify-content:space-between"><span>😇 Cleanest Mouth</span><strong style="color:${COLOR_HEX[report.cleanest]||'var(--text)'}">${escHtml(report.cleanest)} (${report.stats[report.cleanest]?.swears})</strong></div>` : ''}
          ${report.mostImproved ? `<div style="background:rgba(255,167,38,.08);border:1px solid rgba(255,167,38,.2);border-radius:12px;padding:10px 14px;margin-bottom:6px;display:flex;justify-content:space-between"><span>📈 Most Improved</span><strong style="color:${COLOR_HEX[report.mostImproved]||'var(--text)'}">${escHtml(report.mostImproved)}</strong></div>` : ''}
        </div>

        <div style="text-align:left;margin-bottom:16px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px">Per Person</div>
          ${report.kids.map(kid => {
            const s = report.stats[kid];
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="font-weight:700;color:${COLOR_HEX[kid]||'var(--text)'}">${escHtml(kid)}</span>
              <span style="font-size:13px;color:var(--muted)">${s.swears} swears · ${s.wins} wins</span>
            </div>`;
          }).join('')}
        </div>

        <button style="width:100%;padding:14px;border:none;border-radius:14px;background:linear-gradient(135deg,var(--purple),var(--pink));color:#fff;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:8px" onclick="exportAnnualReportPDF(${report.year})">📄 Export as PDF</button>
        <button style="width:100%;padding:12px;border:none;border-radius:14px;background:var(--surface2);color:var(--muted);font-size:14px;cursor:pointer" onclick="this.closest('[style*=fixed]').remove()">Close</button>
      </div>`;

    document.body.appendChild(overlay);
  }

  function exportAnnualReportPDF(year) {
    const report = generateAnnualReport(year);
    if (!report) return;
    // Generate a printable HTML page and trigger print dialog (saves as PDF)
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Swear Jar ${year} Report</title>
      <style>body{font-family:-apple-system,sans-serif;max-width:600px;margin:40px auto;padding:20px;color:#333}
      h1{text-align:center;font-size:28px}h2{font-size:18px;border-bottom:2px solid #7c4dff;padding-bottom:4px;margin-top:24px}
      .stat{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
      .box{background:#f5f5f5;border-radius:12px;padding:16px;text-align:center}
      .box .num{font-size:28px;font-weight:900}.box .label{font-size:12px;color:#888}
      @media print{body{margin:0}}</style></head><body>
      <h1>🤐 Swear Jar — ${year} Year in Review</h1>
      <div class="grid">
        <div class="box"><div class="num">${report.months}</div><div class="label">Months</div></div>
        <div class="box"><div class="num">${report.totalSwears}</div><div class="label">Total Swears</div></div>
        <div class="box"><div class="num">$${report.totalBudget}</div><div class="label">Total Budget</div></div>
        <div class="box"><div class="num">${report.kids.length}</div><div class="label">Participants</div></div>
      </div>
      <h2>🏆 Awards</h2>
      ${report.mostWins ? `<div class="stat"><span>👑 Most Wins</span><strong>${report.mostWins} (${report.winCounts[report.mostWins]})</strong></div>` : ''}
      ${report.biggestOffender ? `<div class="stat"><span>🤬 Biggest Offender</span><strong>${report.biggestOffender} (${report.stats[report.biggestOffender]?.swears})</strong></div>` : ''}
      ${report.cleanest ? `<div class="stat"><span>😇 Cleanest Mouth</span><strong>${report.cleanest} (${report.stats[report.cleanest]?.swears})</strong></div>` : ''}
      ${report.mostImproved ? `<div class="stat"><span>📈 Most Improved</span><strong>${report.mostImproved}</strong></div>` : ''}
      <h2>Per Person</h2>
      ${report.kids.map(kid => `<div class="stat"><span>${kid}</span><span>${report.stats[kid].swears} swears · ${report.stats[kid].wins} wins</span></div>`).join('')}
      <div style="text-align:center;margin-top:32px;color:#888;font-size:12px">Generated by Swear Jar App · ${new Date().toLocaleDateString()}</div>
      </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }

  // ══════════════════════════════════════════════════════
  //  CHARITY INTEGRATION
  // ══════════════════════════════════════════════════════
  const CHARITY_OPTIONS = [
    { id: 'custom', name: 'Custom Charity', icon: '💝', url: '' },
    { id: 'stjude', name: "St. Jude Children's", icon: '🏥', url: 'https://www.stjude.org/donate' },
    { id: 'unicef', name: 'UNICEF', icon: '🌍', url: 'https://www.unicef.org/donate' },
    { id: 'aspca', name: 'ASPCA', icon: '🐾', url: 'https://www.aspca.org/donate' },
    { id: 'feedamerica', name: 'Feeding America', icon: '🍽️', url: 'https://www.feedingamerica.org/donate' },
  ];

  function getCharitySetting() {
    try { return JSON.parse(localStorage.getItem('swearjar2-charity') || 'null'); } catch(e) { return null; }
  }
  function setCharitySetting(charity) {
    localStorage.setItem('swearjar2-charity', JSON.stringify(charity));
    if (fbDb) { try { fbDb.ref('/swearjar/charity').set(charity); } catch(e) {} }
  }
  function donateToCharity(amount, monthKey) {
    const charity = getCharitySetting();
    if (!charity) { toast('No charity configured — set one in Settings'); return; }
    const url = charity.url || '';
    if (url) {
      window.open(url, '_blank');
      toast(`🎁 Donating $${amount.toFixed(2)} to ${charity.name}! Opening donation page...`);
    } else {
      toast(`🎁 $${amount.toFixed(2)} designated for ${charity.name}`);
    }
    // Mark in monthly result
    const result = state.monthlyResults.find(r => r.month === monthKey);
    if (result) {
      result.charityDonation = { charity: charity.name, amount, ts: new Date().toISOString() };
      save();
    }
  }

  // ══════════════════════════════════════════════════════
  //  PHOTO EVIDENCE
  // ══════════════════════════════════════════════════════
  function capturePhotoEvidence(kid, categoryId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = function() {
      const file = input.files[0];
      if (!file) { addSwear(kid, categoryId); return; }
      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement('canvas');
          const size = 120;
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          const srcSize = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width-srcSize)/2, (img.height-srcSize)/2, srcSize, srcSize, 0, 0, size, size);
          const photoData = canvas.toDataURL('image/jpeg', 0.4);
          addSwearWithPhoto(kid, categoryId, photoData);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function addSwearWithPhoto(kid, categoryId, photoData) {
    const category = (getActiveJar().categories || CHARGE_CATEGORIES).find(c => c.id === categoryId) || CHARGE_CATEGORIES[1];
    const chargeAmount = category.amount;
    if (!state.kids[kid]) state.kids[kid] = { deducted:0, swears:0, penalty:0 };
    if (typeof state.kids[kid].deducted !== 'number' || isNaN(state.kids[kid].deducted)) state.kids[kid].deducted = 0;
    if (typeof state.kids[kid].penalty !== 'number' || isNaN(state.kids[kid].penalty)) state.kids[kid].penalty = 0;
    const remaining = getKidRemaining(kid);
    if (remaining <= 0) { toast(`⛔ ${kid} has $0 left — no more charges this month`); return; }
    if (chargeAmount > remaining) { toast(`⛔ ${kid} only has $${remaining.toFixed(2)} left`); return; }
    haptic('medium');
    state.kids[kid].deducted += chargeAmount;
    state.kids[kid].swears++;
    const entry = {
      kid, ts: new Date().toISOString(), addedBy: currentUser ?? 'Unknown',
      amount: chargeAmount, category: category.id, jar: activeJarId
    };
    if (photoData && photoData.length < 20000) entry.photo = photoData;
    state.history.unshift(entry);
    if (state.history.length > 500) state.history.length = 500;
    fbTransaction(`/swearjar/gameState/kids/${kid}/deducted`, current => (parseFloat(current) || 0) + chargeAmount);
    save(); render();
    const newRemaining = getKidRemaining(kid);
    toast(`${kid} -$${chargeAmount.toFixed(2)} ${category.emoji} 📸 · $${newRemaining.toFixed(2)} left`);
  }
  // ══════════════════════════════════════════════════════
  function deleteAllUserData() {
    if (!confirm('⚠️ This will permanently delete ALL your data including history, settings, and monthly results. This cannot be undone. Continue?')) return;
    if (!confirm('Are you absolutely sure? All data will be erased from this device and Firebase.')) return;
    // Clear Firebase
    if (fbDb) {
      try {
        fbDb.ref('/swearjar/gameState').remove();
        fbDb.ref('/swearjar/jarSettings').remove();
        fbDb.ref('/swearjar/appUsers').remove();
        fbDb.ref('/swearjar/adminPin').remove();
        fbDb.ref('/swearjar/adminSession').remove();
        fbDb.ref('/swearjar/potTheme').remove();
        fbDb.ref('/swearjar/notifUsers').remove();
      } catch(e) {}
    }
    // Clear all localStorage
    localStorage.clear();
    sessionStorage.clear();
    // Clear service worker cache
    if ('caches' in window) { caches.keys().then(keys => keys.forEach(k => caches.delete(k))); }
    toast('All data deleted. Reloading...');
    setTimeout(() => window.location.reload(), 1000);
  }

  // ══════════════════════════════════════════════════════
  //  FIRST-RUN SETUP FLOW (Item 4)
  // ══════════════════════════════════════════════════════
  function checkFirstRunSetup() {
    if (KIDS.length === 0 && appUsers.length === 0) {
      // No participants exist — this is a fresh install
      // Auto-create the current user as first participant + parent
      if (currentUser && currentUser !== 'admin') {
        settings.push({ name: currentUser, color: PALETTE[0], paymentInfo: '' });
        saveSettings(settings);
        KIDS = [currentUser];
        COLORS = { [currentUser]: PALETTE[0] };
        COLOR_HEX = { ...COLORS };
        appUsers.push({ name: currentUser, isParent: true });
        saveAppUsers(appUsers);
        state.kids[currentUser] = { deducted: 0, swears: 0, penalty: 0 };
        save();
        toast(`Welcome ${currentUser}! You've been added as a parent.`);
      }
    }
  }

  // ══════════════════════════════════════════════════════
  //  MULTI-FAMILY DATA ISOLATION (Item 6)
  // ══════════════════════════════════════════════════════
  const FAMILY_ID_KEY = 'swearjar2-family-id';
  function getFamilyId() {
    let id = localStorage.getItem(FAMILY_ID_KEY);
    if (!id) {
      id = 'fam_' + Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2,'0')).join('');
      localStorage.setItem(FAMILY_ID_KEY, id);
    }
    return id;
  }
  function getFamilyDbPath() {
    return '/swearjar/' + getFamilyId();
  }
  function joinFamily(familyId) {
    if (!familyId || !familyId.startsWith('fam_')) { toast('⚠️ Invalid family code'); return; }
    localStorage.setItem(FAMILY_ID_KEY, familyId);
    toast('Joined family! Reloading...');
    setTimeout(() => window.location.reload(), 500);
  }

  // ══════════════════════════════════════════════════════
  //  BIOMETRIC LOCK (Item 7 — web API, enhanced in native)
  // ══════════════════════════════════════════════════════
  async function requestBiometric() {
    if (!window.PublicKeyCredential) return false;
    try {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return available;
    } catch(e) { return false; }
  }

  // ══════════════════════════════════════════════════════
  //  ACCOUNT RECOVERY (Item 8)
  // ══════════════════════════════════════════════════════
  function generateRecoveryCode() {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => (b % 36).toString(36).toUpperCase()).join('');
    const formatted = code.slice(0,3) + '-' + code.slice(3);
    localStorage.setItem('swearjar2-recovery', formatted);
    if (fbDb) { try { fbDb.ref(getFamilyDbPath() + '/recovery').set({ code: formatted, ts: new Date().toISOString() }); } catch(e) {} }
    return formatted;
  }
  function showRecoveryCode() {
    let code = localStorage.getItem('swearjar2-recovery');
    if (!code) code = generateRecoveryCode();
    toast(`📋 Recovery code: ${code} — save this somewhere safe!`);
    if (navigator.clipboard) navigator.clipboard.writeText(code).catch(()=>{});
  }
  function recoverWithCode(inputCode) {
    if (!fbDb) { toast('⚠️ Firebase required for recovery'); return; }
    fbDb.ref(getFamilyDbPath() + '/recovery/code').once('value').then(snap => {
      if (snap.val() === inputCode.trim().toUpperCase()) {
        toast('✅ Recovery successful! Logging in as admin...');
        const token = generateSessionToken();
        sessionStorage.setItem('swearjar2-admin-token', token);
        loginAs('admin');
      } else {
        toast('❌ Invalid recovery code');
      }
    }).catch(() => toast('⚠️ Recovery failed — check connection'));
  }

  // ══════════════════════════════════════════════════════
  //  OFFLINE QUEUE & CONFLICT RESOLUTION (Item 9)
  // ══════════════════════════════════════════════════════
  let _offlineQueue = [];
  function queueOfflineAction(action) {
    _offlineQueue.push({ ...action, ts: new Date().toISOString() });
    localStorage.setItem('swearjar2-offline-queue', JSON.stringify(_offlineQueue));
  }
  function flushOfflineQueue() {
    const queued = JSON.parse(localStorage.getItem('swearjar2-offline-queue') || '[]');
    if (queued.length === 0) return;
    queued.forEach(action => {
      if (action.type === 'charge' && action.kid) {
        if (!state.kids[action.kid]) state.kids[action.kid] = { deducted:0, swears:0, penalty:0 };
        state.kids[action.kid].deducted += (action.amount || 1);
        state.kids[action.kid].swears++;
        state.history.unshift(action);
      }
    });
    localStorage.removeItem('swearjar2-offline-queue');
    _offlineQueue = [];
    save();
    toast(`📡 Synced ${queued.length} offline action${queued.length!==1?'s':''}`);
  }

  // ══════════════════════════════════════════════════════
  //  LOADING STATES (Item 10)
  // ══════════════════════════════════════════════════════
  function showActionLoading(msg) {
    let el = document.getElementById('action-loading');
    if (!el) {
      el = document.createElement('div');
      el.id = 'action-loading';
      el.className = 'action-loading';
      document.body.appendChild(el);
    }
    el.textContent = msg || 'Saving...';
    el.style.display = 'flex';
    return () => { el.style.display = 'none'; };
  }

  // ══════════════════════════════════════════════════════
  //  HAPTIC FEEDBACK (Item 11)
  // ══════════════════════════════════════════════════════
  function haptic(style) {
    // iOS native haptic via WKWebView bridge
    if (window.webkit?.messageHandlers?.haptic) {
      window.webkit.messageHandlers.haptic.postMessage(style || 'light');
      return;
    }
    // Web fallback
    if (window.navigator?.vibrate) {
      const patterns = { light: 10, medium: 20, heavy: 30, success: [10,50,20], error: [30,50,30] };
      window.navigator.vibrate(patterns[style] || 10);
    }
  }

  // ══════════════════════════════════════════════════════
  //  PAGE TRANSITIONS (Item 12)
  // ══════════════════════════════════════════════════════
  const _origSwitchView = switchView;
  switchView = function(v) {
    const current = document.querySelector('.view.active');
    if (current) {
      current.style.opacity = '0';
      current.style.transform = 'translateY(8px)';
    }
    setTimeout(() => {
      _origSwitchView(v);
      const next = document.querySelector('.view.active');
      if (next) {
        next.style.opacity = '0';
        next.style.transform = 'translateY(8px)';
        requestAnimationFrame(() => {
          next.style.transition = 'opacity .2s ease, transform .2s ease';
          next.style.opacity = '1';
          next.style.transform = 'translateY(0)';
          setTimeout(() => { next.style.transition = ''; }, 250);
        });
      }
    }, 100);
  };

  // ══════════════════════════════════════════════════════
  //  FAMILY INVITE SYSTEM (Item 14)
  // ══════════════════════════════════════════════════════
  function generateInviteLink() {
    const familyId = getFamilyId();
    const inviteData = btoa(JSON.stringify({ fam: familyId }));
    const link = `${window.location.origin}${window.location.pathname}?join=${inviteData}`;
    if (navigator.clipboard) navigator.clipboard.writeText(link).catch(()=>{});
    toast('📋 Invite link copied! Share it with family members.');
    return link;
  }
  function generateInviteQR() {
    const link = generateInviteLink();
    if (typeof QRCode !== 'undefined') {
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:20px';
      container.onclick = () => container.remove();
      const card = document.createElement('div');
      card.style.cssText = 'background:#fff;border-radius:20px;padding:24px;text-align:center;max-width:300px';
      card.innerHTML = '<div style="font-size:18px;font-weight:800;margin-bottom:4px;color:#000">Join Our Family</div><div style="font-size:13px;color:#666;margin-bottom:16px">Scan to join the swear jar</div><div id="invite-qr"></div><div style="font-size:11px;color:#999;margin-top:12px">Tap anywhere to close</div>';
      card.onclick = e => e.stopPropagation();
      container.appendChild(card);
      document.body.appendChild(container);
      new QRCode(document.getElementById('invite-qr'), { text: link, width: 200, height: 200, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.H });
    }
  }
  function checkInviteLink() {
    const params = new URLSearchParams(window.location.search);
    const joinData = params.get('join');
    if (joinData) {
      try {
        const data = JSON.parse(atob(joinData));
        if (data.fam) {
          joinFamily(data.fam);
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch(e) {}
    }
  }

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
  applyFamilyTheme(loadFamilyTheme());

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

  // Check for invite link in URL
  checkInviteLink();

  // Show onboarding for first-time users
  showOnboarding();

  // First-run setup: auto-add current user as participant if empty
  if (currentUser) checkFirstRunSetup();

  // Keyboard navigation (PIN entry, modal escape)
  initKeyboardNav();

  // Check for month rollover every 60s (catches devices left open overnight)
  setInterval(checkMonthRollover, 60000);

  // End-of-month reminder notification
  if (currentUser) checkEndOfMonthReminder();

  // Flush any queued offline actions when connection is restored
  if (fbConnected) flushOfflineQueue();
  window.addEventListener('online', () => { if (fbDb) flushOfflineQueue(); });

  // "Update Available" banner — listen for new service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const banner = document.createElement('div');
      banner.className = 'update-banner';
      banner.textContent = '🔄 Update available — tap to refresh';
      banner.style.display = 'block';
      banner.onclick = () => window.location.reload();
      document.body.appendChild(banner);
    });
  }

  // ══════════════════════════════════════════════════════
  //  PULL-TO-REFRESH (iOS-style)
  // ══════════════════════════════════════════════════════
  (function initPullToRefresh() {
    const THRESHOLD = 80;
    let startY = 0, pulling = false, pullDist = 0;

    // Create the pull indicator element
    const indicator = document.createElement('div');
    indicator.className = 'ptr-indicator';
    indicator.innerHTML = '<div class="ptr-spinner">↓</div>';
    document.body.prepend(indicator);

    document.addEventListener('touchstart', function(e) {
      if (window.scrollY > 0) return;
      startY = e.touches[0].clientY;
      pulling = true;
      pullDist = 0;
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
      if (!pulling) return;
      const y = e.touches[0].clientY;
      pullDist = Math.max(0, y - startY);
      if (pullDist > 0 && window.scrollY <= 0) {
        const dist = Math.min(pullDist, THRESHOLD * 1.5);
        const pct = Math.min(1, pullDist / THRESHOLD);
        indicator.style.transform = `translateY(${dist * 0.5}px)`;
        indicator.style.opacity = pct;
        indicator.querySelector('.ptr-spinner').style.transform = `rotate(${pct * 180}deg)`;
        if (pullDist >= THRESHOLD) {
          indicator.classList.add('ptr-ready');
          indicator.querySelector('.ptr-spinner').textContent = '↻';
        } else {
          indicator.classList.remove('ptr-ready');
          indicator.querySelector('.ptr-spinner').textContent = '↓';
        }
      }
    }, { passive: true });

    document.addEventListener('touchend', function() {
      if (!pulling) return;
      if (pullDist >= THRESHOLD) {
        indicator.classList.add('ptr-refreshing');
        indicator.querySelector('.ptr-spinner').textContent = '↻';
        indicator.style.transform = 'translateY(40px)';
        setTimeout(() => window.location.reload(), 300);
      } else {
        indicator.style.transform = 'translateY(-50px)';
        indicator.style.opacity = '0';
      }
      pulling = false;
      pullDist = 0;
    }, { passive: true });
  })();
