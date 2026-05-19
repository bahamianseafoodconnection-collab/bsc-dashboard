'use client';

// /spinytails/audit/[token]/lots/[lot_code]
// Read-only full-chain view of one lot for an inspector. Pulls the
// scoped trace via spinytails_audit_view_lot_trace() RPC — which
// validates the token + scope + logs the view in one server call.

import { useCallback, useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { Shell, StatusPill } from '../../page';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface IntakeRow { id: string; weight_lbs: number; receiving_temp_c: number | null; temp_compliant: boolean | null; received_at: string; photo_urls: string[] | null; rejection_reason: string | null; }
interface QcRow     { id: string; inspection_type: string; passed: boolean; inspected_at: string; defects?: unknown; notes: string | null; }
interface TempRow   { id: string; area: string; temperature_c: number; logged_at: string; in_range: boolean | null; equipment_id: string | null; }
interface BatchRow  { id: string; batch_number: string; raw_weight_lbs: number | null; finished_weight_lbs: number | null; rejected_weight_lbs: number | null; yield_pct: number | null; production_date: string | null; expiry_date: string | null; started_at: string; completed_at: string | null; grades?: { size_grade: string; weight_lbs: number; unit_count: number | null }[]; packagings?: { package_type: string; size_grade: string | null; case_count: number; total_weight_lbs: number | null }[]; }
interface ShipRow   { shipment_id: string; shipment_number: string; ship_date: string; destination_name: string | null; destination_country: string | null; weight_lbs: number; case_count: number | null; status: string; }
interface CaRow     { id: string; severity: string; description: string; action_taken: string | null; reported_at: string; resolved_at: string | null; }

interface Trace {
  lot_id: string;
  lot_code: string;
  intake_date: string;
  lot_status: string;
  product_name: string | null;
  scientific_name: string | null;
  vessel_id: string;
  vessel_code: string;
  vessel_name: string | null;
  vessel_color: string;
  captain_name: string | null;
  registration_number: string | null;
  total_intake_lbs: number;
  total_processed_raw_lbs: number;
  total_finished_lbs: number;
  total_rejected_lbs: number;
  intakes: IntakeRow[] | null;
  quality_inspections: QcRow[] | null;
  temperature_logs: TempRow[] | null;
  processing_batches: BatchRow[] | null;
  shipments: ShipRow[] | null;
  corrective_actions: CaRow[] | null;
}

export default function AuditLotDetailPage({ params }: { params: Promise<{ token: string; lot_code: string }> }) {
  const { token, lot_code } = usePromise(params);
  const decoded = decodeURIComponent(lot_code);

  const [trace, setTrace]   = useState<Trace | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const { data, error } = await supabase.rpc('spinytails_audit_view_lot_trace', { p_token: token, p_lot_code: decoded });
    if (error) { setErr(error.message); setLoading(false); return; }
    const row = Array.isArray(data) && data.length > 0 ? data[0] as Trace : null;
    if (!row) { setErr('Lot not found in this session\'s scope, or audit session has expired.'); setLoading(false); return; }
    setTrace(row);
    setLoading(false);
  }, [token, decoded]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Shell><p style={{ color: '#94a3b8' }}>Loading lot detail…</p></Shell>;
  if (err || !trace) {
    return (
      <Shell>
        <Link href={`/spinytails/audit/${encodeURIComponent(token)}`} style={backLink}>← Back to lots</Link>
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', color: '#9b1c1c', padding: 14, borderRadius: 10, fontSize: 14, marginTop: 10 }}>
          ⚠ {err ?? 'No data'}
        </div>
      </Shell>
    );
  }

  const tempExcursions = (trace.temperature_logs ?? []).filter(t => t.in_range === false).length;
  const failedQc       = (trace.quality_inspections ?? []).filter(q => q.passed === false).length;

  return (
    <Shell>
      <Link href={`/spinytails/audit/${encodeURIComponent(token)}`} style={backLink}>← Back to lots in scope</Link>

      <div style={{ background: '#fff', borderRadius: 12, padding: 18, marginTop: 10, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <p style={labLight}>Lot code</p>
            <h1 style={{ fontFamily: 'monospace', fontSize: 24, color: '#1a2e5a', margin: '4px 0 0', fontWeight: 900 }}>{trace.lot_code}</h1>
          </div>
          <StatusPill status={trace.lot_status} />
        </div>
        <p style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>
          <strong>{trace.vessel_code}</strong> · {trace.captain_name ?? 'unknown captain'} · <span style={{ color: '#7a5e00' }}>{trace.vessel_color} tag</span>
          {trace.registration_number && <> · reg <code>{trace.registration_number}</code></>}
          {' · '}received <strong>{trace.intake_date}</strong>
        </p>
      </div>

      {/* Roll-up stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Stat label="Intake"        value={`${Number(trace.total_intake_lbs).toFixed(1)} lbs`}    />
        <Stat label="Processed raw" value={`${Number(trace.total_processed_raw_lbs).toFixed(1)}`} />
        <Stat label="Finished"      value={`${Number(trace.total_finished_lbs).toFixed(1)}`}      />
        <Stat label="Rejected"      value={`${Number(trace.total_rejected_lbs).toFixed(1)}`}      />
        <Stat label="Temp excursions" value={tempExcursions.toString()} red={tempExcursions > 0} />
        <Stat label="Failed QC"       value={failedQc.toString()}       red={failedQc > 0} />
      </div>

      <Section title={`Intakes (${trace.intakes?.length ?? 0})`}>
        {(trace.intakes ?? []).map((i, idx) => (
          <Row key={i.id} title={`#${idx + 1} · ${Number(i.weight_lbs).toFixed(1)} lbs`}
            sub={`${i.received_at ? new Date(i.received_at).toLocaleString() : '—'}${i.receiving_temp_c != null ? ` · ${i.receiving_temp_c}°C` : ''}${i.temp_compliant === false ? ' · ⚠ out of CCP-1 range' : ''}${i.rejection_reason ? ` · REJECTED: ${i.rejection_reason}` : ''}`}
            extra={(i.photo_urls ?? []).length > 0 ? (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {i.photo_urls!.map((u, k) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={k} href={u} target="_blank" rel="noopener noreferrer">
                    <img src={u} alt={`intake-${k}`} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4, border: '1px solid #f0f0f0' }} />
                  </a>
                ))}
              </div>
            ) : null}
          />
        ))}
      </Section>

      <Section title={`Quality inspections (${trace.quality_inspections?.length ?? 0})`}>
        {(trace.quality_inspections ?? []).map(q => (
          <Row key={q.id}
            title={`${q.inspection_type.replace(/_/g, ' ')} — ${q.passed ? '✓ pass' : '✗ FAIL'}`}
            sub={`${new Date(q.inspected_at).toLocaleString()}${q.notes ? ` · ${q.notes}` : ''}`}
            badge={q.passed ? 'pass' : 'fail'}
          />
        ))}
      </Section>

      <Section title={`Temperature logs (${trace.temperature_logs?.length ?? 0})`}>
        {(trace.temperature_logs ?? []).slice(0, 50).map(t => (
          <Row key={t.id}
            title={`${t.area.replace(/_/g, ' ')} · ${t.temperature_c}°C`}
            sub={`${new Date(t.logged_at).toLocaleString()}${t.equipment_id ? ` · ${t.equipment_id}` : ''}`}
            badge={t.in_range === true ? 'in range' : t.in_range === false ? '⚠ out of range' : null}
            red={t.in_range === false}
          />
        ))}
        {(trace.temperature_logs ?? []).length > 50 && (
          <p style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', margin: '6px 0 0' }}>
            +{(trace.temperature_logs ?? []).length - 50} older logs not shown.
          </p>
        )}
      </Section>

      <Section title={`Processing batches (${trace.processing_batches?.length ?? 0})`}>
        {(trace.processing_batches ?? []).map(b => (
          <div key={b.id} style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
              <strong style={{ color: '#1a2e5a' }}>Batch {b.batch_number}</strong>
              <span style={{ fontSize: 12, color: '#7a5e00', fontWeight: 700 }}>Yield {b.yield_pct ?? '—'}%</span>
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
              raw {b.raw_weight_lbs ?? '—'} → finished {b.finished_weight_lbs ?? '—'} · rejected {b.rejected_weight_lbs ?? '—'} ·
              prod {b.production_date ?? '—'}{b.expiry_date ? ` → exp ${b.expiry_date}` : ''}
            </div>
            {(b.grades ?? []).length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(b.grades ?? []).map((g, k) => (
                  <span key={k} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                    {g.size_grade.replace(/_/g, '-')} · {Number(g.weight_lbs).toFixed(1)} lbs{g.unit_count != null ? ` · ${g.unit_count}` : ''}
                  </span>
                ))}
              </div>
            )}
            {(b.packagings ?? []).length > 0 && (
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(b.packagings ?? []).map((p, k) => (
                  <span key={k} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#dbeafe', color: '#1e40af', fontWeight: 700 }}>
                    {p.package_type.replace(/_/g, ' ')} · {p.case_count} cases · {p.total_weight_lbs ?? '—'} lbs
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </Section>

      {trace.shipments && trace.shipments.length > 0 && (
        <Section title={`Shipments (${trace.shipments.length})`}>
          {trace.shipments.map((s, k) => (
            <Row key={k}
              title={`${s.shipment_number} · ${s.destination_name ?? '—'}${s.destination_country ? ` (${s.destination_country})` : ''}`}
              sub={`${s.ship_date} · ${Number(s.weight_lbs).toFixed(1)} lbs${s.case_count ? ` · ${s.case_count} cases` : ''} · ${s.status.replace(/_/g, ' ')}`}
            />
          ))}
        </Section>
      )}

      {trace.corrective_actions && trace.corrective_actions.length > 0 && (
        <Section title={`Corrective actions (${trace.corrective_actions.length})`}>
          {trace.corrective_actions.map(c => (
            <Row key={c.id}
              title={`${c.severity.toUpperCase()} · ${c.description}`}
              sub={`reported ${new Date(c.reported_at).toLocaleString()}${c.resolved_at ? ` · resolved ${new Date(c.resolved_at).toLocaleDateString()}` : ' · UNRESOLVED'}${c.action_taken ? ` · action: ${c.action_taken}` : ''}`}
              badge={c.severity}
              red={c.severity === 'critical' || c.severity === 'major'}
            />
          ))}
        </Section>
      )}

      <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 18 }}>
        Read-only audit view · This visit logged at {new Date().toLocaleString()}
      </p>
    </Shell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 0, marginBottom: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", color: '#1a2e5a', fontSize: 16, margin: 0, padding: '12px 14px', borderBottom: '1px solid #f0f0f0' }}>{title}</h2>
      <div>{children}</div>
    </div>
  );
}

function Row({ title, sub, badge, red, extra }: { title: string; sub?: string; badge?: string | null; red?: boolean; extra?: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <strong style={{ color: red ? '#9b1c1c' : '#1a2e5a', fontSize: 13 }}>{title}</strong>
        {badge && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: red ? '#fee2e2' : '#dcfce7', color: red ? '#991b1b' : '#166534', textTransform: 'uppercase' }}>{badge}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{sub}</div>}
      {extra && <div style={{ marginTop: 6 }}>{extra}</div>}
    </div>
  );
}

function Stat({ label, value, red }: { label: string; value: string; red?: boolean }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div style={labLight}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 900, color: red ? '#9b1c1c' : '#1a2e5a' }}>{value}</div>
    </div>
  );
}

const backLink: React.CSSProperties = { color: '#1a2e5a', fontSize: 12, fontWeight: 700, textDecoration: 'none' };
const labLight: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 };
