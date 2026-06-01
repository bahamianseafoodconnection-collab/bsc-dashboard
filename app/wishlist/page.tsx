'use client';

// /wishlist — saved-products page for signed-in customers.
//
// Pricing source: public.products has a stale `price` column we deliberately
// don't trust. The live online_market price + wholesale snapshot + active
// special come from product_pricing + products.special_price. Add-to-cart
// goes through lib/cart so checkout's per-line wholesale auto-upgrade has
// the full pricing shape.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { addToCart as addToCartHelper, type CartUnitType } from '@/lib/cart';

export const dynamic = 'force-dynamic';

type Product = {
  id: string;
  name: string;
  unit_of_measure: string | null;
  category: string | null;
  image_url: string | null;
  sku: string | null;
  description: string | null;
  // Live pricing — populated in a second round-trip from product_pricing.
  retail_price: number;
  wholesale_price: number | null;
  special_price: number | null;
};

type WishlistRow = {
  id: string;
  created_at: string;
  product_id: string;
  product: Product | null;
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

export default function WishlistPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [rows, setRows] = useState<WishlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setAuthChecked(true);
      if (!user) {
        setSignedIn(false);
        setLoading(false);
        return;
      }
      setSignedIn(true);
      // Wishlist rows + the product catalog data we display.
      const { data } = await supabase
        .from('wishlists')
        .select(
          `id, created_at, product_id,
           product:products ( id, name, unit_of_measure, category, image_url, sku, description, special_price, special_starts_at, special_ends_at )`,
        )
        .eq('auth_user_id', user.id)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      const raw = ((data || []) as unknown as Array<{
        id: string;
        created_at: string;
        product_id: string;
        product: (Omit<Product, 'retail_price' | 'wholesale_price'> & { special_starts_at?: string | null; special_ends_at?: string | null }) | Array<Omit<Product, 'retail_price' | 'wholesale_price'> & { special_starts_at?: string | null; special_ends_at?: string | null }> | null;
      }>);

      const productIds: string[] = [];
      const intermediate = raw.map((r) => {
        const p = Array.isArray(r.product) ? r.product[0] ?? null : r.product;
        if (p?.id) productIds.push(p.id);
        return { ...r, product: p };
      });

      // Fetch the live online_market + local_wholesale prices in one round
      // trip — products.price is stale and would render every wishlist
      // item as $0.00.
      const priceMap = new Map<string, { retail: number; wholesale: number | null }>();
      if (productIds.length > 0) {
        const { data: pricingRows } = await supabase
          .from('product_pricing')
          .select('product_id, channel, manual_unit_price')
          .in('product_id', productIds)
          .in('channel', ['online_market', 'local_wholesale'])
          .eq('is_current', true);
        ((pricingRows as { product_id: string; channel: string; manual_unit_price: number }[]) || []).forEach((row) => {
          const cur = priceMap.get(row.product_id) || { retail: 0, wholesale: null };
          if (row.channel === 'online_market')   cur.retail    = Number(row.manual_unit_price);
          if (row.channel === 'local_wholesale') cur.wholesale = Number(row.manual_unit_price);
          priceMap.set(row.product_id, cur);
        });
      }

      const now = Date.now();
      const normalized: WishlistRow[] = intermediate.map((r) => {
        if (!r.product) return { id: r.id, created_at: r.created_at, product_id: r.product_id, product: null };
        const snap = priceMap.get(r.product.id) || { retail: 0, wholesale: null };
        // Only honour an active special — the column may carry a stale
        // value outside the start/end window.
        const sp = r.product.special_price;
        const startsOk = !r.product.special_starts_at || Date.parse(r.product.special_starts_at) <= now;
        const endsOk   = !r.product.special_ends_at   || Date.parse(r.product.special_ends_at)   >= now;
        const special = (sp != null && sp > 0 && startsOk && endsOk) ? Number(sp) : null;
        return {
          id: r.id,
          created_at: r.created_at,
          product_id: r.product_id,
          product: {
            id: r.product.id,
            name: r.product.name,
            unit_of_measure: r.product.unit_of_measure,
            category: r.product.category,
            image_url: r.product.image_url,
            sku: r.product.sku,
            description: r.product.description,
            retail_price: snap.retail,
            wholesale_price: snap.wholesale,
            special_price: special,
          },
        };
      });
      setRows(normalized);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  async function removeFromWishlist(id: string) {
    setBusyId(id);
    const { error } = await supabase.from('wishlists').delete().eq('id', id);
    setBusyId(null);
    if (!error) setRows((rs) => rs.filter((r) => r.id !== id));
  }

  function addToCart(p: Product) {
    const unitType: CartUnitType = p.unit_of_measure === 'lb' ? 'lb' : p.unit_of_measure === 'case' ? 'case' : 'each';
    addToCartHelper({
      id: p.id,
      source: 'market',
      sku: p.sku,
      name: p.name,
      image_url: p.image_url,
      price: p.retail_price,
      wholesale_price: p.wholesale_price,
      special_price: p.special_price,
      unit_type: unitType,
      qty: 1,
      unit: unitType,
      category: p.category,
      description: p.description,
    });
    router.push('/checkout');
  }

  if (!authChecked || loading) {
    return (
      <Shell>
        <div className="py-20 text-center text-slate-500">Loading your saved items…</div>
      </Shell>
    );
  }

  if (!signedIn) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-20 text-center">
          <div className="mb-3 text-5xl">♡</div>
          <h1 className="font-display text-2xl font-black text-navy">Sign in to see your wishlist</h1>
          <p className="mt-2 text-sm text-slate-500">
            Save products you love and find them again from any device.
          </p>
          <Link
            href="/login?next=/wishlist"
            className="mt-6 inline-block rounded-xl bg-navy px-6 py-3 text-sm font-black text-gold transition hover:bg-navy-700"
          >
            Sign in
          </Link>
        </div>
      </Shell>
    );
  }

  if (rows.length === 0) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-20 text-center">
          <div className="mb-3 text-5xl">♡</div>
          <h1 className="font-display text-2xl font-black text-navy">Your wishlist is empty</h1>
          <p className="mt-2 text-sm text-slate-500">
            Tap the heart on any product to save it here for later.
          </p>
          <Link
            href="/market"
            className="mt-6 inline-block rounded-xl bg-navy px-6 py-3 text-sm font-black text-gold transition hover:bg-navy-700"
          >
            Browse the market →
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-black text-navy sm:text-4xl">
            Your wishlist
          </h1>
          <div className="mt-1 text-sm text-slate-500">
            {rows.length} saved item{rows.length === 1 ? '' : 's'}
          </div>
        </div>
        <Link
          href="/market"
          className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-navy ring-1 ring-slate-200 hover:bg-slate-50"
        >
          ← Back to market
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {rows.map((r) => {
          const p = r.product;
          if (!p) {
            return (
              <div
                key={r.id}
                className="flex flex-col items-center justify-center rounded-xl bg-white p-6 text-center text-xs text-slate-400 shadow-card ring-1 ring-slate-100"
              >
                Product unavailable
                <button
                  onClick={() => removeFromWishlist(r.id)}
                  className="mt-3 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
                >
                  Remove
                </button>
              </div>
            );
          }
          return (
            <div
              key={r.id}
              className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-100 transition hover:shadow-card-hover"
            >
              <Link href={`/product/${p.id}`} className="block">
                <div className="relative aspect-square overflow-hidden bg-slate-100">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl">
                      {CATEGORY_EMOJI[p.category || ''] || '📦'}
                    </div>
                  )}
                  {p.retail_price <= 0 && (
                    <div className="absolute inset-x-2 top-2 rounded-md bg-red-600 px-2 py-1 text-center text-[10px] font-extrabold text-white shadow">
                      Unavailable
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex flex-1 flex-col p-3">
                <Link
                  href={`/product/${p.id}`}
                  className="clamp-2 text-sm font-bold leading-snug text-navy hover:text-navy-700"
                >
                  {p.name}
                </Link>
                <div className="mt-1 text-base font-extrabold text-navy">
                  BSD ${(p.special_price ?? p.retail_price).toFixed(2)}
                  <span className="ml-1 text-[11px] font-medium text-slate-500">
                    / {p.unit_of_measure || 'each'}
                  </span>
                  {p.special_price != null && p.retail_price > p.special_price && (
                    <span className="ml-2 align-middle text-[11px] text-slate-400 line-through">
                      ${p.retail_price.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  <button
                    onClick={() => addToCart(p)}
                    disabled={p.retail_price <= 0}
                    className="rounded-lg bg-navy px-3 py-2 text-xs font-black text-gold transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {p.retail_price > 0 ? 'Add to cart' : 'Unavailable'}
                  </button>
                  <button
                    onClick={() => removeFromWishlist(r.id)}
                    disabled={busyId === r.id}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
                  >
                    {busyId === r.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-3 px-3 sm:h-16 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <img
              src="/brand/bsc-marketplace-logo.png"
              alt="BSC Marketplace"
              className="h-10 w-10 rounded-lg bg-white p-1 object-contain shadow ring-1 ring-gold/40"
            />
            <div className="hidden text-white sm:block">
              <div className="text-sm font-extrabold tracking-wide text-gold">
                BSC Marketplace
              </div>
              <div className="text-[10px] text-slate-300">Nassau · Bahamas 🇧🇸</div>
            </div>
          </Link>
          <Link
            href="/account"
            className="ml-auto rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
          >
            Account
          </Link>
          <Link
            href="/my-orders"
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
          >
            My orders
          </Link>
          <Link
            href="/market"
            className="rounded-lg bg-gold px-3 py-2 text-xs font-bold text-navy hover:bg-gold-300"
          >
            Shop
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
    </div>
  );
}
