// File: app/market/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { products, completeSale, saveCustomer, type Product } from "../../lib/store";
import { recordSaleFinancials } from "../../lib/finance";
import { createInvoice } from "../../lib/invoices";

const supabase = createClient(
"https://auqjjrisivhfmpleusyt.supabase.co",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg"
);

type CartItem = { product: Product; qty: number };

type Category =
| "home"
| "utility"
| "retail"
| "wholesale"
| "usa"
| "auto"
| "shop"
| "cart"
| "login"
| "checkout";

const CATEGORIES = [
{
id: "utility",
label: "Pay Utility Bill",
icon: "⚡",
color: "#60a5fa",
desc: "BEC, Water & Sewage, Cable, Internet",
},
{
id: "retail",
label: "Shop Local Retail",
icon: "🐟",
color: "#4ade80",
desc: "Fresh seafood, local products, everyday items",
},
{
id: "wholesale",
label: "Local Wholesale & Bulk",
icon: "📦",
color: "#f5c518",
desc: "Bulk orders for restaurants and businesses",
},
{
id: "usa",
label: "USA Bulk Import",
icon: "🇺🇸",
color: "#f87171",
desc: "Direct USA supplier bulk orders",
},
{
id: "auto",
label: "Auto & Car Parts",
icon: "🚗",
color: "#a78bfa",
desc: "Vehicle parts, accessories, and supplies",
},
];

export default function MarketPage() {
const router = useRouter();
const [view, setView] = useState<Category>("home");
const [cart, setCart] = useState<CartItem[]>([]);
const [search, setSearch] = useState("");
const [loading, setLoading] = useState(false);
const [status, setStatus] = useState("");

// AUTH STATE
const [user, setUser] = useState<{ name: string; phone: string; email: string } | null>(null);
const [authView, setAuthView] = useState<"login" | "register">("login");
const [authName, setAuthName] = useState("");
const [authPhone, setAuthPhone] = useState("");
const [authEmail, setAuthEmail] = useState("");
const [authPassword, setAuthPassword] = useState("");
const [authError, setAuthError] = useState("");

const cartCount = cart.reduce((sum, c) => sum + c.qty, 0);
const cartTotal = cart.reduce((sum, c) => sum + c.product.price * c.qty, 0);

// FILTER PRODUCTS BY CATEGORY
const categoryProducts = products.filter((p) => p.stock > p.minStock);
const filtered = categoryProducts.filter((p) =>
p.name.toLowerCase().includes(search.toLowerCase())
);

function addToCart(product: Product) {
const existing = cart.find((c) => c.product.id === product.id);
if (existing) {
setCart(cart.map((c) =>
c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c
));
} else {
setCart([...cart, { product, qty: 1 }]);
}
}

function adjustQty(id: string, delta: number) {
setCart(
cart
.map((c) => c.product.id === id ? { ...c, qty: c.qty + delta } : c)
.filter((c) => c.qty > 0)
);
}

function removeFromCart(id: string) {
setCart(cart.filter((c) => c.product.id !== id));
}

// AUTH HANDLERS
async function handleRegister() {
setAuthError("");
if (!authName || !authPhone || !authEmail || !authPassword) {
setAuthError("All fields required");
return;
}
setLoading(true);
const { error } = await supabase.auth.signUp({
email: authEmail,
password: authPassword,
options: { data: { name: authName, phone: authPhone } },
});
if (error) {
setAuthError(error.message);
setLoading(false);
return;
}
setUser({ name: authName, phone: authPhone, email: authEmail });
setLoading(false);
setView("home");
}

async function handleLogin() {
setAuthError("");
if (!authEmail || !authPassword) {
setAuthError("Email and password required");
return;
}
setLoading(true);
const { data, error } = await supabase.auth.signInWithPassword({
email: authEmail,
password: authPassword,
});
if (error) {
setAuthError(error.message);
setLoading(false);
return;
}
const meta = data.user?.user_metadata;
setUser({
name: meta?.name || authEmail,
phone: meta?.phone || "",
email: authEmail,
});
setLoading(false);
setView("home");
}

async function handleLogout() {
await supabase.auth.signOut();
setUser(null);
setView("home");
}

// PLACE ORDER
async function handlePlaceOrder() {
if (!user) {
setView("login");
return;
}
if (cart.length === 0) return;

setLoading(true);

const sale = {
customerName: user.name,
customerPhone: user.phone,
items: cart.map((c) => ({
productId: c.product.id,
productName: c.product.name,
price: c.product.price,
qty: c.qty,
supplierName: c.product.supplierName,
})),
total: cartTotal,
};

const result = completeSale(sale);
if (!result.success) {
setStatus(`❌ ${result.message}`);
setLoading(false);
return;
}

saveCustomer({ name: user.name, phone: user.phone });
await recordSaleFinancials(cartTotal);
const invoice = await createInvoice(sale);

setCart([]);
setLoading(false);
router.push(`/invoice?id=${encodeURIComponent(invoice.id)}`);
}

// ============ VIEWS ============

// HOME — CATEGORY SELECT
if (view === "home") {
return (
<div style={{
padding: 20,
backgroundColor: "#0a0f1e",
minHeight: "100vh",
color: "#fff",
fontFamily: "sans-serif",
paddingBottom: 100,
}}>
{/* HEADER */}
<div style={{
display: "flex",
justifyContent: "space-between",
alignItems: "center",
marginBottom: 24,
}}>
<div>
<h1 style={{ margin: 0, color: "#f5c518", fontSize: 24 }}>
BSC Marketplace
</h1>
<p style={{ margin: "4px 0 0", color: "#aaa", fontSize: 13 }}>
Fresh · Direct · Bahamian
</p>
</div>
<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
{cartCount > 0 && (
<button
onClick={() => setView("cart")}
style={{
padding: "8px 14px",
borderRadius: 10,
backgroundColor: "#f5c518",
color: "#000",
fontWeight: "bold",
border: "none",
cursor: "pointer",
fontSize: 13,
}}
>
🛒 {cartCount}
</button>
)}
{user ? (
<button
onClick={handleLogout}
style={{
padding: "8px 14px",
borderRadius: 10,
backgroundColor: "#1a2235",
color: "#aaa",
border: "1px solid #2a3550",
cursor: "pointer",
fontSize: 12,
}}
>
👤 {user.name.split(" ")[0]}
</button>
) : (
<button
onClick={() => setView("login")}
style={{
padding: "8px 14px",
borderRadius: 10,
backgroundColor: "#1a2235",
color: "#f5c518",
border: "1px solid #f5c518",
cursor: "pointer",
fontSize: 12,
fontWeight: "bold",
}}
>
Login
</button>
)}
</div>
</div>

{/* WELCOME */}
{user && (
<div style={{
backgroundColor: "#0f1f0f",
border: "1px solid #4ade80",
borderRadius: 12,
padding: 14,
marginBottom: 20,
}}>
<p style={{ margin: 0, color: "#4ade80", fontSize: 14 }}>
👋 Welcome back, <b>{user.name}</b>
</p>
</div>
)}

{/* CATEGORIES */}
<p style={{ color: "#555", fontSize: 12, marginBottom: 12 }}>
SELECT A CATEGORY
</p>

{CATEGORIES.map((cat) => (
<div
key={cat.id}
onClick={() => setView(cat.id as Category)}
style={{
backgroundColor: "#1a2235",
borderRadius: 14,
padding: 18,
marginBottom: 12,
border: `1px solid #2a3550`,
cursor: "pointer",
display: "flex",
alignItems: "center",
gap: 16,
}}
>
<span style={{ fontSize: 32 }}>{cat.icon}</span>
<div>
<p style={{
margin: 0,
fontWeight: "bold",
fontSize: 16,
color: cat.color,
}}>
{cat.label}
</p>
<p style={{ margin: "4px 0 0", color: "#555", fontSize: 12 }}>
{cat.desc}
</p>
</div>
<span style={{ marginLeft: "auto", color: "#555", fontSize: 20 }}>
→
</span>
</div>
))}
</div>
);
}

// LOGIN / REGISTER
if (view === "login") {
return (
<div style={{
padding: 24,
backgroundColor: "#0a0f1e",
minHeight: "100vh",
color: "#fff",
fontFamily: "sans-serif",
maxWidth: 480,
margin: "0 auto",
}}>
<button
onClick={() => setView("home")}
style={{
background: "none",
border: "none",
color: "#f5c518",
fontSize: 14,
cursor: "pointer",
marginBottom: 20,
padding: 0,
}}
>
← Back
</button>

<h2 style={{ color: "#f5c518", marginBottom: 6 }}>
{authView === "login" ? "Login to BSC" : "Create Account"}
</h2>
<p style={{ color: "#555", fontSize: 13, marginBottom: 24 }}>
{authView === "login"
? "Login to shop and track your orders"
: "Create a free BSC account to start shopping"}
</p>

{authView === "register" && (
<>
<input
placeholder="Full Name"
value={authName}
onChange={(e) => setAuthName(e.target.value)}
style={inputStyle}
/>
<input
placeholder="Phone / WhatsApp"
value={authPhone}
onChange={(e) => setAuthPhone(e.target.value)}
style={inputStyle}
/>
</>
)}

<input
placeholder="Email"
value={authEmail}
onChange={(e) => setAuthEmail(e.target.value)}
style={inputStyle}
type="email"
/>
<input
placeholder="Password"
value={authPassword}
onChange={(e) => setAuthPassword(e.target.value)}
style={inputStyle}
type="password"
/>

{authError && (
<p style={{
color: "#f87171",
fontSize: 13,
marginBottom: 12,
padding: 10,
backgroundColor: "#3b0000",
borderRadius: 8,
}}>
❌ {authError}
</p>
)}

<button
onClick={authView === "login" ? handleLogin : handleRegister}
disabled={loading}
style={{
width: "100%",
padding: "14px",
borderRadius: 10,
backgroundColor: loading ? "#555" : "#f5c518",
color: "#000",
fontWeight: "bold",
border: "none",
fontSize: 16,
cursor: loading ? "not-allowed" : "pointer",
marginBottom: 14,
}}
>
{loading ? "⏳ Please wait..." : authView === "login" ? "Login" : "Create Account"}
</button>

<button
onClick={() => setAuthView(authView === "login" ? "register" : "login")}
style={{
width: "100%",
padding: "12px",
borderRadius: 10,
backgroundColor: "#1a2235",
color: "#aaa",
border: "1px solid #2a3550",
fontSize: 14,
cursor: "pointer",
}}
>
{authView === "login"
? "No account? Register here"
: "Already have an account? Login"}
</button>
</div>
);
}

// UTILITY BILLS
if (view === "utility") {
return (
<div style={pageStyle}>
<button onClick={() => setView("home")} style={backBtnStyle}>← Back</button>
<h2 style={{ color: "#60a5fa", marginBottom: 6 }}>⚡ Pay Utility Bill</h2>
<p style={{ color: "#555", fontSize: 13, marginBottom: 24 }}>
Select a utility to pay
</p>
{[
{ name: "BEC — Bahamas Power & Light", icon: "💡" },
{ name: "Water & Sewage Corporation", icon: "💧" },
{ name: "Cable Bahamas", icon: "📺" },
{ name: "Flow Internet", icon: "🌐" },
{ name: "Aliv Mobile", icon: "📱" },
{ name: "BTC Phone & Internet", icon: "☎️" },
].map((util) => (
<div key={util.name} style={comingSoonCard}>
<span style={{ fontSize: 24 }}>{util.icon}</span>
<div style={{ flex: 1 }}>
<p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>
{util.name}
</p>
<p style={{ margin: "4px 0 0", color: "#555", fontSize: 12 }}>
Coming Soon
</p>
</div>
</div>
))}
</div>
);
}

// AUTO & CAR PARTS
if (view === "auto") {
return (
<div style={pageStyle}>
<button onClick={() => setView("home")} style={backBtnStyle}>← Back</button>
<h2 style={{ color: "#a78bfa", marginBottom: 6 }}>🚗 Auto & Car Parts</h2>
<p style={{ color: "#555", fontSize: 13, marginBottom: 24 }}>
Vehicle parts and accessories
</p>
<div style={comingSoonCard}>
<span style={{ fontSize: 40 }}>🔧</span>
<div>
<p style={{ margin: 0, fontWeight: "bold", fontSize: 16 }}>
Coming Soon
</p>
<p style={{ margin: "4px 0 0", color: "#555", fontSize: 13 }}>
Auto parts catalog launching next phase
</p>
</div>
</div>
</div>
);
}

// USA BULK
if (view === "usa") {
return (
<div style={pageStyle}>
<button onClick={() => setView("home")} style={backBtnStyle}>← Back</button>
<h2 style={{ color: "#f87171", marginBottom: 6 }}>🇺🇸 USA Bulk Import</h2>
<p style={{ color: "#555", fontSize: 13, marginBottom: 24 }}>
Direct USA supplier bulk orders
</p>
<div style={comingSoonCard}>
<span style={{ fontSize: 40 }}>🚢</span>
<div>
<p style={{ margin: 0, fontWeight: "bold", fontSize: 16 }}>
Coming Soon
</p>
<p style={{ margin: "4px 0 0", color: "#555", fontSize: 13 }}>
USA bulk import catalog launching next phase
</p>
</div>
</div>
</div>
);
}

// SHOP — RETAIL OR WHOLESALE
if (view === "retail" || view === "wholesale") {
const isWholesale = view === "wholesale";
const color = isWholesale ? "#f5c518" : "#4ade80";
const title = isWholesale ? "📦 Wholesale & Bulk" : "🐟 Local Retail";

return (
<div style={pageStyle}>
<div style={{
display: "flex",
justifyContent: "space-between",
alignItems: "center",
marginBottom: 20,
}}>
<button onClick={() => setView("home")} style={backBtnStyle}>← Back</button>
<button
onClick={() => setView("cart")}
style={{
padding: "8px 14px",
borderRadius: 10,
backgroundColor: cartCount > 0 ? "#f5c518" : "#1a2235",
color: cartCount > 0 ? "#000" : "#aaa",
border: "1px solid #2a3550",
fontWeight: "bold",
cursor: "pointer",
fontSize: 13,
}}
>
🛒 {cartCount > 0 ? cartCount : "Cart"}
</button>
</div>

<h2 style={{ color, marginBottom: 6, marginTop: 0 }}>{title}</h2>
<p style={{ color: "#555", fontSize: 13, marginBottom: 16 }}>
{isWholesale
? "Bulk pricing for restaurants and businesses"
: "Fresh local products at retail prices"}
</p>

<input
placeholder="🔍 Search products..."
value={search}
onChange={(e) => setSearch(e.target.value)}
style={{ ...inputStyle, marginBottom: 16 }}
/>

<p style={{ color: "#555", fontSize: 12, marginBottom: 12 }}>
{filtered.length} PRODUCTS AVAILABLE
</p>

{filtered.length === 0 && (
<p style={{ color: "#555", textAlign: "center", marginTop: 40 }}>
No products found
</p>
)}

{filtered.map((product) => {
const inCart = cart.find((c) => c.product.id === product.id);
const availableQty = product.stock - product.minStock;

return (
<div key={product.id} style={{
backgroundColor: "#1a2235",
borderRadius: 12,
padding: 16,
marginBottom: 14,
border: "1px solid #2a3550",
}}>
<div style={{
display: "flex",
justifyContent: "space-between",
alignItems: "flex-start",
}}>
<div style={{ flex: 1 }}>
<p style={{ margin: 0, fontWeight: "bold", fontSize: 16 }}>
{product.name}
</p>
<p style={{
margin: "6px 0 2px",
color: "#4ade80",
fontSize: 20,
fontWeight: "bold",
}}>
${product.price.toFixed(2)}
</p>
<p style={{ margin: 0, color: "#555", fontSize: 12 }}>
{availableQty} available
</p>
</div>

{inCart ? (
<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
<button
onClick={() => adjustQty(product.id, -1)}
style={qtyBtnStyle("#2a3550")}
>−</button>
<span style={{ fontWeight: "bold", fontSize: 16 }}>
{inCart.qty}
</span>
<button
onClick={() => adjustQty(product.id, 1)}
style={qtyBtnStyle("#f5c518", "#000")}
>+</button>
</div>
) : (
<button
onClick={() => addToCart(product)}
style={{
padding: "10px 18px",
borderRadius: 10,
backgroundColor: "#f5c518",
color: "#000",
fontWeight: "bold",
border: "none",
cursor: "pointer",
fontSize: 14,
}}
>
+ Add
</button>
)}
</div>
</div>
);
})}
</div>
);
}

// CART VIEW
if (view === "cart") {
return (
<div style={pageStyle}>
<button onClick={() => setView("home")} style={backBtnStyle}>← Back</button>
<h2 style={{ color: "#f5c518", marginBottom: 16, marginTop: 0 }}>
🛒 Your Cart
</h2>

{!user && (
<div style={{
backgroundColor: "#1a1a0a",
border: "1px solid #f5c518",
borderRadius: 12,
padding: 14,
marginBottom: 16,
}}>
<p style={{ margin: 0, color: "#f5c518", fontSize: 13 }}>
⚠️ You need to login to place an order.{" "}
<span
onClick={() => setView("login")}
style={{ textDecoration: "underline", cursor: "pointer" }}
>
Login here
</span>
</p>
</div>
)}

{cart.length === 0 && (
<p style={{ color: "#555" }}>Your cart is empty</p>
)}

{cart.map((c) => (
<div key={c.product.id} style={{
backgroundColor: "#1a2235",
borderRadius: 12,
padding: 14,
marginBottom: 12,
border: "1px solid #2a3550",
}}>
<p style={{ margin: "0 0 4px", fontWeight: "bold" }}>
{c.product.name}
</p>
<p style={{ margin: "2px 0", color: "#aaa", fontSize: 13 }}>
{c.qty} × ${c.product.price.toFixed(2)} ={" "}
<span style={{ color: "#4ade80", fontWeight: "bold" }}>
${(c.qty * c.product.price).toFixed(2)}
</span>
</p>
<div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
<button onClick={() => adjustQty(c.product.id, -1)} style={qtyBtnStyle("#2a3550")}>−</button>
<span style={{ fontWeight: "bold" }}>{c.qty}</span>
<button onClick={() => adjustQty(c.product.id, 1)} style={qtyBtnStyle("#f5c518", "#000")}>+</button>
<button
onClick={() => removeFromCart(c.product.id)}
style={{
marginLeft: "auto",
padding: "4px 12px",
borderRadius: 6,
backgroundColor: "#7f1d1d",
color: "#fff",
border: "none",
cursor: "pointer",
fontSize: 13,
}}
>
Remove
</button>
</div>
</div>
))}

{cart.length > 0 && (
<>
<div style={{
backgroundColor: "#0f1f0f",
border: "2px solid #4ade80",
borderRadius: 12,
padding: 16,
marginBottom: 16,
textAlign: "center",
}}>
<p style={{ margin: 0, color: "#aaa", fontSize: 13 }}>Order Total</p>
<h2 style={{ margin: "6px 0 0", color: "#4ade80", fontSize: 28 }}>
${cartTotal.toFixed(2)}
</h2>
</div>

{status && (
<p style={{
padding: 10,
borderRadius: 8,
backgroundColor: "#3b0000",
color: "#f87171",
marginBottom: 12,
fontSize: 13,
}}>
{status}
</p>
)}

<button
onClick={handlePlaceOrder}
disabled={loading || !user}
style={{
width: "100%",
padding: "14px",
borderRadius: 10,
backgroundColor: loading || !user ? "#555" : "#f5c518",
color: "#000",
fontWeight: "bold",
border: "none",
fontSize: 16,
cursor: loading || !user ? "not-allowed" : "pointer",
marginBottom: 12,
}}
>
{loading ? "⏳ Processing..." : user ? "✅ Place Order" : "🔐 Login to Order"}
</button>
</>
)}

<button
onClick={() => setView("home")}
style={{
width: "100%",
padding: "12px",
borderRadius: 10,
backgroundColor: "#1a2235",
color: "#aaa",
border: "1px solid #2a3550",
fontSize: 15,
cursor: "pointer",
}}
>
← Continue Shopping
</button>
</div>
);
}

return null;
}

// ============ SHARED STYLES ============

const pageStyle: React.CSSProperties = {
padding: 20,
backgroundColor: "#0a0f1e",
minHeight: "100vh",
color: "#fff",
fontFamily: "sans-serif",
paddingBottom: 100,
};

const backBtnStyle: React.CSSProperties = {
background: "none",
border: "none",
color: "#f5c518",
fontSize: 14,
cursor: "pointer",
marginBottom: 16,
padding: 0,
};

const inputStyle: React.CSSProperties = {
display: "block",
width: "100%",
padding: "12px",
borderRadius: 10,
backgroundColor: "#1a2235",
color: "#fff",
border: "1px solid #2a3550",
fontSize: 15,
marginBottom: 12,
boxSizing: "border-box",
};

const comingSoonCard: React.CSSProperties = {
backgroundColor: "#1a2235",
borderRadius: 12,
padding: 16,
marginBottom: 12,
border: "1px solid #2a3550",
display: "flex",
alignItems: "center",
gap: 14,
};

function qtyBtnStyle(bg: string, color = "#fff"): React.CSSProperties {
return {
width: 32,
height: 32,
borderRadius: 8,
backgroundColor: bg,
color,
border: "none",
fontSize: 18,
cursor: "pointer",
fontWeight: "bold",
};
}

