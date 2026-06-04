'use client';

// /dashboard/customers/[id] — full customer detail page.
// Top bar: ← Customers + ← Dashboard
// Sections: Hero (name + status + credit badge) · Info (editable) ·
//   Credit (terms, limit, current balance, Record payment / charge button) ·
//   Points (existing) · Recent orders · Credit ledger history

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Customer = {
  id: string; full_name: string | null; phone: string | null; email: string | null;
  address: string | null; is_credit_customer: boolean | null;
  credit_terms: string | null; credit_limit: number | null;
  current_balance: number | null;
  points_balance: number | null; points_lifetime: number | null; points_redeemed: number | null;
  total_orders: number | null; total_spent: number | null;
  is_active: boolean; created_at: string;
};
type Order  = { id: string; total: number | null; status: string | null; payment_method: string | null; order_type: string | null; created_at: string; channel: string | null };
type Ledger = { id: string; delta: number; reason: string; note: string | null; balance_after: number; created_at: string };
type Points = { id: string; delta: number; reason: string; profit_basis: number | null; note: string | null; order_id: string | null; created_at: string };

const TERMS = ['COD', 'NET_7', 'NET_14', 'NET_30', 'NET_60', 'NET_90'];

async function call(action: string, body: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/customers/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify({ action, ...body }),
  });
  return res.json();
}

const fmtBSD  = (n: number | null | undefined) => `BSD $${Number(n ?? 0).toFixed(2)}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtDt   = (iso: string) => new Date(iso).toLocaleString('en-US',  { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id     = params?.id ?? '';
  const router = useRouter();

  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders,   setOrders]   = useState<Order[]>([]);
  const [ledger,   setLedger]   = useState<Ledger[]>([]);
  const [points,   setPoints]   = useState<Points[]>([]);
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);

  // Editable info state
  const [iName,    setIName]    = useState('');
  const [iPhone,   setIPhone]   = useState('');
  const [iEmail,   setIEmail]   = useState('');
  const [iAddress, setIAddress] = useState('');
  const [iActive,  setIActive]  = useState(true);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoErr,    setInfoErr]    = useState<string | null>(null);

  // Editable credit state
  const [eCredit, setECredit] = useState(false);
  const [eTerms,  setETerms]  = useState('COD');
  const [eLimit,  setELimit]  = useState('0');
  const [savingCredit, setSavingCredit] = useState(false);

  // Payment-recording state
  const [payAmount, setPayAmount] = useState('');
  const [payMode,   setPayMode]   = useState<'payment' | 'charge'>('payment');
  const [payNote,   setPayNote]   = useState('');
  const [payBusy,   setPayBusy]   = useState(false);
  const [payErr,    setPayErr]    = useState<string | null>(null);

  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); }

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    const j = await call('detail', { id });
    if (!j.ok) { setError(j.error || 'Load failed'); setLoading(false); return; }
    const c = j.customer as Customer;
    setCustomer(c); setOrders(j.orders as Order[]); setLedger(j.ledger as Ledger[]); setPoints(j.points as Points[]);
    setIName(c.full_name ?? ''); setIPhone(c.phone ?? ''); setIEmail(c.email ?? '');
    setIAddress(c.address ?? ''); setIActive(c.is_active);
    setECredit(!!c.is_credit_customer); setETerms(c.credit_terms || 'COD');
    setELimit(c.credit_limit != null ? String(c.credit_limit) : '0');
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function saveInfo() {
    if (!customer) return;
    setInfoErr(null);
    if (!iName.trim()) { setInfoErr('Name is required'); return; }
    setSavingInfo(true);
    const j = await call('update_info', {
      id: customer.id,
      full_name: iName, phone: iPhone, email: iEmail, address: iAddress, is_active: iActive,
    });
    setSavingInfo(false);
    if (!j.ok) { setInfoErr(j.error || 'Save failed'); return; }
    showToast('✓ Info saved');
    await load();
  }

  async function saveCredit() {
    if (!customer) return;
    setSavingCredit(true);
    const j = await call('update_credit', {
      id: customer.id,
      is_credit_customer: eCredit,
      credit_terms:       eTerms,
      credit_limit:       Number(eLimit) || 0,
    });
    setSavingCredit(false);
    if (!j.ok) { showToast(`Credit save failed: ${j.error}`, false); return; }
    showToast('✓ Credit terms saved');
    await load();
  }

  async function recordPaymentOrCharge() {
    if (!customer) return;
    setPayErr(null);
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) { setPayErr('Enter a positive amount'); return; }
    setPayBusy(true);
    // payment lowers balance (negative delta); charge raises it.
    const delta = payMode === 'payment' ? -amt : amt;
    const j = await call('record_credit_change', {
      id:     customer.id,
      delta,
      reason: payMode,
      note:   payNote.trim() || null,
    });
    setPayBusy(false);
    if (!j.ok) { setPayErr(j.error || 'Save failed'); return; }
    showToast(`${payMode === 'payment' ? '💵 Payment recorded' : '⚠ Charge recorded'}`);
    setPayAmount(''); setPayNote('');
    await load();
  }

  async function adjustPoints() {
    if (!customer) return;
    const deltaStr = window.prompt(`Adjust points for ${customer.full_name || 'this customer'}.\n\nEnter a positive number to award, negative to deduct.`);
    if (deltaStr == null) return;
    const delta = parseInt(deltaStr, 10);
    if (!Number.isInteger(delta) || delta === 0) { alert('Enter a non-zero whole number.'); return; }
    const note = window.prompt('Reason (audit trail):') || 'adjusted';
    const j = await call('adjust_points', { id: customer.id, delta, reason: 'adjusted', note });
    if (!j.ok) { showToast(`Adjust failed: ${j.error}`, false); return; }
    showToast(`✓ Points adjusted`);
    await load();
  }

  const utilizationPct = customer && customer.credit_limit ? Math.round(((customer.current_balance ?? 0) / customer.credit_limit) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      {/* Top bar with both back buttons */}
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-2 px-4 sm:h-16">
          <button onClick={() => router.push('/dashboard/customers')}
            className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-bold text-gold hover:bg-gold/25">
            ← Customers
          </button>
          <button onClick={() => router.push('/dashboard')}
            className="rounded-lg bg-white/8 px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/15 border border-white/10">
            ← Dashboard
          </button>
          <div className="ml-auto text-[10px] uppercase tracking-wider text-white/50">BSC Customer</div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-xl px-4 py-6 space-y-4">
        {loading && <div className="p-10 text-center text-sm text-slate-400">Loading customer…</div>}
        {error && <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">⚠ {error}</div>}

        {!loading && customer && (
          <>
            {/* Hero */}
            <section className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-100">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-navy text-2xl font-black text-gold">
                  {(customer.full_name || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="font-display text-2xl font-black text-navy">{customer.full_name || '—'}</h1>
                  <p className="text-xs text-slate-500">
                    {customer.phone ?? '—'}{customer.email ? ' · ' + customer.email : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider ${customer.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    {customer.is_active ? '● Active' : '○ Inactive'}
                  </span>
                  {customer.is_credit_customer && (
                    <span className="rounded-full bg-amber-100 px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                      🅒 {customer.credit_terms || 'CREDIT'}
                    </span>
                  )}
                </div>
              </div>

              {/* Stat strip */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Lifetime spent" value={fmtBSD(customer.total_spent)} />
                <Stat label="Orders"        value={String(customer.total_orders ?? 0)} />
                <Stat label="Credit balance" value={fmtBSD(customer.current_balance)} accent={Number(customer.current_balance ?? 0) > 0} />
                <Stat label="Points"        value={String(customer.points_balance ?? 0)} />
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Info edit */}
              <section className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-100">
                <h2 className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Customer info</h2>
                {infoErr && <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-700">⚠ {infoErr}</div>}
                <div className="space-y-2.5">
                  <Field label="Name *"  value={iName}    onChange={setIName} />
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Phone"   value={iPhone}  onChange={setIPhone}  inputMode="tel" />
                    <Field label="Email"   value={iEmail}  onChange={setIEmail}  inputMode="email" />
                  </div>
                  <Field label="Address" value={iAddress} onChange={setIAddress} />
                  <label className="flex items-center gap-2 pt-1 text-sm font-bold text-slate-700">
                    <input type="checkbox" checked={iActive} onChange={(e) => setIActive(e.target.checked)} />
                    Active customer
                  </label>
                </div>
                <button onClick={saveInfo} disabled={savingInfo}
                  className="mt-3 w-full rounded-lg bg-navy px-3 py-2 text-xs font-extrabold text-gold hover:bg-navy-700 disabled:opacity-60">
                  {savingInfo ? 'Saving…' : 'Save info'}
                </button>
              </section>

              {/* Credit terms */}
              <section className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-100">
                <h2 className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Credit terms</h2>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={eCredit} onChange={(e) => setECredit(e.target.checked)} />
                  Approved for credit
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[10px] font-bold text-slate-500">Terms</label>
                    <select value={eTerms} onChange={(e) => setETerms(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                      {TERMS.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] font-bold text-slate-500">Limit (BSD)</label>
                    <input type="text" inputMode="decimal" value={eLimit}
                      onChange={(e) => setELimit(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm font-bold" />
                  </div>
                </div>

                {/* Utilization bar */}
                {customer.is_credit_customer && Number(customer.credit_limit ?? 0) > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[10px] font-bold text-slate-500">
                      <span>Used {fmtBSD(customer.current_balance)} of {fmtBSD(customer.credit_limit)}</span>
                      <span>{utilizationPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${utilizationPct >= 90 ? 'bg-red-500' : utilizationPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, Math.max(0, utilizationPct))}%` }} />
                    </div>
                  </div>
                )}

                <button onClick={saveCredit} disabled={savingCredit}
                  className="mt-3 w-full rounded-lg bg-navy px-3 py-2 text-xs font-extrabold text-gold hover:bg-navy-700 disabled:opacity-60">
                  {savingCredit ? 'Saving…' : 'Save credit terms'}
                </button>
              </section>
            </div>

            {/* Record payment / charge */}
            {customer.is_credit_customer && (
              <section className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-100">
                <h2 className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  Record credit transaction
                </h2>
                {payErr && <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-700">⚠ {payErr}</div>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_2fr_auto] sm:items-end">
                  <div>
                    <label className="mb-0.5 block text-[10px] font-bold text-slate-500">Type</label>
                    <div className="flex gap-2">
                      <button onClick={() => setPayMode('payment')}
                        className={`rounded-md px-3 py-1.5 text-xs font-bold ${payMode === 'payment' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        💵 Payment
                      </button>
                      <button onClick={() => setPayMode('charge')}
                        className={`rounded-md px-3 py-1.5 text-xs font-bold ${payMode === 'charge' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        ⚠ Charge
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] font-bold text-slate-500">Amount (BSD)</label>
                    <input value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                      inputMode="decimal" placeholder="0.00"
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm font-bold" />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] font-bold text-slate-500">Note</label>
                    <input value={payNote} onChange={(e) => setPayNote(e.target.value)}
                      placeholder={payMode === 'payment' ? 'e.g. cash, wire ref TRF-...' : 'e.g. damaged goods, late fee'}
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                  <button onClick={recordPaymentOrCharge} disabled={payBusy}
                    className="rounded-lg bg-navy px-4 py-2 text-xs font-extrabold text-gold hover:bg-navy-700 disabled:opacity-60">
                    {payBusy ? 'Saving…' : payMode === 'payment' ? 'Record payment' : 'Record charge'}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Payment lowers the running balance; Charge raises it. Each one writes an immutable ledger row + updates the balance.
                </p>
              </section>
            )}

            {/* Points + recent orders side by side */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Points */}
              <section className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-100">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Points · 4 pts = $1</h2>
                  <button onClick={adjustPoints}
                    className="rounded-md border border-navy px-2 py-1 text-[10px] font-extrabold text-navy hover:bg-navy hover:text-gold">
                    ± Adjust
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Balance"  value={String(customer.points_balance  ?? 0)} accent />
                  <Stat label="Lifetime" value={String(customer.points_lifetime ?? 0)} />
                  <Stat label="Redeemed" value={String(customer.points_redeemed ?? 0)} />
                </div>
                <ul className="mt-3 space-y-1.5 text-[11px]">
                  {points.length === 0 ? <li className="text-slate-400">No activity yet.</li> :
                    points.slice(0, 10).map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 border-t border-slate-100 pt-1">
                        <div className="min-w-0 flex-1">
                          <span className={e.delta > 0 ? 'font-bold text-emerald-700' : 'font-bold text-red-700'}>{e.delta > 0 ? '+' : ''}{e.delta} pts</span>
                          <span className="ml-2 text-slate-500">{e.reason}</span>
                          {e.note && <div className="truncate italic text-slate-400">{e.note}</div>}
                        </div>
                        <div className="shrink-0 text-slate-400">{fmtDate(e.created_at)}</div>
                      </li>
                    ))
                  }
                </ul>
              </section>

              {/* Recent orders */}
              <section className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-100">
                <h2 className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Recent orders ({orders.length})</h2>
                {orders.length === 0 ? <p className="text-sm text-slate-400">No orders yet.</p> :
                  <ul className="space-y-1.5 text-[12px]">
                    {orders.slice(0, 12).map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5">
                        <div>
                          <div className="font-bold text-slate-700">{fmtBSD(o.total)}</div>
                          <div className="text-[10px] text-slate-500">
                            {o.channel ?? o.order_type ?? '—'} · {o.payment_method ?? '—'}{o.status ? ' · ' + o.status : ''}
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-400">{fmtDt(o.created_at)}</div>
                      </li>
                    ))}
                  </ul>
                }
              </section>
            </div>

            {/* Credit ledger history */}
            <section className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-100">
              <h2 className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Credit ledger ({ledger.length})</h2>
              {ledger.length === 0 ? (
                <p className="text-sm text-slate-400">No ledger entries yet. Record a payment or charge above to start tracking.</p>
              ) : (
                <ul className="space-y-1.5 text-[12px]">
                  {ledger.map((l) => (
                    <li key={l.id} className="grid grid-cols-[80px_1fr_auto] items-center gap-3 border-t border-slate-100 pt-1.5">
                      <span className={`font-mono font-extrabold ${l.delta < 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {l.delta < 0 ? '−' : '+'}{fmtBSD(Math.abs(l.delta))}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-700">{l.reason}</div>
                        {l.note && <div className="truncate text-[11px] italic text-slate-400">{l.note}</div>}
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[11px] text-slate-500">→ {fmtBSD(l.balance_after)}</div>
                        <div className="text-[10px] text-slate-400">{fmtDt(l.created_at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {toast && (
          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-bold text-white shadow-lg"
            style={{ backgroundColor: toast.ok ? '#16a34a' : '#dc2626', zIndex: 60 }}>
            {toast.msg}
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${accent ? 'border border-gold/40 bg-amber-50' : 'border border-slate-200 bg-slate-50'}`}>
      <div className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-extrabold ${accent ? 'text-navy' : 'text-slate-700'}`}>{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, inputMode }: { label: string; value: string; onChange: (v: string) => void; inputMode?: 'text'|'tel'|'email'|'decimal'|'numeric' }) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode={inputMode}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
    </div>
  );
}
