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
  blast_freezer:     { label: 'Blast Freezer',     maxF: -10 },
  holding_freezer:   { label: 'Holding Freezer',   maxF: 0 },
  inventory_freezer: { label: 'Inventory Freezer', maxF: 0 },
};
const FREEZER_CODES = Object.keys(FREEZERS);
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

// Three daily slots — the card shows which is still due ("noon not yet logged").
const SLOTS: { key: string; label: string; from: number; to: number }[] = [
  { key: 'morning', label: 'Morning', from: 0,  to: 12 },
  { key: 'noon',    label: 'Noon',    from: 12, to: 17 },
  { key: 'evening', label: 'Evening', from: 17, to: 24 },
];

// Bahamas-local (America/Nassau) date + hour — DST-aware, so slots + "today"
// track the plant's clock, not the server's UTC.
const NASSAU_TZ = 'America/Nassau';
const nassauDate = (iso: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: NASSAU_TZ }).format(new Date(iso)); // YYYY-MM-DD
const nassauHour = (iso: string | Date) => parseInt(new Intl.DateTimeFormat('en-US', { timeZone: NASSAU_TZ, hour: 'numeric', hour12: false }).format(new Date(iso)), 10) % 24;

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const todayNassau = nassauDate(new Date());
  // Pull ~36h so late-evening Nassau readings (next-day UTC) are included, then
  // keep only those whose Nassau calendar date is today.
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const { data } = await g.admin.from('spinytails_temperature_logs')
    .select('id, location, reading_f, within_limit, logged_at, action_if_fail, notes')
    .in('location', FREEZER_CODES)
    .gte('logged_at', since).order('logged_at', { ascending: false }).limit(200);
  const logs = ((data ?? []) as Array<{ location: string; reading_f: number | null; within_limit: boolean | null; logged_at: string }>)
    .filter(l => nassauDate(l.logged_at) === todayNassau);

  const freezers = Object.entries(FREEZERS).map(([code, f]) => {
    const mine = logs.filter(l => l.location === code);
    const last = mine[0] ?? null; // ordered desc
    const slots = SLOTS.map(s => {
      const hit = mine.find(l => { const h = nassauHour(l.logged_at); return h >= s.from && h < s.to; });
      return { key: s.key, label: s.label, done: !!hit, reading_f: hit?.reading_f ?? null, within_limit: hit?.within_limit ?? null };
    });
    return {
      code, label: f.label, maxF: f.maxF, target: TARGET_PER_DAY,
      done_count: mine.length,
      last_reading_f: last?.reading_f ?? null, last_within: last?.within_limit ?? null, last_at: last?.logged_at ?? null,
      slots,
    };
  });
  return NextResponse.json({ ok: true, freezers, today: logs });
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
