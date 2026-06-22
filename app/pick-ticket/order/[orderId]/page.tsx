'use client';

// /pick-ticket/order/[orderId]
//
// Per-supplier pick tickets for one order (Phase 1). One printable ticket per
// supplier: supplier name, product name + SKU, COST price, and the delivery
// target (DELIVER TO SPINY TAIL for POS sales, customer address for online).
// BSC prints these; the assigned driver carries each to its supplier and
// confirms name/SKU/cost on pickup.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface TicketItem { name: string; sku: string; qty: number; unit: string; cost: number }
interface Ticket { po_id: string; supplier_name: string; total_cost: number; payment_status: string; items: TicketItem[] }
interface DeliverTo { kind: 'spiny_tail' | 'customer'; label: string; name?: string | null; phone?: string | null }
interface Payload {
  ok: boolean; error?: string;
  order?: { id: string; order_type: string | null; status: string | null; payment_status: string | null; created_at: string };
  deliver_to?: DeliverTo;
  tickets?: Ticket[];
}

const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;

export default function OrderPickTicketsPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId;
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/fulfillment/pick-tickets/${orderId}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      const j = (await res.json().catch(() => ({ ok: false, error: 'load failed' }))) as Payload;
      if (!cancelled) { setData(j); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  if (loading) return <Centered>Loading pick tickets…</Centered>;
  if (!data?.ok || !data.order) return <Centered>{data?.error || 'Order not found.'}</Centered>;
  if (!data.tickets || data.tickets.length === 0) {
    return <Centered>No supplier pick tickets for this order yet (purchase orders raise once payment is confirmed).</Centered>;
  }

  const ref = `PICK-${data.order.id.slice(0, 8).toUpperCase()}`;
  const spiny = data.deliver_to?.kind === 'spiny_tail';

  return (
    <div style={pg}>
      <div className="no-print" style={topBar}>
        <span>{data.tickets.length} supplier ticket{data.tickets.length === 1 ? '' : 's'} · {ref}</span>
        <button onClick={() => window.print()} style={printBtn}>🖨 Print all</button>
      </div>

      {data.tickets.map((t, idx) => (
        <div key={t.po_id} style={{ ...card, pageBreakAfter: idx < data.tickets!.length - 1 ? 'always' : 'auto' }}>
          {/* Header */}
          <div style={{ borderBottom: '3px solid #000', paddingBottom: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>SUPPLIER PICK TICKET</div>
            <div style={{ fontSize: 12, marginTop: 4, fontWeight: 700 }}>BSC Marketplace · Nassau</div>
          </div>

          {/* Supplier + refs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={refBox}>
              <div style={refLabel}>Supplier</div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{t.supplier_name}</div>
            </div>
            <div style={refBox}>
              <div style={refLabel}>Pick # / PO</div>
              <div style={{ fontSize: 16, fontWeight: 900, fontFamily: 'monospace' }}>{ref}</div>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#666' }}>PO {t.po_id.slice(0, 8).toUpperCase()}</div>
            </div>
          </div>

          {/* DELIVER TO banner */}
          <div style={{
            background: spiny ? '#fee2e2' : '#dbeafe',
            border: `2px solid ${spiny ? '#dc2626' : '#1e40af'}`,
            padding: 14, borderRadius: 4, marginBottom: 14, textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700 }}>Deliver to</div>
            <div style={{ fontSize: spiny ? 20 : 16, fontWeight: 900, marginTop: 4 }}>
              {spiny ? '🏭 DELIVER TO SPINY TAIL PROCESSING' : `📦 ${data.deliver_to?.label}`}
            </div>
            {!spiny && data.deliver_to?.name && (
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>
                {data.deliver_to.name}{data.deliver_to.phone ? ` · ${data.deliver_to.phone}` : ''}
              </div>
            )}
          </div>

          {/* Items — name, SKU, qty, COST */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#000', color: '#fff' }}>
                <th style={{ ...th, width: 36, textAlign: 'center' }}>☐</th>
                <th style={th}>Product</th>
                <th style={{ ...th, width: 110 }}>SKU</th>
                <th style={{ ...th, textAlign: 'right', width: 70 }}>Qty</th>
                <th style={{ ...th, textAlign: 'right', width: 90 }}>Cost / unit</th>
              </tr>
            </thead>
            <tbody>
              {t.items.map((it, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #ccc' }}>
                  <td style={{ ...td, textAlign: 'center', fontSize: 18 }}>☐</td>
                  <td style={{ ...td, fontWeight: 700 }}>{it.name}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{it.sku}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 900 }}>{it.qty}{it.unit ? ` ${it.unit}` : ''}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(it.cost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #000' }}>
                <td style={td} /><td style={td} /><td style={td} />
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>Total cost</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 900 }}>{money(t.total_cost)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Driver confirmation sign-off (Phase 4 makes this an in-app tap) */}
          <div style={{ marginTop: 22, paddingTop: 14, borderTop: '2px solid #000' }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
              DRIVER: confirm product name + SKU + cost above match the supplier invoice, then sign.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div><div style={refLabel}>Driver signature</div><div style={{ borderBottom: '1px solid #000', height: 28, marginTop: 4 }} /></div>
              <div><div style={refLabel}>Date / time confirmed</div><div style={{ borderBottom: '1px solid #000', height: 28, marginTop: 4 }} /></div>
            </div>
          </div>
        </div>
      ))}

      <style>{`@media print { body { background:#fff !important; } .no-print { display:none !important; } }`}</style>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>{children}</div>;
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#fff', padding: 20, fontFamily: "'Inter', system-ui, sans-serif", color: '#000' };
const card: React.CSSProperties = { background: '#fff', maxWidth: 700, margin: '0 auto 20px', padding: 24, border: '2px solid #000' };
const topBar: React.CSSProperties = { maxWidth: 700, margin: '0 auto 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#475569' };
const printBtn: React.CSSProperties = { background: '#000', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 800, fontSize: 12, cursor: 'pointer' };
const refBox: React.CSSProperties = { background: '#f5f5f5', padding: 12, border: '1px solid #ccc' };
const refLabel: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 1 };
const th: React.CSSProperties = { padding: '8px 6px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 };
const td: React.CSSProperties = { padding: '8px 6px' };
