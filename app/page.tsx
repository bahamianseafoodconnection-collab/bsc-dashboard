// File: app/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { fetchFinancialsFromDB, getFinancialSummary } from '../lib/finance';
import { fetchInvoicesFromDB, type Invoice } from '../lib/invoices';
import { products } from '../lib/store';

const supabase = createClient(
'https://auqjjrisivhfmpleusyt.supabase.co',
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg'
);

type AIMessage = { role: 'user' | 'ai'; text: string };
type Supplier = { id: string; full_name: string; company_name: string; email: string; whatsapp: string; category: string; status: string; };
type SupplierProduct = { id: string; name: string; category: string; sku: string; retail_price: number; wholesale_price: number; duty_rate: number; supplier_id: string; supplier_name: string; supplier_whatsapp: string; photo_url: string; status: string; };

export default function Dashboard() {
const [finance, setFinance] = useState({ revenue: 0, profit: 0, supplierOwed: 0, transactions: 0 });
const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
const [loading, setLoading] = useState(true);
const [activeTab, setActiveTab] = useState<'overview' | 'profit' | 'suppliers' | 'ai'>('overview');

// SUPPLIER ADMIN STATE
const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
const [allProducts, setAllProducts] = useState<SupplierProduct[]>([]);
const [supplierTab, setSupplierTab] = useState<'applications' | 'products'>('applications');
const [supplierLoading, setSupplierLoading] = useState(false);

// AI STATE
const [aiMessages, setAiMessages] = useState<AIMessage[]>([
{ role: 'ai', text: 'Hi! I am your BSC AI assistant. Ask me anything about your business performance, supplier payments, or how to grow BSC.' }
]);
const [aiInput, setAiInput] = useState('');
const [aiLoading, setAiLoading] = useState(false);

useEffect(() => {
async function load() {
await fetchFinancialsFromDB();
const summary = getFinancialSummary();
setFinance(summary);
const invoices = await fetchInvoicesFromDB();
setRecentInvoices(invoices.slice(0, 20));
setLoading(false);
}
load();
}, []);

useEffect(() => {
if (activeTab === 'suppliers') loadSupplierData();
}, [activeTab]);

async function loadSupplierData() {
setSupplierLoading(true);
const { data: suppliers } = await supabase.from('suppliers').select('*').order('created_at', { ascending: false });
if (suppliers) setAllSuppliers(suppliers);
const { data: prods } = await supabase.from('supplier_products').select('*').order('created_at', { ascending: false });
if (prods) setAllProducts(prods);
setSupplierLoading(false);
}

async function approveSupplier(id: string) {
await supabase.from('suppliers').update({ status: 'approved' }).eq('id', id);
setAllSuppliers(prev => prev.map(s => s.id === id ? { ...s, status: 'approved' } : s));
}

async function rejectSupplier(id: string) {
await supabase.from('suppliers').update({ status: 'rejected' }).eq('id', id);
setAllSuppliers(prev => prev.map(s => s.id === id ? { ...s, status: 'rejected' } : s));
}

async function approveProduct(id: string) {
await supabase.from('supplier_products').update({ status: 'approved' }).eq('id', id);
setAllProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'approved' } : p));
}

async function rejectProduct(id: string) {
await supabase.from('supplier_products').update({ status: 'rejected' }).eq('id', id);
setAllProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'rejected' } : p));
}

const lowStockItems = products.filter((p) => p.stock <= p.minStock + 2);
const avgTransaction = finance.transactions > 0 ? (finance.revenue / finance.transactions).toFixed(2) : '0.00';
const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

const posInvoices = recentInvoices.filter(inv => !inv.customerName.includes('DELIVERY') && !inv.customerName.includes('PICKUP'));
const marketInvoices = recentInvoices.filter(inv => inv.customerName.includes('DELIVERY') || inv.customerName.includes('PICKUP'));
const posRevenue = posInvoices.reduce((s, i) => s + i.total, 0);
const marketRevenue = marketInvoices.reduce((s, i) => s + i.total, 0);
const posProfit = posRevenue * 0.07;
const marketProfit = marketRevenue * 0.25;
const totalProfit = posProfit + marketProfit;

type SupplierPayout = { name: string; owed: number; invoiceCount: number };
const supplierMap: Record<string, SupplierPayout> = {};
recentInvoices.forEach(inv => {
inv.items.forEach((item: any) => {
const sup = item.supplierName || 'Unknown Supplier';
const itemTotal = item.total || item.qty * item.price;
if (!supplierMap[sup]) supplierMap[sup] = { name: sup, owed: 0, invoiceCount: 0 };
supplierMap[sup].owed += itemTotal * 0.93;
supplierMap[sup].invoiceCount += 1;
});
});
const supplierPayouts = Object.values(supplierMap).sort((a, b) => b.owed - a.owed);

async function handleAiSend() {
if (!aiInput.trim()) return;
const userMsg = aiInput.trim();
setAiInput('');
setAiMessages(prev => [...prev, { role: 'user', text: userMsg }]);
setAiLoading(true);
try {
const context = `You are BSC AI for Bahamian Seafood Connection. Data: Revenue $${finance.revenue.toFixed(2)}, Profit $${totalProfit.toFixed(2)}, Supplier Owed $${finance.supplierOwed.toFixed(2)}, Transactions ${finance.transactions}, Avg $${avgTransaction}, POS $${posRevenue.toFixed(2)} (7%), Market $${marketRevenue.toFixed(2)} (25%), Low Stock: ${lowStockItems.map(p => p.name).join(', ') || 'None'}, Suppliers: ${allSuppliers.length} total (${allSuppliers.filter(s => s.status === 'pending').length} pending). Be concise and actionable. Help Dedrick Storr grow BSC.`;
const response = await fetch('/api/ai', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
system: context,
messages: [
...aiMessages.filter((_, i) => i > 0).map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })),
{ role: 'user', content: userMsg },
],
}),
});
const data = await response.json();
const aiReply = data.content?.[0]?.text || 'Sorry, could not process that.';
setAiMessages(prev => [...prev, { role: 'ai', text: aiReply }]);
} catch {
setAiMessages(prev => [...prev, { role: 'ai', text: 'Connection error. Please try again.' }]);
}
setAiLoading(false);
}

const card: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 16, padding: 20, border: '1px solid #1e3a5f', marginBottom: 14 };
const kpiCard: React.CSSProperties = { borderRadius: 16, padding: 20, border: '1px solid #1e3a5f' };
const tabBtn = (active: boolean): React.CSSProperties => ({
flex: 1, padding: '10px 4px', borderRadius: 10,
backgroundColor: active ? '#f5c518' : 'transparent',
color: active ? '#000' : '#6b7280',
border: 'none', fontWeight: active ? 'bold' : 'normal',
fontSize: 11, cursor: 'pointer', letterSpacing: 0.3,
});
const statusBadge = (status: string): React.CSSProperties => ({
padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 'bold',
backgroundColor: status === 'approved' ? '#0a1f0a' : status === 'rejected' ? '#2d0000' : '#1a1400',
color: status === 'approved' ? '#4ade80' : status === 'rejected' ? '#f87171' : '#f5c518',
border: '1px solid ' + (status === 'approved' ? '#4ade80' : status === 'rejected' ? '#f87171' : '#f5c518'),
});

if (loading) return (
<div style={{ minHeight: '100vh', backgroundColor: '#060d1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
<div style={{ textAlign: 'center' }}>
<div style={{ fontSize: 48, marginBottom: 16 }}>🐟</div>
<p style={{ color: '#4a5568', fontSize: 14 }}>Loading BSC Control...</p>
</div>
</div>
);

return (
<div style={{ minHeight: '100vh', backgroundColor: '#060d1f', color: '#fff', fontFamily: "'Inter', -apple-system, sans-serif", paddingBottom: 80 }}>

{/* HEADER */}
<div style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d1f3c 100%)', borderBottom: '1px solid #1e3a5f', padding: '16px 20px', position: 'sticky', top: 0, zIndex: 50 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 900, margin: '0 auto' }}>
<div>
<h1 style={{ margin: 0, color: '#f5c518', fontSize: 22, fontWeight: 'bold' }}>BSC Control</h1>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 10 }}>{today}</p>
</div>
<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
{allSuppliers.filter(s => s.status === 'pending').length > 0 && (
<button
onClick={() => setActiveTab('suppliers')}
style={{ backgroundColor: '#1a1400', color: '#f5c518', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 'bold', border: '1px solid #f5c518', cursor: 'pointer' }}
>
{allSuppliers.filter(s => s.status === 'pending').length} Pending
</button>
)}
{lowStockItems.length > 0 && (
<div style={{ backgroundColor: '#3b0000', color: '#f87171', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 'bold', border: '1px solid #7f1d1d' }}>
{lowStockItems.length} Low Stock
</div>
)}
<div style={{ backgroundColor: '#0a2010', color: '#4ade80', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 'bold', border: '1px solid #4ade80' }}>
LIVE
</div>
</div>
</div>
</div>

<div style={{ padding: '16px 20px 0', maxWidth: 900, margin: '0 auto' }}>

{/* KPI ROW */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
<div style={{ ...kpiCard, background: 'linear-gradient(135deg, #0d1f3c, #132a4a)' }}>
<p style={{ margin: 0, color: '#6b7280', fontSize: 9, letterSpacing: 1 }}>REVENUE</p>
<h2 style={{ margin: '4px 0 0', color: '#fff', fontSize: 18, fontWeight: 'bold' }}>${finance.revenue.toFixed(2)}</h2>
<p style={{ margin: '3px 0 0', color: '#4ade80', fontSize: 9 }}>{finance.transactions} sales</p>
</div>
<div style={{ ...kpiCard, background: 'linear-gradient(135deg, #1a1200, #2a1e00)' }}>
<p style={{ margin: 0, color: '#f5c518aa', fontSize: 9, letterSpacing: 1 }}>BSC PROFIT</p>
<h2 style={{ margin: '4px 0 0', color: '#f5c518', fontSize: 18, fontWeight: 'bold' }}>${totalProfit.toFixed(2)}</h2>
<p style={{ margin: '3px 0 0', color: '#f5c518aa', fontSize: 9 }}>Avg ${avgTransaction}</p>
</div>
<div style={{ ...kpiCard, background: 'linear-gradient(135deg, #001a2a, #002a3a)' }}>
<p style={{ margin: 0, color: '#60a5faaa', fontSize: 9, letterSpacing: 1 }}>OWED</p>
<h2 style={{ margin: '4px 0 0', color: '#60a5fa', fontSize: 18, fontWeight: 'bold' }}>${finance.supplierOwed.toFixed(2)}</h2>
<p style={{ margin: '3px 0 0', color: '#60a5faaa', fontSize: 9 }}>To suppliers</p>
</div>
</div>

{/* TABS */}
<div style={{ display: 'flex', gap: 6, backgroundColor: '#0d1f3c', borderRadius: 14, padding: 6, marginBottom: 16, border: '1px solid #1e3a5f' }}>
{(['overview', 'profit', 'suppliers', 'ai'] as const).map((tab) => (
<button key={tab} onClick={() => setActiveTab(tab)} style={tabBtn(activeTab === tab)}>
{tab === 'overview' ? '📊 Overview' : tab === 'profit' ? '💰 Profit' : tab === 'suppliers' ? '🚢 Suppliers' + (allSuppliers.filter(s => s.status === 'pending').length > 0 ? ' 🔴' : '') : '🤖 AI'}
</button>
))}
</div>

{/* ── OVERVIEW TAB ── */}
{activeTab === 'overview' && (
<>
{/* SUPPLIER ALERT CARD */}
{allSuppliers.filter(s => s.status === 'pending').length > 0 && (
<div
onClick={() => setActiveTab('suppliers')}
style={{ ...card, borderColor: '#f5c518', backgroundColor: '#1a1200', cursor: 'pointer', padding: '14px 16px' }}
>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<div>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>
🚢 {allSuppliers.filter(s => s.status === 'pending').length} Supplier Application{allSuppliers.filter(s => s.status === 'pending').length > 1 ? 's' : ''} Pending
</p>
<p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 12 }}>Tap to review and approve</p>
</div>
<span style={{ color: '#f5c518', fontSize: 20 }}>›</span>
</div>
</div>
)}

{/* REVENUE STREAMS */}
<div style={card}>
<p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Revenue Streams</p>
{[
{ label: 'POS Sales', revenue: posRevenue, profit: posProfit, margin: '7%', color: '#4ade80', count: posInvoices.length },
{ label: 'Marketplace Orders', revenue: marketRevenue, profit: marketProfit, margin: '25%', color: '#60a5fa', count: marketInvoices.length },
].map((stream) => (
<div key={stream.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e3a5f' }}>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{stream.label}</p>
<p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: 11 }}>{stream.count} orders · {stream.margin} margin</p>
</div>
<div style={{ textAlign: 'right' }}>
<p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 14 }}>${stream.revenue.toFixed(2)}</p>
<p style={{ margin: '2px 0 0', color: stream.color, fontSize: 11, fontWeight: 'bold' }}>+${stream.profit.toFixed(2)}</p>
</div>
</div>
))}
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>Total BSC Profit</p>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>${totalProfit.toFixed(2)}</p>
</div>
</div>

{/* RECENT ORDERS */}
<div style={{ marginBottom: 16 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Recent Orders</p>
<Link href="/report" style={{ color: '#60a5fa', fontSize: 12, textDecoration: 'none' }}>View All</Link>
</div>
{recentInvoices.slice(0, 5).map((inv) => {
const isMarket = inv.customerName.includes('DELIVERY') || inv.customerName.includes('PICKUP');
const nameParts = inv.customerName.split(' | ');
const customerName = nameParts[0];
const deliveryNote = nameParts[1] || null;
return (
<Link key={inv.id} href={'/invoice?id=' + inv.id} style={{ textDecoration: 'none' }}>
<div style={{ ...card, marginBottom: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
<div style={{ flex: 1 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
<span style={{ fontSize: 11 }}>{isMarket ? '🏪' : '🛒'}</span>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{customerName}</p>
</div>
{deliveryNote && <p style={{ margin: '1px 0', color: '#f5c518', fontSize: 10 }}>{deliveryNote}</p>}
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>{inv.date}</p>
</div>
<div style={{ textAlign: 'right' }}>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>${inv.total.toFixed(2)}</p>
<p style={{ margin: '2px 0 0', color: isMarket ? '#60a5fa' : '#4ade80', fontSize: 10 }}>+${(inv.total * (isMarket ? 0.25 : 0.07)).toFixed(2)}</p>
</div>
</div>
</Link>
);
})}
</div>

{/* QUICK ACTIONS */}
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
<Link href="/pos" style={{ background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', fontSize: 14, padding: '16px 10px', borderRadius: 16, textAlign: 'center', textDecoration: 'none', display: 'block' }}>🛒 Open POS</Link>
<Link href="/market" style={{ background: 'linear-gradient(135deg, #0d1f3c, #132a4a)', color: '#fff', fontWeight: 'bold', fontSize: 14, padding: '16px 10px', borderRadius: 16, textAlign: 'center', textDecoration: 'none', display: 'block', border: '1px solid #1e3a5f' }}>🏪 Market</Link>
<Link href="/inventory" style={{ background: 'linear-gradient(135deg, #0d1f3c, #132a4a)', color: '#60a5fa', fontWeight: 'bold', fontSize: 13, padding: '14px 10px', borderRadius: 16, textAlign: 'center', textDecoration: 'none', display: 'block', border: '1px solid #1e3a5f' }}>📦 Inventory</Link>
<button onClick={() => setActiveTab('suppliers')} style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', color: '#f5c518', fontWeight: 'bold', fontSize: 13, padding: '14px 10px', borderRadius: 16, textAlign: 'center', border: '1px solid #f5c51833', cursor: 'pointer', position: 'relative' as const }}>
🚢 Suppliers
{allSuppliers.filter(s => s.status === 'pending').length > 0 && (
<span style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#f87171', borderRadius: '50%', width: 16, height: 16, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#fff' }}>
{allSuppliers.filter(s => s.status === 'pending').length}
</span>
)}
</button>
</div>

{lowStockItems.length > 0 && (
<div style={{ ...card, borderColor: '#7f1d1d', backgroundColor: '#1a0808' }}>
<p style={{ margin: '0 0 10px', color: '#f87171', fontWeight: 'bold', fontSize: 14 }}>⚠️ Low Stock</p>
{lowStockItems.map((p) => (
<div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
<p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{p.name}</p>
<p style={{ margin: 0, color: '#f87171', fontSize: 13, fontWeight: 'bold' }}>{p.stock} left</p>
</div>
))}
</div>
)}
</>
)}

{/* ── PROFIT TAB ── */}
{activeTab === 'profit' && (
<>
<div style={card}>
<p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Profit by Stream</p>
{[
{ label: 'POS Sales', revenue: posRevenue, profit: posProfit, rate: '7%', icon: '🛒', color: '#4ade80' },
{ label: 'Marketplace', revenue: marketRevenue, profit: marketProfit, rate: '25%', icon: '🏪', color: '#60a5fa' },
{ label: 'Wholesale', revenue: 0, profit: 0, rate: '12%', icon: '📦', color: '#f5c518' },
{ label: 'Utility Bills', revenue: 0, profit: 0, rate: '$5 + 5%', icon: '⚡', color: '#a78bfa' },
].map((item) => (
<div key={item.label} style={{ backgroundColor: '#060d1f', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #1e3a5f' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
<span style={{ fontSize: 20 }}>{item.icon}</span>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{item.label}</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>BSC: {item.rate}</p>
</div>
</div>
<div style={{ textAlign: 'right' }}>
<p style={{ margin: 0, color: '#fff', fontSize: 13 }}>${item.revenue.toFixed(2)}</p>
<p style={{ margin: '2px 0 0', color: item.color, fontWeight: 'bold', fontSize: 13 }}>${item.profit.toFixed(2)}</p>
</div>
</div>
</div>
))}
<div style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', borderRadius: 12, padding: '14px 16px', border: '1px solid #f5c51833', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Total BSC Profit</p>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 20 }}>${totalProfit.toFixed(2)}</p>
</div>
</div>

<div style={card}>
<p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Daily Summary</p>
{[
{ label: 'Total Revenue', value: '$' + finance.revenue.toFixed(2), color: '#fff' },
{ label: 'BSC Profit', value: '$' + totalProfit.toFixed(2), color: '#f5c518' },
{ label: 'Supplier Owed', value: '$' + finance.supplierOwed.toFixed(2), color: '#60a5fa' },
{ label: 'Total Orders', value: String(finance.transactions), color: '#4ade80' },
{ label: 'Avg Order', value: '$' + avgTransaction, color: '#aaa' },
].map((row) => (
<div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #1e3a5f' }}>
<p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>{row.label}</p>
<p style={{ margin: 0, color: row.color, fontWeight: 'bold', fontSize: 13 }}>{row.value}</p>
</div>
))}
</div>

<div style={card}>
<p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Supplier Payouts</p>
<p style={{ margin: '0 0 12px', color: '#4a5568', fontSize: 12 }}>93% of each sale goes to supplier</p>
{supplierPayouts.length === 0 ? (
<p style={{ color: '#4a5568', fontSize: 13, textAlign: 'center' }}>No supplier data yet</p>
) : supplierPayouts.map((sup) => (
<div key={sup.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #1e3a5f' }}>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{sup.name}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{sup.invoiceCount} items</p>
</div>
<p style={{ margin: 0, color: '#60a5fa', fontWeight: 'bold', fontSize: 15 }}>${sup.owed.toFixed(2)}</p>
</div>
))}
</div>
</>
)}

{/* ── SUPPLIERS TAB ── */}
{activeTab === 'suppliers' && (
<>
{/* SUPPLIER STATS */}
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
<div style={{ ...card, textAlign: 'center', padding: 14, marginBottom: 0 }}>
<p style={{ margin: 0, color: '#f5c518', fontSize: 20, fontWeight: 'bold' }}>{allSuppliers.filter(s => s.status === 'pending').length}</p>
<p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 10 }}>PENDING</p>
</div>
<div style={{ ...card, textAlign: 'center', padding: 14, marginBottom: 0 }}>
<p style={{ margin: 0, color: '#4ade80', fontSize: 20, fontWeight: 'bold' }}>{allSuppliers.filter(s => s.status === 'approved').length}</p>
<p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 10 }}>APPROVED</p>
</div>
<div style={{ ...card, textAlign: 'center', padding: 14, marginBottom: 0 }}>
<p style={{ margin: 0, color: '#60a5fa', fontSize: 20, fontWeight: 'bold' }}>{allProducts.filter(p => p.status === 'pending').length}</p>
<p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 10 }}>PRODUCTS</p>
</div>
</div>

{/* SUPPLIER SUB-TABS */}
<div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
<button
onClick={() => setSupplierTab('applications')}
style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: supplierTab === 'applications' ? '#f5c518' : '#0d1f3c', color: supplierTab === 'applications' ? '#000' : '#6b7280', border: '1px solid #1e3a5f', fontWeight: 'bold', cursor: 'pointer', fontSize: 12 }}
>
Applications ({allSuppliers.length})
</button>
<button
onClick={() => setSupplierTab('products')}
style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: supplierTab === 'products' ? '#f5c518' : '#0d1f3c', color: supplierTab === 'products' ? '#000' : '#6b7280', border: '1px solid #1e3a5f', fontWeight: 'bold', cursor: 'pointer', fontSize: 12 }}
>
Products ({allProducts.filter(p => p.status === 'pending').length} pending)
</button>
</div>

{supplierLoading && <p style={{ color: '#4a5568', textAlign: 'center', padding: 20 }}>Loading...</p>}

{/* APPLICATIONS LIST */}
{!supplierLoading && supplierTab === 'applications' && (
<>
{allSuppliers.length === 0 && (
<div style={{ ...card, textAlign: 'center', padding: 30 }}>
<p style={{ margin: 0, color: '#4a5568' }}>No supplier applications yet</p>
</div>
)}
{allSuppliers.map((sup) => {
const supProducts = allProducts.filter(p => p.supplier_id === sup.id);
return (
<div key={sup.id} style={{ ...card, borderColor: sup.status === 'pending' ? '#f5c518' : '#1e3a5f' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>{sup.full_name}</p>
<p style={{ margin: '2px 0', color: '#aaa', fontSize: 13 }}>{sup.company_name}</p>
<p style={{ margin: '2px 0', color: '#60a5fa', fontSize: 12 }}>{sup.email}</p>
</div>
<span style={statusBadge(sup.status)}>{sup.status.toUpperCase()}</span>
</div>
<div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' as const }}>
<span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, backgroundColor: '#060d1f', color: '#a78bfa', border: '1px solid #1e3a5f' }}>
{sup.category}
</span>
{sup.whatsapp && (
<a href={'https://wa.me/' + sup.whatsapp.replace(/\D/g, '')} target="_blank" rel="noopener noreferrer"
style={{ padding: '3px 12px', borderRadius: 20, fontSize: 11, backgroundColor: '#0a2010', color: '#4ade80', border: '1px solid #4ade80', textDecoration: 'none', fontWeight: 'bold' }}>
WhatsApp {sup.whatsapp}
</a>
)}
</div>

{/* INLINE PRODUCTS */}
{supProducts.length > 0 && (
<div style={{ marginBottom: 12 }}>
<p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>SUBMITTED PRODUCTS ({supProducts.length})</p>
{supProducts.map((prod) => (
<div key={prod.id} style={{ backgroundColor: '#060d1f', borderRadius: 10, padding: '10px 12px', marginBottom: 6, border: '1px solid #1e3a5f' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
{prod.photo_url && <img src={prod.photo_url} alt={prod.name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />}
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 12 }}>{prod.name}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>{prod.category}</p>
</div>
</div>
<span style={statusBadge(prod.status)}>{prod.status.toUpperCase()}</span>
</div>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: prod.status === 'pending' ? 8 : 0 }}>
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 6, padding: '5px 8px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>RETAIL</p>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 11 }}>${prod.retail_price?.toFixed(2) || '0.00'}</p>
</div>
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 6, padding: '5px 8px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>WHOLESALE</p>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 11 }}>${prod.wholesale_price?.toFixed(2) || '0.00'}</p>
</div>
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 6, padding: '5px 8px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>DUTY</p>
<p style={{ margin: 0, color: '#60a5fa', fontWeight: 'bold', fontSize: 11 }}>{((prod.duty_rate || 0) * 100).toFixed(0)}%</p>
</div>
</div>
{prod.status === 'pending' && (
<div style={{ display: 'flex', gap: 6 }}>
<button onClick={() => approveProduct(prod.id)} style={{ flex: 1, padding: '7px', borderRadius: 8, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 11 }}>Approve</button>
<button onClick={() => rejectProduct(prod.id)} style={{ flex: 1, padding: '7px', borderRadius: 8, backgroundColor: '#3b0000', color: '#f87171', border: '1px solid #7f1d1d', cursor: 'pointer', fontSize: 11 }}>Reject</button>
</div>
)}
</div>
))}
</div>
)}

{sup.status === 'pending' && (
<div style={{ display: 'flex', gap: 8 }}>
<button onClick={() => approveSupplier(sup.id)} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 13 }}>
Approve Supplier
</button>
<button onClick={() => rejectSupplier(sup.id)} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#3b0000', color: '#f87171', border: '1px solid #7f1d1d', cursor: 'pointer', fontSize: 13 }}>
Reject
</button>
</div>
)}
</div>
);
})}
</>
)}

{/* PRODUCTS LIST */}
{!supplierLoading && supplierTab === 'products' && (
<>
{allProducts.length === 0 && (
<div style={{ ...card, textAlign: 'center', padding: 30 }}>
<p style={{ margin: 0, color: '#4a5568' }}>No products submitted yet</p>
</div>
)}
{allProducts.map((prod) => (
<div key={prod.id} style={card}>
<div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
{prod.photo_url && <img src={prod.photo_url} alt={prod.name} style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />}
<div style={{ flex: 1 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{prod.name}</p>
<span style={statusBadge(prod.status)}>{prod.status.toUpperCase()}</span>
</div>
<p style={{ margin: '2px 0', color: '#4a5568', fontSize: 12 }}>By {prod.supplier_name}</p>
{prod.supplier_whatsapp && (
<a href={'https://wa.me/' + prod.supplier_whatsapp.replace(/\D/g, '')} target="_blank" rel="noopener noreferrer"
style={{ color: '#4ade80', fontSize: 11, textDecoration: 'none' }}>
WhatsApp {prod.supplier_whatsapp}
</a>
)}
</div>
</div>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
<div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>RETAIL</p>
<p style={{ margin: '2px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>${prod.retail_price?.toFixed(2) || '0.00'}</p>
</div>
<div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>WHOLESALE</p>
<p style={{ margin: '2px 0 0', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>${prod.wholesale_price?.toFixed(2) || '0.00'}</p>
</div>
<div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>DUTY</p>
<p style={{ margin: '2px 0 0', color: '#60a5fa', fontWeight: 'bold', fontSize: 13 }}>{((prod.duty_rate || 0) * 100).toFixed(0)}%</p>
</div>
</div>
{prod.status === 'pending' && (
<div style={{ display: 'flex', gap: 8 }}>
<button onClick={() => approveProduct(prod.id)} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 13 }}>Approve & Go Live</button>
<button onClick={() => rejectProduct(prod.id)} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#3b0000', color: '#f87171', border: '1px solid #7f1d1d', cursor: 'pointer', fontSize: 13 }}>Reject</button>
</div>
)}
</div>
))}
</>
)}

<Link href="/supplier" style={{ textDecoration: 'none' }}>
<div style={{ ...card, textAlign: 'center', cursor: 'pointer', background: 'linear-gradient(135deg, #0d1f3c, #132a4a)' }}>
<p style={{ margin: 0, color: '#a78bfa', fontWeight: 'bold', fontSize: 14 }}>🚢 Open Full Supplier Portal</p>
</div>
</Link>
</>
)}

{/* ── AI TAB ── */}
{activeTab === 'ai' && (
<div style={{ ...card, padding: 0, overflow: 'hidden' }}>
<div style={{ padding: '14px 16px', borderBottom: '1px solid #1e3a5f', background: 'linear-gradient(135deg, #0d1f3c, #132a4a)' }}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>🤖 BSC AI Assistant</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>Powered by Claude · Live business data</p>
</div>
<div style={{ height: 340, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
{aiMessages.map((msg, i) => (
<div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
<div style={{
maxWidth: '85%', padding: '10px 14px', fontSize: 13, lineHeight: 1.5,
borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
backgroundColor: msg.role === 'user' ? '#f5c518' : '#0d1f3c',
color: msg.role === 'user' ? '#000' : '#fff',
border: msg.role === 'ai' ? '1px solid #1e3a5f' : 'none',
}}>
{msg.text}
</div>
</div>
))}
{aiLoading && (
<div style={{ display: 'flex', justifyContent: 'flex-start' }}>
<div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 2px', backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', color: '#4a5568', fontSize: 13 }}>
Thinking...
</div>
</div>
)}
</div>
<div style={{ padding: '12px 14px', borderTop: '1px solid #1e3a5f', display: 'flex', gap: 8, alignItems: 'center' }}>
<input
placeholder="Ask about profits, suppliers, growth..."
value={aiInput}
onChange={(e) => setAiInput(e.target.value)}
onKeyDown={(e) => e.key === 'Enter' && handleAiSend()}
style={{ flex: 1, padding: '10px 14px', borderRadius: 10, backgroundColor: '#060d1f', color: '#fff', border: '1px solid #1e3a5f', fontSize: 13, outline: 'none' }}
/>
<button onClick={handleAiSend} disabled={aiLoading}
style={{ padding: '10px 16px', borderRadius: 10, backgroundColor: aiLoading ? '#555' : '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: aiLoading ? 'not-allowed' : 'pointer', fontSize: 13 }}>
Send
</button>
</div>
</div>
)}

</div>
</div>
);
}
