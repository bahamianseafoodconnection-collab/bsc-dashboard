// lib/plugnpay/return-handler.ts
//
// Shared handler for the three /api/payment/return/* routes. PnP
// redirects the customer's browser to one of three URLs based on
// outcome (success / bad_card / problem) — but the AUTHORITATIVE
// outcome is determined here by inspecting the data PnP sends, not
// by which URL they hit. A malicious user could try to hit
// /api/payment/return/success directly with no real payment; the
// hash verification + Query Transaction belt-and-suspenders catch it.
//
// Flow per request:
//   1. Parse params from POST body (form-urlencoded) or GET query.
//      PnP picks POST if the URL is script-style, GET if .html — we
//      accept both since our /api/payment/return/* routes are scripts
//      but the doc wording is ambiguous about /api/ paths.
//   2. Verify SHA256 hash (first factor) via lib/plugnpay.
//   3. Call queryTransaction() for the server-to-server second factor.
//   4. Map the RBC processor code to a customer-facing outcome via
//      lib/plugnpay/rbc-codes.
//   5. Insert a finalized payment_transactions row (every attempt
//      logged — success and fail alike).
//   6. Update orders.payment_status via an ATOMIC guarded transition:
//        approved → flip to 'paid' WHERE payment_status IN
//          ('payment_pending','pending'), RETURNING the row. The
//          conditional WHERE makes it idempotent: a duplicate PnP return
//          updates zero rows (the order is already 'paid', not in the set),
//          so the one-time side-effects below run AT MOST ONCE per order.
//          The set includes 'pending' because /api/payment/start accepts a
//          reverted 'pending'/'declined' order against the SAME id and its
//          re-arm to 'payment_pending' is an unchecked write — so an order
//          can legitimately reach this success return still in 'pending'.
//          Without 'pending' in the set, that order would be charged but
//          never flipped to paid (no fulfilment, no financials, no POs).
//        anything else → flip to 'pending' WHERE payment_status IN
//          ('payment_pending','pending') (so a late decline can't clobber an
//          already-'paid' order); customer can retry from /checkout.
//   6b. ONE-TIME side-effects, only when THIS call actually flipped the row:
//        • financial split (deferred from /checkout so abandoned card forms
//          don't log phantom revenue)
//        • resale purchase-order auto-raise (deferred from /api/orders/place
//          for card orders, which are unpaid at placement — never raise a
//          supplier PO against an unpaid order)
//   7. Redirect customer's browser:
//        approved → /order-confirmed?order=<id>
//        fraud/declined/contact → /payment-declined?reason=declined
//        retry/problem → /payment-declined?reason=problem
//
// PCI: no card data anywhere in this file. PAN never touched bscbahamas.com.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { verifyResponseHash, queryTransaction, parseUrlEncodedResponse } from './index';
import { rbcOutcome } from './rbc-codes';
import { CHANNEL_MARGIN, VAT_RATE, recordSaleFinancials } from '@/lib/finance';

export type ReturnHint = 'success' | 'declined' | 'problem';

// Statuses an order can legitimately be in at the moment a PnP return fires.
// /api/orders/place sets card orders to 'payment_pending'; a prior decline can
// have reverted it to 'pending'; and /api/payment/start (which re-arms to
// 'payment_pending') does so with an unchecked write, so 'pending' is reachable
// here too. Used by BOTH the paid-flip and the revert so neither can touch an
// order already in a terminal 'paid' state — and so a re-paid 'pending' order
// is never left charged-but-unpaid.
const PAYABLE_STATUSES = ['payment_pending', 'pending'] as const;

// Spiny Tail Processing Co. supplier id — in-house lines are excluded from
// resale auto-raise (mirrors the constant in /api/orders/place; kept local so
// this handler is self-contained on the payment hot path).
const SPINY_TAIL_SUPPLIER_ID = '001cbec9-e4e8-421d-8dc3-3a1ebd7b50a1';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Reads request body / query into a flat Record<string,string>. */
async function readReturnFields(req: NextRequest): Promise<Record<string, string>> {
  const fields: Record<string, string> = {};
  if (req.method === 'POST') {
    const ct = (req.headers.get('content-type') ?? '').toLowerCase();
    try {
      if (ct.includes('application/x-www-form-urlencoded')) {
        const form = await req.formData();
        for (const [k, v] of form.entries()) fields[k] = typeof v === 'string' ? v : '';
      } else if (ct.includes('application/json')) {
        const json = await req.json();
        for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
          if (typeof v === 'string') fields[k] = v;
          else if (v != null) fields[k] = String(v);
        }
      } else {
        const text = await req.text();
        Object.assign(fields, parseUrlEncodedResponse(text));
      }
    } catch {
      // Swallow parse errors — we'll handle missing-fields below.
    }
  }
  // Also merge query string params (in case PnP appends some on the URL
  // even on POST, which their docs hint they might).
  for (const [k, v] of req.nextUrl.searchParams.entries()) {
    if (!(k in fields)) fields[k] = v;
  }
  return fields;
}

/** Reads the hash field — PnP uses both names (legacy `resphash` + newer `pt_transaction_response_hash`). */
function readHash(fields: Record<string, string>): string {
  return fields.pt_transaction_response_hash || fields.resphash || '';
}

// Raise resale purchase orders for a freshly-PAID card order. Deferred here from
// /api/orders/place because card orders are unpaid ('payment_pending') at
// placement. Reads the order's stamped line items — supplier_id +
// is_bsc_processed + cost_per_unit were stamped onto each line at placement, so
// no re-pricing is needed. Any resale line MISSING that routing (e.g. an order
// placed before stamping shipped) is re-derived from product_costs + products in
// a single round-trip. Best-effort: failures are logged, never thrown — the
// order is already paid and must stand.
async function raiseResalePurchaseOrdersForOrder(
  admin: SupabaseClient,
  orderId: string,
  paidRow: { items?: unknown; wholesale_items?: unknown },
): Promise<void> {
  try {
    const items = Array.isArray(paidRow.items) && (paidRow.items as unknown[]).length > 0
      ? paidRow.items as Record<string, unknown>[]
      : Array.isArray(paidRow.wholesale_items)
        ? paidRow.wholesale_items as Record<string, unknown>[]
        : [];
    if (items.length === 0) return;

    // Identify lines whose routing wasn't stamped at placement (older orders).
    // A stamped line has the keys present (value may be null); an unstamped line
    // lacks them entirely.
    const needsDerive: string[] = [];
    for (const it of items) {
      const productId = String(it.id ?? it.product_id ?? '');
      if (!productId) continue;
      if (!('supplier_id' in it) || !('is_bsc_processed' in it)) needsDerive.push(productId);
    }

    // Re-derive routing for any unstamped lines in one round-trip.
    const derivedCost   = new Map<string, { supplierId: string | null; costPerUnit: number }>();
    const derivedOrigin = new Map<string, boolean>();
    if (needsDerive.length > 0) {
      const ids = [...new Set(needsDerive)];
      const [{ data: costRows }, { data: prodRows }] = await Promise.all([
        admin.from('product_costs').select('product_id, cost_per_unit, supplier_id').in('product_id', ids).eq('is_current', true),
        admin.from('products').select('id, is_bsc_processed').in('id', ids),
      ]);
      for (const c of (costRows ?? []) as { product_id: string; cost_per_unit: number | null; supplier_id: string | null }[]) {
        derivedCost.set(c.product_id, { supplierId: c.supplier_id ?? null, costPerUnit: c.cost_per_unit != null ? Number(c.cost_per_unit) : 0 });
      }
      for (const p of (prodRows ?? []) as { id: string; is_bsc_processed: boolean | null }[]) {
        derivedOrigin.set(p.id, p.is_bsc_processed === true);
      }
    }

    // Group resale lines by supplier.
    type Line = { productId: string; qty: number; weightLb: number | null; unitCost: number; lineCost: number };
    const bySupplier = new Map<string, Line[]>();
    const blocked: string[] = [];

    for (const it of items) {
      const productId = String(it.id ?? it.product_id ?? '');
      if (!productId) continue;

      // Resolve routing: prefer the stamped values, fall back to re-derived.
      let supplierId: string | null;
      let isBsc: boolean;
      let costPerUnit: number;
      if ('supplier_id' in it || 'is_bsc_processed' in it) {
        supplierId  = it.supplier_id != null ? String(it.supplier_id) : null;
        isBsc       = it.is_bsc_processed === true;
        costPerUnit = it.cost_per_unit != null ? Number(it.cost_per_unit) : 0;
      } else {
        const dc = derivedCost.get(productId);
        supplierId  = dc?.supplierId ?? null;
        isBsc       = derivedOrigin.get(productId) === true;
        costPerUnit = dc?.costPerUnit ?? 0;
      }

      if (isBsc) continue;                                     // in-house — skip
      if (supplierId === SPINY_TAIL_SUPPLIER_ID) continue;     // belt-and-suspenders
      if (!supplierId) { blocked.push(productId); continue; }  // resale with no source

      const qty      = Number(it.qty ?? it.quantity ?? 0);
      const weightLb = it.weight_lb != null ? Number(it.weight_lb) : null;
      // Prefer the stamped line cost if present; else compute from cost_per_unit.
      const multiplier = weightLb != null && weightLb > 0 ? weightLb : qty;
      const lineCost = it.cost != null ? Number(it.cost) : r2(costPerUnit * multiplier);

      const line: Line = { productId, qty, weightLb, unitCost: costPerUnit, lineCost };
      const arr = bySupplier.get(supplierId) ?? [];
      arr.push(line);
      bySupplier.set(supplierId, arr);
    }

    if (blocked.length > 0) {
      console.warn(`[payment/return] procurement_blocked order=${orderId} products=${blocked.join(',')}`);
    }
    if (bySupplier.size === 0) return; // nothing to procure

    // Resolve supplier display names once.
    const supplierIds = [...bySupplier.keys()];
    const { data: supRows } = await admin.from('suppliers').select('id, name').in('id', supplierIds);
    const supName = new Map<string, string>();
    for (const s of (supRows ?? []) as { id: string; name: string }[]) supName.set(s.id, s.name);

    for (const [supplierId, lines] of bySupplier) {
      const total = r2(lines.reduce((s, l) => s + l.lineCost, 0));
      const { data: po, error: poErr } = await admin.from('purchase_orders').insert({
        order_id:      orderId,
        supplier_id:   supplierId,
        supplier_name: supName.get(supplierId) ?? null,
        status:        'raised',
        total,
        notes:         `Auto-raised from paid online order ${orderId.slice(0, 8)}`,
      }).select('id').single();

      if (poErr || !po) {
        console.error(`[payment/return] PO insert failed order=${orderId} supplier=${supplierId}: ${poErr?.message ?? 'no id'}`);
        continue;
      }

      const poId = (po as { id: string }).id;
      const itemRows = lines.map((l) => ({
        po_id:         poId,
        product_id:    l.productId,
        units_ordered: l.weightLb == null ? l.qty : null,
        weight_lb:     l.weightLb != null ? l.weightLb : null,
        unit_cost:     l.unitCost,
        total_cost:    l.lineCost,
      }));
      const { error: itemErr } = await admin.from('purchase_order_items').insert(itemRows);
      if (itemErr) {
        console.error(`[payment/return] PO items insert failed order=${orderId} po=${poId}: ${itemErr.message}`);
      }
    }
  } catch (e) {
    // Procurement must never fail a paid order.
    console.error(`[payment/return] auto-raise unexpected error order=${orderId}:`, e);
  }
}

export async function handlePnpReturn(req: NextRequest, hint: ReturnHint): Promise<NextResponse> {
  const fields = await readReturnFields(req);

  // Pull core fields. None of these is technically guaranteed by PnP,
  // so we tolerate missing pieces and degrade gracefully.
  const clientOrderId  = fields.pt_client_orderid ?? '';
  const pnpOrderId     = fields.pt_order_id ?? '';
  const amountStr      = fields.pt_transaction_amount ?? '';
  const responseCode   = fields.pi_response_code ?? '';
  const responseStatus = (fields.pi_response_status ?? hint).toLowerCase();
  const errorMessage   = fields.pi_error_message ?? '';
  const dupFlag        = (fields.pi_duplicate_transaction ?? '').toLowerCase() === 'yes';
  const authCode       = fields.pt_authorization_code ?? '';
  const hashFromPnp    = readHash(fields);

  // Origin for the customer redirect — Vercel deployments serve us at
  // whatever the request host is, so trust it.
  const origin = req.nextUrl.origin || 'https://bscbahamas.com';

  // If we don't have an order id, we can't tie this back to anything.
  if (!clientOrderId) {
    return NextResponse.redirect(`${origin}/checkout?problem=missing_order_id`);
  }

  // Verify hash (first factor). Pass the fields object so verifyResponseHash
  // can pull pt_transaction_response_hash itself.
  const hashOk = !!hashFromPnp && verifyResponseHash({
    ...fields,
    pt_transaction_response_hash: hashFromPnp,
  });

  // Call Query Transaction (second factor) — server-to-server. Only
  // runs if we got a PnP order id; otherwise nothing to query.
  let queryOk = false;
  let queryRaw: Record<string, string> = {};
  if (pnpOrderId) {
    try {
      queryRaw = await queryTransaction(pnpOrderId);
      const status = (queryRaw.FinalStatus ?? queryRaw.MStatus ?? '').toLowerCase();
      queryOk = status === 'success';
    } catch (err) {
      console.warn('Plug\'n Pay Query Transaction failed:', err);
      // Don't fail outright — leave queryOk=false so we don't mark paid.
    }
  }

  // Map RBC processor code to outcome (bucket + customer message).
  const outcome = rbcOutcome(responseCode);

  // Final disposition — order flips to 'paid' ONLY if all gates pass.
  const isPaid = hint === 'success'
              && hashOk
              && queryOk
              && outcome.bucket === 'approved';

  // Service-role client — request originated from PnP, not from a
  // signed-in user. RLS-bypass needed to write payment_transactions.
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Log the finalized attempt. We INSERT a new row (rather than UPDATE
  // the pending one from /api/payment/start) so the audit trail shows
  // both states distinctly + we never lose the submission record.
  const amountNum = amountStr ? Number(amountStr) : null;
  await admin.from('payment_transactions').insert({
    order_id:                     clientOrderId,
    pt_client_orderid:            clientOrderId,
    pt_order_id:                  pnpOrderId || null,
    pt_transaction_amount:        amountNum,
    pt_currency:                  fields.pt_currency ?? null,
    pi_response_status:           responseStatus || null,
    pi_response_code:             responseCode || null,
    pi_error_message:             errorMessage || null,
    pi_duplicate_transaction:     dupFlag,
    pt_authorization_code:        authCode || null,
    pt_transaction_response_hash: hashFromPnp || null,
    hash_verified:                hashOk,
    query_verified:               queryOk,
    customer_message:             outcome.customer,
    outcome_bucket:               outcome.bucket,
    raw_response:                 { ...fields, _query_result: queryRaw },
    client_ip:                    req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip'),
    user_agent:                   req.headers.get('user-agent'),
    finalized_at:                 new Date().toISOString(),
  });

  // Update orders.payment_status — idempotently.
  if (isPaid) {
    // ATOMIC one-time transition. Flip to 'paid' ONLY if the order is still
    // payable (payment_pending OR a prior-decline-reverted 'pending' — see
    // PAYABLE_STATUSES). The conditional WHERE + RETURNING is the idempotency
    // guard: if PnP calls this return URL more than once for the same order
    // (retry, browser re-POST, network replay), the SECOND call finds it 'paid'
    // (not in the set) and updates zero rows — so the financials split AND the
    // resale auto-raise below each run AT MOST ONCE per order. (Previously the
    // flip was unconditional and the financials INSERT had no order-keyed dedup,
    // so a double return double-counted revenue.)
    const { data: flipped } = await admin.from('orders')
      .update({
        payment_status: 'paid',
        payment_method: 'card',
        payment_ref:    pnpOrderId || null,
      })
      .eq('id', clientOrderId)
      .in('payment_status', [...PAYABLE_STATUSES])
      .select('id, total, items, wholesale_items');

    const paidRow = (flipped && flipped.length > 0)
      ? flipped[0] as { id: string; total: number | null; items: unknown; wholesale_items: unknown }
      : null;

    // Only run the money side-effects if WE are the call that flipped the row.
    if (paidRow) {
      // (1) Financial split — deferred from /checkout (where it ran pre-PnP and
      // would log phantom revenue for any customer who abandoned at the card
      // form). Uses the RETURNING total — no re-fetch. VAT currently disabled
      // (VAT_RATE=0) so cost = total / (1 + margin).
      try {
        const total = Number(paidRow.total ?? 0);
        if (total > 0) {
          const onlineToCost =
            1 / ((1 + CHANNEL_MARGIN.online_market) * (1 + VAT_RATE));
          await recordSaleFinancials({
            saleAmount: total,
            costBasis:  total * onlineToCost,
            channel:    'online_market',
            orderId:    clientOrderId,
          });
        }
      } catch (err) {
        console.warn('Financials log failed on payment confirm:', err);
      }

      // (2) Resale auto-raise — deferred from /api/orders/place for card orders
      // (unpaid at placement). Now that payment is confirmed, raise supplier
      // POs from the RETURNING items/wholesale_items (stamped routing; missing
      // lines re-derived inside). Best-effort: never throws.
      await raiseResalePurchaseOrdersForOrder(admin, clientOrderId, paidRow);
    }
    // paidRow == null → order was already 'paid' (duplicate return). Skip both
    // side-effects; the first call already performed them exactly once.
  } else {
    // Not paid → revert to 'pending' so the customer can retry from /checkout.
    // We deliberately do NOT set 'declined' as the order status — the latest
    // payment_transactions row carries the decline detail. GUARDED on the
    // payable set so a LATE decline/problem callback that arrives AFTER a
    // successful return can never clobber a 'paid' order back to pending.
    await admin.from('orders')
      .update({ payment_status: 'pending' })
      .eq('id', clientOrderId)
      .in('payment_status', [...PAYABLE_STATUSES]);
  }

  // Redirect the customer's browser. Different destinations per outcome
  // because the customer experience differs significantly.
  if (isPaid) {
    // Branded, visual "Payment confirmed" screen → then on to the marketplace.
    return NextResponse.redirect(`${origin}/order-confirmed?order=${clientOrderId}`);
  }
  // Hard decline / must-contact-bank / fraud → the clear "Payment declined"
  // screen with the safe "contact your bank" copy. Fraud uses the same copy
  // (silent treatment — never echo amount, code, or specific reason).
  if (outcome.bucket === 'fraud'
      || outcome.bucket === 'declined'
      || outcome.bucket === 'contact'
      || hint === 'declined') {
    return NextResponse.redirect(`${origin}/payment-declined?reason=declined`);
  }
  // Retry / unknown / gateway problem → "try again in a moment" screen.
  return NextResponse.redirect(`${origin}/payment-declined?reason=problem`);
}
