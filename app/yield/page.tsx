'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function generateLotNumber(): string {
  const now     = new Date();
  const yyyy    = now.getFullYear();
  const mm      = String(now.getMonth() + 1).padStart(2, '0');
  const dd      = String(now.getDate()).padStart(2, '0');
  const seq     = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `BSC-${yyyy}${mm}${dd}-${seq}`;
}

type ChannelPrices = {
  nassau: number;
  andros: number;
  online: number;
  wholesale: number;
};

type YieldResult = {
  lotNumber: string;
  weightIn: number;
  weightOut: number;
  yieldPct: number;
  cost: number;
  trueCostPerLb: number;
  channels: ChannelPrices;
};

export default function YieldPage() {
  const [lotNumber, setLotNumber]     = useState('');
  const [weightIn, setWeightIn]       = useState('');
  const [weightOut, setWeightOut]     = useState('');
  const [totalCost, setTotalCost]     = useState('');
  const [productName, setProductName] = useState('');
  const [supplier, setSupplier]       = useState('');
  const [result, setResult]           = useState<YieldResult | null>(null);
  const [saved, setSaved]             = useState(false);
  const [saving, setSaving]           = useState(false);
  const [copied, setCopied]           = useState(false);

  const wIn   = parseFloat(weightIn)  || 0;
  const wOut  = parseFloat(weightOut) || 0;
  const cost  = parseFloat(totalCost) || 0;

  const yieldPct      = wIn > 0 ? (wOut / wIn) * 100 : 0;
  const trueCostPerLb = wOut > 0 ? cost / wOut : 0;
  const nassau        = trueCostPerLb * 1.38;
  const andros        = trueCostPerLb * 1.43;
  const online        = trueCostPerLb * 1.25;
  const wholesale     = trueCostPerLb * 1.12;

  function handleGenerateLot() {
    const lot = generateLotNumber();
    setLotNumber(lot);
    setSaved(false);
  }

  function copyLot() {
    if (!lotNumber) return;
    navigator.clipboard.writeText(lotNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function calculate() {
    if (wIn <= 0 || wOut <= 0 || cost <= 0) return;
    setResult({
      lotNumber,
      weightIn: wIn,
      weightOut: wOut,
      yieldPct,
      cost,
      trueCostPerLb,
      channels: { nassau, andros, online, wholesale },
    });
    setSaved(false);
  }

  async function saveLot() {
    if (!result) return;
    setSaving(true);
    try {
      await supabase.from('yield_lots').insert([{
        lot_number:       result.lotNumber || 'NO-LOT',
        product_name:     productName || 'Unknown',
        supplier,
        weight_in_lbs:    result.weightIn,
        weight_out_lbs:   result.weightOut,
        yield_pct:        result.yieldPct,
        total_cost:       result.cost,
        true_cost_per_lb: result.trueCostPerLb,
        nassau_price:     result.channels.nassau,
        andros_price:     result.channels.andros,
        online_price:     result.channels.online,
        wholesale_price:  result.channels.wholesale,
        created_at:       new Date().toISOString(),
      }]);
      setSaved(true);
    } catch { /* continue */ }
    setSaving(false);
  }

  function reset() {
    setLotNumber('');
    setWeightIn('');
    setWeightOut('');
    setTotalCost('');
    setProductName('');
    setSupplier('');
    setResult(null);
    setSaved(false);
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* HEADER */}
      <header style={{ backgroundColor: '#1a2e5a', padding: '0 16px', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/dashboard" style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, textDecoration: 'none', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px' }}>
              ← BSC Control
            </Link>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>Yield Calculator</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>Weight in → Weight out → True cost/lb</div>
            </div>
          </div>
          <Link href="/purchase-orders" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', textDecoration: 'none', fontWeight: 600 }}>
            Purchase Orders →
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px' }}>

        {/* ── LOT NUMBER GENERATOR ── */}
        <div style={{ backgroundColor: '#1a2e5a', borderRadius: '18px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px' }}>
            Lot Batch Number
          </div>

          {lotNumber ? (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '12px 16px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '22px', letterSpacing: '1px', fontFamily: 'monospace' }}>
                    {lotNumber}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px', marginTop: '2px' }}>
                    Format: BSC-YYYYMMDD-NNN
                  </div>
                </div>
                <button
                  onClick={copyLot}
                  style={{ backgroundColor: copied ? '#4ade80' : 'rgba(255,255,255,0.1)', color: copied ? '#fff' : 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '14px 16px', marginBottom: '14px', textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '13px' }}>No lot number generated yet</div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              onClick={handleGenerateLot}
              style={{ backgroundColor: '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: '12px', padding: '13px', fontWeight: 900, fontSize: '14px', cursor: 'pointer' }}
            >
              {lotNumber ? '↻ New Lot Number' : '+ Generate Lot Number'}
            </button>
            <button
              onClick={copyLot}
              disabled={!lotNumber}
              style={{ backgroundColor: lotNumber ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)', color: lotNumber ? '#fff' : 'rgba(255,255,255,0.2)', border: '1.5px solid', borderColor: lotNumber ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '13px', fontWeight: 700, fontSize: '14px', cursor: lotNumber ? 'pointer' : 'not-allowed' }}
            >
              {copied ? '✓ Copied!' : '📋 Copy Lot'}
            </button>
          </div>
        </div>

        {/* ── PRODUCT INFO ── */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '15px', marginBottom: '16px' }}>Product Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Product Name</label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Fresh Grouper"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Supplier</label>
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="e.g. Nassau Fish Co."
                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>

        {/* ── YIELD INPUTS ── */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '15px', marginBottom: '16px' }}>Yield Processing</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Weight In (lbs)', value: weightIn, setter: setWeightIn, placeholder: '100', hint: 'Raw weight received' },
              { label: 'Weight Out (lbs)', value: weightOut, setter: setWeightOut, placeholder: '35', hint: 'After processing' },
              { label: 'Total Cost ($)', value: totalCost, setter: setTotalCost, placeholder: '250.00', hint: 'What BSC paid' },
            ].map((f) => (
              <div key={f.label}>
                <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>{f.label}</label>
                <input
                  type="number"
                  value={f.value}
                  onChange={(e) => f.setter(e.target.value)}
                  placeholder={f.placeholder}
                  min="0"
                  step="0.01"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '16px', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ color: '#9ca3af', fontSize: '10px', marginTop: '3px' }}>{f.hint}</div>
              </div>
            ))}
          </div>

          {/* Live preview */}
          {wIn > 0 && wOut > 0 && cost > 0 && (
            <div style={{ backgroundColor: '#f8f9fa', borderRadius: '12px', padding: '14px', marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#999', fontSize: '11px', marginBottom: '4px' }}>Yield %</div>
                <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '24px' }}>{yieldPct.toFixed(1)}%</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#999', fontSize: '11px', marginBottom: '4px' }}>True Cost/lb</div>
                <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '24px' }}>${trueCostPerLb.toFixed(2)}</div>
              </div>
            </div>
          )}

          <button
            onClick={calculate}
            disabled={wIn <= 0 || wOut <= 0 || cost <= 0}
            style={{ width: '100%', backgroundColor: wIn > 0 && wOut > 0 && cost > 0 ? '#1a2e5a' : '#e5e7eb', color: wIn > 0 && wOut > 0 && cost > 0 ? '#f4c842' : '#999', border: 'none', borderRadius: '12px', padding: '14px', fontWeight: 900, fontSize: '15px', cursor: wIn > 0 && wOut > 0 && cost > 0 ? 'pointer' : 'not-allowed' }}
          >
            Calculate Channel Prices
          </button>
        </div>

        {/* ── RESULTS ── */}
        {result && (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '15px', margin: 0 }}>Channel Prices</h3>
              {result.lotNumber && (
                <span style={{ backgroundColor: '#1a2e5a', color: '#f4c842', fontSize: '10px', fontWeight: 800, padding: '4px 10px', borderRadius: '20px', fontFamily: 'monospace' }}>
                  {result.lotNumber}
                </span>
              )}
            </div>

            {/* Summary row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
              {[
                { label: 'Yield', value: `${result.yieldPct.toFixed(1)}%`, color: '#e8f5e9', text: '#2e7d32' },
                { label: 'True Cost/lb', value: `$${result.trueCostPerLb.toFixed(2)}`, color: '#fef9e7', text: '#d97706' },
                { label: 'Usable Weight', value: `${result.weightOut} lbs`, color: '#e8f4fd', text: '#1a6fb5' },
              ].map((s) => (
                <div key={s.label} style={{ backgroundColor: s.color, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>{s.label}</div>
                  <div style={{ color: s.text, fontWeight: 900, fontSize: '16px' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Channel prices */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {[
                { label: '🟡 Nassau POS', sub: '38% margin', value: result.channels.nassau, color: '#fef9e7', text: '#1a2e5a' },
                { label: '🟣 Andros POS', sub: '43% margin', value: result.channels.andros, color: '#f5f0ff', text: '#4c1d95' },
                { label: '🛒 Online Market', sub: '25% margin', value: result.channels.online, color: '#e8f4fd', text: '#1a6fb5' },
                { label: '📦 Wholesale', sub: '12% markup', value: result.channels.wholesale, color: '#f0fde8', text: '#2e7d32' },
              ].map((ch) => (
                <div key={ch.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: ch.color, borderRadius: '12px', padding: '12px 16px' }}>
                  <div>
                    <div style={{ color: ch.text, fontWeight: 800, fontSize: '14px' }}>{ch.label}</div>
                    <div style={{ color: '#999', fontSize: '11px' }}>{ch.sub}</div>
                  </div>
                  <div style={{ color: ch.text, fontWeight: 900, fontSize: '20px' }}>${ch.value.toFixed(2)}<span style={{ fontSize: '12px', fontWeight: 600 }}>/lb</span></div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                onClick={saveLot}
                disabled={saving || saved}
                style={{ backgroundColor: saved ? '#e8f5e9' : saving ? '#e5e7eb' : '#1a2e5a', color: saved ? '#2e7d32' : saving ? '#999' : '#f4c842', border: 'none', borderRadius: '12px', padding: '13px', fontWeight: 900, fontSize: '14px', cursor: saving || saved ? 'not-allowed' : 'pointer' }}
              >
                {saved ? '✅ Saved to DB' : saving ? 'Saving...' : '💾 Save Lot'}
              </button>
              <button
                onClick={reset}
                style={{ backgroundColor: '#f8f9fa', color: '#666', border: '1.5px solid #e5e7eb', borderRadius: '12px', padding: '13px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}
              >
                ↺ New Calculation
              </button>
            </div>
          </div>
        )}

        {/* EXAMPLE */}
        <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ color: '#999', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Example — 100 lbs in / 35 lbs out / $250 cost</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {[
              { label: 'Yield', value: '35.0%' },
              { label: 'True Cost/lb', value: '$7.14' },
              { label: 'Nassau Price', value: '$9.86/lb' },
              { label: 'Andros Price', value: '$10.21/lb' },
            ].map((e) => (
              <div key={e.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                <span style={{ color: '#999', fontSize: '12px' }}>{e.label}</span>
                <span style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '12px' }}>{e.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}