'use client';

// /become-a-supplier?type=fisherman|farmer
//
// Recruitment landing for local fishermen + farmers. The marketplace's
// fisherman/farmer cards link here so visitors who tap them get a clear
// pitch + a signup form. Applications POST to /api/suppliers/apply, which
// creates a pending suppliers row + emails the founder for follow-up. Once
// approved + listed, the supplier's products can be sold in the Bulk Deals
// channel of the online market.

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

type Kind = 'fisherman' | 'farmer';

const COPY: Record<Kind, {
  emoji: string;
  hero:  string;
  pitch: string;
  bizLabel: string;
  bizPlaceholder: string;
  offeringLabel: string;
  offeringPlaceholder: string;
  volumePlaceholder: string;
  bgFrom: string;
  bgTo:   string;
}> = {
  fisherman: {
    emoji: '🎣',
    hero:  'Sell your daily catch on BSC Marketplace',
    pitch: 'Bahamian captains: list your full daily catch as Bulk Deals on the online market. Bahamians + restaurants order whole lots straight from you — fast online sales, cold-chain support at Spiny Tail, paid out cleanly.',
    bizLabel: 'Vessel name',
    bizPlaceholder: 'e.g. Lady Gloria',
    offeringLabel: 'What do you catch?',
    offeringPlaceholder: 'Lobster, snapper, conch, grouper…',
    volumePlaceholder: 'e.g. 150–250 lb / week',
    bgFrom: '#0b3d5c',
    bgTo:   '#062338',
  },
  farmer: {
    emoji: '🌱',
    hero:  'Sell your harvest on BSC Marketplace',
    pitch: 'Bahamian farmers: list your full weekly harvest as Bulk Deals on the online market. Locally grown, field to table — homes + restaurants buy whole lots direct from you.',
    bizLabel: 'Farm name',
    bizPlaceholder: 'e.g. Sunrise Family Farm',
    offeringLabel: 'What do you grow?',
    offeringPlaceholder: 'Cassava, tomatoes, peppers, herbs…',
    volumePlaceholder: 'e.g. 80–120 lb / week',
    bgFrom: '#1f6644',
    bgTo:   '#0f3a25',
  },
};

const ISLANDS = ['Nassau / New Providence', 'Andros', 'Eleuthera', 'Exuma', 'Abaco', 'Grand Bahama', 'Long Island', 'Cat Island', 'Other'];

export default function BecomeASupplierPage() {
  return (
    <Suspense fallback={<Shell><p className="text-white/80">Loading…</p></Shell>}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const raw    = (params?.get('type') ?? '').toLowerCase();
  const kind: Kind = raw === 'farmer' ? 'farmer' : 'fisherman';
  const c = COPY[kind];

  const [name, setName]                  = useState('');
  const [phone, setPhone]                = useState('');
  const [email, setEmail]                = useState('');
  const [island, setIsland]              = useState(ISLANDS[0]);
  const [businessName, setBusinessName]  = useState('');
  const [offering, setOffering]          = useState('');
  const [volume, setVolume]              = useState('');
  const [notes, setNotes]                = useState('');
  const [busy, setBusy]                  = useState(false);
  const [err, setErr]                    = useState<string | null>(null);
  const [done, setDone]                  = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim())  { setErr('Your name is required.');         return; }
    if (!phone.trim()) { setErr('A WhatsApp phone is required.');  return; }
    setBusy(true);
    try {
      const res = await fetch('/api/suppliers/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:          kind,
          name:          name.trim(),
          phone:         phone.trim(),
          email:         email.trim(),
          island,
          business_name: businessName.trim(),
          offering:      offering.trim(),
          volume:        volume.trim(),
          notes:         notes.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setDone(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not submit. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/15 ring-4 ring-emerald-400/40">
          <span className="text-5xl">✓</span>
        </div>
        <h1 className="font-display text-3xl font-black text-emerald-400">You&apos;re on the list!</h1>
        <p className="mt-3 text-white/85">
          Thank you, {name.split(' ')[0]}. Our team will reach out on <strong>WhatsApp</strong> shortly to get you onboarded as a BSC {kind}.
        </p>
        <div className="mt-7 space-y-3">
          <Link href="/market" className="block w-full rounded-xl bg-gold px-5 py-3.5 text-sm font-black text-navy hover:bg-gold-300">
            Back to the marketplace →
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Become a BSC supplier</div>
      <h1 className="mt-1 flex items-center gap-3 font-display text-3xl font-black sm:text-4xl">
        <span>{c.emoji}</span> {c.hero}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-white/85">{c.pitch}</p>

      {/* Toggle */}
      <div className="mt-5 inline-flex rounded-xl border border-white/15 bg-white/5 p-1 text-xs font-extrabold">
        <Link href="/become-a-supplier?type=fisherman"
          className={`rounded-lg px-3 py-1.5 transition ${kind === 'fisherman' ? 'bg-gold text-navy' : 'text-white/80 hover:text-white'}`}>
          🎣 Fisherman
        </Link>
        <Link href="/become-a-supplier?type=farmer"
          className={`rounded-lg px-3 py-1.5 transition ${kind === 'farmer' ? 'bg-gold text-navy' : 'text-white/80 hover:text-white'}`}>
          🌱 Farmer
        </Link>
      </div>

      <form onSubmit={submit} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Your name *">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith" className={INPUT} required />
        </Field>
        <Field label="WhatsApp phone *">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="+1 (242) 000-0000" className={INPUT} required />
        </Field>
        <Field label="Email (optional)">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" className={INPUT} />
        </Field>
        <Field label="Island">
          <select value={island} onChange={(e) => setIsland(e.target.value)} className={`${INPUT} appearance-none`}>
            {ISLANDS.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label={c.bizLabel}>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder={c.bizPlaceholder} className={INPUT} />
        </Field>
        <Field label="Typical weekly volume">
          <input value={volume} onChange={(e) => setVolume(e.target.value)} placeholder={c.volumePlaceholder} className={INPUT} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={c.offeringLabel}>
            <input value={offering} onChange={(e) => setOffering(e.target.value)} placeholder={c.offeringPlaceholder} className={INPUT} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Anything else we should know?">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Cold storage, vehicle, days you fish/harvest, prior wholesale buyers, etc." className={`${INPUT} font-sans`} />
          </Field>
        </div>

        {err && (
          <div className="rounded-lg border border-red-300 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200 sm:col-span-2">
            ⚠️ {err}
          </div>
        )}

        <div className="sm:col-span-2">
          <button type="submit" disabled={busy}
            className="w-full rounded-xl bg-gold px-5 py-3.5 text-sm font-black text-navy transition hover:bg-gold-300 disabled:opacity-60">
            {busy ? 'Sending…' : `Apply to become a BSC ${kind}`}
          </button>
          <p className="mt-3 text-center text-[11px] text-white/55">
            By applying you agree to a quick onboarding call. We reach back on WhatsApp.
          </p>
        </div>
      </form>
    </Shell>
  );
}

const INPUT =
  'w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-gold focus:bg-white/[0.10]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-white/55">{label}</span>
      {children}
    </label>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-navy px-4 py-10 text-white sm:py-16">
      <div className={`mx-auto w-full ${wide ? 'max-w-xl' : 'max-w-sm text-center'}`}>
        <div className="rounded-3xl bg-white/[0.04] p-6 shadow-[0_8px_40px_rgba(0,0,0,0.4)] ring-1 ring-white/10 sm:p-8">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-white/40">Bahamian Seafood Connection · bscbahamas.com</p>
      </div>
    </div>
  );
}
