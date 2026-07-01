// /api/spinytails/receive
//
// Receiving Station endpoint. Generates the species-prefixed batch number
// CON-/LOB-/SNP-YYYYMMDD-NNN server-side (spinytails_next_batch_number) — staff
// recognize product type by eye on the bin + tie-strap. Validates CCP-1 (temp +
// sulfite), then writes:
//   • spinytails_lots         (lot_code = batch_number + color strap + holding loc)
//   • spinytails_lot_intakes  (weight, temp, fishing/harvest data)
//   • spinytails_receiving_qc (Fisheries Receiving-Log Y/N flags)
//
// Body adds (cold-chain): color_strap, color_strap_reused, holding_freezer_location,
//   lot_bag_no, receiving_qc:{ egg_bearing, discoloration, softshell_damage, undersized, odor }
// Resp: { ok, batch_number, lot_id, qc_pass, ccp_warnings, label }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RECEIVING_ROLES = new Set([
  'founder', 'co_founder', 'control_admin', 'manager', 'processor', 'receiver', 'qc_staff',
]);

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  }
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !RECEIVING_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot receive product.` }, { status: 403 });
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const str  = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const num  = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const bool = (v: unknown) => v === true;

  const vesselId  = str(b.vessel_id);
  const species   = str(b.species_code);
  const qty       = num(b.total_weight_lbs);
  const state     = b.product_state === 'frozen' ? 'frozen' : b.product_state === 'fresh' ? 'fresh' : null;
  const receiptDate = str(b.receipt_date) ?? new Date().toISOString().slice(0, 10);
  if (!vesselId) return NextResponse.json({ ok: false, error: 'vessel is required (approved supplier)' }, { status: 400 });
  if (!species)  return NextResponse.json({ ok: false, error: 'species is required' }, { status: 400 });
  if (!(qty && qty > 0)) return NextResponse.json({ ok: false, error: 'total weight must be > 0' }, { status: 400 });
  if (!state)    return NextResponse.json({ ok: false, error: "product_state must be 'fresh' or 'frozen'" }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Vessel — default strap color + label fields.
  const { data: vessel } = await admin.from('spinytails_vessels')
    .select('vessel_name, fisherman_name, captain_name, license_number, color_tag')
    .eq('id', vesselId)
    .maybeSingle<{ vessel_name: string | null; fisherman_name: string; captain_name: string | null; license_number: string | null; color_tag: string }>();
  if (!vessel) return NextResponse.json({ ok: false, error: 'Vessel not found' }, { status: 400 });

  // Species config drives CCP-1 limits.
  const { data: sp } = await admin.from('spinytails_species').select('code, name, ccp_limits').eq('code', species).maybeSingle<{ code: string; name: string; ccp_limits: Record<string, unknown> }>();
  if (!sp) return NextResponse.json({ ok: false, error: `Unknown species "${species}"` }, { status: 400 });
  const limits = (sp.ccp_limits ?? {}) as Record<string, number>;

  // ── CCP-1: temperature + sulfite checks ───────────────────────────────────
  const ccpWarnings: string[] = [];
  const coreTemp = num(b.core_temp_f);
  const tempLimit = state === 'fresh' ? limits.fresh_max_f : limits.frozen_max_f;
  if (typeof tempLimit === 'number' && coreTemp != null && coreTemp > tempLimit) {
    ccpWarnings.push(`Core temp ${coreTemp}°F exceeds ${state} limit ${tempLimit}°F (CCP-1) — reject/hold + corrective action.`);
  }
  const qc = (b.qc_results && typeof b.qc_results === 'object') ? b.qc_results as Record<string, unknown> : {};
  if (typeof limits.sulfite_max_ppm === 'number') {
    const sulfite = num(qc.sulfite_ppm);
    if (sulfite != null && sulfite > limits.sulfite_max_ppm) {
      ccpWarnings.push(`Sulfite ${sulfite} ppm exceeds limit ${limits.sulfite_max_ppm} ppm (CCP-1) — hold + disposition.`);
    }
  }
  const qcPass = ccpWarnings.length === 0;

  // ── Batch number (species-prefixed) + daily sequence — UNCHANGED ──────────
  const { data: bn, error: bnErr } = await admin.rpc('spinytails_next_batch_number', { p_species_code: species, p_date: receiptDate });
  if (bnErr || !bn) {
    return NextResponse.json({ ok: false, error: `Batch number generation failed: ${bnErr?.message ?? 'no value'}` }, { status: 500 });
  }
  const batchNumber = String(bn);
  const seq = parseInt(batchNumber.slice(-3), 10) || 1;

  // Cold-chain fields.
  const colorStrap       = str(b.color_strap) ?? vessel.color_tag;
  const colorStrapReused = bool(b.color_strap_reused);
  const holdingLocation  = str(b.holding_freezer_location);
  const lotBagNo         = str(b.lot_bag_no);
  const purchaseCost     = num(b.purchase_cost);           // supplier / direct purchase cost of the raw batch
  const decision         = b.decision === 'reject' ? 'reject' : 'accept';
  const rq = (b.receiving_qc && typeof b.receiving_qc === 'object') ? b.receiving_qc as Record<string, unknown> : {};

  // ── Insert lot (lot_code = batch_number) + intake + receiving-QC ──────────
  let lotId: string | null = null;
  let err: string | null = null;
  try {
    const { data: lot, error: lotErr } = await admin.from('spinytails_lots').insert({
      lot_code:                 batchNumber,
      batch_number:             batchNumber,
      species_code:             species,
      receipt_date:             receiptDate,
      vessel_id:                vesselId,
      daily_sequence:           seq,
      status:                   decision === 'reject' ? 'rejected' : 'received',
      rejected_at:              decision === 'reject' ? new Date().toISOString() : null,
      rejected_reason:          decision === 'reject' ? (str(b.reject_reason) ?? 'QC rejected at intake — held/quarantine') : null,
      color_strap:              colorStrap,
      color_strap_reused:       colorStrapReused,
      holding_freezer_location: holdingLocation,
    }).select('id').single();
    if (lotErr) { err = lotErr.message; }
    else {
      lotId = (lot as { id: string }).id;
      const { error: intakeErr } = await admin.from('spinytails_lot_intakes').insert({
        lot_id:                 lotId,
        intake_time:            new Date().toISOString(),
        quantity_lbs:           qty,
        purchase_cost:          purchaseCost,
        product_state:          state,
        core_temp_f_at_receipt: coreTemp,
        fishing_area:           str(b.fishing_area),
        fishing_date_start:     str(b.fishing_date_start),
        fishing_date_end:       str(b.fishing_date_end),
        product_name:           str(b.product_name),
        num_bags:               num(b.num_bags),
        weight_per_bag_lbs:     num(b.weight_per_bag_lbs),
        product_grade:          str(b.product_grade),
        product_condition:      str(b.product_condition),
        fishing_method:         str(b.fishing_method),
        trip_start_location:    str(b.trip_start_location),
        trip_end_location:      str(b.trip_end_location),
        receiving_employee:     user.id,
        device_id:              str(b.device_id),
        qc_results:             qc,
        qc_pass:                qcPass,
        harvest_photos:         Array.isArray(b.harvest_photos) ? b.harvest_photos : [],
        reject_ratio_pct:       num(b.reject_ratio_pct),
        harvest_positions:      Array.isArray(b.harvest_positions) ? b.harvest_positions : [],
      });
      if (intakeErr) err = intakeErr.message;

      // Fisheries Receiving-Log QC flags (best-effort — never blocks the lot).
      if (!err) {
        const { error: qcErr } = await admin.from('spinytails_receiving_qc').insert({
          lot_id:              lotId,
          vessel_id:           vesselId,
          time_received:       new Date().toISOString(),
          product_type:        species,
          product_state:       state,
          core_surface_temp_f: coreTemp,
          egg_bearing:         bool(rq.egg_bearing),
          discoloration:       bool(rq.discoloration),
          softshell_damage:    bool(rq.softshell_damage),
          undersized:          bool(rq.undersized),
          odor:                bool(rq.odor),
          weight_lbs:          qty,
          lot_bag_no:          lotBagNo,
          recorded_by:         user.id,
        });
        if (qcErr) console.warn('receiving_qc insert failed (non-fatal):', qcErr.message);
      }
    }
  } catch (e) {
    err = e instanceof Error ? e.message : 'insert failed';
  }

  try {
    await admin.from('ai_writes').insert({
      tool:      'spinytails_receive',
      caller_id: user.id,
      input:     { species, vessel_id: vesselId, total_weight_lbs: qty, product_state: state },
      result:    { batch_number: batchNumber, lot_id: lotId, qc_pass: qcPass, role },
      status:    err ? 'error' : 'success',
      error:     err,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  if (err) return NextResponse.json({ ok: false, error: `Receiving failed: ${err}` }, { status: 500 });
  return NextResponse.json({
    ok: true,
    batch_number: batchNumber,
    lot_id: lotId,
    qc_pass: qcPass,
    decision,
    ccp_warnings: ccpWarnings,
    label: {
      batch_number: batchNumber,
      species:      sp.name,
      boat:         vessel.vessel_name ?? vessel.fisherman_name,
      captain:      vessel.captain_name ?? vessel.fisherman_name,
      registration: vessel.license_number,
      color_strap:  colorStrap,
      reused:       colorStrapReused,
      barcode:      lotBagNo,
      temp_f:       coreTemp,
      receipt_date: receiptDate,
    },
  });
}
