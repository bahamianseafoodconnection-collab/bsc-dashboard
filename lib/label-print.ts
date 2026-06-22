// lib/label-print.ts
//
// Reusable thermal-label engine for the Rollo X1040 (Zebra-compatible).
// Renders QR (qrcode) + Code128 barcode (JsBarcode) + the required fields into
// an HTML label at a configurable size (default 4"x6"), then opens a print
// window and calls window.print() — the operator picks the Rollo (this also
// covers "Save as PDF" and batch printing). Browser-only (uses document/window);
// call from a client component.
//
// One engine, five label types (receiving / tray / rack / carton / export).
// The permanent receiving batch number always appears as human-readable text
// AND QR AND barcode, unchanged from receiving through export.

import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

export interface LabelData {
  title?:            string;   // RECEIVING | TRAY | RACK | EXPORT CARTON …
  product_name?:     string;
  batch_number:      string;   // the permanent ID — text + QR + barcode
  weight?:           string;
  date?:             string;
  supplier?:         string;   // supplier / fisherman
  storage_location?: string;
  tray_number?:      string;
  rack_number?:      string;
  extra?:            Array<{ label: string; value: string }>;
}

export interface LabelOpts { widthIn?: number; heightIn?: number; copies?: number; }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const row = (l: string, v: string) => `<div class="row"><b>${esc(l)}</b><span>${esc(v)}</span></div>`;

function barcodeDataUrl(text: string): string {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, text, { format: 'CODE128', displayValue: false, height: 60, margin: 0, width: 2 });
    return canvas.toDataURL('image/png');
  } catch { return ''; }
}

export async function printLabels(labels: LabelData[], opts: LabelOpts = {}): Promise<void> {
  const w = opts.widthIn ?? 4, h = opts.heightIn ?? 6, copies = Math.max(1, opts.copies ?? 1);

  const cards: string[] = [];
  for (const L of labels) {
    const qr = await QRCode.toDataURL(L.batch_number, { margin: 1, width: 260 }).catch(() => '');
    const bc = barcodeDataUrl(L.batch_number);
    const body = [
      L.product_name ? `<div class="big">${esc(L.product_name)}</div>` : '',
      `<div class="batch">${esc(L.batch_number)}</div>`,
      bc ? `<img class="bc" src="${bc}" alt="barcode"/>` : '',
      L.weight ? row('Net Weight', L.weight) : '',
      L.date ? row('Date', L.date) : '',
      L.supplier ? row('Supplier', L.supplier) : '',
      L.storage_location ? row('Storage', L.storage_location) : '',
      L.tray_number ? row('Tray #', L.tray_number) : '',
      L.rack_number ? row('Rack #', L.rack_number) : '',
      ...(L.extra ?? []).map((e) => row(e.label, e.value)),
    ].filter(Boolean).join('');
    const card = `<div class="label"><div class="hdr">${esc(L.title ?? 'LABEL')}</div><div class="body">${body}</div>${qr ? `<img class="qr" src="${qr}" alt="qr"/>` : ''}</div>`;
    for (let i = 0; i < copies; i++) cards.push(card);
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>
    @page { size: ${w}in ${h}in; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html,body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
    .label { width: ${w}in; height: ${h}in; padding: 0.16in; page-break-after: always; position: relative; overflow: hidden; }
    .hdr { font-size: 11pt; font-weight: 900; letter-spacing: 2px; border-bottom: 3px solid #000; padding-bottom: 5px; }
    .big { font-size: 15pt; font-weight: 900; margin-top: 7px; line-height: 1.1; }
    .batch { font-size: 17pt; font-weight: 900; font-family: 'Courier New', monospace; margin-top: 4px; word-break: break-all; }
    .bc { display: block; width: 100%; height: 0.55in; object-fit: contain; margin: 5px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; font-size: 10pt; border-bottom: 1px dotted #888; padding: 3px 0; }
    .row b { font-weight: 800; }
    .qr { position: absolute; bottom: 0.16in; right: 0.16in; width: 1.15in; height: 1.15in; }
  </style></head><body>${cards.join('')}<script>window.onload=function(){setTimeout(function(){window.print();},150);};</script></body></html>`;

  const win = window.open('', '_blank', 'width=520,height=760');
  if (!win) { alert('Allow pop-ups to print labels.'); return; }
  win.document.open(); win.document.write(html); win.document.close();
}
