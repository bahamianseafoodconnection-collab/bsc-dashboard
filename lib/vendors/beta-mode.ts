// Vendor Marketplace beta-mode flag.
//
// Single source of truth for "are we live with 15% commission or running
// the beta with 0%?". Driven by the Vercel env var BETA_MODE_VENDORS.
//
// Default: BETA. Production must explicitly set BETA_MODE_VENDORS=false
// to start charging commission.

export const COMMISSION_RATE = 0.15;

export function isBetaMode(): boolean {
  // Treat anything other than the literal string "false" as beta=true.
  // Avoids accidentally going to production-pricing because of a typo
  // (e.g. "False" or unset env → still 0% commission).
  const v = (process.env.BETA_MODE_VENDORS ?? 'true').trim().toLowerCase();
  return v !== 'false';
}

export interface VendorPayoutMath {
  total_price:       number;
  commission_amount: number;
  vendor_payout:     number;
  beta:              boolean;
}

/**
 * Given a total sale price, return the commission + vendor payout split.
 * In beta mode the vendor receives 100% and commission_amount = 0.
 */
export function computePayoutSplit(total_price: number): VendorPayoutMath {
  const beta = isBetaMode();
  const commission = beta ? 0 : Math.round(total_price * COMMISSION_RATE * 100) / 100;
  const payout     = Math.round((total_price - commission) * 100) / 100;
  return {
    total_price:       Math.round(total_price * 100) / 100,
    commission_amount: commission,
    vendor_payout:     payout,
    beta,
  };
}
