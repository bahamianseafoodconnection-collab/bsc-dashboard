// lib/plugnpay/rbc-codes.ts
//
// RBC processor response code mapping — sourced verbatim from
// https://docs.plugnpay.com/docs/general-documents/appendix/merchant-processor-response-codes/rbc-response-codes/
// on 2026-05-26.
//
// Buckets drive customer-facing behavior:
//   approved → success path, order marked paid
//   declined → show "Payment declined by your bank. Please contact your
//              financial institution and try again." (founder's exact spec)
//   fraud    → silent reject; do NOT echo amount, do NOT auto-retry, do
//              NOT inform customer of decline reason — confiscate-card
//              category. Order stays in payment_declined; ops reviews.
//   retry    → transient processor / network error; safe to invite the
//              customer to retry. "We had a temporary problem reaching
//              your bank. Please try again."
//   contact  → matches founder spec verbatim — "Payment declined by your
//              bank. Please contact your financial institution and try
//              again." (issuer-flagged, not card-fault)

export type RbcOutcomeBucket = 'approved' | 'declined' | 'fraud' | 'retry' | 'contact' | 'unknown';

export interface RbcOutcome {
  bucket:   RbcOutcomeBucket;
  /** Customer-facing message — already in plain English, ready to surface as-is. */
  customer: string;
  /** Operator-facing label — for the dashboard / receipt / reconciliation reports. */
  staff:    string;
}

const DECLINE_MSG = 'Payment declined by your bank. Please contact your financial institution and try again.';
const FRAUD_MSG   = 'We were unable to complete this transaction. Please contact your bank.';
const RETRY_MSG   = 'We had a temporary problem reaching your bank. Please try again in a moment.';
const APPROVE_MSG = 'Payment approved.';

const TABLE: Record<string, RbcOutcome> = {
  // Approved
  '00': { bucket: 'approved', customer: APPROVE_MSG, staff: 'Approved' },
  '08': { bucket: 'approved', customer: APPROVE_MSG, staff: 'Approval' },
  '10': { bucket: 'approved', customer: APPROVE_MSG, staff: 'Approved for partial amount' },
  '11': { bucket: 'approved', customer: APPROVE_MSG, staff: 'Approval' },
  '16': { bucket: 'approved', customer: APPROVE_MSG, staff: 'Approved updated track3' },

  // Declined — issuer / referral
  '01': { bucket: 'contact',  customer: DECLINE_MSG, staff: 'Refer to card issuer' },
  '02': { bucket: 'contact',  customer: DECLINE_MSG, staff: 'Refer to card issuers special conditions' },
  '05': { bucket: 'declined', customer: DECLINE_MSG, staff: 'Do not honor' },
  '12': { bucket: 'declined', customer: DECLINE_MSG, staff: 'Invalid transaction' },
  '13': { bucket: 'declined', customer: DECLINE_MSG, staff: 'Invalid amount' },
  '14': { bucket: 'declined', customer: DECLINE_MSG, staff: 'Invalid card number' },
  '15': { bucket: 'declined', customer: DECLINE_MSG, staff: 'No such issuer' },
  '20': { bucket: 'declined', customer: DECLINE_MSG, staff: 'Invalid response' },
  '21': { bucket: 'declined', customer: DECLINE_MSG, staff: 'No action taken' },
  '33': { bucket: 'declined', customer: 'Your card has expired. Please use a different card.', staff: 'Expired card' },
  '36': { bucket: 'declined', customer: DECLINE_MSG, staff: 'Restricted card' },
  '39': { bucket: 'declined', customer: DECLINE_MSG, staff: 'No credit amount' },
  '40': { bucket: 'declined', customer: DECLINE_MSG, staff: 'Invalid transaction' },
  '51': { bucket: 'declined', customer: 'Insufficient funds. Please use a different card or contact your bank.', staff: 'Insufficient funds' },
  '54': { bucket: 'declined', customer: 'Your card has expired. Please use a different card.', staff: 'Expired card' },
  '55': { bucket: 'declined', customer: DECLINE_MSG, staff: 'Incorrect PIN' },
  '56': { bucket: 'declined', customer: DECLINE_MSG, staff: 'No card record' },
  '57': { bucket: 'declined', customer: DECLINE_MSG, staff: 'Transaction not permitted to cardholder' },
  '58': { bucket: 'declined', customer: DECLINE_MSG, staff: 'Transaction not permitted to terminal' },
  '61': { bucket: 'declined', customer: 'Transaction exceeds your card limit. Please use a different card or contact your bank.', staff: 'Exceeds amount limit' },
  '62': { bucket: 'declined', customer: DECLINE_MSG, staff: 'Restricted card' },
  '76': { bucket: 'declined', customer: DECLINE_MSG, staff: 'Invalid/nonexistent account' },

  // Pickup / hold / fraud — silent treatment
  '04': { bucket: 'fraud', customer: FRAUD_MSG, staff: 'Pickup card' },
  '07': { bucket: 'fraud', customer: FRAUD_MSG, staff: 'Pickup card (special conditions)' },
  '34': { bucket: 'fraud', customer: FRAUD_MSG, staff: 'Suspected fraud' },
  '41': { bucket: 'fraud', customer: FRAUD_MSG, staff: 'Lost card' },
  '43': { bucket: 'fraud', customer: FRAUD_MSG, staff: 'Stolen card, pick up' },
  '59': { bucket: 'fraud', customer: FRAUD_MSG, staff: 'Suspected fraud' },
  '67': { bucket: 'fraud', customer: FRAUD_MSG, staff: 'Hard capture' },

  // Contact financial institution — issuer escalation
  '35': { bucket: 'contact', customer: DECLINE_MSG, staff: 'Contact acquirer' },
  '37': { bucket: 'contact', customer: DECLINE_MSG, staff: 'Call acquirer security' },
  '60': { bucket: 'contact', customer: DECLINE_MSG, staff: 'Contact acquirer' },
  '66': { bucket: 'contact', customer: DECLINE_MSG, staff: 'Call acquirer security' },

  // Retry-able — system / processor transient
  '06': { bucket: 'retry', customer: RETRY_MSG, staff: 'Error' },
  '09': { bucket: 'retry', customer: RETRY_MSG, staff: 'Request in progress' },
  '19': { bucket: 'retry', customer: RETRY_MSG, staff: 'Re-enter transaction' },
  '22': { bucket: 'retry', customer: RETRY_MSG, staff: 'Suspected malfunction' },
  '30': { bucket: 'retry', customer: RETRY_MSG, staff: 'Format error' },
  '68': { bucket: 'retry', customer: RETRY_MSG, staff: 'Response received too late' },
  '90': { bucket: 'retry', customer: RETRY_MSG, staff: 'Cutoff in progress' },
  '91': { bucket: 'retry', customer: RETRY_MSG, staff: 'Issuer or switch inoperative' },
  '92': { bucket: 'retry', customer: RETRY_MSG, staff: 'Financial institution unknown' },
  '93': { bucket: 'retry', customer: RETRY_MSG, staff: 'Transaction cannot be completed' },
  '94': { bucket: 'retry', customer: RETRY_MSG, staff: 'Duplicate transmission' },
  '95': { bucket: 'retry', customer: RETRY_MSG, staff: 'Reconcile error' },
  '96': { bucket: 'retry', customer: RETRY_MSG, staff: 'System malfunction' },
};

export function rbcOutcome(code: string | null | undefined): RbcOutcome {
  const c = (code ?? '').trim();
  if (!c) return { bucket: 'unknown', customer: DECLINE_MSG, staff: 'No response code' };
  return TABLE[c] ?? { bucket: 'unknown', customer: DECLINE_MSG, staff: `Unmapped RBC code ${c}` };
}

export function isApproved(code: string | null | undefined): boolean {
  return rbcOutcome(code).bucket === 'approved';
}
