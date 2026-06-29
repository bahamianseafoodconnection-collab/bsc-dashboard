// =====================================================================
// /api/founder/expenses  (G3 — expense approval gate)
//
// Founder review of staff-captured expenses. Cashier photos a receipt →
// /documents/capture creates a 'pending_approval' expense → founder
// approves (counts in accounting) or rejects it here.
//
//   GET  ?status=pending_approval|approved|rejected|all  → list
//   POST { action:'approve'|'reject', id }               → set status
//
// Founder/co_founder/control_admin only. Service-role reads/writes
// (expenses is founder-only RLS).
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APPROVERS = new Set(['founder', 'co_founder', 'control_admin']);

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
  if (!role || !APPROVERS.has(role)) return { error: 'Founder only', status: 403 };
  return { admin: createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } }), userId: user.id };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const status = req.nextUrl.searchParams.get('status') || 'pending_approval';
  let q = g.admin.from('expenses')
    .select('id, created_at, category, vendor, amount, amount_bsd, due_date, description, notes, image_url, status, approved_at, created_by')
    .order('created_at', { ascending: false }).limit(200);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, expenses: data ?? [] });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* ignore */ }
  const action = String(body.action || '');
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
  if (!['approve', 'reject'].includes(action)) return NextResponse.json({ ok: false, error: 'bad action' }, { status: 400 });

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  const { error } = await g.admin.from('expenses')
    .update({ status: newStatus, approved_by: g.userId, approved_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending_approval');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
