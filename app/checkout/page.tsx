'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type CartItem = {
id: string;
name: string;
price: number;
quantity: number;
unit: string;
};

export default function CheckoutPage() {
const router = useRouter();

const [cart, setCart] = useState<CartItem[]>([]);
const [name, setName] = useState('');
const [email, setEmail] = useState('');
const [phone, setPhone] = useState('');
const [address, setAddress] = useState('');
const [payMethod, setPayMethod] = useState<'card' | 'cod'>('cod');
const [notes, setNotes] = useState('');
const [loading, setLoading] = useState(false);
const [error, setError] = useState('');
const [success, setSuccess] = useState('');
const [orderId, setOrderId] = useState('');

useEffect(() => {
if (typeof window !== 'undefined') {
const raw = localStorage.getItem('bsc_cart');
if (raw) {
try { setCart(JSON.parse(raw)); } catch {}
}
}
}, []);

const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
const deliveryFee = subtotal >= 1000 ? 0 : subtotal > 0 ? 15 : 0;
const total = subtotal + deliveryFee;

// Detect if any items are wholesale (name contains [Wholesaler])
const isWholesale = cart.some(i => /^\[.+\]/.test(i.name));
const wholesalerKey = isWholesale
? (() => {
const match = cart[0]?.name?.match(/^\[(.+?)\]/);
if (!match) return null;
const name = match[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
return name;
})()
: null;

async function placeOrder() {
if (!name.trim()) { setError('Please enter your name.'); return; }
if (!phone.trim()) { setError('Please enter your phone number.'); return; }
if (!address.trim()) { setError('Please enter your delivery address.'); return; }
if (cart.length === 0) { setError('Your cart is empty.'); return; }

setLoading(true);
setError('');

try {
const payload: Record<string, unknown> = {
customer_name: name.trim(),
customer_email: email.trim() || null,
customer_phone: phone.trim(),
customer_address: address.trim(),
items: cart,
subtotal,
delivery_fee: deliveryFee,
total,
payment_method: payMethod === 'card' ? 'card' : 'cash_on_delivery',
payment_status: payMethod === 'card' ? 'payment_pending' : 'unpaid',
order_type: isWholesale ? 'wholesale' : 'retail',
notes: notes.trim() || null,
};

if (isWholesale && wholesalerKey) {
payload.wholesaler = wholesalerKey;
payload.wholesale_items = cart.map(i => ({
name: i.name.replace(/^\[.+?\]\s*/, ''),
quantity: i.quantity,
unit: i.unit,
price: i.price,
wholesale_cost: i.price / 1.232,
}));
payload.wholesale_cost_total = cart.reduce((s, i) => s + (i.price / 1.232) * i.quantity, 0);
}

const res = await fetch('/api/orders/create', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(payload),
});

const data = await res.json();

if (!res.ok || data.error) {
setError(data.error || 'Order failed. Please try again.');
setLoading(false);
return;
}

// Clear cart
if (typeof window !== 'undefined') {
localStorage.removeItem('bsc_cart');
}

setOrderId(data.order_id);
setSuccess('Order placed successfully!');
setCart([]);

} catch (err) {
setError('Connection error. Please try again.');
}

setLoading(false);
}

// Success screen
if (success) {
return (
<div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
<div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 40, maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>
<div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
<h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 24, marginBottom: 8 }}>Order Placed!</h2>
<p style={{ color: '#666', fontSize: 15, lineHeight: 1.6, marginBottom: 8 }}>
Thank you, {name}! Your order has been received.
</p>
{orderId && (
<p style={{ color: '#999', fontSize: 12, marginBottom: 20 }}>
Order ID: <strong style={{ color: '#1a2e5a' }}>#{orderId.slice(0, 8).toUpperCase()}</strong>
</p>
)}
<div style={{ backgroundColor: '#e8f5e9', borderRadius: 12, padding: '14px 20px', marginBottom: 24, textAlign: 'left' }}>
<div style={{ color: '#2e7d32', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>What happens next:</div>
{isWholesale ? (
<>
<div style={{ color: '#333', fontSize: 13, marginBottom: 4 }}>📋 BSC admin has been notified of your wholesale order</div>
<div style={{ color: '#333', fontSize: 13, marginBottom: 4 }}>🏭 We will pick up your items from the wholesaler</div>
<div style={{ color: '#333', fontSize: 13 }}>📱 We will WhatsApp you when your order is ready for delivery</div>
</>
) : (
<>
<div style={{ color: '#333', fontSize: 13, marginBottom: 4 }}>📱 You will receive a WhatsApp confirmation shortly</div>
<div style={{ color: '#333', fontSize: 13, marginBottom: 4 }}>🚚 Estimated delivery: 2–4 hours</div>
<div style={{ color: '#333', fontSize: 13 }}>💬 We will contact you at {phone} to confirm</div>
</>
)}
</div>
<div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
<Link href="/market" style={{ backgroundColor: '#1a2e5a', color: '#f4c842', textDecoration: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 800, fontSize: 14 }}>
Continue Shopping
</Link>
<Link href="/" style={{ backgroundColor: '#f0f4ff', color: '#1a2e5a', textDecoration: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 700, fontSize: 14 }}>
Go Home
</Link>
</div>
</div>
</div>
);
}

return (
<div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, sans-serif' }}>

{/* HEADER */}
<header style={{ backgroundColor: '#1a2e5a', padding: '0 20px', position: 'sticky', top: 0, zIndex: 50 }}>
<div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
<Link href="/" style={{ color: '#f4c842', fontWeight: 900, fontSize: 18, letterSpacing: 2, textDecoration: 'none' }}>BSC</Link>
<div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Checkout</div>
<Link href="/market" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Market</Link>
</div>
</header>

<div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 40px' }}>

{/* EMPTY CART */}
{cart.length === 0 ? (
<div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#fff', borderRadius: 16 }}>
<div style={{ fontSize: 48, marginBottom: 16 }}>🛒</div>
<h3 style={{ color: '#1a2e5a', fontWeight: 800 }}>Your cart is empty</h3>
<Link href="/market" style={{ display: 'inline-block', marginTop: 16, backgroundColor: '#1a2e5a', color: '#f4c842', textDecoration: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 800 }}>
Shop Now
</Link>
</div>
) : (
<div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>

{/* ORDER SUMMARY */}
<div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
<h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 16, marginBottom: 16 }}>
🛒 Your Order {isWholesale && <span style={{ backgroundColor: '#f0fde8', color: '#2e7d32', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, marginLeft: 8 }}>Wholesale</span>}
</h2>
<div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
{cart.map((item, i) => (
<div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
<div>
<div style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 14 }}>
{item.name.replace(/^\[.+?\]\s*/, '')}
</div>
<div style={{ color: '#999', fontSize: 12 }}>
{item.quantity} × BSD ${item.price.toFixed(2)} / {item.unit}
</div>
</div>
<div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: 14 }}>
BSD ${(item.price * item.quantity).toFixed(2)}
</div>
</div>
))}
</div>
<div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
<span style={{ color: '#666', fontSize: 13 }}>Subtotal</span>
<span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 13 }}>BSD ${subtotal.toFixed(2)}</span>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
<span style={{ color: '#666', fontSize: 13 }}>Delivery</span>
<span style={{ color: deliveryFee === 0 ? '#2e7d32' : '#1a2e5a', fontWeight: 700, fontSize: 13 }}>
{deliveryFee === 0 ? '🚚 FREE' : `BSD $${deliveryFee.toFixed(2)}`}
</span>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between' }}>
<span style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 16 }}>Total</span>
<span style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 20 }}>BSD ${total.toFixed(2)}</span>
</div>
{subtotal < 1000 && subtotal > 0 && (
<p style={{ color: '#999', fontSize: 11, marginTop: 8, margin: '8px 0 0' }}>
Add BSD ${(1000 - subtotal).toFixed(2)} more for free delivery
</p>
)}
</div>
</div>

{/* CUSTOMER DETAILS */}
<div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
<h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 16, marginBottom: 16 }}>📋 Your Details</h2>

{error && (
<div style={{ backgroundColor: '#fde8e8', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
{error}
</div>
)}

<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
<div>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Full Name *</label>
<input
value={name}
onChange={(e) => setName(e.target.value)}
placeholder="Your full name"
style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
/>
</div>
<div>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>WhatsApp / Phone *</label>
<input
value={phone}
onChange={(e) => setPhone(e.target.value)}
placeholder="+1 (242) 000-0000"
type="tel"
style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
/>
</div>
<div>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Email (optional)</label>
<input
value={email}
onChange={(e) => setEmail(e.target.value)}
placeholder="your@email.com"
type="email"
style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
/>
</div>
<div>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Delivery Address *</label>
<textarea
value={address}
onChange={(e) => setAddress(e.target.value)}
placeholder="Street address, area, Nassau or Andros"
rows={2}
style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
/>
</div>
<div>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Order Notes (optional)</label>
<textarea
value={notes}
onChange={(e) => setNotes(e.target.value)}
placeholder="Any special instructions..."
rows={2}
style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
/>
</div>
</div>
</div>

{/* PAYMENT METHOD */}
<div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
<h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 16, marginBottom: 16 }}>💳 Payment Method</h2>
<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
<button
onClick={() => setPayMethod('cod')}
style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, border: payMethod === 'cod' ? '2px solid #1a2e5a' : '1px solid #e5e7eb', backgroundColor: payMethod === 'cod' ? '#f0f4ff' : '#fff', cursor: 'pointer', textAlign: 'left' }}
>
<div style={{ width: 20, height: 20, borderRadius: '50%', border: payMethod === 'cod' ? '6px solid #1a2e5a' : '2px solid #ccc', flexShrink: 0 }} />
<div>
<div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: 14 }}>💵 Cash on Delivery</div>
<div style={{ color: '#666', fontSize: 12 }}>Pay when your order arrives. No card needed.</div>
</div>
</button>
<button
onClick={() => setPayMethod('card')}
style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, border: payMethod === 'card' ? '2px solid #1a2e5a' : '1px solid #e5e7eb', backgroundColor: payMethod === 'card' ? '#f0f4ff' : '#fff', cursor: 'pointer', textAlign: 'left' }}
>
<div style={{ width: 20, height: 20, borderRadius: '50%', border: payMethod === 'card' ? '6px solid #1a2e5a' : '2px solid #ccc', flexShrink: 0 }} />
<div>
<div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: 14 }}>💳 Pay by Card</div>
<div style={{ color: '#666', fontSize: 12 }}>Secure card payment via RBC Plug & Pay.</div>
</div>
</button>
</div>
</div>

{/* PLACE ORDER */}
<button
onClick={placeOrder}
disabled={loading}
style={{ backgroundColor: loading ? '#94a3b8' : '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: 14, padding: '16px', fontWeight: 900, fontSize: 17, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 16px rgba(244,200,66,0.4)' }}
>
{loading ? 'Placing Order...' : `Place Order · BSD $${total.toFixed(2)}`}
</button>

<p style={{ textAlign: 'center', color: '#999', fontSize: 12, margin: 0 }}>
🔒 Your details are secure · 💬 Receipt sent to WhatsApp · 🇧🇸 Proudly Bahamian
</p>
</div>
)}
</div>
</div>
);
}
