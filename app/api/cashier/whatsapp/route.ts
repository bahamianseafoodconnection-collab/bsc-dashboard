// =====================================================================
// /api/cashier/whatsapp  (G8 — cashier WhatsApp monitor)
//
//   GET  ?show=open|all  → inbound WhatsApp messages
//   POST { action:'handle'|'unhandle', id, customer_id? }
//
// Cashier+ staff. Service-role (whatsapp_messages is staff-RLS).
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['cashier', 'andros_staff', 'manager', 'right_hand', 'founder', 'co_founder', 'control_admin']);

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
  if (!role || !ALLOWED.has(role)) return { error: 'Cashier+ only', status: 403 };
  return { admin: createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } }), userId: user.id };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const show = req.nextUrl.searchParams.get('show') || 'open';
  let q = g.admin.from('whatsapp_messages')
    .select('id, from_number, from_name, body, num_media, verified, received_at, handled_at, linked_customer_id')
    .order('received_at', { ascending: false }).limit(100);
  if (show !== 'all') q = q.is('handled_at', null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const open = await g.admin.from('whatsapp_messages').select('id', { count: 'exact', head: true }).is('handled_at', null);
  return NextResponse.json({ ok: true, messages: data ?? [], open_count: open.count ?? 0 });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* ignore */ }
  const id = typeof body.id === 'string' ? body.id : null;
  const action = String(body.action || '');
  if (!id || !['handle', 'unhandle'].includes(action)) return NextResponse.json({ ok: false, error: 'id + valid action required' }, { status: 400 });

  const patch = action === 'handle'
    ? { handled_at: new Date().toISOString(), handled_by: g.userId, linked_customer_id: typeof body.customer_id === 'string' ? body.customer_id : null }
    : { handled_at: null, handled_by: null };
  const { error } = await g.admin.from('whatsapp_messages').update(patch).eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
