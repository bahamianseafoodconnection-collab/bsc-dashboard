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
      { section: 'profit' as Section, label: 'Supplier Payouts', icon: '👥' },
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
      { section: 'suppliers' as Section, label: 'Supplier Admin', icon: '🚢' },
    ]
  },
  {
    label: 'TOOLS',
    items: [
      { section: 'ai' as Section, label: 'BSC AI', icon: '🤖' },
    ]
  },
];

export default function Dashboard() {
  const [finance, setFinance] = useState({ revenue: 0, profit: 0, supplierOwed: 0, transactions: 0 });
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
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
    function checkMobile() { setIsMobile(window.innerWidth < 768); }
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  const SidebarInner = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #1e3a5f' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #f5c518, #e6a800)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🦀</div>
          <div>
            <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 15 }}>BSC Marketplace</p>
            <p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>Daily Control System</p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {SIDEBAR_GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom: 20 }}>
            <p style={{ margin: '0 0 4px', padding: '0 16px', color: '#2a3a5a', fontSize: 9, letterSpacing: 2, fontWeight: 'bold' }}>{group.label}</p>
            {group.items.map((item, idx) => {
              const isActive = section === item.section && (item.label !== 'Supplier Payouts' || section === 'profit');
              return (
                <button key={idx} onClick={() => navTo(item.section)} style={{
                  width: '100%', textAlign: 'left', padding: '10px 16px',
                  backgroundColor: isActive ? 'rgba(245,197,24,0.1)' : 'transparent',
                  color: isActive ? '#f5c518' : '#9ca3af',
                  border: 'none', cursor: 'pointer', fontSize: 13,
                  borderLeft: isActive ? '3px solid #f5c518' : '3px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 15 }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {'badge' in item && item.badge && (
                    <span style={{ backgroundColor: '#f5c518', color: '#000', borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 'bold' }}>{item.badge}</span>
                  )}
                  {item.section === 'suppliers' && pendingCount > 0 && (
                    <span style={{ backgroundColor: '#f87171', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{pendingCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid #1e3a5f' }}>
        <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login'; }}
          style={{ width: '100%', padding: '9px', borderRadius: 8, backgroundColor: 'transparent', color: '#4a5568', border: '1px solid #1e3a5f', fontSize: 12, cursor: 'pointer' }}>
          Sign Out
        </button>
      </div>
    </div>
  );

  const MainContent = () => (
    <>
      {section === 'overview' && (
        <>
          {pendingCount > 0 && (
            <div onClick={() => setSection('suppliers')} style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', border: '1px solid #f5c518', borderRadius: 14, padding: '14px 18px', marginBottom: 16, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>🚢 {pendingCount} Supplier Application{pendingCount > 1 ? 's' : ''} Pending</p>
                <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 12 }}>Tap to review and approve</p>
              </div>
              <span style={{ color: '#f5c518', fontSize: 22 }}>›</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
            {[
              { label: 'REVENUE', value: '$' + finance.revenue.toFixed(2), sub: finance.transactions + ' sales', color: '#fff', bg: 'linear-gradient(135deg, #0d1f3c, #132a4a)' },
              { label: 'BSC PROFIT', value: '$' + totalProfit.toFixed(2), sub: 'Avg $' + avgTransaction, color: '#f5c518', bg: 'linear-gradient(135deg, #1a1200, #2a1e00)' },
              { label: 'SUPPLIER OWED', value: '$' + finance.supplierOwed.toFixed(2), sub: '93% of sales', color: '#60a5fa', bg: 'linear-gradient(135deg, #001a2a, #002a3a)' },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: kpi.bg, borderRadius: 14, padding: 16, border: '1px solid #1e3a5f' }}>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 9, letterSpacing: 1 }}>{kpi.label}</p>
                <p style={{ margin: '6px 0 0', color: kpi.color, fontWeight: 'bold', fontSize: isMobile ? 16 : 20 }}>{kpi.value}</p>
                <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 10 }}>{kpi.sub}</p>
              </div>
            ))}
          </div>

          <div style={card}>
            <p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Revenue Streams</p>
            {[
              { label: 'POS Sales', revenue: posRevenue, profit: posRevenue * 0.07, margin: '7%', color: '#4ade80', count: posInvoices.length },
              { label: 'Marketplace Orders', revenue: marketRevenue, profit: marketRevenue * 0.25, margin: '25%', color: '#60a5fa', count: marketInvoices.length },
              { label: 'Wholesale', revenue: 0, profit: 0, margin: '12%', color: '#f5c518', count: 0 },
              { label: 'Utility Bills', revenue: 0, profit: 0, margin: '$5+5%', color: '#a78bfa', count: 0 },
            ].map(stream => (
              <div key={stream.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e3a5f' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{stream.label}</p>
                  <p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: 11 }}>{stream.count} orders · {stream.margin} BSC margin</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 14 }}>${stream.revenue.toFixed(2)}</p>
                  <p style={{ margin: '2px 0 0', color: stream.color, fontSize: 11, fontWeight: 'bold' }}>+${stream.profit.toFixed(2)}</p>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10 }}>
              <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>Total BSC Profit</p>
              <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>${totalProfit.toFixed(2)}</p>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Recent Orders</p>
              <button onClick={() => setSection('report')} style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}>View All</button>
            </div>
            {recentInvoices.length === 0 && (
              <div style={{ ...card, textAlign: 'center', padding: 24 }}>
                <p style={{ color: '#4a5568', margin: 0 }}>No sales yet. Start from POS.</p>
              </div>
            )}
            {recentInvoices.slice(0, 5).map(inv => {
              const isMarket = inv.customerName.includes('DELIVERY') || inv.customerName.includes('PICKUP');
              const parts = inv.customerName.split(' | ');
              return (
                <Link key={inv.id} href={'/invoice?id=' + inv.id} style={{ textDecoration: 'none' }}>
                  <div style={{ ...card, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, cursor: 'pointer' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12 }}>{isMarket ? '🏪' : '🛒'}</span>
                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{parts[0]}</p>
                      </div>
                      {parts[1] && <p style={{ margin: '2px 0 0', color: '#f5c518', fontSize: 10 }}>{parts[1]}</p>}
                      <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 10 }}>{inv.date}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>${inv.total.toFixed(2)}</p>
                      <p style={{ margin: 0, color: isMarket ? '#60a5fa' : '#4ade80', fontSize: 10 }}>+${(inv.total * (isMarket ? 0.25 : 0.07)).toFixed(2)}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Link href="/pos" style={{ background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', fontSize: 14, padding: '16px', borderRadius: 14, textAlign: 'center', textDecoration: 'none', display: 'block' }}>🛒 Open POS</Link>
            <Link href="/market" style={{ ...card, color: '#fff', fontWeight: 'bold', fontSize: 14, padding: '16px', textAlign: 'center', textDecoration: 'none', display: 'block', marginBottom: 0 }}>🏪 Marketplace</Link>
            <Link href="/inventory" style={{ ...card, color: '#60a5fa', fontWeight: 'bold', fontSize: 13, padding: '14px', textAlign: 'center', textDecoration: 'none', display: 'block', marginBottom: 0 }}>📦 Inventory</Link>
            <button onClick={() => setSection('suppliers')} style={{ ...card, color: '#f5c518', fontWeight: 'bold', fontSize: 13, padding: '14px', textAlign: 'center', border: '1px solid #f5c51840', cursor: 'pointer', marginBottom: 0, position: 'relative' as const }}>
              🚢 Suppliers
              {pendingCount > 0 && <span style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#f87171', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pendingCount}</span>}
            </button>
          </div>

          {lowStockItems.length > 0 && (
            <div style={{ ...card, borderColor: '#7f1d1d', backgroundColor: '#1a0808', marginTop: 14 }}>
              <p style={{ margin: '0 0 10px', color: '#f87171', fontWeight: 'bold', fontSize: 14 }}>⚠️ Low Stock Alert</p>
              {lowStockItems.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{p.name}</p>
                  <p style={{ margin: 0, color: '#f87171', fontWeight: 'bold', fontSize: 13 }}>{p.stock} left</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {section === 'pos' && (
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          <p style={{ fontSize: 48, marginBottom: 16 }}>🛒</p>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 18, marginBottom: 8 }}>Point of Sale</p>
          <p style={{ color: '#4a5568', fontSize: 14, marginBottom: 24 }}>Open the POS to start a new sale</p>
          <Link href="/pos" style={{ display: 'inline-block', backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', padding: '14px 32px', borderRadius: 12, textDecoration: 'none', fontSize: 16 }}>Open POS →</Link>
        </div>
      )}

      {section === 'profit' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 18, marginBottom: 16 }}>💰 Sales & Money</p>
          <div style={card}>
            <p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Profit by Channel</p>
            {[
              { label: 'POS Sales', revenue: posRevenue, profit: posRevenue * 0.07, rate: '7%', icon: '🛒', color: '#4ade80' },
              { label: 'Marketplace', revenue: marketRevenue, profit: marketRevenue * 0.25, rate: '25%', icon: '🏪', color: '#60a5fa' },
              { label: 'Wholesale', revenue: 0, profit: 0, rate: '12%', icon: '📦', color: '#f5c518' },
              { label: 'Utility Bills', revenue: 0, profit: 0, rate: '$5+5%', icon: '⚡', color: '#a78bfa' },
            ].map(item => (
              <div key={item.label} style={{ backgroundColor: '#060d1f', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #1e3a5f' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{item.icon}</span>
                    <div>
                      <p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{item.label}</p>
                      <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>BSC: {item.rate}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, color: '#fff', fontSize: 13 }}>${item.revenue.toFixed(2)}</p>
                    <p style={{ margin: 0, color: item.color, fontWeight: 'bold', fontSize: 13 }}>${item.profit.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
            <div style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', borderRadius: 12, padding: '14px 16px', border: '1px solid #f5c51833', display: 'flex', justifyContent: 'space-between' }}>
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
              { label: 'Avg Order Value', value: '$' + avgTransaction, color: '#aaa' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #1e3a5f' }}>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>{row.label}</p>
                <p style={{ margin: 0, color: row.color, fontWeight: 'bold', fontSize: 13 }}>{row.value}</p>
              </div>
            ))}
          </div>

          {supplierPayouts.length > 0 && (
            <div style={card}>
              <p style={{ margin: '0 0 4px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Supplier Payouts</p>
              <p style={{ margin: '0 0 14px', color: '#4a5568', fontSize: 12 }}>93% of each sale</p>
              {supplierPayouts.map(sup => (
                <div key={sup.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #1e3a5f' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{sup.name}</p>
                    <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{sup.invoiceCount} items</p>
                  </div>
                  <p style={{ margin: 0, color: '#60a5fa', fontWeight: 'bold', fontSize: 15 }}>${sup.owed.toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {section === 'inventory' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 18, marginBottom: 16 }}>📦 Inventory</p>
          {lowStockItems.length > 0 && (
            <div style={{ ...card, borderColor: '#7f1d1d', backgroundColor: '#1a0808', marginBottom: 16 }}>
              <p style={{ margin: '0 0 12px', color: '#f87171', fontWeight: 'bold', fontSize: 14 }}>⚠️ Low Stock Alerts</p>
              {lowStockItems.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ margin: 0, color: '#aaa', fontSize: 14 }}>{p.name}</p>
                  <p style={{ margin: 0, color: '#f87171', fontWeight: 'bold', fontSize: 14 }}>{p.stock} left (min {p.minStock})</p>
                </div>
              ))}
            </div>
          )}
          {lowStockItems.length === 0 && (
            <div style={{ ...card, textAlign: 'center', padding: 24 }}>
              <p style={{ color: '#4ade80', margin: 0, fontSize: 14 }}>✅ All stock levels are healthy</p>
            </div>
          )}
          <Link href="/inventory" style={{ display: 'block', backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', padding: '14px', borderRadius: 12, textDecoration: 'none', fontSize: 15, textAlign: 'center' }}>
            Open Full Inventory →
          </Link>
        </>
      )}

      {section === 'market' && (
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          <p style={{ fontSize: 48, marginBottom: 16 }}>🏪</p>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 18, marginBottom: 8 }}>BSC Marketplace</p>
          <p style={{ color: '#4a5568', fontSize: 14, marginBottom: 24 }}>Shop local seafood and more</p>
          <Link href="/market" style={{ display: 'inline-block', backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', padding: '14px 32px', borderRadius: 12, textDecoration: 'none', fontSize: 16 }}>
            Open Marketplace →
          </Link>
        </div>
      )}

      {section === 'report' && (
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          <p style={{ fontSize: 48, marginBottom: 16 }}>📋</p>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 18, marginBottom: 8 }}>Sales Reports</p>
          <p style={{ color: '#4a5568', fontSize: 14, marginBottom: 24 }}>View all sales history and invoices</p>
          <Link href="/report" style={{ display: 'inline-block', backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', padding: '14px 32px', borderRadius: 12, textDecoration: 'none', fontSize: 16 }}>
            Open Reports →
          </Link>
        </div>
      )}

      {section === 'suppliers' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 18, marginBottom: 16 }}>🚢 Supplier Admin</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'PENDING', value: allSuppliers.filter(s => s.status === 'pending').length, color: '#f5c518' },
              { label: 'APPROVED', value: allSuppliers.filter(s => s.status === 'approved').length, color: '#4ade80' },
              { label: 'PRODUCTS', value: allProducts.filter(p => p.status === 'pending').length, color: '#60a5fa' },
            ].map(stat => (
              <div key={stat.label} style={{ ...card, textAlign: 'center', padding: 14, marginBottom: 0 }}>
                <p style={{ margin: 0, color: stat.color, fontSize: 22, fontWeight: 'bold' }}>{stat.value}</p>
                <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 10 }}>{stat.label}</p>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {(['applications', 'products'] as const).map(tab => (
              <button key={tab} onClick={() => setSupplierTab(tab)} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: supplierTab === tab ? '#f5c518' : '#0d1f3c', color: supplierTab === tab ? '#000' : '#6b7280', border: '1px solid #1e3a5f', fontWeight: 'bold', cursor: 'pointer', fontSize: 12 }}>
                {tab === 'applications' ? 'Applications (' + allSuppliers.length + ')' : 'Products (' + allProducts.filter(p => p.status === 'pending').length + ' pending)'}
              </button>
            ))}
          </div>

          {supplierLoading && <p style={{ color: '#4a5568', textAlign: 'center', padding: 20 }}>Loading...</p>}

          {!supplierLoading && supplierTab === 'applications' && (
            <>
              {allSuppliers.length === 0 && <div style={{ ...card, textAlign: 'center', padding: 30 }}><p style={{ color: '#4a5568', margin: 0 }}>No applications yet</p></div>}
              {allSuppliers.map(sup => {
                const supProds = allProducts.filter(p => p.supplier_id === sup.id);
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
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, backgroundColor: '#060d1f', color: '#a78bfa', border: '1px solid #1e3a5f' }}>{sup.category}</span>
                      {sup.whatsapp && (
                        <a href={'https://wa.me/' + sup.whatsapp.replace(/\D/g, '')} target="_blank" rel="noopener noreferrer"
                          style={{ padding: '3px 12px', borderRadius: 20, fontSize: 11, backgroundColor: '#0a2010', color: '#4ade80', border: '1px solid #4ade80', textDecoration: 'none', fontWeight: 'bold' }}>
                          WhatsApp {sup.whatsapp}
                        </a>
                      )}
                    </div>
                    {supProds.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>SUBMITTED PRODUCTS ({supProds.length})</p>
                        {supProds.map(prod => (
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
                              {[
                                { l: 'RETAIL', v: '$' + (prod.retail_price?.toFixed(2) || '0.00'), c: '#4ade80' },
                                { l: 'WHOLESALE', v: '$' + (prod.wholesale_price?.toFixed(2) || '0.00'), c: '#f5c518' },
                                { l: 'DUTY', v: ((prod.duty_rate || 0) * 100).toFixed(0) + '%', c: '#60a5fa' },
                              ].map(x => (
                                <div key={x.l} style={{ backgroundColor: '#0d1f3c', borderRadius: 6, padding: '5px 8px' }}>
                                  <p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>{x.l}</p>
                                  <p style={{ margin: 0, color: x.c, fontWeight: 'bold', fontSize: 11 }}>{x.v}</p>
                                </div>
                              ))}
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
                        <button onClick={() => approveSupplier(sup.id)} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 13 }}>Approve Supplier</button>
                        <button onClick={() => rejectSupplier(sup.id)} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#3b0000', color: '#f87171', border: '1px solid #7f1d1d', cursor: 'pointer', fontSize: 13 }}>Reject</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {!supplierLoading && supplierTab === 'products' && (
            <>
              {allProducts.length === 0 && <div style={{ ...card, textAlign: 'center', padding: 30 }}><p style={{ color: '#4a5568', margin: 0 }}>No products yet</p></div>}
              {allProducts.map(prod => (
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
                        <a href={'https://wa.me/' + prod.supplier_whatsapp.replace(/\D/g, '')} target="_blank" rel="noopener noreferrer" style={{ color: '#4ade80', fontSize: 11, textDecoration: 'none' }}>
                          WhatsApp {prod.supplier_whatsapp}
                        </a>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: prod.status === 'pending' ? 10 : 0 }}>
                    {[
                      { l: 'RETAIL', v: '$' + (prod.retail_price?.toFixed(2) || '0.00'), c: '#4ade80' },
                      { l: 'WHOLESALE', v: '$' + (prod.wholesale_price?.toFixed(2) || '0.00'), c: '#f5c518' },
                      { l: 'DUTY', v: ((prod.duty_rate || 0) * 100).toFixed(0) + '%', c: '#60a5fa' },
                    ].map(x => (
                      <div key={x.l} style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px' }}>
                        <p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>{x.l}</p>
                        <p style={{ margin: '2px 0 0', color: x.c, fontWeight: 'bold', fontSize: 13 }}>{x.v}</p>
                      </div>
                    ))}
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
            <div style={{ ...card, textAlign: 'center', background: 'linear-gradient(135deg, #0d1f3c, #132a4a)' }}>
              <p style={{ margin: 0, color: '#a78bfa', fontWeight: 'bold', fontSize: 14 }}>🚢 Open Full Supplier Portal</p>
            </div>
          </Link>
        </>
      )}

      {section === 'ai' && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #1e3a5f', background: 'linear-gradient(135deg, #0d1f3c, #132a4a)' }}>
            <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>🤖 BSC AI Assistant</p>
            <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>Powered by Claude · Live business data</p>
          </div>
          <div style={{ height: 400, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 2px', backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', color: '#4a5568', fontSize: 13 }}>Thinking...</div>
              </div>
            )}
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid #1e3a5f', display: 'flex', gap: 8 }}>
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
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#060d1f', color: '#fff', fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* DESKTOP SIDEBAR — only on wide screens */}
      {!isMobile && (
        <div style={{ width: 240, backgroundColor: '#08111f', borderRight: '1px solid #1e3a5f', position: 'sticky' as const, top: 0, height: '100vh', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <SidebarInner />
        </div>
      )}

      {/* MOBILE OVERLAY */}
      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
          <div onClick={() => setSidebarOpen(false)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)' }} />
          <div style={{ position: 'relative', zIndex: 1, width: 260, backgroundColor: '#08111f', display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <SidebarInner />
          </div>
        </div>
      )}

      {/* MAIN */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

        {/* TOP BAR */}
        <div style={{ background: 'linear-gradient(135deg, #0a1628, #0d1f3c)', borderBottom: '1px solid #1e3a5f', padding: '12px 20px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>☰</button>
              <div>
                <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>BSC Control</p>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>{today}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>${finance.revenue.toFixed(2)}</p>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>REVENUE</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 15 }}>${totalProfit.toFixed(2)}</p>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>PROFIT</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{finance.transactions}</p>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>SALES</p>
              </div>
              <div style={{ backgroundColor: '#0a2010', color: '#4ade80', borderRadius: 20, padding: '4px 12px', fontSize: 10, fontWeight: 'bold', border: '1px solid #4ade80' }}>LIVE</div>
            </div>
          </div>
        </div>

        {/* PAGE CONTENT */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', paddingBottom: isMobile ? 80 : 40 }}>
          <MainContent />
        </div>

        {/* MOBILE BOTTOM NAV */}
        {isMobile && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#08111f', borderTop: '1px solid #1e3a5f', display: 'flex', justifyContent: 'space-around', padding: '8px 0', zIndex: 100 }}>
            {[
              { s: 'overview' as Section, icon: '📊', label: 'Summary' },
              { s: 'pos' as Section, icon: '🛒', label: 'POS' },
              { s: 'market' as Section, icon: '🏪', label: 'Market' },
              { s: 'suppliers' as Section, icon: '🚢', label: 'Suppliers' },
              { s: 'ai' as Section, icon: '🤖', label: 'AI' },
            ].map(item => (
              <button key={item.s} onClick={() => setSection(item.s)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                color: section === item.s ? '#f5c518' : '#4a5568',
                position: 'relative' as const,
              }}>
                <span style={{ fontSize: 22 }}>{item.icon}</span>
                <span style={{ fontSize: 9, letterSpacing: 0.5 }}>{item.label}</span>
                {item.s === 'suppliers' && pendingCount > 0 && (
                  <span style={{ position: 'absolute', top: 0, right: 4, backgroundColor: '#f87171', color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
