// app/product/[id]/page.tsx
//
// Server wrapper that generates per-product SEO metadata (title,
// description, OG image) before rendering the client component.

import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import ProductClient from './client';

export const dynamic = 'force-dynamic';

type Params = { id: string };

async function fetchProductSummary(id: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    // Bare client — anon read; products are public.
    const supa = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await supa
      .from('products')
      .select('id, name, description, price, unit, category, image_url')
      .eq('id', id)
      .maybeSingle();
    return data as
      | {
          id: string;
          name: string;
          description: string | null;
          price: number;
          unit: string | null;
          category: string | null;
          image_url: string | null;
        }
      | null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await fetchProductSummary(id);
  if (!p) {
    return {
      title: 'Product · BSC Marketplace',
      description: 'Fresh Bahamian seafood, meats, and groceries delivered across Nassau and the Family Islands.',
    };
  }
  const title = `${p.name} · BSC Marketplace`;
  const description =
    p.description?.trim() ||
    `BSD $${Number(p.price).toFixed(2)}/${p.unit || 'each'}. Shop ${p.name} from the Bahamian Seafood Connection — delivered to Nassau and the Family Islands.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'BSC Marketplace',
      ...(p.image_url ? { images: [{ url: p.image_url }] } : {}),
    },
    twitter: {
      card: p.image_url ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(p.image_url ? { images: [p.image_url] } : {}),
    },
  };
}

export default function ProductPage() {
  return <ProductClient />;
}
