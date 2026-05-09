'use client';

// app/pick-ticket/[orderId]/page.tsx
//
// Warehouse-facing pick ticket. NO customer info — staff just see what
// to pack. Pick ticket # is deterministic from order id so it's
// repeatedly printable. Shows items + quantities + delivery method
// (so packers know if it's going on a mailboat vs Nassau).
//
// Linked from /orders detail.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  created_at: string;
  order_type: string;
  status: string | null;
  delivery_type: string | null;
  wholesale_items: unknown;
  admin_notes: string | null;
};

type LineItem = {
  name?: string;
  qty?: number;
  quantity?: number;
  unit?: string;
  sku?: string;
};

function parseItems(raw: unknown): LineItem[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  return raw as LineItem[];
}

export default function PickTicketPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId;
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, created_at, order_type, status, delivery_type, wholesale_items, admin_notes')
        .eq('id', orderId)
        .maybeSingle();
      if (cancelled) return;
      setOrder((data as OrderRow) ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  if (loading) return <Centered>Loading pick ticket…</Centered>;
  if (!order) return <Centered>Order not found.</Centered>;

  const items = parseItems(order.wholesale_items);
  const totalUnits = items.reduce((s, it) => s + Number(it.qty ?? it.quantity ?? 0), 0);
  const pickNo = `PICK-${order.id.slice(0, 8).toUpperCase()}`;
  const invoiceNo = `INV-${order.id.slice(0, 8).toUpperCase()}`;

  return (
    <div style={pgStyle}>
      <div className="no-print" style={topBarStyle}>
        <span>Pick ticket {pickNo}</span>
        <button onClick={() => window.print()} style={printBtnStyle}>🖨 Print</button>
      </div>

      <div style={cardStyle}>
        {/* Header */}
        <div style={{ borderBottom: '3px solid #000', paddingBottom: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#000', letterSpacing: 1 }}>
            PICK TICKET
          </div>
          <div style={{ fontSize: 12, color: '#000', marginTop: 4, fontWeight: 700 }}>
            BSC Marketplace · Spiny Tail Processing · Nassau
          </div>
        </div>

        {/* Big readable references */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div style={refBox}>
            <div style={refLabel}>Pick #</div>
            <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace' }}>{pickNo}</div>
          </div>
          <div style={refBox}>
            <div style={refLabel}>Invoice #</div>
            <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace' }}>{invoiceNo}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14, fontSize: 12 }}>
          <div>
            <div style={refLabel}>Created</div>
            <div style={{ fontWeight: 700 }}>{fmtDate(order.created_at)}</div>
          </div>
          <div>
            <div style={refLabel}>Order type</div>
            <div style={{ fontWeight: 700 }}>{order.order_type.replace('_', ' ')}</div>
          </div>
          <div>
            <div style={refLabel}>Status</div>
            <div style={{ fontWeight: 700 }}>{(order.status || '—').toUpperCase()}</div>
          </div>
        </div>

        {/* Big delivery method banner — packers need this immediately */}
        <div
          style={{
            background: order.delivery_type === 'mailboat' ? '#fef3c7' : '#dbeafe',
            border: `2px solid ${order.delivery_type === 'mailboat' ? '#d97706' : '#1e40af'}`,
            padding: 14,
            borderRadius: 4,
            marginBottom: 14,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700 }}>
            DELIVERY METHOD
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#000', marginTop: 4 }}>
            {order.delivery_type === 'mailboat'
              ? '🚤 MAILBOAT SHIPPING'
              : order.delivery_type === 'nassau'
                ? '📍 NASSAU LOCATION'
                : order.delivery_type === 'pickup'
                  ? '🏪 PICKUP'
                  : '📦 DELIVERY'}
          </div>
          {order.admin_notes && (
            <div style={{ fontSize: 12, color: '#000', marginTop: 6, fontWeight: 600 }}>
              {order.admin_notes}
            </div>
          )}
        </div>

        {/* Items — the only thing packers actually need */}
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>ITEMS TO PACK</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {totalUnits} units · {items.length} SKU{items.length === 1 ? '' : 's'}
          </div>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#666', border: '1px dashed #ccc' }}>
            No line items.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#000', color: '#fff' }}>
                <th style={{ ...thStyle, width: 40, textAlign: 'center' }}>☐</th>
                <th style={thStyle}>Item</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 90 }}>Qty</th>
                <th style={{ ...thStyle, textAlign: 'left', width: 100 }}>SKU</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const qty = Number(it.qty ?? it.quantity ?? 0);
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #ccc' }}>
                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: 18 }}>☐</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{it.name || 'Item'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, fontSize: 16 }}>
                      {qty}{it.unit ? ` ${it.unit}` : ''}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>
                      {it.sku || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 24, paddingTop: 14, borderTop: '2px solid #000', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={refLabel}>Picked by</div>
            <div style={{ borderBottom: '1px solid #000', height: 28, marginTop: 4 }} />
          </div>
          <div>
            <div style={refLabel}>Verified by</div>
            <div style={{ borderBottom: '1px solid #000', height: 28, marginTop: 4 }} />
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 10, color: '#666', marginTop: 14 }}>
          Match all items + quantities before sealing. No customer information on this slip.
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontFamily: 'system-ui' }}>
      {children}
    </div>
  );
}

const pgStyle: React.CSSProperties = { minHeight: '100vh', background: '#fff', padding: 20, fontFamily: "'Inter', system-ui, sans-serif", color: '#000' };
const cardStyle: React.CSSProperties = { background: '#fff', maxWidth: 700, margin: '0 auto', padding: 24, border: '2px solid #000' };
const topBarStyle: React.CSSProperties = { maxWidth: 700, margin: '0 auto 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#475569' };
const printBtnStyle: React.CSSProperties = { background: '#000', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 800, fontSize: 12, cursor: 'pointer' };
const refBox: React.CSSProperties = { background: '#f5f5f5', padding: 12, border: '1px solid #ccc' };
const refLabel: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 1 };
const thStyle: React.CSSProperties = { padding: '8px 6px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 };
const tdStyle: React.CSSProperties = { padding: '8px 6px' };
