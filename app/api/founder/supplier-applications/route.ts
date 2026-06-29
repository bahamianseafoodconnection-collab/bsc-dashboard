// =====================================================================
// /api/founder/supplier-applications  (G13 — boat/farmer onboarding)
//
// Founder review of public supplier signups (/become-a-supplier → pending
// suppliers, is_active=false). Approve creates the login via the existing
// invite flow (called from the page with the founder's token), then this
// activates the supplier; reject removes the pending row.
//
//   GET  → { ok, applications: [pending suppliers w/ contact + cert] }
//   POST { action:'activate'|'reject', id }
//
// Founder / co_founder / control_admin / manager. Service-role.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APPROVERS = new Set(['founder', 'co_founder', 'control_admin', 'manager']);

async function gate(req: NextRequest): Promise<{ admin: SupabaseClient; userId: string } | { error: string; status: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const authHeader = req.headers.get('authorization') ?? '';
  if (!url || !anon || !svc) return { error: 'Server not configured', status: 500 };
  if (!authHeader.startsWith('Bearer ')) return { error: 'Sign in required', status: 401 };
  const uc = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return { error: 'Sign in required', status: 401 };
  const { data: prof } = await uc.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !APPROVERS.has(role)) return { error: 'Founder / manager only', status: 403 };
  return { admin: createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } }), userId: user.id };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { data, error } = await g.admin.from('suppliers')
    .select('id, name, emoji, contact_phone, contact_email, vessel_name, vessel_registration_number, vessel_registration_doc_url, notes, created_at, auth_user_id')
    .eq('is_active', false).is('auth_user_id', null).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, applications: data ?? [] });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* ignore */ }
  const id = typeof body.id === 'string' ? body.id : null;
  const action = String(body.action || '');
  if (!id || !['activate', 'reject'].includes(action)) return NextResponse.json({ ok: false, error: 'id + valid action required' }, { status: 400 });

  if (action === 'reject') {
    const { error } = await g.admin.from('suppliers').delete().eq('id', id).eq('is_active', false);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // activate — the login was just created via /api/admin/fishermen/invite.
  const { error } = await g.admin.from('suppliers').update({ is_active: true }).eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
