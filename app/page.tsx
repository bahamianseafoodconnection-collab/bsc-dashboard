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
type Section = 'overview' | 'pos' | 'profit' | 'suppliers' | 'inventory' | 'market' | 'report' | 'ai';

export default function Dashboard() {
const [finance, setFinance] = useState({ revenue: 0, profit: 0, supplierOwed: 0, transactions: 0 });
const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
const [loading, setLoading] = useState(true);
const [section, setSection] = useState<Section>('overview');
const [sidebarOpen, setSidebarOpen] = useState(false);
const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
const [allProducts, setAllProducts] = useState<SupplierProduct[]>([]);
const [supplierTab, setSupplierTab] = useState<'applications' | 'products'>('applications');
const [supplierLoading, setSupplierLoading] = useState(false);
const [aiMessages, setAiMessages] = useState<AIMessage[]>([
{ role: 'ai', text: 'Hi! I am your BSC AI assistant. Ask me anything about your business, profits, or suppliers.' }
]);
const [aiInput, setAiInput] = useState('');
const [aiLoading, setAiLoading] = useState(false);

useEffect(() => {
async function load() {
try {
await Promise.race([
(async () => {
await fetchFinancialsFromDB();
setFinance(getFinancialSummary());
const invoices = await fetchInvoicesFromDB();
setRecentInvoices(invoices.slice(0, 20));
})(),
new Promise((_, reject) => setTimeout(reject, 6000)),
]);
} catch (e) {}
setLoading(false);
}
load();
}, []);

useEffect(() => {
if (section === 'suppliers') loadSupplierData();
}, [section]);

async function loadSupplierData() {
setSupplierLoading(true);
try {
const { data: s } = await supabase.from('suppliers').select('*').order('created_at', { ascending: false });
if (s) setAllSuppliers(s);
const { data: p } = await supabase.from('supplier_products').select('*').order('created_at', { ascending: false });
if (p) setAllProducts(p);
} catch (e) {}
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

const lowStockItems = products.filter(p => p.stock <= p.minStock + 2);
const avgTransaction = finance.transactions > 0 ? (finance.revenue / finance.transactions).toFixed(2) : '0.00';
const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const posInvoices = recentInvoices.filter(inv => !inv.customerName.includes('DELIVERY') && !inv.customerName.includes('PICKUP'));
const marketInvoices = recentInvoices.filter(inv => inv.customerName.includes('DELIVERY') || inv.customerName.includes('PICKUP'));
const posRevenue = posInvoices.reduce((s, i) => s + i.total, 0);
const marketRevenue = marketInvoices.reduce((s, i) => s + i.total, 0);
const totalProfit = posRevenue * 0.07 + marketRevenue * 0.25;
const pendingCount = allSuppliers.filter(s => s.status === 'pending').length;

type SupplierPayout = { name: string; owed: number; invoiceCount: number };
const supplierMap: Record<string, SupplierPayout> = {};
recentInvoices.forEach(inv => {
inv.items.forEach((item: any) => {
const sup = item.supplierName || 'Unknown';
const t = item.total || item.qty * item.price;
if (!supplierMap[sup]) supplierMap[sup] = { name: sup, owed: 0, invoiceCount: 0 };
supplierMap[sup].owed += t * 0.93;
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
const ctx = `BSC AI for Bahamian Seafood Connection. Revenue $${finance.revenue.toFixed(2)}, Profit $${totalProfit.toFixed(2)}, Owed $${finance.supplierOwed.toFixed(2)}, Orders ${finance.transactions}, Low Stock: ${lowStockItems.map(p => p.name).join(', ') || 'None'}. Be concise and actionable.`;
const res = await fetch('/api/ai', {
method: 'POST', headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
system: ctx,
messages: [
...aiMessages.filter((_, i) => i > 0).map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })),
{ role: 'user', content: userMsg },
],
}),
});
const data = await res.json();
setAiMessages(prev => [...prev, { role: 'ai', text: data.content?.[0]?.text || 'Could not process.' }]);
} catch {
setAiMessages(prev => [...prev, { role: 'ai', text: 'Connection error.' }]);
}
setAiLoading(false);
}

function navTo(s: Section) { setSection(s); setSidebarOpen(false); }

const card: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 14, padding: 18, border: '1px solid #1e3a5f', marginBottom: 14 };
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

const SIDEBAR_GROUPS = [
{
label: 'OPERATIONS',
items: [
{ section: 'overview' as Section, label: 'Daily Summary', icon: '📊' },
{ section: 'pos' as Section, label: 'POS Entry', icon: '🛒', badge: 'HOT' },
{ section: 'report' as Section, label: 'Daily Report', icon: '📄' },
]
},
{
label: 'SALES & MONEY',
items: [
{ section: 'profit' as Section, label: 'Profit Report', icon: '📈' },
{ section: 'suppliers' as Section, label: 'Supplier Payouts', icon: '👥', alert: pendingCount },
]
},
{
label: 'INVENTORY',
items: [
{ section: 'inventory' as Section, label: 'Inventory Alerts', icon: '⚠️' },
]
},
{
label: 'MARKETPLACE',
items: [
{ section: 'market' as Section, label: 'Marketplace', icon: '🏪' },
{ section: 'suppliers' as Section, label: 'Supplier Admin', icon: '🚢', alert: pendingCount },
]
},
{
label: 'TOOLS',
items: [
{ section: 'ai' as Section, label: 'BSC AI', icon: '🤖' },
]
},
];

const SidebarContent = () => (
<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
{/* LOGO */}
<div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #1​​​​​​​​​​​​​​​​
