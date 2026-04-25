// File: app/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchFinancialsFromDB, getFinancialSummary } from '../lib/finance';
import { fetchInvoicesFromDB, type Invoice } from '../lib/invoices';
import { products } from '../lib/store';

export default function Dashboard() {
const [finance, setFinance] = useState({
revenue: 0,
profit: 0,
supplierOwed: 0,
transactions: 0,
});
const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
async function load() {
await fetchFinancialsFromDB();
const summary = getFinancialSummary();
setFinance(summary);

const invoices = await fetchInvoicesFromDB();
setRecentInvoices(invoices.slice(0, 5));

setLoading(false);
}
load();
}, []);

const lowStockItems = products.filter(
(p) => p.stock <= p.minStock + 2
);

const avgTransaction =
finance.transactions > 0
? (finance.revenue / finance.transactions).toFixed(2)
: '0.00';

const today = new Date().toLocaleDateString('en-US', {
weekday: 'long',
year: 'numeric',
month: 'long',
day: 'numeric',
});

return (
<div style={{
minHeight: '100vh',
backgroundColor: '#0a0f1e',
color: '#ffffff',
fontFamily: 'sans-serif',
paddingBottom: 100,
}}>

{/* HEADER */}
<div style={{
position: 'sticky',
top: 0,
zIndex: 50,
backgroundColor: '#0a0f1e',
borderBottom: '1px solid #1e2d4a',
padding: '20px 20px 16px',
}}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<div>
<h1 style={{ margin: 0, color: '#f5c518', fontSize: 26, fontWeight: 'bold' }}>
BSC Control
</h1>
<p style={{ margin: '4px 0 0', color: '#555', fontSize: 12 }}>
Nassau Marketplace · {today}
</p>
</div>
<div style={{
padding: '6px 14px',
backgroundColor: '#0f2a0f',
color: '#4ade80',
borderRadius: 20,
fontSize: 12,
fontWeight: 'bold',
border: '1px solid #4ade80'
}}>
● LIVE
</div>
</div>
</div>

<div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>

{/* LOADING STATE */}
{loading && (
<div style={{
textAlign: 'center',
padding: 40,
color: '#555',
fontSize: 14,
}}>
⏳ Loading dashboard...
</div>
)}

{!loading && (
<>
{/* KPI CARDS */}
<div style={{
display: 'grid',
gridTemplateColumns: '1fr 1fr',
gap: 12,
marginBottom: 20,
}}>

{/* REVENUE */}
<div style={{
backgroundColor: '#1a2235',
borderRadius: 16,
padding: 18,
border: '1px solid #2a3550',
}}>
<p style={{ margin: 0, color: '#aaa', fontSize: 11 }}>REVENUE</p>
<h2 style={{ margin: '6px 0 0', color: '#ffffff', fontSize: 22, fontWeight: 'bold' }}>
${finance.revenue.toFixed(2)}
</h2>
<p style={{ margin: '4px 0 0', color: '#4ade80', fontSize: 11 }}>
{finance.transactions} transactions
</p>
</div>

{/* BSC PROFIT */}
<div style={{
backgroundColor: '#1a1a0a',
borderRadius: 16,
padding: 18,
border: '1px solid #f5c51833',
}}>
<p style={{ margin: 0, color: '#f5c518aa', fontSize: 11 }}>BSC KEEPS (7%)</p>
<h2 style={{ margin: '6px 0 0', color: '#f5c518', fontSize: 22, fontWeight: 'bold' }}>
${finance.profit.toFixed(2)}
</h2>
<p style={{ margin: '4px 0 0', color: '#f5c518aa', fontSize: 11 }}>
Avg ${avgTransaction}/sale
</p>
</div>

{/* SUPPLIER OWED */}
<div style={{
backgroundColor: '#1a2235',
borderRadius: 16,
padding: 18,
border: '1px solid #2a3550',
gridColumn: 'span 2',
}}>
<p style={{ margin: 0, color: '#aaa', fontSize: 11 }}>SUPPLIER OWED (93%)</p>
<h2 style={{ margin: '6px 0 0', color: '#60a5fa', fontSize: 26, fontWeight: 'bold' }}>
${finance.supplierOwed.toFixed(2)}
</h2>
<p style={{ margin: '4px 0 0', color: '#555', fontSize: 11 }}>
Pending payout to suppliers
</p>
</div>

</div>

{/* LOW STOCK ALERT */}
{lowStockItems.length > 0 && (
<div style={{
backgroundColor: '#1a0a0a',
border: '1px solid #7f1d1d',
borderRadius: 16,
padding: 16,
marginBottom: 20,
display: 'flex',
gap: 14,
alignItems: 'flex-start',
}}>
<span style={{ fontSize: 28 }}>⚠️</span>
<div style={{ flex: 1 }}>
<p style={{ margin: 0, color: '#f87171', fontWeight: 'bold', fontSize: 15 }}>
Inventory Alert
</p>
<p style={{ margin: '4px 0 8px', color: '#aaa', fontSize: 13 }}>
{lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} near minimum stock:
</p>
{lowStockItems.map((p) => (
<p key={p.id} style={{ margin: '2px 0', color: '#f87171', fontSize: 12 }}>
· {p.name} — {p.stock} left (min: {p.minStock})
</p>
))}
<Link href="/inventory" style={{
display: 'inline-block',
marginTop: 10,
color: '#f5c518',
fontSize: 13,
textDecoration: 'none',
fontWeight: 'bold',
}}>
Manage Inventory →
</Link>
</div>
</div>
)}

{/* RECENT INVOICES */}
<div style={{ marginBottom: 24 }}>
<div style={{
display: 'flex',
justifyContent: 'space-between',
alignItems: 'center',
marginBottom: 12,
}}>
<h3 style={{ margin: 0, color: '#f5c518', fontSize: 16 }}>Recent Sales</h3>
<Link href="/report" style={{
color: '#f5c518',
fontSize: 12,
textDecoration: 'none',
}}>
All Reports →
</Link>
</div>

{recentInvoices.length === 0 ? (
<div style={{
backgroundColor: '#1a2235',
borderRadius: 12,
padding: 20,
textAlign: 'center',
border: '1px solid #2a3550',
}}>
<p style={{ color: '#555', margin: 0, fontSize: 13 }}>
No sales yet. Start a sale from POS.
</p>
</div>
) : (
recentInvoices.map((inv) => (
<div key={inv.id} style={{
backgroundColor: '#1a2235',
borderRadius: 12,
padding: 14,
marginBottom: 10,
border: '1px solid #2a3550',
display: 'flex',
justifyContent: 'space-between',
alignItems: 'center',
}}>
<div>
<p style={{ margin: 0, color: '#f5c518', fontSize: 12, fontFamily: 'monospace' }}>
{inv.id}
</p>
<p style={{ margin: '2px 0 0', color: '#aaa', fontSize: 12 }}>
{inv.customerName} · {inv.date}
</p>
</div>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 16 }}>
${inv.total.toFixed(2)}
</p>
</div>
))
)}
</div>

{/* QUICK ACTIONS */}
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
<Link href="/pos" style={{
backgroundColor: '#f5c518',
color: '#000',
fontWeight: 'bold',
fontSize: 16,
padding: '20px 10px',
borderRadius: 16,
textAlign: 'center',
textDecoration: 'none',
display: 'block',
}}>
🛒 Open POS
</Link>
<Link href="/market" style={{
backgroundColor: '#1a2235',
color: '#fff',
fontWeight: 'bold',
fontSize: 16,
padding: '20px 10px',
borderRadius: 16,
textAlign: 'center',
textDecoration: 'none',
display: 'block',
border: '1px solid #2a3550',
}}>
🏪 Market
</Link>
<Link href="/inventory" style={{
backgroundColor: '#1a2235',
color: '#60a5fa',
fontWeight: 'bold',
fontSize: 15,
padding: '16px 10px',
borderRadius: 16,
textAlign: 'center',
textDecoration: 'none',
display: 'block',
border: '1px solid #2a3550',
}}>
📦 Inventory
</Link>
<Link href="/report" style={{
backgroundColor: '#1a2235',
color: '#4ade80',
fontWeight: 'bold',
fontSize: 15,
padding: '16px 10px',
borderRadius: 16,
textAlign: 'center',
textDecoration: 'none',
display: 'block',
border: '1px solid #2a3550',
}}>
📊 Reports
</Link>
</div>
</>
)}

</div>
</div>
);
}

