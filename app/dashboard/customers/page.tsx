'use client';

// /dashboard/customers — admin view of every customer (excluding the
// Walk-In Anonymous singleton). Side panel edits credit terms / credit limit /
// is_credit_customer toggle, displays the points balance + lifetime + redeemed,
// and lets founder/co_founder make a manual points adjustment (audited).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const TERMS = ['COD', 'NET_7', 'NET_14', 'NET_30', 'NET_60', 'NET_90'];

type Customer = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  address?: string | null;
  is_credit_customer: boolean | null;
  credit_terms: string | null;
  credit_limit: number | null;
  current_balance: number | null;
  points_balance: number | null;
  points_lifetime: number | null;
  points_redeemed: number | null;
  total_orders: number | null;
  total_spent: number | null;
  is_active: boolean;
  created_at: string;
};

type PointsLogRow = {
  id: string;
  delta: number;
  reason: string;
  profit_basis: number | null;
  note: string | null;
  order_id: string | null;
  created_at: string;
  created_by: string | null;
};

async function call(action: string, body: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/customers/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify({ action, ...body }),
  });
  return res.json();
}

export default function CustomersAdminPage() {
  const [rows, setRows]             = useState<Customer[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<Customer | null>(null);
  const [log, setLog]               = useState<PointsLogRow[]>([]);
  const [savingCredit, setSavingCredit] = useState(false);
  const [adjustBusy, setAdjustBusy] = useState(false);

  // Edit-state for the side panel.
  const [eCredit, setECredit]   = useState<boolean>(false);
  const [eTerms, setETerms]     = useState<string>('COD');
  const [eLimit, setELimit]     = useState<string>('0');

  // Info-edit state (name / phone / email / address / active).
  const [iName,    setIName]    = useState<string>('');
  const [iPhone,   setIPhone]   = useState<string>('');
  const [iEmail,   setIEmail]   = useState<string>('');
  const [iAddress, setIAddress] = useState<string>('');
  const [iActive,  setIActive]  = useState<boolean>(true);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoErr,    setInfoErr]    = useState<string | null>(null);

  // Add Customer modal state.
  const [addOpen,  setAddOpen]  = useState(false);
  const [addBusy,  setAddBusy]  = useState(false);
  const [aName,    setAName]    = useState('');
  const [aPhone,   setAPhone]   = useState('');
  const [aEmail,   setAEmail]   = useState('');
  const [aAddress, setAAddress] = useState('');
  const [aCredit,  setACredit]  = useState(false);
  const [aTerms,   setATerms]   = useState('NET_7');
  const [aLimit,   setALimit]   = useState('0');
  const [aErr,     setAErr]     = useState<string | null>(null);

  function resetAddForm() {
    setAName(''); setAPhone(''); setAEmail(''); setAAddress('');
    setACredit(false); setATerms('NET_7'); setALimit('0'); setAErr(null);
  }

  async function createCustomer() {
    setAErr(null);
    if (!aName.trim()) { setAErr('Name is required'); return; }
    if (!aPhone.trim() && !aEmail.trim()) { setAErr('Phone or email required'); return; }
    setAddBusy(true);
    const j = await call('create', {
      full_name: aName, phone: aPhone, email: aEmail, address: aAddress,
      is_credit_customer: aCredit,
      credit_terms:       aCredit ? aTerms : undefined,
      credit_limit:       aCredit ? (Number(aLimit) || 0) : undefined,
    });
    setAddBusy(false);
    if (!j.ok) { setAErr(j.error || 'Create failed'); return; }
    const created = j.customer as Customer;
    setRows(prev => [created, ...prev]);
    setSelected(created);
    setAddOpen(false);
    resetAddForm();
  }

  async function load() {
    setLoading(true);
    setError(null);
    const j = await call('list', { search });
    if (!j.ok) { setError(j.error || 'Failed to load'); setRows([]); }
    else        setRows((j.customers || []) as Customer[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => { load(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search]);

  async function openCustomer(c: Customer) {
    setSelected(c);
    setECredit(!!c.is_credit_customer);
    setETerms(c.credit_terms || 'COD');
    setELimit(c.credit_limit != null ? String(c.credit_limit) : '0');
    setIName(c.full_name ?? '');
    setIPhone(c.phone ?? '');
    setIEmail(c.email ?? '');
    setIAddress(c.address ?? '');
    setIActive(c.is_active);
    setInfoErr(null);
    setLog([]);
    const j = await call('points_history', { id: c.id });
    if (j.ok) setLog((j.log || []) as PointsLogRow[]);
  }

  async function saveInfo() {
    if (!selected) return;
    setInfoErr(null);
    if (!iName.trim()) { setInfoErr('Name is required'); return; }
    setSavingInfo(true);
    const j = await call('update_info', {
      id:        selected.id,
      full_name: iName,
      phone:     iPhone,
      email:     iEmail,
      address:   iAddress,
      is_active: iActive,
    });
    setSavingInfo(false);
    if (!j.ok) { setInfoErr(j.error || 'Save failed'); return; }
    const patch = {
      full_name: j.customer.full_name,
      phone:     j.customer.phone,
      email:     j.customer.email,
      address:   j.customer.address,
      is_active: j.customer.is_active,
    };
    setRows(prev => prev.map(r => r.id === selected.id ? { ...r, ...patch } : r));
    setSelected({ ...selected, ...patch });
  }

  async function saveCredit() {
    if (!selected) return;
    setSavingCredit(true);
    const j = await call('update_credit', {
      id: selected.id,
      is_credit_customer: eCredit,
      credit_terms: eTerms,
      credit_limit: Number(eLimit) || 0,
    });
    setSavingCredit(false);
    if (!j.ok) { alert(`Save failed: ${j.error}`); return; }
    const patch = {
      is_credit_customer: j.customer.is_credit_customer,
      credit_terms:       j.customer.credit_terms,
      credit_limit:       j.customer.credit_limit,
    };
    setRows((prev) => prev.map((r) => (r.id === selected.id ? { ...r, ...patch } : r)));
    setSelected({ ...selected, ...patch });
  }

  async function adjustPoints() {
    if (!selected) return;
    const deltaStr = window.prompt(`Adjust points for ${selected.full_name || 'this customer'}.\n\nEnter a positive number to award, negative to deduct.`);
    if (deltaStr == null) return;
    const delta = parseInt(deltaStr, 10);
    if (!Number.isInteger(delta) || delta === 0) { alert('Enter a non-zero whole number.'); return; }
    const note = window.prompt('Reason (audit trail):') || 'adjusted';
    setAdjustBusy(true);
    const j = await call('adjust_points', { id: selected.id, delta, reason: 'adjusted', note });
    setAdjustBusy(false);
    if (!j.ok) { alert(`Adjust failed: ${j.error}`); return; }
    const newBal = j.points_balance as number;
    setRows((prev) => prev.map((r) => (r.id === selected.id ? { ...r, points_balance: newBal } : r)));
    setSelected({ ...selected, points_balance: newBal });
    // Refresh history.
    const hh = await call('points_history', { id: selected.id });
    if (hh.ok) setLog((hh.log || []) as PointsLogRow[]);
  }

  const fmtBSD = (n: number | null | undefined) => `BSD $${(Number(n ?? 0)).toFixed(2)}`;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-3 px-4 sm:h-16">
          <Link href="/dashboard" className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-bold text-gold hover:bg-gold/25">← BSC Control</Link>
          <div>
            <div className="text-sm font-black text-white">👥 Customers</div>
            <div className="text-[10px] text-white/50">Credit terms · points · history</div>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / phone / email"
            className="ml-auto w-56 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-gold sm:w-72" />
          <button onClick={() => { resetAddForm(); setAddOpen(true); }}
            className="rounded-lg bg-gold px-3 py-1.5 text-xs font-extrabold text-navy hover:bg-gold/90">
            + Add Customer
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-screen-xl gap-4 px-4 py-6">
        {/* List */}
        <div className="min-w-0 flex-1 overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-slate-100">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Credit</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-right">Points</th>
                <th className="px-3 py-2 text-right">Spent</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={6} className="p-8 text-center text-sm text-slate-400">Loading…</td></tr>)}
              {error && (<tr><td colSpan={6} className="p-4 text-sm font-bold text-red-700">⚠ {error}</td></tr>)}
              {!loading && rows.length === 0 && (<tr><td colSpan={6} className="p-8 text-center text-sm text-slate-400">No customers match.</td></tr>)}
              {rows.map((c) => (
                <tr key={c.id} onClick={() => openCustomer(c)}
                  className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50/60 ${selected?.id === c.id ? 'bg-slate-100' : ''}`}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-navy">{c.full_name || '—'}</div>
                      <Link href={`/dashboard/customers/${c.id}`} onClick={(e) => e.stopPropagation()}
                        className="rounded-md bg-navy/10 px-2 py-0.5 text-[10px] font-extrabold text-navy hover:bg-navy hover:text-gold"
                        title="Open full customer page">
                        Open →
                      </Link>
                    </div>
                    {c.email && <div className="text-[10px] text-slate-500">{c.email}</div>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{c.phone || '—'}</td>
                  <td className="px-3 py-2">
                    {c.is_credit_customer
                      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{c.credit_terms || 'CREDIT'}</span>
                      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">COD</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-700">{fmtBSD(c.current_balance)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="font-extrabold text-navy">{c.points_balance ?? 0}</span>
                    <span className="ml-1 text-[10px] text-slate-400">= ${((c.points_balance ?? 0) / 4).toFixed(2)}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-700">{fmtBSD(c.total_spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Side panel */}
        {selected && (
          <aside className="w-80 shrink-0 rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-100">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-display text-lg font-black text-navy">{selected.full_name || '—'}</div>
                <div className="text-[11px] text-slate-500">{selected.email || selected.phone || ''}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            {/* Customer info — name / phone / email / address / active */}
            <section className="mb-4 rounded-xl border border-slate-200 p-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer info</div>
              {infoErr && <div className="mb-2 rounded-md bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700">⚠ {infoErr}</div>}
              <div className="space-y-2">
                <div>
                  <label className="mb-0.5 block text-[10px] font-bold text-slate-500">Name</label>
                  <input value={iName} onChange={(e) => setIName(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[10px] font-bold text-slate-500">Phone</label>
                    <input value={iPhone} onChange={(e) => setIPhone(e.target.value)} inputMode="tel"
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="242-555-0100" />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] font-bold text-slate-500">Email</label>
                    <input value={iEmail} onChange={(e) => setIEmail(e.target.value)} inputMode="email"
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-bold text-slate-500">Address</label>
                  <input value={iAddress} onChange={(e) => setIAddress(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 pt-0.5">
                  <input type="checkbox" checked={iActive} onChange={(e) => setIActive(e.target.checked)} />
                  Active
                </label>
              </div>
              <button onClick={saveInfo} disabled={savingInfo}
                className="mt-3 w-full rounded-lg bg-navy px-3 py-2 text-xs font-extrabold text-gold hover:bg-navy-700 disabled:opacity-60">
                {savingInfo ? 'Saving…' : 'Save info'}
              </button>
            </section>

            {/* Credit terms */}
            <section className="mb-4 rounded-xl border border-slate-200 p-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Credit</div>
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
              <button onClick={saveCredit} disabled={savingCredit}
                className="mt-3 w-full rounded-lg bg-navy px-3 py-2 text-xs font-extrabold text-gold hover:bg-navy-700 disabled:opacity-60">
                {savingCredit ? 'Saving…' : 'Save credit settings'}
              </button>
              {selected.current_balance != null && Number(selected.current_balance) !== 0 && (
                <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">
                  Current balance: {fmtBSD(selected.current_balance)}
                </div>
              )}
            </section>

            {/* Points */}
            <section className="mb-4 rounded-xl border border-slate-200 p-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Points · 4 pts = $1</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Balance"  value={selected.points_balance  ?? 0} accent />
                <Stat label="Lifetime" value={selected.points_lifetime ?? 0} />
                <Stat label="Redeemed" value={selected.points_redeemed ?? 0} />
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Value: <strong className="text-navy">${((selected.points_balance ?? 0) / 4).toFixed(2)}</strong> in rewards
              </div>
              <button onClick={adjustPoints} disabled={adjustBusy}
                className="mt-3 w-full rounded-lg border border-navy px-3 py-2 text-xs font-extrabold text-navy hover:bg-navy hover:text-gold disabled:opacity-60">
                {adjustBusy ? 'Adjusting…' : '± Manual adjust'}
              </button>
            </section>

            {/* Recent history */}
            <section className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Recent points activity</div>
              {log.length === 0 ? (
                <div className="text-[11px] text-slate-400">No activity yet — earned when an order ships as Delivered.</div>
              ) : (
                <ul className="space-y-1.5 text-[11px]">
                  {log.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-700">
                          <span className={e.delta > 0 ? 'text-emerald-700' : 'text-red-700'}>
                            {e.delta > 0 ? '+' : ''}{e.delta} pts
                          </span>{' '}
                          <span className="font-medium text-slate-500">· {e.reason}</span>
                        </div>
                        {e.note && <div className="truncate italic text-slate-400">{e.note}</div>}
                        {e.profit_basis != null && (
                          <div className="text-slate-400">on ${Number(e.profit_basis).toFixed(2)} profit</div>
                        )}
                      </div>
                      <div className="shrink-0 text-slate-400">{fmtDate(e.created_at)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        )}
      </main>

      {/* ── ADD CUSTOMER MODAL ── */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !addBusy && setAddOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-black text-navy">+ Add Customer</h3>
                <p className="text-[11px] text-slate-500">Founder/co-founder can add and set credit terms in one step.</p>
              </div>
              <button onClick={() => setAddOpen(false)} disabled={addBusy} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            {aErr && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-700">⚠ {aErr}</div>}

            <div className="space-y-2.5">
              <div>
                <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Name *</label>
                <input value={aName} onChange={(e) => setAName(e.target.value)} autoFocus
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. Patricia Rolle" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Phone</label>
                  <input value={aPhone} onChange={(e) => setAPhone(e.target.value)} inputMode="tel"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="242-555-0100" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Email</label>
                  <input value={aEmail} onChange={(e) => setAEmail(e.target.value)} inputMode="email"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="optional" />
                </div>
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Address (optional)</label>
                <input value={aAddress} onChange={(e) => setAAddress(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Fire Trail Road, Nassau" />
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={aCredit} onChange={(e) => setACredit(e.target.checked)} />
                  Approve credit account
                </label>
                {aCredit && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-0.5 block text-[10px] font-bold text-slate-500">Terms</label>
                      <select value={aTerms} onChange={(e) => setATerms(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                        {TERMS.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-bold text-slate-500">Limit (BSD)</label>
                      <input type="text" inputMode="decimal" value={aLimit}
                        onChange={(e) => setALimit(e.target.value.replace(/[^0-9.]/g, ''))}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm font-bold" />
                    </div>
                  </div>
                )}
                {!aCredit && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Leave unchecked for cash-on-delivery only. You can approve credit later.
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setAddOpen(false)} disabled={addBusy}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button onClick={createCustomer} disabled={addBusy}
                  className="flex-1 rounded-lg bg-navy px-3 py-2 text-sm font-extrabold text-gold hover:bg-navy-700 disabled:opacity-60">
                  {addBusy ? 'Adding…' : 'Add Customer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-md border ${accent ? 'border-gold/40 bg-amber-50' : 'border-slate-200 bg-slate-50'} px-2 py-1.5`}>
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-lg font-extrabold ${accent ? 'text-navy' : 'text-slate-700'}`}>{value}</div>
    </div>
  );
}
