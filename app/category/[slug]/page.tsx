// app/category/[slug]/page.tsx
//
// SEO landing page per product category. Server-rendered so each
// category gets its own title/description/OG image. Lists products in
// the category with images, prices, and a CTA back to /market for full
// add-to-cart interactivity.
//
// Routes use lowercase slugs (e.g. /category/seafood). The slug ↔
// category-name mapping lives in CATEGORY_META below.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

type CategoryMeta = {
  /** Display name as stored on products.category */
  name: string;
  emoji: string;
  hero: string;
  shortDesc: string;
  longDesc: string;
};

const CATEGORY_META: Record<string, CategoryMeta> = {
  seafood: {
    name: 'Seafood',
    emoji: '🦐',
    hero: '#0e2c4d',
    shortDesc: 'Fresh Bahamian seafood, hauled by Nassau captains and processed at Spiny Tail.',
    longDesc:
      'From conch to grouper, lobster to snapper, the BSC seafood program is sourced directly from Bahamian captains and cold-chain managed every step. Order online for Nassau pickup, local delivery, or mailboat shipment to the Family Islands.',
  },
  meat: {
    name: 'Meat',
    emoji: '🥩',
    hero: '#5e2a2a',
    shortDesc: 'Premium meats — beef, chicken, pork — sourced and stocked for Bahamian kitchens.',
    longDesc:
      'BSC carries the meat cuts Bahamian families and restaurants reach for daily, with consistent supply through hurricane season and the holidays.',
  },
  produce: {
    name: 'Produce',
    emoji: '🥦',
    hero: '#1f4d2c',
    shortDesc: 'Fresh produce, sourced weekly and delivered cold.',
    longDesc:
      'Vegetables and fruit from local Bahamian farms when in season, supplemented by trusted import partners.',
  },
  beverages: {
    name: 'Beverages',
    emoji: '🥤',
    hero: '#1f3a4d',
    shortDesc: 'Drinks, juices, and bottled water from Nassau wholesalers.',
    longDesc:
      'Single bottles to wholesale cases — what bars, restaurants, and homes order most.',
  },
  dairy: {
    name: 'Dairy',
    emoji: '🥛',
    hero: '#3d3d20',
    shortDesc: 'Milk, cheese, butter, and dairy staples.',
    longDesc:
      'Cold-chain managed dairy from Asa H Pritchard, Solomon’s, and other Nassau distributors.',
  },
  frozen: {
    name: 'Frozen',
    emoji: '🧊',
    hero: '#1d3556',
    shortDesc: 'Frozen goods kept at Spiny Tail Processing temperatures.',
    longDesc:
      'Frozen seafood, vegetables, and prepared foods, ready to ship same-day in Nassau.',
  },
  'dry-goods': {
    name: 'Dry Goods',
    emoji: '🌾',
    hero: '#4d3a1f',
    shortDesc: 'Pantry staples, rice, flour, sugar, oils.',
    longDesc:
      'The shelf-stable basics every Bahamian kitchen needs, in retail and bulk sizes.',
  },
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  unit: string | null;
  image_url: string | null;
  in_stock: boolean;
  featured: boolean;
};

async function fetchProducts(category: string): Promise<Product[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const supa = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await supa
      .from('products')
      .select('id, name, description, price, unit, image_url, in_stock, featured')
      .eq('category', category)
      .eq('in_stock', true)
      .order('featured', { ascending: false })
      .order('name', { ascending: true })
      .limit(48);
    return (data || []) as Product[];
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = CATEGORY_META[slug.toLowerCase()];
  if (!meta) {
    return { title: 'Category · BSC Marketplace' };
  }
  const title = `${meta.name} · BSC Marketplace`;
  const description = meta.shortDesc;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'BSC Marketplace',
      images: [
        {
          url: `${STORAGE_BASE}/94C94225-7A21-4E0F-BA00-79CA6E108385.jpg`,
          alt: `BSC ${meta.name}`,
        },
      ],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = CATEGORY_META[slug.toLowerCase()];
  if (!meta) notFound();

  const products = await fetchProducts(meta.name);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-3 px-3 sm:h-16 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <img
              src={`${STORAGE_BASE}/logo.jpg`}
              alt="BSC"
              className="h-9 w-9 rounded-full border-2 border-gold object-cover"
            />
            <div className="hidden text-white sm:block">
              <div className="text-sm font-extrabold tracking-wide text-gold">BSC Marketplace</div>
              <div className="text-[10px] text-slate-300">Nassau · Bahamas 🇧🇸</div>
            </div>
          </Link>
          <Link
            href="/market"
            className="ml-auto rounded-lg bg-gold px-3 py-2 text-xs font-bold text-navy hover:bg-gold-300"
          >
            Shop all →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden text-white"
        style={{
          background: `linear-gradient(120deg, ${meta.hero} 0%, #060d1f 100%)`,
        }}
      >
        <div className="mx-auto max-w-screen-xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
            Category
          </div>
          <h1 className="mt-1 flex items-center gap-3 font-display text-4xl font-black sm:text-5xl">
            <span>{meta.emoji}</span> {meta.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-200 sm:text-base">
            {meta.longDesc}
          </p>
          <Link
            href={`/market?category=${encodeURIComponent(meta.name)}`}
            className="mt-5 inline-block rounded-xl bg-gold px-6 py-3 text-sm font-black text-navy hover:bg-gold-300"
          >
            Shop {meta.name} on the market →
          </Link>
        </div>
      </section>

      {/* Products */}
      <main className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6 sm:py-12">
        {products.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-card">
            <div className="mb-3 text-5xl">{meta.emoji}</div>
            <h2 className="font-display text-xl font-black text-navy">No items right now</h2>
            <p className="mt-2 text-sm text-slate-500">
              Check back soon — restock arrivals show up here automatically.
            </p>
            <Link
              href="/market"
              className="mt-5 inline-block rounded-xl bg-navy px-6 py-3 text-sm font-black text-gold hover:bg-navy-700"
            >
              Browse the rest of the market
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((p) => (
              <Link
                key={p.id}
                href={`/product/${p.id}`}
                className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-100 transition hover:shadow-card-hover"
              >
                <div className="relative aspect-square overflow-hidden bg-slate-100">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt={p.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl">
                      {meta.emoji}
                    </div>
                  )}
                  {p.featured && (
                    <div className="absolute right-2 top-2 rounded-md bg-gold px-2 py-0.5 text-[10px] font-extrabold text-navy shadow-sm">
                      ★ FEATURED
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <h3 className="clamp-2 text-sm font-bold leading-snug text-navy">
                    {p.name}
                  </h3>
                  <div className="mt-auto pt-2">
                    <div className="text-base font-extrabold text-navy">
                      BSD ${Number(p.price).toFixed(2)}
                    </div>
                    {p.unit && (
                      <div className="text-[11px] text-slate-500">/ {p.unit}</div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* SEO copy block — gives the page real text content for indexing */}
        <section className="mt-12 rounded-2xl bg-white p-6 shadow-card sm:p-8">
          <h2 className="font-display text-xl font-black text-navy sm:text-2xl">
            About BSC {meta.name}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700 sm:text-base">
            {meta.longDesc}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-700 sm:text-base">
            We deliver across Nassau within 24 hours and ship to Andros, Eleuthera, Exuma, Abaco,
            Grand Bahama, and the rest of the Family Islands by mailboat. Track every order from
            our marketplace dashboard, with WhatsApp updates the moment your shipment is on the way.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {Object.entries(CATEGORY_META).filter(([s]) => s !== slug).map(([s, m]) => (
              <Link
                key={s}
                href={`/category/${s}`}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-navy hover:text-gold"
              >
                {m.emoji} {m.name}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
