// /api/rbc/rematch
//
// Re-run matching over already-imported UNMATCHED RBC lines (no re-upload).
// Useful after the matcher changes, or once BSC starts recording the POS sales
// these settlements correspond to. Founder/admin. Service-role.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rematchUnmatched } from '@/lib/rbc/process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: 'Founder / admin only.' }, { status: 403 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const r = await rematchUnmatched(admin);
  return NextResponse.json({ ok: true, ...r });
}
