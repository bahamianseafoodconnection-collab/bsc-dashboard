'use client';

// components/MarketPromoBanners.tsx
//
// Two-tile promo strip displayed near the bottom of /market — founder
// design 2026-05-27. Drives traffic into the two core categories with
// premium food photography + bold gold CTAs:
//
//   ⬛ FRESH SEAFOOD DELIVERED DAILY    →  /market?category=Seafood
//   ⬛ PREMIUM MEATS CUT FRESH           →  /market?category=Meat
//
// Photos drop into /public/images/marketplace/promo-seafood.jpg and
// promo-meats.jpg. Until then, navy/gradient backdrops render cleanly
// with the headlines + CTAs.

import Link from 'next/link';

interface Promo {
  eyebrow:    string;
  headline:   string;
  sub:        string;
  cta:        string;
  href:       string;
  imageUrl:   string;
  fallbackBg: string;
}

const PROMOS: ReadonlyArray<Promo> = [
  {
    eyebrow:    '',
    headline:   'FRESH SEAFOOD DELIVERED DAILY',
    sub:        'From our waters to your table.',
    cta:        'Shop Seafood',
    href:       '/market?category=Seafood',
    imageUrl:   '/images/marketplace/promo-seafood.jpg',
    fallbackBg: 'linear-gradient(135deg, #0b3d5c 0%, #062338 100%)',
  },
  {
    eyebrow:    '',
    headline:   'PREMIUM MEATS CUT FRESH',
    sub:        'Quality you can taste.',
    cta:        'Shop Meats',
    href:       '/market?category=Meat',
    imageUrl:   '/images/marketplace/promo-meats.jpg',
    fallbackBg: 'linear-gradient(135deg, #5a1a1a 0%, #2d0a0a 100%)',
  },
];

export default function MarketPromoBanners() {
  return (
    <section className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-screen-xl px-3 py-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {PROMOS.map((p) => (
            <Link
              key={p.headline}
              href={p.href}
              className="group relative block overflow-hidden rounded-2xl shadow-md transition hover:-translate-y-0.5 hover:shadow-xl"
              style={{ minHeight: 180 }}
            >
              {/* Backdrop image with dark gradient overlay for text contrast */}
              <div
                className="absolute inset-0 bg-cover bg-center transition group-hover:scale-105"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.30) 60%, rgba(0,0,0,0.15) 100%), " +
                    `url('${p.imageUrl}')`,
                  backgroundColor: 'transparent',
                  background: p.fallbackBg,
                }}
              />
              {/* Photo overlay (above gradient fallback) */}
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.30) 60%, rgba(0,0,0,0.15) 100%), " +
                    `url('${p.imageUrl}')`,
                }}
              />

              {/* Content */}
              <div className="relative flex h-full flex-col justify-between p-5 text-white sm:p-7">
                <div>
                  <h3 className="font-display text-lg font-extrabold leading-tight sm:text-xl md:text-2xl">
                    {p.headline}
                  </h3>
                  <p className="mt-1 text-xs text-white/85 sm:text-sm">
                    {p.sub}
                  </p>
                </div>
                <span className="mt-4 inline-flex w-fit rounded-md bg-gold px-4 py-2 text-xs font-extrabold text-navy shadow-sm transition group-hover:bg-gold-300 sm:text-sm">
                  {p.cta}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
