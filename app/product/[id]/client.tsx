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

type Review = {
  id: string;
  created_at: string;
  rating: number;
  title: string | null;
  body: string | null;
  author_name: string;
  is_verified_purchase: boolean;
  auth_user_id: string | null;
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

  // Auth + identity
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authUserName, setAuthUserName] = useState<string>('');
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);

  // Reviews
  const [reviews, setReviews] = useState<Review[]>([]);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [rRating, setRRating] = useState(5);
  const [rTitle, setRTitle] = useState('');
  const [rBody, setRBody] = useState('');
  const [rSubmitting, setRSubmitting] = useState(false);
  const [rError, setRError] = useState<string | null>(null);

  // Wishlist
  const [inWishlist, setInWishlist] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);

  // Recently viewed (other products, excluding this one)
  const [recent, setRecent] = useState<Product[]>([]);

  // Resolve identity once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user) {
        setAuthUserId(user.id);
        setAuthUserEmail(user.email ?? null);
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
        if (!cancelled) {
          setAuthUserName(
            (prof?.full_name as string) ||
              (user.email ? user.email.split('@')[0] : 'Customer')
          );
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load reviews + wishlist status when product or user changes
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data: revData } = await supabase
        .from('product_reviews')
        .select('id, created_at, rating, title, body, author_name, is_verified_purchase, auth_user_id')
        .eq('product_id', id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      setReviews((revData || []) as Review[]);

      if (authUserId) {
        const { data: wl } = await supabase
          .from('wishlists')
          .select('id')
          .eq('product_id', id)
          .eq('auth_user_id', authUserId)
          .maybeSingle();
        if (!cancelled) setInWishlist(!!wl);
      }
    })();
    return () => { cancelled = true; };
  }, [id, authUserId]);

  // Track this product in localStorage 'bsc_recent_viewed' (FIFO, max 12),
  // then load the other recently viewed products into a strip below.
  useEffect(() => {
    if (!id || typeof window === 'undefined') return;
    let cancelled = false;
    let priorIds: string[] = [];
    try {
      const raw = window.localStorage.getItem('bsc_recent_viewed');
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      priorIds = (Array.isArray(arr) ? arr : []).filter((x) => typeof x === 'string' && x !== id);
      const next = [id, ...priorIds].slice(0, 12);
      window.localStorage.setItem('bsc_recent_viewed', JSON.stringify(next));
    } catch { /* ignore */ }

    if (priorIds.length === 0) { setRecent([]); return; }
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, description, price, unit, category, image_url, in_stock, featured')
        .in('id', priorIds.slice(0, 8));
      if (cancelled) return;
      // Preserve the localStorage order so the most recent shows first.
      const byId = new Map<string, Product>();
      ((data || []) as Product[]).forEach((p) => byId.set(p.id, p));
      setRecent(priorIds.slice(0, 8).map((rid) => byId.get(rid)).filter(Boolean) as Product[]);
    })();
    return () => { cancelled = true; };
  }, [id]);

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

  async function toggleWishlist() {
    if (!product) return;
    if (!authUserId) {
      router.push(`/login?next=/product/${product.id}`);
      return;
    }
    setWishlistBusy(true);
    try {
      if (inWishlist) {
        await supabase
          .from('wishlists')
          .delete()
          .eq('auth_user_id', authUserId)
          .eq('product_id', product.id);
        setInWishlist(false);
      } else {
        await supabase
          .from('wishlists')
          .insert({ auth_user_id: authUserId, product_id: product.id });
        setInWishlist(true);
      }
    } catch {
      /* silent — UI reflects intent */
    } finally {
      setWishlistBusy(false);
    }
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!product || !authUserId) return;
    setRError(null);
    if (!(rRating >= 1 && rRating <= 5)) { setRError('Pick 1–5 stars.'); return; }
    setRSubmitting(true);
    const { error } = await supabase.from('product_reviews').insert({
      product_id: product.id,
      auth_user_id: authUserId,
      author_name: authUserName || (authUserEmail || 'Customer'),
      rating: rRating,
      title: rTitle.trim() || null,
      body: rBody.trim() || null,
      status: 'approved',
    });
    setRSubmitting(false);
    if (error) {
      setRError(
        error.code === '23505'
          ? 'You already reviewed this product. Edit your existing review.'
          : error.message
      );
      return;
    }
    // Reload review list
    const { data: revData } = await supabase
      .from('product_reviews')
      .select('id, created_at, rating, title, body, author_name, is_verified_purchase, auth_user_id')
      .eq('product_id', product.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(50);
    setReviews((revData || []) as Review[]);
    setShowReviewForm(false);
    setRTitle(''); setRBody(''); setRRating(5);
  }

  const reviewCount = reviews.length;
  const avgRating = reviewCount > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviewCount
    : 0;
  const userAlreadyReviewed = !!(authUserId && reviews.find((r) => r.auth_user_id === authUserId));

  if (loading) return <Centered>Loading…</Centered>;
  if (notFound || !product) return <NotFound />;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-3 px-3 sm:h-16 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <img
              src="/brand/bsc-marketplace-logo.png"
              alt="BSC Marketplace"
              className="h-10 w-10 rounded-lg bg-white p-1 object-contain shadow ring-1 ring-gold/40"
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
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display text-3xl font-black leading-tight text-navy sm:text-4xl">
                {product.name}
              </h1>
              <button
                onClick={toggleWishlist}
                disabled={wishlistBusy}
                aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl transition ${
                  inWishlist
                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-red-500'
                }`}
              >
                {inWishlist ? '♥' : '♡'}
              </button>
            </div>

            {/* Star summary — links down to the reviews section */}
            {reviewCount > 0 ? (
              <a
                href="#reviews"
                className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-navy"
              >
                <Stars value={avgRating} />
                <span className="font-bold text-navy">{avgRating.toFixed(1)}</span>
                <span>·</span>
                <span>
                  {reviewCount} review{reviewCount === 1 ? '' : 's'}
                </span>
              </a>
            ) : (
              <a
                href="#reviews"
                className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500 hover:text-navy"
              >
                <Stars value={0} muted />
                <span>Be the first to review</span>
              </a>
            )}

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

        {/* Reviews */}
        <section id="reviews" className="mt-14 rounded-2xl bg-white p-5 shadow-card sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-black text-navy">
                Customer reviews
              </h2>
              {reviewCount > 0 ? (
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                  <Stars value={avgRating} />
                  <span className="font-bold text-navy">{avgRating.toFixed(1)}</span>
                  <span>·</span>
                  <span>
                    Based on {reviewCount} review{reviewCount === 1 ? '' : 's'}
                  </span>
                </div>
              ) : (
                <div className="mt-1 text-sm text-slate-500">
                  No reviews yet — be the first.
                </div>
              )}
            </div>
            {authUserId && !userAlreadyReviewed && !showReviewForm && (
              <button
                onClick={() => setShowReviewForm(true)}
                className="rounded-xl bg-navy px-5 py-2.5 text-xs font-black text-gold hover:bg-navy-700"
              >
                + Write a review
              </button>
            )}
            {!authUserId && (
              <Link
                href={`/login?next=/product/${product.id}`}
                className="rounded-xl border border-navy px-5 py-2.5 text-xs font-black text-navy hover:bg-navy hover:text-gold"
              >
                Sign in to review
              </Link>
            )}
          </div>

          {showReviewForm && authUserId && !userAlreadyReviewed && (
            <form
              onSubmit={submitReview}
              className="mt-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200"
            >
              <div className="mb-3">
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-600">
                  Your rating
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRRating(n)}
                      aria-label={`${n} star${n === 1 ? '' : 's'}`}
                      className={`text-3xl leading-none transition ${
                        n <= rRating ? 'text-gold' : 'text-slate-300 hover:text-gold/60'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={rTitle}
                onChange={(e) => setRTitle(e.target.value)}
                placeholder="Title (optional)"
                maxLength={120}
                className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-navy focus:outline-none"
              />
              <textarea
                value={rBody}
                onChange={(e) => setRBody(e.target.value)}
                placeholder="Tell other shoppers what you thought…"
                maxLength={2000}
                rows={4}
                className="mb-2 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-navy focus:outline-none"
              />
              {rError && (
                <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {rError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={rSubmitting}
                  className="rounded-xl bg-navy px-5 py-2.5 text-xs font-black text-gold hover:bg-navy-700 disabled:opacity-60"
                >
                  {rSubmitting ? 'Posting…' : 'Post review'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowReviewForm(false); setRError(null); }}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {reviews.length > 0 && (
            <ul className="mt-6 space-y-5 divide-y divide-slate-100">
              {reviews.map((rv, i) => (
                <li key={rv.id} className={i === 0 ? '' : 'pt-5'}>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Stars value={rv.rating} />
                    {rv.title && (
                      <span className="text-sm font-bold text-navy">{rv.title}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {rv.author_name}
                    {rv.is_verified_purchase && (
                      <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        ✓ Verified buyer
                      </span>
                    )}
                    <span className="ml-2 text-slate-400">
                      · {new Date(rv.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {rv.body && (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {rv.body}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recently viewed */}
        {recent.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-3 font-display text-xl font-black text-navy">
              Recently viewed
            </h2>
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
              {recent.map((r) => (
                <Link
                  key={r.id}
                  href={`/product/${r.id}`}
                  className="group flex w-36 shrink-0 flex-col overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-100 transition hover:shadow-card-hover sm:w-44"
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
                      <div className="flex h-full w-full items-center justify-center text-3xl">
                        {CATEGORY_EMOJI[r.category || ''] || '📦'}
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <h3 className="clamp-2 text-xs font-bold leading-snug text-navy sm:text-sm">
                      {r.name}
                    </h3>
                    <div className="mt-1 text-sm font-extrabold text-navy">
                      BSD ${r.price.toFixed(2)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

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

function Stars({ value, muted = false }: { value: number; muted?: boolean }) {
  // Renders 5 stars where each is filled, half, or empty based on value.
  const v = Math.max(0, Math.min(5, value));
  return (
    <span className="inline-flex" aria-label={`${v.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, v - (n - 1)));
        const pct = Math.round(fill * 100);
        const base = muted ? 'text-slate-300' : 'text-slate-300';
        const accent = muted ? 'text-slate-400' : 'text-gold';
        return (
          <span key={n} className="relative inline-block text-base leading-none">
            <span className={base}>★</span>
            <span
              className={`absolute inset-0 overflow-hidden ${accent}`}
              style={{ width: `${pct}%` }}
              aria-hidden
            >
              ★
            </span>
          </span>
        );
      })}
    </span>
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
