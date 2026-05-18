'use client';

// /dashboard/processing-batches/[id]/labels — printable product labels.
//
// One label per finished box (or, when finished_boxes is not set, a
// single sheet). Each label shows:
//   • Product name + scientific name
//   • Allergen line + "Cook fully before consumption."
//   • "Product of the Bahamas"
//   • Vessel registration # OR farm license # — proving origin
//   • Batch number (human-readable + Code 128 barcode)
//   • Production date + Expiry date
//   • QR code linking to https://bscbahamas.com/trace/<batch_number>
//
// Uses two external image services that are already in the layout's
// DNS prefetch list:
//   • api.qrserver.com         → QR code image
//   • barcodeapi.org           → Code 128 barcode image

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { use as usePromise } from 'react';
import { supabase } from '@/lib/supabase';

interface BatchRow {
  id: string; batch_number: string; product_name: string; scientific_name: string | null;
  vendor_type: string; vessel_registration: string | null; farm_license_number: string | null;
  production_date: string | null; expiry_date: string | null;
  allergens: string | null; cook_disclaimer: string | null;
  finished_boxes: number | null; status: string;
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

  const count   = Math.max(1, Math.floor(Number(batch.finished_boxes ?? 1) || 1));
  const traceUrl = `https://bscbahamas.com/trace/${encodeURIComponent(batch.batch_number)}`;
  const qrSrc    = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=2&data=${encodeURIComponent(traceUrl)}`;
  const barcodeSrc = `https://barcodeapi.org/api/128/${encodeURIComponent(batch.batch_number)}`;
  const allergens   = batch.allergens       || defaultAllergensFor(batch.product_name);
  const cookText    = batch.cook_disclaimer || 'Cook fully before consumption.';
  const origin      = batch.vendor_type === 'fisherman'
    ? `Captured by registered vessel ${batch.vessel_registration ?? '—'}`
    : batch.vendor_type === 'farmer'
      ? `Harvested by licensed farm ${batch.farm_license_number ?? '—'}`
      : 'Bahamian vendor';

  return (
    <div className="labels-wrap" style={{ background: '#f4f2ee', fontFamily: "'DM Sans', sans-serif", color: '#0F1111', padding: 16, minHeight: '100vh' }}>
      <header className="no-print" style={{ maxWidth: 880, margin: '0 auto 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Link href="/dashboard/processing-batches" style={{ color: '#060d1f', fontSize: 13, textDecoration: 'none', fontWeight: 700 }}>← Processing batches</Link>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ background: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: 12, color: '#565959', border: '1px solid #e7e7e7' }}>
            {count} label{count === 1 ? '' : 's'} · batch <strong style={{ fontFamily: 'monospace', color: '#060d1f' }}>{batch.batch_number}</strong>
          </span>
          <button onClick={() => window.print()} style={{ background: '#f5c518', color: '#060d1f', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            🖨 Print
          </button>
        </div>
      </header>

      <div className="labels-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12, maxWidth: 880, margin: '0 auto' }}>
        {Array.from({ length: count }, (_, i) => (
          <Label key={i}
            unit={i + 1} total={count}
            batchNumber={batch.batch_number}
            productName={batch.product_name}
            scientificName={batch.scientific_name}
            origin={origin}
            production={batch.production_date}
            expiry={batch.expiry_date}
            allergens={allergens}
            cookText={cookText}
            qrSrc={qrSrc}
            barcodeSrc={barcodeSrc}
            traceUrl={traceUrl}
          />
        ))}
      </div>

      {/* Print rules — each label fits roughly a 4×3 inch sticker */}
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

function defaultAllergensFor(name: string): string {
  const q = (name ?? '').toLowerCase();
  if (q.includes('lobster') || q.includes('conch') || q.includes('shrimp') || q.includes('crab')) return 'Contains shellfish.';
  if (q.includes('fish'))   return 'Contains fish.';
  return 'No declared allergens.';
}

function Label({ unit, total, batchNumber, productName, scientificName, origin, production, expiry, allergens, cookText, qrSrc, barcodeSrc, traceUrl }:
  { unit: number; total: number; batchNumber: string; productName: string; scientificName: string | null; origin: string;
    production: string | null; expiry: string | null; allergens: string; cookText: string; qrSrc: string; barcodeSrc: string; traceUrl: string }) {
  const fmt = (s: string | null) => s ? new Date(s).toLocaleDateString('en-BS', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—';
  return (
    <div className="label" style={{ background: '#fff', border: '2px solid #060d1f', borderRadius: 8, padding: 14, fontSize: 11, lineHeight: 1.35, position: 'relative', minHeight: 360 }}>
      <div style={{ background: '#060d1f', color: '#f5c518', padding: '6px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
        BSC Marketplace · Product of the Bahamas 🇧🇸
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, color: '#060d1f', margin: 0, lineHeight: 1.15 }}>{productName}</p>
          {scientificName && <p style={{ fontStyle: 'italic', color: '#565959', margin: '2px 0 6px' }}>{scientificName}</p>}
          <p style={{ margin: '2px 0' }}><strong>Origin:</strong> {origin}</p>
          <p style={{ margin: '2px 0' }}><strong>Production:</strong> {fmt(production)}</p>
          <p style={{ margin: '2px 0' }}><strong>Best before:</strong> {fmt(expiry)}</p>
          <p style={{ margin: '4px 0 0', fontWeight: 700, color: '#9b1c1c' }}>⚠ {allergens}</p>
          <p style={{ margin: '2px 0', color: '#0F1111' }}>{cookText}</p>
        </div>
        <div style={{ width: 110, textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt="trace QR" style={{ width: 110, height: 110, border: '1px solid #060d1f', borderRadius: 4 }} />
          <p style={{ fontSize: 8, color: '#565959', marginTop: 4, lineHeight: 1.3 }}>Scan to verify<br /><span style={{ wordBreak: 'break-all' }}>{traceUrl.replace('https://','')}</span></p>
        </div>
      </div>
      <div style={{ marginTop: 10, borderTop: '1px dashed #060d1f', paddingTop: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={barcodeSrc} alt={`Code 128 ${batchNumber}`} style={{ width: '100%', maxHeight: 60, objectFit: 'contain' }} />
        <p style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#060d1f', marginTop: 4 }}>{batchNumber}</p>
      </div>
      {total > 1 && (
        <div style={{ position: 'absolute', top: 8, right: 8, background: '#f5c518', color: '#060d1f', padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800 }}>
          BOX {unit} / {total}
        </div>
      )}
    </div>
  );
}
