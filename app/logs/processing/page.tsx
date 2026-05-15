'use client';

// Staff-facing processing-batch log. For Nicholson / Dashnelle at Spiny Tail.
// Pulls catch_log_id from a dropdown of recent catches, auto-fills species
// and raw weight, calculates yield % / loss % live before submit.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const PROCESS_TYPES = ['Cleaned', 'Portioned', 'Frozen', 'Packaged'] as const;
type ProcessType = typeof PROCESS_TYPES[number];

const QUALITY_GRADES = [
  { value: 'A',        color: '#16a34a' },
  { value: 'B',        color: '#65a30d' },
  { value: 'C',        color: '#d97706' },
  { value: 'Rejected', color: '#dc2626' },
] as const;

type QualityGrade = typeof QUALITY_GRADES[number]['value'];

interface CatchOption {
  id: string;
  species: string;
  raw_weight_lb: number;
  supplier_name: string | null;
  catch_date: string;
}

interface Toast {
  ok: boolean;
  msg: string;
}

const GOLD = '#f5c518';
const NAVY = '#060d1f';

export default function ProcessingLogPage() {
  const [catches, setCatches] = useState<CatchOption[]>([]);
  const [catchId, setCatchId] = useState('');
  const [finishedWeight, setFinishedWeight] = useState('');
  const [processType, setProcessType] = useState<ProcessType | ''>('');
  const [grade, setGrade] = useState<QualityGrade | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('catch_logs')
        .select('id, species, raw_weight_lb, supplier_name, catch_date')
        .order('created_at', { ascending: false })
        .limit(50);
      setCatches((data ?? []) as CatchOption[]);
    })();
  }, []);

  const selected = useMemo(
    () => catches.find((c) => c.id === catchId) ?? null,
    [catches, catchId],
  );

  const finishedLbs = Number(finishedWeight);
  const rawLbs = Number(selected?.raw_weight_lb ?? 0);
  const validYield = selected && rawLbs > 0 && finishedLbs > 0 && finishedLbs <= rawLbs;
  const yieldPct = validYield ? (finishedLbs / rawLbs) * 100 : null;
  const lossPct = yieldPct !== null ? 100 - yieldPct : null;
  const finishedOverflow = selected && finishedLbs > rawLbs;

  function showToast(msg: string, ok = true) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  }

  function resetForm() {
    setCatchId('');
    setFinishedWeight('');
    setProcessType('');
    setGrade('');
    setNotes('');
  }

  async function handleSubmit() {
    if (!selected) { showToast('Pick the catch log this batch came from.', false); return; }
    if (!finishedLbs || finishedLbs <= 0) { showToast('Enter the finished weight in pounds.', false); return; }
    if (finishedOverflow) { showToast('Finished weight cannot be more than raw weight.', false); return; }
    if (!processType) { showToast('Pick the process type.', false); return; }
    if (!grade) { showToast('Pick the quality grade before submitting.', false); return; }

    setSubmitting(true);
    try {
      const { data: insertedProcessing, error: procErr } = await supabase
        .from('processing_logs')
        .insert({
          catch_log_id: selected.id,
          species: selected.species,
          raw_weight_lb: rawLbs,
          finished_weight_lb: finishedLbs,
          yield_pct: yieldPct,
          loss_pct: lossPct,
          process_type: processType,
          quality_grade: grade,
          notes: notes.trim() || null,
        })
        .select('id')
        .single();
      if (procErr || !insertedProcessing) throw procErr ?? new Error('insert failed');

      // Link a traceability record so the manager view can show catch → processing → sale.
      await supabase.from('traceability_records').insert({
        catch_log_id: selected.id,
        processing_log_id: insertedProcessing.id,
        species: selected.species,
        export_status: 'pending',
      });

      showToast('Batch saved. Yield logged.');
      resetForm();
    } catch {
      showToast('Could not save the batch. Please try again.', false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={pgStyle}>
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            padding: '14px 22px',
            borderRadius: 14,
            fontWeight: 800,
            fontSize: 15,
            color: '#fff',
            background: toast.ok ? '#16a34a' : '#dc2626',
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
          }}
        >
          {toast.ok ? '✓ ' : '⚠ '}
          {toast.msg}
        </div>
      )}

      <div style={containerStyle}>
        <Link href="/dashboard" style={backLinkStyle}>← Back</Link>

        <h1 style={titleStyle}>Log Processing Batch</h1>
        <p style={subtitleStyle}>Pick the catch you just finished processing.</p>

        {/* Catch dropdown */}
        <label style={labelStyle}>Catch log</label>
        <select
          value={catchId}
          onChange={(e) => setCatchId(e.target.value)}
          style={inputStyle}
        >
          <option value="">— Pick a recent catch —</option>
          {catches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.catch_date} · {c.species} · {Number(c.raw_weight_lb).toFixed(2)} lb
              {c.supplier_name ? ` · ${c.supplier_name}` : ''}
            </option>
          ))}
        </select>

        {/* Auto-filled summary card */}
        {selected && (
          <div style={summaryCardStyle}>
            <div style={summaryRow}>
              <span style={summaryLabel}>Species</span>
              <span style={summaryValue}>{selected.species}</span>
            </div>
            <div style={summaryRow}>
              <span style={summaryLabel}>Raw weight</span>
              <span style={summaryValue}>{Number(selected.raw_weight_lb).toFixed(2)} lb</span>
            </div>
            {selected.supplier_name && (
              <div style={summaryRow}>
                <span style={summaryLabel}>Supplier</span>
                <span style={summaryValue}>{selected.supplier_name}</span>
              </div>
            )}
          </div>
        )}

        {/* Finished weight */}
        <label style={labelStyle}>Finished weight (lbs)</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="e.g. 95.40"
          value={finishedWeight}
          onChange={(e) => setFinishedWeight(e.target.value)}
          style={inputStyle}
        />
        {finishedOverflow && (
          <div style={errorBoxStyle}>
            Finished weight is more than the raw weight. Please re-check the scale.
          </div>
        )}

        {/* Live yield / loss */}
        {yieldPct !== null && lossPct !== null && (
          <div style={yieldCardStyle}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={summaryLabel}>Yield</div>
              <div style={{ ...yieldNumberStyle, color: '#4ade80' }}>{yieldPct.toFixed(1)}%</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={summaryLabel}>Loss</div>
              <div style={{ ...yieldNumberStyle, color: '#f87171' }}>{lossPct.toFixed(1)}%</div>
            </div>
          </div>
        )}

        {/* Process type */}
        <label style={labelStyle}>Process type</label>
        <select
          value={processType}
          onChange={(e) => setProcessType(e.target.value as ProcessType)}
          style={inputStyle}
        >
          <option value="">— Pick the process —</option>
          {PROCESS_TYPES.map((pt) => (
            <option key={pt} value={pt}>{pt}</option>
          ))}
        </select>

        {/* Quality grade */}
        <label style={labelStyle}>Quality grade</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 18 }}>
          {QUALITY_GRADES.map((g) => {
            const active = grade === g.value;
            return (
              <button
                key={g.value}
                type="button"
                onClick={() => setGrade(g.value)}
                style={{
                  padding: '18px 12px',
                  borderRadius: 14,
                  fontWeight: 900,
                  fontSize: 18,
                  border: active ? `3px solid ${GOLD}` : '2px solid #1f2937',
                  background: active ? g.color : '#1f2937',
                  color: '#fff',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {g.value === 'Rejected' ? 'Rejected' : `Grade ${g.value}`}
              </button>
            );
          })}
        </div>

        {/* Notes */}
        <label style={labelStyle}>Notes (optional)</label>
        <textarea
          rows={3}
          placeholder="Anything the manager should know…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' as const }}
        />

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '20px 16px',
            borderRadius: 16,
            fontWeight: 900,
            fontSize: 20,
            background: submitting ? '#94a3b8' : '#16a34a',
            color: '#fff',
            border: 'none',
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontFamily: "'Playfair Display', serif",
            letterSpacing: 0.5,
            boxShadow: '0 6px 18px rgba(22, 163, 74, 0.35)',
          }}
        >
          {submitting ? 'Saving…' : 'SUBMIT'}
        </button>
      </div>
    </div>
  );
}

const pgStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: NAVY,
  color: '#fff',
  fontFamily: "'DM Sans', sans-serif",
  paddingBottom: 60,
};

const containerStyle: React.CSSProperties = {
  maxWidth: 540,
  margin: '0 auto',
  padding: '20px 16px',
};

const titleStyle: React.CSSProperties = {
  color: GOLD,
  fontFamily: "'Playfair Display', serif",
  fontSize: 30,
  fontWeight: 900,
  margin: '8px 0 4px',
};

const subtitleStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.6)',
  fontSize: 14,
  marginBottom: 24,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 800,
  color: GOLD,
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '16px 14px',
  borderRadius: 12,
  background: '#1a2e5a',
  border: '2px solid rgba(245,197,24,0.3)',
  color: '#fff',
  fontSize: 16,
  fontFamily: "'DM Sans', sans-serif",
  outline: 'none',
  marginBottom: 18,
  boxSizing: 'border-box',
};

const summaryCardStyle: React.CSSProperties = {
  background: '#0f1f3d',
  borderRadius: 12,
  padding: '14px 16px',
  marginBottom: 18,
  border: '1px solid rgba(245,197,24,0.25)',
};

const summaryRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '4px 0',
};

const summaryLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: 'rgba(255,255,255,0.55)',
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
};

const summaryValue: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: '#fff',
};

const yieldCardStyle: React.CSSProperties = {
  display: 'flex',
  background: '#0f1f3d',
  borderRadius: 14,
  padding: '14px 12px',
  marginBottom: 18,
  border: `1px solid ${GOLD}`,
};

const yieldNumberStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 900,
  fontFamily: "'Playfair Display', serif",
  marginTop: 2,
};

const errorBoxStyle: React.CSSProperties = {
  background: '#3f1010',
  border: '1px solid #dc2626',
  borderRadius: 12,
  padding: '10px 14px',
  marginTop: -8,
  marginBottom: 18,
  color: '#fca5a5',
  fontWeight: 700,
  fontSize: 14,
  textAlign: 'center',
};

const backLinkStyle: React.CSSProperties = {
  display: 'inline-block',
  background: 'rgba(245,197,24,0.1)',
  color: GOLD,
  border: '1px solid rgba(245,197,24,0.4)',
  borderRadius: 10,
  padding: '8px 14px',
  fontSize: 12,
  fontWeight: 800,
  textDecoration: 'none',
  marginBottom: 14,
};
