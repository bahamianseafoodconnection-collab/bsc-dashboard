'use client';

// /dashboard/cogs
//
// Supplier Cost-of-Goods report — "exactly what and who I'm paying on
// every sale and every day." Reads the supplier_cogs view (server-side
// truth captured per sale line: product → supplier → cost). Group by
// day / week / month, filter by channel. Shows per-supplier COGS,
// revenue, and margin for the window.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface CogsLine {
  supplier_id:   string | null;
  supplier_name: string;
  channel:       string | null;
  sold_at:       string;
  day:           string;
  week:          string;
  month:         string;
  qty:           number;
  line_cogs:     number;
  line_revenue:  number;
  product_name:  string | null;
}

type Bucket = 'day' | 'week' | 'month';
const CHANNELS = ['all', 'nassau_pos', 'andros_pos', 'online_market', 'local_wholesale'] as const;
const CHANNEL_LABEL: Record<string, string> = {
  all: 'All channels', nassau_pos: 'Nassau POS', andros_pos: 'Andros POS',
  online_market: 'Retail Online', local_wholesale: 'Wholesale',
};
const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CogsReportPage() {
  const [lines, setLines]     = useState<CogsLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [bucket, setBucket]   = useState<Bucket>('day');
  const [channel, setChannel] = useState<string>('all');
  const [days, setDays]       = useState<number>(30);   // window

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data } = await supabase
        .from('supplier_cogs')
        .select('supplier_id, supplier_name, channel, sold_at, day, week, month, qty, line_cogs, line_revenue, product_name')
        .gte('sold_at', since.toISOString())
        .order('sold_at', { ascending: false });
      if (!cancelled) { setLines((data ?? []) as CogsLine[]); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [days]);

  const filtered = useMemo(
    () => channel === 'all' ? lines : lines.filter(l => l.channel === channel),
    [lines, channel],
  );

  // Grand totals
  const totals = useMemo(() => {
    const cogs = filtered.reduce((s, l) => s + Number(l.line_cogs || 0), 0);
    const rev  = filtered.reduce((s, l) => s + Number(l.line_revenue || 0), 0);
    return { cogs, rev, margin: rev > 0 ? ((rev - cogs) / rev) * 100 : 0 };
  }, [filtered]);

  // Per-supplier rollup for the window.
  const bySupplier = useMemo(() => {
    const m = new Map<string, { name: string; cogs: number; rev: number; qty: number; orders: Set<string> }>();
    for (const l of filtered) {
      const key = l.supplier_id ?? l.supplier_name;
      const e = m.get(key) ?? { name: l.supplier_name, cogs: 0, rev: 0, qty: 0, orders: new Set<string>() };
      e.cogs += Number(l.line_cogs || 0);
      e.rev  += Number(l.line_revenue || 0);
      e.qty  += Number(l.qty || 0);
      m.set(key, e);
    }
    return Array.from(m.values()).sort((a, b) => b.cogs - a.cogs);
  }, [filtered]);

  // Per-period × supplier (day/week/month) — "every day, who am I paying".
  const byPeriod = useMemo(() => {
    const m = new Map<string, Map<string, number>>(); // period → supplier → cogs
    const periodTotals = new Map<string, number>();
    for (const l of filtered) {
      const p = l[bucket];
      const inner = m.get(p) ?? new Map<string, number>();
      inner.set(l.supplier_name, (inner.get(l.supplier_name) ?? 0) + Number(l.line_cogs || 0));
      m.set(p, inner);
      periodTotals.set(p, (periodTotals.get(p) ?? 0) + Number(l.line_cogs || 0));
    }
    return Array.from(m.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([period, sup]) => ({
        period,
        total: periodTotals.get(period) ?? 0,
        suppliers: Array.from(sup.entries()).sort((a, b) => b[1] - a[1]),
      }));
  }, [filtered, bucket]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6">
        <div className="mx-auto max-w-screen-lg">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="text-xs font-semibold text-slate-500 hover:text-navy">← Dashboard</Link>
            <span className="text-slate-300">·</span>
            <h1 className="font-display text-lg font-extrabold text-navy sm:text-xl">💵 Supplier COGS — what & who you’re paying</h1>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-300 p-0.5">
              {(['day', 'week', 'month'] as Bucket[]).map(b => (
                <button key={b} onClick={() => setBucket(b)}
                  className={`rounded-md px-3 py-1 text-xs font-bold capitalize ${bucket === b ? 'bg-navy text-gold' : 'text-slate-600'}`}>
                  {b}
                </button>
              ))}
            </div>
            <select value={channel} onChange={e => setChannel(e.target.value)}
              className="h-8 rounded-lg border border-slate-300 px-2 text-xs font-semibold text-navy">
              {CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
            </select>
            <select value={days} onChange={e => setDays(Number(e.target.value))}
              className="h-8 rounded-lg border border-slate-300 px-2 text-xs font-semibold text-navy">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last 12 months</option>
            </select>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-lg px-4 py-5 sm:px-6">
        {/* Summary */}
        <div className="mb-5 grid grid-cols-3 gap-2">
          <Stat label="Total COGS (paid to suppliers)" value={money(totals.cogs)} tone="navy" />
          <Stat label="Revenue" value={money(totals.rev)} tone="slate" />
          <Stat label="Gross margin" value={`${totals.margin.toFixed(1)}%`} tone="green" />
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-slate-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">No sales with cost data in this window yet.</p>
        ) : (
          <>
            {/* Per-supplier rollup */}
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-slate-600">By supplier · last {days} days</h2>
            <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-navy text-[11px] font-bold uppercase tracking-wider text-white">
                  <tr><th className="px-3 py-2 text-left">Supplier</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">COGS</th><th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2 text-right">Margin</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bySupplier.map(s => (
                    <tr key={s.name} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-semibold text-navy">{s.name}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{s.qty.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-bold text-navy">{money(s.cogs)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{money(s.rev)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{s.rev > 0 ? `${(((s.rev - s.cogs) / s.rev) * 100).toFixed(0)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Per-period breakdown */}
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-slate-600">By {bucket} · who you paid</h2>
            <div className="space-y-2">
              {byPeriod.map(p => (
                <div key={p.period} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-extrabold text-navy">{p.period}</span>
                    <span className="text-sm font-extrabold text-navy">{money(p.total)} <span className="text-[10px] font-semibold text-slate-400">COGS</span></span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.suppliers.map(([name, cogs]) => (
                      <span key={name} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        {name}: <span className="font-bold text-navy">{money(cogs)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'navy' | 'slate' | 'green' }) {
  const c = tone === 'navy' ? 'text-navy' : tone === 'green' ? 'text-emerald-700' : 'text-slate-700';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-extrabold ${c}`}>{value}</p>
    </div>
  );
}
