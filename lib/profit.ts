// Per-transaction expense allocation + profit split.
//
// Used by POS pages and order-insert paths to populate orders.expense_allocation,
// orders.bill_casale_share, and orders.net_profit at the moment of sale.
//
// Math (from the May 15 2026 sync spec):
//   monthly_overhead   = SUM(expenses.amount) WHERE category IN OVERHEAD_CATEGORIES
//   monthly_target     = avg of the last 3 calendar months of order totals,
//                         falling back to DEFAULT_MONTHLY_TARGET when there is no history
//   expense_rate       = monthly_overhead / monthly_target
//   expense_allocation = order_total * expense_rate
//   bill_casale_share  = gross_profit * 0.05  (sacred)
//   net_profit         = gross_profit - expense_allocation - bill_casale_share

import { supabase } from './supabase';

// Channel margin assumptions, matching the dashboard's calcSplit.
export const NASSAU_POS_MARGIN = 0.38;
export const ANDROS_POS_MARGIN = 0.43;
export const ONLINE_MARGIN     = 0.25;
export const WHOLESALE_MARGIN  = 0.15;

export const BILL_CASALE_RATE       = 0.05;
export const DEFAULT_MONTHLY_TARGET = 25_000;

export const OVERHEAD_CATEGORIES = [
  'salaries',
  'utilities',
  'rent',
  'operations',
  'maintenance',
] as const;

export interface OverheadMetrics {
  monthly_overhead: number;
  monthly_target:   number;
  expense_rate:     number; // monthly_overhead / monthly_target
}

export interface ProfitSplit {
  gross_profit:       number;
  expense_allocation: number;
  bill_casale_share:  number;
  net_profit:         number;
}

/**
 * Fetch the overhead metrics once per session. Cheap (one expenses scan,
 * one orders scan). Fails soft — if either query errors, the metrics fall
 * back to ($0 overhead, default $25k target) so the caller can still
 * persist the order with null/zero allocation rather than blocking the sale.
 */
export async function fetchOverheadMetrics(): Promise<OverheadMetrics> {
  let monthly_overhead = 0;
  let monthly_target   = DEFAULT_MONTHLY_TARGET;

  try {
    const { data: expRows } = await supabase
      .from('expenses')
      .select('amount')
      .in('category', [...OVERHEAD_CATEGORIES]);
    monthly_overhead = (expRows ?? []).reduce(
      (s: number, r: { amount: number | null }) => s + Number(r.amount ?? 0),
      0,
    );
  } catch { /* leave 0 */ }

  try {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const { data: orderRows } = await supabase
      .from('orders')
      .select('total, created_at')
      .gte('created_at', threeMonthsAgo.toISOString());

    const monthBuckets = new Map<string, number>();
    for (const r of (orderRows ?? []) as { total: number | null; created_at: string }[]) {
      const key = (r.created_at || '').slice(0, 7); // YYYY-MM
      monthBuckets.set(key, (monthBuckets.get(key) ?? 0) + Number(r.total ?? 0));
    }
    const months = Array.from(monthBuckets.values());
    if (months.length > 0) {
      monthly_target = months.reduce((s, v) => s + v, 0) / months.length;
    }
  } catch { /* fall back to default */ }

  const expense_rate = monthly_target > 0 ? monthly_overhead / monthly_target : 0;
  return { monthly_overhead, monthly_target, expense_rate };
}

/**
 * Pure compute. Given an order total + the channel's assumed margin + the
 * current expense_rate, return the split. All values rounded to cents.
 */
export function computeProfitSplit(
  order_total: number,
  channel_margin: number,
  expense_rate: number,
): ProfitSplit {
  const gross_profit       = order_total * channel_margin;
  const expense_allocation = round2(order_total * expense_rate);
  const bill_casale_share  = round2(gross_profit * BILL_CASALE_RATE);
  const net_profit         = round2(gross_profit - expense_allocation - bill_casale_share);
  return {
    gross_profit: round2(gross_profit),
    expense_allocation,
    bill_casale_share,
    net_profit,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
