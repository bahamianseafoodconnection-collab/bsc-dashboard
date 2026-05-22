// /api/pos/customer-search
//
// Name-based fuzzy customer search for the POS register. As cashier
// types 2+ chars, returns top 10 ILIKE matches on customers.full_name
// with enough fields to autofill the checkout customer block (id,
// full_name, phone, phone_e164, email, lifetime totals, consent flag,
// last_seen_at).
//
// Service-role to bypass RLS on `customers` (cashiers normally can't
// SELECT). Auth-gated to cashier+ roles via the caller's JWT.
//
// GET /api/pos/customer-search?q=<query>
// Returns: { ok, matches: [{ id, full_name, phone, phone_e164, email, ... }] }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set([
  'cashier', 'andros_staff', 'manager',
  'founder', 'co_founder', 'control_admin', 'basic_admin',
]);

export async function GET(req: NextRequest) {
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

  // Verify the caller via the user JWT (not the service-role key).
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });

  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot search customers.` }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    // Less than 2 chars = too noisy. Return empty silently so the dropdown stays clean.
    return NextResponse.json({ ok: true, matches: [] });
  }

  // Escape ILIKE wildcards so a quirky name (e.g. containing `%` or `_`) can't
  // explode the pattern. Prefix-wildcard search ensures we match anywhere in name.
  const safe = q.replace(/[\\%_]/g, (m) => `\\${m}`);

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data, error } = await admin
    .from('customers')
    .select('id, full_name, phone, phone_e164, email, total_orders, total_spent, email_marketing_consent, last_seen_at')
    .ilike('full_name', `%${safe}%`)
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ ok: false, error: `Search failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matches: data ?? [] });
}
