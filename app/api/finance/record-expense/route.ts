// /api/finance/record-expense
//
// Server-authoritative INSERT into public.expenses (Phase 5 sweep, money
// tables). Replaces the browser→RLS-direct expenses.insert() on:
//   • app/expenses/page.tsx          (manual expense entry)
//   • app/intake/scan-invoice/page.tsx (invoice photo → expense)
//   • app/fleet/page.tsx             (maintenance + fuel → expense ledger ×2)
//
// Canonical D2 pattern: Bearer auth + role gate, service-role write, ai_writes
// audit. The server stamps recorded_by from the verified session — the client
// can no longer claim an arbitrary recorder.
//
// Body (all optional except description + amount_bsd):
//   { description, category, vendor, amount_bsd, due_date, recurring_interval,
//     notes, paid_now, payment_method, payment_ref }
// Resp: { ok, id }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);

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
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot record expenses.` }, { status: 403 });
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const description = typeof b.description === 'string' ? b.description.trim() : '';
  const amount = typeof b.amount_bsd === 'number' && Number.isFinite(b.amount_bsd) ? b.amount_bsd : NaN;
  if (!description) return NextResponse.json({ ok: false, error: 'description is required' }, { status: 400 });
  if (!(amount > 0)) return NextResponse.json({ ok: false, error: 'amount_bsd must be greater than zero' }, { status: 400 });

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const nowIso = new Date().toISOString();

  // Live `expenses` schema is lean: created_by (not recorded_by), amount_bsd,
  // notes, paid_at, due_date — and NO payment_method/payment_ref/recurring_interval
  // columns. Fold those into `notes` so nothing is lost, and use created_by.
  const paidNow = b.paid_now === true;
  const method  = paidNow ? (str(b.payment_method) ?? 'transfer') : null;
  const ref     = paidNow ? str(b.payment_ref) : null;
  const recurring = str(b.recurring_interval);
  const noteParts = [
    str(b.notes),
    recurring ? `recurring: ${recurring}` : null,
    paidNow ? `paid via ${method}${ref ? ` ref ${ref}` : ''}` : null,
  ].filter(Boolean);

  const row: Record<string, unknown> = {
    description,
    category:    str(b.category) ?? 'other',
    vendor:      str(b.vendor),
    amount_bsd:  amount,
    due_date:    str(b.due_date),
    notes:       noteParts.length ? noteParts.join(' · ') : null,
    created_by:  user.id, // server-stamped from verified session
  };
  if (paidNow) row.paid_at = nowIso;

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let newId: string | null = null;
  let err: string | null = null;
  try {
    const { data, error } = await admin.from('expenses').insert(row).select('id').single();
    if (error) err = error.message; else newId = (data as { id: string }).id;
  } catch (e) {
    err = e instanceof Error ? e.message : 'insert failed';
  }

  try {
    await admin.from('ai_writes').insert({
      tool:      'finance_record_expense',
      caller_id: user.id,
      input:     { description, amount_bsd: amount, category: row.category, paid_now: b.paid_now === true },
      result:    { id: newId, role },
      status:    err ? 'error' : 'success',
      error:     err,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  if (err) return NextResponse.json({ ok: false, error: `Could not record expense: ${err}` }, { status: 500 });
  return NextResponse.json({ ok: true, id: newId });
}
