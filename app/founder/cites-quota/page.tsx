'use client';

// app/founder/cites-quota/page.tsx  (G17)
//
// CITES export quota tracking. Set a ceiling per species + season; used is
// computed live from Spiny Tail export shipments in the period.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Quota = { id: string; species_code: string; period_label: string | null; period_start: string; period_end: string; ceiling_lbs: number; used_lbs: number; remaining_lbs: number; pct: number };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';

async function api(path: string, init?: RequestInit) {
  const { data: { session } } = await sb().auth.getSession();
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

export default function CitesQuotaPage() {
  const [rows, setRows] = useState<Quota[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ species_code: 'spiny_lobster', period_label: '', period_start: '', period_end: '', ceiling_lbs: '' });

  const load = useCallback(async () => {
    setError(null);
    const j = await api('/api/founder/cites-quota');
    if (!j.ok) { setError(j.error || 'Founder only'); return; }
    setRows(j.quotas as Quota[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setError(null);
    if (!f.period_start || !f.period_end || !(Number(f.ceiling_lbs) > 0)) { setError('Period + ceiling required.'); return; }
    setBusy(true);
    const j = await api('/api/founder/cites-quota', { method: 'POST', body: JSON.stringify({ ...f, ceiling_lbs: Number(f.ceiling_lbs) }) });
    setBusy(false);
    if (!j.ok) { setError(j.error || 'Save failed'); return; }
    setF({ species_code: 'spiny_lobster', period_label: '', period_start: '', period_end: '', ceiling_lbs: '' });
    load();
  }
  async function del(id: string) { await api('/api/founder/cites-quota', { method: 'POST', body: JSON.stringify({ action: 'delete', id }) }); load(); }

  const money = (n: number) => Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const barColor = (pct: number) => pct >= 100 ? '#dc2626' : pct >= 85 ? '#d97706' : '#16a34a';

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>📜 CITES Export Quota</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Lobster export vs the CITES ceiling. Used = shipped weight in the period.</div></div>
          <Link href="/founder" style={pill}>← Founder</Link>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}

        {rows.map((q) => (
          <div key={q.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{q.period_label || `${q.period_start} → ${q.period_end}`}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{q.species_code.replace(/_/g, ' ')} · {q.period_start} → {q.period_end}</div>
              </div>
              <button onClick={() => del(q.id)} style={{ ...pill, color: '#f87171', borderColor: '#7f1d1d', cursor: 'pointer', fontSize: 11 }}>Delete</button>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 12, background: '#111c33', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, q.pct)}%`, background: barColor(q.pct) }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
                <span style={{ color: barColor(q.pct), fontWeight: 800 }}>{money(q.used_lbs)} lb used ({q.pct}%)</span>
                <span style={{ color: '#94a3b8' }}>{money(q.remaining_lbs)} lb left of {money(q.ceiling_lbs)} lb</span>
              </div>
            </div>
          </div>
        ))}

        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: GOLD, marginBottom: 8 }}>+ Set / update a ceiling</div>
          <input value={f.period_label} onChange={(e) => setF({ ...f, period_label: e.target.value })} placeholder="Label (e.g. 2026 season)" style={input} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={f.species_code} onChange={(e) => setF({ ...f, species_code: e.target.value })} placeholder="species (spiny_lobster)" style={{ ...input, flex: 1 }} />
            <input value={f.ceiling_lbs} onChange={(e) => setF({ ...f, ceiling_lbs: e.target.value })} placeholder="ceiling (lb)" inputMode="decimal" style={{ ...input, flex: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}><div style={lbl}>Period start</div><input type="date" value={f.period_start} onChange={(e) => setF({ ...f, period_start: e.target.value })} style={input} /></div>
            <div style={{ flex: 1 }}><div style={lbl}>Period end</div><input type="date" value={f.period_end} onChange={(e) => setF({ ...f, period_end: e.target.value })} style={input} /></div>
          </div>
          <button onClick={save} disabled={busy} style={{ ...pill, width: '100%', background: GOLD, color: INK, fontWeight: 900, padding: 12, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>{busy ? 'Saving…' : '📜 Save ceiling'}</button>
        </div>
      </div>
    </div>
  );
}
const card: React.CSSProperties = { background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 10 };
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px' };
const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, background: '#111c33', border: `1px solid ${BORDER}`, color: '#fff', fontSize: 14, marginBottom: 8, boxSizing: 'border-box', outline: 'none' };
const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 };
