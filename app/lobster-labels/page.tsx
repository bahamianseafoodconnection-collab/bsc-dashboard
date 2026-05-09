'use client';

// app/lobster-labels/page.tsx
//
// Build #5 - Trilingual export-grade case labels for lobster tail
// shipments. Supports all three printer formats:
//   P1 - Zebra ZD420 thermal, 4" x 6" single label per page
//   P2 - Avery 5163, 4" x 2", 10 labels per 8.5x11 sheet (2 cols x 5 rows)
//   P3 - Avery 8163, 4" x 3", 6 labels per sheet (2 cols x 3 rows)
//
// Same content in all three. Format selection only changes page CSS.
// Trilingual: English + Bahamian/Haitian Creole + Spanish.
// Compliance: scientific name, allergen, prep instruction, plant ID
// (toggle), ingredients (sodium sulfate when applicable), Product of
// The Bahamas, lot #, batch #, dates, QR code.
//
// Workflow: pick measured lot -> pick format -> set qty -> Print
// (opens Cmd+P print dialog).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Lot = {
  id: string;
  lot_number: string | null;
  product_type: string | null;
  source_type: string | null;
  island_source: string | null;
  captain_name: string | null;
  finished_weight_lb: number | null;
  output_breakdown: Record<string, number> | null;
  processed_at: string | null;
  cost_paid: number | null;
  true_cost_per_lb: number | null;
};

type LabelSpec = {
  product: string;
  scientific: string;
  netWeightLb: string;
  pieces: string;
  size: string;
  lotNumber: string;
  batchNumber: string;
  processedDate: string; // YYYY-MM-DD
  expiryDate: string;    // YYYY-MM-DD (processed + 24 mo)
  ingredients: string;   // Optional ingredients line
  showPlantInfo: boolean;
  plantName: string;
  plantNumber: string;
  qrUrl: string;
  format: 'P1' | 'P2' | 'P3';
  copies: number;
};

export default function LobsterLabelsPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLotId, setSelectedLotId] = useState<string>('');

  // Per-print form state
  const [format, setFormat] = useState<'P1' | 'P2' | 'P3'>('P1');
  const [copies, setCopies] = useState('1');
  const [size, setSize] = useState('6oz');
  const [netWeight, setNetWeight] = useState('10');
  const [pieces, setPieces] = useState('22');
  const [hasSodiumSulfate, setHasSodiumSulfate] = useState(false);
  const [showPlantInfo, setShowPlantInfo] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('yield_lots')
      .select('id, lot_number, product_type, source_type, island_source, captain_name, finished_weight_lb, output_breakdown, processed_at, cost_paid, true_cost_per_lb')
      .not('processed_at', 'is', null)
      .order('processed_at', { ascending: false })
      .limit(50);
    setLots((data || []) as Lot[]);
    setLoading(false);
  }

  const selectedLot = useMemo(
    () => lots.find((l) => l.id === selectedLotId) || null,
    [lots, selectedLotId],
  );

  function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
  }
  function expiryFor(processedYmd: string): string {
    const d = new Date(processedYmd);
    d.setFullYear(d.getFullYear() + 2);
    return d.toISOString().slice(0, 10);
  }

  function openPrintWindow() {
    if (!selectedLot) { alert('Pick a measured lot first'); return; }
    const processedDate = selectedLot.processed_at
      ? selectedLot.processed_at.slice(0, 10)
      : todayStr();
    const spec: LabelSpec = {
      product: 'Spiny Lobster Tail',
      scientific: 'Panulirus argus',
      netWeightLb: netWeight || '10',
      pieces: pieces || '22',
      size,
      lotNumber: selectedLot.lot_number || '—',
      batchNumber: selectedLot.id.slice(0, 8).toUpperCase(),
      processedDate,
      expiryDate: expiryFor(processedDate),
      ingredients: hasSodiumSulfate ? 'Sodium sulfate (added as antibrowning agent)' : '',
      showPlantInfo,
      plantName: 'Spiny Tail Processing Plant',
      plantNumber: 'BNT-INH-001',  // BSC's plant identifier (placeholder until real FDA # provided)
      qrUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/track/${selectedLot.id}`,
      format,
      copies: Math.max(1, Number(copies) || 1),
    };
    const html = renderPrintHtml(spec);
    const win = window.open('', '_blank', 'width=900,height=1200');
    if (!win) { alert('Popup blocked - allow popups for this site'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>

      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0, marginBottom: 6 }}>
        Lobster Export Labels
      </h1>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>
        Trilingual (English / Creole / Spanish) export-grade labels. Print on Zebra thermal 4×6, Avery 5163 (4×2), or Avery 8163 (4×3).
      </div>

      {loading && <div style={{ color: '#94a3b8', padding: 12 }}>Loading lots…</div>}

      {!loading && lots.length === 0 && (
        <div style={{ color: '#94a3b8', padding: 16, textAlign: 'center', fontSize: 12 }}>
          No measured lots available. Process a lot via /yield-measure first.
        </div>
      )}

      {lots.length > 0 && (
        <form
          onSubmit={(e) => { e.preventDefault(); openPrintWindow(); }}
          style={cardStyle}
        >
          <Field label="Pick a measured lot">
            <select value={selectedLotId} onChange={(e) => setSelectedLotId(e.target.value)} required style={inputStyle}>
              <option value="">— choose —</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lot_number || l.id.slice(0, 8)} · {l.product_type} · {Number(l.finished_weight_lb || 0).toFixed(1)} lbs · {l.island_source || 'unknown'}
                </option>
              ))}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Field label="Printer / format">
              <select value={format} onChange={(e) => setFormat(e.target.value as 'P1' | 'P2' | 'P3')} style={inputStyle}>
                <option value="P1">P1 — Zebra thermal 4×6</option>
                <option value="P2">P2 — Avery 5163 (4×2, 10/sheet)</option>
                <option value="P3">P3 — Avery 8163 (4×3, 6/sheet)</option>
              </select>
            </Field>
            <Field label="Tail size">
              <select value={size} onChange={(e) => setSize(e.target.value)} style={inputStyle}>
                {['5oz', '6oz', '7oz', '8oz', '9oz', '10/12oz', '12/14oz', '14/16oz'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Copies to print">
              <input type="number" min="1" value={copies} onChange={(e) => setCopies(e.target.value)} style={inputStyle} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Net weight per case (lb)">
              <input type="number" step="0.01" value={netWeight} onChange={(e) => setNetWeight(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Pieces per case">
              <input type="number" min="0" value={pieces} onChange={(e) => setPieces(e.target.value)} style={inputStyle} />
            </Field>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', marginBottom: 8 }}>
            <input type="checkbox" checked={hasSodiumSulfate} onChange={(e) => setHasSodiumSulfate(e.target.checked)} />
            Add sodium sulfate ingredient line (treated as antibrowning)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1', marginBottom: 12 }}>
            <input type="checkbox" checked={showPlantInfo} onChange={(e) => setShowPlantInfo(e.target.checked)} />
            Show Spiny Tail plant name + plant # (uncheck for private-label / BNT-branded shipments)
          </label>

          <button
            type="submit"
            disabled={!selectedLotId}
            style={{ width: '100%', background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '12px 14px', fontWeight: 800, fontSize: 14, cursor: selectedLotId ? 'pointer' : 'not-allowed', opacity: selectedLotId ? 1 : 0.5 }}
          >
            🖨 Open print preview (Cmd+P)
          </button>

          {selectedLot && (
            <div style={{ marginTop: 12, padding: 10, background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 6, fontSize: 11, color: '#cbd5e1' }}>
              Will print {copies} {format} label{Number(copies) === 1 ? '' : 's'} for lot{' '}
              <span style={{ color: '#f5c518', fontFamily: 'monospace' }}>{selectedLot.lot_number || selectedLot.id.slice(0, 8)}</span>
              {selectedLot.output_breakdown && Object.keys(selectedLot.output_breakdown).length > 0 && (
                <div style={{ marginTop: 4, color: '#94a3b8' }}>
                  Lot output: {Object.entries(selectedLot.output_breakdown).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k}: ${Number(v).toFixed(1)}lb`).join(' · ')}
                </div>
              )}
            </div>
          )}
        </form>
      )}
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

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 720, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: 14, border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };

// ─────────────────────────────────────────────────────────────────────
// Print HTML generator
// ─────────────────────────────────────────────────────────────────────

function renderLabelInner(spec: LabelSpec): string {
  const qrSize = spec.format === 'P1' ? 90 : spec.format === 'P3' ? 65 : 55;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(spec.qrUrl)}`;
  const ingredientsLine = spec.ingredients
    ? `<div class="line ing"><b>Ingredients / Ingredyan / Ingredientes:</b> ${spec.ingredients}</div>`
    : '';
  const plantLine = spec.showPlantInfo
    ? `<div class="plant">${spec.plantName} · Plant ${spec.plantNumber}</div>`
    : '';

  // P1 (4x6) gets the rich layout. P2 (4x2) is most compressed. P3 (4x3) is mid.
  if (spec.format === 'P1') {
    return `
      <div class="label">
        <div class="hdr">
          <div class="title">SPINY LOBSTER · LANGOSTA · OMA</div>
          <div class="sci">${spec.scientific}</div>
        </div>
        <div class="grid2">
          <div>
            <div class="kv"><span>Net Weight · Pwa Net · Peso Neto</span><b>${spec.netWeightLb} LB</b></div>
            <div class="kv"><span>Pieces · Pyès · Piezas</span><b>${spec.pieces}</b></div>
            <div class="kv"><span>Size · Gwosè · Tamaño</span><b>${spec.size}</b></div>
            <div class="kv"><span>Lot · Lo · Lote</span><b>${spec.lotNumber}</b></div>
            <div class="kv"><span>Batch · Bach · Lote</span><b>${spec.batchNumber}</b></div>
          </div>
          <div class="qrwrap"><img src="${qrSrc}" alt="QR" /></div>
        </div>
        <div class="dates">
          <div>Processed · Trete · Procesado<br/><b>${spec.processedDate}</b></div>
          <div>Expires · Ekspire · Vence<br/><b>${spec.expiryDate}</b></div>
        </div>
        ${ingredientsLine}
        <div class="line allergen"><b>Contains: Shellfish (lobster) — Allergen</b><br/>Gen: Kristase (omar) · Contiene: Mariscos (langosta)</div>
        <div class="line cook"><b>MUST BE FULLY COOKED · DWE KWIT FUL · DEBE COCINARSE COMPLETAMENTE</b></div>
        <div class="line storage">Keep frozen at -18°C / 0°F · Kenbe konjle a -18°C · Mantener congelado a -18°C</div>
        <div class="footer">
          <div class="origin"><b>Product of THE BAHAMAS</b><br/>Pwodwi Bahamas · Producto de Bahamas</div>
          ${plantLine}
        </div>
      </div>`;
  }

  if (spec.format === 'P3') {
    // 4x3 - mid density
    return `
      <div class="label">
        <div class="hdr">
          <div class="title">SPINY LOBSTER · LANGOSTA · OMA</div>
          <div class="sci">${spec.scientific}</div>
        </div>
        <div class="grid2">
          <div>
            <div class="kv"><span>Net wt</span><b>${spec.netWeightLb} LB</b></div>
            <div class="kv"><span>Pcs</span><b>${spec.pieces}</b></div>
            <div class="kv"><span>Size</span><b>${spec.size}</b></div>
            <div class="kv"><span>Lot</span><b>${spec.lotNumber}</b></div>
            <div class="kv"><span>Proc</span><b>${spec.processedDate}</b></div>
            <div class="kv"><span>Exp</span><b>${spec.expiryDate}</b></div>
          </div>
          <div class="qrwrap"><img src="${qrSrc}" alt="QR" /></div>
        </div>
        ${ingredientsLine}
        <div class="line allergen"><b>Contains shellfish (allergen) · MUST BE FULLY COOKED</b></div>
        <div class="line storage">Keep frozen -18°C · Kenbe konjle · Mantener congelado</div>
        <div class="footer">
          <b>Product of The Bahamas</b> · Pwodwi · Producto
          ${spec.showPlantInfo ? `<br/>${spec.plantName} · ${spec.plantNumber}` : ''}
        </div>
      </div>`;
  }

  // P2 - 4x2 most compressed
  return `
    <div class="label">
      <div class="hdr">
        <div class="title">SPINY LOBSTER · LANGOSTA</div>
        <div class="sci">${spec.scientific}</div>
      </div>
      <div class="grid3">
        <div><div class="lbl">NET</div><b>${spec.netWeightLb} LB</b></div>
        <div><div class="lbl">SIZE</div><b>${spec.size}</b></div>
        <div><div class="lbl">PCS</div><b>${spec.pieces}</b></div>
      </div>
      <div class="grid3">
        <div><div class="lbl">LOT</div><b>${spec.lotNumber}</b></div>
        <div><div class="lbl">PROC</div><b>${spec.processedDate}</b></div>
        <div><div class="lbl">EXP</div><b>${spec.expiryDate}</b></div>
      </div>
      <div class="line allergen"><b>Allergen · MUST FULLY COOK · Keep -18°C</b></div>
      <div class="footer">
        <b>Product of The Bahamas</b>
        ${spec.showPlantInfo ? ` · ${spec.plantNumber}` : ''}
      </div>
    </div>`;
}

function renderPrintHtml(spec: LabelSpec): string {
  // Repeat the label spec.copies times so a single Print sends N labels
  const labelHtml = Array.from({ length: spec.copies }).map(() => renderLabelInner(spec)).join('');

  const css = stylesheetFor(spec.format);
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>BSC Lobster Label ${spec.lotNumber}</title>
<style>${css}</style>
</head><body>
<div class="sheet">${labelHtml}</div>
<script>
  // Auto-trigger print on load (parent already calls win.print but
  // some browsers prefer the call to come from the print window itself).
  window.addEventListener('load', () => setTimeout(() => window.print(), 200));
</script>
</body></html>`;
}

function stylesheetFor(fmt: 'P1' | 'P2' | 'P3'): string {
  // Common styles
  const common = `
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; color: #000; }
    .sheet { padding: 0; }
    .label {
      page-break-inside: avoid;
      border: 1px solid #000;
      padding: 6px 8px;
    }
    .hdr { border-bottom: 1.5px solid #000; padding-bottom: 4px; margin-bottom: 4px; }
    .title { font-weight: 900; font-size: 11pt; letter-spacing: 0.5px; }
    .sci { font-style: italic; font-size: 8pt; color: #333; }
    .grid2 { display: grid; grid-template-columns: 2fr 1fr; gap: 6px; align-items: start; margin-bottom: 4px; }
    .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 4px; font-size: 8pt; }
    .grid3 .lbl { font-size: 6pt; color: #555; font-weight: 700; }
    .grid3 b { font-size: 9pt; }
    .kv { display: flex; justify-content: space-between; gap: 4px; font-size: 7.5pt; padding: 1px 0; }
    .kv b { font-size: 8.5pt; }
    .qrwrap { display: flex; justify-content: flex-end; align-items: flex-start; }
    .qrwrap img { width: 100%; max-width: 90px; height: auto; }
    .dates { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 7.5pt; margin-bottom: 4px; padding: 3px 0; border-top: 1px dotted #555; border-bottom: 1px dotted #555; }
    .line { font-size: 7pt; padding: 1.5px 0; }
    .line.ing { background: #f6f6f6; padding: 2px 4px; }
    .line.allergen { background: #ffe0e0; padding: 2px 4px; font-weight: 700; }
    .line.cook { background: #fff3cd; padding: 2px 4px; font-weight: 800; text-align: center; }
    .line.storage { font-size: 6.5pt; color: #333; }
    .footer { font-size: 6.5pt; color: #333; margin-top: 4px; padding-top: 3px; border-top: 1px dotted #555; text-align: center; }
    .footer .origin { font-size: 7.5pt; color: #000; margin-bottom: 1px; }
    .plant { margin-top: 1px; }
  `;

  if (fmt === 'P1') {
    // 4x6 thermal - one label per page
    return common + `
      @page { size: 4in 6in; margin: 0; }
      .sheet { width: 4in; }
      .label { width: 4in; height: 6in; padding: 8px 10px; border: none; }
      .title { font-size: 13pt; }
      .sci { font-size: 9pt; }
      .kv { font-size: 9pt; padding: 2px 0; }
      .kv b { font-size: 10pt; }
      .qrwrap img { max-width: 110px; }
      .dates { font-size: 9pt; }
      .line { font-size: 8pt; padding: 2px 0; }
      .line.cook { font-size: 9pt; }
      .footer { font-size: 8pt; }
    `;
  }

  if (fmt === 'P3') {
    // Avery 8163: 4x3, 6 per 8.5x11 sheet (2 cols x 3 rows)
    return common + `
      @page { size: 8.5in 11in; margin: 0.5in 0.156in; }
      .sheet { display: grid; grid-template-columns: repeat(2, 4in); column-gap: 0.187in; row-gap: 0; }
      .label { width: 4in; height: 3in; border: 0.5px dashed #999; padding: 5px 7px; }
      .title { font-size: 9pt; }
      .qrwrap img { max-width: 65px; }
    `;
  }

  // P2 - Avery 5163: 4x2, 10 per sheet (2 cols x 5 rows)
  return common + `
    @page { size: 8.5in 11in; margin: 0.5in 0.156in; }
    .sheet { display: grid; grid-template-columns: repeat(2, 4in); column-gap: 0.187in; row-gap: 0; }
    .label { width: 4in; height: 2in; border: 0.5px dashed #999; padding: 4px 6px; font-size: 7pt; }
    .hdr { padding-bottom: 2px; margin-bottom: 2px; }
    .title { font-size: 8pt; }
    .sci { font-size: 6pt; }
    .grid3 { font-size: 7pt; margin-bottom: 2px; }
    .line { padding: 1px 0; font-size: 6.5pt; }
    .footer { font-size: 6pt; }
  `;
}
