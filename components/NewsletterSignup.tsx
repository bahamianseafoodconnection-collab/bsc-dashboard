'use client';

// components/NewsletterSignup.tsx
//
// Compact email/phone capture form. Posts to /api/newsletter/subscribe.
// Two visual variants:
//   - "card" (default): light card with bold heading, used on home page
//   - "inline": dark on-navy variant for the footer

import { useState } from 'react';

type Variant = 'card' | 'inline';

type Props = {
  variant?: Variant;
  source?: string;
  heading?: string;
  subheading?: string;
};

export default function NewsletterSignup({
  variant = 'card',
  source = 'home',
  heading,
  subheading,
}: Props) {
  const [contact, setContact] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<null | 'subscribed' | 'already_subscribed'>(null);
  const [error, setError] = useState<string | null>(null);

  const isEmail = contact.includes('@');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!contact.trim()) { setError('Enter your email or WhatsApp number'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || null,
          email: isEmail ? contact.trim() : null,
          phone: isEmail ? null : contact.trim(),
          source,
        }),
      });
      const j = await res.json();
      if (!j.ok) { setError(j.error || 'Could not subscribe'); }
      else { setOk(j.status); setContact(''); setName(''); }
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  if (variant === 'inline') {
    return (
      <form onSubmit={submit} className="space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
          {heading || 'Stay in the loop'}
        </div>
        {subheading && (
          <div className="text-[11px] text-white/55 leading-relaxed">
            {subheading}
          </div>
        )}
        {ok ? (
          <div className="text-xs font-bold text-emerald-300">
            ✓ {ok === 'already_subscribed' ? 'You\'re already on the list' : 'You\'re in — thanks!'}
          </div>
        ) : (
          <>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Email or WhatsApp #"
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-gold/60"
            />
            {error && <div className="text-[10px] text-red-300">{error}</div>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-gold px-3 py-2 text-xs font-black text-navy hover:bg-gold-300 disabled:opacity-60"
            >
              {busy ? 'Joining…' : 'Subscribe'}
            </button>
          </>
        )}
      </form>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-card sm:p-8">
      <div className="text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-600">
          BSC Insider
        </div>
        <h2 className="mt-1 font-display text-2xl font-black text-navy sm:text-3xl">
          {heading || 'New drops, weekly deals'}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          {subheading ||
            'Get a heads-up when fresh seafood lands, and an early look at promo codes before they go public. WhatsApp or email — your call.'}
        </p>
      </div>
      {ok ? (
        <div className="mx-auto mt-5 max-w-sm rounded-xl bg-emerald-50 p-4 text-center text-sm font-bold text-emerald-800">
          ✓ {ok === 'already_subscribed'
            ? "You're already subscribed — we'll keep you posted."
            : "You're on the list. Thanks for joining BSC Insider."}
        </div>
      ) : (
        <form onSubmit={submit} className="mx-auto mt-5 flex max-w-md flex-col gap-2 sm:flex-row">
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Email or WhatsApp number"
            className="flex-1 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-navy outline-none placeholder:text-slate-300 focus:border-navy"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-navy px-6 py-3 text-sm font-black text-gold hover:bg-navy-700 disabled:opacity-60"
          >
            {busy ? 'Joining…' : 'Subscribe'}
          </button>
        </form>
      )}
      {!ok && error && (
        <div className="mx-auto mt-3 max-w-md text-center text-xs text-red-600">
          {error}
        </div>
      )}
      {!ok && (
        <details className="mx-auto mt-4 max-w-md">
          <summary className="cursor-pointer text-center text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-navy">
            + Add your name (optional)
          </summary>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name"
            className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-navy outline-none placeholder:text-slate-300 focus:border-navy"
          />
        </details>
      )}
    </div>
  );
}
