// /api/sql-editor/run
//
// Thin wrapper around the bsc_admin_exec_sql() SECURITY DEFINER RPC.
// All gating + audit happens server-side in Postgres — this route just
// forwards the JWT so auth.uid() resolves correctly inside the function.
//
// Caller must be founder / co_founder / control_admin. The RPC itself
// raises if the role check fails; we surface that as a 403.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supaUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !anonKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Missing bearer token' }, { status: 401 });
  }

  let body: { sql?: unknown; allow_write?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }

  const sql = typeof body.sql === 'string' ? body.sql : '';
  const allowWrite = body.allow_write === true;
  if (!sql.trim()) {
    return NextResponse.json({ ok: false, error: 'SQL is empty' }, { status: 400 });
  }

  // Use the caller's JWT directly so auth.uid() inside the RPC resolves to
  // the founder, not the service-role. This is critical — the RPC's whole
  // gate is the auth.uid() role check.
  const supabase = createClient(supaUrl, anonKey, {
    global:  { headers: { Authorization: authHeader } },
    auth:    { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabase.rpc('bsc_admin_exec_sql', {
    p_sql:         sql,
    p_allow_write: allowWrite,
  });

  if (error) {
    // RPC role-gate raises a postgres error — surface it.
    const msg = error.message || 'Query failed';
    const isAuth = /founder-only|Authentication required/i.test(msg);
    return NextResponse.json({ ok: false, error: msg }, { status: isAuth ? 403 : 400 });
  }

  return NextResponse.json({ ok: true, result: data });
}
