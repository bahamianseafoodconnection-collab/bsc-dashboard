// app/category/[slug]/page.tsx
//
// SEO + customer department landing page. One page per BSC category.
// Departments map 1:1 to products.category via lib/departments.ts, so the
// slug resolves to the EXACT category value (e.g. /category/frozen-seafood →
// category = 'frozen_seafood'). Prices come from product_pricing
// (online_market) — the same source the marketplace uses — so the page never
// shows a stale products.price.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { DEPARTMENTS, departmentBySlug } from '@/lib/departments';

export const dynamic = 'force-dynamic';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  unit: string | null;
  image_url: string | null;
  featured: boolean;
};

// Fetch the department's online-shoppable products, priced from the
// online_market channel (matches the marketplace).
async function fetchProducts(categoryValue: string): Promise<Product[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const supa = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: prods } = await supa
      .from('products')
      .select('id, name, description, unit_of_measure, image_url, featured')
      .eq('category', categoryValue)
      .eq('status', 'active')
      .eq('sell_online', true)
      .order('featured', { ascending: false })
      .order('name', { ascending: true })
      .limit(60);
    const rows = (prods || []) as Array<{
      id: string; name: string; description: string | null;
      unit_of_measure: string | null; image_url: string | null; featured: boolean;
    }>;
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const { data: prices } = await supa
      .from('product_pricing')
      .select('product_id, manual_unit_price')
      .in('product_id', ids)
      .eq('channel', 'online_market')
      .eq('is_current', true)
      .eq('is_active', true);
    const priceMap = new Map<string, number>();
    for (const p of (prices || []) as { product_id: string; manual_unit_price: number }[]) {
      priceMap.set(p.product_id, Number(p.manual_unit_price));
    }

    // Only list products that actually have an online price (same as /market).
    return rows
      .filter((r) => (priceMap.get(r.id) ?? 0) > 0)
      .map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        price: priceMap.get(r.id) ?? 0,
        unit: r.unit_of_measure,
        image_url: r.image_url,
        featured: r.featured,
      }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const dept = departmentBySlug(slug);
  if (!dept) return { title: 'Department · BSC Marketplace' };
  const title = `${dept.label} · BSC Marketplace`;
  const description = dept.blurb;
  return {
    title,
    description,
    openGraph: {
      title, description, type: 'website', siteName: 'BSC Marketplace',
      images: [{ url: `${STORAGE_BASE}/94C94225-7A21-4E0F-BA00-79CA6E108385.jpg`, alt: `BSC ${dept.label}` }],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function CategoryPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dept = departmentBySlug(slug);
  if (!dept) notFound();

  const products = await fetchProducts(dept.value);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-3 px-3 sm:h-16 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <img src="/brand/bsc-marketplace-logo.png" alt="BSC Marketplace" className="h-10 w-10 rounded-lg bg-white p-1 object-contain shadow ring-1 ring-gold/40" />
            <div className="hidden text-white sm:block">
              <div className="text-sm font-extrabold tracking-wide text-gold">BSC Marketplace</div>
              <div className="text-[10px] text-slate-300">Nassau · Bahamas 🇧🇸</div>
            </div>
          </Link>
          <Link href="/market" className="ml-auto rounded-lg bg-gold px-3 py-2 text-xs font-bold text-navy hover:bg-gold-300">
            Shop all →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-700 to-navy text-white">
        <div className="mx-auto max-w-screen-xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Department</div>
          <h1 className="mt-1 flex items-center gap-3 font-display text-4xl font-black sm:text-5xl">
            <span>{dept.emoji}</span> {dept.label}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-200 sm:text-base">{dept.blurb}</p>
        </div>
      </section>

      {/* Products */}
      <main className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6 sm:py-12">
        {products.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-card">
            <div className="mb-3 text-5xl">{dept.emoji}</div>
            <h2 className="font-display text-xl font-black text-navy">No items in {dept.label} right now</h2>
            <p className="mt-2 text-sm text-slate-500">Check back soon — restock arrivals show up here automatically.</p>
            <Link href="/market" className="mt-5 inline-block rounded-xl bg-navy px-6 py-3 text-sm font-black text-gold hover:bg-navy-700">
              Browse the rest of the market
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((p) => (
              <Link key={p.id} href={`/product/${p.id}`}
                className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-100 transition hover:shadow-card-hover">
                <div className="relative aspect-square overflow-hidden bg-slate-100">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl">{dept.emoji}</div>
                  )}
                  {p.featured && (
                    <div className="absolute right-2 top-2 rounded-md bg-gold px-2 py-0.5 text-[10px] font-extrabold text-navy shadow-sm">★ FEATURED</div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <h3 className="clamp-2 text-sm font-bold leading-snug text-navy">{p.name}</h3>
                  <div className="mt-auto pt-2">
                    <div className="text-base font-extrabold text-navy">BSD ${Number(p.price).toFixed(2)}</div>
                    {p.unit && <div className="text-[11px] text-slate-500">/ {p.unit}</div>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Other departments */}
        <section className="mt-12 rounded-2xl bg-white p-6 shadow-card sm:p-8">
          <h2 className="font-display text-xl font-black text-navy sm:text-2xl">Shop other departments</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {DEPARTMENTS.filter((d) => d.slug !== dept.slug).map((d) => (
              <Link key={d.slug} href={`/category/${d.slug}`}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-navy hover:text-gold">
                {d.emoji} {d.label}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
