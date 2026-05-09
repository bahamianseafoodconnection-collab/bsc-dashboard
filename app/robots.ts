// app/robots.ts
//
// Public crawler policy. Block back-office routes (everything that's not
// part of the customer-facing storefront) and surface the sitemap.

import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/market',
          '/category/',
          '/product/',
          '/local-wholesale',
          '/us-shopping',
          '/login',
          '/track/',
          '/help',
          '/shipping',
          '/returns',
          '/contact',
        ],
        disallow: [
          '/dashboard',
          '/orders',
          '/inventory',
          '/expenses',
          '/payroll',
          '/reports',
          '/notifications',
          '/processor',
          '/captains',
          '/supplier',
          '/supplier-portal',
          '/supplier-purchases',
          '/purchase-orders',
          '/wholesale-orders',
          '/wholesale-products',
          '/promos',
          '/reviews-admin',
          '/customers',
          '/accounts-payable',
          '/bills',
          '/utilities',
          '/fleet',
          '/vehicles',
          '/labels',
          '/yield',
          '/pos',
          '/pos-andros',
          '/cash',
          '/cod-flag',
          '/founder-ai',
          '/api/',
          '/account',
          '/checkout',
          '/my-orders',
          '/wishlist',
          '/landed-cost',
          '/staff/',
          '/partner-tokens',
          '/partner/',
          '/receipt/',
          '/invoice/',
          '/pick-ticket/',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
