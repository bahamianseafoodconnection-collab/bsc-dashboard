// =====================================================================
// lib/statements/allocate.ts
//
// Pure AR allocation for customer statements. NO database, NO I/O —
// deterministic + unit-testable.
//
// Founder-locked rules (2026-06-28):
//   • All payments (wire / card / cash alike) apply to the OLDEST unpaid
//     invoice first, then cascade down.
//   • Outstanding = sum(invoices) − sum(payments)  (floored at 0).
//   • Status labels (NO "Suspended"):
//       PAID    — invoice balance cleared
//       OPEN    — has balance, not yet past due
//       DUE     — past due_date, account still within credit limit
//       OVERDUE — past due_date AND total outstanding has reached/passed
//                 the customer's credit_limit
//
// Money is summed in integer cents to avoid float drift.
// =====================================================================

export type InvoiceStatus = 'PAID' | 'OPEN' | 'DUE' | 'OVERDUE';
export type AccountStatus = 'CURRENT' | 'DUE' | 'OVERDUE';

export interface RawInvoice {
  id: string;
  invoice_number: string | null;
  invoice_date: string;          // YYYY-MM-DD
  due_date: string | null;       // YYYY-MM-DD
  amount_total: number;
}

export interface RawPayment {
  id: string;
  payment_date: string;          // YYYY-MM-DD
  amount: number;
  payment_method: string | null;
  reference: string | null;
}

export interface AllocatedInvoice extends RawInvoice {
  allocated: number;             // paid against this invoice
  balance: number;               // amount_total − allocated
  past_due: boolean;
  status: InvoiceStatus;
}

export interface StatementAllocation {
  invoices: AllocatedInvoice[];   // sorted oldest → newest
  payments: RawPayment[];         // sorted oldest → newest
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;      // floored at 0
  credit_limit: number;
  available_credit: number;       // floored at 0
  account_status: AccountStatus;
  breached: boolean;              // outstanding ≥ credit_limit (limit > 0)
}

const cents = (n: number) => Math.round((Number(n) || 0) * 100);
const money = (c: number) => Math.round(c) / 100;

function dateOnly(s: string | null): number {
  if (!s) return Number.POSITIVE_INFINITY;
  const t = Date.parse(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Allocate payments to invoices, oldest-first, and label statuses.
 * @param asOf  evaluation date (YYYY-MM-DD or ISO); defaults handled by caller.
 */
export function allocateStatement(
  invoices: RawInvoice[],
  payments: RawPayment[],
  opts: { creditLimit?: number; asOf: string },
): StatementAllocation {
  const limitC = cents(opts.creditLimit ?? 0);
  const asOfMs = dateOnly(opts.asOf);

  const sortedInv = [...invoices].sort(
    (a, b) => dateOnly(a.invoice_date) - dateOnly(b.invoice_date)
      || String(a.invoice_number ?? '').localeCompare(String(b.invoice_number ?? '')),
  );
  const sortedPay = [...payments].sort(
    (a, b) => dateOnly(a.payment_date) - dateOnly(b.payment_date),
  );

  const totalInvoicedC = sortedInv.reduce((s, i) => s + cents(i.amount_total), 0);
  const totalPaidC = sortedPay.reduce((s, p) => s + cents(p.amount), 0);
  const totalOutstandingC = Math.max(0, totalInvoicedC - totalPaidC);
  const breached = limitC > 0 && totalOutstandingC >= limitC;

  // Cascade the payment pool across invoices oldest-first.
  let poolC = totalPaidC;
  const allocated: AllocatedInvoice[] = sortedInv.map((inv) => {
    const dueC = cents(inv.amount_total);
    const payC = Math.min(poolC, dueC);
    poolC -= payC;
    const balanceC = dueC - payC;
    const pastDue = balanceC > 0 && dateOnly(inv.due_date) < asOfMs;

    let status: InvoiceStatus;
    if (balanceC <= 0) status = 'PAID';
    else if (!pastDue) status = 'OPEN';
    else status = breached ? 'OVERDUE' : 'DUE';

    return {
      ...inv,
      allocated: money(payC),
      balance: money(balanceC),
      past_due: pastDue,
      status,
    };
  });

  const accountStatus: AccountStatus =
    allocated.some((i) => i.status === 'OVERDUE') ? 'OVERDUE'
    : allocated.some((i) => i.status === 'DUE') ? 'DUE'
    : 'CURRENT';

  return {
    invoices: allocated,
    payments: sortedPay,
    total_invoiced: money(totalInvoicedC),
    total_paid: money(totalPaidC),
    total_outstanding: money(totalOutstandingC),
    credit_limit: money(limitC),
    available_credit: money(Math.max(0, limitC - totalOutstandingC)),
    account_status: accountStatus,
    breached,
  };
}
