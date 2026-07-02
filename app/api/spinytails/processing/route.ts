// /api/spinytails/processing
//
// Processing Station device endpoint (Phase 3). One route, nine actions:
//   • blast_temp — blast-freezer start temp log vs −10°F (start of the 24h clock).
//   • grade — LOBSTER walk-in grading: per-size counts → one spinytails_cases row
//     per 10-lb box + inventory 'in' (0°F holding) + lot → 'mastered'.
//   • pack_conch — CONCH master-case packing: clean spec (80/90/95%) + 15/20/50-lb
//     cases → spinytails_cases (product_type='conch') + inventory 'in' + 'mastered'.
//   • freezer_removal — record a freezer pull (purpose + tray/rack/freezer) and
//     reconcile weight: received vs already-removed vs remaining.
//   • pull    — pull from holding: starts the expiry clock (date_pulled +
//     best_used_by = date_pulled + species.shelf_life_months), routes by
//     destination ('processing' → thawing, 'retail' → in_distribution).
//   • defrost_temp — ice-bath (thaw_vat) hourly temperature log vs 32°F.
//   • start    — begin processing a batch. Sets lot status='processing'; the
//     DB partial-unique index (uq_spinytails_one_processing) enforces NO BATCH
//     MIXING — only one lot may be 'processing' at a time. A 2nd start fails.
//   • step     — record an ordered processing step (from the species steps).
//   • complete — finish: finished name/weight/#packages/tray/rack/freezer →
//     yield% (generated), processing loss, remaining raw; releases the lock.
//
// qc_staff-gated, service-role, audited. Batch number is permanent + unchanged.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES = new Set(['founder','co_founder','control_admin','manager','processor','receiver','qc_staff']);
const r2 = (n: number) => Math.round(n * 100) / 100;

async function receivedLbs(admin: SupabaseClient, lotId: string): Promise<number> {
  const { data } = await admin.from('spinytails_lot_intakes').select('quantity_lbs').eq('lot_id', lotId);
  return (data ?? []).reduce((s: number, r) => s + Number((r as { quantity_lbs: number | null }).quantity_lbs ?? 0), 0);
}
async function removedLbs(admin: SupabaseClient, batchNumber: string): Promise<number> {
  const { data } = await admin.from('spinytails_freezer_removals').select('weight_removed_lbs').eq('batch_number', batchNumber);
  return (data ?? []).reduce((s: number, r) => s + Number((r as { weight_removed_lbs: number | null }).weight_removed_lbs ?? 0), 0);
}

export async function POST(req: NextRequest) {
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
  if (!role || !ROLES.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot process.` }, { status: 403 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const action = String(b.action ?? '');
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const bool = (v: unknown) => v === true;
  const lotId = str(b.lot_id);
  const batch = str(b.batch_number);
  if (!lotId || !batch) return NextResponse.json({ ok: false, error: 'lot_id + batch_number required' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const nowIso = new Date().toISOString();
  let resp: Record<string, unknown> = {};
  let err: string | null = null;

  try {
    if (action === 'freezer_removal') {
      const wt = num(b.weight_removed_lbs);
      if (!(wt && wt > 0)) return NextResponse.json({ ok: false, error: 'weight removed must be > 0' }, { status: 400 });
      const received = await receivedLbs(admin, lotId);
      const already = await removedLbs(admin, batch);
      const remainingBefore = r2(received - already);
      const overdraw = wt > remainingBefore + 0.001;
      const { error } = await admin.from('spinytails_freezer_removals').insert({
        batch_number: batch, lot_id: lotId, product_name: str(b.product_name),
        weight_removed_lbs: wt, storage_location: str(b.storage_location),
        tray_number: str(b.tray_number), rack_number: str(b.rack_number),
        blast_freezer_location: str(b.blast_freezer_location), purpose: str(b.purpose) ?? 'processing',
        employee_id: user.id, device_id: str(b.device_id),
      });
      if (error) err = error.message;
      else resp = { received_lbs: received, removed_total_lbs: r2(already + wt), remaining_lbs: r2(received - already - wt), overdraw };

    } else if (action === 'start') {
      const start = num(b.starting_weight_lbs);
      // NO-MIXING: flip status to processing — DB unique index blocks a 2nd lot.
      const { error: stErr } = await admin.from('spinytails_lots').update({ status: 'processing' }).eq('id', lotId);
      if (stErr) {
        err = stErr.code === '23505'
          ? 'Another batch is already in PROCESSING. Finish it first — no batch mixing.'
          : stErr.message;
      } else {
        const { data: pb, error: pbErr } = await admin.from('spinytails_processing_batches')
          .insert({ lot_id: lotId, started_at: nowIso, lbs_in: start, supervisor_id: user.id }).select('id').single();
        if (pbErr) err = pbErr.message; else resp = { processing_batch_id: (pb as { id: string }).id };
      }

    } else if (action === 'step') {
      const { error } = await admin.from('spinytails_processing_steps').insert({
        batch_number: batch, lot_id: lotId, step_no: num(b.step_no) ?? 1,
        step_name: str(b.step_name) ?? 'Step', weight_lbs: num(b.weight_lbs),
        employee_id: user.id, device_id: str(b.device_id),
      });
      if (error) err = error.message; else resp = { recorded: true };

    } else if (action === 'complete') {
      const pbId = str(b.processing_batch_id);
      const finished = num(b.finished_weight_lbs);
      if (!pbId) return NextResponse.json({ ok: false, error: 'processing_batch_id required' }, { status: 400 });
      const { data: pb } = await admin.from('spinytails_processing_batches').select('lbs_in').eq('id', pbId).maybeSingle<{ lbs_in: number | null }>();
      const lbsIn = Number(pb?.lbs_in ?? 0);
      const loss = finished != null && lbsIn > 0 ? r2(lbsIn - finished) : null;
      const { error } = await admin.from('spinytails_processing_batches').update({
        ended_at: nowIso, lbs_graded: finished, finished_weight_lbs: finished,
        finished_product_name: str(b.finished_product_name), packages_produced: num(b.packages_produced),
        tray_number: str(b.tray_number), rack_number: str(b.rack_number),
        blast_freezer_location: str(b.blast_freezer_location), processing_loss_lbs: loss, sign_off_at: nowIso,
      }).eq('id', pbId);
      if (error) err = error.message;
      else {
        // Processing done → blast freezing. Releases the no-mixing lock.
        await admin.from('spinytails_lots').update({ status: 'blast_freezing' }).eq('id', lotId);
        const received = await receivedLbs(admin, lotId);
        const removed = await removedLbs(admin, batch);
        resp = {
          yield_pct: lbsIn > 0 && finished != null ? r2((finished / lbsIn) * 100) : null,
          processing_loss_lbs: loss, remaining_raw_lbs: r2(received - removed),
        };
      }
    } else if (action === 'pull') {
      // PULL FROM HOLDING → starts the expiry clock. Records the freezer pull,
      // stamps date_pulled + best_used_by (= date_pulled + species.shelf_life_months),
      // and routes by destination: 'processing' → thawing (defrost), 'retail' →
      // in_distribution (skip processing, direct shipment).
      const wt = num(b.pulled_weight_lbs) ?? num(b.weight_removed_lbs);
      const destination = b.destination === 'retail' ? 'retail' : 'processing';
      const pulledAt = str(b.pulled_at) ?? nowIso;

      // Shelf life from the lot's species (default 24 months).
      const { data: lotRow } = await admin.from('spinytails_lots').select('species_code').eq('id', lotId).maybeSingle<{ species_code: string | null }>();
      let months = 24;
      if (lotRow?.species_code) {
        const { data: spRow } = await admin.from('spinytails_species').select('shelf_life_months').eq('code', lotRow.species_code).maybeSingle<{ shelf_life_months: number | null }>();
        if (spRow?.shelf_life_months) months = spRow.shelf_life_months;
      }
      const bub = new Date(pulledAt);
      bub.setMonth(bub.getMonth() + months);
      const bestUsedBy = bub.toISOString().slice(0, 10);

      // Record the freezer removal (best-effort weight reconcile). `reason`
      // (defrost_for_processing / bsc_sales / external_order) is captured as the
      // purpose so the audit shows WHY; `storage_location` carries the freezer
      // it was pulled from (Holding / Blast).
      if (wt && wt > 0) {
        await admin.from('spinytails_freezer_removals').insert({
          batch_number: batch, lot_id: lotId, product_name: str(b.product_name),
          weight_removed_lbs: wt,
          purpose: str(b.reason) ?? (destination === 'retail' ? 'retail' : 'processing'),
          storage_location: str(b.storage_location), employee_id: user.id, device_id: str(b.device_id),
        });
      }
      const { error } = await admin.from('spinytails_lots').update({
        date_pulled:  pulledAt,
        best_used_by: bestUsedBy,
        status:       destination === 'retail' ? 'in_distribution' : 'thawing',
      }).eq('id', lotId);
      if (error) err = error.message;
      else resp = { date_pulled: pulledAt, best_used_by: bestUsedBy, shelf_life_months: months, destination, pulled_weight_lbs: wt };

    } else if (action === 'devein') {
      // DEVEINING (Card 5). Records the deveining step + a REQUIRED bath
      // temperature (kept cold — target ≤40°F). Both are stamped + tied to the
      // batch/boat via the lot. Status is left unchanged (line-stage step).
      const reading = num(b.reading_f);
      if (reading == null) return NextResponse.json({ ok: false, error: 'Bath temperature is required for deveining.' }, { status: 400 });
      const target = 40;
      const tol = num(b.tolerance_f) ?? 5;
      const within = reading <= target + tol;
      const { error: tErr } = await admin.from('spinytails_temperature_logs').insert({
        logged_at:      str(b.logged_at) ?? nowIso,
        location:       'processing_bath',
        lot_id:         lotId,
        reading_f:      reading,
        within_limit:   within,
        recorded_by:    user.id,
        action_if_fail: within ? null : (str(b.action_if_fail) ?? 'Deveining bath above target — add ice / chill product toward ≤40°F.'),
        notes:          'Deveining bath',
      });
      if (tErr) err = tErr.message;
      else {
        const { error: sErr } = await admin.from('spinytails_processing_steps').insert({
          batch_number: batch, lot_id: lotId, step_no: num(b.step_no) ?? 10,
          step_name: 'Deveining', weight_lbs: num(b.weight_lbs), employee_id: user.id, device_id: str(b.device_id),
        });
        if (sErr) err = sErr.message;
        else resp = { step: 'Deveining', bath_temp_f: reading, within_limit: within, target_f: target };
      }

    } else if (action === 'blast_in') {
      // BLAST FREEZER IN (Card 7). Records the blast-in start temperature
      // (target ≤ −10°F to start the 24h clock; the named blast freezer goes in
      // the log notes since lots has no blast-location column) and flips the lot
      // to 'blast_freezing'. Time/date stamped, tied to batch/boat.
      const reading = num(b.reading_f);
      if (reading == null) return NextResponse.json({ ok: false, error: 'Blast-freezer temperature is required.' }, { status: 400 });
      const blastLoc = str(b.blast_freezer_location);
      const target = -10;
      const tol = num(b.tolerance_f) ?? 2;
      const within = reading <= target + tol;
      const { error: tErr } = await admin.from('spinytails_temperature_logs').insert({
        logged_at:      str(b.logged_at) ?? nowIso,
        location:       'blast_freezer',
        lot_id:         lotId,
        reading_f:      reading,
        within_limit:   within,
        recorded_by:    user.id,
        action_if_fail: within ? null : (str(b.action_if_fail) ?? 'Blast not at −10°F — verify freezer; do not start the 24h clock until reached.'),
        notes:          `Blast-in start${blastLoc ? ` · ${blastLoc}` : ''}`,
      });
      if (tErr) err = tErr.message;
      else {
        const { error: uErr } = await admin.from('spinytails_lots').update({ status: 'blast_freezing' }).eq('id', lotId);
        if (uErr) err = uErr.message;
        else resp = { status: 'blast_freezing', blast_temp_f: reading, within_limit: within, target_f: target, blast_freezer: blastLoc };
      }

    } else if (action === 'sleeve') {
      // SLEEVING (Card 6). Time/date-stamped processing step, tied to the
      // batch/boat via the lot. No bath temp. Status unchanged (line-stage step).
      const { error: sErr } = await admin.from('spinytails_processing_steps').insert({
        batch_number: batch, lot_id: lotId, step_no: num(b.step_no) ?? 20,
        step_name: 'Sleeving', weight_lbs: num(b.weight_lbs), employee_id: user.id, device_id: str(b.device_id),
      });
      if (sErr) err = sErr.message; else resp = { step: 'Sleeving', at: nowIso };

    } else if (action === 'defrost_temp') {
      // Ice-bath (thaw_vat) hourly temperature log. Target 32°F ± tolerance.
      const reading = num(b.reading_f);
      if (reading == null) return NextResponse.json({ ok: false, error: 'reading_f required' }, { status: 400 });
      const target = 32;
      const tol = num(b.tolerance_f) ?? 3;
      const within = Math.abs(reading - target) <= tol;
      const { error } = await admin.from('spinytails_temperature_logs').insert({
        logged_at:     str(b.logged_at) ?? nowIso,
        location:      'thaw_vat',
        lot_id:        lotId,
        reading_f:     reading,
        within_limit:  within,
        recorded_by:   user.id,
        action_if_fail: within ? null : (str(b.action_if_fail) ?? 'Add ice / adjust bath toward 32°F; re-check.'),
        notes:         str(b.notes),
      });
      if (error) err = error.message;
      else resp = { within_limit: within, target_f: target, reading_f: reading };

    } else if (action === 'blast_temp') {
      // Blast-freezer start temperature. Target −10°F (must be at/below to start
      // the 24h blast clock). Logged to temperature_logs at blast_freezer.
      const reading = num(b.reading_f);
      if (reading == null) return NextResponse.json({ ok: false, error: 'reading_f required' }, { status: 400 });
      const target = -10;
      const tol = num(b.tolerance_f) ?? 2;
      const within = reading <= target + tol;
      const { error } = await admin.from('spinytails_temperature_logs').insert({
        logged_at:      str(b.logged_at) ?? nowIso,
        location:       'blast_freezer',
        lot_id:         lotId,
        reading_f:      reading,
        within_limit:   within,
        recorded_by:    user.id,
        action_if_fail: within ? null : (str(b.action_if_fail) ?? 'Blast not at −10°F — verify freezer; do not start the 24h clock until reached.'),
        notes:          str(b.notes),
      });
      if (error) err = error.message;
      else resp = { within_limit: within, target_f: target, reading_f: reading };

    } else if (action === 'grade') {
      // WALK-IN GRADING → box. Records per-size grade counts (spinytails_batch_grades),
      // creates one spinytails_cases row per 10-lb box, logs an inventory 'in'
      // movement into 0°F holding, flips the lot to 'mastered'. Optional walk-in temp.
      let pbId = str(b.processing_batch_id);
      if (!pbId) {
        const { data: pb } = await admin.from('spinytails_processing_batches')
          .select('id').eq('lot_id', lotId).order('started_at', { ascending: false }).limit(1).maybeSingle<{ id: string }>();
        pbId = pb?.id ?? null;
      }
      const grades = Array.isArray(b.grades) ? b.grades as Array<Record<string, unknown>> : [];
      const productType = str(b.product_type) ?? 'lobster';
      const freezerLoc  = str(b.holding_freezer_location) ?? str(b.freezer_location);
      const sulfite     = bool(b.sulfite);

      // Optional walk-in temperature (processing room, when pulled from blast).
      const walkinTemp = num(b.walkin_temp_f);
      if (walkinTemp != null) {
        await admin.from('spinytails_temperature_logs').insert({
          logged_at: nowIso, location: 'processing_room_ambient', lot_id: lotId,
          reading_f: walkinTemp, within_limit: true, recorded_by: user.id, notes: 'Walk-in grading pull',
        });
      }

      // Lot context → case fields (best-used-by, packed_by, certs).
      const { data: lotRow } = await admin.from('spinytails_lots')
        .select('best_used_by, date_pulled, cites_cert_no, inspection_cert_no')
        .eq('id', lotId).maybeSingle<{ best_used_by: string | null; date_pulled: string | null; cites_cert_no: string | null; inspection_cert_no: string | null }>();
      const packedBy = lotRow?.date_pulled ? String(lotRow.date_pulled).slice(0, 10) : nowIso.slice(0, 10);

      const casesToInsert: Record<string, unknown>[] = [];
      const gradeRows: Record<string, unknown>[] = [];
      let boxedLbs = 0;
      for (const g of grades) {
        const grade = str(g.grade);
        const boxes = num(g.box_count) ?? 0;
        if (!grade || boxes <= 0) continue;
        const wt = num(g.weight_lbs) ?? boxes * 10;
        if (pbId) gradeRows.push({ batch_id: pbId, grade, weight_lbs: wt, box_count: boxes });
        for (let i = 1; i <= boxes; i++) {
          const caseCode = `${batch}-${grade}-${String(i).padStart(2, '0')}`;
          casesToInsert.push({
            lot_id: lotId, case_code: caseCode, product_type: productType, grade,
            net_weight_lbs: 10, sulfite, packed_by: packedBy, best_used_by: lotRow?.best_used_by ?? null,
            cites_cert_no: lotRow?.cites_cert_no ?? null, inspection_cert_no: lotRow?.inspection_cert_no ?? null,
            barcode: caseCode, freezer_location: freezerLoc, status: 'in_holding', created_by: user.id,
          });
          boxedLbs += 10;
        }
      }
      if (casesToInsert.length === 0) return NextResponse.json({ ok: false, error: 'Enter at least one graded size with a box count.' }, { status: 400 });

      if (gradeRows.length) await admin.from('spinytails_batch_grades').insert(gradeRows);
      const { data: insertedCases, error } = await admin.from('spinytails_cases').insert(casesToInsert).select('id, case_code, grade');
      if (error) err = error.message;
      else {
        const inserted = (insertedCases ?? []) as Array<{ id: string; case_code: string; grade: string }>;
        await admin.from('spinytails_inventory').insert(inserted.map((c) => ({
          lot_id: lotId, case_id: c.id, direction: 'in', freezer: 'holding',
          product_type: productType, grade: c.grade, qty_cases: 1,
          scanned_barcode: c.case_code, employee_id: user.id,
        })));
        await admin.from('spinytails_lots').update({ status: 'mastered', holding_freezer_location: freezerLoc }).eq('id', lotId);
        const received = await receivedLbs(admin, lotId);
        resp = { cases_created: inserted.length, boxed_lbs: boxedLbs, received_lbs: received, yield_lbs: r2(received - boxedLbs), cases: inserted };
      }

    } else if (action === 'pack_conch') {
      // CONCH master-case packing. Cleaning spec (80/90/95%) + case sizes
      // (15/20/50 lb, count each) → one spinytails_cases row per master case +
      // inventory 'in' into 0°F holding; lot → 'mastered'. Optional walk-in temp
      // + cleaned weight.
      let pbId = str(b.processing_batch_id);
      if (!pbId) {
        const { data: pb } = await admin.from('spinytails_processing_batches')
          .select('id').eq('lot_id', lotId).order('started_at', { ascending: false }).limit(1).maybeSingle<{ id: string }>();
        pbId = pb?.id ?? null;
      }
      const cleanPct   = num(b.conch_clean_pct);
      const packs      = Array.isArray(b.packs) ? b.packs as Array<Record<string, unknown>> : [];
      const freezerLoc = str(b.holding_freezer_location) ?? str(b.freezer_location);
      if (cleanPct == null || ![80, 90, 95].includes(cleanPct)) {
        return NextResponse.json({ ok: false, error: 'conch_clean_pct must be 80, 90 or 95.' }, { status: 400 });
      }

      const walkinTemp = num(b.walkin_temp_f);
      if (walkinTemp != null) {
        await admin.from('spinytails_temperature_logs').insert({
          logged_at: nowIso, location: 'processing_room_ambient', lot_id: lotId,
          reading_f: walkinTemp, within_limit: true, recorded_by: user.id, notes: 'Conch pack / walk-in pull',
        });
      }

      const { data: lotRow } = await admin.from('spinytails_lots')
        .select('best_used_by, date_pulled, cites_cert_no, inspection_cert_no')
        .eq('id', lotId).maybeSingle<{ best_used_by: string | null; date_pulled: string | null; cites_cert_no: string | null; inspection_cert_no: string | null }>();
      const packedBy = lotRow?.date_pulled ? String(lotRow.date_pulled).slice(0, 10) : nowIso.slice(0, 10);

      const casesToInsert: Record<string, unknown>[] = [];
      let boxedLbs = 0;
      for (const p of packs) {
        const nw = num(p.net_weight_lbs);
        const count = num(p.count) ?? 0;
        if (!nw || nw <= 0 || count <= 0) continue;
        for (let i = 1; i <= count; i++) {
          const caseCode = `${batch}-${nw}LB-${String(i).padStart(2, '0')}`;
          casesToInsert.push({
            lot_id: lotId, case_code: caseCode, product_type: 'conch', grade: null,
            conch_clean_pct: cleanPct, net_weight_lbs: nw, packed_by: packedBy, best_used_by: lotRow?.best_used_by ?? null,
            cites_cert_no: lotRow?.cites_cert_no ?? null, inspection_cert_no: lotRow?.inspection_cert_no ?? null,
            barcode: caseCode, freezer_location: freezerLoc, status: 'in_holding', created_by: user.id,
          });
          boxedLbs += nw;
        }
      }
      if (casesToInsert.length === 0) return NextResponse.json({ ok: false, error: 'Enter at least one case size with a count.' }, { status: 400 });

      // Record the cleaned weight as a processing step for the yield trail.
      const cleanedWeight = num(b.cleaned_weight_lbs);
      if (pbId && cleanedWeight != null) {
        await admin.from('spinytails_processing_steps').insert({
          batch_number: batch, lot_id: lotId, step_no: 99, step_name: `clean ${cleanPct}%`, weight_lbs: cleanedWeight, employee_id: user.id,
        });
      }

      const { data: insertedCases, error } = await admin.from('spinytails_cases').insert(casesToInsert).select('id, case_code, net_weight_lbs');
      if (error) err = error.message;
      else {
        const inserted = (insertedCases ?? []) as Array<{ id: string; case_code: string; net_weight_lbs: number }>;
        await admin.from('spinytails_inventory').insert(inserted.map((c) => ({
          lot_id: lotId, case_id: c.id, direction: 'in', freezer: 'holding',
          product_type: 'conch', grade: null, qty_cases: 1, scanned_barcode: c.case_code, employee_id: user.id,
        })));
        await admin.from('spinytails_lots').update({ status: 'mastered', holding_freezer_location: freezerLoc }).eq('id', lotId);
        const received = await receivedLbs(admin, lotId);
        resp = { cases_created: inserted.length, boxed_lbs: boxedLbs, received_lbs: received, yield_lbs: r2(received - boxedLbs), clean_pct: cleanPct, cases: inserted };
      }

    } else {
      return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
    }
  } catch (e) {
    err = e instanceof Error ? e.message : 'processing failed';
  }

  try {
    await admin.from('ai_writes').insert({
      tool: 'spinytails_processing', caller_id: user.id,
      input: { action, batch_number: batch }, result: { ...resp, role },
      status: err ? 'error' : 'success', error: err,
    });
  } catch { /* non-fatal */ }

  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 });
  return NextResponse.json({ ok: true, ...resp });
}
