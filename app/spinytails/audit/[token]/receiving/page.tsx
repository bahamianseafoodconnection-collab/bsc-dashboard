'use client';

// /spinytails/audit/[token]/receiving — Inspector RECEIVING audit view.
//
// Token-gated, no login. Surfaces the CCP-1 receiving records for the lots in
// the session's scope: species batch number, approved vessel/fisherman,
// quantity + bags, temperature, fresh/frozen, grade/condition, harvest
// verification (area/method/trip/dates + GPS photos), and the species-aware
// inspection results (qc_results) with CCP-1 pass/fail. Every view is logged.

import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { Shell } from '@/components/AuditViewerShell';

const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

interface Rec {
  batch_number: string | null; lot_code: string; species_code: string | null; receipt_date: string; status: string;
  vessel_code: string | null; fisherman_name: string | null; license_number: string | null;
  quantity_lbs: number | null; product_state: string | null; core_temp_f: number | null;
  num_bags: number | null; weight_per_bag_lbs: number | null; product_grade: string | null; product_condition: string | null;
  fishing_area: string | null; fishing_method: string | null; fishing_date_start: string | null; fishing_date_end: string | null;
  trip_start_location: string | null; trip_end_location: string | null;
  qc_pass: boolean | null; qc_results: Record<string, unknown> | null; harvest_photos: Array<{ url: string; lat?: number | null; lng?: number | null }> | null;
}

export default function ReceivingAuditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { (async () => {
    setLoading(true); setErr(null);
    const { data, error } = await supabase.rpc('spinytails_audit_view_receiving', { p_token: token });
    if (error) { setErr(error.message); setLoading(false); return; }
    setRecs((data ?? []) as Rec[]);
    setLoading(false);
  })(); }, [token]);

  if (loading) return <Shell><p style={{ color: '#94a3b8' }}>Loading receiving records…</p></Shell>;
  if (err) return <Shell><div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', color: '#f87171', padding: 16, borderRadius: 10 }}>⚠ {err}</div></Shell>;

  const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: '#7a5e00', textTransform: 'uppercase', letterSpacing: 1 };

  return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#1a2e5a', fontSize: 22, margin: 0 }}>📥 Receiving records (CCP-1)</h1>
        <Link href={`/spinytails/audit/${encodeURIComponent(token)}`} style={{ fontSize: 12, color: '#1a2e5a' }}>← All sections</Link>
      </div>

      {recs.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: '#94a3b8' }}>No receiving records in this session&rsquo;s scope.</div>
      ) : recs.map((r) => (
        <div key={r.lot_code} style={{ ...card, borderLeft: `4px solid ${r.qc_pass === false ? '#dc2626' : '#16a34a'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 900, color: '#1a2e5a' }}>{r.batch_number ?? r.lot_code}</div>
            <div style={{ fontWeight: 800, color: r.qc_pass === false ? '#dc2626' : '#16a34a' }}>{r.qc_pass === false ? '⚠ CCP-1 hold' : '✓ CCP-1 pass'}</div>
          </div>
          <div style={{ fontSize: 13, color: '#475569', margin: '4px 0 10px' }}>{r.species_code} · received {r.receipt_date} · {r.status}</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, fontSize: 13 }}>
            <div><div style={lbl}>Supplier / Vessel</div>{r.fisherman_name ?? '—'} · {r.vessel_code ?? ''} {r.license_number ? `· Lic ${r.license_number}` : ''}</div>
            <div><div style={lbl}>Quantity</div>{r.quantity_lbs ?? '—'} lb {r.num_bags ? `· ${r.num_bags} bags` : ''} {r.weight_per_bag_lbs ? `· ${r.weight_per_bag_lbs}/bag` : ''}</div>
            <div><div style={lbl}>State / Temp</div>{r.product_state ?? '—'} · {r.core_temp_f ?? '—'}°F</div>
            <div><div style={lbl}>Grade / Condition</div>{r.product_grade ?? '—'} · {r.product_condition ?? '—'}</div>
            <div><div style={lbl}>Harvest area / method</div>{r.fishing_area ?? '—'} · {r.fishing_method ?? '—'}</div>
            <div><div style={lbl}>Trip</div>{r.trip_start_location ?? '—'} → {r.trip_end_location ?? '—'} {r.fishing_date_start ? `(${r.fishing_date_start}–${r.fishing_date_end ?? ''})` : ''}</div>
          </div>

          {r.qc_results && Object.keys(r.qc_results).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={lbl}>Inspection (CCP-1)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {Object.entries(r.qc_results).map(([k, val]) => (
                  <span key={k} style={{ fontSize: 12, background: '#f1f5f9', borderRadius: 6, padding: '3px 8px' }}>
                    {k.replace(/_/g, ' ')}: <b>{typeof val === 'boolean' ? (val ? 'yes' : 'no') : String(val)}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(r.harvest_photos) && r.harvest_photos.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={lbl}>Harvest verification photos</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {r.harvest_photos.map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" style={{ textAlign: 'center' }}>
                    <img src={p.url} alt="" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8 }} />
                    <div style={{ fontSize: 9, color: p.lat != null ? '#16a34a' : '#94a3b8' }}>{p.lat != null ? `📍${p.lat.toFixed(3)},${p.lng?.toFixed(3)}` : 'no GPS'}</div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 18 }}>Read-only inspection access. Every view is logged for compliance.</p>
    </Shell>
  );
}
