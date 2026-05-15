'use client';

// Manager-facing traceability view. Joins catch → processing → sale.
// QR codes are rendered via the public api.qrserver.com image endpoint
// so we avoid adding a QR npm dependency. "Export to PDF" uses the
// browser's print → Save-as-PDF, with print CSS that hides chrome.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const SPECIES_OPTIONS = ['Conch', 'Lobster', 'Snapper', 'Grouper', 'Other'] as const;
const EXPORT_STATUSES = ['pending', 'exported', 'archived'] as const;
const DATE_RANGES = ['7d', '30d', '90d', 'all'] as const;
type DateRange = typeof DATE_RANGES[number];

interface CatchInfo {
  supplier_name: string | null;
  catch_date: string | null;
  catch_location: string | null;
  raw_weight_lb: number | null;
}

interface ProcessingInfo {
  finished_weight_lb: number | null;
  yield_pct: number | null;
  process_type: string | null;
  quality_grade: string | null;
}

interface OrderInfo {
  customer_name: string | null;
  total: number | null;
}

interface Record {
  id: string;
  species: string | null;
  export_status: string;
  created_at: string;
  catch_logs: CatchInfo | null;
  processing_logs: ProcessingInfo | null;
  orders: OrderInfo | null;
}

const GOLD = '#f5c518';
const NAVY = '#060d1f';

function startOfRange(r: DateRange): string | null {
  if (r === 'all') return null;
  const d = new Date();
  if (r === '7d') d.setDate(d.getDate() - 7);
  if (r === '30d') d.setDate(d.getDate() - 30);
  if (r === '90d') d.setDate(d.getDate() - 90);
  return d.toISOString();
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function TraceabilityPage() {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [species, setSpecies] = useState<string>('all');
  const [range, setRange] = useState<DateRange>('30d');
  const [exportStatus, setExportStatus] = useState<string>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from('traceability_records')
          .select(`
            id, species, export_status, created_at,
            catch_logs(supplier_name, catch_date, catch_location, raw_weight_lb),
            processing_logs(finished_weight_lb, yield_pct, process_type, quality_grade),
            orders(customer_name, total)
          `)
          .order('created_at', { ascending: false })
          .limit(500);
        const start = startOfRange(range);
        if (start) query = query.gte('created_at', start);
        const { data, error: err } = await query;
        if (err) throw err;
        setRecords(((data ?? []) as unknown) as Record[]);
      } catch {
        setError('Could not load traceability records. Please refresh and try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [range]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (species !== 'all' && r.species !== species) return false;
      if (exportStatus !== 'all' && r.export_status !== exportStatus) return false;
      return true;
    });
  }, [records, species, exportStatus]);

  return (
    <div style={pgStyle}>
      <div style={containerStyle}>
        <div className="no-print" style={{ marginBottom: 14 }}>
          <Link href="/dashboard" style={backLinkStyle}>← Back</Link>
        </div>

        <h1 style={titleStyle}>Traceability Records</h1>
        <p style={subtitleStyle}>
          Catch → processing → sale, end to end. Managers only.
        </p>

        {/* Filters (hidden when printing) */}
        <div className="no-print" style={filterRowStyle}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={labelStyle}>Species</label>
            <select value={species} onChange={(e) => setSpecies(e.target.value)} style={selectStyle}>
              <option value="all">All species</option>
              {SPECIES_OPTIONS.map((sp) => (
                <option key={sp} value={sp}>{sp}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={labelStyle}>Date range</label>
            <select value={range} onChange={(e) => setRange(e.target.value as DateRange)} style={selectStyle}>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={labelStyle}>Export status</label>
            <select value={exportStatus} onChange={(e) => setExportStatus(e.target.value)} style={selectStyle}>
              <option value="all">All statuses</option>
              {EXPORT_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              padding: '12px 18px',
              borderRadius: 12,
              fontWeight: 900,
              fontSize: 14,
              background: GOLD,
              color: NAVY,
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              alignSelf: 'flex-end',
              height: 50,
            }}
          >
            Export to PDF
          </button>
        </div>

        {/* Summary */}
        <div className="no-print" style={summaryRowStyle}>
          <div style={summaryPill}>
            <span style={summaryPillLabel}>Showing</span>
            <span style={summaryPillValue}>{filtered.length}</span>
          </div>
          {loading && <span style={{ color: 'rgba(255,255,255,0.6)' }}>Loading…</span>}
        </div>

        {error && (
          <div style={errorBoxStyle}>{error}</div>
        )}

        {/* Table */}
        {!loading && filtered.length === 0 && !error && (
          <div style={emptyStyle}>No records match those filters.</div>
        )}

        {filtered.map((r) => {
          const c = r.catch_logs;
          const p = r.processing_logs;
          const o = r.orders;
          const qrValue = `BSC-TRACE-${r.id}`;
          const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&margin=4&data=${encodeURIComponent(qrValue)}`;
          return (
            <div key={r.id} style={recordCard}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={recordHeader}>
                  <div>
                    <div style={recordTitle}>{r.species || 'Unknown'}</div>
                    <div style={recordMeta}>
                      Trace {r.id.slice(0, 8).toUpperCase()} · logged {fmtDate(r.created_at)}
                    </div>
                  </div>
                  <span style={{
                    ...statusPill,
                    background: r.export_status === 'exported' ? '#16a34a'
                      : r.export_status === 'archived' ? '#475569'
                      : '#d97706',
                  }}>
                    {r.export_status}
                  </span>
                </div>

                <div style={stagesGrid}>
                  <div style={stageCard}>
                    <div style={stageLabel}>Catch</div>
                    <div style={stageValue}>{c?.supplier_name || '—'}</div>
                    <div style={stageMeta}>{fmtDate(c?.catch_date ?? null)}</div>
                    <div style={stageMeta}>{c?.catch_location || '—'}</div>
                    <div style={stageMetaStrong}>
                      {c?.raw_weight_lb ? `${Number(c.raw_weight_lb).toFixed(2)} lb raw` : '—'}
                    </div>
                  </div>
                  <div style={stageCard}>
                    <div style={stageLabel}>Processing</div>
                    <div style={stageValue}>{p?.process_type || '—'}</div>
                    <div style={stageMeta}>Grade {p?.quality_grade || '—'}</div>
                    <div style={stageMetaStrong}>
                      {p?.finished_weight_lb ? `${Number(p.finished_weight_lb).toFixed(2)} lb finished` : '—'}
                    </div>
                    <div style={stageMeta}>
                      Yield {p?.yield_pct !== null && p?.yield_pct !== undefined ? `${Number(p.yield_pct).toFixed(1)}%` : '—'}
                    </div>
                  </div>
                  <div style={stageCard}>
                    <div style={stageLabel}>Sale</div>
                    <div style={stageValue}>{o?.customer_name || (o ? 'Walk-in' : '— not yet sold')}</div>
                    <div style={stageMetaStrong}>
                      {o?.total != null ? `BSD $${Number(o.total).toFixed(2)}` : ''}
                    </div>
                  </div>
                </div>
              </div>

              <div style={qrColumn}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrSrc} alt={`QR code ${qrValue}`} width={110} height={110} style={{ background: '#fff', borderRadius: 8, padding: 4 }} />
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.55)', marginTop: 6, textAlign: 'center' }}>
                  {qrValue}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @media print {
          @page { size: letter; margin: 12mm; }
          body { background: #fff !important; color: #000 !important; }
          .no-print { display: none !important; }
        }
      `}</style>
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
  maxWidth: 1100,
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
  marginBottom: 18,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 800,
  color: GOLD,
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
  marginBottom: 4,
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 12px',
  borderRadius: 10,
  background: '#1a2e5a',
  border: '2px solid rgba(245,197,24,0.3)',
  color: '#fff',
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
};

const filterRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  marginBottom: 16,
  alignItems: 'flex-end',
};

const summaryRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  marginBottom: 12,
};

const summaryPill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: '#0f1f3d',
  border: '1px solid rgba(245,197,24,0.3)',
  borderRadius: 999,
  padding: '6px 14px',
};

const summaryPillLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: 'rgba(255,255,255,0.55)',
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
};

const summaryPillValue: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: GOLD,
};

const recordCard: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'flex-start',
  background: '#0d1f3c',
  border: '1px solid rgba(245,197,24,0.2)',
  borderRadius: 14,
  padding: 14,
  marginBottom: 12,
  flexWrap: 'wrap',
};

const recordHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 8,
  marginBottom: 10,
};

const recordTitle: React.CSSProperties = {
  fontFamily: "'Playfair Display', serif",
  fontSize: 18,
  fontWeight: 900,
  color: '#fff',
};

const recordMeta: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.55)',
  marginTop: 2,
};

const statusPill: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: 1,
  padding: '4px 10px',
  borderRadius: 999,
  color: '#fff',
  whiteSpace: 'nowrap',
};

const stagesGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
};

const stageCard: React.CSSProperties = {
  background: '#0f1f3d',
  borderRadius: 10,
  padding: '10px 12px',
  borderLeft: `3px solid ${GOLD}`,
};

const stageLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  color: GOLD,
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginBottom: 4,
};

const stageValue: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: '#fff',
  marginBottom: 2,
};

const stageMeta: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.6)',
};

const stageMetaStrong: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'rgba(255,255,255,0.85)',
  marginTop: 4,
};

const qrColumn: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const errorBoxStyle: React.CSSProperties = {
  background: 'rgba(220,38,38,0.15)',
  border: '1px solid #dc2626',
  borderRadius: 12,
  padding: 14,
  color: '#fecaca',
  fontWeight: 700,
  marginBottom: 14,
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center' as const,
  color: 'rgba(255,255,255,0.55)',
  padding: '40px 16px',
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
};
