'use client';

// /  — public landing page. Tailwind redesign of the prior 508-line inline
// version. Sections preserved: nav, hero, trust bar, categories, wholesale,
// US shopping, why-bsc, dual banner, CTA strip, bottom trust, footer.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import HeroSection from '@/components/HeroSection';
import SiteFooter from '@/components/SiteFooter';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';
const HERO_IMG = `${STORAGE_BASE}/94C94225-7A21-4E0F-BA00-79CA6E108385.jpg`;
const LOGO     = `${STORAGE_BASE}/A0EF44D5-D0F6-4D15-9826-4FED851A2719.png`;

const NAV = [
  { label: 'Home',       route: '/' },
  { label: 'Shop Local', route: '/market' },
  { label: 'Wholesale',  route: '/local-wholesale' },
  { label: 'Shop USA',   route: '/us-shopping' },
  { label: 'Services',   route: '/utilities' },
];

const TRUST = [
  { icon: '🦞', title: 'Premium Quality',  sub: 'Fresh seafood & meats daily' },
  { icon: '🔒', title: 'Secure Payments',  sub: 'RBC Plug & Pay encrypted' },
  { icon: '🚚', title: 'Nassau & Andros',  sub: 'Family Island delivery' },
  { icon: '🤝', title: 'Trusted Partners', sub: '7 Nassau wholesalers' },
];

const CATEGORIES = [
  {
    icon: '🦐', name: 'Shop Marketplace', desc: 'Fresh seafood, meats & groceries',
    route: '/market', grad: 'linear-gradient(145deg,#0a3d62,#1a6b9a,#0a3d62)',
  },
  {
    icon: '📦', name: 'Wholesale & Bulk', desc: "Nassau's top wholesale suppliers",
    route: '/local-wholesale', grad: 'linear-gradient(145deg,#1a3a1a,#2d6a2d,#1a3a1a)',
  },
  {
    icon: '💡', name: 'Utility Bills', desc: 'Water, power, internet & more',
    route: '/utilities', grad: 'linear-gradient(145deg,#4a2c00,#8a5200,#4a2c00)',
  },
  {
    icon: '🚛', name: 'Delivery', desc: 'Fast delivery to your doorstep',
    route: '/market', grad: 'linear-gradient(145deg,#1a0a3a,#3d1a7a,#1a0a3a)',
  },
  {
    icon: '⛵', name: 'Mailboat Shipping', desc: 'Ship to all Family Islands',
    route: '/market', grad: 'linear-gradient(145deg,#002a3a,#005a7a,#002a3a)',
  },
];

const WHOLESALERS = [
  { key: 'asa-h-pritchard',            name: 'Asa H Pritchard',     emoji: '🏪' },
  { key: 'bahamas-international-food', name: 'Bahamas Intl Food',   emoji: '🍱' },
  { key: 'dalbenas',                   name: "D'Albenas",           emoji: '🏭' },
  { key: 'bahamas-wholesale-agencies', name: 'Bahamas Wholesale',   emoji: '📦' },
  { key: 'tpg',                        name: 'TPG',                 emoji: '🛒' },
  { key: 'thompson-trading',           name: 'Thompson Trading',    emoji: '🤝' },
  { key: 'island-wholesale',           name: 'Island Wholesale',    emoji: '🌴' },
];

const WHOLESALE_PILLS = [
  { e: '💰', t: 'Wholesale Pricing' },
  { e: '📦', t: 'Bulk Orders' },
  { e: '🚚', t: 'BSC Delivers' },
  { e: '📱', t: 'Order Online' },
  { e: '🇧🇸', t: 'Nassau & Andros' },
];

const US_STORES = [
  { key: 'sams-club',  name: "Sam's Club",     color: '#0067A0', emoji: '🏪' },
  { key: 'bjs',        name: "BJ's Wholesale", color: '#CC0000', emoji: '🏬' },
  { key: 'costco',     name: 'Costco',         color: '#005DAA', emoji: '🏢' },
  { key: 'walmart',    name: 'Walmart',        color: '#0071CE', emoji: '🛒' },
  { key: 'steakhouse', name: 'FL Steakhouse',  color: '#8B1A1A', emoji: '🥩' },
];

const US_STEPS = [
  { n: '1', t: 'You place your order online' },
  { n: '2', t: 'BSC shops in Florida' },
  { n: '3', t: 'Cleared through customs' },
  { n: '4', t: 'Delivered to your door' },
];

const WHY = [
  { icon: '🦐',  title: 'Wide Selection',   desc: 'Seafood, meats, wholesale, US imports and everyday essentials.' },
  { icon: '💰',  title: 'Honest Prices',    desc: 'Documented margins. No greed. You know what you pay for.' },
  { icon: '🔐',  title: 'Secure & Simple',  desc: 'RBC-encrypted checkout. Card and COD accepted.' },
  { icon: '🇧🇸', title: 'Bahamian First',  desc: 'Sourced locally, employing locally, built here in Nassau.' },
  { icon: '💬',  title: 'Real Support',     desc: 'Call or WhatsApp us. A real person answers every time.' },
];

const BOTTOM_TRUST = [
  { icon: '🔒', title: 'Secure Checkout',     desc: '100% encrypted via RBC Plug & Pay' },
  { icon: '✅', title: 'Verified Suppliers',   desc: 'Trusted Nassau & US wholesale partners' },
  { icon: '⭐', title: 'Quality Guaranteed',   desc: 'Freshness on every order, every time' },
  { icon: '😊', title: 'Satisfaction Promise', desc: 'We stand behind everything we deliver' },
];

export default function HomePage() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <div className="bg-white font-sans text-slate-900 antialiased">
      {/* ─── Sticky Nav ─── */}
      <nav
        className={`fixed inset-x-0 top-0 z-50 flex items-center transition-all duration-300 ${
          scrolled
            ? 'h-16 border-b border-gold/20 bg-navy-900/95 shadow-[0_4px_32px_rgba(0,0,0,.4)] backdrop-blur-md'
            : 'h-20 bg-gradient-to-b from-black/55 to-transparent'
        }`}
      >
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-[5%]">
          <Link href="/" className="flex shrink-0 items-center transition hover:-translate-y-0.5">
            <div className="flex items-center gap-2.5 rounded-xl border border-gold/35 bg-[#fafaf6]/[0.97] px-3.5 py-1.5 pl-2 shadow-[0_4px_18px_rgba(212,168,67,.28)]">
              <img
                src={LOGO}
                alt="BSC Marketplace"
                className={`block w-auto object-contain transition-all ${scrolled ? 'h-10' : 'h-12'}`}
              />
            </div>
          </Link>

          <div className="hidden items-center gap-0.5 md:flex">
            {NAV.map((item, i) => (
              <button
                key={item.label}
                onClick={() => router.push(item.route)}
                className={`group relative rounded-md px-3.5 py-2 text-[13px] font-medium tracking-wide transition ${
                  i === 0 ? 'text-gold' : 'text-white/85 hover:text-white'
                }`}
              >
                {item.label}
                <span
                  className={`absolute inset-x-3.5 bottom-1 h-0.5 origin-center scale-x-0 bg-gold transition-transform group-hover:scale-x-100 ${
                    i === 0 ? 'scale-x-100' : ''
                  }`}
                />
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <button
              onClick={() => router.push('/market')}
              className="rounded-lg p-2 text-xl text-white transition hover:bg-white/10"
              aria-label="Cart"
            >
              🛒
            </button>
            <button
              onClick={() => router.push('/login')}
              className="hidden rounded-md border border-gold/65 px-5 py-2 text-[13px] font-semibold tracking-wide text-gold transition hover:border-gold hover:bg-gold hover:text-navy md:inline-flex"
            >
              Sign In
            </button>
            <button
              onClick={() => setMobileMenu((m) => !m)}
              className="flex flex-col gap-1.5 p-2 md:hidden"
              aria-label="Menu"
            >
              <span
                className="block h-0.5 w-5 rounded-full bg-white transition"
                style={{ transform: mobileMenu ? 'rotate(45deg) translateY(7px)' : 'none' }}
              />
              <span
                className="block h-0.5 w-5 rounded-full bg-white transition"
                style={{ opacity: mobileMenu ? 0 : 1 }}
              />
              <span
                className="block h-0.5 w-5 rounded-full bg-white transition"
                style={{ transform: mobileMenu ? 'rotate(-45deg) translateY(-7px)' : 'none' }}
              />
            </button>
          </div>
        </div>

        {mobileMenu && (
          <div className="absolute inset-x-0 top-full border-t border-gold/15 bg-navy-900/95 px-[5%] py-3 backdrop-blur md:hidden">
            {[...NAV, { label: 'Sign In', route: '/login' }].map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  router.push(item.route);
                  setMobileMenu(false);
                }}
                className="block w-full border-b border-white/5 py-3 text-left text-[15px] font-medium text-white/80 transition hover:text-gold"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </nav>

      <HeroSection />

      {/* ─── Top trust bar ─── */}
      <div className="border-t-4 border-gold border-b border-gold/10 bg-[#0a1520]">
        <div className="mx-auto flex max-w-[1280px] flex-wrap justify-around px-[5%]">
          {TRUST.map((t, i) => (
            <div
              key={t.title}
              className={`flex flex-1 min-w-52 items-center gap-3.5 px-4 py-5 ${
                i < TRUST.length - 1 ? 'sm:border-r sm:border-white/[0.06]' : ''
              }`}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold/20 bg-gold/10 text-xl">
                {t.icon}
              </div>
              <div>
                <div className="text-[13px] font-bold text-white">{t.title}</div>
                <div className="text-[11px] text-white/45">{t.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Categories ─── */}
      <section className="bg-white px-[5%] py-16 md:py-24">
        <div className="mx-auto max-w-[1280px]">
          <SectionEyebrow>What We Offer</SectionEyebrow>
          <SectionHeading>Shop By Category</SectionHeading>
          <SectionLead>
            Everything a Bahamian family or business needs — all under one marketplace.
          </SectionLead>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4 lg:grid-cols-5">
            {CATEGORIES.map((cat, i) => (
              <button
                key={cat.name}
                onClick={() => router.push(cat.route)}
                className={`group relative aspect-[3/4] overflow-hidden rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,.1)] transition hover:-translate-y-2 hover:shadow-[0_20px_48px_rgba(0,0,0,.18)] ${
                  i === 4 ? 'hidden md:block' : ''
                }`}
              >
                <div className="absolute inset-0" style={{ background: cat.grad }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/[0.78] via-black/20 to-transparent transition group-hover:from-black/[0.88] group-hover:via-black/30" />
                <div className="absolute left-1/2 top-5 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-2xl backdrop-blur transition group-hover:scale-110 group-hover:border-gold/40 group-hover:bg-gold/20">
                  {cat.icon}
                </div>
                <div className="absolute inset-x-0 bottom-0 p-4 text-left">
                  <div className="font-display text-base font-bold text-white sm:text-lg">{cat.name}</div>
                  <div className="mb-3 mt-1 text-[11px] leading-snug text-white/65">{cat.desc}</div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gold transition-all group-hover:gap-2">
                    Explore <span>→</span>
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-gold to-gold-300 transition-transform group-hover:scale-x-100" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Wholesale partners ─── */}
      <section className="relative overflow-hidden bg-navy-900 px-[5%] py-16 md:py-24">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, #d4a843, transparent)',
          }}
        />
        <div className="mx-auto max-w-[1280px]">
          <SectionEyebrow>Nassau&rsquo;s Finest</SectionEyebrow>
          <SectionHeading dark>Local Wholesale Partners</SectionHeading>
          <SectionLead dark>
            Access Nassau&rsquo;s top wholesale suppliers directly through BSC. Order in bulk —
            we handle pickup and delivery so you don&rsquo;t have to.
          </SectionLead>

          <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WHOLESALERS.map((w) => (
              <button
                key={w.key}
                onClick={() => router.push(`/local-wholesale/${w.key}`)}
                className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04] px-5 py-4 text-left backdrop-blur transition hover:translate-x-1 hover:border-white/12 hover:bg-white/[0.08]"
              >
                <span className="absolute inset-y-0 left-0 w-1 bg-gold transition-all group-hover:w-1.5" />
                <span className="text-2xl">{w.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">{w.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-white/40">
                    Wholesale Partner · Click to Browse
                  </div>
                </div>
                <span className="text-base text-white/30 transition group-hover:translate-x-1 group-hover:text-gold">
                  ›
                </span>
              </button>
            ))}
          </div>

          <div className="mb-10 flex flex-wrap gap-2.5">
            {WHOLESALE_PILLS.map((f) => (
              <div
                key={f.t}
                className="flex items-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-4 py-2 text-[13px] font-semibold text-gold/90"
              >
                <span>{f.e}</span>
                <span>{f.t}</span>
              </div>
            ))}
          </div>

          <SecondaryButton onClick={() => router.push('/local-wholesale')}>
            Browse All Wholesalers →
          </SecondaryButton>
        </div>
      </section>

      {/* ─── US Shopping ─── */}
      <section className="relative bg-[#0a1520] px-[5%] py-16 md:py-24">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.1), transparent)',
          }}
        />
        <div className="mx-auto max-w-[1280px]">
          <SectionEyebrow muted>Florida Shopping Service</SectionEyebrow>
          <h2 className="mb-2 font-display text-3xl font-black leading-tight text-white sm:text-4xl md:text-5xl">
            Shop the USA.
            <br />
            <span className="italic text-gold">We Bring It Home.</span>
          </h2>
          <SectionLead dark>
            BSC shops Florida&rsquo;s top wholesale clubs so you don&rsquo;t have to travel. Full
            landed cost — customs, shipping, duty — delivered to Nassau or Andros.
          </SectionLead>

          <div className="mb-9 flex flex-wrap items-stretch">
            {US_STEPS.map((s, i) => (
              <div key={s.n} className="flex min-w-40 flex-1 items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-gold/35 bg-gold/15 text-sm font-extrabold text-gold">
                    {s.n}
                  </div>
                  <div className="text-[13px] font-medium text-white/65">{s.t}</div>
                </div>
                {i < US_STEPS.length - 1 && (
                  <span className="mx-2 hidden text-lg text-white/20 sm:block">›</span>
                )}
              </div>
            ))}
          </div>

          <div className="mb-9 flex flex-wrap gap-3.5">
            {US_STORES.map((store) => (
              <button
                key={store.key}
                onClick={() => router.push(`/us-shopping/${store.key}`)}
                className="flex min-w-40 flex-1 flex-col items-center gap-3 rounded-2xl border border-white/[0.08] p-5 transition hover:-translate-y-1.5 hover:border-white/[0.16] hover:shadow-[0_20px_48px_rgba(0,0,0,.4)]"
                style={{
                  background: `linear-gradient(145deg, ${store.color}cc, ${store.color}88)`,
                }}
              >
                <span className="text-3xl">{store.emoji}</span>
                <div className="text-center text-[13px] font-bold leading-tight text-white">
                  {store.name}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-white/45">
                  Click to browse
                </div>
              </button>
            ))}
          </div>

          <SecondaryButton onClick={() => router.push('/us-shopping')}>
            Browse US Stores →
          </SecondaryButton>
        </div>
      </section>

      {/* ─── Why BSC ─── */}
      <section id="why-bsc" className="bg-slate-50 px-[5%] py-16 md:py-24">
        <div className="mx-auto max-w-[1280px] text-center">
          <SectionEyebrow center>Our Promise</SectionEyebrow>
          <SectionHeading center>Why Choose BSC?</SectionHeading>
          <SectionLead center>
            Built by a Bahamian family, for Bahamian families. Every decision we make starts at the
            kitchen table.
          </SectionLead>

          <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-5">
            {WHY.map((w) => (
              <div
                key={w.title}
                className="group flex flex-col items-center gap-3.5 rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_2px_16px_rgba(0,0,0,.06)] transition hover:-translate-y-1.5 hover:border-gold/30 hover:shadow-[0_16px_40px_rgba(0,0,0,.1)] sm:p-8"
              >
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-3xl text-3xl text-white shadow-[0_8px_24px_rgba(10,21,32,.25)] transition group-hover:scale-110 group-hover:-rotate-3"
                  style={{
                    background: 'linear-gradient(135deg,#0a1520 0%,#1a2e4a 100%)',
                  }}
                >
                  {w.icon}
                </div>
                <div className="font-display text-base font-bold text-navy-900 sm:text-lg">
                  {w.title}
                </div>
                <div className="text-center text-xs font-light leading-relaxed text-slate-500 sm:text-sm">
                  {w.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Dual Banner ─── */}
      <div className="grid min-h-[420px] grid-cols-1 md:grid-cols-2">
        {[
          { label: 'Fresh Daily',      title: 'Premium Seafood', sub: 'Delivered Daily', desc: 'From our waters to your table.', cta: 'Shop Seafood', overlay: 'bg-gradient-to-br from-[rgba(10,61,98,.85)] via-[rgba(26,107,154,.5)] to-black/30' },
          { label: 'Premium Quality',  title: 'Premium Meats',   sub: 'Cut Fresh',        desc: 'Quality you can taste.',       cta: 'Shop Meats',   overlay: 'bg-gradient-to-br from-[rgba(122,30,30,.85)] via-[rgba(159,59,54,.5)] to-black/30' },
        ].map((b) => (
          <button
            key={b.title}
            onClick={() => router.push('/market')}
            className="group relative cursor-pointer overflow-hidden text-left"
          >
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-[550ms] group-hover:scale-[1.06]"
              style={{ backgroundImage: `url(${HERO_IMG})` }}
            />
            <div className={`absolute inset-0 ${b.overlay}`} />
            <div className="relative z-10 max-w-md px-[10%] py-20">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-gold">
                {b.label}
              </div>
              <h3 className="mb-2 font-display text-2xl font-black leading-tight text-white sm:text-3xl md:text-4xl">
                {b.title}
                <br />
                {b.sub}
              </h3>
              <p className="mb-6 text-sm font-light text-white/75">{b.desc}</p>
              <span
                className="inline-flex items-center gap-2 rounded px-6 py-3 text-xs font-bold uppercase tracking-wider text-navy shadow-[0_4px_20px_rgba(212,160,21,.35)]"
                style={{ background: 'linear-gradient(130deg,#f4c842,#c8860f)' }}
              >
                {b.cta}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* ─── CTA strip ─── */}
      <section
        className="px-[5%] py-16 text-center md:py-20"
        style={{
          background:
            'linear-gradient(135deg,#d4a843 0%,#f4c842 35%,#d4a015 65%,#c8860f 100%)',
        }}
      >
        <div className="mx-auto max-w-[700px]">
          <h2 className="mb-3 font-display text-3xl font-black text-navy-900 sm:text-4xl md:text-5xl">
            Ready to Shop Bahamian?
          </h2>
          <p className="mb-9 text-sm leading-relaxed text-navy-900/70 sm:text-base">
            Join hundreds of Nassau families and businesses shopping fresh, local, and wholesale —
            all in one place.
          </p>
          <div className="flex flex-wrap justify-center gap-3.5">
            <button
              onClick={() => router.push('/login')}
              className="rounded bg-navy-900 px-9 py-3.5 text-sm font-bold uppercase tracking-wider text-gold shadow-[0_6px_24px_rgba(0,0,0,.25)] transition hover:-translate-y-0.5 hover:bg-navy-700 hover:shadow-[0_12px_32px_rgba(0,0,0,.35)]"
            >
              Create Free Account
            </button>
            <button
              onClick={() => router.push('/market')}
              className="rounded border-2 border-navy-900/50 bg-transparent px-9 py-3 text-sm font-bold uppercase tracking-wider text-navy-900 transition hover:-translate-y-0.5 hover:border-navy-900 hover:bg-navy-900/[0.08]"
            >
              Browse Market
            </button>
          </div>
        </div>
      </section>

      {/* ─── Bottom trust ─── */}
      <section className="border-t border-slate-100 bg-white px-[5%] py-12 md:py-16">
        <div className="mx-auto grid max-w-[1000px] grid-cols-2 gap-6 md:grid-cols-4 md:gap-8">
          {BOTTOM_TRUST.map((t) => (
            <div key={t.title} className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-50 to-slate-200 text-xl shadow-[0_2px_12px_rgba(0,0,0,.08)]">
                {t.icon}
              </div>
              <div className="text-[13px] font-bold text-slate-900">{t.title}</div>
              <div className="text-[11px] leading-relaxed text-slate-400">{t.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

/* ───────── Reusable section primitives ───────── */

function SectionEyebrow({
  children,
  center,
  muted,
}: {
  children: React.ReactNode;
  center?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`mb-3 text-[11px] font-bold uppercase tracking-[0.22em] ${
        muted ? 'text-gold/70' : 'text-gold'
      } ${center ? 'text-center' : ''}`}
    >
      {children}
    </div>
  );
}

function SectionHeading({
  children,
  dark,
  center,
}: {
  children: React.ReactNode;
  dark?: boolean;
  center?: boolean;
}) {
  return (
    <h2
      className={`mb-2 font-display text-3xl font-black leading-tight sm:text-4xl md:text-5xl ${
        dark ? 'text-white' : 'text-[#0a1520]'
      } ${center ? 'text-center' : ''}`}
    >
      {children}
    </h2>
  );
}

function SectionLead({
  children,
  dark,
  center,
}: {
  children: React.ReactNode;
  dark?: boolean;
  center?: boolean;
}) {
  return (
    <p
      className={`mb-12 max-w-xl text-base font-light leading-relaxed ${
        dark ? 'text-white/50' : 'text-slate-500'
      } ${center ? 'mx-auto text-center' : ''}`}
    >
      {children}
    </p>
  );
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded px-9 py-3.5 text-[13px] font-bold uppercase tracking-[0.08em] text-navy-900 shadow-[0_6px_28px_rgba(212,160,21,.38)] transition hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_12px_36px_rgba(212,160,21,.52)]"
      style={{ background: 'linear-gradient(130deg,#f4c842,#c8860f)' }}
    >
      {children}
    </button>
  );
}
