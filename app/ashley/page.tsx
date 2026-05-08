// File: app/ashley/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const NASSAU_MARGIN = 0.38;
const ANDROS_MARGIN = 0.43;

export default function AshleyDashboard() {
const router = useRouter();
const [orders, setOrders] = useState<any[]>([]);
const [suppliers, setSuppliers] = useState<any[]>([]);
const [supplierPayouts, setSupplierPayouts] = useState<any[]>([]);
const [lowStock, setLowStock] = useState<any[]>([]);
const [invoices, setInvoices] = useState<any[]>([]);
const [loading, setLoading] = useState(true);
const [tab, setTab] = useState<'overview' | 'orders' | 'andros' | 'suppliers' | 'inventory'>('overview');

useEffect(() => { checkAuth(); loadData(); }, []);

async function checkAuth() {
const { data: { session } } = await supabase.auth.getSession();
if (!session?.user) { router.push('/login'); return; }
const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
if (!['manager', 'control_admin'].includes(profile?.role)) router.push('/login');
}

async function loadData() {
try {
const [ordersRes, suppliersRes, payoutsRes, stockRes] = await Promise.all([
supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(50),
supabase.from('suppliers').select('*').eq('status', 'approved'),
supabase.from('supplier_payouts').select('*').eq('paid', false),
supabase.from('supplier_products').select('*').eq('status', 'approved').lte('stock_qty', 10).order('stock_qty'),
]);
if (ordersRes.data) setOrders(ordersRes.data);
if (suppliersRes.data) setSuppliers(suppliersRes.data);
if (payoutsRes.data) setSupplierPayouts(payoutsRes.data);
if (stockRes.data) setLowStock(stockRes.data);
} catch (e) {}
setLoading(false);
}

const pendingOrders = orders.filter(o => o.status === 'pending');
const activeOrders = orders.filter(o => ['confirmed','packing','out_for_delivery','ready_pickup'].includes(o.status));
const deliveredOrders = orders.filter(o => o.status === 'delivered');
const androsOrders = orders.filter(o => o.delivery_address?.toLowerCase().includes('andros') || o.customer_name?.toLowerCase().includes('andros'));
const totalOwed = supplierPayouts.reduce((s, p) => s + (parseFloat(p.cogs_total) || 0), 0);
const todayRevenue = orders.filter(o => o.payment_status === 'paid' && new Date(o.created_at).toDateString() === new Date().toDateString()).reduce((s, o) => s + Number(o.total), 0);

const pg: React.CSSProperties = { backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: "'Inter', sans-serif", paddingBottom: 80 };
const card: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 14, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 12 };

if (loading) return <div style={{ ...pg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 48 }}>📋</div><p style={{ color: '#4a5568' }}>Loading Ashley Dashboard...</p></div></div>;

return (
<div style={pg}>
{/* HEADER */}
<div style={{ background: 'linear-gradient(135deg, #070e1d, #0d1f3c)', borderBottom: '1px solid #1e3a5f', padding: '14px 18px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 640, margin: '0 auto' }}>
<div>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>📋 Operations Dashboard</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>Ashley Rolle · Operations Manager</p>
</div>
<div style={{ display: 'flex', gap: 8 }}>
<Link href="/pos" style={{ padding: '7px 12px', borderRadius: 10, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', fontSize: 12, textDecoration: 'none' }}>🛒 POS</Link>
<button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} style={{ padding: '7px 12px', borderRadius: 10, backgroundColor: '#0d1f3c', color: '#6b7280', border: '1px solid #1e3a5f', fontSize: 12, cursor: 'pointer' }}>Sign Out</button>
</div>
</div>
</div>

<div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 18px' }}>
{/* KPI STRIP */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
{[
{ label: 'PENDING', value: String(pendingOrders.length), color: '#f5c518' },
{ label: 'ACTIVE', value: String(activeOrders.length), color: '#60a5fa' },
{ label: 'DELIVERED', value: String(deliveredOrders.length), color: '#4ade80' },
{ label: 'OWED', value: '$' + totalOwed.toFixed(0), color: '#f87171' },
].map(k => (
<div key={k.label} style={{ ...card, textAlign: 'center', padding: 12, marginBottom: 0 }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 8, letterSpacing: 1 }}>{k.label}</p>
<p style={{ margin: '4px 0 0', color: k.color, fontWeight: 'bold', fontSize: 17 }}>{k.value}</p>
</div>
))}
</div>

{/* TODAY REVENUE */}
<div style={{ ...card, background: 'linear-gradient(135deg, #0a1f0a, #0d2b14)', borderColor: '#4ade8066', marginBottom: 20 }}>
<p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 10, letterSpacing: 1 }}>TODAY'S REVENUE</p>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 28 }}>${todayRevenue.toFixed(2)}</p>
<p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 12 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
</div>

{/* TABS */}
<div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' as const }}>
{[
{ key: 'overview', label: '📊 Overview' },
{ key: 'orders', label: '📦 Orders' },
{ key: 'andros', label: '🏝️ Andros' },
{ key: 'suppliers', label: '🚢 Suppliers' },
{ key: 'inventory', label: '⚠️ Stock' },
].map(t => (
<button key={t.key} onClick={() => setTab(t.key as any)} style={{ padding: '8px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' as const, flexShrink: 0, backgroundColor: tab === t.key ? '#f5c518' : '#0d1f3c', color: tab === t.key ? '#000' : '#6b7280' }}>
{t.label}
</button>
))}
</div>

{/* OVERVIEW */}
{tab === 'overview' && (
<>
<div style={card}>
<p style={{ margin: '0 0 12px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>📋 My Responsibilities</p>
{[
{ icon: '📦', task: 'Monitor all pending orders — confirm and process', urgent: pendingOrders.length > 0 },
{ icon: '🚢', task: 'Track supplier payouts — ' + supplierPayouts.length + ' pending payments', urgent: supplierPayouts.length > 0 },
{ icon: '🏝️', task: 'Andros shipments & paper trail — ' + androsOrders.length + ' Andros orders', urgent: false },
{ icon: '⚠️', task: 'Low stock reorder — ' + lowStock.length + ' products need attention', urgent: lowStock.length > 0 },
{ icon: '👥', task: 'Follow up with customers on pending orders', urgent: false },
{ icon: '💰', task: 'Track in-store sales for Nassau & Andros', urgent: false },
].map((r, i) => (
<div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #1e3a5f' }}>
<span style={{ fontSize: 16, flexShrink: 0 }}>{r.icon}</span>
<p style={{ margin: 0, color: r.urgent ? '#f5c518' : '#aaa', fontSize: 13 }}>{r.task}</p>
{r.urgent && <span style={{ backgroundColor: '#f87171', color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 'bold', flexShrink: 0 }}>!</span>}
</div>
))}
</div>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
<Link href="/orders" style={{ display: 'block', padding: '14px', borderRadius: 14, backgroundColor: '#0a1f0a', color: '#4ade80', border: '1px solid #4ade80', fontWeight: 'bold', fontSize: 13, textAlign: 'center', textDecoration: 'none' }}>📋 Order Management</Link>
<Link href="/pos" style={{ display: 'block', padding: '14px', borderRadius: 14, backgroundColor: '#1a1200', color: '#f5c518', border: '1px solid #f5c518', fontWeight: 'bold', fontSize: 13, textAlign: 'center', textDecoration: 'none' }}>🛒 Nassau POS</Link>
<Link href="/pos-andros" style={{ display: 'block', padding: '14px', borderRadius: 14, backgroundColor: '#1a0a2a', color: '#a78bfa', border: '1px solid #a78bfa', fontWeight: 'bold', fontSize: 13, textAlign: 'center', textDecoration: 'none' }}>🏝️ Andros POS</Link>
<Link href="/supplier" style={{ display: 'block', padding: '14px', borderRadius: 14, backgroundColor: '#0a1220', color: '#60a5fa', border: '1px solid #60a5fa', fontWeight: 'bold', fontSize: 13, textAlign: 'center', textDecoration: 'none' }}>🚢 Suppliers</Link>
</div>
</>
)}

{/* ORDERS */}
{tab === 'orders' && (
<>
<p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>All Orders ({orders.length})</p>
{orders.slice(0, 20).map(o => (
<div key={o.id} style={{ ...card, borderColor: o.status === 'pending' ? '#f5c51866' : '#1e3a5f' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
<div>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 12, fontFamily: 'monospace' }}>{o.order_number}</p>
<p style={{ margin: '2px 0', fontWeight: 'bold', fontSize: 14 }}>{o.customer_name}</p>
<p style={{ margin: '2px 0', color: '#4a5568', fontSize: 11 }}>{o.delivery_type === 'delivery' ? '🚚 ' + o.delivery_address : '🏪 Pickup'}</p>
</div>
<div style={{ textAlign: 'right' as const }}>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 16 }}>${Number(o.total).toFixed(2)}</p>
<span style={{ backgroundColor: o.status === 'pending' ? '#1a1400' : o.status === 'delivered' ? '#0a1f0a' : '#001a2a', color: o.status === 'pending' ? '#f5c518' : o.status === 'delivered' ? '#4ade80' : '#60a5fa', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 'bold' }}>{o.status.replace('_', ' ').toUpperCase()}</span>
</div>
</div>
{o.customer_phone && (
<a href={'https://api.whatsapp.com/send?phone=' + o.customer_phone.replace(/\D/g, '') + '&text=' + encodeURIComponent('Hi ' + o.customer_name + '! Following up on your BSC order ' + o.order_number + '. How can we help? 🐟')} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: 10, padding: '8px', borderRadius: 10, backgroundColor: '#0a2010', color: '#4ade80', border: '1px solid #4ade80', textDecoration: 'none', fontWeight: 'bold', fontSize: 12, textAlign: 'center' as const }}>
💬 WhatsApp Customer
</a>
)}
</div>
))}
</>
)}

{/* ANDROS */}
{tab === 'andros' && (
<>
<p style={{ color: '#a78bfa', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>🏝️ Andros Operations</p>
<div style={{ ...card, background: 'linear-gradient(135deg, #1a0a2a, #2a1040)', borderColor: '#7c3aed' }}>
<p style={{ margin: '0 0 10px', color: '#a78bfa', fontWeight: 'bold', fontSize: 13 }}>Ceta's Variety Store · Mastic Point</p>
{[
{ label: 'Andros Orders', value: androsOrders.length + ' total' },
{ label: 'Margin', value: '43%' },
{ label: 'Staff', value: 'Rose Nell Forbes & Johnette Lana Forbes' },
{ label: 'Manager Salary', value: '$1,000/month' },
].map(row => (
<div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #2a1040' }}>
<p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>{row.label}</p>
<p style={{ margin: 0, color: '#a78bfa', fontWeight: 'bold', fontSize: 13 }}>{row.value}</p>
</div>
))}
</div>
<p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 14, marginBottom: 10 }}>Andros Orders</p>
{androsOrders.length === 0 ? <div style={{ ...card, textAlign: 'center', padding: 24 }}><p style={{ color: '#4a5568' }}>No Andros orders yet</p></div> : androsOrders.map(o => (
<div key={o.id} style={card}>
<p style={{ margin: 0, color: '#f5c518', fontSize: 12, fontFamily: 'monospace' }}>{o.order_number}</p>
<p style={{ margin: '2px 0', fontWeight: 'bold' }}>{o.customer_name}</p>
<p style={{ margin: '2px 0', color: '#4a5568', fontSize: 11 }}>{o.delivery_address}</p>
<p style={{ margin: '4px 0 0', color: '#4ade80', fontWeight: 'bold' }}>${Number(o.total).toFixed(2)}</p>
</div>
))}
</>
)}

{/* SUPPLIERS */}
{tab === 'suppliers' && (
<>
<p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>Suppliers Owed</p>
{supplierPayouts.length === 0 ? <div style={{ ...card, textAlign: 'center', padding: 24 }}><p style={{ color: '#4ade80' }}>✅ All suppliers paid</p></div> : (
<>
{Object.entries(supplierPayouts.reduce((acc: any, p) => {
if (!acc[p.supplier_name]) acc[p.supplier_name] = 0;
acc[p.supplier_name] += parseFloat(p.cogs_total) || 0;
return acc;
}, {})).map(([name, amount]) => (
<div key={name} style={{ ...card, borderColor: '#f5c51866' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<div><p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{name}</p><p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>COGS — cost of goods sold</p></div>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 18 }}>${(amount as number).toFixed(2)}</p>
</div>
</div>
))}
<div style={{ ...card, background: 'linear-gradient(135deg, #2d0000, #3b0000)', borderColor: '#f87171' }}>
<div style={{ display: 'flex', justifyContent: 'space-between' }}>
<p style={{ margin: 0, color: '#aaa', fontWeight: 'bold' }}>Total Owed to Suppliers</p>
<p style={{ margin: 0, color: '#f87171', fontWeight: 'bold', fontSize: 22 }}>${totalOwed.toFixed(2)}</p>
</div>
</div>
</>
)}
</>
)}

{/* INVENTORY */}
{tab === 'inventory' && (
<>
<p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>⚠️ Low Stock — Reorder Alert</p>
{lowStock.length === 0 ? <div style={{ ...card, textAlign: 'center', padding: 24 }}><p style={{ color: '#4ade80' }}>✅ All stock healthy</p></div> : lowStock.map(p => (
<div key={p.id} style={{ ...card, borderColor: p.stock_qty <= 3 ? '#f87171' : '#f5c51866' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{p.name}</p>
<p style={{ margin: '2px 0', color: '#4a5568', fontSize: 11 }}>Supplier: {p.supplier_name}</p>
<p style={{ margin: '2px 0', color: '#4a5568', fontSize: 11 }}>Cost: ${p.unit_cost?.toFixed(2) || '0.00'}/unit</p>
</div>
<div style={{ textAlign: 'right' as const }}>
<span style={{ backgroundColor: p.stock_qty <= 3 ? '#7f1d1d' : '#1a1400', color: p.stock_qty <= 3 ? '#f87171' : '#f5c518', borderRadius: 20, padding: '3px 10px', fontSize: 13, fontWeight: 'bold' }}>{p.stock_qty} left</span>
</div>
</div>
</div>
))}
</>
)}
</div>
</div>
);
}
