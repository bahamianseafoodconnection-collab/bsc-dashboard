'use client';

// /spinytails/steps — Step-by-step walkthrough.
//
// Linear view of the 11 lobster-export steps with each step's SOP doc
// + CCP markers + related SSOPs cross-referenced. Read-only,
// inspector-friendly. Renders SOP body inline via SimpleMarkdown so
// no PDF download is required to read the procedure.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import SimpleMarkdown from '@/components/SimpleMarkdown';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver']);

interface DocRow {
  id: string;
  slug: string;
  title: string;
  doc_kind: string;
  applies_to_step: number | null;
  applies_to_ssop: string | null;
  applies_to_ccp:  string | null;
  summary: string | null;
  body_md: string | null;
  file_url: string | null;
  version: string;
  is_current: boolean;
}

const STEP_OUTLINE: { step: number; label: string; ccp: string | null }[] = [
  { step: 1,  label: 'Receiving Lobsters',           ccp: 'ccp1_receiving' },
  { step: 2,  label: 'Quality & Safety Inspection',  ccp: 'ccp1_receiving' },
  { step: 3,  label: 'Receiving Storage Freezer',    ccp: null },
  { step: 4,  label: 'Thawing',                      ccp: 'ccp2_thawing' },
  { step: 5,  label: 'De-veining & Cleaning',        ccp: 'ccp3_deveining_sulfite' },
  { step: 6,  label: 'Sorting & Grading',            ccp: null },
  { step: 7,  label: 'Primary Packaging (10lb)',     ccp: null },
  { step: 8,  label: 'Blast Freezing',               ccp: 'ccp4_blast_freezing' },
  { step: 9,  label: 'Master Packaging & Labeling',  ccp: 'ccp5_labeling' },
  { step: 10, label: 'Distribution Storage Freezer', ccp: null },
  { step: 11, label: 'Shipping & Export',            ccp: null },
];

export default function StepsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [docs, setDocs]     = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState<number>(1);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/spinytails/steps'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !STAFF_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      // Honor ?step=N deep-link from intake / lot detail cross-links.
      if (typeof window !== 'undefined') {
        const sp = new URLSearchParams(window.location.search);
        const s  = parseInt(sp.get('step') ?? '', 10);
        if (Number.isFinite(s) && s >= 1 && s <= 11) setActiveStep(s);
      }
      const { data } = await supabase.from('spinytails_documents').select('*').eq('is_current', true);
      setDocs((data ?? []) as DocRow[]);
      setLoading(false);
    })();
  }, []);

  const sopByStep = useMemo(() => {
    const m = new Map<number, DocRow>();
    for (const d of docs) {
      if (d.doc_kind === 'sop' && d.applies_to_step != null) m.set(d.applies_to_step, d);
    }
    return m;
  }, [docs]);

  const ccpDocs = useMemo(() => {
    const m = new Map<string, DocRow>();
    for (const d of docs) {
      if (d.doc_kind === 'haccp_plan' && d.applies_to_ccp) m.set(d.applies_to_ccp, d);
    }
    return m;
  }, [docs]);

  const ssopDocs = useMemo(() => docs.filter(d => d.doc_kind === 'ssop'), [docs]);

  if (authed === null) return <div style={pg}>Loading…</div>;

  const sop = sopByStep.get(activeStep);
  const stepInfo = STEP_OUTLINE.find(s => s.step === activeStep);
  const ccp = stepInfo?.ccp ? ccpDocs.get(stepInfo.ccp) : null;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/spinytails" style={back}>← Spiny Tails</Link>
            <Link href="/spinytails/documents" style={{ ...back, color: '#a78bfa' }}>📚 Full document library →</Link>
          </div>
          <h1 style={h1}>📚 Step-by-step — Lobster export process</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Each step shows its SOP procedure + linked CCP. Inspector-ready.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        {loading && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>}

        {/* Step strip */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
          {STEP_OUTLINE.map(s => {
            const has = sopByStep.has(s.step);
            const active = activeStep === s.step;
            return (
              <button key={s.step} onClick={() => setActiveStep(s.step)}
                style={{
                  background: active ? '#f5c518' : has ? 'rgba(245,197,24,0.12)' : 'rgba(255,255,255,0.04)',
                  color:      active ? '#060d1f' : has ? '#f5c518'             : 'rgba(255,255,255,0.4)',
                  border:    `1px solid ${active ? '#f5c518' : 'transparent'}`,
                  borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  position: 'relative',
                }}>
                Step {s.step}
                {s.ccp && <span style={{ position: 'absolute', top: -4, right: -4, fontSize: 8, padding: '1px 5px', borderRadius: 4, background: '#f87171', color: '#fff', fontWeight: 900 }}>CCP</span>}
              </button>
            );
          })}
        </div>

        {/* Active step content */}
        {stepInfo && (
          <div style={{ ...card, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>
                  Step {stepInfo.step} of 11
                </p>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: '#f5c518', margin: '4px 0 0' }}>{stepInfo.label}</h2>
              </div>
              {stepInfo.ccp && (
                <span style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid #f87171', borderRadius: 6, padding: '4px 10px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>
                  🛡️ {stepInfo.ccp.replace(/_/g, ' ').toUpperCase()}
                </span>
              )}
            </div>

            {sop ? (
              <div style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 14 }}>
                <SimpleMarkdown source={sop.body_md ?? ''} />
                <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                  <code style={{ background: 'rgba(245,197,24,0.1)', padding: '1px 6px', borderRadius: 4 }}>{sop.slug}</code> · v{sop.version}
                  {sop.file_url && <>{' · '}<a href={sop.file_url} target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>📎 canonical file</a></>}
                </div>
              </div>
            ) : (
              <div style={{ ...empty }}>
                No SOP on file for Step {stepInfo.step}. <Link href="/spinytails/documents" style={{ color: '#f5c518' }}>Upload one →</Link>
              </div>
            )}

            {ccp && (
              <div style={{ marginTop: 14, background: 'rgba(248,113,113,0.08)', border: '1px solid #f87171', borderRadius: 10, padding: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: '#f87171', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>
                  🛡️ HACCP plan — {ccp.title}
                </p>
                <SimpleMarkdown source={ccp.body_md ?? ''} />
              </div>
            )}
          </div>
        )}

        {/* SSOP grid — always visible, cross-cutting */}
        <div style={{ marginTop: 24 }}>
          <h2 style={h2}>🧼 Standard Sanitation Operating Procedures (apply across all steps)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {ssopDocs.map(s => (
              <Link key={s.id} href={`/spinytails/documents`}
                style={{ background: '#0b1628', border: '1px solid rgba(34,211,238,0.25)', borderRadius: 8, padding: 10, textDecoration: 'none', color: '#fff' }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: '#22d3ee', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {s.applies_to_ssop?.replace(/^ssop_/, 'SSOP ').replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>{s.title.replace(/^SSOP \d+ — /, '')}</div>
                {s.summary && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 4, lineHeight: 1.4 }}>{s.summary}</div>}
              </Link>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 18 }}>
          Sources: <strong>Spiny Tails Processing Co. — Lobster SOP Narrative</strong>, <strong>SSOP and Organizational Chart</strong>, <strong>HACCP Traceability Master</strong>.
        </p>
      </main>
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '6px 0 2px' };
const h2: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' };
const empty: React.CSSProperties = { padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(245,197,24,0.25)', borderRadius: 12 };
const card: React.CSSProperties = { background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 12 };
