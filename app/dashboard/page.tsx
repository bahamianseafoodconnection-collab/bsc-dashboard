'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import InvoiceScanner from '@/components/InvoiceScanner';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { icon: '🏠', label: 'Overview',        href: '/dashboard' },
      { icon: '🟡', label: 'Nassau POS',       href: '/pos' },
      { icon: '🟣', label: 'Andros POS',       href: '/pos-andros' },
      { icon: '📦', label: 'Orders',           href: '/orders' },
    ],
  },
  {
    label: 'Business',
    items: [
      { icon: '🚢', label: 'Suppliers',        href: '/supplier' },
      { icon: '🧾', label: 'Purchase Orders',  href: '/purchase-orders' },
      { icon: '⚖️', label: 'Yield Calculator', href: '/yield' },
      { icon: '📊', label: 'Reports',          href: '/report' },
      { icon: '📦', label: 'Inventory',        href: '/inventory' },
    ],
  },
  {
    label: 'Services',
    items: [
      { icon: '🚗', label: 'Vehicles & Parts', href: '/vehicles' },
      { icon: '⚡', label: 'Bill Payments',    href: '/utilities' },
      { icon: '🛒', label: 'Market',           href: '/market' },
    ],
  },
  {
    label: 'AI & Insights',
    items: [
      { icon: '🤖', label: 'BSC AI Assistant', href: '#ai' },
    ],
  },
];

const REVENUE_STREAMS = [
  { label: 'Nassau POS Sales',  icon: '🟡', value: '$0.00', profit: '38%',      color: '#fef9e7' },
  { label: 'Andros POS Sales',  icon: '🟣', value: '$0.00', profit: '43%',      color: '#f5f0ff' },
  { label: 'Online Market',     icon: '🛒', value: '$0.00', profit: '25%',      color: '#e8f4fd' },
  { label: 'Wholesale',         icon: '📦', value: '$0.00', profit: '12%',      color: '#f0fde8' },
  { label: 'Vehicle Sales',     icon: '🚗', value: '$0.00', profit: '$650/car', color: '#fff3e8' },
  { label: 'Vehicle Rentals',   icon: '🔑', value: '$0.00', profit: '$10/day',  color: '#fff3e8' },
  { label: 'Auto Parts',        icon: '🔧', value: '$0.00', profit: '10%',      color: '#fde8e8' },
  { label: 'Bill Payments',     icon: '⚡', value: '$0.00', profit: '4.5%',     color: '#e8f8fd' },
  { label: 'Supplier Fees',     icon: '🚢', value: '$0.00', profit: 'Varies',   color: '#f0fde8' },
];

const QUICK_ACTIONS = [
  { icon: '📦', label: 'Orders',           href: '/orders',          color: '#e8f4fd', badge: 0 },
  { icon: '🚢', label: 'Suppliers',        href: '/supplier',        color: '#f0fde8', badge: 3 },
  { icon: '⚖️', label: 'Yield Calculator', href: '/yield',           color: '#fef9e7', badge: 0 },
  { icon: '🧾', label: 'Purchase Orders',  href: '/purchase-orders', color: '#fef9e7', badge: 0 },
  { icon: '🚗', label: 'Vehicles & Parts', href: '/vehicles',        color: '#fff3e8', badge: 0 },
  { icon: '⚡', label: 'Pay Bills',        href: '/utilities',       color: '#e8f8fd', badge: 0 },
  { icon: '📊', label: 'Reports',          href: '/report',          color: '#fde8f0', badge: 0 },
  { icon: '📦', label: 'Inventory',        href: '/inventory',       color: '#f0fde8', badge: 0 },
];

type Message = { role: 'user' | 'assistant'; content: string };

type SaleRecord = {
  id: string;
  created_at: string;
  total: number;
  status: string;
  payment_method: string;
  channel?: string;
};

const MARGIN: Record<string, number> = {
  nassau: 0.38,
  andros: 0.43,
  online: 0.25,
  wholesale: 0.12,
};

function calcSplit(sale: SaleRecord) {
  const channel = sale.channel || 'nassau';
  const margin = MARGIN[channel] ?? 0.38;
  const bscProfit = sale.total * margin;
  const supplierCOGS = sale.total - bscProfit;
  return { bscProfit, supplierCOGS, margin };
}

function fmtBSD(n: number) {
  return `BSD $${n.toFixed(2)}`;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab]     = useState('overview');
  const [aiMessages, setAiMessages]   = useState<Message[]>([
    { role: 'assistant', content: "Good morning, Dedrick! I'm your BSC AI Assistant. Ask me anything about your business — revenue, margins, inventory, pricing, or strategy." },
  ]);
  const [aiInput, setAiInput]         = useState('');
  const [aiLoading, setAiLoading]     = useState(false);
  const [spinyTailsStock]             = useState(9310);
  const messagesEndRef                = useRef<HTMLDivElement>(null);
  const [todaySales, setTodaySales]   = useState<SaleRecord[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  useEffect(() => {
    if (activeTab === 'overview') loadTodaySales();
  }, [activeTab]);

  async function loadTodaySales() {
    setSalesLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(20);
    setTodaySales(data || []);
    setSalesLoading(false);
  }

  const todayRevenue  = todaySales.reduce((s, o) => s + (o.total || 0), 0);
  const todayProfit   = todaySales.reduce((s, o) => s + calcSplit(o).bscProfit, 0);
  const todaySupplier = todaySales.reduce((s, o) => s + calcSplit(o).supplierCOGS, 0);

  async function sendAiMessage() {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = aiInput.trim();
    setAiInput('');
    setAiLoading(true);
    setAiMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    try {
      const res  = await fetch('/api/ai-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: userMsg }) });
      const data = await res.json();
      setAiMessages((prev) => [...prev, { role: 'assistant', content: data.reply || 'Sorry, I could not get a response.' }]);
    } catch {
      setAiMessages((prev) => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    }
    setAiLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
      )}

      <aside style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: '240px', backgroundColor: '#1a2e5a', zIndex: 50, display: 'flex', flexDirection: 'column', transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.25s ease', boxShadow: '4px 0 24px rgba(0,0,0,0.15)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🐟</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>BSC Control</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>Dedrick Storr Snr</div>
            </div>
          </div>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: '8px' }}>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '6px 20px 4px' }}>
                {group.label}
              </div>
              {group.items.map((item) => (
                <Link key={item.label} href={item.href} onClick={() => { setSidebarOpen(false); if (item.href === '#ai') setActiveTab('ai'); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 20px', color: 'rgba(255,255,255,0.75)', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>
                  <span style={{ fontSize: '16px' }}>{item.icon}</span>
                  {item.label}
                  {item.label === 'Suppliers' && (
                    <span style={{ marginLeft: 'auto', backgroundColor: '#f4c842', color: '#1a2e5a', fontSize: '10px', fontWeight: 900, padding: '2px 7px', borderRadius: '20px' }}>3</span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={handleSignOut} style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '10px', padding: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Sign Out
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        <header style={{ backgroundColor: '#fff', borderBottom: '1px solid #ebebeb', padding: '0 16px', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '8px' }}>
                <svg width="22" height="22" fill="none" stroke="#1a2e5a" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h1 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '17px', margin: 0 }}>BSC Control</h1>
                <p style={{ color: '#999', fontSize: '10px', margin: 0 }}>Live · Nassau & Andros</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px' }}>● System Live</span>
              <Link href="/market" style={{ fontSize: '12px', color: '#1a2e5a', fontWeight: 700, textDecoration: 'none', backgroundColor: '#f0f4ff', padding: '6px 12px', borderRadius: '8px' }}>
                Market →
              </Link>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '2px', overflowX: 'auto' }}>
            {[
              { key: 'overview',  label: '📊 Overview' },
              { key: 'revenue',   label: '💰 Revenue' },
              { key: 'yield',     label: '⚖️ Yield' },
              { key: 'inventory', label: '🧊 Freezer' },
              { key: 'ai',        label: '🤖 AI' },
            ].map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: '10px 14px', border: 'none', borderBottom: activeTab === tab.key ? '3px solid #f4c842' : '3px solid transparent', backgroundColor: 'transparent', color: activeTab === tab.key ? '#1a2e5a' : '#888', fontWeight: activeTab === tab.key ? 800 : 500, fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        <main style={{ flex: 1, padding: '20px 16px', overflowY: 'auto' }}>

          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <div>

              {/* TODAY TOTALS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
                <div style={{ backgroundColor: '#1a2e5a', borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', marginBottom: '4px' }}>Today Revenue</div>
                  <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '18px' }}>{fmtBSD(todayRevenue)}</div>
                </div>
                <div style={{ backgroundColor: '#e8f5e9', borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ color: '#666', fontSize: '10px', marginBottom: '4px' }}>BSC Keeps</div>
                  <div style={{ color: '#2e7d32', fontWeight: 900, fontSize: '18px' }}>{fmtBSD(todayProfit)}</div>
                </div>
                <div style={{ backgroundColor: '#fde8e8', borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ color: '#666', fontSize: '10px', marginBottom: '4px' }}>Supplier Owed</div>
                  <div style={{ color: '#dc2626', fontWeight: 900, fontSize: '18px' }}>{fmtBSD(todaySupplier)}</div>
                </div>
              </div>

              {/* LIVE SALES FEED */}
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '15px', margin: 0 }}>📈 Live Sales Today</h2>
                  <button onClick={loadTodaySales} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '4px 10px', fontSize: '11px', color: '#1a2e5a', fontWeight: 700, cursor: 'pointer' }}>
                    Refresh
                  </button>
                </div>
                {salesLoading ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: '#999', fontSize: '13px' }}>Loading sales...</div>
                ) : todaySales.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: '#999', fontSize: '13px' }}>No sales yet today. Go make money Dedrick! 💪</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {todaySales.map((sale) => {
                      const { bscProfit, supplierCOGS, margin } = calcSplit(sale);
                      const channel = sale.channel || 'nassau';
                      return (
                        <div key={sale.id} style={{ backgroundColor: '#f8f9fa', borderRadius: '12px', padding: '12px 14px', borderLeft: '4px solid #1a2e5a' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div>
                              <div style={{ fontWeight: 800, color: '#1a2e5a', fontSize: '14px' }}>
                                {fmtBSD(sale.total || 0)}
                                <span style={{ marginLeft: '8px', backgroundColor: '#e8f4fd', color: '#1a2e5a', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', textTransform: 'capitalize' }}>
                                  {channel}
                                </span>
                              </div>
                              <div style={{ color: '#999', fontSize: '11px', marginTop: '2px' }}>
                                {timeAgo(sale.created_at)} · {sale.payment_method || 'cash'}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ color: '#2e7d32', fontWeight: 800, fontSize: '13px' }}>+{fmtBSD(bscProfit)}</div>
                              <div style={{ color: '#dc2626', fontSize: '11px' }}>-{fmtBSD(supplierCOGS)} supplier</div>
                            </div>
                          </div>
                          <div style={{ height: '6px', backgroundColor: '#e5e7eb', borderRadius: '20px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${margin * 100}%`, backgroundColor: '#2e7d32', borderRadius: '20px' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                            <span style={{ color: '#999', fontSize: '10px' }}>BSC {(margin * 100).toFixed(0)}% margin</span>
                            <span style={{ color: '#999', fontSize: '10px' }}>Supplier {((1 - margin) * 100).toFixed(0)}% COGS</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* INVOICE SCANNER — full multi-page component */}
              <InvoiceScanner />

              {/* LOCATION CARDS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '5px solid #f4c842' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div>
                      <div style={{ color: '#999', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Nassau</div>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '15px' }}>Firetrial Road</div>
                    </div>
                    <span style={{ fontSize: '26px' }}>🟡</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ backgroundColor: '#fef9e7', borderRadius: '10px', padding: '10px' }}>
                      <div style={{ color: '#999', fontSize: '10px', marginBottom: '3px' }}>Today Revenue</div>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px' }}>
                        {fmtBSD(todaySales.filter(s => (s.channel || 'nassau') === 'nassau').reduce((a, s) => a + s.total, 0))}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#e8f5e9', borderRadius: '10px', padding: '10px' }}>
                      <div style={{ color: '#999', fontSize: '10px', marginBottom: '3px' }}>BSC Profit 38%</div>
                      <div style={{ color: '#2e7d32', fontWeight: 900, fontSize: '18px' }}>
                        {fmtBSD(todaySales.filter(s => (s.channel || 'nassau') === 'nassau').reduce((a, s) => a + s.total * 0.38, 0))}
                      </div>
                    </div>
                  </div>
                  <Link href="/pos" style={{ display: 'block', backgroundColor: '#1a2e5a', color: '#f4c842', textDecoration: 'none', borderRadius: '10px', padding: '10px', textAlign: 'center', fontWeight: 800, fontSize: '13px' }}>
                    Open Nassau POS →
                  </Link>
                </div>

                <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '5px solid #7c3aed' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div>
                      <div style={{ color: '#999', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Andros</div>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '15px' }}>{"Ceta's Variety Store"}</div>
                    </div>
                    <span style={{ fontSize: '26px' }}>🟣</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ backgroundColor: '#f5f0ff', borderRadius: '10px', padding: '10px' }}>
                      <div style={{ color: '#999', fontSize: '10px', marginBottom: '3px' }}>Today Revenue</div>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px' }}>
                        {fmtBSD(todaySales.filter(s => s.channel === 'andros').reduce((a, s) => a + s.total, 0))}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#e8f5e9', borderRadius: '10px', padding: '10px' }}>
                      <div style={{ color: '#999', fontSize: '10px', marginBottom: '3px' }}>BSC Profit 43%</div>
                      <div style={{ color: '#2e7d32', fontWeight: 900, fontSize: '18px' }}>
                        {fmtBSD(todaySales.filter(s => s.channel === 'andros').reduce((a, s) => a + s.total * 0.43, 0))}
                      </div>
                    </div>
                  </div>
                  <Link href="/pos-andros" style={{ display: 'block', backgroundColor: '#7c3aed', color: '#fff', textDecoration: 'none', borderRadius: '10px', padding: '10px', textAlign: 'center', fontWeight: 800, fontSize: '13px' }}>
                    Open Andros POS →
                  </Link>
                </div>
              </div>

              {/* QUICK ACTIONS */}
              <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '15px', marginBottom: '12px' }}>Quick Actions</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
                {QUICK_ACTIONS.map((action) => (
                  <Link key={action.label} href={action.href} style={{ backgroundColor: '#fff', border: '1px solid #ebebeb', borderRadius: '14px', padding: '14px 8px', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', position: 'relative' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: action.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                      {action.icon}
                    </div>
                    <span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '11px', lineHeight: 1.3 }}>{action.label}</span>
                    {action.badge > 0 && (
                      <span style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: '#ef4444', color: '#fff', fontSize: '9px', fontWeight: 900, padding: '2px 5px', borderRadius: '20px' }}>{action.badge}</span>
                    )}
                  </Link>
                ))}
              </div>

              {/* SPINY TAILS */}
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '15px', margin: 0 }}>🧊 Spiny Tails Freezer</h2>
                  <Link href="/inventory" style={{ color: '#1a2e5a', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>View All →</Link>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '12px' }}>
                  {[
                    { label: 'In Stock',  value: `${spinyTailsStock.toLocaleString()} lbs`, bg: '#e8f4fd', text: '#1a2e5a' },
                    { label: 'Capacity',  value: '30,000 lbs',                              bg: '#e8f5e9', text: '#2e7d32' },
                    { label: 'Used',      value: '31%',                                     bg: '#fef9e7', text: '#d97706' },
                  ].map((s) => (
                    <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>{s.label}</div>
                      <div style={{ color: s.text, fontWeight: 900, fontSize: '15px' }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ height: '8px', backgroundColor: '#f0f0f0', borderRadius: '20px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '31%', backgroundColor: '#1a2e5a', borderRadius: '20px' }} />
                </div>
              </div>
            </div>
          )}

          {/* ── REVENUE TAB ── */}
          {activeTab === 'revenue' && (
            <div>
              <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '17px', marginBottom: '6px' }}>All 9 Revenue Streams</h2>
              <p style={{ color: '#999', fontSize: '12px', marginBottom: '18px' }}>Live profit tracking across every BSC channel</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {REVENUE_STREAMS.map((stream) => (
                  <div key={stream.label} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: stream.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
                      {stream.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#666', fontSize: '12px', marginBottom: '2px' }}>{stream.label}</div>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px' }}>{stream.value}</div>
                    </div>
                    <div style={{ backgroundColor: '#e8f5e9', borderRadius: '8px', padding: '4px 10px' }}>
                      <span style={{ color: '#2e7d32', fontWeight: 800, fontSize: '13px' }}>{stream.profit}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ backgroundColor: '#1a2e5a', borderRadius: '16px', padding: '18px' }}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '6px' }}>Monthly Fixed Expenses</div>
                <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '28px' }}>$20,590</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '4px' }}>Nassau rent · Andros · Staff · Utilities</div>
              </div>
            </div>
          )}

          {/* ── YIELD TAB ── */}
          {activeTab === 'yield' && (
            <div>
              <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '17px', marginBottom: '6px' }}>⚖️ Yield Calculator</h2>
              <p style={{ color: '#999', fontSize: '12px', marginBottom: '20px' }}>Weight in → Weight out → True cost/lb → Channel prices</p>
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '14px' }}>⚖️</div>
                <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px', marginBottom: '8px' }}>Full Yield Calculator</div>
                <div style={{ color: '#666', fontSize: '13px', marginBottom: '20px', lineHeight: 1.6 }}>
                  Generate lot batch numbers · Track weight in/out · Calculate Nassau, Andros, Online and Wholesale prices automatically
                </div>
                <Link href="/yield" style={{ display: 'inline-block', backgroundColor: '#1a2e5a', color: '#f4c842', textDecoration: 'none', borderRadius: '12px', padding: '14px 32px', fontWeight: 900, fontSize: '15px' }}>
                  Open Yield Calculator →
                </Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {[
                  { label: '100 lbs in / 35 lbs out', result: '35% yield · $7.14/lb', color: '#fef9e7' },
                  { label: 'Nassau (38%)',             result: '$9.86/lb',             color: '#fef9e7' },
                  { label: 'Andros (43%)',             result: '$10.21/lb',            color: '#f5f0ff' },
                  { label: 'Online (25%)',             result: '$8.93/lb',             color: '#e8f4fd' },
                ].map((ex) => (
                  <div key={ex.label} style={{ backgroundColor: ex.color, borderRadius: '12px', padding: '14px' }}>
                    <div style={{ color: '#666', fontSize: '11px', marginBottom: '4px' }}>{ex.label}</div>
                    <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px' }}>{ex.result}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── INVENTORY TAB ── */}
          {activeTab === 'inventory' && (
            <div>
              <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '17px', marginBottom: '20px' }}>🧊 Freezer Inventory</h2>
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
                <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px', marginBottom: '14px' }}>Spiny Tails Cold Storage — Mastic Point</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
                  {[
                    { label: 'Current Stock',   value: `${spinyTailsStock.toLocaleString()} lbs`,          color: '#e8f4fd', text: '#1a2e5a' },
                    { label: 'Total Capacity',  value: '30,000 lbs',                                       color: '#f0fde8', text: '#2e7d32' },
                    { label: 'Available Space', value: `${(30000 - spinyTailsStock).toLocaleString()} lbs`, color: '#fef9e7', text: '#d97706' },
                    { label: 'Capacity Used',   value: '31%',                                              color: '#fde8e8', text: '#dc2626' },
                  ].map((s) => (
                    <div key={s.label} style={{ backgroundColor: s.color, borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                      <div style={{ color: '#666', fontSize: '10px', marginBottom: '4px' }}>{s.label}</div>
                      <div style={{ color: s.text, fontWeight: 900, fontSize: '16px' }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ height: '10px', backgroundColor: '#f0f0f0', borderRadius: '20px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '31%', backgroundColor: '#1a2e5a', borderRadius: '20px' }} />
                </div>
              </div>
              <Link href="/purchase-orders" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#1a2e5a', color: '#f4c842', textDecoration: 'none', borderRadius: '12px', padding: '12px 20px', fontWeight: 800, fontSize: '14px' }}>
                + New Purchase Order
              </Link>
            </div>
          )}

          {/* ── AI TAB ── */}
          {activeTab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
              <div style={{ backgroundColor: '#1a2e5a', borderRadius: '16px 16px 0 0', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#f4c842', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🤖</div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: '14px' }}>BSC AI Assistant</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>Knows your entire business</div>
                </div>
              </div>
              <div style={{ flex: 1, backgroundColor: '#fff', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {aiMessages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', backgroundColor: msg.role === 'user' ? '#1a2e5a' : '#f8f9fa', color: msg.role === 'user' ? '#fff' : '#1a2e5a', fontSize: '14px', lineHeight: 1.5 }}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ backgroundColor: '#f8f9fa', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', color: '#999', fontSize: '14px' }}>Thinking...</div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div style={{ backgroundColor: '#f8f9fa', padding: '8px 14px', display: 'flex', gap: '6px', overflowX: 'auto' }}>
                {['Nassau profit today', 'Andros 43% margin', 'Spiny Tails stock', 'Monthly expenses', 'Yield formula'].map((prompt) => (
                  <button key={prompt} onClick={() => setAiInput(prompt)} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '5px 12px', fontSize: '11px', color: '#1a2e5a', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {prompt}
                  </button>
                ))}
              </div>
              <div style={{ backgroundColor: '#fff', borderRadius: '0 0 16px 16px', padding: '12px 14px', borderTop: '1px solid #ebebeb', display: 'flex', gap: '8px' }}>
                <input type="text" value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendAiMessage()} placeholder="Ask about your business..." style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none' }} />
                <button onClick={sendAiMessage} disabled={aiLoading || !aiInput.trim()} style={{ backgroundColor: aiLoading || !aiInput.trim() ? '#94a3b8' : '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: '10px', padding: '10px 16px', fontWeight: 800, fontSize: '13px', cursor: aiLoading ? 'not-allowed' : 'pointer' }}>
                  Send
                </button>
              </div>
            </div>
          )}
        </main>

        <nav style={{ backgroundColor: '#fff', borderTop: '1px solid #ebebeb', display: 'flex', position: 'sticky', bottom: 0, zIndex: 30 }}>
          {[
            { icon: '🏠', label: 'Overview', tab: 'overview' },
            { icon: '🟡', label: 'Nassau',   href: '/pos' },
            { icon: '💰', label: 'Revenue',  tab: 'revenue' },
            { icon: '⚖️', label: 'Yield',    tab: 'yield' },
            { icon: '🤖', label: 'AI',       tab: 'ai' },
          ].map((item) => (
            item.href ? (
              <Link key={item.label} href={item.href} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px', textDecoration: 'none', gap: '2px' }}>
                <span style={{ fontSize: '20px' }}>{item.icon}</span>
                <span style={{ color: '#999', fontSize: '10px', fontWeight: 600 }}>{item.label}</span>
              </Link>
            ) : (
              <button key={item.label} onClick={() => setActiveTab(item.tab!)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px', background: 'none', border: 'none', cursor: 'pointer', gap: '2px', borderTop: activeTab === item.tab ? '3px solid #f4c842' : '3px solid transparent' }}>
                <span style={{ fontSize: '20px' }}>{item.icon}</span>
                <span style={{ color: activeTab === item.tab ? '#1a2e5a' : '#999', fontSize: '10px', fontWeight: activeTab === item.tab ? 800 : 600 }}>{item.label}</span>
              </button>
            )
          ))}
        </nav>
      </div>
    </div>
  );
}
