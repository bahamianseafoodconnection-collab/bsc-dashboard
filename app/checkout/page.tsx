// ============================================================
// BSC MARKETPLACE — CHECKOUT PAGE
// File: app/checkout/page.tsx
// Route: /checkout
// Connects: /market (cart) → /api/payment/charge → confirmation
// ============================================================

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type CartItem = {
id: string;
name: string;
price: number;
quantity: number;
unit: string;
};

type PaymentMethod = 'card' | 'cash_on_delivery';

type CheckoutState = 'form' | 'processing' | 'success' | 'failed' | 'cod_pending';

export default function CheckoutPage() {
const router = useRouter();
const [cart, setCart] = useState<CartItem[]>([]);
const [state, setState] = useState<CheckoutState>('form');
const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
const [refNumber, setRefNumber] = useState('');
const [errorMessage, setErrorMessage] = useState('');

// Customer info
const [customerName, setCustomerName] = useState('');
const [customerPhone, setCustomerPhone] = useState('');
const [customerAddress, setCustomerAddress] = useState('');

// Card info (simulation — real tokenization comes with RBC keys)
const [cardNumber, setCardNumber] = useState('');
const [cardExpiry, setCardExpiry] = useState('');
const [cardCvv, setCardCvv] = useState('');

useEffect(() => {
try {
const stored = localStorage.getItem('bsc_cart');
if (stored) {
const parsed = JSON.parse(stored);
if (Array.isArray(parsed) && parsed.length > 0) {
setCart(parsed);
} else {
router.push('/market');
}
} else {
router.push('/market');
}
} catch {
router.push('/market');
}
}, [router]);

const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
const deliveryFee = subtotal >= 1000 ? 0 : 5.00;
const total = subtotal + deliveryFee;

function formatBSD(amount: number) {
return `BSD $${amount.toFixed(2)}`;
}

function generateSimToken() {
return `SIM-${cardNumber.slice(-4)}-${Date.now()}`;
}

function formatCardNumber(val: string) {
return val.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(val: string) {
const digits = val.replace(/\D/g, '').slice(0, 4);
if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
return digits;
}

function isFormValid() {
if (!customerName.trim() || !customerPhone.trim() || !customerAddress.trim()) return false;
if (paymentMethod === 'card') {
const digits = cardNumber.replace(/\s/g, '');
if (digits.length < 16 || cardExpiry.length < 5 || cardCvv.length < 3) return false;
}
return true;
}

async function handleSubmit() {
if (!isFormValid()) return;
setState('processing');
setErrorMessage('');

try {
if (paymentMethod === 'cash_on_delivery') {
// COD — create order in holding state, no charge API call
const res = await fetch('/api/orders/create', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
items: cart,
customerName,
customerPhone,
customerAddress,
paymentMethod: 'cash_on_delivery',
total,
}),
});

if (res.ok) {
const data = await res.json();
setRefNumber(data.orderId || 'BSC-COD-' + Date.now());
localStorage.removeItem('bsc_cart');
setState('cod_pending');
} else {
throw new Error('Order creation failed');
}
return;
}

// Card payment — create order first, then charge
const orderRes = await fetch('/api/orders/create', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
items: cart,
customerName,
customerPhone,
customerAddress,
paymentMethod: 'card',
total,
}),
});

if (!orderRes.ok) throw new Error('Order creation failed');
const orderData = await orderRes.json();
const orderId = orderData.orderId;

// Charge the card
const chargeRes = await fetch('/api/payment/charge', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
orderId,
amount: total,
cardToken: generateSimToken(),
customerName,
}),
});

const chargeData = await chargeRes.json();

if (chargeData.status === 'approved') {
setRefNumber(chargeData.ref);
localStorage.removeItem('bsc_cart');
setState('success');
} else if (chargeData.status === 'pending') {
setRefNumber(chargeData.ref);
setState('cod_pending');
} else {
setErrorMessage(chargeData.message || 'Card declined. Please try again.');
setState('failed');
}
} catch (err) {
console.error('Checkout error:', err);
setErrorMessage('Something went wrong. Please try again or call +1 (242) 361-3474.');
setState('failed');
}
}

// ── SUCCESS ──────────────────────────────────────────────
if (state === 'success') {
return (
<div style={styles.page}>
<div style={styles.resultCard}>
<div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
<h2 style={{ color: '#16a34a', marginBottom: 8 }}>Payment Approved</h2>
<p style={styles.refText}>Ref: {refNumber}</p>
<p style={styles.mutedText}>
Your order is confirmed and being prepared. BSC will contact you on{' '}
<strong>{customerPhone}</strong> with updates.
</p>
{subtotal >= 1000 && (
<p style={styles.deliveryNote}>
🚚 Free delivery included — order over BSD $1,000
</p>
)}
<button style={styles.btnPrimary} onClick={() => router.push('/market')}>
Continue Shopping
</button>
</div>
</div>
);
}

// ── COD / PENDING ────────────────────────────────────────
if (state === 'cod_pending') {
return (
<div style={styles.page}>
<div style={styles.resultCard}>
<div style={{ fontSize: 56, marginBottom: 16 }}>🕐</div>
<h2 style={{ color: '#d97706', marginBottom: 8 }}>Order Received — Pending Confirmation</h2>
<p style={styles.refText}>Ref: {refNumber}</p>
<p style={styles.mutedText}>
BSC will call <strong>{customerPhone}</strong> to confirm your order before
it is processed. Cash is due on delivery.
</p>
<p style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>
Questions? Call us: +1 (242) 361-3474
</p>
<button style={styles.btnPrimary} onClick={() => router.push('/market')}>
Back to Market
</button>
</div>
</div>
);
}

// ── FAILED ───────────────────────────────────────────────
if (state === 'failed') {
return (
<div style={styles.page}>
<div style={styles.resultCard}>
<div style={{ fontSize: 56, marginBottom: 16 }}>❌</div>
<h2 style={{ color: '#dc2626', marginBottom: 8 }}>Payment Failed</h2>
<p style={styles.mutedText}>{errorMessage}</p>
<button style={styles.btnPrimary} onClick={() => setState('form')}>
Try Again
</button>
<button style={styles.btnSecondary} onClick={() => router.push('/market')}>
Back to Market
</button>
</div>
</div>
);
}

// ── PROCESSING ───────────────────────────────────────────
if (state === 'processing') {
return (
<div style={styles.page}>
<div style={styles.resultCard}>
<div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
<h2 style={{ color: '#1e40af' }}>Processing Payment...</h2>
<p style={styles.mutedText}>Please do not close this page.</p>
</div>
</div>
);
}

// ── MAIN FORM ────────────────────────────────────────────
return (
<div style={styles.page}>
{/* Header */}
<div style={styles.header}>
<button style={styles.backBtn} onClick={() => router.push('/market')}>
← Back to Market
</button>
<h1 style={styles.headerTitle}>🛒 Checkout</h1>
</div>

<div style={styles.layout}>
{/* LEFT — Form */}
<div style={styles.formCol}>

{/* Customer Info */}
<div style={styles.section}>
<h3 style={styles.sectionTitle}>Your Information</h3>
<input
style={styles.input}
placeholder="Full Name *"
value={customerName}
onChange={(e) => setCustomerName(e.target.value)}
/>
<input
style={styles.input}
placeholder="Phone Number * (e.g. 242-555-1234)"
value={customerPhone}
onChange={(e) => setCustomerPhone(e.target.value)}
/>
<input
style={styles.input}
placeholder="Delivery Address *"
value={customerAddress}
onChange={(e) => setCustomerAddress(e.target.value)}
/>
</div>

{/* Payment Method */}
<div style={styles.section}>
<h3 style={styles.sectionTitle}>Payment Method</h3>
<div style={styles.methodRow}>
<button
style={{
...styles.methodBtn,
...(paymentMethod === 'card' ? styles.methodBtnActive : {}),
}}
onClick={() => setPaymentMethod('card')}
>
💳 Pay by Card
</button>
<button
style={{
...styles.methodBtn,
...(paymentMethod === 'cash_on_delivery' ? styles.methodBtnActive : {}),
}}
onClick={() => setPaymentMethod('cash_on_delivery')}
>
💵 Cash on Delivery
</button>
</div>
{paymentMethod === 'cash_on_delivery' && (
<p style={styles.codNotice}>
⚠️ BSC will call to confirm before processing your order.
</p>
)}
</div>

{/* Card Form */}
{paymentMethod === 'card' && (
<div style={styles.section}>
<h3 style={styles.sectionTitle}>Card Details</h3>
<p style={styles.simNotice}>🔒 Simulation mode — no real charge will occur</p>
<input
style={styles.input}
placeholder="Card Number"
value={cardNumber}
onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
maxLength={19}
/>
<div style={styles.cardRow}>
<input
style={{ ...styles.input, flex: 1 }}
placeholder="MM/YY"
value={cardExpiry}
onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
maxLength={5}
/>
<input
style={{ ...styles.input, flex: 1 }}
placeholder="CVV"
value={cardCvv}
onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
maxLength={4}
type="password"
/>
</div>
</div>
)}

{/* Submit */}
<button
style={{
...styles.submitBtn,
opacity: isFormValid() ? 1 : 0.5,
cursor: isFormValid() ? 'pointer' : 'not-allowed',
}}
onClick={handleSubmit}
disabled={!isFormValid()}
>
{paymentMethod === 'card'
? `Pay ${formatBSD(total)}`
: `Place COD Order — ${formatBSD(total)}`}
</button>
</div>

{/* RIGHT — Order Summary */}
<div style={styles.summaryCol}>
<div style={styles.summaryCard}>
<h3 style={styles.sectionTitle}>Order Summary</h3>
{cart.map((item) => (
<div key={item.id} style={styles.lineItem}>
<span style={styles.itemName}>
{item.name}{' '}
<span style={styles.itemQty}>× {item.quantity} {item.unit}</span>
</span>
<span style={styles.itemPrice}>
{formatBSD(item.price * item.quantity)}
</span>
</div>
))}
<div style={styles.divider} />
<div style={styles.lineItem}>
<span>Subtotal</span>
<span>{formatBSD(subtotal)}</span>
</div>
<div style={styles.lineItem}>
<span>Delivery</span>
<span style={{ color: deliveryFee === 0 ? '#16a34a' : 'inherit' }}>
{deliveryFee === 0 ? 'FREE' : formatBSD(deliveryFee)}
</span>
</div>
{deliveryFee === 0 && (
<p style={styles.freeDeliveryNote}>🚚 Free delivery on orders over BSD $1,000</p>
)}
<div style={styles.divider} />
<div style={{ ...styles.lineItem, fontWeight: 700, fontSize: 18 }}>
<span>Total</span>
<span style={{ color: '#1e40af' }}>{formatBSD(total)}</span>
</div>
</div>

<div style={styles.contactCard}>
<p style={styles.contactText}>
Need help? Call us:<br />
<strong>+1 (242) 361-3474</strong>
</p>
</div>
</div>
</div>
</div>
);
}

// ── STYLES ───────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
page: {
minHeight: '100vh',
backgroundColor: '#f8fafc',
fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
paddingBottom: 60,
},
header: {
backgroundColor: '#1e3a5f',
padding: '16px 24px',
display: 'flex',
alignItems: 'center',
gap: 20,
},
headerTitle: {
color: '#ffffff',
fontSize: 22,
fontWeight: 700,
margin: 0,
},
backBtn: {
background: 'none',
border: '1px solid rgba(255,255,255,0.4)',
color: '#ffffff',
padding: '6px 14px',
borderRadius: 6,
cursor: 'pointer',
fontSize: 14,
},
layout: {
maxWidth: 1100,
margin: '32px auto',
padding: '0 20px',
display: 'flex',
gap: 32,
alignItems: 'flex-start',
flexWrap: 'wrap',
},
formCol: {
flex: 2,
minWidth: 300,
display: 'flex',
flexDirection: 'column',
gap: 20,
},
summaryCol: {
flex: 1,
minWidth: 260,
display: 'flex',
flexDirection: 'column',
gap: 16,
},
section: {
backgroundColor: '#ffffff',
borderRadius: 12,
padding: 24,
boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
display: 'flex',
flexDirection: 'column',
gap: 12,
},
sectionTitle: {
fontSize: 16,
fontWeight: 700,
color: '#1e3a5f',
margin: '0 0 4px 0',
},
input: {
padding: '12px 14px',
borderRadius: 8,
border: '1px solid #d1d5db',
fontSize: 15,
outline: 'none',
width: '100%',
boxSizing: 'border-box',
},
cardRow: {
display: 'flex',
gap: 12,
},
methodRow: {
display: 'flex',
gap: 12,
flexWrap: 'wrap',
},
methodBtn: {
flex: 1,
padding: '12px 16px',
borderRadius: 8,
border: '2px solid #d1d5db',
backgroundColor: '#ffffff',
fontSize: 15,
cursor: 'pointer',
fontWeight: 600,
color: '#374151',
minWidth: 140,
},
methodBtnActive: {
borderColor: '#1e40af',
backgroundColor: '#eff6ff',
color: '#1e40af',
},
codNotice: {
backgroundColor: '#fef9c3',
border: '1px solid #fde047',
borderRadius: 8,
padding: '10px 14px',
fontSize: 14,
color: '#713f12',
margin: 0,
},
simNotice: {
backgroundColor: '#f0fdf4',
border: '1px solid #86efac',
borderRadius: 8,
padding: '8px 14px',
fontSize: 13,
color: '#166534',
margin: 0,
},
submitBtn: {
backgroundColor: '#1e40af',
color: '#ffffff',
border: 'none',
borderRadius: 10,
padding: '16px 24px',
fontSize: 18,
fontWeight: 700,
cursor: 'pointer',
width: '100%',
},
summaryCard: {
backgroundColor: '#ffffff',
borderRadius: 12,
padding: 24,
boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
display: 'flex',
flexDirection: 'column',
gap: 10,
},
lineItem: {
display: 'flex',
justifyContent: 'space-between',
alignItems: 'center',
fontSize: 15,
color: '#374151',
},
itemName: {
flex: 1,
paddingRight: 8,
fontSize: 14,
},
itemQty: {
color: '#6b7280',
fontWeight: 400,
},
itemPrice: {
fontWeight: 600,
whiteSpace: 'nowrap',
},
divider: {
borderTop: '1px solid #e5e7eb',
margin: '4px 0',
},
freeDeliveryNote: {
fontSize: 12,
color: '#16a34a',
margin: 0,
},
contactCard: {
backgroundColor: '#1e3a5f',
borderRadius: 12,
padding: 16,
textAlign: 'center',
},
contactText: {
color: '#ffffff',
fontSize: 14,
margin: 0,
lineHeight: 1.6,
},
resultCard: {
maxWidth: 480,
margin: '80px auto',
backgroundColor: '#ffffff',
borderRadius: 16,
padding: 40,
textAlign: 'center',
boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
display: 'flex',
flexDirection: 'column',
gap: 16,
alignItems: 'center',
},
refText: {
fontSize: 14,
color: '#6b7280',
fontFamily: 'monospace',
backgroundColor: '#f3f4f6',
padding: '6px 16px',
borderRadius: 6,
margin: 0,
},
mutedText: {
color: '#4b5563',
fontSize: 15,
lineHeight: 1.6,
margin: 0,
},
deliveryNote: {
color: '#16a34a',
fontSize: 14,
margin: 0,
},
btnPrimary: {
backgroundColor: '#1e40af',
color: '#ffffff',
border: 'none',
borderRadius: 8,
padding: '12px 28px',
fontSize: 16,
fontWeight: 600,
cursor: 'pointer',
width: '100%',
},
btnSecondary: {
backgroundColor: '#f3f4f6',
color: '#374151',
border: 'none',
borderRadius: 8,
padding: '12px 28px',
fontSize: 16,
fontWeight: 600,
cursor: 'pointer',
width: '100%',
},
};
