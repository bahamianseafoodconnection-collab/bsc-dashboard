'use client';

// Public-facing footer. Tailwind-based, brand tokens, mobile-first.

import Link from 'next/link';
import NewsletterSignup from './NewsletterSignup';

const LOGO =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images/A0EF44D5-D0F6-4D15-9826-4FED851A2719.png';

const LINKS = {
  shop: [
    { label: 'Online Market',     href: '/market' },
    { label: 'Local Wholesale',   href: '/local-wholesale' },
    { label: 'Shop USA',          href: '/us-shopping' },
    { label: 'My Account',        href: '/account' },
    { label: 'My Orders',         href: '/my-orders' },
    { label: 'Wishlist',          href: '/wishlist' },
  ],
  help: [
    { label: 'Help & FAQ',        href: '/help' },
    { label: 'Shipping & Delivery', href: '/shipping' },
    { label: 'Returns & Refunds', href: '/returns' },
    { label: 'Contact Us',        href: '/contact' },
  ],
  company: [
    { label: 'Our Story',         href: '/#why-bsc' },
    { label: 'Supplier Portal',   href: '/supplier' },
    { label: 'Pay Utility Bills', href: '/utilities' },
    { label: 'Login / Sign Up',   href: '/login' },
  ],
};

const TRUST = [
  { icon: '❄️',  title: 'Fresh Daily',     sub: 'Sourced and delivered fresh' },
  { icon: '🔒',  title: 'Secure Payments', sub: 'RBC Plug & Pay encrypted' },
  { icon: '🚚',  title: 'Nassau & Andros', sub: 'Family Island delivery' },
  { icon: '🇧🇸', title: 'Proudly Bahamian', sub: 'Owned by the Storr family' },
];

export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden bg-navy-900">
      {/* Top gold gleam */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-60"
        aria-hidden
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, #c8a84b 25%, #f4c842 50%, #c8a84b 75%, transparent 100%)',
        }}
      />
      {/* Soft top fade */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-44"
        aria-hidden
        style={{ background: 'linear-gradient(to bottom, rgba(6,14,28,.85), transparent)' }}
      />

      {/* Main footer columns */}
      <div className="relative z-10 mx-auto grid max-w-[1280px] grid-cols-1 gap-8 px-[5%] py-12 sm:grid-cols-2 sm:gap-9 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-12 lg:py-16">
        {/* Brand column */}
        <div className="flex flex-col">
          <div className="mb-5 inline-flex items-center gap-3.5 self-start rounded-2xl border border-gold/25 bg-[#fafaf6] p-3.5 pr-5 shadow-[0_4px_20px_rgba(212,168,67,.18)]">
            <img src={LOGO} alt="BSC Marketplace" className="h-16 w-16 object-contain" />
            <div className="flex flex-col">
              <span className="font-display text-sm font-bold leading-tight text-navy-900">
                Bahamian Seafood
                <br />
                Connection
              </span>
              <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                Marketplace
              </span>
            </div>
          </div>

          <p className="mb-6 max-w-xs text-sm font-light leading-relaxed text-white/45">
            Nassau&rsquo;s premier marketplace for premium seafood, fresh meats, and Bahamian
            wholesale. Proudly family-owned.
          </p>

          <div className="flex flex-col gap-2">
            <FooterLink href="tel:+12425584495">📞 +1 (242) 558-4495</FooterLink>
            <FooterLink href="https://wa.me/12423613474">
              💬 WhatsApp: +1 (242) 361-3474
            </FooterLink>
            <FooterLink href="mailto:Bahamiansc@iCloud.com">
              ✉️ Bahamiansc@iCloud.com
            </FooterLink>
            <FooterLink href="https://bscbahamas.com" external>
              🌐 bscbahamas.com
            </FooterLink>
          </div>

          <div className="mt-6 max-w-xs">
            <NewsletterSignup
              variant="inline"
              source="footer"
              subheading="Drops, deals, and family-island dispatch updates."
            />
          </div>
        </div>

        <FooterColumn title="Shop" links={LINKS.shop} />
        <FooterColumn title="Help" links={LINKS.help} />
        <FooterColumn title="Company" links={LINKS.company} />
      </div>

      {/* Trust strip */}
      <div className="relative z-10 mx-auto flex max-w-[1280px] flex-wrap justify-center gap-6 border-t border-white/[0.04] px-[5%] py-7 sm:gap-10">
        {TRUST.map((t) => (
          <div key={t.title} className="flex items-center gap-2.5">
            <span className="text-lg">{t.icon}</span>
            <div>
              <div className="text-xs font-semibold text-white/60">{t.title}</div>
              <div className="text-[10px] text-white/30">{t.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="relative z-10 border-t border-gold/10">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-5 px-[5%] py-5 text-center sm:text-left">
          <span className="text-[11px] tracking-wide text-white/25">
            © {year} BSC Marketplace · Dedrick Tamico Storr Snr &amp; Jaquel Rolle-Storr &amp;
            Family · Nassau, Bahamas
          </span>
          <div className="flex gap-2">
            {['RBC Secured', 'VAT Registered', 'COD Available'].map((b) => (
              <span
                key={b}
                className="rounded border border-gold/20 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-gold/50"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <div className="mb-4 border-b border-gold/20 pb-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
        {title}
      </div>
      <div className="flex flex-col gap-2.5">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="group flex items-center gap-1.5 text-sm font-normal text-white/50 transition hover:translate-x-1 hover:text-amber-100"
          >
            <span className="h-px w-0 bg-gold transition-all duration-200 group-hover:w-3" />
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function FooterLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex items-center gap-2 text-xs text-white/50 transition hover:text-gold"
    >
      {children}
    </a>
  );
}
