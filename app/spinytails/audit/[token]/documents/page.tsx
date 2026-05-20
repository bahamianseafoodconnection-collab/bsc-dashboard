'use client';

// /spinytails/audit/[token]/documents — Inspector-facing SOP/SSOP/HACCP library.
// Read-only. Pulled via spinytails_audit_view_documents() RPC which validates
// the token + logs the visit.

import { useCallback, useEffect, useMemo, useState, use as usePromise } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { Shell } from '@/components/AuditViewerShell';
import SimpleMarkdown from '@/components/SimpleMarkdown';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type DocKind = 'sop' | 'ssop' | 'haccp_plan' | 'form' | 'policy' | 'training' | 'manual';

interface DocRow {
  id: string;
  slug: string;
  title: string;
  doc_kind: DocKind;
  version: string;
  applies_to_step: number | null;
  applies_to_ssop: string | null;
  applies_to_ccp:  string | null;
  summary: string | null;
  body_md: string | null;
  file_url: string | null;
}

const KIND_TINT: Record<DocKind, { bg: string; fg: string; emoji: string; label: string }> = {
  sop:        { bg: '#dbeafe', fg: '#1e40af', emoji: '📘', label: 'SOP' },
  ssop:       { bg: '#cffafe', fg: '#0e7490', emoji: '🧼', label: 'SSOP' },
  haccp_plan: { bg: '#fee2e2', fg: '#991b1b', emoji: '🛡️', label: 'HACCP' },
  form:       { bg: '#ede9fe', fg: '#5b21b6', emoji: '📋', label: 'Form' },
  policy:     { bg: '#fef3c7', fg: '#92400e', emoji: '📜', label: 'Policy' },
  training:   { bg: '#dcfce7', fg: '#166534', emoji: '🎓', label: 'Training' },
  manual:     { bg: '#e5e7eb', fg: '#374151', emoji: '📔', label: 'Manual' },
};

export default function AuditDocumentsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [viewing, setViewing] = useState<DocRow | null>(null);
  const [filter, setFilter] = useState<'all' | DocKind>('all');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const { data, error } = await supabase.rpc('spinytails_audit_view_documents', { p_token: token });
    if (error) { setErr(error.message); setLoading(false); return; }
    setDocs((data ?? []) as DocRow[]);
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => filter === 'all' ? docs : docs.filter(d => d.doc_kind === filter), [docs, filter]);

  return (
    <Shell>
      <Link href={`/spinytails/audit/${encodeURIComponent(token)}`} style={{ color: '#1a2e5a', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>← Back to lots</Link>
      <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#1a2e5a', fontSize: 24, margin: '8px 0 4px' }}>📚 Procedure library</h1>
      <p style={{ fontSize: 12, color: '#475569', margin: '0 0 14px' }}>
        Standard Operating Procedures, Sanitation Standards, HACCP plans, training records — read-only inspector access.
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <Chip label="All" active={filter === 'all'} onClick={() => setFilter('all')} count={docs.length} />
        {(Object.keys(KIND_TINT) as DocKind[]).map(k => {
          const n = docs.filter(d => d.doc_kind === k).length;
          if (n === 0) return null;
          return <Chip key={k} label={`${KIND_TINT[k].emoji} ${KIND_TINT[k].label}`} active={filter === k} onClick={() => setFilter(k)} count={n} tint={KIND_TINT[k]} />;
        })}
      </div>

      {loading && <p style={{ color: '#94a3b8' }}>Loading…</p>}
      {err && <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#9b1c1c', padding: 14, borderRadius: 10 }}>⚠ {err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {filtered.map(d => {
          const tint = KIND_TINT[d.doc_kind];
          return (
            <button key={d.id} onClick={() => setViewing(d)}
              style={{ background: '#fff', borderRadius: 12, padding: 14, textAlign: 'left', border: 'none', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', color: '#1a2e5a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: tint.bg, color: tint.fg, textTransform: 'uppercase' }}>
                  {tint.emoji} {tint.label}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#94a3b8' }}>v{d.version}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{d.title}</div>
              {d.summary && <p style={{ fontSize: 11, color: '#475569', margin: '6px 0 0', lineHeight: 1.45 }}>{d.summary}</p>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {d.applies_to_step !== null && <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>Step {d.applies_to_step}</span>}
                {d.applies_to_ccp                && <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: '#fee2e2', color: '#991b1b' }}>{d.applies_to_ccp.replace(/_/g, ' ').toUpperCase()}</span>}
                {d.applies_to_ssop               && <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: '#cffafe', color: '#0e7490' }}>{d.applies_to_ssop.replace(/^ssop_/, 'SSOP ').replace(/_/g, ' ').toUpperCase()}</span>}
                {d.file_url                       && <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: '#ede9fe', color: '#5b21b6' }}>📎 file</span>}
              </div>
            </button>
          );
        })}
      </div>

      {viewing && <ViewerModal doc={viewing} onClose={() => setViewing(null)} />}
    </Shell>
  );
}

function Chip({ label, active, onClick, count, tint }: { label: string; active: boolean; onClick: () => void; count: number; tint?: { bg: string; fg: string } }) {
  return (
    <button onClick={onClick}
      style={{
        background: active ? '#1a2e5a' : (tint?.bg ?? '#fff'),
        color:      active ? '#f5c518' : (tint?.fg ?? '#1a2e5a'),
        border:     active ? 'none' : '1px solid #e5e7eb',
        borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
      }}>
      {label} · {count}
    </button>
  );
}

function ViewerModal({ doc, onClose }: { doc: DocRow; onClose: () => void }) {
  const tint = KIND_TINT[doc.doc_kind];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 18, maxWidth: 760, width: '100%', marginTop: 24, color: '#1a2e5a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: tint.bg, color: tint.fg, textTransform: 'uppercase' }}>
              {tint.emoji} {tint.label} · v{doc.version}
            </span>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, margin: '6px 0 4px', color: '#1a2e5a' }}>{doc.title}</h2>
            {doc.summary && <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>{doc.summary}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {doc.file_url && (
          <div style={{ background: '#ede9fe', border: '1px solid #a78bfa', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 12 }}>
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ color: '#5b21b6', textDecoration: 'none', fontWeight: 700 }}>
              📎 Open canonical file →
            </a>
          </div>
        )}

        {doc.body_md ? (
          <div style={{ background: '#fbfaf6', borderRadius: 8, padding: 14, maxHeight: '65vh', overflowY: 'auto' }}>
            {/* SimpleMarkdown defaults to dark surface — wrap with light overrides */}
            <div style={{ color: '#1a2e5a', fontSize: 14 }}>
              <SimpleMarkdown source={doc.body_md} />
            </div>
          </div>
        ) : (
          <div style={{ padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: 13, border: '1px dashed #e5e7eb', borderRadius: 8 }}>
            No inline content. Use the linked file above.
          </div>
        )}

        <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 10 }}>
          <code style={{ background: '#fef3c7', padding: '1px 5px', borderRadius: 4 }}>{doc.slug}</code>
        </p>
      </div>
    </div>
  );
}
