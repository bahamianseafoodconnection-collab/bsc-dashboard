// Transactional email templates for BSC Marketplace.
//
// Wraps every template in buildBlastHtml() (lib/email.ts) so the BSC navy
// header / yellow CTA / unsubscribe footer is consistent across marketing
// + transactional. The customer_id passed through controls the unsubscribe
// URL — if you pass it, the email gets an unsubscribe link (recommended for
// CAN-SPAM compliance even on transactional emails).
//
// To add a new template:
//   1. Add a function below that returns { subject, headline, body_html }
//   2. Call sendEmail({ to, subject, html: buildBlastHtml({ headline,
//      body_html, customer_id }) }) at the trigger point in your route.

import { buildBlastHtml, sendEmail } from './email';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function money(n: number | null | undefined): string {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

// ─── Order confirmation ─────────────────────────────────────────────
export interface OrderConfirmationParams {
  to:             string;            // customer email
  customer_id?:   string;            // for one-click unsubscribe
  customer_name:  string;
  order_id:       string;
  items:          Array<{ name?: string; quantity?: number; unit_price?: number; line_total?: number }>;
  subtotal:       number;
  delivery_fee:   number;
  total:          number;
  delivery_type?: string | null;
  payment_method?: string | null;
}

export async function sendOrderConfirmation(p: OrderConfirmationParams): Promise<{ id?: string; error?: string }> {
  const subject  = `Order confirmed · #${p.order_id.slice(0, 8).toUpperCase()}`;
  const headline = `Thanks for your order, ${p.customer_name.split(' ')[0] || 'friend'}.`;

  const itemRows = (p.items || []).map((it) => {
    const qty   = Number(it.quantity ?? 0);
    const price = Number(it.unit_price ?? 0);
    const line  = Number(it.line_total ?? price * qty);
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#0F1111">${escapeHtml(it.name ?? 'Item')}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#565959;text-align:right">${qty}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#0F1111;text-align:right;font-weight:bold">${money(line)}</td>
    </tr>`;
  }).join('');

  const deliveryLine = p.delivery_type
    ? `<p style="margin:6px 0;font-size:13px;color:#565959">Delivery: <strong style="color:#0F1111">${escapeHtml(p.delivery_type)}</strong></p>`
    : '';
  const paymentLine = p.payment_method
    ? `<p style="margin:6px 0;font-size:13px;color:#565959">Payment: <strong style="color:#0F1111">${escapeHtml(p.payment_method)}</strong></p>`
    : '';

  const body_html = `
    <p>We received your order and our team is preparing it now. You'll get another email the moment it ships out for delivery or is ready for pickup.</p>

    <p style="margin-top:18px;font-size:13px;color:#565959">Order ID: <span style="font-family:monospace;color:#0F1111">${escapeHtml(p.order_id)}</span></p>
    ${deliveryLine}
    ${paymentLine}

    <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:14px">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 0;border-bottom:2px solid #0F1111;color:#0F1111;font-size:12px;text-transform:uppercase;letter-spacing:1px">Item</th>
          <th style="text-align:right;padding:6px 0;border-bottom:2px solid #0F1111;color:#0F1111;font-size:12px;text-transform:uppercase;letter-spacing:1px">Qty</th>
          <th style="text-align:right;padding:6px 0;border-bottom:2px solid #0F1111;color:#0F1111;font-size:12px;text-transform:uppercase;letter-spacing:1px">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <table style="width:100%;margin-top:14px;font-size:14px">
      <tr><td style="color:#565959">Subtotal</td><td style="text-align:right">${money(p.subtotal)}</td></tr>
      ${p.delivery_fee > 0 ? `<tr><td style="color:#565959">Delivery</td><td style="text-align:right">${money(p.delivery_fee)}</td></tr>` : ''}
      <tr><td style="padding-top:10px;font-weight:bold;font-size:16px;color:#0F1111">Total (BSD)</td>
          <td style="padding-top:10px;text-align:right;font-weight:bold;font-size:16px;color:#0F1111">${money(p.total)}</td></tr>
    </table>

    <p style="margin-top:24px;font-size:13px;color:#565959">Need help? WhatsApp <a href="https://wa.me/12423613474" style="color:#007185">+1 (242) 361-3474</a> or call <a href="tel:+12425584495" style="color:#007185">+1 (242) 558-4495</a>.</p>
  `;

  return sendEmail({
    to:      p.to,
    subject,
    html:    buildBlastHtml({ headline, body_html, customer_id: p.customer_id }),
  });
}

// ─── Order status update ────────────────────────────────────────────
export interface OrderStatusParams {
  to:            string;
  customer_id?:  string;
  customer_name: string;
  order_id:      string;
  new_status:    string;
  message?:      string;
}

export async function sendOrderStatusUpdate(p: OrderStatusParams): Promise<{ id?: string; error?: string }> {
  const niceStatus = {
    processing: '🔧 Processing',
    ready:      '🏪 Ready for pickup',
    shipped:    '🚚 Out for delivery',
    delivered:  '✅ Delivered',
    cancelled:  '❌ Cancelled',
  }[p.new_status.toLowerCase()] ?? p.new_status;

  const subject  = `Order #${p.order_id.slice(0, 8).toUpperCase()} · ${niceStatus}`;
  const headline = `Update on your order, ${p.customer_name.split(' ')[0] || 'friend'}.`;
  const body_html = `
    <p>Your BSC order is now <strong style="color:#0F1111">${escapeHtml(niceStatus)}</strong>.</p>
    ${p.message ? `<p style="margin-top:12px;color:#1c1c1c">${escapeHtml(p.message)}</p>` : ''}
    <p style="margin-top:18px;font-size:13px;color:#565959">Order ID: <span style="font-family:monospace;color:#0F1111">${escapeHtml(p.order_id)}</span></p>
    <p style="margin-top:18px;font-size:13px;color:#565959">Track all orders at <a href="https://bscbahamas.com/my-orders" style="color:#007185">bscbahamas.com/my-orders</a>.</p>
  `;

  return sendEmail({
    to:      p.to,
    subject,
    html:    buildBlastHtml({ headline, body_html, customer_id: p.customer_id }),
  });
}

// ─── Welcome email (after signup) ───────────────────────────────────
export interface WelcomeEmailParams {
  to:            string;
  customer_id?:  string;
  customer_name: string;
}

export async function sendWelcomeEmail(p: WelcomeEmailParams): Promise<{ id?: string; error?: string }> {
  const first = p.customer_name.split(' ')[0] || 'friend';
  const subject  = 'Welcome to BSC Marketplace 🦞';
  const headline = `Welcome to BSC, ${first}.`;
  const body_html = `
    <p>You're in. Your account at bscbahamas.com is ready.</p>
    <p style="margin-top:14px">Fresh Bahamian seafood, Nassau's wholesale brands, vehicles, bill payments — all delivered to your door across the Bahamas.</p>
    <p style="margin-top:14px"><strong style="color:#0F1111">What's next:</strong></p>
    <ul style="margin:6px 0 0 0;padding-left:18px;color:#1c1c1c">
      <li>Browse the marketplace</li>
      <li>Save your delivery addresses for one-tap checkout</li>
      <li>Reply to this email if you ever need help</li>
    </ul>
    <p style="margin-top:18px;font-size:13px;color:#565959">Need help? WhatsApp <a href="https://wa.me/12423613474" style="color:#007185">+1 (242) 361-3474</a>.</p>
  `;

  return sendEmail({
    to:      p.to,
    subject,
    html:    buildBlastHtml({ headline, body_html, customer_id: p.customer_id }),
  });
}
