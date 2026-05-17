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
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.waiting) {
      // Tell the waiting SW to take over. controllerchange handler reloads.
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  }

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
