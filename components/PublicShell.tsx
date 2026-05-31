// components/PublicShell.tsx
//
// Shared header + footer wrapper for the static public trust pages
// (/help, /shipping, /returns, /contact). The market/product/category
// pages keep their own bespoke chrome — this is just for the simple
// content pages so they stay consistent.

import Link from 'next/link';
import SiteFooter from './SiteFooter';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

export default function PublicShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-3 px-3 sm:h-16 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <img
              src="/brand/bsc-marketplace-logo.png"
              alt="BSC Marketplace"
              className="h-10 w-10 rounded-lg bg-white p-1 object-contain shadow ring-1 ring-gold/40"
            />
            <div className="hidden text-white sm:block">
              <div className="text-sm font-extrabold tracking-wide text-gold">BSC Marketplace</div>
              <div className="text-[10px] text-slate-300">Nassau · Bahamas 🇧🇸</div>
            </div>
          </Link>
          <nav className="ml-auto flex items-center gap-2">
            <Link href="/market" className="rounded-lg bg-gold px-3 py-2 text-xs font-bold text-navy hover:bg-gold-300">
              Shop
            </Link>
            <Link href="/help" className="hidden rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20 sm:block">
              Help
            </Link>
            <Link href="/contact" className="hidden rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20 sm:block">
              Contact
            </Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-screen-md px-4 py-8 sm:px-6 sm:py-10">
          {eyebrow && (
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-gold-600">
              {eyebrow}
            </div>
          )}
          <h1 className="font-display text-3xl font-black leading-tight text-navy sm:text-4xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm text-slate-600 sm:text-base">{subtitle}</p>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-screen-md px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
