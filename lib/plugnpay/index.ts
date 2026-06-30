// lib/plugnpay/index.ts
//
// Plug'n Pay (the gateway RBC resells as "RBC Plug & Pay") integration
// helper. Confined to PURE functions + isolated fetch calls so the unit
// boundaries are easy to test.
//
// Two integration shapes are touched here:
//
//   1. Smart Screens v2 — Plug'n Pay's hosted payment page. The customer's
//      browser POSTs a form to https://pay1.plugnpay.com/pay/ and is taken
//      to plugnpay.com to enter their card (PAN never touches BSC; PCI
//      scope SAQ-A). The demobahami screen is ITEM-CART driven: it renders
//      from pd_display_items=yes + pt_item_identifier/cost/quantity/
//      description_N lines (per James Turansky's working sample). The
//      charge is derived from Sum(item cost x quantity) — we do NOT send a
//      bare pt_transaction_amount (that, with no item lines, yields
//      "Resource Unavailable"). Our behaviour flags ride ON TOP of that
//      base: pb_transition_type=hidden (server-to-server success callback)
//      + pb_success_url. No bad_card/problem URLs — only an APPROVED auth
//      ever calls us back.
//
//   2. Remote API (pnpremote.cgi) — server-to-server endpoint we use
//      ONLY for Query Transaction (verify a payment after the customer
//      redirect). We never POST raw card data here. PCI scope unchanged
//      because no card data flows.
//
// Verification chain on the return redirect:
//   Step 1: SHA256 hash check on (secret + publisher_name + orderID +
//           card_amount) matches the `resphash` PnP sent.
//   Step 2: Server-side Query Transaction call confirms the payment
//           actually exists on PnP's side. Belt-and-suspenders against
//           a hash leak.
//   Both must pass before we mark the order paid.
//
// Env vars (Vercel only, never in repo):
//   PNP_GATEWAY_ACCOUNT      pt_gateway_account value (e.g. demobahami)
//   PNP_PUBLISHER_PASSWORD   Remote Client Password (for Query Tx)
//   PNP_VERIFICATION_HASH_SECRET   secret for SHA256(...) on the response
//   PNP_API_BASE_URL         default https://pay1.plugnpay.com
//   PNP_CURRENCY             default BSD (override per-tx via currency)
//
// References:
//   https://docs.plugnpay.com/docs/integration-specifications-documents/smart-screens-v2-specifications/
//   https://docs.plugnpay.com/docs/general-documents/security-administration/verification-hash/

import crypto from 'crypto';

export type ResponseStatus = 'success' | 'badcard' | 'problem' | 'fraud' | 'unknown';

/** One line on the Smart Screen item cart. The charge derives from Sum(unitCost x quantity). */
export interface SubmissionLineItem {
  /** Stable id for the line — pt_item_identifier_N (SKU / product id / index). */
  identifier:  string;
  /** Human-readable label — pt_item_description_N. */
  description: string;
  /** PER-UNIT cost — pt_item_cost_N. Numeric or 2dp string. */
  unitCost:    string | number;
  /** Whole units — pt_item_quantity_N. Must be an integer >= 1. */
  quantity:    number;
}

export interface SubmissionInput {
  /** Our internal order id — passed as pt_client_orderid, echoed back. */
  clientOrderId: string;
  /**
   * Itemized cart — REQUIRED. demobahami's Smart Screen is item-cart
   * driven; it renders these lines and derives the charge from
   * Sum(unitCost x quantity). Delivery/fees must be included as their own
   * line so the lines sum to the authoritative order total.
   */
  items:         SubmissionLineItem[];
  /**
   * Authoritative order total (order.total). buildSubmission asserts the
   * item lines sum to this to the cent — the money-integrity guard. If
   * they don't match it throws rather than charge a different amount.
   */
  expectedTotal: string | number;
  /** ISO 4217 (BSD / USD). Will be uppercased. */
  currency?:     string;
  /** Customer email for PnP's confirmation email if enabled. */
  customerEmail?: string;
  /** Absolute URL PnP server-to-server POSTs on an APPROVED auth (hidden transition). */
  successUrl:    string;
  /** Defaults to 'querystring' so we can read params off the URL. */
  responseMessageType?: 'querystring' | 'json' | 'xml';
}

export interface ResponseFields {
  pi_response_status?:         ResponseStatus;
  pi_response_code?:           string;
  pi_error_message?:           string;
  pi_duplicate_transaction?:   string;
  pt_order_id?:                string;
  pt_authorization_code?:      string;
  pt_ip_address?:              string;
  pt_user_agent?:              string;
  pt_transaction_response_hash?: string;
  /** Our client order id, echoed back from the submission. */
  pt_client_orderid?:          string;
  pt_transaction_amount?:      string;
  pt_currency?:                string;
  [key: string]: string | undefined;
}

export interface PnpEnv {
  gatewayAccount:     string;
  publisherPassword:  string;
  verificationSecret: string;
  apiBaseUrl:         string;
  currency:           string;
}

/** Reads required PNP_* env vars; throws with a precise list if anything is missing. */
export function readPnpEnv(): PnpEnv {
  const gatewayAccount     = process.env.PNP_GATEWAY_ACCOUNT;
  const publisherPassword  = process.env.PNP_PUBLISHER_PASSWORD;
  const verificationSecret = process.env.PNP_VERIFICATION_HASH_SECRET;
  const apiBaseUrl         = process.env.PNP_API_BASE_URL ?? 'https://pay1.plugnpay.com';
  const currency           = (process.env.PNP_CURRENCY ?? 'BSD').toUpperCase();

  const missing: string[] = [];
  if (!gatewayAccount)     missing.push('PNP_GATEWAY_ACCOUNT');
  if (!publisherPassword)  missing.push('PNP_PUBLISHER_PASSWORD');
  if (!verificationSecret) missing.push('PNP_VERIFICATION_HASH_SECRET');
  if (missing.length > 0) {
    throw new Error(`Plug'n Pay env vars not set in this environment: ${missing.join(', ')}. ` +
                    `Add them in the Vercel dashboard (Production + Preview).`);
  }

  return {
    gatewayAccount:     gatewayAccount!,
    publisherPassword:  publisherPassword!,
    verificationSecret: verificationSecret!,
    apiBaseUrl,
    currency,
  };
}

/** Returns whether the calling code can call Plug'n Pay (i.e. env is configured). */
export function isPnpConfigured(): boolean {
  try { readPnpEnv(); return true; } catch { return false; }
}

/** Strips non-printable chars, collapses whitespace, caps length for a PnP item field. */
function sanitizeItemField(raw: string, max: number): string {
  const cleaned = Array.from(String(raw ?? ''))
    .filter((ch) => { const c = ch.charCodeAt(0); return c >= 32 && c !== 127; })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, max) || '-';
}

/**
 * Builds the form-data payload the client POSTs to Plug'n Pay's hosted
 * page. The client renders these as hidden inputs in an auto-submitting
 * <form> — Smart Screens v2 expects a top-level navigation, not XHR.
 *
 * Shape (proven against demobahami via James Turansky's working sample):
 *   pt_gateway_account + pd_display_items=yes + per-line
 *   pt_item_identifier/cost/quantity/description_N  (the cart base that
 *   renders the screen) PLUS our pb_transition_type=hidden + pb_success_url
 *   (the server-to-server success callback) on top. No pt_transaction_amount
 *   — the charge derives from the item lines.
 *
 * @returns { action, fields, total } — form action, hidden-input pairs,
 *          and the computed 2dp total (== expectedTotal, asserted).
 * @throws  if items is empty, a line is malformed, or the lines do not sum
 *          to expectedTotal (money-integrity guard).
 */
export function buildSubmission(input: SubmissionInput): { action: string; fields: Record<string, string>; total: string } {
  const env = readPnpEnv();
  const currency = (input.currency ?? env.currency).toUpperCase();

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Plug'n Pay: at least one cart line item is required " +
                    "(the Smart Screen is item-cart driven — a bare amount yields \"Resource Unavailable\").");
  }

  const fields: Record<string, string> = {
    // Account identifier — the mandatory id per spec (e.g. demobahami).
    pt_gateway_account: env.gatewayAccount,
    // Tells the Smart Screen to render the itemized cart below.
    pd_display_items:   'yes',
  };

  // Sum Sum(unitCost x quantity) in integer cents to avoid float drift.
  let cents = 0;
  input.items.forEach((it, i) => {
    const n   = i + 1;
    const qty = Math.trunc(Number(it.quantity));
    if (!Number.isFinite(qty) || qty < 1) {
      throw new Error(`Plug'n Pay: item ${n} has invalid quantity "${String(it.quantity)}".`);
    }
    const unit = normalizeAmount(it.unitCost); // "N.NN" — throws on garbage/negative
    cents += Math.round(Number(unit) * 100) * qty;
    fields[`pt_item_identifier_${n}`]  = sanitizeItemField(it.identifier || String(n), 40);
    fields[`pt_item_cost_${n}`]        = unit;
    fields[`pt_item_quantity_${n}`]    = String(qty);
    fields[`pt_item_description_${n}`] = sanitizeItemField(it.description || `Item ${n}`, 60);
  });

  // Money-integrity guard (DB-authoritative): the cart MUST sum to the
  // authoritative order total — delivery/fees included as their own line.
  // Refuse to build a charge that doesn't match the order, never silently
  // charge the item-sum.
  const expectedCents = Math.round(Number(normalizeAmount(input.expectedTotal)) * 100);
  if (cents !== expectedCents) {
    throw new Error(
      `Plug'n Pay: item lines sum to ${(cents / 100).toFixed(2)} but order total is ` +
      `${(expectedCents / 100).toFixed(2)} — refusing to build a mismatched charge.`
    );
  }
  const total = (cents / 100).toFixed(2);

  // Currency + our order id (echoed back so the return ties to the row).
  fields.pt_currency       = currency;
  fields.pt_client_orderid = input.clientOrderId;
  // Hidden transition = a direct server-to-server POST to pb_success_url the
  // moment an authorization succeeds — reliable, not browser-dependent (fixes
  // the lost-browser-return "stranded card order" class). Per Plug'n Pay
  // (James Turansky, 2026-06-29): do NOT set bad_card/problem URLs — that lets
  // a FAILED transaction return to PnP's billing page to retry, so only an
  // APPROVED authorization ever calls our callback.
  fields.pb_success_url           = input.successUrl;
  fields.pb_transition_type       = 'hidden';
  // Response shape — 'querystring' lets us read params off req.url.
  fields.pb_response_message_type = input.responseMessageType ?? 'querystring';
  if (input.customerEmail) fields.pt_email = input.customerEmail;

  return { action: `${env.apiBaseUrl}/pay/`, fields, total };
}

/**
 * Verifies the SHA256 response hash from a Smart Screens v2 redirect.
 *
 * Formula (per PnP docs):
 *   SHA256( verificationSecret + publisherName + orderID + cardAmount )
 *
 * The publisherName here is the gateway_account string (PnP uses both
 * names interchangeably in the docs; the same string applies). The
 * orderID is PnP's own pt_order_id, NOT our pt_client_orderid.
 *
 * Returns true ONLY if the hash matches. False if any input is missing
 * or the comparison fails.
 */
export function verifyResponseHash(fields: ResponseFields): boolean {
  let env: PnpEnv;
  try { env = readPnpEnv(); } catch { return false; }

  const expectedHashFromPnp = fields.pt_transaction_response_hash;
  const orderID             = fields.pt_order_id;
  const cardAmount          = fields.pt_transaction_amount;
  if (!expectedHashFromPnp || !orderID || !cardAmount) return false;

  // The amount in the hash must be the exact string PnP echoed, not our
  // re-normalized version — small differences (e.g. "10" vs "10.00")
  // would break the comparison.
  const input  = env.verificationSecret + env.gatewayAccount + orderID + cardAmount;
  const sha256 = crypto.createHash('sha256').update(input, 'utf8').digest('hex');

  // Timing-safe comparison.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sha256.toLowerCase()),
      Buffer.from(expectedHashFromPnp.toLowerCase()),
    );
  } catch {
    return false;
  }
}

/**
 * Server-to-server "Query Transaction" against the Remote API. Used
 * after the customer redirect to confirm the transaction actually exists
 * on PnP's side and matches what we expected. Critical second factor —
 * a malicious actor cannot forge this because it requires our publisher
 * password.
 *
 * @returns the parsed PnP response (URL-decoded into a plain record).
 *          The caller should check `FinalStatus === 'success'` plus
 *          `card-amount` matches, etc.
 */
export async function queryTransaction(orderID: string): Promise<Record<string, string>> {
  const env = readPnpEnv();
  const body = new URLSearchParams({
    'publisher-name':     env.gatewayAccount,
    'publisher-password': env.publisherPassword,
    'mode':               'query',
    'orderID':            orderID,
  });

  const res = await fetch(`${env.apiBaseUrl}/payment/pnpremote.cgi`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  const text = await res.text();
  return parseUrlEncodedResponse(text);
}

/**
 * Parses Plug'n Pay's URL-encoded responses into a plain object.
 * The wire format uses hyphens encoded as %2d in keys, so we
 * standardize on hyphenated keys (e.g. "card-amount", "publisher-name").
 *
 *   "FinalStatus=success&card%2damount=10%2e00&..."
 *     -> { FinalStatus: 'success', 'card-amount': '10.00', ... }
 */
export function parseUrlEncodedResponse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const params = new URLSearchParams(text);
  for (const [key, value] of params.entries()) {
    out[key] = value;
  }
  return out;
}

/** Standardizes an amount string to "N.NN" form. Throws on garbage/negative. */
export function normalizeAmount(input: string | number): string {
  const num = typeof input === 'number' ? input : parseFloat(input);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Plug'n Pay: invalid amount "${String(input)}"`);
  }
  return num.toFixed(2);
}

export { rbcOutcome, isApproved } from './rbc-codes';
export type { RbcOutcomeBucket, RbcOutcome } from './rbc-codes';
