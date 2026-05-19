'use client';

// /spinytails/documents — SSOP / SOP / HACCP / Forms library.
//
// All authenticated users can READ (so future inspectors with a
// scoped role get access). Staff can INSERT/UPDATE new versions;
// only admins can DELETE per RLS.
//
// The bodies are rendered inline as markdown using SimpleMarkdown.
// Canonical PDFs / docx can be uploaded into the spinytails-documents
// storage bucket and linked via file_url.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import SimpleMarkdown from '@/components/SimpleMarkdown';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver']);

type DocKind = 'sop' | 'ssop' | 'haccp_plan' | 'form' | 'policy' | 'training' | 'manual';
type SsopId  = 'ssop_01_water' | 'ssop_02_facility_cleanliness' | 'ssop_03_cross_contamination'
             | 'ssop_04_handwash_toilets' | 'ssop_05_food_protection' | 'ssop_06_toxic_chemicals'
             | 'ssop_07_employee_health' | 'ssop_08_pest_exclusion' | 'ssop_09_waste_disposal'
             | 'ssop_10_outside_contractors' | 'ssop_11_transport_vehicles' | 'ssop_12_raw_material_storage';
type CcpId   = 'ccp1_receiving' | 'ccp2_thawing' | 'ccp3_deveining_sulfite' | 'ccp4_blast_freezing' | 'ccp5_labeling';

interface DocRow {
  id: string;
  slug: string;
  title: string;
  doc_kind: DocKind;
  version: string;
  applies_to_step: number | null;
  applies_to_ssop: SsopId | null;
  applies_to_ccp:  CcpId | null;
  summary: string | null;
  body_md: string | null;
  file_url: string | null;
  is_current: boolean;
  approved_at: string | null;
  uploaded_at: string;
  notes: string | null;
}

const KIND_LABELS: Record<DocKind, { label: string; emoji: string; color: string }> = {
  sop:        { label: 'SOP',         emoji: '📘', color: '#60a5fa' },
  ssop:       { label: 'SSOP',        emoji: '🧼', color: '#22d3ee' },
  haccp_plan: { label: 'HACCP plan',  emoji: '🛡️', color: '#f87171' },
  form:       { label: 'Form',        emoji: '📋', color: '#a78bfa' },
  policy:     { label: 'Policy',      emoji: '📜', color: '#fbbf24' },
  training:   { label: 'Training',    emoji: '🎓', color: '#4ade80' },
  manual:     { label: 'Manual',      emoji: '📔', color: '#cbd5e1' },
};

export default function DocumentsPage() {
  const [authed, setAuthed]     = useState<boolean | null>(null);
  const [isStaff, setIsStaff]   = useState(false);
  const [docs, setDocs]         = useState<DocRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<'all' | DocKind>('all');
  const [search, setSearch]     = useState('');
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [viewing, setViewing]   = useState<DocRow | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/spinytails/documents'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      const role = (prof?.role as string) ?? '';
      setIsStaff(STAFF_ROLES.has(role));
      setAuthed(true);
      await load(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(includeOldVersions: boolean) {
    setLoading(true);
    let q = supabase.from('spinytails_documents').select('*').order('doc_kind').order('applies_to_step').order('applies_to_ssop').order('applies_to_ccp').order('title');
    if (!includeOldVersions) q = q.eq('is_current', true);
    const { data } = await q;
    setDocs((data ?? []) as DocRow[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let r = docs;
    if (filter !== 'all') r = r.filter(d => d.doc_kind === filter);
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(d => d.title.toLowerCase().includes(s) || (d.summary ?? '').toLowerCase().includes(s) || d.slug.includes(s));
    }
    return r;
  }, [docs, filter, search]);

  const countsByKind = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of docs.filter(x => x.is_current)) {
      m[d.doc_kind] = (m[d.doc_kind] ?? 0) + 1;
    }
    return m;
  }, [docs]);

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/spinytails" style={back}>← Spiny Tails</Link>
            <Link href="/spinytails/steps" style={{ ...back, color: '#a78bfa' }}>📚 Step-by-step view →</Link>
          </div>
          <h1 style={h1}>📚 SOP · SSOP · HACCP Library</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {docs.filter(d => d.is_current).length} active document{docs.filter(d => d.is_current).length === 1 ? '' : 's'} · click any to read · staff can upload new versions
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, summary, slug…"
            style={{ flex: '1 1 240px', padding: '10px 12px', borderRadius: 10, background: '#0b1628', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 14 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            <input type="checkbox" checked={showAllVersions} onChange={async (e) => { setShowAllVersions(e.target.checked); await load(e.target.checked); }} />
            Show all versions
          </label>
          {isStaff && (
            <button onClick={() => setUploadOpen(true)}
              style={{ background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              + Upload document
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <FilterChip label="All" count={docs.filter(d => d.is_current).length} active={filter === 'all'} onClick={() => setFilter('all')} accent="#f5c518" />
          {(Object.keys(KIND_LABELS) as DocKind[]).map(k => (
            <FilterChip key={k} label={`${KIND_LABELS[k].emoji} ${KIND_LABELS[k].label}`} count={countsByKind[k] ?? 0}
              active={filter === k} onClick={() => setFilter(k)} accent={KIND_LABELS[k].color} />
          ))}
        </div>

        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}
        {!loading && filtered.length === 0 && <div style={empty}>No documents match.</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
          {filtered.map(d => (
            <button key={d.id} onClick={() => setViewing(d)} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.5, background: `${KIND_LABELS[d.doc_kind].color}22`, color: KIND_LABELS[d.doc_kind].color }}>
                  {KIND_LABELS[d.doc_kind].emoji} {KIND_LABELS[d.doc_kind].label}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#94a3b8' }}>v{d.version}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{d.title}</div>
              {d.summary && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>{d.summary}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {d.applies_to_step !== null && <Tag label={`Step ${d.applies_to_step}`} color="#fbbf24" />}
                {d.applies_to_ccp  !== null && <Tag label={d.applies_to_ccp.replace(/_/g, ' ').toUpperCase()} color="#f87171" />}
                {d.applies_to_ssop !== null && <Tag label={d.applies_to_ssop.replace(/^ssop_/, 'SSOP ').replace(/_/g, ' ').toUpperCase()} color="#22d3ee" />}
                {!d.is_current && <Tag label="OLD" color="#94a3b8" />}
                {d.file_url && <Tag label="📎 file" color="#a78bfa" />}
              </div>
            </button>
          ))}
        </div>
      </main>

      {viewing && <ViewerModal doc={viewing} onClose={() => setViewing(null)} />}

      {uploadOpen && isStaff && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onSaved={async () => { setUploadOpen(false); await load(showAllVersions); }}
          existingSlugs={Array.from(new Set(docs.map(d => d.slug)))}
        />
      )}
    </div>
  );
}

function ViewerModal({ doc, onClose }: { doc: DocRow; onClose: () => void }) {
  return (
    <div style={modalBg} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalCard, maxWidth: 760 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, gap: 6, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 999, textTransform: 'uppercase', background: `${KIND_LABELS[doc.doc_kind].color}22`, color: KIND_LABELS[doc.doc_kind].color }}>
              {KIND_LABELS[doc.doc_kind].emoji} {KIND_LABELS[doc.doc_kind].label} · v{doc.version}
            </span>
            <h2 style={{ fontFamily: "'Playfair Display', serif", color: '#f5c518', fontSize: 22, margin: '8px 0 4px' }}>{doc.title}</h2>
            {doc.summary && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: 0 }}>{doc.summary}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {doc.file_url && (
          <div style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid #a78bfa', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 12 }}>
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa', textDecoration: 'none', fontWeight: 700 }}>
              📎 Open canonical file →
            </a>
          </div>
        )}

        {doc.body_md ? (
          <div style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 14, maxHeight: '65vh', overflowY: 'auto' }}>
            <SimpleMarkdown source={doc.body_md} />
          </div>
        ) : (
          <div style={{ ...empty, marginTop: 0 }}>No inline content. Use the linked file above.</div>
        )}

        <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          slug: <code style={{ background: 'rgba(245,197,24,0.1)', padding: '1px 6px', borderRadius: 4 }}>{doc.slug}</code>
          {doc.approved_at && <> · approved {new Date(doc.approved_at).toLocaleDateString()}</>}
          {doc.uploaded_at && <> · uploaded {new Date(doc.uploaded_at).toLocaleDateString()}</>}
        </div>
      </div>
    </div>
  );
}

function UploadModal({ onClose, onSaved, existingSlugs }: { onClose: () => void; onSaved: () => Promise<void>; existingSlugs: string[] }) {
  const [kind, setKind]    = useState<DocKind>('sop');
  const [title, setTitle]  = useState('');
  const [slug, setSlug]    = useState('');
  const [version, setVersion] = useState('1.0');
  const [appliesStep, setAppliesStep] = useState('');
  const [appliesSsop, setAppliesSsop] = useState('');
  const [appliesCcp,  setAppliesCcp]  = useState('');
  const [summary, setSummary] = useState('');
  const [bodyMd, setBodyMd]   = useState('');
  const [file, setFile]    = useState<File | null>(null);
  const [busy, setBusy]    = useState(false);
  const [err, setErr]      = useState<string | null>(null);
  const [bumpFromSlug, setBumpFromSlug] = useState(false);

  function autoSlug(t: string): string {
    return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  }

  async function submit() {
    setErr(null);
    if (!title.trim()) { setErr('Title required'); return; }
    const finalSlug = (slug.trim() || autoSlug(title));
    if (!finalSlug) { setErr('Slug required'); return; }

    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // If bumping an existing slug, mark the old current as not-current
      if (bumpFromSlug && existingSlugs.includes(finalSlug)) {
        await supabase.from('spinytails_documents').update({ is_current: false }).eq('slug', finalSlug).eq('is_current', true);
      }

      // Upload file (if any)
      let file_url: string | null = null;
      if (file) {
        const ext = file.name.split('.').pop() ?? 'pdf';
        const path = `${finalSlug}/${version}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('spinytails-documents').upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('spinytails-documents').getPublicUrl(path);
        file_url = pub.publicUrl;
      }

      const { error: insErr } = await supabase.from('spinytails_documents').insert({
        slug:            finalSlug,
        title:           title.trim(),
        doc_kind:        kind,
        version:         version.trim(),
        applies_to_step: appliesStep ? parseInt(appliesStep, 10) : null,
        applies_to_ssop: appliesSsop || null,
        applies_to_ccp:  appliesCcp  || null,
        summary:         summary.trim() || null,
        body_md:         bodyMd.trim() || null,
        file_url,
        is_current:      true,
        approved_at:     new Date().toISOString(),
        uploaded_by:     user?.id ?? null,
        uploaded_at:     new Date().toISOString(),
      });
      if (insErr) throw insErr;
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={modalBg} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalCard, maxWidth: 620 }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", color: '#f5c518', fontSize: 20, margin: '0 0 4px' }}>+ Upload document</h2>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', margin: '0 0 12px' }}>
          New version of an existing slug? Check the &ldquo;bump&rdquo; box — we&apos;ll mark the old version is_current=false automatically.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Kind">
            <select value={kind} onChange={(e) => setKind(e.target.value as DocKind)} style={inp}>
              {(Object.keys(KIND_LABELS) as DocKind[]).map(k => (
                <option key={k} value={k}>{KIND_LABELS[k].emoji} {KIND_LABELS[k].label}</option>
              ))}
            </select>
          </Field>
          <Field label="Version">
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" style={inp} />
          </Field>
        </div>

        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Step 5 — De-veining & Cleaning" style={inp} />
        </Field>

        <Field label={`Slug (URL-safe) ${slug.trim() || autoSlug(title) ? `· will use: ${slug.trim() || autoSlug(title)}` : ''}`}>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={`auto: ${title ? autoSlug(title) : 'from-title'}`} style={inp} />
        </Field>

        {existingSlugs.includes(slug.trim() || autoSlug(title)) && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#fbbf24', marginBottom: 8 }}>
            <input type="checkbox" checked={bumpFromSlug} onChange={(e) => setBumpFromSlug(e.target.checked)} />
            Bump version (mark the existing current version of <strong style={{ fontFamily: 'monospace' }}>{slug.trim() || autoSlug(title)}</strong> as not-current)
          </label>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <Field label="Applies to step (1-11)">
            <select value={appliesStep} onChange={(e) => setAppliesStep(e.target.value)} style={inp}>
              <option value="">—</option>
              {[1,2,3,4,5,6,7,8,9,10,11].map(n => <option key={n} value={n}>Step {n}</option>)}
            </select>
          </Field>
          <Field label="Applies to SSOP">
            <select value={appliesSsop} onChange={(e) => setAppliesSsop(e.target.value)} style={inp}>
              <option value="">—</option>
              <option value="ssop_01_water">SSOP 1 · Water</option>
              <option value="ssop_02_facility_cleanliness">SSOP 2 · Facility</option>
              <option value="ssop_03_cross_contamination">SSOP 3 · Cross-contam</option>
              <option value="ssop_04_handwash_toilets">SSOP 4 · Handwash</option>
              <option value="ssop_05_food_protection">SSOP 5 · Food protection</option>
              <option value="ssop_06_toxic_chemicals">SSOP 6 · Toxic chems</option>
              <option value="ssop_07_employee_health">SSOP 7 · Health</option>
              <option value="ssop_08_pest_exclusion">SSOP 8 · Pests</option>
              <option value="ssop_09_waste_disposal">SSOP 9 · Waste</option>
              <option value="ssop_10_outside_contractors">SSOP 10 · Contractors</option>
              <option value="ssop_11_transport_vehicles">SSOP 11 · Transport</option>
              <option value="ssop_12_raw_material_storage">SSOP 12 · Raw mat. storage</option>
            </select>
          </Field>
          <Field label="Applies to CCP">
            <select value={appliesCcp} onChange={(e) => setAppliesCcp(e.target.value)} style={inp}>
              <option value="">—</option>
              <option value="ccp1_receiving">CCP-1 · Receiving</option>
              <option value="ccp2_thawing">CCP-2 · Thawing</option>
              <option value="ccp3_deveining_sulfite">CCP-3 · De-vein/Sulfite</option>
              <option value="ccp4_blast_freezing">CCP-4 · Blast freeze</option>
              <option value="ccp5_labeling">CCP-5 · Labeling</option>
            </select>
          </Field>
        </div>

        <Field label="Summary (one line)">
          <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Short description shown on the card" style={inp} />
        </Field>

        <Field label="Body (markdown — # ## bullets **bold** _italic_ tables)">
          <textarea value={bodyMd} onChange={(e) => setBodyMd(e.target.value)} rows={6}
            placeholder="Optional inline content. Supports # ## ### headings, **bold**, _italic_, - bullets, and | tables |"
            style={{ ...inp, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, resize: 'vertical' }} />
        </Field>

        <Field label="Canonical file (PDF / docx / image — optional)">
          <input type="file" accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 13, color: '#cbd5e1' }} />
        </Field>

        {err && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', color: '#f87171', padding: 10, borderRadius: 8, fontSize: 12, margin: '8px 0' }}>⚠ {err}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ flex: 2, background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 900, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Saving…' : '✓ Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, count, active, onClick, accent }: { label: string; count: number; active: boolean; onClick: () => void; accent: string }) {
  return (
    <button onClick={onClick}
      style={{
        background: active ? accent : 'rgba(255,255,255,0.05)',
        color: active ? '#060d1f' : 'rgba(255,255,255,0.7)',
        border: `1px solid ${active ? accent : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
      }}>
      {label} · {count}
    </button>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      background: `${color}1a`, color, padding: '2px 7px', borderRadius: 4,
      fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4,
    }}>{label}</span>
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

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '6px 0 2px' };
const empty: React.CSSProperties = { padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12, marginTop: 12 };
const card: React.CSSProperties = { background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, cursor: 'pointer', color: '#fff', textAlign: 'left' };
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#060d1f', color: '#fff', border: '1px solid rgba(245,197,24,0.25)', fontSize: 14, boxSizing: 'border-box' };
const modalBg: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 16 };
const modalCard: React.CSSProperties = { background: '#0b1628', borderRadius: 14, padding: 16, width: '100%', marginTop: 24, border: '1px solid rgba(245,197,24,0.25)' };
