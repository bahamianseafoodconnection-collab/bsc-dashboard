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
//   6. Update orders.payment_status:
//        approved → 'paid'   (only when hint=success + both factors OK)
//        anything else → 'pending'  (so customer can retry from /checkout)
//   7. Redirect customer's browser:
//        approved → /account/orders/[id]?paid=1
//        fraud    → /checkout?problem=cannot_complete   (silent — no detail)
//        declined → /checkout?declined=1&code=XX        (with friendly message)
//        retry    → /checkout?problem=1&retry=1
//
// PCI: no card data anywhere in this file. PAN never touched bscbahamas.com.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyResponseHash, queryTransaction, parseUrlEncodedResponse } from './index';
import { rbcOutcome } from './rbc-codes';
import { CHANNEL_MARGIN, VAT_RATE, recordSaleFinancials } from '@/lib/finance';

export type ReturnHint = 'success' | 'declined' | 'problem';

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

  // Update orders.payment_status.
  if (isPaid) {
    await admin.from('orders').update({
      payment_status: 'paid',
      payment_method: 'card',
      payment_ref:    pnpOrderId || null,
    }).eq('id', clientOrderId);

    // Record the sale's financial split now that payment is confirmed.
    // Deferred from /checkout (where it ran pre-PnP and would log phantom
    // revenue for any customer who abandoned at the card form). Cost basis
    // is back-computed from the online_market sacred pricing; VAT is
    // currently disabled (VAT_RATE=0) so cost = total / (1 + margin).
    try {
      const { data: orderRow } = await admin
        .from('orders')
        .select('total')
        .eq('id', clientOrderId)
        .maybeSingle();
      const total = Number((orderRow as { total?: number } | null)?.total ?? 0);
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
  } else {
    // Revert to 'pending' so the customer can retry from /checkout.
    // We deliberately do NOT set 'declined' as the order status —
    // the latest payment_transactions row carries the decline detail.
    await admin.from('orders').update({
      payment_status: 'pending',
    }).eq('id', clientOrderId);
  }

  // Redirect the customer's browser. Different destinations per outcome
  // because the customer experience differs significantly.
  if (isPaid) {
    // Branded, visual "Payment confirmed" screen → then on to the marketplace.
    // (The old /account/orders/[id] target left customers stranded.)
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
