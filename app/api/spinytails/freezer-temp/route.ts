// =====================================================================
// /api/spinytails/freezer-temp  (G15 — freezer temperature log)
//
// Processor records freezer temps 3x/day per freezer (blast + holding).
// Writes spinytails_temperature_logs; within_limit is computed against the
// per-freezer ceiling so excursions surface on the processor dashboard
// (which already counts within_limit=false today).
//
//   GET  → { ok, freezers, today: [{location, reading_f, within_limit, logged_at}] }
//   POST { freezer, reading_f, notes? }
//
// Processing staff only.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['founder', 'co_founder', 'control_admin', 'manager', 'supervisor', 'processor', 'operations', 'qc_staff', 'receiver']);

// Freezer ceilings (°F) — HACCP limits (founder 2026-06-29).
const FREEZERS: Record<string, { label: string; maxF: number }> = {
  blast_freezer:   { label: 'Blast Freezer',   maxF: -10 },
  holding_freezer: { label: 'Holding Freezer', maxF: 0 },
};
const TARGET_PER_DAY = 3;

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
  if (!role || !ALLOWED.has(role)) return { error: 'Processing staff only', status: 403 };
  return { admin: createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } }), userId: user.id };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await g.admin.from('spinytails_temperature_logs')
    .select('id, location, reading_f, within_limit, logged_at, action_if_fail, notes')
    .gte('logged_at', `${today}T00:00:00`).order('logged_at', { ascending: false }).limit(60);
  const freezers = Object.entries(FREEZERS).map(([code, f]) => ({ code, label: f.label, maxF: f.maxF, target: TARGET_PER_DAY }));
  return NextResponse.json({ ok: true, freezers, today: data ?? [] });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* ignore */ }
  const freezer = String(body.freezer || '');
  const reading = Number(body.reading_f);
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null;
  const f = FREEZERS[freezer];
  if (!f) return NextResponse.json({ ok: false, error: 'Unknown freezer' }, { status: 400 });
  if (!Number.isFinite(reading)) return NextResponse.json({ ok: false, error: 'Valid reading_f required' }, { status: 400 });

  const within = reading <= f.maxF;
  const { error } = await g.admin.from('spinytails_temperature_logs').insert({
    location: freezer,
    reading_f: reading,
    within_limit: within,
    recorded_by: g.userId,
    logged_at: new Date().toISOString(),
    action_if_fail: within ? null : (notes || 'Excursion — corrective action required'),
    notes,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, within_limit: within });
}
