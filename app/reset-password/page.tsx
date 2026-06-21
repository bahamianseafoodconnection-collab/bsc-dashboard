'use client';

// /reset-password — completes the "forgot password" flow.
//
// Supabase emails the customer a recovery link that lands here with a
// recovery token in the URL hash. The supabase-js client (detectSessionInUrl)
// exchanges it for a short-lived session and fires a PASSWORD_RECOVERY auth
// event. While that session is active the user may call updateUser({ password })
// exactly once to set a new password — no old password required, because the
// email link itself proved ownership.
//
// States: verifying → ready (show new-password form) → done, or error.

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';
const LOGO = `${STORAGE_BASE}/A0EF44D5-D0F6-4D15-9826-4FED851A2719.png`;

const INPUT =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-navy outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  // 'verifying' until we know whether a recovery session is present.
  const [phase, setPhase] = useState<'verifying' | 'ready' | 'done' | 'error'>('verifying');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let settled = false;

    // The recovery session arrives asynchronously as supabase-js parses the URL
    // hash. Listen for the PASSWORD_RECOVERY event, and also check for an
    // already-established session (covers the case where parsing finished before
    // this effect ran).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && !settled)) {
        settled = true;
        setPhase('ready');
      }
    });

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && !settled) { settled = true; setPhase('ready'); }
      else {
        // Give the hash a moment to be exchanged, then fail if still nothing.
        setTimeout(() => {
          if (!settled) {
            settled = true;
            setPhase('error');
            setError('This reset link is invalid or has expired. Request a new one from the sign-in page.');
          }
        }, 2500);
      }
    })();

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSaving(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) { setError(err.message); setSaving(false); return; }
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password. Try again.');
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="BSC" className="h-14 w-14 rounded-full object-cover" />
          <h1 className="mt-3 text-lg font-black text-navy">Reset your password</h1>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {phase === 'verifying' && (
            <p className="text-center text-sm text-slate-500">Verifying your reset link…</p>
          )}

          {phase === 'error' && (
            <div className="text-center">
              <p className="mb-4 text-sm font-semibold text-red-600">{error}</p>
              <Link href="/login" className="text-sm font-bold text-navy underline">
                Back to sign in
              </Link>
            </div>
          )}

          {phase === 'ready' && (
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">New password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={INPUT}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Confirm new password</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={INPUT}
                />
              </label>
              {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={saving}
                className={`mt-1 w-full rounded-xl px-4 py-3.5 text-sm font-black transition ${
                  saving ? 'cursor-not-allowed bg-slate-300 text-slate-500' : 'bg-gold text-navy hover:bg-gold-300'
                }`}
              >
                {saving ? 'Saving…' : 'Set new password'}
              </button>
            </form>
          )}

          {phase === 'done' && (
            <div className="text-center">
              <div className="mb-3 text-3xl">✅</div>
              <p className="mb-4 text-sm font-semibold text-navy">Your password has been updated.</p>
              <Link
                href="/market"
                className="inline-block rounded-xl bg-gold px-5 py-3 text-sm font-black text-navy transition hover:bg-gold-300"
              >
                Continue to BSC Market
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
