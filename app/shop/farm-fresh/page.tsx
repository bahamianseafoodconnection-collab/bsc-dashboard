'use client';

// /shop/farm-fresh — customer marketplace for farmer listings.
// Delegates to the shared <VendorMarketShop kind="farmer" /> component.

import VendorMarketShop from '@/components/VendorMarketShop';

export default function FarmFreshPage() {
  return <VendorMarketShop kind="farmer" />;
}
