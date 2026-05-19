// =====================================================================
// lib/cart-pricing.ts
//
// Cart-line pricing helper used by both /pos (cashier) and /products
// (admin sell-from-products panel). Wraps lib/pricing.ts with the
// per-channel-snapshot reality of how products are priced in this DB:
// each product has a manual_unit_price for nassau_pos AND local_wholesale
// (the legacy schema). We compute the EFFECTIVE price for each cart
// line by checking whether the quantity qualifies as wholesale; if it
// does, we swap to the wholesale-channel snapshot.
//
// The new BSC pricing structure (22/19/35/40/40 + 10% VAT) lives in
// lib/pricing.ts and Supabase pricing_rules. That math is the source of
// truth when ADMIN re-prices products. /pos itself just picks between
// the two stored snapshots based on qualification.
// =====================================================================

import { qualifiesAsWholesale, type SaleUnit } from './pricing';

export type PosChannel = 'nassau_pos' | 'andros_pos' | 'online_retail';

/**
 * Stored per-product price snapshots from the legacy `product_pricing`
 * table. We need both so the cart can swap when the line qualifies as
 * wholesale.
 */
export interface ProductPriceSnapshot {
  retail_price:    number;      // nassau_pos / andros_pos / online_retail snapshot
  wholesale_price: number | null; // local_wholesale snapshot (null = no wholesale price set; never auto-upgrade)
  promo_price:     number | null; // weekly promo override (Wednesday etc.); always wins over wholesale
}

export interface CartLinePricing {
  unit_price:                number;
  applied_channel:           'retail' | 'wholesale' | 'promo';
  upgraded_to_wholesale:     boolean;
  qualifies_as_wholesale:    boolean;
  wholesale_price_available: boolean;
}

/**
 * Decide the effective unit price for a cart line.
 *
 * Rules:
 *  - Promo always wins (Wednesday discounts etc. stay sacred).
 *  - Otherwise, if the line qualifies as wholesale (10+ lbs of this one
 *    product OR by the case) AND we have a wholesale snapshot for it,
 *    use wholesale. Show the "upgraded" flag so the UI can show a badge.
 *  - Else use retail.
 */
export function priceCartLine(
  snapshot: ProductPriceSnapshot,
  quantity: number,
  unit:     SaleUnit,
): CartLinePricing {
  if (snapshot.promo_price != null && snapshot.promo_price > 0) {
    return {
      unit_price:                snapshot.promo_price,
      applied_channel:           'promo',
      upgraded_to_wholesale:     false,
      qualifies_as_wholesale:    qualifiesAsWholesale(quantity, unit),
      wholesale_price_available: snapshot.wholesale_price != null,
    };
  }

  const qualifies = qualifiesAsWholesale(quantity, unit);
  const hasWholesale = snapshot.wholesale_price != null && snapshot.wholesale_price > 0;

  if (qualifies && hasWholesale) {
    return {
      unit_price:                snapshot.wholesale_price!,
      applied_channel:           'wholesale',
      upgraded_to_wholesale:     true,
      qualifies_as_wholesale:    true,
      wholesale_price_available: true,
    };
  }

  return {
    unit_price:                snapshot.retail_price,
    applied_channel:           'retail',
    upgraded_to_wholesale:     false,
    qualifies_as_wholesale:    qualifies,
    wholesale_price_available: hasWholesale,
  };
}

/** How many "units" this line counts as for total + wholesale qualification. */
export function lineCount(quantity: number, weightLb: number | null | undefined): number {
  return weightLb && weightLb > 0 ? weightLb : quantity;
}

export function lineTotal(
  snapshot: ProductPriceSnapshot,
  quantity: number,
  unit:     SaleUnit,
  weightLb: number | null | undefined,
): { line_subtotal: number; pricing: CartLinePricing; count: number } {
  const count = lineCount(quantity, weightLb);
  const pricing = priceCartLine(snapshot, count, unit);
  return {
    line_subtotal: Math.round(pricing.unit_price * count * 100) / 100,
    pricing,
    count,
  };
}
