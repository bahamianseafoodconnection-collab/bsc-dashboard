'use client';

// app/dashboard/snapshot.tsx
//
// New dashboard widgets dropped into the Overview tab:
//   - Today's revenue split per channel (Nassau / Andros / Online / Wholesale)
//   - Top products by revenue (last 30 days)
//   - Low stock alerts (inventory <= reorder_level)
//   - Expenses + open invoices due in the next 7 days
//
// Self-contained: pulls its own data, handles its own loading/errors,
// every query is wrapped so a missing table can't kill the whole panel.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { parseOrderItems } from '@/lib/order-items';

const NAVY = '#1a2e5a';
const GOLD = '#f4c842';

type ChannelSlice = { label: string; channel: string; revenue: number; profit: number; color: string };
type TopProduct = { name: string; qty: number; revenue: number };
type LowStock = { id: string; name: string; quantity: number; reorder_level: number };
type DueItem = { id: string; description: string; amount: number; due_date: string | null; source: 'expense' | 'invoice' };

const CHANNEL_MARGIN: Record<string, number> = {
  pos_sale_nassau: 0.38,
  pos_sale_andros: 0.43,
  online_market:   0.25,
  wholesale:       0.15,
};

const CHANNEL_DISPLAY: { key: string; label: string; color: string }[] = [
  { key: 'pos_sale_nassau', label: '🟡 Nassau', color: '#fef9e7' },
  { key: 'pos_sale_andros', label: '🟣 Andros', color: '#f5f0ff' },
  { key: 'online_market',   label: '🛒 Online', color: '#e8f4fd' },
  { key: 'wholesale',       label: '📦 Wholesale', color: '#f0fde8' },
];

function fmtBSD(n: number) { return `BSD $${n.toFixed(2)}`; }

function todayMidnightIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function thirtyDaysAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}
function sevenDaysFromTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export default function DashboardSnapshot() {
  const [slices, setSlices] = useState<ChannelSlice[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [dueSoon, setDueSoon] = useState<DueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const todayIso = todayMidnightIso();
      const thirtyAgoIso = thirtyDaysAgoIso();
      const todayDate = todayIso.slice(0, 10);
      const sevenIso = sevenDaysFromTodayIso();

      // Fire all queries in parallel; tolerate any single failure.
      const [todayOrders, thirtyOrders, inventoryRes, productsRes, expensesRes, invoicesRes] =
        await Promise.all([
          supabase
            .from('orders')
            .select('order_type, total, wholesale_cost_total')
            .gte('created_at', todayIso)
            .limit(500)
            .then((r) => r.data || []),
          supabase
            .from('orders')
            .select('wholesale_items, total, wholesale_cost_total')
            .gte('created_at', thirtyAgoIso)
            .limit(2000)
            .then((r) => r.data || []),
          supabase
            .from('inventory')
            .select('id, quantity, reorder_level, product_id')
            .not('reorder_level', 'is', null)
            .limit(500)
            .then((r) => r.data || []),
          supabase
            .from('products')
            .select('id, name')
            .limit(2000)
            .then((r) => r.data || []),
          supabase
            .from('expenses')
            .select('id, description, amount_bsd, due_date')
            .is('paid_at', null)
            .or(`due_date.lte.${sevenIso},and(due_date.lt.${todayDate})`)
            .limit(50)
            .then((r) => r.data || []),
          supabase
            .from('purchase_invoices')
            .select('id, invoice_ref, summary, balance_owed, due_date')
            .gt('balance_owed', 0)
            .limit(50)
            .then((r) => r.data || []),
        ]);

      if (cancelled) return;

      // ─── Channel slices for today ───
      const slicesAcc: Record<string, { revenue: number; profit: number }> = {};
      for (const o of todayOrders) {
        const ot = String((o as Record<string, unknown>).order_type || '');
        const total = Number((o as Record<string, unknown>).total ?? 0);
        const cost = Number((o as Record<string, unknown>).wholesale_cost_total ?? 0);
        const rev = total || cost;
        const margin =
          ot === 'pos_sale_nassau' ? CHANNEL_MARGIN.pos_sale_nassau :
          ot === 'pos_sale_andros' ? CHANNEL_MARGIN.pos_sale_andros :
          ot === 'online_market'   ? CHANNEL_MARGIN.online_market :
          ot === 'wholesale'       ? CHANNEL_MARGIN.wholesale : 0;
        // BSC profit excl VAT for sale channels (back out the 10% VAT)
        const grossExclVat = rev / 1.10;
        const profit = grossExclVat * margin;
        const acc = slicesAcc[ot] || { revenue: 0, profit: 0 };
        acc.revenue += rev;
        acc.profit += profit;
        slicesAcc[ot] = acc;
      }
      const slicesOut: ChannelSlice[] = CHANNEL_DISPLAY.map((c) => ({
        label: c.label,
        channel: c.key,
        revenue: slicesAcc[c.key]?.revenue || 0,
        profit: slicesAcc[c.key]?.profit || 0,
        color: c.color,
      }));
      setSlices(slicesOut);

      // ─── Top products (last 30 days) ───
      const productAcc = new Map<string, { qty: number; revenue: number }>();
      for (const o of thirtyOrders) {
        const items = parseOrderItems((o as Record<string, unknown>).wholesale_items);
        for (const it of items) {
          const name = (it.name || '').trim() || 'Unknown';
          const qty = Number(it.qty || 0);
          const lineTotal = Number(it.line_total ?? (it.unit_price || 0) * qty);
          const acc = productAcc.get(name) || { qty: 0, revenue: 0 };
          acc.qty += qty;
          acc.revenue += lineTotal;
          productAcc.set(name, acc);
        }
      }
      const top = Array.from(productAcc.entries())
        .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
      setTopProducts(top);

      // ─── Low stock ───
      const productNameMap = new Map<string, string>();
      for (const p of productsRes) {
        const r = p as Record<string, unknown>;
        productNameMap.set(String(r.id), String(r.name || 'Unknown'));
      }
      const lowOut: LowStock[] = [];
      for (const inv of inventoryRes) {
        const r = inv as Record<string, unknown>;
        const qty = Number(r.quantity ?? 0);
        const reorder = Number(r.reorder_level ?? 0);
        if (reorder > 0 && qty <= reorder) {
          lowOut.push({
            id: String(r.id),
            name: productNameMap.get(String(r.product_id)) || 'Unknown',
            quantity: qty,
            reorder_level: reorder,
          });
        }
      }
      setLowStock(lowOut.slice(0, 8));

      // ─── Due soon (expenses overdue or in next 7d, plus open invoices) ───
      const due: DueItem[] = [];
      for (const e of expensesRes) {
        const r = e as Record<string, unknown>;
        due.push({
          id: `e-${r.id}`,
          description: String(r.description || ''),
          amount: Number(r.amount_bsd || 0),
          due_date: (r.due_date as string) ?? null,
          source: 'expense',
        });
      }
      for (const inv of invoicesRes) {
        const r = inv as Record<string, unknown>;
        due.push({
          id: `i-${r.id}`,
          description: String(r.summary || r.invoice_ref || 'PO invoice'),
          amount: Number(r.balance_owed || 0),
          due_date: (r.due_date as string) ?? null,
          source: 'invoice',
        });
      }
      due.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
      setDueSoon(due.slice(0, 6));

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
      {/* Channel split */}
      <Card title="Today by channel">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
          }}
        >
          {slices.map((s) => (
            <div
              key={s.channel}
              style={{
                background: s.color,
                borderRadius: 12,
                padding: '10px 12px',
              }}
            >
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, color: NAVY, marginTop: 2 }}>
                {fmtBSD(s.revenue)}
              </div>
              <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>
                +{fmtBSD(s.profit)} profit
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Top products + Low stock side-by-side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Top products · 30 days">
          {loading ? (
            <Empty text="Loading…" />
          ) : topProducts.length === 0 ? (
            <Empty text="No sales yet." />
          ) : (
            topProducts.map((p) => (
              <Row key={p.name} primary={p.name} secondary={`${p.qty} units`} value={fmtBSD(p.revenue)} />
            ))
          )}
        </Card>
        <Card title={`Low stock${lowStock.length > 0 ? ` · ${lowStock.length}` : ''}`} accent={lowStock.length > 0 ? '#f87171' : undefined}>
          {loading ? (
            <Empty text="Loading…" />
          ) : lowStock.length === 0 ? (
            <Empty text="✅ All stocked" green />
          ) : (
            lowStock.map((l) => (
              <Row
                key={l.id}
                primary={l.name}
                secondary={`reorder at ${l.reorder_level}`}
                value={`${l.quantity} left`}
                valueColor="#f87171"
              />
            ))
          )}
        </Card>
      </div>

      {/* Due soon */}
      <Card
        title={`Due in 7 days${dueSoon.length > 0 ? ` · ${dueSoon.length}` : ''}`}
        right={
          <Link
            href="/accounts-payable"
            style={{
              fontSize: 11,
              color: NAVY,
              fontWeight: 700,
              textDecoration: 'none',
              background: '#f0f4ff',
              padding: '4px 10px',
              borderRadius: 6,
            }}
          >
            View all →
          </Link>
        }
      >
        {loading ? (
          <Empty text="Loading…" />
        ) : dueSoon.length === 0 ? (
          <Empty text="✅ Nothing due this week" green />
        ) : (
          dueSoon.map((d) => (
            <Row
              key={d.id}
              primary={d.description}
              secondary={`${d.source === 'expense' ? '🧾 expense' : '📦 PO invoice'}${d.due_date ? ` · due ${d.due_date}` : ''}`}
              value={fmtBSD(d.amount)}
              valueColor={d.due_date && d.due_date < new Date().toISOString().slice(0, 10) ? '#f87171' : GOLD}
            />
          ))
        )}
      </Card>
    </div>
  );
}

/* helpers */


/* primitives */

function Card({ title, children, right, accent }: { title: string; children: React.ReactNode; right?: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 16,
        padding: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        borderLeft: accent ? `4px solid ${accent}` : undefined,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
        }}
      >
        <h3 style={{ fontSize: 13, fontWeight: 900, color: NAVY, margin: 0 }}>
          {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function Row({ primary, secondary, value, valueColor }: { primary: string; secondary: string; value: string; valueColor?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '6px 0',
        borderBottom: '1px solid #f1f5f9',
      }}
    >
      <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {primary}
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8' }}>{secondary}</div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 900, color: valueColor || NAVY }}>{value}</div>
    </div>
  );
}

function Empty({ text, green }: { text: string; green?: boolean }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '14px 0',
        color: green ? '#16a34a' : '#94a3b8',
        fontSize: 12,
      }}
    >
      {text}
    </div>
  );
}
