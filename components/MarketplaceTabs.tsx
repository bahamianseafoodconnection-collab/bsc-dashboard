'use client';

// components/MarketplaceTabs.tsx
//
// Three large hero cards displayed at the top of every customer-facing
// marketplace page (and /utilities) per founder direction 2026-05-26.
// Single navigation strip — customer always sees all three options and
// can hop between them with one tap.
//
//   📍 Direct from Bahamian Local Fishermen  → /market?source=fisherman
//   📍 Direct from Bahamian Local Farmers     → /market?source=farmer
//   📍 Pay your Utility Bills                  → /utilities
//
// Maps directly to the platform vision (project_platform_vision memory):
// fishermen + farmers marketplace + utility-bill-pay expansion.
//
// Amazon-style: clean, professional, branded gradients, ring highlight
// for the active option. Mobile: stacks vertically. Desktop: 3-column
// grid. Always full-width, always above the per-page header.

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

type TabKey = 'fishermen' | 'farmers' | 'bills';

interface TabSpec {
  key:        TabKey;
  label:      string;
  sub:        string;
  icon:       string;
  href:       string;
  /** Hero photo — drop into /public/images/marketplace/. Gradient
   *  fallback shows until the file lands. */
  photo:      string;
  /** Gradient overlay endpoints + fallback background color so card
   *  always renders cleanly with or without the photo. */
  bgFrom:     string;
  bgTo:       string;
}

const TABS: ReadonlyArray<TabSpec> = [
  {
    key:    'fishermen',
    label:  'Direct from Bahamian Local Fishermen',
    sub:    'Fresh catch · ship to your door',
    icon:   '🎣',
    href:   '/market?source=fisherman',
    photo:  '/images/marketplace/fisherman.jpg',
    bgFrom: '#0b3d5c',
    bgTo:   '#062338',
  },
  {
    key:    'farmers',
    label:  'Direct from Bahamian Local Farmers',
    sub:    'Locally grown · field to table',
    icon:   '🌱',
    href:   '/market?source=farmer',
    photo:  '/images/marketplace/farmer.jpg',
    bgFrom: '#1f6644',
    bgTo:   '#0f3a25',
  },
  {
    key:    'bills',
    label:  'Pay your Utility Bills',
    sub:    'BPL · Water · Cable · Internet',
    icon:   '💡',
    href:   '/utilities',
    photo:  '/images/marketplace/utility-bills.jpg',
    bgFrom: '#b48a16',
    bgTo:   '#7d5d10',
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
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-screen-2xl px-3 py-3 sm:px-6 sm:py-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
          {TABS.map((tab) => {
            const active = isActive(tab);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-label={tab.label}
                className={`group relative block overflow-hidden rounded-xl px-4 py-4 text-white shadow-md transition hover:shadow-xl hover:-translate-y-0.5 sm:py-5 ${
                  active
                    ? 'ring-2 ring-gold ring-offset-2 ring-offset-white'
                    : 'opacity-95 hover:opacity-100'
                }`}
                style={{
                  // Hero photo + dark gradient overlay so text stays
                  // readable. Fallback gradient renders if the photo
                  // file isn't present yet — page never breaks.
                  backgroundColor: tab.bgFrom,
                  backgroundImage:
                    `linear-gradient(135deg, ${tab.bgFrom}CC 0%, ${tab.bgTo}DD 100%), ` +
                    `url('${tab.photo}')`,
                  backgroundSize:     'cover',
                  backgroundPosition: 'center',
                }}
              >
                {/* Decorative orb in background — purely visual */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/5"
                />
                <div className="relative flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
                  <span className="text-3xl shrink-0 sm:text-4xl">{tab.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold leading-tight sm:text-base">{tab.label}</p>
                    <p className="mt-0.5 text-xs text-white/75 sm:text-[13px]">{tab.sub}</p>
                  </div>
                  {active && (
                    <span className="ml-auto rounded-full bg-gold px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-navy shadow-sm sm:ml-0 sm:mt-1">
                      Active
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
