'use client';

// /founder/bank — Bank Reconciliation.
//
// Founder uploads bank statement lines (deposits + withdrawals) and reconciles
// bank totals against system money movements (sales, payments received, COD,
// credit payments, supplier payments) for a date range, with difference flags.
// Data from /api/founder/bank (founder-only). Statement parsing is client-side
// with a preview the founder reviews before importing.

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

// Auth-gated + personalised — never static-prerender (also avoids the
// build-time "supabaseUrl required" when env isn't present locally).
export const dynamic = 'force-dynamic';

const GOLD = '#f5c518';
const INK = '#060d1f';
const CARD = '#0f1a2e';
const BORDER = 'rgba(255,255,255,0.08)';

type Txn = { id: string; txn_date: string; description: string | null; reference: string | null; amount: number; direction: string; matched: boolean };
type Resp = {
  ok: boolean;
  range: { from: string; to: string };
  bank: { deposits: number; withdrawals: number; net: number; count: number; unmatched: number };
  system: { sales_recorded: number; payments_received: number; cod_collected: number; credit_payments: number; supplier_payments: number };
  differences: { deposits_minus_received: number; withdrawals_minus_supplier: number };
  transactions: Txn[];
};
type ParsedRow = { txn_date: string; amount: number; description: string; reference: string };

const bsd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// Heuristic, format-agnostic statement parser: each line should carry a date and
// an amount; parentheses / trailing DR / leading minus = withdrawal (negative).
function parseStatement(text: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const line of text.split('\n')) {
    const raw = line.trim();
    if (!raw) continue;
    // date
    let txn_date = '';
    const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    const us = raw.match(/(\d{1,2})[/](\d{1,2})[/](\d{2,4})/);
    if (iso) txn_date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    else if (us) { const y = us[3].length === 2 ? `20${us[3]}` : us[3]; txn_date = `${y}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`; }
    if (!txn_date) continue;
    // money tokens
    const tokens = raw.match(/-?\(?\$?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\)?/g) || [];
    let amount = NaN;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      if (!/\d/.test(t)) continue;
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) continue; // skip the date itself
      const neg = /^[-(]/.test(t) || /\)$/.test(t);
      const n = Number(t.replace(/[(),$\s-]/g, ''));
      if (Number.isFinite(n) && n !== 0) { amount = neg ? -n : n; break; }
    }
    if (!Number.isFinite(amount)) continue;
    if (/\b(withdrawal|debit|payment to|transfer out|dr)\b/i.test(raw) && amount > 0) amount = -amount;
    const refM = raw.match(/\b([A-Z0-9]{6,})\b/);
    out.push({ txn_date, amount, description: raw.slice(0, 200), reference: refM ? refM[1] : '' });
  }
  return out;
}

export default function BankReconciliationPage() {
  const router = useRouter();
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const t = await token();
      if (!t) { router.push('/staff-login?next=/founder/bank'); return; }
      const res = await fetch(`/api/founder/bank?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setData(j as Resp);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [from, to, token, router]);

  useEffect(() => { load(); }, [load]);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  function doParse() {
    const rows = parseStatement(paste);
    setPreview(rows);
    if (rows.length === 0) flash('No transactions found — each line needs a date and an amount.');
  }

  async function doImport() {
    if (!preview || preview.length === 0) return;
    setImporting(true);
    try {
      const t = await token();
      const res = await fetch('/api/founder/bank', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ rows: preview }) });
      const j = await res.json();
      if (!res.ok || !j.ok) { flash(j.error || 'Import failed'); return; }
      flash(`Imported ${j.inserted}${j.skipped ? ` · ${j.skipped} skipped/dupes` : ''}`);
      setPaste(''); setPreview(null);
      await load();
    } finally { setImporting(false); }
  }

  async function del(id: string) {
    const t = await token();
    await fetch(`/api/founder/bank?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
    await load();
  }

  const d = data;
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header style={{ backgroundColor: INK, padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/founder')} style={{ background: 'transparent', color: GOLD, border: `1px solid rgba(245,197,24,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 19 }}>🏦 Bank Reconciliation</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>System totals vs the bank statement</div>
          </div>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dateStyle} />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={dateStyle} />
          <button onClick={load} disabled={loading} style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{loading ? '…' : '↻'}</button>
        </div>
      </header>

      <main style={{ maxWidth: 980, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {err && <div style={{ padding: 14, borderRadius: 10, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>⚠️ {err}{/bank_transactions|relation|does not exist/i.test(err) ? ' — run the bank_transactions SQL first.' : ''}</div>}

        {/* Reconciliation summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <section style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 16 }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 900, marginBottom: 10 }}>🏦 Bank</div>
            <Line label="Deposits in" value={bsd(d?.bank.deposits ?? 0)} color="#4ade80" />
            <Line label="Withdrawals out" value={bsd(-(d?.bank.withdrawals ?? 0))} color="#f87171" />
            <Line label="Net" value={bsd(d?.bank.net ?? 0)} bold />
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 6 }}>{d?.bank.count ?? 0} lines · {d?.bank.unmatched ?? 0} unmatched</div>
          </section>
          <section style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 16 }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 900, marginBottom: 10 }}>📊 System</div>
            <Line label="Sales recorded" value={bsd(d?.system.sales_recorded ?? 0)} />
            <Line label="Payments received" value={bsd(d?.system.payments_received ?? 0)} color="#4ade80" />
            <Line label="↳ of which COD" value={bsd(d?.system.cod_collected ?? 0)} dim />
            <Line label="Credit payments" value={bsd(d?.system.credit_payments ?? 0)} dim />
            <Line label="Supplier payments" value={bsd(-(d?.system.supplier_payments ?? 0))} color="#f87171" />
          </section>
        </div>

        {/* Differences */}
        <section style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 16 }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 900, marginBottom: 10 }}>⚖️ Differences (bank − system)</div>
          <DiffLine label="Deposits vs payments received" value={d?.differences.deposits_minus_received ?? 0} />
          <DiffLine label="Withdrawals vs supplier payments" value={d?.differences.withdrawals_minus_supplier ?? 0} />
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 8 }}>A non-zero difference = money in the bank not yet recorded in the system (or vice-versa) — investigate.</div>
        </section>

        {/* Upload */}
        <section style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16 }}>
          <div style={{ color: '#334155', fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Upload statement</div>
          <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={5}
            placeholder={'Paste bank lines — one per line, each with a date and amount. e.g.\n2026-06-20  Deposit RBC transfer ABC123  1,250.00\n2026-06-21  Payment to supplier  (430.00)'}
            style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid #e2e8f0', padding: 10, fontSize: 12, fontFamily: 'monospace' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={doParse} disabled={!paste.trim()} style={{ background: '#0f1a2e', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Parse preview</button>
            {preview && preview.length > 0 && (
              <button onClick={doImport} disabled={importing} style={{ background: GOLD, color: INK, border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>{importing ? 'Importing…' : `Import ${preview.length}`}</button>
            )}
          </div>
          {preview && (
            <div style={{ marginTop: 10, maxHeight: 180, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              {preview.length === 0 ? <div style={{ padding: 10, color: '#94a3b8', fontSize: 12 }}>Nothing parsed.</div> :
                preview.map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 10px', borderTop: i ? '1px solid #f1f5f9' : 'none', fontSize: 12 }}>
                    <span style={{ color: '#475569' }}>{r.txn_date}</span>
                    <span style={{ flex: 1, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span>
                    <span style={{ fontWeight: 800, color: r.amount < 0 ? '#dc2626' : '#16a34a' }}>{bsd(r.amount)}</span>
                  </div>
                ))}
            </div>
          )}
        </section>

        {/* Transactions */}
        <section style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', color: '#fff', fontWeight: 900, fontSize: 14 }}>Bank transactions · {from} → {to}</div>
          {(d?.transactions ?? []).length === 0 ? (
            <div style={{ padding: 20, color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center' }}>{loading ? 'Loading…' : 'No bank transactions in this window.'}</div>
          ) : (d?.transactions ?? []).map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: `1px solid ${BORDER}` }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, width: 78 }}>{t.txn_date}</span>
              <span style={{ flex: 1, color: '#e2e8f0', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || t.reference || '—'}</span>
              <span style={{ fontWeight: 800, fontSize: 13, color: Number(t.amount) < 0 ? '#f87171' : '#4ade80' }}>{bsd(Number(t.amount))}</span>
              <button onClick={() => del(t.id)} title="Remove" style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 13 }}>✕</button>
            </div>
          ))}
        </section>
      </main>

      {toast && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#0f1a2e', color: '#fff', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, zIndex: 80, border: `1px solid ${GOLD}` }}>{toast}</div>}
    </div>
  );
}

const dateStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.06)', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 8px', fontSize: 12 };

function Line({ label, value, color, bold, dim }: { label: string; value: string; color?: string; bold?: boolean; dim?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: bold ? '1px solid rgba(255,255,255,0.1)' : 'none', marginTop: bold ? 4 : 0 }}>
      <span style={{ color: dim ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.6)', fontSize: dim ? 11 : 12.5, paddingLeft: dim ? 8 : 0 }}>{label}</span>
      <span style={{ color: color ?? '#fff', fontWeight: bold ? 900 : 700, fontSize: 13, fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

function DiffLine({ label, value }: { label: string; value: number }) {
  const off = Math.abs(value) >= 0.01;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
      <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12.5 }}>{label}</span>
      <span style={{ color: off ? '#fbbf24' : '#4ade80', fontWeight: 800, fontSize: 13, fontFamily: 'monospace' }}>{off ? bsd(value) : '✓ matched'}</span>
    </div>
  );
}
