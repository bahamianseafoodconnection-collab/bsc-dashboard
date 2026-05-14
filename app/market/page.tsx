'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

const CATEGORIES = ['All', 'Seafood', 'Meat', 'Poultry', 'Produce', 'Grocery', 'Beverage', 'Other'];

const CATEGORY_MAP: Record<string, string> = {
  fresh_seafood: 'Seafood',
  frozen_seafood: 'Seafood',
  processed_seafood: 'Seafood',
  meat: 'Meat',
  poultry: 'Poultry',
  produce: 'Produce',
  grocery: 'Grocery',
  beverage: 'Beverage',
  snack: 'Grocery',
  household: 'Other',
  other: 'Other',
};

const CATEGORY_EMOJI: Record<string, string> = {
  Seafood: '🦐',
  Meat: '🥩',
  Poultry: '🍗',
  Produce: '🥦',
  Grocery: '🌾',
  Beverage: '🥤',
  Other: '📦',
};

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'name';

interface MarketProduct {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  raw_category: string;
  price: number;
  unit: string;
  image_url: string;
  featured: boolean;
  stock_qty?: number;
  avg_rating?: number;
  review_count?: number;
}

interface CartItem extends MarketProduct {
  qty: number;
}

export default function MarketPage() {
  return (
    <Suspense fallback={null}>
      <MarketPageInner />
    </Suspense>
  );
}

function MarketPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [products, setProducts] = useState<MarketProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('featured');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [orderDone, setOrderDone] = useState(false);

  useEffect(() => {
    const c = searchParams.get('category');
    if (c && CATEGORIES.includes(c)) setCategory(c);
  }, []);

  // Load cart from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('bsc_cart');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) setCart(parsed as CartItem[]);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem('bsc_cart', JSON.stringify(cart)); } catch {}
  }, [cart]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Query products with online_market pricing joined
        const { data, error } = await supabase
          .from('products')
          .select(`
            id, sku, name, description, product_category,
            image_url, is_featured, sell_online, status,
            product_pricing!inner (
              manual_unit_price, channel, is_current
            )
          `)
          .eq('sell_online', true)
          .eq('status', 'active')
          .eq('product_pricing.channel', 'online_market')
          .eq('product_pricing.is_current', true)
          .order('name');

        if (error) throw error;

        const mapped: MarketProduct[] = (data || []).map((p: any) => {
          const pricing = Array.isArray(p.product_pricing)
            ? p.product_pricing[0]
            : p.product_pricing;
          const rawCat = p.product_category ?? 'other';
          return {
            id: p.id,
            sku: p.sku ?? '',
            name: p.name,
            description: p.description ?? '',
            category: CATEGORY_MAP[rawCat] ?? 'Other',
            raw_category: rawCat,
            price: pricing?.manual_unit_price ?? 0,
            unit: rawCat === 'weight_lb' ? 'lb' : 'each',
            image_url: p.image_url ?? '',
            featured: p.is_featured ?? false,
          };
        });

        setProducts(mapped);

        // Best-effort inventory counts
        if (mapped.length > 0) {
          const ids = mapped.map(p => p.id);
          const { data: inv } = await supabase
            .from('inventory_batches')
            .select('product_id, units_remaining, weight_lbs_remaining')
            .in('product_id', ids)
            .eq('is_active', true);

          if (inv && inv.length > 0) {
            const stock = new Map<string, number>();
            for (const r of inv as any[]) {
              const qty = (r.units_remaining ?? 0) + (r.weight_lbs_remaining ?? 0);
              stock.set(r.product_id, (stock.get(r.product_id) ?? 0) + qty);
            }
            setProducts(prev => prev.map(p =>
              stock.has(p.id) ? { ...p, stock_qty: stock.get(p.id) } : p
            ));
          }
        }
      } catch (err) {
        console.error('Market load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    return products
      .filter(p => {
        const matchCat = activeCategory === 'All' || p.category === activeCategory;
        const q = search.trim().toLowerCase();
        const matchSearch = !q ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q);
        return matchCat && matchSearch;
      })
      .sort((a, b) => {
        if (sort === 'price-asc') return a.price - b.price;
        if (sort === 'price-desc') return b.price - a.price;
        if (sort === 'name') return a.name.localeCompare(b.name);
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [products, activeCategory, search, sort]);

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  function addToCart(p: MarketProduct) {
    setCart(prev => {
      const ex = prev.find(i => i.id === p.id);
      if (ex) return prev.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...p, qty: 1 }];
    });
  }

  function updateQty(id: string, qty: number) {
    if (qty < 1) { setCart(prev => prev.filter(i => i.id !== id)); return; }
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
  }

  async function placeOrder() {
    setPlacing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from('orders').insert({
        channel: 'online_market',
        payment_method: 'cod',
        status: 'pending',
        items: cart.map(i => ({
          product_id: i.id,
          sku: i.sku,
          name: i.name,
          quantity: i.qty,
          unit_price: i.price,
          line_total: +(i.price * i.qty).toFixed(2),
        })),
        total_amount: +cartTotal.toFixed(2),
        customer_id: session?.user.id ?? null,
        location: 'online',
      });
      setOrderDone(true);
      setCart([]);
      setShowCart(false);
    } catch (err) {
      console.error('Order error:', err);
      alert('Order failed — please try again or call us on WhatsApp.');
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">

      {/* Header */}
      <header className="sticky top-0 z-40 shadow-md" style={{ backgroundColor: '#060d1f' }}>
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-3 px-3 sm:h-16 sm:gap-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <img
              src={`${STORAGE_BASE}/94C94225-7A21-4E0F-BA00-79CA6E108385.jpg`}
              alt="BSC"
              className="h-9 w-9 rounded-full object-cover"
              style={{ border: '2px solid #f5c518' }}
            />
            <div className="hidden text-white sm:block">
              <div className="text-sm font-extrabold tracking-wide" style={{ color: '#f5c518', fontFamily: 'Playfair Display, serif' }}>
                BSC Marketplace
              </div>
              <div className="text-[10px] text-slate-300">Nassau · Bahamas 🇧🇸</div>
            </div>
          </Link>

          <div className="flex flex-1 items-center">
            <div className="relative w-full">
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search seafood, meats, beverages…"
                className="h-10 w-full rounded-lg border-0 bg-white px-4 pr-10 text-sm text-slate-900 shadow-sm outline-none ring-1 ring-transparent placeholder:text-slate-400 focus:ring-2 sm:h-11"
                style={{ '--tw-ring-color': '#f5c518' } as any}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            </div>
          </div>

          <button
            onClick={() => setShowCart(true)}
            className="relative flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold transition sm:h-11 sm:px-4"
            style={{ backgroundColor: '#f5c518', color: '#060d1f' }}
          >
            <span className="text-lg">🛒</span>
            <span className="hidden sm:inline">
              {cartCount > 0 ? `BSD $${cartTotal.toFixed(2)}` : 'Cart'}
            </span>
            {cartCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Category strip */}
        <div className="border-t border-white/10" style={{ backgroundColor: '#0a1628' }}>
          <div className="mx-auto flex max-w-screen-2xl gap-2 overflow-x-auto px-3 py-2 sm:px-6 [&::-webkit-scrollbar]:hidden">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition"
                style={activeCategory === cat
                  ? { backgroundColor: '#f5c518', color: '#060d1f' }
                  : { backgroundColor: 'rgba(255,255,255,0.1)', color: '#e2e8f0' }}
              >
                {CATEGORY_EMOJI[cat] ?? '🛍️'} {cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-1 px-4 py-4 sm:px-6 sm:py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#f5c518' }}>
            Shop Local · Delivered Fresh
          </p>
          <h1 className="text-2xl font-bold sm:text-3xl" style={{ fontFamily: 'Playfair Display, serif', color: '#060d1f' }}>
            BSC Online Market
          </h1>
          <p className="text-sm text-slate-600 sm:text-base">
            Fresh Bahamian seafood + Nassau's top wholesale brands, delivered to your door.
          </p>
        </div>
      </section>

      <div className="mx-auto flex max-w-screen-2xl gap-6 px-3 py-5 sm:px-6">

        {/* Sidebar */}
        <aside className="hidden w-48 shrink-0 lg:block">
          <div className="space-y-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Category</div>
              <div className="space-y-1">
                {CATEGORIES.map(cat => {
                  const count = cat === 'All' ? filtered.length : filtered.filter(p => p.category === cat).length;
                  return (
                    <button key={cat}
                      onClick={() => setCategory(cat)}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition"
                      style={activeCategory === cat
                        ? { backgroundColor: '#060d1f', color: '#f5c518', fontWeight: 700 }
                        : { color: '#374151' }}>
                      <span>{cat}</span>
                      <span className="text-xs text-slate-400">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Sort</div>
              <select value={sort} onChange={e => setSort(e.target.value as SortOption)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none">
                <option value="featured">Featured first</option>
                <option value="price-asc">Price: Low → High</option>
                <option value="price-desc">Price: High → Low</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              {loading ? <span className="animate-pulse">Loading…</span> : (
                <span><span className="font-bold" style={{ color: '#060d1f' }}>{filtered.length}</span> product{filtered.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <button onClick={() => setShowFilters(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 lg:hidden">
              ≡ Filters
            </button>
          </div>

          {orderDone && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
              <span className="text-xl">✅</span>
              <div className="flex-1">
                <div className="font-bold">Order placed!</div>
                <div className="text-xs text-emerald-700">BSC will confirm and arrange delivery. WhatsApp: +1 (242) 558-4495</div>
              </div>
              <button onClick={() => setOrderDone(false)} className="text-emerald-900">×</button>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
                  <div className="aspect-square animate-pulse bg-slate-200" />
                  <div className="space-y-2 p-3">
                    <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
                    <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
                    <div className="h-8 w-full animate-pulse rounded bg-slate-200" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl bg-white px-6 py-16 text-center shadow-sm">
              <div className="mb-3 text-5xl">🔍</div>
              <h3 className="mb-1 text-base font-bold" style={{ color: '#060d1f' }}>No products found</h3>
              <p className="mb-4 text-sm text-slate-500">Try a different search or category.</p>
              <button onClick={() => { setSearch(''); setCategory('All'); }}
                className="rounded-lg px-4 py-2 text-sm font-bold text-white transition"
                style={{ backgroundColor: '#060d1f' }}>
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map(p => {
                const inCart = cart.find(i => i.id === p.id);
                return (
                  <article key={p.id}
                    className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-100 transition hover:shadow-md">
                    <div className="relative aspect-square cursor-pointer overflow-hidden bg-slate-100"
                      onClick={() => router.push(`/product/${p.id}`)}>
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} loading="lazy"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-5xl">
                          {CATEGORY_EMOJI[p.category] ?? '📦'}
                        </div>
                      )}
                      <div className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold shadow-sm"
                        style={{ backgroundColor: '#060d1f', color: '#f5c518' }}>
                        🇧🇸 BSC
                      </div>
                      {p.featured && (
                        <div className="absolute right-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-extrabold shadow-sm"
                          style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                          ★ FEATURED
                        </div>
                      )}
                      {typeof p.stock_qty === 'number' && p.stock_qty > 0 && p.stock_qty <= 5 && (
                        <div className="absolute bottom-2 left-2 rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm">
                          Only {Math.floor(p.stock_qty)} left
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col gap-1.5 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {p.category}
                      </div>
                      <h3 className="cursor-pointer text-sm font-bold leading-snug hover:underline sm:text-base"
                        style={{ color: '#060d1f', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        onClick={() => router.push(`/product/${p.id}`)}>
                        {p.name}
                      </h3>
                      {p.description && (
                        <p className="text-xs text-slate-500"
                          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {p.description}
                        </p>
                      )}
                      <div className="mt-auto flex items-baseline gap-1 pt-1">
                        <span className="text-lg font-extrabold sm:text-xl" style={{ color: '#060d1f' }}>
                          BSD ${p.price.toFixed(2)}
                        </span>
                        <span className="text-xs text-slate-400">/ {p.unit}</span>
                      </div>
                      <button onClick={() => addToCart(p)}
                        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition sm:text-sm"
                        style={inCart
                          ? { backgroundColor: '#d1fae5', color: '#065f46' }
                          : { backgroundColor: '#060d1f', color: '#f5c518' }}>
                        {inCart ? `✓ In cart (${inCart.qty})` : '+ Add to cart'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Trust bar */}
          {!loading && filtered.length > 0 && (
            <div className="mt-10 grid grid-cols-2 gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:grid-cols-4">
              {[
                { icon: '🇧🇸', title: 'Bahamian-owned', sub: 'Family-run from Nassau' },
                { icon: '🚚', title: 'Fast delivery', sub: 'Nassau & Andros, same-day' },
                { icon: '❄️', title: 'Cold-chain fresh', sub: 'Spiny Tail processing' },
                { icon: '💬', title: 'WhatsApp support', sub: '+1 (242) 558-4495' },
              ].map(it => (
                <div key={it.title} className="flex items-center gap-3">
                  <div className="text-2xl">{it.icon}</div>
                  <div>
                    <div className="text-xs font-bold" style={{ color: '#060d1f' }}>{it.title}</div>
                    <div className="text-[11px] text-slate-500">{it.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Mobile filter drawer */}
      {showFilters && (
        <div className="fixed inset-0 z-50 flex bg-black/50 lg:hidden"
          onClick={e => { if (e.target === e.currentTarget) setShowFilters(false); }}>
          <div className="flex h-full w-72 max-w-[80%] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="text-lg font-bold" style={{ color: '#060d1f' }}>Filters</div>
              <button onClick={() => setShowFilters(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-700">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Category</div>
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => { setCategory(cat); setShowFilters(false); }}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition mb-1"
                    style={activeCategory === cat
                      ? { backgroundColor: '#060d1f', color: '#f5c518', fontWeight: 700 }
                      : { color: '#374151' }}>
                    <span>{cat}</span>
                  </button>
                ))}
              </div>
              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Sort</div>
                <select value={sort} onChange={e => setSort(e.target.value as SortOption)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="featured">Featured first</option>
                  <option value="price-asc">Price: Low → High</option>
                  <option value="price-desc">Price: High → Low</option>
                  <option value="name">Name A–Z</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart drawer */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50"
          onClick={e => { if (e.target === e.currentTarget) setShowCart(false); }}>
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4" style={{ backgroundColor: '#060d1f' }}>
              <div>
                <div className="text-lg font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>Your Cart</div>
                <div className="text-xs text-slate-300">
                  {cartCount} item{cartCount !== 1 ? 's' : ''} · BSD ${cartTotal.toFixed(2)}
                </div>
              </div>
              <button onClick={() => setShowCart(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-white"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-3 text-5xl">🛒</div>
                  <div className="text-sm font-bold text-slate-700">Your cart is empty</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-start gap-3 border-b border-slate-100 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold" style={{ color: '#060d1f' }}>{item.name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          BSD ${item.price.toFixed(2)} × {item.qty}{' '}
                          <span className="font-bold" style={{ color: '#060d1f' }}>
                            = ${(item.price * item.qty).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => updateQty(item.id, item.qty - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-base font-bold">−</button>
                        <span className="min-w-6 text-center text-sm font-bold">{item.qty}</span>
                        <button onClick={() => updateQty(item.id, item.qty + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-base font-bold">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t border-slate-200 p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-slate-600">Total</span>
                  <span className="text-2xl font-extrabold" style={{ color: '#060d1f' }}>
                    BSD ${cartTotal.toFixed(2)}
                  </span>
                </div>
                <button onClick={() => { setShowCart(false); router.push('/checkout'); }}
                  className="mb-2 w-full rounded-lg py-3 text-sm font-bold transition"
                  style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                  Proceed to checkout →
                </button>
                <button onClick={placeOrder} disabled={placing}
                  className="w-full rounded-lg py-3 text-sm font-bold text-white transition disabled:opacity-50"
                  style={{ backgroundColor: '#060d1f' }}>
                  {placing ? 'Placing…' : '✅ Quick order (cash on delivery)'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
