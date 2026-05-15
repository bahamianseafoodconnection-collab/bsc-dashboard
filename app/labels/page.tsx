'use client';

import { useState, useRef } from 'react';

const PRODUCTS = [
  {
    name: 'TENDERIZED CONCH',
    scientific: 'Aliger gigas',
    defaultIngredients: 'Conch',
    packFormat: 'Master Case 50 lbs / 10 × 5 lb bags',
    netWeight: '5 LBS (2.27 kg)',
  },
  {
    name: 'SPINY LOBSTER TAILS',
    scientific: 'Panulirus Argus',
    defaultIngredients: 'Lobster Tails, Sodium Bisulfite added as a Preservative',
    packFormat: 'Master Case 50 lbs / 10 × 5 lb bags',
    netWeight: '5 LBS (2.27 kg)',
  },
  {
    name: 'WHOLE CONCH',
    scientific: 'Aliger gigas',
    defaultIngredients: 'Conch',
    packFormat: 'Bulk',
    netWeight: '',
  },
  {
    name: 'GROUPER FILLET',
    scientific: 'Epinephelus striatus',
    defaultIngredients: 'Grouper',
    packFormat: 'Master Case / Individual Pack',
    netWeight: '',
  },
  {
    name: 'LANE SNAPPER',
    scientific: 'Lutjanus synagris',
    defaultIngredients: 'Lane Snapper',
    packFormat: 'Bulk / Individual',
    netWeight: '',
  },
  {
    name: 'CUSTOM',
    scientific: '',
    defaultIngredients: '',
    packFormat: '',
    netWeight: '',
  },
];

function twoYearsLater(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + 2);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatPackedDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function generateLotCode(productionDate: string, seq: string): string {
  if (!productionDate) return '';
  const d = new Date(productionDate);
  const year = d.getFullYear();
  return `${year}/${seq.padStart(4, '0')}`;
}

export default function LabelsPage() {
  const printRef = useRef<HTMLDivElement>(null);

  const [selectedProduct, setSelectedProduct] = useState(PRODUCTS[0]);
  const [customName, setCustomName] = useState('');
  const [customScientific, setCustomScientific] = useState('');
  const [ingredients, setIngredients] = useState(PRODUCTS[0].defaultIngredients);
  const [additives, setAdditives] = useState('');
  const [packFormat, setPackFormat] = useState(PRODUCTS[0].packFormat);
  const [netWeight, setNetWeight] = useState(PRODUCTS[0].netWeight);
  const [customerName, setCustomerName] = useState('Bob Jomara Seafood');
  const [productionDate, setProductionDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [lotSeq, setLotSeq] = useState('0074');
  const [packedBy, setPackedBy] = useState('Nicholson');
  const [copies, setCopies] = useState(10);

  function handleProductChange(productName: string) {
    const p = PRODUCTS.find(p => p.name === productName) ?? PRODUCTS[0];
    setSelectedProduct(p);
    setIngredients(p.defaultIngredients);
    setPackFormat(p.packFormat);
    setNetWeight(p.netWeight);
    setAdditives('');
  }

  const displayName = selectedProduct.name === 'CUSTOM' ? customName : selectedProduct.name;
  const displayScientific = selectedProduct.name === 'CUSTOM' ? customScientific : selectedProduct.scientific;
  const fullIngredients = additives
    ? `${ingredients}${ingredients ? ', ' : ''}${additives}`
    : ingredients;
  const lotCode = generateLotCode(productionDate, lotSeq);
  const packedDate = formatPackedDate(productionDate);
  const bestUsedBy = twoYearsLater(productionDate);

  function handlePrint() {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const labelHtml = printContent.innerHTML;
    const copiesHtml = Array(copies).fill(labelHtml).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>BSC Label — ${displayName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: white; font-family: 'Times New Roman', serif; }
          .label-wrap { display: flex; flex-wrap: wrap; }
          .label {
            width: 4in;
            min-height: 3in;
            border: 2px solid #000;
            padding: 12px 14px;
            page-break-inside: avoid;
            margin: 4px;
          }
          .logo-row { display: flex; align-items: center; justify-content: center; margin-bottom: 4px; }
          .logo-text { font-size: 10px; font-weight: bold; letter-spacing: 2px; text-align: center; color: #4a3728; }
          .lobster-icon { font-size: 28px; margin: 0 8px; }
          .product-name { font-size: 16px; font-weight: 900; text-align: center; text-transform: uppercase; margin: 4px 0 2px; }
          .scientific { font-size: 11px; font-style: italic; text-align: center; margin-bottom: 6px; font-weight: bold; }
          .divider { border-top: 1px solid #000; margin: 4px 0; }
          .company { font-size: 10px; font-weight: bold; text-align: center; line-height: 1.5; }
          .field-row { font-size: 10px; margin: 3px 0; line-height: 1.5; }
          .field-label { font-weight: bold; }
          .lot-code { font-size: 11px; font-style: italic; font-weight: bold; }
          .allergen { font-size: 10px; font-weight: 900; text-align: center; margin-top: 6px; line-height: 1.6; letter-spacing: 0.5px; }
          .customer-row { font-size: 10px; font-weight: bold; margin: 4px 0; border-top: 1px dashed #000; padding-top: 4px; }
          .net-weight { font-size: 10px; font-weight: bold; margin: 2px 0; }
          @media print {
            @page { margin: 0.3in; size: letter; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="label-wrap">
          ${copiesHtml}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#060d1f', fontFamily: "'DM Sans', sans-serif" }}>

      {/* Header */}
      <header className="sticky top-0 z-40 px-4 py-3 border-b"
        style={{ backgroundColor: '#1a2e5a', borderColor: 'rgba(245,197,24,0.2)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg" style={{ color: '#f5c518' }}>Label Generator</h1>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Spiny Tails Co. · FDA # 16988725790 · Plant 45
            </p>
          </div>
          <button onClick={handlePrint}
            className="px-4 py-2 rounded-xl font-bold text-sm"
            style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
            🖨️ Print {copies}x
          </button>
        </div>
      </header>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">

        {/* Form */}
        <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: '#0f1f3d' }}>
          <h2 className="font-bold text-white text-sm uppercase tracking-wider">Label Details</h2>

          {/* Product */}
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Product</label>
            <select value={selectedProduct.name}
              onChange={e => handleProductChange(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold text-white outline-none"
              style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }}>
              {PRODUCTS.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Custom product fields */}
          {selectedProduct.name === 'CUSTOM' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Product Name</label>
                <input value={customName} onChange={e => setCustomName(e.target.value)}
                  placeholder="e.g. MAHI MAHI FILLET"
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                  style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Scientific Name</label>
                <input value={customScientific} onChange={e => setCustomScientific(e.target.value)}
                  placeholder="e.g. Coryphaena hippurus"
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none italic"
                  style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
              </div>
            </div>
          )}

          {/* Customer */}
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Customer / Buyer</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)}
              placeholder="e.g. Bob Jomara Seafood"
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
              style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
          </div>

          {/* Pack format + Net weight */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Pack Format</label>
              <input value={packFormat} onChange={e => setPackFormat(e.target.value)}
                placeholder="e.g. 10 × 5 lb bags"
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Net Weight</label>
              <input value={netWeight} onChange={e => setNetWeight(e.target.value)}
                placeholder="e.g. 5 LBS (2.27 kg)"
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
            </div>
          </div>

          {/* Ingredients + Additives */}
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Base Ingredients</label>
            <input value={ingredients} onChange={e => setIngredients(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
              style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>
              Additives / Preservatives <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>(leave blank if none)</span>
            </label>
            <input value={additives} onChange={e => setAdditives(e.target.value)}
              placeholder="e.g. Sodium Bisulfite added as a Preservative"
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
              style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
          </div>

          {/* Production date + Lot seq + Packed by */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Production Date</label>
              <input type="date" value={productionDate} onChange={e => setProductionDate(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Lot Sequence</label>
              <input value={lotSeq} onChange={e => setLotSeq(e.target.value)}
                placeholder="0074"
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-mono"
                style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Packed By</label>
              <select value={packedBy} onChange={e => setPackedBy(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }}>
                <option>Nicholson</option>
                <option>Dedrick</option>
                <option>TJ</option>
              </select>
            </div>
          </div>

          {/* Copies */}
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Number of Labels to Print</label>
            <input type="number" min={1} max={200} value={copies}
              onChange={e => setCopies(Number(e.target.value))}
              className="w-32 rounded-xl px-3 py-2.5 text-sm text-white outline-none"
              style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
          </div>
        </div>

        {/* Label Preview */}
        <div className="rounded-2xl p-4" style={{ backgroundColor: '#0f1f3d' }}>
          <h2 className="font-bold text-white text-sm uppercase tracking-wider mb-4">Preview</h2>

          <div ref={printRef}>
            <div className="label" style={{
              width: '100%',
              maxWidth: '400px',
              margin: '0 auto',
              border: '2px solid #000',
              padding: '16px 18px',
              backgroundColor: 'white',
              fontFamily: "'Times New Roman', serif",
              color: '#000',
            }}>
              {/* Logo row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '2px', color: '#4a3728', textAlign: 'center' }}>
                  SPINY TAILS CO.
                </div>
              </div>

              {/* Lobster icon */}
              <div style={{ textAlign: 'center', fontSize: '28px', lineHeight: 1 }}>🦞</div>

              {/* Product name */}
              <div style={{ fontSize: '18px', fontWeight: 900, textAlign: 'center', textTransform: 'uppercase', marginTop: '4px' }}>
                {displayName || '—'}
              </div>

              {/* Scientific name */}
              <div style={{ fontSize: '12px', fontStyle: 'italic', fontWeight: 'bold', textAlign: 'center', marginBottom: '8px' }}>
                ({displayScientific || '—'})
              </div>

              <div style={{ borderTop: '1px solid #000', marginBottom: '6px' }} />

              {/* Company info */}
              <div style={{ fontSize: '10px', fontWeight: 'bold', textAlign: 'center', lineHeight: 1.6 }}>
                Spiny Tails Processing Co.<br />
                Firetrail Road, New Providence, The Bahamas<br />
                FDA # 16988725790, Processing Plant 45
              </div>

              <div style={{ borderTop: '1px solid #000', margin: '6px 0' }} />

              {/* Pack format */}
              {packFormat && (
                <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '4px' }}>
                  Pack: {packFormat}
                </div>
              )}

              {/* Net weight */}
              {netWeight && (
                <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '4px' }}>
                  Net Weight: {netWeight}
                </div>
              )}

              {/* Ingredients */}
              <div style={{ fontSize: '10px', marginBottom: '4px', lineHeight: 1.5 }}>
                <span style={{ fontWeight: 'bold' }}>Ingredients: </span>
                {fullIngredients || '—'}
              </div>

              {/* Lot code */}
              <div style={{ fontSize: '11px', fontStyle: 'italic', fontWeight: 'bold', marginBottom: '2px' }}>
                LOT CODE: {lotCode || '—'}
              </div>

              {/* Packed by */}
              <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '2px' }}>
                Packed By: {packedBy}, {packedDate}
              </div>

              {/* Best used by */}
              <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '6px' }}>
                Best Used by: {bestUsedBy}
              </div>

              <div style={{ borderTop: '1px solid #000', marginBottom: '6px' }} />

              {/* Allergen + origin */}
              <div style={{ fontSize: '10px', fontWeight: 900, textAlign: 'center', lineHeight: 1.7, letterSpacing: '0.5px' }}>
                SEAFOOD IS AN ALLERGEN<br />
                WILD CAUGHT PRODUCT OF THE BAHAMAS
              </div>

              {/* Customer */}
              {customerName && (
                <div style={{ borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '5px', fontSize: '10px', fontWeight: 'bold', textAlign: 'center' }}>
                  Packed for: {customerName}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Print button bottom */}
        <button onClick={handlePrint}
          className="w-full py-4 rounded-2xl font-bold text-base"
          style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
          🖨️ Print {copies} Label{copies !== 1 ? 's' : ''} — {displayName || 'Product'}
        </button>
      </div>
    </div>
  );
}
