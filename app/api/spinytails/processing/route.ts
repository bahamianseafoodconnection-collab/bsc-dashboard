// /api/spinytails/processing
//
// Processing Station device endpoint (Phase 3). One route, four actions:
//   • freezer_removal — record a freezer pull (purpose + tray/rack/freezer) and
//     reconcile weight: received vs already-removed vs remaining.
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
