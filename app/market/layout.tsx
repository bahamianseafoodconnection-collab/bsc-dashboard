// app/market/layout.tsx
//
// Static SEO metadata for the marketplace. Per-product metadata lives on
// /product/[id]/page.tsx via generateMetadata.

import type { Metadata } from 'next';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

export const metadata: Metadata = {
  title: 'Shop · BSC Marketplace',
  description:
    'Fresh Bahamian seafood, meats, produce, and wholesale partners — all delivered to your door across Nassau and the Family Islands.',
  keywords: [
    'Bahamas seafood',
    'Nassau food delivery',
    'Bahamian marketplace',
    'BSC',
    'fresh fish Bahamas',
    'mailboat shipping',
    'Andros delivery',
  ],
  openGraph: {
    title: 'Shop · BSC Marketplace',
    description:
      'Fresh Bahamian seafood and groceries delivered across Nassau and the Family Islands.',
    type: 'website',
    locale: 'en_BS',
    siteName: 'BSC Marketplace',
    images: [
      {
        url: `${STORAGE_BASE}/94C94225-7A21-4E0F-BA00-79CA6E108385.jpg`,
        alt: 'Bahamian Seafood Connection',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Shop · BSC Marketplace',
    description: 'Fresh Bahamian seafood and groceries — delivered.',
  },
};

export default function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
