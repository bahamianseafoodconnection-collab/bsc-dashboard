// /api/pos/receipt
//
// Auto-send the POS receipt at checkout completion. Channel decision
// is server-side based on what the customer gave us:
//
//   1. Customer has email on file → branded HTML email via Resend
//   2. No email but has phone     → text SMS via Twilio
//   3. Neither                    → return { channel: 'print' }
//                                   (POS falls back to the print receipt
//                                    window opened locally)
//
// Body:
//   {
//     order_id:          string,
//     customer_email?:   string,    // explicit email or pulled from customers row
//     customer_phone?:   string,
//     customer_name?:    string,
//     channel_label?:    string,    // e.g. "BSC Marketplace Nassau"
//     subtotal:          number,
//     vat:               number,
//     total:             number,
//     items:             Array<{ name: string; qty: number; unit_price: number }>,
//     cashier_name?:     string,
//     customer_id?:      string,    // if provided, we'll auto-fetch email/phone from customers
//   }
//
// Returns: { ok, channel: 'email'|'sms'|'print', id?, error? }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/twilio';
import { toE164 } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set([
  'cashier','andros_staff','manager',
  'founder','co_founder','control_admin','basic_admin',
]);

function dollars(n: number): string {
  return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

interface ReceiptItem { name: string; qty: number; unit_price: number; }
interface ReceiptInput {
  order_id?:       unknown;
  customer_email?: unknown;
  customer_phone?: unknown;
  customer_name?:  unknown;
  customer_id?:    unknown;
  channel_label?:  unknown;
  subtotal?:       unknown;
  vat?:            unknown;
  total?:          unknown;
  items?:          unknown;
  cashier_name?:   unknown;
}

function renderEmailHtml(p: {
  customerName: string; channelLabel: string; items: ReceiptItem[];
  subtotal: number; vat: number; total: number; orderId: string | null;
  cashierName: string;
}): string {
  const rows = p.items.map(it => `
    <tr style="border-bottom:1px solid #e7e7e7;">
      <td style="padding:8px 10px;font-size:13px;color:#1a2e5a;">${it.name}${it.qty !== 1 ? ` <span style="color:#94a3b8;">× ${it.qty}</span>` : ''}</td>
      <td style="padding:8px 10px;text-align:right;font-size:13px;color:#1a2e5a;font-weight:700;">${dollars(it.unit_price * it.qty)}</td>
    </tr>`).join('');
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f2ee;font-family:Georgia,serif;color:#0F1111;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td>
    <table width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="background:#fff;margin:24px auto;border-radius:12px;overflow:hidden;border:1px solid #e7e7e7">
      <tr><td style="background:#060d1f;color:#f5c518;padding:18px 24px;font-weight:bold;font-size:13px;letter-spacing:3px;text-transform:uppercase">
        Bahamian Seafood Connection · ${p.channelLabel}
      </td></tr>
      <tr><td style="padding:24px 24px 8px;">
        <h1 style="margin:0 0 6px 0;font-size:20px;color:#0F1111;font-weight:600;">Thank you${p.customerName ? `, ${p.customerName}` : ''}!</h1>
        <p style="font-size:13px;color:#475569;margin:0 0 16px;">Your receipt is below. ${new Date().toLocaleString()}</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e7e7e7;border-radius:6px;overflow:hidden;">
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="background:#f8fafc;">
              <td style="padding:8px 10px;font-size:12px;color:#475569;">Subtotal</td>
              <td style="padding:8px 10px;text-align:right;font-size:12px;color:#1a2e5a;font-weight:700;">${dollars(p.subtotal)}</td>
            </tr>
            ${p.vat > 0 ? `
            <tr style="background:#f8fafc;">
              <td style="padding:8px 10px;font-size:12px;color:#475569;">VAT</td>
              <td style="padding:8px 10px;text-align:right;font-size:12px;color:#1a2e5a;font-weight:700;">${dollars(p.vat)}</td>
            </tr>` : ''}
            <tr style="background:#0F1111;color:#f5c518;">
              <td style="padding:10px;font-size:14px;font-weight:800;">Total</td>
              <td style="padding:10px;text-align:right;font-size:16px;font-weight:900;">${dollars(p.total)}</td>
            </tr>
          </tfoot>
        </table>
      </td></tr>
      <tr><td style="padding:14px 24px 22px;">
        ${p.orderId ? `<p style="font-size:11px;color:#94a3b8;margin:0 0 6px;">Order ${p.orderId.slice(0, 8)} · Trace any item at <a href="https://bscbahamas.com/trace" style="color:#1a2e5a;">bscbahamas.com/trace</a></p>` : ''}
        ${p.cashierName ? `<p style="font-size:11px;color:#94a3b8;margin:0;">Served by: ${p.cashierName}</p>` : ''}
      </td></tr>
      <tr><td style="background:#f7f8f8;padding:16px 24px;font-size:11px;color:#565959;text-align:center;line-height:1.7">
        Bahamian Seafood Connection · Firetrail Road, Nassau · +1 242 361-3474<br>
        bscbahamas.com
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function renderSmsText(p: {
  customerName: string; channelLabel: string; items: ReceiptItem[];
  subtotal: number; vat: number; total: number; orderId: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`🇧🇸 BSC · ${p.channelLabel}`);
  if (p.customerName) lines.push(`Hi ${p.customerName}, thanks!`);
  for (const it of p.items.slice(0, 8)) {
    const qty = it.qty === 1 ? '' : ` x${it.qty}`;
    lines.push(`• ${it.name}${qty} ${dollars(it.unit_price * it.qty)}`);
  }
  if (p.items.length > 8) lines.push(`+ ${p.items.length - 8} more items`);
  if (p.vat > 0) lines.push(`Sub ${dollars(p.subtotal)} · VAT ${dollars(p.vat)}`);
  lines.push(`Total: ${dollars(p.total)}`);
  if (p.orderId) lines.push(`Order ${p.orderId.slice(0, 8)} · bscbahamas.com/trace`);
  return lines.join('\n');
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });

  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot send receipts.` }, { status: 403 });

  let body: ReceiptInput;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const orderId      = typeof body.order_id === 'string' ? body.order_id : null;
  const customerId   = typeof body.customer_id === 'string' ? body.customer_id : null;
  const customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
  const channelLabel = typeof body.channel_label === 'string' ? body.channel_label : 'BSC';
  const subtotal     = typeof body.subtotal === 'number' ? body.subtotal : 0;
  const vat          = typeof body.vat === 'number' ? body.vat : 0;
  const total        = typeof body.total === 'number' ? body.total : 0;
  const cashierName  = typeof body.cashier_name === 'string' ? body.cashier_name.trim() : '';
  const itemsRaw     = Array.isArray(body.items) ? body.items : [];
  const items: ReceiptItem[] = itemsRaw.filter((i): i is ReceiptItem =>
    !!i && typeof i === 'object'
    && typeof (i as { name?: unknown }).name === 'string'
    && typeof (i as { qty?: unknown }).qty === 'number'
    && typeof (i as { unit_price?: unknown }).unit_price === 'number',
  );

  if (total <= 0 || items.length === 0) {
    return NextResponse.json({ ok: false, error: 'total + items required' }, { status: 400 });
  }

  // Resolve recipient contact info.
  let email = typeof body.customer_email === 'string' ? body.customer_email.trim() : '';
  let phone = typeof body.customer_phone === 'string' ? body.customer_phone.trim() : '';
  // If only a customer_id was given, look up email + phone via service_role.
  if (customerId && (!email || !phone)) {
    const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: cust } = await admin
      .from('customers')
      .select('email, phone_e164, phone')
      .eq('id', customerId)
      .maybeSingle();
    if (cust) {
      if (!email && typeof (cust as { email?: string }).email === 'string') email = (cust as { email: string }).email;
      if (!phone) phone = (cust as { phone_e164?: string }).phone_e164 ?? (cust as { phone?: string }).phone ?? '';
    }
  }

  // Decision: email > sms > print.
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  const e164 = toE164(phone);

  if (validEmail) {
    const html = renderEmailHtml({ customerName, channelLabel, items, subtotal, vat, total, orderId, cashierName });
    const subject = `BSC receipt · ${channelLabel} · ${dollars(total)} · ${new Date().toLocaleDateString()}`;
    const r = await sendEmail({ to: validEmail, subject, html });
    if (r.error) {
      // Email failed — try SMS fallback if we have a phone.
      if (e164) {
        const smsR = await sendSMS({ to: e164, body: renderSmsText({ customerName, channelLabel, items, subtotal, vat, total, orderId }) });
        if (smsR.ok) return NextResponse.json({ ok: true, channel: 'sms', id: smsR.sid, note: `Email failed (${r.error}), SMS sent.` });
        return NextResponse.json({ ok: false, channel: 'print', error: `Email and SMS both failed: ${r.error} / ${smsR.error}` }, { status: 502 });
      }
      return NextResponse.json({ ok: false, channel: 'print', error: `Email failed: ${r.error}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, channel: 'email', id: r.id, to: validEmail });
  }

  if (e164) {
    const r = await sendSMS({ to: e164, body: renderSmsText({ customerName, channelLabel, items, subtotal, vat, total, orderId }) });
    if (!r.ok) return NextResponse.json({ ok: false, channel: 'print', error: `SMS failed: ${r.error}` }, { status: 502 });
    return NextResponse.json({ ok: true, channel: 'sms', id: r.sid, to: e164 });
  }

  // No contact on file → print receipt.
  return NextResponse.json({ ok: true, channel: 'print', note: 'No email or phone on file — open the print receipt locally.' });
}
