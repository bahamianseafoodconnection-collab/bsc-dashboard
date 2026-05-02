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

  function scrollDown() {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
    }
  }

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
        @keyframes bobble {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(6px); }
        }
        .fade-up   { animation: fadeUp 0.7s ease both; }
        .fade-up-2 { animation: fadeUp 0.7s ease 0.15s both; }
        .fade-up-3 { animation: fadeUp 0.7s ease 0.3s both; }
        .fade-up-4 { animation: fadeUp 0.7s ease 0.45s both; }
        .nav-link:hover { color: #f5a623 !important; }
        .service-card { transition: transform 0.2s ease, box-shadow 0.2s ease; cursor: pointer; }
        .service-card:hover { transform: translateY(-5px); box-shadow: 0 12px 28px rgba(0,0,0,0.13) !important; }
        .why-icon { transition: transform 0.2s ease; display: inline-block; }
        .why-card:hover .why-icon { transform: scale(1.2); }
        .btn-gold { transition: background-color 0.2s, transform 0.15s; }
        .btn-gold:hover { background-color: #d48a0f !important; transform: translateY(-1px); }
        .btn-ghost:hover { background-color: rgba(255,255,255,0.12) !important; }
        .store-card { transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; }
        .store-card:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.25) !important; }
        .wholesale-card { transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; }
        .wholesale-card:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.2) !important; }
        .bobble { animation: bobble 1.8s ease-in-out infinite; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #f1f1f1; }
        ::-webkit-scrollbar-thumb { background: #1a2e4a; border-radius: 3px; }
      `}</style>

      <div style={{ minHeight: '100vh', backgroundColor: '#fff', overflowX: 'hidden' }}>

        {/* ── STICKY NAV ── */}
        <nav style={{
          backgroundColor: scrolled ? 'rgba(26,46,74,0.97)' : '#1a2e4a',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          padding: '0 24px',
          position: 'fixed',
          top: 0, left: 0, right: 0,
          zIndex: 100,
          boxShadow: scrolled ? '0 4px 24px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.2)',
          transition: 'all 0.3s ease',
        }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexShrink: 0 }} onClick={() => router.push('/')}>
              <img src={`${BASE}/logo.jpg`} alt="BSC" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f5a623' }} />
              <div>
                <div style={{ color: '#f5a623', fontWeight: 900, fontSize: 18, letterSpacing: 2, lineHeight: 1 }}>BSC</div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 10, letterSpacing: 1.5 }}>MARKETPLACE</div>
                <div style={{ color: '#94a3b8', fontSize: 8 }}>Fresh. Local. Reliable.</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              {[
                { label: 'Home',       route: '/' },
                { label: 'Shop Local', route: '/market' },
                { label: 'Wholesale',  route: '/local-wholesale' },
                { label: 'Shop USA',   route: '/us-shopping' },
                { label: 'Services',   route: '/utilities' },
              ].map((item, i) => (
                <button
                  key={item.label}
                  className="nav-link"
                  onClick={() => router.push(item.route)}
                  style={{ background: 'none', border: 'none', color: i === 0 ? '#f5a623' : '#cbd5e1', fontSize: 13, cursor: 'pointer', padding: '6px 12px', borderRadius: 6, fontWeight: i === 0 ? 700 : 500 }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button onClick={() => router.push('/market')} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#fff' }}>🛒</button>
              <button onClick={() => router.push('/login')} style={{ backgroundColor: 'transparent', border: '2px solid #f5a623', color: '#f5a623', padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Sign In
              </button>
            </div>
          </div>
        </nav>

        {/* ── HERO ── */}
        <div style={{
          position: 'relative',
          height: '100vh',
          minHeight: 600,
          backgroundImage: `url(${BASE}/hero.jpg)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0,0,0,0.84) 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.1) 100%)' }} />

          <div style={{ position: 'absolute', top: '50%', left: '8%', transform: 'translateY(-50%)', maxWidth: 560, zIndex: 2 }}>
            <p className="fade-up" style={{ color: '#f5a623', fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14 }}>
              Nassau · Bahamas 🇧🇸
            </p>
            <h1 className="fade-up-2" style={{ color: '#ffffff', fontSize: 58, fontWeight: 900, lineHeight: 1.05, marginBottom: 14 }}>
              BSC<br />Marketplace
            </h1>
            <p className="fade-up-3" style={{ color: '#f5a623', fontSize: 22, fontWeight: 700, marginBottom: 10 }}>
              Seafood. Meats. Essentials. Services.
            </p>
            <p className="fade-up-3" style={{ color: '#e2e8f0', fontSize: 16, marginBottom: 38, lineHeight: 1.7 }}>
              Shop locally, shop wholesale, or shop the USA —<br />
              we bring it all to your door in Nassau & Andros.
            </p>
            <div className="fade-up-4" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <button className="btn-gold" onClick={() => router.push('/market')} style={{ backgroundColor: '#f5a623', color: '#1a2e4a', border: 'none', padding: '15px 32px', borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
                Shop Local
              </button>
              <button className="btn-ghost" onClick={() => router.push('/local-wholesale')} style={{ backgroundColor: 'transparent', color: '#fff', border: '2px solid rgba(255,255,255,0.65)', padding: '13px 32px', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                🇧🇸 Wholesale
              </button>
              <button className="btn-ghost" onClick={() => router.push('/us-shopping')} style={{ backgroundColor: 'transparent', color: '#fff', border: '2px solid rgba(255,255,255,0.65)', padding: '13px 32px', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                🇺🇸 Shop USA
              </button>
            </div>
          </div>

          <div
            className="bobble"
            onClick={scrollDown}
            style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', zIndex: 2 }}
          >
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>Scroll</span>
            <div style={{ width: 26, height: 42, border: '2px solid rgba(255,255,255,0.35)', borderRadius: 13, display: 'flex', justifyContent: 'center', paddingTop: 7 }}>
              <div style={{ width: 4, height: 8, backgroundColor: '#f5a623', borderRadius: 2 }} />
            </div>
          </div>
        </div>

        {/* ── TRUST BAR ── */}
        <div style={{ backgroundColor: '#1a2e4a', borderTop: '3px solid #f5a623' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', padding: '0 24px' }}>
            {[
              { icon: '🦞', title: 'Fresh & Quality',   sub: 'Premium seafood & meats' },
              { icon: '🔒', title: 'Secure Payments',   sub: 'Your payments are safe' },
              { icon: '🚚', title: 'Fast Delivery',     sub: 'Nassau & Family Islands' },
              { icon: '🤝', title: 'Trusted by Locals', sub: 'Committed to our community' },
            ].map((item, i) => (
              <div key={item.title} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 32px', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                <span style={{ fontSize: 26 }}>{item.icon}</span>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{item.title}</div>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SHOP LOCAL SERVICES ── */}
        <div style={{ padding: '80px 24px', backgroundColor: '#ffffff' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
            <p style={{ color: '#f5a623', fontWeight: 700, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>Shop Home</p>
            <h2 style={{ color: '#1a2e4a', fontSize: 30, fontWeight: 900, marginBottom: 8 }}>SHOP. PAY. SAVE. ALL IN ONE PLACE.</h2>
            <p style={{ color: '#64748b', fontSize: 15, marginBottom: 48 }}>Everything a Bahamian family or business needs, right here at home.</p>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { icon: '🛒', title: 'Shop Marketplace',  sub: 'Fresh seafood, meats, groceries and more.',    btn: 'Shop Now',   route: '/market',          color: '#e8f4fd' },
                { icon: '📦', title: 'Wholesale & Bulk',  sub: "Bulk orders from Nassau's top wholesalers.",   btn: 'Order Bulk', route: '/local-wholesale', color: '#f0fde8' },
                { icon: '💡', title: 'Pay Utility Bills', sub: 'Water, electricity, internet and more.',       btn: 'Pay Bills',  route: '/utilities',       color: '#fef9e7' },
                { icon: '🚛', title: 'Delivery Services', sub: 'Fast & reliable delivery to your doorstep.',   btn: 'Schedule',   route: '/market',          color: '#fde8f0' },
                { icon: '⛵', title: 'Mailboat Shipping', sub: 'We ship to all major Family Islands.',          btn: 'Ship Now',   route: '/market',          color: '#f5f0ff' },
              ].map((item) => (
                <div key={item.title} className="service-card" onClick={() => router.push(item.route)} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '28px 20px', width: 190, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ width: 60, height: 60, borderRadius: 16, backgroundColor: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>{item.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#1a2e4a', textAlign: 'center' }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 1.5, flex: 1 }}>{item.sub}</div>
                  <button onClick={(e) => { e.stopPropagation(); router.push(item.route); }} style={{ backgroundColor: '#1a2e4a', color: '#f5a623', border: 'none', padding: '9px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
                    {item.btn}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── LOCAL WHOLESALE ── */}
        <div style={{ padding: '80px 24px', backgroundColor: '#0f2137' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(244,200,66,0.15)', border: '1px solid rgba(244,200,66,0.3)', borderRadius: 20, padding: '6px 16px', marginBottom: 20 }}>
              <span style={{ fontSize: 14 }}>🇧🇸</span>
              <span style={{ color: '#f5a623', fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>LOCAL WHOLESALE PARTNERS</span>
            </div>
            <h2 style={{ color: '#ffffff', fontSize: 32, fontWeight: 900, marginBottom: 12 }}>
              Shop Wholesale.<br />
              <span style={{ color: '#f5a623' }}>Right Here in Nassau.</span>
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 40px' }}>
              Access Nassau's top 7 wholesale suppliers through BSC Marketplace. Order in bulk at wholesale prices — BSC handles the pickup and delivery so you don't have to.
            </p>

            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
              {[
                { logo: '🏪', name: 'Asa H Pritchard',           color: '#1B4F72' },
                { logo: '🍱', name: 'Bahamas Intl Food',          color: '#1E5C2E' },
                { logo: '🏭', name: "D'Albenas",                  color: '#784212' },
                { logo: '📦', name: 'Bahamas Wholesale',           color: '#1A5276' },
                { logo: '🛒', name: 'TPG',                        color: '#2C3E50' },
                { logo: '🤝', name: 'Thompson Trading',           color: '#922B21' },
                { logo: '🌴', name: 'Island Wholesale',           color: '#196F3D' },
              ].map((w) => (
                <div
                  key={w.name}
                  className="wholesale-card"
                  onClick={() => router.push('/local-wholesale')}
                  style={{ backgroundColor: w.color, borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                >
                  <span style={{ fontSize: 24 }}>{w.logo}</span>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{w.name}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 36 }}>
              {[
                { icon: '💰', text: 'Wholesale Pricing' },
                { icon: '📦', text: 'Bulk Orders' },
                { icon: '🚚', text: 'BSC Delivers' },
                { icon: '🇧🇸', text: 'Nassau & Andros' },
              ].map((step) => (
                <div key={step.text} style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{step.icon}</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{step.text}</span>
                </div>
              ))}
            </div>

            <button className="btn-gold" onClick={() => router.push('/local-wholesale')} style={{ backgroundColor: '#f5a623', color: '#1a2e4a', border: 'none', padding: '16px 40px', borderRadius: 12, fontSize: 17, fontWeight: 900, cursor: 'pointer' }}>
              🇧🇸 Browse Local Wholesalers →
            </button>
          </div>
        </div>

        {/* ── US SHOPPING ── */}
        <div style={{ padding: '80px 24px', backgroundColor: '#1a2e4a' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(244,200,66,0.15)', border: '1px solid rgba(244,200,66,0.3)', borderRadius: 20, padding: '6px 16px', marginBottom: 20 }}>
              <span style={{ fontSize: 14 }}>🇺🇸</span>
              <span style={{ color: '#f5a623', fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>FLORIDA SHOPPING SERVICE</span>
            </div>
            <h2 style={{ color: '#ffffff', fontSize: 32, fontWeight: 900, marginBottom: 12 }}>
              Shop Locally — Or Shop the USA<br />
              <span style={{ color: '#f5a623' }}>We Bring It Home.</span>
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 40px' }}>
              Dedrick is already in Florida shopping for BSC. Tell us what you want from these fine US stores and he'll bring it back on the same trip — fully landed cost including customs duty, delivered to your door in Nassau or Andros.
            </p>

            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
              {[
                { logo: '🏪', name: "Sam's Club",     color: '#0067A0' },
                { logo: '🏬', name: "BJ's Wholesale", color: '#CC0000' },
                { logo: '🏢', name: 'Costco',         color: '#005DAA' },
                { logo: '🛒', name: 'Walmart',        color: '#0071CE' },
                { logo: '🥩', name: 'FL Steakhouse',  color: '#8B1A1A' },
              ].map((store) => (
                <div
                  key={store.name}
                  className="store-card"
                  onClick={() => router.push('/us-shopping')}
                  style={{ backgroundColor: store.color, borderRadius: 14, padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 150, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                >
                  <span style={{ fontSize: 28 }}>{store.logo}</span>
                  <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>{store.name}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 36 }}>
              {[
                { icon: '✈️', text: 'Picked up in Florida' },
                { icon: '🛳️', text: 'Shipped to Bahamas' },
                { icon: '🏠', text: 'Delivered to You' },
              ].map((step) => (
                <div key={step.text} style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{step.icon}</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{step.text}</span>
                </div>
              ))}
            </div>

            <button className="btn-gold" onClick={() => router.push('/us-shopping')} style={{ backgroundColor: '#f5a623', color: '#1a2e4a', border: 'none', padding: '16px 40px', borderRadius: 12, fontSize: 17, fontWeight: 900, cursor: 'pointer' }}>
              🇺🇸 Browse US Stores →
            </button>
          </div>
        </div>

        {/* ── WHY BSC ── */}
        <div style={{ padding: '80px 24px', backgroundColor: '#f8fafc' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
            <p style={{ color: '#f5a623', fontWeight: 700, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>Our Promise</p>
            <h2 style={{ color: '#1a2e4a', fontSize: 28, fontWeight: 900, marginBottom: 48 }}>WHY SHOP WITH BSC?</h2>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { icon: '🦐', title: 'Wide Selection',   sub: 'Seafood, meats, wholesale, US imports & more.' },
                { icon: '💰', title: 'Great Prices',     sub: 'Competitive prices with quality you can trust.' },
                { icon: '🔐', title: 'Secure & Easy',    sub: 'Safe payments and easy checkout.' },
                { icon: '🇧🇸', title: 'Support Local',  sub: 'Empowering Bahamian suppliers & communities.' },
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

        {/* ── DUAL BANNER ── */}
        <div style={{ display: 'flex', minHeight: 380 }}>
          <div style={{ flex: 1, position: 'relative', backgroundImage: `url(${BASE}/seafood-banner.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.74) 40%, rgba(0,0,0,0.15) 100%)' }} />
            <div style={{ position: 'absolute', top: '50%', left: '10%', transform: 'translateY(-50%)', zIndex: 2 }}>
              <p style={{ color: '#f5a623', fontWeight: 700, fontSize: 11, letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' }}>Fresh Daily</p>
              <h3 style={{ color: '#fff', fontSize: 32, fontWeight: 900, lineHeight: 1.1, marginBottom: 10 }}>FRESH SEAFOOD<br />DELIVERED DAILY</h3>
              <p style={{ color: '#e2e8f0', fontSize: 14, marginBottom: 22 }}>From our waters to your table.</p>
              <button className="btn-gold" onClick={() => router.push('/market')} style={{ backgroundColor: '#f5a623', color: '#1a2e4a', border: 'none', padding: '13px 26px', borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                Shop Seafood
              </button>
            </div>
          </div>
          <div style={{ flex: 1, position: 'relative', backgroundImage: `url(${BASE}/meats-banner.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.74) 40%, rgba(0,0,0,0.15) 100%)' }} />
            <div style={{ position: 'absolute', top: '50%', left: '10%', transform: 'translateY(-50%)', zIndex: 2 }}>
              <p style={{ color: '#f5a623', fontWeight: 700, fontSize: 11, letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' }}>Premium Quality</p>
              <h3 style={{ color: '#fff', fontSize: 32, fontWeight: 900, lineHeight: 1.1, marginBottom: 10 }}>PREMIUM MEATS<br />CUT FRESH</h3>
              <p style={{ color: '#e2e8f0', fontSize: 14, marginBottom: 22 }}>Quality you can taste.</p>
              <button className="btn-gold" onClick={() => router.push('/market')} style={{ backgroundColor: '#f5a623', color: '#1a2e4a', border: 'none', padding: '13px 26px', borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                Shop Meats
              </button>
            </div>
          </div>
        </div>

        {/* ── CTA STRIP ── */}
        <div style={{ backgroundColor: '#f5a623', padding: '56px 24px', textAlign: 'center' }}>
          <h2 style={{ color: '#1a2e4a', fontSize: 30, fontWeight: 900, marginBottom: 10 }}>Ready to Shop Bahamian?</h2>
          <p style={{ color: '#1a2e4a', fontSize: 15, marginBottom: 32, opacity: 0.8 }}>
            Join hundreds of Bahamian families and businesses shopping with BSC.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/login')} style={{ backgroundColor: '#1a2e4a', color: '#f5a623', border: 'none', padding: '15px 36px', borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
              Create Free Account
            </button>
            <button onClick={() => router.push('/market')} style={{ backgroundColor: 'transparent', color: '#1a2e4a', border: '2px solid #1a2e4a', padding: '13px 36px', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
              Browse Market
            </button>
          </div>
        </div>

        {/* ── BOTTOM TRUST ── */}
        <div style={{ backgroundColor: '#fff', padding: '56px 24px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 48 }}>
            {[
              { icon: '🔒', title: 'Secure Checkout',        sub: '100% secure payments' },
              { icon: '✅', title: 'Verified Suppliers',      sub: 'Trusted local & US suppliers' },
              { icon: '⭐', title: 'Quality Guaranteed',      sub: 'Freshness you can trust' },
              { icon: '😊', title: 'Satisfaction Guaranteed', sub: 'We stand behind every order' },
            ].map((item) => (
              <div key={item.title} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', width: 140 }}>
                <span style={{ fontSize: 30 }}>{item.icon}</span>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2e4a' }}>{item.title}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <footer style={{ backgroundColor: '#1a2e4a', padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
            <img src={`${BASE}/logo.jpg`} alt="BSC" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f5a623' }} />
            <div style={{ color: '#f5a623', fontWeight: 900, fontSize: 16, letterSpacing: 2 }}>BSC MARKETPLACE</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 18 }}>
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
