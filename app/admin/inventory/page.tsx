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

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { supabase as supaAuth } from '@/lib/supabase';

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
  stock_count:          number | null;
  low_stock_threshold:  number | null;
  // Joined / computed
  supplier_name?:       string | null;
  cost_per_unit?:       number | null;
  nassau_price?:        number | null;
  andros_price?:        number | null;
  online_price?:        number | null;
  wholesale_price?:     number | null;
}

type ChannelKey = 'nassau' | 'andros' | 'online' | 'wholesale';

const CATEGORY_OPTIONS = [
  'fresh_seafood', 'frozen_seafood', 'meat', 'frozen_meat',
  'produce', 'grocery', 'spices', 'dry_goods', 'beverages',
] as const;

export default function AdminInventoryPage() {
  const [rows, setRows]       = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filterSupplier, setFilterSupplier] = useState<string>('');
  const [filterStatus, setFilterStatus]     = useState<string>('active');
  const [error, setError]     = useState<string | null>(null);

  // Phase 2 + 3 — inline edit state. `editingCell` = { id, field } so
  // only ONE cell across the table is in edit mode at a time.
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  // Phase 3 — bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function clearSelection() { setSelectedIds(new Set()); }
  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  }

  async function callPatch(productId: string, body: Record<string, unknown>) {
    const { data: { session } } = await supaAuth.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not signed in');
    const res = await fetch(`/api/admin/products/${productId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json as { ok: true; new_prices?: Record<string, number>; updated_fields: string[] };
  }

  // Generic cell-save dispatcher — branches on field
  async function saveCell(row: ProductRow, field: string, rawValue: string) {
    setEditingCell(null);
    let parsedValue: unknown = rawValue;

    if (field === 'cost_per_unit' || field === 'stock_count') {
      const num = Number(rawValue);
      if (!Number.isFinite(num) || num < 0) {
        showToast(false, `${field} must be a non-negative number`);
        return;
      }
      if (field === 'cost_per_unit' && num <= 0) {
        showToast(false, 'Cost must be > 0'); return;
      }
      parsedValue = num;
    }
    if (field === 'name') {
      if (!rawValue.trim()) { showToast(false, 'Name cannot be empty'); return; }
      parsedValue = rawValue.trim();
    }
    // No-op shortcut
    if (parsedValue === (row as unknown as Record<string, unknown>)[field]) return;

    setSavingId(row.id);
    try {
      const res = await callPatch(row.id, { [field]: parsedValue });
      setRows((prev) => prev.map((r) => {
        if (r.id !== row.id) return r;
        const updated = { ...r, [field]: parsedValue } as ProductRow;
        // Cost cascade — also update the per-channel prices from the API response
        if (field === 'cost_per_unit' && res.new_prices) {
          updated.nassau_price    = res.new_prices.nassau_pos      ?? updated.nassau_price;
          updated.andros_price    = res.new_prices.andros_pos      ?? updated.andros_price;
          updated.online_price    = res.new_prices.online_market   ?? updated.online_price;
          updated.wholesale_price = res.new_prices.local_wholesale ?? updated.wholesale_price;
        }
        return updated;
      }));
      const niceField = field.replace(/_/g, ' ');
      showToast(true,
        field === 'cost_per_unit'
          ? `Cost saved → channel prices auto-updated`
          : `${niceField} saved`,
      );
    } catch (err) {
      showToast(false, `Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingId(null);
    }
  }

  // Bulk action — archive / channel-flip across all selected rows
  async function bulkApply(patch: Record<string, unknown>, summary: string) {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setSavingId('__bulk__');
    try {
      const { data: { session } } = await supaAuth.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/admin/products/bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ ids, patch }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);

      // Update local rows
      setRows((prev) => prev.map((r) =>
        selectedIds.has(r.id) ? { ...r, ...(patch as Partial<ProductRow>) } : r
      ));
      // If status flipped to archived → also drop them from view if filter is "active"
      if (patch.status === 'archived' && filterStatus === 'active') {
        setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
      }
      clearSelection();
      showToast(true, `${json.updated_count} rows · ${summary}`);
    } catch (err) {
      showToast(false, `Bulk failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingId(null);
    }
  }

  async function toggleChannel(row: ProductRow, channel: ChannelKey) {
    const key = `sell_${channel === 'nassau' ? 'nassau' : channel === 'andros' ? 'andros' : channel === 'online' ? 'online' : 'wholesale'}` as const;
    const current = row[key] as boolean;
    setSavingId(row.id);
    // Optimistic flip
    setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, [key]: !current } : r));
    try {
      await callPatch(row.id, { [key]: !current });
      showToast(true, `${row.sku} · ${channel} ${!current ? 'ON' : 'OFF'}`);
    } catch (err) {
      // Revert
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, [key]: current } : r));
      showToast(false, `Toggle failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingId(null);
    }
  }

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
            image_url, primary_supplier_id, stock_count, low_stock_threshold,
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
              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-navy bg-navy-50/30 px-2 py-1">
                  <span className="text-xs font-bold text-navy">
                    {selectedIds.size} selected
                  </span>
                  <button
                    onClick={() => bulkApply({ sell_online: true }, '→ on /market')}
                    disabled={savingId === '__bulk__'}
                    className="rounded bg-emerald-500 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    On /market
                  </button>
                  <button
                    onClick={() => bulkApply({ sell_online: false }, '→ off /market')}
                    disabled={savingId === '__bulk__'}
                    className="rounded bg-slate-500 px-2 py-1 text-[11px] font-bold text-white hover:bg-slate-600 disabled:opacity-50"
                  >
                    Off /market
                  </button>
                  <button
                    onClick={() => bulkApply({ status: 'archived' }, 'archived')}
                    disabled={savingId === '__bulk__'}
                    className="rounded bg-red-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Archive
                  </button>
                  <button
                    onClick={clearSelection}
                    className="rounded border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-slate-500"
                  >
                    Clear
                  </button>
                </div>
              )}
              <Link
                href="/supplier"
                className="rounded-lg bg-gold px-4 py-2 text-sm font-extrabold text-navy hover:bg-gold-300 transition"
              >
                + Add Row
              </Link>
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

      {/* Phase 2 — save toast (top-right corner, auto-dismiss) */}
      {toast && (
        <div
          className={`fixed right-4 top-20 z-50 max-w-sm rounded-xl border-2 px-4 py-3 text-sm font-bold shadow-xl transition ${
            toast.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          {toast.ok ? '✅ ' : '⚠ '}{toast.msg}
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
                  <Th align="center">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(filtered.map((r) => r.id)));
                        else clearSelection();
                      }}
                      aria-label="Select all visible"
                    />
                  </Th>
                  <Th>SKU</Th>
                  <Th>Photo</Th>
                  <Th sticky>Name</Th>
                  <Th>Supplier <span className="text-[9px] opacity-60">(internal)</span></Th>
                  <Th>Category</Th>
                  <Th>UoM</Th>
                  <Th>Size</Th>
                  <Th align="right">Stock</Th>
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
                {filtered.map((r) => {
                  const isCellEditing = (f: string) => editingCell?.id === r.id && editingCell?.field === f;
                  const startEdit = (f: string, currentVal: string | number | null | undefined) => {
                    setEditingValue(currentVal != null ? String(currentVal) : '');
                    setEditingCell({ id: r.id, field: f });
                  };
                  const lowStock =
                    r.stock_count != null && r.stock_count >= 0 &&
                    (r.stock_count === 0 || (r.low_stock_threshold != null && r.stock_count <= r.low_stock_threshold));
                  return (
                  <tr key={r.id} className={`hover:bg-slate-50 ${selectedIds.has(r.id) ? 'bg-navy-50/30' : ''}`}>
                    <Td align="center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        aria-label={`Select ${r.sku}`}
                      />
                    </Td>
                    <Td><span className="font-mono">{r.sku}</span></Td>
                    <Td>
                      {r.image_url
                        ? <img src={r.image_url} alt="" className="h-9 w-9 rounded object-cover" />
                        : <span className="inline-flex h-9 w-9 items-center justify-center rounded bg-slate-100 text-base">📦</span>}
                    </Td>
                    <Td sticky>
                      {isCellEditing('name') ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => saveCell(r, 'name', editingValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')  saveCell(r, 'name', editingValue);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="w-48 rounded border border-navy bg-yellow-50 px-1 py-0.5 text-xs font-semibold"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit('name', r.name)}
                          disabled={savingId === r.id}
                          className="text-left rounded px-1 font-semibold text-navy hover:bg-amber-100 hover:ring-1 hover:ring-amber-300 disabled:opacity-50"
                          title="Click to edit name"
                        >
                          {r.name}
                        </button>
                      )}
                      {r.description && <div className="text-[10px] text-slate-500">{r.description}</div>}
                    </Td>
                    <Td>{r.supplier_name ?? <span className="text-red-600">— none —</span>}</Td>
                    <Td>
                      {isCellEditing('category') ? (
                        <select
                          autoFocus
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => saveCell(r, 'category', editingValue)}
                          className="rounded border border-navy bg-yellow-50 px-1 py-0.5 text-xs font-bold"
                        >
                          {CATEGORY_OPTIONS.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit('category', r.category)}
                          disabled={savingId === r.id}
                          className="rounded px-1 hover:bg-amber-100 hover:ring-1 hover:ring-amber-300 cursor-pointer disabled:opacity-50"
                          title="Click to change category"
                        >
                          {r.category}
                        </button>
                      )}
                    </Td>
                    <Td>{r.unit_of_measure}</Td>
                    <Td>{r.pack_size ?? '—'}</Td>
                    <Td align="right">
                      {isCellEditing('stock_count') ? (
                        <input
                          autoFocus
                          type="number"
                          step="1"
                          min="0"
                          inputMode="numeric"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => saveCell(r, 'stock_count', editingValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')  saveCell(r, 'stock_count', editingValue);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="w-16 rounded border border-navy bg-yellow-50 px-1 py-0.5 text-right text-xs font-bold"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit('stock_count', r.stock_count)}
                          disabled={savingId === r.id}
                          className={`rounded px-1 font-bold hover:bg-amber-100 hover:ring-1 hover:ring-amber-300 disabled:opacity-50 ${
                            r.stock_count == null ? 'text-slate-400 italic font-normal' :
                            r.stock_count === 0   ? 'text-red-600' :
                            lowStock              ? 'text-amber-600' :
                                                    'text-emerald-700'
                          }`}
                          title={
                            r.stock_count == null ? 'Not tracked. Click to set.' :
                            r.stock_count === 0   ? 'OUT OF STOCK. Click to update.' :
                            lowStock              ? 'LOW STOCK. Click to update.' :
                                                    'Click to update stock count'
                          }
                        >
                          {r.stock_count == null ? '—' : r.stock_count}
                        </button>
                      )}
                    </Td>
                    <Td>{r.vat_category === 'uncooked_food' ? '0%' : r.vat_category === 'cooked_prepared' ? '10%' : '—'}</Td>
                    <Td align="right">
                      {isCellEditing('cost_per_unit') ? (
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => saveCell(r, 'cost_per_unit', editingValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')  saveCell(r, 'cost_per_unit', editingValue);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="w-20 rounded border border-navy bg-yellow-50 px-1 py-0.5 text-right text-xs font-bold"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit('cost_per_unit', r.cost_per_unit)}
                          disabled={savingId === r.id}
                          className="rounded px-1 hover:bg-amber-100 hover:ring-1 hover:ring-amber-300 cursor-pointer disabled:opacity-50"
                          title="Click to edit cost — channel prices auto-update"
                        >
                          {fmtPrice(r.cost_per_unit)}
                        </button>
                      )}
                    </Td>
                    <Td align="right">{fmtPrice(r.nassau_price)}</Td>
                    <Td align="right">{fmtPrice(r.andros_price)}</Td>
                    <Td align="right">{fmtPrice(r.online_price)}</Td>
                    <Td align="right">{fmtPrice(r.wholesale_price)}</Td>
                    <Td align="center">
                      <ChannelToggle row={r} channel="nassau"    label="N" onToggle={toggleChannel} saving={savingId === r.id} />
                      <ChannelToggle row={r} channel="andros"    label="A" onToggle={toggleChannel} saving={savingId === r.id} />
                      <ChannelToggle row={r} channel="online"    label="O" onToggle={toggleChannel} saving={savingId === r.id} />
                      <ChannelToggle row={r} channel="wholesale" label="W" onToggle={toggleChannel} saving={savingId === r.id} />
                    </Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        r.status === 'active'   ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'archived' ? 'bg-slate-200 text-slate-700'    :
                                                   'bg-amber-100 text-amber-700'
                      }`}>{r.status}</span>
                    </Td>
                  </tr>
                  );
                })}
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
  // Read-only legacy. Kept for any non-editable callers.
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

function ChannelToggle({
  row, channel, label, onToggle, saving,
}: {
  row:      ProductRow;
  channel:  ChannelKey;
  label:    string;
  onToggle: (r: ProductRow, c: ChannelKey) => void;
  saving:   boolean;
}) {
  const on =
    channel === 'nassau'    ? row.sell_nassau    :
    channel === 'andros'    ? row.sell_andros    :
    channel === 'online'    ? row.sell_online    :
                              row.sell_wholesale;
  const title =
    channel === 'nassau'    ? 'Nassau POS' :
    channel === 'andros'    ? 'Andros POS' :
    channel === 'online'    ? 'Online'     :
                              'Wholesale';
  return (
    <button
      type="button"
      onClick={() => onToggle(row, channel)}
      disabled={saving}
      title={`${title} — click to ${on ? 'disable' : 'enable'}`}
      className={`mx-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition hover:scale-110 disabled:opacity-50 ${
        on ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-slate-200 text-slate-400 hover:bg-slate-300'
      }`}
    >
      {label}
    </button>
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
