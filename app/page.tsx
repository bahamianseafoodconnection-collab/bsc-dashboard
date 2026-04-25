// File: app/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchFinancialsFromDB, getFinancialSummary } from '../lib/finance';
import { fetchInvoicesFromDB, type Invoice } from '../lib/invoices';
import { products } from '../lib/store';

type AIMessage = { role: 'user' | 'ai'; text: string };

export default function Dashboard() {
const [finance, setFinance] = useState({
revenue: 0, profit: 0, supplierOwed: 0, transactions: 0,
});
const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
const [loading, setLoading] = useState(true);
const [activeTab, setActiveTab] = useState<'overview' | 'profit' | 'suppliers' | 'ai'>('overview');
const [aiMessages, setAiMessages] = useState<AIMessage[]>([
{ role: 'ai', text: 'Hi Dedrick! I am your BSC AI assistant. Ask me anything about your business performance, supplier payments, or how to grow BSC.' }
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

const lowStockItems = products.filter((p) => p.stock <= p.minStock + 2);
const avgTransaction = finance.transactions > 0
? (finance.revenue / finance.transactions).toFixed(2) : '0.00';

const today = new Date().toLocaleDateString('en-US', {
weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
});

const posInvoices = recentInvoices.filter(inv =>
!inv.customerName.includes('DELIVERY') && !inv.customerName.includes('PICKUP')
);
const marketInvoices = recentInvoices.filter(inv =>
inv.customerName.includes('DELIVERY') || inv.customerName.includes('PICKUP')
);
const posRevenue = posInvoices.reduce((s, i) => s + i.total, 0);
const marketRevenue = marketInvoices.reduce((s, i) => s + i.total, 0);
const posProfit = posRevenue * 0.07;
const marketProfit = marketRevenue * 0.25;
const totalProfit = posProfit + marketProfit;

type SupplierPayout = { name: string; owed: number; invoiceCount: number };
const supplierMap: Record<string, SupplierPayout> = {};
recentInvoices.forEach(inv => {
inv.items.forEach((item: any) => {
const supplier = item.supplierName || 'Unknown Supplier';
const itemTotal = item.total || item.qty * item.price;
const supplierShare = itemTotal * 0.93;
if (!supplierMap[supplier]) {
supplierMap[supplier] = { name: supplier, owed: 0, invoiceCount: 0 };
}
supplierMap[supplier].owed += supplierShare;
supplierMap[supplier].invoiceCount += 1;
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
const context = `You are BSC AI, the business intelligence assistant for Bahamian Seafood Connection (BSC).
Current data: Revenue $${finance.revenue.toFixed(2)}, BSC Profit $${totalProfit.toFixed(2)}, Supplier Owed $${finance.supplierOwed.toFixed(2)}, Transactions ${finance.transactions}, Avg Sale $${avgTransaction}, POS Revenue $${posRevenue.toFixed(2)} (7% margin), Marketplace Revenue $${marketRevenue.toFixed(2)} (25% margin), Low Stock: ${lowStockItems.map(p => p.name).join(', ') || 'None'}, Top suppliers: ${supplierPayouts.slice(0, 3).map(s => s.name + ' $' + s.owed.toFixed(2)).join(', ')}.
Be concise, direct, and actionable. Help Dedrick Storr grow BSC across the Bahamas.`;
const response = await fetch('https://api.anthropic.com/v1/messages', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
model: 'claude-sonnet-4-20250514',
max_tokens: 1000,
system: context,
messages: [
...aiMessages.filter((_, i) => i > 0).map(m => ({
role: m.role === 'ai' ? 'assistant' : 'user',
content: m.text,
})),
{ role: 'user', content: userMsg },
],
}),
});
const data = await response.json();
const aiReply = data.content?.[0]?.text || 'Sorry, I could not process that.';
setAiMessages(prev => [...prev, { role: 'ai', text: aiReply }]);
} catch {
setAiMessages(prev => [...prev, { role: 'ai', text: 'Connection error. Please try again.' }]);
}
setAiLoading(false);
}

const card: React.CSSProperties = {
backgroundColor: '#0d1f3c',
borderRadius: 16,
padding: 20,
border: '1px solid #1e3a5f',
marginBottom: 14,
};

const kpiCard: React.CSSProperties = {
borderRadius: 16,
padding: 20,
border: '1px solid #1e3a5f',
};

const tabBtn = (active: boolean): React.CSSProperties => ({
flex: 1,
padding: '10px 6px',
borderRadius: 10,
backgroundColor: active ? '#f5c518' : 'transparent',
color: active ? '#000' : '#6b7280',
border: 'none',
fontWeight: active ? 'bold' : 'normal',
fontSize: 11,
cursor: 'pointer',
letterSpacing: 0.5,
});

if (loading) return (
<div style={{
minHeight: '100vh', backgroundColor: '#060d1f',
display: 'flex', alignItems: 'center', justifyContent: 'center',
}}>
<div style={{ textAlign: 'center' }}>
<div style={{ fontSize: 48, marginBottom: 16 }}>🐟</div>
<p style={{ color: '#4a5568', fontSize: 14 }}>Loading BSC Control...</p>
</div>
</div>
);

return (
<div style={{
minHeight: '100vh',
backgroundColor: '#060d1f',
color: '#ffffff',
fontFamily: "'Inter', -apple-system, sans-serif",
paddingBottom: 80,
}}>

{/* HEADER */}
<div style={{
background: 'linear-gradient(135deg, #0a1628 0%, #0d1f3c 100%)',
borderBottom: '1px solid #1e3a5f',
padding: '20px 24px 16px',
position: 'sticky',
top: 0,
zIndex: 50,
}}>
<div style={{
display: 'flex', justifyContent: 'space-between',
alignItems: 'center', maxWidth: 900, margin: '0 auto',
}}>
<div>
<h1 style={{ margin: 0, color: '#f5c518', fontSize: 24, fontWeight: 'bold' }}>
BSC Control
</h1>
<p style={{ margin: '3px 0 0', color: '#4a5568', fontSize: 11 }}>
{today}
</p>
</div>
<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
{lowStockItems.length > 0 && (
<div style={{
backgroundColor: '#3b0000', color: '#f87171',
borderRadius: 20, padding: '4px 12px',
fontSize: 11, fontWeight: 'bold', border: '1px solid #7f1d1d',
}}>
{lowStockItems.length} Low Stock
</div>
)}
<div style={{
backgroundColor: '#0a2010', color: '#4ade80',
borderRadius: 20, padding: '4px 12px',
fontSize: 11, fontWeight: 'bold', border: '1px solid #4ade80',
}}>
LIVE
</div>
</div>
</div>
</div>

<div style={{ padding: '20px 20px 0', maxWidth: 900, margin: '0 auto' }}>

{/* KPI ROW */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
<div style={{ ...kpiCard, background: 'linear-gradient(135deg, #0d1f3c, #132a4a)' }}>
<p style={{ margin: 0, color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>REVENUE</p>
<h2 style={{ margin: '6px 0 0', color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
${finance.revenue.toFixed(2)}
</h2>
<p style={{ margin: '4px 0 0', color: '#4ade80', fontSize: 10 }}>
{finance.transactions} sales
</p>
</div>
<div style={{ ...kpiCard, background: 'linear-gradient(135deg, #1a1200, #2a1e00)' }}>
<p style={{ margin: 0, color: '#f5c518aa', fontSize: 10, letterSpacing: 1 }}>BSC PROFIT</p>
<h2 style={{ margin: '6px 0 0', color: '#f5c518', fontSize: 20, fontWeight: 'bold' }}>
${totalProfit.toFixed(2)}
</h2>
<p style={{ margin: '4px 0 0', color: '#f5c518aa', fontSize: 10 }}>
Avg ${avgTransaction}/sale
</p>
</div>
<div style={{ ...kpiCard, background: 'linear-gradient(135deg, #001a2a, #002a3a)' }}>
<p style={{ margin: 0, color: '#60a5faaa', fontSize: 10, letterSpacing: 1 }}>OWED</p>
<h2 style={{ margin: '6px 0 0', color: '#60a5fa', fontSize: 20, fontWeight: 'bold' }}>
${finance.supplierOwed.toFixed(2)}
</h2>
<p style={{ margin: '4px 0 0', color: '#60a5faaa', fontSize: 10 }}>
To suppliers
</p>
</div>
</div>

{/* TABS */}
<div style={{
display: 'flex', gap: 6, backgroundColor: '#0d1f3c',
borderRadius: 14, padding: 6, marginBottom: 20,
border: '1px solid #1e3a5f',
}}>
{(['overview', 'profit', 'suppliers', 'ai'] as const).map((tab) => (
<button key={tab} onClick={() => setActiveTab(tab)} style={tabBtn(activeTab === tab)}>
{tab === 'overview' ? '📊 Overview' :
tab === 'profit' ? '💰 Profit' :
tab === 'suppliers' ? '🚢 Suppliers' : '🤖 AI'}
</button>
))}
</div>

{/* OVERVIEW */}
{activeTab === 'overview' && (
<>
<div style={card}>
<p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>
Revenue Streams
</p>
{[
{ label: 'POS Sales', revenue: posRevenue, profit: posProfit, margin: '7%', color: '#4ade80', count: posInvoices.length },
{ label: 'Marketplace Orders', revenue: marketRevenue, profit: marketProfit, margin: '25%', color: '#60a5fa', count: marketInvoices.length },
].map((stream) => (
<div key={stream.label} style={{
display: 'flex', justifyContent: 'space-between', alignItems: 'center',
padding: '12px 0', borderBottom: '1px solid #1e3a5f',
}}>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{stream.label}</p>
<p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: 11 }}>
{stream.count} orders · {stream.margin} BSC margin
</p>
</div>
<div style={{ textAlign: 'right' }}>
<p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 15 }}>
${stream.revenue.toFixed(2)}
</p>
<p style={{ margin: '2px 0 0', color: stream.color, fontSize: 12, fontWeight: 'bold' }}>
+${stream.profit.toFixed(2)} profit
</p>
</div>
</div>
))}
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 }}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Total BSC Profit</p>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 18 }}>
${totalProfit.toFixed(2)}
</p>
</div>
</div>

<div style={{ marginBottom: 20 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Recent Orders</p>
<Link href="/report" style={{ color: '#60a5fa', fontSize: 12, textDecoration: 'none' }}>
View All
</Link>
</div>
{recentInvoices.slice(0, 5).map((inv) => {
const isMarket = inv.customerName.includes('DELIVERY') || inv.customerName.includes('PICKUP');
const nameParts = inv.customerName.split(' | ');
const customerName = nameParts[0];
const deliveryNote = nameParts[1] || null;
return (
<Link key={inv.id} href={"/invoice?id=" + inv.id} style={{ textDecoration: 'none' }}>
<div style={{
...card, marginBottom: 10, padding: '14px 16px',
display: 'flex', justifyContent: 'space-between', alignItems: 'center',
cursor: 'pointer',
}}>
<div style={{ flex: 1 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
<span style={{ fontSize: 12 }}>{isMarket ? '🏪' : '🛒'}</span>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{customerName}</p>
</div>
{deliveryNote && (
<p style={{ margin: '2px 0', color: '#f5c518', fontSize: 10 }}>{deliveryNote}</p>
)}
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>{inv.date}</p>
</div>
<div style={{ textAlign: 'right' }}>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 16 }}>
${inv.total.toFixed(2)}
</p>
<p style={{ margin: '2px 0 0', color: isMarket ? '#60a5fa' : '#4ade80', fontSize: 10 }}>
+${(inv.total * (isMarket ? 0.25 : 0.07)).toFixed(2)} profit
</p>
</div>
</div>
</Link>
);
})}
</div>

<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
<Link href="/pos" style={{
background: 'linear-gradient(135deg, #f5c518, #e6b800)',
color: '#000', fontWeight: 'bold', fontSize: 15,
padding: '18px 10px', borderRadius: 16, textAlign: 'center',
textDecoration: 'none', display: 'block',
}}>🛒 Open POS</Link>
<Link href="/market" style={{
background: 'linear-gradient(135deg, #0d1f3c, #132a4a)',
color: '#fff', fontWeight: 'bold', fontSize: 15,
padding: '18px 10px', borderRadius: 16, textAlign: 'center',
textDecoration: 'none', display: 'block', border: '1px solid #1e3a5f',
}}>🏪 Market</Link>
<Link href="/inventory" style={{
background: 'linear-gradient(135deg, #0d1f3c, #132a4a)',
color: '#60a5fa', fontWeight: 'bold', fontSize: 14,
padding: '16px 10px', borderRadius: 16, textAlign: 'center',
textDecoration: 'none', display: 'block', border: '1px solid #1e3a5f',
}}>📦 Inventory</Link>
<Link href="/supplier" style={{
background: 'linear-gradient(135deg, #0d1f3c, #132a4a)',
color: '#a78bfa', fontWeight: 'bold', fontSize: 14,
padding: '16px 10px', borderRadius: 16, textAlign: 'center',
textDecoration: 'none', display: 'block', border: '1px solid #1e3a5f',
}}>🚢 Suppliers</Link>
</div>

{lowStockItems.length > 0 && (
<div style={{ ...card, borderColor: '#7f1d1d', backgroundColor: '#1a0808' }}>
<p style={{ margin: '0 0 10px', color: '#f87171', fontWeight: 'bold', fontSize: 14 }}>
Low Stock Alert
</p>
{lowStockItems.map((p) => (
<div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
<p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{p.name}</p>
<p style={{ margin: 0, color: '#f87171', fontSize: 13, fontWeight: 'bold' }}>
{p.stock} left (min {p.minStock})
</p>
</div>
))}
</div>
)}
</>
)}

{/* PROFIT TAB */}
{activeTab === 'profit' && (
<>
<div style={card}>
<p style={{ margin: '0 0 16px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>
Profit by Stream
</p>
{[
{ label: 'POS Sales', revenue: posRevenue, profit: posProfit, rate: '7%', icon: '🛒', color: '#4ade80' },
{ label: 'Marketplace', revenue: marketRevenue, profit: marketProfit, rate: '25%', icon: '🏪', color: '#60a5fa' },
{ label: 'Wholesale', revenue: 0, profit: 0, rate: '12%', icon: '📦', color: '#f5c518' },
{ label: 'Utility Bills', revenue: 0, profit: 0, rate: '$5 + 5%', icon: '⚡', color: '#a78bfa' },
].map((item) => (
<div key={item.label} style={{
backgroundColor: '#060d1f', borderRadius: 12,
padding: '14px 16px', marginBottom: 10, border: '1px solid #1e3a5f',
}}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
<span style={{ fontSize: 22 }}>{item.icon}</span>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{item.label}</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>
BSC margin: {item.rate}
</p>
</div>
</div>
<div style={{ textAlign: 'right' }}>
<p style={{ margin: 0, color: '#fff', fontSize: 13 }}>
${item.revenue.toFixed(2)}
</p>
<p style={{ margin: '2px 0 0', color: item.color, fontWeight: 'bold', fontSize: 14 }}>
${item.profit.toFixed(2)}
</p>
</div>
</div>
</div>
))}
<div style={{
background: 'linear-gradient(135deg, #1a1200, #2a1e00)',
borderRadius: 12, padding: '16px 18px', marginTop: 6,
border: '1px solid #f5c51833',
display: 'flex', justifyContent: 'space-between', alignItems: 'center',
}}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 15 }}>
Total BSC Profit
</p>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 22 }}>
${totalProfit.toFixed(2)}
</p>
</div>
</div>

<div style={card}>
<p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>
Daily Summary
</p>
{[
{ label: 'Total Revenue', value: '$' + finance.revenue.toFixed(2), color: '#fff' },
{ label: 'BSC Profit', value: '$' + totalProfit.toFixed(2), color: '#f5c518' },
{ label: 'Supplier Owed', value: '$' + finance.supplierOwed.toFixed(2), color: '#60a5fa' },
{ label: 'Total Orders', value: String(finance.transactions), color: '#4ade80' },
{ label: 'Avg Order Value', value: '$' + avgTransaction, color: '#aaa' },
].map((row) => (
<div key={row.label} style={{
display: 'flex', justifyContent: 'space-between',
paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #1e3a5f',
}}>
<p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>{row.label}</p>
<p style={{ margin: 0, color: row.color, fontWeight: 'bold', fontSize: 13 }}>
{row.value}
</p>
</div>
))}
</div>
</>
)}

{/* SUPPLIERS TAB */}
{activeTab === 'suppliers' && (
<>
<div style={card}>
<p style={{ margin: '0 0 4px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>
Supplier Payouts
</p>
<p style={{ margin: '0 0 16px', color: '#4a5568', fontSize: 12 }}>
93% of each sale goes to the supplier
</p>
{supplierPayouts.length === 0 ? (
<p style={{ color: '#4a5568', fontSize: 13, textAlign: 'center', padding: 20 }}>
No supplier data yet
</p>
) : supplierPayouts.map((sup) => (
<div key={sup.name} style={{
backgroundColor: '#060d1f', borderRadius: 12,
padding: '14px 16px', marginBottom: 10, border: '1px solid #1e3a5f',
}}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{sup.name}</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>
{sup.invoiceCount} line items
</p>
</div>
<div style={{ textAlign: 'right' }}>
<p style={{ margin: 0, color: '#60a5fa', fontWeight: 'bold', fontSize: 16 }}>
${sup.owed.toFixed(2)}
</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 10 }}>OWED</p>
</div>
</div>
</div>
))}
<div style={{
display: 'flex', justifyContent: 'space-between', alignItems: 'center',
paddingTop: 14, borderTop: '1px solid #1e3a5f',
}}>
<p style={{ margin: 0, color: '#60a5fa', fontWeight: 'bold', fontSize: 14 }}>Total Owed</p>
<p style={{ margin: 0, color: '#60a5fa', fontWeight: 'bold', fontSize: 20 }}>
${finance.supplierOwed.toFixed(2)}
</p>
</div>
</div>
<Link href="/supplier" style={{ textDecoration: 'none' }}>
<div style={{
...card, textAlign: 'center', cursor: 'pointer',
background: 'linear-gradient(135deg, #0d1f3c, #132a4a)',
}}>
<p style={{ margin: 0, color: '#a78bfa', fontWeight: 'bold', fontSize: 15 }}>
🚢 Manage Supplier Portal
</p>
</div>
</Link>
</>
)}

{/* AI TAB */}
{activeTab === 'ai' && (
<div style={{ ...card, padding: 0, overflow: 'hidden' }}>
<div style={{
padding: '14px 16px', borderBottom: '1px solid #1e3a5f',
background: 'linear-gradient(135deg, #0d1f3c, #132a4a)',
}}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>
🤖 BSC AI Assistant
</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>
Powered by Claude · Knows your live business data
</p>
</div>

<div style={{
height: 380, overflowY: 'auto', padding: 16,
display: 'flex', flexDirection: 'column', gap: 12,
}}>
{aiMessages.map((msg, i) => (
<div key={i} style={{
display: 'flex',
justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
}}>
<div style={{
maxWidth: '85%',
padding: '10px 14px',
borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
backgroundColor: msg.role === 'user' ? '#f5c518' : '#0d1f3c',
color: msg.role === 'user' ? '#000' : '#fff',
fontSize: 13,
lineHeight: 1.5,
border: msg.role === 'ai' ? '1px solid #1e3a5f' : 'none',
}}>
{msg.text}
</div>
</div>
))}
{aiLoading && (
<div style={{ display: 'flex', justifyContent: 'flex-start' }}>
<div style={{
padding: '10px 14px',
borderRadius: '14px 14px 14px 2px',
backgroundColor: '#0d1f3c',
border: '1px solid #1e3a5f',
color: '#4a5568',
fontSize: 13,
}}>
Thinking...
</div>
</div>
)}
</div>

<div style={{
padding: '12px 16px', borderTop: '1px solid #1e3a5f',
display: 'flex', gap: 10, alignItems: 'center',
}}>
<input
placeholder="Ask about profits, suppliers, growth..."
value={aiInput}
onChange={(e) => setAiInput(e.target.value)}
onKeyDown={(e) => e.key === 'Enter' && handleAiSend()}
style={{
flex: 1, padding: '10px 14px', borderRadius: 10,
backgroundColor: '#060d1f', color: '#fff',
border: '1px solid #1e3a5f', fontSize: 13, outline: 'none',
}}
/>
<button
onClick={handleAiSend}
disabled={aiLoading}
style={{
padding: '10px 16px', borderRadius: 10,
backgroundColor: aiLoading ? '#555' : '#f5c518',
color: '#000', fontWeight: 'bold', border: 'none',
cursor: aiLoading ? 'not-allowed' : 'pointer', fontSize: 13,
}}
>
Send
</button>
</div>
</div>
)}

</div>
</div>
);
}
