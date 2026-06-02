'use client';

// /dashboard/daily-sales
//
// Product-sold report — aggregated per supplier per product. Each
// day shows: for every supplier that moved product, a list of the
// products sold (qty + cost + product total + revenue) and a
// supplier subtotal. Grand totals at the bottom.
//
// Reads via /api/dashboard/daily-sales-report (service-role) so
// the broken supplier_* views + qc enum-cast issue never fire.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type ProductAgg = {
  product_id:    string | null;
  product_name:  string;
  sku:           string;
  qty:           number;
  unit:          string;
  cost_per_unit: number | null;
  total_cost:    number;
  revenue:       number;
};
type SupplierAgg = {
  supplier_id:   string | null;
  supplier_name: string;
  total_cost:    number;
  total_revenue: number;
  product_count: number;
  products:      ProductAgg[];
};
type Totals = { revenue: number; cogs: number; supplier_count: number; product_count: number; order_count: number };

function bahamasToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Nassau' });
}

function fmt(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export default function DailySalesPage() {
  const [date,      setDate]      = useState(bahamasToday());
  const [suppliers, setSuppliers] = useState<SupplierAgg[]>([]);
  const [totals,    setTotals]    = useState<Totals>({ revenue: 0, cogs: 0, supplier_count: 0, product_count: 0, order_count: 0 });
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError('Sign in required'); return; }
        const res = await fetch(`/api/dashboard/daily-sales-report?date=${date}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok || !j.ok) { setError(j.error || `HTTP ${res.status}`); return; }
        setSuppliers((j.suppliers ?? []) as SupplierAgg[]);
        setTotals(j.totals as Totals);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date]);

  // Flat CSV of every (supplier, product) row + a supplier-total row
  // after each group + a grand-total row at the bottom.
  function downloadCsv() {
    if (suppliers.length === 0) return;
    const headers = ['Supplier', 'Product', 'SKU', 'Qty', 'Unit', 'Cost / unit', 'Product total', 'Revenue'];
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [headers.join(',')];
    for (const sup of suppliers) {
      for (const p of sup.products) {
        lines.push([sup.supplier_name, p.product_name, p.sku, p.qty, p.unit, p.cost_per_unit ?? '', p.total_cost, p.revenue].map(escape).join(','));
      }
      lines.push([sup.supplier_name, '— SUPPLIER TOTAL —', '', '', '', '', sup.total_cost, sup.total_revenue].map(escape).join(','));
    }
    lines.push(['', 'GRAND TOTAL', '', '', '', '', totals.cogs, totals.revenue].map(escape).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `bsc-product-sold-report-${date}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link href="/dashboard" className="text-sm font-bold text-gold hover:underline">← BSC Control</Link>
          <h1 className="text-base font-extrabold text-white sm:text-lg">Product-Sold Report</h1>
          <span className="text-xs text-white/60">{totals.supplier_count} supplier{totals.supplier_count === 1 ? '' : 's'} · {totals.product_count} product{totals.product_count === 1 ? '' : 's'}</span>
        </div>
      </header>

      <main className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
        {/* Date picker + CSV */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
            />
            <button onClick={() => setDate(bahamasToday())} className="text-xs font-bold text-slate-600 hover:text-navy underline">today</button>
          </div>
          <button
            onClick={downloadCsv}
            disabled={suppliers.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            ⬇ CSV
          </button>
        </div>

        {/* Totals strip */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-100">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Revenue</div>
            <div className="mt-1 font-display text-2xl font-black text-navy">${fmt(totals.revenue)}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-100 border-l-4 border-red-500">
            <div className="text-[10px] font-bold uppercase tracking-wider text-red-700">COGS (owed)</div>
            <div className="mt-1 font-display text-2xl font-black text-red-700">${fmt(totals.cogs)}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-100 border-l-4 border-emerald-500">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Profit (rough)</div>
            <div className="mt-1 font-display text-2xl font-black text-emerald-700">${fmt(totals.revenue - totals.cogs)}</div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">⚠️ {error}</div>
        )}

        {loading && (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-card">Loading…</div>
        )}

        {!loading && !error && suppliers.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-card">No sales on this date.</div>
        )}

        {/* One section per supplier */}
        {suppliers.map((sup) => (
          <div key={sup.supplier_id ?? sup.supplier_name} className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-100">
            <div className="flex items-center justify-between gap-3 bg-navy px-5 py-3 text-white">
              <div className="font-extrabold text-base">🏷 {sup.supplier_name}</div>
              <div className="flex items-baseline gap-3">
                <span className="text-[10px] uppercase tracking-wider text-white/60">Supplier total</span>
                <span className="font-mono font-black text-lg text-gold">${fmt(sup.total_cost)}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Product</th>
                    <th className="px-4 py-2 text-right">Qty sold</th>
                    <th className="px-4 py-2 text-right">Cost / unit</th>
                    <th className="px-4 py-2 text-right">Product total</th>
                    <th className="px-4 py-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {sup.products.map((p) => (
                    <tr key={(p.product_id ?? p.product_name) + sup.supplier_name} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-900">
                        <div className="font-bold">{p.product_name}</div>
                        {p.sku && <div className="text-[10px] font-mono text-slate-400">{p.sku}</div>}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-slate-800">
                        {fmt(p.qty, p.unit === 'lb' ? 1 : 0)}<span className="ml-1 text-slate-400 text-xs">{p.unit}</span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-slate-600">
                        {p.cost_per_unit != null ? `$${fmt(p.cost_per_unit)}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-red-700">${fmt(p.total_cost)}</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-800">${fmt(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* Grand total */}
        {suppliers.length > 0 && (
          <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-2xl bg-slate-200 px-5 py-4 font-bold text-slate-900">
            <span>GRAND TOTAL — {totals.supplier_count} supplier{totals.supplier_count === 1 ? '' : 's'} · {totals.product_count} product{totals.product_count === 1 ? '' : 's'} · {totals.order_count} order{totals.order_count === 1 ? '' : 's'}</span>
            <span className="flex gap-5">
              <span className="text-xs font-semibold text-slate-600">COGS owed <strong className="ml-2 font-mono text-base text-red-700">${fmt(totals.cogs)}</strong></span>
              <span className="text-xs font-semibold text-slate-600">Revenue <strong className="ml-2 font-mono text-base text-slate-900">${fmt(totals.revenue)}</strong></span>
            </span>
          </div>
        )}
      </main>
    </div>
  );
}
