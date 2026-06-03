'use client';

// Registers /sw.js, polls for updates, and renders an "Update available"
// banner the moment a new SW is waiting.
//
// Update flow:
//   1. /sw.js is served dynamically by /app/sw.js/route.ts — every deploy
//      embeds a fresh build hash, so byte content changes.
//   2. Browser fetches the new bytes on next page load or every time
//      registration.update() runs.
//   3. New SW installs in the background, enters "waiting" state.
//   4. This component detects waiting → shows a discreet bottom banner.
//   5. User taps "Update" → we postMessage SKIP_WAITING → the new SW
//      activates and the page reloads into the new version.
//
// Polls registration.update() every 60s, and again whenever the
// document becomes visible (returning from app switcher or another tab).

import { useEffect, useState } from 'react';

export default function RegisterSW() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    let pollTimer: number | undefined;
    let cancelled = false;

    function watchWaiting(reg: ServiceWorkerRegistration) {
      if (reg.waiting) setUpdateAvailable(true);
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW installed alongside the live one — waiting to take over.
            setUpdateAvailable(true);
          }
        });
      });
    }

    function onVisibility() {
      if (document.visibilityState === 'visible' && registration) {
        registration.update().catch(() => undefined);
      }
    }

    function startup() {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((reg) => {
          if (cancelled) return;
          registration = reg;
          watchWaiting(reg);
          // Quietly poll for a new SW once a minute.
          pollTimer = window.setInterval(() => {
            reg.update().catch(() => undefined);
          }, 60_000);
        })
        .catch(() => undefined);

      document.addEventListener('visibilitychange', onVisibility);
      // The activated event fires when the new SW takes over after
      // skipWaiting — reload so the user lands on the new bundle.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }

    if (document.readyState === 'complete') startup();
    else window.addEventListener('load', startup, { once: true });

    return () => {
      cancelled = true;
      if (pollTimer) window.clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  async function applyUpdate() {
    if (busy) return;
    setBusy(true);
    // Bulletproof update path. The old "postMessage SKIP_WAITING + wait
    // for controllerchange" flow could hang if the waiting SW had
    // already taken over (no controllerchange event fires) — observed
    // 2026-06-03 mid-sale at /pos: Claff stuck with the banner up and
    // the page not reloading. Brute-force path: tell any waiting SW to
    // skip, unregister every SW, blow away every Cache Storage entry,
    // then hard reload. Guarantees the new bundle lands.
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        try { r.waiting?.postMessage({ type: 'SKIP_WAITING' }); } catch {}
        try { await r.unregister(); } catch {}
      }
      if (typeof caches !== 'undefined') {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
    } catch {
      // Best-effort cleanup — fall through to reload regardless.
    }
    // Force a fresh network fetch (location.reload() defaults to true on
    // newer specs but we explicitly bust by appending a cache-buster).
    const u = new URL(window.location.href);
    u.searchParams.set('_v', String(Date.now()));
    window.location.replace(u.toString());
  }

  function dismiss() {
    // Snooze for 30 minutes. Persisted to sessionStorage so a page nav
    // doesn't bring the banner back instantly — cashier needs to finish
    // the sale without being re-pinged every navigation.
    try {
      sessionStorage.setItem('bsc_sw_update_dismiss_until', String(Date.now() + 30 * 60 * 1000));
    } catch {}
    setUpdateAvailable(false);
  }

  // Respect a recent dismissal so the banner doesn't reappear on every
  // pathname change.
  useEffect(() => {
    if (!updateAvailable) return;
    try {
      const until = Number(sessionStorage.getItem('bsc_sw_update_dismiss_until') || 0);
      if (until > Date.now()) setUpdateAvailable(false);
    } catch {}
  }, [updateAvailable]);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(72px + env(safe-area-inset-bottom))', // sit above the nav bar
        zIndex: 60,
        maxWidth: 480,
        margin: '0 auto',
        background: '#060d1f',
        color: '#f5c518',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        border: '1px solid rgba(245,197,24,0.4)',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <span style={{ fontSize: 13, flex: 1 }}>
        New BSC version available.
      </span>
      <button
        onClick={dismiss}
        disabled={busy}
        style={{
          background: 'transparent',
          color: 'rgba(245,197,24,0.7)',
          border: '1px solid rgba(245,197,24,0.4)',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 11,
          fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.5 : 1,
        }}
      >
        Later
      </button>
      <button
        onClick={applyUpdate}
        disabled={busy}
        style={{
          background: '#f5c518',
          color: '#060d1f',
          border: 'none',
          borderRadius: 8,
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 800,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? 'Updating…' : 'Update'}
      </button>
    </div>
  );
}
