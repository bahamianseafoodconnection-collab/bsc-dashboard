// /api/sql-editor/schema
//
// Returns the founder-only schema overview: every public table with a row
// estimate, RLS status, and last analyze/autovacuum timestamps. Driven by
// the bsc_admin_schema_overview() RPC — role gating happens inside the
// function.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !anonKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Missing bearer token' }, { status: 401 });
  }

  const supabase = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabase.rpc('bsc_admin_schema_overview');
  if (error) {
    const msg = error.message || 'Schema overview failed';
    const isAuth = /founder-only|Authentication required/i.test(msg);
    return NextResponse.json({ ok: false, error: msg }, { status: isAuth ? 403 : 400 });
  }
  return NextResponse.json({ ok: true, tables: data ?? [] });
}
