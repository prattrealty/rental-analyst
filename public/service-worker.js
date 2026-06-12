const CACHE_NAME = 'rental-analyst-v3';

// Install — activate immediately; don't pre-cache anything,
// the fetch handler populates the cache as the app is used.
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate — delete old caches, take control of open tabs
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // Only GETs
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Don't touch cross-origin requests (Supabase, fonts, CDNs, etc.)
  if (url.origin !== self.location.origin) return;

  // Never intercept or cache API responses
  if (url.pathname.startsWith('/api/')) return;

  // 1) Navigations (the HTML shell): ALWAYS network-first.
  //    Fresh index.html = fresh bundle references = no stale app.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html')) // offline fallback only
    );
    return;
  }

  // 2) Vite's hashed build assets: immutable, so cache-first is safe & fast.
  //    A new deploy produces new hashes, which are simply new cache entries.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached =>
        cached ||
        fetch(request).then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
      )
    );
    return;
  }

  // 3) Everything else (icons, manifest): network-first, cache fallback.
  //    NOTE: fallback is the matching cached file — never the homepage.
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});