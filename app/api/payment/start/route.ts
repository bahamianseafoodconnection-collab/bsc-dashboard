// /api/payment/start
//
// Entry point for the online card payment flow. Called by /checkout
// AFTER the customer has confirmed their cart and chosen "Pay with
// Card". This route:
//
//   1. Authenticates the customer (bearer token).
//   2. Verifies the referenced order exists, belongs to them, and is in
//      a pending state.
//   3. Maps the order into Smart Screens v2 item-cart lines (the demobahami
//      screen is item-cart driven — see lib/plugnpay).
//   4. Calls lib/plugnpay/buildSubmission() to assemble the form fields.
//   5. Logs a pending row to payment_transactions (attempt audit).
//   6. Returns { action, fields, attempt_id } to the client, which then
//      renders an auto-submit <form method="POST" action={action}> so
//      the browser navigates to pay1.plugnpay.com. PAN never touches us.
//
// PCI scope: SAQ-A. No card data flows through this route — ever.
//
// Returns 503 if PNP env vars are not set (Vercel mis-config detector).
// Returns 4xx for auth / order-state issues with safe error messages.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildSubmission, isPnpConfigured, type SubmissionLineItem } from '@/lib/plugnpay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StartBody {
  order_id?: unknown;
}

interface OrderRow {
  id:              string;
  customer_id:     string | null;
  total:           number | null;
  subtotal:        number | null;
  vat_amount:      number | null;
  currency?:       string | null;
  payment_status:  string | null;
  customer_email:  string | null;
  items?:          unknown;
  wholesale_items?: unknown;
}

/**
 * Maps an order into Smart Screens v2 item-cart lines that sum EXACTLY to
 * order.total. Delivery/fees become their own reconciliation line. If the
 * per-line prices can't be trusted (missing/!finite) or imply a discount
 * (line-sum > total), we fall back to a single consolidated line for the
 * whole order so the charge always equals the authoritative total.
 */
function toLineItems(order: OrderRow): SubmissionLineItem[] {
  const totalCents = Math.round(Number(order.total) * 100);
  const raw: Record<string, unknown>[] =
    Array.isArray(order.items) && order.items.length > 0
      ? (order.items as Record<string, unknown>[])
      : Array.isArray(order.wholesale_items)
        ? (order.wholesale_items as Record<string, unknown>[])
        : [];

  const lines: SubmissionLineItem[] = [];
  let sumCents = 0;
  let ok = raw.length > 0;

  for (let i = 0; i < raw.length && ok; i++) {
    const it   = raw[i] ?? {};
    const qty  = Math.trunc(Number(it.quantity ?? it.qty ?? 1));
    const unit = Number(it.unit_price ?? it.price ?? NaN);
    if (!Number.isFinite(qty) || qty < 1 || !Number.isFinite(unit) || unit < 0) { ok = false; break; }
    const unitCents = Math.round(unit * 100);
    sumCents += unitCents * qty;
    lines.push({
      identifier:  String(it.sku ?? it.id ?? i + 1),
      description: String(it.name ?? it.description ?? `Item ${i + 1}`),
      unitCost:    (unitCents / 100).toFixed(2),
      quantity:    qty,
    });
  }

  if (ok) {
    const diff = totalCents - sumCents;
    if (diff > 0) {
      // Delivery / handling / anything not itemized → one reconciliation line.
      lines.push({ identifier: 'DELIVERY', description: 'Delivery & handling', unitCost: (diff / 100).toFixed(2), quantity: 1 });
    } else if (diff < 0) {
      ok = false; // lines exceed total (discount/mismatch) → consolidated fallback
    }
  }

  if (!ok) {
    return [{
      identifier:  'ORDER',
      description: `BSC Marketplace order ${order.id.slice(0, 8)}`,
      unitCost:    (totalCents / 100).toFixed(2),
      quantity:    1,
    }];
  }
  return lines;
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  // Plug'n Pay env-gate. Friendly error tells the founder which env var
  // is missing — no card flow until ALL three are set.
  if (!isPnpConfigured()) {
    return NextResponse.json({
      ok:    false,
      error: 'Card payments are not yet configured. Please choose Cash on Delivery, or contact BSC support.',
      detail: 'Missing one or more of: PNP_GATEWAY_ACCOUNT, PNP_PUBLISHER_PASSWORD, PNP_VERIFICATION_HASH_SECRET',
    }, { status: 503 });
  }

  // Auth — must be a signed-in customer (or founder/staff testing).
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required to pay by card.' }, { status: 401 });
  }
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'Invalid session — please sign in again.' }, { status: 401 });
  }

  let body: StartBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const orderId = typeof body.order_id === 'string' ? body.order_id : '';
  if (!orderId) {
    return NextResponse.json({ ok: false, error: 'order_id is required' }, { status: 400 });
  }

  // Service-role client for trusted reads + the audit insert.
  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Verify order exists + ownership + pending state.
  // NOTE: select('*') — NOT an explicit column list. orders has no
  // customer_email (and currency may be absent); naming a missing column
  // errors the whole query, which surfaced to customers as the misleading
  // "Order not found" at card-payment start. '*' is robust to schema drift;
  // optional fields just read back undefined and are handled below.
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle<OrderRow>();
  if (orderErr || !order) {
    return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
  }

  // Ownership: order's customer must match this user, OR the user must
  // be founder/co_founder (so we can run staff test transactions on
  // arbitrary orders).
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  const isStaff = role === 'founder' || role === 'co_founder';
  if (!isStaff) {
    const { data: ownerLookup } = await admin
      .from('customers').select('id').eq('id', order.customer_id ?? '').eq('auth_user_id', user.id).maybeSingle();
    if (!ownerLookup) {
      return NextResponse.json({ ok: false, error: 'You do not own this order.' }, { status: 403 });
    }
  }

  // State check — only payment_pending / pending / (null = draft) can
  // be paid via this route. Already-paid orders can't be re-paid.
  const status = (order.payment_status ?? '').toLowerCase();
  if (status === 'paid') {
    return NextResponse.json({ ok: false, error: 'This order is already paid.' }, { status: 409 });
  }
  if (status && status !== 'pending' && status !== 'payment_pending' && status !== 'declined') {
    return NextResponse.json({ ok: false, error: `Order is in state "${order.payment_status}" — cannot pay.` }, { status: 409 });
  }

  // Amount sanity — never POST a zero or negative total to PnP.
  const totalNum = typeof order.total === 'number' ? order.total : 0;
  if (totalNum <= 0) {
    return NextResponse.json({ ok: false, error: 'Order total must be greater than zero.' }, { status: 400 });
  }

  // Build the Smart Screens v2 form data. Return URLs are absolute —
  // PnP requires fully-qualified domain names. Item lines are mapped from
  // the order and asserted to sum to the authoritative total inside
  // buildSubmission (money-integrity guard).
  const origin = req.headers.get('origin')
              ?? req.nextUrl.origin
              ?? 'https://bscbahamas.com';

  let submission: { action: string; fields: Record<string, string>; total: string };
  try {
    submission = buildSubmission({
      clientOrderId:  order.id,
      items:          toLineItems(order),
      expectedTotal:  totalNum.toFixed(2),
      currency:       order.currency || 'BSD',
      customerEmail:  order.customer_email ?? user.email ?? undefined,
      successUrl:     `${origin}/api/payment/return/success`,
    });
  } catch (err) {
    // A throw here means the cart couldn't be reconciled to the order total
    // (or env missing). Don't POST a mismatched charge — surface safely.
    return NextResponse.json({
      ok: false,
      error: 'Could not prepare the card payment for this order. Please contact BSC support or choose Cash on Delivery.',
      detail: err instanceof Error ? err.message : 'submission build failed',
    }, { status: 500 });
  }

  // Mark the order as payment_pending (idempotent — safe to re-call).
  await admin.from('orders').update({ payment_status: 'payment_pending', payment_method: 'card' }).eq('id', order.id);

  // Insert pending payment_transactions row — finalized when PnP returns.
  const { data: attempt, error: attemptErr } = await admin
    .from('payment_transactions')
    .insert({
      order_id:              order.id,
      customer_id:           order.customer_id,
      pt_gateway_account:    submission.fields.pt_gateway_account,
      pt_transaction_amount: Number(submission.total),
      pt_currency:           submission.fields.pt_currency,
      pt_client_orderid:     order.id,
      raw_submission:        submission.fields,
      client_ip:             req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip'),
      user_agent:            req.headers.get('user-agent'),
      created_by:            user.id,
    })
    .select('id')
    .single();
  if (attemptErr) {
    return NextResponse.json({ ok: false, error: `Could not log payment attempt: ${attemptErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok:         true,
    action:     submission.action,
    fields:     submission.fields,
    attempt_id: (attempt as { id: string }).id,
  });
}
