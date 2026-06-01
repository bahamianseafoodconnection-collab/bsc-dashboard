// lib/finance.ts
//
// BSC channel pricing + sale accounting helpers.
//
// Encodes the SACRED PRICING RULES:
//   - Nassau POS      : 38% margin, 10% VAT
//   - Andros POS      : 43% margin, 10% VAT
//   - Online Market   : 25% margin, 10% VAT
//   - Local Wholesale : 12% margin, 10% VAT
//   - US Resale       : 12% margin, 10% VAT (shipping + duty added separately)
//   - Bill Casale     : 5% gross profit, NO VAT (NEVER LOWER — sacred)
//   - Bill Payments   : 4.5% cost-of-doing-business + $6 service fee, NO VAT
//
// Use `splitSale()` whenever you record a sale so the financials table holds
// channel-correct numbers (BSC profit vs supplier cost vs VAT). Earlier
// versions of this file used a flat 7% split — that was wrong and would have
// poisoned every margin if anything had called it.

import { supabase } from "./supabase";

// ─────────────────────────── Channel definitions ───────────────────────────

export type PricingChannel =
  | "nassau_pos"
  | "andros_pos"
  | "online_market"
  | "local_wholesale"
  | "us_resale"
  | "bill_payments"
  | "bill_casale";

export const CHANNEL_MARGIN: Record<PricingChannel, number> = {
  nassau_pos:      0.38,
  andros_pos:      0.43,
  online_market:   0.25,
  local_wholesale: 0.15,
  us_resale:       0.12,
  bill_payments:   0.045,
  bill_casale:     0.05,
};

// VAT is disabled across the board (founder directive 2026-05-30) until BSC
// is approved to charge it. Keep the constant + plumbing so we can re-enable
// in one place when approval lands. Setting to 0 makes every sellPrice /
// recordSaleFinancials computation behave as a pure cost+margin equation.
export const VAT_RATE = 0;

// Bill Payments and Bill Casale are special — no VAT applied.
function hasVat(channel: PricingChannel): boolean {
  return channel !== "bill_casale" && channel !== "bill_payments";
}

// ─────────────────────────── Pricing math ───────────────────────────

// Sell price for a given cost in a given channel.
// For "bill_payments", the $6 service fee is the per-transaction surcharge
// the customer pays on top of the cost-of-doing-business markup.
export function sellPriceFromCost(cost: number, channel: PricingChannel): number {
  if (channel === "bill_payments") {
    return cost * (1 + CHANNEL_MARGIN.bill_payments) + 6;
  }
  if (channel === "bill_casale") {
    return cost * (1 + CHANNEL_MARGIN.bill_casale);
  }
  return cost * (1 + CHANNEL_MARGIN[channel]) * (1 + VAT_RATE);
}

// Splits a sale total back into BSC profit, supplier cost basis, and VAT.
// `saleAmount` is the total the customer paid (VAT-inclusive for VAT channels).
// `costBasis` is what BSC paid the supplier (or true cost per lb after yield).
//
// Invariants:
//   revenue        === saleAmount
//   bsc_profit     === gross_excl_vat - cost_basis
//   vat_collected  === saleAmount - gross_excl_vat   (0 for non-VAT channels)
//   bsc_profit + cost_basis + vat_collected ≈ saleAmount  (rounding aside)
export type SaleSplit = {
  revenue: number;
  cost_basis: number;
  bsc_profit: number;
  vat_collected: number;
  channel: PricingChannel;
};

export function splitSale(
  saleAmount: number,
  costBasis: number,
  channel: PricingChannel
): SaleSplit {
  const vat = hasVat(channel) ? saleAmount - saleAmount / (1 + VAT_RATE) : 0;
  const grossExclVat = saleAmount - vat;
  const bscProfit = grossExclVat - costBasis;
  return {
    revenue: saleAmount,
    cost_basis: costBasis,
    bsc_profit: bscProfit,
    vat_collected: vat,
    channel,
  };
}

// ─────────────────────────── Persistence ───────────────────────────

// Write one sale's split into the financials table.
//
// Schema: see sql/2026-05-08-financials.sql.
// `order_id` is optional — POS callers don't always capture the inserted
// order id. Channel and vat_collected are first-class columns so we can
// filter / report by them later.
export async function recordSaleFinancials(args: {
  saleAmount: number;
  costBasis: number;
  channel: PricingChannel;
  orderId?: string | null;
}): Promise<SaleSplit> {
  const split = splitSale(args.saleAmount, args.costBasis, args.channel);

  const { error } = await supabase.from("financials").insert({
    channel:       split.channel,
    revenue:       round2(split.revenue),
    profit:        round2(Math.max(0, split.bsc_profit)),
    supplier_owed: round2(split.cost_basis),
    vat_collected: round2(split.vat_collected),
    transactions:  1,
    order_id:      args.orderId ?? null,
  });
  if (error) throw error;

  return split;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Aggregate everything in the financials table. Hits the DB on every call —
// no in-memory caching, since module-scope state on the server gets shared
// across requests and silently drifts.
export async function getFinancialSummary(): Promise<{
  revenue: number;
  profit: number;
  supplierOwed: number;
  transactions: number;
}> {
  const { data, error } = await supabase
    .from("financials")
    .select("revenue, profit, supplier_owed, transactions");
  if (error || !data) {
    return { revenue: 0, profit: 0, supplierOwed: 0, transactions: 0 };
  }
  return {
    revenue:      data.reduce((s, r) => s + Number(r.revenue ?? 0), 0),
    profit:       data.reduce((s, r) => s + Number(r.profit ?? 0), 0),
    supplierOwed: data.reduce((s, r) => s + Number(r.supplier_owed ?? 0), 0),
    transactions: data.reduce((s, r) => s + Number(r.transactions ?? 0), 0),
  };
}
