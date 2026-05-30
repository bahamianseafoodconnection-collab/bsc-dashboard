'use client';

// /dashboard/order-history
//
// Dedicated archive view for completed orders. Date-range filtered (default
// last 30 days), searchable by customer name OR bank trace ID, paginated,
// and exportable as CSV (per page). Every audit field is visible inline —
// no need to drill into each order to see the trace / auth code / who
// reconciled. Reads via the client supabase using the signed-in staff
// session (orders RLS allows staff to read all).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';

export const dynamic = 'force-dynamic';

type HistoryOrder = {
  id: string;
  created_at: string;
  customer_name:       string | null;
  customer_phone:      string | null;
  total:               number | null;
  payment_method:      string | null;
  payment_approval:    string | null;
  payment_received_at: string | null;
  payment_received_by: string | null;
  status:              string | null;
  delivery_type:       string | null;
};

const PAGE_SIZE = 25;

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function OrderHistoryPage() {
  const [dateFrom, setDateFrom] = useState(isoDateOffset(-30));
  const [dateTo,   setDateTo]   = useState(isoDateOffset(0));
  const [search,   setSearch]   = useState('');
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [page, setPage]         = useState(1);
  const [rows, setRows]         = useState<HistoryOrder[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [authCodes, setAuthCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const statuses = includeCancelled ? ['Delivered', 'Cancelled'] : ['Delivered'];
        const fromIso  = `${dateFrom}T00:00:00`;
        const toIso    = `${dateTo}T23:59:59`;
        let q = supabase
          .from('orders')
          .select(
            'id, created_at, customer_name, customer_phone, total, payment_method, ' +
            'payment_approval, payment_received_at, payment_received_by, status, delivery_type',
            { count: 'exact' },
          )
          .in('status', statuses)
          .gte('created_at', fromIso)
          .lte('created_at', toIso);
        // Sanitize search so PostgREST .or() parsing can't break — strip the
        // few chars that have special meaning in the filter grammar.
        const s = search.trim().replace(/[,()*]/g, '').slice(0, 80);
        if (s) {
          q = q.or(`customer_name.ilike.%${s}%,payment_approval.ilike.%${s}%`);
        }
        const from = (page - 1) * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;
        const { data, count, error: err } = await q
          .order('created_at', { ascending: false })
          .range(from, to);
        if (cancelled) return;
        if (err) { setError(plainError(err)); setRows([]); setTotal(0); return; }
        const list = ((data ?? []) as unknown) as HistoryOrder[];
        setRows(list);
        setTotal(count || 0);

        const ids = list.map((r) => r.id);
        if (ids.length > 0) {
          const { data: pt } = await supabase
            .from('payment_transactions')
            .select('order_id, pt_authorization_code, created_at')
            .in('order_id', ids)
            .order('created_at', { ascending: false });
          if (cancelled) return;
          const map: Record<string, string> = {};
          for (const r of (pt ?? []) as { order_id: string; pt_authorization_code: string | null }[]) {
            if (r.pt_authorization_code && !map[r.order_id]) map[r.order_id] = r.pt_authorization_code;
          }
          setAuthCodes(map);
        } else {
          setAuthCodes({});
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load order history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, search, includeCancelled, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function exportCsv() {
    const header = ['Date', 'Order ID', 'Customer', 'Phone', 'Type', 'Payment Method', 'Total (BSD)', 'Bank Trace', 'Bank Auth Code', 'Reconciled At', 'Reconciled By', 'Status'];
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [header.join(',')];
    for (const o of rows) {
      lines.push([
        new Date(o.created_at).toISOString(),
        o.id,
        o.customer_name || '',
        o.customer_phone || '',
        o.delivery_type || '',
        o.payment_method || '',
        Number(o.total ?? 0).toFixed(2),
        o.payment_approval || '',
        authCodes[o.id] || '',
        o.payment_received_at ? new Date(o.payment_received_at).toISOString() : '',
        o.payment_received_by || '',
        o.status || '',
      ].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `bsc-order-history-${dateFrom}-to-${dateTo}-p${page}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-3 px-4 sm:h-16">
          <Link href="/dashboard" className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-bold text-gold hover:bg-gold/25">← BSC Control</Link>
          <div>
            <div className="text-sm font-black text-white">📜 Order History</div>
            <div className="text-[10px] text-white/50">Completed orders archive — searchable + exportable</div>
          </div>
          <Link href="/orders" className="ml-auto rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20">Live Orders →</Link>
        </div>
      </header>

      <main className="mx-auto max-w-screen-xl px-4 py-6 sm:py-8">
        {/* Filter bar */}
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-100">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">From</label>
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">To</label>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Search (customer name or bank trace)</label>
              <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="John Smith, TRF000123…"
                className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
                <input type="checkbox" checked={includeCancelled} onChange={(e) => { setIncludeCancelled(e.target.checked); setPage(1); }} />
                Include cancelled
              </label>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-600">
              {loading
                ? 'Loading…'
                : <>Showing <strong>{rows.length}</strong> of <strong>{total}</strong> {includeCancelled ? 'completed + cancelled' : 'delivered'} order{total === 1 ? '' : 's'}</>}
            </span>
            <button onClick={exportCsv} disabled={rows.length === 0}
              className="rounded-lg bg-navy px-4 py-2 text-xs font-extrabold text-gold hover:bg-navy-700 disabled:opacity-50">
              ↓ Export CSV (this page)
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">⚠️ {error}</div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-slate-100">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Bank Trace</th>
                <th className="px-3 py-2">Auth Code</th>
                <th className="px-3 py-2">Reconciled</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={8} className="p-8 text-center text-sm text-slate-400">No orders match these filters.</td></tr>
              )}
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-slate-600">{new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td className="px-3 py-2">
                    <div className="font-bold text-navy">{o.customer_name || '—'}</div>
                    {o.customer_phone && <div className="text-[10px] text-slate-500">{o.customer_phone}</div>}
                  </td>
                  <td className="px-3 py-2 font-bold text-navy">BSD ${Number(o.total ?? 0).toFixed(2)}</td>
                  <td className="px-3 py-2 capitalize text-slate-600">{o.payment_method || '—'}</td>
                  <td className="px-3 py-2 font-mono text-slate-700">{o.payment_approval || '—'}</td>
                  <td className="px-3 py-2 font-mono text-slate-700">{authCodes[o.id] || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{o.payment_received_at ? new Date(o.payment_received_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${o.status === 'Delivered' ? 'bg-emerald-100 text-emerald-700' : o.status === 'Cancelled' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">← Prev</button>
            <span className="text-xs text-slate-600">Page <strong>{page}</strong> of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Next →</button>
          </div>
        )}
      </main>
    </div>
  );
}
