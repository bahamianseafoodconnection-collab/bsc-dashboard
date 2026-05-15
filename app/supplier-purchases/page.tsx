'use client';

// app/supplier-purchases/page.tsx
//
// "What to buy from each supplier next." Aggregates the items sold across
// every channel (POS Nassau, POS Andros, online checkout, wholesale)
// over a date range, joins each line item to its products.primary_supplier_id,
// and groups by supplier.
//
// Workflow: BSC sells today → tomorrow this page tells you exactly what
// quantities to buy from each supplier to restock. "Generate PO" creates
// a draft purchase_orders row pre-filled with the items so the
// /purchase-orders page can finalize and send.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';

export const dynamic = 'force-dynamic';

type Order = {
  id: string;
  created_at: string;
  order_type: string;
  wholesale_items: unknown;
};
type Product = {
  id: string;
  name: string;
  sku: string | null;
  primary_supplier_id: string | null;
  cost_per_unit: number | null;
  unit_of_measure: string | null;
};
type Supplier = {
  // Mirrors public.suppliers schema (name = canonical, contact_* fields).
  id: string;
  name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
};
type LineItem = {
  product_id?: string;
  sku?: string;
  name?: string;
  qty?: number;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  cost_per_unit?: number;
};

type ProductRollup = {
  product_id: string;
  name: string;
  sku: string | null;
  unit: string;
  qty_sold: number;
  cost_each: number;
  cost_total: number;
};

type SupplierRollup = {
  supplier_id: string;
  // Display name (from suppliers.name with fallback to contact_name).
  // Field name kept as `business_name` for backward compat with the
  // already-rendered JSX further down.
  business_name: string;
  contact_name: string | null;
  phone: string | null;     // sourced from suppliers.contact_phone
  email: string | null;     // sourced from suppliers.contact_email
  products: ProductRollup[];
  total_cost: number;
  total_units: number;
};

type Range = 'today' | 'yesterday' | '7d' | '30d';

function isoStartOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function isoNDaysAgo(n: number) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n);
  return d.toISOString();
}
function isoYesterdayStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1);
  return d.toISOString();
}

function rangeBounds(r: Range): { from: string; to: string; label: string } {
  if (r === 'today')     return { from: isoStartOfToday(),       to: new Date().toISOString(), label: 'today' };
  if (r === 'yesterday') return { from: isoYesterdayStart(),     to: isoStartOfToday(),        label: 'yesterday' };
  if (r === '7d')        return { from: isoNDaysAgo(7),          to: new Date().toISOString(), label: 'last 7 days' };
  return                       { from: isoNDaysAgo(30),         to: new Date().toISOString(), label: 'last 30 days' };
}

function parseItems(raw: unknown): LineItem[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  return raw as LineItem[];
}

export default function SupplierPurchasesPage() {
  const [range, setRange] = useState<Range>('today');
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const [suppliers, setSuppliers] = useState<Map<string, Supplier>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setGenResult(null);
    const { from, to } = rangeBounds(range);

    const { data: orderRows, error: orderErr } = await supabase
      .from('orders')
      .select('id, created_at, order_type, wholesale_items')
      .gte('created_at', from)
      .lte('created_at', to)
      .limit(2000);
    if (orderErr) {
      setError(plainError(orderErr));
      setOrders([]);
      setLoading(false);
      return;
    }
    const orderList = (orderRows || []) as Order[];
    setOrders(orderList);

    // Pull every distinct product_id seen in this range
    const productIds = new Set<string>();
    for (const o of orderList) {
      for (const it of parseItems(o.wholesale_items)) {
        if (it.product_id) productIds.add(it.product_id);
      }
    }

    if (productIds.size === 0) {
      setProducts(new Map());
      setSuppliers(new Map());
      setLoading(false);
      return;
    }

    const { data: prodRows } = await supabase
      .from('products')
      .select('id, name, sku, primary_supplier_id, cost_per_unit, unit_of_measure')
      .in('id', Array.from(productIds));
    const prodMap = new Map<string, Product>();
    for (const p of (prodRows || []) as Product[]) prodMap.set(p.id, p);
    setProducts(prodMap);

    const supplierIds = new Set<string>();
    for (const p of prodMap.values()) {
      if (p.primary_supplier_id) supplierIds.add(p.primary_supplier_id);
    }

    if (supplierIds.size > 0) {
      const { data: supRows } = await supabase
        .from('suppliers')
        .select('id, name, contact_name, contact_phone, contact_email')
        .in('id', Array.from(supplierIds));
      const supMap = new Map<string, Supplier>();
      for (const s of (supRows || []) as Supplier[]) supMap.set(s.id, s);
      setSuppliers(supMap);
    } else {
      setSuppliers(new Map());
    }

    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range]);

  // ─── Aggregate by supplier ────────────────────────────────────────
  const grouped = useMemo<SupplierRollup[]>(() => {
    type Inner = Map<string, ProductRollup>;
    const bySupplier = new Map<string, Inner>();
    let unmatched: ProductRollup[] = [];

    for (const o of orders) {
      const items = parseItems(o.wholesale_items);
      for (const it of items) {
        const qty = Number(it.qty ?? it.quantity ?? 0);
        if (!qty || qty <= 0) continue;
        const pid = it.product_id;
        if (!pid) {
          // Unmatched (likely a wholesale-source item with no product_id)
          const key = `nopid:${it.name || 'unknown'}`;
          const fake: ProductRollup = {
            product_id: key,
            name: it.name || 'Unknown',
            sku: it.sku ?? null,
            unit: it.unit ?? 'unit',
            qty_sold: qty,
            cost_each: Number(it.cost_per_unit ?? 0),
            cost_total: Number(it.cost_per_unit ?? 0) * qty,
          };
          unmatched.push(fake);
          continue;
        }
        const product = products.get(pid);
        if (!product) continue;
        const supplierId = product.primary_supplier_id;
        if (!supplierId) {
          // No supplier on the product — treat as BSC-direct, skip
          continue;
        }

        const inner = bySupplier.get(supplierId) ?? new Map<string, ProductRollup>();
        const existing = inner.get(pid);
        const costEach = Number(product.cost_per_unit ?? it.cost_per_unit ?? 0);
        if (existing) {
          existing.qty_sold += qty;
          existing.cost_total += costEach * qty;
        } else {
          inner.set(pid, {
            product_id: pid,
            name: product.name,
            sku: product.sku,
            unit: product.unit_of_measure || it.unit || 'unit',
            qty_sold: qty,
            cost_each: costEach,
            cost_total: costEach * qty,
          });
        }
        bySupplier.set(supplierId, inner);
      }
    }

    // Collapse duplicate unmatched rows
    const unmatchedMap = new Map<string, ProductRollup>();
    for (const u of unmatched) {
      const ex = unmatchedMap.get(u.name);
      if (ex) {
        ex.qty_sold += u.qty_sold;
        ex.cost_total += u.cost_total;
      } else {
        unmatchedMap.set(u.name, { ...u });
      }
    }
    unmatched = Array.from(unmatchedMap.values());

    const rollups: SupplierRollup[] = Array.from(bySupplier.entries()).map(
      ([supplierId, inner]) => {
        const supplier = suppliers.get(supplierId);
        const productsList = Array.from(inner.values()).sort(
          (a, b) => b.cost_total - a.cost_total
        );
        const total_cost = productsList.reduce((s, p) => s + p.cost_total, 0);
        const total_units = productsList.reduce((s, p) => s + p.qty_sold, 0);
        return {
          supplier_id: supplierId,
          business_name:
            supplier?.name ||
            supplier?.contact_name ||
            `Supplier ${supplierId.slice(0, 6)}`,
          contact_name: supplier?.contact_name ?? null,
          phone: supplier?.contact_phone ?? null,
          email: supplier?.contact_email ?? null,
          products: productsList,
          total_cost,
          total_units,
        };
      }
    );
    rollups.sort((a, b) => b.total_cost - a.total_cost);

    if (unmatched.length > 0) {
      const total_cost = unmatched.reduce((s, p) => s + p.cost_total, 0);
      const total_units = unmatched.reduce((s, p) => s + p.qty_sold, 0);
      rollups.push({
        supplier_id: '',
        business_name: '⚠ No supplier linked (BSC direct or wholesale items)',
        contact_name: null,
        phone: null,
        email: null,
        products: unmatched.sort((a, b) => b.cost_total - a.cost_total),
        total_cost,
        total_units,
      });
    }

    return rollups;
  }, [orders, products, suppliers]);

  const grandTotal = grouped.reduce((s, g) => s + g.total_cost, 0);
  const totalUnits = grouped.reduce((s, g) => s + g.total_units, 0);

  async function generatePO(s: SupplierRollup) {
    if (!s.supplier_id || s.products.length === 0) return;
    setGenerating(s.supplier_id);
    setGenResult(null);

    const items = s.products.map((p) => ({
      name: p.name,
      cases: p.qty_sold,
      unitDescription: p.unit,
      totalLbs: 0,
      costPerCase: p.cost_each,
      totalCost: p.cost_total,
    }));
    const payload: Record<string, unknown> = {
      supplier_name: s.business_name,
      ai_summary: `Auto-generated from ${rangeBounds(range).label} sales — ${s.total_units} units across ${s.products.length} SKUs`,
      items: JSON.stringify(items),
      total_cost: Number(s.total_cost.toFixed(2)),
      retail_physical: 0,
      retail_online: 0,
      wholesale_physical: 0,
      wholesale_online: 0,
      status: 'allocated',
      allocated_by: 'auto-from-sales',
      processing_status: 'awaiting_processing',
      weight_in_lbs: 0,
      weight_out_lbs: 0,
      yield_pct: 0,
      true_cost_per_lb: 0,
    };

    const { error: err } = await supabase.from('purchase_orders').insert(payload);
    setGenerating(null);
    if (err) {
      setGenResult(`PO generation failed for ${s.business_name}: ${err.message}`);
      return;
    }
    setGenResult(
      `✓ Draft PO created for ${s.business_name} ($${s.total_cost.toFixed(2)}). Open /purchase-orders to send it.`
    );
  }

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0 }}>
        Supplier purchase queue
      </h1>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>
        What you sold by supplier — buy this back from them next.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {(
          [
            ['today',     'Today'],
            ['yesterday', 'Yesterday'],
            ['7d',        '7 days'],
            ['30d',       '30 days'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setRange(k)}
            style={{
              ...filterPillStyle,
              background: range === k ? '#f5c518' : '#1e2d4a',
              color: range === k ? '#060d1f' : '#cbd5e1',
            }}
          >{label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        <Stat label="Suppliers to pay" value={String(grouped.filter((g) => g.supplier_id).length)} />
        <Stat label="Total units" value={totalUnits.toFixed(0)} />
        <Stat label="Total cost" value={`$${grandTotal.toFixed(2)}`} />
      </div>

      {loading && <p style={{ color: '#94a3b8' }}>Loading…</p>}

      {!loading && error && (
        <ErrorBox text={`orders: ${error}`} />
      )}

      {genResult && (
        <div
          style={{
            background: 'rgba(74,222,128,0.1)',
            border: '1px solid #4ade80',
            borderRadius: 10,
            padding: '10px 12px',
            color: '#4ade80',
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 10,
          }}
        >
          {genResult}
        </div>
      )}

      {!loading && !error && grouped.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
          No sales in {rangeBounds(range).label}. Nothing to buy.
        </div>
      )}

      {grouped.map((g) => (
        <div key={g.supplier_id || 'unmatched'} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{g.business_name}</div>
              {(g.phone || g.email) && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {[g.phone, g.email].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#f5c518' }}>
                ${g.total_cost.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                {g.total_units} units · {g.products.length} SKU{g.products.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            {g.products.map((p) => (
              <div
                key={p.product_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  padding: '6px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  fontSize: 12,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: '#cbd5e1', fontWeight: 600 }}>{p.name}</div>
                  {p.sku && (
                    <div style={{ color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}>{p.sku}</div>
                  )}
                </div>
                <div style={{ color: '#fff', textAlign: 'right' }}>
                  {p.qty_sold} {p.unit}
                  {p.cost_each > 0 && (
                    <span style={{ color: '#94a3b8', marginLeft: 8 }}>
                      × ${p.cost_each.toFixed(2)} = <span style={{ color: '#f5c518', fontWeight: 800 }}>${p.cost_total.toFixed(2)}</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {g.supplier_id && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => generatePO(g)}
                disabled={generating === g.supplier_id}
                style={{
                  background: generating === g.supplier_id ? '#4b5563' : '#f5c518',
                  color: '#060d1f',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontWeight: 900,
                  fontSize: 12,
                  cursor: generating === g.supplier_id ? 'not-allowed' : 'pointer',
                }}
              >
                {generating === g.supplier_id ? 'Generating…' : '+ Draft PO'}
              </button>
              {g.phone && (
                <a
                  href={`https://wa.me/${g.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: '#25D366',
                    color: '#fff',
                    borderRadius: 8,
                    padding: '8px 14px',
                    fontWeight: 800,
                    fontSize: 12,
                    textDecoration: 'none',
                  }}
                >
                  💬 WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
      ))}

      <div style={{ marginTop: 14, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
        Items without a primary_supplier_id won&rsquo;t appear here — set the supplier on a product in /products to include it.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: '#f5c518', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
      ⚠️ {text}
    </div>
  );
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 720, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 10 };
const filterPillStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 999, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
