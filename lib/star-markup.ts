// =====================================================================
// lib/star-markup.ts
//
// Renders an order into Star Document Markup (media type
// "text/vnd.star.markup") for the Star mC-Print3 (MCP31L) over CloudPRNT.
// NOT raw ESC/POS — the printer parses this markup itself.
//
// Width: 72mm printable @ font A = 48 columns. All column math below is
// against COL = 48; magnified header text is centred by the printer and
// is exempt from the column grid.
//
// Reuses the canonical order/line-item shape:
//   - order columns: see app/receipt/[orderId]/page.tsx
//   - line items:    parseOrderItems(order.wholesale_items)  (lib/order-items.ts)
//
// All Star directives are isolated as constants/helpers here so the
// markup tags (align / barcode / cut) can be tuned in ONE place against
// the first live test print.
// =====================================================================

import { parseOrderItems } from './order-items';

const COL = 48;

export type PrintJobType = 'receipt' | 'invoice' | 'pick_ticket';

export interface PrintableOrder {
  id: string;
  created_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  payment_method: string | null;
  payment_status: string | null;
  status: string | null;
  payment_ref: string | null;
  card_ref: string | null;
  terminal_type: string | null;
  total: number | null;
  vat_amount: number | null;
  wholesale_items: unknown;
}

// ── Star directives (centralised — tune here after the first test print) ─
const ALIGN_C = '[align: center]';
const ALIGN_L = '[align: left]';
const MAG = (w: number, h: number) => `[magnify: width ${w}; height ${h}]`;
const MAG_OFF = MAG(1, 1);
const FEED = (n: number) => `[feed: ${n}]`;
const CUT = '[cut: partial]';
// QR: placed LAST before the cut so a tag mismatch degrades gracefully
// (text + totals already printed above it).
const QR = (data: string) => `[barcode: type qr; cell 4; data ${data}]`;

const TRACE_URL = 'https://bscbahamas.com/trace';

// ── helpers ──────────────────────────────────────────────────────────
// Strip directive brackets out of any data we interpolate so a product
// name like "Snapper [fresh]" can't inject markup. Thermal font A is
// ASCII; drop non-printable/emoji so nothing prints as garbage.
function clean(s: unknown): string {
  return String(s ?? '')
    .replace(/[[\]]/g, '(')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

function money(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

// Two-column line padded to COL: left ........ right
function row(left: string, right: string): string {
  const l = clean(left);
  const r = clean(right);
  const gap = Math.max(1, COL - l.length - r.length);
  return l + ' '.repeat(gap) + r;
}

const RULE = '-'.repeat(COL);

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function invoiceNo(id: string): string {
  return `INV-${String(id).slice(0, 8).toUpperCase()}`;
}

// Plain-text payment labels (thermal font A — no emoji).
function payLabel(m: string | null): string {
  switch (m) {
    case 'card': return 'Card';
    case 'cash': return 'Cash';
    case 'cod': return 'Cash on delivery';
    case 'transfer': return 'Transfer';
    case 'wire': return 'Wire';
    case 'account': return 'Account';
    default: return m ? clean(m) : '-';
  }
}
function terminalLabel(t: string | null): string {
  switch (t) {
    case 'rbc_plug_and_play': return 'RBC Plug & Play';
    case 'rbc_physical_terminal': return 'RBC Physical Terminal';
    default: return t ? clean(t) : '';
  }
}

function isPaidStatus(o: PrintableOrder): boolean {
  const ps = (o.payment_status || o.status || '').toLowerCase();
  return ['paid_in_full', 'approved', 'paid', 'completed', 'processing'].includes(ps);
}
function statusLabel(o: PrintableOrder): string {
  const ps = (o.payment_status || o.status || '').toLowerCase();
  if (isPaidStatus(o)) return 'PAID';
  if (ps.includes('partial')) return 'PARTIAL';
  return 'UNPAID';
}

// ── brand header (shared by receipt/invoice/pick) ────────────────────
function header(title: string): string[] {
  return [
    ALIGN_C,
    MAG(2, 2), 'BSC MARKET PLACE', MAG_OFF,
    'Bahamian Seafood Connection',
    'Epic Plaza Fire Trail Rd.',
    'Nassau, New Providence, Bahamas',
    'Mobile: 242-361-3474',
    'TIN# 111392634',
    '',
    MAG(2, 1), title, MAG_OFF,
    ALIGN_L,
  ];
}

// =====================================================================
// Receipt / Invoice — money slip
// =====================================================================
function renderReceipt(o: PrintableOrder, title: string): string {
  const items = parseOrderItems(o.wholesale_items);
  const total = Number(o.total ?? 0);
  const subtotal = total;                          // VAT disabled → subtotal == total
  const vat = Number(o.vat_amount ?? 0);
  const paid = isPaidStatus(o) ? total : 0;
  const name = clean(o.customer_name) || 'Walk-In Customer';

  const L: string[] = [...header(title)];
  L.push(row(fmtDate(o.created_at), invoiceNo(o.id)));
  L.push(RULE);
  L.push(`Customer: ${name}`);
  if (o.customer_phone) L.push(clean(o.customer_phone));
  L.push(RULE);

  if (items.length === 0) {
    L.push(ALIGN_C, 'No line items recorded.', ALIGN_L);
  } else {
    for (const it of items) {
      const qty = Number(it.qty ?? 0);
      const unit = it.unit ? ` ${clean(it.unit)}` : '';
      const price = Number(it.unit_price ?? 0);
      const lineTotal = Number(it.line_total ?? price * qty);
      L.push(clean(it.name) || 'Item');
      L.push(row(`  ${qty}${unit} x ${money(price)}`, money(lineTotal)));
    }
  }

  L.push(RULE);
  L.push(row('Subtotal', money(subtotal)));
  // VAT line — 0% until BSC is approved to charge it. Shown for
  // completeness; data-driven (vat_amount), never a synthetic charge.
  L.push(row(vat > 0 ? 'VAT' : 'VAT (0%)', money(vat)));
  L.push(row('TOTAL', `BSD ${money(total)}`));
  L.push(RULE);

  // Payment block
  L.push(row('Payment', payLabel(o.payment_method)));
  if (o.payment_ref) L.push(`ref ${clean(o.payment_ref)}`);
  if (o.card_ref) L.push(`card ref ${clean(o.card_ref)}`);
  if (o.terminal_type) L.push(terminalLabel(o.terminal_type));
  L.push(row('Total Paid', `BSD ${money(paid)}`));
  L.push(row('Status', statusLabel(o)));
  L.push(RULE);

  // Community Fund — 0.5% of the sale supports the BSC Community Fund.
  // Informational receipt line (not added to the total; funding wiring
  // is tracked separately). Shown so customers see the contribution.
  const community = Math.round(total * 0.005 * 100) / 100;
  L.push(ALIGN_C);
  L.push('0.5% of this sale supports the');
  L.push(`BSC Community Fund: ${money(community)}`);
  L.push('');

  // Trace QR + footer
  L.push('Trace your seafood:');
  L.push(QR(TRACE_URL));
  L.push('bscbahamas.com/trace');
  L.push('');
  L.push('Thank you for shopping with');
  L.push('BSC Market Place');
  L.push('Questions? WhatsApp 242-361-3474');
  L.push(ALIGN_L);
  L.push(FEED(2), CUT);

  return L.join('\n') + '\n';
}

// =====================================================================
// Pick ticket — packer's list, no prices, large item lines
// =====================================================================
function renderPickTicket(o: PrintableOrder): string {
  const items = parseOrderItems(o.wholesale_items);
  const name = clean(o.customer_name) || 'Walk-In Customer';
  const count = items.reduce((s, it) => s + Number(it.qty ?? 0), 0);

  const L: string[] = [
    ALIGN_C,
    MAG(2, 2), 'PICK TICKET', MAG_OFF,
    invoiceNo(o.id),
    ALIGN_L,
    '',
    `Customer: ${name}`,
  ];
  if (o.customer_phone) L.push(clean(o.customer_phone));
  L.push(fmtDate(o.created_at));
  L.push(RULE);

  if (items.length === 0) {
    L.push('No line items recorded.');
  } else {
    L.push(MAG(1, 2));
    for (const it of items) {
      const qty = Number(it.qty ?? 0);
      const unit = it.unit ? ` ${clean(it.unit)}` : '';
      L.push(`[ ] ${qty}${unit}  ${clean(it.name) || 'Item'}`);
    }
    L.push(MAG_OFF);
  }
  L.push(RULE);
  L.push(`Items: ${count}`);
  L.push(FEED(2), CUT);

  return L.join('\n') + '\n';
}

// ── public entry ─────────────────────────────────────────────────────
export function renderJobMarkup(order: PrintableOrder, jobType: PrintJobType): string {
  switch (jobType) {
    case 'pick_ticket': return renderPickTicket(order);
    case 'invoice':     return renderReceipt(order, 'INVOICE');
    case 'receipt':
    default:            return renderReceipt(order, 'RECEIPT');
  }
}
