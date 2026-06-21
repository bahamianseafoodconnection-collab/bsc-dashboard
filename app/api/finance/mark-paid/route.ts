// /api/finance/mark-paid
//
// Server-authoritative "mark paid" for money-state flips that were happening
// browser→RLS direct (Phase 5 sweep, money tables first). Replaces:
//   • app/jaquel/page.tsx confirmSupplierPaid  → supplier_payouts.paid = true
//   • app/jaquel/page.tsx markUtilityProcessed → utility_payments.payment_status = 'completed'
//
// Canonical D2 pattern: Bearer-token auth + role gate (mirrors the page's
// client gate), service-role client for the write, ai_writes audit row.
//
// Body: { kind: 'supplier_payout' | 'utility_payment', id: string }
//   • supplier_payout: id = supplier_id → marks that supplier's UNPAID payouts paid.
//   • utility_payment:  id = utility_payments.id → marks it completed.
// Resp: { ok, kind, affected }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Matches app/jaquel/page.tsx checkAuth (basic_admin/control_admin/founder/co_founder).
const ALLOWED_ROLES = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin']);

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
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot mark payments paid.` }, { status: 403 });
  }

  let body: { kind?: unknown; id?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const kind = body.kind === 'supplier_payout' || body.kind === 'utility_payment' ? body.kind : '';
  const id   = typeof body.id === 'string' ? body.id : '';
  if (!kind) return NextResponse.json({ ok: false, error: "kind must be 'supplier_payout' or 'utility_payment'" }, { status: 400 });
  if (!id)   return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let affected = 0;
  let err: string | null = null;
  try {
    if (kind === 'supplier_payout') {
      const { data, error } = await admin
        .from('supplier_payouts')
        .update({ paid: true })
        .eq('supplier_id', id)
        .eq('paid', false)
        .select('id');
      if (error) err = error.message; else affected = (data ?? []).length;
    } else {
      const { data, error } = await admin
        .from('utility_payments')
        .update({ payment_status: 'completed' })
        .eq('id', id)
        .select('id');
      if (error) err = error.message; else affected = (data ?? []).length;
    }
  } catch (e) {
    err = e instanceof Error ? e.message : 'update failed';
  }

  // Audit (non-fatal).
  try {
    await admin.from('ai_writes').insert({
      tool:      'finance_mark_paid',
      caller_id: user.id,
      input:     { kind, id },
      result:    { affected, role },
      status:    err ? 'error' : 'success',
      error:     err,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  if (err) return NextResponse.json({ ok: false, error: `Mark-paid failed: ${err}` }, { status: 500 });
  return NextResponse.json({ ok: true, kind, affected });
}
