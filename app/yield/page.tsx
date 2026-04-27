“use client”;

import { useState, useEffect } from “react”;
import { createClient } from “@supabase/supabase-js”;

// ── Supabase client ────────────────────────────────────────────────────────
const supabase = createClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── BSC Margin constants ───────────────────────────────────────────────────
const MARGINS = {
nassau: 0.38,
andros: 0.43,
online: 0.25,
wholesale: 0.15,
};

// ── Lot number generator: BSC-YYYYMMDD-NNN ────────────────────────────────
function buildLotNumber(seq: number): string {
const now = new Date();
const y = now.getFullYear();
const m = String(now.getMonth() + 1).padStart(2, “0”);
const d = String(now.getDate()).padStart(2, “0”);
const s = String(seq).padStart(3, “0”);
return `BSC-${y}${m}${d}-${s}`;
}

async function getNextSequence(): Promise<number> {
const today = new Date();
const y = today.getFullYear();
const m = String(today.getMonth() + 1).padStart(2, “0”);
const d = String(today.getDate()).padStart(2, “0”);
const prefix = `BSC-${y}${m}${d}-`;

const { data } = await supabase
.from(“yield_lots”)
.select(“lot_number”)
.like(“lot_number”, `${prefix}%`)
.order(“lot_number”, { ascending: false })
.limit(1);

if (data && data.length > 0) {
const last = data[0].lot_number.split(”-”)[2];
return parseInt(last, 10) + 1;
}
return 1;
}

// ── Channel price calculator ───────────────────────────────────────────────
function calcPrices(trueCostPerLb: number) {
return {
nassau: +(trueCostPerLb / (1 - MARGINS.nassau)).toFixed(2),
andros: +(trueCostPerLb / (1 - MARGINS.andros)).toFixed(2),
online: +(trueCostPerLb / (1 - MARGINS.online)).toFixed(2),
wholesale: +(trueCostPerLb / (1 - MARGINS.wholesale)).toFixed(2),
};
}

// ── Print helpers ──────────────────────────────────────────────────────────
function openPrint(html: string) {
const w = window.open(””, “_blank”, “width=900,height=650”);
if (!w) return;
w.document.write(html);
w.document.close();
w.focus();
setTimeout(() => w.print(), 400);
}

function labelHTML(lot: LotRecord): string {
const ch = calcPrices(lot.true_cost_per_lb);
return `<!DOCTYPE html><html><head><title>Label ${lot.lot_number}</title>

<style>
@page { size: 100mm 60mm; margin: 3mm; }
body { font-family: 'Courier New', monospace; font-size: 9pt; margin: 0; padding: 2mm; }
.lot { font-size: 13pt; font-weight: bold; letter-spacing: 1px; }
hr { border: none; border-top: 1px solid #000; margin: 2mm 0; }
.row { display: flex; justify-content: space-between; margin-bottom: 1mm; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm; margin-top: 2mm; }
.cell { border: 1px solid #333; padding: 1mm 2mm; font-size: 8pt; }
.foot { font-size: 7pt; color: #666; text-align: center; margin-top: 2mm; }
</style></head><body>

<div class="lot">${lot.lot_number}</div>
<hr/>
<div class="row"><b>${lot.product_type}</b><span>${new Date(lot.created_at).toLocaleDateString()}</span></div>
<div class="row"><span>Captain: ${lot.captain_name}</span><span>Boat: ${lot.boat_reg}</span></div>
<div class="row"><span>Clean Wt: <b>${lot.clean_weight_lb} lbs</b></span><span>Yield: <b>${lot.yield_pct}%</b></span></div>
<hr/>
<div class="grid">
<div class="cell"><b>Nassau</b><br>$${ch.nassau}/lb</div>
<div class="cell"><b>Andros</b><br>$${ch.andros}/lb</div>
<div class="cell"><b>Online</b><br>$${ch.online}/lb</div>
<div class="cell"><b>Wholesale</b><br>$${ch.wholesale}/lb</div>
</div>
<div class="foot">BSC Marketplace · bscbahamas.com</div>
</body></html>`;
}

function docHTML(lot: LotRecord): string {
const ch = calcPrices(lot.true_cost_per_lb);
const lost = (lot.whole_weight_lb - lot.clean_weight_lb).toFixed(2);
return `<!DOCTYPE html><html><head><title>Lot ${lot.lot_number}</title>

<style>
@page { margin: 20mm; }
body { font-family: Georgia, serif; font-size: 11pt; color: #111; }
h2 { font-size: 12pt; border-bottom: 2px solid #000; padding-bottom: 2mm; margin-top: 8mm; }
table { width: 100%; border-collapse: collapse; margin-top: 4mm; }
td,th { border: 1px solid #ccc; padding: 3mm 4mm; }
th { background: #f0f0f0; font-weight: bold; text-align: left; }
.lot { font-family: 'Courier New', monospace; font-size: 22pt; font-weight: bold; letter-spacing: 2px; }
.meta { font-size: 9pt; color: #444; }
.sigs { display: flex; gap: 20mm; margin-top: 16mm; }
.sig { flex: 1; border-top: 1px solid #000; padding-top: 2mm; font-size: 9pt; }
.foot { margin-top: 12mm; font-size: 8pt; color: #888; border-top: 1px solid #ccc; padding-top: 3mm; }
</style></head><body>

<div style="display:flex;justify-content:space-between;align-items:flex-start;">
<div>
<div class="meta" style="letter-spacing:2px;font-weight:bold;">BSC MARKETPLACE — YIELD PROCESSING RECORD</div>
<div class="lot">${lot.lot_number}</div>
</div>
<div class="meta" style="text-align:right;">
<div><b>bscbahamas.com</b></div>
<div>+1 (242) 361-3474</div>
<div>Date: ${new Date(lot.created_at).toLocaleString()}</div>
<div>Processed By: ${lot.processed_by}</div>
</div>
</div>

<h2>Supplier &amp; Catch</h2>
<table>
<tr><th>Captain Name</th><td>${lot.captain_name}</td><th>Boat Registration</th><td>${lot.boat_reg}</td></tr>
<tr><th>Product Type</th><td colspan="3">${lot.product_type}</td></tr>
</table>

<h2>Yield Calculation</h2>
<table>
<tr><th>Whole Weight In</th><td>${lot.whole_weight_lb} lbs</td><th>Clean Weight Out</th><td>${lot.clean_weight_lb} lbs</td></tr>
<tr><th>Weight Lost</th><td>${lost} lbs</td><th>Yield %</th><td><b>${lot.yield_pct}%</b></td></tr>
<tr><th>Total Cost Paid</th><td>$${Number(lot.cost_paid).toFixed(2)}</td><th>True Cost / lb</th><td><b>$${Number(lot.true_cost_per_lb).toFixed(2)}</b></td></tr>
</table>

<h2>Channel Pricing</h2>
<table>
<tr><th>Nassau POS (38% margin)</th><td><b>$${ch.nassau} / lb</b></td></tr>
<tr><th>Andros POS (43% margin)</th><td><b>$${ch.andros} / lb</b></td></tr>
<tr><th>Online Marketplace (25% margin)</th><td><b>$${ch.online} / lb</b></td></tr>
<tr><th>Wholesale (15% margin)</th><td><b>$${ch.wholesale} / lb</b></td></tr>
</table>

<div class="sigs">
<div class="sig">Operator Signature</div>
<div class="sig">Supervisor / Manager Signature</div>
<div class="sig">Date Approved</div>
</div>

<div class="foot">
Lot ${lot.lot_number} · Generated ${new Date().toLocaleString()} ·
BSC Marketplace — Bahamian Seafood Connection ·
Owned by Dedrick Tamico Storr Snr &amp; Jaquel Rolle-Storr &amp; Family · All Rights Reserved
</div>
</body></html>`;
}

// ── Types ──────────────────────────────────────────────────────────────────
interface LotRecord {
id?: string;
lot_number: string;
captain_name: string;
boat_reg: string;
product_type: string;
whole_weight_lb: number;
clean_weight_lb: number;
yield_pct: number;
cost_paid: number;
true_cost_per_lb: number;
nassau_price: number;
andros_price: number;
online_price: number;
wholesale_price: number;
processed_by: string;
created_at: string;
}

interface Calcs {
yieldPct: number;
trueCost: number;
channels: ReturnType<typeof calcPrices>;
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ══════════════════════════════════════════════════════════════════════════
export default function YieldPage() {
const [processedBy, setProcessedBy] = useState(“Staff”);

const blank = {
captain_name: “”,
boat_reg: “”,
product_type: “”,
whole_weight_lb: “”,
clean_weight_lb: “”,
cost_paid: “”,
};

const [form, setForm] = useState(blank);
const [calcs, setCalcs] = useState<Calcs | null>(null);
const [saving, setSaving] = useState(false);
const [saved, setSaved] = useState<LotRecord | null>(null);
const [history, setHistory] = useState<LotRecord[]>([]);
const [tab, setTab] = useState<“entry” | “history”>(“entry”);
const [search, setSearch] = useState(””);
const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
const [openLot, setOpenLot] = useState<string | null>(null);

// Get logged-in user
useEffect(() => {
supabase.auth.getUser().then(({ data }) => {
if (data?.user?.email) {
setProcessedBy(data.user.email.split(”@”)[0]);
}
});
loadHistory();
}, []);

// Live calculation
useEffect(() => {
const w = parseFloat(form.whole_weight_lb);
const c = parseFloat(form.clean_weight_lb);
const cost = parseFloat(form.cost_paid);
if (w > 0 && c > 0 && c <= w && cost > 0) {
const yieldPct = +((c / w) * 100).toFixed(1);
const trueCost = +(cost / c).toFixed(4);
setCalcs({ yieldPct, trueCost, channels: calcPrices(trueCost) });
} else {
setCalcs(null);
}
}, [form.whole_weight_lb, form.clean_weight_lb, form.cost_paid]);

async function loadHistory() {
const { data } = await supabase
.from(“yield_lots”)
.select(”*”)
.order(“created_at”, { ascending: false })
.limit(100);
setHistory(data || []);
}

function showToast(msg: string, ok = true) {
setToast({ msg, ok });
setTimeout(() => setToast(null), 3500);
}

async function handleSave() {
if (!calcs) return;
setSaving(true);
try {
const seq = await getNextSequence();
const lot_number = buildLotNumber(seq);
const record: LotRecord = {
lot_number,
captain_name: form.captain_name.trim(),
boat_reg: form.boat_reg.trim(),
product_type: form.product_type.trim(),
whole_weight_lb: parseFloat(form.whole_weight_lb),
clean_weight_lb: parseFloat(form.clean_weight_lb),
yield_pct: calcs.yieldPct,
cost_paid: parseFloat(form.cost_paid),
true_cost_per_lb: calcs.trueCost,
nassau_price: calcs.channels.nassau,
andros_price: calcs.channels.andros,
online_price: calcs.channels.online,
wholesale_price: calcs.channels.wholesale,
processed_by: processedBy,
created_at: new Date().toISOString(),
};

```
const { error } = await supabase.from("yield_lots").insert([record]);
if (error) throw error;

setSaved(record);
setHistory((h) => [record, ...h]);
setForm(blank);
setCalcs(null);
showToast(`Lot ${lot_number} saved successfully`);
} catch (e: any) {
showToast("Save failed: " + e.message, false);
} finally {
setSaving(false);
}
```

}

const filtered = history.filter((h) =>
!search ||
h.lot_number.toLowerCase().includes(search.toLowerCase()) ||
h.captain_name.toLowerCase().includes(search.toLowerCase()) ||
h.product_type.toLowerCase().includes(search.toLowerCase()) ||
h.boat_reg.toLowerCase().includes(search.toLowerCase())
);

// ── Render ───────────────────────────────────────────────────────────────
return (
<div className="yield-page">
{/* Toast */}
{toast && (
<div className={`toast ${toast.ok ? "toast-ok" : "toast-err"}`}>
{toast.ok ? “✓” : “✗”} {toast.msg}
</div>
)}

```
{/* Header */}
<div className="yield-header">
<div>
<div className="yield-eyebrow">BSC MARKETPLACE</div>
<div className="yield-title">Yield Calculator</div>
</div>
<div className="yield-tabs">
<button
className={tab === "entry" ? "ytab ytab-active" : "ytab"}
onClick={() => setTab("entry")}
>
New Entry
</button>
<button
className={tab === "history" ? "ytab ytab-active" : "ytab"}
onClick={() => setTab("history")}
>
Lot History
{history.length > 0 && (
<span className="ytab-badge">{history.length}</span>
)}
</button>
</div>
</div>

{/* ── ENTRY TAB ── */}
{tab === "entry" && (
<div className="yield-body">

{/* Saved lot banner */}
{saved && (
<div className="saved-banner">
<div className="saved-lot">{saved.lot_number}</div>
<div className="saved-sub">Saved · {saved.product_type}</div>
<div className="saved-actions">
<button className="btn-label" onClick={() => openPrint(labelHTML(saved))}>
🏷 Print Label
</button>
<button className="btn-doc" onClick={() => openPrint(docHTML(saved))}>
📄 Print Document
</button>
<button className="btn-clear" onClick={() => setSaved(null)}>
✕ Dismiss
</button>
</div>
</div>
)}

<div className="yield-grid">
{/* LEFT — Form */}
<div className="ycard">
<div className="ycard-title">Catch Information</div>

<label className="ylabel">Captain Name <span className="req">*</span></label>
<input
className="yinput"
placeholder="Enter captain's full name"
value={form.captain_name}
onChange={(e) => setForm({ ...form, captain_name: e.target.value })}
/>

<label className="ylabel">Boat Registration # <span className="req">*</span></label>
<input
className="yinput"
placeholder="e.g. BS-1234"
value={form.boat_reg}
onChange={(e) => setForm({ ...form, boat_reg: e.target.value })}
/>

<label className="ylabel">Product Type <span className="req">*</span></label>
<input
className="yinput"
placeholder="Type exact product (e.g. Nassau Grouper)"
value={form.product_type}
onChange={(e) => setForm({ ...form, product_type: e.target.value })}
/>

<div className="ycard-title" style={{ marginTop: 24 }}>Weight &amp; Cost</div>

<div className="row2">
<div>
<label className="ylabel">Whole Weight In (lbs) <span className="req">*</span></label>
<input
className="yinput"
type="number"
min="0"
step="0.01"
placeholder="0.00"
value={form.whole_weight_lb}
onChange={(e) => setForm({ ...form, whole_weight_lb: e.target.value })}
/>
</div>
<div>
<label className="ylabel">Clean Weight Out (lbs) <span className="req">*</span></label>
<input
className="yinput"
type="number"
min="0"
step="0.01"
placeholder="0.00"
value={form.clean_weight_lb}
onChange={(e) => setForm({ ...form, clean_weight_lb: e.target.value })}
/>
</div>
</div>

<label className="ylabel">Total Cost Paid ($) <span className="req">*</span></label>
<input
className="yinput"
type="number"
min="0"
step="0.01"
placeholder="0.00"
value={form.cost_paid}
onChange={(e) => setForm({ ...form, cost_paid: e.target.value })}
/>

<div className="processed-by">Processed by: <b>{processedBy}</b></div>
</div>

{/* RIGHT — Results */}
<div className="ycard">
<div className="ycard-title">Live Results</div>

{!calcs ? (
<div className="yplaceholder">
Fill in all fields to see<br />yield and channel prices
</div>
) : (
<>
<div className="stat-grid">
<div className="stat-box" style={{ borderColor: "#0e6b3a" }}>
<div className="stat-val" style={{ color: "#0e6b3a" }}>{calcs.yieldPct}%</div>
<div className="stat-label">Yield %</div>
</div>
<div className="stat-box" style={{ borderColor: "#7a4000" }}>
<div className="stat-val" style={{ color: "#7a4000" }}>
{(parseFloat(form.whole_weight_lb) - parseFloat(form.clean_weight_lb)).toFixed(2)} lbs
</div>
<div className="stat-label">Weight Lost</div>
</div>
<div className="stat-box" style={{ borderColor: "#00427a" }}>
<div className="stat-val" style={{ color: "#00427a" }}>
${calcs.trueCost.toFixed(2)}
</div>
<div className="stat-label">True Cost / lb</div>
</div>
<div className="stat-box" style={{ borderColor: "#4a0070" }}>
<div className="stat-val" style={{ color: "#4a0070" }}>
{form.clean_weight_lb} lbs
</div>
<div className="stat-label">Clean Weight</div>
</div>
</div>

<div className="ycard-title">Channel Prices (per lb)</div>
<div className="channel-grid">
<div className="channel-card" style={{ borderLeft: "4px solid #c47d00" }}>
<div className="ch-label" style={{ color: "#c47d00" }}>Nassau POS</div>
<div className="ch-margin">38% margin</div>
<div className="ch-price" style={{ color: "#c47d00" }}>${calcs.channels.nassau.toFixed(2)}<span className="per-lb">/lb</span></div>
</div>
<div className="channel-card" style={{ borderLeft: "4px solid #6b2fa0" }}>
<div className="ch-label" style={{ color: "#6b2fa0" }}>Andros POS</div>
<div className="ch-margin">43% margin</div>
<div className="ch-price" style={{ color: "#6b2fa0" }}>${calcs.channels.andros.toFixed(2)}<span className="per-lb">/lb</span></div>
</div>
<div className="channel-card" style={{ borderLeft: "4px solid #005f8a" }}>
<div className="ch-label" style={{ color: "#005f8a" }}>Online</div>
<div className="ch-margin">25% margin</div>
<div className="ch-price" style={{ color: "#005f8a" }}>${calcs.channels.online.toFixed(2)}<span className="per-lb">/lb</span></div>
</div>
<div className="channel-card" style={{ borderLeft: "4px solid #2a6a2a" }}>
<div className="ch-label" style={{ color: "#2a6a2a" }}>Wholesale</div>
<div className="ch-margin">15% margin</div>
<div className="ch-price" style={{ color: "#2a6a2a" }}>${calcs.channels.wholesale.toFixed(2)}<span className="per-lb">/lb</span></div>
</div>
</div>
</>
)}

<button
className="save-btn"
disabled={!calcs || saving}
onClick={handleSave}
style={{ opacity: calcs && !saving ? 1 : 0.4 }}
>
{saving ? "Saving..." : "✓ Save Lot & Generate Lot Number"}
</button>
</div>
</div>
</div>
)}

{/* ── HISTORY TAB ── */}
{tab === "history" && (
<div className="yield-body">
<div className="search-row">
<input
className="yinput"
style={{ maxWidth: 380 }}
placeholder="Search lot #, captain, product, boat..."
value={search}
onChange={(e) => setSearch(e.target.value)}
/>
<span className="hist-count">{filtered.length} lots</span>
</div>

{filtered.length === 0 ? (
<div className="yplaceholder">No lots found.</div>
) : (
<div className="hist-list">
{filtered.map((lot) => {
const isOpen = openLot === lot.lot_number;
const ch = calcPrices(lot.true_cost_per_lb);
return (
<div key={lot.lot_number} className="hist-row">
<div
className="hist-top"
onClick={() => setOpenLot(isOpen ? null : lot.lot_number)}
>
<div>
<div className="hist-lot">{lot.lot_number}</div>
<div className="hist-sub">
{lot.product_type} · {lot.captain_name} · {lot.boat_reg}
</div>
</div>
<div className="hist-right">
<span className="hist-date">
{new Date(lot.created_at).toLocaleDateString()}
</span>
<span className="hist-yield">{lot.yield_pct}% yield</span>
<span className="hist-caret">{isOpen ? "▲" : "▼"}</span>
</div>
</div>

{isOpen && (
<div className="hist-detail">
<div className="hist-detail-grid">
<div><span className="dk">Whole Wt:</span> {lot.whole_weight_lb} lbs</div>
<div><span className="dk">Clean Wt:</span> {lot.clean_weight_lb} lbs</div>
<div><span className="dk">Cost Paid:</span> ${Number(lot.cost_paid).toFixed(2)}</div>
<div><span className="dk">True Cost/lb:</span> ${Number(lot.true_cost_per_lb).toFixed(2)}</div>
<div><span className="dk">Nassau:</span> ${ch.nassau}/lb</div>
<div><span className="dk">Andros:</span> ${ch.andros}/lb</div>
<div><span className="dk">Online:</span> ${ch.online}/lb</div>
<div><span className="dk">Wholesale:</span> ${ch.wholesale}/lb</div>
<div><span className="dk">By:</span> {lot.processed_by}</div>
</div>
<div className="hist-actions">
<button className="btn-label" onClick={() => openPrint(labelHTML(lot))}>
🏷 Print Label
</button>
<button className="btn-doc" onClick={() => openPrint(docHTML(lot))}>
📄 Print Document
</button>
</div>
</div>
)}
</div>
);
})}
</div>
)}
</div>
)}

{/* ── Scoped styles ── */}
<style>{`
.yield-page { min-height: 100vh; background: #0d1117; color: #e6edf3; font-family: Georgia, serif; }
.toast { position: fixed; top: 20px; right: 20px; z-index: 9999; padding: 12px 24px; border-radius: 6px; color: #fff; font-family: monospace; font-size: 14px; box-shadow: 0 4px 20px rgba(0,0,0,.4); }
.toast-ok { background: #0e6b3a; }
.toast-err { background: #9b1c1c; }

.yield-header { background: #0e1821; border-bottom: 2px solid #c47d00; padding: 20px 32px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.yield-eyebrow { font-size: 10px; letter-spacing: .3em; color: #c47d00; font-family: monospace; font-weight: bold; }
.yield-title { font-size: 26px; font-weight: bold; margin-top: 2px; }

.yield-tabs { display: flex; gap: 8px; }
.ytab { background: transparent; border: 1px solid #2a3a4a; color: #8b9ab0; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 14px; }
.ytab-active { background: #c47d00; border-color: #c47d00; color: #fff; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: bold; }
.ytab-badge { background: #fff; color: #c47d00; border-radius: 10px; padding: 1px 7px; font-size: 11px; margin-left: 6px; font-weight: bold; }

.yield-body { padding: 28px 32px; max-width: 1200px; margin: 0 auto; }

.saved-banner { background: #0e2d1e; border: 1px solid #0e6b3a; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.saved-lot { font-family: monospace; font-size: 18px; font-weight: bold; color: #3dd68c; }
.saved-sub { color: #8b9ab0; font-size: 13px; flex: 1; }
.saved-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.yield-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
@media (max-width: 700px) { .yield-grid { grid-template-columns: 1fr; } }

.ycard { background: #0e1821; border-radius: 10px; border: 1px solid #1e2d3d; padding: 24px; }
.ycard-title { font-size: 10px; letter-spacing: .25em; font-family: monospace; color: #c47d00; font-weight: bold; margin-bottom: 14px; text-transform: uppercase; }

.ylabel { display: block; font-size: 12px; color: #8b9ab0; margin-bottom: 5px; margin-top: 14px; font-family: monospace; letter-spacing: .05em; }
.req { color: #c47d00; }
.yinput { width: 100%; background: #161b22; border: 1px solid #2a3a4a; border-radius: 6px; padding: 10px 14px; color: #e6edf3; font-family: inherit; font-size: 15px; outline: none; box-sizing: border-box; }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.processed-by { font-size: 12px; color: #5a7a9a; font-family: monospace; margin-top: 16px; padding-top: 12px; border-top: 1px solid #1e2d3d; }

.yplaceholder { text-align: center; color: #3a5a7a; padding: 48px 20px; font-style: italic; line-height: 1.8; }

.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
.stat-box { background: #161b22; border: 1px solid; border-radius: 8px; padding: 14px 16px; text-align: center; }
.stat-val { font-size: 22px; font-weight: bold; font-family: monospace; }
.stat-label{ font-size: 11px; color: #5a7a9a; margin-top: 4px; letter-spacing: .08em; }

.channel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
.channel-card { background: #161b22; border-radius: 6px; padding: 12px 14px; border: 1px solid #1e2d3d; }
.ch-label { font-size: 12px; font-weight: bold; font-family: monospace; letter-spacing: .05em; }
.ch-margin { font-size: 10px; color: #5a7a9a; margin: 2px 0 6px; }
.ch-price { font-size: 20px; font-weight: bold; font-family: monospace; }
.per-lb { font-size: 12px; opacity: .6; }

.save-btn { width: 100%; background: #c47d00; color: #fff; border: none; border-radius: 8px; padding: 14px; font-size: 15px; font-weight: bold; font-family: inherit; letter-spacing: .04em; margin-top: 4px; cursor: pointer; transition: opacity .2s; }

.btn-label { background: #1a3a1a; border: 1px solid #0e6b3a; color: #3dd68c; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 13px; }
.btn-doc { background: #1a2a3a; border: 1px solid #1e5a8a; color: #58b4f0; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 13px; }
.btn-clear { background: transparent; border: 1px solid #3a2a2a; color: #8b5a5a; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 13px; }

.search-row { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.hist-count { color: #5a7a9a; font-family: monospace; font-size: 13px; }
.hist-list { display: flex; flex-direction: column; gap: 10px; }
.hist-row { background: #0e1821; border: 1px solid #1e2d3d; border-radius: 8px; overflow: hidden; }
.hist-top { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; cursor: pointer; }
.hist-lot { font-family: monospace; font-weight: bold; font-size: 15px; color: #c47d00; }
.hist-sub { font-size: 13px; color: #5a7a9a; margin-top: 3px; }
.hist-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.hist-date { font-size: 12px; color: #5a7a9a; font-family: monospace; }
.hist-yield { font-size: 13px; color: #3dd68c; font-family: monospace; font-weight: bold; }
.hist-caret { color: #5a7a9a; font-size: 12px; }
.hist-detail { padding: 16px 20px; border-top: 1px solid #1e2d3d; background: #0a1117; }
.hist-detail-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px 16px; font-size: 13px; margin-bottom: 14px; }
.dk { color: #5a7a9a; font-family: monospace; }
.hist-actions{ display: flex; gap: 8px; }
`}</style>
</div>
```

);
}
