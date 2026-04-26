// File: app/market/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { products, type Product } from "../../lib/store";
import { recordSaleFinancials } from "../../lib/finance";

const supabase = createClient(
"https://auqjjrisivhfmpleusyt.supabase.co",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg"
);

const DELIVERY_FEE = 15;
const RETAIL_MARKUP = 1.25;
const WHOLESALE_MARKUP = 1.12;

const BAHAMAS_ISLANDS = [
"New Providence (Nassau)", "Grand Bahama (Freeport)", "Abaco", "Eleuthera",
"Exuma", "Andros", "Long Island", "Cat Island", "San Salvador", "Bimini",
"Berry Islands", "Harbour Island", "Spanish Wells", "Acklins", "Crooked Island",
"Mayaguana", "Inagua", "Ragged Island",
];

const MAILBOATS: Record<string, string[]> = {
"Abaco": ["Marsh Harbour Express", "Legacy"],
"Eleuthera": ["Current Pride", "Bahamas Daybreak III"],
"Exuma": ["Grand Master", "Exuma Express"],
"Andros": ["Lady Rosalind", "Lester Rolle"],
"Long Island": ["Sherice M", "Long Island Express"],
"Cat Island": ["Sea Hauler", "New Island Trader"],
"San Salvador": ["Lady Frances"],
"Bimini": ["Bimini Express"],
"Berry Islands": ["Champion II"],
"Harbour Island": ["Current Pride"],
"Spanish Wells": ["Current Pride"],
"Acklins": ["Lady Muriel"],
"Crooked Island": ["Lady Muriel"],
"Mayaguana": ["Lady Muriel"],
"Inagua": ["Lady Mathew"],
"Ragged Island": ["Lady Muriel"],
"Grand Bahama (Freeport)": ["Grand Bahama IV"],
};

type CartItem = { product: Product; qty: number };
type View = "home" | "shop" | "cart" | "login" | "register" | "checkout" | "orders" | "profile";
type AuthUser = { id: string; name: string; phone: string; email: string };
type Order = { id: string; order_number: string; status: string; payment_status: string; subtotal: number; delivery_fee: number; total: number; delivery_type: string; delivery_address: string; delivery_notes: string; created_at: string; customer_name: string; customer_phone: string; };

const STATUS_INFO: Record<string, { label: string; color: string; icon: string; bg: string }> = {
pending: { label: 'Order Received', color: '#f5c518', icon: '⏳', bg: '#1a1400' },
confirmed: { label: 'Payment Confirmed', color: '#60a5fa', icon: '✅', bg: '#001a2a' },
packing: { label: 'Packing Your Order', color: '#a78bfa', icon: '📦', bg: '#1a0a2a' },
out_for_delivery: { label: 'Out for Delivery', color: '#4ade80', icon: '🚚', bg: '#0a1f0a' },
delivered: { label: 'Delivered', color: '#4ade80', icon: '✅', bg: '#0a1f0a' },
ready_pickup: { label: 'Ready for Pickup', color: '#4ade80', icon: '🏪', bg: '#0a1f0a' },
cancelled: { label: 'Cancelled', color: '#f87171', icon: '❌', bg: '#2d0000' },
};

const CATEGORIES = [
{ id: 'all', label: 'All Products', icon: '🛍️' },
{ id: 'seafood', label: 'Seafood', icon: '🐟' },
{ id: 'poultry', label: 'Poultry', icon: '🍗' },
{ id: 'meat', label: 'Meats', icon: '🥩' },
];

export default function MarketPage() {
const router = useRouter();
const [view, setView] = useState<View>("home");
const [cartType] = useState<"retail" | "wholesale">("retail");
const [cart, setCart] = useState<CartItem[]>([]);
const [search, setSearch] = useState("");
const [activeCategory, setActiveCategory] = useState("all");
const [loading, setLoading] = useState(false);
const [user, setUser] = useState<AuthUser | null>(null);
const [checkingAuth, setCheckingAuth] = useState(true);
const [isControlAdmin, setIsControlAdmin] = useState(false);
const [supplierProducts, setSupplierProducts] = useState<any[]>([]);
const [myOrders, setMyOrders] = useState<Order[]>([]);
const [ordersLoading, setOrdersLoading] = useState(false);

const [authName, setAuthName] = useState("");
const [authPhone, setAuthPhone] = useState("");
const [authEmail, setAuthEmail] = useState("");
const [authPassword, setAuthPassword] = useState("");
const [showPw, setShowPw] = useState(false);
const [authError, setAuthError] = useState("");

const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
const [address, setAddress] = useState("");
const [island, setIsland] = useState("New Providence (Nassau)");
const [mailboat, setMailboat] = useState("");
const [pickupDate, setPickupDate] = useState("");
const [deliveryNotes, setDeliveryNotes] = useState("");
const [checkoutError, setCheckoutError] = useState("");

const [editName, setEditName] = useState("");
const [editPhone, setEditPhone] = useState("");
const [profileSaved, setProfileSaved] = useState(false);

const markup = cartType === "retail" ? RETAIL_MARKUP : WHOLESALE_MARKUP;
const cartCount = cart.reduce((sum, c) => sum + c.qty, 0);
const cartSubtotal = cart.reduce((sum, c) => sum + c.product.price * markup * c.qty, 0);
const deliveryCharge = fulfillment === "delivery" ? DELIVERY_FEE : 0;
const cartTotal = cartSubtotal + deliveryCharge;
const isOutIsland = island !== "New Providence (Nassau)" && island !== "Grand Bahama (Freeport)";
const availableMailboats = MAILBOATS[island] || [];

useEffect(() => {
checkSession();
loadSupplierProducts();
}, []);

async function checkSession() {
try {
// Use getSession() for reliability with existing sessions
const { data: { session } } = await supabase.auth.getSession();
const u = session?.user;
if (u) {
const { data: profile } = await supabase.from('profiles').select('role').eq('id', u.id).single();
if (profile?.role && ['control_admin', 'basic_admin', 'manager', 'cashier'].includes(profile.role)) {
// Staff blocked from shopping — but control_admin sees the back button
if (profile.role === 'control_admin') setIsControlAdmin(true);
setCheckingAuth(false);
return;
}
const meta = u.user_metadata;
setUser({ id: u.id, name: meta?.name || u.email || '', phone: meta?.phone || '', email: u.email || '' });
setEditName(meta?.name || '');
setEditPhone(meta?.phone || '');
}
} catch (e) {}
setCheckingAuth(false);
}

async function loadSupplierProducts() {
try {
const { data } = await supabase.from('supplier_products').select('*').eq('status', 'approved');
if (data) setSupplierProducts(data);
} catch (e) {}
}

async function loadMyOrders() {
if (!user) return;
setOrdersLoading(true);
try {
const { data } = await supabase.from('orders').select('*').eq('customer_id', user.id).order('created_at', { ascending: false });
if (data) setMyOrders(data);
} catch (e) {}
setOrdersLoading(false);
}

async function handleRegister() {
setAuthError("");
if (!authName || !authPhone || !authEmail || !authPassword) { setAuthError("All fields required"); return; }
if (authPassword.length < 6) { setAuthError("Password must be at least 6 characters"); return; }
setLoading(true);
const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword, options: { data: { name: authName, phone: authPhone } } });
if (error) { setAuthError(error.message); setLoading(false); return; }
if (data.user) { setUser({ id: data.user.id, name: authName, phone: authPhone, email: authEmail }); setEditName(authName); setEditPhone(authPhone); }
setLoading(false);
setView("home");
}

async function handleLogin() {
setAuthError("");
if (!authEmail || !authPassword) { setAuthError("Email and password required"); return; }
setLoading(true);
const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
if (error) { setAuthError("Invalid email or password"); setLoading(false); return; }
const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
if (profile?.role && ['control_admin', 'basic_admin', 'manager', 'cashier'].includes(profile.role)) {
setAuthError("Staff accounts cannot shop here. Use the dashboard.");
await supabase.auth.signOut();
setLoading(false);
return;
}
const meta = data.user.user_metadata;
setUser({ id: data.user.id, name: meta?.name || authEmail, phone: meta?.phone || '', email: authEmail });
setEditName(meta?.name || ''); setEditPhone(meta?.phone || '');
setLoading(false);
setView("home");
}

async function handlePlaceOrder() {
setCheckoutError("");
if (fulfillment === "delivery" && !address.trim()) { setCheckoutError("Enter your delivery address"); return; }
if (fulfillment === "delivery" && isOutIsland && !mailboat) { setCheckoutError("Select your mailboat"); return; }
if (fulfillment === "pickup" && !pickupDate) { setCheckoutError("Select a pickup date"); return; }
setLoading(true);
const orderItems = cart.map(c => ({ productId: c.product.id, productName: c.product.name, price: parseFloat((c.product.price * markup).toFixed(2)), qty: c.qty, total: parseFloat((c.product.price * markup * c.qty).toFixed(2)), supplierName: c.product.supplierName, image: c.product.image }));
const orderNumber = 'BSC-' + Date.now().toString().slice(-6);
const { error } = await supabase.from('orders').insert({ order_number: orderNumber, customer_id: user!.id, customer_name: user!.name, customer_phone: user!.phone, status: 'pending', payment_status: 'unpaid', payment_method: 'online', subtotal: parseFloat(cartSubtotal.toFixed(2)), tax: 0, delivery_fee: deliveryCharge, total: parseFloat(cartTotal.toFixed(2)), delivery_type: fulfillment, delivery_address: fulfillment === 'delivery' ? address + ', ' + island + (mailboat ? ' via ' + mailboat : '') : 'Pickup: ' + pickupDate, delivery_notes: deliveryNotes, can_fulfill: true, items: orderItems });
if (error) { setCheckoutError("Order failed: " + error.message); setLoading(false); return; }
await recordSaleFinancials(cartTotal);
setCart([]);
setLoading(false);
setView("orders");
await loadMyOrders();
}

async function handleProfileSave() {
if (!user) return;
setLoading(true);
await supabase.auth.updateUser({ data: { name: editName, phone: editPhone } });
setUser(prev => prev ? { ...prev, name: editName, phone: editPhone } : prev);
setProfileSaved(true);
setLoading(false);
setTimeout(() => setProfileSaved(false), 2000);
}

function addToCart(product: Product) {
setCart(prev => { const ex = prev.find(c => c.product.id === product.id); return ex ? prev.map(c => c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c) : [...prev, { product, qty: 1 }]; });
}

function adjustQty(id: string, delta: number) {
setCart(prev => prev.map(c => c.product.id === id ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0));
}

const allProducts = [
...products.filter(p => p.stock > p.minStock),
...supplierProducts.map(sp => ({ id: sp.id, name: sp.name, price: sp.retail_price / markup, stock: 999, minStock: 0, category: sp.category, supplierName: sp.supplier_name, image: sp.photo_url || 'https://images.unsplash.com/photo-1534482421-64566f976cfa?w=400&q=80', description: sp.name + ' from ' + sp.supplier_name }))
].filter(p => (activeCategory === 'all' || p.category === activeCategory) && p.name.toLowerCase().includes(search.toLowerCase()));

const pg: React.CSSProperties = { backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: "'Inter', sans-serif", paddingBottom: 100 };
const inp: React.CSSProperties = { display: 'block', width: '100%', padding: '13px 14px', borderRadius: 12, backgroundColor: '#0d1f3c', color: '#fff', border: '1px solid #1e3a5f', fontSize: 15, marginBottom: 12, boxSizing: 'border-box' as const, outline: 'none' };
const lbl: React.CSSProperties = { display: 'block', color: '#6b7280', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 6 };
const primaryBtn: React.CSSProperties = { width: '100%', padding: '14px', borderRadius: 12, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', fontSize: 15, cursor: 'pointer', marginBottom: 10 };
const ghostBtn: React.CSSProperties = { width: '100%', padding: '12px', borderRadius: 12, backgroundColor: 'transparent', color: '#6b7280', border: '1px solid #1e3a5f', fontSize: 14, cursor: 'pointer', marginBottom: 10 };

if (checkingAuth) return (
<div style={{ ...pg, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
<div style={{ textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 12 }}>🐟</div><p style={{ color: '#4a5568' }}>Loading BSC Market...</p></div>
</div>
);

// ── CONTROL ADMIN BANNER — shown only to Dedrick across all market views ──
const AdminBanner = () => isControlAdmin ? (
<div style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', borderBottom: '1px solid #f5c518', padding: '8px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
<p style={{ margin: 0, color: '#f5c518', fontSize: 11, fontWeight: 'bold' }}>👑 Viewing as Control Admin</p>
<button onClick={() => router.push('/')} style={{ background: 'none', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 'bold', fontSize: 11, cursor: 'pointer', padding: '4px 12px' }}>
← BSC Control
</button>
</div>
) : null;

// ── HEADER ──
const Header = () => (
<div style={{ background: 'linear-gradient(135deg, #060d1f, #0d1f3c)', borderBottom: '1px solid #1e3a5f', padding: '14px 18px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 640, margin: '0 auto' }}>
<button onClick={() => setView('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 18 }}>🐟 BSC Market</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>Fresh · Local · Bahamian</p>
</button>
<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
{cartCount > 0 && (
<button onClick={() => setView('cart')} style={{ padding: '8px 14px', borderRadius: 20, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 13 }}>
🛒 {cartCount}
</button>
)}
{user ? (
<button onClick={() => setView('profile')} style={{ width: 38, height: 38, borderRadius: '50%', backgroundColor: '#0d1f3c', border: '2px solid #f5c518', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</button>
) : (
<button onClick={() => setView('login')} style={{ padding: '8px 14px', borderRadius: 20, backgroundColor: '#0d1f3c', color: '#f5c518', border: '1px solid #f5c518', cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>Login</button>
)}
</div>
</div>
</div>
);

// ── HOME ──
if (view === 'home') return (
<div style={pg}>
<AdminBanner />
<Header />
<div style={{ maxWidth: 640, margin: '0 auto', padding: '0 0 20px' }}>
<div style={{ position: 'relative', overflow: 'hidden', height: 220 }}>
<img src="https://images.unsplash.com/photo-1534482421-64566f976cfa?w=800&q=80" alt="Fresh Seafood" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
<div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(6,13,31,0.3), rgba(6,13,31,0.85))' }} />
<div style={{ position: 'absolute', bottom: 24, left: 20, right: 20 }}>
<p style={{ margin: 0, color: '#f5c518', fontSize: 11, letterSpacing: 2, fontWeight: 'bold' }}>BAHAMIAN SEAFOOD CONNECTION</p>
<p style={{ margin: '6px 0 4px', color: '#fff', fontWeight: 'bold', fontSize: 24, lineHeight: 1.2 }}>Fresh From Our Waters<br/>To Your Table</p>
<p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Firetrial Road, Nassau · Delivery across the Bahamas</p>
</div>
</div>
{user && (
<div style={{ margin: '16px 18px 0', backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<div>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 14 }}>Welcome back, {user.name.split(' ')[0]}! 👋</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 12 }}>Ready to shop fresh today?</p>
</div>
<button onClick={() => { setView('orders'); loadMyOrders(); }} style={{ padding: '7px 12px', borderRadius: 10, backgroundColor: '#0d2b14', color: '#4ade80', border: '1px solid #4ade80', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>My Orders</button>
</div>
)}
<div style={{ padding: '20px 18px 0' }}>
<p style={{ margin: '0 0 12px', color: '#f5c518', fontWeight: 'bold', fontSize: 15 }}>Shop by Category</p>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
{CATEGORIES.map(cat => (
<button key={cat.id} onClick={() => { setActiveCategory(cat.id); setView('shop'); }} style={{ padding: '14px 8px', borderRadius: 14, backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', cursor: 'pointer', textAlign: 'center' as const }}>
<p style={{ margin: '0 0 6px', fontSize: 26 }}>{cat.icon}</p>
<p style={{ margin: 0, color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{cat.label}</p>
</button>
))}
</div>
<p style={{ margin: '0 0 12px', color: '#f5c518', fontWeight: 'bold', fontSize: 15 }}>Fresh Today</p>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
{products.filter(p => p.stock > p.minStock).slice(0, 4).map(product => {
const displayPrice = product.price * markup;
const inCart = cart.find(c => c.product.id === product.id);
return (
<div key={product.id} style={{ backgroundColor: '#0d1f3c', borderRadius: 16, overflow: 'hidden', border: '1px solid #1e3a5f' }}>
<div style={{ position: 'relative', height: 130 }}>
<img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
<div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent, rgba(6,13,31,0.6))' }} />
</div>
<div style={{ padding: '10px 12px' }}>
<p style={{ margin: '0 0 2px', fontWeight: 'bold', fontSize: 13 }}>{product.name}</p>
<p style={{ margin: '0 0 8px', color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>${displayPrice.toFixed(2)}</p>
{inCart ? (
<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
<button onClick={() => adjustQty(product.id, -1)} style={{ flex: 1, padding: '6px', borderRadius: 8, backgroundColor: '#1e3a5f', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 'bold' }}>−</button>
<span style={{ fontWeight: 'bold', fontSize: 14 }}>{inCart.qty}</span>
<button onClick={() => adjustQty(product.id, 1)} style={{ flex: 1, padding: '6px', borderRadius: 8, backgroundColor: '#f5c518', color: '#000', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 'bold' }}>+</button>
</div>
) : (
<button onClick={() => addToCart(product)} style={{ width: '100%', padding: '7px', borderRadius: 8, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 13 }}>Add to Cart</button>
)}
</div>
</div>
);
})}
</div>
<button onClick={() => { setActiveCategory('all'); setView('shop'); }} style={primaryBtn}>View All Products →</button>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 8 }}>
{[{ icon: '🚚', title: 'Island Delivery', desc: 'All Bahamas islands' }, { icon: '❄️', title: 'Fresh & Frozen', desc: 'Cold chain guaranteed' }, { icon: '🐟', title: 'Local & Fresh', desc: 'Caught locally' }].map(info => (
<div key={info.title} style={{ backgroundColor: '#0d1f3c', borderRadius: 12, padding: '14px 10px', textAlign: 'center' as const, border: '1px solid #1e3a5f' }}>
<p style={{ margin: '0 0 4px', fontSize: 22 }}>{info.icon}</p>
<p style={{ margin: '0 0 2px', color: '#fff', fontWeight: 'bold', fontSize: 11 }}>{info.title}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>{info.desc}</p>
</div>
))}
</div>
</div>
</div>
{cartCount > 0 && (
<div style={{ position: 'fixed', bottom: 70, left: 0, right: 0, padding: '12px 18px', zIndex: 40 }}>
<div style={{ maxWidth: 640, margin: '0 auto' }}>
<button onClick={() => setView('cart')} style={{ ...primaryBtn, marginBottom: 0, boxShadow: '0 8px 32px rgba(245,197,24,0.3)' }}>🛒 View Cart · {cartCount} items · ${cartSubtotal.toFixed(2)}</button>
</div>
</div>
)}
</div>
);

// ── SHOP ──
if (view === 'shop') return (
<div style={pg}>
<AdminBanner />
<Header />
<div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 18px' }}>
<div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
<input placeholder="🔍 Search products..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inp, marginBottom: 0, flex: 1 }} />
</div>
<div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' as const }}>
{CATEGORIES.map(cat => (
<button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{ padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' as const, flexShrink: 0, backgroundColor: activeCategory === cat.id ? '#f5c518' : '#0d1f3c', color: activeCategory === cat.id ? '#000' : '#6b7280' }}>
{cat.icon} {cat.label}
</button>
))}
</div>
{allProducts.length === 0 && <div style={{ textAlign: 'center', padding: 40 }}><p style={{ fontSize: 40 }}>🔍</p><p style={{ color: '#4a5568' }}>No products found</p></div>}
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
{allProducts.map(product => {
const displayPrice = product.price * markup;
const inCart = cart.find(c => c.product.id === product.id);
return (
<div key={product.id} style={{ backgroundColor: '#0d1f3c', borderRadius: 16, overflow: 'hidden', border: '1px solid #1e3a5f' }}>
<div style={{ position: 'relative', height: 140 }}>
<img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
<div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(6,13,31,0.7))' }} />
<div style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(6,13,31,0.8)', borderRadius: 20, padding: '3px 8px' }}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 12 }}>${displayPrice.toFixed(2)}</p>
</div>
</div>
<div style={{ padding: '10px 12px' }}>
<p style={{ margin: '0 0 2px', fontWeight: 'bold', fontSize: 13 }}>{product.name}</p>
<p style={{ margin: '0 0 8px', color: '#4a5568', fontSize: 10, lineHeight: 1.4 }}>{(product as any).description?.slice(0, 50)}...</p>
{inCart ? (
<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
<button onClick={() => adjustQty(product.id, -1)} style={{ flex: 1, padding: '7px', borderRadius: 8, backgroundColor: '#1e3a5f', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 'bold' }}>−</button>
<span style={{ fontWeight: 'bold', fontSize: 14, minWidth: 20, textAlign: 'center' as const }}>{inCart.qty}</span>
<button onClick={() => adjustQty(product.id, 1)} style={{ flex: 1, padding: '7px', borderRadius: 8, backgroundColor: '#f5c518', color: '#000', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 'bold' }}>+</button>
</div>
) : (
<button onClick={() => addToCart(product as Product)} style={{ width: '100%', padding: '8px', borderRadius: 8, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 13 }}>Add to Cart</button>
)}
</div>
</div>
);
})}
</div>
</div>
{cartCount > 0 && (
<div style={{ position: 'fixed', bottom: 70, left: 0, right: 0, padding: '12px 18px', zIndex: 40 }}>
<div style={{ maxWidth: 640, margin: '0 auto' }}>
<button onClick={() => setView('cart')} style={{ ...primaryBtn, marginBottom: 0, boxShadow: '0 8px 32px rgba(245,197,24,0.3)' }}>🛒 View Cart · {cartCount} items · ${cartSubtotal.toFixed(2)}</button>
</div>
</div>
)}
</div>
);

// ── LOGIN ──
if (view === 'login') return (
<div style={pg}>
<AdminBanner />
<Header />
<div style={{ maxWidth: 420, margin: '0 auto', padding: '30px 18px' }}>
<div style={{ textAlign: 'center', marginBottom: 28 }}>
<p style={{ fontSize: 48, margin: '0 0 10px' }}>👋</p>
<h2 style={{ margin: '0 0 6px', color: '#f5c518', fontSize: 22 }}>Welcome Back</h2>
<p style={{ margin: 0, color: '#4a5568', fontSize: 14 }}>Sign in to your BSC Market account</p>
</div>
<label style={lbl}>Email</label>
<input type="email" placeholder="your@email.com" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} style={inp} />
<label style={lbl}>Password</label>
<div style={{ position: 'relative', marginBottom: 12 }}>
<input type={showPw ? 'text' : 'password'} placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} style={{ ...inp, marginBottom: 0, paddingRight: 46 }} />
<button onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>{showPw ? '🙈' : '👁'}</button>
</div>
{authError && <p style={{ color: '#f87171', fontSize: 13, backgroundColor: '#2d0000', padding: '10px 12px', borderRadius: 8, marginBottom: 12 }}>{authError}</p>}
<button onClick={handleLogin} disabled={loading} style={{ ...primaryBtn, backgroundColor: loading ? '#555' : '#f5c518', cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Signing in...' : 'Sign In'}</button>
<button onClick={() => { setAuthError(''); setView('register'); }} style={ghostBtn}>New customer? Create account</button>
<button onClick={() => setView('home')} style={{ ...ghostBtn, marginBottom: 0 }}>← Back to Market</button>
</div>
</div>
);

// ── REGISTER ──
if (view === 'register') return (
<div style={pg}>
<AdminBanner />
<Header />
<div style={{ maxWidth: 420, margin: '0 auto', padding: '30px 18px' }}>
<div style={{ textAlign: 'center', marginBottom: 28 }}>
<p style={{ fontSize: 48, margin: '0 0 10px' }}>🐟</p>
<h2 style={{ margin: '0 0 6px', color: '#f5c518', fontSize: 22 }}>Create Account</h2>
<p style={{ margin: 0, color: '#4a5568', fontSize: 14 }}>Join BSC Market for fresh Bahamian seafood</p>
</div>
<label style={lbl}>Full Name</label>
<input placeholder="Your full name" value={authName} onChange={(e) => setAuthName(e.target.value)} style={inp} />
<label style={lbl}>Phone / WhatsApp</label>
<input placeholder="242-xxx-xxxx" value={authPhone} onChange={(e) => setAuthPhone(e.target.value)} type="tel" style={inp} />
<label style={lbl}>Email</label>
<input type="email" placeholder="your@email.com" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} style={inp} />
<label style={lbl}>Password</label>
<div style={{ position: 'relative', marginBottom: 12 }}>
<input type={showPw ? 'text' : 'password'} placeholder="Min 6 characters" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} style={{ ...inp, marginBottom: 0, paddingRight: 46 }} />
<button onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>{showPw ? '🙈' : '👁'}</button>
</div>
{authError && <p style={{ color: '#f87171', fontSize: 13, backgroundColor: '#2d0000', padding: '10px 12px', borderRadius: 8, marginBottom: 12 }}>{authError}</p>}
<button onClick={handleRegister} disabled={loading} style={{ ...primaryBtn, backgroundColor: loading ? '#555' : '#f5c518', cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Creating Account...' : 'Create Account'}</button>
<button onClick={() => { setAuthError(''); setView('login'); }} style={ghostBtn}>Already have an account? Sign in</button>
<button onClick={() => setView('home')} style={{ ...ghostBtn, marginBottom: 0 }}>← Back to Market</button>
</div>
</div>
);

// ── CART ──
if (view === 'cart') return (
<div style={pg}>
<AdminBanner />
<Header />
<div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 18px' }}>
<h2 style={{ margin: '0 0 16px', color: '#f5c518', fontSize: 20 }}>🛒 Your Cart</h2>
{!user && (
<div style={{ backgroundColor: '#1a1400', border: '1px solid #f5c518', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
<p style={{ margin: '0 0 8px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Sign in to place your order</p>
<p style={{ margin: '0 0 10px', color: '#6b7280', fontSize: 13 }}>Create a free account to track your orders and save your details.</p>
<div style={{ display: 'flex', gap: 8 }}>
<button onClick={() => setView('login')} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 13 }}>Sign In</button>
<button onClick={() => setView('register')} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: 'transparent', color: '#f5c518', border: '1px solid #f5c518', cursor: 'pointer', fontSize: 13 }}>Register</button>
</div>
</div>
)}
{cart.length === 0 ? (
<div style={{ textAlign: 'center', padding: 40 }}>
<p style={{ fontSize: 48, marginBottom: 12 }}>🛒</p>
<p style={{ color: '#4a5568', marginBottom: 16 }}>Your cart is empty</p>
<button onClick={() => setView('shop')} style={primaryBtn}>Start Shopping</button>
</div>
) : (
<>
{cart.map(c => (
<div key={c.product.id} style={{ backgroundColor: '#0d1f3c', borderRadius: 14, padding: '12px 14px', marginBottom: 10, border: '1px solid #1e3a5f', display: 'flex', gap: 12, alignItems: 'center' }}>
<img src={c.product.image} alt={c.product.name} style={{ width: 60, height: 60, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
<div style={{ flex: 1, minWidth: 0 }}>
<p style={{ margin: '0 0 2px', fontWeight: 'bold', fontSize: 14 }}>{c.product.name}</p>
<p style={{ margin: '0 0 8px', color: '#f5c518', fontSize: 13 }}>${(c.product.price * markup).toFixed(2)} each</p>
<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
<button onClick={() => adjustQty(c.product.id, -1)} style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#1e3a5f', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 'bold' }}>−</button>
<span style={{ fontWeight: 'bold', fontSize: 15 }}>{c.qty}</span>
<button onClick={() => adjustQty(c.product.id, 1)} style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#f5c518', color: '#000', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 'bold' }}>+</button>
</div>
</div>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 16, flexShrink: 0 }}>${(c.product.price * markup * c.qty).toFixed(2)}</p>
</div>
))}
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 14, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 16 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><p style={{ margin: 0, color: '#aaa', fontSize: 14 }}>Subtotal</p><p style={{ margin: 0, fontSize: 14 }}>${cartSubtotal.toFixed(2)}</p></div>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><p style={{ margin: 0, color: '#aaa', fontSize: 14 }}>Delivery</p><p style={{ margin: 0, color: '#f5c518', fontSize: 14 }}>+$15.00</p></div>
<div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #1e3a5f' }}><p style={{ margin: 0, fontWeight: 'bold', fontSize: 16 }}>Estimated Total</p><p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 18 }}>${(cartSubtotal + DELIVERY_FEE).toFixed(2)}</p></div>
</div>
<button onClick={() => { if (!user) { setView('login'); } else { setView('checkout'); } }} style={primaryBtn}>{user ? 'Proceed to Checkout →' : 'Sign In to Checkout →'}</button>
<button onClick={() => setView('shop')} style={ghostBtn}>← Continue Shopping</button>
</>
)}
</div>
</div>
);

// ── CHECKOUT ──
if (view === 'checkout') return (
<div style={pg}>
<AdminBanner />
<Header />
<div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 18px' }}>
<h2 style={{ margin: '0 0 4px', color: '#f5c518', fontSize: 20 }}>Checkout</h2>
<p style={{ margin: '0 0 20px', color: '#4a5568', fontSize: 13 }}>Placing order for {user?.name}</p>
<div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
<button onClick={() => setFulfillment('delivery')} style={{ flex: 1, padding: '14px', borderRadius: 12, backgroundColor: fulfillment === 'delivery' ? '#f5c518' : '#0d1f3c', color: fulfillment === 'delivery' ? '#000' : '#aaa', border: fulfillment === 'delivery' ? 'none' : '1px solid #1e3a5f', fontWeight: 'bold', fontSize: 14, cursor: 'pointer' }}>🚚 Delivery +$15</button>
<button onClick={() => setFulfillment('pickup')} style={{ flex: 1, padding: '14px', borderRadius: 12, backgroundColor: fulfillment === 'pickup' ? '#f5c518' : '#0d1f3c', color: fulfillment === 'pickup' ? '#000' : '#aaa', border: fulfillment === 'pickup' ? 'none' : '1px solid #1e3a5f', fontWeight: 'bold', fontSize: 14, cursor: 'pointer' }}>🏪 Pickup FREE</button>
</div>
{fulfillment === 'delivery' && (
<>
<label style={lbl}>Delivery Address</label>
<input placeholder="Street address, area..." value={address} onChange={(e) => setAddress(e.target.value)} style={inp} />
<label style={lbl}>Island</label>
<select value={island} onChange={(e) => { setIsland(e.target.value); setMailboat(''); }} style={inp}>{BAHAMAS_ISLANDS.map(isl => <option key={isl} value={isl}>{isl}</option>)}</select>
{isOutIsland && availableMailboats.length > 0 && (
<>
<label style={lbl}>Select Mailboat</label>
<select value={mailboat} onChange={(e) => setMailboat(e.target.value)} style={inp}><option value="">-- Select mailboat --</option>{availableMailboats.map(m => <option key={m} value={m}>{m}</option>)}</select>
<div style={{ backgroundColor: '#1a1400', border: '1px solid #f5c518', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}><p style={{ margin: 0, color: '#f5c518', fontSize: 12 }}>⚠️ Orders must be placed 48 hours before mailboat departure</p></div>
</>
)}
<label style={lbl}>Delivery Notes (optional)</label>
<input placeholder="Gate code, landmark, special instructions..." value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} style={inp} />
</>
)}
{fulfillment === 'pickup' && (
<>
<label style={lbl}>Pickup Date (Next Day Minimum)</label>
<input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} min={new Date(Date.now() + 86400000).toISOString().split('T')[0]} style={inp} />
<div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
<p style={{ margin: '0 0 4px', color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>📍 Pickup Location</p>
<p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>BSC Marketplace · Firetrial Road, Nassau, Bahamas</p>
</div>
</>
)}
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 14, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 16 }}>
<p style={{ margin: '0 0 12px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Order Summary</p>
{cart.map(c => (<div key={c.product.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{c.product.name} × {c.qty}</p><p style={{ margin: 0, fontSize: 13 }}>${(c.product.price * markup * c.qty).toFixed(2)}</p></div>))}
<div style={{ borderTop: '1px solid #1e3a5f', marginTop: 10, paddingTop: 10 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>Subtotal</p><p style={{ margin: 0, fontSize: 13 }}>${cartSubtotal.toFixed(2)}</p></div>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</p><p style={{ margin: 0, color: fulfillment === 'delivery' ? '#f5c518' : '#4ade80', fontSize: 13 }}>{fulfillment === 'delivery' ? '+$15.00' : 'FREE'}</p></div>
<div style={{ display: 'flex', justifyContent: 'space-between' }}><p style={{ margin: 0, fontWeight: 'bold', fontSize: 16 }}>Total</p><p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 18 }}>${cartTotal.toFixed(2)}</p></div>
</div>
</div>
<div style={{ backgroundColor: '#1a1400', border: '1px solid #f5c518', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
<p style={{ margin: '0 0 4px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>💳 Payment</p>
<p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>Payment will be collected upon delivery or pickup. BSC staff will confirm your order.</p>
</div>
{checkoutError && <p style={{ color: '#f87171', fontSize: 13, backgroundColor: '#2d0000', padding: '10px 12px', borderRadius: 8, marginBottom: 12 }}>{checkoutError}</p>}
<button onClick={handlePlaceOrder} disabled={loading} style={{ ...primaryBtn, backgroundColor: loading ? '#555' : '#f5c518', cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Placing Order...' : '✅ Place Order'}</button>
<button onClick={() => setView('cart')} style={ghostBtn}>← Back to Cart</button>
</div>
</div>
);

// ── ORDERS ──
if (view === 'orders') return (
<div style={pg}>
<AdminBanner />
<Header />
<div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 18px' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
<h2 style={{ margin: 0, color: '#f5c518', fontSize: 20 }}>📦 My Orders</h2>
<button onClick={loadMyOrders} style={{ background: 'none', border: '1px solid #1e3a5f', color: '#6b7280', fontSize: 12, cursor: 'pointer', padding: '6px 12px', borderRadius: 8 }}>Refresh</button>
</div>
{!user ? (
<div style={{ textAlign: 'center', padding: 40 }}><p style={{ fontSize: 40, marginBottom: 12 }}>🔐</p><p style={{ color: '#4a5568', marginBottom: 16 }}>Sign in to view your orders</p><button onClick={() => setView('login')} style={primaryBtn}>Sign In</button></div>
) : ordersLoading ? (
<div style={{ textAlign: 'center', padding: 40 }}><p style={{ color: '#4a5568' }}>Loading your orders...</p></div>
) : myOrders.length === 0 ? (
<div style={{ textAlign: 'center', padding: 40 }}><p style={{ fontSize: 48, marginBottom: 12 }}>📭</p><p style={{ color: '#4ade80', fontWeight: 'bold', marginBottom: 6 }}>No orders yet</p><p style={{ color: '#4a5568', marginBottom: 20 }}>Your orders will appear here after you shop.</p><button onClick={() => setView('shop')} style={primaryBtn}>Start Shopping</button></div>
) : myOrders.map(order => {
const statusInfo = STATUS_INFO[order.status] || STATUS_INFO['pending'];
return (
<div key={order.id} style={{ backgroundColor: '#0d1f3c', borderRadius: 16, padding: '16px', border: '1px solid #1e3a5f', marginBottom: 14 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
<div>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13, fontFamily: 'monospace' }}>{order.order_number}</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>{new Date(order.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
</div>
<div style={{ backgroundColor: statusInfo.bg, border: '1px solid ' + statusInfo.color, borderRadius: 20, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
<span style={{ fontSize: 12 }}>{statusInfo.icon}</span>
<span style={{ color: statusInfo.color, fontWeight: 'bold', fontSize: 11 }}>{statusInfo.label}</span>
</div>
</div>
<div style={{ marginBottom: 14 }}>
<div style={{ height: 3, backgroundColor: '#1e3a5f', borderRadius: 3, overflow: 'hidden' }}>
<div style={{ height: '100%', borderRadius: 3, backgroundColor: '#4ade80', width: order.status === 'pending' ? '10%' : order.status === 'confirmed' ? '30%' : order.status === 'packing' ? '55%' : order.status === 'out_for_delivery' ? '80%' : '100%', transition: 'width 0.5s' }} />
</div>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #1e3a5f' }}>
<div>
<p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>{order.delivery_type === 'delivery' ? '🚚 ' + order.delivery_address : '🏪 Pickup'}</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>Payment: <span style={{ color: order.payment_status === 'paid' ? '#4ade80' : '#f5c518' }}>{order.payment_status?.toUpperCase()}</span></p>
</div>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 18 }}>${Number(order.total).toFixed(2)}</p>
</div>
{order.status === 'delivered' && (
<div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 10, padding: '10px 12px' }}>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>✅ Order Delivered Successfully</p>
</div>
)}
</div>
);
})}
</div>
</div>
);

// ── PROFILE ──
if (view === 'profile') return (
<div style={pg}>
<AdminBanner />
<Header />
<div style={{ maxWidth: 420, margin: '0 auto', padding: '20px 18px' }}>
{!user ? (
<div style={{ textAlign: 'center', padding: 40 }}><button onClick={() => setView('login')} style={primaryBtn}>Sign In</button></div>
) : (
<>
<div style={{ textAlign: 'center', marginBottom: 24 }}>
<div style={{ width: 80, height: 80, borderRadius: '50%', backgroundColor: '#f5c518', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 'bold', color: '#000', margin: '0 auto 12px' }}>{user.name.charAt(0).toUpperCase()}</div>
<p style={{ margin: '0 0 2px', fontWeight: 'bold', fontSize: 18 }}>{user.name}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 13 }}>{user.email}</p>
</div>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 12, padding: '14px', border: '1px solid #1e3a5f', textAlign: 'center' as const }}><p style={{ margin: '0 0 4px', color: '#f5c518', fontWeight: 'bold', fontSize: 22 }}>{myOrders.length}</p><p style={{ margin: 0, color: '#4a5568', fontSize: 12 }}>Total Orders</p></div>
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 12, padding: '14px', border: '1px solid #1e3a5f', textAlign: 'center' as const }}><p style={{ margin: '0 0 4px', color: '#4ade80', fontWeight: 'bold', fontSize: 22 }}>${myOrders.reduce((s, o) => s + Number(o.total), 0).toFixed(0)}</p><p style={{ margin: 0, color: '#4a5568', fontSize: 12 }}>Total Spent</p></div>
</div>
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 16, padding: '16px', border: '1px solid #1e3a5f', marginBottom: 16 }}>
<p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Edit Profile</p>
<label style={lbl}>Full Name</label>
<input value={editName} onChange={(e) => setEditName(e.target.value)} style={inp} />
<label style={lbl}>Phone / WhatsApp</label>
<input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} type="tel" style={inp} />
<label style={lbl}>Email</label>
<input value={user.email} disabled style={{ ...inp, opacity: 0.5 }} />
{profileSaved && <p style={{ color: '#4ade80', fontSize: 13, marginBottom: 8 }}>✅ Profile saved!</p>}
<button onClick={handleProfileSave} disabled={loading} style={{ ...primaryBtn, marginBottom: 0 }}>{loading ? 'Saving...' : 'Save Changes'}</button>
</div>
<button onClick={() => { setView('orders'); loadMyOrders(); }} style={ghostBtn}>📦 View My Orders</button>
<button onClick={async () => { await supabase.auth.signOut(); setUser(null); setMyOrders([]); setView('home'); }} style={{ ...ghostBtn, color: '#f87171', borderColor: '#f87171' }}>Sign Out</button>
</>
)}
</div>
</div>
);

return null;
}

