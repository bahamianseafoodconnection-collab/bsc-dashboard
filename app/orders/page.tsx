'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';
import { notifyOrderStatusChange } from '@/lib/notify-status-change';
import LockButton from '@/components/LockButton';
import { parseOrderItems } from '@/lib/order-items';

// Skip prerendering. Orders page is per-user, runtime-only.
export const dynamic = 'force-dynamic';

const STATUS_FLOW = ['Pending', 'Confirmed', 'Packing', 'Out for Delivery', 'Delivered'];
const PICKUP_FLOW = ['Pending', 'Confirmed', 'Ready for Pickup', 'Delivered'];

// Derive the bucket an order belongs to in the admin view. Unpaid orders
// (payment_status NOT 'paid') sit in "Awaiting Payment" regardless of
// fulfillment status — Pending is reserved for paid-but-not-yet-confirmed
// orders. Cancelled / Delivered always override.
function orderBucket(o: { status: string; payment_status: string | null }): string {
  const s  = o.status;
  if (s === 'Cancelled' || s === 'Delivered') return s;
  const ps = (o.payment_status || '').toLowerCase();
  if (ps !== 'paid') return 'Awaiting Payment';
  return s || 'Pending';
}

// Classify an order by its sales channel so online orders stay separate from
// POS register sales and wholesale.
function orderSource(orderType: string | undefined): 'online' | 'pos' | 'wholesale' | 'other' {
  const t = (orderType || '').toLowerCase();
  if (t === 'online_market' || t === 'online') return 'online';
  if (t.startsWith('pos')) return 'pos';
  if (t.includes('wholesale')) return 'wholesale';
  return 'other';
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  'Awaiting Payment':  { bg: '#fde8e8', text: '#b91c1c' },
  'Pending':           { bg: '#fef9e7', text: '#d97706' },
  'Confirmed':         { bg: '#e8f4fd', text: '#1a6fb5' },
  'Packing':           { bg: '#f5f0ff', text: '#7c3aed' },
  'Out for Delivery':  { bg: '#fff3e8', text: '#ea6c00' },
  'Ready for Pickup':  { bg: '#e8f8fd', text: '#0891b2' },
  'Delivered':         { bg: '#e8f5e9', text: '#2e7d32' },
  'Cancelled':         { bg: '#fde8e8', text: '#dc2626' },
  'paid':              { bg: '#e8f5e9', text: '#2e7d32' },
  'pending':           { bg: '#fef9e7', text: '#d97706' },
  'processing':        { bg: '#e8f4fd', text: '#1a6fb5' },
};

type OrderItem = { name: string; qty: number; price: number; emoji: string };

type Order = {
  id: string;
  customer_name: string;
  customer_phone: string;
  items: OrderItem[];
  total: number;
  status: string;
  type: 'delivery' | 'pickup';
  address?: string;
  created_at: string;
  order_type?: string;
  locked_by: string | null;
  locked_at: string | null;
  // Payment — surfaced so staff can confirm paid + the gateway/bank refs
  // before advancing the order.
  payment_status: string | null;
  payment_method: string | null;
  payment_ref: string | null;
  // Reconciliation — bank transfer ID matched to the payment + audit.
  payment_approval: string | null;     // bank transfer / settlement ID
  payment_received_at: string | null;  // reconciled timestamp
  payment_received_by: string | null;  // staff uuid that confirmed
};

// One finalized card transaction for the selected order — gateway order id +
// the bank's authorization (confirmation) code.
type PayTx = {
  pt_order_id: string | null;
  pt_authorization_code: string | null;
  pi_response_code: string | null;
  finalized_at: string | null;
  created_at: string | null;
};

// Map an `orders` row from Supabase into the shape the UI expects.
// Different writers (POS, checkout, wholesale, /api/orders/create) use
// slightly different column sets, so we coalesce the common ones.
function mapOrder(row: Record<string, unknown>): Order {
  const id = String(row.id ?? '');
  const orderType = (row.order_type as string) || '';

  // Items: prefer wholesale_items, fall back to items column. parseOrderItems
  // canonicalizes both the qty (quantity/qty) and price (unit_price/price) splits.
  const items: OrderItem[] = parseOrderItems(row.wholesale_items ?? row.items).map((it) => ({
    name:  it.name || 'Item',
    qty:   it.qty,
    price: it.unit_price ?? 0,
    emoji: it.emoji ?? '',
  }));

  // Total: orders table sometimes has `total`, sometimes only `wholesale_cost_total`.
  const total = Number(
    row.total ??
      row.wholesale_cost_total ??
      items.reduce((s, it) => s + it.qty * it.price, 0)
  );

  // Customer: explicit columns, then wholesaler key, then walk-in.
  const customerName =
    (row.customer_name as string) ||
    (row.wholesaler as string) ||
    (orderType.startsWith('pos_') ? 'Walk-in' : '—');

  // Type: prefer explicit delivery_type, infer from order_type / address otherwise.
  const explicitType = String(row.delivery_type ?? '').toLowerCase();
  const type: 'delivery' | 'pickup' =
    explicitType === 'pickup'
      ? 'pickup'
      : explicitType === 'delivery'
        ? 'delivery'
        : orderType.startsWith('pos_')
          ? 'pickup'
          : row.customer_address
            ? 'delivery'
            : 'pickup';

  return {
    id,
    customer_name: customerName,
    customer_phone: String(row.customer_phone ?? ''),
    items,
    total,
    status: String(row.status ?? 'Pending'),
    type,
    address: (row.customer_address as string) || undefined,
    created_at: String(row.created_at ?? new Date().toISOString()),
    locked_by: (row.locked_by as string | null) ?? null,
    locked_at: (row.locked_at as string | null) ?? null,
    order_type: orderType || undefined,
    payment_status: (row.payment_status as string | null) ?? null,
    payment_method: (row.payment_method as string | null) ?? null,
    payment_ref:    (row.payment_ref as string | null) ?? null,
    payment_approval:    (row.payment_approval as string | null) ?? null,
    payment_received_at: (row.payment_received_at as string | null) ?? null,
    payment_received_by: (row.payment_received_by as string | null) ?? null,
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export default function OrdersPage() {
  const [orders, setOrders]           = useState<Order[]>([]);
  const [selected, setSelected]       = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterType, setFilterType]   = useState('All');
  // Separate online orders from POS sales (founder: keep the online order
  // queue distinct from register sales). Defaults to Online.
  const [filterSource, setFilterSource] = useState<'online' | 'pos' | 'wholesale' | 'all'>('online');
  const [loading, setLoading]         = useState(false);
  const [fetching, setFetching]       = useState(true);
  const [fetchError, setFetchError]   = useState<string | null>(null);
  const [payTx, setPayTx]             = useState<PayTx | null>(null);
  // Reconciliation (bank transfer ID match)
  const [bankRef, setBankRef]         = useState('');
  const [reconBusy, setReconBusy]     = useState(false);
  const [reconErr, setReconErr]       = useState<string | null>(null);
  const [filterRecon, setFilterRecon] = useState<'all' | 'awaiting' | 'reconciled'>('all');
  // Bank authorization codes per order id (from payment_transactions). Used
  // for the CSV export so the audit trail (trace + auth) goes out in one row.
  const [authCodes, setAuthCodes] = useState<Record<string, string>>({});

  // Honor ?status=<bucket> from the URL (Dashboard → Order History deep-link).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const s = new URL(window.location.href).searchParams.get('status');
    if (s) setFilterStatus(s);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFetching(true);
      setFetchError(null);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (error) {
        setFetchError(plainError(error));
        setOrders([]);
      } else {
        const rows = (data || []).map((row) => mapOrder(row as Record<string, unknown>));
        setOrders(rows);
        // Bank auth codes for the CSV export — one batch fetch, keep the
        // latest non-null pt_authorization_code per order id.
        const ids = rows.map((r) => r.id).filter(Boolean);
        if (ids.length > 0) {
          const { data: pt } = await supabase
            .from('payment_transactions')
            .select('order_id, pt_authorization_code, created_at')
            .in('order_id', ids)
            .order('created_at', { ascending: false });
          if (!cancelled) {
            const map: Record<string, string> = {};
            for (const r of (pt ?? []) as { order_id: string; pt_authorization_code: string | null }[]) {
              if (r.pt_authorization_code && !map[r.order_id]) map[r.order_id] = r.pt_authorization_code;
            }
            setAuthCodes(map);
          }
        }
      }
      setFetching(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pull the latest (finalized) card transaction for the selected order so
  // staff can see the gateway payment id + bank authorization code. Newest
  // row wins — /api/payment/start logs a pending attempt, the PnP return logs
  // the finalized one with the auth code. Staff-readable via RLS.
  useEffect(() => {
    setBankRef('');
    setReconErr(null);
    if (!selected) { setPayTx(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('payment_transactions')
        .select('pt_order_id, pt_authorization_code, pi_response_code, finalized_at, created_at')
        .eq('order_id', selected.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setPayTx((data as PayTx | null) ?? null);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const isReconciled = (o: Order) => !!(o.payment_approval || o.payment_received_at);

  async function reconcile(order: Order) {
    const ref = bankRef.trim();
    if (!ref) { setReconErr('Enter the bank transfer ID first.'); return; }
    setReconBusy(true);
    setReconErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/orders/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ order_id: order.id, bank_transfer_id: ref }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      // Apply bank-ref + (if the API auto-advanced) the new fulfillment status.
      const newStatus = j.status_changed_to as string | null | undefined;
      const patch: Partial<Order> = {
        payment_approval:    ref,
        payment_received_at: j.reconciled_at as string,
        ...(newStatus ? { status: newStatus } : {}),
      };
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...patch } : o)));
      if (selected?.id === order.id) setSelected({ ...order, ...patch });
      setBankRef('');
      // Customer-facing status update: WhatsApp / email via the existing
      // helper so /track + /my-orders show "Confirmed" immediately.
      if (newStatus) {
        notifyOrderStatusChange({
          orderId:       order.id,
          newStatus,
          customerName:  order.customer_name,
          customerPhone: order.customer_phone || null,
        });
      }
    } catch (err) {
      setReconErr(err instanceof Error ? err.message : 'Could not reconcile');
    } finally {
      setReconBusy(false);
    }
  }

  // Audit-friendly CSV of whatever's currently filtered on screen — date,
  // customer, total, bank trace, auth code, who reconciled, etc.
  function exportCsv() {
    const header = ['Date', 'Order ID', 'Customer', 'Phone', 'Type', 'Payment Method', 'Payment Status', 'Total (BSD)', 'Bank Trace ID', 'Bank Auth Code', 'Reconciled At', 'Reconciled By (uuid)', 'Status'];
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [header.join(',')];
    for (const o of filtered) {
      lines.push([
        new Date(o.created_at).toISOString(),
        o.id,
        o.customer_name,
        o.customer_phone || '',
        o.type,
        o.payment_method || '',
        o.payment_status || '',
        o.total.toFixed(2),
        o.payment_approval || '',
        authCodes[o.id] || '',
        o.payment_received_at ? new Date(o.payment_received_at).toISOString() : '',
        o.payment_received_by || '',
        orderBucket(o),
      ].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `bsc-orders-${filterStatus.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const filtered = orders.filter((o) => {
    const matchSource = filterSource === 'all' || orderSource(o.order_type) === filterSource;
    const matchStatus = filterStatus === 'All' || orderBucket(o) === filterStatus;
    const matchType   = filterType   === 'All' || o.type   === filterType;
    const matchRecon  = filterRecon === 'all'
      || (filterRecon === 'reconciled' ? isReconciled(o) : !isReconciled(o));
    return matchSource && matchStatus && matchType && matchRecon;
  });
  const onlineCount = orders.filter((o) => orderSource(o.order_type) === 'online').length;
  const posCount    = orders.filter((o) => orderSource(o.order_type) === 'pos').length;

  async function advanceStatus(order: Order) {
    if (order.locked_by) {
      alert('This order is locked. Unlock it first to change status.');
      return;
    }
    const flow = order.type === 'pickup' ? PICKUP_FLOW : STATUS_FLOW;
    const idx  = flow.indexOf(order.status);
    if (idx === -1 || idx === flow.length - 1) return;
    const next = flow[idx + 1];
    setLoading(true);
    const { error } = await supabase
      .from('orders')
      .update({ status: next })
      .eq('id', order.id);
    if (error) {
      alert(`Could not advance status: ${plainError(error)}`);
      setLoading(false);
      return;
    }
    setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: next } : o));
    if (selected?.id === order.id) setSelected({ ...order, status: next });
    setLoading(false);

    // Fire-and-forget customer notification (skipped if no phone/email).
    notifyOrderStatusChange({
      orderId: order.id,
      newStatus: next,
      customerName: order.customer_name,
      customerPhone: order.customer_phone || null,
    });
  }

  async function cancelOrder(order: Order) {
    if (order.locked_by) {
      alert('This order is locked. Unlock it first to cancel.');
      return;
    }
    const { error } = await supabase
      .from('orders')
      .update({ status: 'Cancelled' })
      .eq('id', order.id);
    if (error) {
      alert(`Could not cancel order: ${plainError(error)}`);
      return;
    }
    setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: 'Cancelled' } : o));
    if (selected?.id === order.id) setSelected({ ...order, status: 'Cancelled' });

    notifyOrderStatusChange({
      orderId: order.id,
      newStatus: 'Cancelled',
      customerName: order.customer_name,
      customerPhone: order.customer_phone || null,
    });
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
            <span style={{ backgroundColor: STATUS_COLORS['Awaiting Payment'].bg, color: STATUS_COLORS['Awaiting Payment'].text, fontSize: '12px', fontWeight: 800, padding: '4px 12px', borderRadius: '20px' }}>
              {orders.filter((o) => orderBucket(o) === 'Awaiting Payment').length} Awaiting Payment
            </span>
            <span style={{ backgroundColor: STATUS_COLORS['Pending'].bg, color: STATUS_COLORS['Pending'].text, fontSize: '12px', fontWeight: 800, padding: '4px 12px', borderRadius: '20px' }}>
              {orders.filter((o) => orderBucket(o) === 'Pending').length} Pending
            </span>
          </div>
        </div>
      </header>

      {/* Sales-channel separation — online orders vs POS register sales */}
      <div style={{ backgroundColor: '#1a2e5a', padding: '10px 16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {([
          { key: 'online',    label: `🛒 Online Orders (${onlineCount})` },
          { key: 'pos',       label: `🏪 POS Sales (${posCount})` },
          { key: 'wholesale', label: '📦 Wholesale' },
          { key: 'all',       label: 'All' },
        ] as const).map((s) => (
          <button key={s.key} onClick={() => setFilterSource(s.key)}
            style={{ padding: '7px 16px', borderRadius: '20px', border: 'none', backgroundColor: filterSource === s.key ? '#f4c842' : 'rgba(255,255,255,0.1)', color: filterSource === s.key ? '#1a2e5a' : '#fff', fontSize: '12px', fontWeight: filterSource === s.key ? 900 : 600, cursor: 'pointer' }}>
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #ebebeb', padding: '12px 16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {['All', 'Awaiting Payment', 'Pending', 'Confirmed', 'Packing', 'Out for Delivery', 'Ready for Pickup', 'Delivered', 'Cancelled'].map((s) => (
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
        <div style={{ width: '1px', backgroundColor: '#e5e7eb', margin: '0 4px' }} />
        {([
          { key: 'all',        label: 'Payment: All' },
          { key: 'awaiting',   label: '💰 Awaiting match' },
          { key: 'reconciled', label: '✓ Reconciled' },
        ] as const).map((r) => (
          <button key={r.key} onClick={() => setFilterRecon(r.key)} style={{ padding: '6px 14px', borderRadius: '20px', border: 'none', backgroundColor: filterRecon === r.key ? '#2e7d32' : '#f0f0f0', color: filterRecon === r.key ? '#fff' : '#555', fontSize: '12px', fontWeight: filterRecon === r.key ? 800 : 500, cursor: 'pointer' }}>
            {r.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            title="Export the filtered orders as CSV (date · customer · total · trace · auth · received-by)"
            style={{ padding: '6px 14px', borderRadius: '20px', border: 'none', backgroundColor: '#1a2e5a', color: '#f4c842', fontSize: '12px', fontWeight: 800, cursor: filtered.length === 0 ? 'not-allowed' : 'pointer', opacity: filtered.length === 0 ? 0.5 : 1 }}
          >
            ↓ Export CSV ({filtered.length})
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {fetching && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ color: '#999', fontSize: '14px' }}>Loading orders...</div>
            </div>
          )}
          {!fetching && fetchError && (
            <div style={{
              backgroundColor: '#fde8e8', border: '1px solid #f5b5b5', borderRadius: '12px',
              padding: '16px', color: '#dc2626', fontSize: '13px', fontWeight: 600,
            }}>
              ⚠️ Could not load orders: {fetchError}
            </div>
          )}
          {!fetching && !fetchError && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ color: '#999', fontSize: '14px' }}>
                {orders.length === 0 ? 'No orders yet.' : 'No orders match this filter.'}
              </div>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span onClick={(e) => e.stopPropagation()}>
                      <LockButton
                        table="orders"
                        id={order.id}
                        lockedBy={order.locked_by}
                        lockedAt={order.locked_at}
                        onChange={(next) => {
                          setOrders((prev) => prev.map((o) =>
                            o.id === order.id ? { ...o, ...next } : o
                          ));
                          if (selected?.id === order.id) setSelected({ ...order, ...next });
                        }}
                      />
                    </span>
                    {statusBadge(orderBucket(order))}
                  </div>
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
                {selected.customer_phone && <div style={{ color: '#666', fontSize: '13px' }}>{selected.customer_phone}</div>}
                <div style={{ color: '#666', fontSize: '13px' }}>{selected.type === 'delivery' ? 'Delivery' : 'Pickup'}</div>
                {selected.address && <div style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>{selected.address}</div>}
              </div>

              {/* Payment — confirm paid + the gateway/bank reference IDs before
                  advancing. Card order ids come from payment_transactions. */}
              {(() => {
                const ps   = (selected.payment_status || '').toLowerCase();
                const paid = ps === 'paid';
                const isCard = selected.payment_method === 'card';
                const badgeBg = paid ? '#e8f5e9' : ps.includes('pending') ? '#fef9e7' : '#fde8e8';
                const badgeFg = paid ? '#2e7d32' : ps.includes('pending') ? '#d97706' : '#dc2626';
                const confirmId = payTx?.pt_order_id || selected.payment_ref || null;
                return (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ color: '#999', fontSize: '11px', marginBottom: '8px' }}>Payment</div>
                    <div style={{ border: '1px solid #ebebeb', borderRadius: 10, padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: confirmId || payTx ? 10 : 0 }}>
                        <span style={{ backgroundColor: badgeBg, color: badgeFg, fontSize: 12, fontWeight: 900, padding: '4px 12px', borderRadius: 20 }}>
                          {paid ? '✓ PAID' : (selected.payment_status || 'Unpaid')}
                        </span>
                        <span style={{ color: '#666', fontSize: 12, fontWeight: 700 }}>
                          {isCard ? '💳 Card' : selected.payment_method === 'cod' ? '💵 Cash on delivery' : (selected.payment_method || '—')}
                        </span>
                      </div>
                      {confirmId && <PayRow label="Payment confirmation ID" value={confirmId} />}
                      {payTx?.pt_authorization_code && <PayRow label="Bank authorization (confirmation) ID" value={payTx.pt_authorization_code} />}
                      {payTx?.pi_response_code && <PayRow label="Gateway response code" value={payTx.pi_response_code} />}
                      {payTx?.finalized_at && (
                        <PayRow label="Confirmed at" value={new Date(payTx.finalized_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} />
                      )}
                      {isCard && !paid && (
                        <div style={{ marginTop: 8, fontSize: 11, color: '#dc2626', fontWeight: 700 }}>
                          ⚠️ Card payment not yet confirmed — do not advance until PAID with a confirmation ID.
                        </div>
                      )}
                      {selected.payment_method === 'cod' && (
                        <div style={{ marginTop: 8, fontSize: 11, color: '#d97706', fontWeight: 700 }}>
                          💵 Collect cash on delivery.
                        </div>
                      )}

                      {/* Bank reconciliation — match the bank's transfer ID to the payment ID above */}
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e5e7eb' }}>
                        <div style={{ color: '#999', fontSize: 11, marginBottom: 6 }}>Bank reconciliation</div>
                        {selected.payment_approval ? (
                          <div style={{ fontSize: 12, color: '#2e7d32', fontWeight: 800, marginBottom: 8 }}>
                            ✓ Reconciled — Bank transfer #{selected.payment_approval}
                            {selected.payment_received_at && (
                              <span style={{ color: '#999', fontWeight: 500 }}>{' · '}{new Date(selected.payment_received_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}</span>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: '#d97706', fontWeight: 700, marginBottom: 8 }}>💰 Awaiting bank match</div>
                        )}
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            value={bankRef}
                            onChange={(e) => setBankRef(e.target.value)}
                            placeholder="Bank transfer ID"
                            style={{ flex: 1, minWidth: 0, border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}
                          />
                          <button
                            onClick={() => reconcile(selected)}
                            disabled={reconBusy}
                            style={{ backgroundColor: '#2e7d32', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', opacity: reconBusy ? 0.6 : 1 }}
                          >
                            {reconBusy ? 'Saving…' : selected.payment_approval ? 'Update' : 'Confirm'}
                          </button>
                        </div>
                        <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
                          Match the bank&apos;s transfer ID to the payment ID above — customer name + amount must agree.
                        </div>
                        {reconErr && <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, marginTop: 6 }}>{reconErr}</div>}
                      </div>
                    </div>
                  </div>
                );
              })()}

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

                {/* Print actions — open in new tab so the order list stays put */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <a
                    href={`/receipt/${selected.id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'block', backgroundColor: '#1a2e5a', color: '#f4c842', textDecoration: 'none', borderRadius: '10px', padding: '11px', textAlign: 'center', fontWeight: 800, fontSize: '13px' }}
                  >
                    🧾 Receipt
                  </a>
                  <a
                    href={`/pick-ticket/${selected.id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'block', backgroundColor: '#000', color: '#fff', textDecoration: 'none', borderRadius: '10px', padding: '11px', textAlign: 'center', fontWeight: 800, fontSize: '13px' }}
                  >
                    📋 Pick Ticket
                  </a>
                </div>

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

// Label / value row for the payment-confirmation block. Value is monospace so
// the gateway + bank reference IDs are easy to read off / copy.
function PayRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0' }}>
      <span style={{ color: '#999', fontSize: 11, flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#1a2e5a', fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace, monospace', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}
