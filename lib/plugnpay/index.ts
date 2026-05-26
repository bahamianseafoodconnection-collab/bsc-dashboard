// lib/plugnpay/index.ts
//
// Plug'n Pay (the gateway RBC resells as "RBC Plug & Pay") integration
// helper. Confined to PURE functions + isolated fetch calls so the unit
// boundaries are easy to test.
//
// Two integration shapes are touched here:
//
//   1. Smart Screens v2 — Plug'n Pay's hosted payment page. Customer's
//      browser POSTs a form to https://pay1.plugnpay.com/pay/ and is
//      redirected away from bscbahamas.com to enter their card on
//      plugnpay.com. PnP redirects the customer back to one of our three
//      configured URLs (success / bad_card / problem). This is the path
//      we present to ONLINE customers because PAN never touches BSC.
//      PCI scope: SAQ-A.
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
//   PNP_GATEWAY_ACCOUNT      pt_gateway_account / publisher name string
//   PNP_PUBLISHER_PASSWORD   Remote Client Password (for Query Tx)
//   PNP_VERIFICATION_HASH_SECRET   secret for SHA256(...) on the response
//   PNP_API_BASE_URL         default https://pay1.plugnpay.com
//   PNP_CURRENCY             default BSD (override per-tx via amount call)
//
// References:
//   https://docs.plugnpay.com/docs/integration-specifications-documents/smart-screens-v2-specifications/
//   https://docs.plugnpay.com/docs/general-documents/security-administration/verification-hash/

import crypto from 'crypto';

export type ResponseStatus = 'success' | 'badcard' | 'problem' | 'fraud' | 'unknown';

export interface SubmissionInput {
  /** Our internal order id — passed as pt_client_orderid, echoed back. */
  clientOrderId: string;
  /** Decimal string, two places, no currency symbol — e.g. "12.34". */
  amount:        string;
  /** ISO 4217 (BSD / USD). Will be uppercased. */
  currency?:     string;
  /** Optional subtotal / tax / handling breakdown for the receipt. */
  subtotal?:     string;
  taxAmount?:    string;
  taxRate?:      string;
  handlingAmount?: string;
  /** Customer email for PnP's confirmation email if enabled. */
  customerEmail?: string;
  /** Where to send the browser on each outcome — absolute URLs. */
  successUrl:    string;
  badCardUrl:    string;
  problemUrl:    string;
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

/**
 * Builds the form-data payload that the client will POST to Plug'n Pay's
 * hosted page. The client renders these as hidden inputs in an
 * auto-submitting <form> — Smart Screens v2 expects a top-level
 * navigation, not XHR.
 *
 * @returns { action, fields } — the form's action attribute + the
 *          hidden-input name/value pairs to render.
 */
export function buildSubmission(input: SubmissionInput): { action: string; fields: Record<string, string> } {
  const env = readPnpEnv();
  const currency = (input.currency ?? env.currency).toUpperCase();
  // Amount must be a plain decimal string with two places, no currency
  // symbol — validate so we never POST garbage to RBC.
  const amount = normalizeAmount(input.amount);

  const fields: Record<string, string> = {
    // Account identifier — the only mandatory identifier per docs.
    pt_gateway_account:           env.gatewayAccount,
    // Amount — mandatory.
    pt_transaction_amount:        amount,
    // Currency — optional but we always send it (BSD by default).
    pt_currency:                  currency,
    // Our order id — echoed back on return so we can tie redirect to row.
    pt_client_orderid:            input.clientOrderId,
    // Return URLs — Plug'n Pay POSTs to script-style URLs, GETs to .html.
    pb_success_url:               input.successUrl,
    pb_bad_card_url:              input.badCardUrl,
    pb_problem_url:               input.problemUrl,
    // Response shape — 'querystring' lets us read off req.url params
    // when PnP redirects (works for both POST and GET targets).
    pb_response_message_type:     input.responseMessageType ?? 'querystring',
  };
  // Optional itemization fields — keep keys absent if not provided so
  // we don't send empty strings (PnP rejects some empties).
  if (input.subtotal)        fields.pt_subtotal           = normalizeAmount(input.subtotal);
  if (input.taxAmount)       fields.pt_tax_amount         = normalizeAmount(input.taxAmount);
  if (input.taxRate)         fields.pt_tax_rate           = input.taxRate;
  if (input.handlingAmount)  fields.pt_handling_amount    = normalizeAmount(input.handlingAmount);
  if (input.customerEmail)   fields.pt_email              = input.customerEmail;

  return { action: `${env.apiBaseUrl}/pay/`, fields };
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
 *     → { FinalStatus: 'success', 'card-amount': '10.00', ... }
 */
export function parseUrlEncodedResponse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const params = new URLSearchParams(text);
  for (const [key, value] of params.entries()) {
    out[key] = value;
  }
  return out;
}

/** Standardizes an amount string to "N.NN" form. Throws on garbage. */
export function normalizeAmount(input: string | number): string {
  const num = typeof input === 'number' ? input : parseFloat(input);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Plug'n Pay: invalid amount "${String(input)}"`);
  }
  return num.toFixed(2);
}

export { rbcOutcome, isApproved } from './rbc-codes';
export type { RbcOutcomeBucket, RbcOutcome } from './rbc-codes';
