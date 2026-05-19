'use client';

// /spinytails/vessels — Spiny Tails vessel registry.
//
// Each vessel = one supplying boat. The 2-letter vessel_code becomes
// the VV in every lot code (STPC-YYYYMMDD-VV-NN), so codes are
// validated as ^[A-Z]{2}$ and uniqueness is DB-enforced. Color tag is
// also uniquely enforced among 'approved' vessels (partial index in
// the migration).
//
// "Import from suppliers" surfaces existing /supplier records that
// already have vessel info but no spinytails_vessels row, so admin
// can wire them up without re-typing.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver']);

interface Vessel {
  id:                   string;
  vessel_code:          string;
  vessel_name:          string | null;
  fisherman_name:       string;
  fisherman_phone:      string | null;
  license_number:       string | null;
  color_tag:            string;
  status:               'approved' | 'suspended' | 'inactive';
  notes:                string | null;
  created_at:           string;
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

const COLOR_OPTIONS = ['Red','Blue','Green','Yellow','Orange','Purple','White','Black','Pink','Cyan','Brown','Gray'];

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
      (v.vessel_name ?? '').toLowerCase().includes(q) ||
      v.color_tag.toLowerCase().includes(q)
    );
  }, [vessels, search]);

  const usedCodes  = useMemo(() => new Set(vessels.map(v => v.vessel_code)), [vessels]);
  const usedColors = useMemo(() => new Set(vessels.filter(v => v.status === 'approved').map(v => v.color_tag)), [vessels]);

  // Suggested 2-letter codes from a name (first letters of first two words, else first 2 letters)
  function suggestCode(name: string): string {
    const words = name.trim().toUpperCase().split(/\s+/);
    let code = '';
    if (words.length >= 2) code = (words[0][0] ?? '') + (words[1][0] ?? '');
    else                   code = words[0]?.slice(0, 2) ?? '';
    code = code.replace(/[^A-Z]/g, '').padEnd(2, 'X').slice(0, 2);
    // Bump if collision
    let i = 0;
    while (usedCodes.has(code) && i < 26) {
      code = (code[0] ?? 'A') + String.fromCharCode('A'.charCodeAt(0) + i);
      i += 1;
    }
    return code;
  }

  // Free color suggestion
  function suggestColor(): string {
    return COLOR_OPTIONS.find(c => !usedColors.has(c)) ?? 'Gray';
  }

  // Suppliers with vessel info but no matching spinytails_vessels row.
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
          <h1 style={h1}>🛥 Vessels — registry</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {vessels.length} vessel{vessels.length === 1 ? '' : 's'} · {vessels.filter(v => v.status === 'approved').length} approved · {orphanSuppliers.length} supplier{orphanSuppliers.length === 1 ? '' : 's'} ready to import
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, name, color…"
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
          {filtered.map(v => (
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
              <div style={{ fontSize: 13, fontWeight: 700 }}>{v.fisherman_name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                {v.vessel_name ?? '—'}{v.license_number ? ` · lic ${v.license_number}` : ''}
              </div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: colorSwatch(v.color_tag), border: '1px solid rgba(255,255,255,0.3)' }} />
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>{v.color_tag}</span>
              </div>
            </button>
          ))}
        </div>
      </main>

      {addOpen && (
        <VesselForm
          title="+ New vessel"
          initial={{
            vessel_code: '', vessel_name: '', fisherman_name: '', fisherman_phone: '',
            license_number: '', color_tag: suggestColor(), status: 'approved', notes: '',
          }}
          existingCodes={usedCodes}
          existingColors={usedColors}
          onClose={() => setAddOpen(false)}
          onSave={async (data) => {
            const { error } = await supabase.from('spinytails_vessels').insert(data);
            if (error) { alert(error.message); return; }
            setToast('✓ Vessel created'); setTimeout(() => setToast(null), 3000);
            setAddOpen(false); await load();
          }}
        />
      )}

      {editing && (
        <VesselForm
          title={`Edit ${editing.vessel_code}`}
          initial={{
            vessel_code:    editing.vessel_code,
            vessel_name:    editing.vessel_name ?? '',
            fisherman_name: editing.fisherman_name,
            fisherman_phone: editing.fisherman_phone ?? '',
            license_number: editing.license_number ?? '',
            color_tag:      editing.color_tag,
            status:         editing.status,
            notes:          editing.notes ?? '',
          }}
          codeReadonly
          existingCodes={usedCodes}
          existingColors={new Set([...usedColors].filter(c => c !== editing.color_tag))}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            // Don't try to update primary key
            const { vessel_code: _unused, ...rest } = data;
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

// ─── Vessel form (used for both add + edit) ──────────────────────────
type FormData = {
  vessel_code: string; vessel_name: string; fisherman_name: string; fisherman_phone: string;
  license_number: string; color_tag: string; status: 'approved' | 'suspended' | 'inactive'; notes: string;
};

function VesselForm({
  title, initial, codeReadonly, existingCodes, existingColors, onClose, onSave,
}: {
  title: string;
  initial: FormData;
  codeReadonly?: boolean;
  existingCodes: Set<string>;
  existingColors: Set<string>;
  onClose: () => void;
  onSave: (data: FormData) => Promise<void>;
}) {
  const [d, setD]   = useState<FormData>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  function validate(): string | null {
    if (!/^[A-Z]{2}$/.test(d.vessel_code)) return 'Vessel code must be exactly 2 uppercase letters';
    if (!codeReadonly && existingCodes.has(d.vessel_code)) return `Code ${d.vessel_code} already in use`;
    if (!d.fisherman_name.trim()) return 'Fisherman name required';
    if (!d.color_tag) return 'Color tag required';
    if (d.status === 'approved' && existingColors.has(d.color_tag)) return `Color ${d.color_tag} already in use by another approved vessel`;
    return null;
  }

  async function submit() {
    const e = validate();
    if (e) { setErr(e); return; }
    setErr(null); setBusy(true);
    await onSave({
      vessel_code:    d.vessel_code,
      vessel_name:    d.vessel_name.trim() || null as unknown as string,
      fisherman_name: d.fisherman_name.trim(),
      fisherman_phone:d.fisherman_phone.trim() || null as unknown as string,
      license_number: d.license_number.trim() || null as unknown as string,
      color_tag:      d.color_tag,
      status:         d.status,
      notes:          d.notes.trim() || null as unknown as string,
    } as FormData);
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
        <Field label="Status">
          <select value={d.status} onChange={(e) => setD(s => ({ ...s, status: e.target.value as FormData['status'] }))} style={inp}>
            <option value="approved">approved</option>
            <option value="suspended">suspended</option>
            <option value="inactive">inactive</option>
          </select>
        </Field>
      </div>
      <Field label="Fisherman / captain name *">
        <input value={d.fisherman_name} onChange={(e) => setD(s => ({ ...s, fisherman_name: e.target.value }))} placeholder="Anthony Taylor" style={inp} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Vessel name">
          <input value={d.vessel_name} onChange={(e) => setD(s => ({ ...s, vessel_name: e.target.value }))} placeholder="Sea Hunter" style={inp} />
        </Field>
        <Field label="Phone">
          <input value={d.fisherman_phone} onChange={(e) => setD(s => ({ ...s, fisherman_phone: e.target.value }))} placeholder="+1 242 …" style={inp} />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="License #">
          <input value={d.license_number} onChange={(e) => setD(s => ({ ...s, license_number: e.target.value }))} placeholder="LIC-12345" style={inp} />
        </Field>
        <Field label="Color tag *">
          <select value={d.color_tag} onChange={(e) => setD(s => ({ ...s, color_tag: e.target.value }))} style={inp}>
            {COLOR_OPTIONS.map(c => <option key={c} value={c} disabled={existingColors.has(c) && c !== initial.color_tag}>{c}{existingColors.has(c) && c !== initial.color_tag ? ' (in use)' : ''}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes">
        <input value={d.notes} onChange={(e) => setD(s => ({ ...s, notes: e.target.value }))} placeholder="anything to flag" style={inp} />
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
function ImportModal({ orphans, suggestCode, suggestColor, existingCodes, existingColors, onClose, onImported }: {
  orphans: SupplierMini[];
  suggestCode: (name: string) => string;
  suggestColor: () => string;
  existingCodes: Set<string>;
  existingColors: Set<string>;
  onClose: () => void;
  onImported: (count: number) => Promise<void>;
}) {
  // For each orphan, the operator picks a 2-letter code + color, then bulk-import.
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

    // Validate uniqueness within selection + against existing
    const seenCodes  = new Set<string>(existingCodes);
    const seenColors = new Set<string>(existingColors);
    for (const d of selected) {
      if (!/^[A-Z]{2}$/.test(d.code)) { setErr(`${d.code || '(blank)'} — code must be 2 uppercase letters`); return; }
      if (seenCodes.has(d.code))      { setErr(`Code ${d.code} duplicated`); return; }
      if (seenColors.has(d.color))    { setErr(`Color ${d.color} duplicated`); return; }
      seenCodes.add(d.code);
      seenColors.add(d.color);
    }

    setErr(null); setBusy(true);
    const rows = selected.map(d => {
      const o = orphans.find(x => x.id === d.id)!;
      return {
        vessel_code:    d.code,
        vessel_name:    o.vessel_name,
        fisherman_name: o.vessel_captain_name || o.name,
        fisherman_phone: o.contact_phone,
        license_number: o.vessel_registration_number,
        color_tag:      d.color,
        status:         'approved' as const,
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
        Each row inherits the supplier&rsquo;s vessel info. Pick a unique 2-letter code + a free color tag.
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
                  <select value={d.color} onChange={(e) => updateDraft(i, { color: e.target.value })} style={{ ...inp, padding: '6px 8px' }}>
                    {COLOR_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
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
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#0b1628', borderRadius: 14, padding: 16, maxWidth: 540, width: '100%', marginTop: 24, border: '1px solid rgba(245,197,24,0.25)' }}>
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

function colorSwatch(name: string): string {
  const m: Record<string, string> = {
    Red:'#ef4444', Blue:'#3b82f6', Green:'#22c55e', Yellow:'#eab308',
    Orange:'#f97316', Purple:'#a855f7', White:'#fff', Black:'#0b1628',
    Pink:'#ec4899', Cyan:'#06b6d4', Brown:'#92400e', Gray:'#6b7280',
  };
  return m[name] ?? '#94a3b8';
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const empty: React.CSSProperties = { padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 };
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 14, boxSizing: 'border-box' };
const btn: React.CSSProperties = { border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer' };
