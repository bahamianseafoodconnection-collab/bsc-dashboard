// File: app/johnette/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const CAR_MARKUP = 650;
const RENTAL_MARKUP = 10;

export default function JohnetteDashboard() {
const router = useRouter();
const [vehicles, setVehicles] = useState<any[]>([]);
const [parts, setParts] = useState<any[]>([]);
const [loading, setLoading] = useState(true);
const [tab, setTab] = useState<'overview' | 'forsale' | 'rental' | 'parts'>('overview');

useEffect(() => { checkAuth(); loadData(); }, []);

async function checkAuth() {
const { data: { session } } = await supabase.auth.getSession();
if (!session?.user) { router.push('/login'); return; }
const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
if (!['automotive', 'control_admin'].includes(p?.role)) router.push('/login');
}

async function loadData() {
try {
const [v, p] = await Promise.all([
supabase.from('vehicles').select('*').order('created_at', { ascending: false }),
supabase.from('auto_parts').select('*').order('created_at', { ascending: false }),
]);
if (v.data) setVehicles(v.data);
if (p.data) setParts(p.data);
} catch (e) {}
setLoading(false);
}

const forSale = vehicles.filter(v => v.listing_type === 'sale' && v.status === 'active');
const sold = vehicles.filter(v => v.listing_type === 'sale' && v.status === 'inactive');
const forRent = vehicles.filter(v => v.listing_type === 'rental' && v.status === 'active');
const soldParts = parts.filter(p => p.status === 'inactive');
const totalProfit = sold.length * CAR_MARKUP + soldParts.reduce((s, p) => s + (p.bsc_markup || 0), 0);

const pg: React.CSSProperties = { backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: "'Inter', sans-serif", paddingBottom: 80 };
const card: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 14, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 12 };

if (loading) {
return (
<div style={{ ...pg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
<div style={{ textAlign: 'center' }}>
<div style={{ fontSize: 48, marginBottom: 12 }}>🚗</div>
<p style={{ color: '#4a5568' }}>Loading Johnette Dashboard...</p>
</div>
</div>
);
}

return (
<div style={pg}>
{/* HEADER */}
<div style={{ background: 'linear-gradient(135deg, #070e1d, #0d1f3c)', borderBottom: '1px solid #1e3a5f', padding: '14px 18px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 640, margin: '0 auto' }}>
<div>
<p style={{ margin: 0, color: '#60a5fa', fontWeight: 'bold', fontSize: 16 }}>🚗 Automotive Dashboard</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>Johnette Wright Strachan · Automotive Manager</p>
</div>
<div style={{ display: 'flex', gap: 8 }}>
<Link href="/vehicles" style={{ padding: '7px 12px', borderRadius: 10, backgroundColor: '#60a5fa', color: '#000', fontWeight: 'bold', fontSize: 12, textDecoration: 'none' }}>
+ Upload
</Link>
<button
onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
style={{ padding: '7px 12px', borderRadius: 10, backgroundColor: '#0d1f3c', color: '#6b7280', border: '1px solid #1e3a5f', fontSize: 12, cursor: 'pointer' }}
>
Sign Out
</button>
</div>
</div>
</div>

<div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 18px' }}>

{/* KPI STRIP */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
{[
{ label: 'FOR SALE', value: String(forSale.length), color: '#f5c518' },
{ label: 'SOLD', value: String(sold.length), color: '#4ade80' },
{ label: 'RENTALS', value: String(forRent.length), color: '#60a5fa' },
{ label: 'PROFIT', value: '$' + totalProfit.toFixed(0), color: '#4ade80' },
].map(k => (
<div key={k.label} style={{ ...card, textAlign: 'center' as const, padding: 12, marginBottom: 0 }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 8, letterSpacing: 1 }}>{k.label}</p>
<p style={{ margin: '4px 0 0', color: k.color, fontWeight: 'bold', fontSize: 17 }}>{k.value}</p>
</div>
))}
</div>

{/* TABS */}
<div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
{[
{ key: 'overview', label: '📊 Overview' },
{ key: 'forsale', label: '🏷️ For Sale' },
{ key: 'rental', label: '🔑 Rentals' },
{ key: 'parts', label: '🔧 Parts' },
].map(t => (
<button
key={t.key}
onClick={() => setTab(t.key as any)}
style={{ flex: 1, padding: '9px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 'bold', backgroundColor: tab === t.key ? '#60a5fa' : '#0d1f3c', color: tab === t.key ? '#000' : '#6b7280' }}
>
{t.label}
</button>
))}
</div>

{/* OVERVIEW */}
{tab === 'overview' && (
<>
<div style={card}>
<p style={{ margin: '0 0 12px', color: '#60a5fa', fontWeight: 'bold', fontSize: 14 }}>🚗 My Responsibilities</p>
{[
{ icon: '🚗', task: 'List cars for sale — enter cost, system adds $650 BSC markup + 10% VAT' },
{ icon: '🔑', task: 'List cars for rent — enter daily rate, system adds $10/day BSC markup + 10% VAT' },
{ icon: '🔧', task: 'Upload auto parts — enter cost, system adds 10% markup + 10% VAT' },
{ icon: '📸', task: 'Add photos to every listing before publishing' },
{ icon: '💬', task: 'Handle all WhatsApp and customer inquiries for vehicles' },
{ icon: '💰', task: '$650 BSC profit per car sold · $10/day per rental · 10% on every part' },
].map((r, i) => (
<div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #1e3a5f' }}>
<span style={{ fontSize: 16, flexShrink: 0 }}>{r.icon}</span>
<p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{r.task}</p>
</div>
))}
</div>

{/* PROFIT SUMMARY */}
<div style={{ ...card, background: 'linear-gradient(135deg, #001a3a, #002a5a)', borderColor: '#1e5a9f' }}>
<p style={{ margin: '0 0 12px', color: '#60a5fa', fontWeight: 'bold', fontSize: 14 }}>💰 Automotive Revenue Summary</p>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
{[
{ label: 'Cars Sold', value: String(sold.length) + ' vehicles', color: '#4ade80' },
{ label: 'BSC Per Car', value: '$' + CAR_MARKUP, color: '#f5c518' },
{ label: 'Rentals Active', value: String(forRent.length) + ' listed', color: '#60a5fa' },
{ label: 'BSC Per Day', value: '$' + RENTAL_MARKUP, color: '#a78bfa' },
{ label: 'Parts Sold', value: String(soldParts.length) + ' items', color: '#4ade80' },
{ label: 'Total BSC Profit', value: '$' + totalProfit.toFixed(2), color: '#f5c518' },
].map(x => (
<div key={x.label} style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>{x.label}</p>
<p style={{ margin: '4px 0 0', color: x.color, fontWeight: 'bold', fontSize: 15 }}>{x.value}</p>
</div>
))}
</div>
</div>

<Link href="/vehicles" style={{ display: 'block', padding: '14px', borderRadius: 14, backgroundColor: '#60a5fa', color: '#000', fontWeight: 'bold', fontSize: 15, textAlign: 'center' as const, textDecoration: 'none' }}>
🚗 Open Vehicle Manager →
</Link>
</>
)}

{/* FOR SALE */}
{tab === 'forsale' && (
<>
<p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>
Cars For Sale ({forSale.length} active · {sold.length} sold)
</p>
{forSale.length === 0 ? (
<div style={{ ...card, textAlign: 'center' as const, padding: 24 }}>
<p style={{ color: '#4a5568', marginBottom: 14 }}>No active listings yet.</p>
<Link href="/vehicles" style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 10, backgroundColor: '#60a5fa', color: '#000', fontWeight: 'bold', textDecoration: 'none', fontSize: 13 }}>
+ Add Vehicle
</Link>
</div>
) : (
forSale.map(v => (
<div key={v.id} style={card}>
{v.photo_url && (
<img src={v.photo_url} alt={v.year_make_model} style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8, marginBottom: 10 }} />
)}
<p style={{ margin: '0 0 2px', fontWeight: 'bold', fontSize: 15 }}>{v.year_make_model}</p>
<p style={{ margin: '0 0 10px', color: '#4a5568', fontSize: 12 }}>VIN: {v.vin || 'N/A'}</p>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
<div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>BSC PROFIT</p>
<p style={{ margin: '2px 0 0', color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>$650.00</p>
</div>
<div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>CUSTOMER PAYS</p>
<p style={{ margin: '2px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 16 }}>${v.customer_price?.toFixed(2) || 'TBD'}</p>
</div>
</div>
</div>
))
)}

{sold.length > 0 && (
<>
<p style={{ color: '#4ade80', fontWeight: 'bold', fontSize: 14, margin: '20px 0 12px' }}>✅ Sold ({sold.length})</p>
{sold.map(v => (
<div key={v.id} style={{ ...card, borderColor: '#4ade8033' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{v.year_make_model}</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 12 }}>VIN: {v.vin || 'N/A'}</p>
</div>
<div style={{ textAlign: 'right' as const }}>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>+$650 profit</p>
<span style={{ backgroundColor: '#0a1f0a', color: '#4ade80', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 'bold' }}>SOLD</span>
</div>
</div>
</div>
))}
</>
)}
</>
)}

{/* RENTALS */}
{tab === 'rental' && (
<>
<p style={{ color: '#60a5fa', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>
Rental Fleet ({forRent.length} available)
</p>
{forRent.length === 0 ? (
<div style={{ ...card, textAlign: 'center' as const, padding: 24 }}>
<p style={{ color: '#4a5568', marginBottom: 14 }}>No rental vehicles listed yet.</p>
<Link href="/vehicles" style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 10, backgroundColor: '#60a5fa', color: '#000', fontWeight: 'bold', textDecoration: 'none', fontSize: 13 }}>
+ Add Rental
</Link>
</div>
) : (
forRent.map(v => (
<div key={v.id} style={card}>
{v.photo_url && (
<img src={v.photo_url} alt={v.year_make_model} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, marginBottom: 10 }} />
)}
<p style={{ margin: '0 0 2px', fontWeight: 'bold', fontSize: 15 }}>{v.year_make_model}</p>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
<div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>DAILY RATE</p>
<p style={{ margin: '2px 0 0', color: '#60a5fa', fontWeight: 'bold', fontSize: 16 }}>${v.daily_rate?.toFixed(2) || 'TBD'}</p>
</div>
<div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>BSC PROFIT/DAY</p>
<p style={{ margin: '2px 0 0', color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>$10.00</p>
</div>
</div>
</div>
))
)}
</>
)}

{/* PARTS */}
{tab === 'parts' && (
<>
<p style={{ color: '#a78bfa', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>
Auto Parts ({parts.length} total · {soldParts.length} sold)
</p>
{parts.length === 0 ? (
<div style={{ ...card, textAlign: 'center' as const, padding: 24 }}>
<p style={{ color: '#4a5568', marginBottom: 14 }}>No parts listed yet.</p>
<Link href="/vehicles" style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 10, backgroundColor: '#a78bfa', color: '#000', fontWeight: 'bold', textDecoration: 'none', fontSize: 13 }}>
+ Add Part
</Link>
</div>
) : (
parts.map(p => (
<div key={p.id} style={{ ...card, borderColor: p.status === 'inactive' ? '#4ade8033' : '#1e3a5f' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
<div style={{ flex: 1 }}>
<p style={{ margin: '0 0 2px', fontWeight: 'bold', fontSize: 14 }}>{p.name || p.part_number}</p>
<p style={{ margin: '0 0 2px', color: '#4a5568', fontSize: 12 }}>{p.year_make_model}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>Part #: {p.part_number || 'N/A'}</p>
</div>
<div style={{ textAlign: 'right' as const }}>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 16 }}>${p.price?.toFixed(2)}</p>
<p style={{ margin: '2px 0', color: '#4a5568', fontSize: 11 }}>BSC: ${p.bsc_markup?.toFixed(2)}</p>
<span style={{ backgroundColor: p.status === 'inactive' ? '#0a1f0a' : '#001a2a', color: p.status === 'inactive' ? '#4ade80' : '#60a5fa', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 'bold' }}>
{p.status === 'inactive' ? 'SOLD' : 'ACTIVE'}
</span>
</div>
</div>
</div>
))
)}
</>
)}

</div>
</div>
);
}
