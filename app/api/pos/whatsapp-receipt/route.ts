// /api/pos/whatsapp-receipt
//
// Send a customer-facing WhatsApp receipt after a POS sale. Transactional
// (the customer just bought from us, so freeform within Twilio's 24-hour
// session window is allowed). Falls back to SMS if WhatsApp send fails.
//
// Body:
//   {
//     order_id:     string,   // optional — used to build a /trace link
//     customer_phone: string,
//     customer_name?: string,
//     channel_label: string,  // "BSC Marketplace Nassau" | "Ceta's Andros" | "Online"
//     subtotal: number,
//     vat:      number,
//     total:    number,
//     items: Array<{ name: string; qty: number; unit_price: number }>,
//     cashier_name?: string,
//   }
//
// Returns: { ok, channel: 'whatsapp'|'sms', sid?, error? }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppOrSMS } from '@/lib/twilio';
import { toE164 } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  order_id?:        unknown;
  customer_phone?:  unknown;
  customer_name?:   unknown;
  channel_label?:   unknown;
  subtotal?:        unknown;
  vat?:             unknown;
  total?:           unknown;
  items?:           unknown;
  cashier_name?:    unknown;
}

const ALLOWED_ROLES = new Set([
  'cashier','andros_staff','manager',
  'founder','co_founder','control_admin','basic_admin',
]);

function dollars(n: number): string {
  return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

export async function POST(req: NextRequest) {
  const supaUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !anonKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  }
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });

  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot send receipts.` }, { status: 403 });
  }

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const rawPhone = typeof body.customer_phone === 'string' ? body.customer_phone : '';
  const phone = toE164(rawPhone);
  if (!phone) return NextResponse.json({ ok: false, error: 'Invalid customer phone' }, { status: 400 });

  const orderId       = typeof body.order_id === 'string' ? body.order_id : null;
  const customerName  = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
  const channelLabel  = typeof body.channel_label === 'string' ? body.channel_label : 'BSC';
  const subtotal      = typeof body.subtotal === 'number' ? body.subtotal : 0;
  const vat           = typeof body.vat === 'number' ? body.vat : 0;
  const total         = typeof body.total === 'number' ? body.total : 0;
  const cashierName   = typeof body.cashier_name === 'string' ? body.cashier_name.trim() : '';
  const items         = Array.isArray(body.items) ? body.items.filter((i): i is { name: string; qty: number; unit_price: number } =>
    !!i && typeof i === 'object'
    && typeof (i as { name?: unknown }).name === 'string'
    && typeof (i as { qty?: unknown }).qty === 'number'
    && typeof (i as { unit_price?: unknown }).unit_price === 'number',
  ) : [];

  if (total <= 0 || items.length === 0) {
    return NextResponse.json({ ok: false, error: 'total + at least 1 item required' }, { status: 400 });
  }

  // Build the message. Keep it short — WhatsApp truncates at 1600 chars.
  // Include the trace link if we have an order id so customers can re-open.
  const lines: string[] = [];
  lines.push(`🇧🇸 *Bahamian Seafood Connection*`);
  lines.push(`${channelLabel} · ${new Date().toLocaleString()}`);
  lines.push('');
  if (customerName) lines.push(`Hi ${customerName} — thanks for shopping with us today!`);
  else              lines.push(`Thanks for shopping with us today!`);
  lines.push('');
  lines.push('*Your receipt:*');
  for (const it of items) {
    const qty = it.qty === 1 ? '' : ` × ${it.qty}`;
    lines.push(`• ${it.name}${qty} — ${dollars(it.unit_price * it.qty)}`);
  }
  lines.push('');
  lines.push(`Subtotal: ${dollars(subtotal)}`);
  // VAT line REMOVED — disabled until BSC is approved to charge VAT.
  lines.push(`*Total: ${dollars(total)}*`);
  lines.push('');
  if (orderId) {
    lines.push(`Order: ${orderId.slice(0, 8)}`);
    lines.push(`Trace any item: https://bscbahamas.com/trace`);
  }
  if (cashierName) lines.push(`Served by: ${cashierName}`);
  lines.push('');
  lines.push(`bscbahamas.com · +1 242 361-3474`);

  const text = lines.join('\n');

  const result = await sendWhatsAppOrSMS({ to: phone, body: text });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
