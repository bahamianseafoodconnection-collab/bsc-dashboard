'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function generateLotNumber(): string {
  const now  = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const dd   = String(now.getDate()).padStart(2, '0');
  const seq  = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `BSC-${yyyy}${mm}${dd}-${seq}`;
}

function generateTrackingCode(fishermanName: string, vesselReg: string, lotNumber: string): string {
  const initials = fishermanName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 3);
  const regCode  = vesselReg.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4);
  const lotEnd   = lotNumber.slice(-3);
  return `${initials}-${regCode}-${lotEnd}`;
}

type YieldResult = {
  lotNumber: string;
  trackingCode: string;
  productName: string;
  fishermanName: string;
  vesselName: string;
  vesselReg: string;
  captainName: string;
  dateReceived: string;
  weightIn: number;
  weightOut: number;
  yieldPct: number;
  cost: number;
  trueCostPerLb: number;
  date: string;
  channels: { nassau: number; andros: number; online: number; wholesale: number };
};

export default function YieldPage() {
  const [lotNumber, setLotNumber]         = useState('');
  const [trackingCode, setTrackingCode]   = useState('');
  const [productName, setProductName]     = useState('');
  const [fishermanName, setFishermanName] = useState('');
  const [vesselName, setVesselName]       = useState('');
  const [vesselReg, setVesselReg]         = useState('');
  const [captainName, setCaptainName]     = useState('');
  const [dateReceived, setDateReceived]     = useState(new Date().toISOString().split('T')[0]);
  const [weightIn, setWeightIn]           = useState('');
  const [weightOut, setWeightOut]         = useState('');
  const [totalCost, setTotalCost]         = useState('');
  const [result, setResult]               = useState<YieldResult | null>(null);
  const [saved, setSaved]                 = useState(false);
  const [saving, setSaving]               = useState(false);
  const [copied, setCopied]               = useState(false);
  const [showLabel, setShowLabel]         = useState(false);
  const labelRef                          = useRef<HTMLDivElement>(null);

  const wIn  = parseFloat(weightIn)  || 0;
  const wOut = parseFloat(weightOut) || 0;
  const cost = parseFloat(totalCost) || 0;

  const yieldPct      = wIn  > 0 ? (wOut / wIn) * 100 : 0;
  const trueCostPerLb = wOut > 0 ? cost / wOut          : 0;
  const nassau        = trueCostPerLb * 1.38;
  const andros        = trueCostPerLb * 1.43;
  const online        = trueCostPerLb * 1.25;
  const wholesale     = trueCostPerLb * 1.12;

  function handleGenerateLot() {
    const lot      = generateLotNumber();
    const tracking = generateTrackingCode(fishermanName || 'BSC', vesselReg || '0000', lot);
    setLotNumber(lot);
    setTrackingCode(tracking);
    setSaved(false);
    setShowLabel(false);
  }

  function copyLot() {
    if (!lotNumber) return;
    navigator.clipboard.writeText(lotNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function calculate() {
    if (wIn <= 0 || wOut <= 0 || cost <= 0) return;
    const lot      = lotNumber || generateLotNumber();
    const tracking = generateTrackingCode(fishermanName || 'BSC', vesselReg || '0000', lot);
    if (!lotNumber) { setLotNumber(lot); setTrackingCode(tracking); }
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    setResult({
      lotNumber: lot,
      trackingCode: tracking,
      productName,
      fishermanName,
      vesselName,
      vesselReg,
      captainName,
      dateReceived,
      weightIn: wIn,
      weightOut: wOut,
      yieldPct,
      cost,
      trueCostPerLb,
      date: today,
      channels: { nassau, andros, online, wholesale },
    });
    setSaved(false);
    setShowLabel(false);
  }

  async function saveLot() {
    if (!result) return;
    setSaving(true);
    try {
      await supabase.from('yield_lots').insert([{
        lot_number:        result.lotNumber,
        tracking_code:     result.trackingCode,
        product_name:      result.productName || 'Unknown',
        fisherman_name:    result.fishermanName,
        vessel_name:       result.vesselName,
        vessel_reg:        result.vesselReg,
        captain_name:      result.captainName,
        date_received:     result.dateReceived,
        weight_in_lbs:     result.weightIn,
        weight_out_lbs:    result.weightOut,
        yield_pct:         result.yieldPct,
        total_cost:        result.cost,
        true_cost_per_lb:  result.trueCostPerLb,
        nassau_price:      result.channels.nassau,
        andros_price:      result.channels.andros,
        online_price:      result.channels.online,
        wholesale_price:   result.channels.wholesale,
        created_at:        new Date().toISOString(),
      }]);
      setSaved(true);
    } catch { /* continue */ }
    setSaving(false);
  }

  function printLabel() {
    const labelContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>BSC Product Label</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; background: #fff; }
          .label {
            width: 4in; min-height: 3in;
            border: 3px solid #1a2e5a;
            border-radius: 8px;
            padding: 14px;
            page-break-inside: avoid;
          }
          .header {
            display: flex; align-items: center; justify-content: space-between;
            border-bottom: 2px solid #1a2e5a; padding-bottom: 8px; margin-bottom: 10px;
          }
          .brand { font-size: 18px; font-weight: 900; color: #1a2e5a; }
          .sub   { font-size: 8px; color: #666; letter-spacing: 1px; text-transform: uppercase; }
          .lot   { background: #1a2e5a; color: #f4c842; font-size: 11px; font-weight: 900; padding: 4px 8px; border-radius: 4px; text-align: center; }
          .tracking { background: #f4c842; color: #1a2e5a; font-size: 10px; font-weight: 900; padding: 3px 8px; border-radius: 4px; text-align: center; margin-top: 3px; }
          .product-name { font-size: 20px; font-weight: 900; color: #1a2e5a; margin-bottom: 8px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
          .label-key { font-size: 9px; color: #999; text-transform: uppercase; letter-spacing: 0.5px; }
          .label-val { font-size: 11px; font-weight: 700; color: #1a2e5a; text-align: right; }
          .divider { border-top: 1px dashed #ccc; margin: 8px 0; }
          .vessel-box { background: #f8f9fa; border-radius: 4px; padding: 8px; margin-bottom: 8px; }
          .vessel-title { font-size: 9px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
          .footer { border-top: 1px solid #1a2e5a; padding-top: 6px; margin-top: 8px; text-align: center; font-size: 8px; color: #999; }
          .barcode-area { text-align: center; margin: 6px 0; letter-spacing: 4px; font-size: 18px; color: #1a2e5a; font-family: monospace; }
          @media print {
            body { margin: 0; }
            .label { border: 3px solid #1a2e5a; }
          }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="header">
            <div>
              <div class="brand">🐟 BSC Marketplace</div>
              <div class="sub">Bahamian Seafood Connection · Nassau</div>
            </div>
            <div>
              <div class="lot">${result?.lotNumber}</div>
              <div class="tracking">TRK: ${result?.trackingCode}</div>
            </div>
          </div>

          <div class="product-name">${result?.productName || 'Seafood Product'}</div>

          <div class="vessel-box">
            <div class="vessel-title">🚢 Vessel & Fisherman Information</div>
            <div class="row"><span class="label-key">Fisherman</span><span class="label-val">${result?.fishermanName || '—'}</span></div>
            <div class="row"><span class="label-key">Captain/Owner</span><span class="label-val">${result?.captainName || '—'}</span></div>
            <div class="row"><span class="label-key">Vessel Name</span><span class="label-val">${result?.vesselName || '—'}</span></div>
            <div class="row"><span class="label-key">Vessel Reg #</span><span class="label-val">${result?.vesselReg || '—'}</span></div>
            <div class="row"><span class="label-key">Date Received</span><span class="label-val">${result?.dateReceived}</span></div>
          </div>

          <div class="divider"></div>

          <div class="row"><span class="label-key">Weight In (Raw)</span><span class="label-val">${result?.weightIn} lbs</span></div>
          <div class="row"><span class="label-key">Weight Out (Processed)</span><span class="label-val">${result?.weightOut} lbs</span></div>
          <div class="row"><span class="label-key">Yield</span><span class="label-val">${result?.yieldPct.toFixed(1)}%</span></div>
          <div class="row"><span class="label-key">True Cost/lb</span><span class="label-val">$${result?.trueCostPerLb.toFixed(2)}</span></div>

          <div class="divider"></div>

          <div class="barcode-area">|||  ${result?.trackingCode}  |||</div>

          <div class="footer">
            Scan tracking code to verify origin · BSC Marketplace · bscbahamas.com · +1 (242) 558-4495
          </div>
        </div>
      </body>
      </html>
    `;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(labelContent);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 500);
    }
  }

  function reset() {
    setLotNumber(''); setTrackingCode(''); setProductName('');
    setFishermanName(''); setVesselName(''); setVesselReg('');
    setCaptainName(''); setWeightIn(''); setWeightOut('');
    setTotalCost(''); setResult(null); setSaved(false); setShowLabel(false);
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
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>Weight in → Weight out → Label → Track</div>
            </div>
          </div>
          <Link href="/purchase-orders" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', textDecoration: 'none', fontWeight: 600 }}>
            POs →
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>

        {/* LOT NUMBER */}
        <div style={{ backgroundColor: '#1a2e5a', borderRadius: '16px', padding: '18px', marginBottom: '14px' }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px' }}>
            Lot & Tracking
          </div>
          {lotNumber ? (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '10px 14px', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', letterSpacing: '1px', marginBottom: '2px' }}>LOT NUMBER</div>
                  <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '20px', letterSpacing: '1px', fontFamily: 'monospace' }}>{lotNumber}</div>
                </div>
                <button onClick={copyLot} style={{ backgroundColor: copied ? '#4ade80' : 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>
              <div style={{ backgroundColor: 'rgba(244,200,66,0.1)', borderRadius: '10px', padding: '10px 14px' }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', letterSpacing: '1px', marginBottom: '2px' }}>TRACKING CODE</div>
                <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '16px', fontFamily: 'monospace' }}>{trackingCode}</div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '9px', marginTop: '2px' }}>Links this label back to the fisherman</div>
              </div>
            </div>
          ) : (
            <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '12px', marginBottom: '12px', textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '13px' }}>No lot generated yet</div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button onClick={handleGenerateLot} style={{ backgroundColor: '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: '12px', padding: '13px', fontWeight: 900, fontSize: '14px', cursor: 'pointer' }}>
              {lotNumber ? '↻ New Lot' : '+ Generate Lot'}
            </button>
            <button onClick={copyLot} disabled={!lotNumber} style={{ backgroundColor: lotNumber ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)', color: lotNumber ? '#fff' : 'rgba(255,255,255,0.2)', border: '1.5px solid', borderColor: lotNumber ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '13px', fontWeight: 700, fontSize: '14px', cursor: lotNumber ? 'pointer' : 'not-allowed' }}>
              {copied ? '✓ Copied!' : '📋 Copy Lot'}
            </button>
          </div>
        </div>

        {/* FISHERMAN & VESSEL INFO */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', marginBottom: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px', marginBottom: '14px' }}>🚢 Vessel & Fisherman</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { label: 'Fisherman Name',      value: fishermanName, setter: setFishermanName, placeholder: 'e.g. John Smith' },
              { label: 'Captain / Owner',     value: captainName,   setter: setCaptainName,   placeholder: 'e.g. John Smith' },
              { label: 'Vessel Name',         value: vesselName,    setter: setVesselName,    placeholder: 'e.g. Sea Queen' },
              { label: 'Vessel Reg #',        value: vesselReg,     setter: setVesselReg,     placeholder: 'e.g. BS-1234' },
            ].map((f) => (
              <div key={f.label}>
                <label style={{ display: 'block', color: '#374151', fontSize: '11px', fontWeight: 700, marginBottom: '5px' }}>{f.label}</label>
                <input type="text" value={f.value} onChange={(e) => f.setter(e.target.value)} placeholder={f.placeholder} style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
        </div>

        {/* DATE RECEIVED */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', marginBottom: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px', marginBottom: '12px' }}>📅 Date Product Received</h3>
          <input
            type="date"
            value={dateReceived}
            onChange={(e) => setDateReceived(e.target.value)}
            style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '16px', fontWeight: 700, outline: 'none', boxSizing: 'border-box' as const, color: '#1a2e5a' }}
          />
          <div style={{ color: '#9ca3af', fontSize: '11px', marginTop: '6px' }}>
            Date the fisherman delivered this product to BSC
          </div>
        </div>

        {/* PRODUCT INFO */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', marginBottom: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px', marginBottom: '14px' }}>🐟 Product Details</h3>
          <div>
            <label style={{ display: 'block', color: '#374151', fontSize: '11px', fontWeight: 700, marginBottom: '5px' }}>Product Name</label>
            <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. Fresh Grouper" style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '12px' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
            {[
              { label: 'Weight In (lbs)', value: weightIn, setter: setWeightIn, placeholder: '100', hint: 'Raw weight' },
              { label: 'Weight Out (lbs)', value: weightOut, setter: setWeightOut, placeholder: '35', hint: 'Processed' },
              { label: 'Total Cost ($)', value: totalCost, setter: setTotalCost, placeholder: '250', hint: 'BSC paid' },
            ].map((f) => (
              <div key={f.label}>
                <label style={{ display: 'block', color: '#374151', fontSize: '11px', fontWeight: 700, marginBottom: '5px' }}>{f.label}</label>
                <input type="number" value={f.value} onChange={(e) => f.setter(e.target.value)} placeholder={f.placeholder} min="0" step="0.01" style={{ width: '100%', padding: '9px 10px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '16px', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ color: '#9ca3af', fontSize: '9px', marginTop: '2px' }}>{f.hint}</div>
              </div>
            ))}
          </div>

          {wIn > 0 && wOut > 0 && cost > 0 && (
            <div style={{ backgroundColor: '#f8f9fa', borderRadius: '10px', padding: '12px', marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#999', fontSize: '10px', marginBottom: '3px' }}>Yield %</div>
                <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '22px' }}>{yieldPct.toFixed(1)}%</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#999', fontSize: '10px', marginBottom: '3px' }}>True Cost/lb</div>
                <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '22px' }}>${trueCostPerLb.toFixed(2)}</div>
              </div>
            </div>
          )}

          <button onClick={calculate} disabled={wIn <= 0 || wOut <= 0 || cost <= 0} style={{ width: '100%', marginTop: '14px', backgroundColor: wIn > 0 && wOut > 0 && cost > 0 ? '#1a2e5a' : '#e5e7eb', color: wIn > 0 && wOut > 0 && cost > 0 ? '#f4c842' : '#999', border: 'none', borderRadius: '12px', padding: '13px', fontWeight: 900, fontSize: '15px', cursor: wIn > 0 && wOut > 0 && cost > 0 ? 'pointer' : 'not-allowed' }}>
            Calculate Channel Prices
          </button>
        </div>

        {/* RESULTS */}
        {result && (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', marginBottom: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px', margin: 0 }}>Channel Prices</h3>
              <span style={{ backgroundColor: '#1a2e5a', color: '#f4c842', fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '20px', fontFamily: 'monospace' }}>
                {result.trackingCode}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '14px' }}>
              {[
                { label: 'Yield',        value: `${result.yieldPct.toFixed(1)}%`,        color: '#e8f5e9', text: '#2e7d32' },
                { label: 'True Cost/lb', value: `$${result.trueCostPerLb.toFixed(2)}`,   color: '#fef9e7', text: '#d97706' },
              ].map((s) => (
                <div key={s.label} style={{ backgroundColor: s.color, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ color: '#999', fontSize: '10px', marginBottom: '3px' }}>{s.label}</div>
                  <div style={{ color: s.text, fontWeight: 900, fontSize: '18px' }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {[
                { label: '🟡 Nassau POS',   sub: '38%', value: result.channels.nassau,    color: '#fef9e7', text: '#1a2e5a' },
                { label: '🟣 Andros POS',   sub: '43%', value: result.channels.andros,    color: '#f5f0ff', text: '#4c1d95' },
                { label: '🛒 Retail Online',        sub: '25%', value: result.channels.online,    color: '#e8f4fd', text: '#1a6fb5' },
                { label: '📦 Wholesale',     sub: '15%', value: result.channels.wholesale, color: '#f0fde8', text: '#2e7d32' },
              ].map((ch) => (
                <div key={ch.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: ch.color, borderRadius: '10px', padding: '10px 14px' }}>
                  <div>
                    <div style={{ color: ch.text, fontWeight: 800, fontSize: '13px' }}>{ch.label}</div>
                    <div style={{ color: '#999', fontSize: '10px' }}>{ch.sub} margin</div>
                  </div>
                  <div style={{ color: ch.text, fontWeight: 900, fontSize: '18px' }}>${ch.value.toFixed(2)}<span style={{ fontSize: '11px', fontWeight: 600 }}>/lb</span></div>
                </div>
              ))}
            </div>

            {/* ACTION BUTTONS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <button onClick={saveLot} disabled={saving || saved} style={{ backgroundColor: saved ? '#e8f5e9' : saving ? '#e5e7eb' : '#1a2e5a', color: saved ? '#2e7d32' : saving ? '#999' : '#f4c842', border: 'none', borderRadius: '12px', padding: '13px', fontWeight: 900, fontSize: '14px', cursor: saving || saved ? 'not-allowed' : 'pointer' }}>
                {saved ? '✅ Saved' : saving ? 'Saving...' : '💾 Save Lot'}
              </button>
              <button onClick={() => setShowLabel(true)} style={{ backgroundColor: '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: '12px', padding: '13px', fontWeight: 900, fontSize: '14px', cursor: 'pointer' }}>
                🏷️ View Label
              </button>
            </div>

            <button onClick={printLabel} style={{ width: '100%', backgroundColor: '#fff', color: '#1a2e5a', border: '2px solid #1a2e5a', borderRadius: '12px', padding: '13px', fontWeight: 800, fontSize: '14px', cursor: 'pointer', marginBottom: '10px' }}>
              🖨️ Print Label
            </button>

            <button onClick={reset} style={{ width: '100%', backgroundColor: '#f8f9fa', color: '#666', border: '1.5px solid #e5e7eb', borderRadius: '12px', padding: '12px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
              ↺ New Calculation
            </button>
          </div>
        )}

        {/* LABEL PREVIEW */}
        {showLabel && result && (
          <div ref={labelRef} style={{ backgroundColor: '#fff', borderRadius: '16px', border: '3px solid #1a2e5a', padding: '20px', marginBottom: '14px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
            {/* Label Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #1a2e5a', paddingBottom: '10px', marginBottom: '12px' }}>
              <div>
                <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px' }}>🐟 BSC Marketplace</div>
                <div style={{ color: '#999', fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase' }}>Bahamian Seafood Connection</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ backgroundColor: '#1a2e5a', color: '#f4c842', fontSize: '10px', fontWeight: 900, padding: '3px 8px', borderRadius: '4px', marginBottom: '3px', fontFamily: 'monospace' }}>{result.lotNumber}</div>
                <div style={{ backgroundColor: '#f4c842', color: '#1a2e5a', fontSize: '10px', fontWeight: 900, padding: '3px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>TRK: {result.trackingCode}</div>
              </div>
            </div>

            {/* Product */}
            <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '20px', marginBottom: '10px' }}>{result.productName || 'Seafood Product'}</div>

            {/* Vessel info */}
            <div style={{ backgroundColor: '#f8f9fa', borderRadius: '10px', padding: '12px', marginBottom: '10px' }}>
              <div style={{ color: '#999', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>🚢 Vessel & Fisherman</div>
              {[
                { key: 'Fisherman',    val: result.fishermanName },
                { key: 'Captain',      val: result.captainName },
                { key: 'Vessel Name',  val: result.vesselName },
                { key: 'Vessel Reg',   val: result.vesselReg },
                { key: 'Date Received', val: result.dateReceived },
              ].map((row) => row.val && (
                <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#999', fontSize: '11px' }}>{row.key}</span>
                  <span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '11px' }}>{row.val}</span>
                </div>
              ))}
            </div>

            {/* Weight/yield */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px', marginBottom: '10px' }}>
              {[
                { label: 'In',    value: `${result.weightIn} lbs` },
                { label: 'Out',   value: `${result.weightOut} lbs` },
                { label: 'Yield', value: `${result.yieldPct.toFixed(1)}%` },
                { label: 'Cost',  value: `$${result.trueCostPerLb.toFixed(2)}/lb` },
              ].map((s) => (
                <div key={s.label} style={{ backgroundColor: '#f0f4ff', borderRadius: '8px', padding: '8px 4px', textAlign: 'center' }}>
                  <div style={{ color: '#999', fontSize: '9px' }}>{s.label}</div>
                  <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '11px' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Tracking barcode area */}
            <div style={{ textAlign: 'center', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginBottom: '10px' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '20px', letterSpacing: '4px', color: '#1a2e5a' }}>|||  {result.trackingCode}  |||</div>
              <div style={{ color: '#999', fontSize: '9px', marginTop: '3px' }}>Scan to verify origin</div>
            </div>

            <div style={{ textAlign: 'center', color: '#999', fontSize: '9px', borderTop: '1px solid #ebebeb', paddingTop: '8px' }}>
              bscbahamas.com · 💬 WhatsApp: +1 (242) 361-3474 · 📞 Call: +1 (242) 558-4495 · Firetrial Road, Nassau 🇧🇸
            </div>

            <button onClick={printLabel} style={{ width: '100%', marginTop: '12px', backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: '12px', padding: '13px', fontWeight: 900, fontSize: '14px', cursor: 'pointer' }}>
              🖨️ Print This Label
            </button>
          </div>
        )}

        {/* EXAMPLE */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ color: '#999', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Example — 100 lbs in / 35 lbs out / $250 cost</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
            {[
              { label: 'Yield', value: '35.0%' },
              { label: 'True Cost/lb', value: '$7.14' },
              { label: 'Nassau', value: '$9.86/lb' },
              { label: 'Andros', value: '$10.21/lb' },
            ].map((e) => (
              <div key={e.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                <span style={{ color: '#999', fontSize: '11px' }}>{e.label}</span>
                <span style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '11px' }}>{e.value}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}