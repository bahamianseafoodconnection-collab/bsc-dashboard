// File: app/pos/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
products,
completeSale,
saveCustomer,
getCustomerByName,
type Product,
} from "../../lib/store";
import { recordSaleFinancials } from "../../lib/finance";
import { createInvoice } from "../../lib/invoices";

type CartItem = Product & { qty: number };

export default function POSPage() {
const router = useRouter();
const [selectedId, setSelectedId] = useState(products[0]?.id);
const [qty, setQty] = useState(1);
const [cart, setCart] = useState<CartItem[]>([]);
const [customerName, setCustomerName] = useState("");
const [customerPhone, setCustomerPhone] = useState("");
const [status, setStatus] = useState("");

const selectedProduct = products.find((p) => p.id === selectedId)!;

function handleCustomerNameChange(name: string) {
setCustomerName(name);
const existing = getCustomerByName(name);
if (existing) setCustomerPhone(existing.phone);
}

function addToCart() {
const existing = cart.find((c) => c.id === selectedProduct.id);
if (existing) {
setCart(
cart.map((c) =>
c.id === selectedProduct.id ? { ...c, qty: c.qty + qty } : c
)
);
} else {
setCart([...cart, { ...selectedProduct, qty }]);
}
setQty(1);
setStatus("Added " + selectedProduct.name);
}

function removeItem(id: string) {
setCart(cart.filter((c) => c.id !== id));
}

const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

async function handleCompleteSale() {
if (!customerName || !customerPhone) {
setStatus("Customer name and phone required");
return;
}
if (cart.length === 0) {
setStatus("Cart is empty");
return;
}

const sale = {
customerName,
customerPhone,
items: cart.map((item) => ({
productId: item.id,
productName: item.name,
price: item.price,
qty: item.qty,
supplierName: item.supplierName,
})),
total: cartTotal,
};

const result = completeSale(sale);
if (!result.success) {
setStatus(result.message);
return;
}

saveCustomer({ name: customerName, phone: customerPhone });
await recordSaleFinancials(cartTotal);
const invoice = await createInvoice(sale);
router.push("/invoice?id=" + encodeURIComponent(invoice.id));
}

const inp: React.CSSProperties = {
display: "block",
width: "100%",
padding: "11px 13px",
borderRadius: 10,
backgroundColor: "#111c33",
color: "#fff",
border: "1px solid #1e2d4a",
fontSize: 14,
marginBottom: 12,
boxSizing: "border-box",
};

const lbl: React.CSSProperties = {
display: "block",
color: "#6b7280",
fontSize: 11,
letterSpacing: 1,
textTransform: "uppercase",
marginBottom: 5,
};

return (
<div
style={{
padding: 18,
backgroundColor: "#0a0f1e",
minHeight: "100vh",
color: "#fff",
fontFamily: "sans-serif",
paddingBottom: 100,
maxWidth: 600,
margin: "0 auto",
}}
>
<h1 style={{ color: "#f5c518", fontSize: 20, marginBottom: 20 }}>
POS — New Sale
</h1>

{/* PRODUCT SELECT */}
<label style={lbl}>Select Product</label>
<select
value={selectedId}
onChange={(e) => setSelectedId(e.target.value)}
style={inp}
>
{products.map((p) => (
<option key={p.id} value={p.id}>
{p.name} — ${p.price} ({p.stock} in stock)
</option>
))}
</select>

{/* PRODUCT PREVIEW */}
<div
style={{
backgroundColor: "#111c33",
borderRadius: 10,
padding: "12px 14px",
marginBottom: 14,
border: "1px solid #1e2d4a",
}}
>
<p style={{ margin: "2px 0", fontWeight: "bold", fontSize: 14 }}>
{selectedProduct.name}
</p>
<p style={{ margin: "2px 0", color: "#4ade80", fontSize: 13 }}>
Price: ${selectedProduct.price}
</p>
<p style={{ margin: "2px 0", color: "#60a5fa", fontSize: 12 }}>
Stock: {selectedProduct.stock} | Min: {selectedProduct.minStock}
</p>
</div>

{/* QTY + ADD */}
<div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
<input
type="number"
value={qty}
min={1}
onChange={(e) => setQty(Number(e.target.value))}
style={{ ...inp, flex: 1, marginBottom: 0 }}
/>
<button
onClick={addToCart}
style={{
flex: 3,
padding: "11px 16px",
borderRadius: 10,
backgroundColor: "#f5c518",
color: "#000",
fontWeight: "bold",
border: "none",
fontSize: 14,
cursor: "pointer",
}}
>
+ Add to Cart
</button>
</div>

{/* CUSTOMER */}
<label style={lbl}>Customer Name</label>
<input
placeholder="Customer Name"
value={customerName}
onChange={(e) => handleCustomerNameChange(e.target.value)}
style={inp}
/>
<label style={lbl}>Phone / WhatsApp</label>
<input
placeholder="Phone / WhatsApp"
value={customerPhone}
onChange={(e) => setCustomerPhone(e.target.value)}
style={inp}
/>

{/* CART */}
<h3 style={{ color: "#f5c518", marginBottom: 10, fontSize: 15 }}>
Cart
</h3>
{cart.length === 0 && (
<p style={{ color: "#4a5568", fontSize: 13 }}>No items added yet</p>
)}
{cart.map((item) => (
<div
key={item.id}
style={{
backgroundColor: "#111c33",
borderRadius: 10,
padding: "12px 14px",
marginBottom: 10,
border: "1px solid #1e2d4a",
display: "flex",
justifyContent: "space-between",
alignItems: "center",
}}
>
<div>
<p style={{ margin: "0 0 2px", fontWeight: "bold", fontSize: 14 }}>
{item.name}
</p>
<p style={{ margin: 0, color: "#aaa", fontSize: 12 }}>
{item.qty} x ${item.price} ={" "}
<span style={{ color: "#4ade80" }}>
${(item.qty * item.price).toFixed(2)}
</span>
</p>
</div>
<button
onClick={() => removeItem(item.id)}
style={{
padding: "4px 12px",
borderRadius: 6,
backgroundColor: "#3b0000",
color: "#f87171",
border: "none",
cursor: "pointer",
fontSize: 12,
}}
>
Remove
</button>
</div>
))}

{/* TOTAL */}
<div
style={{
backgroundColor: "#0a1f0a",
border: "1px solid #4ade80",
borderRadius: 10,
padding: "12px 16px",
marginBottom: 16,
display: "flex",
justifyContent: "space-between",
alignItems: "center",
}}
>
<p style={{ margin: 0, color: "#4ade80", fontSize: 14 }}>Total</p>
<p
style={{
margin: 0,
color: "#4ade80",
fontWeight: "bold",
fontSize: 18,
}}
>
${cartTotal.toFixed(2)}
</p>
</div>

{/* STATUS */}
{status && (
<p
style={{
padding: "10px 14px",
borderRadius: 8,
backgroundColor: status.includes("required") || status.includes("empty") || status.includes("Cannot")
? "#2d0000"
: "#0a1f0a",
color: status.includes("required") || status.includes("empty") || status.includes("Cannot")
? "#f87171"
: "#4ade80",
marginBottom: 14,
fontSize: 13,
}}
>
{status}
</p>
)}

{/* ACTION BUTTONS */}
<button
onClick={handleCompleteSale}
style={{
width: "100%",
padding: "14px",
borderRadius: 10,
backgroundColor: "#f5c518",
color: "#000",
fontWeight: "bold",
border: "none",
fontSize: 15,
cursor: "pointer",
marginBottom: 10,
}}
>
Complete Sale
</button>
<button
onClick={() => {
setCart([]);
setCustomerName("");
setCustomerPhone("");
setStatus("");
}}
style={{
width: "100%",
padding: "12px",
borderRadius: 10,
backgroundColor: "transparent",
color: "#6b7280",
border: "1px solid #1e2d4a",
fontSize: 14,
cursor: "pointer",
}}
>
Clear
</button>
</div>
);
}

