'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CATEGORIES = ['All', 'seafood', 'meats', 'poultry', 'groceries', 'essentials', 'beverages', 'produce', 'other'];

type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price_online: number;
  unit: string;
  image_url: string;
  in_stock: boolean;
  featured: boolean;
  stock_lbs: number;
};

type CartItem = {
  id: string;
  name: string;
  price: number;
  unit: string;
  image_url: string;
  qty: number;
};

function categoryEmoji(cat: string) {
  const map: Record<string, string> = {
    seafood: '🐟', meats: '🥩', poultry: '🍗',
    groceries: '🌾', essentials: '💧', beverages: '🥤',
    produce: '🥦', other: '📦',
  };
  return map[cat] || '📦';
}

function categoryColor(cat: string) {
  const map: Record<string, string> = {
    seafood: '#e8f4fd', meats: '#fde8e8', poultry: '#fdf5e8',
    groceries: '#f0fde8', essentials: '#e8f8fd', beverages: '#f5f0ff',
    produce: '#f0fde8', other: '#f5f5f5',
  };
  return map[cat] || '#f5f5f5';
}

export default function MarketPage() {
  const [products, setProducts]         = useState<Product[]>([]);
  const [loading, setLoading]           = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart]                 = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen]         = useState(false);
  const [search, setSearch]             = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('in_stock', true)
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false });
    setProducts(data || []);
    setLoading(false);
  }

  const filtered = products.filter((p) => {
    const matchCat = activeCategory === 'All' || p.category === activeCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);
  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, {
        id: product.id,
        name: product.name,
        price: product.price_online,
        unit: product.unit,
        image_url: product.image_url,
        qty: 1,
      }];
    });
  }

  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }

  function changeQty(id: string, delta: number) {
    setCart((prev) =>
      prev.map((i) => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
    );
  }

  function goCheckout() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bsc_cart', JSON.stringify(cart.map(i => ({
        id: i.id, name: i.name, price: i.price, quantity: i.qty, unit: i.unit,
      }))));
      window.location.href = '/checkout';
    }
  }

  const displayCategories = ['All', ...Array.from(new Set(products.map(p => p.category)))];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* HEADER */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: '#ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>

          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#1a2e5a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 44 44" width="36" height="36" fill="none">
                <circle cx="22" cy="22" r="22" fill="#1a2e5a" />
                <path d="M10 24c3-5 9-8 15-7s11 5 11 9c0 0-5-3-11-2s-10 4-15 0z" fill="#f4c842" />
                <ellipse cx="28" cy="19" rx="6" ry="4" fill="#38bdf8" opacity="0.85" />
                <circle cx="30" cy="18" r="1.2" fill="white" />
                <path d="M34 21 l5-3 l-1.5 3 l1.5 3z" fill="#f4c842" />
              </svg>
            </div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px' }}>BSC</div>
              <div style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '9px', letterSpacing: '3px', textTransform: 'uppercase' }}>MARKETPLACE</div>
              <div style={{ color: '#999', fontSize: '8px' }}>Fresh. Local. Reliable.</div>
            </div>
          </Link>

          <div style={{ flex: 1, maxWidth: '420px', margin: '0 24px', position: 'relative' }}>
            <input
              type="text"
              placeholder="Search seafood, meats, groceries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 16px 10px 40px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', backgroundColor: '#f9fafb', boxSizing: 'border-box' }}
            />
            <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setCartOpen(true)}
              style={{ position: 'relative', backgroundColor: '#1a2e5a', color: '#fff', border: 'none', borderRadius: '10px', padding: '9px 18px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Cart
              {cartCount > 0 && (
                <span style={{ backgroundColor: '#f4c842', color: '#1a2e5a', borderRadius: '20px', padding: '1px 7px', fontSize: '12px', fontWeight: 900 }}>
                  {cartCount}
                </span>
              )}
            </button>
            <Link href="/login" style={{ color: '#1a2e5a', fontSize: '14px', fontWeight: 600, textDecoration: 'none' }}>Sign In</Link>
          </div>
        </div>
      </header>

      {/* HERO BANNER */}
      <div style={{ backgroundColor: '#1a2e5a', padding: '28px 20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ color: '#fff', fontWeight: 900, fontSize: 'clamp(20px, 4vw, 32px)', margin: '0 0 6px' }}>
              🐟 Fresh from the Sea. Direct to Your Door.
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', margin: 0 }}>
              Nassau & Andros delivery · Pickup available · WhatsApp receipts
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px 18px', textAlign: 'center' }}>
              <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '20px' }}>25%</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>Online Savings</div>
            </div>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px 18px', textAlign: 'center' }}>
              <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '20px' }}>2hrs</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>Delivery Time</div>
            </div>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px 18px', textAlign: 'center' }}>
              <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '20px' }}>💬</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>WhatsApp Receipt</div>
            </div>
          </div>
        </div>
      </div>

      {/* CATEGORY FILTERS */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #ebebeb', padding: '0 20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', gap: '4px', overflowX: 'auto' }}>
          {displayCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '14px 20px',
                border: 'none',
                borderBottom: activeCategory === cat ? '3px solid #f4c842' : '3px solid transparent',
                backgroundColor: 'transparent',
                color: activeCategory === cat ? '#1a2e5a' : '#666',
                fontWeight: activeCategory === cat ? 800 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                textTransform: 'capitalize',
              }}
            >
              {cat === 'All' ? 'All' : `${categoryEmoji(cat)} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 20px' }}>

        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
            <span style={{ color: '#1a2e5a', fontWeight: 800 }}>{filtered.length}</span> products
            {activeCategory !== 'All' && <span> in <span style={{ color: '#1a2e5a', fontWeight: 700, textTransform: 'capitalize' }}>{activeCategory}</span></span>}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#999' }}>Delivery or Pickup</span>
            <span style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px' }}>● Available Now</span>
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🐟</div>
            <p style={{ color: '#999', fontSize: '14px' }}>Loading fresh products...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
            <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '18px' }}>
              {products.length === 0 ? 'No products yet' : 'No products found'}
            </h3>
            <p style={{ color: '#999', fontSize: '14px' }}>
              {products.length === 0
                ? 'Products added from the dashboard will appear here automatically.'
                : 'Try a different search or category'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {filtered.map((product) => {
              const inCart = cart.find((i) => i.id === product.id);
              const emoji = categoryEmoji(product.category);
              const bgColor = categoryColor(product.category);

              return (
                <div
                  key={product.id}
                  style={{ backgroundColor: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: product.featured ? '2px solid #f4c842' : '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}
                >
                  {/* Product image */}
                  <div style={{ backgroundColor: bgColor, height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '56px' }}>{emoji}</span>
                    )}
                    {product.featured && (
                      <span style={{ position: 'absolute', top: '10px', left: '10px', backgroundColor: '#f4c842', color: '#1a2e5a', fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px' }}>
                        ⭐ Featured
                      </span>
                    )}
                  </div>

                  {/* Product info */}
                  <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '10px', color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{product.category}</div>
                    <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px', margin: '0 0 4px', lineHeight: 1.3 }}>{product.name}</h3>
                    {product.description && (
                      <p style={{ color: '#94a3b8', fontSize: '11px', margin: '0 0 8px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {product.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '14px', marginTop: 'auto' }}>
                      <span style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px' }}>BSD ${product.price_online.toFixed(2)}</span>
                      <span style={{ color: '#999', fontSize: '11px' }}>/{product.unit}</span>
                    </div>

                    {inCart ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f0f4ff', borderRadius: '10px', padding: '6px 10px' }}>
                        <button onClick={() => changeQty(product.id, -1)} style={{ width: '28px', height: '28px', borderRadius: '8px', border: 'none', backgroundColor: '#fff', color: '#1a2e5a', fontWeight: 900, fontSize: '16px', cursor: 'pointer' }}>-</button>
                        <span style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px' }}>{inCart.qty}</span>
                        <button onClick={() => changeQty(product.id, 1)} style={{ width: '28px', height: '28px', borderRadius: '8px', border: 'none', backgroundColor: '#1a2e5a', color: '#fff', fontWeight: 900, fontSize: '16px', cursor: 'pointer' }}>+</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(product)}
                        style={{ width: '100%', backgroundColor: '#1a2e5a', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                      >
                        Add to Cart
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CART DRAWER */}
      {cartOpen && (
        <>
          <div onClick={() => setCartOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
          <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: '420px', backgroundColor: '#fff', zIndex: 101, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' }}>

            <div style={{ padding: '20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1a2e5a' }}>
              <h2 style={{ color: '#fff', fontWeight: 900, fontSize: '18px', margin: 0 }}>Your Cart {cartCount > 0 && `(${cartCount})`}</h2>
              <button onClick={() => setCartOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>🛒</div>
                  <p style={{ color: '#999', fontSize: '14px' }}>Your cart is empty</p>
                  <button onClick={() => setCartOpen(false)} style={{ marginTop: '12px', backgroundColor: '#1a2e5a', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 24px', fontWeight: 700, cursor: 'pointer' }}>
                    Shop Now
                  </button>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#f8f9fa', overflow: 'hidden', flexShrink: 0 }}>
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>🐟</div>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '14px' }}>{item.name}</div>
                      <div style={{ color: '#999', fontSize: '12px' }}>BSD ${item.price.toFixed(2)}/{item.unit}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button onClick={() => changeQty(item.id, -1)} style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 900 }}>-</button>
                      <span style={{ fontWeight: 800, fontSize: '14px', minWidth: '20px', textAlign: 'center' }}>{item.qty}</span>
                      <button onClick={() => changeQty(item.id, 1)} style={{ width: '28px', height: '28px', borderRadius: '8px', border: 'none', backgroundColor: '#1a2e5a', color: '#fff', cursor: 'pointer', fontWeight: 900 }}>+</button>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '60px' }}>
                      <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px' }}>BSD ${(item.price * item.qty).toFixed(2)}</div>
                      <button onClick={() => removeFromCart(item.id)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer', padding: 0 }}>Remove</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div style={{ padding: '20px', borderTop: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#666', fontSize: '14px' }}>Subtotal</span>
                  <span style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '16px' }}>BSD ${cartTotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ color: '#666', fontSize: '13px' }}>Delivery</span>
                  <span style={{ color: cartTotal >= 1000 ? '#2e7d32' : '#666', fontSize: '13px', fontWeight: 700 }}>
                    {cartTotal >= 1000 ? '🚚 FREE' : 'Calculated at checkout'}
                  </span>
                </div>
                <button
                  onClick={goCheckout}
                  style={{ display: 'block', width: '100%', backgroundColor: '#f4c842', color: '#1a2e5a', fontWeight: 900, fontSize: '15px', padding: '14px', borderRadius: '12px', border: 'none', cursor: 'pointer', marginBottom: '10px' }}
                >
                  Checkout · BSD ${cartTotal.toFixed(2)}
                </button>
                <p style={{ textAlign: 'center', color: '#999', fontSize: '12px', margin: 0 }}>
                  💬 Receipt sent to your WhatsApp
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* FOOTER */}
      <footer style={{ backgroundColor: '#1a2e5a', padding: '40px 20px', marginTop: '40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '32px', marginBottom: '32px' }}>
            <div>
              <h4 style={{ color: '#f4c842', fontWeight: 900, fontSize: '14px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>BSC Marketplace</h4>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>Fresh seafood, meats & essentials delivered across Nassau & Andros, Bahamas.</p>
            </div>
            <div>
              <h4 style={{ color: '#f4c842', fontWeight: 900, fontSize: '14px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Shop</h4>
              {['seafood', 'meats', 'poultry', 'groceries', 'essentials'].map((c) => (
                <div key={c} style={{ marginBottom: '6px' }}>
                  <button onClick={() => setActiveCategory(c)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '13px', cursor: 'pointer', padding: 0, textTransform: 'capitalize' }}>{c}</button>
                </div>
              ))}
            </div>
            <div>
              <h4 style={{ color: '#f4c842', fontWeight: 900, fontSize: '14px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Services</h4>
              {[
                { label: 'Pay Utility Bills', href: '/utilities' },
                { label: 'Vehicles & Parts', href: '/vehicles' },
                { label: 'Supplier Portal', href: '/supplier' },
              ].map((l) => (
                <div key={l.label} style={{ marginBottom: '6px' }}>
                  <Link href={l.href} style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', textDecoration: 'none' }}>{l.label}</Link>
                </div>
              ))}
            </div>
            <div>
              <h4 style={{ color: '#f4c842', fontWeight: 900, fontSize: '14px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Contact</h4>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', margin: '0 0 6px' }}>📍 Firetrial Road, Nassau</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', margin: '0 0 6px' }}>💬 +1 (242) 558-4495</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', margin: 0 }}>🇧🇸 Nassau & Andros</p>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px', textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: 0 }}>
              2025 BSC Marketplace · Bahamian Seafood Connection · Proudly Bahamian 🇧🇸
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
