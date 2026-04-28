'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function HomePage() {
const router = useRouter();
const [mounted, setMounted] = useState(false);

useEffect(() => {
setMounted(true);
}, []);

const SERVICES = [
{
icon: '🐟',
title: 'Shop Marketplace',
desc: 'Fresh seafood, premium meats & everyday essentials delivered to your door.',
cta: 'Shop Now',
href: '/market',
accent: '#f5c518',
bg: 'linear-gradient(135deg, #1a1400 0%, #2a2000 100%)',
border: 'rgba(245,197,24,0.3)',
},
{
icon: '📦',
title: 'Wholesale & Bulk',
desc: 'Large-volume orders for restaurants, businesses and families.',
cta: 'Order Bulk',
href: '/market',
accent: '#60a5fa',
bg: 'linear-gradient(135deg, #001830 0%, #002040 100%)',
border: 'rgba(96,165,250,0.3)',
},
{
icon: '⚡',
title: 'Pay Utility Bills',
desc: 'BEC, Water, Cable, Aliv, BTC, Flow — fast, simple, secure.',
cta: 'Pay Bills',
href: '/utilities',
accent: '#4ade80',
bg: 'linear-gradient(135deg, #001a0a 0%, #002a10 100%)',
border: 'rgba(74,222,128,0.3)',
},
{
icon: '🚚',
title: 'Delivery Services',
desc: 'Same-day and next-day delivery across Nassau and New Providence.',
cta: 'Schedule Delivery',
href: '/market',
accent: '#a78bfa',
bg: 'linear-gradient(135deg, #1a0a2a 0%, #2a1040 100%)',
border: 'rgba(167,139,250,0.3)',
},
{
icon: '🚢',
title: 'Mailboat Shipping',
desc: 'Reliable shipping to all Family Islands via official mailboat routes.',
cta: 'Ship Now',
href: '/market',
accent: '#f87171',
bg: 'linear-gradient(135deg, #2a0a0a 0%, #3b1010 100%)',
border: 'rgba(248,113,113,0.3)',
},
];

const TRUST = [
{ icon: '🏆', title: 'Wide Selection', desc: 'Hundreds of fresh products' },
{ icon: '💰', title: 'Great Prices', desc: 'Competitive local rates' },
{ icon: '🔒', title: 'Secure & Easy', desc: 'Safe checkout always' },
{ icon: '🇧🇸', title: 'Support Local', desc: 'Proudly Bahamian' },
{ icon: '📞', title: 'Customer Support', desc: 'Real people, real help' },
];

return (
<div style={{ backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: "'Georgia', 'Times New Roman', serif", overflowX: 'hidden' }}>

<style>{`
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600&display=swap');

.bsc-hero-title {
font-family: 'Playfair Display', Georgia, serif;
font-weight: 900;
font-size: clamp(2rem, 6vw, 3.5rem);
line-height: 1.1;
letter-spacing: -0.02em;
}
.bsc-section-title {
font-family: 'Playfair Display', Georgia, serif;
font-weight: 700;
}
.bsc-body {
font-family: 'DM Sans', system-ui, sans-serif;
}
.bsc-btn-primary {
transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.bsc-btn-primary:hover {
transform: translateY(-2px);
box-shadow: 0 12px 40px rgba(245,197,24,0.4);
}
.bsc-btn-secondary:hover {
background: rgba(255,255,255,0.08) !important;
}
.bsc-service-card {
transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.bsc-service-card:hover {
transform: translateY(-4px);
}
@keyframes fadeUp {
from { opacity: 0; transform: translateY(24px); }
to { opacity: 1; transform: translateY(0); }
}
.bsc-fade-up {
opacity: 0;
animation: fadeUp 0.7s ease forwards;
}
.bsc-fade-up-1 { animation-delay: 0.1s; }
.bsc-fade-up-2 { animation-delay: 0.25s; }
.bsc-fade-up-3 { animation-delay: 0.4s; }
.bsc-fade-up-4 { animation-delay: 0.55s; }
`}</style>

{/* ── NAV ── */}
<nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(6,13,31,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(245,197,24,0.12)', padding: '14px 24px' }}>
<div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<div>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 20, fontFamily: "'Playfair Display', Georgia, serif" }}>BSC Marketplace</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10, fontFamily: "'DM Sans', system-ui, sans-serif", letterSpacing: '0.15em' }}>BAHAMIAN SEAFOOD CONNECTION</p>
</div>
<div style={{ display: 'flex', gap: 10 }}>
<button
onClick={() => router.push('/login')}
className="bsc-body"
style={{ padding: '9px 20px', borderRadius: 10, background: 'transparent', border: '1px solid rgba(245,197,24,0.4)', color: '#f5c518', fontWeight: '600', fontSize: 13, cursor: 'pointer' }}
>
Sign In
</button>
<button
onClick={() => router.push('/login')}
className="bsc-body bsc-btn-primary"
style={{ padding: '9px 20px', borderRadius: 10, background: '#f5c518', border: 'none', color: '#000', fontWeight: '700', fontSize: 13, cursor: 'pointer' }}
>
Create Account
</button>
</div>
</div>
</nav>

{/* ── HERO ── */}
<div style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
{/* Background split image simulation with gradients */}
<div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
<div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #0a1a0a 0%, #060d1f 40%, #1a0a00 70%, #0d0800 100%)' }} />
{/* Left seafood side */}
<div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%', background: 'linear-gradient(135deg, rgba(74,222,128,0.06) 0%, transparent 60%)' }} />
{/* Right meats side */}
<div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%', background: 'linear-gradient(225deg, rgba(245,197,24,0.08) 0%, transparent 60%)' }} />
{/* Radial glow center */}
<div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)', width: 800, height: 400, background: 'radial-gradient(ellipse, rgba(245,197,24,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />
{/* Decorative fish/seafood icons */}
<div style={{ position: 'absolute', left: '8%', top: '20%', fontSize: 80, opacity: 0.07, transform: 'rotate(-15deg)' }}>🐟</div>
<div style={{ position: 'absolute', left: '15%', bottom: '25%', fontSize: 60, opacity: 0.05, transform: 'rotate(10deg)' }}>🦞</div>
<div style={{ position: 'absolute', left: '5%', bottom: '40%', fontSize: 50, opacity: 0.06 }}>🦐</div>
<div style={{ position: 'absolute', right: '8%', top: '25%', fontSize: 80, opacity: 0.07, transform: 'rotate(15deg)' }}>🥩</div>
<div style={{ position: 'absolute', right: '15%', bottom: '30%', fontSize: 60, opacity: 0.05, transform: 'rotate(-10deg)' }}>🍗</div>
<div style={{ position: 'absolute', right: '5%', top: '50%', fontSize: 50, opacity: 0.06 }}>🐠</div>
{/* Dividing line */}
<div style={{ position: 'absolute', top: '10%', bottom: '10%', left: '50%', width: 1, background: 'linear-gradient(to bottom, transparent, rgba(245,197,24,0.15), transparent)', transform: 'translateX(-50%)' }} />
</div>

{/* Hero content */}
<div style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '0 24px', maxWidth: 700 }}>
<div className="bsc-fade-up bsc-fade-up-1">
<p className="bsc-body" style={{ margin: '0 0 16px', color: '#f5c518', fontSize: 11, letterSpacing: '0.35em', fontWeight: '600', textTransform: 'uppercase' as const }}>
Nassau · Bahamas
</p>
</div>
<div className="bsc-fade-up bsc-fade-up-2">
<h1 className="bsc-hero-title" style={{ margin: '0 0 16px', color: '#ffffff' }}>
Welcome to<br />
<span style={{ color: '#f5c518' }}>BSC Marketplace</span>
</h1>
</div>
<div className="bsc-fade-up bsc-fade-up-3">
<p className="bsc-body" style={{ margin: '0 0 8px', fontSize: 18, color: 'rgba(255,255,255,0.85)', fontWeight: '500', letterSpacing: '0.05em' }}>
Seafood. Meats. Essentials. Services.
</p>
<p className="bsc-body" style={{ margin: '0 0 40px', fontSize: 14, color: '#4a5568' }}>
Everything you need. All in one place.
</p>
</div>
<div className="bsc-fade-up bsc-fade-up-4" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' as const }}>
<button
onClick={() => router.push('/login')}
className="bsc-body bsc-btn-primary"
style={{ padding: '16px 36px', borderRadius: 14, background: '#f5c518', border: 'none', color: '#000', fontWeight: '700', fontSize: 16, cursor: 'pointer', minWidth: 180, boxShadow: '0 8px 32px rgba(245,197,24,0.3)' }}
>
Create Account
</button>
<button
onClick={() => router.push('/login')}
className="bsc-body bsc-btn-secondary"
style={{ padding: '16px 36px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontWeight: '600', fontSize: 16, cursor: 'pointer', minWidth: 180, backdropFilter: 'blur(8px)' }}
>
Sign In
</button>
</div>
</div>

{/* Scroll indicator */}
<div style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6, opacity: 0.4 }}>
<p className="bsc-body" style={{ margin: 0, fontSize: 10, letterSpacing: '0.2em', color: '#fff' }}>SCROLL</p>
<div style={{ width: 1, height: 40, background: 'linear-gradient(to bottom, #fff, transparent)' }} />
</div>
</div>

{/* ── TRUST BAR ── */}
<div style={{ background: 'rgba(245,197,24,0.05)', borderTop: '1px solid rgba(245,197,24,0.12)', borderBottom: '1px solid rgba(245,197,24,0.12)', padding: '20px 24px' }}>
<div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
{[
{ icon: '✦', title: 'Fresh & Quality', desc: 'Premium seafood & meats' },
{ icon: '✦', title: 'Secure Payments', desc: 'Your payments are safe' },
{ icon: '✦', title: 'Fast Delivery', desc: 'Nassau & Family Islands' },
{ icon: '✦', title: 'Trusted by Locals', desc: 'Committed to community' },
].map(item => (
<div key={item.title} style={{ textAlign: 'center' as const }}>
<p className="bsc-body" style={{ margin: '0 0 2px', color: '#f5c518', fontSize: 10, letterSpacing: '0.15em', fontWeight: '600' }}>{item.icon} {item.title.toUpperCase()}</p>
<p className="bsc-body" style={{ margin: 0, color: '#6b7280', fontSize: 12 }}>{item.desc}</p>
</div>
))}
</div>
</div>

{/* ── SERVICES SECTION ── */}
<div style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
<div style={{ textAlign: 'center' as const, marginBottom: 56 }}>
<p className="bsc-body" style={{ margin: '0 0 10px', color: '#f5c518', fontSize: 11, letterSpacing: '0.3em', fontWeight: '600' }}>WHAT WE OFFER</p>
<h2 className="bsc-section-title" style={{ margin: 0, fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', color: '#fff', lineHeight: 1.2 }}>
Shop. Pay. Save.<br />
<span style={{ color: '#f5c518' }}>All In One Place.</span>
</h2>
</div>

<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
{SERVICES.map(svc => (
<div
key={svc.title}
className="bsc-service-card"
style={{ background: svc.bg, border: '1px solid ' + svc.border, borderRadius: 20, padding: '28px 24px', display: 'flex', flexDirection: 'column' as const, gap: 0 }}
>
<span style={{ fontSize: 36, marginBottom: 16, display: 'block' }}>{svc.icon}</span>
<p className="bsc-section-title" style={{ margin: '0 0 8px', color: '#fff', fontSize: 18, fontWeight: '700' }}>{svc.title}</p>
<p className="bsc-body" style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 13, lineHeight: 1.6, flex: 1 }}>{svc.desc}</p>
<button
onClick={() => router.push(svc.href)}
className="bsc-body"
style={{ padding: '12px 20px', borderRadius: 10, background: 'transparent', border: '1px solid ' + svc.accent, color: svc.accent, fontWeight: '600', fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' as const, transition: 'background 0.15s ease' }}
onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = svc.accent; (e.target as HTMLButtonElement).style.color = '#000'; }}
onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'transparent'; (e.target as HTMLButtonElement).style.color = svc.accent; }}
>
{svc.cta} →
</button>
</div>
))}
</div>
</div>

{/* ── WHY BSC ── */}
<div style={{ background: 'linear-gradient(135deg, #070e1d 0%, #0d1a30 100%)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '80px 24px' }}>
<div style={{ maxWidth: 1100, margin: '0 auto' }}>
<div style={{ textAlign: 'center' as const, marginBottom: 48 }}>
<p className="bsc-body" style={{ margin: '0 0 10px', color: '#f5c518', fontSize: 11, letterSpacing: '0.3em', fontWeight: '600' }}>OUR PROMISE</p>
<h2 className="bsc-section-title" style={{ margin: 0, fontSize: 'clamp(1.4rem, 3.5vw, 2rem)', color: '#fff' }}>Why Shop With BSC?</h2>
</div>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
{TRUST.map(item => (
<div key={item.title} style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '24px 20px', textAlign: 'center' as const }}>
<span style={{ fontSize: 32, display: 'block', marginBottom: 12 }}>{item.icon}</span>
<p className="bsc-section-title" style={{ margin: '0 0 6px', color: '#fff', fontSize: 15, fontWeight: '700' }}>{item.title}</p>
<p className="bsc-body" style={{ margin: 0, color: '#4a5568', fontSize: 12 }}>{item.desc}</p>
</div>
))}
</div>
</div>
</div>

{/* ── FEATURE SPLIT STRIP ── */}
<div style={{ padding: '0 24px', maxWidth: 1100, margin: '0 auto' }}>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: '60px 0' }}>
{/* Seafood */}
<div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', minHeight: 260, background: 'linear-gradient(135deg, #001a0a 0%, #002a10 50%, #0a2010 100%)', border: '1px solid rgba(74,222,128,0.2)', padding: '36px 32px', display: 'flex', flexDirection: 'column' as const, justifyContent: 'flex-end' }}>
<div style={{ position: 'absolute', top: 24, right: 24, fontSize: 64, opacity: 0.15 }}>🐟</div>
<div style={{ position: 'absolute', top: 50, right: 60, fontSize: 40, opacity: 0.1 }}>🦞</div>
<p className="bsc-body" style={{ margin: '0 0 6px', color: '#4ade80', fontSize: 11, letterSpacing: '0.25em', fontWeight: '600' }}>DELIVERED DAILY</p>
<h3 className="bsc-section-title" style={{ margin: '0 0 16px', color: '#fff', fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)' }}>Fresh Seafood<br />Delivered Daily</h3>
<button
onClick={() => router.push('/market')}
className="bsc-body"
style={{ padding: '12px 24px', borderRadius: 10, background: '#4ade80', border: 'none', color: '#000', fontWeight: '700', fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' as const }}
>
Shop Seafood
</button>
</div>
{/* Meats */}
<div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', minHeight: 260, background: 'linear-gradient(135deg, #1a1000 0%, #2a1a00 50%, #201000 100%)', border: '1px solid rgba(245,197,24,0.2)', padding: '36px 32px', display: 'flex', flexDirection: 'column' as const, justifyContent: 'flex-end' }}>
<div style={{ position: 'absolute', top: 24, right: 24, fontSize: 64, opacity: 0.15 }}>🥩</div>
<div style={{ position: 'absolute', top: 50, right: 60, fontSize: 40, opacity: 0.1 }}>🍗</div>
<p className="bsc-body" style={{ margin: '0 0 6px', color: '#f5c518', fontSize: 11, letterSpacing: '0.25em', fontWeight: '600' }}>CUT FRESH</p>
<h3 className="bsc-section-title" style={{ margin: '0 0 16px', color: '#fff', fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)' }}>Premium Meats<br />Cut Fresh</h3>
<button
onClick={() => router.push('/market')}
className="bsc-body"
style={{ padding: '12px 24px', borderRadius: 10, background: '#f5c518', border: 'none', color: '#000', fontWeight: '700', fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' as const }}
>
Shop Meats
</button>
</div>
</div>
</div>

{/* ── FOOTER TRUST STRIP ── */}
<div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '32px 24px' }}>
<div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
{[
{ icon: '🔐', label: 'Secure Checkout' },
{ icon: '✅', label: 'Verified Suppliers' },
{ icon: '⭐', label: 'Quality Guaranteed' },
{ icon: '💯', label: 'Satisfaction Guaranteed' },
].map(item => (
<div key={item.label} style={{ textAlign: 'center' as const }}>
<span style={{ fontSize: 24, display: 'block', marginBottom: 6 }}>{item.icon}</span>
<p className="bsc-body" style={{ margin: 0, color: '#4a5568', fontSize: 11, fontWeight: '600' }}>{item.label}</p>
</div>
))}
</div>
<div style={{ textAlign: 'center' as const, marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
<p className="bsc-section-title" style={{ margin: '0 0 4px', color: '#f5c518', fontSize: 16 }}>BSC Marketplace</p>
<p className="bsc-body" style={{ margin: '0 0 8px', color: '#4a5568', fontSize: 12 }}>Firetrial Road, Nassau, Bahamas · +1 (242) 361-3474</p>
<p className="bsc-body" style={{ margin: 0, color: '#2a3a5a', fontSize: 11 }}>© 2025 BSC Marketplace · Owned by Dedrick Tamico Storr Snr & Family · All Rights Reserved</p>
</div>
</div>

</div>
);
}
