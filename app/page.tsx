'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const SUPABASE = 'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

const NAV_LINKS = [
  { label: 'Home',          href: '/' },
  { label: 'Shop',          href: '/market' },
  { label: 'Services',      href: '/utilities' },
  { label: 'About Us',      href: '/legal' },
  { label: 'Help & Support',href: '#contact' },
];

const TRUST_BADGES = [
  { icon: '🛡️', title: 'Fresh & Quality',    sub: 'Premium seafood & meats' },
  { icon: '🔒', title: 'Secure Payments',    sub: 'Your payments are safe' },
  { icon: '🚚', title: 'Fast Delivery',      sub: 'Nassau & Family Islands' },
  { icon: '🇧🇸', title: 'Trusted by Locals', sub: 'Committed to our community' },
];

const SERVICE_CARDS = [
  { icon: '🐟', title: 'Shop Marketplace',   sub: 'Fresh seafood, meats, groceries and more.', cta: 'Shop Now',         href: '/market' },
  { icon: '📦', title: 'Wholesale & Bulk',   sub: 'Bulk orders for businesses and organizations.', cta: 'Order Bulk', href: '/market' },
  { icon: '⚡', title: 'Pay Utility Bills',   sub: 'Pay water, electricity, internet and more.', cta: 'Pay Bills',      href: '/utilities' },
  { icon: '🚗', title: 'Vehicles & Parts',   sub: 'Cars for sale & rent, auto parts, VAT incl.', cta: 'View Vehicles',  href: '/vehicles' },
  { icon: '🚢', title: 'Supplier Portal',    sub: 'List your products and grow your business.', cta: 'Apply Now',       href: '/supplier' },
];

const WHY_BSC = [
  { icon: '🦞', title: 'Wide Selection',   sub: 'Seafood, meats, groceries, essentials & more.' },
  { icon: '💰', title: 'Great Prices',     sub: 'Competitive prices with quality you can trust.' },
  { icon: '🔐', title: 'Secure & Easy',    sub: 'Safe payments and easy checkout.' },
  { icon: '🤝', title: 'Support Local',    sub: 'Empowering Bahamian suppliers & communities.' },
  { icon: '💬', title: 'WhatsApp Support', sub: 'Reach us anytime on +1 (242) 558-4495.' },
];

const FOOTER_LINKS = ['About Us', 'How It Works', 'FAQs', 'Contact Us', 'Terms & Conditions', 'Privacy Policy'];

export default function HomePage() {
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [cartCount,  setCartCount]  = useState(0);
  const [scrolled,   setScrolled]   = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", backgroundColor: '#fff', color: '#1a1a1a', overflowX: 'hidden' }}>

      {/* ── NAV ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, backgroundColor: scrolled ? 'rgba(255,255,255,0.97)' : '#fff', boxShadow: scrolled ? '0 2px 20px rgba(0,0,0,0.1)' : '0 1px 0 #eee', transition: 'all 0.3s' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #1a2e5a' }}>
              <img src={`${SUPABASE}/logo.jpg`} alt="BSC" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: '18px', color: '#1a2e5a', lineHeight: 1 }}>BSC</div>
              <div style={{ fontWeight: 700, fontSize: '11px', color: '#1a2e5a', letterSpacing: '2px', lineHeight: 1 }}>MARKETPLACE</div>
              <div style={{ fontWeight: 400, fontSize: '9px', color: '#888', letterSpacing: '1px' }}>Fresh. Local. Reliable.</div>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav style={{ display: 'flex', gap: '4px', alignItems: 'center' }} className="desktop-nav">
            {NAV_LINKS.map((l) => (
              <Link key={l.label} href={l.href} style={{ padding: '6px 14px', borderRadius: '6px', textDecoration: 'none', color: '#333', fontSize: '14px', fontWeight: 500, transition: 'all 0.2s' }}>
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Right Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link href="/market" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: '1.5px solid #1a2e5a', borderRadius: '8px', textDecoration: 'none', color: '#1a2e5a', fontSize: '14px', fontWeight: 600 }}>
              🛒 Cart {cartCount > 0 && <span style={{ backgroundColor: '#f4c842', color: '#1a2e5a', fontSize: '10px', fontWeight: 900, padding: '1px 6px', borderRadius: '20px' }}>{cartCount}</span>}
            </Link>
            <Link href="/login" style={{ backgroundColor: '#1a2e5a', color: '#fff', padding: '8px 18px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 700 }}>
              Sign In
            </Link>
            {/* Mobile hamburger */}
            <button onClick={() => setMenuOpen(!menuOpen)} style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }} className="hamburger">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1a2e5a" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div style={{ backgroundColor: '#fff', borderTop: '1px solid #eee', padding: '12px 20px' }}>
            {NAV_LINKS.map((l) => (
              <Link key={l.label} href={l.href} onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '10px 0', color: '#333', textDecoration: 'none', fontSize: '15px', fontWeight: 500, borderBottom: '1px solid #f5f5f5' }}>
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section style={{ position: 'relative', minHeight: '520px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        {/* Background photo */}
        <div style={{ position: 'absolute', inset: 0 }}>
          <img src={`${SUPABASE}/hero.jpg`} alt="BSC Hero" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(15,25,50,0.88) 0%, rgba(15,25,50,0.65) 50%, rgba(15,25,50,0.3) 100%)' }} />
        </div>

        {/* Hero content */}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: '1200px', margin: '0 auto', padding: '60px 24px', width: '100%' }}>
          <div style={{ maxWidth: '520px' }}>
            <p style={{ color: '#f4c842', fontWeight: 700, fontSize: '13px', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '12px' }}>Welcome to BSC Marketplace</p>
            <h1 style={{ color: '#fff', fontWeight: 900, fontSize: 'clamp(28px, 5vw, 52px)', lineHeight: 1.15, margin: '0 0 16px' }}>
              BSC Marketplace
            </h1>
            <p style={{ color: '#f4c842', fontWeight: 700, fontSize: 'clamp(16px, 2.5vw, 22px)', margin: '0 0 10px' }}>
              Seafood. Meats. Essentials. Services.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '15px', margin: '0 0 32px', lineHeight: 1.6 }}>
              Everything you need. All in one place. Delivered to Nassau & Andros 🇧🇸
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/login" style={{ backgroundColor: '#f4c842', color: '#1a2e5a', padding: '14px 28px', borderRadius: '8px', textDecoration: 'none', fontWeight: 800, fontSize: '15px', display: 'inline-block' }}>
                Create Account
              </Link>
              <Link href="/login" style={{ backgroundColor: 'transparent', color: '#fff', padding: '14px 28px', borderRadius: '8px', textDecoration: 'none', fontWeight: 700, fontSize: '15px', border: '2px solid rgba(255,255,255,0.5)', display: 'inline-block' }}>
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST BADGES ── */}
      <section style={{ backgroundColor: '#1a2e5a', padding: '0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {TRUST_BADGES.map((b, i) => (
            <div key={b.title} style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
              <span style={{ fontSize: '24px' }}>{b.icon}</span>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: '13px' }}>{b.title}</div>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px' }}>{b.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SERVICES ── */}
      <section style={{ padding: '60px 24px', maxWidth: '1200px', margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', color: '#1a2e5a', fontWeight: 900, fontSize: '22px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '36px' }}>
          SHOP. PAY. SAVE. ALL IN ONE PLACE.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          {SERVICE_CARDS.map((s) => (
            <div key={s.title} style={{ backgroundColor: '#fff', border: '1.5px solid #e5e7eb', borderRadius: '14px', padding: '24px 16px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'all 0.2s' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>{s.icon}</div>
              <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>{s.title}</div>
              <div style={{ color: '#666', fontSize: '12px', lineHeight: 1.5, marginBottom: '16px' }}>{s.sub}</div>
              <Link href={s.href} style={{ display: 'block', backgroundColor: '#f8f9fa', color: '#1a2e5a', textDecoration: 'none', fontWeight: 700, fontSize: '12px', padding: '8px 14px', borderRadius: '8px', border: '1.5px solid #e5e7eb' }}>
                {s.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── WHY BSC ── */}
      <section style={{ backgroundColor: '#f8f9fa', padding: '60px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', color: '#1a2e5a', fontWeight: 900, fontSize: '22px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '36px' }}>
            WHY SHOP WITH BSC?
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '24px' }}>
            {WHY_BSC.map((w) => (
              <div key={w.title} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>{w.icon}</div>
                <div style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>{w.title}</div>
                <div style={{ color: '#666', fontSize: '12px', lineHeight: 1.5 }}>{w.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DUAL BANNER ── */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Seafood */}
          <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', minHeight: '280px', display: 'flex', alignItems: 'flex-end' }}>
            <img src={`${SUPABASE}/seafood-banner.jpg`} alt="Fresh Seafood" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(15,25,50,0.85) 0%, transparent 60%)' }} />
            <div style={{ position: 'relative', zIndex: 2, padding: '24px' }}>
              <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '20px', lineHeight: 1.2, marginBottom: '6px' }}>FRESH SEAFOOD<br/>DELIVERED DAILY</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', marginBottom: '16px' }}>From our waters to your table.</div>
              <Link href="/market" style={{ backgroundColor: '#f4c842', color: '#1a2e5a', padding: '10px 20px', borderRadius: '8px', textDecoration: 'none', fontWeight: 800, fontSize: '13px', display: 'inline-block' }}>
                Shop Seafood
              </Link>
            </div>
          </div>

          {/* Meats */}
          <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', minHeight: '280px', display: 'flex', alignItems: 'flex-end' }}>
            <img src={`${SUPABASE}/meats-banner.jpg`} alt="Premium Meats" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(15,25,50,0.85) 0%, transparent 60%)' }} />
            <div style={{ position: 'relative', zIndex: 2, padding: '24px' }}>
              <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '20px', lineHeight: 1.2, marginBottom: '6px' }}>PREMIUM MEATS<br/>CUT FRESH</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', marginBottom: '16px' }}>Quality you can taste.</div>
              <Link href="/market" style={{ backgroundColor: '#f4c842', color: '#1a2e5a', padding: '10px 20px', borderRadius: '8px', textDecoration: 'none', fontWeight: 800, fontSize: '13px', display: 'inline-block' }}>
                Shop Meats
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── BOTTOM TRUST ── */}
      <section style={{ borderTop: '1px solid #eee', padding: '24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {[
            { icon: '🔒', title: 'Secure Checkout',      sub: '100% secure payments' },
            { icon: '✅', title: 'Verified Suppliers',    sub: 'Trusted local suppliers' },
            { icon: '⭐', title: 'Quality Guaranteed',    sub: 'Freshness you can trust' },
            { icon: '💯', title: 'Satisfaction Guaranteed',sub: 'We stand behind every order' },
          ].map((t) => (
            <div key={t.title} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '22px' }}>{t.icon}</span>
              <div>
                <div style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '12px' }}>{t.title}</div>
                <div style={{ color: '#999', fontSize: '11px' }}>{t.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ backgroundColor: '#1a2e5a', padding: '32px 24px 20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {/* Top row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)' }}>
                <img src={`${SUPABASE}/logo.jpg`} alt="BSC" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: '16px' }}>BSC Marketplace</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Fresh. Local. Reliable. 🇧🇸</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>
                💬 WhatsApp: <span style={{ color: '#f4c842', fontWeight: 700 }}>+1 (242) 558-4495</span>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>
                📞 Landline: <span style={{ color: '#f4c842', fontWeight: 700 }}>+1 (242) 361-3474</span>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>
                📍 <span style={{ color: '#f4c842', fontWeight: 700 }}>Firetrial Road, Nassau</span>
              </div>
            </div>
          </div>
          {/* Links */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '20px' }}>
            {FOOTER_LINKS.map((l) => (
              <a key={l} href="#" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', textDecoration: 'none' }}>{l}</a>
            ))}
          </div>
          {/* Copyright */}
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
            © 2025 BSC Marketplace. All Rights Reserved. &nbsp;·&nbsp; Proudly Bahamian 🇧🇸
          </div>
        </div>
      </footer>

      {/* ── MOBILE CSS ── */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .hamburger { display: block !important; }
        }
        @media (max-width: 640px) {
          section > div > div[style*="grid-template-columns: repeat(4"] { grid-template-columns: repeat(2, 1fr) !important; }
          section > div > div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
          section > div > div[style*="gridTemplateColumns: 'repeat(4, 1fr)'"] { grid-template-columns: repeat(2,1fr) !important; }
        }
      `}</style>
    </div>
  );
}