'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const BASE = 'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

export default function HomePage() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .fade-up { animation: fadeUp 0.7s ease both; }
        .fade-up-2 { animation: fadeUp 0.7s ease 0.15s both; }
        .fade-up-3 { animation: fadeUp 0.7s ease 0.3s both; }
        .fade-up-4 { animation: fadeUp 0.7s ease 0.45s both; }
        .nav-link:hover { color: #f5a623 !important; }
        .service-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important; }
        .service-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .why-card:hover .why-icon { transform: scale(1.15); }
        .why-icon { transition: transform 0.2s ease; display: inline-block; }
        .btn-yellow:hover { background-color: #e09400 !important; transform: translateY(-1px); }
        .btn-yellow { transition: background-color 0.2s ease, transform 0.15s ease; }
        .btn-outline:hover { background-color: rgba(255,255,255,0.15) !important; }
        .btn-outline { transition: background-color 0.2s ease; }
        .scroll-indicator { animation: pulse 2s infinite; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #f1f1f1; }
        ::-webkit-scrollbar-thumb { background: #1a2e4a; border-radius: 3px; }
      `}</style>

      <div style={{ minHeight: '100vh', backgroundColor: '#fff' }}>

        {/* STICKY NAV */}
        <nav style={{
          backgroundColor: scrolled ? 'rgba(26,46,74,0.98)' : '#1a2e4a',
          backdropFilter: scrolled ? 'blur(10px)' : 'none',
          padding: '0 24px',
          position: 'fixed',
          top: 0, left: 0, right: 0,
          zIndex: 100,
          boxShadow: scrolled ? '0 2px 20px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.2)',
          transition: 'all 0.3s ease',
        }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => router.push('/')}>
              <img src={`${BASE}/logo.jpg`} alt="BSC" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f5a623' }} />
              <div>
                <div style={{ color: '#f5a623', fontWeight: 900, fontSize: 18, letterSpacing: 2, lineHeight: 1 }}>BSC</div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 10, letterSpacing: 1.5 }}>MARKETPLACE</div>
                <div style={{ color: '#94a3b8', fontSize: 8, letterSpacing: 0.5 }}>Fresh. Local. Reliable.</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              {['Home', 'Shop', 'Services', 'About Us', 'Help & Support'].map((link, i) => (
                <button
                  key={link}
                  className="nav-link"
                  onClick={() => {
                    if (link === 'Shop') router.push('/market');
                    else if (link === 'Services') router.push('/utilities');
                  }}
                  style={{ background: 'none', border: 'none', color: i === 0 ? '#f5a623' : '#cbd5e1', fontSize: 14, cursor: 'pointer', padding: '6px 12px', borderRadius: 6, fontWeight: i === 0 ? 700 : 500, display: window && window.innerWidth < 768 ? 'none' : 'block' }}
                >
                  {link}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => router.push('/market')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#fff' }}>🛒</button>
              <button
                onClick={() => router.push('/login')}
                style={{ backgroundColor: 'transparent', border: '2px solid #f5a623', color: '#f5a623', padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                Sign In
              </button>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <div style={{ position: 'relative', height: '100vh', minHeight: 600, backgroundImage: `url(${BASE}/hero.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.1) 100%)' }} />

          <div style={{ position: 'absolute', top: '50%', left: '8%', transform: 'translateY(-50%)', maxWidth: 560, zIndex: 2 }}>
            <p className="fade-up" style={{ color: '#f5a623', fontSize: 13, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 12 }}>
              Nassau · Bahamas 🇧🇸
            </p>
            <h1 className="fade-up-2" style={{ color: '#ffffff', fontSize: 58, fontWeight: 900, lineHeight: 1.05, marginBottom: 12 }}>
              BSC<br />Marketplace
            </h1>
            <p className="fade-up-3" style={{ color: '#f5a623', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              Seafood. Meats. Essentials. Services.
            </p>
            <p className="fade-up-3" style={{ color: '#e2e8f0', fontSize: 16, marginBottom: 36, lineHeight: 1.6 }}>
              Everything you need. All in one place.<br />Fresh from Bahamian waters to your table.
            </p>
            <div className="fade-up-4" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <button className="btn-yellow" onClick={() => router.push('/login')} style={{ backgroundColor: '#f5a623', color: '#1a2e4a', border: 'none', padding: '15px 32px', borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
                Create Account
              </button>
              <button className="btn-outline" onClick={() => router.push('/login')} style={{ backgroundColor: 'transparent', color: '#fff', border: '2px solid rgba(255,255,255,0.7)', padding: '13px 32px', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                Sign In
              </button>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="scroll-indicator" style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', zIndex: 2 }} onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>Scroll</span>
            <div style={{ width: 24, height: 40, border: '2px solid rgba(255,255,255,0.4)', borderRadius: 12, display: 'flex', justifyContent: 'center', paddingTop: 6 }}>
              <div style={{ width: 4, height: 8, backgroundColor: '#f5a623', borderRadius: 2 }} />
            </div>
          </div>
        </div>

        {/* TRUST BAR */}
        <div style={{ backgroundColor: '#1a2e4a', borderTop: '3px solid #f5a623' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', padding: '0 24px' }}>
            {[
              { icon: '🦞', title: 'Fresh & Quality', sub: 'Premium seafood & meats' },
              { icon: '🔒', title: 'Secure Payments', sub: 'Your payments are safe' },
              { icon: '🚚', title: 'Fast Delivery', sub: 'Nassau & Family Islands' },
              { icon: '🤝', title: 'Trusted by Locals', sub: 'Committed to our community' },
            ].map((item, i) => (
              <div key={item.title} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 32px', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                <span style={{ fontSize: 26 }}>{item.icon}</span>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{item.title}</div>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SERVICES */}
        <div style={{ padding: '80px 24px', backgroundColor: '#ffffff' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
            <p style={{ color: '#f5a623', fontWeight: 700, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>What We Offer</p>
            <h2 style={{ color: '#1a2e4a', fontSize: 32, fontWeight: 900, marginBottom: 8 }}>SHOP. PAY. SAVE. ALL IN ONE PLACE.</h2>
            <p style={{ color: '#64748b', fontSize: 15, marginBottom: 48 }}>Everything a Bahamian family or business needs, under one roof.</p>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { icon: '🛒', title: 'Shop Marketplace', sub: 'Fresh seafood, meats, groceries and more.', btn: 'Shop Now', route: '/market', color: '#e8f4fd' },
                { icon: '📦', title: 'Wholesale & Bulk', sub: 'Bulk orders for businesses and organizations.', btn: 'Order Bulk', route: '/market', color: '#f0fde8' },
                { icon: '💡', title: 'Pay Utility Bills', sub: 'Water, electricity, internet and more.', btn: 'Pay Bills', route: '/utilities', color: '#fef9e7' },
                { icon: '🚛', title: 'Delivery Services', sub: 'Fast & reliable delivery to your doorstep.', btn: 'Schedule', route: '/market', color: '#fde8f0' },
                { icon: '⛵', title: 'Mailboat Shipping', sub: 'We ship to all major Family Islands.', btn: 'Ship Now', route: '/market', color: '#f5f0ff' },
              ].map((item) => (
                <div key={item.title} className="service-card" style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '28px 20px', width: 190, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ width: 60, height: 60, borderRadius: 16, backgroundColor: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>{item.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#1a2e4a', textAlign: 'center' }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 1.5, flex: 1 }}>{item.sub}</div>
                  <button onClick={() => router.push(item.route)} style={{ backgroundColor: '#1a2e4a', color: '#f5a623', border: 'none', padding: '9px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
                    {item.btn}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* WHY BSC */}
        <div style={{ padding: '80px 24px', backgroundColor: '#f8fafc' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
            <p style={{ color: '#f5a623', fontWeight: 700, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>Our Promise</p>
            <h2 style={{ color: '#1a2e4a', fontSize: 28, fontWeight: 900, marginBottom: 48 }}>WHY SHOP WITH BSC?</h2>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { icon: '🦐', title: 'Wide Selection', sub: 'Seafood, meats, groceries, essentials & more.' },
                { icon: '💰', title: 'Great Prices', sub: 'Competitive prices with quality you can trust.' },
                { icon: '🔐', title: 'Secure & Easy', sub: 'Safe payments and easy checkout.' },
                { icon: '🇧🇸', title: 'Support Local', sub: 'Empowering Bahamian suppliers & communities.' },
                { icon: '💬', title: 'Customer Support', sub: "We're here to help every step of the way." },
              ].map((item) => (
                <div key={item.title} className="why-card" style={{ width: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <span className="why-icon" style={{ fontSize: 40 }}>{item.icon}</span>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#1a2e4a' }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 1.5 }}>{item.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* DUAL BANNER */}
        <div style={{ display: 'flex', minHeight: 380 }}>
          <div style={{ flex: 1, position: 'relative', backgroundImage: `url(${BASE}/seafood-banner.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.72) 40%, rgba(0,0,0,0.2) 100%)' }} />
            <div style={{ position: 'absolute', top: '50%', left: '10%', transform: 'translateY(-50%)', zIndex: 2 }}>
              <p style={{ color: '#f5a623', fontWeight: 700, fontSize: 12, letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' }}>Fresh Daily</p>
              <h3 style={{ color: '#fff', fontSize: 32, fontWeight: 900, lineHeight: 1.1, marginBottom: 10 }}>FRESH SEAFOOD<br />DELIVERED DAILY</h3>
              <p style={{ color: '#e2e8f0', fontSize: 14, marginBottom: 22 }}>From our waters to your table.</p>
              <button className="btn-yellow" onClick={() => router.push('/market')} style={{ backgroundColor: '#f5a623', color: '#1a2e4a', border: 'none', padding: '13px 26px', borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                Shop Seafood
              </button>
            </div>
          </div>

          <div style={{ flex: 1, position: 'relative', backgroundImage: `url(${BASE}/meats-banner.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.72) 40%, rgba(0,0,0,0.2) 100%)' }} />
            <div style={{ position: 'absolute', top: '50%', left: '10%', transform: 'translateY(-50%)', zIndex: 2 }}>
              <p style={{ color: '#f5a623', fontWeight: 700, fontSize: 12, letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' }}>Premium Quality</p>
              <h3 style={{ color: '#fff', fontSize: 32, fontWeight: 900, lineHeight: 1.1, marginBottom: 10 }}>PREMIUM MEATS<br />CUT FRESH</h3>
              <p style={{ color: '#e2e8f0', fontSize: 14, marginBottom: 22 }}>Quality you can taste.</p>
              <button className="btn-yellow" onClick={() => router.push('/market')} style={{ backgroundColor: '#f5a623', color: '#1a2e4a', border: 'none', padding: '13px 26px', borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                Shop Meats
              </button>
            </div>
          </div>
        </div>

        {/* CTA STRIP */}
        <div style={{ backgroundColor: '#f5a623', padding: '48px 24px', textAlign: 'center' }}>
          <h2 style={{ color: '#1a2e4a', fontSize: 28, fontWeight: 900, marginBottom: 8 }}>Ready to Shop Bahamian?</h2>
          <p style={{ color: '#1a2e4a', fontSize: 15, marginBottom: 28, opacity: 0.8 }}>Join hundreds of Bahamian families and businesses shopping with BSC.</p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/login')} style={{ backgroundColor: '#1a2e4a', color: '#f5a623', border: 'none', padding: '15px 36px', borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
              Create Free Account
            </button>
            <button onClick={() => router.push('/market')} style={{ backgroundColor: 'transparent', color: '#1a2e4a', border: '2px solid #1a2e4a', padding: '13px 36px', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
              Browse Market
            </button>
          </div>
        </div>

        {/* BOTTOM TRUST */}
        <div style={{ backgroundColor: '#fff', padding: '48px 24px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 40 }}>
            {[
              { icon: '🔒', title: 'Secure Checkout', sub: '100% secure payments' },
              { icon: '✅', title: 'Verified Suppliers', sub: 'Trusted local suppliers' },
              { icon: '⭐', title: 'Quality Guaranteed', sub: 'Freshness you can trust' },
              { icon: '😊', title: 'Satisfaction Guaranteed', sub: 'We stand behind every order' },
            ].map((item) => (
              <div key={item.title} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', width: 140 }}>
                <span style={{ fontSize: 28 }}>{item.icon}</span>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2e4a' }}>{item.title}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FOOTER */}
        <footer style={{ backgroundColor: '#1a2e4a', padding: '36px 24px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
            <img src={`${BASE}/logo.jpg`} alt="BSC" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
            <div style={{ color: '#f5a623', fontWeight: 900, fontSize: 16, letterSpacing: 2 }}>BSC MARKETPLACE</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
            {['About Us', 'How it Works', 'FAQs', 'Contact Us', 'Terms & Conditions', 'Privacy Policy'].map((link) => (
              <button key={link} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', padding: '4px 10px' }}>{link}</button>
            ))}
          </div>
          <p style={{ color: '#475569', fontSize: 12, marginBottom: 4 }}>© 2025 BSC Marketplace. All Rights Reserved.</p>
          <p style={{ color: '#64748b', fontSize: 12 }}>Proudly Bahamian 🇧🇸</p>
        </footer>
      </div>
    </>
  );
}
