'use client';

// /login — customer sign-in / register. Tailwind redesign.
// Two tabs: Sign In and Register. All auth logic preserved.

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { publicSiteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';
const LOGO = `${STORAGE_BASE}/A0EF44D5-D0F6-4D15-9826-4FED851A2719.png`;

type Mode = 'signin' | 'register';

// Only allow same-origin relative paths as redirect targets — never echo a
// full URL from the query string (open-redirect protection).
function safeNext(raw: string | null): string {
  if (!raw) return '/market';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/market';
  return raw;
}

// Next 15 forces any component that calls useSearchParams() to live under
// a Suspense boundary during prerender — otherwise the build bails out.
// The boundary is intentionally invisible (the inner form will render
// almost immediately on the client).
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const params = useSearchParams();
  const nextParam = safeNext(params?.get('next') ?? null);
  const modeParam = (params?.get('mode') === 'signup' || params?.get('mode') === 'register') ? 'register' : null;

  const [mode, setMode] = useState<Mode>(modeParam ?? 'signin');
  // Honor `?mode=signup` even if the URL changes after mount (e.g. tab swap
  // via Link). useEffect catches the param on initial paint without flicker.
  useEffect(() => { if (modeParam) setMode(modeParam); }, [modeParam]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // Resend-confirmation state — surfaced when sign-in fails because the
  // email was never confirmed.
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  // Password-reset feedback — kept separate from the confirmation-resend block.
  const [resetMsg, setResetMsg] = useState('');
  const [resettingPw, setResettingPw] = useState(false);

  async function handleResendConfirmation() {
    if (!email.trim()) { setResendMsg('Enter your email above first.'); return; }
    setResending(true);
    setResendMsg('');
    try {
      const { error: err } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: `${publicSiteUrl()}/auth/confirmed`,
        },
      });
      setResendMsg(err
        ? `Couldn't resend: ${err.message}`
        : '✅ Confirmation email sent — check your inbox (and spam).');
    } catch (err) {
      setResendMsg(`Couldn't resend: ${err instanceof Error ? err.message : 'try again'}`);
    } finally {
      setResending(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) { setResetMsg('Enter your email above, then tap “Forgot password”.'); return; }
    setResettingPw(true);
    setResetMsg('');
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${publicSiteUrl()}/reset-password`,
      });
      setResetMsg(err
        ? `Couldn't send reset link: ${err.message}`
        : '✅ Password-reset link sent — check your inbox (and spam).');
    } catch (err) {
      setResetMsg(`Couldn't send reset link: ${err instanceof Error ? err.message : 'try again'}`);
    } finally {
      setResettingPw(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNeedsConfirm(false);
    setResendMsg('');
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message);
        // Supabase returns "Email not confirmed" when the link was never used.
        if (/not confirmed|confirm/i.test(err.message)) setNeedsConfirm(true);
        setLoading(false);
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
      // Role-based landing — fishermen go straight to /lobster-intake;
      // everyone else honours the `?next=` param (or /market by default).
      const { data: { user } } = await supabase.auth.getUser();
      let dest = nextParam;
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
        if (prof?.role === 'fisherman') dest = '/lobster-intake';
      }
      window.location.href = dest;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, phone },
          // Confirmation link returns to a branded landing on the canonical
          // domain (must be on Supabase's Redirect URLs allowlist, else
          // Supabase falls back to the Site URL — which was localhost — and
          // the link dies). /auth/confirmed welcomes the customer in.
          emailRedirectTo: `${publicSiteUrl()}/auth/confirmed`,
        },
      });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      // Already-registered email → Supabase returns a user with NO identities
      // and SENDS NOTHING on signup (anti-enumeration). Rather than dead-end a
      // returning customer who forgot they have an account, AUTO-send a password
      // reset (reuses the working reset flow) so they can get straight back in —
      // no duplicate accounts, no repeated sign-up attempts. Best-effort send.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${publicSiteUrl()}/reset-password`,
        }).catch(() => undefined);
        setInfo("This email is already registered. We've sent you a password reset link — check your email (and spam) to log back in.");
        setLoading(false);
        return;
      }
      // Email-confirmation required → no session yet. The confirmation email is
      // sent; don't redirect them into a page they can't access unconfirmed.
      if (data.user && !data.session) {
        setInfo('✅ Account created — check your inbox (and spam) to confirm your email, then sign in.');
        setLoading(false);
        return;
      }
      if (data.user) {
        // CRITICAL: never overwrite role on existing profiles. If a staff
        // member (control_admin / manager / cashier / etc.) runs this
        // signup flow with their own email, upserting role='customer'
        // would silently demote them out of dashboard access.
        // → Check first; only set role when creating a brand-new profile.
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle();
        if (existing) {
          await supabase.from('profiles')
            .update({ full_name: name, phone })
            .eq('id', data.user.id);
        } else {
          await supabase.from('profiles').insert({
            id: data.user.id,
            full_name: name,
            phone,
            role: 'customer',
          });
        }
        // Also seed the customer-tracking record. Fire-and-forget — the
        // signup is the authoritative event; this just gets them on the
        // tracking radar before their first order.
        fetch('/api/customers/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            phone: phone || null,
            email,
            source: 'online',
            auth_user_id: data.user.id,
          }),
        }).catch((err) => console.warn('Customer seed failed:', err));
      }
      await new Promise((r) => setTimeout(r, 400));
      window.location.href = nextParam;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 antialiased">
      {/* ─── Header ─── */}
      <header className="bg-navy">
        <div className="mx-auto flex h-16 max-w-screen-xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-[#fafaf6]/[0.97] p-1">
              <img src={LOGO} alt="BSC" className="h-full w-auto object-contain" />
            </div>
            <div className="leading-tight">
              <div className="text-base font-black text-white">BSC</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-white/60">
                Marketplace
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/market"
              className="hidden text-sm text-white/70 transition hover:text-white sm:inline"
            >
              Browse Market
            </Link>
            <Link
              href="/staff-login"
              className="text-xs font-bold text-gold transition hover:text-gold-300 sm:text-sm"
            >
              Staff Login →
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Main ─── */}
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md">
          <div className="overflow-hidden rounded-3xl bg-white shadow-[0_8px_40px_rgba(0,0,0,0.10)]">
            {/* Card header */}
            <div className="bg-navy px-7 py-7">
              <div className="mb-2 text-3xl">🐟</div>
              <h1 className="mb-1 font-display text-2xl font-black text-white">
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="text-sm text-white/65">
                {mode === 'signin'
                  ? 'Sign in to your BSC account'
                  : 'Join BSC Marketplace today'}
              </p>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-2 border-b border-slate-100">
              {(
                [
                  { key: 'signin',   label: 'Sign In' },
                  { key: 'register', label: 'Register' },
                ] as const
              ).map((tab) => {
                const active = mode === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setMode(tab.key);
                      setError('');
                    }}
                    className={`px-4 py-3.5 text-sm transition ${
                      active
                        ? 'border-b-[3px] border-gold bg-slate-50/50 font-extrabold text-navy'
                        : 'border-b-[3px] border-transparent font-medium text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Form */}
            <div className="px-7 py-7 sm:px-8">
              {error && (
                <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm font-semibold text-red-600">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}
              {info && (
                <div className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm font-semibold text-emerald-700">
                  <span>📩</span>
                  <span>{info}</span>
                </div>
              )}

              {/* Resend confirmation — shown when sign-in failed on an
                  unconfirmed email (or any time, as a recovery affordance). */}
              {(needsConfirm || resendMsg) && mode === 'signin' && (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm">
                  <p className="font-semibold text-amber-800">Didn’t get your confirmation email?</p>
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resending}
                    className="mt-2 rounded-lg bg-navy px-3.5 py-2 text-xs font-extrabold text-gold hover:opacity-90 disabled:opacity-50"
                  >
                    {resending ? 'Sending…' : '✉️ Resend confirmation email'}
                  </button>
                  {resendMsg && <p className="mt-2 text-xs font-semibold text-slate-600">{resendMsg}</p>}
                </div>
              )}

              <form
                onSubmit={mode === 'signin' ? handleSignIn : handleRegister}
                className="space-y-4"
              >
                {mode === 'register' && (
                  <>
                    <Field label="Full name">
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your full name"
                        required
                        autoComplete="name"
                        className={INPUT}
                      />
                    </Field>
                    <Field
                      label="WhatsApp number"
                      hint="Receipts sent here via WhatsApp 💬"
                    >
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+1 (242) 000-0000"
                        autoComplete="tel"
                        className={INPUT}
                      />
                    </Field>
                  </>
                )}

                <Field label="Email address">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    inputMode="email"
                    className={INPUT}
                  />
                </Field>

                <Field label="Password">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    minLength={mode === 'register' ? 8 : undefined}
                    className={INPUT}
                  />
                </Field>

                {mode === 'signin' && (
                  <>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resettingPw}
                      className="-mt-1 self-end text-xs font-semibold text-slate-500 transition hover:text-navy disabled:opacity-50"
                    >
                      {resettingPw ? 'Sending…' : 'Forgot password?'}
                    </button>
                    {resetMsg && <p className="-mt-1 text-xs font-semibold text-slate-600">{resetMsg}</p>}
                  </>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`mt-1 w-full rounded-xl px-4 py-3.5 text-sm font-black transition ${
                    loading
                      ? 'cursor-not-allowed bg-slate-300 text-slate-500'
                      : 'bg-gold text-navy hover:bg-gold-300 hover:-translate-y-0.5 hover:shadow-md'
                  }`}
                >
                  {loading
                    ? 'Please wait…'
                    : mode === 'signin'
                      ? 'Sign in to BSC'
                      : 'Create my account'}
                </button>

                <Link
                  href="/market"
                  className="block py-2 text-center text-sm text-slate-500 transition hover:text-navy"
                >
                  Continue browsing without account →
                </Link>
              </form>
            </div>
          </div>

          {/* Trust badges */}
          <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
            <span>🔒 Secure login</span>
            <span>💬 WhatsApp receipts</span>
            <span>🇧🇸 Local &amp; trusted</span>
          </div>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center">
        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} BSC Marketplace · Bahamian Seafood Connection · Proudly
          Bahamian 🇧🇸
        </p>
      </footer>
    </div>
  );
}

const INPUT =
  'w-full rounded-xl border-[1.5px] border-slate-200 bg-white px-3.5 py-3 text-sm text-navy outline-none transition placeholder:text-slate-300 focus:border-navy focus:shadow-[0_0_0_3px_rgba(26,46,90,0.1)]';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-bold text-slate-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
