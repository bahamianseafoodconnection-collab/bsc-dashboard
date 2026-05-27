// bscbahamas.com landing
//
// Per founder direction 2026-05-26: the marketplace IS the home page.
// Customers landing on bscbahamas.com should see the marketplace
// directly — not a separate hero landing. /market owns the storefront
// experience + the three big tabs (Fishermen / Farmers / Pay Utility
// Bills) that drive category navigation.
//
// This is a server-side redirect (307) — instant, no flash of content.
// The previous 569-line landing design (founder-approved 2026-05-24)
// is preserved in git history at commit 7c88033 if we ever need to
// restore parts of it.
//
// Future option if we want the URL to stay as `/` instead of redirecting
// to `/market`: add a Next.js rewrite in next.config or extract /market
// into a shared component and render it inline here. Tonight: redirect.

import { redirect } from 'next/navigation';

export default function RootPage(): never {
  redirect('/market');
}
