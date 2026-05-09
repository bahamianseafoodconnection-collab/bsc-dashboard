'use client';

// Public-facing hero. Tailwind-based, mobile-first.
// Keeps the slow zoom + staggered fade-in vibe of the prior version.

import { useEffect, useState } from 'react';
import Link from 'next/link';

const HERO_IMG =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images/94C94225-7A21-4E0F-BA00-79CA6E108385.jpg';

const STATS = [
  { n: '9,310+', l: 'lbs in cold storage' },
  { n: '7',      l: 'Nassau wholesalers' },
  { n: '5',      l: 'Florida stores' },
  { n: '2',      l: 'Islands served' },
];

export default function HeroSection() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="relative flex min-h-[640px] w-full items-center overflow-hidden h-[100svh] max-h-[980px]">
      {/* Background photo with slow zoom-in */}
      <div
        className={`absolute inset-0 bg-cover bg-[center_40%] transition-transform duration-[8000ms] ease-out will-change-transform ${
          loaded ? 'scale-100' : 'scale-[1.06]'
        }`}
        style={{ backgroundImage: `url('${HERO_IMG}')` }}
        aria-hidden
      />
      {/* Layered overlays for legibility on the navy/gold palette */}
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          background:
            'linear-gradient(108deg, rgba(5,12,24,.95) 0%, rgba(10,21,42,.84) 40%, rgba(15,33,55,.5) 65%, rgba(0,0,0,.15) 100%)',
        }}
      />
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          background:
            'linear-gradient(to top, rgba(5,12,24,.92) 0%, rgba(5,12,24,.3) 28%, transparent 58%)',
        }}
      />
      {/* Gold accent stripe down the left edge */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1 opacity-60"
        aria-hidden
        style={{
          background:
            'linear-gradient(to bottom, transparent, #d4a843 18%, #f4c842 50%, #d4a843 82%, transparent)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-[6%] pt-24 sm:pt-28">
        <FadeIn loaded={loaded} delay="delay-[100ms]">
          <div className="mb-5 inline-flex items-center gap-2.5">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
              Nassau · Commonwealth of the Bahamas 🇧🇸
            </span>
          </div>
        </FadeIn>

        <FadeIn loaded={loaded} delay="delay-[250ms]" amount="lg">
          <h1 className="font-display text-5xl font-black leading-[1.0] text-white sm:text-6xl md:text-7xl lg:text-[98px]">
            Fresh From
            <br />
            Our Waters
            <br />
            <span
              className="block bg-clip-text italic text-transparent"
              style={{
                backgroundImage:
                  'linear-gradient(130deg,#f4c842 0%,#d4a015 40%,#f0b429 72%,#c8860f 100%)',
              }}
            >
              To Your Door.
            </span>
          </h1>
        </FadeIn>

        <FadeIn loaded={loaded} delay="delay-[420ms]">
          <div className="mt-6 mb-6 flex items-center gap-3.5">
            <span className="h-px w-12 bg-gradient-to-r from-gold to-transparent" />
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-gold/75">
              Seafood · Meat · Wholesale · Services
            </span>
          </div>
        </FadeIn>

        <FadeIn loaded={loaded} delay="delay-[520ms]">
          <p className="mb-9 max-w-md text-sm font-light leading-relaxed text-slate-200/75 sm:text-base lg:text-lg">
            Nassau&rsquo;s premier marketplace for premium seafood, fresh meats, and Bahamian
            wholesale — delivered to your door, sourced with pride.
          </p>
        </FadeIn>

        <FadeIn loaded={loaded} delay="delay-[620ms]">
          <div className="mb-12 flex flex-wrap gap-3">
            <Link
              href="/market"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded px-8 py-3.5 text-xs font-bold uppercase tracking-[0.08em] text-navy shadow-[0_6px_32px_rgba(212,160,21,.42)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_42px_rgba(212,160,21,.55)] sm:text-sm"
              style={{ background: 'linear-gradient(130deg,#f4c842 0%,#c8860f 100%)' }}
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
              <span className="relative">Shop Now →</span>
            </Link>
            <Link
              href="/local-wholesale"
              className="inline-flex items-center gap-2 rounded border border-white/20 bg-white/5 px-6 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-white/85 backdrop-blur transition hover:border-gold/60 hover:bg-white/10 hover:text-gold sm:text-sm"
            >
              🇧🇸 Wholesale
            </Link>
            <Link
              href="/us-shopping"
              className="inline-flex items-center gap-2 rounded border border-white/20 bg-white/5 px-6 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-white/85 backdrop-blur transition hover:border-gold/60 hover:bg-white/10 hover:text-gold sm:text-sm"
            >
              🇺🇸 Shop USA
            </Link>
          </div>
        </FadeIn>

        <FadeIn loaded={loaded} delay="delay-[780ms]">
          <div className="flex flex-wrap items-stretch gap-6 sm:gap-0">
            {STATS.map((s, i) => (
              <div
                key={s.l}
                className={`min-w-20 sm:pr-7 ${i < STATS.length - 1 ? 'sm:mr-7 sm:border-r sm:border-white/10' : ''}`}
              >
                <div className="font-display text-xl font-bold leading-none text-gold sm:text-2xl">
                  {s.n}
                </div>
                <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>

      {/* Scroll indicator */}
      <button
        type="button"
        onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
        className="absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-1.5 opacity-0 animate-[fadeIn_.6s_ease_1.3s_forwards] md:flex"
        aria-label="Scroll to content"
      >
        <div className="flex h-9 w-6 justify-center rounded-xl border-2 border-white/30 pt-1.5">
          <div
            className="h-1.5 w-1 rounded-sm bg-gold"
            style={{ animation: 'bsc-bounce 1.9s ease-in-out infinite' }}
          />
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/30">
          Scroll
        </span>
      </button>

      {/* Local keyframes (scoped via style tag, very small) */}
      <style>{`
        @keyframes bsc-bounce {
          0%,100% { transform: translateY(0); opacity: 1; }
          50%     { transform: translateY(8px); opacity: .35; }
        }
        @keyframes fadeIn {
          to { opacity: 1; }
        }
      `}</style>
    </section>
  );
}

function FadeIn({
  loaded,
  delay,
  amount = 'sm',
  children,
}: {
  loaded: boolean;
  delay: string;
  amount?: 'sm' | 'lg';
  children: React.ReactNode;
}) {
  // Translate amount controls how far the element rises while fading in.
  const translateOff = amount === 'lg' ? 'translate-y-7' : 'translate-y-4';
  return (
    <div
      className={`transition-all duration-[700ms] ease-out ${delay} ${
        loaded ? 'translate-y-0 opacity-100' : `${translateOff} opacity-0`
      }`}
    >
      {children}
    </div>
  );
}
