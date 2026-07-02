'use client';

// app/founder/processor-feed/page.tsx
//
// Founder live feed — read-only, time-sorted stream of every processor action
// (receiving, freezer pulls, processing steps, temperatures, boxing). Temp
// excursions surface in red. Auto-refreshes; management-gated by the API.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Ev = { at: string; kind: string; icon: string; batch: string; product: string | null; actor: string; detail: string; alert: boolean };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';

export default function ProcessorFeedPage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { session } } = await sb().auth.getSession();
    const res = await fetch('/api/founder/processor-feed', { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }, cache: 'no-store' });
    const j = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    setLoading(false);
    if (!j.ok) { setError(j.error || 'Load failed'); return; }
    setError(null); setEvents(j.events as Ev[]);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const when = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', { timeZone: 'America/Nassau', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const shown = alertsOnly ? events.filter(e => e.alert) : events;
  const alertCount = events.filter(e => e.alert).length;

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>📡 Processor Live Feed</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Every stage, real time · auto-refreshes</div>
          </div>
          <Link href="/dashboard" style={pill}>← Dashboard</Link>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <button onClick={() => setAlertsOnly(a => !a)} style={{ ...chip, borderColor: alertsOnly ? '#f87171' : BORDER, color: alertsOnly ? '#f87171' : '#cbd5e1' }}>
            🚨 Temp alerts {alertCount > 0 ? `(${alertCount})` : ''}{alertsOnly ? ' · on' : ''}
          </button>
          <button onClick={load} style={chip}>↻ Refresh</button>
        </div>

        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}
        {!loading && shown.length === 0 && !error && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{alertsOnly ? 'No temperature excursions. ✓' : 'No processor activity yet.'}</div>}

        <div style={{ display: 'grid', gap: 6 }}>
          {shown.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 10, background: e.alert ? 'rgba(248,113,113,0.10)' : '#0a1628', border: `1px solid ${e.alert ? 'rgba(248,113,113,0.5)' : BORDER}` }}>
              <span style={{ fontSize: 17, lineHeight: 1.3 }}>{e.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: e.alert ? '#f87171' : '#e2e8f0' }}>
                  <b style={{ color: e.alert ? '#f87171' : GOLD }}>{e.batch}</b>{e.product ? ` · ${e.product}` : ''} — {e.detail}
                </div>
                <div style={{ fontSize: 11.5, color: '#7e8ba3', marginTop: 1 }}>{when(e.at)} · {e.actor}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 12px' };
const chip: React.CSSProperties = { background: 'transparent', border: `1px solid ${BORDER}`, color: '#cbd5e1', borderRadius: 8, padding: '8px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
