'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BASE = 'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

// ── Wholesaler brand config ───────────────────────────────────────────────────
const BRANDS: Record<string, { name: string; color: string; light: string; prefix: string; emoji: string }> = {
  'asa-h-pritchard':           { name: 'Asa H Pritchard',           color: '#1B4F72', light: '#d6eaf8', prefix: 'AHP', emoji: '🏪' },
  'bahamas-international-food': { name: 'Bahamas Intl Food',         color: '#1E5C2E', light: '#d5f5e3', prefix: 'BIF', emoji: '🍱' },
  'dalbenas':                   { name: "D'Albenas",                  color: '#784212', light: '#fdebd0', prefix: 'DAL', emoji: '🏭' },
  'bahamas-wholesale-agencies': { name: 'Bahamas Wholesale',          color: '#1A5276', light: '#d6eaf8', prefix: 'BWA', emoji: '📦' },
  'tpg':                        { name: 'TPG',                        color: '#2C3E50', light: '#d5d8dc', prefix: 'TPG', emoji: '🛒' },
  'thompson-trading':           { name: 'Thompson Trading',           color: '#922B21', light: '#fadbd8', prefix: 'TTR', emoji: '🤝' },
  'island-wholesale':           { name: 'Island Wholesale',           color: '#196F3D', light: '#d5f5e3', prefix: 'ISW', emoji: '🌴' },
};

const BRAND_KEYS = Object.keys(BRANDS);

const CATEGORIES = ['All', 'Seafood', 'Meat', 'Produce', 'Dry Goods', 'Beverages', 'Dairy', 'Frozen', 'Other'];

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'name';

// Unified product shape
interface MarketProduct {
  id:          string;
  source:      'market' | 'wholesale';
  sku?:        string;
  wholesaler?: string;
  name:        string;
  description: string;
  category:    string;
  price:       number;
  unit:        string;
  min_qty:     number;
  image_url:   string;
  in_stock:    boolean;
  featured:    boolean;
}

interface CartItem extends MarketProduct { qty: number; }

export default function MarketPage() {
  const router = useRouter();

  const [products, setProducts]       = useState<MarketProduct[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeCategory, setCategory] = useState('All');
  const [activeBrand, setBrand]       = useState('all');
  const [search, setSearch]           = useState('');
  const [sort, setSort]               = useState<SortOption>('featured');
  const [cart, setCart]               = useState<CartItem[]>([]);
  const [showCart, setShowCart]       = useState(false);
  const [placing, setPlacing]         = useState(false);
  const [orderDone, setOrderDone]     = useState(false);

  // ── Fetch from both tables ────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [{ data: mp }, { data: wp }] = await Promise.all([
        supabase.from('products').select('*').eq('in_stock', true),
        supabase.from('local_wholesale_products').select('*').eq('in_stock', true),
      ]);

      const market: MarketProduct[] = (mp || []).map(p => ({
        id:          p.id,
        source:      'market',
        name:        p.name,
        description: p.description || '',
        category:    p.category || 'Other',
        price:       p.price || 0,
        unit:        p.unit || 'each',
        min_qty:     1,
        image_url:   p.image_url || '',
        in_stock:    p.in_stock,
        featured:    p.featured || false,
      }));

      const wholesale: MarketProduct[] = (wp || []).map(p => ({
        id:          p.id,
        source:      'wholesale',
        sku:         p.sku,
        wholesaler:  p.wholesaler,
        name:        p.name,
        description: p.description || '',
        category:    p.category || 'Other',
        price:       p.final_price_bsd || 0,
        unit:        p.unit || 'each',
        min_qty:     p.min_order_qty || 1,
        image_url:   p.image_url || '',
        in_stock:    p.in_stock,
        featured:    p.featured || false,
      }));

      setProducts([...market, ...wholesale]);
      setLoading(false);
    }
    load();
  }, []);

  // ── Filter + sort ─────────────────────────────────────────────────────────
  const filtered = products
    .filter(p => {
      const matchCat    = activeCategory === 'All' || p.category === activeCategory;
      const matchBrand  = activeBrand === 'all' || (activeBrand === 'bsc' ? p.source === 'market' : p.wholesaler === activeBrand);
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchBrand && matchSearch;
    })
    .sort((a, b) => {
      if (sort === 'price-asc')  return a.price - b.price;
      if (sort === 'price-desc') return b.price - a.price;
      if (sort === 'name')       return a.name.localeCompare(b.name);
      // featured: featured first, then by name
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return a.name.localeCompare(b.name);
    });

  // ── Cart ──────────────────────────────────────────────────────────────────
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  function addToCart(p: MarketProduct) {
    setCart(prev => {
      const exists = prev.find(i => i.id === p.id && i.source === p.source);
      if (exists) return prev.map(i => (i.id === p.id && i.source === p.source) ? { ...i, qty: i.qty + p.min_qty } : i);
      return [...prev, { ...p, qty: p.min_qty }];
    });
  }

  function updateQty(id: string, source: string, qty: number) {
    if (qty < 1) { setCart(prev => prev.filter(i => !(i.id === id && i.source === source))); return; }
    setCart(prev => prev.map(i => (i.id === id && i.source === source) ? { ...i, qty } : i));
  }

  async function placeOrder() {
    setPlacing(true);
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('orders').insert({
      order_type: 'online_market',
      payment_method: 'cod',
      payment_status: 'pending',
      wholesale_items: cart.map(i => ({
        id: i.id, source: i.source, sku: i.sku || null, wholesaler: i.wholesaler || null,
        name: i.name, qty: i.qty, unit: i.unit, unit_price: i.price,
        line_total: +(i.price * i.qty).toFixed(2),
      })),
      wholesale_cost_total: +cartTotal.toFixed(2),
      user_id: session?.user.id || null,
    });
    setPlacing(false);
    setOrderDone(true);
    setCart([]);
    setShowCart(false);
  }

  // ── Brand pills ───────────────────────────────────────────────────────────
  const brandCounts: Record<string, number> = { all: products.length, bsc: products.filter(p => p.source === 'market').length };
  BRAND_KEYS.forEach(k => { brandCounts[k] = products.filter(p => p.wholesaler === k).length; });

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; }
        .btn { border: none; cursor: pointer; border-radius: 8px; font-weight: 700; transition: opacity 0.15s, transform 0.15s; font-family: inherit; }
        .btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .pill { border: none; cursor: pointer; transition: all 0.18s; font-family: inherit; border-radius: 20px; }
        .product-card { transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; }
        .product-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,0.13) !important; }
        .sku-badge { font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 300; display: flex; justify-content: flex-end; }
        .cart-panel { background: #fff; width: 420px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; }
        @media (max-width: 480px) { .cart-panel { width: 100%; } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #1a2e4a; border-radius: 3px; }
      `}</style>

      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>

        {/* ── Sticky nav ── */}
        <nav style={{ backgroundColor: '#1a2e4a', padding: '0 24px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <img src={`${BASE}/logo.jpg`} alt="BSC" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f5a623', cursor: 'pointer' }} onClick={() => router.push('/')} />
              <div>
                <div style={{ color: '#f5a623', fontWeight: 900, fontSize: 15, letterSpacing: 1 }}>BSC Marketplace</div>
                <div style={{ color: '#94a3b8', fontSize: 10 }}>Nassau · Bahamas 🇧🇸</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>← Home</button>
              <button
                className="btn"
                onClick={() => setShowCart(true)}
                style={{ backgroundColor: cartCount > 0 ? '#f5a623' : 'rgba(255,255,255,0.1)', color: cartCount > 0 ? '#1a2e4a' : '#fff', padding: '8px 18px', fontSize: 13 }}
              >
                🛒 {cartCount > 0 ? `${cartCount} · BSD $${cartTotal.toFixed(2)}` : 'Cart'}
              </button>
            </div>
          </div>
        </nav>

        {/* ── Page header ── */}
        <div style={{ backgroundColor: '#1a2e4a', padding: '36px 24px 28px' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            <p style={{ color: '#f5a623', fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 6 }}>Shop Local</p>
            <h1 style={{ color: '#fff', fontSize: 30, fontWeight: 900, marginBottom: 6 }}>BSC Online Market</h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 20 }}>
              Shop BSC products and items from Nassau's top wholesale brands — all delivered to your door.
            </p>

            {/* Search bar */}
            <div style={{ display: 'flex', gap: 10, maxWidth: 600 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search products, brands, or SKU numbers…"
                style={{ flex: 1, padding: '11px 16px', border: 'none', borderRadius: 10, fontSize: 14, outline: 'none', backgroundColor: 'rgba(255,255,255,0.95)' }}
              />
              {search && (
                <button className="btn" onClick={() => setSearch('')} style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', padding: '10px 16px', fontSize: 13 }}>Clear</button>
              )}
            </div>
          </div>
        </div>

        {/* ── Brand filter strip ── */}
        <div style={{ backgroundColor: '#0f2137', padding: '14px 24px', overflowX: 'auto' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', gap: 8, flexWrap: 'nowrap', minWidth: 'max-content' }}>
            {/* All */}
            <button className="pill" onClick={() => setBrand('all')} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 700, backgroundColor: activeBrand === 'all' ? '#f5a623' : 'rgba(255,255,255,0.08)', color: activeBrand === 'all' ? '#1a2e4a' : 'rgba(255,255,255,0.7)' }}>
              🛒 All Products ({brandCounts.all})
            </button>
            {/* BSC Direct */}
            <button className="pill" onClick={() => setBrand('bsc')} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 700, backgroundColor: activeBrand === 'bsc' ? '#1a2e4a' : 'rgba(255,255,255,0.08)', color: activeBrand === 'bsc' ? '#f5a623' : 'rgba(255,255,255,0.7)', border: activeBrand === 'bsc' ? '2px solid #f5a623' : '2px solid transparent' }}>
              🇧🇸 BSC Direct ({brandCounts.bsc})
            </button>
            {/* Wholesaler brands */}
            {BRAND_KEYS.filter(k => brandCounts[k] > 0).map(k => {
              const b = BRANDS[k];
              const active = activeBrand === k;
              return (
                <button key={k} className="pill" onClick={() => setBrand(active ? 'all' : k)} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 700, backgroundColor: active ? b.color : 'rgba(255,255,255,0.08)', color: active ? '#fff' : 'rgba(255,255,255,0.7)', border: active ? 'none' : '2px solid transparent', boxShadow: active ? `0 2px 10px ${b.color}66` : 'none' }}>
                  {b.emoji} {b.name} ({brandCounts[k]})
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>

          {/* ── Category + sort row ── */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATEGORIES.map(cat => {
                const count = cat === 'All' ? filtered.length : filtered.filter(p => p.category === cat).length;
                if (count === 0 && cat !== 'All') return null;
                return (
                  <button key={cat} className="pill" onClick={() => setCategory(cat)} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, backgroundColor: activeCategory === cat ? '#1a2e4a' : '#fff', color: activeCategory === cat ? '#f5a623' : '#475569', border: activeCategory === cat ? 'none' : '1.5px solid #e2e8f0' }}>
                    {cat} {count > 0 && `(${count})`}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Sort:</span>
              <select value={sort} onChange={e => setSort(e.target.value as SortOption)} style={{ padding: '7px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', backgroundColor: '#fff', cursor: 'pointer' }}>
                <option value="featured">Featured First</option>
                <option value="price-asc">Price: Low → High</option>
                <option value="price-desc">Price: High → Low</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>
          </div>

          {/* ── Results count ── */}
          <div style={{ marginBottom: 20, fontSize: 13, color: '#64748b', fontWeight: 600 }}>
            {loading ? 'Loading…' : `${filtered.length} product${filtered.length !== 1 ? 's' : ''} found`}
            {activeBrand !== 'all' && !loading && (
              <span style={{ marginLeft: 8, color: activeBrand === 'bsc' ? '#1a2e4a' : BRANDS[activeBrand]?.color }}>
                · {activeBrand === 'bsc' ? '🇧🇸 BSC Direct' : `${BRANDS[activeBrand]?.emoji} ${BRANDS[activeBrand]?.name}`}
              </span>
            )}
          </div>

          {/* ── Order success ── */}
          {orderDone && (
            <div style={{ backgroundColor: '#d1fae5', border: '1.5px solid #34d399', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>✅</span>
              <div>
                <div style={{ fontWeight: 800, color: '#065f46', fontSize: 15 }}>Order placed!</div>
                <div style={{ color: '#047857', fontSize: 13 }}>BSC will confirm your order and arrange delivery.</div>
              </div>
              <button onClick={() => setOrderDone(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#065f46' }}>×</button>
            </div>
          )}

          {/* ── Product grid ── */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🛒</div>
              Loading market products…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8', backgroundColor: '#fff', borderRadius: 16 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No products found</div>
              <div style={{ fontSize: 13 }}>Try a different search or brand filter</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
              {filtered.map(p => {
                const brand = p.wholesaler ? BRANDS[p.wholesaler] : null;
                const inCart = cart.find(i => i.id === p.id && i.source === p.source);

                return (
                  <div key={`${p.source}-${p.id}`} className="product-card" style={{ backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: p.featured ? '2px solid #f5a623' : '1.5px solid #f1f5f9' }}>

                    {/* Image */}
                    <div style={{ height: 155, position: 'relative', overflow: 'hidden', backgroundColor: brand ? brand.light : '#f0f9ff' }}>
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>
                          {p.category === 'Seafood' ? '🦐' : p.category === 'Meat' ? '🥩' : p.category === 'Produce' ? '🥦' : p.category === 'Beverages' ? '🥤' : '📦'}
                        </div>
                      )}

                      {/* Brand badge */}
                      {brand && (
                        <div style={{ position: 'absolute', top: 8, left: 8, backgroundColor: brand.color, color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {brand.emoji} {brand.name}
                        </div>
                      )}
                      {!brand && (
                        <div style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#1a2e4a', color: '#f5a623', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6 }}>
                          🇧🇸 BSC Direct
                        </div>
                      )}

                      {p.featured && (
                        <div style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#f5a623', color: '#1a2e4a', fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 5 }}>
                          ⭐ FEATURED
                        </div>
                      )}
                    </div>

                    <div style={{ padding: '12px 14px' }}>
                      {/* SKU + category */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        {p.sku && brand ? (
                          <span className="sku-badge" style={{ backgroundColor: brand.light, color: brand.color }}>{p.sku}</span>
                        ) : null}
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{p.category}</span>
                      </div>

                      <div style={{ fontWeight: 800, fontSize: 14, color: '#1a2e4a', marginBottom: 3, lineHeight: 1.3 }}>{p.name}</div>
                      {p.description && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.description}</div>}

                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
                        <span style={{ fontSize: 19, fontWeight: 900, color: '#1a2e4a' }}>BSD ${p.price.toFixed(2)}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>/{p.unit}</span>
                      </div>

                      {/* View brand / Add to cart */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {brand && (
                          <button className="btn" onClick={() => router.push(`/local-wholesale/${p.wholesaler}`)} style={{ backgroundColor: brand.light, color: brand.color, padding: '8px 10px', fontSize: 11, flex: '0 0 auto' }}>
                            {brand.emoji}
                          </button>
                        )}
                        <button
                          className="btn"
                          onClick={() => addToCart(p)}
                          style={{ flex: 1, backgroundColor: inCart ? '#d1fae5' : '#1a2e4a', color: inCart ? '#065f46' : '#f5a623', padding: '8px', fontSize: 12 }}
                        >
                          {inCart ? `✅ In Cart (${inCart.qty})` : '+ Add to Cart'}
                        </button>
                      </div>

                      {p.min_qty > 1 && (
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 5, textAlign: 'center' }}>Min order: {p.min_qty} {p.unit}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Cart slide-out ── */}
      {showCart && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setShowCart(false); }}>
          <div className="cart-panel">
            {/* Cart header */}
            <div style={{ backgroundColor: '#1a2e4a', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: 16 }}>Your Cart</div>
                <div style={{ color: '#94a3b8', fontSize: 12 }}>{cartCount} item{cartCount !== 1 ? 's' : ''} · BSD ${cartTotal.toFixed(2)}</div>
              </div>
              <button onClick={() => setShowCart(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 18, fontWeight: 700 }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🛒</div>
                  <div style={{ fontWeight: 600 }}>Your cart is empty</div>
                </div>
              ) : (
                <>
                  {/* Group by source/brand */}
                  {['market', ...BRAND_KEYS].map(source => {
                    const items = source === 'market'
                      ? cart.filter(i => i.source === 'market')
                      : cart.filter(i => i.wholesaler === source);
                    if (items.length === 0) return null;
                    const brand = source !== 'market' ? BRANDS[source] : null;

                    return (
                      <div key={source} style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: brand ? brand.color : '#1a2e4a', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${brand ? brand.color + '33' : '#f1f5f9'}` }}>
                          {brand ? `${brand.emoji} ${brand.name}` : '🇧🇸 BSC Direct'}
                        </div>
                        {items.map(item => (
                          <div key={`${item.source}-${item.id}`} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #f8fafc', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2e4a', marginBottom: 2 }}>{item.name}</div>
                              {item.sku && brand && (
                                <span className="sku-badge" style={{ backgroundColor: brand.light, color: brand.color, marginBottom: 4, display: 'inline-block' }}>{item.sku}</span>
                              )}
                              <div style={{ fontSize: 12, color: '#64748b' }}>BSD ${item.price.toFixed(2)} × {item.qty} = <strong style={{ color: '#1a2e4a' }}>BSD ${(item.price * item.qty).toFixed(2)}</strong></div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                              <button onClick={() => updateQty(item.id, item.source, item.qty - item.min_qty)} style={{ width: 26, height: 26, borderRadius: 5, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 700 }}>−</button>
                              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                              <button onClick={() => updateQty(item.id, item.source, item.qty + item.min_qty)} style={{ width: 26, height: 26, borderRadius: 5, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 700 }}>+</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {cart.length > 0 && (
              <div style={{ borderTop: '1px solid #e2e8f0', padding: '16px 20px', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>Total</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#1a2e4a' }}>BSD ${cartTotal.toFixed(2)}</span>
                </div>
                <button className="btn" onClick={() => { setShowCart(false); router.push('/checkout'); }} style={{ width: '100%', backgroundColor: '#f5a623', color: '#1a2e4a', padding: '13px', fontSize: 14, marginBottom: 8 }}>
                  Proceed to Checkout →
                </button>
                <button className="btn" onClick={placeOrder} disabled={placing} style={{ width: '100%', backgroundColor: '#1a2e4a', color: '#fff', padding: '12px', fontSize: 13 }}>
                  {placing ? 'Placing…' : '✅ Quick Order (COD)'}
                </button>
                <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>Cart is grouped by supplier for BSC to source correctly.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}