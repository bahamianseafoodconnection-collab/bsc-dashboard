'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const WHOLESALERS: Record<string, {
  name: string; color: string; light: string; prefix: string; emoji: string;
  tagline: string; description: string;
}> = {
  'asa-h-pritchard': {
    name: 'Asa H Pritchard', color: '#1B4F72', light: '#d6eaf8', prefix: 'AHP', emoji: '🏪',
    tagline: 'Nassau\'s Trusted Distributor Since 1920',
    description: 'One of Nassau\'s oldest and most trusted wholesale distributors. BSC sources directly from Asa H Pritchard to bring you quality goods at wholesale prices.',
  },
  'bahamas-international-food': {
    name: 'Bahamas International Food', color: '#1E5C2E', light: '#d5f5e3', prefix: 'BIF', emoji: '🍱',
    tagline: 'International Quality, Local Pricing',
    description: 'Bahamas International Food brings world-class food products to Nassau. BSC partners with BIF to offer premium imported goods at competitive wholesale rates.',
  },
  'dalbenas': {
    name: "D'Albenas", color: '#784212', light: '#fdebd0', prefix: 'DAL', emoji: '🏭',
    tagline: 'Quality Products, Family Values',
    description: "D'Albenas has served the Bahamas with quality wholesale products for generations. A trusted name in Nassau's wholesale market.",
  },
  'bahamas-wholesale-agencies': {
    name: 'Bahamas Wholesale Agencies', color: '#1A5276', light: '#d6eaf8', prefix: 'BWA', emoji: '📦',
    tagline: 'The Agency Behind Nassau\'s Best Brands',
    description: 'Bahamas Wholesale Agencies represents top brands across the Bahamas. BSC works directly with BWA to pass wholesale savings to you.',
  },
  'tpg': {
    name: 'TPG', color: '#2C3E50', light: '#d5d8dc', prefix: 'TPG', emoji: '🛒',
    tagline: 'Total Products Group',
    description: 'TPG offers a wide range of wholesale products across multiple categories. A comprehensive one-stop wholesale supplier for Nassau businesses and families.',
  },
  'thompson-trading': {
    name: 'Thompson Trading', color: '#922B21', light: '#fadbd8', prefix: 'TTR', emoji: '🤝',
    tagline: 'Trading Excellence Across the Bahamas',
    description: 'Thompson Trading is a leading wholesale partner providing premium products at competitive prices. BSC is proud to partner with Thompson Trading.',
  },
  'island-wholesale': {
    name: 'Island Wholesale', color: '#196F3D', light: '#d5f5e3', prefix: 'ISW', emoji: '🌴',
    tagline: 'Island Fresh, Island Priced',
    description: 'Island Wholesale brings fresh island-sourced and imported products to Nassau and the Family Islands at true wholesale prices.',
  },
};

const CATEGORIES = ['All', 'Seafood', 'Meat', 'Produce', 'Dry Goods', 'Beverages', 'Dairy', 'Frozen', 'Other'];

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  wholesale_cost_bsd: number;
  final_price_bsd: number;
  unit: string;
  min_order_qty: number;
  image_url: string;
  in_stock: boolean;
  featured: boolean;
  bsc_markup_pct: number;
  vat_pct: number;
}

interface CartItem extends Product { qty: number; }

export default function WholesalerPage() {
  const router  = useRouter();
  const params  = useParams();
  const key     = params?.wholesaler as string;
  const config  = WHOLESALERS[key];

  const [products, setProducts]   = useState<Product[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch]       = useState('');
  const [cart, setCart]           = useState<CartItem[]>([]);
  const [showCart, setShowCart]   = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [placing, setPlacing]     = useState(false);
  const [orderDone, setOrderDone] = useState(false);

  useEffect(() => {
    if (!key || !config) return;
    supabase
      .from('local_wholesale_products')
      .select('*')
      .eq('wholesaler', key)
      .eq('in_stock', true)
      .order('featured', { ascending: false })
      .order('category')
      .then(({ data }) => { setProducts(data || []); setLoading(false); });
  }, [key]);

  if (!config) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>🏪</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2e4a', marginBottom: 8 }}>Wholesaler Not Found</div>
          <button onClick={() => router.push('/local-wholesale')} style={{ backgroundColor: '#1a2e4a', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
            ← Back to Wholesale
          </button>
        </div>
      </div>
    );
  }

  const filtered = products.filter(p => {
    const matchCat    = activeCategory === 'All' || p.category === activeCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const featured    = filtered.filter(p => p.featured);
  const nonFeatured = filtered.filter(p => !p.featured);

  const cartTotal   = cart.reduce((s, i) => s + i.final_price_bsd * i.qty, 0);
  const cartCount   = cart.reduce((s, i) => s + i.qty, 0);

  function addToCart(p: Product) {
    setCart(prev => {
      const exists = prev.find(i => i.id === p.id);
      if (exists) return prev.map(i => i.id === p.id ? { ...i, qty: i.qty + p.min_order_qty } : i);
      return [...prev, { ...p, qty: p.min_order_qty }];
    });
  }

  function updateQty(id: string, qty: number) {
    if (qty < 1) { setCart(prev => prev.filter(i => i.id !== id)); return; }
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
  }

  async function placeOrder() {
    setPlacing(true);
    const { data: { session } } = await supabase.auth.getSession();
    const items = cart.map(i => ({ sku: i.sku, name: i.name, qty: i.qty, unit: i.unit, unit_price: i.final_price_bsd, line_total: +(i.final_price_bsd * i.qty).toFixed(2) }));
    // Server-authoritative placement (Phase 5 batch 6c) — forces cod/pending
    // server-side and stamps the placer from the verified session.
    const res = await fetch('/api/wholesale/place-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ wholesaler: key, items, total: +cartTotal.toFixed(2), note: orderNote || null }),
    });
    const j = await res.json().catch(() => ({}));
    setPlacing(false);
    if (!res.ok || j.ok === false) { alert('Could not place order: ' + (j.error ?? `HTTP ${res.status}`)); return; }
    setOrderDone(true);
    setCart([]);
    setShowCart(false);
  }

  const catCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = cat === 'All' ? products.length : products.filter(p => p.category === cat).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; }
        .btn { border: none; cursor: pointer; border-radius: 8px; font-weight: 700; transition: opacity 0.15s, transform 0.15s; font-family: inherit; }
        .btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .product-card { transition: transform 0.2s, box-shadow 0.2s; }
        .product-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,0.12) !important; }
        .cat-btn { border: none; cursor: pointer; transition: all 0.18s; font-family: inherit; }
        .sku-badge { font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 300; display: flex; justify-content: flex-end; }
        .cart-panel { background: #fff; width: 420px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; }
        @media (max-width: 480px) { .cart-panel { width: 100%; } }
      `}</style>

      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>

        {/* ── Nav ── */}
        <nav style={{ backgroundColor: '#1a2e4a', padding: '0 24px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button onClick={() => router.push('/local-wholesale')} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                ← All Wholesalers
              </button>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{config.emoji} {config.name}</span>
            </div>
            <button
              className="btn"
              onClick={() => setShowCart(true)}
              style={{ backgroundColor: cartCount > 0 ? '#f5a623' : 'rgba(255,255,255,0.1)', color: cartCount > 0 ? '#1a2e4a' : '#fff', padding: '8px 18px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              🛒 {cartCount > 0 ? `${cartCount} item${cartCount !== 1 ? 's' : ''} · BSD $${cartTotal.toFixed(2)}` : 'Cart'}
            </button>
          </div>
        </nav>

        {/* ── Brand hero ── */}
        <div style={{ backgroundColor: config.color, padding: '48px 24px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '5px 14px', marginBottom: 16 }}>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                BSC Wholesale Partner
              </span>
            </div>
            <h1 style={{ color: '#fff', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900, marginBottom: 10, lineHeight: 1.1 }}>
              {config.emoji} {config.name}
            </h1>
            <p style={{ color: '#f5a623', fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{config.tagline}</p>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, maxWidth: 640, lineHeight: 1.7, marginBottom: 24 }}>{config.description}</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { icon: '🏷️', label: `SKU prefix: ${config.prefix}` },
                { icon: '📦', label: `${products.length} products available` },
                { icon: '💰', label: '12% markup' },
                { icon: '🚚', label: 'BSC delivers to you' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '7px 14px' }}>
                  <span>{item.icon}</span>
                  <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 600 }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

          {/* ── Search + filter ── */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${config.name} products or SKU…`}
              style={{ flex: 1, minWidth: 240, padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATEGORIES.filter(c => catCounts[c] > 0 || c === 'All').map(cat => (
                <button
                  key={cat}
                  className="cat-btn"
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    backgroundColor: activeCategory === cat ? config.color : '#fff',
                    color: activeCategory === cat ? '#fff' : '#475569',
                    border: activeCategory === cat ? 'none' : '1.5px solid #e2e8f0',
                    boxShadow: activeCategory === cat ? `0 2px 8px ${config.color}44` : 'none',
                  }}
                >
                  {cat} {catCounts[cat] > 0 && <span style={{ opacity: 0.7 }}>({catCounts[cat]})</span>}
                </button>
              ))}
            </div>
          </div>

          {/* ── Order done banner ── */}
          {orderDone && (
            <div style={{ backgroundColor: '#d1fae5', border: '1.5px solid #34d399', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>✅</span>
              <div>
                <div style={{ fontWeight: 800, color: '#065f46', fontSize: 15 }}>Wholesale order placed!</div>
                <div style={{ color: '#047857', fontSize: 13 }}>BSC admin will review and contact you to arrange pickup & payment.</div>
              </div>
              <button onClick={() => setOrderDone(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#065f46' }}>×</button>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>Loading {config.name} products…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>No products found</div>
            </div>
          ) : (
            <>
              {/* ── Featured products ── */}
              {featured.length > 0 && activeCategory === 'All' && !search && (
                <div style={{ marginBottom: 40 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <span style={{ color: '#f5a623', fontSize: 16 }}>⭐</span>
                    <h2 style={{ color: '#1a2e4a', fontSize: 18, fontWeight: 900 }}>Featured Products</h2>
                    <span style={{ fontSize: 12, color: '#94a3b8', backgroundColor: '#f1f5f9', padding: '2px 10px', borderRadius: 10 }}>{featured.length} items</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                    {featured.map(p => <ProductCard key={p.id} p={p} config={config} onAdd={() => addToCart(p)} />)}
                  </div>
                </div>
              )}

              {/* ── All / filtered products ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <h2 style={{ color: '#1a2e4a', fontSize: 18, fontWeight: 900 }}>
                    {activeCategory === 'All' ? 'All Products' : activeCategory}
                  </h2>
                  <span style={{ fontSize: 12, color: '#94a3b8', backgroundColor: '#f1f5f9', padding: '2px 10px', borderRadius: 10 }}>
                    {(activeCategory === 'All' && !search ? nonFeatured : filtered).length} items
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                  {(activeCategory === 'All' && !search ? nonFeatured : filtered).map(p => (
                    <ProductCard key={p.id} p={p} config={config} onAdd={() => addToCart(p)} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Cart panel ── */}
      {showCart && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setShowCart(false); }}>
          <div className="cart-panel">
            <div style={{ backgroundColor: config.color, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: 16 }}>Wholesale Order</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{config.name}</div>
              </div>
              <button onClick={() => setShowCart(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 18, fontWeight: 700 }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🛒</div>
                  <div>Your cart is empty</div>
                </div>
              ) : (
                <>
                  {cart.map(item => (
                    <div key={item.id} style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: '1px solid #f1f5f9', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2e4a', marginBottom: 2 }}>{item.name}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <span className="sku-badge" style={{ backgroundColor: config.light, color: config.color }}>{item.sku}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>/{item.unit}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#64748b' }}>BSD ${item.final_price_bsd.toFixed(2)} × {item.qty} = <strong style={{ color: '#1a2e4a' }}>BSD ${(item.final_price_bsd * item.qty).toFixed(2)}</strong></div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => updateQty(item.id, item.qty - item.min_order_qty)} style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>−</button>
                        <span style={{ fontSize: 14, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{item.qty}</span>
                        <button onClick={() => updateQty(item.id, item.qty + item.min_order_qty)} style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>+</button>
                      </div>
                    </div>
                  ))}

                  <textarea
                    value={orderNote}
                    onChange={e => setOrderNote(e.target.value)}
                    placeholder="Order notes, delivery instructions, or special requests…"
                    rows={3}
                    style={{ width: '100%', marginTop: 16, padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </>
              )}
            </div>

            {cart.length > 0 && (
              <div style={{ borderTop: '1px solid #e2e8f0', padding: 20, flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>Total ({cartCount} items)</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#1a2e4a' }}>BSD ${cartTotal.toFixed(2)}</span>
                </div>
                <button className="btn" onClick={placeOrder} disabled={placing} style={{ width: '100%', backgroundColor: config.color, color: '#fff', padding: '14px', fontSize: 15 }}>
                  {placing ? 'Placing Order…' : '✅ Place Wholesale Order'}
                </button>
                <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 10 }}>BSC admin will confirm and arrange delivery. COD accepted.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Product card component ───────────────────────────────────────────────────
function ProductCard({ p, config, onAdd }: { p: any; config: any; onAdd: () => void }) {
  return (
    <div className="product-card" style={{ backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: p.featured ? `2px solid ${config.color}` : '1.5px solid #f1f5f9' }}>
      {/* Product image */}
      <div style={{ height: 160, backgroundColor: config.light, position: 'relative', overflow: 'hidden' }}>
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
            {p.category === 'Seafood' ? '🦐' : p.category === 'Meat' ? '🥩' : p.category === 'Produce' ? '🥦' : '📦'}
          </div>
        )}
        {p.featured && (
          <div style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#f5a623', color: '#1a2e4a', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, letterSpacing: 0.5 }}>
            ⭐ FEATURED
          </div>
        )}
        {!p.in_stock && (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>Out of Stock</span>
          </div>
        )}
      </div>

      <div style={{ padding: '14px 16px' }}>
        {/* SKU + category */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span className="sku-badge" style={{ backgroundColor: config.light, color: config.color }}>{p.sku || '—'}</span>
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{p.category}</span>
        </div>

        {/* Name */}
        <div style={{ fontWeight: 800, fontSize: 14, color: '#1a2e4a', marginBottom: 4, lineHeight: 1.3 }}>{p.name}</div>
        {p.description && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.description}</div>}

        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#1a2e4a' }}>BSD ${p.final_price_bsd?.toFixed(2)}</span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>/{p.unit}</span>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
          Min order: {p.min_order_qty} {p.unit} · incl. {p.bsc_markup_pct}% markup + {p.vat_pct}% VAT
        </div>

        <button
          onClick={onAdd}
          disabled={!p.in_stock}
          style={{
            width: '100%', padding: '10px', borderRadius: 8, border: 'none', cursor: p.in_stock ? 'pointer' : 'not-allowed',
            backgroundColor: p.in_stock ? config.color : '#e2e8f0',
            color: p.in_stock ? '#fff' : '#94a3b8',
            fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
            transition: 'opacity 0.15s',
          }}
        >
          {p.in_stock ? '+ Add to Order' : 'Out of Stock'}
        </button>
      </div>
    </div>
  );
}