'use client';

import { useState, useRef } from 'react';
import { useServerSave } from '@/lib/useServerSave';

type LocationKey = 'nassau' | 'andros' | 'online' | 'all';

const LOCATIONS = [
  { key: 'nassau' as LocationKey,  label: 'Nassau POS',    icon: '🟡', margin: 0.38 },
  { key: 'andros' as LocationKey,  label: 'Andros POS',    icon: '🟣', margin: 0.43 },
  { key: 'online' as LocationKey,  label: 'Online Market', icon: '🛒', margin: 0.25 },
  { key: 'all' as LocationKey,     label: 'All Locations', icon: '📍', margin: 0.30 },
];

function fmtBSD(n: number) {
  return `BSD $${n.toFixed(2)}`;
}

export default function InvoiceScanner() {
  const [pages, setPages]           = useState<string[]>([]);
  const [location, setLocation]     = useState<LocationKey | null>(null);
  const [step, setStep]             = useState<'upload' | 'location' | 'processing' | 'done'>('upload');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [result, setResult]         = useState<{bscKeeps: number; supplierOwed: number; summary: string} | null>(null);
  const cameraRef                   = useRef<HTMLInputElement>(null);
  const fileRef                     = useRef<HTMLInputElement>(null);

  // Phase 5 batch 8: the purchase_invoices record is written server-side
  // (role-gated + audited; totals re-derived there), not browser→RLS direct.
  const { save: recordPurchaseInvoice } = useServerSave('/api/finance/record-purchase-invoice');

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPages((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  async function analyze() {
    if (!pages.length || !location) return;
    setLoading(true);
    setError('');
    try {
      const loc = LOCATIONS.find((l) => l.key === location)!;
      const images = pages.map((p) => p.split(',')[1]);
      const res = await fetch('/api/invoice-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images, location: loc.label, margin: loc.margin }),
      });
      const data = await res.json();
      if (data.split) {
        const total = (data.split.items || []).reduce((s: number, i: {price: string}) => {
          return s + parseFloat(i.price.replace(/[^0-9.]/g, '') || '0');
        }, 0);
        setResult({
          bscKeeps: total * loc.margin,
          supplierOwed: total * (1 - loc.margin),
          summary: data.split.summary || 'Invoice processed.',
        });

        // Persist server-side (role-gated + audited; total re-derived there).
        const saved = await recordPurchaseInvoice({
          location: loc.label,
          margin:   loc.margin,
          items:    data.split.items || [],
          summary:  data.split.summary || '',
        });
        if (!saved.ok) { setError(`Could not save invoice: ${saved.error ?? 'unknown error'}`); setLoading(false); return; }

        setStep('done');
      } else {
        setError('Could not read invoice. Try a clearer photo.');
      }
    } catch {
      setError('Connection error. Please try again.');
    }
    setLoading(false);
  }

  function reset() {
    setPages([]);
    setLocation(null);
    setStep('upload');
    setResult(null);
    setError('');
  }

  const card: React.CSSProperties = {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 20,
    display: 'flex', flexDirection: 'column', gap: 12,
  };

  if (step === 'done' && result) return (
    <div style={card}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>✅</div>
        <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 16, margin: '8px 0 4px' }}>Invoice Saved</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ backgroundColor: '#e8f5e9', borderRadius: 10, padding: 12, textAlign: 'center' }}>
          <div style={{ color: '#666', fontSize: 10 }}>BSC Keeps</div>
          <div style={{ color: '#2e7d32', fontWeight: 900, fontSize: 18 }}>{fmtBSD(result.bscKeeps)}</div>
        </div>
        <div style={{ backgroundColor: '#fde8e8', borderRadius: 10, padding: 12, textAlign: 'center' }}>
          <div style={{ color: '#666', fontSize: 10 }}>Supplier Owed</div>
          <div style={{ color: '#dc2626', fontWeight: 900, fontSize: 18 }}>{fmtBSD(result.supplierOwed)}</div>
        </div>
      </div>
      <div style={{ backgroundColor: '#fef9e7', borderRadius: 10, padding: 12, borderLeft: '4px solid #f4c842', fontSize: 13, color: '#444', lineHeight: 1.6 }}>
        {result.summary}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={reset} style={{ flex: 1, backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
          📷 Scan Another
        </button>
      </div>
    </div>
  );

  if (step === 'location') return (
    <div style={card}>
      <button onClick={() => setStep('upload')} style={{ background: 'none', border: 'none', color: '#1a2e5a', fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left', padding: 0 }}>← Back</button>
      <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 15, margin: 0 }}>📍 Where are these products being sold?</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {LOCATIONS.map((loc) => (
          <button key={loc.key} onClick={() => setLocation(loc.key)} style={{ backgroundColor: location === loc.key ? '#eff6ff' : '#f8f9fa', border: `2px solid ${location === loc.key ? '#1a2e5a' : '#e5e7eb'}`, borderRadius: 12, padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <span style={{ fontSize: 28 }}>{loc.icon}</span>
            <span style={{ color: '#1a2e5a', fontWeight: 800, fontSize: 13 }}>{loc.label}</span>
            <span style={{ color: '#2e7d32', fontSize: 11, fontWeight: 600 }}>{(loc.margin * 100).toFixed(0)}% BSC margin</span>
          </button>
        ))}
      </div>
      {error && <p style={{ color: '#dc2626', fontSize: 13, margin: 0 }}>{error}</p>}
      <button onClick={analyze} disabled={!location || loading} style={{ backgroundColor: !location || loading ? '#94a3b8' : '#2e7d32', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontWeight: 800, fontSize: 14, cursor: !location || loading ? 'not-allowed' : 'pointer' }}>
        {loading ? '🤖 Reading Invoice...' : '🤖 Analyze Invoice →'}
      </button>
    </div>
  );

  return (
    <div style={card}>
      <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 15, margin: 0 }}>📷 Invoice Scanner</h2>
      <p style={{ color: '#999', fontSize: 12, margin: 0 }}>Take photos of each invoice page. AI reads all pages and splits wholesale vs retail automatically.</p>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple onChange={handleFiles} style={{ display: 'none' }} />
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: 'none' }} />

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => cameraRef.current?.click()} style={{ flex: 1, backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 12, padding: 14, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>📸 Camera</button>
        <button onClick={() => fileRef.current?.click()} style={{ flex: 1, backgroundColor: '#f0f4ff', color: '#1a2e5a', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>📁 Upload</button>
      </div>

      {pages.length > 0 && (
        <>
          <div style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 13 }}>{pages.length} page{pages.length > 1 ? 's' : ''} ready</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pages.map((page, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={page} alt={`Page ${i + 1}`} style={{ width: 72, height: 90, objectFit: 'cover', borderRadius: 8, border: '2px solid #1a2e5a' }} />
                <button onClick={() => setPages((prev) => prev.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: 3, right: 3, backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 5px', fontSize: 10, cursor: 'pointer' }}>✕</button>
              </div>
            ))}
            <button onClick={() => cameraRef.current?.click()} style={{ width: 72, height: 90, border: '2px dashed #d1d5db', borderRadius: 8, backgroundColor: '#f8f9fa', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <span style={{ fontSize: 20 }}>+</span>
              <span style={{ fontSize: 10, color: '#999' }}>Add</span>
            </button>
          </div>
          <button onClick={() => setStep('location')} style={{ backgroundColor: '#2e7d32', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
            Next — Select Location →
          </button>
        </>
      )}

      {error && <p style={{ color: '#dc2626', fontSize: 13, margin: 0 }}>{error}</p>}
    </div>
  );
}
