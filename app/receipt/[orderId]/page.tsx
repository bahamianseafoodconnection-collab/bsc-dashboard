'use client';

// app/receipt/[orderId]/page.tsx
//
// Customer / Nassau POS receipt. Public route — accessed via the order UUID
// (non-guessable). Prints at 80mm thermal width via AirPrint (the system
// print sheet). Linked from /checkout's done view, /orders detail (staff),
// and the Nassau POS "Print receipt" action.
//
// LAYOUT (founder spec 2026-06-26):
//   Top:      date+time (left) · receipt no. (right)
//   Brand:    logo · "BSC Market Place" · address · mobile · TIN · "INVOICE"
//   Customer: heading · name · "Customer: <name>"
//   Items:    Product · Quantity · Unit Price · Subtotal
//   Bottom:   Subtotal · Total · Payment breakdown · Total Paid · Status

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
  card_ref: string | null;        // RBC terminal reference for card sales
  terminal_type: string | null;   // which RBC terminal handled the swipe
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
  // 2026-05-30). Do NOT compute, label, or display VAT. Subtotal == total.
  const subtotal = total;
  const invoiceNo = `INV-${order.id.slice(0, 8).toUpperCase()}`;
  const customerName = order.customer_name || 'Walk-In Customer';

  // Payment status → Paid / Unpaid / Partial (+ Total Paid).
  const ps = (order.payment_status || order.status || '').toLowerCase();
  const isPaid = ['paid_in_full', 'approved', 'paid', 'completed', 'processing'].includes(ps);
  const isPartial = ps.includes('partial');
  const statusLabel = isPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'UNPAID';
  const statusColor = isPaid ? '#16a34a' : isPartial ? '#d97706' : '#dc2626';
  const totalPaid = isPaid ? total : 0;

  return (
    <div className="receipt-page" style={pgStyle}>
      <div className="no-print" style={topBarStyle}>
        <span>Receipt · {customerName}</span>
        <button onClick={() => window.print()} style={printBtnStyle}>🖨 Print</button>
      </div>

      <div className="receipt-card" style={cardStyle}>
        {/* ── Top: date/time (left) · receipt no. (right) ── */}
        <div style={metaTopStyle}>
          <span>{fmtDate(order.created_at)}</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{invoiceNo}</span>
        </div>

        {/* ── Brand block (centered) ── */}
        <div style={{ textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bsc-marketplace-logo.png" alt="BSC Market Place"
            style={{ height: 84, width: 'auto', display: 'block', margin: '0 auto 6px' }} />
          <div style={{ fontSize: 17, fontWeight: 900, color: '#1a2e5a', letterSpacing: 0.5 }}>
            BSC Market Place
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 1.4 }}>
            Epic Plaza Fire Trail Rd.<br />Nassau, New Providence, Bahamas
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
            Mobile: 242-361-3474
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 1 }}>
            TIN# 111392634
          </div>
        </div>

        {/* ── Document title ── */}
        <div style={docTitleStyle}>INVOICE</div>

        {/* ── Customer ── */}
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <div style={{ ...sectionLabel, textAlign: 'center', marginBottom: 4 }}>Customer</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1a2e5a' }}>{customerName}</div>
          <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>
            Customer: {customerName}
          </div>
          {order.customer_phone && (
            <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>📱 {order.customer_phone}</div>
          )}
        </div>

        {/* ── Items: Product · Quantity · Unit Price · Subtotal ── */}
        <div style={{ marginTop: 14 }}>
          {items.length === 0 ? (
            <div style={{ fontSize: 13, color: '#666', textAlign: 'center' }}>No line items recorded.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Product</th>
                  <th style={{ ...thStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>Qty</th>
                  <th style={{ ...thStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>Unit Price</th>
                  <th style={{ ...thStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const qty = it.qty;
                  const price = it.unit_price ?? 0;
                  const line = Number(it.line_total ?? price * qty);
                  return (
                    <tr key={i} style={{ borderBottom: '1px dotted #ddd' }}>
                      <td style={tdStyle}>{it.name || 'Item'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {qty}{it.unit ? ` ${it.unit}` : ''}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>${price.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>
                        ${line.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Totals ── */}
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: '2px solid #1a2e5a' }}>
          <div style={totalsRowStyle}>
            <span style={{ color: '#475569', fontSize: 14, fontWeight: 600 }}>Subtotal</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>${subtotal.toFixed(2)}</span>
          </div>
          <div style={{ ...totalsRowStyle, marginTop: 8, fontWeight: 900, fontSize: 22, color: '#1a2e5a' }}>
            <span>TOTAL</span>
            <span>BSD ${total.toFixed(2)}</span>
          </div>
        </div>

        {/* ── Payment breakdown · Total Paid · Status ── */}
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px dashed #ddd' }}>
          <div style={sectionLabel}>Payment</div>
          <div style={totalsRowStyle}>
            <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
              {order.payment_method ? labelForPayment(order.payment_method) : '—'}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>${totalPaid.toFixed(2)}</span>
          </div>
          {order.payment_ref && (
            <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>
              ref {order.payment_ref}
            </div>
          )}
          <div style={{ ...totalsRowStyle, marginTop: 6 }}>
            <span style={{ fontSize: 14, color: '#475569', fontWeight: 700 }}>Total Paid</span>
            <span style={{ fontSize: 15, fontWeight: 800 }}>BSD ${totalPaid.toFixed(2)}</span>
          </div>
          <div style={{ ...totalsRowStyle, marginTop: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: '#475569', fontWeight: 700 }}>Status</span>
            <span style={{
              fontSize: 14, fontWeight: 900, letterSpacing: 1,
              color: '#fff', background: statusColor, padding: '2px 10px', borderRadius: 4,
            }}>
              {statusLabel}
            </span>
          </div>

          {/* Structured card reference + terminal — populated by Nassau POS for
              card sales. Renders only when present so cash sales stay clean. */}
          {(order.card_ref || order.terminal_type) && (
            <div style={{
              marginTop: 8, padding: '6px 8px', background: '#f8fafc',
              border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, color: '#1a2e5a', lineHeight: 1.5,
            }}>
              {order.card_ref && (
                <div>
                  <span style={{ color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginRight: 6 }}>card ref</span>
                  <span style={{ fontFamily: 'SF Mono, Menlo, monospace', fontWeight: 700 }}>{order.card_ref}</span>
                </div>
              )}
              {order.terminal_type && (
                <div style={{ marginTop: order.card_ref ? 2 : 0, fontSize: 11, color: '#475569', fontWeight: 500 }}>
                  {labelForTerminal(order.terminal_type)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Trace QR — customer self-verification of provenance ── */}
        <div style={{
          marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12,
          display: 'flex', gap: 12, alignItems: 'center',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=2&data=${encodeURIComponent('https://bscbahamas.com/trace')}`}
            alt="Scan to trace your seafood"
            style={{ width: 78, height: 78, borderRadius: 4, border: '1px solid #e7e7e7', background: '#fff', flexShrink: 0 }}
          />
          <div style={{ fontSize: 11, color: '#1a2e5a', lineHeight: 1.45 }}>
            <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 12, letterSpacing: 0.5 }}>🧾 Trace your seafood</p>
            <p style={{ margin: 0, color: '#475569' }}>
              Scan to verify origin + HACCP records. Enter the <strong>lot code</strong> on BSC-processed packages at <strong>bscbahamas.com/trace</strong>.
            </p>
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, color: '#666', marginTop: 12, borderTop: '1px dashed #ddd', paddingTop: 10, lineHeight: 1.5 }}>
          Thank you for shopping with BSC Market Place.<br />
          Questions? WhatsApp / call 242-361-3474.
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
const cardStyle: React.CSSProperties = { background: '#fff', maxWidth: 380, margin: '0 auto', padding: 24, borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', color: '#1a2e5a' };
const topBarStyle: React.CSSProperties = { maxWidth: 380, margin: '0 auto 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#475569' };
const printBtnStyle: React.CSSProperties = { background: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 800, fontSize: 12, cursor: 'pointer' };
const metaTopStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, color: '#475569', marginBottom: 10 };
const docTitleStyle: React.CSSProperties = { textAlign: 'center', fontSize: 19, fontWeight: 900, letterSpacing: 3, color: '#1a2e5a', marginTop: 12, padding: '6px 0', borderTop: '2px solid #1a2e5a', borderBottom: '2px solid #1a2e5a' };
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 4px', borderBottom: '2px solid #1a2e5a', fontSize: 11, fontWeight: 700, color: '#1a2e5a', textTransform: 'uppercase', letterSpacing: 0.3 };
const tdStyle: React.CSSProperties = { padding: '7px 4px', fontSize: 13, color: '#1a2e5a', verticalAlign: 'top' };
const totalsRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '3px 0' };
