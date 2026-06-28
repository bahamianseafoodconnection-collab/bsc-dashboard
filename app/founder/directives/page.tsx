'use client';

// app/founder/directives/page.tsx
//
// Directives composer — founder/co_founder only (API-enforced). Author a task
// (one-off, due date) or a recurring duty, in up to 3 languages (EN / Kreyòl /
// Español — manual fields), target it to named users / roles / locations, and
// track seen + done counts. Close when complete.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type Target = { target_type: 'user' | 'role' | 'location'; target_value: string };
type Directive = { id: string; kind: string; title: string; priority: string; status: string; due_date: string | null; recurrence: { freq?: string } | null; created_at: string; targets: Target[]; seen_count: number; done_count: number };
type Staff = { id: string; full_name: string | null; email: string | null; role: string | null };
type Loc = { code: string; name: string };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }
const INK = '#060d1f', GOLD = '#f5c518', BORDER = '#1e3a5f';
const ROLES = ['cashier', 'andros_staff', 'manager', 'supervisor', 'processor', 'qc_staff', 'operations', 'driver', 'receiver', 'right_hand', 'supplier_handler', 'supplier'];

async function api(path: string, init?: RequestInit) {
  const { data: { session } } = await sb().auth.getSession();
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

export default function DirectivesPage() {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // form
  const [kind, setKind] = useState<'task' | 'duty'>('task');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(''); const [bodyCr, setBodyCr] = useState(''); const [bodyEs, setBodyEs] = useState('');
  const [priority, setPriority] = useState('normal');
  const [dueDate, setDueDate] = useState('');
  const [freq, setFreq] = useState('daily');
  const [targets, setTargets] = useState<Target[]>([]);
  const [tType, setTType] = useState<'role' | 'location' | 'user'>('role');
  const [tValue, setTValue] = useState('');

  const load = useCallback(async () => {
    const j = await api('/api/founder/directives');
    if (!j.ok) { setError(j.error || 'Load failed (founder only)'); return; }
    setDirectives(j.directives as Directive[]); setStaff(j.staff as Staff[]); setLocations(j.locations as Loc[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  function addTarget() {
    if (!tValue) return;
    if (targets.some((t) => t.target_type === tType && t.target_value === tValue)) return;
    setTargets((p) => [...p, { target_type: tType, target_value: tValue }]); setTValue('');
  }
  function labelTarget(t: Target) {
    if (t.target_type === 'user') { const s = staff.find((x) => x.id === t.target_value); return `👤 ${s?.full_name || s?.email || t.target_value.slice(0, 8)}`; }
    if (t.target_type === 'location') { const l = locations.find((x) => x.code === t.target_value); return `📍 ${l?.name || t.target_value}`; }
    return `🏷 ${t.target_value}`;
  }

  async function submit() {
    setError(null);
    if (!title.trim()) { setError('Title required.'); return; }
    if (targets.length === 0) { setError('Add at least one target.'); return; }
    setBusy(true);
    const j = await api('/api/founder/directives', { method: 'POST', body: JSON.stringify({
      kind, title: title.trim(), body, body_cr: bodyCr, body_es: bodyEs, priority,
      due_date: kind === 'task' ? dueDate : null, recurrence: kind === 'duty' ? { freq } : null, targets,
    }) });
    setBusy(false);
    if (!j.ok) { setError(j.error || 'Create failed'); return; }
    setTitle(''); setBody(''); setBodyCr(''); setBodyEs(''); setDueDate(''); setTargets([]); setPriority('normal');
    load();
  }

  async function close(id: string, action: 'close' | 'reopen') {
    await api('/api/founder/directives', { method: 'PATCH', body: JSON.stringify({ id, action }) });
    load();
  }

  return (
    <div style={{ minHeight: '100vh', background: INK, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16, paddingBottom: 80 }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><div style={{ color: GOLD, fontWeight: 900, fontSize: 22 }}>📋 Directives</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Assign tasks + recurring duties to staff. One-way board.</div></div>
          <Link href="/dashboard" style={pill}>← Dashboard</Link>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠ {error}</div>}

        {/* Composer */}
        <div style={card}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(['task', 'duty'] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} style={{ ...chip, background: kind === k ? GOLD : 'transparent', color: kind === k ? INK : '#cbd5e1' }}>{k === 'task' ? '✓ Task (one-off)' : '🔁 Duty (recurring)'}</button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={input} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body — English" style={{ ...input, minHeight: 54 }} />
          <textarea value={bodyCr} onChange={(e) => setBodyCr(e.target.value)} placeholder="Kreyòl (optional — falls back to English)" style={{ ...input, minHeight: 40 }} />
          <textarea value={bodyEs} onChange={(e) => setBodyEs(e.target.value)} placeholder="Español (optional — falls back to English)" style={{ ...input, minHeight: 40 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ ...input, flex: 1 }}>
              {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {kind === 'task'
              ? <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ ...input, flex: 1 }} />
              : <select value={freq} onChange={(e) => setFreq(e.target.value)} style={{ ...input, flex: 1 }}>{['daily', 'weekly', 'monthly'].map((f) => <option key={f} value={f}>every {f.replace('ly', '')}</option>)}</select>}
          </div>

          {/* Targets */}
          <div style={{ marginTop: 8, padding: 10, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}>WHO GETS THIS</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <select value={tType} onChange={(e) => { setTType(e.target.value as 'role' | 'location' | 'user'); setTValue(''); }} style={{ ...input, width: 110 }}>
                <option value="role">Role</option><option value="location">Location</option><option value="user">Person</option>
              </select>
              {tType === 'role' && <select value={tValue} onChange={(e) => setTValue(e.target.value)} style={{ ...input, flex: 1 }}><option value="">— role —</option>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>}
              {tType === 'location' && <select value={tValue} onChange={(e) => setTValue(e.target.value)} style={{ ...input, flex: 1 }}><option value="">— location —</option>{locations.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select>}
              {tType === 'user' && <select value={tValue} onChange={(e) => setTValue(e.target.value)} style={{ ...input, flex: 1 }}><option value="">— person —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email} ({s.role})</option>)}</select>}
              <button onClick={addTarget} style={chip}>＋ Add</button>
            </div>
            {targets.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {targets.map((t, i) => <span key={i} onClick={() => setTargets((p) => p.filter((_, j) => j !== i))} style={{ background: '#0d1f3c', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}>{labelTarget(t)} ✕</span>)}
            </div>}
          </div>

          <button onClick={submit} disabled={busy} style={{ ...chip, marginTop: 10, width: '100%', background: GOLD, color: INK, fontWeight: 900, padding: 12, opacity: busy ? 0.5 : 1 }}>{busy ? 'Sending…' : '📤 Issue directive'}</button>
        </div>

        {/* List */}
        <div style={{ fontSize: 13, fontWeight: 900, color: GOLD, textTransform: 'uppercase', letterSpacing: 1, margin: '14px 0 8px' }}>Issued ({directives.length})</div>
        {directives.map((d) => (
          <div key={d.id} style={{ ...card, opacity: d.status === 'closed' ? 0.55 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{d.kind === 'duty' ? '🔁' : '✓'} {d.title}</div>
              <div style={{ fontSize: 11, color: d.priority === 'urgent' ? '#f87171' : d.priority === 'high' ? '#fbbf24' : '#94a3b8', fontWeight: 700 }}>{d.priority.toUpperCase()}</div>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
              {d.kind === 'duty' ? `every ${(d.recurrence?.freq ?? 'day').replace('ly', '')}` : d.due_date ? `due ${d.due_date}` : 'no due date'} · seen {d.seen_count} · <b style={{ color: '#4ade80' }}>done {d.done_count}</b>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>{d.targets.map((t, i) => <span key={i} style={{ background: '#0d1f3c', borderRadius: 16, padding: '2px 8px', fontSize: 11, color: '#cbd5e1' }}>{labelTarget(t)}</span>)}</div>
            <button onClick={() => close(d.id, d.status === 'closed' ? 'reopen' : 'close')} style={{ ...chip, marginTop: 8, fontSize: 12 }}>{d.status === 'closed' ? 'Reopen' : '✓ Close'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
const card: React.CSSProperties = { background: '#0a1628', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 10 };
const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, background: '#111c33', border: `1px solid ${BORDER}`, color: '#fff', fontSize: 14, marginBottom: 8, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };
const pill: React.CSSProperties = { color: '#cbd5e1', fontSize: 13, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 12px' };
const chip: React.CSSProperties = { background: 'transparent', border: `1px solid ${BORDER}`, color: '#cbd5e1', borderRadius: 8, padding: '8px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
