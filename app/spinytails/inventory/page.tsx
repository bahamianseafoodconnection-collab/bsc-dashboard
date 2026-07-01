'use client';

// /spinytails/inventory — finished-goods inventory (0°F holding).
//
// Real-time on-hand counts per product / size / freezer from spinytails_cases
// (status='in_holding'), FIFO-ordered by Best-Used-By (oldest first, expiring
// flagged), plus barcode scan-OUT (Tera HID): scan a case → it ships and an
// inventory 'out' movement is logged with a destination.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ROLES = ['founder','co_founder','control_admin','manager','processor','receiver','qc_staff','operations'];

interface Case {
  id: string; case_code: string; product_type: string; grade: string | null; conch_clean_pct: number | null;
  net_weight_lbs: number; best_used_by: string | null; freezer_location: string | null; status: string;
}

const GRADE_LABEL: Record<string, string> = {
  '5oz':'5oz','6oz':'6oz','7oz':'7oz','8oz':'8oz','9oz':'9oz',
  '10_12oz':'10–12oz','12_14oz':'12–14oz','14_16oz':'14–16oz','16_20oz':'16–20oz','20oz_plus':'20oz+','not_for_export':'not-for-export',
};
function sizeLabel(c: Case): string {
  if (c.product_type === 'conch') return c.conch_clean_pct ? `${c.conch_clean_pct}% · ${c.net_weight_lbs}lb` : `${c.net_weight_lbs}lb`;
  return c.grade ? (GRADE_LABEL[c.grade] ?? c.grade) : `${c.net_weight_lbs}lb`;
}
function daysTo(d: string | null): number | null {
  if (!d) return null;
  const t = new Date(d + 'T00:00:00'); if (isNaN(t.getTime())) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}

export default function InventoryPage() {
  const [auth, setAuth] = useState<'checking'|'no'|'forbidden'|'ok'>('checking');
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [scan, setScan] = useState('');
  const [dest, setDest] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => { (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAuth('no'); return; }
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    const role = (prof as { role?: string | null } | null)?.role ?? null;
    if (!role || !ROLES.includes(role)) { setAuth('forbidden'); return; }
    setAuth('ok'); await load();
  })(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('spinytails_cases')
      .select('id, case_code, product_type, grade, conch_clean_pct, net_weight_lbs, best_used_by, freezer_location, status')
      .eq('status', 'in_holding').order('best_used_by', { ascending: true, nullsFirst: false });
    setCases((data ?? []) as Case[]);
    setLoading(false);
  }

  function flash(ok: boolean, msg: string) { setToast({ ok, msg }); setTimeout(() => setToast(null), 3500); }

  // On-hand grouped by product · size · freezer.
  const groups = useMemo(() => {
    const m = new Map<string, { product: string; size: string; freezer: string; cases: number; lbs: number; earliest: string | null }>();
    for (const c of cases) {
      const key = `${c.product_type}|${sizeLabel(c)}|${c.freezer_location ?? '—'}`;
      const g = m.get(key) ?? { product: c.product_type, size: sizeLabel(c), freezer: c.freezer_location ?? '—', cases: 0, lbs: 0, earliest: null };
      g.cases += 1; g.lbs += Number(c.net_weight_lbs) || 0;
      if (c.best_used_by && (!g.earliest || c.best_used_by < g.earliest)) g.earliest = c.best_used_by;
      m.set(key, g);
    }
    return Array.from(m.values()).sort((a, b) => a.product.localeCompare(b.product) || a.size.localeCompare(b.size));
  }, [cases]);

  const totals = useMemo(() => ({ cases: cases.length, lbs: cases.reduce((s, c) => s + (Number(c.net_weight_lbs) || 0), 0) }), [cases]);

  async function scanOut(code: string) {
    const c = code.trim(); if (!c) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ action: 'scan_out', case_code: c, destination: dest || 'shipped' }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (j.already_out) flash(true, `↔ ${c} was already out`);
      else flash(true, `✓ OUT ${c} → ${j.destination}`);
      setScan(''); scanRef.current?.focus();
      await load();
    } catch (e) {
      flash(false, e instanceof Error ? e.message : 'Scan-out failed');
    } finally { setBusy(false); }
  }

  if (auth === 'checking') return <C>Checking…</C>;
  if (auth === 'no') return <C>Sign in required. <Link href="/staff-login?next=/spinytails/inventory" style={{ color: '#1a2e5a', textDecoration: 'underline' }}>Sign in →</Link></C>;
  if (auth === 'forbidden') return <C>Processing staff only.</C>;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: 16, fontFamily: 'system-ui', maxWidth: 760, margin: '0 auto' }}>
      {toast && <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 50, padding: '10px 18px', borderRadius: 10, fontWeight: 800, background: toast.ok ? '#dcfce7' : '#fee2e2', color: toast.ok ? '#166534' : '#991b1b', border: `2px solid ${toast.ok ? '#16a34a' : '#dc2626'}` }}>{toast.msg}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0b1628', margin: 0 }}>📦 Finished Inventory (0°F holding)</h1>
        <Link href="/spinytails" style={{ fontSize: 12, color: '#64748b' }}>← Spiny Tail</Link>
      </div>

      {/* Scan-out */}
      <div style={sec}>
        <div style={lbl}>Scan case OUT (Tera barcode)</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') scanOut(scan); }}
            placeholder="scan / type case barcode + Enter" autoComplete="off" autoFocus style={{ ...inp, marginTop: 0, flex: 1, fontFamily: 'monospace' }} />
          <button onClick={() => scanOut(scan)} disabled={busy || !scan.trim()} style={{ ...inp, marginTop: 0, width: 120, background: '#0b1628', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>OUT →</button>
        </div>
        <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="destination (customer / shipment / order) — optional" style={inp} />
      </div>

      <div style={{ ...sec, display: 'flex', gap: 20, alignItems: 'center' }}>
        <div><div style={lbl}>On hand</div><div style={{ fontSize: 24, fontWeight: 900, color: '#0b1628' }}>{totals.cases} cases</div></div>
        <div><div style={lbl}>Weight</div><div style={{ fontSize: 24, fontWeight: 900, color: '#0b1628' }}>{totals.lbs} lb</div></div>
        <button onClick={load} style={{ marginLeft: 'auto', ...inp, marginTop: 0, width: 90, background: '#fff', border: '2px solid #cbd5e1', fontWeight: 800, cursor: 'pointer' }}>↻ Refresh</button>
      </div>

      {/* On-hand groups */}
      <div style={sec}>
        <div style={lbl}>On hand · by product / size / freezer (FIFO)</div>
        {loading && <div style={{ color: '#64748b', marginTop: 8 }}>Loading…</div>}
        {!loading && groups.length === 0 && <div style={{ color: '#64748b', marginTop: 8 }}>Nothing in holding yet — grade / pack a batch first.</div>}
        <div style={{ marginTop: 8 }}>
          {groups.map((g, i) => {
            const d = daysTo(g.earliest);
            const flag = d != null && d < 0 ? { c: '#b91c1c', t: `EXPIRED ${-d}d` } : d != null && d <= 30 ? { c: '#b45309', t: `${d}d left` } : null;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #eef2f7' }}>
                <span style={{ fontSize: 18 }}>{g.product === 'conch' ? '🐚' : '🦞'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: '#0b1628', textTransform: 'capitalize' }}>{g.product} · {g.size}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{g.freezer}{g.earliest ? ` · FIFO use-by ${g.earliest}` : ''}</div>
                </div>
                {flag && <span style={{ fontSize: 11, fontWeight: 800, color: flag.c, background: `${flag.c}18`, padding: '2px 8px', borderRadius: 999 }}>{flag.t}</span>}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 900, fontSize: 16, color: '#0b1628' }}>{g.cases}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{g.lbs} lb</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function C({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>{children}</div>;
}

const sec: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 14 };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 };
const inp: React.CSSProperties = { width: '100%', padding: 12, fontSize: 15, border: '2px solid #cbd5e1', borderRadius: 10, marginTop: 6, boxSizing: 'border-box' };
