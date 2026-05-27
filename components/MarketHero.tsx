'use client';

// components/MarketHero.tsx
//
// Premium hero banner for /market — founder direction 2026-05-27.
// Full-bleed food photography backdrop + welcome headline + dual CTAs
// (Create Account / Sign In) + 4-column trust bar.
//
// Photo: drops into /public/images/marketplace/hero.jpg — the founder
// supplies the real photo. Until it's there, a navy/gradient backdrop
// renders cleanly so the page is never broken.
//
// Auth-aware: if the customer is already signed in, the CTAs flip to
// "Browse seafood" / "Browse meats" so logged-in customers aren't asked
// to sign up again. Reads via supabase.auth.getSession() at mount.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const TRUST_BAR = [
  { icon: '🍤', title: 'Fresh & Quality',    sub: 'Premium seafood & meats' },
  { icon: '🛡',  title: 'Secure Payments',    sub: 'Your payments are safe' },
  { icon: '🚚', title: 'Fast Delivery',       sub: 'Nassau & Family Islands' },
  { icon: '🇧🇸', title: 'Trusted by Locals',  sub: 'Committed to our community' },
];

export default function MarketHero() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setSignedIn(!!session);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="relative overflow-hidden border-b border-slate-200">
      {/* Backdrop — real hero photo if dropped at /public/images/marketplace/hero.jpg,
          otherwise a deep-navy gradient that holds the design until the photo lands. */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(15,31,61,0.78) 0%, rgba(6,13,31,0.85) 100%), " +
            "url('/images/marketplace/hero.jpg')",
          backgroundColor: '#0b1628',
        }}
      />

      {/* Foreground — welcome copy + CTAs */}
      <div className="relative mx-auto max-w-screen-xl px-4 py-12 sm:py-16 md:py-20">
        <div className="mx-auto max-w-2xl text-center text-white">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/75 sm:text-sm">
            Welcome to
          </p>
          <h1 className="font-display text-4xl font-extrabold leading-tight sm:text-5xl md:text-6xl">
            BSC Marketplace
          </h1>
          <p className="mt-4 text-base font-bold text-gold sm:text-lg md:text-xl">
            Seafood. Meats. Essentials. Services.
          </p>
          <p className="mt-2 text-sm text-white/75 sm:text-base">
            Everything you need. All in one place.
          </p>

          {/* CTAs — flip to "browse" when already signed in */}
          {signedIn === null ? null : signedIn ? (
            <div className="mt-7 flex flex-col gap-3 sm:mx-auto sm:max-w-md sm:flex-row sm:justify-center">
              <Link
                href="/market?category=Seafood"
                className="rounded-xl bg-gold px-6 py-3 text-base font-extrabold text-navy shadow-md transition hover:bg-gold-300 sm:px-8"
              >
                Browse Seafood
              </Link>
              <Link
                href="/market?category=Meat"
                className="rounded-xl border-2 border-gold/70 px-6 py-3 text-base font-extrabold text-gold transition hover:bg-gold/10 sm:px-8"
              >
                Browse Meats
              </Link>
            </div>
          ) : (
            <div className="mt-7 flex flex-col gap-3 sm:mx-auto sm:max-w-md sm:flex-row sm:justify-center">
              <Link
                href="/login?mode=signup&next=/market"
                className="rounded-xl bg-gold px-6 py-3 text-base font-extrabold text-navy shadow-md transition hover:bg-gold-300 sm:px-8"
              >
                Create Account
              </Link>
              <Link
                href="/login?next=/market"
                className="rounded-xl border-2 border-gold/70 px-6 py-3 text-base font-extrabold text-gold transition hover:bg-gold/10 sm:px-8"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Trust bar — 4 columns, persistent. */}
      <div className="relative border-t border-white/10 bg-navy/95 backdrop-blur-sm">
        <div className="mx-auto max-w-screen-xl px-4 py-3 sm:py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-6">
            {TRUST_BAR.map((t) => (
              <div key={t.title} className="flex items-center gap-2 text-white sm:gap-3">
                <span className="shrink-0 text-xl sm:text-2xl">{t.icon}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold leading-tight sm:text-xs">{t.title}</p>
                  <p className="text-[10px] leading-tight text-white/65 sm:text-[11px]">{t.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
