'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { parseOrderItems } from '@/lib/order-items';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const WHOLESALERS = [
  { key: 'asa-h-pritchard',           name: 'Asa H Pritchard',           color: '#1B4F72', logo: '🏪' },
  { key: 'bahamas-international-food', name: 'Bahamas International Food', color: '#1E5C2E', logo: '🍱' },
  { key: 'dalbenas',                  name: "D'Albenas",                  color: '#784212', logo: '🏭' },
  { key: 'bahamas-wholesale-agencies', name: 'Bahamas Wholesale Agencies', color: '#1A5276', logo: '📦' },
  { key: 'tpg',                       name: 'TPG',                        color: '#2C3E50', logo: '🛒' },
  { key: 'thompson-trading',          name: 'Thompson Trading',           color: '#922B21', logo: '🤝' },
  { key: 'island-wholesale',          name: 'Island Wholesale',           color: '#196F3D', logo: '🌴' },
];

type WholesaleOrder = {
  id: string;
  created_at: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  total: number;
  wholesale_cost_total: number;
  wholesaler: string;
  wholesale_items: unknown;
  payment_method: string;
  payment_status: string;
  status: string;
  admin_purchased: boolean;
  admin_purchased_at?: string;
  admin_notes?: string;
};

function fmtBSD(n: number) {
  return `BSD $${Number(n || 0).toFixed(2)}`;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statusColor(status: string) {
  if (status === 'paid' || status === 'approved') return { bg: '#e8f5e9', text: '#2e7d32' };
  if (status === 'payment_pending' || status === 'pending') return { bg: '#fef9e7', text: '#d97706' };
  return { bg: '#fde8e8', text: '#dc2626' };
}

export default function WholesaleOrdersPage() {
  const [orders, setOrders]                     = useState<WholesaleOrder[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [activeFilter, setActiveFilter]         = useState<'all' | 'pending' | 'purchased'>('pending');
  const [activeWholesaler, setActiveWholesaler] = useState('all');
  const [selectedOrder, setSelectedOrder]       = useState<WholesaleOrder | null>(null);
  const [notes, setNotes]                       = useState('');
  const [saving, setSaving]                     = useState(false);
  const [success, setSuccess]                   = useState('');

  useEffect(() => { loadOrders(); }, [activeFilter, activeWholesaler]);

  async function loadOrders() {
    setLoading(true);
    let query = supabase
      .from('orders')
      .select('*')
      .eq('order_type', 'wholesale')
      .order('created_at', { ascending: false })
      .limit(100);

    if (activeWholesaler !== 'all') query = query.eq('wholesaler', activeWholesaler);
    if (activeFilter === 'pending')   query = query.eq('admin_purchased', false);
    else if (activeFilter === 'purchased') query = query.eq('admin_purchased', true);

    const { data } = await query;
    setOrders(data || []);
    setLoading(false);
  }

  async function adminUpdate(orderId: string, body: Record<string, unknown>): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/orders/admin-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ order_id: orderId, ...body }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.ok === false) { alert(`Update failed: ${j.error ?? `HTTP ${res.status}`}`); return false; }
    return true;
  }

  async function markPurchased(orderId: string) {
    setSaving(true);
    // Server-authoritative (role-gated + audited); server stamps purchased_at + updated_at.
    const ok = await adminUpdate(orderId, { status: 'processing', admin_notes: notes, admin_purchased: true });
    setSaving(false);
    if (!ok) return;
    setSelectedOrder(null);
    setNotes('');
    setSuccess('Order marked as purchased.');
    await loadOrders();
    setTimeout(() => setSuccess(''), 3000);
  }

  async function updateNotes(orderId: string) {
    const ok = await adminUpdate(orderId, { admin_notes: notes });
    if (!ok) return;
    setSuccess('Notes saved.');
    setTimeout(() => setSuccess(''), 2000);
  }

  const pendingCount = orders.filter(o => !o.admin_purchased).length;
  const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  const totalCost    = orders.reduce((s, o) => s + (o.wholesale_cost_total || 0), 0);
  const totalProfit  = totalRevenue - totalCost;

  const getWholesaler = (key: string) =>
    WHOLESALERS.find(w => w.key === key) || { name: key || 'Unknown Wholesaler', color: '#1a2e5a', logo: '🏪' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, sans-serif' }}>

      {/* ── HEADER ── */}
      <div style={{ backgroundColor: '#1a2e5a', padding: '0 20px', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/dashboard" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              ← Dashboard
            </Link>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: 16 }}>🇧🇸 Wholesale Orders</div>
            {pendingCount > 0 && (
              <span style={{ backgroundColor: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 900, padding: '3px 8px', borderRadius: 20 }}>
                {pendingCount} pending
              </span>
            )}
          </div>
          <button
            onClick={loadOrders}
            style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* ── SUCCESS TOAST ── */}
      {success && (
        <div style={{ backgroundColor: '#e8f5e9', borderLeft: '4px solid #2e7d32', padding: '12px 20px', margin: '16px 20px 0', borderRadius: 8, color: '#2e7d32', fontWeight: 700 }}>
          ✅ {success}
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>

        {/* ── STATS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total Orders',   value: orders.length, color: '#e8f4fd', text: '#1a2e5a', fmt: false },
            { label: 'Pending Pickup', value: pendingCount,  color: '#fde8e8', text: '#dc2626', fmt: false },
            { label: 'Customer Paid',  value: totalRevenue,  color: '#e8f5e9', text: '#2e7d32', fmt: true  },
            { label: 'BSC Profit',     value: totalProfit,   color: '#fef9e7', text: '#d97706', fmt: true  },
          ].map((s) => (
            <div key={s.label} style={{ backgroundColor: s.color, borderRadius: 12, padding: '14px', textAlign: 'center' }}>
              <div style={{ color: '#666', fontSize: 10, marginBottom: 4 }}>{s.label}</div>
              <div style={{ color: s.text, fontWeight: 900, fontSize: 20 }}>
                {s.fmt ? fmtBSD(s.value as number) : s.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── FILTERS ── */}
        <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '16px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Status filter */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { key: 'all',       label: 'All Orders' },
              { key: 'pending',   label: '⏳ Needs Pickup' },
              { key: 'purchased', label: '✅ Purchased' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key as typeof activeFilter)}
                style={{ backgroundColor: activeFilter === f.key ? '#1a2e5a' : '#f0f4ff', color: activeFilter === f.key ? '#f4c842' : '#1a2e5a', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Wholesaler filter */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveWholesaler('all')}
              style={{ backgroundColor: activeWholesaler === 'all' ? '#1a2e5a' : '#fff', color: activeWholesaler === 'all' ? '#f4c842' : '#666', border: '1px solid #e5e7eb', borderRadius: 20, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              All Wholesalers
            </button>
            {WHOLESALERS.map((w) => (
              <button
                key={w.key}
                onClick={() => setActiveWholesaler(w.key)}
                style={{ backgroundColor: activeWholesaler === w.key ? w.color : '#fff', color: activeWholesaler === w.key ? '#fff' : '#666', border: '1px solid #e5e7eb', borderRadius: 20, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                {w.logo} {w.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── ORDERS LIST ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#999', fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
            Loading wholesale orders...
          </div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, backgroundColor: '#fff', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
            <h3 style={{ color: '#1a2e5a', fontWeight: 800, marginBottom: 8 }}>
              {activeFilter === 'pending' ? 'No pending orders — all caught up! ✅' : 'No wholesale orders found'}
            </h3>
            <p style={{ color: '#999', fontSize: 14, margin: 0 }}>
              When customers place wholesale orders, they will appear here with full purchase instructions.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {orders.map((order) => {
              const wInfo     = getWholesaler(order.wholesaler);
              const sc        = statusColor(order.payment_status || order.status);
              const bscProfit = (order.total || 0) - (order.wholesale_cost_total || 0);
              const items     = parseOrderItems(order.wholesale_items);
              const isSelected = selectedOrder?.id === order.id;

              return (
                <div
                  key={order.id}
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 16,
                    overflow: 'hidden',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                    border: order.admin_purchased ? '1px solid #e5e7eb' : `2px solid ${wInfo.color}`,
                  }}
                >
                  {/* ── ORDER HEADER ── */}
                  <div style={{ backgroundColor: order.admin_purchased ? '#f8f9fa' : wInfo.color, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 32 }}>{wInfo.logo}</span>
                      <div>
                        <div style={{ color: order.admin_purchased ? '#1a2e5a' : '#fff', fontWeight: 900, fontSize: 16 }}>
                          {wInfo.name}
                        </div>
                        <div style={{ color: order.admin_purchased ? '#666' : 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                          Order #{order.id.slice(0, 8).toUpperCase()} · {timeAgo(order.created_at)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ backgroundColor: sc.bg, color: sc.text, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>
                        {order.payment_status || order.status || 'pending'}
                      </span>
                      {order.admin_purchased ? (
                        <span style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>
                          ✅ Purchased {order.admin_purchased_at ? timeAgo(order.admin_purchased_at) : ''}
                        </span>
                      ) : (
                        <span style={{ backgroundColor: '#fde8e8', color: '#dc2626', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20 }}>
                          ⏳ Needs Pickup
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: '18px' }}>

                    {/* ── CUSTOMER INFO ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                      {[
                        { label: 'Customer',         value: order.customer_name    || 'Unknown' },
                        { label: 'Phone',            value: order.customer_phone   || '—' },
                        { label: 'Delivery Address', value: order.customer_address || '—' },
                        { label: 'Payment Method',   value: order.payment_method   || 'COD' },
                      ].map((f) => (
                        <div key={f.label} style={{ backgroundColor: '#f8f9fa', borderRadius: 10, padding: '10px 14px' }}>
                          <div style={{ color: '#999', fontSize: 10, marginBottom: 2 }}>{f.label}</div>
                          <div style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>{f.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* ── WHAT TO BUY ── */}
                    <div style={{ backgroundColor: wInfo.color, borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                      <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                        📋 What to Buy from {wInfo.name}
                      </div>
                      {items.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {items.map((item, i) => (
                            <div
                              key={i}
                              style={{ backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                              <div>
                                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{item.name}</div>
                                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
                                  Qty: {item.qty} {item.unit}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ color: '#f4c842', fontWeight: 900, fontSize: 15 }}>
                                  {fmtBSD((item.unit_price ?? 0) / 1.232)}
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>wholesale cost</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                          No item breakdown recorded. Check admin notes below.
                        </div>
                      )}
                    </div>

                    {/* ── FINANCIAL SPLIT ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10, marginBottom: 16 }}>
                      <div style={{ backgroundColor: '#fde8e8', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                        <div style={{ color: '#666', fontSize: 10, marginBottom: 4 }}>💸 Pay Wholesaler</div>
                        <div style={{ color: '#dc2626', fontWeight: 900, fontSize: 18 }}>{fmtBSD(order.wholesale_cost_total)}</div>
                        <div style={{ color: '#999', fontSize: 10, marginTop: 2 }}>your out-of-pocket cost</div>
                      </div>
                      <div style={{ backgroundColor: '#e8f5e9', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                        <div style={{ color: '#666', fontSize: 10, marginBottom: 4 }}>💰 BSC Keeps</div>
                        <div style={{ color: '#2e7d32', fontWeight: 900, fontSize: 18 }}>{fmtBSD(bscProfit)}</div>
                        <div style={{ color: '#999', fontSize: 10, marginTop: 2 }}>12% markup</div>
                      </div>
                      <div style={{ backgroundColor: '#1a2e5a', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginBottom: 4 }}>🧾 Customer Paid</div>
                        <div style={{ color: '#f4c842', fontWeight: 900, fontSize: 18 }}>{fmtBSD(order.total)}</div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 }}>total received</div>
                      </div>
                    </div>

                    {/* ── ADMIN NOTES ── */}
                    {isSelected ? (
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>
                          📝 Admin Notes
                        </label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="e.g. Picked up 3 cases. Short on lobster — 2 lbs missing. Will top up next run."
                          rows={3}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                        />
                      </div>
                    ) : order.admin_notes ? (
                      <div style={{ backgroundColor: '#fef9e7', borderRadius: 8, padding: '10px 14px', marginBottom: 14, borderLeft: '4px solid #f4c842' }}>
                        <div style={{ color: '#666', fontSize: 10, marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Admin Notes</div>
                        <div style={{ color: '#1a2e5a', fontSize: 13, lineHeight: 1.5 }}>{order.admin_notes}</div>
                      </div>
                    ) : null}

                    {/* ── ACTION BUTTONS ── */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>

                      {/* Not purchased yet */}
                      {!order.admin_purchased && (
                        isSelected ? (
                          <>
                            <button
                              onClick={() => markPurchased(order.id)}
                              disabled={saving}
                              style={{ flex: 1, backgroundColor: saving ? '#94a3b8' : '#2e7d32', color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontWeight: 800, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer' }}
                            >
                              {saving ? 'Saving...' : `✅ Confirm Purchased from ${wInfo.name}`}
                            </button>
                            <button
                              onClick={() => { setSelectedOrder(null); setNotes(''); }}
                              style={{ backgroundColor: '#f0f4ff', color: '#1a2e5a', border: 'none', borderRadius: 10, padding: '13px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => { setSelectedOrder(order); setNotes(order.admin_notes || ''); }}
                            style={{ flex: 1, backgroundColor: wInfo.color, color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
                          >
                            🛒 Mark as Purchased from {wInfo.name}
                          </button>
                        )
                      )}

                      {/* WhatsApp customer */}
                      {order.customer_phone && (
                        <a
                          href={`https://wa.me/${order.customer_phone.replace(/\D/g, '')}?text=Hi ${order.customer_name || 'there'}! Your wholesale order from ${wInfo.name} has been ${order.admin_purchased ? 'picked up and is being prepared for delivery' : 'received and is being processed'}. We will contact you shortly. — BSC Marketplace 🇧🇸`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ backgroundColor: '#25D366', color: '#fff', borderRadius: 10, padding: '13px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          💬 WhatsApp
                        </a>
                      )}

                      {/* Edit notes on purchased orders */}
                      {order.admin_purchased && !isSelected && (
                        <button
                          onClick={() => { setSelectedOrder(order); setNotes(order.admin_notes || ''); }}
                          style={{ backgroundColor: '#f0f4ff', color: '#1a2e5a', border: '1px solid #e5e7eb', borderRadius: 10, padding: '11px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                        >
                          ✏️ Edit Notes
                        </button>
                      )}

                      {/* Save notes on purchased orders */}
                      {isSelected && order.admin_purchased && (
                        <button
                          onClick={() => updateNotes(order.id)}
                          style={{ flex: 1, backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 10, padding: '13px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
                        >
                          💾 Save Notes
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
