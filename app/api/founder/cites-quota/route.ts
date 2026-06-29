// =====================================================================
// /api/founder/cites-quota  (G17 — CITES export quota tracking)
//
// Founder/manager sets a CITES export ceiling per species + season; this
// returns each ceiling with the weight USED (computed live from Spiny Tail
// export shipments in the period) + remaining.
//
//   GET  → { ok, quotas: [{ ...row, used_lbs, remaining_lbs, pct }] }
//   POST { id?, species_code, period_label, period_start, period_end, ceiling_lbs, notes? }
//   POST { action:'delete', id }
//
// Founder / co_founder / control_admin / manager. Service-role.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['founder', 'co_founder', 'control_admin', 'manager']);

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
  if (!role || !ALLOWED.has(role)) return { error: 'Founder / manager only', status: 403 };
  return { admin: createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } }), userId: user.id };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { data } = await g.admin.from('quota_tracking').select('*').order('period_start', { ascending: false });
  const rows = (data ?? []) as Array<{ id: string; species_code: string; period_label: string | null; period_start: string; period_end: string; ceiling_lbs: number; notes: string | null }>;

  const quotas = await Promise.all(rows.map(async (q) => {
    const { data: shp } = await g.admin.from('spinytails_shipments')
      .select('total_weight_lbs')
      .gte('shipped_at', `${q.period_start}T00:00:00`).lte('shipped_at', `${q.period_end}T23:59:59`);
    const used = (shp ?? []).reduce((s, r) => s + Number((r as { total_weight_lbs: number | null }).total_weight_lbs ?? 0), 0);
    const ceiling = Number(q.ceiling_lbs ?? 0);
    return {
      ...q,
      used_lbs: Math.round(used * 100) / 100,
      remaining_lbs: Math.round(Math.max(0, ceiling - used) * 100) / 100,
      pct: ceiling > 0 ? Math.round((used / ceiling) * 100) : 0,
    };
  }));
  return NextResponse.json({ ok: true, quotas });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* ignore */ }

  if (body.action === 'delete') {
    const id = typeof body.id === 'string' ? body.id : null;
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    const { error } = await g.admin.from('quota_tracking').delete().eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const species = (typeof body.species_code === 'string' && body.species_code.trim()) ? body.species_code.trim() : 'spiny_lobster';
  const periodStart = typeof body.period_start === 'string' ? body.period_start : null;
  const periodEnd = typeof body.period_end === 'string' ? body.period_end : null;
  const ceiling = Number(body.ceiling_lbs);
  if (!periodStart || !periodEnd) return NextResponse.json({ ok: false, error: 'period_start + period_end required' }, { status: 400 });
  if (!(ceiling > 0)) return NextResponse.json({ ok: false, error: 'ceiling_lbs must be > 0' }, { status: 400 });

  const row = {
    species_code: species,
    period_label: typeof body.period_label === 'string' ? body.period_label : null,
    period_start: periodStart, period_end: periodEnd,
    ceiling_lbs: ceiling,
    notes: typeof body.notes === 'string' ? body.notes : null,
    created_by: g.userId, updated_at: new Date().toISOString(),
  };
  const id = typeof body.id === 'string' ? body.id : null;
  const res = id
    ? await g.admin.from('quota_tracking').update(row).eq('id', id)
    : await g.admin.from('quota_tracking').upsert(row, { onConflict: 'species_code,period_start,period_end' });
  if (res.error) return NextResponse.json({ ok: false, error: res.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
