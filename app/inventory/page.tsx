// File: app/inventory/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
"https://auqjjrisivhfmpleusyt.supabase.co",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg"
);

type InventoryRow = {
id: string;
quantity: number | null;
cost_per_unit: number | null;
selling_price: number | null;
reorder_level: number | null;
product_id: string | null;
};

type ProductRow = {
id: string;
name: string | null;
};

export default function InventoryPage() {
const [items, setItems] = useState<InventoryRow[]>([]);
const [productMap, setProductMap] = useState<Record<string, string>>({});
const [loading, setLoading] = useState(true);
const [status, setStatus] = useState("");

useEffect(() => {
loadInventory();
}, []);

async function loadInventory() {
const [
{ data: inventoryData, error: inventoryError },
{ data: productsData, error: productsError },
] = await Promise.all([
supabase
.from("inventory")
.select("id, quantity, cost_per_unit, selling_price, reorder_level, product_id"),
supabase.from("products").select("id, name"),
]);

if (inventoryError || productsError) {
setStatus("❌ Error loading inventory");
setLoading(false);
return;
}

const map: Record<string, string> = {};
((productsData as ProductRow[]) || []).forEach((product) => {
if (product.id) {
map[product.id] = product.name || "Unnamed Product";
}
});

setProductMap(map);
setItems((inventoryData as InventoryRow[]) || []);
setLoading(false);
setStatus("✅ Loaded");
}

const totalValue = items.reduce((sum, item) => {
return sum + (item.quantity || 0) * (item.cost_per_unit || 0);
}, 0);

const totalSellingValue = items.reduce((sum, item) => {
return sum + (item.quantity || 0) * (item.selling_price || 0);
}, 0);

const lowStockItems = items.filter(
(item) =>
item.reorder_level !== null &&
item.quantity !== null &&
item.quantity <= item.reorder_level
);

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
<div style={{ marginBottom: 20 }}>
<h1 style={{ margin: 0, color: "#f5c518", fontSize: 22 }}>
📦 Inventory
</h1>
<p style={{ margin: "4px 0 0", color: "#555", fontSize: 13 }}>
Live stock from Supabase
</p>
</div>

{/* LOADING */}
{loading && (
<p style={{ color: "#555", textAlign: "center", marginTop: 40 }}>
⏳ Loading inventory...
</p>
)}

{!loading && (
<>
{/* SUMMARY CARDS */}
<div style={{
display: "grid",
gridTemplateColumns: "1fr 1fr",
gap: 12,
marginBottom: 20,
}}>
<div style={{
backgroundColor: "#1a2235",
borderRadius: 14,
padding: 16,
border: "1px solid #2a3550",
}}>
<p style={{ margin: 0, color: "#aaa", fontSize: 11 }}>
ITEMS TRACKED
</p>
<h2 style={{ margin: "6px 0 0", fontSize: 24, color: "#fff" }}>
{items.length}
</h2>
</div>

<div style={{
backgroundColor: "#1a2235",
borderRadius: 14,
padding: 16,
border: "1px solid #2a3550",
}}>
<p style={{ margin: 0, color: "#aaa", fontSize: 11 }}>
LOW STOCK
</p>
<h2 style={{
margin: "6px 0 0",
fontSize: 24,
color: lowStockItems.length > 0 ? "#f87171" : "#4ade80",
}}>
{lowStockItems.length}
</h2>
</div>

<div style={{
backgroundColor: "#1a2235",
borderRadius: 14,
padding: 16,
border: "1px solid #2a3550",
}}>
<p style={{ margin: 0, color: "#aaa", fontSize: 11 }}>
COST VALUE
</p>
<h2 style={{ margin: "6px 0 0", fontSize: 20, color: "#60a5fa" }}>
${totalValue.toFixed(2)}
</h2>
</div>

<div style={{
backgroundColor: "#1a2235",
borderRadius: 14,
padding: 16,
border: "1px solid #2a3550",
}}>
<p style={{ margin: 0, color: "#aaa", fontSize: 11 }}>
SELL VALUE
</p>
<h2 style={{ margin: "6px 0 0", fontSize: 20, color: "#4ade80" }}>
${totalSellingValue.toFixed(2)}
</h2>
</div>
</div>

{/* LOW STOCK ALERT */}
{lowStockItems.length > 0 && (
<div style={{
backgroundColor: "#1a0a0a",
border: "1px solid #7f1d1d",
borderRadius: 14,
padding: 16,
marginBottom: 20,
}}>
<p style={{ margin: "0 0 10px", color: "#f87171", fontWeight: "bold" }}>
⚠️ Low Stock Items
</p>
{lowStockItems.map((item) => (
<p key={item.id} style={{ margin: "4px 0", color: "#f87171", fontSize: 13 }}>
· {item.product_id ? productMap[item.product_id] || "Unknown" : "Unknown"} —{" "}
{item.quantity} left (reorder at {item.reorder_level})
</p>
))}
</div>
)}

{/* INVENTORY LIST */}
<h3 style={{ color: "#f5c518", marginBottom: 12 }}>
All Products
</h3>

{items.length === 0 && (
<div style={{
backgroundColor: "#1a2235",
borderRadius: 12,
padding: 30,
textAlign: "center",
border: "1px solid #2a3550",
}}>
<p style={{ color: "#555", margin: 0 }}>No inventory found</p>
</div>
)}

{items.map((item) => {
const name = item.product_id
? productMap[item.product_id] || "Missing Product Link"
: "Missing Product Link";

const isLow =
item.reorder_level !== null &&
item.quantity !== null &&
item.quantity <= item.reorder_level;

const profit =
item.selling_price !== null && item.cost_per_unit !== null
? item.selling_price - item.cost_per_unit
: null;

return (
<div key={item.id} style={{
backgroundColor: "#1a2235",
borderRadius: 12,
padding: 16,
marginBottom: 12,
border: isLow ? "1px solid #7f1d1d" : "1px solid #2a3550",
}}>
<div style={{
display: "flex",
justifyContent: "space-between",
alignItems: "flex-start",
}}>
<div>
<p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>
{name}
</p>
<p style={{ margin: "4px 0 0", color: "#aaa", fontSize: 12 }}>
Cost: ${item.cost_per_unit?.toFixed(2) ?? "—"} |
Sell: ${item.selling_price?.toFixed(2) ?? "—"}
{profit !== null && (
<span style={{ color: "#4ade80" }}>
{" "}| Profit: ${profit.toFixed(2)}
</span>
)}
</p>
{item.reorder_level !== null && (
<p style={{ margin: "4px 0 0", color: "#555", fontSize: 11 }}>
Reorder at: {item.reorder_level}
</p>
)}
</div>

<div style={{ textAlign: "right" }}>
<p style={{
margin: 0,
fontSize: 22,
fontWeight: "bold",
color: isLow ? "#f87171" : "#4ade80",
}}>
{item.quantity ?? 0}
</p>
<p style={{ margin: "2px 0 0", color: "#555", fontSize: 11 }}>
in stock
</p>
</div>
</div>
</div>
);
})}
</>
)}
</div>
);
}

