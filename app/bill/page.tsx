// File: app/bill/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const MONTHLY_EXPENSES = [
{ label: 'Store Rent — Nassau', amount: 4150 },
{ label: 'BPL — Nassau', amount: 2300 },
{ label: 'Staff Salaries — Nassau', amount: 10000 },
{ label: 'Water & Sewage', amount: 400 },
{ label: 'Phone & Internet', amount: 120 },
{ label: 'Garbage Collection', amount: 70 },
{ label: 'Maintenance', amount: 150 },
{ label: 'BPL — Andros', amount: 400 },
{ label: "Ceta's Manager Salary", amount: 1000 },
{ label: 'Andros Staff Salaries', amount: 2000 },
];
const TOTAL_FIXED = MONTHLY_EXPENSES.reduce((s, e) => s + e.amount, 0);

export default function BillDashboard() {
const router = useRouter();
const [products, setProducts] = useState<any[]>([]);
const [batches, setBatches] = useState<any[]>([]);
const [payouts, setPayouts] = useState<any[]>([]);
const [loading, setLoading] = useState(true);
const [tab, setTab] = useState<'overview' | 'inventory' | 'yield' | 'expenses'>('overview');

useEffect(() => { checkAuth(); loadData(); }, []);

async function checkAuth() {
const { data: { session } } = await supabase.auth.getSession();
if (!session?.user) { router.push('/login'); return; }
const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
if (!['bill', 'control_admin'].includes(p?.role)) router.push('/login');
}

async function loadData() {
try {
const [pr, bt, py] = await Promise.all([
supabase.from('supplier_products').select('*').in('supplier_name', ['Tropic Seafood', 'Beaver Street', 'Bill Casale']).order('created_at', { ascending: false }),
supabase.from('yield_batches').select('*').in('supplier_name', ['Tropic Seafood', 'Beaver Street', 'Spiny Tails Processing']).order('created_at', { ascending: false }).limit(20),
supabase.from('supplier_payouts').select('*').in('supplier_name', ['Tropic Seafood', 'Beaver Street', 'Bill Casale']),
]);
if (pr.data) setProducts(pr.data);
if (bt.data) setBatches(bt.data);
if (py.data) setPayouts(py.data);
} catch (e) {}
setLoading(false);
}

const totalSales = payouts.reduce((s, p) => s + (parseFloat(p.cogs_total) || 0), 0);
const totalProfit = totalSales * 0.05;

const pg: React.CSSProperties = { backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: "'Inter', sans-serif", paddingBottom: 80 };
const card: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 14, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 12 };

if (loading) {
return (
<div style={{ ...pg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
<div style={{ textAlign: 'center' }}>
<div style={{ fontSize: 48, marginBottom: 12 }}>🐟</div>
<p style={{ color: '#4a5568' }}>Loading Bill Dashboard...</p>
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
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>🐟 Bill Casale Dashboard</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>Tropic Seafood · Beaver Street · Business Partner</p>
</div>
<button
onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
style={{ padding: '7px 12px', borderRadius: 10, backgroundColor: '#0d1f3c', color: '#6b7280', border: '1px solid #1e3a5f', fontSize: 12, cursor: 'pointer' }}
>
Sign Out
</button>
</div>
</div>

<div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 18px' }}>

{/* KPI STRIP */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
{[
{ label: 'PRODUCTS', value: String(products.length), color: '#f5c518' },
{ label: 'BATCHES', value: String(batches.length), color: '#60a5fa' },
{ label: '5% SHARE', value: '$' + totalProfit.toFixed(0), color: '#4ade80' },
].map(k => (
<div key={k.label} style={{ ...card, textAlign: 'center' as const, marginBottom: 0 }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>{k.label}</p>
<p style={{ margin: '4px 0 0', color: k.color, fontWeight: 'bold', fontSize: 20 }}>{k.value}</p>
</div>
))}
</div>

{/* TABS */}
<div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
{[
{ key: 'overview', label: '📊 Overview' },
{ key: 'inventory', label: '📦 Inventory' },
{ key: 'yield', label: '🧮 Yield' },
{ key: 'expenses', label: '💸 Expenses' },
].map(t => (
<button
key={t.key}
onClick={() => setTab(t.key as any)}
style={{ flex: 1, padding: '9px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 'bold', backgroundColor: tab === t.key ? '#f5c518' : '#0d1f3c', color: tab === t.key ? '#000' : '#6b7280' }}
>
{t.label}
</button>
))}
</div>

{/* OVERVIEW */}
{tab === 'overview' && (
<>
<div style={card}>
<p style={{ margin: '0 0 12px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>📋 Bill's Responsibilities</p>
{[
{ icon: '🐟', task: 'Manage Tropic Seafood sales and purchases' },
{ icon: '🏪', task: 'Manage Beaver Street inventory uploads' },
{ icon: '📦', task: 'Update inventory quantities for all products' },
{ icon: '🧮', task: 'Record processing yield batches at Spiny Tails' },
{ icon: '🧹', task: 'Ensure clean and maintained environment at all physical locations' },
{ icon: '💰', task: '5% partnership share of total BSC gross profit — calculated monthly by Dedrick' },
].map((r, i) => (
<div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #1e3a5f' }}>
<span style={{ fontSize: 16, flexShrink: 0 }}>{r.icon}</span>
<p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{r.task}</p>
</div>
))}
</div>

{/* 5% SHARE CARD */}
<div style={{ ...card, background: 'linear-gradient(135deg, #0a1f0a, #0d2b14)', borderColor: '#4ade8066' }}>
<p style={{ margin: '0 0 12px', color: '#4ade80', fontWeight: 'bold', fontSize: 14 }}>💰 Partnership Profit Share</p>
<p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 12 }}>Bill Casale holds a 5% business partnership interest in BSC Marketplace.</p>
<p style={{ margin: '0 0 16px', color: '#4a5568', fontSize: 12 }}>Share is calculated monthly from total BSC gross profit by Dedrick.</p>
<div style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '14px 16px' }}>
<p style={{ margin: '0 0 6px', color: '#4a5568', fontSize: 11 }}>Estimated 5% of tracked sales</p>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 28 }}>${totalProfit.toFixed(2)}</p>
<p style={{ margin: '8px 0 0', color: '#4a5568', fontSize: 11 }}>Full profit share confirmed by Dedrick from BSC Control Dashboard each month.</p>
</div>
</div>
</>
)}

{/* INVENTORY */}
{tab === 'inventory' && (
<>
<p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>My Products ({products.length})</p>
{products.length === 0 ? (
<div style={{ ...card, textAlign: 'center' as const, padding: 24 }}>
<p style={{ color: '#4a5568', margin: 0 }}>No products yet. Upload via Supplier Portal.</p>
</div>
) : (
products.map(p => (
<div key={p.id} style={card}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
<div style={{ flex: 1 }}>
{p.photo_url && (
<img src={p.photo_url} alt={p.name} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', marginBottom: 8 }} />
)}
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{p.name}</p>
<p style={{ margin: '2px 0', color: '#4a5568', fontSize: 11 }}>{p.category} · {p.supplier_name}</p>
</div>
<div style={{ textAlign: 'right' as const }}>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 16 }}>${p.retail_price?.toFixed(2)}</p>
<p style={{ margin: '2px 0', color: (p.stock_qty || 0) <= 5 ? '#f87171' : '#4a5568', fontSize: 12 }}>{p.stock_qty || 0} in stock</p>
<span style={{ backgroundColor: p.status === 'approved' ? '#0a1f0a' : '#1a1400', color: p.status === 'approved' ? '#4ade80' : '#f5c518', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 'bold' }}>
{p.status.toUpperCase()}
</span>
</div>
</div>
</div>
))
)}
</>
)}

{/* YIELD */}
{tab === 'yield' && (
<>
<p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>🧮 Yield Batches ({batches.length})</p>
{batches.length === 0 ? (
<div style={{ ...card, textAlign: 'center' as const, padding: 24 }}>
<p style={{ color: '#4a5568', margin: 0 }}>No batches recorded yet.</p>
</div>
) : (
batches.map(b => (
<div key={b.id} style={card}>
<p style={{ margin: '0 0 4px', color: '#f5c518', fontSize: 12, fontFamily: 'monospace' }}>{b.batch_number}</p>
<p style={{ margin: '0 0 2px', fontWeight: 'bold', fontSize: 14 }}>{b.product_name}</p>
<p style={{ margin: '0 0 10px', color: '#4a5568', fontSize: 12 }}>Producer: {b.producer_name} · {new Date(b.date_received).toLocaleDateString()}</p>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
{[
{ label: 'YIELD', value: b.yield_pct + '%', color: '#4ade80' },
{ label: 'OUT', value: b.weight_out_lbs + ' lbs', color: '#60a5fa' },
{ label: 'COST/LB', value: '$' + (b.cost_per_lb_processed?.toFixed(2) || '0.00'), color: '#f5c518' },
].map(x => (
<div key={x.label} style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '7px 10px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>{x.label}</p>
<p style={{ margin: '2px 0 0', color: x.color, fontWeight: 'bold', fontSize: 13 }}>{x.value}</p>
</div>
))}
</div>
</div>
))
)}
</>
)}

{/* EXPENSES */}
{tab === 'expenses' && (
<>
<p style={{ color: '#f87171', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>💸 Monthly Fixed Expenses</p>
<div style={{ ...card, background: 'linear-gradient(135deg, #2d0000, #3b0000)', borderColor: '#f87171', marginBottom: 20 }}>
<p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 10, letterSpacing: 1 }}>TOTAL MONTHLY FIXED</p>
<p style={{ margin: 0, color: '#f87171', fontWeight: 'bold', fontSize: 28 }}>${TOTAL_FIXED.toLocaleString()}</p>
</div>
{MONTHLY_EXPENSES.map(e => (
<div key={e.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1e3a5f' }}>
<p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{e.label}</p>
<p style={{ margin: 0, color: '#f87171', fontWeight: 'bold', fontSize: 14 }}>${e.amount.toLocaleString()}</p>
</div>
))}
<div style={{ marginTop: 16, ...card, background: 'linear-gradient(135deg, #0a1f0a, #0d2b14)', borderColor: '#4ade8066' }}>
<p style={{ margin: '0 0 6px', color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>💰 Bill's 5% Share</p>
<p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 12 }}>Calculated from total BSC gross profit each month.</p>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 22 }}>${totalProfit.toFixed(2)} estimated</p>
</div>
</>
)}

</div>
</div>
);
}
