'use client';

// app/staff/activate/page.tsx
// First-time staff sign-in. Staff arrive here with ?token=... in the URL,
// set their own password, and get routed to their role's landing page.

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

const NAVY = '#060d1f';
const PANEL = '#0f1a2e';
const GOLD = '#f4c842';
const TEXT_DIM = 'rgba(255,255,255,0.55)';
const BORDER = 'rgba(255,255,255,0.08)';
const RED = '#f87171';

type LookupState =
  | { status: 'loading' }
  | { status: 'invalid'; message: string }
  | { status: 'ready'; email: string; role: string | null; name: string | null };

function ActivateInner() {
  const params = useSearchParams();
  const token = (params.get('token') || '').trim();

  const [lookup, setLookup] = useState<LookupState>({ status: 'loading' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    if (!token) {
      setLookup({ status: 'invalid', message: 'No activation token in this link.' });
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/staff/activate?token=${encodeURIComponent(token)}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (!res.ok || !json.email) {
          setLookup({
            status: 'invalid',
            message: json.error || 'This link is invalid or already used.',
          });
        } else {
          setLookup({
            status: 'ready',
            email: json.email,
            role: json.role ?? null,
            name: json.name ?? null,
          });
        }
      } catch {
        setLookup({ status: 'invalid', message: 'Network error verifying your link.' });
      }
    })();
  }, [token]);

  function routeForRole(role: string | null) {
    if (role === 'processor' || role === 'operations') return '/processor';
    if (role === 'supplier') return '/supplier';
    return '/dashboard';
  }

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (lookup.status !== 'ready') return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/staff/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || 'Activation failed. Try again or contact Dedrick.');
        setSubmitting(false);
        return;
      }

      // Sign the user in with their new password.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: lookup.email,
        password,
      });
      if (signInError) {
        setError(
          'Account activated, but auto sign-in failed. Use Staff Login with your new password.'
        );
        setSubmitting(false);
        return;
      }

      // Brief pause so the auth cookie is in place before navigating.
      await new Promise((r) => setTimeout(r, 350));
      window.location.href = routeForRole(json.role ?? lookup.role);
    } catch {
      setError('Network error. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: NAVY,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: '0 24px',
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 60,
          }}
        >
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textDecoration: 'none',
              color: '#fff',
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: '#1a2e5a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}
            >
              🐟
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>BSC Control</div>
              <div
                style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 9,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                }}
              >
                Staff Activation
              </div>
            </div>
          </Link>
          <Link
            href="/staff-login"
            style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textDecoration: 'none' }}
          >
            Staff Login →
          </Link>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div
            style={{
              background: PANEL,
              borderRadius: 20,
              border: `1px solid ${BORDER}`,
              overflow: 'hidden',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                padding: '32px 32px 24px',
                textAlign: 'center',
                borderBottom: `1px solid ${BORDER}`,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: GOLD,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  fontSize: 26,
                }}
              >
                🔑
              </div>
              <h1 style={{ color: '#fff', fontWeight: 900, fontSize: 22, margin: '0 0 6px' }}>
                Activate Your Account
              </h1>
              <p style={{ color: TEXT_DIM, fontSize: 13, margin: 0 }}>
                Set your password to finish setting up your BSC staff login.
              </p>
            </div>

            <div style={{ padding: '28px 32px' }}>
              {lookup.status === 'loading' && (
                <p style={{ color: TEXT_DIM, fontSize: 13, textAlign: 'center', margin: 0 }}>
                  Verifying your activation link...
                </p>
              )}

              {lookup.status === 'invalid' && (
                <>
                  <div
                    style={{
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      borderRadius: 10,
                      padding: '12px 16px',
                      color: RED,
                      fontSize: 13,
                      fontWeight: 600,
                      marginBottom: 16,
                    }}
                  >
                    ⚠️ {lookup.message}
                  </div>
                  <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.5, margin: 0 }}>
                    Activation links are one-time use. If you've already activated, sign in
                    normally. Otherwise message Dedrick or Jaquel for a fresh link.
                  </p>
                </>
              )}

              {lookup.status === 'ready' && (
                <>
                  <div
                    style={{
                      background: 'rgba(244,200,66,0.06)',
                      border: '1px solid rgba(244,200,66,0.18)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      marginBottom: 18,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: 1,
                        color: GOLD,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      Activating
                    </div>
                    <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>
                      {lookup.name || lookup.email}
                    </div>
                    {lookup.name && (
                      <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 2 }}>
                        {lookup.email}
                      </div>
                    )}
                    {lookup.role && (
                      <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 4 }}>
                        Role: <span style={{ color: '#fff' }}>{lookup.role}</span>
                      </div>
                    )}
                  </div>

                  {error && (
                    <div
                      style={{
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 10,
                        padding: '12px 16px',
                        color: RED,
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 16,
                      }}
                    >
                      ⚠️ {error}
                    </div>
                  )}

                  <form onSubmit={handleActivate}>
                    <Field label="New password">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        required
                        autoComplete="new-password"
                        minLength={8}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Confirm password">
                      <input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Type it again"
                        required
                        autoComplete="new-password"
                        minLength={8}
                        style={inputStyle}
                      />
                    </Field>

                    <button
                      type="submit"
                      disabled={submitting}
                      style={{
                        width: '100%',
                        background: submitting ? '#4b5563' : GOLD,
                        color: '#1a2e5a',
                        border: 'none',
                        borderRadius: 12,
                        padding: 14,
                        fontWeight: 900,
                        fontSize: 15,
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        marginTop: 8,
                      }}
                    >
                      {submitting ? 'Activating...' : 'Activate & Sign In'}
                    </button>
                  </form>

                  <p
                    style={{
                      color: TEXT_DIM,
                      fontSize: 11,
                      textAlign: 'center',
                      margin: '16px 0 0',
                    }}
                  >
                    By activating you agree this account is for BSC business use only.
                  </p>
                </>
              )}
            </div>
          </div>

          <p
            style={{
              textAlign: 'center',
              color: 'rgba(255,255,255,0.25)',
              fontSize: 12,
              marginTop: 24,
            }}
          >
            🇧🇸 Bahamian Seafood Connection · Confidential
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: 'block',
          color: TEXT_DIM,
          fontSize: 12,
          fontWeight: 700,
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 16px',
  borderRadius: 10,
  border: `1.5px solid ${BORDER}`,
  background: 'rgba(255,255,255,0.05)',
  color: '#fff',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

export default function StaffActivatePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: NAVY,
            color: TEXT_DIM,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          Loading...
        </div>
      }
    >
      <ActivateInner />
    </Suspense>
  );
}
