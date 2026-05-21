// File: app/jaquel/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import AddInventoryButton from '@/components/intake/AddInventoryButton';

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

export default function JaquelDashboard() {
const router = useRouter();
const [orders, setOrders] = useState<any[]>([]);
const [payouts, setPayouts] = useState<any[]>([]);
const [utilPayments, setUtilPayments] = useState<any[]>([]);
const [suppliers, setSuppliers] = useState<any[]>([]);
const [staffRoster, setStaffRoster] = useState<any[]>([]);
const [schedules, setSchedules] = useState<any[]>([]);
const [loading, setLoading] = useState(true);
const [tab, setTab] = useState<'overview' | 'payments' | 'utilities' | 'staff' | 'expenses'>('overview');

useEffect(() => { checkAuth(); loadData(); }, []);

async function checkAuth() {
const { data: { session } } = await supabase.auth.getSession();
if (!session?.user) { router.push('/login'); return; }
const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
if (!['basic_admin', 'control_admin', 'founder', 'co_founder'].includes(p?.role)) router.push('/login');
}

async function loadData() {
try {
const [o, py, u, s, sr] = await Promise.all([
supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(50),
supabase.from('supplier_payouts').select('*').order('created_at', { ascending: false }),
supabase.from('utility_payments').select('*').order('created_at', { ascending: false }).limit(30),
supabase.from('suppliers').select('*').order('created_at', { ascending: false }),
supabase.from('staff_roster').select('*').order('full_name'),
]);
if (o.data) setOrders(o.data);
if (py.data) setPayouts(py.data);
if (u.data) setUtilPayments(u.data);
if (s.data) setSuppliers(s.data);
if (sr.data) setStaffRoster(sr.data);
} catch (e) {}
setLoading(false);
}

async function confirmSupplierPaid(supplierId: string) {
await supabase.from('supplier_payouts').update({ paid: true }).eq('supplier_id', supplierId).eq('paid', false);
await loadData();
}

async function markUtilityProcessed(id: string) {
await supabase.from('utility_payments').update({ payment_status: 'completed' }).eq('id', id);
await loadData();
}

const unpaidPayouts = payouts.filter(p => !p.paid);
const pendingOrders = orders.filter(o => o.status === 'pending');
const paidOrders = orders.filter(o => o.payment_status === 'paid');
const pendingUtils = utilPayments.filter(p => p.payment_status?.startsWith('pending'));
const totalOwed = unpaidPayouts.reduce((s, p) => s + (parseFloat(p.cogs_total) || 0), 0);
const totalUtilFees = utilPayments.filter(p => p.payment_status === 'completed').reduce((s, p) => s + (p.service_fee || 0), 0);

const pg: React.CSSProperties = { backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: "'Inter', sans-serif", paddingBottom: 80 };
const card: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 14, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 12 };

if (loading) return <div style={{ ...pg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 48 }}>👁</div><p style={{ color: '#4a5568' }}>Loading Jaquel Dashboard...</p></div></div>;

return (
<div style={pg}>
<div style={{ background: 'linear-gradient(135deg, #070e1d, #0d1f3c)', borderBottom: '1px solid #1e3a5f', padding: '14px 18px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 640, margin: '0 auto' }}>
<div>
<p style={{ margin: 0, color: '#a78bfa', fontWeight: 'bold', fontSize: 16 }}>👁 Oversight Dashboard</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>Jaquel Storr · Oversight & Compliance</p>
</div>
<div style={{ display: 'flex', gap: 8 }}>
<AddInventoryButton role="co_founder" variant="primary" label="+ Add" icon="📷" />
<Link href="/pos" style={{ padding: '7px 12px', borderRadius: 10, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', fontSize: 12, textDecoration: 'none' }}>🛒 POS</Link>
<button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} style={{ padding: '7px 12px', borderRadius: 10, backgroundColor: '#0d1f3c', color: '#6b7280', border: '1px solid #1e3a5f', fontSize: 12, cursor: 'pointer' }}>Out</button>
</div>
</div>
</div>

<div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 18px' }}>
{/* KPI */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 20 }}>
{[
{ label: 'PENDING ORDERS', value: String(pendingOrders.length), color: '#f5c518' },
{ label: 'SUPPLIER OWED', value: '$' + totalOwed.toFixed(0), color: '#f87171' },
{ label: 'UTIL PENDING', value: String(pendingUtils.length), color: '#60a5fa' },
{ label: 'UTIL FEES', value: '$' + totalUtilFees.toFixed(0), color: '#4ade80' },
].map(k => (
<div key={k.label} style={{ ...card, textAlign: 'center', padding: 12, marginBottom: 0 }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 8, letterSpacing: 1 }}>{k.label}</p>
<p style={{ margin: '4px 0 0', color: k.color, fontWeight: 'bold', fontSize: 16 }}>{k.value}</p>
</div>
))}
</div>

{/* TABS */}
<div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' as const }}>
{[
{ key: 'overview', label: '📊 Overview' },
{ key: 'payments', label: '💳 Payments' },
{ key: 'utilities', label: '⚡ Utilities' },
{ key: 'staff', label: '👥 Staff' },
{ key: 'expenses', label: '💸 Expenses' },
].map(t => (
<button key={t.key} onClick={() => setTab(t.key as any)} style={{ padding: '8px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' as const, flexShrink: 0, backgroundColor: tab === t.key ? '#a78bfa' : '#0d1f3c', color: tab === t.key ? '#000' : '#6b7280' }}>
{t.label}
</button>
))}
</div>

{tab === 'overview' && (
<div style={card}>
<p style={{ margin: '0 0 12px', color: '#a78bfa', fontWeight: 'bold', fontSize: 14 }}>👁 My Responsibilities</p>
{[
{ icon: '✅', task: 'Confirm all approved customer payments (' + paidOrders.length + ' paid orders)', urgent: false },
{ icon: '💳', task: 'Commit all supplier payments — $' + totalOwed.toFixed(2) + ' owed', urgent: totalOwed > 0 },
{ icon: '⚡', task: 'Manage utility bill payments — ' + pendingUtils.length + ' pending', urgent: pendingUtils.length > 0 },
{ icon: '👥', task: 'Staff administration & work scheduling (' + staffRoster.length + ' staff)', urgent: false },
{ icon: '👀', task: "Oversee Ashley's work and confirm her tasks are complete", urgent: false },
{ icon: '💸', task: 'Track all fixed expenses — $' + TOTAL_FIXED.toLocaleString() + '/month', urgent: false },
].map((r, i) => (
<div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #1e3a5f' }}>
<span style={{ fontSize: 16 }}>{r.icon}</span>
<p style={{ margin: 0, color: r.urgent ? '#f5c518' : '#aaa', fontSize: 13 }}>{r.task}</p>
{r.urgent && <span style={{ backgroundColor: '#f87171', color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 'bold', flexShrink: 0 }}>!</span>}
</div>
))}
</div>
)}

{tab === 'payments' && (
<>
<p style={{ color: '#a78bfa', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>💳 Supplier Payment Confirmations</p>
{unpaidPayouts.length === 0 ? <div style={{ ...card, textAlign: 'center', padding: 24 }}><p style={{ color: '#4ade80' }}>✅ All suppliers paid</p></div> : (
Object.entries(unpaidPayouts.reduce((acc: any, p) => {
if (!acc[p.supplier_id]) acc[p.supplier_id] = { name: p.supplier_name, total: 0, id: p.supplier_id };
acc[p.supplier_id].total += parseFloat(p.cogs_total) || 0;
return acc;
}, {})).map(([id, data]: any) => (
<div key={id} style={{ ...card, borderColor: '#a78bfa44' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
<div><p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>{data.name}</p><p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>COGS owed from sold products</p></div>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 20 }}>${data.total.toFixed(2)}</p>
</div>
<button onClick={() => confirmSupplierPaid(id)} style={{ width: '100%', padding: '11px', borderRadius: 10, backgroundColor: '#a78bfa', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 14 }}>
✅ Confirm Payment to {data.name}
</button>
</div>
))
)}
</>
)}

{tab === 'utilities' && (
<>
<p style={{ color: '#60a5fa', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>⚡ Utility Bill Payments</p>
{utilPayments.map(u => (
<div key={u.id} style={{ ...card, borderColor: u.payment_status?.startsWith('pending') ? '#f5c51866' : '#1e3a5f' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{u.customer_name}</p>
<p style={{ margin: '2px 0', color: '#60a5fa', fontSize: 12 }}>{u.utility_company}</p>
<p style={{ margin: '2px 0', color: '#4a5568', fontSize: 11 }}>Ref: {u.reference_number}</p>
</div>
<div style={{ textAlign: 'right' as const }}>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 16 }}>${Number(u.total_charged).toFixed(2)}</p>
<p style={{ margin: '2px 0 0', color: u.payment_status === 'completed' ? '#4ade80' : '#f5c518', fontSize: 11, fontWeight: 'bold' }}>{u.payment_status?.replace('_', ' ').toUpperCase()}</p>
</div>
</div>
{u.payment_status?.startsWith('pending') && (
<button onClick={() => markUtilityProcessed(u.id)} style={{ width: '100%', padding: '9px', borderRadius: 10, backgroundColor: '#0a1f0a', color: '#4ade80', border: '1px solid #4ade80', fontWeight: 'bold', fontSize: 13, cursor: 'pointer' }}>
✅ Mark Processed
</button>
)}
</div>
))}
</>
)}

{tab === 'staff' && (
<>
<p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>👥 Staff Administration ({staffRoster.length})</p>
{staffRoster.map(s => (
<div key={s.id} style={{ ...card }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{s.full_name}</p>
<p style={{ margin: '2px 0', color: '#60a5fa', fontSize: 12 }}>{s.position}</p>
<p style={{ margin: '2px 0', color: '#4a5568', fontSize: 11 }}>{s.email}</p>
{s.notes && <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 11, fontStyle: 'italic' }}>{s.notes}</p>}
</div>
<span style={{ backgroundColor: s.location === 'Andros' ? '#1a0a2a' : '#001a2a', color: s.location === 'Andros' ? '#a78bfa' : '#60a5fa', borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 'bold' }}>{s.location || 'Nassau'}</span>
</div>
</div>
))}
</>
)}

{tab === 'expenses' && (
<>
<p style={{ color: '#f87171', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>💸 Monthly Fixed Expenses</p>
<div style={{ ...card, background: 'linear-gradient(135deg, #2d0000, #3b0000)', borderColor: '#f87171' }}>
<p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 10 }}>TOTAL MONTHLY FIXED</p>
<p style={{ margin: 0, color: '#f87171', fontWeight: 'bold', fontSize: 28 }}>${TOTAL_FIXED.toLocaleString()}</p>
</div>
{MONTHLY_EXPENSES.map(e => (
<div key={e.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1e3a5f' }}>
<p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{e.label}</p>
<p style={{ margin: 0, color: '#f87171', fontWeight: 'bold', fontSize: 14 }}>${e.amount.toLocaleString()}</p>
</div>
))}
</>
)}
</div>
</div>
);
}
