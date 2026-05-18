// /trace/[batch_number] — public traceability view.
//
// Reached by scanning the QR code on a finished-product label. Reads
// via the SECURITY DEFINER function get_public_trace() so RLS on
// traceability_batches stays strict; only safe + sanitized columns
// leave the server.

import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TracePhase {
  phase_number: number;
  phase_label:  string;
  media_type:   'photo' | 'video';
  media_url:    string;
  latitude:     number | null;
  longitude:    number | null;
  captured_at:  string | null;
}
interface TraceRow {
  batch_number:        string;
  product_name:        string;
  scientific_name:     string | null;
  vendor_type:         string;
  business_name:       string;
  location:            string | null;
  vessel_registration: string | null;
  farm_license_number: string | null;
  production_date:     string | null;
  expiry_date:         string | null;
  allergens:           string | null;
  cook_disclaimer:     string | null;
  approved_at:         string | null;
  processed_at:        string | null;
  phases:              TracePhase[];
}

async function fetchTrace(batchNumber: string): Promise<TraceRow | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const supa = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await supa.rpc('get_public_trace', { p_batch_number: batchNumber });
  if (error || !data || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as TraceRow;
}

export default async function PublicTracePage({ params }: { params: Promise<{ batch_number: string }> }) {
  const { batch_number } = await params;
  const trace = await fetchTrace(batch_number);

  if (!trace) {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f2ee', fontFamily: "'DM Sans', sans-serif", color: '#0F1111', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 380, background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #e7e7e7' }}>
          <p style={{ fontSize: 11, color: '#565959', textTransform: 'uppercase', letterSpacing: 3, marginBottom: 6 }}>BSC · Traceability</p>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#0F1111', marginBottom: 6 }}>Batch not found</h1>
          <p style={{ fontSize: 13, color: '#565959' }}>The batch number on this label could not be verified. If you believe this is in error, contact BSC at <a href="https://wa.me/12423613474" style={{ color: '#007185' }}>+1 (242) 361-3474</a>.</p>
          <Link href="/" style={{ display: 'inline-block', marginTop: 14, padding: '8px 16px', background: '#f5c518', color: '#060d1f', borderRadius: 8, fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>bscbahamas.com</Link>
        </div>
      </div>
    );
  }

  const dateOnly = (s: string | null) => s ? new Date(s).toLocaleDateString('en-BS', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

  return (
    <div style={{ minHeight: '100vh', background: '#f4f2ee', fontFamily: "'DM Sans', sans-serif", color: '#0F1111' }}>
      <header style={{ background: '#060d1f', color: '#fff', padding: '18px 16px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <p style={{ fontSize: 11, color: '#f5c518', letterSpacing: 3, textTransform: 'uppercase', fontWeight: 700 }}>BSC Marketplace · Traceability</p>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '6px 0 2px' }}>{trace.product_name}</h1>
          {trace.scientific_name && <p style={{ fontStyle: 'italic', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{trace.scientific_name}</p>}
          <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>Batch {trace.batch_number}</p>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: 16 }}>
        <section style={card}>
          <p style={lab}>Origin</p>
          <p style={p}><strong>Product of the Bahamas.</strong></p>
          <p style={p}>Supplied by <strong>{trace.business_name}</strong>{trace.location ? ` · ${trace.location}` : ''}.</p>
          {trace.vendor_type === 'fisherman' && trace.vessel_registration && (
            <p style={p}>Vessel registration: <strong style={{ fontFamily: 'monospace' }}>{trace.vessel_registration}</strong></p>
          )}
          {trace.vendor_type === 'farmer' && trace.farm_license_number && (
            <p style={p}>Farm license: <strong style={{ fontFamily: 'monospace' }}>{trace.farm_license_number}</strong></p>
          )}
        </section>

        <section style={card}>
          <p style={lab}>Production + freshness</p>
          <Row k="Production date" v={dateOnly(trace.production_date)} />
          <Row k="Best before"     v={dateOnly(trace.expiry_date)} />
          <Row k="Approved"        v={dateOnly(trace.approved_at)} />
          <Row k="Processed at"    v={dateOnly(trace.processed_at)} />
        </section>

        <section style={card}>
          <p style={lab}>Allergen + cooking</p>
          {trace.allergens       ? <p style={p}><strong>Allergens:</strong> {trace.allergens}</p>           : <p style={p}>No declared allergens.</p>}
          {trace.cook_disclaimer ? <p style={p}>{trace.cook_disclaimer}</p>                                : <p style={p}>Cook fully before consumption.</p>}
        </section>

        <section style={card}>
          <p style={lab}>Chain of custody — 3 phases</p>
          {trace.phases.length === 0 && <p style={p}>No traceability media recorded.</p>}
          {trace.phases.map((ph) => (
            <div key={ph.phase_number} style={{ borderTop: '1px solid #e7e7e7', paddingTop: 10, marginTop: 10 }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#0F1111' }}>Phase {ph.phase_number} — {ph.phase_label.replace(/_/g, ' ')}</p>
              <p style={{ fontSize: 11, color: '#565959', marginTop: 2 }}>
                {ph.captured_at ? `Captured ${new Date(ph.captured_at).toLocaleString('en-BS')} · ` : ''}
                {ph.latitude != null && ph.longitude != null
                  ? <>📍 {ph.latitude.toFixed(4)}, {ph.longitude.toFixed(4)} · <a href={`https://www.google.com/maps?q=${ph.latitude},${ph.longitude}`} target="_blank" rel="noopener noreferrer" style={{ color: '#007185' }}>view map</a></>
                  : 'GPS not recorded'}
              </p>
              <div style={{ marginTop: 8 }}>
                {ph.media_type === 'video'
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <video src={ph.media_url} controls style={{ width: '100%', borderRadius: 8 }} />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={ph.media_url} alt="" style={{ width: '100%', borderRadius: 8 }} />
                }
              </div>
            </div>
          ))}
        </section>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#565959', marginTop: 20, lineHeight: 1.6 }}>
          Verified by Bahamian Seafood Connection · Spiny Tail Processing<br />
          <Link href="/" style={{ color: '#007185' }}>bscbahamas.com</Link> · WhatsApp +1 (242) 361-3474
        </p>
      </main>
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e7e7e7', borderRadius: 14, padding: 16, marginBottom: 12 };
const lab:  React.CSSProperties = { fontSize: 10, color: '#565959', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, marginBottom: 8 };
const p:    React.CSSProperties = { fontSize: 14, color: '#0F1111', lineHeight: 1.6, margin: '2px 0' };

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
      <span style={{ color: '#565959' }}>{k}</span>
      <span style={{ color: '#0F1111', fontWeight: 600 }}>{v}</span>
    </div>
  );
}
