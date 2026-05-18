'use client';

// /shop/fresh-catch — customer marketplace for fisherman listings.
// Delegates to the shared <VendorMarketShop kind="fisherman" /> component.

import VendorMarketShop from '@/components/VendorMarketShop';

export default function FreshCatchPage() {
  return <VendorMarketShop kind="fisherman" />;
}
