const CACHE = 'swearjar-v2';
const ASSETS = ['./index.html', './manifest.json'];

// ── Install: pre-cache core assets and activate immediately ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())   // don't wait for old SW to die
  );
});

// ── Activate: delete old version caches, claim all clients ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Messages from the page ──
self.addEventListener('message', e => {
  if (!e.data) return;
  // Page requests a cache wipe (sent during login flow)
  if (e.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE);
  }
  // Page requests immediate SW takeover
  if (e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch strategy ──
self.addEventListener('fetch', e => {
  // Navigation requests (the HTML page itself): network-first.
  // Always try the network so users get fresh code; fall back to cache if offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Stash the fresh copy so offline still works
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))  // offline fallback
    );
    return;
  }

  // All other assets (icons, manifest): cache-first, network fallback.
  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
  );
});
