'use client';

// app/product/[id]/page.tsx
//
// Public product detail page. Shows the full product image, name, price,
// description, category, related items, and an Add-to-Cart action that
// writes into the same localStorage cart key /market reads from.
//
// Tailwind, brand tokens, mobile-first.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  unit: string | null;
  category: string | null;
  image_url: string | null;
  in_stock: boolean;
  featured: boolean;
};

type CartItem = {
  id: string;
  source: 'market' | 'wholesale' | 'us';
  name: string;
  price: number;
  qty: number;
  unit: string;
  sku?: string;
  image_url?: string;
};

const CATEGORY_EMOJI: Record<string, string> = {
  Seafood: '🦐',
  Meat: '🥩',
  Produce: '🥦',
  Beverages: '🥤',
  Dairy: '🥛',
  Frozen: '🧊',
  'Dry Goods': '🌾',
  Other: '📦',
};

export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, description, price, unit, category, image_url, in_stock, featured')
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const p = data as Product;
      setProduct(p);

      if (p.category) {
        const { data: relData } = await supabase
          .from('products')
          .select('id, name, description, price, unit, category, image_url, in_stock, featured')
          .eq('category', p.category)
          .eq('in_stock', true)
          .neq('id', p.id)
          .limit(8);
        if (!cancelled) setRelated((relData || []) as Product[]);
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  function addToCart() {
    if (!product || typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('bsc_cart');
      const current: CartItem[] = stored ? JSON.parse(stored) : [];
      const existingIdx = current.findIndex(
        (i) => i.id === product.id && i.source === 'market'
      );
      if (existingIdx >= 0) {
        current[existingIdx].qty += qty;
      } else {
        current.push({
          id: product.id,
          source: 'market',
          name: product.name,
          price: product.price,
          qty,
          unit: product.unit || 'each',
          image_url: product.image_url || undefined,
        });
      }
      window.localStorage.setItem('bsc_cart', JSON.stringify(current));
      setAdded(true);
      setTimeout(() => setAdded(false), 1800);
    } catch {
      /* storage failure — UI feedback skipped */
    }
  }

  function buyNow() {
    addToCart();
    router.push('/checkout');
  }

  if (loading) return <Centered>Loading…</Centered>;
  if (notFound || !product) return <NotFound />;

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
            className="ml-auto rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
          >
            ← All products
          </Link>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Image */}
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100 shadow-card">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-7xl">
                {CATEGORY_EMOJI[product.category || ''] || '📦'}
              </div>
            )}
            {product.featured && (
              <div className="absolute right-3 top-3 rounded-md bg-gold px-3 py-1 text-xs font-extrabold text-navy shadow">
                ★ Featured
              </div>
            )}
            {!product.in_stock && (
              <div className="absolute inset-x-3 top-3 rounded-md bg-red-600 px-3 py-1 text-center text-xs font-extrabold text-white shadow">
                Out of stock
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col">
            {product.category && (
              <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-gold-700">
                {product.category}
              </div>
            )}
            <h1 className="font-display text-3xl font-black leading-tight text-navy sm:text-4xl">
              {product.name}
            </h1>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-navy sm:text-4xl">
                BSD ${product.price.toFixed(2)}
              </span>
              <span className="text-sm text-slate-500">/ {product.unit || 'each'}</span>
            </div>

            {product.description && (
              <p className="mt-5 text-sm leading-relaxed text-slate-700 sm:text-base">
                {product.description}
              </p>
            )}

            {/* Trust lines */}
            <ul className="mt-5 space-y-1.5 text-xs text-slate-600">
              <li>🇧🇸 Sourced + handled by Bahamian Seafood Connection</li>
              <li>❄️ Cold-chain managed at Spiny Tail Processing</li>
              <li>🚚 Nassau pickup or mailboat to Family Islands</li>
              <li>💬 Questions? WhatsApp +1 (242) 361-3474</li>
            </ul>

            {/* Quantity + actions */}
            {product.in_stock ? (
              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Qty
                  </span>
                  <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
                    <button
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      className="px-3 py-1.5 text-lg font-bold text-navy"
                      aria-label="Decrease quantity"
                    >−</button>
                    <span className="w-10 text-center text-sm font-bold">{qty}</span>
                    <button
                      onClick={() => setQty((q) => q + 1)}
                      className="px-3 py-1.5 text-lg font-bold text-navy"
                      aria-label="Increase quantity"
                    >+</button>
                  </div>
                  <span className="ml-2 text-sm text-slate-500">
                    Total: <span className="font-bold text-navy">BSD ${(product.price * qty).toFixed(2)}</span>
                  </span>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={addToCart}
                    className={`flex-1 rounded-xl px-6 py-3.5 text-sm font-black transition ${
                      added
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-navy text-gold hover:bg-navy-700'
                    }`}
                  >
                    {added ? '✓ Added to cart' : '+ Add to cart'}
                  </button>
                  <button
                    onClick={buyNow}
                    className="flex-1 rounded-xl bg-gold px-6 py-3.5 text-sm font-black text-navy transition hover:bg-gold-300"
                  >
                    Buy now →
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                This item is currently out of stock. Check back soon.
              </div>
            )}
          </div>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-5 font-display text-2xl font-black text-navy">
              More from {product.category}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/product/${r.id}`}
                  className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-100 transition hover:shadow-card-hover"
                >
                  <div className="relative aspect-square overflow-hidden bg-slate-100">
                    {r.image_url ? (
                      <img
                        src={r.image_url}
                        alt={r.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-4xl">
                        {CATEGORY_EMOJI[r.category || ''] || '📦'}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="clamp-2 text-sm font-bold leading-snug text-navy">
                      {r.name}
                    </h3>
                    <div className="mt-1 text-base font-extrabold text-navy">
                      BSD ${r.price.toFixed(2)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500 font-sans">
      {children}
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center font-sans">
      <div className="mb-3 text-5xl">🔍</div>
      <h1 className="font-display text-2xl font-black text-navy">Product not found</h1>
      <p className="mt-2 text-sm text-slate-500">
        We couldn&rsquo;t find that item. It may have sold out or been removed.
      </p>
      <Link
        href="/market"
        className="mt-6 rounded-xl bg-navy px-6 py-3 text-sm font-black text-gold transition hover:bg-navy-700"
      >
        Browse the market
      </Link>
    </div>
  );
}
