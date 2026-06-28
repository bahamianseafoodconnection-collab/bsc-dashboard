// /api/supplier/invoice-import-data
//
// Picker data for the founder invoice→catalog import screen: recent recorded
// purchase invoices + the supplier list. Service-role (purchase_invoices is
// RLS-locked). Auth: founder/co_founder/control_admin/basic_admin/manager.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);

export async function GET(req: NextRequest) {
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
  if (!role || !ADMIN_ROLES.has(role)) return NextResponse.json({ ok: false, error: 'Admin role required.' }, { status: 403 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const [{ data: invs }, { data: sups }] = await Promise.all([
    admin.from('purchase_invoices').select('id, invoice_ref, created_at, total_amount, items, summary').order('created_at', { ascending: false }).limit(40),
    admin.from('suppliers').select('id, name').order('name'),
  ]);

  const invoices = ((invs ?? []) as { id: string; invoice_ref: string | null; created_at: string; total_amount: number | null; items: unknown; summary: string | null }[])
    .map((i) => ({ id: i.id, invoice_ref: i.invoice_ref, created_at: i.created_at, total_amount: Number(i.total_amount ?? 0), item_count: Array.isArray(i.items) ? i.items.length : 0, summary: i.summary }));

  return NextResponse.json({ ok: true, invoices, suppliers: (sups ?? []) as { id: string; name: string }[] });
}
