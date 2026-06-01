'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const STORE_INFO: Record<string, { name: string; color: string; logo: string; tagline: string }> = {
'sams-club': { name: "Sam's Club", color: '#0067A0', logo: '🏪', tagline: 'Bulk savings on groceries, meats & essentials' },
'bjs': { name: "BJ's Wholesale", color: '#CC0000', logo: '🏬', tagline: 'Quality wholesale goods at unbeatable prices' },
'costco': { name: 'Costco', color: '#005DAA', logo: '🏢', tagline: 'Premium bulk items — meats, seafood & more' },
'walmart': { name: 'Walmart', color: '#0071CE', logo: '🛒', tagline: 'Everyday low prices on everything you need' },
'steakhouse': { name: 'Florida Steakhouse', color: '#8B1A1A', logo: '🥩', tagline: 'Premium USDA steaks & fine meats from Florida' },
};

type Product = {
id: string;
name: string;
description: string;
category: string;
original_cost_usd: number;
weight_lbs: number;
shipping_per_lb: number;
customs_duty_pct: number;
bsc_markup_pct: number;
vat_pct: number;
final_price_bsd: number;
image_url: string;
in_stock: boolean;
featured: boolean;
};

type CartItem = { id: string; name: string; price: number; qty: number; store: string };

function calcPrice(p: Product): number {
const shipping = p.weight_lbs * p.shipping_per_lb;
const subtotal = p.original_cost_usd + shipping;
const withDuty = subtotal * (1 + p.customs_duty_pct);
const withMarkup = withDuty * (1 + p.bsc_markup_pct);
const withVat = withMarkup * (1 + p.vat_pct);
return Math.round(withVat * 100) / 100;
}

function PriceBreakdown({ p }: { p: Product }) {
const shipping = p.weight_lbs * p.shipping_per_lb;
const subtotal = p.original_cost_usd + shipping;
const duty = subtotal * p.customs_duty_pct;
const withDuty = subtotal + duty;
const markup = withDuty * p.bsc_markup_pct;
const withMarkup = withDuty + markup;
const vat = withMarkup * p.vat_pct;
const total = withMarkup + vat;

return (
<div style={{ backgroundColor: '#f8f9fa', borderRadius: 10, padding: 12, marginTop: 8, fontSize: 11 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
<span style={{ color: '#666' }}>US Price</span>
<span style={{ color: '#1a2e5a', fontWeight: 600 }}>USD ${p.original_cost_usd.toFixed(2)}</span>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
<span style={{ color: '#666' }}>Shipping ({p.weight_lbs}lb × $0.60)</span>
<span style={{ color: '#1a2e5a', fontWeight: 600 }}>+${shipping.toFixed(2)}</span>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
<span style={{ color: '#666' }}>Customs Duty ({(p.customs_duty_pct * 100).toFixed(0)}%)</span>
<span style={{ color: '#1a2e5a', fontWeight: 600 }}>+${duty.toFixed(2)}</span>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
<span style={{ color: '#666' }}>BSC Service (12%)</span>
<span style={{ color: '#1a2e5a', fontWeight: 600 }}>+${markup.toFixed(2)}</span>
</div>
<div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
<span style={{ color: '#1a2e5a', fontWeight: 800 }}>Total (BSD)</span>
<span style={{ color: '#1a2e5a', fontWeight: 900 }}>BSD ${total.toFixed(2)}</span>
</div>
</div>
);
}

export default function StorePage() {
const params = useParams();
const router = useRouter();
const storeKey = params?.store as string;
const storeInfo = STORE_INFO[storeKey];

const [products, setProducts] = useState<Product[]>([]);
const [loading, setLoading] = useState(true);
const [cart, setCart] = useState<CartItem[]>([]);
const [cartOpen, setCartOpen] = useState(false);
const [search, setSearch] = useState('');
const [showBreakdown, setShowBreakdown] = useState<string | null>(null);

useEffect(() => {
if (storeKey) loadProducts();
}, [storeKey]);

async function loadProducts() {
setLoading(true);
const { data } = await supabase
.from('us_supplier_products')
.select('*')
.eq('store', storeKey)
.eq('in_stock', true)
.order('featured', { ascending: false })
.order('created_at', { ascending: false });
setProducts(data || []);
setLoading(false);
}

const filtered = products.filter((p) =>
!search || p.name.toLowerCase().includes(search.toLowerCase())
);

const cartCount = cart.reduce((s, i) => s + i.qty, 0);
const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

function addToCart(product: Product) {
const price = product.final_price_bsd > 0 ? product.final_price_bsd : calcPrice(product);
setCart((prev) => {
const existing = prev.find((i) => i.id === product.id);
if (existing) return prev.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
return [...prev, { id: product.id, name: product.name, price, qty: 1, store: storeKey }];
});
}

function changeQty(id: string, delta: number) {
setCart((prev) => prev.map((i) => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
}

function removeFromCart(id: string) {
setCart((prev) => prev.filter((i) => i.id !== id));
}

function goCheckout() {
if (typeof window !== 'undefined') {
localStorage.setItem('bsc_cart', JSON.stringify(cart.map(i => ({
id: i.id, name: `[${storeInfo?.name}] ${i.name}`, price: i.price, quantity: i.qty, unit: 'each',
}))));
router.push('/checkout');
}
}

if (!storeInfo) {
return (
<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
<div style={{ textAlign: 'center' }}>
<div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
<h2 style={{ color: '#1a2e5a' }}>Store not found</h2>
<Link href="/us-shopping" style={{ color: '#1a2e5a', fontWeight: 700 }}>← Back to stores</Link>
</div>
</div>
);
}

return (
<div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, sans-serif' }}>

{/* HEADER */}
<header style={{ backgroundColor: storeInfo.color, padding: '0 20px', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
<div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
<button onClick={() => router.push('/us-shopping')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Stores</button>
<div style={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>{storeInfo.logo} {storeInfo.name}</div>
</div>
<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
<div style={{ position: 'relative' }}>
<input
value={search}
onChange={(e) => setSearch(e.target.value)}
placeholder="Search products..."
style={{ padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 13, outline: 'none', minWidth: 200 }}
/>
</div>
<button
onClick={() => setCartOpen(true)}
style={{ backgroundColor: '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
>
🛒 Cart {cartCount > 0 && `(${cartCount})`}
</button>
</div>
</div>
</header>

{/* STORE HERO */}
<div style={{ backgroundColor: storeInfo.color, padding: '32px 20px', borderBottom: '4px solid #f4c842' }}>
<div style={{ maxWidth: 1200, margin: '0 auto' }}>
<p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '0 0 8px' }}>
🇺🇸 Florida · Picked up by Dedrick · Delivered to Nassau & Andros
</p>
<h1 style={{ color: '#fff', fontSize: 32, fontWeight: 900, margin: '0 0 8px' }}>{storeInfo.name}</h1>
<p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15, margin: 0 }}>{storeInfo.tagline}</p>
</div>
</div>

{/* PRICING NOTE */}
<div style={{ backgroundColor: '#fef9e7', borderBottom: '1px solid #fde047', padding: '12px 20px' }}>
<div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>
<span style={{ fontSize: 16 }}>💡</span>
<span style={{ color: '#713f12', fontSize: 13, fontWeight: 600 }}>
All prices include US cost + shipping ($0.60/lb) + customs duty + BSC 12% service. Click any product to see the full breakdown.
</span>
</div>
</div>

{/* PRODUCTS */}
<div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px' }}>
{loading ? (
<div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
<div style={{ fontSize: 40, marginBottom: 12 }}>{storeInfo.logo}</div>
Loading products...
</div>
) : filtered.length === 0 ? (
<div style={{ textAlign: 'center', padding: 60 }}>
<div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
<h3 style={{ color: '#1a2e5a', fontWeight: 800 }}>
{products.length === 0 ? 'No products listed yet' : 'No products match your search'}
</h3>
<p style={{ color: '#999', fontSize: 14 }}>
{products.length === 0
? 'Dedrick is adding products from this store. Check back soon.'
: 'Try a different search term'}
</p>
</div>
) : (
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
{filtered.map((product) => {
const finalPrice = product.final_price_bsd > 0 ? product.final_price_bsd : calcPrice(product);
const inCart = cart.find((i) => i.id === product.id);
const showingBreakdown = showBreakdown === product.id;

return (
<div key={product.id} style={{ backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: product.featured ? `2px solid ${storeInfo.color}` : '1px solid #e5e7eb' }}>

{/* Product image */}
<div style={{ height: 160, backgroundColor: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
{product.image_url ? (
<img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
) : (
<span style={{ fontSize: 56 }}>{storeInfo.logo}</span>
)}
{product.featured && (
<div style={{ position: 'absolute', top: 8, left: 8, backgroundColor: storeInfo.color, color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6 }}>
⭐ Featured
</div>
)}
<div style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
🇺🇸 {storeInfo.name}
</div>
</div>

<div style={{ padding: '14px' }}>
<div style={{ fontSize: 10, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
{product.category} · {product.weight_lbs}lb
</div>
<h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: 15, margin: '0 0 4px', lineHeight: 1.3 }}>{product.name}</h3>
{product.description && (
<p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 8px', lineHeight: 1.4 }}>{product.description}</p>
)}

<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
<div>
<div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 20 }}>BSD ${finalPrice.toFixed(2)}</div>
<div style={{ color: '#94a3b8', fontSize: 11 }}>US: ${product.original_cost_usd.toFixed(2)} + landed costs</div>
</div>
<button
onClick={() => setShowBreakdown(showingBreakdown ? null : product.id)}
style={{ backgroundColor: '#f0f4ff', color: '#1a2e5a', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
>
{showingBreakdown ? 'Hide' : '📊 Breakdown'}
</button>
</div>

{showingBreakdown && <PriceBreakdown p={product} />}

<div style={{ marginTop: 12 }}>
{inCart ? (
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f0f4ff', borderRadius: 10, padding: '6px 10px' }}>
<button onClick={() => changeQty(product.id, -1)} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', backgroundColor: '#fff', color: '#1a2e5a', fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>-</button>
<span style={{ color: '#1a2e5a', fontWeight: 800, fontSize: 14 }}>{inCart.qty}</span>
<button onClick={() => changeQty(product.id, 1)} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', backgroundColor: '#1a2e5a', color: '#fff', fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>+</button>
</div>
) : (
<button
onClick={() => addToCart(product)}
style={{ width: '100%', backgroundColor: storeInfo.color, color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
>
Add to Cart — BSD ${finalPrice.toFixed(2)}
</button>
)}
</div>
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
<div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 400, backgroundColor: '#fff', zIndex: 101, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' }}>
<div style={{ padding: '20px', backgroundColor: storeInfo.color, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<h2 style={{ color: '#fff', fontWeight: 900, fontSize: 18, margin: 0 }}>Your Cart ({cartCount})</h2>
<button onClick={() => setCartOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>×</button>
</div>
<div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
{cart.length === 0 ? (
<div style={{ textAlign: 'center', padding: 48, color: '#999' }}>
<div style={{ fontSize: 40, marginBottom: 12 }}>🛒</div>
Cart is empty
</div>
) : (
cart.map((item) => (
<div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f5f5f5' }}>
<div style={{ flex: 1 }}>
<div style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 13 }}>{item.name}</div>
<div style={{ color: '#999', fontSize: 12 }}>BSD ${item.price.toFixed(2)} each</div>
</div>
<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
<button onClick={() => changeQty(item.id, -1)} style={{ width: 26, height: 26, border: '1px solid #e5e7eb', borderRadius: 6, backgroundColor: '#fff', cursor: 'pointer', fontWeight: 900 }}>-</button>
<span style={{ fontWeight: 800, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
<button onClick={() => changeQty(item.id, 1)} style={{ width: 26, height: 26, border: 'none', borderRadius: 6, backgroundColor: '#1a2e5a', color: '#fff', cursor: 'pointer', fontWeight: 900 }}>+</button>
</div>
<div style={{ minWidth: 80, textAlign: 'right' }}>
<div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: 13 }}>BSD ${(item.price * item.qty).toFixed(2)}</div>
<button onClick={() => removeFromCart(item.id)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', padding: 0 }}>Remove</button>
</div>
</div>
))
)}
</div>
{cart.length > 0 && (
<div style={{ padding: 20, borderTop: '1px solid #f0f0f0' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
<span style={{ color: '#666', fontSize: 14 }}>Total</span>
<span style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 18 }}>BSD ${cartTotal.toFixed(2)}</span>
</div>
<button onClick={goCheckout} style={{ width: '100%', backgroundColor: '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: 12, padding: 14, fontWeight: 900, fontSize: 15, cursor: 'pointer', marginBottom: 8 }}>
Checkout · BSD ${cartTotal.toFixed(2)}
</button>
<p style={{ textAlign: 'center', color: '#999', fontSize: 12, margin: 0 }}>All prices include full landed cost to Bahamas</p>
</div>
)}
</div>
</>
)}
</div>
);
}
