'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { splitSale, recordSaleFinancials } from '@/lib/finance';

export const dynamic = 'force-dynamic';

// ============================================================
// TYPES
// ============================================================

type CatalogRow = {
id: string;
sku: string;
barcode: string | null;
name: string;
description: string | null;
category: string;
unit_of_measure: string;
pack_size: string | null;
image_url: string | null;
is_bsc_processed: boolean;
pricing_mode: string | null;
margin_multiplier: number | null;
vat_multiplier: number | null;
manual_unit_price: number | null;
cost_per_unit: number | null;
};

type SellableProduct = {
id: string;
sku: string;
barcode: string | null;
name: string;
category: string;
unit_of_measure: string;
pack_size: string | null;
image_url: string | null;
is_bsc_processed: boolean;
unit_price: number;
cost_per_unit: number;
};

type CartItem = {
product_id: string;
sku: string;
name: string;
unit_price: number;
cost_per_unit: number;
unit_of_measure: string;
qty: number;
};

type PaymentMethod = 'cash' | 'card' | 'transfer';

type CompletedSale = {
ref: string;
total: number;
cost_total: number;
profit: number;
items: CartItem[];
customer: string;
payment_method: PaymentMethod;
card_ref: string | null;
};

const CATEGORY_EMOJI: Record<string, string> = {
fresh_seafood: '🐟', frozen_seafood: '🦞', processed_seafood: '🦐',
meat: '🥩', produce: '🥦', juice_smoothie: '🥤',
wellness_shot: '💪', grocery: '🌾', snack: '🍪',
beverage: '💧', household: '🧴', toiletry: '🧼',
};

const CATEGORY_LABEL: Record<string, string> = {
fresh_seafood: 'Fresh Seafood', frozen_seafood: 'Frozen Seafood',
processed_seafood: 'Processed', meat: 'Meat', produce: 'Produce',
juice_smoothie: 'Juice/Smoothie', wellness_shot: 'Wellness',
grocery: 'Grocery', snack: 'Snack', beverage: 'Beverage',
household: 'Household', toiletry: 'Toiletry',
};

function getSupabase() {
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Supabase env not configured.');
return createBrowserClient(url, key);
}

function computePrice(r: CatalogRow): number {
if (r.pricing_mode === 'manual_override' && r.manual_unit_price != null) return Number(r.manual_unit_price);
if (r.pricing_mode === 'formula' && r.cost_per_unit != null && r.margin_multiplier != null && r.vat_multiplier != null) {
return Number(r.cost_per_unit) * Number(r.margin_multiplier) * Number(r.vat_multiplier);
}
if (r.manual_unit_price != null) return Number(r.manual_unit_price);
return 0;
}

function genRef() {
return 'BSC-' + Date.now().toString().slice(-8);
}

export default function RegisterPage() {
const [products, setProducts] = useState<SellableProduct[]>([]);
const [productsLoading, setProductsLoading] = useState(true);
const [productsError, setProductsError] = useState<string | null>(null);
const [unsellableCount, setUnsellableCount] = useState(0);

const [cart, setCart] = useState<CartItem[]>([]);
const [category, setCategory] = useState<string>('all');
const [search, setSearch] = useState('');
const [customerName, setCustomerName] = useState('');
const [customerPhone, setCustomerPhone] = useState('');
const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
const [cardRef, setCardRef] = useState('');
const [completing, setCompleting] = useState(false);
const [lastSale, setLastSale] = useState<CompletedSale | null>(null);
const [userId, setUserId] = useState<string | null>(null);

// Capture the user id once for orders.user_id
useEffect(() => {
const supabase = getSupabase();
supabase.auth.getSession().then(({ data: { session } }) => {
setUserId(session?.user.id || null);
});
}, []);

const loadCatalog = useCallback(async () => {
setProductsLoading(true);
setProductsError(null);
try {
const supabase = getSupabase();
const { data: rows, error } = await supabase.rpc('get_pos_catalog', { p_channel: 'nassau_pos' });
if (error) throw error;

const sellable: SellableProduct[] = [];
let unsellable = 0;
(rows as CatalogRow[] || []).forEach((r) => {
const unit_price = computePrice(r);
if (unit_price <= 0) { unsellable++; return; }
sellable.push({
id: r.id, sku: r.sku, barcode: r.barcode, name: r.name,
category: r.category, unit_of_measure: r.unit_of_measure,
pack_size: r.pack_size, image_url: r.image_url,
is_bsc_processed: r.is_bsc_processed,
unit_price, cost_per_unit: r.cost_per_unit ? Number(r.cost_per_unit) : 0,
});
});
setProducts(sellable);
setUnsellableCount(unsellable);
} catch (e) {
setProductsError(e instanceof Error ? e.message : 'Failed to load catalog');
} finally {
setProductsLoading(false);
}
}, []);

useEffect(() => { loadCatalog(); }, [loadCatalog]);

const categoriesPresent = Array.from(new Set(products.map((p) => p.category))).sort();
const filtered = products.filter((p) => {
const matchCat = category === 'all' || p.category === category;
const q = search.trim().toLowerCase();
const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q);
return matchCat && matchSearch;
});

function addToCart(p: SellableProduct) {
setCart((prev) => {
const existing = prev.find((i) => i.product_id === p.id);
if (existing) return prev.map((i) => i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i);
return [...prev, {
product_id: p.id, sku: p.sku, name: p.name,
unit_price: p.unit_price, cost_per_unit: p.cost_per_unit,
unit_of_measure: p.unit_of_measure, qty: 1,
}];
});
}
function changeQty(id: string, delta: number) {
setCart((prev) => prev.map((i) => i.product_id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
}
function removeItem(id: string) { setCart((prev) => prev.filter((i) => i.product_id !== id)); }

const subtotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0);
const costTotal = cart.reduce((s, i) => s + i.cost_per_unit * i.qty, 0);
// splitSale strips VAT before computing BSC profit, which is the correct
// number — the prior `subtotal - costTotal` overstated profit by the 10% VAT.
const realProfit = splitSale(subtotal, costTotal, 'nassau_pos').bsc_profit;

async function completeSale() {
if (cart.length === 0 || completing) return;
if (paymentMethod === 'card' && !cardRef.trim()) {
alert('Please enter the card payment reference number from the terminal.');
return;
}
setCompleting(true);
const ref = genRef();
try {
const supabase = getSupabase();
const lineItems = cart.map((i) => ({
product_id: i.product_id, sku: i.sku, name: i.name,
qty: i.qty, unit: i.unit_of_measure,
unit_price: Number(i.unit_price.toFixed(2)),
cost_per_unit: Number(i.cost_per_unit.toFixed(2)),
line_total: Number((i.unit_price * i.qty).toFixed(2)),
line_cost: Number((i.cost_per_unit * i.qty).toFixed(2)),
}));
const customerNameClean = customerName.trim();
const customerPhoneClean = customerPhone.trim();

// Upsert customer first if we have anything to dedup on. Synchronous so
// the order row gets a customer_id link immediately. Fails-soft — a
// network blip on customer tracking can't block a paid sale.
let customerIdLinked: string | null = null;
if (customerNameClean || customerPhoneClean) {
  try {
    const upRes = await fetch('/api/customers/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: customerNameClean,
        phone: customerPhoneClean || null,
        source: 'pos_nassau',
        order_total_bsd: Number(subtotal.toFixed(2)),
      }),
    });
    const upJson = await upRes.json();
    if (upJson?.customer_id) customerIdLinked = upJson.customer_id;
  } catch (err) {
    console.warn('Customer upsert failed:', err);
  }
}

const { data: insertedOrder, error: insertError } = await supabase.from('orders').insert({
order_type: 'pos_sale_nassau',
payment_method: paymentMethod,
payment_status: 'paid_in_full',
wholesale_items: lineItems,
wholesale_cost_total: Number(subtotal.toFixed(2)),
customer_name: customerNameClean || 'Walk-in',
customer_phone: customerPhoneClean || null,
customer_id: customerIdLinked,
admin_notes: paymentMethod === 'card' && cardRef ? `Card ref: ${cardRef}` : null,
user_id: userId,
}).select('id').single();
if (insertError) {
alert('Sale could not be saved: ' + insertError.message);
setCompleting(false);
return;
}
// Persist channel-correct financial split. Fire-and-forget — a missing
// financials table or RLS issue must not block the sale.
const orderId = insertedOrder?.id ?? null;
recordSaleFinancials({
  saleAmount: subtotal,
  costBasis: costTotal,
  channel: 'nassau_pos',
  orderId,
}).catch((err) => console.warn('Financials log failed:', err));

// Decrement inventory at the Nassau location. Fire-and-forget for the same
// reason — sale is already paid for, can't roll it back over a stock log.
(async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    await fetch('/api/sales/inventory-write', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        location_code: 'NASSAU',
        order_id: orderId,
        channel: 'nassau_pos',
        items: lineItems.map((i) => ({
          product_id: i.product_id,
          sku: i.sku,
          qty: i.qty,
          unit: i.unit,
        })),
      }),
    });
  } catch (err) {
    console.warn('Inventory decrement failed:', err);
  }
})();

// Queue an order confirmation if we have a phone. Fire-and-forget.
if (customerPhoneClean && customerNameClean && customerNameClean !== 'Walk-in') {
  fetch('/api/notifications/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'whatsapp',
      recipient_phone: customerPhoneClean,
      recipient_name: customerNameClean,
      template_key: 'order_confirmation_pos_nassau',
      body: `Hi ${customerNameClean}, thanks for shopping at BSC Marketplace Nassau. Your receipt: BSD $${subtotal.toFixed(2)} (${ref}). — BSC`,
      related_order_id: orderId,
      related_customer_id: customerIdLinked,
    }),
  }).catch((err) => console.warn('Notification queue failed:', err));
}
setLastSale({
ref, total: subtotal, cost_total: costTotal, profit: realProfit,
items: [...cart], customer: customerName.trim() || 'Walk-in',
payment_method: paymentMethod, card_ref: paymentMethod === 'card' ? cardRef : null,
});
setCart([]); setCustomerName(''); setCustomerPhone(''); setCardRef('');
} catch (e) {
alert('Sale failed: ' + (e instanceof Error ? e.message : 'unknown error'));
} finally {
setCompleting(false);
}
}

return (
<div style={{ display: 'flex', height: '100vh', backgroundColor: '#f8f9fa' }}>

{/* LEFT — products */}
<div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

{/* Header strip */}
<div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 20px' }}>
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
<div>
<div style={{ fontWeight: 900, fontSize: 18, color: '#1a2e5a' }}>💵 Register</div>
<div style={{ fontSize: 12, color: '#94a3b8' }}>Nassau · Firetrail Road</div>
</div>
<Link href="/pos/scan" style={{ backgroundColor: '#f4c842', color: '#1a2e5a', textDecoration: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 800 }}>
📷 Scan
</Link>
</div>

<input
type="text"
placeholder="Search by name, SKU, or barcode…"
value={search}
onChange={(e) => setSearch(e.target.value)}
style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
/>
<div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
<button
onClick={() => setCategory('all')}
style={{ padding: '6px 14px', borderRadius: 20, border: 'none', backgroundColor: category === 'all' ? '#1a2e5a' : '#f0f0f0', color: category === 'all' ? '#fff' : '#555', fontSize: 12, fontWeight: category === 'all' ? 800 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
>
All ({products.length})
</button>
{categoriesPresent.map((cat) => {
const count = products.filter((p) => p.category === cat).length;
return (
<button key={cat} onClick={() => setCategory(cat)} style={{ padding: '6px 14px', borderRadius: 20, border: 'none', backgroundColor: category === cat ? '#1a2e5a' : '#f0f0f0', color: category === cat ? '#fff' : '#555', fontSize: 12, fontWeight: category === cat ? 800 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
{CATEGORY_EMOJI[cat] || '📦'} {CATEGORY_LABEL[cat] || cat} ({count})
</button>
);
})}
</div>
</div>

{/* Body */}
<div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
{productsLoading && (
<div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
<div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>Loading catalog…
</div>
)}
{productsError && (
<div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 16, color: '#991b1b' }}>
<div style={{ fontWeight: 800, marginBottom: 4 }}>Catalog could not load</div>
<div style={{ fontSize: 12 }}>{productsError}</div>
<button onClick={loadCatalog} style={{ marginTop: 10, padding: '6px 14px', borderRadius: 8, border: '1px solid #991b1b', backgroundColor: '#fff', color: '#991b1b', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
</div>
)}
{!productsLoading && !productsError && unsellableCount > 0 && products.length > 0 && (
<div style={{ backgroundColor: '#fffbea', border: '1px solid #fde68a', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12, color: '#92400e' }}>
⚠️ {unsellableCount} product{unsellableCount !== 1 ? 's' : ''} hidden — missing cost or pricing. Use the <Link href="/pos/scan" style={{ color: '#92400e', textDecoration: 'underline', fontWeight: 700 }}>scanner</Link> to update.
</div>
)}
{!productsLoading && !productsError && products.length === 0 && (
<div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
<div style={{ fontSize: 32, marginBottom: 12 }}>🆕</div>
<div style={{ fontWeight: 700 }}>No sellable products yet</div>
<div style={{ fontSize: 12, marginTop: 8, marginBottom: 16 }}>
{unsellableCount > 0 ? `${unsellableCount} products in catalog — none have full cost + pricing yet.` : 'Catalog is empty.'}
</div>
<Link href="/pos/scan" style={{ display: 'inline-block', backgroundColor: '#1a2e5a', color: '#f4c842', padding: '10px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 800, fontSize: 13 }}>
📷 Open Scanner
</Link>
</div>
)}
{!productsLoading && !productsError && filtered.length === 0 && products.length > 0 && (
<div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
<div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
<div style={{ fontWeight: 700 }}>No matches</div>
</div>
)}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
{filtered.map((p) => (
<button
key={p.id}
onClick={() => addToCart(p)}
style={{ backgroundColor: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', textAlign: 'center' }}
>
{p.image_url ? (
<img src={p.image_url} alt={p.name} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }} />
) : (
<span style={{ fontSize: 36 }}>{CATEGORY_EMOJI[p.category] || '📦'}</span>
)}
<span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, lineHeight: 1.3 }}>{p.name}</span>
<span style={{ color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}>{p.sku}</span>
<span style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 16 }}>${p.unit_price.toFixed(2)}</span>
<span style={{ color: '#6b7280', fontSize: 10 }}>per {p.unit_of_measure}</span>
</button>
))}
</div>
</div>
</div>

{/* RIGHT — cart */}
<div style={{ width: 340, backgroundColor: '#fff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
<div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#1a2e5a' }}>
<div style={{ color: '#f4c842', fontWeight: 900, fontSize: 15 }}>Current Sale</div>
<div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
{cart.length} item{cart.length !== 1 ? 's' : ''}
</div>
</div>

<div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 6 }}>
<input
type="text"
placeholder="Customer name (optional)"
value={customerName}
onChange={(e) => setCustomerName(e.target.value)}
style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
/>
<input
type="tel"
placeholder="Phone (optional, enables tracking)"
value={customerPhone}
onChange={(e) => setCustomerPhone(e.target.value)}
style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
/>
</div>

<div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
{cart.length === 0 && (
<div style={{ textAlign: 'center', padding: '40px 0', color: '#ccc' }}>
<div style={{ fontSize: 40, marginBottom: 10 }}>🛒</div>
<div style={{ fontSize: 13 }}>Tap a product to add</div>
</div>
)}
{cart.map((item) => (
<div key={item.product_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
<div style={{ flex: 1, minWidth: 0 }}>
<div style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
<div style={{ color: '#999', fontSize: 11 }}>${item.unit_price.toFixed(2)} per {item.unit_of_measure}</div>
</div>
<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
<button onClick={() => changeQty(item.product_id, -1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e5e7eb', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 900, fontSize: 14 }}>−</button>
<span style={{ fontWeight: 800, fontSize: 13, minWidth: 22, textAlign: 'center' }}>{item.qty}</span>
<button onClick={() => changeQty(item.product_id, 1)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', backgroundColor: '#1a2e5a', color: '#fff', cursor: 'pointer', fontWeight: 900, fontSize: 14 }}>+</button>
</div>
<div style={{ minWidth: 50, textAlign: 'right' }}>
<div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: 13 }}>${(item.unit_price * item.qty).toFixed(2)}</div>
<button onClick={() => removeItem(item.product_id)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 10, cursor: 'pointer', padding: 0 }}>remove</button>
</div>
</div>
))}
</div>

<div style={{ padding: '14px 16px', borderTop: '1px solid #e2e8f0', backgroundColor: '#fafafa' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
<span style={{ color: '#666', fontSize: 13 }}>Subtotal</span>
<span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 13 }}>${subtotal.toFixed(2)}</span>
</div>
{costTotal > 0 && (
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, padding: '8px 10px', backgroundColor: '#e8f5e9', borderRadius: 8 }}>
<span style={{ color: '#2e7d32', fontSize: 13, fontWeight: 700 }}>Real Profit</span>
<span style={{ color: '#2e7d32', fontWeight: 900, fontSize: 14 }}>${realProfit.toFixed(2)}</span>
</div>
)}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
{(['cash', 'card', 'transfer'] as const).map((m) => (
<button key={m} onClick={() => setPaymentMethod(m)} style={{ padding: 7, borderRadius: 8, border: '2px solid', borderColor: paymentMethod === m ? '#1a2e5a' : '#e5e7eb', backgroundColor: paymentMethod === m ? '#1a2e5a' : '#fff', color: paymentMethod === m ? '#f4c842' : '#666', fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>
{m === 'cash' ? '💵' : m === 'card' ? '💳' : '🏦'} {m}
</button>
))}
</div>
{paymentMethod === 'card' && (
<input type="text" placeholder="Card terminal ref # (required)" value={cardRef} onChange={(e) => setCardRef(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 12, outline: 'none', boxSizing: 'border-box', marginBottom: 10, fontFamily: 'monospace' }} />
)}
<button
onClick={completeSale}
disabled={cart.length === 0 || completing}
style={{ width: '100%', backgroundColor: cart.length === 0 || completing ? '#e5e7eb' : '#f4c842', color: cart.length === 0 || completing ? '#999' : '#1a2e5a', border: 'none', borderRadius: 12, padding: 14, fontWeight: 900, fontSize: 15, cursor: cart.length === 0 || completing ? 'not-allowed' : 'pointer' }}
>
{completing ? 'Saving…' : cart.length === 0 ? 'Add Items to Sell' : `Complete Sale · $${subtotal.toFixed(2)}`}
</button>
</div>
</div>

{lastSale && (
<>
<div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 60 }} />
<div style={{ position: 'fixed', inset: 20, maxWidth: 420, margin: '0 auto', backgroundColor: '#fff', borderRadius: 20, zIndex: 61, overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', height: 'fit-content', maxHeight: 'calc(100vh - 40px)' }}>
<div style={{ backgroundColor: '#1a2e5a', padding: 24, textAlign: 'center', borderRadius: '20px 20px 0 0' }}>
<div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
<div style={{ color: '#f4c842', fontWeight: 900, fontSize: 20 }}>Sale Complete</div>
<div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4, fontFamily: 'monospace' }}>{lastSale.ref}</div>
</div>
<div style={{ padding: 24 }}>
<div style={{ marginBottom: 12, fontSize: 12, color: '#666' }}>
<strong>Customer:</strong> {lastSale.customer}<br />
<strong>Payment:</strong> {lastSale.payment_method.toUpperCase()}{lastSale.card_ref ? ` (Ref: ${lastSale.card_ref})` : ''}<br />
<strong>Date:</strong> {new Date().toLocaleString()}
</div>
{lastSale.items.map((item) => (
<div key={item.product_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
<span style={{ color: '#444', fontSize: 13 }}>{item.name} × {item.qty}</span>
<span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 13 }}>${(item.unit_price * item.qty).toFixed(2)}</span>
</div>
))}
<div style={{ marginTop: 16, padding: 14, backgroundColor: '#fef9e7', borderRadius: 12, marginBottom: 16 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
<span style={{ color: '#666', fontSize: 14, fontWeight: 700 }}>Total</span>
<span style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 18 }}>${lastSale.total.toFixed(2)}</span>
</div>
{lastSale.cost_total > 0 && (
<div style={{ display: 'flex', justifyContent: 'space-between' }}>
<span style={{ color: '#2e7d32', fontSize: 13, fontWeight: 700 }}>Real Profit</span>
<span style={{ color: '#2e7d32', fontWeight: 900, fontSize: 15 }}>${lastSale.profit.toFixed(2)}</span>
</div>
)}
</div>
<a
href={`https://wa.me/?text=${encodeURIComponent(`BSC Marketplace Receipt\nRef: ${lastSale.ref}\nCustomer: ${lastSale.customer}\nTotal: $${lastSale.total.toFixed(2)}\nPayment: ${lastSale.payment_method.toUpperCase()}\n\nThank you for shopping with BSC!`)}`}
target="_blank" rel="noreferrer"
style={{ display: 'block', backgroundColor: '#25D366', color: '#fff', textDecoration: 'none', borderRadius: 12, padding: 12, textAlign: 'center', fontWeight: 800, fontSize: 14, marginBottom: 10 }}
>
💬 Send Receipt via WhatsApp
</a>
<button onClick={() => setLastSale(null)} style={{ width: '100%', backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 12, padding: 13, fontWeight: 900, fontSize: 14, cursor: 'pointer' }}>
+ New Sale
</button>
</div>
</div>
</>
)}
</div>
);
}

