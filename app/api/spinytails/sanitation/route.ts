// /api/spinytails/sanitation
//
// Daily Sanitation Checklist (SSOP) — the one Fisheries-packet record with no
// other data source. Processor fills START-of-day + END-of-day P/F grades plus
// PPM readings; verified by one of the verifier pool. Writes to
// spinytails_sanitation_checklist.
//
//   GET  ?date=YYYY-MM-DD → today's checklist (most recent for the date) | null
//   POST { id?, checklist_date, start_time?, end_time?, grades, *_ppm_*,
//          sanitizer_*_type, footbath_*, verified_by_name, verified_by_role }
//        → upsert (update if id, else insert). Returns { ok, id }.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES = new Set(['founder','co_founder','control_admin','manager','processor','receiver','qc_staff','operations']);

async function authed(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { error: 'Sign in required', status: 401 as const };
  const uc = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error } = await uc.auth.getUser();
  if (error || !user) return { error: 'Invalid session', status: 401 as const };
  const { data: prof } = await uc.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ROLES.has(role)) return { error: `Role "${role ?? 'none'}" cannot log sanitation.`, status: 403 as const };
  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return { user, admin };
}

export async function GET(req: NextRequest) {
  const a = await authed(req);
  if ('error' in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const { data } = await a.admin.from('spinytails_sanitation_checklist')
    .select('*').eq('checklist_date', date).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ ok: true, checklist: data ?? null });
}

export async function POST(req: NextRequest) {
  const a = await authed(req);
  if ('error' in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const numOrNull = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

  const checklistDate = str(b.checklist_date) ?? new Date().toISOString().slice(0, 10);
  const row: Record<string, unknown> = {
    checklist_date:             checklistDate,
    start_time:                 str(b.start_time),
    end_time:                   str(b.end_time),
    grades:                     (b.grades && typeof b.grades === 'object') ? b.grades : {},
    chlorine_ppm_start:         numOrNull(b.chlorine_ppm_start),
    chlorine_ppm_end:           numOrNull(b.chlorine_ppm_end),
    sanitizer_nonfcs_type:      str(b.sanitizer_nonfcs_type),
    sanitizer_nonfcs_ppm_start: numOrNull(b.sanitizer_nonfcs_ppm_start),
    sanitizer_nonfcs_ppm_end:   numOrNull(b.sanitizer_nonfcs_ppm_end),
    sanitizer_fcs_type:         str(b.sanitizer_fcs_type),
    sanitizer_fcs_ppm_start:    numOrNull(b.sanitizer_fcs_ppm_start),
    sanitizer_fcs_ppm_end:      numOrNull(b.sanitizer_fcs_ppm_end),
    footbath_type:              str(b.footbath_type) ?? 'Bleach',
    footbath_ppm_start:         numOrNull(b.footbath_ppm_start),
    footbath_ppm_end:           numOrNull(b.footbath_ppm_end),
    verified_by_name:           str(b.verified_by_name),
    verified_by_role:           str(b.verified_by_role),
    signed_at:                  str(b.verified_by_name) ? new Date().toISOString() : null,
  };

  const id = str(b.id);
  if (id) {
    const { error } = await a.admin.from('spinytails_sanitation_checklist').update(row).eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id });
  }
  const { data, error } = await a.admin.from('spinytails_sanitation_checklist')
    .insert({ ...row, created_by: a.user.id }).select('id').single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
