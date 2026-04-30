'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BSC_MARGIN = 0.38;

const PRODUCTS = [
  { id: 1, name: 'Fresh Grouper', price: 14.99, category: 'Seafood', emoji: '🐟' },
  { id: 2, name: 'Spiny Lobster Tails', price: 28.00, category: 'Seafood', emoji: '🦞' },
  { id: 3, name: 'Conch Meat', price: 12.50, category: 'Seafood', emoji: '🐚' },
  { id: 4, name: 'Red Snapper', price: 13.99, category: 'Seafood', emoji: '🐠' },
  { id: 5, name: 'Raw Shrimp', price: 16.00, category: 'Seafood', emoji: '🦐' },
  { id: 6, name: 'Lane Snapper', price: 11.99, category: 'Seafood', emoji: '🐟' },
  { id: 7, name: 'Ribeye Steak', price: 22.99, category: 'Meats', emoji: '🥩' },
  { id: 8, name: 'NY Strip', price: 19.99, category: 'Meats', emoji: '🥩' },
  { id: 9, name: 'Pork Chops', price: 9.99, category: 'Meats', emoji: '🍖' },
  { id: 10, name: 'Whole Chicken', price: 8.99, category: 'Poultry', emoji: '🍗' },
  { id: 11, name: 'Chicken Wings', price: 6.99, category: 'Poultry', emoji: '🍗' },
  { id: 12, name: 'Leg Quarters', price: 4.99, category: 'Poultry', emoji: '🍗' },
  { id: 13, name: 'White Rice 25lb', price: 24.99, category: 'Groceries', emoji: '🌾' },
  { id: 14, name: 'Cooking Oil 1gal', price: 12.99, category: 'Groceries', emoji: '🫙' },
  { id: 15, name: 'Black Beans 5lb', price: 7.99, category: 'Groceries', emoji: '🫘' },
  { id: 16, name: 'Bottled Water 24pk', price: 9.99, category: 'Essentials', emoji: '💧' },
];

const CATEGORIES = ['All', 'Seafood', 'Meats', 'Poultry', 'Groceries', 'Essentials'];

type CartItem = { id: number; name: string; price: number; emoji: string; qty: number };

export default function NassauPOSPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState('All');
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [lastSale, setLastSale] = useState<{ total: number; profit: number; items: CartItem[]; customer: string; ref: string } | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = PRODUCTS.filter((p) => {
    const matchCat = category === 'All' || p.category === category;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const bscProfit = subtotal * BSC_MARGIN;

  function addToCart(product: typeof PRODUCTS[0]) {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: product.id, name: product.name, price: product.price, emoji: product.emoji, qty: 1 }];
    });
  }

  function changeQty(id: number, delta: number) {
    setCart((prev) =>
      prev.map((i) => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
    );
  }

  function removeItem(id: number) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }

  async function completeSale() {
    if (cart.length === 0) return;
    const ref = 'BSC-' + Date.now().toString().slice(-6);
    const saleData = {
      customer_name: customerName || 'Walk-in',
      items: cart,
      subtotal,
      bsc_profit: bscProfit,
      payment_method: paymentMethod,
      location: 'nassau',
      reference: ref,
      margin_pct: 38,
    };
    try {
      await supabase.from('invoices').insert([saleData]);
    } catch { /* continue even if insert fails */ }
    setLastSale({ total: subtotal, profit: bscProfit, items: [...cart], customer: customerName || 'Walk-in', ref });
    setReceiptVisible(true);
    setCart([]);
    setCustomerName('');
  }

  function newSale() {
    setReceiptVisible(false);
    setLastSale(null);
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* HEADER */}
      <header style={{ backgroundColor: '#1a2e5a', padding: '0 16px', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/dashboard" style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, textDecoration: 'none', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px' }}>
              ← BSC Control
            </Link>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>Nassau POS</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>Firetrial Road · 38% Margin</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setWhatsappOpen(!whatsappOpen)}
              style={{ backgroundColor: '#25D366', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
            >
              💬 WhatsApp
            </button>
            <span style={{ backgroundColor: '#f4c842', color: '#1a2e5a', fontSize: '11px', fontWeight: 900, padding: '4px 10px', borderRadius: '20px' }}>
              🟡 NASSAU
            </span>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT — PRODUCT GRID */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Search + Categories */}
          <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #ebebeb', padding: '10px 16px' }}>
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '9px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', marginBottom: '10px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  style={{ padding: '6px 14px', borderRadius: '20px', border: 'none', backgroundColor: category === cat ? '#1a2e5a' : '#f0f0f0', color: category === cat ? '#fff' : '#555', fontSize: '12px', fontWeight: category === cat ? 800 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Products */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
              {filtered.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  style={{ backgroundColor: '#fff', border: '1.5px solid #ebebeb', borderRadius: '14px', padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                >
                  <span style={{ fontSize: '32px' }}>{product.emoji}</span>
                  <span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '12px', textAlign: 'center', lineHeight: 1.3 }}>{product.name}</span>
                  <span style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '15px' }}>${product.price.toFixed(2)}</span>
                  <span style={{ color: '#6b7280', fontSize: '10px' }}>+ tap to add</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — CART */}
        <div style={{ width: '320px', backgroundColor: '#fff', borderLeft: '1px solid #ebebeb', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

          {/* Cart header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #ebebeb', backgroundColor: '#1a2e5a' }}>
            <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '15px' }}>Current Sale</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{cart.length} item{cart.length !== 1 ? 's' : ''} · Nassau POS</div>
          </div>

          {/* Customer name */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <input
              type="text"
              placeholder="Customer name (optional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #e5e7eb', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Cart items */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#ccc' }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>🛒</div>
                <div style={{ fontSize: '13px' }}>Tap a product to add</div>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ fontSize: '22px' }}>{item.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                    <div style={{ color: '#999', fontSize: '11px' }}>${item.price.toFixed(2)} each</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button onClick={() => changeQty(item.id, -1)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid #e5e7eb', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 900, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
                    <span style={{ fontWeight: 800, fontSize: '13px', minWidth: '18px', textAlign: 'center' }}>{item.qty}</span>
                    <button onClick={() => changeQty(item.id, 1)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: 'none', backgroundColor: '#1a2e5a', color: '#fff', cursor: 'pointer', fontWeight: 900, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                  <div style={{ minWidth: '48px', textAlign: 'right' }}>
                    <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '13px' }}>${(item.price * item.qty).toFixed(2)}</div>
                    <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '10px', cursor: 'pointer', padding: 0 }}>remove</button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totals */}
          <div style={{ padding: '14px 16px', borderTop: '1px solid #ebebeb', backgroundColor: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: '#666', fontSize: '13px' }}>Subtotal</span>
              <span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '13px' }}>${subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', padding: '8px 10px', backgroundColor: '#e8f5e9', borderRadius: '8px' }}>
              <span style={{ color: '#2e7d32', fontSize: '13px', fontWeight: 700 }}>BSC Profit (38%)</span>
              <span style={{ color: '#2e7d32', fontWeight: 900, fontSize: '14px' }}>${bscProfit.toFixed(2)}</span>
            </div>

            {/* Payment method */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '12px' }}>
              {(['cash', 'card', 'transfer'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  style={{ padding: '7px', borderRadius: '8px', border: '2px solid', borderColor: paymentMethod === method ? '#1a2e5a' : '#e5e7eb', backgroundColor: paymentMethod === method ? '#1a2e5a' : '#fff', color: paymentMethod === method ? '#f4c842' : '#666', fontSize: '11px', fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}
                >
                  {method === 'cash' ? '💵' : method === 'card' ? '💳' : '🏦'} {method}
                </button>
              ))}
            </div>

            <button
              onClick={completeSale}
              disabled={cart.length === 0}
              style={{ width: '100%', backgroundColor: cart.length === 0 ? '#e5e7eb' : '#f4c842', color: cart.length === 0 ? '#999' : '#1a2e5a', border: 'none', borderRadius: '12px', padding: '14px', fontWeight: 900, fontSize: '15px', cursor: cart.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              {cart.length === 0 ? 'Add Items to Sell' : `Complete Sale · $${subtotal.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>

      {/* WHATSAPP SIDEBAR */}
      {whatsappOpen && (
        <>
          <div onClick={() => setWhatsappOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
          <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '320px', backgroundColor: '#fff', zIndex: 51, boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ backgroundColor: '#25D366', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '16px' }}>💬 WhatsApp</div>
              <button onClick={() => setWhatsappOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '22px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '20px', flex: 1 }}>
              <a
                href="https://wa.me/12423613474"
                target="_blank"
                rel="noreferrer"
                style={{ display: 'block', backgroundColor: '#25D366', color: '#fff', textDecoration: 'none', borderRadius: '12px', padding: '14px', textAlign: 'center', fontWeight: 800, fontSize: '14px', marginBottom: '12px' }}
              >
                Open BSC WhatsApp Chat
              </a>
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://wa.me/12423613474`}
                  alt="WhatsApp QR"
                  style={{ borderRadius: '12px', border: '4px solid #f0f0f0' }}
                />
                <p style={{ color: '#666', fontSize: '12px', marginTop: '10px' }}>Scan to open WhatsApp</p>
                <p style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px' }}>+1 (242) 361-3474</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* RECEIPT MODAL */}
      {receiptVisible && lastSale && (
        <>
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 60 }} />
          <div style={{ position: 'fixed', inset: '20px', maxWidth: '400px', margin: '0 auto', backgroundColor: '#fff', borderRadius: '20px', zIndex: 61, overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
            <div style={{ backgroundColor: '#1a2e5a', padding: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>✅</div>
              <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '20px' }}>Sale Complete!</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: '4px' }}>Ref: {lastSale.ref}</div>
            </div>
            <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>Customer</div>
                <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '16px' }}>{lastSale.customer}</div>
              </div>
              {lastSale.items.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ color: '#444', fontSize: '13px' }}>{item.emoji} {item.name} × {item.qty}</span>
                  <span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '13px' }}>${(item.price * item.qty).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ marginTop: '16px', padding: '14px', backgroundColor: '#fef9e7', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#666', fontSize: '14px', fontWeight: 700 }}>Total</span>
                  <span style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px' }}>${lastSale.total.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#2e7d32', fontSize: '13px', fontWeight: 700 }}>BSC Profit (38%)</span>
                  <span style={{ color: '#2e7d32', fontWeight: 900, fontSize: '15px' }}>${lastSale.profit.toFixed(2)}</span>
                </div>
              </div>
              <a
                href={`https://wa.me/12423613474?text=BSC Receipt ${lastSale.ref} — Total: $${lastSale.total.toFixed(2)} — Thank you ${lastSale.customer}!`}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'block', backgroundColor: '#25D366', color: '#fff', textDecoration: 'none', borderRadius: '12px', padding: '12px', textAlign: 'center', fontWeight: 800, fontSize: '14px', marginTop: '16px', marginBottom: '10px' }}
              >
                💬 Send Receipt via WhatsApp
              </button>
              </a>
              <button
                onClick={newSale}
                style={{ width: '100%', backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: '12px', padding: '13px', fontWeight: 900, fontSize: '14px', cursor: 'pointer' }}
              >
                + New Sale
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}