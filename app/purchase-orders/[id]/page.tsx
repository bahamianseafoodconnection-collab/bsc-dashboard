'use client';

// app/purchase-orders/[id]/page.tsx
//
// Supplier-facing purchase order — a printable document that drives the
// supplier transfer. Mirrors the pick-ticket print pattern: lazy shared
// supabase singleton, force-dynamic, window.print(), B/W office-doc card.
//
// Flow it supports: open the PO → see exactly what to buy + the total →
// call the supplier to confirm availability → make the bank transfer →
// record the transfer reference here, which flips the PO to 'paid'.
//
// Reads purchase_orders by id + purchase_order_items by po_id (both
// browser-readable under RLS, same as the list page). Supplier contact is
// pulled from suppliers so whoever runs the PO can reach them.
//
// The "record transfer" action requires the real bank transfer reference —
// never a placeholder. This keeps the supplier-payment audit trail honest,
// the same discipline as the customer-side reconcile.

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type PORow = {
  id: string;
  order_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  total: number | null;
  status: string | null;
  payment_status: string | null;
  payment_ref: string | null;
  payment_date: string | null;
  notes: string | null;
  created_at: string;
  currency: string | null;
};

type POItemRow = {
  id: string;
  product_id: string | null;
  units_ordered: number | null;
  weight_lb: number | null;
  unit_cost: number | null;
  total_cost: number | null;
};

type SupplierRow = {
  id: string;
  name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_whatsapp: string | null;
};

type ProductRow = { id: string; name: string | null; sku: string | null };

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const poId = params?.id;

  const [po, setPo] = useState<PORow | null>(null);
  const [items, setItems] = useState<POItemRow[]>([]);
  const [supplier, setSupplier] = useState<SupplierRow | null>(null);
  const [products, setProducts] = useState<Map<string, ProductRow>>(new Map());
  const [loading, setLoading] = useState(true);

  // Record-transfer UI state.
  const [transferRef, setTransferRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!poId) { setLoading(false); return; }
    setLoading(true);

    const { data: poData } = await supabase
      .from('purchase_orders')
      .select('id, order_id, supplier_id, supplier_name, total, status, payment_status, payment_ref, payment_date, notes, created_at, currency')
      .eq('id', poId)
      .maybeSingle();

    const poRow = (poData as PORow) ?? null;
    setPo(poRow);

    if (poRow) {
      const { data: itemData } = await supabase
        .from('purchase_order_items')
        .select('id, product_id, units_ordered, weight_lb, unit_cost, total_cost')
        .eq('po_id', poRow.id);
      const itemRows = (itemData as POItemRow[]) ?? [];
      setItems(itemRows);

      // Supplier contact (for the availability call).
      if (poRow.supplier_id) {
        const { data: supData } = await supabase
          .from('suppliers')
          .select('id, name, contact_name, contact_phone, contact_email, contact_whatsapp')
          .eq('id', poRow.supplier_id)
          .maybeSingle();
        setSupplier((supData as SupplierRow) ?? null);
      }

      // Product names + SKUs for the line items.
      const pids = [...new Set(itemRows.map((r) => r.product_id).filter(Boolean) as string[])];
      if (pids.length > 0) {
        const { data: prodData } = await supabase
          .from('products')
          .select('id, name, sku')
          .in('id', pids);
        const map = new Map<string, ProductRow>();
        for (const p of (prodData as ProductRow[]) ?? []) map.set(p.id, p);
        setProducts(map);
      }
    }

    setLoading(false);
  }, [poId]);

  useEffect(() => { load(); }, [load]);

  const recordTransfer = useCallback(async () => {
    if (!po) return;
    const ref = transferRef.trim();
    if (!ref) { setSaveMsg('Enter the bank transfer reference first.'); return; }
    setSaving(true);
    setSaveMsg(null);
    const { error } = await supabase
      .from('purchase_orders')
      .update({ payment_status: 'paid', payment_ref: ref, payment_date: new Date().toISOString() })
      .eq('id', po.id);
    setSaving(false);
    if (error) { setSaveMsg(`Could not record transfer: ${error.message}`); return; }
    setTransferRef('');
    setSaveMsg('Transfer recorded — PO marked paid.');
    load();
  }, [po, transferRef, load]);

  if (loading) return <Centered>Loading purchase order…</Centered>;
  if (!po) return <Centered>Purchase order not found.</Centered>;

  const poNo = `PO-${po.id.slice(0, 8).toUpperCase()}`;
  const orderNo = po.order_id ? `ORD-${po.order_id.slice(0, 8).toUpperCase()}` : '—';
  const currency = po.currency || 'BSD';
  const isPaid = (po.payment_status || '').toLowerCase() === 'paid';
  const computedTotal = items.reduce((s, it) => s + Number(it.total_cost ?? 0), 0);
  const total = po.total != null ? Number(po.total) : computedTotal;

  return (
    <div style={pgStyle}>
      <div className="no-print" style={topBarStyle}>
        <span>Purchase order {poNo}</span>
        <button onClick={() => window.print()} style={printBtnStyle}>🖨 Print</button>
      </div>

      <div style={cardStyle}>
        {/* Header */}
        <div style={{ borderBottom: '3px solid #000', paddingBottom: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#000', letterSpacing: 1 }}>
            PURCHASE ORDER
          </div>
          <div style={{ fontSize: 12, color: '#000', marginTop: 4, fontWeight: 700 }}>
            Bahamian Seafood Connection · Nassau
          </div>
        </div>

        {/* References */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div style={refBox}>
            <div style={refLabel}>PO #</div>
            <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace' }}>{poNo}</div>
          </div>
          <div style={refBox}>
            <div style={refLabel}>From order</div>
            <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace' }}>{orderNo}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 14, fontSize: 12 }}>
          <div>
            <div style={refLabel}>Created</div>
            <div style={{ fontWeight: 700 }}>{fmtDate(po.created_at)}</div>
          </div>
          <div>
            <div style={refLabel}>Status</div>
            <div style={{ fontWeight: 700 }}>{(po.status || '—').toUpperCase()}</div>
          </div>
          <div>
            <div style={refLabel}>Payment</div>
            <div style={{ fontWeight: 900, color: isPaid ? '#15803d' : '#b91c1c' }}>
              {(po.payment_status || 'unpaid').toUpperCase()}
            </div>
          </div>
        </div>

        {/* Supplier — who to contact + pay */}
        <div style={{ background: '#f5f5f5', border: '2px solid #000', padding: 14, borderRadius: 4, marginBottom: 14 }}>
          <div style={refLabel}>Supplier</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#000', marginTop: 2 }}>
            {supplier?.name || po.supplier_name || '—'}
          </div>
          {(supplier?.contact_name || supplier?.contact_phone || supplier?.contact_email || supplier?.contact_whatsapp) && (
            <div style={{ fontSize: 12, color: '#000', marginTop: 6, fontWeight: 600, lineHeight: 1.5 }}>
              {supplier?.contact_name && <div>{supplier.contact_name}</div>}
              {supplier?.contact_phone && <div>☎ {supplier.contact_phone}</div>}
              {supplier?.contact_whatsapp && <div>WhatsApp: {supplier.contact_whatsapp}</div>}
              {supplier?.contact_email && <div>✉ {supplier.contact_email}</div>}
            </div>
          )}
        </div>

        {/* Line items — exactly what to buy */}
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>ITEMS TO PURCHASE</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {items.length} line{items.length === 1 ? '' : 's'}
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
                <th style={thStyle}>Item</th>
                <th style={{ ...thStyle, textAlign: 'left', width: 100 }}>SKU</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 80 }}>Qty</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 90 }}>Unit cost</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 90 }}>Line total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const prod = it.product_id ? products.get(it.product_id) : undefined;
                const qtyLabel =
                  it.weight_lb != null ? `${it.weight_lb} lb`
                  : it.units_ordered != null ? `${it.units_ordered}`
                  : '—';
                return (
                  <tr key={it.id} style={{ borderBottom: '1px solid #ccc' }}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{prod?.name || 'Item'}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{prod?.sku || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900 }}>{qtyLabel}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(it.unit_cost)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{money(it.total_cost)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #000' }}>
                <td style={{ ...tdStyle, fontWeight: 900 }} colSpan={4}>TOTAL TO TRANSFER</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 900, fontSize: 16 }}>
                  {currency} {money(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* Record-transfer — screen only, hidden on print */}
        <div className="no-print" style={{ marginTop: 20, paddingTop: 14, borderTop: '2px solid #000' }}>
          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>RECORD TRANSFER TO SUPPLIER</div>
          {isPaid ? (
            <div style={{ fontSize: 13, color: '#15803d', fontWeight: 700 }}>
              ✓ Paid — transfer ref {po.payment_ref || '—'}
              {po.payment_date ? ` · ${fmtDate(po.payment_date)}` : ''}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
                After you confirm availability and make the bank transfer, enter the
                bank transfer reference to mark this PO paid. Use the real reference —
                never a placeholder.
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={transferRef}
                  onChange={(e) => setTransferRef(e.target.value)}
                  placeholder="Bank transfer reference"
                  style={inputStyle}
                />
                <button onClick={recordTransfer} disabled={saving} style={confirmBtnStyle}>
                  {saving ? 'Saving…' : 'Mark paid'}
                </button>
              </div>
            </>
          )}
          {saveMsg && (
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: saveMsg.startsWith('Transfer recorded') ? '#15803d' : '#b91c1c' }}>
              {saveMsg}
            </div>
          )}
        </div>

        {/* Print-only authorization lines */}
        <div style={{ marginTop: 24, paddingTop: 14, borderTop: '2px solid #000', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={refLabel}>Ordered by</div>
            <div style={{ borderBottom: '1px solid #000', height: 28, marginTop: 4 }} />
          </div>
          <div>
            <div style={refLabel}>Received by</div>
            <div style={{ borderBottom: '1px solid #000', height: 28, marginTop: 4 }} />
          </div>
        </div>

        {po.notes && (
          <div style={{ fontSize: 11, color: '#666', marginTop: 12 }}>{po.notes}</div>
        )}
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

function money(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toFixed(2);
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
const confirmBtnStyle: React.CSSProperties = { background: '#15803d', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 800, fontSize: 12, cursor: 'pointer' };
const inputStyle: React.CSSProperties = { flex: 1, minWidth: 180, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 };
const refBox: React.CSSProperties = { background: '#f5f5f5', padding: 12, border: '1px solid #ccc' };
const refLabel: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 1 };
const thStyle: React.CSSProperties = { padding: '8px 6px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 };
const tdStyle: React.CSSProperties = { padding: '8px 6px' };
