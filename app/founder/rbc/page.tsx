'use client';

// /founder/rbc — RBC Daily Payment Confirmation Portal (automatic).
// RBC's 6:30am Merchant POS report is pushed to /api/rbc/inbound (Gmail Apps
// Script or inbound provider), parsed, and matched to online orders by auth
// code + amount; pending orders are recovered to PAID. Confirms payment only.

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const GOLD = '#f5c518';
const INK = '#060d1f';
const CARD = '#0f1a2e';
const BORDER = 'rgba(255,255,255,0.1)';

type Txn = Record<string, unknown> & { id: string; amount: number | null; auth_code: string | null; trace_number: string | null; txn_date: string | null; card_type: string | null; suggestions?: { id: string; total: number | null; customer_name: string | null; created_at: string; channel: string | null }[]; order?: { customer_name: string | null; payment_status: string | null } | null };
type Resp = {
  ok: boolean;
  inbound: { active: boolean; endpoint: string; token: string | null; last_email_report_at: string | null; status: string };
  summary: { reports: number; transactions: number; matched: number; unmatched: number; confirmed_amount: number };
  reports: Array<{ id: string; file_name: string | null; file_url: string | null; processing_date: string | null; source: string; transaction_count: number; matched_count: number; recovered_count: number; created_at: string }>;
  matched: Txn[];
  unmatched: Txn[];
};

const bsd = (n: number | null | undefined) => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function RbcPortal() {
  const router = useRouter();
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const [d, setD] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const tok = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null, [supabase]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const t = await tok();
      if (!t) { router.push('/staff-login?next=/founder/rbc'); return; }
      const res = await fetch('/api/rbc/portal', { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setD(j as Resp);
      if (!j.inbound?.active || j.inbound?.status !== 'auto_active') setShowSetup(true);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [tok, router]);
  useEffect(() => { load(); }, [load]);

  async function copy(text: string, label: string) { try { await navigator.clipboard.writeText(text); flash(`${label} copied`); } catch { flash('Copy failed'); } }

  async function match(txnId: string, orderId: string) {
    const t = await tok();
    const res = await fetch('/api/rbc/portal', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ txn_id: txnId, order_id: orderId }) });
    const j = await res.json();
    if (!res.ok || !j.ok) { flash(j.error || 'Match failed'); return; }
    flash(j.recovered ? '✓ Matched + order marked PAID' : '✓ Matched'); await load();
  }

  async function uploadFallback(file: File) {
    const t = await tok();
    const b64 = await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsDataURL(file); });
    const res = await fetch('/api/rbc/import', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ file_base64: b64, file_name: file.name }) });
    const j = await res.json();
    if (!res.ok || !j.ok) { flash(j.error || 'Import failed'); return; }
    flash(`Imported ${j.parsed} · ${j.matched} matched · ${j.recovered} recovered`); await load();
  }

  const inbound = d?.inbound;
  const statusInfo = inbound?.status === 'auto_active' ? { c: '#4ade80', t: 'Auto payment confirmation ACTIVE', i: '🟢' }
    : inbound?.status === 'waiting_for_first_email' ? { c: GOLD, t: 'Connected — waiting for first RBC report', i: '🟡' }
    : { c: 'rgba(255,255,255,0.5)', t: 'Not connected — set up auto-confirmation below', i: '⚪' };

  const appsScript = `function pushRbcReport() {
  var ENDPOINT = '${inbound?.endpoint ?? 'https://www.bscbahamas.com/api/rbc/inbound'}';
  var TOKEN = '${inbound?.token ?? 'SET_RBC_INBOUND_TOKEN_IN_VERCEL'}';
  var threads = GmailApp.search('has:attachment filename:docx newer_than:2d (RBCC OR "Merchant Services Point of Sale")');
  threads.forEach(function (th) {
    th.getMessages().forEach(function (m) {
      m.getAttachments().forEach(function (a) {
        if (a.getName().toLowerCase().indexOf('.docx') === -1) return;
        UrlFetchApp.fetch(ENDPOINT, { method: 'post', contentType: 'application/json',
          payload: JSON.stringify({ token: TOKEN, file_name: a.getName(), file_base64: Utilities.base64Encode(a.getBytes()) }),
          muteHttpExceptions: true });
      });
    });
  });
}`;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header style={{ backgroundColor: INK, padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/founder')} style={{ background: 'transparent', color: GOLD, border: `1px solid rgba(245,197,24,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 18 }}>🏦 RBC Payment Confirmation</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Auto-matches the daily RBC report to online orders</div>
          </div>
          <button onClick={load} disabled={loading} style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{loading ? '…' : '↻'}</button>
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {err && <div style={{ padding: 14, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>⚠️ {err}{/rbc_reports|rbc_transactions|relation|does not exist/i.test(err) ? ' — run the RBC tables SQL first.' : ''}</div>}

        {/* Status */}
        <div style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{statusInfo.i}</span>
            <div><div style={{ color: statusInfo.c, fontWeight: 900, fontSize: 14 }}>{statusInfo.t}</div>
              {inbound?.last_email_report_at && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Last RBC email: {String(inbound.last_email_report_at).slice(0, 16).replace('T', ' ')}</div>}</div>
          </div>
          <button onClick={() => setShowSetup(s => !s)} style={{ background: GOLD, color: INK, border: 'none', borderRadius: 10, padding: '9px 14px', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>{showSetup ? 'Hide setup' : 'Connect RBC →'}</button>
        </div>

        {/* Setup guide */}
        {showSetup && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16 }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: INK, marginBottom: 6 }}>How Founder connects RBC reports to the system</div>
            {!inbound?.active && <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 10, fontSize: 12.5, color: '#9a3412', marginBottom: 12 }}>⚠️ First, set a secret <code>RBC_INBOUND_TOKEN</code> in Vercel env (any long random string), then redeploy. The endpoint + token will appear here.</div>}

            <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.7 }}>
              <strong>A. Receiving endpoint</strong> (where the report is pushed):
              <CopyRow label="Endpoint" value={inbound?.endpoint ?? ''} onCopy={copy} />
              <CopyRow label="Token" value={inbound?.token ?? '(set RBC_INBOUND_TOKEN in Vercel)'} onCopy={copy} mono />

              <div style={{ marginTop: 14 }}><strong>B. Automatic delivery — Gmail Apps Script</strong> (the report already arrives in your inbox at 6:30am):</div>
              <ol style={{ paddingLeft: 18, margin: '6px 0' }}>
                <li>Open <a href="https://script.google.com" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>script.google.com</a> → New project (signed in as the inbox that receives the RBC email).</li>
                <li>Paste the script below (endpoint + token already filled in).</li>
                <li>Triggers ⏰ → Add trigger → <em>pushRbcReport</em> · Time-driven · Day timer · 7am–8am.</li>
                <li>Run once to authorize. Done — every morning the report auto-pushes here.</li>
              </ol>
              <pre style={{ background: '#0a1220', color: '#e2e8f0', borderRadius: 8, padding: 12, fontSize: 11, overflow: 'auto', maxHeight: 220 }}>{appsScript}</pre>
              <button onClick={() => copy(appsScript, 'Apps Script')} style={{ background: '#0f1a2e', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Copy script</button>

              <div style={{ marginTop: 14 }}><strong>C. RBC notification settings</strong> (so the report + alerts are sent): RBC Online Banking → More → Manage Notifications → Alerts &amp; Notifications → confirm email active → turn on Transaction &amp; Payment notifications (Failed Payments, Payments Awaiting Approval, Rejected by Approver, Expired Payments, Merchant/POS report alerts) → Save → send a test.</div>
              <div style={{ marginTop: 10, fontSize: 11.5, color: '#64748b' }}>Status flow: Not connected → Waiting for first RBC report → Auto confirmation active. (You can also drop a report file below to re-process manually.)</div>
              <label style={{ display: 'inline-block', marginTop: 8, background: '#f1f5f9', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                ⬆ Re-upload a report
                <input type="file" accept=".docx" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadFallback(f); e.currentTarget.value = ''; }} />
              </label>
            </div>
          </div>
        )}

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <Tile label="Reports" value={String(d?.summary.reports ?? 0)} c="#fff" />
          <Tile label="Transactions" value={String(d?.summary.transactions ?? 0)} c="#fff" />
          <Tile label="Auto-matched" value={String(d?.summary.matched ?? 0)} c="#4ade80" />
          <Tile label="Unmatched" value={String(d?.summary.unmatched ?? 0)} c={(d?.summary.unmatched ?? 0) > 0 ? '#f87171' : '#4ade80'} />
          <Tile label="Confirmed $" value={bsd(d?.summary.confirmed_amount)} c={GOLD} />
        </div>

        {/* Unmatched — manual review */}
        <section style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', color: '#fff', fontWeight: 900, fontSize: 14 }}>⚠️ Unmatched payments — review</div>
          {(d?.unmatched.length ?? 0) === 0 ? <div style={{ padding: 18, color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center' }}>{loading ? 'Loading…' : 'Everything matched 🎉'}</div>
            : d!.unmatched.map(t => (
              <div key={t.id} style={{ padding: '11px 14px', borderTop: `1px solid ${BORDER}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: '#e2e8f0', fontSize: 12.5 }}>{t.txn_date} · auth <span style={{ fontFamily: 'monospace', color: GOLD }}>{t.auth_code || '—'}</span> · {t.card_type}</span>
                  <span style={{ color: '#fff', fontWeight: 800 }}>{bsd(t.amount)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {(t.suggestions ?? []).length === 0 ? <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>No pending order at this amount.</span>
                    : t.suggestions!.map(s => (
                      <button key={s.id} onClick={() => match(t.id, s.id)} style={{ background: 'rgba(74,222,128,0.14)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.4)', borderRadius: 7, padding: '4px 9px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                        Link → {s.customer_name || 'order'} {bsd(s.total)} ({String(s.created_at).slice(5, 10)})
                      </button>
                    ))}
                </div>
              </div>
            ))}
        </section>

        {/* Auto-matched */}
        <section style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', color: '#fff', fontWeight: 900, fontSize: 14 }}>✅ Auto-matched (paid)</div>
          {(d?.matched.length ?? 0) === 0 ? <div style={{ padding: 18, color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center' }}>None yet.</div>
            : d!.matched.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '9px 14px', borderTop: `1px solid ${BORDER}`, fontSize: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.55)' }}>{t.txn_date} · {t.order?.customer_name || 'order'} · auth <span style={{ fontFamily: 'monospace' }}>{t.auth_code}</span></span>
                <span style={{ color: '#4ade80', fontWeight: 800 }}>{bsd(t.amount)}</span>
              </div>
            ))}
        </section>

        {/* Reports / file storage */}
        <section style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', color: '#fff', fontWeight: 900, fontSize: 14 }}>🗄 Report files (audit)</div>
          {(d?.reports.length ?? 0) === 0 ? <div style={{ padding: 18, color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center' }}>No reports yet.</div>
            : d!.reports.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '9px 14px', borderTop: `1px solid ${BORDER}`, fontSize: 12, alignItems: 'center' }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.source === 'email' ? '📧' : '⬆'} {r.file_name} · {r.transaction_count} txns · {r.matched_count} matched{r.recovered_count ? ` · ${r.recovered_count} recovered` : ''}</span>
                {r.file_url && <a href={r.file_url} target="_blank" rel="noreferrer" style={{ color: GOLD, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>open ↗</a>}
              </div>
            ))}
        </section>
      </main>
      {toast && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#0f1a2e', color: '#fff', borderRadius: 10, padding: '10px 16px', fontSize: 12.5, fontWeight: 700, zIndex: 80, border: `1px solid ${GOLD}` }}>{toast}</div>}
    </div>
  );
}

function Tile({ label, value, c }: { label: string; value: string; c: string }) {
  return <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 14 }}><div style={{ color: c, fontWeight: 900, fontSize: 19 }}>{value}</div><div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>{label}</div></div>;
}
function CopyRow({ label, value, onCopy, mono }: { label: string; value: string; onCopy: (v: string, l: string) => void; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
      <span style={{ fontSize: 11, color: '#64748b', width: 64 }}>{label}</span>
      <code style={{ flex: 1, background: '#f1f5f9', borderRadius: 6, padding: '6px 8px', fontSize: 11, fontFamily: mono ? 'monospace' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</code>
      <button onClick={() => onCopy(value, label)} style={{ background: '#0f1a2e', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>copy</button>
    </div>
  );
}
