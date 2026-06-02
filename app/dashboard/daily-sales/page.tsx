'use client';

// /dashboard/daily-sales
//
// One page, one table. Answers Dedrick's 2026-06-02 ask: "simple
// and just show me what i sold each day at 8pm. who is the
// supplier for each item and what each item cost."
//
// Reads from /api/dashboard/daily-sales-report which queries via
// service_role — bypasses the 'qc' enum-cast RLS bug that's
// currently blocking direct view reads.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Row = {
  time:           string;
  order_id:       string;
  product_name:   string;
  sku:            string;
  qty:            number;
  unit:           string;
  supplier_id:    string | null;
  supplier_name:  string;
  cost_per_unit:  number | null;
  total_cost:     number;
  revenue:        number;
};

type Totals = { revenue: number; cogs: number; order_count: number; line_count: number };

function bahamasToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Nassau' });
}

function fmt(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Nassau' });
  } catch { return ''; }
}

export default function DailySalesPage() {
  const [date,   setDate]   = useState(bahamasToday());
  const [rows,   setRows]   = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals>({ revenue: 0, cogs: 0, order_count: 0, line_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

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
        setRows((j.rows ?? []) as Row[]);
        setTotals(j.totals as Totals);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date]);

  function downloadCsv() {
    if (rows.length === 0) return;
    const headers = ['Time', 'Order', 'Product', 'SKU', 'Qty', 'Unit', 'Supplier', 'Cost/unit', 'Total Cost', 'Revenue'];
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.join(','),
      ...rows.map((r) => [
        fmtTime(r.time), r.order_id.slice(0, 8), r.product_name, r.sku, r.qty, r.unit,
        r.supplier_name, r.cost_per_unit ?? '', r.total_cost, r.revenue,
      ].map(escape).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `bsc-daily-sales-${date}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link href="/dashboard" className="text-sm font-bold text-gold hover:underline">← BSC Control</Link>
          <h1 className="text-base font-extrabold text-white sm:text-lg">Daily Sales</h1>
          <span className="text-xs text-white/60">{rows.length} lines · {totals.order_count} orders</span>
        </div>
      </header>

      <main className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
            />
            <button
              onClick={() => setDate(bahamasToday())}
              className="text-xs font-bold text-slate-600 hover:text-navy underline"
            >
              today
            </button>
          </div>
          <button
            onClick={downloadCsv}
            disabled={rows.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            ⬇ CSV
          </button>
        </div>

        {/* Totals strip — just the three numbers Dedrick scans */}
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

        {/* The table — one row per line item with supplier + cost */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Time</th>
                  <th className="px-4 py-2 text-left">Product</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-left">Supplier</th>
                  <th className="px-4 py-2 text-right">Cost / unit</th>
                  <th className="px-4 py-2 text-right">Total Cost</th>
                  <th className="px-4 py-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>
                )}
                {!loading && rows.length === 0 && !error && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No sales on this date.</td></tr>
                )}
                {rows.map((r, i) => (
                  <tr key={`${r.order_id}-${i}`} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 whitespace-nowrap text-slate-600">{fmtTime(r.time)}</td>
                    <td className="px-4 py-2 text-slate-800">
                      <div className="font-bold">{r.product_name}</div>
                      {r.sku && <div className="text-[10px] font-mono text-slate-400">{r.sku}</div>}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-700">
                      {fmt(r.qty, r.unit === 'lb' ? 1 : 0)}<span className="ml-1 text-slate-400 text-xs">{r.unit}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-700">{r.supplier_name}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-600">
                      {r.cost_per_unit != null ? `$${fmt(r.cost_per_unit)}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-red-700">${fmt(r.total_cost)}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-700">${fmt(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-slate-100 font-bold">
                  <tr>
                    <td className="px-4 py-3" colSpan={5}>TOTAL · {totals.line_count} lines across {totals.order_count} orders</td>
                    <td className="px-4 py-3 text-right font-mono text-red-700">${fmt(totals.cogs)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-900">${fmt(totals.revenue)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
