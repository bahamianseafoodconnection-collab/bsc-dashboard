'use client';

// Staff-facing catch log. Designed for TJ / right-hand to fill in
// every time a boat supplier delivers. Big buttons, simple steps.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const SPECIES_OPTIONS = ['Conch', 'Lobster', 'Snapper', 'Grouper', 'Other'] as const;
type Species = typeof SPECIES_OPTIONS[number];

const CONDITION_OPTIONS = [
  { value: 'Excellent', color: '#16a34a' },
  { value: 'Good',      color: '#65a30d' },
  { value: 'Fair',      color: '#d97706' },
  { value: 'Rejected',  color: '#dc2626' },
] as const;

type Condition = typeof CONDITION_OPTIONS[number]['value'];

interface SupplierOption {
  id: string;
  name: string;
}

interface Toast {
  ok: boolean;
  msg: string;
}

const GOLD = '#f5c518';
const NAVY = '#060d1f';

export default function CatchLogPage() {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [species, setSpecies] = useState<Species | ''>('');
  const [location, setLocation] = useState('');
  const [catchDate, setCatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rawWeight, setRawWeight] = useState('');
  const [condition, setCondition] = useState<Condition | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      setSuppliers((data ?? []) as SupplierOption[]);
    })();
  }, []);

  function showToast(msg: string, ok = true) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  }

  function resetForm() {
    setSupplierId('');
    setSpecies('');
    setLocation('');
    setCatchDate(new Date().toISOString().slice(0, 10));
    setRawWeight('');
    setCondition('');
    setNotes('');
  }

  async function handleSubmit() {
    if (!supplierId) { showToast('Please pick the supplier first.', false); return; }
    if (!species) { showToast('Please pick the species.', false); return; }
    if (!catchDate) { showToast('Please pick the catch date.', false); return; }
    const lbs = Number(rawWeight);
    if (!lbs || lbs <= 0) { showToast('Enter the raw weight in pounds.', false); return; }
    if (!condition) { showToast('Pick the condition before submitting.', false); return; }

    setSubmitting(true);
    try {
      const supplier = suppliers.find((s) => s.id === supplierId);
      const { error } = await supabase.from('catch_logs').insert({
        supplier_id: supplierId,
        supplier_name: supplier?.name ?? null,
        species,
        catch_location: location.trim() || null,
        catch_date: catchDate,
        raw_weight_lb: lbs,
        condition,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      showToast('Catch saved. Thank you!');
      resetForm();
    } catch {
      showToast('Could not save the catch. Please try again.', false);
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

        <h1 style={titleStyle}>Log New Catch</h1>
        <p style={subtitleStyle}>Use this every time a boat or supplier delivers.</p>

        {/* Supplier */}
        <label style={labelStyle}>Supplier</label>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          style={inputStyle}
        >
          <option value="">— Pick a supplier —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* Species */}
        <label style={labelStyle}>Species</label>
        <select
          value={species}
          onChange={(e) => setSpecies(e.target.value as Species)}
          style={inputStyle}
        >
          <option value="">— Pick the species —</option>
          {SPECIES_OPTIONS.map((sp) => (
            <option key={sp} value={sp}>{sp}</option>
          ))}
        </select>

        {/* Catch location */}
        <label style={labelStyle}>Catch location</label>
        <input
          type="text"
          placeholder="e.g. Andros, Berry Islands, etc."
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          style={inputStyle}
        />

        {/* Catch date */}
        <label style={labelStyle}>Catch date</label>
        <input
          type="date"
          value={catchDate}
          onChange={(e) => setCatchDate(e.target.value)}
          style={inputStyle}
        />

        {/* Raw weight */}
        <label style={labelStyle}>Raw weight (lbs)</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="e.g. 120.50"
          value={rawWeight}
          onChange={(e) => setRawWeight(e.target.value)}
          style={inputStyle}
        />

        {/* Condition */}
        <label style={labelStyle}>Condition</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 18 }}>
          {CONDITION_OPTIONS.map((c) => {
            const active = condition === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCondition(c.value)}
                style={{
                  padding: '18px 12px',
                  borderRadius: 14,
                  fontWeight: 900,
                  fontSize: 16,
                  border: active ? `3px solid ${GOLD}` : '2px solid #1f2937',
                  background: active ? c.color : '#1f2937',
                  color: '#fff',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {c.value}
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
