const CACHE_NAME = 'rental-analyst-v2';
const urlsToCache = ['/', '/index.html'];

// Install — cache basic shell
self.addEventListener('install', event => {
  self.skipWaiting(); // activate immediately, don't wait
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Activate — delete old caches immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()) // take control of all tabs immediately
  );
});

// Fetch — network first, fall back to cache
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // For JS/CSS assets — network first, update cache in background
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If we got a valid response, update the cache
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => {
        // Network failed — serve from cache (offline fallback)
        return caches.match(event.request).then(cached => cached || caches.match('/'));
      })
  );
});
