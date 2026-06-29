'use client';

// app/spinytails/freezer-log/page.tsx  (G15)
//
// Freezer temperature log — record blast + holding freezer temps 3x/day.
// Tablet-optimized operator station. Shows today's progress per freezer +
// flags excursions (reading above the freezer ceiling) for corrective action.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Freezer = { code: string; label: string; maxF: number; target: number };
type Reading = { id: string; location: string; reading_f: number; within_limit: boolean; logged_at: string; action_if_fail: string | null; notes: string | null };

export default function FreezerLogPage() {
  const [freezers, setFreezers] = useState<Freezer[]>([]);
  const [today, setToday] = useState<Reading[]>([]);
  const [auth, setAuth] = useState<'checking' | 'no' | 'ok'>('checking');
  const [sel, setSel] = useState('');
  const [reading, setReading] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAuth('no'); return; }
    const res = await fetch('/api/spinytails/freezer-temp', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) { setAuth('no'); return; }
    setFreezers(j.freezers as Freezer[]); setToday(j.today as Reading[]);
    if (!sel && (j.freezers as Freezer[]).length) setSel((j.freezers as Freezer[])[0].code);
    setAuth('ok');
  }, [sel]);
  useEffect(() => { load(); }, [load]);

  async function record() {
    setBusy(true); setMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/spinytails/freezer-temp', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ freezer: sel, reading_f: Number(reading), notes: notes.trim() || undefined }),
    });
    const j = await res.json().catch(() => ({ ok: false }));
    setBusy(false);
    if (!res.ok || !j.ok) { setMsg({ text: j.error || 'Failed', ok: false }); return; }
    setMsg({ text: j.within_limit ? '✓ Logged — within limit' : '⚠ Logged — EXCURSION, take corrective action', ok: j.within_limit });
    setReading(''); setNotes(''); load();
  }

  if (auth === 'checking') return <Center>Checking…</Center>;
  if (auth === 'no') return <Center>Processing staff only. <Link href="/staff-login?next=/spinytails/freezer-log" style={{ color: '#1a2e5a', textDecoration: 'underline' }}>Sign in →</Link></Center>;

  const countFor = (code: string) => today.filter((t) => t.location === code).length;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: 16, fontFamily: 'system-ui', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0b1628', margin: 0 }}>🌡️ Freezer Temp Log</h1>
        <Link href="/spinytails" style={{ fontSize: 12, color: '#64748b' }}>← Spiny Tail</Link>
      </div>

      {/* Today's progress per freezer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {freezers.map((f) => {
          const n = countFor(f.code); const done = n >= f.target;
          return (
            <div key={f.code} style={{ ...sec, borderColor: done ? '#16a34a' : '#e2e8f0' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0b1628' }}>{f.label}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>limit ≤ {f.maxF}°F</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: done ? '#16a34a' : '#d97706', marginTop: 4 }}>{n}/{f.target} <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>today</span></div>
            </div>
          );
        })}
      </div>

      {/* Record form */}
      <div style={sec}>
        <div style={lbl}>Freezer</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {freezers.map((f) => (
            <button key={f.code} onClick={() => setSel(f.code)} style={{ flex: 1, padding: 12, borderRadius: 10, fontWeight: 800, border: '2px solid', borderColor: sel === f.code ? '#0b1628' : '#cbd5e1', background: sel === f.code ? '#0b1628' : '#fff', color: sel === f.code ? '#fff' : '#0b1628' }}>{f.label}</button>
          ))}
        </div>
        <div style={lbl}>Reading (°F)</div>
        <input type="number" inputMode="decimal" value={reading} onChange={(e) => setReading(e.target.value)} placeholder="e.g. -5" style={inp} />
        <div style={lbl}>Notes (optional)</div>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. door left open — corrected" style={inp} />
        <button onClick={record} disabled={busy || reading === ''} style={{ ...inp, background: busy ? '#94a3b8' : '#f5c518', color: '#0b1628', fontWeight: 900, cursor: 'pointer', textAlign: 'center', border: 'none', marginTop: 6 }}>{busy ? 'Saving…' : '🌡️ Record temperature'}</button>
        {msg && <div style={{ marginTop: 8, fontWeight: 700, fontSize: 13, color: msg.ok ? '#16a34a' : '#dc2626' }}>{msg.text}</div>}
      </div>

      {/* Today's readings */}
      <div style={sec}>
        <div style={lbl}>Today&apos;s readings</div>
        {today.length === 0 ? <div style={{ fontSize: 13, color: '#64748b' }}>None yet.</div> : today.map((t) => {
          const f = freezers.find((x) => x.code === t.location);
          return (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: '1px solid #eee', fontSize: 13 }}>
              <span>{f?.label ?? t.location} · <strong style={{ color: t.within_limit ? '#16a34a' : '#dc2626' }}>{t.reading_f}°F</strong>{!t.within_limit && <span style={{ color: '#dc2626', fontWeight: 700 }}> · EXCURSION</span>}</span>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>{new Date(t.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) { return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>{children}</div>; }
const sec: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, marginBottom: 12 };
const inp: React.CSSProperties = { width: '100%', padding: '12px', fontSize: 16, border: '2px solid #cbd5e1', borderRadius: 10, marginBottom: 8, boxSizing: 'border-box' };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 };
