'use client';

// /dashboard/processing-batches/[id]/labels — printable Spiny Tails Co.
// labels (FDA-compliant layout). One label per finished box; print
// directly from the browser.
//
// Reference: /Users/dedrickstorr/Downloads/IMG_1131.HEIC
//   SPINY LOBSTER TAILS / (Panulirus Argus)
//   Spiny Tails Processing Co.
//   Firetrail Road, New Providence, The Bahamas
//   FDA # <fda_number>, Processing Plant <plant_number>
//   Ingredients: <ingredients>
//   LOT CODE: <lot_code>
//   Packed By: <month>, <year>
//   Best Used by: <month>, <year>
//   SEAFOOD IS AN ALLERGEN
//   WILD CAUGHT PRODUCT OF THE BAHAMAS

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { use as usePromise } from 'react';
import { supabase } from '@/lib/supabase';

interface BatchRow {
  id: string;
  batch_number: string;
  lot_code: string | null;
  product_name: string;
  scientific_name: string | null;
  vendor_type: string;
  vessel_registration: string | null;
  farm_license_number: string | null;
  production_date: string | null;
  expiry_date: string | null;
  allergens: string | null;
  cook_disclaimer: string | null;
  ingredients: string | null;
  fda_number: string | null;
  processing_plant_number: string | null;
  wild_caught: boolean | null;
  finished_boxes: number | null;
  product_size_grade: string | null;
  status: string;
}

const QC_ROLES = new Set(['founder','co_founder','control_admin','manager','processor','receiver']);

export default function LabelsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [batch, setBatch] = useState<BatchRow | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !QC_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);
      const { data, error } = await supabase.from('traceability_batches').select('*').eq('id', id).maybeSingle();
      if (error) setErr(error.message);
      else if (!data) setErr('Batch not found.');
      else setBatch(data as BatchRow);
    })();
  }, [id]);

  if (authed === null) return <div style={{ padding: 24, color: '#565959' }}>Loading…</div>;
  if (err)             return <div style={{ padding: 24, color: '#9b1c1c' }}>⚠ {err}</div>;
  if (!batch)          return null;

  const count        = Math.max(1, Math.floor(Number(batch.finished_boxes ?? 1) || 1));
  const code         = batch.lot_code || batch.batch_number;
  const traceUrl     = `https://bscbahamas.com/trace/${encodeURIComponent(batch.batch_number)}`;
  const qrSrc        = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=2&data=${encodeURIComponent(traceUrl)}`;
  const barcodeSrc   = `https://barcodeapi.org/api/128/${encodeURIComponent(code)}`;
  const productLine  = batch.product_name.toUpperCase();
  const ingredients  = batch.ingredients || defaultIngredients(batch.product_name);
  const allergenLine = (batch.allergens && batch.allergens.toLowerCase().includes('shellfish'))
    ? 'SEAFOOD IS AN ALLERGEN'
    : batch.allergens || 'SEAFOOD IS AN ALLERGEN';
  const wildCaughtLine = batch.wild_caught === false
    ? 'PRODUCT OF THE BAHAMAS'
    : 'WILD CAUGHT PRODUCT OF THE BAHAMAS';
  const fda          = batch.fda_number              || '16988725790';
  const plant        = batch.processing_plant_number || '45';
  const packed       = batch.production_date ? formatMonthYear(batch.production_date) : '—';
  const bestBy       = batch.expiry_date     ? formatMonthYear(batch.expiry_date)     : '—';

  return (
    <div className="labels-wrap" style={{ background: '#f4f2ee', fontFamily: "'DM Sans', sans-serif", color: '#0F1111', padding: 16, minHeight: '100vh' }}>
      <header className="no-print" style={{ maxWidth: 880, margin: '0 auto 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Link href="/dashboard/processing-batches" style={{ color: '#060d1f', fontSize: 13, textDecoration: 'none', fontWeight: 700 }}>← Processing batches</Link>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ background: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: 12, color: '#565959', border: '1px solid #e7e7e7' }}>
            {count} label{count === 1 ? '' : 's'} · lot <strong style={{ fontFamily: 'monospace', color: '#060d1f' }}>{code}</strong>
          </span>
          <button onClick={() => window.print()} style={{ background: '#f5c518', color: '#060d1f', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            🖨 Print
          </button>
        </div>
      </header>

      <div className="labels-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 12, maxWidth: 880, margin: '0 auto' }}>
        {Array.from({ length: count }, (_, i) => (
          <SpinyTailsLabel key={i}
            unit={i + 1} total={count}
            productLine={productLine}
            scientific={batch.scientific_name}
            sizeGrade={batch.product_size_grade}
            fda={fda} plant={plant}
            ingredients={ingredients}
            lot={code}
            packed={packed} bestBy={bestBy}
            allergenLine={allergenLine}
            wildCaughtLine={wildCaughtLine}
            cookText={batch.cook_disclaimer || 'Cook fully before consumption.'}
            qrSrc={qrSrc} barcodeSrc={barcodeSrc}
          />
        ))}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .labels-wrap { background: #fff !important; padding: 0 !important; }
          .labels-grid { gap: 0 !important; }
          .label { page-break-inside: avoid; break-inside: avoid; border: 1px solid #000 !important; box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>
    </div>
  );
}

function defaultIngredients(productName: string): string {
  const q = (productName ?? '').toLowerCase();
  if (q.includes('lobster')) return 'Lobster Tails, Sodium Bisulfite added as a Preservative';
  if (q.includes('conch'))   return 'Conch, Salt';
  if (q.includes('fish'))    return 'Fish, Salt';
  return productName || '—';
}

function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleString('en-US', { month: 'long' })}, ${d.getUTCFullYear()}`;
}

function SpinyTailsLabel(p: {
  unit: number; total: number;
  productLine: string; scientific: string | null; sizeGrade: string | null;
  fda: string; plant: string; ingredients: string;
  lot: string; packed: string; bestBy: string;
  allergenLine: string; wildCaughtLine: string; cookText: string;
  qrSrc: string; barcodeSrc: string;
}) {
  return (
    <div className="label" style={{ background: '#fff', border: '2px solid #060d1f', borderRadius: 6, padding: 16, minHeight: 480, fontSize: 12, lineHeight: 1.45, position: 'relative' }}>
      {/* Header — Spiny Tails Co. seal */}
      <div style={{ textAlign: 'center', borderBottom: '1px solid #060d1f', paddingBottom: 8, marginBottom: 8 }}>
        <p style={{ fontSize: 8, letterSpacing: 3, color: '#565959', textTransform: 'uppercase', margin: 0 }}>Lobster Processing Plant</p>
        <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, fontWeight: 700, color: '#060d1f', margin: '4px 0 0' }}>SPINY TAILS CO.</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#060d1f', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.1 }}>{p.productLine}</p>
          {p.scientific && <p style={{ fontStyle: 'italic', color: '#060d1f', margin: '2px 0 8px', textDecoration: 'underline' }}>({p.scientific})</p>}

          <p style={{ fontWeight: 700, fontSize: 12, margin: '6px 0 0' }}>Spiny Tails Processing Co.</p>
          <p style={{ margin: '1px 0' }}>Firetrail Road, New Providence, The Bahamas</p>
          <p style={{ margin: '1px 0' }}>FDA # {p.fda}, Processing Plant {p.plant}</p>

          <p style={{ fontWeight: 700, margin: '8px 0 0' }}>Ingredients:</p>
          <p style={{ margin: '1px 0' }}>{p.ingredients}</p>

          <p style={{ fontFamily: 'monospace', fontStyle: 'italic', fontWeight: 700, margin: '8px 0 0' }}>LOT CODE: {p.lot}</p>
          {p.sizeGrade && <p style={{ margin: '1px 0', fontWeight: 700 }}>Size grade: {p.sizeGrade}</p>}
          <p style={{ margin: '1px 0' }}><strong>Packed By:</strong> {p.packed}</p>
          <p style={{ margin: '1px 0' }}><strong>Best Used by:</strong> {p.bestBy}</p>
        </div>

        <div style={{ width: 130, textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.qrSrc} alt="trace QR" style={{ width: 120, height: 120, border: '1px solid #060d1f', borderRadius: 4 }} />
          <p style={{ fontSize: 7, color: '#565959', marginTop: 4, lineHeight: 1.3 }}>SCAN TO VERIFY<br />bscbahamas.com/trace</p>
        </div>
      </div>

      {/* Statutory declarations */}
      <div style={{ marginTop: 12, textAlign: 'center', borderTop: '1px solid #060d1f', paddingTop: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#060d1f', margin: '2px 0', letterSpacing: 0.5 }}>{p.allergenLine}</p>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#060d1f', margin: '2px 0', letterSpacing: 0.5 }}>{p.wildCaughtLine}</p>
        <p style={{ fontSize: 10, color: '#565959', marginTop: 4 }}>{p.cookText}</p>
      </div>

      {/* Barcode strip */}
      <div style={{ marginTop: 10, borderTop: '1px dashed #060d1f', paddingTop: 6, textAlign: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.barcodeSrc} alt={`Code 128 ${p.lot}`} style={{ width: '100%', maxHeight: 52, objectFit: 'contain' }} />
        <p style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: '#060d1f', margin: 2 }}>{p.lot}</p>
      </div>

      {p.total > 1 && (
        <div style={{ position: 'absolute', top: 6, right: 8, background: '#f5c518', color: '#060d1f', padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800 }}>
          BOX {p.unit} / {p.total}
        </div>
      )}
    </div>
  );
}
