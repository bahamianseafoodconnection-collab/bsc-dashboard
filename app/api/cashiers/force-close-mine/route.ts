// /api/cashiers/force-close-mine
//
// Lets a signed-in cashier (or any staff member) force-close their own
// orphaned cash_drawer_sessions row without admin SQL. Use case:
// browser logs out mid-shift (network blip, tab closed), session row
// stays status='open', cashier can't reopen on next sign-in.
//
// Auth: any signed-in user — they can ONLY close sessions where
// cashier_user_id matches their own auth.uid(). Service-role write so
// the close goes through even if the original RLS policies block the
// caller's role directly.
//
// Audit trail: each close writes 'self_force_close at {iso}' into
// admin_notes so we can reconcile drawer variance later.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !svc) return null;
  return createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function resolveCaller(req: NextRequest): Promise<{ userId: string | null }> {
  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const header = req.headers.get('authorization') ?? '';
  if (!url || !anon || !header.startsWith('Bearer ')) return { userId: null };
  const client = createClient(url, anon, {
    global: { headers: { Authorization: header } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user } } = await client.auth.getUser();
  return { userId: user?.id ?? null };
}

export async function POST(req: NextRequest) {
  const admin = adminClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const { userId } = await resolveCaller(req);
  if (!userId) return NextResponse.json({ ok: false, error: 'Sign-in required.' }, { status: 401 });

  // Find every open session belonging to this caller. Usually one;
  // historical data may show more.
  const { data: openSessions, error: findErr } = await admin
    .from('cash_drawer_sessions')
    .select('id, opened_at, admin_notes')
    .eq('cashier_user_id', userId)
    .eq('status', 'open');

  if (findErr) return NextResponse.json({ ok: false, error: findErr.message }, { status: 500 });
  if (!openSessions || openSessions.length === 0) {
    return NextResponse.json({ ok: true, closed: 0, message: 'No open sessions to close.' });
  }

  const nowIso = new Date().toISOString();
  let closedCount = 0;
  for (const row of openSessions) {
    const note = `self_force_close at ${nowIso}`;
    const merged = row.admin_notes ? `${row.admin_notes} | ${note}` : note;
    const { error: updErr } = await admin
      .from('cash_drawer_sessions')
      .update({ status: 'closed', closed_at: nowIso, admin_notes: merged })
      .eq('id', row.id)
      .eq('cashier_user_id', userId);
    if (!updErr) closedCount++;
  }

  return NextResponse.json({
    ok: true,
    closed: closedCount,
    message: closedCount === openSessions.length
      ? `Closed ${closedCount} open shift${closedCount === 1 ? '' : 's'}.`
      : `Closed ${closedCount} of ${openSessions.length} open shifts.`,
  });
}
