const CACHE = 'swearjar-v4';
const ASSETS = ['./index.html', './manifest.json', './css/styles.css', './js/app.js', './js/core.js'];

// Files that must always be fetched fresh (network-first)
const NETWORK_FIRST = ['/js/', '/css/', '/index.html'];

// ── Install: pre-cache core assets and activate immediately ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
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
  if (e.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE);
  }
  if (e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch strategy ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Navigation requests: always network-first
  if (e.request.mode === 'navigate') {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // JS and CSS files: network-first (prevents cache poisoning)
  if (NETWORK_FIRST.some(p => url.pathname.includes(p))) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Static assets (icons, manifest, images): cache-first for speed
  e.respondWith(cacheFirst(e.request));
});

function networkFirst(request) {
  return fetch(request)
    .then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(request, clone));
      return res;
    })
    .catch(() => caches.match(request));
}

function cacheFirst(request) {
  return caches.match(request)
    .then(cached => cached || fetch(request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(request, clone));
      return res;
    }));
}
