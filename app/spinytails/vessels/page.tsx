'use client';

// /spinytails/vessels — Spiny Tails vessel (fishermen) registry.
//
// Each vessel = one supplying boat. The 2-letter vessel_code becomes
// the VV in every lot code (STPC-YYYYMMDD-VV-NN), so codes are
// validated as ^[A-Z]{2}$ and uniqueness is DB-enforced.
//
// Reachable from BOTH the Founder dashboard (Spiny Tails Vessels tile)
// and the Spiny Tails portal — same page, staff-gated.
//
// Cold-chain (2026-07): captain, registration certificate upload +
// expiry, partner/direct access type, and an automatic renewal flag —
// any cert expiring in the past OR within 60 days (or manually flagged)
// shows an EXPIRED / RENEWAL DUE badge. Colors are open text + matched
// case-insensitively (the tie-strap set can grow as boats join).

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver']);
const CERT_BUCKET = 'vessel-certs';
const RENEWAL_WINDOW_DAYS = 60;

type AccessType = 'partner' | 'direct';

interface Vessel {
  id:                      string;
  vessel_code:             string;
  vessel_name:             string | null;
  fisherman_name:          string;
  captain_name:            string | null;
  fisherman_phone:         string | null;
  license_number:          string | null;
  color_tag:               string;
  status:                  'approved' | 'suspended' | 'inactive';
  access_type:             AccessType | null;
  registration_expires_on: string | null;
  registration_cert_url:   string | null;
  cert_needs_review:       boolean | null;
  notes:                   string | null;
  created_at:              string;
}

interface SupplierMini {
  id:                          string;
  name:                        string;
  contact_phone:               string | null;
  vessel_name:                 string | null;
  vessel_registration_number:  string | null;
  vessel_captain_name:         string | null;
  vessel_owner_name:           string | null;
}

// Suggested strap colors — the column is open text, so operators can also
// type a custom color; existing DB colors are folded in case-insensitively.
const COLOR_OPTIONS = ['red','blue','green','yellow','orange','purple','white','black','pink','cyan','brown','gray'];

// ── Cert renewal status (past OR within 60 days OR manual flag) ──────
type CertLevel = 'ok' | 'due' | 'expired' | 'none';
function certStatus(v: Pick<Vessel, 'registration_expires_on' | 'cert_needs_review'>): {
  level: CertLevel; label: string; days: number | null;
} {
  const exp = v.registration_expires_on ? new Date(v.registration_expires_on + 'T00:00:00') : null;
  let days: number | null = null;
  if (exp && !isNaN(exp.getTime())) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    days = Math.round((exp.getTime() - today.getTime()) / 86400000);
  }
  if (days !== null && days < 0)                     return { level: 'expired', label: `EXPIRED ${-days}d ago`, days };
  if (v.cert_needs_review)                           return { level: 'expired', label: 'REVIEW CERT', days };
  if (days !== null && days <= RENEWAL_WINDOW_DAYS)  return { level: 'due', label: `RENEWAL DUE · ${days}d`, days };
  if (days === null)                                 return { level: 'none', label: 'NO CERT DATE', days };
  return { level: 'ok', label: `OK · ${days}d`, days };
}
const CERT_COLORS: Record<CertLevel, { bg: string; fg: string }> = {
  expired: { bg: 'rgba(248,113,113,0.18)', fg: '#f87171' },
  due:     { bg: 'rgba(251,191,36,0.18)',  fg: '#fbbf24' },
  none:    { bg: 'rgba(148,163,184,0.18)', fg: '#94a3b8' },
  ok:      { bg: 'rgba(34,197,94,0.16)',   fg: '#4ade80' },
};

export default function VesselsPage() {
  const [authed, setAuthed]   = useState<boolean | null>(null);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Vessel | null>(null);
  const [toast, setToast]     = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/spinytails/vessels'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !STAFF_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      await load();
    })();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('spinytails_vessels').select('*').order('vessel_code');
    setVessels((data ?? []) as Vessel[]);
    const { data: sups } = await supabase
      .from('suppliers')
      .select('id, name, contact_phone, vessel_name, vessel_registration_number, vessel_captain_name, vessel_owner_name')
      .order('name');
    setSuppliers((sups ?? []) as SupplierMini[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return vessels;
    const q = search.toLowerCase();
    return vessels.filter(v =>
      v.vessel_code.toLowerCase().includes(q) ||
      v.fisherman_name.toLowerCase().includes(q) ||
      (v.captain_name ?? '').toLowerCase().includes(q) ||
      (v.vessel_name ?? '').toLowerCase().includes(q) ||
      v.color_tag.toLowerCase().includes(q)
    );
  }, [vessels, search]);

  const usedCodes  = useMemo(() => new Set(vessels.map(v => v.vessel_code)), [vessels]);
  // Case-insensitive: compare lower-cased colors among approved vessels.
  const usedColors = useMemo(
    () => new Set(vessels.filter(v => v.status === 'approved').map(v => v.color_tag.toLowerCase())),
    [vessels],
  );
  // Open palette = suggestions ∪ any colors already in the DB.
  const palette = useMemo(() => {
    const set = new Set(COLOR_OPTIONS);
    vessels.forEach(v => { if (v.color_tag) set.add(v.color_tag.toLowerCase()); });
    return [...set];
  }, [vessels]);

  const flaggedCount = useMemo(
    () => vessels.filter(v => { const s = certStatus(v).level; return s === 'expired' || s === 'due'; }).length,
    [vessels],
  );

  function suggestCode(name: string): string {
    const words = name.trim().toUpperCase().split(/\s+/);
    let code = words.length >= 2 ? (words[0][0] ?? '') + (words[1][0] ?? '') : (words[0]?.slice(0, 2) ?? '');
    code = code.replace(/[^A-Z]/g, '').padEnd(2, 'X').slice(0, 2);
    let i = 0;
    while (usedCodes.has(code) && i < 26) { code = (code[0] ?? 'A') + String.fromCharCode(65 + i); i += 1; }
    return code;
  }
  function suggestColor(): string {
    return palette.find(c => !usedColors.has(c.toLowerCase())) ?? 'gray';
  }

  const orphanSuppliers = useMemo(() => {
    const known = new Set(vessels.map(v => v.fisherman_name.toLowerCase()));
    return suppliers.filter(s => {
      const hasVessel = !!s.vessel_name || !!s.vessel_registration_number;
      const linked    = known.has(s.name.toLowerCase()) || known.has((s.vessel_captain_name ?? '').toLowerCase());
      return hasVessel && !linked;
    });
  }, [vessels, suppliers]);

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Link href="/spinytails" style={back}>← Spiny Tails</Link>
          <h1 style={h1}>🛥 Vessels — fishermen registry</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {vessels.length} vessel{vessels.length === 1 ? '' : 's'} · {vessels.filter(v => v.status === 'approved').length} approved
            {flaggedCount > 0 && <span style={{ color: '#fbbf24', fontWeight: 800 }}> · ⚠ {flaggedCount} cert{flaggedCount === 1 ? '' : 's'} need attention</span>}
            {orphanSuppliers.length > 0 && ` · ${orphanSuppliers.length} ready to import`}
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, name, captain, color…"
            style={{ flex: '1 1 240px', padding: '10px 12px', borderRadius: 10, background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 14 }} />
          {orphanSuppliers.length > 0 && (
            <button onClick={() => setImportOpen(true)}
              style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid #60a5fa', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              📥 Import {orphanSuppliers.length} from suppliers
            </button>
          )}
          <button onClick={() => setAddOpen(true)}
            style={{ background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
            + New vessel
          </button>
        </div>

        {toast && (
          <div style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid #16a34a', color: '#4ade80', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
            {toast}
          </div>
        )}

        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {!loading && filtered.length === 0 && (
          <div style={empty}>{vessels.length === 0 ? 'No vessels yet — tap + New vessel.' : 'No matches.'}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
          {filtered.map(v => {
            const cs = certStatus(v);
            return (
              <button key={v.id} onClick={() => setEditing(v)}
                style={{ textAlign: 'left', background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, cursor: 'pointer', color: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 900, color: '#f5c518' }}>{v.vessel_code}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase',
                    background: v.status === 'approved' ? 'rgba(34,197,94,0.18)' : v.status === 'suspended' ? 'rgba(248,113,113,0.15)' : 'rgba(107,114,128,0.18)',
                    color:      v.status === 'approved' ? '#4ade80' : v.status === 'suspended' ? '#f87171' : '#94a3b8',
                  }}>{v.status}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{v.captain_name || v.fisherman_name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                  {v.vessel_name ?? '—'}{v.license_number ? ` · ${v.license_number}` : ''}
                </div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: colorSwatch(v.color_tag), border: '1px solid rgba(255,255,255,0.3)' }} />
                  <span style={{ fontSize: 11, color: '#cbd5e1', textTransform: 'capitalize' }}>{v.color_tag}</span>
                  <span style={chip((v.access_type ?? 'direct') === 'partner' ? '#60a5fa' : '#94a3b8')}>
                    {(v.access_type ?? 'direct') === 'partner' ? 'PARTNER' : 'DIRECT'}
                  </span>
                  {cs.level !== 'ok' && (
                    <span style={{ ...chip(CERT_COLORS[cs.level].fg), background: CERT_COLORS[cs.level].bg }}>
                      {cs.level === 'due' ? '⚠ ' : cs.level === 'expired' ? '⛔ ' : ''}{cs.label}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </main>

      {addOpen && (
        <VesselForm
          title="+ New vessel"
          initial={blankForm(suggestColor())}
          palette={palette}
          existingCodes={usedCodes}
          existingColors={usedColors}
          onClose={() => setAddOpen(false)}
          onSave={async (data) => {
            const { error } = await supabase.from('spinytails_vessels').insert(rowFromForm(data));
            if (error) { alert(error.message); return; }
            setToast('✓ Vessel created'); setTimeout(() => setToast(null), 3000);
            setAddOpen(false); await load();
          }}
        />
      )}

      {editing && (
        <VesselForm
          title={`Edit ${editing.vessel_code}`}
          initial={formFromVessel(editing)}
          codeReadonly
          palette={palette}
          existingCodes={usedCodes}
          existingColors={new Set([...usedColors].filter(c => c !== editing.color_tag.toLowerCase()))}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const { vessel_code: _unused, ...rest } = rowFromForm(data);
            void _unused;
            const { error } = await supabase.from('spinytails_vessels').update(rest).eq('id', editing.id);
            if (error) { alert(error.message); return; }
            setToast('✓ Vessel updated'); setTimeout(() => setToast(null), 3000);
            setEditing(null); await load();
          }}
        />
      )}

      {importOpen && (
        <ImportModal
          orphans={orphanSuppliers}
          suggestCode={suggestCode}
          suggestColor={suggestColor}
          palette={palette}
          existingCodes={usedCodes}
          existingColors={usedColors}
          onClose={() => setImportOpen(false)}
          onImported={async (count) => {
            setToast(`✓ Imported ${count} vessel${count === 1 ? '' : 's'}`); setTimeout(() => setToast(null), 4000);
            setImportOpen(false); await load();
          }}
        />
      )}
    </div>
  );
}

// ─── Form model ─────────────────────────────────────────────────────
type FormData = {
  vessel_code: string; vessel_name: string; fisherman_name: string; captain_name: string;
  fisherman_phone: string; license_number: string; color_tag: string;
  status: 'approved' | 'suspended' | 'inactive'; access_type: AccessType;
  registration_expires_on: string; registration_cert_url: string; cert_needs_review: boolean; notes: string;
};

function blankForm(color: string): FormData {
  return {
    vessel_code: '', vessel_name: '', fisherman_name: '', captain_name: '', fisherman_phone: '',
    license_number: '', color_tag: color, status: 'approved', access_type: 'direct',
    registration_expires_on: '', registration_cert_url: '', cert_needs_review: false, notes: '',
  };
}
function formFromVessel(v: Vessel): FormData {
  return {
    vessel_code: v.vessel_code, vessel_name: v.vessel_name ?? '', fisherman_name: v.fisherman_name,
    captain_name: v.captain_name ?? '', fisherman_phone: v.fisherman_phone ?? '',
    license_number: v.license_number ?? '', color_tag: v.color_tag, status: v.status,
    access_type: (v.access_type ?? 'direct'), registration_expires_on: v.registration_expires_on ?? '',
    registration_cert_url: v.registration_cert_url ?? '', cert_needs_review: !!v.cert_needs_review, notes: v.notes ?? '',
  };
}
// null-strip so we never write empty strings into nullable columns.
function rowFromForm(d: FormData) {
  const nn = (s: string) => (s.trim() ? s.trim() : null);
  return {
    vessel_code:             d.vessel_code,
    vessel_name:             nn(d.vessel_name),
    fisherman_name:          d.fisherman_name.trim(),
    captain_name:            nn(d.captain_name),
    fisherman_phone:         nn(d.fisherman_phone),
    license_number:          nn(d.license_number),
    color_tag:               d.color_tag.trim().toLowerCase(),
    status:                  d.status,
    access_type:             d.access_type,
    registration_expires_on: d.registration_expires_on || null,
    registration_cert_url:   nn(d.registration_cert_url),
    cert_needs_review:       d.cert_needs_review,
    notes:                   nn(d.notes),
  };
}

// ─── Vessel form (add + edit) ───────────────────────────────────────
function VesselForm({
  title, initial, codeReadonly, palette, existingCodes, existingColors, onClose, onSave,
}: {
  title: string;
  initial: FormData;
  codeReadonly?: boolean;
  palette: string[];
  existingCodes: Set<string>;
  existingColors: Set<string>;   // lower-cased approved colors (excluding own)
  onClose: () => void;
  onSave: (data: FormData) => Promise<void>;
}) {
  const [d, setD]   = useState<FormData>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cs = certStatus({ registration_expires_on: d.registration_expires_on || null, cert_needs_review: d.cert_needs_review });

  function validate(): string | null {
    if (!/^[A-Z]{2}$/.test(d.vessel_code)) return 'Vessel code must be exactly 2 uppercase letters';
    if (!codeReadonly && existingCodes.has(d.vessel_code)) return `Code ${d.vessel_code} already in use`;
    if (!d.fisherman_name.trim()) return 'Fisherman / owner name required';
    if (!d.color_tag.trim()) return 'Color tag required';
    if (d.status === 'approved' && existingColors.has(d.color_tag.trim().toLowerCase())) return `Color ${d.color_tag} already used by another approved vessel`;
    return null;
  }

  async function handleUpload(file: File) {
    if (!/^[A-Z]{2}$/.test(d.vessel_code)) { setErr('Enter the 2-letter code before uploading a cert'); return; }
    setUploading(true); setErr(null);
    try {
      const ext  = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${d.vessel_code}/cert-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(CERT_BUCKET).upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (error) throw error;
      setD(s => ({ ...s, registration_cert_url: path }));
    } catch (e) {
      setErr(`Cert upload failed: ${e instanceof Error ? e.message : 'try again'} (is the "${CERT_BUCKET}" bucket created?)`);
    } finally {
      setUploading(false);
    }
  }

  async function viewCert() {
    if (!d.registration_cert_url) return;
    // Stored value may be a full URL (legacy) or a storage path.
    if (/^https?:\/\//.test(d.registration_cert_url)) { window.open(d.registration_cert_url, '_blank'); return; }
    const { data, error } = await supabase.storage.from(CERT_BUCKET).createSignedUrl(d.registration_cert_url, 3600);
    if (error || !data) { setErr(`Could not open cert: ${error?.message ?? 'unknown'}`); return; }
    window.open(data.signedUrl, '_blank');
  }

  async function submit() {
    const e = validate();
    if (e) { setErr(e); return; }
    setErr(null); setBusy(true);
    await onSave(d);
    setBusy(false);
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Code (2 letters)">
          <input value={d.vessel_code} disabled={codeReadonly}
            onChange={(e) => setD(s => ({ ...s, vessel_code: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) }))}
            placeholder="AT" maxLength={2}
            style={{ ...inp, fontFamily: 'monospace', fontSize: 18, fontWeight: 900, textAlign: 'center', letterSpacing: 4 }} />
        </Field>
        <Field label="Access">
          <select value={d.access_type} onChange={(e) => setD(s => ({ ...s, access_type: e.target.value as AccessType }))} style={inp}>
            <option value="direct">direct (no portal)</option>
            <option value="partner">partner (portal access)</option>
          </select>
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Fisherman / owner *">
          <input value={d.fisherman_name} onChange={(e) => setD(s => ({ ...s, fisherman_name: e.target.value }))} placeholder="Oscar Pinder" style={inp} />
        </Field>
        <Field label="Captain (if different)">
          <input value={d.captain_name} onChange={(e) => setD(s => ({ ...s, captain_name: e.target.value }))} placeholder="Trevor Whitfield" style={inp} />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Vessel name">
          <input value={d.vessel_name} onChange={(e) => setD(s => ({ ...s, vessel_name: e.target.value }))} placeholder="Sea-Ya-Later" style={inp} />
        </Field>
        <Field label="Phone">
          <input value={d.fisherman_phone} onChange={(e) => setD(s => ({ ...s, fisherman_phone: e.target.value }))} placeholder="+1 242 …" style={inp} />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Field label="Registration #">
          <input value={d.license_number} onChange={(e) => setD(s => ({ ...s, license_number: e.target.value }))} placeholder="AB-983-SP" style={inp} />
        </Field>
        <Field label="Color tag *">
          <input list="strap-colors" value={d.color_tag}
            onChange={(e) => setD(s => ({ ...s, color_tag: e.target.value }))} placeholder="black" style={{ ...inp, textTransform: 'capitalize' }} />
          <datalist id="strap-colors">{palette.map(c => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Status">
          <select value={d.status} onChange={(e) => setD(s => ({ ...s, status: e.target.value as FormData['status'] }))} style={inp}>
            <option value="approved">approved</option>
            <option value="suspended">suspended</option>
            <option value="inactive">inactive</option>
          </select>
        </Field>
      </div>

      {/* Registration certificate + expiry + auto-flag */}
      <div style={{ background: '#0a1628', border: `1px solid ${CERT_COLORS[cs.level].fg}33`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Registration certificate</span>
          {cs.level !== 'ok' && (
            <span style={{ ...chip(CERT_COLORS[cs.level].fg), background: CERT_COLORS[cs.level].bg }}>
              {cs.level === 'due' ? '⚠ ' : cs.level === 'expired' ? '⛔ ' : ''}{cs.label}
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Expires on (renewal year)">
            <input type="date" value={d.registration_expires_on}
              onChange={(e) => setD(s => ({ ...s, registration_expires_on: e.target.value }))} style={inp} />
          </Field>
          <Field label="Cert document">
            <div style={{ display: 'flex', gap: 6 }}>
              <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{ ...btn, background: 'rgba(96,165,250,0.15)', color: '#60a5fa', flex: 1, padding: '10px 8px' }}>
                {uploading ? 'Uploading…' : d.registration_cert_url ? '↻ Replace' : '⬆ Upload'}
              </button>
              {d.registration_cert_url && (
                <button type="button" onClick={viewCert} style={{ ...btn, background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '10px 12px' }}>View</button>
              )}
            </div>
          </Field>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12, color: '#cbd5e1', cursor: 'pointer' }}>
          <input type="checkbox" checked={d.cert_needs_review} onChange={(e) => setD(s => ({ ...s, cert_needs_review: e.target.checked }))} />
          Manually flag this cert for review (forces the badge on)
        </label>
      </div>

      <Field label="Notes">
        <input value={d.notes} onChange={(e) => setD(s => ({ ...s, notes: e.target.value }))} placeholder="e.g. also registered FDC-1067" style={inp} />
      </Field>

      {err && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', color: '#f87171', padding: 8, borderRadius: 8, fontSize: 12, marginTop: 8 }}>⚠ {err}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={{ ...btn, background: 'rgba(255,255,255,0.1)', color: '#fff', flex: 1 }}>Cancel</button>
        <button onClick={submit} disabled={busy} style={{ ...btn, background: '#f5c518', color: '#060d1f', flex: 2 }}>
          {busy ? 'Saving…' : '✓ Save'}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Import from suppliers ──────────────────────────────────────────
function ImportModal({ orphans, suggestCode, suggestColor, palette, existingCodes, existingColors, onClose, onImported }: {
  orphans: SupplierMini[];
  suggestCode: (name: string) => string;
  suggestColor: () => string;
  palette: string[];
  existingCodes: Set<string>;
  existingColors: Set<string>;
  onClose: () => void;
  onImported: (count: number) => Promise<void>;
}) {
  type Draft = { id: string; selected: boolean; code: string; color: string; note: string };
  const initial: Draft[] = orphans.map(o => ({
    id: o.id, selected: true,
    code: suggestCode(o.vessel_captain_name ?? o.name),
    color: suggestColor(), note: '',
  }));
  const [drafts, setDrafts] = useState<Draft[]>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  function updateDraft(idx: number, patch: Partial<Draft>) {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d));
  }

  async function submit() {
    const selected = drafts.filter(d => d.selected);
    if (selected.length === 0) { setErr('Pick at least one to import'); return; }
    const seenCodes  = new Set<string>(existingCodes);
    const seenColors = new Set<string>(existingColors);
    for (const d of selected) {
      if (!/^[A-Z]{2}$/.test(d.code)) { setErr(`${d.code || '(blank)'} — code must be 2 uppercase letters`); return; }
      if (seenCodes.has(d.code))               { setErr(`Code ${d.code} duplicated`); return; }
      if (seenColors.has(d.color.toLowerCase())) { setErr(`Color ${d.color} duplicated`); return; }
      seenCodes.add(d.code);
      seenColors.add(d.color.toLowerCase());
    }
    setErr(null); setBusy(true);
    const rows = selected.map(d => {
      const o = orphans.find(x => x.id === d.id)!;
      return {
        vessel_code:    d.code,
        vessel_name:    o.vessel_name,
        fisherman_name: o.vessel_captain_name || o.name,
        captain_name:   o.vessel_captain_name,
        fisherman_phone: o.contact_phone,
        license_number: o.vessel_registration_number,
        color_tag:      d.color.toLowerCase(),
        status:         'approved' as const,
        access_type:    'partner' as const,   // supplier-portal records → partner
        notes:          (d.note.trim() || `Imported from supplier ${o.name}`),
      };
    });
    const { error } = await supabase.from('spinytails_vessels').insert(rows);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await onImported(rows.length);
  }

  return (
    <ModalShell title={`📥 Import ${orphans.length} vessel${orphans.length === 1 ? '' : 's'} from suppliers`} onClose={onClose}>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 0 }}>
        Each row inherits the supplier&rsquo;s vessel info (imported as <b>partner</b>). Pick a unique 2-letter code + a color tag.
      </p>
      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {drafts.map((d, i) => {
          const o = orphans.find(x => x.id === d.id)!;
          return (
            <div key={d.id} style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 10, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input type="checkbox" checked={d.selected} onChange={(e) => updateDraft(i, { selected: e.target.checked })} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{o.vessel_captain_name || o.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>
                    {o.vessel_name ?? 'no vessel name'}{o.vessel_registration_number ? ` · reg ${o.vessel_registration_number}` : ''}
                  </div>
                </div>
              </div>
              {d.selected && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <input value={d.code}
                    onChange={(e) => updateDraft(i, { code: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) })}
                    placeholder="AT" maxLength={2}
                    style={{ ...inp, fontFamily: 'monospace', fontWeight: 900, textAlign: 'center', letterSpacing: 4, padding: '6px 8px' }} />
                  <input list="import-colors" value={d.color} onChange={(e) => updateDraft(i, { color: e.target.value })}
                    style={{ ...inp, padding: '6px 8px', textTransform: 'capitalize' }} />
                  <datalist id="import-colors">{palette.map(c => <option key={c} value={c} />)}</datalist>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {err && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', color: '#f87171', padding: 8, borderRadius: 8, fontSize: 12, marginTop: 8 }}>⚠ {err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={{ ...btn, background: 'rgba(255,255,255,0.1)', color: '#fff', flex: 1 }}>Cancel</button>
        <button onClick={submit} disabled={busy} style={{ ...btn, background: '#60a5fa', color: '#fff', flex: 2 }}>
          {busy ? 'Importing…' : `📥 Import ${drafts.filter(d => d.selected).length}`}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#0b1628', borderRadius: 14, padding: 16, maxWidth: 560, width: '100%', marginTop: 24, border: '1px solid rgba(245,197,24,0.25)' }}>
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

function chip(fg: string): React.CSSProperties {
  return { fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: fg, letterSpacing: 0.3 };
}

function colorSwatch(name: string): string {
  const m: Record<string, string> = {
    red:'#ef4444', blue:'#3b82f6', green:'#22c55e', yellow:'#eab308',
    orange:'#f97316', purple:'#a855f7', white:'#ffffff', black:'#111827',
    pink:'#ec4899', cyan:'#06b6d4', brown:'#92400e', gray:'#6b7280',
  };
  return m[(name || '').toLowerCase()] ?? '#94a3b8';
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const empty: React.CSSProperties = { padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 };
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 14, boxSizing: 'border-box' };
const btn: React.CSSProperties = { border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer' };
