// /api/pos/record-customer-purchase
//
// Bumps a returning customer's total_orders + total_spent + last_seen_at
// after a POS sale lands. Service-role so RLS on `customers` doesn't
// block cashier writes (Bill / Roselins / andros_staff were silently
// failing the previous client-side UPDATE).
//
// MUST be called AFTER orders.insert returns successfully — never
// before (would double-count if the INSERT then fails for some reason).
// Fire-and-forget at the client: a 5xx here should never block the sale.
//
// Body:
//   {
//     customer_id:      uuid (required),
//     order_total_bsd:  number (required, > 0),
//     phone_e164?:      string,   // opportunistic backfill on legacy rows
//     email?:           string,   // opportunistic backfill
//     email_consent?:   boolean,  // only flips ON when true; never OFF
//     consent_source?:  'nassau_pos' | 'andros_pos'
//   }
// Returns:
//   { ok: true,  customer_id, new_total_orders, new_total_spent }
//   { ok: false, error }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set([
  'cashier','andros_staff','manager',
  'founder','co_founder','control_admin','basic_admin',
]);

interface PurchaseBody {
  customer_id?:    unknown;
  order_total_bsd?: unknown;
  phone_e164?:     unknown;
  email?:          unknown;
  email_consent?:  unknown;
  consent_source?: unknown;
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  }

  // Verify the calling user + their role under their own session — same
  // pattern as /api/pos/save-customer for symmetry.
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot record customer purchases.` }, { status: 403 });
  }

  let body: PurchaseBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const customerId   = typeof body.customer_id === 'string' ? body.customer_id : '';
  const orderTotal   = typeof body.order_total_bsd === 'number' ? body.order_total_bsd : NaN;
  const phoneE164    = typeof body.phone_e164 === 'string' ? body.phone_e164.trim() : '';
  const emailRaw     = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const validEmail   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : '';
  const consent      = body.email_consent === true;
  const consentSrc   = (body.consent_source === 'andros_pos') ? 'andros_pos' : 'nassau_pos';

  if (!customerId) {
    return NextResponse.json({ ok: false, error: 'customer_id is required' }, { status: 400 });
  }
  if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
    return NextResponse.json({ ok: false, error: 'order_total_bsd must be a positive number' }, { status: 400 });
  }

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const nowIso = new Date().toISOString();

  // Read current totals so we can compute the increment. Race-condition
  // note: two simultaneous sales to the same customer could lose an
  // increment under read-modify-write. Same race existed in the previous
  // client-side code we're replacing — fix is a Postgres atomic-increment
  // RPC, flagged for post-launch hygiene.
  interface CurrentRow {
    total_orders: number | null;
    total_spent: number | null;
    email_marketing_consent: boolean | null;
    phone_e164: string | null;
    email: string | null;
  }
  const { data: current, error: readErr } = await admin
    .from('customers')
    .select('total_orders, total_spent, email_marketing_consent, phone_e164, email')
    .eq('id', customerId)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ ok: false, error: `Customer read failed: ${readErr.message}` }, { status: 400 });
  }
  if (!current) {
    return NextResponse.json({ ok: false, error: `Customer ${customerId.slice(0, 8)} not found` }, { status: 404 });
  }
  const cur = current as unknown as CurrentRow;

  const newTotalOrders = (cur.total_orders ?? 0) + 1;
  const newTotalSpent  = Number(cur.total_spent ?? 0) + orderTotal;

  const updates: Record<string, unknown> = {
    total_orders: newTotalOrders,
    total_spent:  newTotalSpent,
    last_seen_at: nowIso,
  };
  // Opportunistic backfill on legacy rows — only fills, never overwrites
  // existing values with empties.
  if (phoneE164  && !cur.phone_e164) updates.phone_e164 = phoneE164;
  if (validEmail && !cur.email)      updates.email      = validEmail;
  // Consent: ONLY flip ON, never silently OFF. Cashier could have left
  // the checkbox unchecked by oversight.
  if (consent && validEmail && !cur.email_marketing_consent) {
    updates.email_marketing_consent = true;
    updates.email_consent_at        = nowIso;
    updates.email_consent_source    = consentSrc;
  }

  const { error: updErr } = await admin
    .from('customers')
    .update(updates)
    .eq('id', customerId);
  if (updErr) {
    return NextResponse.json({ ok: false, error: `Customer update failed: ${updErr.message}` }, { status: 400 });
  }

  // Audit row → ai_writes (Founder AI's existing write-log pipeline).
  // Best-effort; don't fail the response if the audit insert errors.
  try {
    await admin.from('ai_writes').insert({
      tool:       'pos_record_customer_purchase',
      caller_id:  user.id,
      input:      { customer_id: customerId, order_total_bsd: orderTotal, phone_e164: phoneE164 || null, email: validEmail || null, consent, consent_source: consentSrc },
      result:     { new_total_orders: newTotalOrders, new_total_spent: newTotalSpent, role },
      status:     'success',
      error:      null,
    });
  } catch (err) {
    console.warn('ai_writes audit insert failed (non-fatal):', err);
  }

  return NextResponse.json({
    ok:                true,
    customer_id:       customerId,
    new_total_orders:  newTotalOrders,
    new_total_spent:   newTotalSpent,
  });
}
