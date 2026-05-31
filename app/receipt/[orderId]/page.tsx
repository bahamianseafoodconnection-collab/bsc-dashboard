'use client';

// app/receipt/[orderId]/page.tsx
//
// Customer-facing receipt. Public route — accessed via the order UUID
// (non-guessable). Shows full customer info: name, phone, address,
// delivery method, items, total, payment status. Print-friendly.
//
// Linked from /checkout's done view and from /orders detail (staff).

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { parseOrderItems } from '@/lib/order-items';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  created_at: string;
  order_type: string;
  payment_method: string | null;
  payment_status: string | null;
  payment_ref: string | null;
  card_ref: string | null;        // Item 6: RBC terminal reference for card sales (column added 2026-05-25)
  terminal_type: string | null;   // Item 6: which RBC terminal handled the swipe
  status: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  delivery_type: string | null;
  wholesale_items: unknown;
  wholesale_cost_total: number | null;
  total: number | null;
  admin_notes: string | null;
};

type LineItem = {
  name?: string;
  qty?: number;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  price?: number;
  line_total?: number;
};

export default function ReceiptPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId;
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      // Read through the secure server endpoint (orders RLS is locked to
      // staff + owner; this authorizes staff/owner/guest-by-UUID).
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/orders/${orderId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      });
      const json = await res.json().catch(() => null);
      if (cancelled) return;
      setOrder(res.ok && json?.ok ? (json.order as OrderRow) : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  if (loading) return <Centered>Loading receipt…</Centered>;
  if (!order) return <Centered>Receipt not found.</Centered>;

  const items = parseOrderItems(order.wholesale_items);
  const total = Number(order.total ?? order.wholesale_cost_total ?? 0);
  // VAT is DISABLED until BSC is approved to charge it (founder direction
  // 2026-05-30). Do NOT compute, label, or display VAT on any receipt or
  // invoice. The order subtotal equals the order total.
  const subtotal = total;
  const invoiceNo = `INV-${order.id.slice(0, 8).toUpperCase()}`;

  return (
    <div className="receipt-page" style={pgStyle}>
      <div className="no-print" style={topBarStyle}>
        <span>Receipt for {order.customer_name || 'Customer'}</span>
        <button onClick={() => window.print()} style={printBtnStyle}>🖨 Print</button>
      </div>

      <div className="receipt-card" style={cardStyle}>
        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #1a2e5a', paddingBottom: 14, marginBottom: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bsc-marketplace-logo.png" alt="BSC Market Place"
            style={{ height: 110, width: 'auto', display: 'block', margin: '0 auto' }} />
          <div style={{ fontSize: 13, color: '#475569', marginTop: 4, lineHeight: 1.4 }}>
            Epic Plaza, Fire Trail Rd, Nassau, New Providence, Bahamas
          </div>
          <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>
            Mobile: 242-822-6180 &nbsp;·&nbsp; TIN# 111392634
          </div>
        </div>

        <div style={metaRowStyle}>
          <div>
            <div style={metaLabel}>Receipt</div>
            <div style={{ ...metaValue, fontFamily: 'monospace' }}>{invoiceNo}</div>
          </div>
          <div>
            <div style={metaLabel}>Date</div>
            <div style={metaValue}>{fmtDate(order.created_at)}</div>
          </div>
          <div>
            <div style={metaLabel}>Order #</div>
            <div style={{ ...metaValue, fontFamily: 'monospace', fontSize: 13 }}>
              {order.id.slice(0, 13)}…
            </div>
          </div>
        </div>

        {/* Customer */}
        <div style={sectionStyle}>
          <div style={sectionLabel}>Customer</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1a2e5a' }}>
            {order.customer_name || 'Walk-In Customer'}
          </div>
          {order.customer_phone && (
            <div style={{ fontSize: 14, color: '#475569', marginTop: 4 }}>
              📱 {order.customer_phone}
            </div>
          )}
          {order.customer_address && (
            <div style={{ fontSize: 14, color: '#475569', marginTop: 2 }}>
              {order.customer_address}
            </div>
          )}
        </div>

        {/* Delivery method */}
        <div style={sectionStyle}>
          <div style={sectionLabel}>Delivery</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1a2e5a' }}>
            {order.delivery_type === 'mailboat'
              ? '🚤 Mailboat shipping (Family Island)'
              : order.delivery_type === 'nassau'
                ? '📍 Nassau location'
                : order.delivery_type === 'pickup'
                  ? '🏪 Pickup'
                  : '📦 Delivery'}
          </div>
          {order.admin_notes && (
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{order.admin_notes}</div>
          )}
        </div>

        {/* Items */}
        <div style={sectionStyle}>
          <div style={sectionLabel}>Items</div>
          {items.length === 0 ? (
            <div style={{ fontSize: 14, color: '#666' }}>No line items recorded.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Item</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Qty</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Line</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const qty = it.qty;
                  const price = it.unit_price ?? 0;
                  const line = Number(it.line_total ?? price * qty);
                  return (
                    <tr key={i} style={{ borderBottom: '1px dotted #eee' }}>
                      <td style={tdStyle}>{it.name || 'Item'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {qty}{it.unit ? ` ${it.unit}` : ''}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>${price.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                        ${line.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Totals — VAT disabled until approved (no VAT line). */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '2px solid #1a2e5a' }}>
          <div style={totalsRowStyle}>
            <span style={{ color: '#475569', fontSize: 14, fontWeight: 600 }}>Subtotal</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>${subtotal.toFixed(2)}</span>
          </div>
          <div style={{ ...totalsRowStyle, marginTop: 10, fontWeight: 900, fontSize: 22, color: '#1a2e5a' }}>
            <span>TOTAL</span>
            <span>BSD ${total.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment */}
        <div style={sectionStyle}>
          <div style={sectionLabel}>Payment</div>
          <div style={{ fontSize: 15, color: '#475569', fontWeight: 600 }}>
            {order.payment_method ? labelForPayment(order.payment_method) : '—'}
            {' · '}
            <span
              style={{
                color: order.payment_status === 'paid_in_full'
                  || order.payment_status === 'approved'
                  || order.status === 'processing'
                  ? '#22c55e'
                  : order.payment_status === 'pending'
                    ? '#d97706'
                    : '#dc2626',
                fontWeight: 800,
              }}
            >
              {(order.payment_status || order.status || 'pending').toUpperCase()}
            </span>
            {order.payment_ref && (
              <span style={{ color: '#94a3b8', marginLeft: 8, fontFamily: 'monospace', fontSize: 13 }}>
                ref {order.payment_ref}
              </span>
            )}
          </div>
          {/* Item 6: structured card reference + terminal — populated by
              Nassau POS when payment_method === 'card'. Renders only when
              present so non-card sales stay clean. */}
          {(order.card_ref || order.terminal_type) && (
            <div style={{
              marginTop: 8,
              padding: '8px 10px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              fontSize: 13,
              color: '#1a2e5a',
              lineHeight: 1.5,
            }}>
              {order.card_ref && (
                <div>
                  <span style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginRight: 6 }}>card ref</span>
                  <span style={{ fontFamily: 'SF Mono, Menlo, monospace', fontWeight: 700 }}>{order.card_ref}</span>
                </div>
              )}
              {order.terminal_type && (
                <div style={{ marginTop: order.card_ref ? 2 : 0, fontSize: 12, color: '#475569', fontWeight: 500 }}>
                  {labelForTerminal(order.terminal_type)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Trace QR — customer self-verification of provenance */}
        <div style={{
          marginTop: 18, borderTop: '1px solid #eee', paddingTop: 12,
          display: 'flex', gap: 12, alignItems: 'center',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=2&data=${encodeURIComponent('https://bscbahamas.com/trace')}`}
            alt="Scan to trace your seafood"
            style={{ width: 84, height: 84, borderRadius: 4, border: '1px solid #e7e7e7', background: '#fff', flexShrink: 0 }}
          />
          <div style={{ fontSize: 11, color: '#1a2e5a', lineHeight: 1.45 }}>
            <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 12, color: '#1a2e5a', letterSpacing: 0.5 }}>
              🧾 Trace your seafood
            </p>
            <p style={{ margin: 0, color: '#475569' }}>
              Scan to verify origin + HACCP records. Look for the <strong>lot code</strong> printed on BSC-processed packages and enter it at <strong>bscbahamas.com/trace</strong>.
            </p>
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, color: '#666', marginTop: 14, borderTop: '1px dashed #ddd', paddingTop: 10, lineHeight: 1.5 }}>
          Thank you for shopping with BSC Market Place.<br />
          Questions? WhatsApp +1 (242) 361-3474 or call +1 (242) 558-4495.
        </div>
      </div>

      <style>{`
        @media print {
          /* Thermal-printer paper: 80mm wide, height auto-trimmed to content.
             Without an explicit @page size, the browser assumes Letter/A4 and the
             printer feeds blank paper to clear the rest of the "page". */
          @page { size: 80mm auto; margin: 0; }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            height: auto !important;
            min-height: 0 !important;
            color: #000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .no-print { display: none !important; }

          .receipt-page {
            padding: 0 !important;
            margin: 0 !important;
            min-height: 0 !important;
            background: #fff !important;
          }

          .receipt-card {
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 6mm 4mm !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            page-break-after: avoid;
            page-break-inside: avoid;
          }

          /* Kill any trailing whitespace the layout might add. */
          .receipt-card > *:last-child {
            margin-bottom: 0 !important;
            padding-bottom: 0 !important;
          }
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

function labelForPayment(m: string) {
  if (m === 'card') return '💳 Card';
  if (m === 'cod') return '💵 Cash on delivery';
  if (m === 'cash') return '💵 Cash';
  if (m === 'transfer') return '🏦 Transfer';
  if (m === 'wire') return '🏦 Wire';
  if (m === 'account') return '🧾 Account';
  return m;
}

function labelForTerminal(t: string) {
  if (t === 'rbc_plug_and_play')     return '📱 RBC Plug & Play';
  if (t === 'rbc_physical_terminal') return '🖥️ RBC Physical Terminal';
  return t;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontFamily: 'system-ui' }}>
      {children}
    </div>
  );
}

const pgStyle: React.CSSProperties = { minHeight: '100vh', background: '#f1f5f9', padding: '20px', fontFamily: "'Inter', system-ui, sans-serif" };
const cardStyle: React.CSSProperties = { background: '#fff', maxWidth: 600, margin: '0 auto', padding: 28, borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', color: '#1a2e5a' };
const topBarStyle: React.CSSProperties = { maxWidth: 600, margin: '0 auto 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#475569' };
const printBtnStyle: React.CSSProperties = { background: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 800, fontSize: 12, cursor: 'pointer' };
const metaRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12, marginBottom: 14 };
const metaLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 };
const metaValue: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#1a2e5a' };
const sectionStyle: React.CSSProperties = { marginTop: 14, paddingTop: 10, borderTop: '1px dashed #ddd' };
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 4px', borderBottom: '2px solid #1a2e5a', fontSize: 12, fontWeight: 700, color: '#1a2e5a', textTransform: 'uppercase', letterSpacing: 0.5 };
const tdStyle: React.CSSProperties = { padding: '8px 4px', fontSize: 14, color: '#1a2e5a', verticalAlign: 'top' };
const totalsRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '4px 0' };
