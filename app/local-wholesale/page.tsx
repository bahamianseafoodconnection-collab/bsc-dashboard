'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

const WHOLESALERS = [
{
key: 'asa-h-pritchard',
name: 'Asa H Pritchard',
tagline: 'One of Nassau\'s most established wholesale distributors — groceries, dry goods & essentials',
color: '#1B4F72',
accent: '#F4C842',
logo: '🏪',
badge: 'Est. Distributor',
location: 'Nassau, New Providence',
categories: ['Groceries', 'Dry Goods', 'Essentials', 'Beverages'],
},
{
key: 'bahamas-international-food',
name: 'Bahamas International Food',
tagline: 'Premium food wholesale — meats, frozen goods, dairy and international products',
color: '#1E5C2E',
accent: '#ABEBC6',
logo: '🍱',
badge: 'International Foods',
location: 'Nassau, New Providence',
categories: ['Meats', 'Frozen', 'Dairy', 'International'],
},
{
key: 'dalbenas',
name: "D'Albenas",
tagline: 'Trusted Nassau wholesaler for grocery staples, canned goods and household products',
color: '#784212',
accent: '#FAD7A0',
logo: '🏭',
badge: 'Nassau Trusted',
location: 'Nassau, New Providence',
categories: ['Canned Goods', 'Household', 'Groceries', 'Cleaning'],
},
{
key: 'bahamas-wholesale-agencies',
name: 'Bahamas Wholesale Agencies',
tagline: 'Full-service wholesale agency — branded goods, dry goods and bulk supplies',
color: '#1A5276',
accent: '#AED6F1',
logo: '📦',
badge: 'Full Service',
location: 'Nassau, New Providence',
categories: ['Branded Goods', 'Dry Goods', 'Bulk', 'Paper Products'],
},
{
key: 'tpg',
name: 'TPG',
tagline: 'The Purchasing Group — competitive wholesale pricing on a wide range of products',
color: '#2C3E50',
accent: '#F4C842',
logo: '🛒',
badge: 'Best Pricing',
location: 'Nassau, New Providence',
categories: ['General', 'Groceries', 'Beverages', 'Essentials'],
},
{
key: 'thompson-trading',
name: 'Thompson Trading',
tagline: 'Premium trading company — meats, poultry, seafood and specialty items',
color: '#922B21',
accent: '#FADBD8',
logo: '🤝',
badge: 'Premium Trading',
location: 'Nassau, New Providence',
categories: ['Meats', 'Poultry', 'Seafood', 'Specialty'],
},
{
key: 'island-wholesale',
name: 'Island Wholesale',
tagline: 'Your local island wholesale source for produce, frozen goods and restaurant supplies',
color: '#196F3D',
accent: '#A9DFBF',
logo: '🌴',
badge: 'Island Supply',
location: 'Nassau, New Providence',
categories: ['Produce', 'Frozen', 'Restaurant Supply', 'Bulk Foods'],
},
];

export default function LocalWholesalePage() {
const router = useRouter();

return (
<div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, sans-serif' }}>

<header style={{ backgroundColor: '#1a2e5a', padding: '0 20px', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
<div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
<Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
<div style={{ color: '#f4c842', fontWeight: 900, fontSize: 20, letterSpacing: 2 }}>BSC</div>
<div style={{ color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: 1.5 }}>MARKETPLACE</div>
</Link>
<div style={{ display: 'flex', gap: 12 }}>
<Link href="/market" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Local Market</Link>
<Link href="/us-shopping" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>🇺🇸 US Stores</Link>
<Link href="/login" style={{ backgroundColor: '#f4c842', color: '#1a2e5a', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>Sign In</Link>
</div>
</div>
</header>

<div style={{ background: 'linear-gradient(135deg, #1a2e5a 0%, #154360 50%, #1a2e5a 100%)', padding: '60px 20px' }}>
<div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
<div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(244,200,66,0.15)', border: '1px solid rgba(244,200,66,0.3)', borderRadius: 20, padding: '6px 16px', marginBottom: 20 }}>
<span style={{ fontSize: 14 }}>🇧🇸</span>
<span style={{ color: '#f4c842', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>LOCAL WHOLESALE PARTNERS</span>
</div>
<h1 style={{ color: '#ffffff', fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 900, lineHeight: 1.1, margin: '0 0 16px' }}>
Shop Wholesale.<br />
<span style={{ color: '#f4c842' }}>Right Here in Nassau.</span>
</h1>
<p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 16, lineHeight: 1.7, margin: '0 0 28px' }}>
Access Nassau's top 7 wholesale suppliers through BSC Marketplace. Order in bulk at wholesale prices — BSC handles the pickup and delivery so you don't have to.
</p>
<div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
{[
{ icon: '💰', text: 'Wholesale Pricing' },
{ icon: '📦', text: 'Bulk Orders' },
{ icon: '🚚', text: 'BSC Delivers' },
{ icon: '🇧🇸', text: 'Nassau & Andros' },
].map((step, i) => (
<div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
<span style={{ fontSize: 18 }}>{step.icon}</span>
<span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{step.text}</span>
</div>
))}
</div>
</div>
</div>

<div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb' }}>
<div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px', display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
{[
{ label: 'Wholesale Cost', desc: 'Local wholesale price (BSD)', color: '#e8f4fd' },
{ label: '+ BSC 12%', desc: 'Service & handling markup', color: '#f0fde8' },
{ label: '= Your Price', desc: 'All-in total in BSD', color: '#fef9e7' },
].map((item, i) => (
<div key={i} style={{ backgroundColor: item.color, borderRadius: 10, padding: '10px 18px', textAlign: 'center', minWidth: 140 }}>
<div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: 13 }}>{item.label}</div>
<div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>{item.desc}</div>
</div>
))}
</div>
</div>

<div style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 20px' }}>
<div style={{ textAlign: 'center', marginBottom: 40 }}>
<p style={{ color: '#f4c842', fontWeight: 700, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', margin: '0 0 8px' }}>7 Local Partners</p>
<h2 style={{ color: '#1a2e5a', fontSize: 28, fontWeight: 900, margin: 0 }}>Nassau's Top Wholesale Suppliers</h2>
</div>

<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
{WHOLESALERS.map((w) => (
<div
key={w.key}
onClick={() => router.push(`/local-wholesale/${w.key}`)}
style={{ backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.15)'; }}
onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
>
<div style={{ backgroundColor: w.color, padding: '28px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
<div>
<div style={{ fontSize: 44, marginBottom: 8 }}>{w.logo}</div>
<h3 style={{ color: '#ffffff', fontWeight: 900, fontSize: 20, margin: '0 0 4px' }}>{w.name}</h3>
<div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>📍 {w.location}</div>
</div>
<div style={{ backgroundColor: w.accent, borderRadius: 8, padding: '5px 10px', textAlign: 'center', maxWidth: 120 }}>
<span style={{ color: w.color, fontSize: 10, fontWeight: 800 }}>{w.badge}</span>
</div>
</div>
<div style={{ padding: '20px 24px' }}>
<p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>{w.tagline}</p>
<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
{w.categories.map((cat) => (
<span key={cat} style={{ backgroundColor: '#f0f4ff', color: '#1a2e5a', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>{cat}</span>
))}
</div>
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
<div style={{ display: 'flex', gap: 8 }}>
<span style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>🇧🇸 Local</span>
<span style={{ backgroundColor: '#fef9e7', color: '#d97706', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>📦 Wholesale</span>
</div>
<button style={{ backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
Shop →
</button>
</div>
</div>
</div>
))}
</div>

<div style={{ backgroundColor: '#1a2e5a', borderRadius: 20, padding: '40px 32px', marginTop: 48 }}>
<h3 style={{ color: '#f4c842', fontWeight: 900, fontSize: 20, textAlign: 'center', margin: '0 0 32px' }}>How Local Wholesale Works</h3>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 24 }}>
{[
{ step: '1', icon: '🛒', title: 'Browse & Order', desc: 'Pick bulk items from any local wholesaler. All prices include BSC markup and VAT.' },
{ step: '2', icon: '📋', title: 'BSC Gets Your List', desc: 'Your order goes directly to BSC who coordinates with the wholesaler.' },
{ step: '3', icon: '🏭', title: 'Picked Up Locally', desc: 'BSC picks up your order from the Nassau warehouse.' },
{ step: '4', icon: '🚚', title: 'Delivered to You', desc: 'BSC delivers to your home or business in Nassau or Andros.' },
].map((item) => (
<div key={item.step} style={{ textAlign: 'center' }}>
<div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#f4c842', color: '#1a2e5a', fontWeight: 900, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
{item.step}
</div>
<div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
<div style={{ color: '#fff', fontWeight: 800, fontSize: 14, marginBottom: 6 }}>{item.title}</div>
<div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 1.5 }}>{item.desc}</div>
</div>
))}
</div>
</div>
</div>

<footer style={{ backgroundColor: '#1a2e5a', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '24px 20px', textAlign: 'center' }}>
<p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: 0 }}>
© 2025 BSC Marketplace · Local Wholesale Service · Proudly Bahamian 🇧🇸
</p>
</footer>
</div>
);
}
