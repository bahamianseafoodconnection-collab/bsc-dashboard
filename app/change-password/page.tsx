'use client';

// Forced password change. Reached automatically by the AppShell guard
// when profiles.must_change_password = TRUE. The user cannot leave this
// page (no nav, no back links) until the change succeeds.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [pwd, setPwd]         = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError]     = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);
  const [done, setDone]       = useState(false);
  const [email, setEmail]     = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pwd.length < 8)         { setError('Password must be at least 8 characters.'); return; }
    if (pwd !== confirm)        { setError('Passwords do not match.'); return; }
    if (pwd === 'BSC2024!')     { setError('You cannot reuse the temporary password.'); return; }

    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('You are signed out. Please sign in again.'); setBusy(false); return; }

      const { error: pwErr } = await supabase.auth.updateUser({ password: pwd });
      if (pwErr) { setError('Password update failed: ' + pwErr.message); setBusy(false); return; }

      const { error: profErr } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', user.id);
      if (profErr) { setError('Saved password, but flag update failed: ' + profErr.message); setBusy(false); return; }

      setDone(true);
      setTimeout(() => router.push('/dashboard'), 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#060d1f', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        width: '100%', maxWidth: 420, padding: 28, borderRadius: 16,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(245,197,24,0.2)',
      }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: '#f5c518', textTransform: 'uppercase', marginBottom: 8 }}>
          BSC · First Sign-In
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f5c518', fontFamily: "'Playfair Display', serif", marginBottom: 6 }}>
          Set your password
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 18, lineHeight: 1.5 }}>
          {email ? <>You're signed in as <strong style={{ color: '#fff' }}>{email}</strong>. </> : null}
          Replace the temporary password with one only you know.
        </p>

        {done ? (
          <div style={{ padding: 16, borderRadius: 10, background: 'rgba(22,163,74,0.15)', color: '#4ade80', fontSize: 14 }}>
            ✓ Password updated. Sending you to the dashboard…
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <Field label="New password">
              <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)}
                autoComplete="new-password" minLength={8} required style={input} />
            </Field>
            <Field label="Confirm new password">
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password" minLength={8} required style={input} />
            </Field>
            {error && (
              <p style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>⚠ {error}</p>
            )}
            <button type="submit" disabled={busy}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 10,
                background: '#f5c518', color: '#060d1f',
                fontWeight: 700, fontSize: 14, border: 'none',
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}>
              {busy ? 'Saving…' : 'Set password'}
            </button>
          </form>
        )}

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 16, lineHeight: 1.5 }}>
          Tip: pick something you can remember on the POS keyboard.
          At least 8 characters, no need for symbols unless you want them.
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
