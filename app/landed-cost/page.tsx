'use client';

// app/landed-cost/page.tsx
//
// Bahamas landed-cost calculator. Pick a duty category, enter FOB cost +
// freight + insurance + (optional) weight or case quantity, see the full
// landed cost breakdown + sacred-rule retail pricing per channel.
//
// Used by staff and (later) embedded into the supplier portal so USA
// suppliers can preview "if I sell to BSC at $X FOB, here's their cost
// landed and what they'd retail it at."

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type DutyRow = {
  category_code: string;
  category_label: string;
  duty_pct: number;
  confirmed_by_user: boolean;
  notes: string | null;
};

type CalcResult = {
  ok: boolean;
  error?: string;
  category?: { code: string; label: string; confirmed: boolean };
  inputs?: {
    fob: number; freight: number; insurance: number;
    duty_pct: number; stamp_tax_pct: number; environmental_levy_pct: number;
  };
  cost_breakdown?: {
    fob: number; freight: number; insurance: number; cif: number;
    duty: number; stamp_tax: number; environmental_levy: number; landed: number;
  };
  pricing?: Record<string, number>;
  per_lb?: { unit_weight_lbs: number; landed_per_lb: number; pricing_per_lb: Record<string, number> } | null;
  per_unit?: { case_units: number; landed_per_unit: number; pricing_per_unit: Record<string, number> } | null;
};

const CHANNEL_LABELS: Record<string, { label: string; emoji: string }> = {
  nassau_pos:      { label: 'Nassau POS',      emoji: '🟡' },
  andros_pos:      { label: 'Andros POS',      emoji: '🟣' },
  online_market:   { label: 'Online Market',   emoji: '🛒' },
  local_wholesale: { label: 'Local Wholesale', emoji: '📦' },
  us_resale:       { label: 'US Resale',       emoji: '🇺🇸' },
};

export default function LandedCostPage() {
  const [categories, setCategories] = useState<DutyRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [categoryCode, setCategoryCode] = useState('');
  const [overrideMode, setOverrideMode] = useState(false);
  const [dutyOverride, setDutyOverride] = useState('');
  const [fob, setFob] = useState('');
  const [freight, setFreight] = useState('');
  const [insurance, setInsurance] = useState('');
  const [unitWeight, setUnitWeight] = useState('');
  const [caseUnits, setCaseUnits] = useState('');

  const [calcBusy, setCalcBusy] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('customs_duty_rates')
        .select('category_code, category_label, duty_pct, confirmed_by_user, notes')
        .eq('active', true)
        .order('confirmed_by_user', { ascending: false })
        .order('category_label', { ascending: true });
      if (error) setLoadError(error.message);
      else {
        setCategories((data || []) as DutyRow[]);
        if (data && data.length > 0) setCategoryCode(data[0].category_code);
      }
    })();
  }, []);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.category_code === categoryCode) || null,
    [categories, categoryCode],
  );

  async function calculate() {
    if (!fob.trim()) { setResult({ ok: false, error: 'Enter the FOB cost' }); return; }
    setCalcBusy(true);
    try {
      const body: Record<string, unknown> = {
        fob_cost: Number(fob),
        freight: Number(freight || 0),
        insurance: Number(insurance || 0),
      };
      if (overrideMode) body.duty_pct_override = Number(dutyOverride || 0);
      else body.duty_category_code = categoryCode;
      if (unitWeight) body.unit_weight_lbs = Number(unitWeight);
      if (caseUnits) body.case_units = Number(caseUnits);

      const res = await fetch('/api/landed-cost/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as CalcResult;
      setResult(j);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setCalcBusy(false);
    }
  }

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>

      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0, marginBottom: 6 }}>
        Landed-cost calculator
      </h1>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>
        Bahamas import: FOB + freight + insurance + duty + stamp tax + environmental levy.
        Includes sacred-rule retail pricing per channel.
      </div>

      {loadError && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, marginBottom: 12 }}>
          ⚠️ Could not load duty categories: {loadError}
          {(loadError.toLowerCase().includes('relation') || loadError.toLowerCase().includes('does not exist')) && (
            <div style={{ marginTop: 6 }}>Run sql/2026-05-09-customs-duty.sql in the Supabase SQL editor.</div>
          )}
        </div>
      )}

      {/* Inputs */}
      <div style={cardStyle}>
        <div style={labelStyle}>Duty category</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button
            onClick={() => setOverrideMode(false)}
            style={{ ...pillStyle, background: !overrideMode ? '#f5c518' : '#0a1628', color: !overrideMode ? '#060d1f' : '#cbd5e1', border: !overrideMode ? 'none' : '1px solid #1e3a5f' }}
          >
            Pick category
          </button>
          <button
            onClick={() => setOverrideMode(true)}
            style={{ ...pillStyle, background: overrideMode ? '#f5c518' : '#0a1628', color: overrideMode ? '#060d1f' : '#cbd5e1', border: overrideMode ? 'none' : '1px solid #1e3a5f' }}
          >
            Manual %
          </button>
        </div>

        {!overrideMode ? (
          <>
            <select
              value={categoryCode}
              onChange={(e) => setCategoryCode(e.target.value)}
              style={inputStyle}
            >
              {categories.map((c) => (
                <option key={c.category_code} value={c.category_code}>
                  {c.confirmed_by_user ? '✓ ' : ''}{c.category_label} — {c.duty_pct}%
                </option>
              ))}
            </select>
            {selectedCategory && (
              <div style={{ fontSize: 11, color: selectedCategory.confirmed_by_user ? '#22c55e' : '#94a3b8', marginTop: -4, marginBottom: 8 }}>
                {selectedCategory.confirmed_by_user ? '✓ Confirmed by Dedrick' : '⚠ Starter approximation — verify with Bahamas Customs'}
                {selectedCategory.notes && ` · ${selectedCategory.notes}`}
              </div>
            )}
          </>
        ) : (
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={dutyOverride}
            onChange={(e) => setDutyOverride(e.target.value)}
            placeholder="Duty % (0-100)"
            style={inputStyle}
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={labelStyle}>FOB cost (BSD)</div>
            <input
              type="number"
              step={0.01}
              value={fob}
              onChange={(e) => setFob(e.target.value)}
              placeholder="9.00"
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Freight (BSD)</div>
            <input
              type="number"
              step={0.01}
              value={freight}
              onChange={(e) => setFreight(e.target.value)}
              placeholder="0.60"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <div style={labelStyle}>Insurance (BSD)</div>
            <input
              type="number"
              step={0.01}
              value={insurance}
              onChange={(e) => setInsurance(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Weight (lbs)</div>
            <input
              type="number"
              step={0.01}
              value={unitWeight}
              onChange={(e) => setUnitWeight(e.target.value)}
              placeholder="optional"
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Units / case</div>
            <input
              type="number"
              step={1}
              value={caseUnits}
              onChange={(e) => setCaseUnits(e.target.value)}
              placeholder="optional"
              style={inputStyle}
            />
          </div>
        </div>

        <button
          onClick={calculate}
          disabled={calcBusy}
          style={{ width: '100%', background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '12px 14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', opacity: calcBusy ? 0.5 : 1 }}
        >
          {calcBusy ? 'Calculating…' : 'Calculate landed cost'}
        </button>
      </div>

      {/* Results */}
      {result && !result.ok && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, marginTop: 14 }}>
          ⚠️ {result.error}
        </div>
      )}

      {result && result.ok && result.cost_breakdown && (
        <>
          <div style={{ ...cardStyle, marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Cost breakdown ({result.category?.label})
            </div>
            <Row label="FOB cost"           value={result.cost_breakdown.fob} />
            <Row label="Freight"            value={result.cost_breakdown.freight} />
            <Row label="Insurance"          value={result.cost_breakdown.insurance} />
            <Row label="CIF (FOB+F+I)"      value={result.cost_breakdown.cif} bold />
            <Row label={`Duty (${result.inputs!.duty_pct}%)`} value={result.cost_breakdown.duty} accent="#f87171" />
            <Row label={`Stamp tax (${result.inputs!.stamp_tax_pct}%)`} value={result.cost_breakdown.stamp_tax} accent="#94a3b8" />
            {result.cost_breakdown.environmental_levy > 0 && (
              <Row label="Environmental levy" value={result.cost_breakdown.environmental_levy} accent="#94a3b8" />
            )}
            <div style={{ height: 1, background: '#1e3a5f', margin: '8px 0' }} />
            <Row label="LANDED COST" value={result.cost_breakdown.landed} bold accent="#22c55e" big />
            {result.per_lb && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                = ${result.per_lb.landed_per_lb.toFixed(2)} / lb at {result.per_lb.unit_weight_lbs} lbs
              </div>
            )}
            {result.per_unit && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                = ${result.per_unit.landed_per_unit.toFixed(2)} / unit at {result.per_unit.case_units} units/case
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Sacred-rule pricing per channel
            </div>
            {Object.entries(result.pricing!).map(([ch, price]) => {
              const meta = CHANNEL_LABELS[ch] || { label: ch, emoji: '•' };
              const perLb = result.per_lb?.pricing_per_lb[ch];
              const perUnit = result.per_unit?.pricing_per_unit[ch];
              return (
                <div key={ch} style={{ borderTop: '1px solid #1e3a5f', padding: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12, color: '#cbd5e1' }}>
                      {meta.emoji} {meta.label}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#f5c518' }}>
                      ${price.toFixed(2)}
                    </span>
                  </div>
                  {(perLb || perUnit) && (
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 12 }}>
                      {perLb && <span>${perLb.toFixed(2)}/lb</span>}
                      {perUnit && <span>${perUnit.toFixed(2)}/unit</span>}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 8, fontStyle: 'italic' }}>
              Sacred-rule pricing applies cost × (1 + margin). Override per-SKU on premium products that command above-sacred market prices.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value, bold = false, accent, big = false }: { label: string; value: number; bold?: boolean; accent?: string; big?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: big ? 14 : 12 }}>
      <span style={{ color: '#cbd5e1' }}>{label}</span>
      <span style={{ color: accent || '#fff', fontWeight: bold ? 800 : 500, fontFamily: 'monospace' }}>
        ${value.toFixed(2)}
      </span>
    </div>
  );
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 600, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: 14, border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };
const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 };
const pillStyle: React.CSSProperties = { padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
