// =====================================================================
// lib/pricing.ts
// BSC Founder AI — Canonical Pricing Logic
//
// Mirror of bsc_calculate_price() in Supabase. The DB is the source of
// truth at commit time; this is for instant client-side previews.
// =====================================================================

export type PricingChannel =
  | 'wholesale_in_store'
  | 'wholesale_online'
  | 'online_retail'
  | 'nassau_pos'
  | 'andros_pos';

export type SaleUnit = 'lb' | 'case' | 'bag' | 'portion' | 'each';

export interface PricingRule {
  channel:     PricingChannel;
  markupPct:   number;
  vatPct:      number;
  description: string;
}

export interface PricingInput {
  cost:     number;
  channel:  PricingChannel;
  quantity: number;
  unit:     SaleUnit;
  /**
   * Optional VAT override. Pass the % directly (0 or 10), OR pass the
   * product's vat_category and use vatPctForCategory() to derive it.
   * When omitted, the channel's default vatPct is used (currently 10
   * for all channels — preserved for backward compat with older
   * callsites that haven't been patched yet).
   */
  vatPct?:  number;
}

/**
 * Bahamas VAT mapping by product category.
 *   uncooked_food   →  0%  (raw seafood / produce / dry grocery)
 *   cooked_prepared → 10%  (juice bar / kitchen-prepped)
 *   service         →  0%  (labour / consulting)
 *   anything else   →  10% (defensive — defaults to "taxable" until classified)
 */
export function vatPctForCategory(category: string | null | undefined): number {
  switch ((category ?? '').toLowerCase()) {
    case 'uncooked_food': return 0;
    case 'service':       return 0;
    case 'zero_rated':    return 0;   // VAT-Free item
    case 'cooked_prepared': return 10;
    case 'standard_rated':  return 10; // VAT item (household, toiletries, prepared)
    default: return 10;
  }
}

export interface PricingResult {
  effectiveChannel:    PricingChannel;
  markupPct:           number;
  vatPct:              number;
  subtotal:            number;
  vatAmount:           number;
  finalPrice:          number;
  upgradedToWholesale: boolean;
  unitPrice:           number;
  marginDollars:       number;
  marginPctOfRevenue:  number;
}

export const BSC_PRICING_RULES: Record<PricingChannel, PricingRule> = {
  wholesale_in_store: {
    channel:     'wholesale_in_store',
    markupPct:   22,
    vatPct:      10,
    description: 'In-store wholesale: 10+ lbs of one product OR by case, Nassau or Andros POS',
  },
  wholesale_online: {
    channel:     'wholesale_online',
    markupPct:   19,
    vatPct:      10,
    description: 'Online wholesale: 10+ lbs of one product OR by case, online store',
  },
  online_retail: {
    channel:     'online_retail',
    markupPct:   35,
    vatPct:      10,
    description: 'Under 10 lbs, per bag, or per portion (online)',
  },
  nassau_pos: {
    channel:     'nassau_pos',
    markupPct:   40,
    vatPct:      10,
    description: 'Nassau POS retail, unless qualifies as in-store wholesale',
  },
  andros_pos: {
    channel:     'andros_pos',
    markupPct:   40,
    vatPct:      10,
    description: 'Andros POS retail, unless qualifies as in-store wholesale',
  },
};

export const WHOLESALE_MIN_LBS = 10;
export const VAT_PCT = 10;

export function qualifiesAsWholesale(quantity: number, unit: SaleUnit): boolean {
  if (unit === 'case') return true;
  if (unit === 'lb' && quantity >= WHOLESALE_MIN_LBS) return true;
  return false;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Route a qualified POS line to in-store wholesale (22%); a qualified
// online line to online wholesale (19%).
function routeWholesale(channel: PricingChannel): PricingChannel {
  if (channel === 'nassau_pos' || channel === 'andros_pos') return 'wholesale_in_store';
  if (channel === 'online_retail')                          return 'wholesale_online';
  return channel;
}

export function calculatePrice(input: PricingInput): PricingResult {
  const { cost, channel, quantity, unit } = input;

  if (cost < 0)     throw new Error('Cost cannot be negative.');
  if (quantity <= 0) throw new Error('Quantity must be greater than zero.');

  let effectiveChannel: PricingChannel = channel;
  let upgradedToWholesale = false;

  if (
    qualifiesAsWholesale(quantity, unit) &&
    channel !== 'wholesale_in_store' &&
    channel !== 'wholesale_online'
  ) {
    effectiveChannel    = routeWholesale(channel);
    upgradedToWholesale = effectiveChannel !== channel;
  }

  const rule = BSC_PRICING_RULES[effectiveChannel];
  if (!rule) throw new Error(`No pricing rule for channel ${effectiveChannel}`);

  // VAT precedence:
  //   1. explicit input.vatPct (callsite passed product's vat_category result)
  //   2. channel default (currently 10 — kept for legacy callers; will be
  //      culled once every callsite passes vat_category through)
  const effectiveVatPct = typeof input.vatPct === 'number' ? input.vatPct : rule.vatPct;

  const subtotal           = round2(cost * (1 + rule.markupPct / 100));
  const vatAmount          = round2(subtotal * (effectiveVatPct / 100));
  const finalPrice         = round2(subtotal + vatAmount);
  const unitPrice          = round2(finalPrice / quantity);
  const marginDollars      = round2(subtotal - cost);
  const marginPctOfRevenue = subtotal > 0 ? round2(((subtotal - cost) / subtotal) * 100) : 0;

  return {
    effectiveChannel,
    markupPct: rule.markupPct,
    vatPct:    effectiveVatPct,
    subtotal,
    vatAmount,
    finalPrice,
    upgradedToWholesale,
    unitPrice,
    marginDollars,
    marginPctOfRevenue,
  };
}

export function explainPrice(input: PricingInput): string {
  const r = calculatePrice(input);
  const lines: string[] = [];
  lines.push(`Cost: $${input.cost.toFixed(2)} per ${input.unit}`);
  lines.push(`Quantity: ${input.quantity} ${input.unit}`);
  if (r.upgradedToWholesale) {
    lines.push(`Requested channel: ${input.channel} → upgraded to ${r.effectiveChannel} (qualifies at ${WHOLESALE_MIN_LBS}+ lbs or case).`);
  } else {
    lines.push(`Channel: ${r.effectiveChannel}`);
  }
  lines.push(`Markup: ${r.markupPct}%`);
  lines.push(`Subtotal (cost + markup): $${r.subtotal.toFixed(2)}`);
  lines.push(`VAT (${r.vatPct}%): $${r.vatAmount.toFixed(2)}`);
  lines.push(`Final price: $${r.finalPrice.toFixed(2)}`);
  lines.push(`Gross margin: $${r.marginDollars.toFixed(2)} (${r.marginPctOfRevenue}% of revenue)`);
  return lines.join('\n');
}

export const BILL_CASALE_GROSS_PCT = 5;
export function projectBillPayout(grossProfit: number): number {
  if (grossProfit <= 0) return 0;
  return round2(grossProfit * (BILL_CASALE_GROSS_PCT / 100));
}

export interface BulkRepriceItem {
  sku:      string;
  name:     string;
  cost:     number;
  channel:  PricingChannel;
  quantity: number;
  unit:     SaleUnit;
}

export interface BulkRepriceRow extends BulkRepriceItem { result: PricingResult; }

export function bulkReprice(items: BulkRepriceItem[]): BulkRepriceRow[] {
  return items.map((item) => ({
    ...item,
    result: calculatePrice({ cost: item.cost, channel: item.channel, quantity: item.quantity, unit: item.unit }),
  }));
}

export const FOUNDER_AI_PRICING_SYSTEM_PROMPT = `
BSC PRICING STRUCTURE (authoritative — never deviate):

- In-Store Wholesale: 22% markup. Applies to Nassau POS or Andros POS sales
  when a customer buys 10+ lbs of ONE product OR buys by the case.
- Online Wholesale: 19% markup. Applies to online store sales when a
  customer buys 10+ lbs of ONE product OR buys by the case.
- Online Retail: 35% markup. Anything sold online under 10 lbs, per bag,
  or per portion.
- Nassau POS Retail: 40% markup. Nassau in-store, non-wholesale-qualified.
- Andros POS Retail: 40% markup. Andros in-store, non-wholesale-qualified.
- VAT: 10% applied on top of the cost-plus-markup subtotal for ALL channels.

Wholesale qualification is PER LINE ITEM. 4 lbs snapper + 8 lbs salmon is
two retail lines; only when one product crosses 10 lbs does that line
upgrade to wholesale.

Wholesale ALWAYS wins over retail for qualified lines. A Nassau POS line
buying 12 lbs of conch gets in-store wholesale 22%, not 40%.

Bill Casale's 5% gross arrangement is sacred and handled at payout, NOT
in pricing.

Manny lobster export = market-price manual quote. Do not auto-price.

All price quotes must use bsc_calculate_price() (Supabase) or
calculatePrice() (TypeScript). Never hand-calculate.
`.trim();
