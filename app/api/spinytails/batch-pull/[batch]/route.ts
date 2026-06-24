// /api/spinytails/batch-pull/[batch]
//
// PROCESSING RECORDS PER BATCH PULL — one batch number = one complete digital
// audit file. Assembles EVERY record tied to a lot (receiving → processing →
// freezing → packing → storage → export) read-only from the spinytails_* tables,
// keyed by the immutable batch_number (or lot_code). Also flags missing
// documentation + non-conformances for the Founder AI / inspector view.
//
// Staff-gated, service-role (bypasses RLS so a complete file always assembles).
// Read-only — never writes; the batch number is never modified.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager', 'processor', 'receiver', 'qc_staff', 'operations']);

async function safe<T>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try { const { data, error } = await p; return error ? [] : (data ?? []); } catch { return []; }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ batch: string }> }) {
  const { batch: raw } = await ctx.params;
  const batch = decodeURIComponent(raw || '').trim();
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
  if (!role || !STAFF.has(role)) return NextResponse.json({ ok: false, error: 'Processing staff only.' }, { status: 403 });
  if (!batch) return NextResponse.json({ ok: false, error: 'batch number required' }, { status: 400 });
  // Batch numbers / lot codes are alphanumeric + hyphen only. Sanitize before
  // using in a PostgREST .or() filter (prevents filter injection).
  const safeBatch = batch.replace(/[^A-Za-z0-9-]/g, '');
  if (!safeBatch) return NextResponse.json({ ok: false, error: 'Invalid batch number.' }, { status: 400 });

  const admin: SupabaseClient = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1) Resolve the lot by batch_number OR lot_code (immutable identity).
  const { data: lot } = await admin.from('spinytails_lots')
    .select('*')
    .or(`batch_number.eq.${safeBatch},lot_code.eq.${safeBatch}`)
    .maybeSingle();
  if (!lot) return NextResponse.json({ ok: false, error: `No batch found for "${batch}".` }, { status: 404 });
  const L = lot as Record<string, unknown>;
  const lotId = L.id as string;

  // 2) Vessel + species context
  const [vesselArr, speciesArr] = await Promise.all([
    L.vessel_id ? safe(admin.from('spinytails_vessels').select('*').eq('id', L.vessel_id as string)) : Promise.resolve([]),
    L.species_code ? safe(admin.from('spinytails_species').select('code, name, scientific_name, ccp_limits').eq('code', L.species_code as string)) : Promise.resolve([]),
  ]);

  // 3) All lot-linked records
  const [intakes, quality, temps, capas, procBatches, procSteps, freezerRemovals, packagings] = await Promise.all([
    safe(admin.from('spinytails_lot_intakes').select('*').eq('lot_id', lotId).order('intake_time', { ascending: true })),
    safe(admin.from('spinytails_quality_inspections').select('*').eq('lot_id', lotId).order('inspected_at', { ascending: true })),
    safe(admin.from('spinytails_temperature_logs').select('*').eq('lot_id', lotId).order('logged_at', { ascending: true })),
    safe(admin.from('spinytails_corrective_actions').select('*').eq('lot_id', lotId).order('opened_at', { ascending: true })),
    safe(admin.from('spinytails_processing_batches').select('*').eq('lot_id', lotId).order('started_at', { ascending: true })),
    safe(admin.from('spinytails_processing_steps').select('*').eq('lot_id', lotId).order('recorded_at', { ascending: true })),
    safe(admin.from('spinytails_freezer_removals').select('*').eq('lot_id', lotId).order('removed_at', { ascending: true })),
    safe(admin.from('spinytails_master_packagings').select('*').eq('lot_id', lotId).order('packaged_at', { ascending: true })),
  ]);

  // 4) Grades (keyed by processing batch id) + export (via shipment_lots)
  const batchIds = (procBatches as Array<{ id: string }>).map(b => b.id);
  const grades = batchIds.length ? await safe(admin.from('spinytails_batch_grades').select('*').in('batch_id', batchIds)) : [];
  const shipLots = await safe<{ shipment_id: string; lot_id: string; master_cartons: number | null; weight_lbs: number | null }>(admin.from('spinytails_shipment_lots').select('*').eq('lot_id', lotId));
  const shipmentIds = [...new Set(shipLots.map(s => s.shipment_id))];
  const shipments = shipmentIds.length ? await safe(admin.from('spinytails_shipments').select('*').in('id', shipmentIds)) : [];

  // 5) SSOP sanitation (facility-wide, not lot-linked) — within the lot's window.
  const fromDate = (L.receipt_date as string) || (L.created_at as string);
  const toDate = (L.shipped_at as string) || new Date().toISOString();
  const sanitation = fromDate ? await safe(admin.from('spinytails_sanitation_checks').select('*').gte('check_date', String(fromDate).slice(0, 10)).lte('check_date', String(toDate).slice(0, 10)).order('check_date', { ascending: true })) : [];

  // 6) Missing-doc + non-conformance alerts (Founder AI / inspector)
  const missing: string[] = [];
  if (intakes.length === 0) missing.push('Receiving record');
  if (temps.length === 0) missing.push('Temperature logs');
  if (quality.length === 0) missing.push('Quality / HACCP inspection');
  if (procBatches.length === 0 && procSteps.length === 0) missing.push('Processing record');
  if (packagings.length === 0) missing.push('Packing record');
  if (shipments.length === 0 && String(L.status) !== 'shipped') { /* export pending — not missing yet */ }

  const nonconformance: string[] = [];
  for (const t of temps as Array<{ within_limit: boolean | null; reading_f: number | null; logged_at: string | null; location: string | null }>) {
    if (t.within_limit === false) nonconformance.push(`Temp excursion ${t.reading_f ?? '?'}°F @ ${t.location ?? 'unknown'} (${(t.logged_at ?? '').slice(0, 16)})`);
  }
  for (const q of quality as Array<{ result: string | null; inspected_at: string | null }>) {
    if (q.result && /fail/i.test(q.result)) nonconformance.push(`QC FAIL (${(q.inspected_at ?? '').slice(0, 16)})`);
  }
  for (const c of capas as Array<{ closed_at: string | null; ca_number: string | null; what_failed: string | null }>) {
    if (!c.closed_at) nonconformance.push(`Open corrective action ${c.ca_number ?? ''}: ${c.what_failed ?? ''}`.trim());
  }
  for (const s of sanitation as Array<{ compliant: boolean | null; ssop: string | null; check_date: string | null }>) {
    if (s.compliant === false) nonconformance.push(`SSOP non-compliant: ${s.ssop ?? ''} (${s.check_date ?? ''})`.trim());
  }

  const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
  const yieldPct = (procBatches as Array<{ yield_pct: number | null }>).find(b => b.yield_pct != null)?.yield_pct ?? null;

  return NextResponse.json({
    ok: true,
    batch_number: L.batch_number ?? batch,
    lot: L,
    vessel: vesselArr[0] ?? null,
    species: speciesArr[0] ?? null,
    sections: {
      receiving:    intakes,
      temperature:  temps,
      quality:      quality,
      processing:   procBatches,
      processing_steps: procSteps,
      grades,
      freezer_removals: freezerRemovals,
      packing:      packagings,
      sanitation,
      corrective_actions: capas,
      export:       shipments,
    },
    summary: {
      received_lbs: (intakes as Array<{ quantity_lbs: number | null }>).reduce((s, r) => s + num(r.quantity_lbs), 0),
      yield_pct: yieldPct,
      temp_readings: temps.length,
      qc_inspections: quality.length,
      open_capas: (capas as Array<{ closed_at: string | null }>).filter(c => !c.closed_at).length,
      status: L.status ?? null,
    },
    alerts: { missing, nonconformance },
  });
}
