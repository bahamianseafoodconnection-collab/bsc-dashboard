// /api/documents/[id]
//
// GET a captured document's extracted fields (for prefilling a target form,
// e.g. the Receiving Station). Staff-gated, service-role so the prefill works
// regardless of per-table RLS. Part of Phase 2b (route → form prefill).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver','qc_staff','cashier','andros_staff','operations']);

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !STAFF.has(role)) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: doc } = await admin.from('captured_documents')
    .select('id, file_url, file_name, doc_type, summary, extracted, traceability, status, linked_record_type, linked_record_id')
    .eq('id', id).maybeSingle();
  if (!doc) return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 });
  return NextResponse.json({ ok: true, document: doc });
}
