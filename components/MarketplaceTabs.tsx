'use client';

// components/MarketplaceTabs.tsx
//
// Three large hero cards displayed at the top of every customer-facing
// marketplace page (and /utilities). Single navigation strip — customer
// always sees all three options and can hop between them with one tap.
//
//   📍 Direct from Bahamian Local Fishermen  → /market?source=fisherman
//   📍 Direct from Bahamian Local Farmers     → /market?source=farmer
//   📍 Pay your Utility Bills                  → /utilities
//
// Maps directly to the platform vision (project_platform_vision memory):
// fishermen + farmers marketplace + utility-bill-pay expansion.
//
// Design: photo fills the card unobscured; a soft gradient sits ONLY behind
// the bottom-aligned wording (legibility without dulling the picture). No
// divider lines, no decorative orbs — clean, finished look.

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

type TabKey = 'fishermen' | 'farmers' | 'bills';

interface TabSpec {
  key:    TabKey;
  label:  string;
  sub:    string;
  href:   string;
  /** Hero photo — lives under /public/images/marketplace/. */
  photo:  string;
  /** Background color shown until the photo loads (and as a fallback). */
  bgColor: string;
  /** CSS object-position for the photo crop. */
  photoPosition?: string;
}

const TABS: ReadonlyArray<TabSpec> = [
  {
    key:    'fishermen',
    label:  'Direct from Bahamian Local Fishermen',
    sub:    'Fresh catch · ship to your door',
    href:   '/market?source=fisherman',
    photo:  '/images/marketplace/fisherman.jpg',
    bgColor: '#0b3d5c',
  },
  {
    key:    'farmers',
    label:  'Direct from Bahamian Local Farmers',
    sub:    'Locally grown · field to table',
    href:   '/market?source=farmer',
    photo:  '/images/marketplace/farmer.jpg',
    bgColor: '#1f6644',
  },
  {
    key:    'bills',
    label:  'Pay your Utility Bills',
    sub:    'BPL · Water · Cable · Internet',
    href:   '/utilities',
    photo:  '/images/marketplace/pay-utility-bills.png',
    bgColor: '#1d4ed8',
    // Top-crop so the BSC brand + headline read cleanly inside the tab frame.
    photoPosition: 'top center',
  },
];

export default function MarketplaceTabs() {
  const pathname     = usePathname() ?? '';
  const searchParams = useSearchParams();
  const source       = (searchParams?.get('source') ?? '').toLowerCase();

  function isActive(tab: TabSpec): boolean {
    if (tab.key === 'bills')     return pathname.startsWith('/utilities');
    if (tab.key === 'fishermen') return pathname.startsWith('/market') && source === 'fisherman';
    if (tab.key === 'farmers')   return pathname.startsWith('/market') && source === 'farmer';
    return false;
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-screen-2xl px-3 py-3 sm:px-6 sm:py-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {TABS.map((tab) => {
            const active = isActive(tab);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-label={tab.label}
                className={`group relative block overflow-hidden rounded-2xl shadow-md transition hover:shadow-xl hover:-translate-y-0.5 ${
                  active ? 'ring-2 ring-gold ring-offset-2 ring-offset-white' : ''
                }`}
                style={{ backgroundColor: tab.bgColor, aspectRatio: '16 / 9' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tab.photo}
                  alt=""
                  loading="lazy"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: tab.photoPosition ?? 'center',
                  }}
                />
                {/* Soft gradient ONLY behind the bottom text — photo stays clear */}
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%]"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0) 100%)' }}
                  aria-hidden
                />

                {active && (
                  <span className="absolute right-3 top-3 rounded-full bg-gold px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-navy shadow-sm">
                    Active
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 text-white">
                  <p
                    className="font-display text-base font-extrabold leading-tight sm:text-lg"
                    style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}
                  >
                    {tab.label}
                  </p>
                  <p
                    className="mt-1 text-xs font-medium text-white/85 sm:text-[13px]"
                    style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
                  >
                    {tab.sub}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
