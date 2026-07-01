'use client';

// app/founder/directives/page.tsx
//
// Directives composer (founder/co_founder only, API-enforced). Simple flow:
// pick WHO it goes to (a group broadcast or a named person), write the message
// (English + optional Creole / Spanish — recipient sees their own language),
// hit Issue. Each recipient's dashboard shows it; they mark Seen (auto on view)
// + Done (button) and the founder sees the receipt here (who + when).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Target = { target_type: 'user' | 'role' | 'location'; target_value: string };
type DoneReceipt = { name: string; done_at: string };
type Directive = { id: string; kind: string; title: string; body: string | null; priority: string; status: string; created_at: string; targets: Target[]; seen_count: number; done_count: number; done_receipts: DoneReceipt[] };
type Staff = { id: string; full_name: string | null; email: string | null; role: string | null };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';

// Group broadcasts (role targets). Named people are appended from the staff list.
const GROUPS: { value: string; label: string }[] = [
  { value: 'role:processor',        label: 'Processors (all)' },
  { value: 'role:andros_staff',     label: 'Andros staff' },
  { value: 'role:supplier_handler', label: 'Supplier Handlers' },
  { value: 'role:cashier',          label: 'Cashiers' },
  { value: 'role:receiver',         label: 'Receivers' },
  { value: 'role:qc_staff',         label: 'QC staff' },
  { value: 'role:operations',       label: 'Operations' },
  { value: 'role:driver',           label: 'Drivers' },
  { value: 'role:right_hand',       label: 'Right hand' },
];

async function api(path: string, init?: RequestInit) {
  const { data: { session } } = await sb().auth.getSession();
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

export default function DirectivesPage() {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [recipient, setRecipient] = useState('');
  const [body, setBody] = useState('');
  const [bodyCr, setBodyCr] = useState('');
  const [bodyEs, setBodyEs] = useState('');
  const [showTx, setShowTx] = useState(false);

  const load = useCallback(async () => {
    const j = await api('/api/founder/directives');
    if (!j.ok) { setError(j.error || 'Load failed (founder only)'); return; }
    setDirectives(j.directives as Directive[]); setStaff(j.staff as Staff[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  function labelTarget(t: Target) {
    if (t.target_type === 'user') { const s = staff.find((x) => x.id === t.target_value); return `👤 ${s?.full_name || s?.email || 'person'}`; }
    return `🏷 ${GROUPS.find(g => g.value === `role:${t.target_value}`)?.label ?? t.target_value}`;
  }

  async function submit() {
    setError(null);
    if (!recipient) { setError('Choose who this goes to.'); return; }
    if (!body.trim()) { setError('Write the message.'); return; }
    const idx = recipient.indexOf(':');
    const ttype = recipient.slice(0, idx); const tvalue = recipient.slice(idx + 1);
    const targets: Target[] = [{ target_type: ttype === 'user' ? 'user' : 'role', target_value: tvalue }];
    const title = body.trim().split('\n')[0].slice(0, 90);
    setBusy(true);
    const j = await api('/api/founder/directives', { method: 'POST', body: JSON.stringify({
      kind: 'task', title, body: body.trim(), body_cr: bodyCr.trim(), body_es: bodyEs.trim(), priority: 'normal',
      due_date: null, recurrence: null, targets,
    }) });
    setBusy(false);
    if (!j.ok) { setError(j.error || 'Issue failed'); return; }
    setBody(''); setBodyCr(''); setBodyEs(''); setRecipient(''); setShowTx(false);
    load();
  }

  async function close(id: string, action: 'close' | 'reopen') {
    await api('/api/founder/directives', { method: 'PATCH', body: JSON.stringify({ id, action }) });
    load();
  }

  const when = (s: string) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>📋 Directives</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Issue a task to a person or a whole group. One-way.</div></div>
          <Link href="/dashboard" style={pill}>← Dashboard</Link>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}

        {/* Composer */}
        <div style={card}>
          <div style={lbl}>This goes to</div>
          <select value={recipient} onChange={(e) => setRecipient(e.target.value)} style={input}>
            <option value="">— choose recipient —</option>
            <optgroup label="Broadcast to a group">
              {GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </optgroup>
            <optgroup label="Send to a person">
              {staff.map(s => <option key={s.id} value={`user:${s.id}`}>{s.full_name || s.email} ({s.role})</option>)}
            </optgroup>
          </select>

          <div style={{ ...lbl, marginTop: 6 }}>Message (English)</div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type the task…" style={{ ...input, minHeight: 70 }} />

          <button onClick={() => setShowTx(s => !s)} style={{ ...chip, fontSize: 12, marginBottom: 8 }}>
            {showTx ? '▾ Hide translations' : '🌐 Add Creole / Spanish (optional)'}
          </button>
          {showTx && (
            <>
              <div style={lbl}>Kreyòl (Creole)</div>
              <textarea value={bodyCr} onChange={(e) => setBodyCr(e.target.value)} placeholder="Falls back to English if blank" style={{ ...input, minHeight: 48 }} />
              <div style={lbl}>Español (Spanish)</div>
              <textarea value={bodyEs} onChange={(e) => setBodyEs(e.target.value)} placeholder="Falls back to English if blank" style={{ ...input, minHeight: 48 }} />
            </>
          )}

          <button onClick={submit} disabled={busy} style={{ ...chip, marginTop: 4, width: '100%', background: GOLD, color: INK, fontWeight: 900, padding: 13, opacity: busy ? 0.5 : 1 }}>{busy ? 'Issuing…' : '🔔 Issue Directive'}</button>
        </div>

        {/* Issued list + receipts */}
        <div style={{ fontSize: 13, fontWeight: 900, color: GOLD, textTransform: 'uppercase', letterSpacing: 1, margin: '14px 0 8px' }}>Issued ({directives.length})</div>
        {directives.map((d) => (
          <div key={d.id} style={{ ...card, opacity: d.status === 'closed' ? 0.55 : 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{d.title}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
              seen {d.seen_count} · <b style={{ color: '#4ade80' }}>done {d.done_count}</b> · {when(d.created_at)}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>{d.targets.map((t, i) => <span key={i} style={{ background: '#0d1f3c', borderRadius: 16, padding: '2px 8px', fontSize: 11, color: '#cbd5e1' }}>{labelTarget(t)}</span>)}</div>
            {d.done_receipts.length > 0 && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #16243f' }}>
                {d.done_receipts.map((r, i) => <div key={i} style={{ fontSize: 12, color: '#4ade80' }}>✓ {r.name} · {when(r.done_at)}</div>)}
              </div>
            )}
            <button onClick={() => close(d.id, d.status === 'closed' ? 'reopen' : 'close')} style={{ ...chip, marginTop: 8, fontSize: 12 }}>{d.status === 'closed' ? 'Reopen' : '✓ Close'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
const card: React.CSSProperties = { background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 10 };
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: `1px solid ${BORDER}`, color: '#fff', fontSize: 15, marginBottom: 8, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 };
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 12px' };
const chip: React.CSSProperties = { background: 'transparent', border: `1px solid ${BORDER}`, color: '#cbd5e1', borderRadius: 8, padding: '8px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
