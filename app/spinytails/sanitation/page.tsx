'use client';

// /spinytails/sanitation — Daily Sanitation Checklist (SSOP).
//
// The one Fisheries-packet record with no other source. Two grade columns:
// START-of-day + END-of-day, P/F per item, plus chlorine / sanitizer / footbath
// PPM readings. Structure mirrors the Bahamas-Fisheries form. Verified by one of
// the pool (Dedrick / TJ / Jaquel / Nicholson). Writes to
// spinytails_sanitation_checklist; loads today's record so start + end can be
// filled in two visits.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ROLES = ['founder','co_founder','control_admin','manager','processor','receiver','qc_staff','operations'];
const VERIFIERS = ['Dedrick', 'TJ', 'Jaquel', 'Nicholson'];
const ROLES_SIG = ['Sanitation Manager', 'Plant Supervisor'];

type Item =
  | { kind: 'pf'; code: string; label: string }
  | { kind: 'ppm'; field: string; label: string }
  | { kind: 'type'; field: string; label: string };

const SECTIONS: { n: string; title: string; items: Item[] }[] = [
  { n: '1', title: 'Water Quality', items: [
    { kind: 'pf', code: 'water_quality', label: 'Water quality' },
    { kind: 'ppm', field: 'chlorine_ppm', label: 'Residual chlorine (ppm)' },
    { kind: 'pf', code: 'ice_quality', label: 'Ice quality' },
  ]},
  { n: '2', title: 'Cleanliness of Processing Areas', items: [
    { kind: 'pf', code: 'nonfcs', label: 'Non-FCS areas (walls, floors, curtains, boots)' },
    { kind: 'type', field: 'sanitizer_nonfcs_type', label: 'Non-FCS sanitizer type' },
    { kind: 'ppm', field: 'sanitizer_nonfcs_ppm', label: 'Non-FCS sanitizer (ppm)' },
    { kind: 'pf', code: 'fcs', label: 'FCS equipment & utensils (tables, bins, knives, gloves)' },
    { kind: 'type', field: 'sanitizer_fcs_type', label: 'FCS sanitizer type' },
    { kind: 'ppm', field: 'sanitizer_fcs_ppm', label: 'FCS sanitizer (ppm)' },
  ]},
  { n: '3', title: 'Prevention of Cross-Contamination', items: [
    { kind: 'pf', code: 'signs', label: 'Signs present (wash hands, no eating/smoking)' },
  ]},
  { n: '4', title: 'Handwashing / Footbath / Toilet', items: [
    { kind: 'pf', code: 'handwash_stations', label: 'Handwash & sanitizing stations stocked' },
    { kind: 'type', field: 'footbath_type', label: 'Footbath sanitizer type' },
    { kind: 'ppm', field: 'footbath_ppm', label: 'Footbath sanitizer (ppm)' },
    { kind: 'pf', code: 'employee_facilities', label: 'Employee facilities & toilets stocked' },
  ]},
  { n: '5', title: 'Protection from Adulterants', items: [
    { kind: 'pf', code: 'drains', label: 'Drains screened & functioning' },
    { kind: 'pf', code: 'no_tables_under_ducts', label: 'No tables under ducts/pipes/fixtures' },
  ]},
  { n: '6', title: 'Toxic Compounds', items: [
    { kind: 'pf', code: 'toxic_compounds', label: 'All toxic compounds labelled & stored away' },
  ]},
  { n: '7', title: 'Employee Health', items: [
    { kind: 'pf', code: 'no_disease', label: 'No visible signs of disease' },
    { kind: 'pf', code: 'no_cuts', label: 'No exposed cuts, boils, etc.' },
    { kind: 'pf', code: 'attire', label: 'Properly attired (hairnet, gloves, apron, boots)' },
  ]},
  { n: '8', title: 'Exclusion of Pests', items: [
    { kind: 'pf', code: 'no_pests', label: 'No visible pests' },
    { kind: 'pf', code: 'bait_stations', label: 'Bait stations / fly traps OK' },
    { kind: 'pf', code: 'exterior_openings', label: 'Exterior openings OK (doors, screens)' },
    { kind: 'pf', code: 'surroundings', label: 'Surroundings OK (no vegetation/trash)' },
  ]},
  { n: '9', title: 'Waste Disposal', items: [
    { kind: 'pf', code: 'waste_removed', label: 'Waste removed' },
    { kind: 'pf', code: 'bins_lidded', label: 'Waste bins have lids' },
  ]},
  { n: '12', title: 'Packaging Storage', items: [
    { kind: 'pf', code: 'packaging_room_clean', label: 'Packaging room clean' },
    { kind: 'pf', code: 'packaging_polywrapped', label: 'Packaging polywrapped' },
  ]},
];

type Grade = { start?: 'P' | 'F'; end?: 'P' | 'F' };

export default function SanitationPage() {
  const [auth, setAuth] = useState<'checking'|'no'|'forbidden'|'ok'>('checking');
  const [id, setId] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('');
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [fields, setFields] = useState<Record<string, string>>({ footbath_type: 'Bleach' });
  const [verifier, setVerifier] = useState('');
  const [verifierRole, setVerifierRole] = useState('Sanitation Manager');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => { (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAuth('no'); return; }
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    const role = (prof as { role?: string | null } | null)?.role ?? null;
    if (!role || !ROLES.includes(role)) { setAuth('forbidden'); return; }
    setAuth('ok'); await loadToday(date);
  })(); }, []);

  async function loadToday(d: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/spinytails/sanitation?date=${d}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }, cache: 'no-store' });
    const j = await res.json();
    if (j.ok && j.checklist) {
      const c = j.checklist as Record<string, unknown>;
      setId(c.id as string);
      setStartTime((c.start_time as string)?.slice(0, 5) || '06:00');
      setEndTime((c.end_time as string)?.slice(0, 5) || '');
      setGrades((c.grades as Record<string, Grade>) ?? {});
      setFields({
        chlorine_ppm_start: str(c.chlorine_ppm_start), chlorine_ppm_end: str(c.chlorine_ppm_end),
        sanitizer_nonfcs_type: (c.sanitizer_nonfcs_type as string) ?? '', sanitizer_nonfcs_ppm_start: str(c.sanitizer_nonfcs_ppm_start), sanitizer_nonfcs_ppm_end: str(c.sanitizer_nonfcs_ppm_end),
        sanitizer_fcs_type: (c.sanitizer_fcs_type as string) ?? '', sanitizer_fcs_ppm_start: str(c.sanitizer_fcs_ppm_start), sanitizer_fcs_ppm_end: str(c.sanitizer_fcs_ppm_end),
        footbath_type: (c.footbath_type as string) ?? 'Bleach', footbath_ppm_start: str(c.footbath_ppm_start), footbath_ppm_end: str(c.footbath_ppm_end),
      });
      setVerifier((c.verified_by_name as string) ?? '');
      setVerifierRole((c.verified_by_role as string) ?? 'Sanitation Manager');
    } else { setId(null); }
  }
  const str = (v: unknown) => (v == null ? '' : String(v));

  function setPf(code: string, col: 'start' | 'end', val: 'P' | 'F') {
    setGrades((g) => ({ ...g, [code]: { ...g[code], [col]: g[code]?.[col] === val ? undefined : val } }));
  }
  function setF(k: string, v: string) { setFields((f) => ({ ...f, [k]: v })); }

  function flash(ok: boolean, msg: string) { setToast({ ok, msg }); setTimeout(() => setToast(null), 4000); }

  async function save() {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/spinytails/sanitation', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({
          id, checklist_date: date, start_time: startTime || null, end_time: endTime || null,
          grades,
          chlorine_ppm_start: fields.chlorine_ppm_start, chlorine_ppm_end: fields.chlorine_ppm_end,
          sanitizer_nonfcs_type: fields.sanitizer_nonfcs_type, sanitizer_nonfcs_ppm_start: fields.sanitizer_nonfcs_ppm_start, sanitizer_nonfcs_ppm_end: fields.sanitizer_nonfcs_ppm_end,
          sanitizer_fcs_type: fields.sanitizer_fcs_type, sanitizer_fcs_ppm_start: fields.sanitizer_fcs_ppm_start, sanitizer_fcs_ppm_end: fields.sanitizer_fcs_ppm_end,
          footbath_type: fields.footbath_type, footbath_ppm_start: fields.footbath_ppm_start, footbath_ppm_end: fields.footbath_ppm_end,
          verified_by_name: verifier || null, verified_by_role: verifierRole || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setId(j.id);
      flash(true, '✓ Sanitation checklist saved');
    } catch (e) {
      flash(false, e instanceof Error ? e.message : 'Save failed');
    } finally { setBusy(false); }
  }

  if (auth === 'checking') return <Ctr>Checking…</Ctr>;
  if (auth === 'no') return <Ctr>Sign in required. <Link href="/staff-login?next=/spinytails/sanitation" style={{ color: '#1a2e5a', textDecoration: 'underline' }}>Sign in →</Link></Ctr>;
  if (auth === 'forbidden') return <Ctr>Processing / QC staff only.</Ctr>;

  const PF = ({ code, col }: { code: string; col: 'start' | 'end' }) => {
    const v = grades[code]?.[col];
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        {(['P', 'F'] as const).map((g) => (
          <button key={g} onClick={() => setPf(code, col, g)} style={{ width: 34, height: 34, borderRadius: 8, fontWeight: 900, fontSize: 13, cursor: 'pointer', border: '2px solid',
            borderColor: v === g ? (g === 'P' ? '#16a34a' : '#dc2626') : '#cbd5e1',
            background: v === g ? (g === 'P' ? '#16a34a' : '#dc2626') : '#fff',
            color: v === g ? '#fff' : '#475569' }}>{g}</button>
        ))}
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: 16, fontFamily: 'system-ui', maxWidth: 760, margin: '0 auto' }}>
      {toast && <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 50, padding: '10px 18px', borderRadius: 10, fontWeight: 800, background: toast.ok ? '#dcfce7' : '#fee2e2', color: toast.ok ? '#166534' : '#991b1b', border: `2px solid ${toast.ok ? '#16a34a' : '#dc2626'}` }}>{toast.msg}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0b1628', margin: 0 }}>🧼 Daily Sanitation Checklist</h1>
        <Link href="/spinytails" style={{ fontSize: 12, color: '#64748b' }}>← Spiny Tail</Link>
      </div>

      <div style={sec}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div><div style={lbl}>Date</div><input type="date" value={date} onChange={(e) => { setDate(e.target.value); loadToday(e.target.value); }} style={inp} /></div>
          <div><div style={lbl}>Start time</div><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inp} /></div>
          <div><div style={lbl}>End time</div><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 40, marginTop: 10, fontSize: 11, fontWeight: 800, color: '#475569', paddingRight: 6 }}>
          <span>START</span><span>END</span>
        </div>
      </div>

      {SECTIONS.map((s) => (
        <div key={s.n} style={sec}>
          <div style={{ ...lbl, color: '#0b1628', fontSize: 13 }}>{s.n}. {s.title}</div>
          <div style={{ marginTop: 6 }}>
            {s.items.map((it) => {
              if (it.kind === 'pf') return (
                <div key={it.code} style={row}>
                  <span style={{ flex: 1, fontSize: 13, color: '#334155' }}>{it.label}</span>
                  <PF code={it.code} col="start" />
                  <PF code={it.code} col="end" />
                </div>
              );
              if (it.kind === 'type') return (
                <div key={it.field} style={row}>
                  <span style={{ flex: 1, fontSize: 13, color: '#334155' }}>{it.label}</span>
                  <input value={fields[it.field] ?? ''} onChange={(e) => setF(it.field, e.target.value)} placeholder="Bleach…" style={{ ...inp, marginTop: 0, width: 160 }} />
                </div>
              );
              // ppm — start + end numeric
              return (
                <div key={it.field} style={row}>
                  <span style={{ flex: 1, fontSize: 13, color: '#334155' }}>{it.label}</span>
                  <input type="number" inputMode="decimal" value={fields[`${it.field}_start`] ?? ''} onChange={(e) => setF(`${it.field}_start`, e.target.value)} placeholder="ppm" style={{ ...inp, marginTop: 0, width: 72, textAlign: 'center' }} />
                  <input type="number" inputMode="decimal" value={fields[`${it.field}_end`] ?? ''} onChange={(e) => setF(`${it.field}_end`, e.target.value)} placeholder="ppm" style={{ ...inp, marginTop: 0, width: 72, textAlign: 'center' }} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div style={sec}>
        <div style={lbl}>Verified by</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
          <select value={verifier} onChange={(e) => setVerifier(e.target.value)} style={inp}>
            <option value="">— verifier —</option>
            {VERIFIERS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={verifierRole} onChange={(e) => setVerifierRole(e.target.value)} style={inp}>
            {ROLES_SIG.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <button onClick={save} disabled={busy} style={{ width: '100%', padding: 18, fontSize: 17, fontWeight: 900, background: busy ? '#94a3b8' : '#16a34a', color: '#fff', border: 'none', borderRadius: 14, cursor: busy ? 'wait' : 'pointer' }}>
        {busy ? 'Saving…' : id ? '✓ Update checklist' : '✓ Save checklist'}
      </button>
    </div>
  );
}

function Ctr({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>{children}</div>;
}

const sec: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, marginBottom: 12 };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 };
const inp: React.CSSProperties = { width: '100%', padding: 11, fontSize: 15, border: '2px solid #cbd5e1', borderRadius: 10, marginTop: 6, boxSizing: 'border-box' };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f1f5f9' };
