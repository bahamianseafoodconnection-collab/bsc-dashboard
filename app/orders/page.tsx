'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

// Skip prerendering. Orders page is per-user, runtime-only.
export const dynamic = 'force-dynamic';

// Lazy-init Supabase. Calling createBrowserClient at module scope
// crashes the build at static prerender (env vars unavailable).
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createBrowserClient(url, key);
}

const STATUS_FLOW = ['Pending', 'Confirmed', 'Packing', 'Out for Delivery', 'Delivered'];
const PICKUP_FLOW = ['Pending', 'Confirmed', 'Ready for Pickup', 'Delivered'];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  'Pending':           { bg: '#fef9e7', text: '#d97706' },
  'Confirmed':         { bg: '#e8f4fd', text: '#1a6fb5' },
  'Packing':           { bg: '#f5f0ff', text: '#7c3aed' },
  'Out for Delivery':  { bg: '#fff3e8', text: '#ea6c00' },
  'Ready for Pickup':  { bg: '#e8f8fd', text: '#0891b2' },
  'Delivered':         { bg: '#e8f5e9', text: '#2e7d32' },
  'Cancelled':         { bg: '#fde8e8', text: '#dc2626' },
};

type Order = {
  id: string;
  customer_name: string;
  customer_phone: string;
  items: { name: string; qty: number; price: number; emoji: string }[];
  total: number;
  status: string;
  type: 'delivery' | 'pickup';
  address?: string;
  created_at: string;
  delivery_photo?: string;
};

const MOCK_ORDERS: Order[] = [
  { id: 'ORD-001', customer_name: 'Maria Johnson', customer_phone: '2421234567', items: [{ name: 'Fresh Grouper', qty: 2, price: 14.99, emoji: '' }, { name: 'Conch Meat', qty: 1, price: 12.50, emoji: '' }], total: 42.48, status: 'Pending', type: 'delivery', address: '12 Bay St, Nassau', created_at: new Date().toISOString() },
  { id: 'ORD-002', customer_name: 'David Smith', customer_phone: '2429876543', items: [{ name: 'Ribeye Steak', qty: 3, price: 22.99, emoji: '' }], total: 68.97, status: 'Confirmed', type: 'pickup', created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 'ORD-003', customer_name: 'Kezia Williams', customer_phone: '2425554321', items: [{ name: 'Spiny Lobster Tails', qty: 2, price: 28.00, emoji: '' }, { name: 'Raw Shrimp', qty: 1, price: 16.00, emoji: '' }], total: 72.00, status: 'Packing', type: 'delivery', address: '45 Village Rd, Nassau', created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 'ORD-004', customer_name: 'Tom Brown', customer_phone: '2421112233', items: [{ name: 'Whole Chicken', qty: 2, price: 8.99, emoji: '' }], total: 17.98, status: 'Delivered', type: 'pickup', created_at: new Date(Date.now() - 86400000).toISOString() },
];

export default function OrdersPage() {
  const [orders, setOrders]           = useState<Order[]>(MOCK_ORDERS);
  const [selected, setSelected]       = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterType, setFilterType]   = useState('All');
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    async function fetchOrders() {
      try {
        const supabase = getSupabase();
        const { data } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });
        if (data && data.length > 0) setOrders(data);
      } catch {
        // Keep mock data on failure (preserves dev UX)
      }
    }
    fetchOrders();
  }, []);

  const filtered = orders.filter((o) => {
    const matchStatus = filterStatus === 'All' || o.status === filterStatus;
    const matchType   = filterType   === 'All' || o.type   === filterType;
    return matchStatus && matchType;
  });

  async function advanceStatus(order: Order) {
    const flow = order.type === 'pickup' ? PICKUP_FLOW : STATUS_FLOW;
    const idx  = flow.indexOf(order.status);
    if (idx === -1 || idx === flow.length - 1) return;
    const next = flow[idx + 1];
    setLoading(true);
    try {
      const supabase = getSupabase();
      await supabase.from('orders').update({ status: next }).eq('id', order.id);
    } catch {}
    setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: next } : o));
    if (selected?.id === order.id) setSelected({ ...order, status: next });
    setLoading(false);
  }

  async function cancelOrder(order: Order) {
    try {
      const supabase = getSupabase();
      await supabase.from('orders').update({ status: 'Cancelled' }).eq('id', order.id);
    } catch {}
    setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: 'Cancelled' } : o));
    if (selected?.id === order.id) setSelected({ ...order, status: 'Cancelled' });
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const statusBadge = (status: string) => {
    const c = STATUS_COLORS[status] || { bg: '#f0f0f0', text: '#666' };
    return (
      <span style={{ backgroundColor: c.bg, color: c.text, fontSize: '11px', fontWeight: 800, padding: '3px 10px', borderRadius: '20px' }}>
        {status}
      </span>
    );
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>

      <header style={{ backgroundColor: '#1a2e5a', padding: '0 16px', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/dashboard" style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, textDecoration: 'none', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px' }}>
              &larr; BSC Control
            </Link>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>Order Management</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>{orders.length} total orders</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ backgroundColor: STATUS_COLORS['Pending'].bg, color: STATUS_COLORS['Pending'].text, fontSize: '12px', fontWeight: 800, padding: '4px 12px', borderRadius: '20px' }}>
              {orders.filter((o) => o.status === 'Pending').length} Pending
            </span>
          </div>
        </div>
      </header>

      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #ebebeb', padding: '12px 16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {['All', 'Pending', 'Confirmed', 'Packing', 'Out for Delivery', 'Ready for Pickup', 'Delivered', 'Cancelled'].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '6px 14px', borderRadius: '20px', border: 'none', backgroundColor: filterStatus === s ? '#1a2e5a' : '#f0f0f0', color: filterStatus === s ? '#fff' : '#555', fontSize: '12px', fontWeight: filterStatus === s ? 800 : 500, cursor: 'pointer' }}>
            {s}
          </button>
        ))}
        <div style={{ width: '1px', backgroundColor: '#e5e7eb', margin: '0 4px' }} />
        {['All', 'delivery', 'pickup'].map((t) => (
          <button key={t} onClick={() => setFilterType(t)} style={{ padding: '6px 14px', borderRadius: '20px', border: 'none', backgroundColor: filterType === t ? '#1a2e5a' : '#f0f0f0', color: filterType === t ? '#f4c842' : '#555', fontSize: '12px', fontWeight: filterType === t ? 800 : 500, cursor: 'pointer', textTransform: 'capitalize' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ color: '#999', fontSize: '14px' }}>No orders match this filter</div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map((order) => (
              <div
                key={order.id}
                onClick={() => setSelected(order)}
                style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: selected?.id === order.id ? '2px solid #1a2e5a' : '2px solid transparent', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '15px' }}>{order.customer_name}</div>
                    <div style={{ color: '#999', fontSize: '11px' }}>{order.id} - {timeAgo(order.created_at)}</div>
                  </div>
                  {statusBadge(order.status)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ color: '#666', fontSize: '12px' }}>
                    {order.type === 'delivery' ? 'Delivery' : 'Pickup'} - {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '16px' }}>${order.total.toFixed(2)}</div>
                </div>
                {order.status !== 'Delivered' && order.status !== 'Cancelled' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); advanceStatus(order); }}
                    disabled={loading}
                    style={{ marginTop: '10px', width: '100%', backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: '10px', padding: '9px', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
                  >
                    {loading ? 'Updating...' : `Move to: ${(order.type === 'pickup' ? PICKUP_FLOW : STATUS_FLOW)[Math.min((order.type === 'pickup' ? PICKUP_FLOW : STATUS_FLOW).indexOf(order.status) + 1, (order.type === 'pickup' ? PICKUP_FLOW : STATUS_FLOW).length - 1)]}`}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {selected && (
          <div style={{ width: '340px', backgroundColor: '#fff', borderLeft: '1px solid #ebebeb', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
            <div style={{ backgroundColor: '#1a2e5a', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '15px' }}>{selected.id}</div>
              <button onClick={() => setSelected(null)} aria-label="Close" style={{ background: 'none', border: 'none', color: '#fff', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>x</button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ color: '#999', fontSize: '11px', marginBottom: '4px' }}>Customer</div>
                <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '16px' }}>{selected.customer_name}</div>
                <div style={{ color: '#666', fontSize: '13px' }}>{selected.type === 'delivery' ? 'Delivery' : 'Pickup'}</div>
                {selected.address && <div style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>{selected.address}</div>}
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ color: '#999', fontSize: '11px', marginBottom: '8px' }}>Status</div>
                <div style={{ marginBottom: '10px' }}>{statusBadge(selected.status)}</div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(selected.type === 'pickup' ? PICKUP_FLOW : STATUS_FLOW).map((step) => {
                    const flow = selected.type === 'pickup' ? PICKUP_FLOW : STATUS_FLOW;
                    const current = flow.indexOf(selected.status);
                    const stepIdx = flow.indexOf(step);
                    return (
                      <div key={step} style={{ flex: 1, height: '4px', borderRadius: '4px', backgroundColor: stepIdx <= current ? '#1a2e5a' : '#e5e7eb' }} />
                    );
                  })}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ color: '#999', fontSize: '11px', marginBottom: '8px' }}>Items</div>
                {selected.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <span style={{ color: '#444', fontSize: '13px' }}>{item.name} x {item.qty}</span>
                    <span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '13px' }}>${(item.price * item.qty).toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', padding: '10px', backgroundColor: '#fef9e7', borderRadius: '8px' }}>
                  <span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '14px' }}>Total</span>
                  <span style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '16px' }}>${selected.total.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selected.status !== 'Delivered' && selected.status !== 'Cancelled' && (
                  <button
                    onClick={() => advanceStatus(selected)}
                    disabled={loading}
                    style={{ width: '100%', backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: '12px', padding: '12px', fontWeight: 900, fontSize: '14px', cursor: 'pointer' }}
                  >
                    Advance Status
                  </button>
                )}

                <a
                  href={`https://wa.me/${selected.customer_phone}?text=Hi ${selected.customer_name}! Your BSC order ${selected.id} is now: ${selected.status}. Total: $${selected.total.toFixed(2)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'block', backgroundColor: '#25D366', color: '#fff', textDecoration: 'none', borderRadius: '12px', padding: '12px', textAlign: 'center', fontWeight: 800, fontSize: '14px' }}
                >
                  WhatsApp Customer
                </a>

                {selected.status !== 'Cancelled' && selected.status !== 'Delivered' && (
                  <button
                    onClick={() => cancelOrder(selected)}
                    style={{ width: '100%', backgroundColor: '#fde8e8', color: '#dc2626', border: 'none', borderRadius: '12px', padding: '12px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
                  >
                    Cancel Order
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
