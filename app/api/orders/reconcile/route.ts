// POST /api/orders/reconcile
//
// Records the bank's transfer/settlement ID against an order's payment and
// marks it reconciled (who + when), so staff can track each payment against
// the bank "exchange". Reuses existing orders columns — NO schema change:
//   payment_approval        = the bank transfer ID (matches our payment ID)
//   payment_received_at/by  = reconciliation audit (timestamp + staff uuid)
//   payment_received_method = 'wire'
//   payment_received_notes  = optional note
//
// Staff-only + service-role (orders RLS is owner/staff-locked, and money
// confirmation must never be client-writable). Pass { unreconcile: true } to
// clear a mistaken match.
//
// CARD-PAID FALLBACK (added): an online card order's only automatic path to a
// paid state is a successful Plug'n Pay browser-return — which is lossy (the
// customer can close the tab before the redirect lands, stranding the order at
// 'payment_pending' even though the money cleared at RBC). This route is the
// reliable fallback: when staff enter the bank trace for a still-'payment_pending'
// order, we ALSO flip it to 'paid' and raise its resale supplier POs — the same
// side-effects the return-handler performs — so a stranded card order is fully
// recovered by the manual reconcile that always happens at next-day settlement.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { raiseResalePurchaseOrdersForOrder } from '@/lib/procurement/raise-resale-purchase-orders';
import { CHANNEL_MARGIN, VAT_RATE, recordSaleFinancials } from '@/lib/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RECON_ROLES = new Set(['founder', 'co_founder', 'manager', 'control_admin', 'basic_admin']);

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
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  }
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !RECON_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot reconcile payments.` }, { status: 403 });
  }

  let body: { order_id?: unknown; bank_transfer_id?: unknown; notes?: unknown; unreconcile?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const orderId = typeof body.order_id === 'string' ? body.order_id : '';
  if (!orderId) return NextResponse.json({ ok: false, error: 'order_id is required' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Clear a mistaken match.
  if (body.unreconcile === true) {
    const { error } = await admin.from('orders').update({
      payment_approval:        null,
      payment_received_at:     null,
      payment_received_by:     null,
      payment_received_method: null,
    }).eq('id', orderId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, reconciled: false });
  }

  const bankTransferId = typeof body.bank_transfer_id === 'string' ? body.bank_transfer_id.trim() : '';
  if (!bankTransferId) {
    return NextResponse.json({ ok: false, error: 'bank_transfer_id is required' }, { status: 400 });
  }
  const notes  = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
  const nowIso = new Date().toISOString();

  // payment_received_method = 'wire' — the orders CHECK constraint allows
  // cash / card / wire / check / offset. Bank transfers from RBC settlement
  // are wires, so 'wire' tags the method correctly for the audit trail.
  const update: Record<string, unknown> = {
    payment_approval:        bankTransferId,
    payment_received_at:     nowIso,
    payment_received_by:     user.id,
    payment_received_method: 'wire',
  };
  if (notes) update.payment_received_notes = notes;

  const { error } = await admin.from('orders').update(update).eq('id', orderId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Auto-advance fulfillment status: confirming the bank trace IS the
  // confirmation step. A pending order moves to 'Confirmed' so it leaves the
  // pending area and queues up for packing. Already-advanced orders are left
  // alone (don't regress packing → confirmed).
  let statusChangedTo: string | null = null;
  const { data: cur } = await admin.from('orders').select('status').eq('id', orderId).maybeSingle();
  const curStatus = ((cur as { status?: string | null } | null)?.status ?? '').toLowerCase();
  if (curStatus === '' || curStatus === 'pending') {
    const { error: stErr } = await admin.from('orders').update({ status: 'Confirmed' }).eq('id', orderId);
    if (!stErr) statusChangedTo = 'Confirmed';
  }

  // CARD-PAID FLIP + RESALE PO RAISE (idempotent fallback).
  //
  // ATOMIC one-time transition, identical guard pattern to the Plug'n Pay
  // return-handler: flip the order to 'paid' ONLY if it is still
  // 'payment_pending'. The conditional WHERE + RETURNING is the idempotency
  // guard — if the order already reached 'paid' (e.g. the browser-return DID
  // land and already raised the POs), this updates ZERO rows, so the PO raise
  // below does NOT run a second time. Only when WE win the flip (the order was
  // genuinely stranded at 'payment_pending') do we raise the resale POs.
  //
  // The shared raiseResalePurchaseOrdersForOrder also carries its own
  // per-(order_id, supplier_id) idempotency SELECT, so this is double-guarded.
  let paidFlipped = false;
  const { data: flipped, error: flipErr } = await admin.from('orders')
    .update({ payment_status: 'paid' })
    .eq('id', orderId)
    .eq('payment_status', 'payment_pending')
    .select('id, total, items, wholesale_items');

  if (!flipErr && flipped && flipped.length > 0) {
    paidFlipped = true;
    const paidRow = flipped[0] as { id: string; total: number | null; items: unknown; wholesale_items: unknown };

    // (1) Financial split — parity with the Plug'n Pay return-handler's paid
    // branch. A card order recovered HERE (because the browser-return was lost)
    // must still land its revenue/profit in the financials table, or the very
    // "stranded card order" case this route exists to recover would be
    // undercounted. Same basis as the return-handler: cost = total / (1+margin)
    // / (1+VAT). VAT currently disabled (VAT_RATE=0). Best-effort, never throws.
    try {
      const total = Number(paidRow.total ?? 0);
      if (total > 0) {
        const onlineToCost = 1 / ((1 + CHANNEL_MARGIN.online_market) * (1 + VAT_RATE));
        await recordSaleFinancials({
          saleAmount: total,
          costBasis:  total * onlineToCost,
          channel:    'online_market',
          orderId:    orderId,
        });
      }
    } catch (finErr) {
      console.warn('[reconcile] financials log failed on card-paid flip:', finErr);
    }

    // (2) Resale PO raise — best-effort: a PO failure must never fail the
    // reconcile (the money side is already recorded above). Never throws; also
    // carries its own per-(order_id, supplier_id) idempotency SELECT.
    await raiseResalePurchaseOrdersForOrder(admin, orderId, paidRow);
  }

  return NextResponse.json({
    ok: true,
    reconciled: true,
    reconciled_at: nowIso,
    bank_transfer_id: bankTransferId,
    status_changed_to: statusChangedTo,
    paid_flipped: paidFlipped,
  });
}
