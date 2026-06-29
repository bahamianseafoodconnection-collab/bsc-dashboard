// =====================================================================
// lib/statements/pdf.ts
//
// Branded customer statement PDF (pdf-lib). Navy + light-blue BSC theme,
// BSC logo only (NO bank trademark — founder decision). Renders:
//   header · bill-to · account-status badge · invoices table ·
//   payments-received table · outstanding summary · banking block
//   (single source: lib/banking-info) · payment instructions · footer.
//
// Pure rendering — takes an allocation (lib/statements/allocate) + the
// customer + period and returns PDF bytes. No DB access here.
// =====================================================================

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { bankingLines, BANKING_TITLE } from '@/lib/banking-info';
import type { StatementAllocation, InvoiceStatus, AccountStatus } from './allocate';

const NAVY = rgb(26 / 255, 46 / 255, 90 / 255);
const LIGHTBLUE = rgb(0.88, 0.94, 0.99);
const LB_BORDER = rgb(0.70, 0.82, 0.92);
const GREY = rgb(0.42, 0.45, 0.50);
const LINE = rgb(0.85, 0.87, 0.90);
const RED = rgb(0.86, 0.15, 0.15);
const AMBER = rgb(0.82, 0.47, 0.02);
const GREEN = rgb(0.02, 0.40, 0.27);
const WHITE = rgb(1, 1, 1);

const PAGE_W = 612, PAGE_H = 792, MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

const money = (n: number) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? `${s}T00:00:00Z` : s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export interface StatementPdfInput {
  customer: { full_name: string | null; phone: string | null; email: string | null; address: string | null };
  statementDate: string;
  periodStart: string | null;
  periodEnd: string;
  allocation: StatementAllocation;
}

function statusColor(s: InvoiceStatus | AccountStatus) {
  if (s === 'OVERDUE') return RED;
  if (s === 'DUE') return AMBER;
  if (s === 'PAID' || s === 'CURRENT') return GREEN;
  return NAVY; // OPEN
}

async function loadLogo(doc: PDFDocument): Promise<PDFImage | null> {
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.bscbahamas.com';
    const res = await fetch(`${base}/brand/bsc-marketplace-logo.png`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await doc.embedPng(new Uint8Array(await res.arrayBuffer()));
  } catch { return null; }
}

export async function renderStatementPdf(input: StatementPdfInput): Promise<Uint8Array> {
  const { customer, allocation: A } = input;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(doc);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;

  const trunc = (s: string, f: PDFFont, size: number, max: number): string => {
    let t = s ?? '';
    if (f.widthOfTextAtSize(t, size) <= max) return t;
    while (t.length > 1 && f.widthOfTextAtSize(t + '…', size) > max) t = t.slice(0, -1);
    return t + '…';
  };
  const draw = (s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; align?: 'left' | 'right' | 'center'; max?: number } = {}) => {
    const size = o.size ?? 10, f = o.f ?? font;
    let str = String(s ?? '');
    if (o.max) str = trunc(str, f, size, o.max);
    let x2 = x;
    const w = f.widthOfTextAtSize(str, size);
    if (o.align === 'right') x2 = x - w;
    else if (o.align === 'center') x2 = x - w / 2;
    page.drawText(str, { x: x2, y: yy, size, font: f, color: o.color ?? rgb(0.1, 0.12, 0.15) });
  };
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };
  const ensure = (space: number) => { if (y - space < MARGIN + 40) newPage(); };

  // ── Header band ──
  page.drawRectangle({ x: 0, y: PAGE_H - 92, width: PAGE_W, height: 92, color: NAVY });
  if (logo) {
    const h = 52, w = (logo.width / logo.height) * h;
    page.drawImage(logo, { x: MARGIN, y: PAGE_H - 74, width: Math.min(w, 120), height: h });
  }
  draw('BSC MARKET PLACE', PAGE_W - MARGIN, PAGE_H - 40, { size: 16, f: bold, color: WHITE, align: 'right' });
  draw('Bahamian Seafood Connection', PAGE_W - MARGIN, PAGE_H - 56, { size: 9, color: rgb(0.8, 0.86, 0.95), align: 'right' });
  draw('Epic Plaza Fire Trail Rd, Nassau, Bahamas  ·  TIN# 111392634', PAGE_W - MARGIN, PAGE_H - 70, { size: 8, color: rgb(0.8, 0.86, 0.95), align: 'right' });
  y = PAGE_H - 92;

  // ── Title row ──
  y -= 30;
  draw('ACCOUNT STATEMENT', MARGIN, y, { size: 18, f: bold, color: NAVY });
  // account status badge (right)
  const badge = A.account_status;
  const bw = bold.widthOfTextAtSize(badge, 11) + 22;
  page.drawRectangle({ x: PAGE_W - MARGIN - bw, y: y - 5, width: bw, height: 22, color: statusColor(badge) });
  draw(badge, PAGE_W - MARGIN - bw / 2, y + 1, { size: 11, f: bold, color: WHITE, align: 'center' });
  y -= 16;
  draw(`Statement date: ${fmtDate(input.statementDate)}`, MARGIN, y, { size: 9, color: GREY });
  draw(`Period: ${fmtDate(input.periodStart)} – ${fmtDate(input.periodEnd)}`, PAGE_W - MARGIN, y, { size: 9, color: GREY, align: 'right' });

  // ── Bill-to ──
  y -= 26;
  draw('BILL TO', MARGIN, y, { size: 8, f: bold, color: GREY });
  y -= 15;
  draw(customer.full_name || 'Customer', MARGIN, y, { size: 12, f: bold, color: NAVY });
  const contact = [customer.phone, customer.email, customer.address].filter(Boolean).join('   ·   ');
  if (contact) { y -= 13; draw(contact, MARGIN, y, { size: 9, color: GREY, max: CONTENT_W }); }

  // ── Invoices table ──
  y -= 26;
  const invCols = [
    { key: 'num', label: 'Invoice', x: MARGIN, w: 86, align: 'left' as const },
    { key: 'date', label: 'Date', x: MARGIN + 90, w: 64, align: 'left' as const },
    { key: 'due', label: 'Due', x: MARGIN + 156, w: 64, align: 'left' as const },
    { key: 'amt', label: 'Amount', x: MARGIN + 300, w: 60, align: 'right' as const },
    { key: 'paid', label: 'Paid', x: MARGIN + 372, w: 60, align: 'right' as const },
    { key: 'bal', label: 'Balance', x: MARGIN + 446, w: 60, align: 'right' as const },
  ];
  const tableHeader = (title: string) => {
    draw(title, MARGIN, y, { size: 10, f: bold, color: NAVY });
    y -= 16;
    page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 18, color: NAVY });
    for (const c of invCols) draw(c.label, c.align === 'right' ? c.x + c.w : c.x + 4, y, { size: 8, f: bold, color: WHITE, align: c.align });
    y -= 18;
  };
  tableHeader('INVOICES');
  if (A.invoices.length === 0) { draw('No invoices on file.', MARGIN + 4, y - 4, { size: 9, color: GREY }); y -= 18; }
  for (let i = 0; i < A.invoices.length; i++) {
    ensure(20);
    if (y === PAGE_H - MARGIN) tableHeader('INVOICES (cont.)');
    const inv = A.invoices[i];
    if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 16, color: rgb(0.96, 0.97, 0.99) });
    draw(inv.invoice_number || inv.id.slice(0, 8), invCols[0].x + 4, y, { size: 8, color: NAVY, max: invCols[0].w - 6 });
    draw(fmtDate(inv.invoice_date), invCols[1].x + 4, y, { size: 8, color: GREY });
    draw(fmtDate(inv.due_date), invCols[2].x + 4, y, { size: 8, color: GREY });
    // status pill under the due date
    draw(inv.status, invCols[2].x + 4, y - 9, { size: 6.5, f: bold, color: statusColor(inv.status) });
    draw(money(inv.amount_total), invCols[3].x + invCols[3].w, y, { size: 8, align: 'right', color: rgb(0.1, 0.12, 0.15) });
    draw(money(inv.allocated), invCols[4].x + invCols[4].w, y, { size: 8, align: 'right', color: GREEN });
    draw(money(inv.balance), invCols[5].x + invCols[5].w, y, { size: 8, f: bold, align: 'right', color: inv.balance > 0 ? NAVY : GREEN });
    y -= 18;
  }
  page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: MARGIN + CONTENT_W, y: y + 4 }, thickness: 1, color: LINE });

  // ── Payments received ──
  y -= 22;
  ensure(60);
  draw('PAYMENTS RECEIVED', MARGIN, y, { size: 10, f: bold, color: NAVY });
  y -= 16;
  page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 18, color: NAVY });
  draw('Date', MARGIN + 4, y, { size: 8, f: bold, color: WHITE });
  draw('Method', MARGIN + 120, y, { size: 8, f: bold, color: WHITE });
  draw('Reference', MARGIN + 250, y, { size: 8, f: bold, color: WHITE });
  draw('Amount', MARGIN + CONTENT_W, y, { size: 8, f: bold, color: WHITE, align: 'right' });
  y -= 18;
  if (A.payments.length === 0) { draw('No payments received in this period.', MARGIN + 4, y - 4, { size: 9, color: GREY }); y -= 18; }
  for (let i = 0; i < A.payments.length; i++) {
    ensure(18);
    const p = A.payments[i];
    if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 16, color: rgb(0.96, 0.97, 0.99) });
    draw(fmtDate(p.payment_date), MARGIN + 4, y, { size: 8, color: GREY });
    draw((p.payment_method || '—').replace(/_/g, ' '), MARGIN + 120, y, { size: 8, color: NAVY, max: 120 });
    draw(p.reference || '—', MARGIN + 250, y, { size: 8, color: GREY, max: 160 });
    draw(money(p.amount), MARGIN + CONTENT_W, y, { size: 8, f: bold, align: 'right', color: GREEN });
    y -= 16;
  }
  draw(`Total payments received: ${money(A.total_paid)}`, MARGIN + CONTENT_W, y - 2, { size: 9, f: bold, color: GREEN, align: 'right' });

  // ── Summary box ──
  y -= 30;
  ensure(96);
  const boxH = 90, boxX = MARGIN + CONTENT_W - 250;
  page.drawRectangle({ x: boxX, y: y - boxH + 14, width: 250, height: boxH, color: LIGHTBLUE, borderColor: LB_BORDER, borderWidth: 1 });
  const sumRow = (label: string, val: string, yy: number, opts: { big?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    draw(label, boxX + 12, yy, { size: opts.big ? 11 : 9, f: opts.big ? bold : font, color: opts.color ?? NAVY });
    draw(val, boxX + 238, yy, { size: opts.big ? 13 : 9, f: bold, color: opts.color ?? NAVY, align: 'right' });
  };
  let sy = y + 2;
  sumRow('Total invoiced', money(A.total_invoiced), sy); sy -= 16;
  sumRow('Total paid', money(A.total_paid), sy, { color: GREEN }); sy -= 16;
  sumRow('Credit limit', money(A.credit_limit), sy, { color: GREY }); sy -= 18;
  page.drawLine({ start: { x: boxX + 10, y: sy + 8 }, end: { x: boxX + 240, y: sy + 8 }, thickness: 1, color: LB_BORDER });
  sumRow('OUTSTANDING', money(A.total_outstanding), sy, { big: true, color: A.total_outstanding > 0 ? NAVY : GREEN });

  // ── Banking block (single source) ──
  y = Math.min(y - boxH + 6, y) - 6;
  ensure(110);
  draw(BANKING_TITLE, MARGIN, y, { size: 10, f: bold, color: NAVY });
  y -= 6;
  page.drawRectangle({ x: MARGIN, y: y - 78, width: 250, height: 78, color: rgb(0.97, 0.98, 0.99), borderColor: LINE, borderWidth: 1 });
  let by = y - 14;
  for (const { label, value } of bankingLines()) {
    draw(`${label}:`, MARGIN + 12, by, { size: 9, color: GREY });
    draw(value, MARGIN + 96, by, { size: 9, f: bold, color: NAVY });
    by -= 13;
  }

  // ── Payment instructions (next to banking) ──
  const insX = MARGIN + 270;
  draw('Payment Instructions', insX, y - 8, { size: 9, f: bold, color: NAVY });
  const instr = [
    'Please reference your invoice number(s) with',
    'every payment. Payments apply to the oldest',
    'unpaid invoice first. Settle DUE / OVERDUE',
    'balances promptly to keep your credit line open.',
  ];
  let iy = y - 24;
  for (const l of instr) { draw(l, insX, iy, { size: 8.5, color: GREY, max: CONTENT_W - 270 }); iy -= 12; }

  // ── Footer ──
  draw('Questions? WhatsApp / call 242-361-3474   ·   bscbahamas.com', PAGE_W / 2, MARGIN - 14, { size: 8, color: GREY, align: 'center' });

  return doc.save();
}
