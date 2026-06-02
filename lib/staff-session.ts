// lib/staff-session.ts
//
// Tracks the staff signin timestamp in localStorage so AppShell can
// auto-signout cashiers / managers / andros_staff / supplier / etc.
// after a 10-hour cap (founder + co_founder exempt — they're always-on
// per the same pattern as Phase 2a / 2c shift discipline).
//
// Default Supabase persistSession=true keeps the cashier signed in
// across page loads / browser restarts indefinitely; this layer adds
// the explicit "max 10h since signin" cap on top.
//
// Server-safe: every function no-ops cleanly when window is undefined
// (SSR) or localStorage is unavailable (privacy mode).

const KEY     = 'bsc_signed_in_at';
// Bumped from 10h → 30 days on 2026-06-02. Founder repeatedly hit
// "Claff is signed out mid-shift" issues even with cashier/andros
// already in BYPASS_ROLES. Belt-and-suspenders: anyone who somehow
// has a timestamp (left over from older code paths) still won't be
// force-signed-out unless they've been "signed in" for 30+ days.
// Real session lifecycle is owned by Supabase auth refresh tokens.
const MAX_MS  = 30 * 24 * 60 * 60 * 1000;   // 30 days

export function recordSignIn(at: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, String(at)); } catch { /* quota / disabled — non-fatal */ }
}

export function clearSignIn(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(KEY); } catch { /* non-fatal */ }
}

/** Milliseconds remaining before auto-signout. null when no record. */
export function staffSessionMsLeft(now: number = Date.now()): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(KEY);
    if (!v) return null;
    const ms = Number(v);
    if (!Number.isFinite(ms)) return null;
    return MAX_MS - (now - ms);
  } catch { return null; }
}

/** True only when there's a known signin timestamp AND it's past 10h ago. */
export function isStaffSessionExpired(now: number = Date.now()): boolean {
  const left = staffSessionMsLeft(now);
  return left !== null && left <= 0;
}

/**
 * Roles that bypass the 10h cap (stay signed in until they explicitly
 * sign out). Founder + co_founder are always-on per the dashboard
 * contract. Cashier + andros_staff are at the register all day —
 * Dedrick directed 2026-06-02 "keep him signed in until he signs
 * out" — so they bypass too. Other roles (manager, processor,
 * supplier, etc.) still get the cap for security.
 */
const BYPASS_ROLES = new Set(['founder', 'co_founder', 'cashier', 'andros_staff']);

export function staffSessionBypassesFor(role: string | null | undefined): boolean {
  return !!role && BYPASS_ROLES.has(role);
}

/** Max-session constant exposed for UI usage (countdown badge, etc.) */
export const STAFF_SESSION_MAX_MS = MAX_MS;
