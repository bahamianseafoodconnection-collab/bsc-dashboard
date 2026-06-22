// /api/spinytails/recall/[batch]
//
// Recall + traceability lookup (Phase: recall). GET assembles the complete
// harvest→customer trace for a batch number in one call: fisherman/vessel,
// receiving + QC, freezer removals, processing + steps, sales (order
// consumption → customers), and export shipments (+ COI). POST marks the whole
// lot recalled (status='recalled' + reason) for an instant hold.
//
// qc_staff-gated; service-role read so the full chain resolves regardless of
// per-table RLS. The batch number is the single key — unchanged from receiving.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES = new Set(['founder','co_founder','control_admin','manager','processor','receiver','qc_staff','basic_admin']);

async function authed(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { error: 'Sign in required', status: 401 as const };
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { error: 'Invalid session', status: 401 as const };
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ROLES.has(role)) return { error: `Role "${role ?? 'none'}" cannot run recall.`, status: 403 as const };
  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return { admin, user, role };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ batch: string }> }) {
  const a = await authed(req);
  if ('error' in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const admin = a.admin as SupabaseClient;
  const batch = decodeURIComponent((await ctx.params).batch ?? '').trim();
  if (!batch) return NextResponse.json({ ok: false, error: 'batch required' }, { status: 400 });

  // Lot — accept batch_number OR legacy lot_code.
  const { data: lot } = await admin.from('spinytails_lots')
    .select('id, batch_number, lot_code, species_code, status, receipt_date, vessel_id')
    .or(`batch_number.eq.${batch},lot_code.eq.${batch}`).maybeSingle<{ id: string; batch_number: string | null; lot_code: string; species_code: string | null; status: string; receipt_date: string; vessel_id: string | null }>();
  if (!lot) return NextResponse.json({ ok: false, error: `No lot found for "${batch}"` }, { status: 404 });
  const lotId = lot.id;
  const bn = lot.batch_number ?? lot.lot_code;

  const [vessel, intakes, removals, processing, steps, sales, shipLots] = await Promise.all([
    lot.vessel_id ? admin.from('spinytails_vessels').select('vessel_code, vessel_name, fisherman_name, fisherman_phone, license_number').eq('id', lot.vessel_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('spinytails_lot_intakes').select('quantity_lbs, product_state, core_temp_f_at_receipt, fishing_area, fishing_date_start, fishing_date_end, num_bags, product_grade, product_name, qc_results, qc_pass, harvest_photos').eq('lot_id', lotId),
    admin.from('spinytails_freezer_removals').select('weight_removed_lbs, purpose, tray_number, rack_number, blast_freezer_location, removed_at').eq('batch_number', bn).order('removed_at'),
    admin.from('spinytails_processing_batches').select('lbs_in, lbs_graded, yield_pct, finished_product_name, finished_weight_lbs, packages_produced, processing_loss_lbs, tray_number, rack_number, blast_freezer_location, started_at, ended_at').eq('lot_id', lotId),
    admin.from('spinytails_processing_steps').select('step_no, step_name, weight_lbs, recorded_at').eq('lot_id', lotId).order('step_no'),
    admin.from('order_lot_consumption').select('order_id, product_id, quantity_lbs, recorded_at').eq('lot_id', lotId),
    admin.from('spinytails_shipment_lots').select('shipment_id, master_cartons, weight_lbs').eq('lot_id', lotId),
  ]);

  // Resolve sales → customers + products.
  const saleRows = (sales.data ?? []) as Array<{ order_id: string | null; product_id: string | null; quantity_lbs: number | null; recorded_at: string }>;
  const orderIds = [...new Set(saleRows.map((s) => s.order_id).filter((x): x is string => !!x))];
  const prodIds  = [...new Set(saleRows.map((s) => s.product_id).filter((x): x is string => !!x))];
  const [{ data: orders }, { data: prods }] = await Promise.all([
    orderIds.length ? admin.from('orders').select('id, order_type, customer_name, customer_phone, created_at').in('id', orderIds) : Promise.resolve({ data: [] as unknown[] }),
    prodIds.length ? admin.from('products').select('id, name, sku').in('id', prodIds) : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const oMap = new Map((orders ?? []).map((o) => [(o as { id: string }).id, o]));
  const pMap = new Map((prods ?? []).map((p) => [(p as { id: string }).id, p]));

  // Resolve shipments.
  const shipIds = [...new Set(((shipLots.data ?? []) as Array<{ shipment_id: string }>).map((s) => s.shipment_id))];
  const { data: shipments } = shipIds.length
    ? await admin.from('spinytails_shipments').select('id, shipment_number, shipped_at, destination_customer, destination_country, coi_number').in('id', shipIds)
    : { data: [] as unknown[] };
  const sMap = new Map((shipments ?? []).map((s) => [(s as { id: string }).id, s]));

  return NextResponse.json({
    ok: true,
    batch_number: bn,
    lot: { species_code: lot.species_code, status: lot.status, receipt_date: lot.receipt_date, lot_code: lot.lot_code },
    fisherman: vessel.data ?? null,
    receiving: (intakes.data ?? [])[0] ?? null,
    freezer_removals: removals.data ?? [],
    processing: processing.data ?? [],
    steps: steps.data ?? [],
    sales: saleRows.map((s) => ({
      ...s,
      order: s.order_id ? oMap.get(s.order_id) ?? null : null,
      product: s.product_id ? pMap.get(s.product_id) ?? null : null,
    })),
    shipments: ((shipLots.data ?? []) as Array<{ shipment_id: string; master_cartons: number | null; weight_lbs: number | null }>).map((sl) => ({
      ...sl, shipment: sMap.get(sl.shipment_id) ?? null,
    })),
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ batch: string }> }) {
  const a = await authed(req);
  if ('error' in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const admin = a.admin as SupabaseClient;
  const batch = decodeURIComponent((await ctx.params).batch ?? '').trim();
  let body: { reason?: unknown }; try { body = await req.json(); } catch { body = {}; }
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Recall initiated';

  const { data: lot } = await admin.from('spinytails_lots').select('id, status').or(`batch_number.eq.${batch},lot_code.eq.${batch}`).maybeSingle<{ id: string; status: string }>();
  if (!lot) return NextResponse.json({ ok: false, error: `No lot found for "${batch}"` }, { status: 404 });

  const { error } = await admin.from('spinytails_lots').update({ status: 'recalled', recall_reason: reason }).eq('id', lot.id);
  if (error) return NextResponse.json({ ok: false, error: `Recall failed: ${error.message}` }, { status: 500 });
  try {
    await admin.from('ai_writes').insert({ tool: 'spinytails_recall', caller_id: (a.user as { id: string }).id, input: { batch, reason }, result: { lot_id: lot.id }, status: 'success', error: null });
  } catch { /* non-fatal */ }
  return NextResponse.json({ ok: true, status: 'recalled' });
}
