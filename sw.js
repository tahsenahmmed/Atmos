/* ═══════════════════════════════════════════════
   ATMOS Weather — Service Worker
   Strategy:
   - App shell (HTML, fonts) → Cache First
   - Weather API            → Network First (fresh data), fallback to cache
   - Icons / static assets  → Cache First, long-lived
═══════════════════════════════════════════════ */

const VERSION      = 'atmos-v2';
const SHELL_CACHE  = `${VERSION}-shell`;
const DATA_CACHE   = `${VERSION}-data`;
const FONT_CACHE   = `${VERSION}-fonts`;

const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

const API_ORIGINS = [
  'https://api.open-meteo.com',
  'https://nominatim.openstreetmap.org',
];

/* ──────────────────────────────────────────────
   INSTALL — pre-cache shell
────────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

/* ──────────────────────────────────────────────
   ACTIVATE — clean up old caches
────────────────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('atmos-') && ![SHELL_CACHE, DATA_CACHE, FONT_CACHE].includes(k))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ──────────────────────────────────────────────
   FETCH — routing strategy
────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and browser extensions
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Google Fonts — Cache First (long-lived)
  if (FONT_ORIGINS.some(o => request.url.startsWith(o))) {
    event.respondWith(cacheFirst(request, FONT_CACHE, 60 * 60 * 24 * 365));
    return;
  }

  // Weather / Geocoding APIs — Network First, fall back to stale cache
  if (API_ORIGINS.some(o => request.url.startsWith(o))) {
    event.respondWith(networkFirst(request, DATA_CACHE, 60 * 10)); // 10 min TTL
    return;
  }

  // App shell — Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
});

/* ──────────────────────────────────────────────
   STRATEGIES
────────────────────────────────────────────── */

/** Cache First: serve from cache, fall back to network, store response */
async function cacheFirst(request, cacheName, maxAgeSeconds = null) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    // Check max-age if specified
    if (maxAgeSeconds) {
      const fetchedAt = cached.headers.get('sw-fetched-at');
      if (fetchedAt) {
        const age = (Date.now() - parseInt(fetchedAt)) / 1000;
        if (age > maxAgeSeconds) {
          return fetchAndCache(request, cache);
        }
      }
    }
    return cached;
  }

  return fetchAndCache(request, cache);
}

/** Network First: try network, store in cache, fall back to cache on failure */
async function networkFirst(request, cacheName, maxAgeSeconds = null) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetchAndCache(request, cache);
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      // Inject offline header so the app can show a stale badge
      const headers = new Headers(cached.headers);
      headers.set('sw-offline', 'true');
      const body = await cached.clone().arrayBuffer();
      return new Response(body, { status: cached.status, statusText: cached.statusText, headers });
    }
    // Hard offline — return a JSON error the app can handle
    return new Response(JSON.stringify({ error: 'offline', message: 'No cached data available.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'sw-offline': 'true' },
    });
  }
}

/** Fetch, stamp with time, and store in cache */
async function fetchAndCache(request, cache) {
  const response = await fetch(request);
  if (response.ok || response.status === 0) {
    const stamped = stampResponse(response.clone());
    cache.put(request, stamped);
  }
  return response;
}

/** Clone response and add a fetch timestamp header */
function stampResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('sw-fetched-at', Date.now().toString());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/* ──────────────────────────────────────────────
   BACKGROUND SYNC — retry failed weather fetches
────────────────────────────────────────────── */
self.addEventListener('sync', event => {
  if (event.tag === 'weather-refresh') {
    event.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(client => client.postMessage({ type: 'SYNC_REFRESH' }))
      )
    );
  }
});

/* ──────────────────────────────────────────────
   PUSH NOTIFICATIONS (stub — ready to wire up)
────────────────────────────────────────────── */
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'ATMOS Weather', {
      body: data.body || 'Weather update available.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      tag: 'weather-alert',
      renotify: true,
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
