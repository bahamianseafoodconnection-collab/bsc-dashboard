// GET /sw.js
//
// Dynamic service worker. Every Vercel deploy embeds a fresh build hash
// (or build-time fallback) into the SW body, so the byte content changes
// per deploy. Browsers compare the new bytes against the cached SW, see
// it as new, and install + activate it automatically — no re-install
// of the home-screen icon required.
//
// Cache strategy:
//   • Network-first for HTML pages so users always see the latest
//     content when online; falls back to cached shell offline.
//   • Cache-first for static assets (Next.js chunks have hashed
//     filenames, so cache hits are always still-valid bytes).
//   • Skips /api/*, /_next/data, and supabase.co — those must always
//     go to the network.
//
// skipWaiting() + clients.claim() so the new SW takes over immediately
// once the user reloads or returns to the page.

import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const STATIC_VERSION_FALLBACK = '20260517-base';

function buildVersion(): string {
  // Vercel populates VERCEL_GIT_COMMIT_SHA on every deploy. In dev or
  // outside Vercel, fall back to the file's deploy date so local sw.js
  // bytes still change when the route is touched.
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
    process.env.NEXT_PUBLIC_BUILD_VERSION ||
    STATIC_VERSION_FALLBACK
  );
}

export async function GET() {
  const VERSION = buildVersion();
  const body = `
// BSC Marketplace service worker — VERSION ${VERSION}
// This file is regenerated server-side on every deploy via /app/sw.js/route.ts.

const VERSION = '${VERSION}';
const SHELL_CACHE = 'bsc-shell-' + VERSION;
const SHELL_FILES = [
  '/',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_FILES)).catch(() => undefined)
  );
  // New SW activates as soon as the install completes; no waiting for
  // every tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop every cache that doesn't match the current VERSION so we
    // don't leak stale chunks across deploys.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)));
    // Take control of any open tab immediately.
    await self.clients.claim();
    // Notify every controlled page so the UpdateBanner can offer a soft
    // reload into the new version.
    const list = await self.clients.matchAll({ type: 'window' });
    for (const c of list) c.postMessage({ type: 'SW_ACTIVATED', version: VERSION });
  })());
});

self.addEventListener('message', (event) => {
  // The client posts this when the user taps "Update now" in the
  // banner — flush waiting and take over.
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/'))       return;
  if (url.pathname.startsWith('/_next/data')) return;
  if (url.host.endsWith('supabase.co'))       return;

  // Network-first for HTML — users always see latest when online.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Cache-first for static assets.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
      return res;
    }))
  );
});
`.trim();

  return new NextResponse(body, {
    headers: {
      'Content-Type':  'application/javascript; charset=utf-8',
      // Force fresh checks but allow the browser to cache for a short
      // window so polling every 60s isn't a hammer on the edge.
      'Cache-Control': 'public, max-age=60, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
