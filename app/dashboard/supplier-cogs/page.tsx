'use client';

// /dashboard/supplier-cogs
//
// What BSC owes each supplier based on what got sold, plus what to
// buy from each supplier next. Three sections reading from the
// supplier_cogs_* views shipped on 2026-06-02:
//
//   1. Per-supplier payables summary  → supplier_payables_summary
//      (lifetime + today / 7d / 30d totals)
//   2. After-each-sale feed           → supplier_cogs_per_sale
//      (every order × supplier credited, filtered by date)
//   3. Reorder list                    → supplier_reorder_list
//      (products grouped by supplier, sorted by stock low → high)
//
// Each section has its own CSV export. Admin-gated client-side (the
// views themselves are also REVOKEd from anon).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);

type SummaryRow = {
  supplier_id:            string | null;
  supplier_name:          string;
  days_active:            number | null;
  lifetime_orders:        number | null;
  lifetime_units_sold:    number | null;
  lifetime_cogs_owed_bsd: number | null;
  lifetime_revenue_bsd:   number | null;
  cogs_owed_today_bsd:    number | null;
  cogs_owed_7d_bsd:       number | null;
  cogs_owed_30d_bsd:      number | null;
  last_sale_date:         string | null;
};

type SaleRow = {
  order_id:      string;
  created_at:    string;
  sale_date:     string;
  order_type:    string | null;
  customer_name: string | null;
  supplier_id:   string | null;
  supplier_name: string;
  line_count:    number;
  units_sold:    number;
  cogs_owed_bsd: number;
  revenue_bsd:   number | null;
  product_names: string[];
};

type ReorderRow = {
  supplier_id:        string | null;
  supplier_name:      string;
  product_id:         string;
  sku:                string | null;
  product_name:       string;
  unit_of_measure:    string | null;
  stock_on_hand:      number;
  current_cost_bsd:   number | null;
  stock_status:       'out' | 'low' | 'monitor' | 'ok';
  last_product_update: string | null;
};

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const STATUS_COLOR: Record<ReorderRow['stock_status'], { bg: string; fg: string; label: string }> = {
  out:     { bg: '#7f1d1d', fg: '#fecaca', label: 'OUT' },
  low:     { bg: '#9a3412', fg: '#fed7aa', label: 'LOW' },
  monitor: { bg: '#92400e', fg: '#fde68a', label: 'WATCH' },
  ok:      { bg: '#14532d', fg: '#bbf7d0', label: 'OK' },
};

export default function SupplierCogsPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [allowed, setAllowed]         = useState(false);

  const [summary,  setSummary]  = useState<SummaryRow[]>([]);
  const [sales,    setSales]    = useState<SaleRow[]>([]);
  const [reorder,  setReorder]  = useState<ReorderRow[]>([]);

  const [feedDate, setFeedDate] = useState(isoDateOffset(0));
  const [reorderFilter, setReorderFilter] = useState<'low_out' | 'all'>('low_out');

  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Auth gate
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAuthChecked(true); setAllowed(false); return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      const role = (prof as { role?: string } | null)?.role ?? '';
      setAllowed(ADMIN_ROLES.has(role));
      setAuthChecked(true);
    })();
  }, []);

  // Load summary + reorder once; sales depend on feedDate
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        // Sequential rather than Promise.all so we know WHICH view
        // failed when one does. Previous "Load failed" string hid
        // the real cause (RLS, missing grant, column rename, etc.).
        const sumRes = await supabase.from('supplier_payables_summary').select('*');
        if (sumRes.error) throw new Error(`supplier_payables_summary: ${sumRes.error.message}`);
        const reoRes = await supabase.from('supplier_reorder_list').select('*');
        if (reoRes.error) throw new Error(`supplier_reorder_list: ${reoRes.error.message}`);
        if (cancelled) return;
        setSummary((sumRes.data ?? []) as SummaryRow[]);
        setReorder((reoRes.data ?? []) as ReorderRow[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [allowed]);

  // Sales feed reloads when feedDate changes
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from('supplier_cogs_per_sale')
        .select('*')
        .eq('sale_date', feedDate)
        .order('created_at', { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (err) { setError(err.message); return; }
      setSales((data ?? []) as SaleRow[]);
    })();
    return () => { cancelled = true; };
  }, [allowed, feedDate]);

  // Reorder filter
  const reorderFiltered = useMemo(() => {
    if (reorderFilter === 'all') return reorder;
    return reorder.filter((r) => r.stock_status === 'out' || r.stock_status === 'low');
  }, [reorder, reorderFilter]);

  // Group reorder by supplier
  const reorderBySupplier = useMemo(() => {
    const map = new Map<string, ReorderRow[]>();
    for (const r of reorderFiltered) {
      const key = r.supplier_name;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [reorderFiltered]);

  // Totals for the summary header
  const totals = useMemo(() => {
    return summary.reduce((acc, r) => ({
      today:    acc.today + Number(r.cogs_owed_today_bsd || 0),
      d7:       acc.d7    + Number(r.cogs_owed_7d_bsd    || 0),
      d30:      acc.d30   + Number(r.cogs_owed_30d_bsd   || 0),
      lifetime: acc.lifetime + Number(r.lifetime_cogs_owed_bsd || 0),
    }), { today: 0, d7: 0, d30: 0, lifetime: 0 });
  }, [summary]);

  const salesTotal = useMemo(() => sales.reduce((s, r) => s + Number(r.cogs_owed_bsd || 0), 0), [sales]);

  if (!authChecked) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Loading…</div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-xl font-black text-navy mb-2">Admin only</h1>
          <p className="text-sm text-slate-600 mb-4">Supplier COGS is restricted to founder, co-founder, manager, control admin, and basic admin roles.</p>
          <Link href="/dashboard" className="inline-block rounded-lg bg-navy px-4 py-2 text-sm font-bold text-gold">← Back to dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link href="/dashboard" className="text-sm font-bold text-gold hover:underline">← BSC Control</Link>
          <h1 className="text-base font-extrabold text-white sm:text-lg">Supplier COGS</h1>
          <span className="text-xs text-white/60">{summary.length} suppliers · {sales.length} sales today</span>
        </div>
      </header>

      <main className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6 sm:py-8 space-y-8">

        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">⚠️ {error}</div>
        )}

        {/* ── Totals strip ───────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Owed today',     value: totals.today,    color: '#dc2626' },
            { label: 'Owed (7 days)',  value: totals.d7,       color: '#ea580c' },
            { label: 'Owed (30 days)', value: totals.d30,      color: '#0369a1' },
            { label: 'Lifetime COGS',  value: totals.lifetime, color: '#0f172a' },
          ].map((m) => (
            <div key={m.label} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-100">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{m.label}</div>
              <div className="mt-1 font-display text-2xl font-black" style={{ color: m.color }}>${fmtMoney(m.value)}</div>
              <div className="text-[10px] text-slate-400">BSD</div>
            </div>
          ))}
        </section>

        {/* ── Per-supplier payables summary ──────────────────────────── */}
        <section className="rounded-2xl bg-white shadow-card ring-1 ring-slate-100 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-display text-lg font-black text-navy">What BSC owes — per supplier</h2>
              <p className="text-xs text-slate-500">Pay each supplier based on what got sold. Sorted by 30-day COGS.</p>
            </div>
            <button
              onClick={() => downloadCsv(summary as unknown as Record<string, unknown>[], `bsc-supplier-payables-${isoDateOffset(0)}.csv`)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              ⬇ CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Supplier</th>
                  <th className="px-4 py-2 text-right">Today</th>
                  <th className="px-4 py-2 text-right">7d</th>
                  <th className="px-4 py-2 text-right">30d</th>
                  <th className="px-4 py-2 text-right">Lifetime</th>
                  <th className="px-4 py-2 text-right">Units</th>
                  <th className="px-4 py-2 text-right">Last sale</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>
                )}
                {!loading && summary.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No supplier sales yet.</td></tr>
                )}
                {summary.map((r) => (
                  <tr key={r.supplier_id ?? r.supplier_name} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-bold text-navy">{r.supplier_name}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-red-700">${fmtMoney(r.cogs_owed_today_bsd)}</td>
                    <td className="px-4 py-2 text-right font-mono text-orange-700">${fmtMoney(r.cogs_owed_7d_bsd)}</td>
                    <td className="px-4 py-2 text-right font-mono text-sky-700">${fmtMoney(r.cogs_owed_30d_bsd)}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-slate-900">${fmtMoney(r.lifetime_cogs_owed_bsd)}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{fmtNum(r.lifetime_units_sold, 0)}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{r.last_sale_date ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── After-each-sale feed ───────────────────────────────────── */}
        <section className="rounded-2xl bg-white shadow-card ring-1 ring-slate-100 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-display text-lg font-black text-navy">After each sale — who&apos;s owed</h2>
              <p className="text-xs text-slate-500">Every sale on this date × each supplier credited. Sorted newest first.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={feedDate}
                onChange={(e) => setFeedDate(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              />
              <button
                onClick={() => downloadCsv(sales as unknown as Record<string, unknown>[], `bsc-sales-cogs-${feedDate}.csv`)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                ⬇ CSV
              </button>
            </div>
          </div>
          <div className="px-5 py-2 text-xs text-slate-500 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span>{sales.length} sale-supplier rows on {feedDate}</span>
            <span className="font-bold text-slate-700">Total owed: <span className="font-mono">${fmtMoney(salesTotal)}</span></span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Time</th>
                  <th className="px-4 py-2 text-left">Order</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Supplier</th>
                  <th className="px-4 py-2 text-left">Products</th>
                  <th className="px-4 py-2 text-right">Units</th>
                  <th className="px-4 py-2 text-right">Revenue</th>
                  <th className="px-4 py-2 text-right">Owed</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">No sales on this date.</td></tr>
                )}
                {sales.map((r) => (
                  <tr key={`${r.order_id}-${r.supplier_id ?? 'none'}`} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{fmtTime(r.created_at)}</td>
                    <td className="px-4 py-2 text-slate-500 font-mono text-xs">{r.order_id.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-slate-700">{r.customer_name ?? '—'}</td>
                    <td className="px-4 py-2 font-bold text-navy">{r.supplier_name}</td>
                    <td className="px-4 py-2 text-slate-600 text-xs">
                      {Array.isArray(r.product_names) ? r.product_names.slice(0, 3).join(' · ') : ''}
                      {Array.isArray(r.product_names) && r.product_names.length > 3 ? ` +${r.product_names.length - 3} more` : ''}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600 font-mono">{fmtNum(r.units_sold)}</td>
                    <td className="px-4 py-2 text-right text-slate-600 font-mono">${fmtMoney(r.revenue_bsd)}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-red-700">${fmtMoney(r.cogs_owed_bsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Reorder list ───────────────────────────────────────────── */}
        <section className="rounded-2xl bg-white shadow-card ring-1 ring-slate-100 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-display text-lg font-black text-navy">What to purchase — by supplier</h2>
              <p className="text-xs text-slate-500">Products grouped by supplier, sorted by stock (lowest first). Default view = low + out only.</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={reorderFilter}
                onChange={(e) => setReorderFilter(e.target.value as 'low_out' | 'all')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <option value="low_out">Low + Out only</option>
                <option value="all">All active products</option>
              </select>
              <button
                onClick={() => downloadCsv(reorderFiltered as unknown as Record<string, unknown>[], `bsc-reorder-list-${isoDateOffset(0)}.csv`)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                ⬇ CSV
              </button>
            </div>
          </div>
          <div className="px-5 py-2 text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
            {reorderFiltered.length} product{reorderFiltered.length === 1 ? '' : 's'} across {reorderBySupplier.length} supplier{reorderBySupplier.length === 1 ? '' : 's'}
          </div>
          {reorderBySupplier.length === 0 && (
            <div className="px-5 py-8 text-center text-slate-500 text-sm">Nothing flagged.</div>
          )}
          {reorderBySupplier.map(([supplierName, rows]) => (
            <div key={supplierName} className="border-t border-slate-100">
              <div className="bg-slate-50 px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
                <span>{supplierName}</span>
                <span className="text-slate-400 font-mono">{rows.length} product{rows.length === 1 ? '' : 's'}</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((r) => {
                    const c = STATUS_COLOR[r.stock_status];
                    return (
                      <tr key={r.product_id} className="border-t border-slate-100">
                        <td className="px-4 py-2 w-16">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-extrabold" style={{ backgroundColor: c.bg, color: c.fg }}>{c.label}</span>
                        </td>
                        <td className="px-4 py-2 text-slate-700">{r.product_name}</td>
                        <td className="px-4 py-2 text-slate-400 font-mono text-xs">{r.sku ?? ''}</td>
                        <td className="px-4 py-2 text-right text-slate-600 font-mono whitespace-nowrap">
                          {fmtNum(r.stock_on_hand)} <span className="text-slate-400 text-xs">{r.unit_of_measure ?? ''}</span>
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500 font-mono whitespace-nowrap">
                          {r.current_cost_bsd != null ? `cost $${fmtMoney(r.current_cost_bsd)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
