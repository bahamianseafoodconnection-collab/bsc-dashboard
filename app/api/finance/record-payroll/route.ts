// /api/finance/record-payroll
//
// Server-authoritative INSERT into public.payroll_entries (Phase 5 sweep, money
// tables). Replaces the browser→RLS-direct payroll_entries.insert() on
// app/payroll/page.tsx (submit). The server recomputes net_pay from gross −
// deductions so the client cannot post an inconsistent net, and stamps
// recorded_by from the verified session.
//
// Body: { staff_user_id?, staff_name, pay_period_start, pay_period_end,
//         gross_pay, deductions, notes?, mode: 'hourly'|'salary',
//         hours?, hourly_rate?, salary_amount? }
// Resp: { ok, id }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);
const round2 = (n: number) => Math.round(n * 100) / 100;

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
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot record payroll.` }, { status: 403 });
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const staffName = typeof b.staff_name === 'string' ? b.staff_name.trim() : '';
  const periodStart = typeof b.pay_period_start === 'string' ? b.pay_period_start : '';
  const periodEnd   = typeof b.pay_period_end === 'string' ? b.pay_period_end : '';
  const mode = b.mode === 'hourly' ? 'hourly' : 'salary';
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  if (!staffName)   return NextResponse.json({ ok: false, error: 'staff_name is required' }, { status: 400 });
  if (!periodStart || !periodEnd) return NextResponse.json({ ok: false, error: 'pay period dates are required' }, { status: 400 });

  // Server recomputes gross/net so net can never be client-forged.
  const gross = mode === 'hourly' ? num(b.hours) * num(b.hourly_rate) : num(b.salary_amount);
  const deductions = num(b.deductions);
  if (!(gross > 0)) return NextResponse.json({ ok: false, error: 'gross pay must be greater than zero' }, { status: 400 });
  const net = Math.max(0, gross - deductions);

  const row: Record<string, unknown> = {
    staff_user_id:    typeof b.staff_user_id === 'string' && b.staff_user_id ? b.staff_user_id : null,
    staff_name:       staffName,
    pay_period_start: periodStart,
    pay_period_end:   periodEnd,
    gross_pay:        round2(gross),
    deductions:       round2(deductions),
    net_pay:          round2(net),
    notes:            typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null,
    recorded_by:      user.id,
  };
  if (mode === 'hourly') {
    row.hours       = num(b.hours);
    row.hourly_rate = num(b.hourly_rate);
  } else {
    row.salary_amount = num(b.salary_amount);
  }

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let newId: string | null = null;
  let err: string | null = null;
  try {
    const { data, error } = await admin.from('payroll_entries').insert(row).select('id').single();
    if (error) err = error.message; else newId = (data as { id: string }).id;
  } catch (e) {
    err = e instanceof Error ? e.message : 'insert failed';
  }

  try {
    await admin.from('ai_writes').insert({
      tool:      'finance_record_payroll',
      caller_id: user.id,
      input:     { staff_name: staffName, period: `${periodStart}..${periodEnd}`, gross_pay: round2(gross), net_pay: round2(net) },
      result:    { id: newId, role },
      status:    err ? 'error' : 'success',
      error:     err,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  if (err) return NextResponse.json({ ok: false, error: `Could not record payroll: ${err}` }, { status: 500 });
  return NextResponse.json({ ok: true, id: newId });
}
