// File: app/orders/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  'https://auqjjrisivhfmpleusyt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg'
);

type Order = {
  id: string; order_number: string; customer_id: string;
  customer_name: string; customer_phone: string; status: string;
  payment_status: string; payment_method: string; subtotal: number;
  tax: number; delivery_fee: number; total: number; delivery_type: string;
  delivery_address: string; delivery_notes: string; can_fulfill: boolean;
  items: any[]; created_at: string; updated_at: string;
};

const STATUSES = [
  { key: 'all',              label: 'All Orders',       color: '#6b7280' },
  { key: 'pending',          label: 'Pending',          color: '#f5c518' },
  { key: 'confirmed',        label: 'Confirmed',        color: '#60a5fa' },
  { key: 'packing',          label: 'Packing',          color: '#a78bfa' },
  { key: 'out_for_delivery', label: 'Out for Delivery', color: '#4ade80' },
  { key: 'delivered',        label: 'Delivered',        color: '#4ade80' },
  { key: 'ready_pickup',     label: 'Ready Pickup',     color: '#4ade80' },
  { key: 'cancelled',        label: 'Cancelled',        color: '#f87171' },
];

const STATUS_FLOW: Record<string, { next: string; label: string; color: string }[]> = {
  pending:          [{ next: 'confirmed',        label: '✅ Confirm Order',       color: '#60a5fa' }, { next: 'cancelled', label: '❌ Cancel', color: '#f87171' }],
  confirmed:        [{ next: 'packing',          label: '📦 Start Packing',       color: '#a78bfa' }, { next: 'cancelled', label: '❌ Cancel', color: '#f87171' }],
  packing:          [{ next: 'out_for_delivery', label: '🚚 Out for Delivery',    color: '#4ade80' }, { next: 'ready_pickup', label: '🏪 Ready for Pickup', color: '#4ade80' }],
  out_for_delivery: [{ next: 'delivered',        label: '✅ Mark Delivered',      color: '#4ade80' }],
  ready_pickup:     [{ next: 'delivered',        label: '✅ Mark Collected',      color: '#4ade80' }],
};

const STATUS_INFO: Record<string, { label: string; color: string; icon: string; bg: string }> = {
  pending:          { label: 'Order Received',    color: '#f5c518', icon: '⏳', bg: '#1a1400' },
  confirmed:        { label: 'Payment Confirmed', color: '#60a5fa', icon: '✅', bg: '#001a2a' },
  packing:          { label: 'Packing',           color: '#a78bfa', icon: '📦', bg: '#1a0a2a' },
  out_for_delivery: { label: 'Out for Delivery',  color: '#4ade80', icon: '🚚', bg: '#0a1f0a' },
  delivered:        { label: 'Delivered',         color: '#4ade80', icon: '✅', bg: '#0a1f0a' },
  ready_pickup:     { label: 'Ready for Pickup',  color: '#4ade80', icon: '🏪', bg: '#0a1f0a' },
  cancelled:        { label: 'Cancelled',         color: '#f87171', icon: '❌', bg: '#2d0000' },
};

// ── COGS ENGINE ──
// When payment is marked PAID:
// 1. For each item in the order, find the supplier_product by product id/name
// 2. COGS = supplier cost price (case_cost / pieces_per_case) × qty sold
// 3. Insert into supplier_payouts ledger
// 4. Decrease supplier_products stock_qty
async function processCOGS(order: Order) {
  if (!order.items || order.items.length === 0) return;

  for (const item of order.items) {
    try {
      // Find matching supplier product by id or name
      let product: any = null;
      if (item.productId) {
        const { data } = await supabase
          .from('supplier_products')
          .select('*')
          .eq('id', item.productId)
          .single();
        product = data;
      }
      if (!product && item.productName) {
        const { data } = await supabase
          .from('supplier_products')
          .select('*')
          .ilike('name', item.productName)
          .eq('status', 'approved')
          .single();
        product = data;
      }

      if (!product) continue;

      const qty         = parseFloat(item.qty) || 1;
      const costPerUnit = parseFloat(product.unit_cost) || parseFloat(product.case_cost) || 0;
      const cogsTotal   = parseFloat((qty * costPerUnit).toFixed(2));

      // Insert COGS record into supplier_payouts ledger
      await supabase.from('supplier_payouts').insert({
        supplier_id:   product.supplier_id,
        supplier_name: product.supplier_name,
        order_id:      order.id,
        order_number:  order.order_number,
        product_id:    product.id,
        product_name:  product.name,
        qty_sold:      qty,
        cost_per_unit: costPerUnit,
        cogs_total:    cogsTotal,
        paid:          false,
      });

      // Decrease stock
      const currentStock = parseFloat(product.stock_qty) || 0;
      const newStock     = Math.max(0, currentStock - qty);
      await supabase
        .from('supplier_products')
        .update({ stock_qty: newStock })
        .eq('id', product.id);

    } catch (e) {
      console.error('COGS processing error for item:', item.productName, e);
    }
  }
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders]               = useState<Order[]>([]);
  const [loading, setLoading]             = useState(true);
  const [activeStatus, setActiveStatus]   = useState('all');
  const [search, setSearch]               = useState('');
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [updatingId, setUpdatingId]       = useState<string | null>(null);
  const [deliveryPhoto, setDeliveryPhoto] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isControlAdmin, setIsControlAdmin] = useState(false);
  const [cogsSuccess, setCogsSuccess]     = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      if (!user) return;
      supabase.from('profiles').select('role').eq('id', user.id).single().then(({ data }) => {
        if (data?.role === 'control_admin') setIsControlAdmin(true);
      });
    });
  }, []);

  async function loadOrders() {
    setLoading(true);
    try {
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (data) setOrders(data);
    } catch (e) {}
    setLoading(false);
  }

  async function updateStatus(orderId: string, newStatus: string) {
    setUpdatingId(orderId);
    try {
      await supabase.from('orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', orderId);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    } catch (e) {}
    setUpdatingId(null);
  }

  async function updatePaymentStatus(orderId: string, paymentStatus: string) {
    setUpdatingId(orderId);
    try {
      await supabase.from('orders').update({
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', orderId);

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, payment_status: paymentStatus } : o));

      // ── TRIGGER COGS ENGINE when payment is marked PAID ──
      if (paymentStatus === 'paid') {
        const order = orders.find(o => o.id === orderId);
        if (order) {
          // Check if COGS already recorded for this order
          const { data: existing } = await supabase
            .from('supplier_payouts')
            .select('id')
            .eq('order_id', orderId)
            .limit(1);

          if (!existing || existing.length === 0) {
            await processCOGS({ ...order, payment_status: 'paid' });
            setCogsSuccess('✅ Payment confirmed — COGS recorded & stock updated for ' + (order.order_number || orderId));
            setTimeout(() => setCogsSuccess(null), 5000);
          } else {
            setCogsSuccess('ℹ️ COGS already recorded for this order.');
            setTimeout(() => setCogsSuccess(null), 3000);
          }
        }
      }
    } catch (e) {}
    setUpdatingId(null);
  }

  async function uploadDeliveryPhoto(orderId: string) {
    if (!deliveryPhoto) return;
    setUploadingPhoto(true);
    try {
      const fileName = 'delivery-' + orderId + '-' + Date.now() + '.' + deliveryPhoto.name.split('.').pop();
      const { error: uploadErr } = await supabase.storage.from('product-images').upload(fileName, deliveryPhoto);
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
        await supabase.from('orders').update({
          status: 'delivered',
          delivery_notes: (orders.find(o => o.id === orderId)?.delivery_notes || '') + ' | PHOTO: ' + urlData.publicUrl,
          updated_at: new Date().toISOString(),
        }).eq('id', orderId);
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'delivered' } : o));
        setDeliveryPhoto(null);
      }
    } catch (e) {}
    setUploadingPhoto(false);
  }

  const filtered = orders.filter(o => {
    const matchStatus = activeStatus === 'all' || o.status === activeStatus;
    const matchSearch =
      o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_phone?.includes(search);
    return matchStatus && matchSearch;
  });

  const stats = {
    total:     orders.length,
    pending:   orders.filter(o => o.status === 'pending').length,
    active:    orders.filter(o => ['confirmed', 'packing', 'out_for_delivery', 'ready_pickup'].includes(o.status)).length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    revenue:   orders.filter(o => o.status !== 'cancelled' && o.payment_status === 'paid').reduce((s, o) => s + Number(o.total), 0),
  };

  const pg: React.CSSProperties = {
    padding: 16, backgroundColor: '#060d1f', minHeight: '100vh',
    color: '#fff', fontFamily: "'Inter', sans-serif", paddingBottom: 100,
    maxWidth: 800, margin: '0 auto',
  };
  const card: React.CSSProperties = {
    backgroundColor: '#0d1f3c', borderRadius: 16, padding: '14px 16px',
    border: '1px solid #1e3a5f', marginBottom: 12,
  };
  const inp: React.CSSProperties = {
    display: 'block', width: '100%', padding: '11px 13px', borderRadius: 10,
    backgroundColor: '#111c33', color: '#fff', border: '1px solid #1e2d4a',
    fontSize: 14, marginBottom: 10, boxSizing: 'border-box' as const, outline: 'none',
  };

  function actionBtnStyle(action: { color: string }, isUpdating: boolean): React.CSSProperties {
    return {
      flex: 1, padding: '10px', borderRadius: 10,
      border: '1px solid ' + action.color,
      cursor: isUpdating ? 'not-allowed' : 'pointer',
      backgroundColor: isUpdating ? '#555' : action.color === '#f87171' ? '#3b0000' : '#0a1f0a',
      color: isUpdating ? '#aaa' : action.color,
      fontWeight: 'bold' as const, fontSize: 13,
    };
  }

  return (
    <div style={pg}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          {isControlAdmin && (
            <button onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #1a1200, #2a1e00)', border: '1px solid #f5c518', borderRadius: 10, color: '#f5c518', fontWeight: 'bold', fontSize: 12, cursor: 'pointer', padding: '7px 14px', marginBottom: 10 }}>
              ← BSC Control
            </button>
          )}
          <h1 style={{ margin: 0, color: '#f5c518', fontSize: 20, fontWeight: 'bold' }}>📦 Order Management</h1>
          <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>BSC Marketplace · Mark paid → COGS auto-recorded → Stock updated</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/market" target="_blank" style={{ padding: '8px 14px', borderRadius: 10, backgroundColor: '#0d1f3c', color: '#60a5fa', border: '1px solid #1e3a5f', textDecoration: 'none', fontSize: 12, fontWeight: 'bold' }}>
            🏪 Market
          </Link>
          <button onClick={loadOrders} style={{ padding: '8px 14px', borderRadius: 10, backgroundColor: '#0d1f3c', color: '#6b7280', border: '1px solid #1e3a5f', fontSize: 12, cursor: 'pointer' }}>
            Refresh
          </button>
        </div>
      </div>

      {/* COGS SUCCESS BANNER */}
      {cogsSuccess && (
        <div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>{cogsSuccess}</p>
          <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 11 }}>Supplier payout ledger updated · Stock qty decreased · Dashboard profit recalculated</p>
        </div>
      )}

      {/* HOW IT WORKS BANNER */}
      <div style={{ backgroundColor: '#0a1220', border: '1px solid #1e3a5f', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
        <p style={{ margin: '0 0 6px', color: '#60a5fa', fontWeight: 'bold', fontSize: 12 }}>💡 COGS Business Engine</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { step: '1', label: 'Customer Pays', icon: '💳', color: '#f5c518' },
            { step: '2', label: 'Mark as PAID', icon: '✅', color: '#4ade80' },
            { step: '3', label: 'COGS Recorded', icon: '📊', color: '#60a5fa' },
            { step: '4', label: 'Stock Updated', icon: '📦', color: '#a78bfa' },
          ].map(s => (
            <div key={s.step} style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px', textAlign: 'center' as const }}>
              <p style={{ margin: 0, fontSize: 18 }}>{s.icon}</p>
              <p style={{ margin: '4px 0 0', color: s.color, fontSize: 10, fontWeight: 'bold' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'TOTAL',     value: String(stats.total),            color: '#fff'    },
          { label: 'PENDING',   value: String(stats.pending),          color: '#f5c518' },
          { label: 'ACTIVE',    value: String(stats.active),           color: '#60a5fa' },
          { label: 'DELIVERED', value: String(stats.delivered),        color: '#4ade80' },
          { label: 'PAID REV',  value: '$' + stats.revenue.toFixed(0), color: '#4ade80' },
        ].map(kpi => (
          <div key={kpi.label} style={{ backgroundColor: '#0d1f3c', borderRadius: 12, padding: '10px 8px', border: '1px solid #1e3a5f', textAlign: 'center' as const }}>
            <p style={{ margin: 0, color: '#4a5568', fontSize: 8, letterSpacing: 1 }}>{kpi.label}</p>
            <p style={{ margin: '4px 0 0', color: kpi.color, fontWeight: 'bold', fontSize: 15 }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* SEARCH */}
      <input placeholder="🔍 Search by customer name, phone, or order number..." value={search} onChange={(e) => setSearch(e.target.value)} style={inp} />

      {/* STATUS FILTER */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' as const, paddingBottom: 4 }}>
        {STATUSES.map(s => (
          <button key={s.key} onClick={() => setActiveStatus(s.key)} style={{
            padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap' as const, flexShrink: 0,
            backgroundColor: activeStatus === s.key ? s.color : '#0d1f3c',
            color: activeStatus === s.key ? '#000' : '#6b7280',
          }}>
            {s.label}
            {s.key !== 'all' && (
              <span style={{ marginLeft: 6, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '1px 6px' }}>
                {orders.filter(o => o.status === s.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40 }}><p style={{ color: '#4a5568' }}>Loading orders...</p></div>}

      {!loading && filtered.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 40, marginBottom: 10 }}>📭</p>
          <p style={{ color: '#4a5568', margin: 0 }}>No orders found</p>
        </div>
      )}

      {filtered.map(order => {
        const statusInfo  = STATUS_INFO[order.status] || STATUS_INFO['pending'];
        const isExpanded  = expandedId === order.id;
        const nextActions = STATUS_FLOW[order.status] || [];
        const isUpdating  = updatingId === order.id;
        const isPaid      = order.payment_status === 'paid';

        return (
          <div key={order.id} style={{ ...card, borderColor: order.status === 'pending' ? '#f5c51844' : isPaid ? '#4ade8033' : '#1e3a5f' }}>
            <div onClick={() => setExpandedId(isExpanded ? null : order.id)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13, fontFamily: 'monospace' }}>{order.order_number}</p>
                    <div style={{ backgroundColor: statusInfo.bg, border: '1px solid ' + statusInfo.color, borderRadius: 20, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 10 }}>{statusInfo.icon}</span>
                      <span style={{ color: statusInfo.color, fontWeight: 'bold', fontSize: 10 }}>{statusInfo.label}</span>
                    </div>
                    {isPaid && (
                      <div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 20, padding: '2px 8px' }}>
                        <span style={{ color: '#4ade80', fontWeight: 'bold', fontSize: 10 }}>💰 COGS RECORDED</span>
                      </div>
                    )}
                  </div>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>{order.customer_name}</p>
                  <p style={{ margin: '2px 0 0', color: '#60a5fa', fontSize: 12 }}>📱 {order.customer_phone}</p>
                  <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>
                    {new Date(order.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 18 }}>${Number(order.total).toFixed(2)}</p>
                  <p style={{ margin: '2px 0 0', color: isPaid ? '#4ade80' : '#f5c518', fontSize: 11, fontWeight: 'bold' }}>{order.payment_status?.toUpperCase()}</p>
                  <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 10 }}>{order.delivery_type === 'delivery' ? '🚚 Delivery' : '🏪 Pickup'}</p>
                  <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 11 }}>{isExpanded ? '▲ Less' : '▼ More'}</p>
                </div>
              </div>
              <div style={{ height: 4, backgroundColor: '#1e3a5f', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  backgroundColor: order.status === 'cancelled' ? '#f87171' : '#4ade80',
                  width: order.status === 'pending' ? '10%' : order.status === 'confirmed' ? '30%' : order.status === 'packing' ? '55%' : order.status === 'out_for_delivery' || order.status === 'ready_pickup' ? '80%' : order.status === 'delivered' ? '100%' : '0%',
                }} />
              </div>
            </div>

            {isExpanded && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1e3a5f' }}>

                {/* DELIVERY DETAILS */}
                <div style={{ backgroundColor: '#060d1f', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                  <p style={{ margin: '0 0 4px', color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>DELIVERY DETAILS</p>
                  <p style={{ margin: 0, color: '#fff', fontSize: 13 }}>{order.delivery_address || 'No address provided'}</p>
                  {order.delivery_notes && <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 12 }}>Note: {order.delivery_notes}</p>}
                </div>

                {/* ORDER ITEMS */}
                {Array.isArray(order.items) && order.items.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>ITEMS ({order.items.length})</p>
                    {order.items.map((item: any, i: number) => {
                      const costPerUnit = parseFloat(item.supplierCost || item.unit_cost || '0');
                      const qty         = parseFloat(item.qty) || 1;
                      const itemCOGS    = costPerUnit * qty;
                      const itemProfit  = (parseFloat(item.total) || 0) - itemCOGS;
                      return (
                        <div key={i} style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '10px 12px', marginBottom: 6, border: '1px solid #1e3a5f' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isPaid && costPerUnit > 0 ? 8 : 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {item.image && <img src={item.image} alt={item.productName} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />}
                              <div>
                                <p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{item.productName}</p>
                                <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>× {item.qty} @ ${Number(item.price).toFixed(2)}</p>
                                {item.supplierName && <p style={{ margin: 0, color: '#6b7280', fontSize: 10 }}>Supplier: {item.supplierName}</p>}
                              </div>
                            </div>
                            <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>${Number(item.total).toFixed(2)}</p>
                          </div>
                          {/* COGS breakdown per item — shown when paid */}
                          {isPaid && costPerUnit > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 6 }}>
                              <div style={{ backgroundColor: '#0a1220', borderRadius: 6, padding: '5px 8px' }}>
                                <p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>COGS</p>
                                <p style={{ margin: '2px 0 0', color: '#f87171', fontWeight: 'bold', fontSize: 12 }}>${itemCOGS.toFixed(2)}</p>
                              </div>
                              <div style={{ backgroundColor: '#0a1220', borderRadius: 6, padding: '5px 8px' }}>
                                <p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>BSC PROFIT</p>
                                <p style={{ margin: '2px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 12 }}>${itemProfit.toFixed(2)}</p>
                              </div>
                              <div style={{ backgroundColor: '#0a1220', borderRadius: 6, padding: '5px 8px' }}>
                                <p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>SUPPLIER OWED</p>
                                <p style={{ margin: '2px 0 0', color: '#60a5fa', fontWeight: 'bold', fontSize: 12 }}>${itemCOGS.toFixed(2)}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ORDER TOTALS */}
                <div style={{ backgroundColor: '#060d1f', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <p style={{ margin: 0, color: '#4a5568', fontSize: 12 }}>Subtotal</p>
                    <p style={{ margin: 0, fontSize: 12 }}>${Number(order.subtotal).toFixed(2)}</p>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <p style={{ margin: 0, color: '#4a5568', fontSize: 12 }}>Delivery Fee</p>
                    <p style={{ margin: 0, fontSize: 12 }}>${Number(order.delivery_fee).toFixed(2)}</p>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #1e3a5f' }}>
                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>Total</p>
                    <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 16 }}>${Number(order.total).toFixed(2)}</p>
                  </div>
                </div>

                {/* PAYMENT STATUS */}
                <div style={{ marginBottom: 12 }}>
                  <p style={{ margin: '0 0 6px', color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>
                    PAYMENT STATUS {!isPaid ? '— Mark PAID to record COGS & update stock' : '— COGS already recorded'}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['unpaid', 'paid', 'refunded'].map(ps => (
                      <button key={ps} onClick={() => updatePaymentStatus(order.id, ps)} disabled={isUpdating || (isPaid && ps === 'paid')} style={{
                        flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                        cursor: isUpdating || (isPaid && ps === 'paid') ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold', fontSize: 13,
                        backgroundColor: order.payment_status === ps
                          ? (ps === 'paid' ? '#4ade80' : ps === 'refunded' ? '#f87171' : '#f5c518')
                          : ps === 'paid' ? '#0a2a0a' : '#0d1f3c',
                        color: order.payment_status === ps ? '#000' : ps === 'paid' ? '#4ade80' : '#6b7280',
                        boxShadow: ps === 'paid' && !isPaid ? '0 0 12px rgba(74,222,128,0.3)' : 'none',
                      }}>
                        {ps === 'unpaid' ? '⏳ Unpaid' : ps === 'paid' ? '✅ Mark PAID' : '↩️ Refunded'}
                      </button>
                    ))}
                  </div>
                  {!isPaid && (
                    <p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 11 }}>
                      ⚡ Marking PAID will automatically record COGS to supplier ledger and reduce stock
                    </p>
                  )}
                </div>

                {/* ORDER STATUS FLOW */}
                {nextActions.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>UPDATE ORDER STATUS</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                      {nextActions.map(action => (
                        <button key={action.next} onClick={() => updateStatus(order.id, action.next)} disabled={isUpdating} style={actionBtnStyle(action, isUpdating)}>
                          {isUpdating ? '...' : action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* DELIVERY PHOTO */}
                {(order.status === 'out_for_delivery' || order.status === 'ready_pickup') && (
                  <div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
                    <p style={{ margin: '0 0 8px', color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>📸 Upload Delivery Photo</p>
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => setDeliveryPhoto(e.target.files?.[0] || null)} style={{ color: '#aaa', fontSize: 13, marginBottom: 10, display: 'block' }} />
                    {deliveryPhoto && (
                      <button onClick={() => uploadDeliveryPhoto(order.id)} disabled={uploadingPhoto} style={{ width: '100%', padding: '10px', borderRadius: 10, backgroundColor: '#4ade80', color: '#000', fontWeight: 'bold', border: 'none', cursor: uploadingPhoto ? 'not-allowed' : 'pointer', fontSize: 13 }}>
                        {uploadingPhoto ? 'Uploading...' : '✅ Confirm Delivery with Photo'}
                      </button>
                    )}
                  </div>
                )}

                {/* WHATSAPP CUSTOMER */}
                {order.customer_phone && (
                  <a
                    href={'https://api.whatsapp.com/send?phone=' + order.customer_phone.replace(/\D/g, '').replace(/^242/, '1242') + '&text=' + encodeURIComponent('Hi ' + order.customer_name + '! Your BSC order ' + order.order_number + ' is now ' + (STATUS_INFO[order.status]?.label || order.status) + '. Thank you for shopping with us! 🐟')}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', marginTop: 10, padding: '10px', borderRadius: 10, backgroundColor: '#0a2010', color: '#4ade80', border: '1px solid #4ade80', textDecoration: 'none', fontWeight: 'bold', fontSize: 13, textAlign: 'center' as const }}
                  >
                    💬 WhatsApp Customer Update
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
