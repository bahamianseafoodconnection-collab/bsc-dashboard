'use client';

// /dashboard/fishermen — Admin onboarding console for fisherman logins.
//
// One-click flow: enter name + email → API creates auth user + profile
// with role='fisherman' + links to (or creates) a supplier record. The
// page then displays the temp credentials to hand to the fisherman.
//
// Lists existing fishermen (suppliers with auth_user_id set) with their
// registration status + intake counts so admin can see the roster.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);

interface SupplierLite {
  id:                            string;
  name:                          string;
  contact_email:                 string | null;
  contact_phone:                 string | null;
  auth_user_id:                  string | null;
  vessel_name:                   string | null;
  vessel_registration_number:    string | null;
  vessel_registration_year:      number | null;
  vessel_registration_doc_url:   string | null;
  island_source?:                string | null;
}

interface ProfileLite { id: string; full_name: string | null; phone: string | null; must_change_password: boolean | null; }

export default function FishermenAdminPage() {
  const [authed, setAuthed]     = useState<boolean | null>(null);
  const [fishermen, setFishermen] = useState<SupplierLite[]>([]);
  const [orphans, setOrphans]   = useState<SupplierLite[]>([]);  // suppliers w/o auth_user_id
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [intakeCounts, setIntakeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading]   = useState(true);
  const [search,  setSearch]    = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [issued,  setIssued]    = useState<null | { email: string; temp_password: string | null; supplier_name: string; is_new: boolean }>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/fishermen'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      await loadAll();
    })();
  }, []);

  async function loadAll() {
    setLoading(true);
    const { data: sups } = await supabase
      .from('suppliers')
      .select(`
        id, name, contact_email, contact_phone, auth_user_id,
        vessel_name, vessel_registration_number, vessel_registration_year, vessel_registration_doc_url,
        island_source
      `)
      .order('name', { ascending: true });
    const list = (sups ?? []) as SupplierLite[];
    setFishermen(list.filter((s) => !!s.auth_user_id));
    setOrphans  (list.filter((s) =>  !s.auth_user_id));

    const linkedIds = list.filter((s) => s.auth_user_id).map((s) => s.auth_user_id as string);
    if (linkedIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, phone, must_change_password')
        .in('id', linkedIds);
      const pm: Record<string, ProfileLite> = {};
      for (const p of (profs ?? []) as ProfileLite[]) pm[p.id] = p;
      setProfiles(pm);
    }

    const linkedSupplierIds = list.filter((s) => s.auth_user_id).map((s) => s.id);
    if (linkedSupplierIds.length > 0) {
      const { data: lots } = await supabase
        .from('yield_lots')
        .select('supplier_id')
        .in('supplier_id', linkedSupplierIds);
      const cm: Record<string, number> = {};
      for (const r of (lots ?? []) as { supplier_id: string | null }[]) {
        if (r.supplier_id) cm[r.supplier_id] = (cm[r.supplier_id] ?? 0) + 1;
      }
      setIntakeCounts(cm);
    }

    setLoading(false);
  }

  const filteredFishermen = useMemo(() => {
    if (!search.trim()) return fishermen;
    const q = search.toLowerCase();
    return fishermen.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.contact_email ?? '').toLowerCase().includes(q) ||
      (s.vessel_name ?? '').toLowerCase().includes(q) ||
      (s.vessel_registration_number ?? '').toLowerCase().includes(q)
    );
  }, [fishermen, search]);

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/dashboard" style={back}>← Dashboard</Link>
          <h1 style={h1}>🎣 Fishermen — onboarding & roster</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {fishermen.length} fisherman login{fishermen.length === 1 ? '' : 's'} active · {orphans.length} supplier{orphans.length === 1 ? '' : 's'} not yet linked
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search fisherman, email, vessel…"
            style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 14 }} />
          <button onClick={() => setShowInvite(true)} style={{ background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            + Add fisherman
          </button>
        </div>

        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}

        {!loading && filteredFishermen.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 }}>
            No fishermen onboarded yet. Tap <strong>+ Add fisherman</strong> to invite the first one.
          </div>
        )}

        {filteredFishermen.map((s) => {
          const prof  = s.auth_user_id ? profiles[s.auth_user_id] : null;
          const count = intakeCounts[s.id] ?? 0;
          const regOK = s.vessel_registration_year === new Date().getFullYear();
          return (
            <article key={s.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{prof?.full_name ?? s.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                    {s.contact_email ?? '—'} · {prof?.phone ?? s.contact_phone ?? '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    🛥 {s.vessel_name ?? '—'} · reg {s.vessel_registration_number ?? '—'}{s.island_source ? ` · ${s.island_source}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                  <span style={{ background: regOK ? 'rgba(34,197,94,0.18)' : 'rgba(248,113,113,0.15)', color: regOK ? '#4ade80' : '#f87171', padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>
                    {regOK ? `${s.vessel_registration_year} reg ✓` : s.vessel_registration_doc_url ? `${s.vessel_registration_year ?? '?'} expired` : 'no reg'}
                  </span>
                  <span style={{ fontSize: 11, color: '#a78bfa' }}>{count} intake{count === 1 ? '' : 's'}</span>
                  {prof?.must_change_password && (
                    <span style={{ fontSize: 10, color: '#fbbf24' }}>⚠ temp pw active</span>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {orphans.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 8px' }}>
              Suppliers without a fisherman login ({orphans.length})
            </div>
            {orphans.slice(0, 8).map((s) => (
              <div key={s.id} style={{ ...card, opacity: 0.7, padding: 10, fontSize: 12 }}>
                <strong>{s.name}</strong> · {s.contact_email ?? 'no email'} · {s.vessel_name ?? 'no vessel'}
              </div>
            ))}
            {orphans.length > 8 && <p style={{ fontSize: 11, color: '#94a3b8' }}>+{orphans.length - 8} more…</p>}
          </>
        )}
      </main>

      {showInvite && (
        <InviteModal
          orphans={orphans}
          onClose={() => setShowInvite(false)}
          onSuccess={(r) => { setIssued(r); setShowInvite(false); loadAll(); }}
        />
      )}

      {issued && <CredsModal creds={issued} onClose={() => setIssued(null)} />}
    </div>
  );
}

function InviteModal({ orphans, onClose, onSuccess }: {
  orphans: SupplierLite[];
  onClose: () => void;
  onSuccess: (r: { email: string; temp_password: string | null; supplier_name: string; is_new: boolean }) => void;
}) {
  const [mode, setMode] = useState<'link' | 'new'>(orphans.length > 0 ? 'link' : 'new');
  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [tempPw, setTempPw]     = useState('BSC2024!');
  const [supplierId, setSupplierId] = useState('');
  const [vesselName, setVesselName] = useState('');
  const [vesselReg, setVesselReg]   = useState('');
  const [vesselOwner, setVesselOwner] = useState('');
  const [island, setIsland]     = useState('Moores Island');
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) { setErr('Name + email required'); return; }
    if (mode === 'link' && !supplierId)    { setErr('Pick a supplier to link'); return; }
    setBusy(true); setErr(null);
    const { data: { session } } = await supabase.auth.getSession();
    const body = {
      full_name:     fullName.trim(),
      email:         email.trim().toLowerCase(),
      phone:         phone.trim() || undefined,
      temp_password: tempPw.trim() || 'BSC2024!',
      supplier_id:   mode === 'link' ? supplierId : null,
      new_supplier:  mode === 'new' ? {
        name:                       fullName.trim(),
        vessel_name:                vesselName.trim() || undefined,
        vessel_registration_number: vesselReg.trim()  || undefined,
        vessel_owner_name:          vesselOwner.trim() || undefined,
        vessel_captain_name:        fullName.trim(),
        island_source:              island,
      } : null,
    };
    const res = await fetch('/api/admin/fishermen/invite', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.ok) { setErr(json.error ?? 'Invite failed'); return; }
    const supplierName = mode === 'link'
      ? (orphans.find((o) => o.id === supplierId)?.name ?? fullName.trim())
      : fullName.trim();
    onSuccess({
      email:         json.email,
      temp_password: json.temp_password,
      supplier_name: supplierName,
      is_new:        json.is_new_auth_user,
    });
  }

  return (
    <ModalShell title="🎣 Add fisherman" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Full name *">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Oscar Pinder" style={inp} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Email *">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="oscar@bsc.com" style={inp} />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 242 …" style={inp} />
          </Field>
        </div>
        <Field label="Temp password (fisherman changes on first login)">
          <input value={tempPw} onChange={(e) => setTempPw(e.target.value)} style={inp} />
        </Field>

        <div style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 8, padding: 10, marginTop: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#f5c518', marginBottom: 8 }}>Supplier record</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button type="button" onClick={() => setMode('link')} disabled={orphans.length === 0} style={modeBtn(mode === 'link')}>
              🔗 Link to existing ({orphans.length})
            </button>
            <button type="button" onClick={() => setMode('new')} style={modeBtn(mode === 'new')}>
              ➕ Create new
            </button>
          </div>
          {mode === 'link' && (
            <Field label="Pick supplier without a login">
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={inp}>
                <option value="">— select supplier —</option>
                {orphans.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.vessel_name ? ` · ${s.vessel_name}` : ''}{s.vessel_registration_number ? ` (${s.vessel_registration_number})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {mode === 'new' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Boat name"><input value={vesselName} onChange={(e) => setVesselName(e.target.value)} placeholder="Sea Hunter" style={inp} /></Field>
                <Field label="Boat reg #"><input value={vesselReg} onChange={(e) => setVesselReg(e.target.value)} placeholder="BAH-12345" style={inp} /></Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Boat owner (if not fisherman)"><input value={vesselOwner} onChange={(e) => setVesselOwner(e.target.value)} placeholder="optional" style={inp} /></Field>
                <Field label="Home island">
                  <select value={island} onChange={(e) => setIsland(e.target.value)} style={inp}>
                    {['Nassau','Moores Island','Andros','Eleuthera','Exuma','Abaco','Grand Bahama','Long Island','Cat Island','Other'].map((i) => <option key={i}>{i}</option>)}
                  </select>
                </Field>
              </div>
            </>
          )}
        </div>

        {err && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', color: '#f87171', padding: 10, borderRadius: 8, fontSize: 12, marginTop: 8 }}>⚠ {err}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onClose} style={{ ...btn, background: 'rgba(255,255,255,0.1)', color: '#fff', flex: 1 }}>Cancel</button>
          <button type="submit" disabled={busy} style={{ ...btn, background: '#f5c518', color: '#060d1f', flex: 2 }}>
            {busy ? 'Inviting…' : '✓ Create login + link supplier'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function CredsModal({ creds, onClose }: { creds: { email: string; temp_password: string | null; supplier_name: string; is_new: boolean }; onClose: () => void }) {
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); } catch {} }
  const lines = [
    `Bahamian Seafood Connection`,
    `Login at: https://bscbahamas.com/login`,
    `Email: ${creds.email}`,
    creds.temp_password ? `Temp password: ${creds.temp_password}` : `Password: (unchanged — already had a login)`,
    creds.temp_password ? `Change your password after first login.` : '',
  ].filter(Boolean).join('\n');
  return (
    <ModalShell title="✓ Fisherman onboarded" onClose={onClose}>
      <div style={{ background: '#0a1628', border: '1px solid #22c55e', borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 800, marginBottom: 8 }}>
          {creds.supplier_name} is now a fisherman login {creds.is_new ? '(new auth user created)' : '(linked to existing auth user)'}
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#060d1f', padding: 10, borderRadius: 6, fontSize: 12, color: '#fff', margin: 0 }}>{lines}</pre>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={() => copy(lines)} style={{ ...btn, background: '#f5c518', color: '#060d1f', flex: 1 }}>📋 Copy credentials</button>
          {creds.temp_password && (
            <button onClick={() => copy(creds.temp_password!)} style={{ ...btn, background: 'rgba(245,197,24,0.15)', color: '#f5c518', border: '1px solid #f5c518', flex: 1 }}>Copy pw only</button>
          )}
        </div>
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>
        Hand the temp password to the fisherman (SMS, paper, in person). They&rsquo;ll be prompted to change it on first login.
      </p>
      <button onClick={onClose} style={{ ...btn, background: 'rgba(255,255,255,0.1)', color: '#fff', width: '100%', marginTop: 8 }}>Done</button>
    </ModalShell>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 16 }}>
      <div style={{ background: '#0b1628', borderRadius: 14, padding: 16, maxWidth: 540, width: '100%', marginTop: 32, border: '1px solid rgba(245,197,24,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: '#f5c518', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'transparent', color: 'rgba(255,255,255,0.6)', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

const modeBtn = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: '8px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer',
  background: active ? '#f5c518' : 'rgba(255,255,255,0.05)',
  color:      active ? '#060d1f' : '#94a3b8',
  border: '1px solid ' + (active ? '#f5c518' : 'rgba(255,255,255,0.1)'),
});

const pg: React.CSSProperties   = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif" };
const hdr: React.CSSProperties  = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties   = { fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const card: React.CSSProperties = { background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, marginBottom: 8 };
const inp: React.CSSProperties  = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 14, boxSizing: 'border-box' };
const btn: React.CSSProperties  = { border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer' };
