// BSC Marketplace landing — bscbahamas.com
//
// Founder-approved design (2026-05-24). This is the public-facing home
// route. AppShell hides the bottom nav on '/' (see AppShell.tsx:173) so
// this page owns the full viewport.
//
// Photos: each image slot uses <PhotoSlot> which renders a branded
// placeholder showing the EXPECTED filename. Founder drops real photos
// into /public/images/homepage/{filename}.jpg — see README in that
// directory for the full checklist. Until photos arrive, the layout is
// fully usable with the placeholder tiles.

import Link from 'next/link';

const WHATSAPP_URL = 'https://wa.me/12423613474';
const CALL_TEL     = 'tel:+12423613474';
const PHONE_LABEL  = '+1 (242) 361-3474';

// Routes locked per founder D2/D5: "About Us" → /contact (until a
// dedicated About page exists), "Categories" → /market (filter UI lives
// there).
const ROUTES = {
  shop:        '/market',
  categories:  '/market',
  bscDirect:   '/market',
  about:       '/contact',
  contact:     '/contact',
  freshCatch:  '/shop/fresh-catch',
  farmFresh:   '/shop/farm-fresh',
  payBills:    '/utilities',
  sellOnBsc:   '/vendor/signup',
  wholesale:   '/market',
  legal:       '/legal',
  catSeafood:    '/market?category=Seafood',
  catMeat:       '/market?category=Meat',
  catProduce:    '/market?category=Produce',
  catBeverages:  '/market?category=Beverages',
};

const NAV = [
  { label: 'Shop',       href: ROUTES.shop },
  { label: 'Categories', href: ROUTES.categories },
  { label: 'BSC Direct', href: ROUTES.bscDirect },
  { label: 'About Us',   href: ROUTES.about },
  { label: 'Contact',    href: ROUTES.contact },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-navy-brand text-white font-sans antialiased">
      <SiteHeader />
      <main>
        <HeroSection />
        <BSCDirectCard />
        <ServiceCardsRow />
        <BrowseByCategory />
        <TrustBar />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ─── Header ──────────────────────────────────────────────────────── */

function SiteHeader() {
  return (
    <header className="relative z-20 border-b border-white/5 bg-navy-brand/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-12">
        {/* Left — brand */}
        <Link href="/" className="flex items-center gap-3" aria-label="BSC Marketplace home">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl shadow-[0_2px_10px_rgba(245,197,24,0.35)]"
            style={{ backgroundColor: '#F5C518', color: '#020B1C' }}
            aria-hidden="true"
          >
            🇧🇸
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-extrabold tracking-wide text-gold-brand">
              BSC Marketplace
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/45">
              Nassau · Bahamas
            </span>
          </span>
        </Link>

        {/* Center — desktop nav */}
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              className="text-sm font-semibold text-white/80 transition hover:text-gold-brand"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right — Shop Now CTA */}
        <Link
          href={ROUTES.shop}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider transition hover:-translate-y-px hover:shadow-[0_8px_28px_rgba(245,197,24,0.5)] sm:text-sm"
          style={{ backgroundColor: '#F5C518', color: '#020B1C' }}
        >
          <span aria-hidden="true">🛒</span>
          <span>Shop Now</span>
        </Link>
      </div>
    </header>
  );
}

/* ─── Hero ────────────────────────────────────────────────────────── */

function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Dark base + ocean texture overlay placeholder */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-navy-brand via-navy-card to-navy-brand"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 20% 30%, rgba(0,212,255,0.18), transparent 55%), radial-gradient(ellipse at 80% 70%, rgba(245,197,24,0.12), transparent 55%)',
        }}
      />

      <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:gap-12 lg:px-12 lg:py-24">
        {/* Text side */}
        <div className="flex flex-col justify-center">
          <span className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-gold-brand/40 bg-gold-brand/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-gold-brand">
            <span aria-hidden="true">🇧🇸</span>
            Fresh From Our Islands
          </span>

          <h1 className="font-sans text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            <span className="block text-white">Fresh. Local.</span>
            <span className="block text-gold-brand">Bahamian.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
            Premium seafood, meats, produce and essentials delivered across
            Nassau &amp; Andros.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href={ROUTES.shop}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-sm font-extrabold uppercase tracking-wider transition hover:-translate-y-0.5 hover:shadow-[0_14px_42px_rgba(245,197,24,0.55)]"
              style={{ backgroundColor: '#F5C518', color: '#020B1C' }}
            >
              Shop Now <span aria-hidden="true">→</span>
            </Link>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-7 py-4 text-sm font-extrabold uppercase tracking-wider text-white backdrop-blur transition hover:border-gold-brand/60 hover:bg-white/10 hover:text-gold-brand"
            >
              <span aria-hidden="true">💬</span>
              Order on WhatsApp
            </a>
          </div>
        </div>

        {/* Photo side */}
        <div className="relative">
          <PhotoSlot
            filename="hero-seafood-lobster-fish.jpg"
            alt="Fresh Bahamian seafood — lobster, fish, shrimp on ice"
            aspectClass="aspect-[4/5] sm:aspect-[4/3] lg:aspect-square"
            ring
          />
        </div>
      </div>
    </section>
  );
}

/* ─── BSC Direct Wholesale ────────────────────────────────────────── */

function BSCDirectCard() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="relative overflow-hidden rounded-3xl border border-gold-brand/35 bg-navy-card shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 0% 0%, rgba(245,197,24,0.18), transparent 55%)',
          }}
        />
        <div className="relative grid gap-8 p-7 sm:p-10 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:gap-10">
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
                style={{ backgroundColor: 'rgba(245,197,24,0.18)' }}
                aria-hidden="true"
              >
                🛒
              </span>
              <span className="rounded-full bg-gold-brand/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-gold-brand">
                Wholesale
              </span>
            </div>

            <h2 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl">
              BSC Direct Wholesale
            </h2>
            <p className="mt-3 text-base text-white/65 sm:text-lg">
              Wholesale pricing · Catalog ordering · Island delivery
            </p>

            <Link
              href={ROUTES.wholesale}
              className="mt-7 inline-flex w-fit items-center gap-2 rounded-2xl px-6 py-3.5 text-xs font-extrabold uppercase tracking-wider transition hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(245,197,24,0.45)] sm:text-sm"
              style={{ backgroundColor: '#F5C518', color: '#020B1C' }}
            >
              Shop Wholesale <span aria-hidden="true">→</span>
            </Link>
          </div>

          <PhotoSlot
            filename="bsc-direct-wholesale-boxes.jpg"
            alt="Stacked BSC wholesale boxes ready for island delivery"
            aspectClass="aspect-[4/3]"
          />
        </div>
      </div>
    </section>
  );
}

/* ─── Service Cards Row ───────────────────────────────────────────── */

const SERVICE_CARDS = [
  {
    href:     '/market',
    title:    'Shop BSC Online',
    blurb:    'Browse our full online marketplace',
    filename: 'shop-bsc-online-marketplace.jpg',
    alt:      'BSC online marketplace — Bahamian groceries delivered',
  },
  {
    href:     '/shop/fresh-catch',
    title:    'Fresh from Bahamian Fishermen',
    blurb:    'Premium catch straight from local boats',
    filename: 'fresh-catch-tuna.jpg',
    alt:      'Premium fresh fish on ice from Bahamian fishermen',
  },
  {
    href:     '/shop/farm-fresh',
    title:    'From our Bahamian Farmers Farm',
    blurb:    'Fresh produce grown across the islands',
    filename: 'farm-fresh-produce.jpg',
    alt:      'Bahamian farm produce — greens, tomatoes, peppers',
  },
  {
    href:     '/utilities',
    title:    'Pay your bills',
    blurb:    'Quick, secure bill payments',
    filename: 'pay-bills-lightning.jpg',
    alt:      'Lightning-fast bill payment',
  },
] as const;

function ServiceCardsRow() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICE_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group relative overflow-hidden rounded-3xl border border-white/8 bg-navy-card transition hover:-translate-y-1 hover:border-gold-brand/40 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
          >
            <PhotoSlot
              filename={card.filename}
              alt={card.alt}
              aspectClass="aspect-[4/3]"
              rounded={false}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-navy-brand via-navy-brand/70 to-transparent"
            />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <h3 className="text-xl font-black text-white transition group-hover:text-gold-brand">
                {card.title}
              </h3>
              <p className="mt-1 text-sm text-white/65">{card.blurb}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─── Browse By Category ──────────────────────────────────────────── */

const CATEGORY_TILES = [
  { label: 'Seafood',   href: '/market?category=Seafood',   icon: '🦞', filename: 'category-seafood-lobster.jpg', alt: 'Fresh lobster and seafood on ice' },
  { label: 'Meat',      href: '/market?category=Meat',      icon: '🥩', filename: 'category-meat-steak.jpg',      alt: 'Premium meat cuts' },
  { label: 'Produce',   href: '/market?category=Produce',   icon: '🥦', filename: 'category-produce-market.jpg',  alt: 'Colorful fresh produce' },
  { label: 'Beverages', href: '/market?category=Beverages', icon: '🥤', filename: 'category-beverages.jpg',       alt: 'Beverages — water, juice, soda' },
] as const;

function BrowseByCategory() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
      <div className="mb-7 text-center sm:text-left">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.3em] text-cyan-brand">
          Browse by Category
        </p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Shop Fresh. Shop Local.
        </h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CATEGORY_TILES.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="group relative aspect-[4/5] overflow-hidden rounded-3xl border border-white/8 bg-navy-card transition hover:-translate-y-1 hover:border-gold-brand/40 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
          >
            <PhotoSlot
              filename={tile.filename}
              alt={tile.alt}
              aspectClass="absolute inset-0"
              rounded={false}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-navy-brand via-navy-brand/45 to-transparent"
            />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl" aria-hidden="true">{tile.icon}</span>
                <span className="text-lg font-extrabold text-white transition group-hover:text-gold-brand">
                  {tile.label}
                </span>
              </div>
              <span className="text-xl text-white/60 transition group-hover:translate-x-1 group-hover:text-gold-brand" aria-hidden="true">
                →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─── Trust Bar ───────────────────────────────────────────────────── */

const TRUST_ITEMS = [
  { icon: '🇧🇸', title: 'Bahamian-owned',     blurb: 'Proudly supporting local communities and businesses.' },
  { icon: '❄️',  title: 'Cold-chain protected', blurb: 'Temperature-controlled from our docks to your door.' },
  { icon: '🚚',  title: 'Island-wide delivery', blurb: 'Fast, reliable delivery across Nassau & Andros.' },
  { icon: '💬',  title: 'WhatsApp support',     blurb: 'Chat with our team for quick orders and support.' },
] as const;

function TrustBar() {
  return (
    <section className="border-y border-white/5 bg-navy-card/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:px-12 lg:py-14">
        {TRUST_ITEMS.map((item) => (
          <div key={item.title} className="flex flex-col items-center text-center sm:items-start sm:text-left">
            <span className="text-3xl" aria-hidden="true">{item.icon}</span>
            <h3 className="mt-3 text-sm font-extrabold uppercase tracking-wider text-gold-brand">
              {item.title}
            </h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/55">
              {item.blurb}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Footer ──────────────────────────────────────────────────────── */

function SiteFooter() {
  return (
    <footer className="bg-navy-brand">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-3 lg:px-12 lg:py-12">
        {/* Brand */}
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl"
            style={{ backgroundColor: '#F5C518', color: '#020B1C' }}
            aria-hidden="true"
          >
            🇧🇸
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-extrabold text-gold-brand">BSC Marketplace</span>
            <span className="text-[11px] uppercase tracking-[0.2em] text-white/45">
              Nassau · Bahamas
            </span>
            <a href={CALL_TEL} className="mt-3 text-xs text-white/70 transition hover:text-gold-brand">
              📞 {PHONE_LABEL}
            </a>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/70 transition hover:text-gold-brand"
            >
              💬 WhatsApp {PHONE_LABEL}
            </a>
          </div>
        </div>

        {/* Links */}
        <nav className="flex flex-col gap-2 text-sm text-white/70" aria-label="Footer">
          <Link href={ROUTES.about}     className="transition hover:text-gold-brand">About Us</Link>
          <Link href={ROUTES.sellOnBsc} className="transition hover:text-gold-brand">Sell on BSC</Link>
          <Link href={ROUTES.legal}     className="transition hover:text-gold-brand">Privacy Policy</Link>
          <Link href={ROUTES.legal}     className="transition hover:text-gold-brand">Terms &amp; Conditions</Link>
          <Link href={ROUTES.contact}   className="transition hover:text-gold-brand">Contact Us</Link>
        </nav>

        {/* Social. TODO(founder): replace # with real Instagram + Facebook URLs when ready. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-end">
          <SocialLink href="#" label="Instagram" emoji="📷" />
          <SocialLink href="#" label="Facebook"  emoji="👍" />
          <SocialLink href={WHATSAPP_URL} label="WhatsApp" emoji="💬" external />
        </div>
      </div>

      <div className="border-t border-white/5">
        <p className="mx-auto max-w-7xl px-5 py-5 text-center text-[11px] text-white/35 sm:text-left sm:px-8 lg:px-12">
          © 2026 Bahamian Seafood Connection · Nassau, Bahamas
        </p>
      </div>
    </footer>
  );
}

function SocialLink({
  href, label, emoji, external = false,
}: { href: string; label: string; emoji: string; external?: boolean }) {
  const rel    = external ? 'noopener noreferrer' : undefined;
  const target = external ? '_blank' : undefined;
  return (
    <a
      href={href}
      aria-label={label}
      target={target}
      rel={rel}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base transition hover:border-gold-brand/60 hover:bg-white/10 hover:text-gold-brand"
    >
      <span aria-hidden="true">{emoji}</span>
    </a>
  );
}

/* ─── PhotoSlot — fail-soft photo placeholder ─────────────────────── */
//
// Each photo slot renders a branded box showing the EXPECTED filename so
// the founder knows exactly which image to drop where. The placeholder
// is intentionally rich (radial glow + giant category icon) so the
// landing reads premium even before photos arrive. When real photos
// land in /public/images/homepage/, swap the <PhotoSlot> for a
// <next/image> per the activation snippet in the manifest README.

// Pick a category-appropriate icon from the filename keyword. The
// giant icon sits at very low opacity behind the filename label —
// reads as ambient decoration, not a UI control.
function pickPlaceholderIcon(filename: string): string {
  const f = filename.toLowerCase();
  if (f.includes('hero') && f.includes('seafood')) return '🦞';
  if (f.includes('lobster')) return '🦞';
  if (f.includes('ocean'))   return '🌊';
  if (f.includes('wholesale') || f.includes('boxes')) return '📦';
  if (f.includes('shop-bsc-online') || f.includes('marketplace')) return '🛒';
  if (f.includes('tuna') || f.includes('catch') || f.includes('fish')) return '🐟';
  if (f.includes('farm') || f.includes('produce')) return '🌱';
  if (f.includes('pay-bills') || f.includes('lightning')) return '⚡';
  if (f.includes('handshake') || f.includes('sell-on-bsc')) return '🤝';
  if (f.includes('meat') || f.includes('steak')) return '🥩';
  if (f.includes('produce-market')) return '🥦';
  if (f.includes('beverages')) return '🥤';
  if (f.includes('flag')) return '🇧🇸';
  if (f.includes('logo')) return '⭐';
  return '📷';
}

function PhotoSlot({
  filename,
  alt: _alt,
  aspectClass = 'aspect-[4/3]',
  ring = false,
  rounded = true,
}: {
  filename: string;
  alt: string;
  aspectClass?: string;
  ring?: boolean;
  rounded?: boolean;
}) {
  const icon = pickPlaceholderIcon(filename);
  return (
    <div
      className={[
        'relative w-full',
        aspectClass,
        rounded ? 'rounded-3xl' : '',
        'overflow-hidden bg-navy-card',
        ring ? 'ring-1 ring-gold-brand/30 shadow-[0_30px_80px_rgba(0,0,0,0.55)]' : 'border border-white/8',
      ].join(' ')}
      data-photo-slot={filename}
      aria-label={`Photo placeholder — ${filename}`}
    >
      {/* Layer 1 — base diagonal gradient (navy depth). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-navy-card via-navy-brand to-navy-card"
      />
      {/* Layer 2 — cyan + gold radial glow (premium ambient). */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 30% 25%, rgba(0,212,255,0.10), transparent 60%), radial-gradient(ellipse at 75% 80%, rgba(245,197,24,0.08), transparent 60%)',
        }}
      />
      {/* Layer 3 — giant category icon at low opacity. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center"
      >
        <span
          className="leading-none select-none"
          style={{
            fontSize: 'clamp(4.5rem, 18vw, 10rem)',
            opacity: 0.10,
            filter: 'drop-shadow(0 4px 32px rgba(0,212,255,0.25))',
          }}
        >
          {icon}
        </span>
      </div>
      {/* Layer 4 — filename label (small, monospaced, bottom-aligned). */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 p-4 text-center">
        <span className="text-[9px] uppercase tracking-[0.25em] text-white/30">
          Photo coming
        </span>
        <span className="font-mono text-[10px] text-white/55 break-all">
          {filename}
        </span>
      </div>
    </div>
  );
}
