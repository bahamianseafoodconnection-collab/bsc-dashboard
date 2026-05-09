// app/sitemap.ts
//
// Dynamic sitemap. Lists static customer-facing routes + every category
// landing page + the most recent in-stock products. Fetched at request
// time via the anon Supabase client.

import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { siteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

const CATEGORY_SLUGS = [
  'seafood', 'meat', 'produce', 'beverages',
  'dairy', 'frozen', 'dry-goods',
];

async function recentProductIds(): Promise<{ id: string; updated: string }[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const supa = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await supa
      .from('products')
      .select('id, updated_at, created_at')
      .eq('in_stock', true)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(500);
    return ((data || []) as Array<{ id: string; updated_at?: string | null; created_at?: string }>).map(
      (p) => ({ id: p.id, updated: p.updated_at || p.created_at || new Date().toISOString() }),
    );
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`,                lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/market`,          lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${base}/local-wholesale`, lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${base}/us-shopping`,     lastModified: now, changeFrequency: 'weekly',  priority: 0.5 },
    { url: `${base}/login`,           lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = CATEGORY_SLUGS.map((slug) => ({
    url: `${base}/category/${slug}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  const products = await recentProductIds();
  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${base}/product/${p.id}`,
    lastModified: new Date(p.updated),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
