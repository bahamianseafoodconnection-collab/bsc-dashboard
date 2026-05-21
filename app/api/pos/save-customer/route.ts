// /api/pos/save-customer
//
// Explicit "save customer" action from the POS customer-entry box.
// Cashier can capture a customer's contact info BEFORE ringing up a
// sale (or even if they don't buy today) so history-tracking is
// preserved. Server-side via service_role so RLS on `customers` doesn't
// block cashier writes.
//
// Lookup precedence:
//   1. By phone_e164 (canonical Bahamas phone unification per BSC rule)
//   2. By email (case-insensitive) if phone gives no match
//
// On match → UPDATE last_seen_at + best-effort name/email update.
// No match → INSERT new customer with origin_channel='nassau_pos' (or
//            'andros_pos' when called from there).
//
// Every save also writes to ai_writes so Founder AI's audit pipeline +
// daily briefing can count + summarize.
//
// Body: { name?, phone?, email?, origin_channel?, email_consent?, notes? }
// Returns: { ok, customer_id, full_name, total_orders, total_spent, was_new, action: 'created'|'updated' }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { toE164 } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set([
  'cashier','andros_staff','manager',
  'founder','co_founder','control_admin','basic_admin',
]);

interface SaveBody {
  name?:           unknown;
  phone?:          unknown;
  email?:          unknown;
  origin_channel?: unknown;
  email_consent?:  unknown;
  notes?:          unknown;
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

  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot save customers.` }, { status: 403 });
  }

  let body: SaveBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const nameClean   = typeof body.name === 'string' ? body.name.trim() : '';
  const phoneRaw    = typeof body.phone === 'string' ? body.phone.trim() : '';
  const emailRaw    = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const validEmail  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : '';
  const phoneE164   = toE164(phoneRaw);
  const origin      = (body.origin_channel === 'andros_pos') ? 'andros_pos' : 'nassau_pos';
  const consent     = body.email_consent === true;
  const notes       = typeof body.notes === 'string' ? body.notes.trim() : null;

  if (!phoneE164 && !validEmail) {
    return NextResponse.json({ ok: false, error: 'Provide at least a phone OR an email to save the customer.' }, { status: 400 });
  }
  if (!nameClean) {
    return NextResponse.json({ ok: false, error: 'Customer name required.' }, { status: 400 });
  }

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const nowIso = new Date().toISOString();

  interface CustomerLookup {
    id: string;
    full_name: string | null;
    total_orders: number | null;
    total_spent: number | null;
    email_marketing_consent: boolean | null;
  }

  // 1. Lookup by phone_e164.
  let existing: CustomerLookup | null = null;
  if (phoneE164) {
    const { data } = await admin
      .from('customers')
      .select('id, full_name, total_orders, total_spent, email_marketing_consent')
      .eq('phone_e164', phoneE164)
      .maybeSingle();
    if (data) existing = data as unknown as CustomerLookup;
  }
  // 2. Fallback: lookup by email.
  if (!existing && validEmail) {
    const { data } = await admin
      .from('customers')
      .select('id, full_name, total_orders, total_spent, email_marketing_consent')
      .ilike('email', validEmail)
      .maybeSingle();
    if (data) existing = data as unknown as CustomerLookup;
  }

  let customerId: string;
  let action: 'created' | 'updated';
  let wasNew = false;

  if (existing) {
    customerId = existing.id;
    action = 'updated';
    const updates: Record<string, unknown> = { last_seen_at: nowIso };
    if (nameClean && nameClean !== existing.full_name) updates.full_name = nameClean;
    if (validEmail) {
      updates.email = validEmail;
      // Only flip consent ON, never silently OFF.
      if (consent && !existing.email_marketing_consent) {
        updates.email_marketing_consent = true;
        updates.email_consent_source    = origin;
        updates.email_consent_at        = nowIso;
      }
    }
    if (notes) updates.notes = notes;
    const { error } = await admin.from('customers').update(updates).eq('id', customerId);
    if (error) return NextResponse.json({ ok: false, error: `Customer update failed: ${error.message}` }, { status: 400 });
  } else {
    action = 'created';
    wasNew = true;
    const insertRow: Record<string, unknown> = {
      full_name:       nameClean,
      phone:           phoneRaw || null,
      phone_e164:      phoneE164,
      email:           validEmail || null,
      first_seen_at:   nowIso,
      last_seen_at:    nowIso,
      total_orders:    0,
      total_spent:     0,
      origin_channel:  origin,
      source:          origin,                 // legacy column
      created_by:      user.id,
    };
    if (validEmail && consent) {
      insertRow.email_marketing_consent = true;
      insertRow.email_consent_source    = origin;
      insertRow.email_consent_at        = nowIso;
    }
    if (notes) insertRow.notes = notes;
    const { data: ins, error } = await admin
      .from('customers')
      .insert(insertRow)
      .select('id')
      .single();
    if (error || !ins) return NextResponse.json({ ok: false, error: `Customer insert failed: ${error?.message ?? 'no row'}` }, { status: 400 });
    customerId = ins.id;
  }

  // Audit row → ai_writes (Founder AI's existing write-log pipeline).
  // Best-effort: don't fail the save if the audit insert errors.
  try {
    await admin.from('ai_writes').insert({
      tool:       'pos_save_customer',
      caller_id:  user.id,
      input:      { name: nameClean, phone: phoneRaw || null, email: validEmail || null, origin, consent, notes },
      result:     { customer_id: customerId, action, was_new: wasNew, role },
      status:     'success',
      error:      null,
    });
  } catch (err) {
    console.warn('ai_writes audit insert failed (non-fatal):', err);
  }

  // Fetch fresh totals for the UI confirmation.
  const { data: fresh } = await admin
    .from('customers')
    .select('id, full_name, total_orders, total_spent, last_seen_at')
    .eq('id', customerId)
    .maybeSingle();

  return NextResponse.json({
    ok:           true,
    customer_id:  customerId,
    full_name:    (fresh as { full_name?: string | null } | null)?.full_name ?? nameClean,
    total_orders: (fresh as { total_orders?: number | null } | null)?.total_orders ?? 0,
    total_spent:  (fresh as { total_spent?: number | null } | null)?.total_spent ?? 0,
    last_seen_at: (fresh as { last_seen_at?: string } | null)?.last_seen_at ?? nowIso,
    was_new:      wasNew,
    action,
  });
}
