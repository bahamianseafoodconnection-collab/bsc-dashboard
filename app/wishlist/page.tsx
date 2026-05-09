'use client';

// /wishlist — saved-products page for signed-in customers.
// Reads from public.wishlists (RLS limits the rows to the current user)
// and joins to public.products to render image / name / price + actions.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

type Product = {
  id: string;
  name: string;
  price: number;
  unit: string | null;
  category: string | null;
  image_url: string | null;
  in_stock: boolean;
};

type WishlistRow = {
  id: string;
  created_at: string;
  product_id: string;
  product: Product | null;
};

type CartItem = {
  id: string;
  source: 'market';
  name: string;
  price: number;
  qty: number;
  unit: string;
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
      const { data } = await supabase
        .from('wishlists')
        .select(
          `id, created_at, product_id,
           product:products ( id, name, price, unit, category, image_url, in_stock )`
        )
        .eq('auth_user_id', user.id)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      const normalized = ((data || []) as unknown as Array<{
        id: string;
        created_at: string;
        product_id: string;
        product: Product | Product[] | null;
      }>).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        product_id: r.product_id,
        product: Array.isArray(r.product) ? r.product[0] ?? null : r.product,
      }));
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
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('bsc_cart');
      const current: CartItem[] = stored ? JSON.parse(stored) : [];
      const idx = current.findIndex((i) => i.id === p.id && i.source === 'market');
      if (idx >= 0) {
        current[idx].qty += 1;
      } else {
        current.push({
          id: p.id,
          source: 'market',
          name: p.name,
          price: p.price,
          qty: 1,
          unit: p.unit || 'each',
          image_url: p.image_url || undefined,
        });
      }
      window.localStorage.setItem('bsc_cart', JSON.stringify(current));
      router.push('/checkout');
    } catch { /* storage failure — ignore */ }
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
                  {!p.in_stock && (
                    <div className="absolute inset-x-2 top-2 rounded-md bg-red-600 px-2 py-1 text-center text-[10px] font-extrabold text-white shadow">
                      Out of stock
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
                  BSD ${p.price.toFixed(2)}
                  <span className="ml-1 text-[11px] font-medium text-slate-500">
                    / {p.unit || 'each'}
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  <button
                    onClick={() => addToCart(p)}
                    disabled={!p.in_stock}
                    className="rounded-lg bg-navy px-3 py-2 text-xs font-black text-gold transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {p.in_stock ? 'Add to cart' : 'Unavailable'}
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
              src={`${STORAGE_BASE}/logo.jpg`}
              alt="BSC"
              className="h-9 w-9 rounded-full border-2 border-gold object-cover"
            />
            <div className="hidden text-white sm:block">
              <div className="text-sm font-extrabold tracking-wide text-gold">
                BSC Marketplace
              </div>
              <div className="text-[10px] text-slate-300">Nassau · Bahamas 🇧🇸</div>
            </div>
          </Link>
          <Link
            href="/my-orders"
            className="ml-auto rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
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
