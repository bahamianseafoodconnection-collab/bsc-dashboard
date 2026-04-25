// File: app/invoice/page.tsx
"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { invoicesCache } from "../../lib/invoices";

const supabase = createClient(
"https://auqjjrisivhfmpleusyt.supabase.co",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg"
);

type InvoiceItem = { productName: string; qty: number; price: number; total: number };
type Invoice = { id: string; date: string; customerName: string; customerPhone: string; items: InvoiceItem[]; total: number };

function InvoiceContent() {
const params = useSearchParams();
const id = params.get("id");
const [invoice, setInvoice] = useState<Invoice | null>(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
if (!id) { setLoading(false); return; }
// Check cache first
const cached = invoicesCache.find((inv) => inv.id === id);
if (cached) { setInvoice(cached as Invoice); setLoading(false); return; }
// Fallback to Supabase
supabase.from("invoices").select("*").eq("id", id).single().then(({ data }) => {
if (data) {
setInvoice({
id: data.id,
date: data.date,
customerName: data.customer_name,
customerPhone: data.customer_phone,
items: typeof data.items === "string" ? JSON.parse(data.items) : data.items,
total: data.total,
});
}
setLoading(false);
});
}, [id]);

if (loading) return (
<div style={wrap}>
<p style={{ color: "#555", textAlign: "center", paddingTop: 60 }}>Loading invoice...</p>
</div>
);

if (!invoice) return (
<div style={wrap}>
<p style={{ color: "#f87171", textAlign: "center", paddingTop: 60 }}>Invoice not found</p>
</div>
);

// Parse delivery vs pickup note
const nameParts = invoice.customerName.split(" | ");
const customerName = nameParts[0];
const deliveryNote = nameParts[1] || null;

return (
<div style={wrap}>
{/* HEADER — compact */}
<div style={{ textAlign: "center", paddingBottom: 12, borderBottom: "1px dashed #e5e7eb", marginBottom: 12 }}>
<p style={{ margin: 0, fontWeight: "bold", fontSize: 16, color: "#111" }}>BSC MARKETPLACE</p>
<p style={{ margin: "2px 0", fontSize: 11, color: "#666" }}>Bahamian Seafood Connection</p>
<p style={{ margin: "2px 0", fontSize: 10, color: "#999" }}>{invoice.date}</p>
<p style={{ margin: "4px 0 0", fontSize: 10, color: "#aaa", fontFamily: "monospace" }}>{invoice.id}</p>
</div>

{/* CUSTOMER */}
<div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px dashed #e5e7eb" }}>
<p style={{ margin: "2px 0", fontSize: 13, fontWeight: "bold", color: "#111" }}>{customerName}</p>
<p style={{ margin: "2px 0", fontSize: 12, color: "#555" }}>📱 {invoice.customerPhone}</p>
{deliveryNote && (
<p style={{ margin: "4px 0 0", fontSize: 11, color: "#f5a623", fontWeight: "bold" }}>
📦 {deliveryNote}
</p>
)}
</div>

{/* ITEMS — tight rows */}
{invoice.items.map((item, i) => (
<div key={i} style={{
display: "flex",
justifyContent: "space-between",
alignItems: "center",
paddingBottom: 6,
marginBottom: 6,
borderBottom: "1px dotted #e5e7eb",
}}>
<div>
<p style={{ margin: 0, fontSize: 13, color: "#111", fontWeight: "500" }}>{item.productName}</p>
<p style={{ margin: 0, fontSize: 11, color: "#888" }}>{item.qty} × ${item.price.toFixed(2)}</p>
</div>
<p style={{ margin: 0, fontSize: 13, fontWeight: "bold", color: "#111" }}>${item.total.toFixed(2)}</p>
</div>
))}

{/* TOTAL */}
<div style={{
display: "flex",
justifyContent: "space-between",
alignItems: "center",
marginTop: 10,
paddingTop: 10,
borderTop: "2px solid #111",
}}>
<p style={{ margin: 0, fontWeight: "bold", fontSize: 15, color: "#111" }}>TOTAL</p>
<p style={{ margin: 0, fontWeight: "bold", fontSize: 18, color: "#111" }}>${invoice.total.toFixed(2)}</p>
</div>

{/* FOOTER */}
<p style={{ textAlign: "center", fontSize: 10, color: "#aaa", marginTop: 16 }}>
Thank you for your business · BSC Marketplace
</p>

{/* ACTIONS — only show on screen, hidden on print */}
<div style={{ marginTop: 20 }} className="no-print">
<button
onClick={() => window.print()}
style={{
width: "100%", padding: "13px", borderRadius: 10,
backgroundColor: "#111", color: "#f5c518",
fontWeight: "bold", border: "none", fontSize: 15,
cursor: "pointer", marginBottom: 10,
}}
>🖨 Print Invoice</button>
<button
onClick={() => window.history.back()}
style={{
width: "100%", padding: "11px", borderRadius: 10,
backgroundColor: "transparent", color: "#888",
border: "1px solid #ddd", fontSize: 14, cursor: "pointer",
}}
>← Back</button>
</div>

<style>{`
@media print {
.no-print { display: none !important; }
body { background: white !important; }
}
`}</style>
</div>
);
}

const wrap: React.CSSProperties = {
backgroundColor: "#fff",
color: "#111",
minHeight: "100vh",
padding: "24px 20px",
maxWidth: 380,
margin: "0 auto",
fontFamily: "'Courier New', monospace",
};

export default function InvoicePage() {
return (
<Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#555" }}>Loading...</div>}>
<InvoiceContent />
</Suspense>
);
}

