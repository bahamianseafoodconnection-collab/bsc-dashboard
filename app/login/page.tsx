'use client';

// /login — customer sign-in / register. Tailwind redesign.
// Two tabs: Sign In and Register. All auth logic preserved.

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';
const LOGO = `${STORAGE_BASE}/A0EF44D5-D0F6-4D15-9826-4FED851A2719.png`;

type Mode = 'signin' | 'register';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
      // Role-based landing — fishermen go straight to /lobster-intake.
      const { data: { user } } = await supabase.auth.getUser();
      let dest = '/market';
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
          // Send the confirmation link back to wherever the customer
          // actually signed up (bscbahamas.com in prod) instead of falling
          // back to the Supabase "Site URL" config (which was localhost).
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
      if (err) {
        setError(err.message);
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
      window.location.href = '/market';
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
