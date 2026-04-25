// File: app/report/page.tsx
"use client";

import { useEffect, useState } from "react";
import { fetchInvoicesFromDB, type Invoice } from "../../lib/invoices";
import Link from "next/link";

export default function ReportPage() {
const [invoices, setInvoices] = useState<Invoice[]>([]);
const [loading, setLoading] = useState(true);
const [search, setSearch] = useState("");

useEffect(() => {
async function load() {
const data = await fetchInvoicesFromDB();
setInvoices(data);
setLoading(false);
}
load();
}, []);

const filtered = invoices.filter((inv) =>
inv.customerName.toLowerCase().includes(search.toLowerCase()) ||
inv.id.toLowerCase().includes(search.toLowerCase())
);

const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);

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
📊 Sales History
</h1>
<p style={{ margin: "4px 0 0", color: "#555", fontSize: 13 }}>
All invoices from Supabase
</p>
</div>

{/* SUMMARY */}
<div style={{
backgroundColor: "#0f1f0f",
border: "1px solid #4ade80",
borderRadius: 12,
padding: 16,
marginBottom: 20,
display: "flex",
justifyContent: "space-between",
alignItems: "center",
}}>
<div>
<p style={{ margin: 0, color: "#aaa", fontSize: 12 }}>
TOTAL INVOICES
</p>
<h2 style={{ margin: "4px 0 0", color: "#fff", fontSize: 22 }}>
{invoices.length}
</h2>
</div>
<div style={{ textAlign: "right" }}>
<p style={{ margin: 0, color: "#aaa", fontSize: 12 }}>
TOTAL REVENUE
</p>
<h2 style={{ margin: "4px 0 0", color: "#4ade80", fontSize: 22 }}>
${totalRevenue.toFixed(2)}
</h2>
</div>
</div>

{/* SEARCH */}
<input
placeholder="🔍 Search by customer or invoice ID..."
value={search}
onChange={(e) => setSearch(e.target.value)}
style={{
width: "100%",
padding: "12px",
borderRadius: 10,
backgroundColor: "#1a2235",
color: "#fff",
border: "1px solid #2a3550",
fontSize: 14,
marginBottom: 20,
boxSizing: "border-box",
}}
/>

{/* LOADING */}
{loading && (
<p style={{ color: "#555", textAlign: "center" }}>
Loading invoices...
</p>
)}

{/* EMPTY */}
{!loading && filtered.length === 0 && (
<div style={{
backgroundColor: "#1a2235",
borderRadius: 12,
padding: 30,
textAlign: "center",
border: "1px solid #2a3550",
}}>
<p style={{ color: "#555", margin: 0 }}>No invoices found</p>
</div>
)}

{/* INVOICE LIST */}
{filtered.map((inv) => (
<div key={inv.id} style={{
backgroundColor: "#1a2235",
borderRadius: 12,
padding: 16,
marginBottom: 12,
border: "1px solid #2a3550",
}}>
{/* TOP ROW */}
<div style={{
display: "flex",
justifyContent: "space-between",
alignItems: "flex-start",
marginBottom: 10,
}}>
<div>
<p style={{
margin: 0,
color: "#f5c518",
fontSize: 12,
fontFamily: "monospace",
}}>
{inv.id}
</p>
<p style={{ margin: "4px 0 0", fontWeight: "bold", fontSize: 15 }}>
{inv.customerName}
</p>
<p style={{ margin: "2px 0 0", color: "#60a5fa", fontSize: 12 }}>
📱 {inv.customerPhone}
</p>
<p style={{ margin: "2px 0 0", color: "#555", fontSize: 11 }}>
{inv.date}
</p>
</div>
<div style={{ textAlign: "right" }}>
<p style={{
margin: 0,
color: "#4ade80",
fontWeight: "bold",
fontSize: 20,
}}>
${inv.total.toFixed(2)}
</p>
<p style={{ margin: "4px 0 0", color: "#555", fontSize: 11 }}>
{inv.items.length} item{inv.items.length !== 1 ? "s" : ""}
</p>
</div>
</div>

{/* ITEMS */}
{inv.items.map((item, i) => (
<div key={i} style={{
backgroundColor: "#0a0f1e",
borderRadius: 8,
padding: "8px 12px",
marginBottom: 6,
border: "1px solid #2a3550",
display: "flex",
justifyContent: "space-between",
}}>
<p style={{ margin: 0, fontSize: 13 }}>
{item.productName}
<span style={{ color: "#aaa" }}> × {item.qty}</span>
</p>
<p style={{ margin: 0, color: "#4ade80", fontSize: 13 }}>
${item.total.toFixed(2)}
</p>
</div>
))}

{/* PRINT LINK */}
<Link
href={`/invoice?id=${encodeURIComponent(inv.id)}`}
style={{
display: "block",
marginTop: 10,
padding: "8px",
borderRadius: 8,
backgroundColor: "#f5c518",
color: "#000",
fontWeight: "bold",
fontSize: 13,
textAlign: "center",
textDecoration: "none",
}}
>
🖨️ View / Print Invoice
</Link>
</div>
))}
</div>
);
}

