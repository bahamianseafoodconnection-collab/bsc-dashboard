// /api/processor/freezer-lots
//
// Card 3 (Remove from freezer) list. Returns the batches currently sitting in a
// freezer — status in ('in_receiving_freezer','blast_freezing','mastered') — each
// with the display context the processor needs to recognise it by eye:
//   batch · product · receipt date · boat · registration cert · catch location
// plus a weight reconcile (received − already-removed = remaining).
//
// Read-only, staff-gated, service-role (bypasses RLS so the list always assembles).

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver','qc_staff','operations']);
const IN_FREEZER = ['in_receiving_freezer', 'blast_freezing', 'mastered'];
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const uc = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: uErr } = await uc.auth.getUser();
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await uc.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !STAFF.has(role)) return NextResponse.json({ ok: false, error: 'Processing staff only.' }, { status: 403 });

  const admin: SupabaseClient = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: lots, error } = await admin.from('spinytails_lots')
    .select('id, batch_number, lot_code, status, receipt_date, species_code, vessel_id, holding_freezer_location')
    .in('status', IN_FREEZER)
    .order('receipt_date', { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const rows = (lots ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return NextResponse.json({ ok: true, lots: [] });

  const lotIds  = rows.map(r => r.id as string);
  const batches = rows.map(r => String(r.batch_number ?? r.lot_code ?? ''));
  const vesselIds = [...new Set(rows.map(r => r.vessel_id).filter(Boolean) as string[])];

  const [{ data: intakes }, { data: removals }, { data: vessels }, { data: species }] = await Promise.all([
    admin.from('spinytails_lot_intakes').select('lot_id, quantity_lbs, product_name, fishing_area').in('lot_id', lotIds),
    admin.from('spinytails_freezer_removals').select('lot_id, weight_removed_lbs').in('lot_id', lotIds),
    vesselIds.length ? admin.from('spinytails_vessels').select('id, vessel_name, fisherman_name, captain_name, license_number, registration_cert_url').in('id', vesselIds) : Promise.resolve({ data: [] }),
    admin.from('spinytails_species').select('code, name'),
  ]);

  const num = (v: unknown) => Number(v ?? 0) || 0;
  const recByLot = new Map<string, number>(), prodByLot = new Map<string, string>(), catchByLot = new Map<string, string>();
  for (const it of (intakes ?? []) as Array<{ lot_id: string; quantity_lbs: number | null; product_name: string | null; fishing_area: string | null }>) {
    recByLot.set(it.lot_id, (recByLot.get(it.lot_id) ?? 0) + num(it.quantity_lbs));
    if (it.product_name && !prodByLot.has(it.lot_id)) prodByLot.set(it.lot_id, it.product_name);
    if (it.fishing_area && !catchByLot.has(it.lot_id)) catchByLot.set(it.lot_id, it.fishing_area);
  }
  const remByLot = new Map<string, number>();
  for (const rm of (removals ?? []) as Array<{ lot_id: string | null; weight_removed_lbs: number | null }>) {
    if (rm.lot_id) remByLot.set(rm.lot_id, (remByLot.get(rm.lot_id) ?? 0) + num(rm.weight_removed_lbs));
  }
  const vById = new Map((vessels ?? []).map((v: Record<string, unknown>) => [v.id as string, v]));
  const spByCode = new Map((species ?? []).map((s: { code: string; name: string }) => [s.code, s.name]));

  const out = rows.map(r => {
    const id = r.id as string;
    const v = (r.vessel_id ? vById.get(r.vessel_id as string) : null) as Record<string, unknown> | null;
    const received = r2(recByLot.get(id) ?? 0);
    const removed  = r2(remByLot.get(id) ?? 0);
    return {
      lot_id: id,
      batch_number: (r.batch_number ?? r.lot_code) as string,
      status: r.status as string,
      receipt_date: r.receipt_date as string | null,
      product_name: prodByLot.get(id) ?? spByCode.get(r.species_code as string) ?? 'Product',
      species_name: spByCode.get(r.species_code as string) ?? null,
      catch_location: catchByLot.get(id) ?? null,
      current_freezer: r.holding_freezer_location as string | null,
      boat: (v?.vessel_name as string) ?? (v?.fisherman_name as string) ?? null,
      captain: (v?.captain_name as string) ?? (v?.fisherman_name as string) ?? null,
      registration: (v?.license_number as string) ?? null,
      registration_cert_url: (v?.registration_cert_url as string) ?? null,
      received_lbs: received,
      removed_lbs: removed,
      remaining_lbs: r2(received - removed),
    };
  });

  return NextResponse.json({ ok: true, lots: out });
}
