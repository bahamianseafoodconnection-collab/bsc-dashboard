'use client';

// /documents/capture — Universal Document Capture (Phase 1)
//
// Mobile-first: take a photo or upload any document → Claude vision identifies
// the type + extracts the fields + traceability ids → the original is preserved
// and mirrored. Phase 2 turns "Approve" into auto-creating the matching record
// (supplier / receiving / PO / export …).

import { useState, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface Result {
  document_id: string | null; file_url: string;
  doc_type: string; confidence: number | null; summary: string;
  fields: Record<string, unknown>; traceability: Record<string, string>;
  ai_error: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  landing_report: '🎣 Landing Report', purchase_invoice: '🧾 Purchase Invoice', price_list: '📋 Price List',
  export_certificate: '📤 Export Certificate', health_certificate: '🩺 Health Certificate',
  purchase_order: '📦 Purchase Order', shipping_document: '🚚 Shipping Document', customs_document: '🛃 Customs Document',
  vessel_logbook: '⚓ Vessel Logbook', receipt: '🧾 Receipt', other: '📄 Document',
};

export default function DocumentCapturePage() {
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setErr(''); setRes(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreview(file.type.startsWith('image/') ? dataUrl : '');
      setBusy(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch('/api/documents/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
          body: JSON.stringify({ file_base64: dataUrl, file_name: file.name, mime_type: file.type || 'image/jpeg' }),
        });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setRes(j as Result);
      } catch (e) { setErr(e instanceof Error ? e.message : 'Capture failed'); }
      finally { setBusy(false); }
    };
    reader.readAsDataURL(file);
  }

  const traceEntries = res ? Object.entries(res.traceability).filter(([, v]) => v) : [];
  const sec: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 14 };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: 16, fontFamily: 'system-ui', maxWidth: 640, margin: '0 auto' }}>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f); }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f); }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0b1628', margin: 0 }}>📸 Document Capture</h1>
        <Link href="/dashboard" style={{ fontSize: 12, color: '#64748b' }}>← Control</Link>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <button onClick={() => camRef.current?.click()} disabled={busy} style={{ flex: 1, padding: 16, background: '#0b1628', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>📷 Take photo</button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ flex: 1, padding: 16, background: '#fff', color: '#0b1628', border: '2px solid #cbd5e1', borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>📁 Upload file</button>
      </div>
      <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: -6, marginBottom: 14 }}>Invoice · price list · landing report · export cert · health cert · PO · logbook…</p>

      {busy && <div style={{ ...sec, textAlign: 'center', color: '#475569', fontWeight: 700 }}>🔍 Reading document… identifying type + extracting fields</div>}
      {err && <div style={{ ...sec, border: '2px solid #dc2626', background: '#fef2f2', color: '#b91c1c', fontWeight: 700 }}>⚠ {err}</div>}

      {(preview || res) && (
        <div style={sec}>
          <div style={{ display: 'grid', gridTemplateColumns: res ? '1fr 1fr' : '1fr', gap: 12 }}>
            {preview && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#7a5e00', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Original</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={res?.file_url || preview} alt="document" style={{ width: '100%', borderRadius: 8, border: '1px solid #e2e8f0' }} />
              </div>
            )}
            {res && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#7a5e00', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Identified</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#0b1628' }}>{TYPE_LABEL[res.doc_type] ?? res.doc_type}</div>
                {res.confidence != null && <div style={{ fontSize: 12, color: '#64748b' }}>confidence {(res.confidence * 100).toFixed(0)}%</div>}
                {res.summary && <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{res.summary}</div>}
                {res.ai_error && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>⚠ {res.ai_error}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {res && traceEntries.length > 0 && (
        <div style={{ ...sec, border: '2px solid #16a34a', background: '#f0fdf4' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: 1 }}>🔗 Traceability links found</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {traceEntries.map(([k, v]) => <span key={k} style={{ fontSize: 13, background: '#fff', border: '1px solid #86efac', borderRadius: 8, padding: '4px 10px', fontFamily: 'monospace', fontWeight: 700 }}>{k.replace(/_/g, ' ')}: {v}</span>)}
          </div>
        </div>
      )}

      {res && (
        <div style={sec}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Extracted fields</div>
          {Object.keys(res.fields).length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13 }}>No fields extracted.</div> : <FieldTable fields={res.fields} />}
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>✓ Original preserved + mirrored. Auto-creating the matching record (supplier / receiving / PO / export) from these fields is the next phase.</p>
        </div>
      )}
    </div>
  );
}

function FieldTable({ fields }: { fields: Record<string, unknown> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {Object.entries(fields).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, borderBottom: '1px dotted #e2e8f0', padding: '4px 0' }}>
          <b style={{ color: '#475569' }}>{k.replace(/_/g, ' ')}</b>
          <span style={{ textAlign: 'right', color: '#0b1628', wordBreak: 'break-word' }}>{Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : typeof v === 'object' && v ? JSON.stringify(v) : String(v ?? '—')}</span>
        </div>
      ))}
    </div>
  );
}
