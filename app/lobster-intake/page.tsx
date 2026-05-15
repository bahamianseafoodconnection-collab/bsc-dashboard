'use client';

// app/lobster-intake/page.tsx
//
// Boat receive form for the lobster pipeline. Build #3 of the wealth
// engine. Captures every intake at the door of Spiny Tail with the
// data needed for: traceability (boat + captain + date), cost basis
// (cost/lb), grade breakdown (5oz/6oz/8oz/etc.), and yield discipline
// (yield calculated later from real measurements, not entered here).
//
// Writes to public.yield_lots (extended via sql/2026-05-09-lobster-intake.sql).
// Inline-styled (back-office). Mobile-friendly so processors can enter
// at the door from a phone.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';

export const dynamic = 'force-dynamic';

const PRODUCT_TYPES = [
  'Lobster Tail',
  'Lobster Whole',
  'Conch Whole',
  'Conch Cleaned',
  'Snapper Whole',
  'Hog Fish',
  'Grouper Whole',
  'Other',
];

const ISLANDS = [
  'Nassau',
  'Moores Island',
  'Andros',
  'Eleuthera',
  'Exuma',
  'Abaco',
  'Grand Bahama',
  'Long Island',
  'Cat Island',
  'Other',
];

// Lobster tail size grades (matches Jomara invoice grading)
const TAIL_SIZES = ['5oz', '6oz', '7oz', '8oz', '9oz', '10/12oz', '12/14oz', '14/16oz'];

type Supplier = { id: string; name: string };

type IntakeRow = {
  id: string;
  lot_number: string | null;
  received_date: string | null;
  product_type: string | null;
  source_type: string | null;
  island_source: string | null;
  captain_name: string | null;
  boat_reg: string | null;
  whole_weight_lb: number | null;
  clean_weight_lb: number | null;
  cost_paid: number | null;
  true_cost_per_lb: number | null;
  size_grade_breakdown: Record<string, number> | null;
  intake_notes: string | null;
  supplier_id: string | null;
  supplier?: Supplier | Supplier[] | null;
  created_at: string;
};

export default function LobsterIntakePage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [intakes, setIntakes] = useState<IntakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState('');
  const [captainName, setCaptainName] = useState('');
  const [boatReg, setBoatReg] = useState('');
  const [islandSource, setIslandSource] = useState('Moores Island');
  const [productType, setProductType] = useState('Lobster Tail');
  const [sourceType, setSourceType] = useState<'tail' | 'whole'>('tail');
  const [totalWeight, setTotalWeight] = useState('');
  const [costPerLb, setCostPerLb] = useState('8.00');
  const [notes, setNotes] = useState('');
  const [sizeGrades, setSizeGrades] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // Update sourceType automatically when productType changes
  useEffect(() => {
    if (productType === 'Lobster Whole') setSourceType('whole');
    else if (productType === 'Lobster Tail') setSourceType('tail');
  }, [productType]);

  useEffect(() => {
    load();
    loadSuppliers();
  }, []);

  async function loadSuppliers() {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name')
      .order('name', { ascending: true });
    setSuppliers((data || []) as Supplier[]);
  }

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('yield_lots')
      .select(`
        id, lot_number, received_date, product_type, source_type,
        island_source, captain_name, boat_reg, whole_weight_lb,
        clean_weight_lb, cost_paid, true_cost_per_lb, size_grade_breakdown,
        intake_notes, supplier_id, created_at,
        supplier:suppliers ( id, name )
      `)
      .order('received_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(50);
    if (err) {
      setError(plainError(err));
      setIntakes([]);
    } else {
      const normalized = ((data || []) as Array<IntakeRow>).map((r) => ({
        ...r,
        supplier: Array.isArray(r.supplier) ? r.supplier[0] ?? null : r.supplier,
      }));
      setIntakes(normalized);
    }
    setLoading(false);
  }

  function totalCost() {
    const w = Number(totalWeight);
    const c = Number(costPerLb);
    if (!Number.isFinite(w) || !Number.isFinite(c)) return 0;
    return Math.round(w * c * 100) / 100;
  }

  function gradeBreakdownTotal() {
    return Object.values(sizeGrades).reduce((s, v) => s + (Number(v) || 0), 0);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSuccess(null);
    if (!totalWeight || Number(totalWeight) <= 0) { alert('Enter a weight'); return; }
    if (!costPerLb || Number(costPerLb) <= 0) { alert('Enter a cost per lb'); return; }
    if (!supplierId && !captainName.trim()) { alert('Pick a supplier or enter a captain name'); return; }
    setSubmitting(true);

    // Auto-generate lot number if no trigger provides one (yield_lots may
    // already have an auto-trigger - we let it win when it fires).
    const lotNumber = `${islandSource.slice(0, 3).toUpperCase()}-${productType.replace(/\s+/g, '-').slice(0, 4).toUpperCase()}-${Date.now().toString().slice(-8)}`;

    // Build size grade breakdown JSON only if any entered
    const cleanedGrades: Record<string, number> = {};
    for (const [k, v] of Object.entries(sizeGrades)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) cleanedGrades[k] = n;
    }
    const breakdown = Object.keys(cleanedGrades).length > 0 ? cleanedGrades : null;

    const weight = Number(totalWeight);
    const cost = Number(costPerLb);
    const totalDollars = weight * cost;

    const row: Record<string, unknown> = {
      received_date: receivedDate,
      product_type: productType,
      source_type: sourceType,
      island_source: islandSource,
      captain_name: captainName.trim() || null,
      boat_reg: boatReg.trim() || null,
      cost_paid: totalDollars,
      true_cost_per_lb: cost,
      size_grade_breakdown: breakdown,
      intake_notes: notes.trim() || null,
      supplier_id: supplierId || null,
      lot_number: lotNumber,
    };
    // Map weight to the right column based on whether we bought whole or tail
    if (sourceType === 'whole') row.whole_weight_lb = weight;
    else row.clean_weight_lb = weight;

    const { error: err } = await supabase.from('yield_lots').insert(row);
    setSubmitting(false);
    if (err) {
      alert(`Save failed: ${plainError(err)}\n\nIf 'relation' or 'column' error, run sql/2026-05-09-lobster-intake.sql in Supabase.`);
      return;
    }

    setSuccess(`✓ Lot ${lotNumber} saved · ${weight} lbs · BSD $${totalDollars.toFixed(2)}`);
    // Reset form (keep date + supplier + island for fast next entry)
    setCaptainName('');
    setBoatReg('');
    setTotalWeight('');
    setSizeGrades({});
    setNotes('');
    load();
  }

  const todayStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todays = intakes.filter((r) => r.received_date === today);
    let lbs = 0;
    let cost = 0;
    for (const r of todays) {
      lbs += Number(r.whole_weight_lb || r.clean_weight_lb || 0);
      cost += Number(r.cost_paid || 0);
    }
    return { count: todays.length, lbs: Math.round(lbs * 10) / 10, cost: Math.round(cost * 100) / 100 };
  }, [intakes]);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>

      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0, marginBottom: 6 }}>
        Lobster Intake
      </h1>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>
        Boat receive at Spiny Tail door. Capture intake, lot # auto-generates. Yield gets measured later (real data only, no assumptions).
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        <Stat label="Today's intakes" value={todayStats.count}                accent="#f5c518" />
        <Stat label="Today's lbs"     value={`${todayStats.lbs.toFixed(1)}`} accent="#22c55e" />
        <Stat label="Today's cost"    value={`$${todayStats.cost.toFixed(2)}`} accent="#a78bfa" />
      </div>

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, marginBottom: 12 }}>
          ⚠️ {error}
          {(error.toLowerCase().includes('relation') || error.toLowerCase().includes('column')) && (
            <div style={{ marginTop: 6 }}>Run sql/2026-05-09-lobster-intake.sql in Supabase SQL editor.</div>
          )}
        </div>
      )}

      {success && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: 10, padding: 12, color: '#22c55e', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          {success}
        </div>
      )}

      <form onSubmit={submit} style={cardStyle}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#f5c518', marginBottom: 10 }}>+ New intake</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Date received">
            <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} style={inputStyle} required />
          </Field>
          <Field label="Source island">
            <select value={islandSource} onChange={(e) => setIslandSource(e.target.value)} style={inputStyle}>
              {ISLANDS.map((i) => <option key={i}>{i}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Supplier (existing)">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={inputStyle}>
            <option value="">— none / new fisherman below —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Captain name (if new)">
            <input value={captainName} onChange={(e) => setCaptainName(e.target.value)} placeholder="e.g. Oscar Pinder" style={inputStyle} />
          </Field>
          <Field label="Boat reg / name">
            <input value={boatReg} onChange={(e) => setBoatReg(e.target.value)} placeholder="optional" style={inputStyle} />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Product type">
            <select value={productType} onChange={(e) => setProductType(e.target.value)} style={inputStyle}>
              {PRODUCT_TYPES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Source type">
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value as 'tail' | 'whole')} style={inputStyle}>
              <option value="tail">Tail (already separated by fisherman)</option>
              <option value="whole">Whole (process at Spiny Tail)</option>
            </select>
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <Field label="Total weight (lbs)">
            <input type="number" step="0.01" min="0" value={totalWeight} onChange={(e) => setTotalWeight(e.target.value)} placeholder="0.00" style={inputStyle} required />
          </Field>
          <Field label="Cost per lb (BSD)">
            <input type="number" step="0.01" min="0" value={costPerLb} onChange={(e) => setCostPerLb(e.target.value)} style={inputStyle} required />
          </Field>
          <Field label="Total cost (auto)">
            <input type="text" value={`$${totalCost().toFixed(2)}`} readOnly style={{ ...inputStyle, background: '#0a1628', color: '#22c55e', fontWeight: 800 }} />
          </Field>
        </div>

        {/* Size-grade breakdown (lobster tail only) */}
        {productType === 'Lobster Tail' && (
          <div style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#f5c518', marginBottom: 6 }}>
              Size grade breakdown (optional — lbs per grade)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {TAIL_SIZES.map((sz) => (
                <div key={sz}>
                  <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>{sz}</div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={sizeGrades[sz] || ''}
                    onChange={(e) => setSizeGrades((g) => ({ ...g, [sz]: e.target.value }))}
                    placeholder="0"
                    style={{ ...inputStyle, padding: '6px 8px', fontSize: 12, marginBottom: 0 }}
                  />
                </div>
              ))}
            </div>
            {gradeBreakdownTotal() > 0 && (
              <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 6, textAlign: 'right' }}>
                Breakdown total: {gradeBreakdownTotal().toFixed(1)} lbs
                {totalWeight && Math.abs(gradeBreakdownTotal() - Number(totalWeight)) > 0.5 && (
                  <span style={{ color: '#f5c518', marginLeft: 6 }}>
                    ⚠ doesn&rsquo;t match total weight ({Number(totalWeight).toFixed(1)})
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <Field label="Notes">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="condition, payment terms, anything to remember" style={inputStyle} />
        </Field>

        <button
          type="submit"
          disabled={submitting}
          style={{ width: '100%', background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '12px 14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}
        >
          {submitting ? 'Saving…' : 'Save intake + generate lot #'}
        </button>
      </form>

      <div style={{ marginTop: 14, fontSize: 12, fontWeight: 800, color: '#f5c518', marginBottom: 6 }}>
        Recent intakes
      </div>

      {loading && <div style={{ color: '#94a3b8', padding: 12 }}>Loading…</div>}
      {!loading && intakes.length === 0 && (
        <div style={{ color: '#94a3b8', padding: 12, textAlign: 'center' }}>
          No intakes yet.
        </div>
      )}

      {intakes.map((r) => {
        const lbs = Number(r.whole_weight_lb || r.clean_weight_lb || 0);
        const grades = r.size_grade_breakdown
          ? Object.entries(r.size_grade_breakdown)
              .filter(([, v]) => Number(v) > 0)
              .map(([k, v]) => `${k}: ${Number(v).toFixed(1)}`)
              .join(' · ')
          : null;
        const sup = r.supplier as Supplier | null;
        return (
          <div key={r.id} style={{ ...cardStyle, borderLeft: '4px solid #22c55e' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>
                  {r.product_type} · {lbs.toFixed(1)} lbs
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                  Lot <span style={{ color: '#f5c518', fontFamily: 'monospace' }}>{r.lot_number || '—'}</span>
                  {r.island_source && ` · ${r.island_source}`}
                  {r.captain_name && ` · ${r.captain_name}`}
                  {sup && ` · ${sup.name}`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#22c55e' }}>${Number(r.cost_paid || 0).toFixed(2)}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>${Number(r.true_cost_per_lb || 0).toFixed(2)}/lb</div>
              </div>
            </div>
            {grades && (
              <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 6, paddingTop: 6, borderTop: '1px dashed #1e3a5f' }}>
                {grades}
              </div>
            )}
            {r.intake_notes && (
              <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 6, fontStyle: 'italic' }}>
                {r.intake_notes}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div style={{ background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: accent || '#f5c518', marginTop: 2 }}>{value}</div>
    </div>
  );
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 720, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '12px 14px', border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
