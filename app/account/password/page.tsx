'use client';

// app/account/password/page.tsx
//
// Self-service change password for signed-in staff. Unlike /change-password
// (the FORCED first-sign-in flow), this verifies the CURRENT password before
// setting a new one — so a logged-in session can't be hijacked into a silent
// password swap. Reachable any time from the account menu.
//
// Flow: re-authenticate with the current password (signInWithPassword) → on
// success, updateUser({ password }). Clears must_change_password if it was set.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default function AccountPasswordPage() {
  const router = useRouter();
  const [email, setEmail]       = useState<string | null>(null);
  const [current, setCurrent]   = useState('');
  const [next, setNext]         = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);
  const [done, setDone]         = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/staff-login'); return; }
      setEmail(data.user.email ?? null);
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email)              { setError('You appear to be signed out. Sign in again.'); return; }
    if (!current)            { setError('Enter your current password.'); return; }
    if (next.length < 8)     { setError('New password must be at least 8 characters.'); return; }
    if (next !== confirm)    { setError('New passwords do not match.'); return; }
    if (next === current)    { setError('New password must be different from the current one.'); return; }

    setBusy(true);
    try {
      // 1) Verify the CURRENT password by re-authenticating. Wrong password
      //    fails here and we never touch the account.
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: current });
      if (reauthErr) {
        setError('Current password is incorrect.');
        setBusy(false);
        return;
      }

      // 2) Set the new password on the (re-freshed) session.
      const { error: updErr } = await supabase.auth.updateUser({ password: next });
      if (updErr) { setError('Could not update password: ' + updErr.message); setBusy(false); return; }

      // 3) Clear the forced-change flag if it was set. Best-effort.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles')
          .update({ must_change_password: false })
          .eq('id', user.id)
          .then(() => undefined, () => undefined);
      }

      setDone(true);
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#060d1f', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{
        width: '100%', maxWidth: 420, padding: 28, borderRadius: 16,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(245,197,24,0.2)',
      }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: '#f5c518', textTransform: 'uppercase', marginBottom: 8 }}>
          BSC · Account
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f5c518', fontFamily: "'Playfair Display', serif", marginBottom: 6 }}>
          Change password
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 18, lineHeight: 1.5 }}>
          {email ? <>Signed in as <strong style={{ color: '#fff' }}>{email}</strong>. </> : null}
          Confirm your current password, then set a new one.
        </p>

        {done ? (
          <>
            <div style={{ padding: 16, borderRadius: 10, background: 'rgba(22,163,74,0.15)', color: '#4ade80', fontSize: 14, marginBottom: 14 }}>
              ✓ Password changed. Use your new password next time you sign in.
            </div>
            <Link href="/dashboard" style={linkBtn}>← Back to dashboard</Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <Field label="Current password">
              <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password" required style={input} />
            </Field>
            <Field label="New password">
              <input type="password" value={next} onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password" minLength={8} required style={input} />
            </Field>
            <Field label="Confirm new password">
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password" minLength={8} required style={input} />
            </Field>
            {error && <p style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>⚠ {error}</p>}
            <button type="submit" disabled={busy}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 10,
                background: '#f5c518', color: '#060d1f',
                fontWeight: 700, fontSize: 14, border: 'none',
                cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
              }}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 16, lineHeight: 1.5 }}>
          At least 8 characters. Pick something you can type quickly on the POS keyboard.
        </p>
      </div>
    </div>
  );
}

const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  background: '#1a2e5a', border: '1px solid rgba(245,197,24,0.25)',
  color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
};

const linkBtn: React.CSSProperties = {
  display: 'inline-block', color: '#f5c518', fontSize: 13, fontWeight: 700, textDecoration: 'none',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}
