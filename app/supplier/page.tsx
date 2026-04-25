// File: app/supplier/page.tsx
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
"https://auqjjrisivhfmpleusyt.supabase.co",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg"
);

function getDutyRate(category: string, productName: string): number {
const name = productName.toLowerCase();
const cat = category.toLowerCase();
if (cat === "seafood") {
if (name.includes("grouper")) return 0.35;
if (name.includes("snapper")) return 0.35;
if (name.includes("tuna")) return 0.35;
if (name.includes("mahi")) return 0.35;
if (name.includes("swai")) return 0.35;
if (name.includes("lobster")) return 0.35;
if (name.includes("shrimp")) return 0;
if (name.includes("salmon")) return 0;
if (name.includes("octopus")) return 0;
if (name.includes("squid")) return 0.35;
if (name.includes("mussel")) return 0.35;
return 0.35;
}
if (cat === "poultry") {
if (name.includes("duck")) return 0.05;
if (name.includes("chicken")) return 0.30;
return 0.10;
}
if (cat === "meat") {
if (name.includes("pork")) return 0.10;
if (name.includes("beef")) return 0;
if (name.includes("lamb")) return 0;
if (name.includes("veal")) return 0;
if (name.includes("deer")) return 0.10;
return 0.10;
}
if (cat === "auto") return 0.60;
if (cat === "vehicle") return 0.45;
return 0.25;
}

const CATEGORIES = ["seafood", "poultry", "meat", "auto", "vehicle", "general"];

type View = "home" | "apply" | "login" | "portal" | "upload" | "admin";

type Supplier = {
id: string;
full_name: string;
company_name: string;
email: string;
whatsapp: string;
category: string;
status: string;
};

type SupplierProduct = {
id: string;
name: string;
category: string;
sku: string;
retail_price: number;
wholesale_price: number;
unit_cost: number;
duty_rate: number;
duty_amount: number;
shipping_cost: number;
case_cost: number;
pieces_per_case: number;
case_weight_lbs: number;
supplier_name: string;
supplier_whatsapp: string;
photo_url: string;
status: string;
created_at: string;
};

export default function SupplierPage() {
const [view, setView] = useState<View>("home");
const [supplier, setSupplier] = useState<Supplier | null>(null);
const [loading, setLoading] = useState(false);
const [success, setSuccess] = useState("");
const [error, setError] = useState("");

// ADMIN STATE
const [isAdmin, setIsAdmin] = useState(false);
const [pendingSuppliers, setPendingSuppliers] = useState<Supplier[]>([]);
const [pendingProducts, setPendingProducts] = useState<SupplierProduct[]>([]);
const [adminTab, setAdminTab] = useState<"suppliers" | "products">("suppliers");

// SUPPLIER PRODUCTS
const [myProducts, setMyProducts] = useState<SupplierProduct[]>([]);

// APPLICATION
const [appName, setAppName] = useState("");
const [appCompany, setAppCompany] = useState("");
const [appEmail, setAppEmail] = useState("");
const [appWhatsApp, setAppWhatsApp] = useState("");
const [appCategory, setAppCategory] = useState("seafood");

// LOGIN
const [loginEmail, setLoginEmail] = useState("");
const [showLoginPw, setShowLoginPw] = useState(false);
const [loginPassword, setLoginPassword] = useState("");

// PRODUCT UPLOAD
const [prodName, setProdName] = useState("");
const [prodCategory, setProdCategory] = useState("seafood");
const [prodSku, setProdSku] = useState("");
const [prodCaseCost, setProdCaseCost] = useState("");
const [prodCaseWeight, setProdCaseWeight] = useState("");
const [prodPieces, setProdPieces] = useState("");
const [prodPricePerLb, setProdPricePerLb] = useState("");
const [prodOrigin, setProdOrigin] = useState("");
const [prodPartNumber, setProdPartNumber] = useState("");
const [prodVin, setProdVin] = useState("");
const [prodYearMakeModel, setProdYearMakeModel] = useState("");
const [prodPhoto, setProdPhoto] = useState<File | null>(null);
const [prodPhotoPreview, setProdPhotoPreview] = useState("");
const [prodWhatsApp, setProdWhatsApp] = useState("");

// Check if current user is admin (Dedrick)
useEffect(() => {
async function checkAdmin() {
const { data: { user } } = await supabase.auth.getUser();
if (!user) return;
const { data: profile } = await supabase
.from("profiles")
.select("role")
.eq("id", user.id)
.single();
if (profile?.role === "control_admin") {
setIsAdmin(true);
setView("admin");
loadAdminData();
}
}
checkAdmin();
}, []);

async function loadAdminData() {
const { data: suppliers } = await supabase
.from("suppliers")
.select("*")
.order("created_at", { ascending: false });
if (suppliers) setPendingSuppliers(suppliers);

const { data: products } = await supabase
.from("supplier_products")
.select("*")
.order("created_at", { ascending: false });
if (products) setPendingProducts(products);
}

async function loadMyProducts(supplierId: string) {
const { data } = await supabase
.from("supplier_products")
.select("*")
.eq("supplier_id", supplierId)
.order("created_at", { ascending: false });
if (data) setMyProducts(data);
}

async function handleApproveSupplier(id: string) {
await supabase.from("suppliers").update({ status: "approved" }).eq("id", id);
setPendingSuppliers(prev =>
prev.map(s => s.id === id ? { ...s, status: "approved" } : s)
);
}

async function handleRejectSupplier(id: string) {
await supabase.from("suppliers").update({ status: "rejected" }).eq("id", id);
setPendingSuppliers(prev =>
prev.map(s => s.id === id ? { ...s, status: "rejected" } : s)
);
}

async function handleApproveProduct(id: string) {
await supabase.from("supplier_products").update({ status: "approved" }).eq("id", id);
setPendingProducts(prev =>
prev.map(p => p.id === id ? { ...p, status: "approved" } : p)
);
}

async function handleRejectProduct(id: string) {
await supabase.from("supplier_products").update({ status: "rejected" }).eq("id", id);
setPendingProducts(prev =>
prev.map(p => p.id === id ? { ...p, status: "rejected" } : p)
);
}

async function handleApply() {
setError("");
if (!appName || !appCompany || !appEmail || !appWhatsApp) {
setError("All fields required");
return;
}
setLoading(true);
const { error: err } = await supabase.from("suppliers").insert({
full_name: appName,
company_name: appCompany,
email: appEmail,
whatsapp: appWhatsApp,
category: appCategory,
status: "pending",
});
setLoading(false);
if (err) {
setError(err.message.includes("unique") ? "Email already registered" : err.message);
return;
}
setSuccess("Application submitted! Dedrick will review and contact you on WhatsApp within 24 hours.");
}

async function handleLogin() {
setError("");
if (!loginEmail || !loginPassword) {
setError("Email and password required");
return;
}
setLoading(true);
const { data, error: err } = await supabase.auth.signInWithPassword({
email: loginEmail,
password: loginPassword,
});
if (err) {
setError("Invalid credentials");
setLoading(false);
return;
}

// Check if admin
const { data: profile } = await supabase
.from("profiles")
.select("role")
.eq("id", data.user.id)
.single();

if (profile?.role === "control_admin") {
setIsAdmin(true);
setLoading(false);
setView("admin");
loadAdminData();
return;
}

const { data: sup } = await supabase
.from("suppliers")
.select("*")
.eq("email", data.user.email)
.single();

setLoading(false);
if (!sup) { setError("No supplier account found"); return; }
if (sup.status === "pending") { setError("Your application is still pending approval"); return; }
if (sup.status === "rejected") { setError("Your application was not approved. Contact BSC."); return; }

setSupplier(sup);
setProdWhatsApp(sup.whatsapp);
await loadMyProducts(sup.id);
setView("portal");
}

async function handleUpload() {
setError("");
if (!prodName || !prodCategory) {
setError("Product name and category required");
return;
}
setLoading(true);

let photoUrl = "";
if (prodPhoto) {
const fileName = Date.now() + "-" + prodPhoto.name;
const { error: uploadErr } = await supabase.storage
.from("product-images")
.upload(fileName, prodPhoto);
if (!uploadErr) {
const { data: urlData } = supabase.storage
.from("product-images")
.getPublicUrl(fileName);
photoUrl = urlData.publicUrl;
}
}

const caseCost = parseFloat(prodCaseCost) || 0;
const caseWeight = parseFloat(prodCaseWeight) || 0;
const pieces = parseFloat(prodPieces) || 1;
const dutyRate = getDutyRate(prodCategory, prodName);
const dutyAmount = caseCost * dutyRate;
const shippingCost = 400;
const totalCost = caseCost + dutyAmount + shippingCost;
const unitCost = pieces > 0 ? totalCost / pieces : totalCost;
const retailPrice = parseFloat((unitCost * 1.25).toFixed(2));
const wholesalePrice = parseFloat((unitCost * 1.12).toFixed(2));

const { error: err } = await supabase.from("supplier_products").insert({
supplier_id: supplier!.id,
supplier_name: supplier!.full_name,
supplier_whatsapp: prodWhatsApp || supplier!.whatsapp,
sku: prodSku,
name: prodName,
category: prodCategory,
photo_url: photoUrl,
case_cost: caseCost,
case_weight_lbs: caseWeight,
pieces_per_case: pieces,
price_per_lb: parseFloat(prodPricePerLb) || 0,
country_of_origin: prodOrigin,
part_number: prodPartNumber,
vin: prodVin,
year_make_model: prodYearMakeModel,
unit_cost: parseFloat(unitCost.toFixed(2)),
retail_price: retailPrice,
wholesale_price: wholesalePrice,
duty_rate: dutyRate,
duty_amount: parseFloat(dutyAmount.toFixed(2)),
shipping_cost: shippingCost,
status: "pending",
});

setLoading(false);
if (err) { setError(err.message); return; }

setSuccess("Product submitted! Retail: $" + retailPrice + " | Wholesale: $" + wholesalePrice);
await loadMyProducts(supplier!.id);
setProdName(""); setProdSku(""); setProdCaseCost(""); setProdCaseWeight("");
setProdPieces(""); setProdPricePerLb(""); setProdOrigin("");
setProdPartNumber(""); setProdVin(""); setProdYearMakeModel("");
setProdPhoto(null); setProdPhotoPreview("");
setView("portal");
}

const pg: React.CSSProperties = {
padding: 18,
backgroundColor: "#0a0f1e",
minHeight: "100vh",
color: "#fff",
fontFamily: "sans-serif",
paddingBottom: 80,
maxWidth: 560,
margin: "0 auto",
};

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

const primaryBtn: React.CSSProperties = {
width: "100%",
padding: "13px",
borderRadius: 10,
backgroundColor: "#f5c518",
color: "#000",
fontWeight: "bold",
border: "none",
fontSize: 15,
cursor: "pointer",
marginBottom: 10,
};

const secondaryBtn: React.CSSProperties = {
width: "100%",
padding: "11px",
borderRadius: 10,
backgroundColor: "transparent",
color: "#6b7280",
border: "1px solid #1e2d4a",
fontSize: 14,
cursor: "pointer",
marginBottom: 10,
};

const card: React.CSSProperties = {
backgroundColor: "#111c33",
borderRadius: 12,
padding: "14px 16px",
marginBottom: 12,
border: "1px solid #1e2d4a",
};

const statusBadge = (status: string): React.CSSProperties => ({
padding: "3px 10px",
borderRadius: 20,
fontSize: 11,
fontWeight: "bold",
backgroundColor:
status === "approved" ? "#0a1f0a" :
status === "rejected" ? "#2d0000" : "#1a1400",
color:
status === "approved" ? "#4ade80" :
status === "rejected" ? "#f87171" : "#f5c518",
border: "1px solid " + (
status === "approved" ? "#4ade80" :
status === "rejected" ? "#f87171" : "#f5c518"
),
});

// ADMIN VIEW
if (view === "admin") return (
<div style={pg}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
<div>
<h2 style={{ margin: 0, color: "#f5c518", fontSize: 20 }}>Supplier Admin</h2>
<p style={{ margin: "2px 0 0", color: "#4a5568", fontSize: 11 }}>Dedrick Storr · Control Admin</p>
</div>
<button
onClick={() => supabase.auth.signOut().then(() => { setIsAdmin(false); setView("home"); })}
style={{ background: "none", border: "none", color: "#6b7280", fontSize: 12, cursor: "pointer" }}
>
Sign Out
</button>
</div>

{/* STATS ROW */}
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
<div style={{ ...card, textAlign: "center", padding: 14 }}>
<p style={{ margin: 0, color: "#f5c518", fontSize: 22, fontWeight: "bold" }}>
{pendingSuppliers.filter(s => s.status === "pending").length}
</p>
<p style={{ margin: "4px 0 0", color: "#4a5568", fontSize: 10 }}>PENDING</p>
</div>
<div style={{ ...card, textAlign: "center", padding: 14 }}>
<p style={{ margin: 0, color: "#4ade80", fontSize: 22, fontWeight: "bold" }}>
{pendingSuppliers.filter(s => s.status === "approved").length}
</p>
<p style={{ margin: "4px 0 0", color: "#4a5568", fontSize: 10 }}>APPROVED</p>
</div>
<div style={{ ...card, textAlign: "center", padding: 14 }}>
<p style={{ margin: 0, color: "#60a5fa", fontSize: 22, fontWeight: "bold" }}>
{pendingProducts.filter(p => p.status === "approved").length}
</p>
<p style={{ margin: "4px 0 0", color: "#4a5568", fontSize: 10 }}>PRODUCTS</p>
</div>
</div>

{/* TABS */}
<div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
<button
onClick={() => setAdminTab("suppliers")}
style={{
flex: 1, padding: "10px", borderRadius: 10,
backgroundColor: adminTab === "suppliers" ? "#f5c518" : "#111c33",
color: adminTab === "suppliers" ? "#000" : "#6b7280",
border: "1px solid #1e2d4a", fontWeight: "bold", cursor: "pointer", fontSize: 13,
}}
>
Suppliers ({pendingSuppliers.length})
</button>
<button
onClick={() => setAdminTab("products")}
style={{
flex: 1, padding: "10px", borderRadius: 10,
backgroundColor: adminTab === "products" ? "#f5c518" : "#111c33",
color: adminTab === "products" ? "#000" : "#6b7280",
border: "1px solid #1e2d4a", fontWeight: "bold", cursor: "pointer", fontSize: 13,
}}
>
Products ({pendingProducts.filter(p => p.status === "pending").length} pending)
</button>
</div>

{/* SUPPLIERS LIST */}
{adminTab === "suppliers" && (
<>
{pendingSuppliers.length === 0 && (
<div style={{ ...card, textAlign: "center", padding: 30 }}>
<p style={{ color: "#4a5568", margin: 0 }}>No supplier applications yet</p>
</div>
)}
{pendingSuppliers.map((sup) => (
<div key={sup.id} style={card}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
<div>
<p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{sup.full_name}</p>
<p style={{ margin: "2px 0", color: "#4a5568", fontSize: 12 }}>{sup.company_name}</p>
<p style={{ margin: "2px 0", color: "#60a5fa", fontSize: 12 }}>{sup.email}</p>
</div>
<span style={statusBadge(sup.status)}>{sup.status.toUpperCase()}</span>
</div>

<div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
<span style={{
padding: "3px 10px", borderRadius: 20, fontSize: 11,
backgroundColor: "#111c33", color: "#a78bfa", border: "1px solid #1e2d4a",
}}>
{sup.category}
</span>
<a
href={"https://wa.me/" + sup.whatsapp.replace(/\D/g, "")}
target="_blank"
rel="noopener noreferrer"
style={{
padding: "3px 12px", borderRadius: 20, fontSize: 11,
backgroundColor: "#0a2010", color: "#4ade80",
border: "1px solid #4ade80", textDecoration: "none", fontWeight: "bold",
}}
>
WhatsApp {sup.whatsapp}
</a>
</div>

{sup.status === "pending" && (
<div style={{ display: "flex", gap: 8 }}>
<button
onClick={() => handleApproveSupplier(sup.id)}
style={{
flex: 1, padding: "10px", borderRadius: 10,
backgroundColor: "#f5c518", color: "#000",
fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 13,
}}
>
Approve
</button>
<button
onClick={() => handleRejectSupplier(sup.id)}
style={{
flex: 1, padding: "10px", borderRadius: 10,
backgroundColor: "#3b0000", color: "#f87171",
border: "1px solid #7f1d1d", cursor: "pointer", fontSize: 13,
}}
>
Reject
</button>
</div>
)}
</div>
))}
</>
)}

{/* PRODUCTS LIST */}
{adminTab === "products" && (
<>
{pendingProducts.length === 0 && (
<div style={{ ...card, textAlign: "center", padding: 30 }}>
<p style={{ color: "#4a5568", margin: 0 }}>No products submitted yet</p>
</div>
)}
{pendingProducts.map((prod) => (
<div key={prod.id} style={card}>
<div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
{prod.photo_url && (
<img
src={prod.photo_url}
alt={prod.name}
style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover" }}
/>
)}
<div style={{ flex: 1 }}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
<p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{prod.name}</p>
<span style={statusBadge(prod.status)}>{prod.status.toUpperCase()}</span>
</div>
<p style={{ margin: "2px 0", color: "#4a5568", fontSize: 12 }}>
By {prod.supplier_name}
</p>
<a
href={"https://wa.me/" + prod.supplier_whatsapp.replace(/\D/g, "")}
target="_blank"
rel="noopener noreferrer"
style={{ color: "#4ade80", fontSize: 11, textDecoration: "none" }}
>
WhatsApp {prod.supplier_whatsapp}
</a>
</div>
</div>

<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
<div style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "8px 10px" }}>
<p style={{ margin: 0, color: "#4a5568", fontSize: 10 }}>RETAIL</p>
<p style={{ margin: "2px 0 0", color: "#4ade80", fontWeight: "bold", fontSize: 14 }}>
${prod.retail_price?.toFixed(2)}
</p>
</div>
<div style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "8px 10px" }}>
<p style={{ margin: 0, color: "#4a5568", fontSize: 10 }}>WHOLESALE</p>
<p style={{ margin: "2px 0 0", color: "#f5c518", fontWeight: "bold", fontSize: 14 }}>
${prod.wholesale_price?.toFixed(2)}
</p>
</div>
<div style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "8px 10px" }}>
<p style={{ margin: 0, color: "#4a5568", fontSize: 10 }}>DUTY</p>
<p style={{ margin: "2px 0 0", color: "#60a5fa", fontWeight: "bold", fontSize: 14 }}>
{((prod.duty_rate || 0) * 100).toFixed(0)}%
</p>
</div>
</div>

{prod.sku && (
<p style={{ margin: "0 0 8px", color: "#4a5568", fontSize: 11 }}>SKU: {prod.sku}</p>
)}

{prod.status === "pending" && (
<div style={{ display: "flex", gap: 8 }}>
<button
onClick={() => handleApproveProduct(prod.id)}
style={{
flex: 1, padding: "10px", borderRadius: 10,
backgroundColor: "#f5c518", color: "#000",
fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 13,
}}
>
Approve & Go Live
</button>
<button
onClick={() => handleRejectProduct(prod.id)}
style={{
flex: 1, padding: "10px", borderRadius: 10,
backgroundColor: "#3b0000", color: "#f87171",
border: "1px solid #7f1d1d", cursor: "pointer", fontSize: 13,
}}
>
Reject
</button>
</div>
)}
</div>
))}
</>
)}
</div>
);

// HOME
if (view === "home") return (
<div style={pg}>
<div style={{ textAlign: "center", marginBottom: 32, paddingTop: 20 }}>
<div style={{ fontSize: 48, marginBottom: 10 }}>🚢</div>
<h1 style={{ margin: 0, color: "#f5c518", fontSize: 22 }}>BSC Supplier Portal</h1>
<p style={{ margin: "6px 0 0", color: "#4a5568", fontSize: 13 }}>
Bahamian Seafood Connection
</p>
</div>
<div style={{ ...card, marginBottom: 16 }}>
<p style={{ margin: "0 0 4px", fontWeight: "bold", fontSize: 15 }}>New Supplier?</p>
<p style={{ margin: "0 0 14px", color: "#4a5568", fontSize: 13 }}>
Apply to become a BSC supplier. Dedrick will review and contact you on WhatsApp.
</p>
<button onClick={() => setView("apply")} style={primaryBtn}>Apply Now</button>
</div>
<div style={card}>
<p style={{ margin: "0 0 4px", fontWeight: "bold", fontSize: 15 }}>Already Approved?</p>
<p style={{ margin: "0 0 14px", color: "#4a5568", fontSize: 13 }}>
Login to upload and manage your products.
</p>
<button onClick={() => setView("login")} style={secondaryBtn}>Supplier Login</button>
</div>
</div>
);

// APPLY
if (view === "apply") return (
<div style={pg}>
<button
onClick={() => { setView("home"); setSuccess(""); setError(""); }}
style={{ background: "none", border: "none", color: "#f5c518", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}
>
Back
</button>
<h2 style={{ color: "#f5c518", marginTop: 0, marginBottom: 4 }}>Supplier Application</h2>
<p style={{ color: "#4a5568", fontSize: 13, marginBottom: 20 }}>
Dedrick will review and contact you on WhatsApp within 24 hours.
</p>

{success ? (
<div style={{ backgroundColor: "#0a1f0a", border: "1px solid #4ade80", borderRadius: 12, padding: 20, textAlign: "center" }}>
<p style={{ color: "#4ade80", fontSize: 15, margin: "0 0 16px" }}>{success}</p>
<button onClick={() => { setView("home"); setSuccess(""); }} style={secondaryBtn}>Back to Home</button>
</div>
) : (
<>
<label style={lbl}>Full Name</label>
<input placeholder="Your full name" value={appName} onChange={(e) => setAppName(e.target.value)} style={inp} />
<label style={lbl}>Company Name</label>
<input placeholder="Business or company name" value={appCompany} onChange={(e) => setAppCompany(e.target.value)} style={inp} />
<label style={lbl}>Email Address</label>
<input type="email" placeholder="your@email.com" value={appEmail} onChange={(e) => setAppEmail(e.target.value)} style={inp} />
<label style={lbl}>WhatsApp Number</label>
<input placeholder="242-xxx-xxxx" value={appWhatsApp} onChange={(e) => setAppWhatsApp(e.target.value)} style={inp} />
<label style={lbl}>Supplier Category</label>
<select value={appCategory} onChange={(e) => setAppCategory(e.target.value)} style={inp}>
{CATEGORIES.map((c) => (
<option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
))}
</select>
{error && (
<p style={{ color: "#f87171", fontSize: 13, backgroundColor: "#2d0000", padding: "10px 12px", borderRadius: 8, marginBottom: 12 }}>
{error}
</p>
)}
<button
onClick={handleApply}
disabled={loading}
style={{ ...primaryBtn, backgroundColor: loading ? "#555" : "#f5c518", cursor: loading ? "not-allowed" : "pointer" }}
>
{loading ? "Submitting..." : "Submit Application"}
</button>
</>
)}
</div>
);

// LOGIN
if (view === "login") return (
<div style={pg}>
<button
onClick={() => { setView("home"); setError(""); }}
style={{ background: "none", border: "none", color: "#f5c518", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}
>
Back
</button>
<h2 style={{ color: "#f5c518", marginTop: 0, marginBottom: 4 }}>Supplier Login</h2>
<p style={{ color: "#4a5568", fontSize: 13, marginBottom: 20 }}>
Login with your approved supplier credentials
</p>
<label style={lbl}>Email</label>
<input
type="email"
placeholder="your@email.com"
value={loginEmail}
onChange={(e) => setLoginEmail(e.target.value)}
style={inp}
/>
<label style={lbl}>Password</label>
<div style={{ position: "relative", marginBottom: 12 }}>
<input
type={showLoginPw ? "text" : "password"}
placeholder="Password"
value={loginPassword}
onChange={(e) => setLoginPassword(e.target.value)}
style={{ ...inp, marginBottom: 0, paddingRight: 46 }}
/>
<button
onClick={() => setShowLoginPw(!showLoginPw)}
style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#6b7280", padding: 0 }}
>
{showLoginPw ? "🙈" : "👁"}
</button>
</div>
{error && (
<p style={{ color: "#f87171", fontSize: 13, backgroundColor: "#2d0000", padding: "10px 12px", borderRadius: 8, marginBottom: 12 }}>
{error}
</p>
)}
<button
onClick={handleLogin}
disabled={loading}
style={{ ...primaryBtn, backgroundColor: loading ? "#555" : "#f5c518", cursor: loading ? "not-allowed" : "pointer" }}
>
{loading ? "Signing in..." : "Sign In"}
</button>
</div>
);

// PORTAL
if (view === "portal") return (
<div style={pg}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
<div>
<h2 style={{ margin: 0, color: "#f5c518", fontSize: 18 }}>My Products</h2>
<p style={{ margin: "2px 0 0", color: "#4a5568", fontSize: 12 }}>{supplier?.company_name}</p>
</div>
<button
onClick={() => supabase.auth.signOut().then(() => { setSupplier(null); setMyProducts([]); setView("home"); })}
style={{ background: "none", border: "none", color: "#6b7280", fontSize: 12, cursor: "pointer" }}
>
Sign Out
</button>
</div>

{success && (
<div style={{ backgroundColor: "#0a1f0a", border: "1px solid #4ade80", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
<p style={{ margin: 0, color: "#4ade80", fontSize: 13 }}>{success}</p>
</div>
)}

<button onClick={() => { setView("upload"); setSuccess(""); setError(""); }} style={primaryBtn}>
+ Upload New Product
</button>

{myProducts.length === 0 ? (
<div style={{ ...card, textAlign: "center", padding: 30 }}>
<p style={{ margin: 0, color: "#4a5568", fontSize: 13 }}>
No products yet. Upload your first product above.
</p>
</div>
) : myProducts.map((prod) => (
<div key={prod.id} style={card}>
<div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
{prod.photo_url && (
<img src={prod.photo_url} alt={prod.name} style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} />
)}
<div style={{ flex: 1 }}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
<p style={{ margin: 0, fontWeight: "bold", fontSize: 14 }}>{prod.name}</p>
<span style={statusBadge(prod.status)}>{prod.status.toUpperCase()}</span>
</div>
<p style={{ margin: "4px 0 2px", color: "#4ade80", fontSize: 13 }}>
Retail: ${prod.retail_price?.toFixed(2)}
</p>
<p style={{ margin: 0, color: "#f5c518", fontSize: 12 }}>
Wholesale: ${prod.wholesale_price?.toFixed(2)}
</p>
{prod.sku && <p style={{ margin: "2px 0 0", color: "#4a5568", fontSize: 11 }}>SKU: {prod.sku}</p>}
</div>
</div>
</div>
))}
</div>
);

// UPLOAD
if (view === "upload") return (
<div style={pg}>
<button
onClick={() => { setView("portal"); setSuccess(""); setError(""); }}
style={{ background: "none", border: "none", color: "#f5c518", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}
>
Back
</button>
<h2 style={{ color: "#f5c518", marginTop: 0, marginBottom: 4 }}>Upload Product</h2>
<p style={{ color: "#4a5568", fontSize: 13, marginBottom: 20 }}>
BSC will auto-calculate retail and wholesale prices.
</p>

{success && (
<div style={{ backgroundColor: "#0a1f0a", border: "1px solid #4ade80", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
<p style={{ margin: 0, color: "#4ade80", fontSize: 14, fontWeight: "bold" }}>{success}</p>
</div>
)}

<label style={lbl}>Product Photo</label>
<div
onClick={() => document.getElementById("photoInput")?.click()}
style={{
width: "100%", height: 140, borderRadius: 12,
border: "2px dashed #1e2d4a", display: "flex",
alignItems: "center", justifyContent: "center",
cursor: "pointer", marginBottom: 14, overflow: "hidden",
backgroundColor: "#111c33",
}}
>
{prodPhotoPreview ? (
<img src={prodPhotoPreview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
) : (
<div style={{ textAlign: "center" }}>
<p style={{ margin: 0, fontSize: 28 }}>📷</p>
<p style={{ margin: "6px 0 0", color: "#4a5568", fontSize: 12 }}>Tap to take photo or upload</p>
</div>
)}
</div>
<input
id="photoInput"
type="file"
accept="image/*"
capture="environment"
style={{ display: "none" }}
onChange={(e) => {
const file = e.target.files?.[0];
if (file) { setProdPhoto(file); setProdPhotoPreview(URL.createObjectURL(file)); }
}}
/>

<label style={lbl}>Product Name</label>
<input placeholder="e.g. Grouper Fillet" value={prodName} onChange={(e) => setProdName(e.target.value)} style={inp} />

<label style={lbl}>Category</label>
<select value={prodCategory} onChange={(e) => setProdCategory(e.target.value)} style={inp}>
{CATEGORIES.map((c) => (
<option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
))}
</select>

<label style={lbl}>SKU / Product Code</label>
<input placeholder="Unique product code" value={prodSku} onChange={(e) => setProdSku(e.target.value)} style={inp} />

<label style={lbl}>WhatsApp Contact</label>
<input placeholder="242-xxx-xxxx" value={prodWhatsApp} onChange={(e) => setProdWhatsApp(e.target.value)} style={inp} />

{(prodCategory === "seafood" || prodCategory === "poultry" || prodCategory === "meat" || prodCategory === "general") && (
<>
<div style={{ backgroundColor: "#0a1220", borderRadius: 10, padding: "12px 14px", marginBottom: 14, border: "1px solid #1e2d4a" }}>
<p style={{ margin: "0 0 10px", color: "#60a5fa", fontSize: 12, fontWeight: "bold" }}>FOOD / SEAFOOD DETAILS</p>
<label style={lbl}>Case Cost Price ($)</label>
<input type="number" placeholder="0.00" value={prodCaseCost} onChange={(e) => setProdCaseCost(e.target.value)} style={inp} />
<label style={lbl}>Total Weight Per Case (lbs)</label>
<input type="number" placeholder="0" value={prodCaseWeight} onChange={(e) => setProdCaseWeight(e.target.value)} style={inp} />
<label style={lbl}>Pieces Per Case</label>
<input type="number" placeholder="0" value={prodPieces} onChange={(e) => setProdPieces(e.target.value)} style={inp} />
<label style={lbl}>Price Per Pound ($)</label>
<input type="number" placeholder="0.00" value={prodPricePerLb} onChange={(e) => setProdPricePerLb(e.target.value)} style={inp} />
<label style={lbl}>Country of Origin</label>
<input placeholder="e.g. USA, Canada" value={prodOrigin} onChange={(e) => setProdOrigin(e.target.value)} style={inp} />
</div>

{prodCaseCost && prodPieces && (
<div style={{ backgroundColor: "#0f1f0f", border: "1px solid #4ade80", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
<p style={{ margin: "0 0 8px", color: "#4ade80", fontSize: 12, fontWeight: "bold" }}>ESTIMATED PRICING</p>
{(() => {
const cost = parseFloat(prodCaseCost) || 0;
const pcs = parseFloat(prodPieces) || 1;
const duty = getDutyRate(prodCategory, prodName);
const dutyAmt = cost * duty;
const total = cost + dutyAmt + 400;
const unit = total / pcs;
return (
<>
<p style={{ margin: "2px 0", color: "#aaa", fontSize: 12 }}>Duty ({(duty * 100).toFixed(0)}%): +${dutyAmt.toFixed(2)}</p>
<p style={{ margin: "2px 0", color: "#aaa", fontSize: 12 }}>Shipping: +$400.00</p>
<p style={{ margin: "2px 0", color: "#aaa", fontSize: 12 }}>Unit Cost: ${unit.toFixed(2)}</p>
<p style={{ margin: "6px 0 2px", color: "#4ade80", fontWeight: "bold", fontSize: 13 }}>Retail: ${(unit * 1.25).toFixed(2)}</p>
<p style={{ margin: "2px 0", color: "#f5c518", fontWeight: "bold", fontSize: 13 }}>Wholesale: ${(unit * 1.12).toFixed(2)}</p>
</>
);
})()}
</div>
)}
</>
)}

{prodCategory === "auto" && (
<div style={{ backgroundColor: "#0a1220", borderRadius: 10, padding: "12px 14px", marginBottom: 14, border: "1px solid #1e2d4a" }}>
<p style={{ margin: "0 0 10px", color: "#a78bfa", fontSize: 12, fontWeight: "bold" }}>AUTO PART DETAILS</p>
<label style={lbl}>Part Number</label>
<input placeholder="OEM/Aftermarket part number" value={prodPartNumber} onChange={(e) => setProdPartNumber(e.target.value)} style={inp} />
<label style={lbl}>VIN (if applicable)</label>
<input placeholder="Vehicle VIN number" value={prodVin} onChange={(e) => setProdVin(e.target.value)} style={inp} />
<label style={lbl}>Year / Make / Model</label>
<input placeholder="e.g. 2018 Toyota Camry" value={prodYearMakeModel} onChange={(e) => setProdYearMakeModel(e.target.value)} style={inp} />
<label style={lbl}>Unit Price ($)</label>
<input type="number" placeholder="0.00" value={prodCaseCost} onChange={(e) => setProdCaseCost(e.target.value)} style={inp} />
</div>
)}

{prodCategory === "vehicle" && (
<div style={{ backgroundColor: "#0a1220", borderRadius: 10, padding: "12px 14px", marginBottom: 14, border: "1px solid #1e2d4a" }}>
<p style={{ margin: "0 0 10px", color: "#f87171", fontSize: 12, fontWeight: "bold" }}>VEHICLE DETAILS</p>
<label style={lbl}>VIN Number</label>
<input placeholder="Full VIN number" value={prodVin} onChange={(e) => setProdVin(e.target.value)} style={inp} />
<label style={lbl}>Year / Make / Model</label>
<input placeholder="e.g. 2020 Honda Civic" value={prodYearMakeModel} onChange={(e) => setProdYearMakeModel(e.target.value)} style={inp} />
<label style={lbl}>Price ($)</label>
<input type="number" placeholder="0.00" value={prodCaseCost} onChange={(e) => setProdCaseCost(e.target.value)} style={inp} />
</div>
)}

{error && (
<p style={{ color: "#f87171", fontSize: 13, backgroundColor: "#2d0000", padding: "10px 12px", borderRadius: 8, marginBottom: 12 }}>
{error}
</p>
)}

<button
onClick={handleUpload}
disabled={loading}
style={{ ...primaryBtn, backgroundColor: loading ? "#555" : "#f5c518", cursor: loading ? "not-allowed" : "pointer" }}
>
{loading ? "Uploading..." : "Submit for Approval"}
</button>
</div>
);

return null;
}
