// File: app/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { fetchFinancialsFromDB, getFinancialSummary } from '@/lib/finance';
import { fetchInvoicesFromDB, type Invoice } from '@/lib/invoices';
import { products } from '@/lib/store';

const supabase = createClient(
  'https://auqjjrisivhfmpleusyt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg'
);

type AIMessage = { role: 'user' | 'ai'; text: string };
type Supplier = { id: string; full_name: string; company_name: string; email: string; whatsapp: string; category: string; status: string; };
type SupplierProduct = { id: string; name: string; category: string; sku: string; retail_price: number; wholesale_price: number; unit_cost: number; duty_rate: number; supplier_id: string; supplier_name: string; supplier_whatsapp: string; photo_url: string; status: string; case_cost: number; pieces_per_case: number; };
type Section = 'overview' | 'pos' | 'profit' | 'suppliers' | 'inventory' | 'market' | 'report' | 'ai' | 'yield' | 'freezer' | 'purchase';

const SPINY_TAILS_INVENTORY = [
  { name: 'Bahamian Conch', lbs: 5000, category: 'seafood', icon: '🐚' },
  { name: 'Nassau Grouper (Whole)', lbs: 300, category: 'seafood', icon: '🐟' },
  { name: 'Lane Snapper', lbs: 740, category: 'seafood', icon: '🐠' },
  { name: 'Salmon 6oz', lbs: 680, category: 'seafood', icon: '🐟' },
  { name: 'Salmon 8oz', lbs: 170, category: 'seafood', icon: '🐟' },
  { name: 'Salmon 4oz', lbs: 130, category: 'seafood', icon: '🐟' },
  { name: 'Yellowfin Tuna', lbs: 300, category: 'seafood', icon: '🐟' },
  { name: 'Snow Crab (4x1.5lb packs)', lbs: 90, category: 'seafood', icon: '🦀' },
  { name: 'Grouper Fillet 6/8oz', lbs: 160, category: 'seafood', icon: '🐟' },
  { name: 'Chicken Leg Quarters (12cs/33lb)', lbs: 396, category: 'poultry', icon: '🍗' },
  { name: 'Chicken Wings (14cs/33lb)', lbs: 462, category: 'poultry', icon: '🍗' },
  { name: 'Snapper Fillet 6/8oz (6x10lb)', lbs: 60, category: 'seafood', icon: '🐠' },
  { name: 'Snapper Fingers (10cs/5x2lb)', lbs: 100, category: 'seafood', icon: '🐠' },
  { name: 'Whole Chicken Grillers (8cs/22lb)', lbs: 176, category: 'poultry', icon: '🍗' },
  { name: 'Pork Spareribs (9cs/39.6lb)', lbs: 356, category: 'meat', icon: '🥩' },
  { name: 'Ribeye Steak (2cs/10lb)', lbs: 20, category: 'meat', icon: '🥩' },
  { name: 'Breaded Crab Claws (10cs)', lbs: 0, category: 'seafood', icon: '🦀' },
  { name: 'Black Mussel (7cs/10lb)', lbs: 70, category: 'seafood', icon: '🐚' },
  { name: 'Swai Fillet (6cs/10lb)', lbs: 60, category: 'seafood', icon: '🐟' },
];

const TOTAL_LBS = SPINY_TAILS_INVENTORY.reduce((sum, item) => sum + item.lbs, 0);
const FREEZER_CAPACITY = 30000;

const YIELD_PRESETS = {
  Conch: { yield: 0.35, label: 'Conch Meat Yield', icon: '🐚' },
  Fish: { yield: 0.48, label: 'Fish Fillet Yield', icon: '🐟' },
  Shrimp: { yield: 0.65, label: 'Shrimp Yield', icon: '🦐' },
  Lobster: { yield: 0.40, label: 'Lobster Tail Yield', icon: '🦞' },
  Grouper: { yield: 0.45, label: 'Grouper Fillet Yield', icon: '🐠' },
  Meats: { yield: 0.70, label: 'Usable Meat Yield', icon: '🥩' },
};

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
    { role: 'ai', text: 'Hi Dedrick! I am your BSC AI assistant. I know your live business data including Spiny Tails Processing Plant. Ask me anything about profits, inventory, scaling, or suppliers.' }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [yieldType, setYieldType] = useState('Conch');
  const [yieldWeight, setYieldWeight] = useState(100);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
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

  const approveSupplier = async (id: string) => {
    await supabase.from('suppliers').update({ status: 'approved' }).eq('id', id);
    setAllSuppliers(prev => prev.map(s => s.id === id ? { ...s, status: 'approved' } : s));
  };
  const rejectSupplier = async (id: string) => {
    await supabase.from('suppliers').update({ status: 'rejected' }).eq('id', id);
    setAllSuppliers(prev => prev.map(s => s.id === id ? { ...s, status: 'rejected' } : s));
  };
  const approveProduct = async (id: string) => {
    await supabase.from('supplier_products').update({ status: 'approved' }).eq('id', id);
    setAllProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'approved' } : p));
  };
  const rejectProduct = async (id: string) => {
    await supabase.from('supplier_products').update({ status: 'rejected' }).eq('id', id);
    setAllProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'rejected' } : p));
  };

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

  const currentYield = YIELD_PRESETS[yieldType as keyof typeof YIELD_PRESETS];
  const usableWeight = (yieldWeight * currentYield.yield).toFixed(1);
  const retailPortions = Math.round(parseFloat(usableWeight) / 0.75);

  const handleAiSend = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setAiLoading(true);
    try {
      const ctx = `You are BSC AI for Bahamian Seafood Connection owned by Dedrick Storr.
Business: BSC Marketplace + Spiny Tails Processing Plant, Firetrial Road, Nassau, Bahamas.
Freezer stock: ${TOTAL_LBS.toLocaleString()} lbs total, 30,000lb capacity.
Revenue: $${finance.revenue.toFixed(2)}, Profit: $${totalProfit.toFixed(2)}, Orders: ${finance.transactions}.
Suppliers: ${allSuppliers.length} total, ${pendingCount} pending.
Supplier portal: https://project-1fnu0.vercel.app/supplier
Be concise, direct, and actionable.`;
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
  };

  const navTo = (s: Section) => { setSection(s); setSidebarOpen(false); };

  const card: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 16, padding: 18, border: '1px solid #1e3a5f', marginBottom: 14 };
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

  const NAV_GROUPS = [
    {
      label: 'BUSINESS OVERVIEW',
      items: [
        { section: 'overview' as Section, label: 'Full Picture', icon: '📊' },
        { section: 'freezer' as Section, label: 'Freezer Inventory', icon: '🧊' },
        { section: 'purchase' as Section, label: 'Purchase Orders', icon: '📦' },
      ]
    },
    {
      label: 'OPERATIONS',
      items: [
        { section: 'pos' as Section, label: 'Walking POS', icon: '🛒', badge: 'LIVE' },
        { section: 'report' as Section, label: 'Daily Report', icon: '📄' },
        { section: 'yield' as Section, label: 'Yield Calculator', icon: '🧮' },
      ]
    },
    {
      label: 'SALES & MONEY',
      items: [
        { section: 'profit' as Section, label: 'Profit Report', icon: '📈' },
        { section: 'suppliers' as Section, label: 'Supplier Admin', icon: '🚢' },
      ]
    },
    {
      label: 'MARKETPLACE',
      items: [
        { section: 'market' as Section, label: 'Online Market', icon: '🏪' },
        { section: 'inventory' as Section, label: 'Stock Alerts', icon: '⚠️' },
      ]
    },
    {
      label: 'TOOLS',
      items: [
        { section: 'ai' as Section, label: 'BSC AI Assistant', icon: '🤖' },
      ]
    },
  ];

  const SidebarContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #1a2a3a', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #f5c518, #e6a800)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🦀</div>
          <div>
            <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 15 }}>BSC Marketplace</p>
            <p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>Firetrial Rd · Nassau</p>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
        {NAV_GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom: 20 }}>
            <p style={{ margin: '0 0 4px', padding: '0 20px', color: '#2a3a5a', fontSize: 9, letterSpacing: 2, fontWeight: 'bold' }}>{group.label}</p>
            {group.items.map((item, idx) => {
              const isActive = section === item.section;
              return (
                <button key={idx} onClick={() => navTo(item.section)} style={{
                  width: '100%', textAlign: 'left', padding: '10px 20px',
                  backgroundColor: isActive ? 'rgba(245,197,24,0.12)' : 'transparent',
                  color: isActive ? '#f5c518' : '#9ca3af',
                  border: 'none', cursor: 'pointer', fontSize: 13,
                  borderLeft: isActive ? '3px solid #f5c518' : '3px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {'badge' in item && item.badge && (
                    <span style={{ backgroundColor: '#4ade80', color: '#000', borderRadius: 6, padding: '1px 6px', fontSize: 8, fontWeight: 'bold' }}>{item.badge}</span>
                  )}
                  {item.section === 'suppliers' && pendingCount > 0 && (
                    <span style={{ backgroundColor: '#f87171', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>{pendingCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid #1a2a3a', flexShrink: 0 }}>
        <div style={{ backgroundColor: 'rgba(30,58,120,0.3)', border: '1px solid #1e3a7f', borderRadius: 12, padding: '10px 14px', marginBottom: 10 }}>
          <p style={{ margin: 0, color: '#60a5fa', fontSize: 10, fontWeight: 'bold' }}>SUPPLIER PORTAL URL</p>
          <p style={{ margin: '4px 0 0', color: '#fff', fontSize: 11, wordBreak: 'break-all' as const }}>project-1fnu0.vercel.app/supplier</p>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login'; }}
          style={{ width: '100%', padding: '9px', borderRadius: 10, backgroundColor: 'transparent', color: '#4a5568', border: '1px solid #1e3a5f', fontSize: 12, cursor: 'pointer' }}>
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
            <div onClick={() => setSection('suppliers')} style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', border: '1px solid #f5c518', borderRadius: 16, padding: '14px 18px', marginBottom: 20, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>🚢 {pendingCount} Supplier Application{pendingCount > 1 ? 's' : ''} Pending</p>
                <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 12 }}>Tap to review and approve</p>
              </div>
              <span style={{ color: '#f5c518', fontSize: 22 }}>›</span>
            </div>
          )}

          <div style={{ background: 'linear-gradient(135deg, #001a3a, #002a5a, #001a2a)', border: '1px solid #1e5a9f', borderRadius: 20, padding: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 48 }}>🦞</span>
                <div>
                  <p style={{ margin: 0, color: '#60a5fa', fontSize: 11, letterSpacing: 1, fontWeight: 'bold' }}>PROCESSING PLANT & SUPPLIER</p>
                  <p style={{ margin: '4px 0 2px', color: '#fff', fontWeight: 'bold', fontSize: 20 }}>Spiny Tails Processing</p>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: 12 }}>Firetrial Road, Nassau · Blast Freezer + Holding Freezer</p>
                </div>
              </div>
              <span style={{ backgroundColor: '#0a1f0a', color: '#4ade80', border: '1px solid #4ade80', borderRadius: 20, padding: '4px 14px', fontSize: 11, fontWeight: 'bold', flexShrink: 0 }}>ACTIVE</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Freezer Capacity', value: '30,000 lbs', color: '#60a5fa', icon: '🧊' },
                { label: 'Current Stock', value: TOTAL_LBS.toLocaleString() + ' lbs', color: '#4ade80', icon: '📦' },
                { label: 'Capacity Used', value: ((TOTAL_LBS / FREEZER_CAPACITY) * 100).toFixed(1) + '%', color: '#f5c518', icon: '📊' },
                { label: 'Products Stored', value: SPINY_TAILS_INVENTORY.length + ' types', color: '#a78bfa', icon: '🐟' },
              ].map(stat => (
                <div key={stat.label} style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p style={{ margin: 0, fontSize: 18 }}>{stat.icon}</p>
                  <p style={{ margin: '6px 0 2px', color: stat.color, fontWeight: 'bold', fontSize: isMobile ? 14 : 18 }}>{stat.value}</p>
                  <p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>{stat.label}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' as const }}>
              <button onClick={() => setSection('freezer')} style={{ backgroundColor: '#1e3a7f', color: '#60a5fa', border: '1px solid #1e5a9f', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>🧊 View Full Inventory</button>
              <button onClick={() => setSection('purchase')} style={{ backgroundColor: '#0a2010', color: '#4ade80', border: '1px solid #1e5a2f', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>📦 Purchase Orders</button>
              <button onClick={() => setSection('yield')} style={{ backgroundColor: '#1a1200', color: '#f5c518', border: '1px solid #3a2e00', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>🧮 Yield Calculator</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'TOTAL REVENUE', value: '$' + finance.revenue.toFixed(2), sub: finance.transactions + ' sales', color: '#4ade80', bg: 'linear-gradient(135deg, #0a1f0a, #0d2b14)' },
              { label: 'BSC PROFIT', value: '$' + totalProfit.toFixed(2), sub: 'Avg $' + avgTransaction, color: '#f5c518', bg: 'linear-gradient(135deg, #1a1200, #2a1e00)' },
              { label: 'SUPPLIER OWED', value: '$' + finance.supplierOwed.toFixed(2), sub: '93% of sales', color: '#60a5fa', bg: 'linear-gradient(135deg, #001a2a, #002a3a)' },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: kpi.bg, borderRadius: 16, padding: 18, border: '1px solid #1e3a5f' }}>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 2 }}>{kpi.label}</p>
                <p style={{ margin: '6px 0 4px', color: kpi.color, fontWeight: 'bold', fontSize: isMobile ? 16 : 22 }}>{kpi.value}</p>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{kpi.sub}</p>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div onClick={() => setSection('pos')} style={{ background: 'linear-gradient(135deg, #1a0a00, #2a1200)', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 16, padding: 20, cursor: 'pointer' }}>
              <p style={{ margin: '0 0 8px', fontSize: 32 }}>🛒</p>
              <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 15 }}>Walking POS</p>
              <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 12 }}>Any device · Walk & sell · Print/WhatsApp invoice</p>
            </div>
            <div onClick={() => setSection('purchase')} style={{ background: 'linear-gradient(135deg, #0a1f0a, #0d2b14)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 16, padding: 20, cursor: 'pointer' }}>
              <p style={{ margin: '0 0 8px', fontSize: 32 }}>📸</p>
              <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>Purchase Orders</p>
              <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 12 }}>Snap invoice · AI reads · Allocate to retail/wholesale</p>
            </div>
            <div style={{ background: 'linear-gradient(135deg, #001a2a, #002a3a)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 16, padding: 20 }}>
              <p style={{ margin: '0 0 8px', fontSize: 32 }}>🇺🇸</p>
              <p style={{ margin: 0, color: '#60a5fa', fontWeight: 'bold', fontSize: 15 }}>US Supplier Portal</p>
              <p style={{ margin: '4px 0 8px', color: '#4a5568', fontSize: 12 }}>Florida & Miami suppliers upload products to BSC</p>
              <p style={{ margin: 0, color: '#60a5fa', fontSize: 10, fontFamily: 'monospace' }}>project-1fnu0.vercel.app/supplier</p>
            </div>
          </div>

          <div style={card}>
            <p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Revenue Streams</p>
            {[
              { label: 'POS / Physical Store', revenue: posRevenue, profit: posRevenue * 0.07, margin: '7%', color: '#4ade80', count: posInvoices.length, icon: '🛒' },
              { label: 'Online Marketplace', revenue: marketRevenue, profit: marketRevenue * 0.25, margin: '25%', color: '#60a5fa', count: marketInvoices.length, icon: '🏪' },
              { label: 'Wholesale / Bulk', revenue: 0, profit: 0, margin: '12%', color: '#f5c518', count: 0, icon: '📦' },
              { label: 'Utility Bill Payments', revenue: 0, profit: 0, margin: '$5+5%', color: '#a78bfa', count: 0, icon: '⚡' },
              { label: 'US Supplier Sales', revenue: 0, profit: 0, margin: 'TBD', color: '#60a5fa', count: 0, icon: '🇺🇸' },
            ].map(stream => (
              <div key={stream.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e3a5f' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{stream.icon}</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{stream.label}</p>
                    <p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: 11 }}>{stream.count} orders · {stream.margin} BSC margin</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 14 }}>${stream.revenue.toFixed(2)}</p>
                  <p style={{ margin: '2px 0 0', color: stream.color, fontSize: 11, fontWeight: 'bold' }}>+${stream.profit.toFixed(2)}</p>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12 }}>
              <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Total BSC Profit</p>
              <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 18 }}>${totalProfit.toFixed(2)}</p>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Recent Orders</p>
              <button onClick={() => setSection('report')} style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}>View All →</button>
            </div>
            {recentInvoices.length === 0 && (
              <div style={{ ...card, textAlign: 'center', padding: 24 }}>
                <p style={{ color: '#4a5568', margin: 0 }}>No sales yet.</p>
              </div>
            )}
            {recentInvoices.slice(0, 5).map(inv => {
              const isMarket = inv.customerName.includes('DELIVERY') || inv.customerName.includes('PICKUP');
              const parts = inv.customerName.split(' | ');
              return (
                <Link key={inv.id} href={'/invoice?id=' + inv.id} style={{ textDecoration: 'none' }}>
                  <div style={{ ...card, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, cursor: 'pointer' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{isMarket ? '🏪' : '🛒'}</span>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Link href="/pos" style={{ background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', fontSize: 14, padding: '16px', borderRadius: 14, textAlign: 'center', textDecoration: 'none', display: 'block' }}>🛒 Open POS</Link>
            <Link href="/market" style={{ ...card, color: '#fff', fontWeight: 'bold', fontSize: 14, padding: '16px', textAlign: 'center', textDecoration: 'none', display: 'block', marginBottom: 0 }}>🏪 Marketplace</Link>
            <Link href="/inventory" style={{ ...card, color: '#60a5fa', fontWeight: 'bold', fontSize: 13, padding: '14px', textAlign: 'center', textDecoration: 'none', display: 'block', marginBottom: 0 }}>📦 Inventory</Link>
            <button onClick={() => setSection('suppliers')} style={{ ...card, color: '#f5c518', fontWeight: 'bold', fontSize: 13, padding: '14px', textAlign: 'center', border: '1px solid rgba(245,197,24,0.3)', cursor: 'pointer', marginBottom: 0, position: 'relative' as const }}>
              🚢 Suppliers
              {pendingCount > 0 && <span style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#f87171', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pendingCount}</span>}
            </button>
          </div>
        </>
      )}

      {section === 'freezer' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 20 }}>🧊 Freezer Inventory</p>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, color: '#60a5fa', fontWeight: 'bold', fontSize: 16 }}>{TOTAL_LBS.toLocaleString()} lbs</p>
              <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>of {FREEZER_CAPACITY.toLocaleString()} lb capacity</p>
            </div>
          </div>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>Spiny Tails · Firetrial Road · Nassau</p>
              <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>{((TOTAL_LBS / FREEZER_CAPACITY) * 100).toFixed(1)}% full</p>
            </div>
            <div style={{ backgroundColor: '#060d1f', borderRadius: 8, height: 12, overflow: 'hidden' }}>
              <div style={{ width: ((TOTAL_LBS / FREEZER_CAPACITY) * 100) + '%', height: '100%', background: 'linear-gradient(90deg, #4ade80, #60a5fa)', borderRadius: 8 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <p style={{ margin: 0, color: '#4ade80', fontSize: 11 }}>● Blast Freezer · ● Holding Freezer</p>
              <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{(FREEZER_CAPACITY - TOTAL_LBS).toLocaleString()} lbs available</p>
            </div>
          </div>
          {(['seafood', 'poultry', 'meat'] as const).map(cat => {
            const items = SPINY_TAILS_INVENTORY.filter(i => i.category === cat && i.lbs > 0);
            if (items.length === 0) return null;
            const catLabel = cat === 'seafood' ? '🐟 Seafood' : cat === 'poultry' ? '🍗 Poultry' : '🥩 Meats';
            const catTotal = items.reduce((s, i) => s + i.lbs, 0);
            return (
              <div key={cat} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>{catLabel}</p>
                  <p style={{ margin: 0, color: '#4a5568', fontSize: 12 }}>{catTotal.toLocaleString()} lbs</p>
                </div>
                {items.map(item => (
                  <div key={item.name} style={{ ...card, padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{item.icon}</span>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 'bold' }}>{item.name}</p>
                    </div>
                    <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 14 }}>{item.lbs.toLocaleString()} lbs</p>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}

      {section === 'purchase' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 6 }}>📦 Purchase Orders</p>
          <p style={{ color: '#4a5568', fontSize: 13, marginBottom: 20 }}>Snap a supplier invoice · AI reads it · Allocate cases to retail/wholesale</p>
          <Link href="/purchase-orders" style={{ display: 'block', background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', padding: '16px', borderRadius: 14, textDecoration: 'none', fontSize: 16, textAlign: 'center', marginBottom: 14 }}>
            📦 Open Purchase Orders →
          </Link>
          <div style={{ ...card, background: 'linear-gradient(135deg, #0a1220, #0d1a2e)' }}>
            <p style={{ margin: '0 0 10px', color: '#60a5fa', fontWeight: 'bold', fontSize: 13 }}>How it works</p>
            {['📷 Snap or upload a supplier invoice photo', '🤖 AI reads and extracts all line items automatically', '📊 Allocate cases: Retail Physical · Retail Online · Wholesale Physical · Wholesale Online', '✅ Saved to inventory and order history'].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 11, minWidth: 16 }}>{i + 1}.</p>
                <p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{step}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {section === 'pos' && (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ fontSize: 64, marginBottom: 20 }}>🛒</p>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 22, marginBottom: 8 }}>Walking POS</p>
          <p style={{ color: '#4a5568', fontSize: 14, marginBottom: 8 }}>Works on any camera-powered device</p>
          <p style={{ color: '#4a5568', fontSize: 13, marginBottom: 32 }}>Cart · Customer lookup · Print / Email / WhatsApp invoice</p>
          <Link href="/pos" style={{ display: 'inline-block', background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', padding: '16px 40px', borderRadius: 14, textDecoration: 'none', fontSize: 17 }}>
            Open Walking POS →
          </Link>
        </div>
      )}

      {section === 'yield' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 20 }}>🧮 Yield Conversion Calculator</p>
          <div style={card}>
            <p style={{ margin: '0 0 20px', color: '#aaa', fontSize: 14 }}>Enter whole weight to calculate usable product after processing.</p>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 11, letterSpacing: 1 }}>PRODUCT TYPE</p>
                <select value={yieldType} onChange={(e) => setYieldType(e.target.value)}
                  style={{ width: '100%', padding: '14px 16px', borderRadius: 12, backgroundColor: '#060d1f', color: '#fff', border: '1px solid #1e3a5f', fontSize: 15, outline: 'none' }}>
                  {Object.entries(YIELD_PRESETS).map(([key, val]) => (
                    <option key={key} value={key}>{val.icon} {key} — {(val.yield * 100).toFixed(0)}% yield</option>
                  ))}
                </select>
              </div>
              <div>
                <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 11, letterSpacing: 1 }}>WHOLE WEIGHT (lbs)</p>
                <input type="number" value={yieldWeight} onChange={(e) => setYieldWeight(parseFloat(e.target.value) || 0)}
                  style={{ width: '100%', padding: '14px 16px', borderRadius: 12, backgroundColor: '#060d1f', color: '#fff', border: '1px solid #1e3a5f', fontSize: 22, fontWeight: 'bold', outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: 'YIELD RATE', value: (currentYield.yield * 100).toFixed(0) + '%', color: '#4ade80', bg: 'linear-gradient(135deg, #0a1f0a, #0d2b14)', border: '#1e5a2f' },
                { label: 'USABLE WEIGHT', value: usableWeight + ' lbs', color: '#60a5fa', bg: 'linear-gradient(135deg, #001a2a, #002a3a)', border: '#1e3a5f' },
                { label: 'RETAIL PORTIONS', value: '~' + retailPortions, color: '#f5c518', bg: 'linear-gradient(135deg, #1a1200, #2a1e00)', border: '#3a2e00' },
              ].map(x => (
                <div key={x.label} style={{ background: x.bg, borderRadius: 14, padding: 18, textAlign: 'center', border: '1px solid ' + x.border }}>
                  <p style={{ margin: 0, color: '#4a5568', fontSize: 10, letterSpacing: 1 }}>{x.label}</p>
                  <p style={{ margin: '8px 0 4px', color: x.color, fontWeight: 'bold', fontSize: 24 }}>{x.value}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, backgroundColor: '#060d1f', borderRadius: 12, padding: 16, border: '1px solid #1e3a5f' }}>
              <p style={{ margin: '0 0 8px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>Summary</p>
              <p style={{ margin: '3px 0', color: '#aaa', fontSize: 13 }}>Starting: <b style={{ color: '#fff' }}>{yieldWeight} lbs</b> whole {yieldType}</p>
              <p style={{ margin: '3px 0', color: '#aaa', fontSize: 13 }}>Waste/trim: <b style={{ color: '#f87171' }}>{(yieldWeight * (1 - currentYield.yield)).toFixed(1)} lbs</b></p>
              <p style={{ margin: '3px 0', color: '#aaa', fontSize: 13 }}>Usable: <b style={{ color: '#4ade80' }}>{usableWeight} lbs</b></p>
              <p style={{ margin: '3px 0', color: '#aaa', fontSize: 13 }}>Retail packs: <b style={{ color: '#f5c518' }}>~{retailPortions} units</b> at ¾ lb each</p>
            </div>
          </div>
        </>
      )}

      {section === 'profit' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 20 }}>💰 Sales & Money</p>
          <div style={card}>
            <p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Profit by Channel</p>
            {[
              { label: 'POS / Physical Store', revenue: posRevenue, profit: posRevenue * 0.07, rate: '7%', icon: '🛒', color: '#4ade80' },
              { label: 'Online Marketplace', revenue: marketRevenue, profit: marketRevenue * 0.25, rate: '25%', icon: '🏪', color: '#60a5fa' },
              { label: 'Wholesale', revenue: 0, profit: 0, rate: '12%', icon: '📦', color: '#f5c518' },
              { label: 'US Supplier Sales', revenue: 0, profit: 0, rate: 'TBD', icon: '🇺🇸', color: '#60a5fa' },
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
              <p style={{ margin: '0 0 6px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Supplier Payouts</p>
              <p style={{ margin: '0 0 14px', color: '#4a5568', fontSize: 12 }}>93% per sale</p>
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
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 20 }}>⚠️ Stock Alerts</p>
          {lowStockItems.length === 0 && <div style={{ ...card, textAlign: 'center', padding: 28 }}><p style={{ color: '#4ade80', margin: 0 }}>✅ All stock levels healthy</p></div>}
          {lowStockItems.length > 0 && (
            <div style={{ ...card, borderColor: '#7f1d1d', backgroundColor: '#1a0808' }}>
              <p style={{ margin: '0 0 12px', color: '#f87171', fontWeight: 'bold', fontSize: 14 }}>Low Stock</p>
              {lowStockItems.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{p.name}</p>
                  <p style={{ margin: 0, color: '#f87171', fontWeight: 'bold', fontSize: 13 }}>{p.stock} left</p>
                </div>
              ))}
            </div>
          )}
          <Link href="/inventory" style={{ display: 'block', background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', padding: '14px', borderRadius: 12, textDecoration: 'none', fontSize: 15, textAlign: 'center' }}>
            Open Full Inventory →
          </Link>
        </>
      )}

      {section === 'market' && (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ fontSize: 64, marginBottom: 20 }}>🏪</p>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 22, marginBottom: 8 }}>BSC Online Marketplace</p>
          <p style={{ color: '#4a5568', fontSize: 14, marginBottom: 32 }}>Local + US supplier products · Delivery all Bahamas islands</p>
          <Link href="/market" style={{ display: 'inline-block', background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', padding: '16px 40px', borderRadius: 14, textDecoration: 'none', fontSize: 17 }}>
            Open Marketplace →
          </Link>
        </div>
      )}

      {section === 'report' && (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ fontSize: 64, marginBottom: 20 }}>📋</p>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 22, marginBottom: 8 }}>Daily Reports</p>
          <p style={{ color: '#4a5568', fontSize: 14, marginBottom: 32 }}>All sales, invoices, and transactions</p>
          <Link href="/report" style={{ display: 'inline-block', background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', padding: '16px 40px', borderRadius: 14, textDecoration: 'none', fontSize: 17 }}>
            Open Reports →
          </Link>
        </div>
      )}

      {section === 'suppliers' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 6 }}>🚢 Supplier Admin</p>
          <div style={{ backgroundColor: '#0a1220', border: '1px solid #1e3a5f', borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ margin: 0, color: '#60a5fa', fontSize: 11, fontWeight: 'bold' }}>SUPPLIER PORTAL URL</p>
            <p style={{ margin: '4px 0 0', color: '#fff', fontSize: 13, fontFamily: 'monospace' }}>https://project-1fnu0.vercel.app/supplier</p>
          </div>
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
                          💬 WhatsApp {sup.whatsapp}
                        </a>
                      )}
                    </div>
                    {supProds.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>PRODUCTS ({supProds.length})</p>
                        {supProds.map(prod => (
                          <div key={prod.id} style={{ backgroundColor: '#060d1f', borderRadius: 10, padding: '10px 12px', marginBottom: 6, border: '1px solid #1e3a5f' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                {prod.photo_url && <img src={prod.photo_url} alt={prod.name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />}
                                <div>
                                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: 12 }}>{prod.name}</p>
                                  <p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>SKU: {prod.sku || 'N/A'} · Cost: ${prod.case_cost?.toFixed(2) || '0.00'}/case</p>
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
                      <p style={{ margin: '2px 0', color: '#6b7280', fontSize: 11 }}>SKU: {prod.sku || 'N/A'} · Cost: ${prod.case_cost?.toFixed(2) || '0.00'}/case</p>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: prod.status === 'pending' ? 10 : 0 }}>
                    {[
                      { l: 'RETAIL', v: '$' + (prod.retail_price?.toFixed(2) || '0.00'), c: '#4ade80' },
                      { l: 'WHOLESALE', v: '$' + (prod.wholesale_price?.toFixed(2) || '0.00'), c: '#f5c518' },
                      { l: 'UNIT COST', v: '$' + (prod.unit_cost?.toFixed(2) || '0.00'), c: '#60a5fa' },
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
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e3a5f', background: 'linear-gradient(135deg, #0d1f3c, #132a4a)' }}>
            <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>🤖 BSC AI Assistant</p>
            <p style={{ margin: '3px 0 0', color: '#4a5568', fontSize: 12 }}>Knows Spiny Tails inventory · Live sales data · Scaling strategy</p>
          </div>
          <div style={{ height: 420, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {aiMessages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%', padding: '12px 16px', fontSize: 14, lineHeight: 1.6,
                  borderRadius: msg.role === 'user' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
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
                <div style={{ padding: '12px 16px', borderRadius: '16px 16px 16px 2px', backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', color: '#4a5568', fontSize: 14 }}>Thinking...</div>
              </div>
            )}
          </div>
          <div style={{ padding: '14px 18px', borderTop: '1px solid #1e3a5f', display: 'flex', gap: 10 }}>
            <input
              placeholder="Ask about Spiny Tails, scaling, profits..."
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAiSend()}
              style={{ flex: 1, padding: '12px 16px', borderRadius: 12, backgroundColor: '#060d1f', color: '#fff', border: '1px solid #1e3a5f', fontSize: 14, outline: 'none' }}
            />
            <button onClick={handleAiSend} disabled={aiLoading}
              style={{ padding: '12px 20px', borderRadius: 12, backgroundColor: aiLoading ? '#555' : '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: aiLoading ? 'not-allowed' : 'pointer', fontSize: 14 }}>
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#060d1f', color: '#fff', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {!isMobile && (
        <div style={{ width: 260, backgroundColor: '#070e1d', borderRight: '1px solid #1a2a3a', position: 'sticky' as const, top: 0, height: '100vh', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <SidebarContent />
        </div>
      )}
      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
          <div onClick={() => setSidebarOpen(false)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)' }} />
          <div style={{ position: 'relative', zIndex: 1, width: 280, backgroundColor: '#070e1d', display: 'flex', flexDirection: 'column', height: '100vh', borderRight: '1px solid #1a2a3a' }}>
            <SidebarContent />
          </div>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'linear-gradient(135deg, #070e1d, #0d1f3c)', borderBottom: '1px solid #1a2a3a', padding: '14px 20px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 22, cursor: 'pointer', padding: 0 }}>☰</button>
              <div>
                <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 18 }}>BSC Control</p>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>{today}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: isMobile ? 12 : 24, alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: isMobile ? 14 : 18 }}>${finance.revenue.toFixed(2)}</p>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>REVENUE</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: isMobile ? 14 : 18 }}>${totalProfit.toFixed(2)}</p>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>PROFIT</p>
              </div>
              {!isMobile && (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 18 }}>{finance.transactions}</p>
                  <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>SALES</p>
                </div>
              )}
              <div style={{ backgroundColor: '#0a2010', color: '#4ade80', borderRadius: 20, padding: '5px 14px', fontSize: 11, fontWeight: 'bold', border: '1px solid #4ade80' }}>LIVE</div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, padding: '24px 20px', overflowY: 'auto', paddingBottom: isMobile ? 90 : 40, maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' as const }}>
          <MainContent />
        </div>
        {isMobile && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#070e1d', borderTop: '1px solid #1a2a3a', display: 'flex', justifyContent: 'space-around', padding: '8px 0 10px', zIndex: 100 }}>
            {[
              { s: 'overview' as Section, icon: '📊', label: 'Overview' },
              { s: 'freezer' as Section, icon: '🧊', label: 'Freezer' },
              { s: 'pos' as Section, icon: '🛒', label: 'POS' },
              { s: 'suppliers' as Section, icon: '🚢', label: 'Suppliers' },
              { s: 'ai' as Section, icon: '🤖', label: 'AI' },
            ].map(item => (
              <button key={item.s} onClick={() => setSection(item.s)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                color: section === item.s ? '#f5c518' : '#4a5568',
                position: 'relative' as const,
              }}>
                <span style={{ fontSize: 22 }}>{item.icon}</span>
                <span style={{ fontSize: 9, letterSpacing: 0.5, fontWeight: section === item.s ? 'bold' : 'normal' }}>{item.label}</span>
                {item.s === 'suppliers' && pendingCount > 0 && (
                  <span style={{ position: 'absolute', top: 0, right: 4, backgroundColor: '#f87171', color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pendingCount}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
