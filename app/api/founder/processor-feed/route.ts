// /api/founder/processor-feed
//
// Read-only live activity across every processor stage, merged into one
// time-sorted stream for the founder: receiving, freezer pulls, processing
// steps (devein / conch-clean / sleeve), all temperature logs (freezer + bath +
// thaw, excursions flagged), and boxing. Each event carries batch + boat/actor +
// what happened + when. Management-gated, service-role (bypasses RLS so the feed
// always assembles).

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES = new Set(['founder', 'co_founder', 'control_admin', 'manager']);

async function safe<T>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try { const { data } = await p; return data ?? []; } catch { return []; }
}

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !anon || !svc) return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const uc = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const { data: prof } = await uc.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ROLES.has(role)) return NextResponse.json({ ok: false, error: 'Founder / management only.' }, { status: 403 });

  const admin: SupabaseClient = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });

  const [intakes, removals, steps, temps, cases, lots, species] = await Promise.all([
    safe<Record<string, unknown>>(admin.from('spinytails_lot_intakes').select('lot_id, intake_time, quantity_lbs, product_name, product_state, core_temp_f_at_receipt, receiving_employee').order('intake_time', { ascending: false }).limit(40)),
    safe<Record<string, unknown>>(admin.from('spinytails_freezer_removals').select('batch_number, lot_id, removed_at, weight_removed_lbs, purpose, storage_location, employee_id').order('removed_at', { ascending: false }).limit(40)),
    safe<Record<string, unknown>>(admin.from('spinytails_processing_steps').select('batch_number, lot_id, recorded_at, step_name, weight_lbs, employee_id').order('recorded_at', { ascending: false }).limit(40)),
    safe<Record<string, unknown>>(admin.from('spinytails_temperature_logs').select('lot_id, logged_at, location, reading_f, within_limit, recorded_by').order('logged_at', { ascending: false }).limit(80)),
    safe<Record<string, unknown>>(admin.from('spinytails_cases').select('lot_id, product_type, created_at, created_by').order('created_at', { ascending: false }).limit(120)),
    safe<{ id: string; batch_number: string | null; lot_code: string | null; species_code: string | null }>(admin.from('spinytails_lots').select('id, batch_number, lot_code, species_code')),
    safe<{ code: string; name: string }>(admin.from('spinytails_species').select('code, name')),
  ]);

  const lotById = new Map(lots.map(l => [l.id, l]));
  const spName = new Map(species.map(s => [s.code, s.name]));
  const batchFor = (lotId: unknown) => { const l = lotId ? lotById.get(lotId as string) : null; return (l?.batch_number ?? l?.lot_code ?? '—') as string; };
  const prodForLot = (lotId: unknown) => { const l = lotId ? lotById.get(lotId as string) : null; return (l?.species_code ? spName.get(l.species_code) : null) ?? null; };

  // Actor names.
  const ids = new Set<string>();
  intakes.forEach(r => r.receiving_employee && ids.add(r.receiving_employee as string));
  removals.forEach(r => r.employee_id && ids.add(r.employee_id as string));
  steps.forEach(r => r.employee_id && ids.add(r.employee_id as string));
  temps.forEach(r => r.recorded_by && ids.add(r.recorded_by as string));
  cases.forEach(r => r.created_by && ids.add(r.created_by as string));
  const profs = ids.size ? await safe<{ id: string; full_name: string | null }>(admin.from('profiles').select('id, full_name').in('id', [...ids])) : [];
  const nameById = new Map(profs.map(p => [p.id, p.full_name || 'Staff']));
  const who = (id: unknown) => (id ? (nameById.get(id as string) ?? 'Staff') : 'Staff');
  const n = (v: unknown) => (v == null ? '?' : String(v));

  type Ev = { at: string; kind: string; icon: string; batch: string; product: string | null; actor: string; detail: string; alert: boolean };
  const ev: Ev[] = [];

  for (const r of intakes) ev.push({ at: n(r.intake_time), kind: 'receive', icon: '📥', batch: batchFor(r.lot_id), product: (r.product_name as string) ?? prodForLot(r.lot_id), actor: who(r.receiving_employee), detail: `Received ${n(r.quantity_lbs)} lb ${n(r.product_state)}${r.core_temp_f_at_receipt != null ? ` @ ${n(r.core_temp_f_at_receipt)}°F` : ''}`, alert: false });
  for (const r of removals) ev.push({ at: n(r.removed_at), kind: 'pull', icon: '🧊', batch: n(r.batch_number), product: prodForLot(r.lot_id), actor: who(r.employee_id), detail: `Pulled ${n(r.weight_removed_lbs)} lb — ${n(r.purpose)}${r.storage_location ? ` (${n(r.storage_location)})` : ''}`, alert: false });
  for (const r of steps) ev.push({ at: n(r.recorded_at), kind: 'step', icon: '🔧', batch: n(r.batch_number), product: prodForLot(r.lot_id), actor: who(r.employee_id), detail: `${n(r.step_name)}${r.weight_lbs != null ? ` · ${n(r.weight_lbs)} lb` : ''}`, alert: false });
  for (const r of temps) { const bad = r.within_limit === false; ev.push({ at: n(r.logged_at), kind: 'temp', icon: bad ? '🚨' : '🌡️', batch: batchFor(r.lot_id), product: null, actor: who(r.recorded_by), detail: `${n(r.location).replace(/_/g, ' ')} ${n(r.reading_f)}°F${bad ? ' — OUT OF RANGE' : ''}`, alert: bad }); }

  // Boxing — aggregate cases per lot (one event, latest time).
  const byLot = new Map<string, { count: number; at: string; product: string; actor: unknown }>();
  for (const c of cases) {
    const lid = c.lot_id as string; if (!lid) continue;
    const cur = byLot.get(lid);
    if (!cur) byLot.set(lid, { count: 1, at: n(c.created_at), product: (c.product_type as string) ?? '', actor: c.created_by });
    else { cur.count++; if (n(c.created_at) > cur.at) cur.at = n(c.created_at); }
  }
  for (const [lid, v] of byLot) ev.push({ at: v.at, kind: 'box', icon: '📦', batch: batchFor(lid), product: v.product || prodForLot(lid), actor: who(v.actor), detail: `${v.count} case${v.count > 1 ? 's' : ''} boxed → holding`, alert: false });

  ev.sort((a, b) => (a.at < b.at ? 1 : -1));
  return NextResponse.json({ ok: true, events: ev.slice(0, 100) });
}
