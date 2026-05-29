'use client';

// /dashboard/reconciliation
//
// Bank reconciliation importer. Staff paste (or upload) the bank's daily
// transfer list — transfer ID, amount, [date] per line — and the page
// auto-matches each row to a paid, not-yet-reconciled online order BY AMOUNT.
// One click records the bank transfer ID on the matched order (via the
// staff-only /api/orders/reconcile) so every payment is tracked against the
// bank "exchange". Format-agnostic: works with whatever RBC hands you, as
// long as each line has a reference and an amount.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Candidate = {
  id: string;
  total: number;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  payment_ref: string | null;
  payment_status: string | null;
  payment_method: string | null;
};

type BankRow = { transferId: string; amount: number; date: string; raw: string };

// Parse pasted/uploaded text: each non-empty line → { transferId, amount, date }.
// Comma OR tab delimited. The amount is the first cell that parses as a
// positive number ($ and thousands commas stripped). Header rows (no numeric
// amount) are skipped automatically.
function parseRows(text: string): BankRow[] {
  const out: BankRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cells = trimmed.split(/[\t,]/).map((c) => c.trim());
    let amount = NaN;
    let amountIdx = -1;
    for (let i = 1; i < cells.length; i++) {
      const n = Number(cells[i].replace(/[$,]/g, ''));
      if (Number.isFinite(n) && n > 0) { amount = n; amountIdx = i; break; }
    }
    if (!Number.isFinite(amount)) continue; // header / junk line
    const transferId = cells[0] || `row-${out.length + 1}`;
    const date = cells.slice(amountIdx + 1).find(Boolean) || '';
    out.push({ transferId, amount, date, raw: trimmed });
  }
  return out;
}

export default function ReconciliationPage() {
  const [unreconciled, setUnreconciled] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<BankRow[] | null>(null);
  const [picks, setPicks] = useState<Record<number, string>>({});   // rowIdx → chosen order id
  const [done, setDone] = useState<Record<number, string>>({});     // rowIdx → reconciled order id
  const [busyRow, setBusyRow] = useState<number | null>(null);
  const [rowErr, setRowErr] = useState<Record<number, string>>({});

  async function load() {
    setLoading(true);
    setLoadErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/orders/unreconciled', {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setUnreconciled((j.orders ?? []) as Candidate[]);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // Candidates per bank row = unreconciled orders whose total matches the
  // amount, minus any already reconciled in this session.
  const reconciledIds = useMemo(() => new Set(Object.values(done)), [done]);
  function candidatesFor(amount: number): Candidate[] {
    return unreconciled.filter((o) => !reconciledIds.has(o.id) && Math.abs(Number(o.total) - amount) < 0.005);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result || '')); };
    reader.readAsText(f);
  }

  function runMatch() {
    setRows(parseRows(text));
    setPicks({});
    setDone({});
    setRowErr({});
  }

  async function reconcileRow(idx: number, row: BankRow, orderId: string) {
    setBusyRow(idx);
    setRowErr((p) => ({ ...p, [idx]: '' }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/orders/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ order_id: orderId, bank_transfer_id: row.transferId, notes: row.date ? `Bank date ${row.date}` : undefined }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setDone((p) => ({ ...p, [idx]: orderId }));
      setUnreconciled((prev) => prev.filter((o) => o.id !== orderId));
    } catch (e) {
      setRowErr((p) => ({ ...p, [idx]: e instanceof Error ? e.message : 'Reconcile failed' }));
    } finally {
      setBusyRow(null);
    }
  }

  const matched = rows ? rows.filter((_, i) => done[i]).length : 0;
  const fmtMoney = (n: number) => `BSD $${n.toFixed(2)}`;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-lg items-center gap-3 px-4 sm:h-16">
          <Link href="/dashboard" className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-bold text-gold hover:bg-gold/25">← BSC Control</Link>
          <div>
            <div className="text-sm font-black text-white">Bank Reconciliation</div>
            <div className="text-[10px] text-white/50">Match the bank&apos;s daily transfers to paid orders</div>
          </div>
          <Link href="/orders" className="ml-auto rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20">Orders →</Link>
        </div>
      </header>

      <main className="mx-auto max-w-screen-lg px-4 py-6 sm:py-8">
        {/* Status line */}
        <div className="mb-4 rounded-xl bg-white p-4 shadow-card ring-1 ring-slate-100">
          {loading ? (
            <span className="text-sm text-slate-500">Loading unreconciled orders…</span>
          ) : loadErr ? (
            <span className="text-sm font-semibold text-red-600">⚠️ {loadErr}</span>
          ) : (
            <span className="text-sm text-slate-700">
              <strong className="text-navy">{unreconciled.length}</strong> paid order{unreconciled.length === 1 ? '' : 's'} awaiting a bank match.
            </span>
          )}
        </div>

        {/* Paste / upload */}
        <div className="mb-4 rounded-2xl bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-black text-navy">Paste the bank&apos;s daily transfer list</h2>
          <p className="mt-1 text-xs text-slate-500">
            One transfer per line — <strong>transfer ID, amount</strong> (and date if you have it). Comma or tab separated. A header row is fine; it&apos;s skipped.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={'TRF000123, 6.21, 2026-05-29\nTRF000124, 42.50, 2026-05-29'}
            className="mt-3 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-navy outline-none focus:border-navy"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={runMatch} disabled={!text.trim()}
              className="rounded-xl bg-navy px-5 py-2.5 text-sm font-black text-gold hover:bg-navy-700 disabled:opacity-50">
              Match to orders
            </button>
            <label className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100">
              Upload CSV
              <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="hidden" />
            </label>
            <button onClick={load} className="text-xs font-bold text-slate-500 hover:text-navy">↻ Refresh orders</button>
          </div>
        </div>

        {/* Results */}
        {rows && (
          <div className="rounded-2xl bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-black text-navy">Matches</h2>
              <span className="text-xs font-bold text-emerald-700">{matched}/{rows.length} reconciled</span>
            </div>
            {rows.length === 0 && (
              <p className="text-sm text-slate-500">No transfer rows found — check the format (each line needs an amount).</p>
            )}
            <div className="space-y-2.5">
              {rows.map((row, idx) => {
                const cands = candidatesFor(row.amount);
                const isDone = !!done[idx];
                const chosen = picks[idx] || (cands.length === 1 ? cands[0].id : '');
                return (
                  <div key={idx} className={`rounded-xl border p-3 ${isDone ? 'border-emerald-200 bg-emerald-50' : cands.length === 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-mono text-xs text-slate-600">
                        #{row.transferId} · <strong className="text-navy">{fmtMoney(row.amount)}</strong>{row.date && <span className="text-slate-400"> · {row.date}</span>}
                      </div>
                      {isDone ? (
                        <span className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-black text-white">✓ Reconciled</span>
                      ) : cands.length === 0 ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-800">No matching order</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">{cands.length} match{cands.length === 1 ? '' : 'es'}</span>
                      )}
                    </div>

                    {!isDone && cands.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {cands.length === 1 ? (
                          <div className="flex-1 text-xs text-slate-700">
                            {cands[0].customer_name || '—'} · {fmtDate(cands[0].created_at)} · <span className="font-mono text-slate-500">{cands[0].payment_ref || cands[0].id.slice(0, 8)}</span>
                          </div>
                        ) : (
                          <select
                            value={chosen}
                            onChange={(e) => setPicks((p) => ({ ...p, [idx]: e.target.value }))}
                            className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                          >
                            <option value="">Choose the order…</option>
                            {cands.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.customer_name || '—'} · {fmtDate(c.created_at)} · {c.payment_ref || c.id.slice(0, 8)}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          onClick={() => chosen && reconcileRow(idx, row, chosen)}
                          disabled={!chosen || busyRow === idx}
                          className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busyRow === idx ? 'Saving…' : 'Reconcile'}
                        </button>
                      </div>
                    )}
                    {rowErr[idx] && <div className="mt-1.5 text-[11px] font-bold text-red-600">{rowErr[idx]}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
