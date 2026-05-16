// BSC Marketplace — minimal PWA service worker.
//
// Goals:
//   1. Make the site PWA-installable (Chrome's "Add to Home Screen" + iOS
//      Safari's home-screen save require a registered SW).
//   2. Cache the app shell so the splash + offline UX feels native.
//   3. Stay out of the way of Supabase / Next.js streaming — we DO NOT
//      cache API routes, _next/data, or POST requests.
//
// Increment VERSION whenever you change cached file lists.

const VERSION = 'bsc-v1';
const SHELL_CACHE = `bsc-shell-${VERSION}`;
const SHELL_FILES = [
  '/',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_FILES)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Skip API / Next.js data / Supabase calls — must always go to the network.
  if (url.pathname.startsWith('/api/'))     return;
  if (url.pathname.startsWith('/_next/data')) return;
  if (url.host.endsWith('supabase.co'))    return;

  // Network-first for HTML pages so users always see the latest content
  // when online; fall back to cached shell when offline.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/'))),
    );
    return;
  }

  // Cache-first for static assets (images, fonts, JS chunks).
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
      return res;
    })),
  );
});
