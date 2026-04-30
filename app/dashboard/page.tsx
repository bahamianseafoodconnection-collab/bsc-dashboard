'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { icon: '🏠', label: 'Overview', href: '/dashboard' },
      { icon: '🟡', label: 'Nassau POS', href: '/pos' },
      { icon: '🟣', label: 'Andros POS', href: '/pos-andros' },
      { icon: '📦', label: 'Orders', href: '/orders' },
    ],
  },
  {
    label: 'Business',
    items: [
      { icon: '🚢', label: 'Suppliers', href: '/supplier' },
      { icon: '🧾', label: 'Purchase Orders', href: '/purchase-orders' },
      { icon: '📊', label: 'Reports', href: '/report' },
      { icon: '📦', label: 'Inventory', href: '/inventory' },
    ],
  },
  {
    label: 'Services',
    items: [
      { icon: '🚗', label: 'Vehicles & Parts', href: '/vehicles' },
      { icon: '⚡', label: 'Bill Payments', href: '/utilities' },
      { icon: '🛒', label: 'Market', href: '/market' },
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
  { label: 'Nassau POS Sales', icon: '🟡', value: '$0.00', profit: '38%', color: '#fef9e7' },
  { label: 'Andros POS Sales', icon: '🟣', value: '$0.00', profit: '43%', color: '#f5f0ff' },
  { label: 'Online Market', icon: '🛒', value: '$0.00', profit: '25%', color: '#e8f4fd' },
  { label: 'Wholesale', icon: '📦', value: '$0.00', profit: '12%', color: '#f0fde8' },
  { label: 'Vehicle Sales', icon: '🚗', value: '$0.00', profit: '$650/car', color: '#fff3e8' },
  { label: 'Vehicle Rentals', icon: '🔑', value: '$0.00', profit: '$10/day', color: '#fff3e8' },
  { label: 'Auto Parts', icon: '🔧', value: '$0.00', profit: '10%', color: '#fde8e8' },
  { label: 'Bill Payments', icon: '⚡', value: '$0.00', profit: '4.5%', color: '#e8f8fd' },
  { label: 'Supplier Fees', icon: '🚢', value: '$0.00', profit: 'Varies', color: '#f0fde8' },
];

type Message = { role: 'user' | 'assistant'; content: string };

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [aiMessages, setAiMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Good morning, Dedrick! I\'m your BSC AI Assistant. Ask me anything about your business — revenue, margins, inventory, pricing, or strategy.' },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [pendingSuppliers] = useState(3);
  const [spinyTailsStock] = useState(9310);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  async function sendAiMessage() {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = aiInput.trim();
    setAiInput('');
    setAiLoading(true);
    setAiMessages((prev) => [...prev, { role: 'user', content: userMsg }]);

    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
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

      {/* SIDEBAR OVERLAY (mobile) */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
      )}

      {/* SIDEBAR */}
      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: '240px',
        backgroundColor: '#1a2e5a', zIndex: 50, display: 'flex', flexDirection: 'column',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
        boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
      }}
      className="sidebar">
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 44 44" width="32" height="32" fill="none">
                <path d="M10 24c3-5 9-8 15-7s11 5 11 9c0 0-5-3-11-2s-10 4-15 0z" fill="#f4c842" />
                <ellipse cx="28" cy="19" rx="6" ry="4" fill="#38bdf8" opacity="0.9" />
                <circle cx="30" cy="18" r="1.2" fill="white" />
                <path d="M34 21 l5-3 l-1.5 3 l1.5 3z" fill="#f4c842" />
              </svg>
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '16px' }}>BSC Control</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>Dedrick Storr Snr</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: '8px' }}>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '6px 20px 4px' }}>
                {group.label}
              </div>
              {group.items.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 20px', color: 'rgba(255,255,255,0.75)', fontSize: '14px', fontWeight: 500, textDecoration: 'none', borderLeft: '3px solid transparent', transition: 'all 0.15s' }}
                >
                  <span style={{ fontSize: '16px' }}>{item.icon}</span>
                  {item.label}
                  {item.label === 'Suppliers' && pendingSuppliers > 0 && (
                    <span style={{ marginLeft: 'auto', backgroundColor: '#f4c842', color: '#1a2e5a', fontSize: '10px', fontWeight: 900, padding: '2px 7px', borderRadius: '20px' }}>{pendingSuppliers}</span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Sign out */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={handleSignOut} style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '10px', padding: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* TOP NAV */}
        <header style={{ backgroundColor: '#fff', borderBottom: '1px solid #ebebeb', padding: '0 20px', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '8px' }}>
                <svg width="22" height="22" fill="none" stroke="#1a2e5a" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h1 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px', margin: 0 }}>BSC Control</h1>
                <p style={{ color: '#999', fontSize: '11px', margin: 0 }}>Live · Nassau & Andros</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px' }}>● System Live</span>
              <Link href="/market" style={{ fontSize: '12px', color: '#1a2e5a', fontWeight: 700, textDecoration: 'none', backgroundColor: '#f0f4ff', padding: '6px 12px', borderRadius: '8px' }}>
                View Market →
              </Link>
            </div>
          </div>

          {/* Tab nav */}
          <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
            {[
              { key: 'overview', label: '📊 Overview' },
              { key: 'revenue', label: '💰 Revenue' },
              { key: 'inventory', label: '🧊 Inventory' },
              { key: 'ai', label: '🤖 AI Assistant' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{ padding: '12px 16px', border: 'none', borderBottom: activeTab === tab.key ? '3px solid #f4c842' : '3px solid transparent', backgroundColor: 'transparent', color: activeTab === tab.key ? '#1a2e5a' : '#888', fontWeight: activeTab === tab.key ? 800 : 500, fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {/* CONTENT */}
        <main style={{ flex: 1, padding: '24px 20px', overflowY: 'auto' }}>

          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <div>
              {/* Location Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {/* Nassau */}
                <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '5px solid #f4c842' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <div style={{ color: '#999', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Nassau</div>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '16px' }}>Firetrial Road</div>
                    </div>
                    <span style={{ fontSize: '28px' }}>🟡</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ backgroundColor: '#fef9e7', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ color: '#999', fontSize: '11px', marginBottom: '4px' }}>Today Revenue</div>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '20px' }}>$0.00</div>
                    </div>
                    <div style={{ backgroundColor: '#e8f5e9', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ color: '#999', fontSize: '11px', marginBottom: '4px' }}>BSC Profit 38%</div>
                      <div style={{ color: '#2e7d32', fontWeight: 900, fontSize: '20px' }}>$0.00</div>
                    </div>
                  </div>
                  <Link href="/pos" style={{ display: 'block', marginTop: '14px', backgroundColor: '#1a2e5a', color: '#f4c842', textDecoration: 'none', borderRadius: '10px', padding: '10px', textAlign: 'center', fontWeight: 800, fontSize: '13px' }}>
                    Open Nassau POS →
                  </Link>
                </div>

                {/* Andros */}
                <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '5px solid #7c3aed' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <div style={{ color: '#999', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Andros</div>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '16px' }}>Ceta&apos;s Variety Store</div>
                    </div>
                    <span style={{ fontSize: '28px' }}>🟣</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ backgroundColor: '#f5f0ff', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ color: '#999', fontSize: '11px', marginBottom: '4px' }}>Today Revenue</div>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '20px' }}>$0.00</div>
                    </div>
                    <div style={{ backgroundColor: '#e8f5e9', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ color: '#999', fontSize: '11px', marginBottom: '4px' }}>BSC Profit 43%</div>
                      <div style={{ color: '#2e7d32', fontWeight: 900, fontSize: '20px' }}>$0.00</div>
                    </div>
                  </div>
                  <Link href="/pos-andros" style={{ display: 'block', marginTop: '14px', backgroundColor: '#7c3aed', color: '#fff', textDecoration: 'none', borderRadius: '10px', padding: '10px', textAlign: 'center', fontWeight: 800, fontSize: '13px' }}>
                    Open Andros POS →
                  </Link>
                </div>
              </div>

              {/* Quick Actions */}
              <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '16px', marginBottom: '14px' }}>Quick Actions</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '28px' }}>
                {[
                  { icon: '📦', label: 'Orders', href: '/orders', color: '#e8f4fd' },
                  { icon: '🚢', label: 'Suppliers', href: '/supplier', color: '#f0fde8', badge: pendingSuppliers },
                  { icon: '🧾', label: 'Purchase Orders', href: '/purchase-orders', color: '#fef9e7' },
                  { icon: '🚗', label: 'Vehicles & Parts', href: '/vehicles', color: '#fff3e8' },
                  { icon: '⚡', label: 'Pay Bills', href: '/utilities', color: '#e8f8fd' },
                  { icon: '📊', label: 'Reports', href: '/report', color: '#fde8f0' },
                ].map((action) => (
                  <Link key={action.label} href={action.href} style={{ backgroundColor: '#fff', border: '1px solid #ebebeb', borderRadius: '14px', padding: '16px 12px', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', position: 'relative' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: action.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                      {action.icon}
                    </div>
                    <span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '12px', lineHeight: 1.3 }}>{action.label}</span>
                    {action.badge && action.badge > 0 && (
                      <span style={{ position: 'absolute', top: '10px', right: '10px', backgroundColor: '#ef4444', color: '#fff', fontSize: '10px', fontWeight: 900, padding: '2px 6px', borderRadius: '20px' }}>{action.badge}</span>
                    )}
                  </Link>
                ))}
              </div>

              {/* Spiny Tails Inventory */}
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '16px', margin: 0 }}>🧊 Spiny Tails Freezer</h2>
                  <Link href="/inventory" style={{ color: '#1a2e5a', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>View All →</Link>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div style={{ backgroundColor: '#e8f4fd', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '22px' }}>{spinyTailsStock.toLocaleString()}</div>
                    <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>lbs In Stock</div>
                  </div>
                  <div style={{ backgroundColor: '#e8f5e9', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ color: '#2e7d32', fontWeight: 900, fontSize: '22px' }}>30,000</div>
                    <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>lbs Capacity</div>
                  </div>
                  <div style={{ backgroundColor: '#fef9e7', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '22px' }}>31%</div>
                    <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>Capacity Used</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── REVENUE TAB ── */}
          {activeTab === 'revenue' && (
            <div>
              <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px', marginBottom: '20px' }}>All 9 Revenue Streams</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                {REVENUE_STREAMS.map((stream) => (
                  <div key={stream.label} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: stream.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
                      {stream.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#666', fontSize: '12px', marginBottom: '4px' }}>{stream.label}</div>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px' }}>{stream.value}</div>
                    </div>
                    <div style={{ backgroundColor: '#e8f5e9', borderRadius: '8px', padding: '4px 10px' }}>
                      <span style={{ color: '#2e7d32', fontWeight: 800, fontSize: '12px' }}>{stream.profit}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ backgroundColor: '#1a2e5a', borderRadius: '16px', padding: '20px', marginTop: '20px' }}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '8px' }}>Monthly Fixed Expenses</div>
                <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '28px' }}>$20,590</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', marginTop: '4px' }}>Nassau rent · Andros · Staff · Utilities</div>
              </div>
            </div>
          )}

          {/* ── INVENTORY TAB ── */}
          {activeTab === 'inventory' && (
            <div>
              <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px', marginBottom: '20px' }}>🧊 Freezer Inventory</h2>
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
                <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '15px', marginBottom: '16px' }}>Spiny Tails Cold Storage — Mastic Point</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  {[
                    { label: 'Current Stock', value: `${spinyTailsStock.toLocaleString()} lbs`, color: '#e8f4fd', text: '#1a2e5a' },
                    { label: 'Total Capacity', value: '30,000 lbs', color: '#f0fde8', text: '#2e7d32' },
                    { label: 'Available Space', value: `${(30000 - spinyTailsStock).toLocaleString()} lbs`, color: '#fef9e7', text: '#d97706' },
                    { label: 'Last Updated', value: 'Apr 2026', color: '#fde8e8', text: '#dc2626' },
                  ].map((stat) => (
                    <div key={stat.label} style={{ backgroundColor: stat.color, borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                      <div style={{ color: '#666', fontSize: '11px', marginBottom: '6px' }}>{stat.label}</div>
                      <div style={{ color: stat.text, fontWeight: 900, fontSize: '16px' }}>{stat.value}</div>
                    </div>
                  ))}
                </div>
                {/* Capacity bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: '#666', fontSize: '12px' }}>Storage Used</span>
                    <span style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '12px' }}>31%</span>
                  </div>
                  <div style={{ height: '10px', backgroundColor: '#f0f0f0', borderRadius: '20px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '31%', backgroundColor: '#1a2e5a', borderRadius: '20px' }} />
                  </div>
                </div>
              </div>
              <Link href="/purchase-orders" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#1a2e5a', color: '#f4c842', textDecoration: 'none', borderRadius: '12px', padding: '12px 20px', fontWeight: 800, fontSize: '14px' }}>
                + New Purchase Order
              </Link>
            </div>
          )}

          {/* ── AI ASSISTANT TAB ── */}
          {activeTab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', maxHeight: '700px' }}>
              <div style={{ backgroundColor: '#1a2e5a', borderRadius: '16px 16px 0 0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f4c842', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🤖</div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: '15px' }}>BSC AI Assistant</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>Knows your entire business</div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, backgroundColor: '#fff', overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {aiMessages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '80%', padding: '12px 16px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      backgroundColor: msg.role === 'user' ? '#1a2e5a' : '#f8f9fa',
                      color: msg.role === 'user' ? '#fff' : '#1a2e5a',
                      fontSize: '14px', lineHeight: 1.5,
                    }}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ backgroundColor: '#f8f9fa', borderRadius: '16px 16px 16px 4px', padding: '12px 16px', color: '#999', fontSize: '14px' }}>
                      Thinking...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick prompts */}
              <div style={{ backgroundColor: '#f8f9fa', padding: '10px 16px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
                {['Nassau profit today', 'Andros margin 43%', 'Spiny Tails stock', 'Monthly expenses', 'Bill pay fee formula'].map((prompt) => (
                  <button key={prompt} onClick={() => setAiInput(prompt)} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '6px 12px', fontSize: '12px', color: '#1a2e5a', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div style={{ backgroundColor: '#fff', borderRadius: '0 0 16px 16px', padding: '14px 16px', borderTop: '1px solid #ebebeb', display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendAiMessage()}
                  placeholder="Ask about your business..."
                  style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none' }}
                />
                <button
                  onClick={sendAiMessage}
                  disabled={aiLoading || !aiInput.trim()}
                  style={{ backgroundColor: aiLoading || !aiInput.trim() ? '#94a3b8' : '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: '10px', padding: '10px 18px', fontWeight: 800, fontSize: '14px', cursor: aiLoading ? 'not-allowed' : 'pointer' }}
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </main>

        {/* BOTTOM NAV (mobile) */}
        <nav style={{ backgroundColor: '#fff', borderTop: '1px solid #ebebeb', display: 'flex', position: 'sticky', bottom: 0, zIndex: 30 }}>
          {[
            { icon: '🏠', label: 'Overview', tab: 'overview' },
            { icon: '🟡', label: 'Nassau', href: '/pos' },
            { icon: '📦', label: 'Orders', href: '/orders' },
            { icon: '💰', label: 'Revenue', tab: 'revenue' },
            { icon: '🤖', label: 'AI', tab: 'ai' },
          ].map((item) => (
            item.href ? (
              <Link key={item.label} href={item.href} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px', textDecoration: 'none', gap: '3px' }}>
                <span style={{ fontSize: '20px' }}>{item.icon}</span>
                <span style={{ color: '#999', fontSize: '10px', fontWeight: 600 }}>{item.label}</span>
              </Link>
            ) : (
              <button key={item.label} onClick={() => setActiveTab(item.tab!)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px', background: 'none', border: 'none', cursor: 'pointer', gap: '3px', borderTop: activeTab === item.tab ? '2px solid #f4c842' : '2px solid transparent' }}>
                <span style={{ fontSize: '20px' }}>{item.icon}</span>
                <span style={{ color: activeTab === item.tab ? '#1a2e5a' : '#999', fontSize: '10px', fontWeight: activeTab === item.tab ? 800 : 600 }}>{item.label}</span>
              </button>
            )
          ))}
        </nav>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .sidebar { transform: translateX(0) !important; }
          main { margin-left: 240px; }
        }
      `}</style>
    </div>
  );
}