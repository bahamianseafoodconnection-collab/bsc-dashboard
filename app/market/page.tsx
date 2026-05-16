'use client';

// /market — public storefront
//
// Design: Amazon-style dense product grid, mobile-first, navy + gold brand.
// Built with Tailwind. All product/cart/order logic preserved from the prior
// implementation; only the presentation layer was rebuilt.

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import FlyerBanner from '@/components/FlyerBanner';

export const dynamic = 'force-dynamic';

const BRANDS: Record<
  string,
  { name: string; color: string; light: string; emoji: string }
> = {
  'asa-h-pritchard':            { name: 'Asa H Pritchard',   color: '#1B4F72', light: '#d6eaf8', emoji: '🏪' },
  'bahamas-international-food': { name: 'Bahamas Intl Food', color: '#1E5C2E', light: '#d5f5e3', emoji: '🍱' },
  'dalbenas':                   { name: "D'Albenas",         color: '#784212', light: '#fdebd0', emoji: '🏭' },
  'bahamas-wholesale-agencies': { name: 'Bahamas Wholesale', color: '#1A5276', light: '#d6eaf8', emoji: '📦' },
  'tpg':                        { name: 'TPG',               color: '#2C3E50', light: '#d5d8dc', emoji: '🛒' },
  'thompson-trading':           { name: 'Thompson Trading',  color: '#922B21', light: '#fadbd8', emoji: '🤝' },
  'island-wholesale':           { name: 'Island Wholesale',  color: '#196F3D', light: '#d5f5e3', emoji: '🌴' },
};
const BRAND_KEYS = Object.keys(BRANDS);

const CATEGORIES = ['All', 'Seafood', 'Meat', 'Produce', 'Dry Goods', 'Beverages', 'Dairy', 'Frozen', 'Other'];

const CATEGORY_MAP: Record<string, string> = {
  fresh_seafood: 'Seafood',
  frozen_seafood: 'Seafood',
  processed_seafood: 'Seafood',
  meat: 'Meat',
  poultry: 'Meat',
  produce: 'Produce',
  grocery: 'Dry Goods',
  beverage: 'Beverages',
  juice_smoothie: 'Beverages',
  wellness_shot: 'Beverages',
  snack: 'Dry Goods',
  household: 'Other',
  toiletry: 'Other',
  other: 'Other',
};

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'name';

interface MarketProduct {
  id: string;
  source: 'market' | 'wholesale';
  sku?: string;
  wholesaler?: string;
  name: string;
  description: string;
  category: string;
  price: number;
  unit: string;
  min_qty: number;
  image_url: string;
  in_stock: boolean;
  featured: boolean;
  avg_rating?: number;
  review_count?: number;
  stock_qty?: number;
}

interface CartItem extends MarketProduct {
  qty: number;
}

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

  useEffect(() => {
    const c = searchParams.get('category');
    if (!c) return;
    if (CATEGORIES.includes(c)) setCategory(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [activeBrand, setBrand] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('featured');
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('bsc_cart');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCart(parsed as CartItem[]);
        }
      }
    } catch { /* ignore corrupt storage */ }
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('bsc_cart', JSON.stringify(cart));
    } catch { /* quota or private mode — silent ok */ }
  }, [cart]);
  const [showCart, setShowCart] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [orderDone, setOrderDone] = useState(false);

  useEffect(() => {
    (async () => {
      // Step 1: Get all current online_market prices
      const { data: pricingData, error: pricingErr } = await supabase
        .from('product_pricing')
        .select('product_id, manual_unit_price')
        .eq('channel', 'online_market')
        .eq('is_current', true)
        .eq('is_active', true);

      if (pricingErr || !pricingData || pricingData.length === 0) {
        setLoading(false);
        return;
      }

      const priceMap = new Map<string, number>();
      for (const row of pricingData as any[]) {
        priceMap.set(row.product_id, row.manual_unit_price);
      }
      const productIds = [...priceMap.keys()];

      // Step 2: Fetch active online products — column is 'category' not 'product_category'
      const { data: mp, error: mpErr } = await supabase
        .from('products')
        .select('id, sku, name, description, category, image_url, sell_online, status')
        .eq('sell_online', true)
        .eq('status', 'active')
        .in('id', productIds)
        .order('name');

      if (mpErr) {
        setLoading(false);
        return;
      }

      const market: MarketProduct[] = (mp || []).map((p: any) => ({
        id: p.id,
        source: 'market' as const,
        sku: p.sku ?? '',
        name: p.name,
        description: p.description || '',
        category: CATEGORY_MAP[p.category ?? 'other'] ?? 'Other',
        price: priceMap.get(p.id) ?? 0,
        unit: 'each',
        min_qty: 1,
        image_url: p.image_url || '',
        in_stock: true,
        featured: false,
      }));

      setProducts(market);
      setLoading(false);

      const marketIds = market.map((m) => m.id);
      if (marketIds.length > 0) {
        try {
          const { data: revs } = await supabase
            .from('product_reviews')
            .select('product_id, rating')
            .in('product_id', marketIds)
            .eq('status', 'approved');
          if (revs && revs.length > 0) {
            const buckets = new Map<string, { sum: number; n: number }>();
            for (const r of revs as Array<{ product_id: string; rating: number }>) {
              const cur = buckets.get(r.product_id) ?? { sum: 0, n: 0 };
              cur.sum += r.rating;
              cur.n += 1;
              buckets.set(r.product_id, cur);
            }
            setProducts((prev) =>
              prev.map((p) => {
                const b = buckets.get(p.id);
                if (!b) return p;
                return { ...p, avg_rating: b.sum / b.n, review_count: b.n };
              }),
            );
          }
        } catch { /* ignore */ }

        try {
          const { data: inv } = await supabase
            .from('inventory_batches')
            .select('product_id, units_remaining, weight_lbs_remaining')
            .in('product_id', marketIds)
            .eq('is_active', true);
          if (inv && inv.length > 0) {
            const stock = new Map<string, number>();
            for (const r of inv as any[]) {
              const qty = (r.units_remaining ?? 0) + (r.weight_lbs_remaining ?? 0);
              stock.set(r.product_id, (stock.get(r.product_id) ?? 0) + qty);
            }
            setProducts((prev) =>
              prev.map((p) =>
                stock.has(p.id) ? { ...p, stock_qty: stock.get(p.id) } : p,
              ),
            );
          }
        } catch { /* ignore */ }
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    return products
      .filter((p) => {
        const matchCat = activeCategory === 'All' || p.category === activeCategory;
        const matchBrand =
          activeBrand === 'all' ||
          (activeBrand === 'bsc' ? p.source === 'market' : p.wholesaler === activeBrand);
        const q = search.trim().toLowerCase();
        const matchSearch =
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.wholesaler ? BRANDS[p.wholesaler]?.name.toLowerCase().includes(q) : false);
        return matchCat && matchBrand && matchSearch;
      })
      .sort((a, b) => {
        if (sort === 'price-asc') return a.price - b.price;
        if (sort === 'price-desc') return b.price - a.price;
        if (sort === 'name') return a.name.localeCompare(b.name);
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [products, activeCategory, activeBrand, search, sort]);

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  function addToCart(p: MarketProduct) {
    setCart((prev) => {
      const ex = prev.find((i) => i.id === p.id && i.source === p.source);
      if (ex)
        return prev.map((i) =>
          i.id === p.id && i.source === p.source ? { ...i, qty: i.qty + p.min_qty } : i
        );
      return [...prev, { ...p, qty: p.min_qty }];
    });
  }

  function updateQty(id: string, source: string, qty: number) {
    if (qty < 1) {
      setCart((prev) => prev.filter((i) => !(i.id === id && i.source === source)));
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.id === id && i.source === source ? { ...i, qty } : i))
    );
  }

  async function placeOrder() {
    setPlacing(true);
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('orders').insert({
      channel: 'online_market',
      payment_method: 'cod',
      status: 'pending',
      items: cart.map((i) => ({
        product_id: i.id,
        sku: i.sku || null,
        name: i.name,
        quantity: i.qty,
        unit_price: i.price,
        line_total: +(i.price * i.qty).toFixed(2),
      })),
      total_amount: +cartTotal.toFixed(2),
      customer_id: session?.user.id || null,
      location: 'online',
    });
    setPlacing(false);
    setOrderDone(true);
    setCart([]);
    setShowCart(false);
  }

  const brandCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: products.length,
      bsc: products.filter((p) => p.source === 'market').length,
    };
    BRAND_KEYS.forEach((k) => {
      counts[k] = products.filter((p) => p.wholesaler === k).length;
    });
    return counts;
  }, [products]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">

      {/* ─── Header ─── */}
      <header className="sticky top-0 z-40 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-3 px-3 sm:h-16 sm:gap-4 sm:px-6">

          {/* ── Bahamian identity badge ── */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="flex items-center justify-center h-9 w-9 rounded-full sm:h-10 sm:w-10 text-xl font-black shrink-0"
              style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
              🇧🇸
            </div>
            <div className="text-white">
              <div className="text-sm font-extrabold tracking-wide" style={{ color: '#f5c518' }}>
                BSC Marketplace
              </div>
              <div className="text-[10px] text-slate-300">Shop Local · Nassau 🌊</div>
            </div>
          </Link>

          <div className="flex flex-1 items-center">
            <div className="relative w-full">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search seafood, meats, brands…"
                className="h-10 w-full rounded-lg border-0 bg-white px-4 pr-10 text-sm text-slate-900 shadow-sm outline-none ring-1 ring-transparent placeholder:text-slate-400 focus:ring-2 focus:ring-gold sm:h-11 sm:text-base"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                🔍
              </span>
            </div>
          </div>

          <Link href="/wishlist" aria-label="Open wishlist"
            className="hidden h-10 shrink-0 items-center justify-center rounded-lg bg-white/10 px-3 text-base text-white transition hover:bg-white/20 sm:flex sm:h-11"
            title="Wishlist">♡</Link>
          <Link href="/my-orders"
            className="hidden h-10 shrink-0 items-center justify-center rounded-lg bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/20 sm:flex sm:h-11">
            My orders
          </Link>
          <Link href="/account"
            className="hidden h-10 shrink-0 items-center justify-center rounded-lg bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/20 sm:flex sm:h-11">
            Account
          </Link>
          <button
            onClick={() => setShowCart(true)}
            className="relative flex h-10 shrink-0 items-center gap-2 rounded-lg bg-gold px-3 text-sm font-bold text-navy transition hover:bg-gold-300 sm:h-11 sm:px-4"
            aria-label={`Open cart — ${cartCount} items`}>
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

        {/* Brand strip */}
        <div className="border-t border-white/5 bg-navy-700">
          <div className="mx-auto flex max-w-screen-2xl gap-2 overflow-x-auto px-3 py-2 sm:px-6 [&::-webkit-scrollbar]:hidden">
            <BrandPill active={activeBrand === 'all'} onClick={() => setBrand('all')}
              label={`All (${brandCounts.all})`} activeBg="#f4c842" activeFg="#1a2e5a" />
            <BrandPill active={activeBrand === 'bsc'} onClick={() => setBrand('bsc')}
              label={`🇧🇸 BSC Direct (${brandCounts.bsc})`} activeBg="#1a2e5a" activeFg="#f4c842" withBorder />
            {BRAND_KEYS.filter((k) => brandCounts[k] > 0).map((k) => {
              const b = BRANDS[k];
              return (
                <BrandPill key={k} active={activeBrand === k}
                  onClick={() => setBrand(activeBrand === k ? 'all' : k)}
                  label={`${b.emoji} ${b.name} (${brandCounts[k]})`}
                  activeBg={b.color} activeFg="#fff" />
              );
            })}
          </div>
        </div>
      </header>

      {/* ─── Hero strip ─── */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-1 px-4 py-4 sm:px-6 sm:py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-600">
            Shop Local · Delivered Fresh
          </p>
          <h1 className="font-display text-2xl font-bold text-navy sm:text-3xl">
            BSC Online Market
          </h1>
          <p className="text-sm text-slate-600 sm:text-base">
            Fresh Bahamian seafood + Nassau&rsquo;s top wholesale brands, delivered to your door.
          </p>
        </div>
      </section>

      {/* ─── Flyer banner (Founder AI manages content via create_flyer) ─── */}
      <FlyerBanner />

      {/* ─── Shop by category strip ─── */}
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-screen-2xl px-3 py-3 sm:px-6">
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
            {[
              { slug: 'seafood',   label: 'Seafood',   emoji: '🦐' },
              { slug: 'meat',      label: 'Meat',      emoji: '🥩' },
              { slug: 'produce',   label: 'Produce',   emoji: '🥦' },
              { slug: 'beverages', label: 'Beverages', emoji: '🥤' },
              { slug: 'dairy',     label: 'Dairy',     emoji: '🥛' },
              { slug: 'frozen',    label: 'Frozen',    emoji: '🧊' },
              { slug: 'dry-goods', label: 'Dry Goods', emoji: '🌾' },
            ].map((c) => (
              <Link key={c.slug} href={`/category/${c.slug}`}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-navy transition hover:border-navy hover:bg-navy hover:text-gold">
                <span>{c.emoji}</span>
                <span>{c.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-screen-2xl gap-6 px-3 py-5 sm:px-6">

        {/* ─── Sidebar (desktop) ─── */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <FilterPanel activeCategory={activeCategory} setCategory={setCategory}
            sort={sort} setSort={setSort} products={filtered} />
        </aside>

        {/* ─── Main column ─── */}
        <main className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              {loading ? (
                <span>Loading…</span>
              ) : (
                <span>
                  <span className="font-bold text-navy">{filtered.length}</span>{' '}
                  product{filtered.length !== 1 ? 's' : ''}
                  {activeBrand !== 'all' && (
                    <span className="ml-2 text-slate-500">
                      · {activeBrand === 'bsc' ? '🇧🇸 BSC Direct' : `${BRANDS[activeBrand]?.emoji} ${BRANDS[activeBrand]?.name}`}
                    </span>
                  )}
                </span>
              )}
            </div>
            <button onClick={() => setShowFilters(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 lg:hidden">
              <span>≡</span> Filters
            </button>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)}
              className="hidden rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-navy lg:block">
              <option value="featured">Featured first</option>
              <option value="price-asc">Price: Low → High</option>
              <option value="price-desc">Price: High → Low</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>

          {orderDone && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
              <span className="text-xl">✅</span>
              <div className="flex-1">
                <div className="font-bold">Order placed!</div>
                <div className="text-xs text-emerald-700">BSC will confirm your order and arrange delivery.</div>
              </div>
              <button onClick={() => setOrderDone(false)} className="text-emerald-900 hover:text-emerald-700" aria-label="Dismiss">×</button>
            </div>
          )}

          {/* Featured carousel */}
          {!loading && activeBrand === 'all' && activeCategory === 'All' && !search.trim() && (() => {
            const featured = products.filter((p) => p.featured && p.in_stock);
            if (featured.length === 0) return null;
            return (
              <div className="mb-5">
                <div className="mb-2 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold-600">Daily picks</div>
                    <h2 className="font-display text-lg font-bold text-navy">Featured today</h2>
                  </div>
                </div>
                <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-2 sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
                  {featured.slice(0, 12).map((p) => {
                    const inCart = cart.find((i) => i.id === p.id && i.source === p.source);
                    return (
                      <div key={`feat-${p.source}-${p.id}`} className="w-44 shrink-0 sm:w-52">
                        <ProductCard product={p} inCartQty={inCart?.qty ?? 0} onAdd={() => addToCart(p)}
                          showBrand={false} onCardClick={() => {
                            if (p.source === 'market') router.push(`/product/${p.id}`);
                            else if (p.wholesaler) router.push(`/local-wholesale/${p.wholesaler}`);
                          }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Grid */}
          {loading ? (
            <ProductGridSkeleton />
          ) : filtered.length === 0 ? (
            <EmptyState onReset={() => { setSearch(''); setBrand('all'); setCategory('All'); }} />
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((p) => {
                const inCart = cart.find((i) => i.id === p.id && i.source === p.source);
                return (
                  <ProductCard key={`${p.source}-${p.id}`} product={p}
                    inCartQty={inCart?.qty ?? 0} onAdd={() => addToCart(p)}
                    showBrand={activeBrand !== 'all'}
                    onCardClick={() => {
                      if (p.source === 'market') router.push(`/product/${p.id}`);
                      else if (p.wholesaler) router.push(`/local-wholesale/${p.wholesaler}`);
                    }} />
                );
              })}
            </div>
          )}

          {!loading && filtered.length > 0 && <TrustBar />}
        </main>
      </div>

      {/* ─── Mobile filter drawer ─── */}
      {showFilters && (
        <div className="fixed inset-0 z-50 flex bg-black/50 lg:hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setShowFilters(false); }}>
          <div className="flex h-full w-72 max-w-[80%] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="font-display text-lg font-bold text-navy">Filters</div>
              <button onClick={() => setShowFilters(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-700"
                aria-label="Close filters">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <FilterPanel activeCategory={activeCategory}
                setCategory={(c) => { setCategory(c); setShowFilters(false); }}
                sort={sort} setSort={(s) => setSort(s)} products={filtered} />
            </div>
          </div>
        </div>
      )}

      {/* ─── Cart drawer ─── */}
      {showCart && (
        <CartDrawer cart={cart} cartCount={cartCount} cartTotal={cartTotal}
          onClose={() => setShowCart(false)} onUpdateQty={updateQty}
          onPlaceOrder={placeOrder} placing={placing}
          onCheckout={() => { setShowCart(false); router.push('/checkout'); }} />
      )}
    </div>
  );
}

/* ─────────────────────── Subcomponents ─────────────────────── */

function BrandPill({ active, onClick, label, activeBg, activeFg, withBorder }: {
  active: boolean; onClick: () => void; label: string;
  activeBg: string; activeFg: string; withBorder?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
        active ? '' : 'bg-white/10 text-slate-200 hover:bg-white/15'
      } ${withBorder && active ? 'ring-2 ring-gold' : ''}`}
      style={active ? { backgroundColor: activeBg, color: activeFg } : undefined}>
      {label}
    </button>
  );
}

function FilterPanel({ activeCategory, setCategory, sort, setSort, products }: {
  activeCategory: string; setCategory: (c: string) => void;
  sort: SortOption; setSort: (s: SortOption) => void; products: MarketProduct[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Category</div>
        <div className="space-y-1">
          {CATEGORIES.map((cat) => {
            const count = cat === 'All' ? products.length : products.filter((p) => p.category === cat).length;
            if (count === 0 && cat !== 'All') return null;
            const active = activeCategory === cat;
            return (
              <button key={cat} onClick={() => setCategory(cat)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition ${
                  active ? 'bg-navy text-gold font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}>
                <span>{cat}</span>
                <span className={`text-xs ${active ? 'text-gold-200' : 'text-slate-400'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Sort</div>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-navy">
          <option value="featured">Featured first</option>
          <option value="price-asc">Price: Low → High</option>
          <option value="price-desc">Price: High → Low</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
    </div>
  );
}

function ProductCard({ product, inCartQty, onAdd, onCardClick, showBrand }: {
  product: MarketProduct; inCartQty: number; onAdd: () => void;
  onCardClick: () => void; showBrand: boolean;
}) {
  const brand = product.wholesaler ? BRANDS[product.wholesaler] : null;
  const inCart = inCartQty > 0;
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-100 transition hover:shadow-card-hover">
      <div className="relative aspect-square cursor-pointer overflow-hidden"
        style={{ backgroundColor: brand?.light ?? '#f0f9ff' }} onClick={onCardClick}>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl">
            {CATEGORY_EMOJI[product.category] || '📦'}
          </div>
        )}
        {showBrand && brand ? (
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold text-white shadow-sm"
            style={{ backgroundColor: brand.color }}>
            <span>{brand.emoji}</span>
            <span className="hidden xs:inline">{brand.name}</span>
          </div>
        ) : (
          <div className="absolute left-2 top-2 rounded-md bg-navy px-2 py-0.5 text-[10px] font-bold text-gold shadow-sm">
            🇧🇸 BSC
          </div>
        )}
        {product.featured && (
          <div className="absolute right-2 top-2 rounded-md bg-gold px-2 py-0.5 text-[10px] font-extrabold text-navy shadow-sm">
            ★ FEATURED
          </div>
        )}
        {typeof product.stock_qty === 'number' && product.stock_qty > 0 && product.stock_qty <= 5 && (
          <div className="absolute bottom-2 left-2 rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm">
            Only {Math.floor(product.stock_qty)} left
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {product.sku && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{product.sku}</span>
          )}
          <span>{product.category}</span>
        </div>
        <h3 className="clamp-2 cursor-pointer text-sm font-bold leading-snug text-navy hover:text-navy-700 sm:text-base"
          onClick={onCardClick}>{product.name}</h3>
        {typeof product.avg_rating === 'number' && (product.review_count ?? 0) > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <span className="text-gold">★</span>
            <span className="font-bold text-navy">{product.avg_rating.toFixed(1)}</span>
            <span>({product.review_count})</span>
          </div>
        )}
        {product.description && <p className="clamp-2 text-xs text-slate-500">{product.description}</p>}
        <div className="mt-auto flex items-baseline gap-1 pt-1">
          <span className="text-lg font-extrabold text-navy sm:text-xl">BSD ${product.price.toFixed(2)}</span>
          <span className="text-xs text-slate-400">/ {product.unit}</span>
        </div>
        {product.min_qty > 1 && (
          <div className="text-[10px] text-slate-400">Min order: {product.min_qty} {product.unit}</div>
        )}
        <button onClick={onAdd}
          className={`mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition sm:text-sm ${
            inCart ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-navy text-gold hover:bg-navy-600'
          }`}>
          {inCart ? `✓ In cart (${inCartQty})` : '+ Add to cart'}
        </button>
      </div>
    </article>
  );
}

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-100">
          <div className="aspect-square animate-pulse bg-slate-200" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
            <div className="h-8 w-full animate-pulse rounded bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-white px-6 py-16 text-center shadow-card">
      <div className="mb-3 text-5xl">🔍</div>
      <h3 className="mb-1 text-base font-bold text-navy">No products found</h3>
      <p className="mb-4 text-sm text-slate-500">Try a different search, brand, or category.</p>
      <button onClick={onReset}
        className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-gold transition hover:bg-navy-600">
        Clear all filters
      </button>
    </div>
  );
}

function TrustBar() {
  const items = [
    { icon: '🇧🇸', title: 'Bahamian-owned',  sub: 'Family-run from Nassau' },
    { icon: '🚚', title: 'Fast delivery',     sub: 'Nassau & Andros, same-day' },
    { icon: '❄️', title: 'Cold-chain fresh',  sub: 'Spiny Tail processing' },
    { icon: '💬', title: 'WhatsApp support',  sub: '+1 (242) 558-4495' },
  ];
  return (
    <div className="mt-10 grid grid-cols-2 gap-3 rounded-2xl bg-white p-5 shadow-card sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.title} className="flex items-center gap-3">
          <div className="text-2xl">{it.icon}</div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-navy">{it.title}</div>
            <div className="truncate text-[11px] text-slate-500">{it.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CartDrawer({ cart, cartCount, cartTotal, onClose, onUpdateQty, onPlaceOrder, placing, onCheckout }: {
  cart: CartItem[]; cartCount: number; cartTotal: number; onClose: () => void;
  onUpdateQty: (id: string, source: string, qty: number) => void;
  onPlaceOrder: () => void; placing: boolean; onCheckout: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-navy px-5 py-4">
          <div>
            <div className="font-display text-lg font-bold text-white">Your Cart</div>
            <div className="text-xs text-slate-300">{cartCount} item{cartCount !== 1 ? 's' : ''} · BSD ${cartTotal.toFixed(2)}</div>
          </div>
          <button onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-lg text-white transition hover:bg-white/25"
            aria-label="Close cart">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 text-5xl">🛒</div>
              <div className="text-sm font-bold text-slate-700">Your cart is empty</div>
              <div className="mt-1 text-xs text-slate-500">Browse the market and add some products.</div>
            </div>
          ) : (
            <CartGroups cart={cart} onUpdateQty={onUpdateQty} />
          )}
        </div>
        {cart.length > 0 && (
          <div className="border-t border-slate-200 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-slate-600">Total</span>
              <span className="text-2xl font-extrabold text-navy">BSD ${cartTotal.toFixed(2)}</span>
            </div>
            <button onClick={onCheckout}
              className="mb-2 w-full rounded-lg bg-gold py-3 text-sm font-bold text-navy transition hover:bg-gold-300">
              Proceed to checkout →
            </button>
            <button onClick={onPlaceOrder} disabled={placing}
              className="w-full rounded-lg bg-navy py-3 text-sm font-bold text-white transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:bg-slate-400">
              {placing ? 'Placing…' : '✅ Quick order (cash on delivery)'}
            </button>
            <p className="mt-2 text-center text-[10px] text-slate-400">Cart is grouped by supplier for sourcing.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CartGroups({ cart, onUpdateQty }: {
  cart: CartItem[]; onUpdateQty: (id: string, source: string, qty: number) => void;
}) {
  const groups = ['market', ...BRAND_KEYS];
  return (
    <>
      {groups.map((group) => {
        const items = group === 'market'
          ? cart.filter((i) => i.source === 'market')
          : cart.filter((i) => i.wholesaler === group);
        if (items.length === 0) return null;
        const brand = group !== 'market' ? BRANDS[group] : null;
        return (
          <div key={group} className="mb-5">
            <div className="mb-2 border-b pb-1.5 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: brand?.color ?? '#1a2e5a', borderBottomColor: brand ? `${brand.color}33` : '#e2e8f0' }}>
              {brand ? `${brand.emoji} ${brand.name}` : '🇧🇸 BSC Direct'}
            </div>
            {items.map((item) => (
              <div key={`${item.source}-${item.id}`}
                className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-b-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-navy">{item.name}</div>
                  {item.sku && brand && (
                    <span className="mt-1 inline-block rounded px-1.5 py-0.5 font-mono text-[10px]"
                      style={{ backgroundColor: brand.light, color: brand.color }}>{item.sku}</span>
                  )}
                  <div className="mt-1 text-xs text-slate-500">
                    BSD ${item.price.toFixed(2)} × {item.qty}{' '}
                    <span className="font-bold text-navy">= ${(item.price * item.qty).toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <QtyButton onClick={() => onUpdateQty(item.id, item.source, item.qty - item.min_qty)}>−</QtyButton>
                  <span className="min-w-6 text-center text-sm font-bold text-navy">{item.qty}</span>
                  <QtyButton onClick={() => onUpdateQty(item.id, item.source, item.qty + item.min_qty)}>+</QtyButton>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

function QtyButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-base font-bold text-navy transition hover:border-navy hover:bg-slate-50">
      {children}
    </button>
  );
}
