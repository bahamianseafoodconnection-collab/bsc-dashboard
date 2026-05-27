'use client';

// /admin/inventory
//
// Live inventory spreadsheet — founder direction 2026-05-27:
// "the very same excel spreadsheet information display needs to be
// saved and used for updating, adding products to various channel
// needs to be implemented in my dashboard for adding more items and
// editing."
//
// Mirrors the column layout of Fresh Inventory List.xlsx so it's
// instantly familiar to the founder. One row per product. Inline
// edits autosave per cell. Channel toggles are clickable. Cost-edit
// flows through the existing /api/inventory/receive endpoint so the
// recalc trigger fires and per-channel prices update everywhere.
//
// Phase 1 (this commit): full read-only display + search + nav.
// Phase 2 (next commit): cell-level inline edit (cost, channel
// toggles, name) with autosave.
// Phase 3 (future): bulk select, bulk channel-flip, paste-from-Excel.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export const dynamic = 'force-dynamic';

interface ProductRow {
  id:                   string;
  sku:                  string;
  name:                 string;
  description:          string | null;
  category:             string | null;
  unit_of_measure:      string | null;
  pack_size:            string | null;
  vat_category:         string | null;
  status:               string | null;
  sell_nassau:          boolean;
  sell_andros:          boolean;
  sell_online:          boolean;
  sell_wholesale:       boolean;
  image_url:            string | null;
  primary_supplier_id:  string | null;
  // Joined / computed
  supplier_name?:       string | null;
  cost_per_unit?:       number | null;
  nassau_price?:        number | null;
  andros_price?:        number | null;
  online_price?:        number | null;
  wholesale_price?:     number | null;
}

type ChannelKey = 'nassau' | 'andros' | 'online' | 'wholesale';

export default function AdminInventoryPage() {
  const [rows, setRows]       = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filterSupplier, setFilterSupplier] = useState<string>('');
  const [filterStatus, setFilterStatus]     = useState<string>('active');
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Pull products + supplier name in one go
        const { data: products, error: prodErr } = await supabase
          .from('products')
          .select(`
            id, sku, name, description, category, unit_of_measure, pack_size,
            vat_category, status, sell_nassau, sell_andros, sell_online, sell_wholesale,
            image_url, primary_supplier_id,
            suppliers:primary_supplier_id ( name )
          `)
          .eq('status', filterStatus)
          .order('sku');

        if (prodErr) throw prodErr;

        const ids = (products ?? []).map((p) => p.id);
        if (ids.length === 0) {
          if (!cancelled) { setRows([]); setLoading(false); }
          return;
        }

        // Pull current costs + per-channel prices in parallel
        const [costsRes, pricesRes] = await Promise.all([
          supabase.from('product_costs')
            .select('product_id, cost_per_unit')
            .eq('is_current', true)
            .in('product_id', ids),
          supabase.from('product_pricing')
            .select('product_id, channel, manual_unit_price')
            .eq('is_current', true)
            .in('product_id', ids),
        ]);

        const costMap = new Map<string, number>();
        for (const c of (costsRes.data ?? []) as Array<{ product_id: string; cost_per_unit: number | null }>) {
          if (c.cost_per_unit !== null) costMap.set(c.product_id, c.cost_per_unit);
        }
        const priceMap = new Map<string, Map<string, number>>();
        for (const p of (pricesRes.data ?? []) as Array<{ product_id: string; channel: string; manual_unit_price: number | null }>) {
          if (p.manual_unit_price === null) continue;
          let inner = priceMap.get(p.product_id);
          if (!inner) { inner = new Map(); priceMap.set(p.product_id, inner); }
          inner.set(p.channel, p.manual_unit_price);
        }

        type RawSupplierJoin = { name?: string | null } | { name?: string | null }[] | null;
        const merged: ProductRow[] = (products ?? []).map((p) => {
          const sj = (p as unknown as { suppliers: RawSupplierJoin }).suppliers;
          const supplier_name = Array.isArray(sj) ? sj[0]?.name ?? null : sj?.name ?? null;
          const inner = priceMap.get(p.id);
          return {
            ...(p as ProductRow),
            supplier_name,
            cost_per_unit:    costMap.get(p.id) ?? null,
            nassau_price:     inner?.get('nassau_pos')      ?? null,
            andros_price:     inner?.get('andros_pos')      ?? null,
            online_price:     inner?.get('online_market')   ?? null,
            wholesale_price:  inner?.get('local_wholesale') ?? null,
          };
        });

        if (!cancelled) {
          setRows(merged);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filterStatus]);

  // Distinct supplier list for filter dropdown
  const suppliers = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) {
      if (r.supplier_name && r.primary_supplier_id) {
        set.set(r.primary_supplier_id, r.supplier_name);
      }
    }
    return Array.from(set, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  // Filter rows
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterSupplier && r.primary_supplier_id !== filterSupplier) return false;
      if (!q) return true;
      return (
        r.sku.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.supplier_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, filterSupplier]);

  // Quick stats summary at the top
  const stats = useMemo(() => {
    const n = filtered.length;
    const onlineN  = filtered.filter((r) => r.sell_online).length;
    const noPhoto  = filtered.filter((r) => !r.image_url).length;
    const noCost   = filtered.filter((r) => r.cost_per_unit == null).length;
    const noPrice  = filtered.filter((r) =>
      r.nassau_price == null && r.andros_price == null && r.online_price == null && r.wholesale_price == null
    ).length;
    return { n, onlineN, noPhoto, noCost, noPrice };
  }, [filtered]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-screen-2xl px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link href="/dashboard" className="text-xs font-semibold text-slate-500 hover:text-navy">← Dashboard</Link>
                <span className="text-slate-300">·</span>
                <h1 className="font-display text-lg font-extrabold text-navy sm:text-xl">📊 Inventory Spreadsheet</h1>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Live data from <span className="font-mono">products</span> + <span className="font-mono">product_costs</span> + <span className="font-mono">product_pricing</span>.
                Mirrors your Fresh Inventory List.xlsx columns. Read-only Phase 1 — inline edit ships next.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled
                title="Inline edit ships in Phase 2 — for now use /supplier Add Product modal"
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-bold text-slate-500 cursor-not-allowed"
              >
                + Add Row (Phase 2)
              </button>
            </div>
          </div>

          {/* Stats strip */}
          {!loading && (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
              <Pill label="Showing" value={stats.n} />
              <Pill label="On /market" value={stats.onlineN} tone="green" />
              <Pill label="No photo" value={stats.noPhoto} tone={stats.noPhoto > 0 ? 'amber' : 'slate'} />
              <Pill label="No cost"  value={stats.noCost}  tone={stats.noCost > 0 ? 'red' : 'slate'} />
              <Pill label="No price" value={stats.noPrice} tone={stats.noPrice > 0 ? 'red' : 'slate'} />
            </div>
          )}

          {/* Filter row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, name, supplier…"
              className="h-9 min-w-[200px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-navy"
            />
            <select
              value={filterSupplier}
              onChange={(e) => setFilterSupplier(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-navy outline-none focus:border-navy"
            >
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-navy outline-none focus:border-navy"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="discontinued">Discontinued</option>
              <option value="draft">Draft</option>
              <option value="pending_approval">Pending approval</option>
            </select>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto mt-4 max-w-screen-2xl rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          ⚠ {error}
        </div>
      )}

      <main className="mx-auto max-w-screen-2xl px-3 py-4 sm:px-6">
        {loading ? (
          <p className="py-12 text-center text-sm text-slate-500">Loading inventory…</p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">No products match the current filter.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-xs">
              <thead className="bg-navy text-white sticky top-0">
                <tr>
                  <Th>SKU</Th>
                  <Th>Photo</Th>
                  <Th sticky>Name</Th>
                  <Th>Supplier <span className="text-[9px] opacity-60">(internal)</span></Th>
                  <Th>Category</Th>
                  <Th>UoM</Th>
                  <Th>Size</Th>
                  <Th>VAT</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">Nassau POS</Th>
                  <Th align="right">Andros POS</Th>
                  <Th align="right">Online</Th>
                  <Th align="right">Wholesale</Th>
                  <Th align="center">Channels</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td><span className="font-mono">{r.sku}</span></Td>
                    <Td>
                      {r.image_url
                        ? <img src={r.image_url} alt="" className="h-9 w-9 rounded object-cover" />
                        : <span className="inline-flex h-9 w-9 items-center justify-center rounded bg-slate-100 text-base">📦</span>}
                    </Td>
                    <Td sticky>
                      <div className="font-semibold text-navy">{r.name}</div>
                      {r.description && <div className="text-[10px] text-slate-500">{r.description}</div>}
                    </Td>
                    <Td>{r.supplier_name ?? <span className="text-red-600">— none —</span>}</Td>
                    <Td>{r.category}</Td>
                    <Td>{r.unit_of_measure}</Td>
                    <Td>{r.pack_size ?? '—'}</Td>
                    <Td>{r.vat_category === 'uncooked_food' ? '0%' : r.vat_category === 'cooked_prepared' ? '10%' : '—'}</Td>
                    <Td align="right">{fmtPrice(r.cost_per_unit)}</Td>
                    <Td align="right">{fmtPrice(r.nassau_price)}</Td>
                    <Td align="right">{fmtPrice(r.andros_price)}</Td>
                    <Td align="right">{fmtPrice(r.online_price)}</Td>
                    <Td align="right">{fmtPrice(r.wholesale_price)}</Td>
                    <Td align="center">
                      <ChannelDot on={r.sell_nassau}    label="N" />
                      <ChannelDot on={r.sell_andros}    label="A" />
                      <ChannelDot on={r.sell_online}    label="O" />
                      <ChannelDot on={r.sell_wholesale} label="W" />
                    </Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        r.status === 'active'   ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'archived' ? 'bg-slate-200 text-slate-700'    :
                                                   'bg-amber-100 text-amber-700'
                      }`}>{r.status}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

/* ─────────────── UI primitives ─────────────── */

function Th({ children, sticky, align = 'left' }: { children: React.ReactNode; sticky?: boolean; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className={`px-3 py-2 text-${align} text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
        sticky ? 'sticky left-0 bg-navy z-10' : ''
      }`}
    >
      {children}
    </th>
  );
}
function Td({ children, sticky, align = 'left' }: { children: React.ReactNode; sticky?: boolean; align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      className={`px-3 py-2 text-${align} whitespace-nowrap ${
        sticky ? 'sticky left-0 bg-white z-10' : ''
      }`}
    >
      {children}
    </td>
  );
}
function ChannelDot({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      title={label === 'N' ? 'Nassau POS' : label === 'A' ? 'Andros POS' : label === 'O' ? 'Online' : 'Wholesale'}
      className={`mx-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
        on ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
      }`}
    >
      {label}
    </span>
  );
}
function Pill({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'green' | 'amber' | 'red' }) {
  const palette =
    tone === 'green' ? 'bg-emerald-100 text-emerald-800' :
    tone === 'amber' ? 'bg-amber-100  text-amber-800'   :
    tone === 'red'   ? 'bg-red-100    text-red-800'     :
                       'bg-slate-100  text-slate-700';
  return (
    <span className={`rounded-full px-2.5 py-0.5 ${palette}`}>
      {label}: <span className="font-extrabold">{value}</span>
    </span>
  );
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${n.toFixed(2)}`;
}
