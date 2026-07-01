// lib/spinytails-product-label.ts
//
// Finished-product EXPORT label engine for Spiny Tails Processing Co.
// ONE engine, TWO templates switched by product_type:
//   • lobster — SPINY LOBSTER TAIL, carries SIZE + optional sulfite line
//   • conch   — QUEEN CONCH, carries CLEANING SPEC (80/90/95%)
// Both print the lot code as human text + Code128 barcode + a QR that links to
// the public trace page (bscbahamas.com/trace/{lot_code}). Browser-only — call
// from a client component. Renders a 4"x6" label and opens the print window
// (operator picks the Rollo / Save-as-PDF).

import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

// Plant identity — stamped on every label (Bahamas Fisheries requirement).
export const SPINYTAILS_PLANT = {
  name:    'Spiny Tails Processing Co.',
  address: 'Firetrail Road, New Providence, The Bahamas',
  fda:     'FDA # 16988725790',
  plant:   'Processing Plant 45',
  email:   'bahamianseafoodconnection@gmail.com',
};
const TRACE_BASE = 'https://bscbahamas.com/trace/';

export interface ProductLabel {
  productType:  'lobster' | 'conch';
  lotCode:      string;            // human text + barcode + QR(trace URL)
  netWeight:    string;            // "10 lb case" | "15 lb" | "20 lb" | "50 lb"
  packedBy?:    string;            // = date_pulled
  bestUsedBy?:  string;
  size?:        string;            // lobster only, e.g. "8 oz"
  cleaningSpec?: string;           // conch only, e.g. "90% clean"
  sulfite?:     boolean;           // lobster: Sodium Metabisulfite used
  logoUrl?:     string;            // optional brand logo
}

export interface ProductLabelOpts { widthIn?: number; heightIn?: number; copies?: number; }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const row = (l: string, v: string) => `<div class="row"><b>${esc(l)}</b><span>${esc(v)}</span></div>`;

function barcodeDataUrl(text: string): string {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, text, { format: 'CODE128', displayValue: false, height: 60, margin: 0, width: 2 });
    return canvas.toDataURL('image/png');
  } catch { return ''; }
}

function cardHtml(L: ProductLabel, qr: string, bc: string): string {
  const isLobster = L.productType === 'lobster';
  const title    = isLobster ? 'SPINY LOBSTER TAIL' : 'QUEEN CONCH';
  const scientific = isLobster ? 'Frozen Lobster Tails (Panulirus argus)' : 'Queen Conch (Aliger gigas)';
  const ingredients = isLobster
    ? (L.sulfite ? 'Lobster, Sodium Metabisulfite (as a preservative)' : 'Lobster')
    : 'Queen Conch';

  const specRow = isLobster
    ? (L.size ? row('Size', L.size) : '')
    : (L.cleaningSpec ? row('Cleaning Spec', L.cleaningSpec) : '');

  const warnings = [
    'SEAFOOD IS AN ALLERGEN',
    (isLobster && L.sulfite) ? 'CONTAINS SULFITES' : '',
    'WILD CAUGHT PRODUCT OF THE BAHAMAS',
  ].filter(Boolean);

  const logo = L.logoUrl ? `<img class="logo" src="${esc(L.logoUrl)}" alt="logo"/>` : `<div class="brand">🦞 SPINY TAILS</div>`;

  const body = [
    `<div class="hdrwrap">${logo}<div class="plant">${esc(SPINYTAILS_PLANT.name)}<br/>${esc(SPINYTAILS_PLANT.address)}<br/>${esc(SPINYTAILS_PLANT.fda)} · ${esc(SPINYTAILS_PLANT.plant)}</div></div>`,
    `<div class="title">${esc(title)}</div>`,
    `<div class="sci">${esc(scientific)}</div>`,
    row('Ingredients', ingredients),
    `<div class="lot">LOT CODE: ${esc(L.lotCode)}</div>`,
    bc ? `<img class="bc" src="${bc}" alt="barcode"/>` : '',
    specRow,
    row('Net Weight', L.netWeight),
    L.packedBy ? row('Packed By', L.packedBy) : '',
    L.bestUsedBy ? row('Best Used By', L.bestUsedBy) : '',
    `<div class="warn">${warnings.map((w) => `<div>${esc(w)}</div>`).join('')}</div>`,
  ].filter(Boolean).join('');

  return `<div class="label">${body}${qr ? `<img class="qr" src="${qr}" alt="qr"/>` : ''}</div>`;
}

export async function printProductLabels(labels: ProductLabel[], opts: ProductLabelOpts = {}): Promise<void> {
  const w = opts.widthIn ?? 4, h = opts.heightIn ?? 6, copies = Math.max(1, opts.copies ?? 1);

  const cards: string[] = [];
  for (const L of labels) {
    const qr = await QRCode.toDataURL(TRACE_BASE + encodeURIComponent(L.lotCode), { margin: 1, width: 260 }).catch(() => '');
    const bc = barcodeDataUrl(L.lotCode);
    const card = cardHtml(L, qr, bc);
    for (let i = 0; i < copies; i++) cards.push(card);
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Spiny Tails Labels</title><style>
    @page { size: ${w}in ${h}in; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html,body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
    .label { width: ${w}in; height: ${h}in; padding: 0.16in; page-break-after: always; position: relative; overflow: hidden; }
    .hdrwrap { display: flex; align-items: center; gap: 8px; border-bottom: 3px solid #000; padding-bottom: 5px; }
    .logo { width: 0.7in; height: 0.7in; object-fit: contain; }
    .brand { font-size: 12pt; font-weight: 900; letter-spacing: 1px; }
    .plant { font-size: 7.5pt; line-height: 1.25; }
    .title { font-size: 18pt; font-weight: 900; margin-top: 8px; line-height: 1.05; }
    .sci { font-size: 9.5pt; font-style: italic; margin-top: 2px; }
    .lot { font-size: 14pt; font-weight: 900; font-family: 'Courier New', monospace; margin-top: 7px; word-break: break-all; }
    .bc { display: block; width: 100%; height: 0.5in; object-fit: contain; margin: 4px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; font-size: 10pt; border-bottom: 1px dotted #888; padding: 3px 0; }
    .row b { font-weight: 800; }
    .warn { margin-top: 8px; font-size: 8.5pt; font-weight: 900; letter-spacing: 0.5px; }
    .warn div { padding: 1px 0; }
    .qr { position: absolute; bottom: 0.16in; right: 0.16in; width: 1.05in; height: 1.05in; }
  </style></head><body>${cards.join('')}<script>window.onload=function(){setTimeout(function(){window.print();},150);};</script></body></html>`;

  const win = window.open('', '_blank', 'width=520,height=760');
  if (!win) { alert('Allow pop-ups to print labels.'); return; }
  win.document.open(); win.document.write(html); win.document.close();
}
