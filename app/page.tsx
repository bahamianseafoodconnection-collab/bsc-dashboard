// ============================================================
// BSC MARKETPLACE — HOMEPAGE
// File: app/page.tsx
// Route: /
// Images pulled from Supabase bucket: site-images
// ============================================================

'use client';

import { useRouter } from 'next/navigation';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const img = (file: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/site-images/${file}`;

export default function HomePage() {
  const router = useRouter();

  return (
    <div style={s.page}>

      {/* NAV */}
      <nav style={s.nav}>
        <div style={s.navInner}>
          <div style={s.logo} onClick={() => router.push('/')}>
            <img src={img('logo.jpg')} alt="BSC Logo" style={s.logoImg} />
            <div>
              <div style={s.logoName}>BSC</div>
              <div style={s.logoSub}>MARKETPLACE</div>
              <div style={s.logoTagline}>Fresh. Local. Reliable.</div>
            </div>
          </div>
          <div style={s.navLinks}>
            <button style={s.navLink} onClick={() => router.push('/')}>Home</button>
            <button style={s.navLink} onClick={() => router.push('/market')}>Shop</button>
            <button style={s.navLink} onClick={() => router.push('/utilities')}>Services</button>
            <button style={s.navLink}>About Us</button>
            <button style={s.navLink}>Help & Support</button>
          </div>
          <div style={s.navActions}>
            <button style={s.cartBtn} onClick={() => router.push('/market')}>🛒</button>
            <button style={s.signInBtn} onClick={() => router.push('/login')}>Sign In</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <div style={s.hero}>
        <img src={img('hero.jpg')} alt="BSC Hero" style={s.heroImg} />
        <div style={s.heroOverlay} />
        <div style={s.heroContent}>
          <p style={s.heroWelcome}>Welcome to</p>
          <h1 style={s.heroTitle}>BSC Marketplace</h1>
          <p style={s.heroSub}>Seafood. Meats. Essentials. Services.</p>
          <p style={s.heroTagline}>Everything you need. All in one place.</p>
          <div style={s.heroBtns}>
            <button style={s.btnYellow} onClick={() => router.push('/login')}>
              Create Account
            </button>
            <button style={s.btnOutline} onClick={() => router.push('/login')}>
              Sign In
            </button>
          </div>
        </div>
      </div>

      {/* TRUST BAR */}
      <div style={s.trustBar}>
        {[
          { icon: '🦞', title: 'Fresh & Quality', sub: 'Premium seafood & meats' },
          { icon: '🔒', title: 'Secure Payments', sub: 'Your payments are safe' },
          { icon: '🚚', title: 'Fast Delivery', sub: 'Nassau & Family Islands' },
          { icon: '🤝', title: 'Trusted by Locals', sub: 'Committed to our community' },
        ].map((item) => (
          <div key={item.title} style={s.trustItem}>
            <span style={s.trustIcon}>{item.icon}</span>
            <div>
              <div style={s.trustTitle}>{item.title}</div>
              <div style={s.trustSub}>{item.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* SERVICES */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>SHOP. PAY. SAVE. ALL IN ONE PLACE.</h2>
        <div style={s.serviceGrid}>
          {[
            {
              icon: '🛒',
              title: 'Shop Marketplace',
              sub: 'Fresh seafood, meats, groceries and more.',
              btn: 'Shop Now',
              route: '/market',
            },
            {
              icon: '📦',
              title: 'Wholesale & Bulk',
              sub: 'Bulk orders for businesses and organizations.',
              btn: 'Order Bulk',
              route: '/market',
            },
            {
              icon: '💡',
              title: 'Pay Utility Bills',
              sub: 'Pay water, electricity, internet and more.',
              btn: 'Pay Bills',
              route: '/utilities',
            },
            {
              icon: '🚛',
              title: 'Delivery Services',
              sub: 'Fast & reliable delivery to your doorstep.',
              btn: 'Schedule Delivery',
              route: '/market',
            },
            {
              icon: '⛵',
              title: 'Mailboat Shipping',
              sub: 'We ship to all major Family Islands.',
              btn: 'Ship Now',
              route: '/market',
            },
          ].map((item) => (
            <div key={item.title} style={s.serviceCard}>
              <div style={s.serviceIcon}>{item.icon}</div>
              <div style={s.serviceTitle}>{item.title}</div>
              <div style={s.serviceSub}>{item.sub}</div>
              <button
                style={s.serviceBtn}
                onClick={() => router.push(item.route)}
              >
                {item.btn}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* WHY BSC */}
      <div style={s.whySection}>
        <h2 style={s.sectionTitle}>WHY SHOP WITH BSC?</h2>
        <div style={s.whyGrid}>
          {[
            { icon: '🦐', title: 'Wide Selection', sub: 'Seafood, meats, groceries, essentials & more.' },
            { icon: '💰', title: 'Great Prices', sub: 'Competitive prices with quality you can trust.' },
            { icon: '🔐', title: 'Secure & Easy', sub: 'Safe payments and easy checkout.' },
            { icon: '🇧🇸', title: 'Support Local', sub: 'Empowering Bahamian suppliers & communities.' },
            { icon: '💬', title: 'Customer Support', sub: "We're here to help you every step of the way." },
          ].map((item) => (
            <div key={item.title} style={s.whyCard}>
              <div style={s.whyIcon}>{item.icon}</div>
              <div style={s.whyTitle}>{item.title}</div>
              <div style={s.whySub}>{item.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* DUAL BANNER */}
      <div style={s.dualBanner}>
        {/* Seafood Banner */}
        <div style={s.bannerCard}>
          <img src={img('seafood-banner.jpg')} alt="Seafood" style={s.bannerImg} />
          <div style={s.bannerOverlay} />
          <div style={s.bannerContent}>
            <p style={s.bannerEyebrow}>FRESH SEAFOOD</p>
            <h3 style={s.bannerTitle}>DELIVERED DAILY</h3>
            <p style={s.bannerSub}>From our waters to your table.</p>
            <button style={s.btnYellow} onClick={() => router.push('/market')}>
              Shop Seafood
            </button>
          </div>
        </div>

        {/* Meats Banner */}
        <div style={s.bannerCard}>
          <img src={img('meats-banner.jpg')} alt="Meats" style={s.bannerImg} />
          <div style={s.bannerOverlay} />
          <div style={s.bannerContent}>
            <p style={s.bannerEyebrow}>PREMIUM MEATS</p>
            <h3 style={s.bannerTitle}>CUT FRESH</h3>
            <p style={s.bannerSub}>Quality you can taste.</p>
            <button style={s.btnYellow} onClick={() => router.push('/market')}>
              Shop Meats
            </button>
          </div>
        </div>
      </div>

      {/* BOTTOM TRUST */}
      <div style={s.bottomTrust}>
        {[
          { icon: '🔒', title: 'Secure Checkout', sub: '100% secure payments' },
          { icon: '✅', title: 'Verified Suppliers', sub: 'Trusted local suppliers' },
          { icon: '⭐', title: 'Quality Guaranteed', sub: 'Freshness you can trust' },
          { icon: '😊', title: 'Satisfaction Guaranteed', sub: 'We stand behind every order' },
        ].map((item) => (
          <div key={item.title} style={s.bottomTrustItem}>
            <span style={s.bottomTrustIcon}>{item.icon}</span>
            <div style={s.bottomTrustTitle}>{item.title}</div>
            <div style={s.bottomTrustSub}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* FOOTER */}
      <footer style={s.footer}>
        <div style={s.footerLinks}>
          {['About Us', 'How it Works', 'FAQs', 'Contact Us', 'Terms & Conditions', 'Privacy Policy'].map((link) => (
            <button key={link} style={s.footerLink}>{link}</button>
          ))}
        </div>
        <p style={s.footerCopy}>© 2025 BSC Marketplace. All Rights Reserved.</p>
        <p style={s.footerBahamian}>Proudly Bahamian 🇧🇸</p>
      </footer>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    backgroundColor: '#ffffff',
    margin: 0,
    padding: 0,
  },

  // NAV
  nav: {
    backgroundColor: '#1a2e4a',
    padding: '0 24px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  navInner: {
    maxWidth: 1200,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 70,
    gap: 16,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    flexShrink: 0,
  },
  logoImg: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    objectFit: 'cover',
  },
  logoName: {
    color: '#f5a623',
    fontWeight: 900,
    fontSize: 20,
    lineHeight: 1,
    letterSpacing: 2,
  },
  logoSub: {
    color: '#ffffff',
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  logoTagline: {
    color: '#94a3b8',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  navLinks: {
    display: 'flex',
    gap: 4,
    flex: 1,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  navLink: {
    background: 'none',
    border: 'none',
    color: '#cbd5e1',
    fontSize: 14,
    cursor: 'pointer',
    padding: '6px 12px',
    borderRadius: 6,
    fontWeight: 500,
  },
  navActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  cartBtn: {
    background: 'none',
    border: 'none',
    fontSize: 22,
    cursor: 'pointer',
  },
  signInBtn: {
    backgroundColor: 'transparent',
    border: '2px solid #f5a623',
    color: '#f5a623',
    padding: '8px 20px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },

  // HERO
  hero: {
    position: 'relative',
    height: '85vh',
    minHeight: 500,
    overflow: 'hidden',
  },
  heroImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
  },
  heroOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(to right, rgba(0,0,0,0.75) 40%, rgba(0,0,0,0.2) 100%)',
  },
  heroContent: {
    position: 'absolute',
    top: '50%',
    left: '8%',
    transform: 'translateY(-50%)',
    maxWidth: 520,
  },
  heroWelcome: {
    color: '#cbd5e1',
    fontSize: 18,
    margin: '0 0 4px 0',
    fontWeight: 400,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 52,
    fontWeight: 900,
    margin: '0 0 8px 0',
    lineHeight: 1.1,
  },
  heroSub: {
    color: '#f5a623',
    fontSize: 22,
    fontWeight: 700,
    margin: '0 0 6px 0',
  },
  heroTagline: {
    color: '#e2e8f0',
    fontSize: 16,
    margin: '0 0 28px 0',
  },
  heroBtns: {
    display: 'flex',
    gap: 14,
    flexWrap: 'wrap',
  },

  // BUTTONS
  btnYellow: {
    backgroundColor: '#f5a623',
    color: '#1a2e4a',
    border: 'none',
    padding: '14px 28px',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  },
  btnOutline: {
    backgroundColor: 'transparent',
    color: '#ffffff',
    border: '2px solid #ffffff',
    padding: '12px 28px',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  },

  // TRUST BAR
  trustBar: {
    backgroundColor: '#1a2e4a',
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 0,
    padding: '16px 24px',
  },
  trustItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 32px',
    borderRight: '1px solid rgba(255,255,255,0.1)',
  },
  trustIcon: {
    fontSize: 24,
  },
  trustTitle: {
    color: '#ffffff',
    fontWeight: 700,
    fontSize: 13,
  },
  trustSub: {
    color: '#94a3b8',
    fontSize: 11,
  },

  // SERVICES
  section: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '60px 24px',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 900,
    color: '#1a2e4a',
    letterSpacing: 1,
    marginBottom: 36,
  },
  serviceGrid: {
    display: 'flex',
    gap: 20,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  serviceCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: '28px 20px',
    width: 180,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  serviceIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  serviceTitle: {
    fontWeight: 700,
    fontSize: 14,
    color: '#1a2e4a',
    textAlign: 'center',
  },
  serviceSub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 1.4,
    flex: 1,
  },
  serviceBtn: {
    backgroundColor: '#1a2e4a',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  },

  // WHY BSC
  whySection: {
    backgroundColor: '#f8fafc',
    padding: '60px 24px',
    textAlign: 'center',
  },
  whyGrid: {
    display: 'flex',
    gap: 24,
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 1000,
    margin: '0 auto',
  },
  whyCard: {
    width: 160,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  whyIcon: {
    fontSize: 36,
  },
  whyTitle: {
    fontWeight: 700,
    fontSize: 14,
    color: '#1a2e4a',
  },
  whySub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 1.4,
  },

  // DUAL BANNER
  dualBanner: {
    display: 'flex',
    gap: 0,
    height: 340,
  },
  bannerCard: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  bannerImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  bannerOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  bannerContent: {
    position: 'absolute',
    top: '50%',
    left: '10%',
    transform: 'translateY(-50%)',
  },
  bannerEyebrow: {
    color: '#f5a623',
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: 2,
    margin: '0 0 4px 0',
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 900,
    margin: '0 0 8px 0',
    lineHeight: 1.1,
  },
  bannerSub: {
    color: '#e2e8f0',
    fontSize: 14,
    margin: '0 0 20px 0',
  },

  // BOTTOM TRUST
  bottomTrust: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 32,
    padding: '40px 24px',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e2e8f0',
  },
  bottomTrustItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    textAlign: 'center',
    width: 140,
  },
  bottomTrustIcon: {
    fontSize: 28,
  },
  bottomTrustTitle: {
    fontWeight: 700,
    fontSize: 13,
    color: '#1a2e4a',
  },
  bottomTrustSub: {
    fontSize: 11,
    color: '#64748b',
  },

  // FOOTER
  footer: {
    backgroundColor: '#1a2e4a',
    padding: '32px 24px',
    textAlign: 'center',
  },
  footerLinks: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  footerLink: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: 13,
    cursor: 'pointer',
    padding: '4px 8px',
  },
  footerCopy: {
    color: '#64748b',
    fontSize: 12,
    margin: '0 0 4px 0',
  },
  footerBahamian: {
    color: '#94a3b8',
    fontSize: 12,
    margin: 0,
  },
};
