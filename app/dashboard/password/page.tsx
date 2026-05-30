'use client';

// /dashboard/password
//
// Self-service password change for any signed-in staff. Reachable from the
// dashboard nav. Requires the CURRENT password too — verifies it by attempting
// a sign-in, then calls supabase.auth.updateUser({password}) so nobody with
// just a hijacked session can rotate the credential.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default function PasswordPage() {
  const router = useRouter();
  const [email, setEmail]    = useState<string | null>(null);
  const [cur, setCur]        = useState('');
  const [next1, setNext1]    = useState('');
  const [next2, setNext2]    = useState('');
  const [busy, setBusy]      = useState(false);
  const [err, setErr]        = useState<string | null>(null);
  const [done, setDone]      = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!email)             { setErr('You are signed out. Sign in again first.'); return; }
    if (next1.length < 8)   { setErr('New password must be at least 8 characters.'); return; }
    if (next1 !== next2)    { setErr('Passwords do not match.'); return; }
    if (next1 === cur)      { setErr('New password must be different from the current one.'); return; }
    setBusy(true);
    try {
      // 1) Verify the current password (so a hijacked session alone can't rotate it).
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password: cur });
      if (signErr) { setErr('Current password is incorrect.'); return; }
      // 2) Set the new password.
      const { error: pwErr } = await supabase.auth.updateUser({ password: next1 });
      if (pwErr) { setErr('Could not update password: ' + pwErr.message); return; }
      setDone(true);
      setCur(''); setNext1(''); setNext2('');
      setTimeout(() => router.push('/dashboard'), 1800);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-md items-center gap-3 px-4 sm:h-16">
          <Link href="/dashboard" className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-bold text-gold hover:bg-gold/25">← BSC Control</Link>
          <div>
            <div className="text-sm font-black text-white">🔐 Change Password</div>
            <div className="text-[10px] text-white/50">Self-service · {email || 'signed out'}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-sm px-4 py-8">
        <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-100">
          {done ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <div className="text-3xl">✓</div>
              <h2 className="mt-1 font-display text-lg font-black text-emerald-700">Password updated</h2>
              <p className="mt-1 text-sm text-emerald-800/80">Sending you to the dashboard…</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm text-slate-600">
                Signed in as <strong className="text-navy">{email || '—'}</strong>. Update your password — you&apos;ll need your current one to confirm it&apos;s you.
              </p>
              <Field label="Current password">
                <input type="password" value={cur} onChange={(e) => setCur(e.target.value)}
                  autoComplete="current-password" required minLength={6} className={INPUT} />
              </Field>
              <Field label="New password">
                <input type="password" value={next1} onChange={(e) => setNext1(e.target.value)}
                  autoComplete="new-password" required minLength={8}
                  placeholder="at least 8 characters" className={INPUT} />
              </Field>
              <Field label="Confirm new password">
                <input type="password" value={next2} onChange={(e) => setNext2(e.target.value)}
                  autoComplete="new-password" required minLength={8} className={INPUT} />
              </Field>
              {err && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">⚠️ {err}</div>
              )}
              <button type="submit" disabled={busy}
                className="w-full rounded-xl bg-navy px-5 py-3 text-sm font-black text-gold transition hover:bg-navy-700 disabled:opacity-60">
                {busy ? 'Updating…' : 'Update password'}
              </button>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Use at least 8 characters. After updating, all of your other sessions on other devices stay valid — sign each one out manually if you want to fully rotate.
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

const INPUT =
  'w-full rounded-xl border-2 border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy outline-none transition focus:border-navy focus:shadow-[0_0_0_3px_rgba(26,46,90,0.1)]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}
