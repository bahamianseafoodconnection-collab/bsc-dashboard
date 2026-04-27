// File: app/supplier/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://auqjjrisivhfmpleusyt.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg"
);

const NASSAU_MARGIN    = 1.38;
const ANDROS_MARGIN    = 1.43;
const ONLINE_MARGIN    = 1.25;
const WHOLESALE_MARGIN = 1.12;
const ADMIN_EMAIL      = "dedrick@bahamianseafoodconnection.com";
const BSC_WA_NUMBER    = "12423613474";
const BSC_US_MARKUP    = 0.10;

const CAR_SALE_MARKUP   = 650;
const RENTAL_DAY_MARKUP = 10;
const PARTS_MARKUP_RATE = 0.10;
const VAT_RATE          = 0.10;

// ── YIELD CALCULATOR CONSTANTS ──
const YC_NASSAU_MARGIN    = 0.38;
const YC_ANDROS_MARGIN    = 0.43;
const YC_ONLINE_MARGIN    = 0.25;
const YC_WHOLESALE_MARGIN = 0.15;

function calcVehicleSalePrice(supplierCost: number) {
  const beforeVat = supplierCost + CAR_SALE_MARKUP;
  const vat       = parseFloat((beforeVat * VAT_RATE).toFixed(2));
  return { beforeVat, vat, customerPrice: parseFloat((beforeVat + vat).toFixed(2)), bscProfit: CAR_SALE_MARKUP };
}

function calcRentalPrice(supplierDailyRate: number) {
  const dailyBeforeVat  = supplierDailyRate + RENTAL_DAY_MARKUP;
  const dailyVat        = parseFloat((dailyBeforeVat * VAT_RATE).toFixed(2));
  const dailyCustomer   = parseFloat((dailyBeforeVat + dailyVat).toFixed(2));
  const weeklyBeforeVat = dailyBeforeVat * 7;
  const weeklyVat       = parseFloat((weeklyBeforeVat * VAT_RATE).toFixed(2));
  const weeklyCustomer  = parseFloat((weeklyBeforeVat + weeklyVat).toFixed(2));
  return { dailyCustomer, weeklyCustomer, dailyVat, weeklyVat, bscProfitPerDay: RENTAL_DAY_MARKUP };
}

function calcPartPrice(supplierCost: number) {
  const markup    = parseFloat((supplierCost * PARTS_MARKUP_RATE).toFixed(2));
  const beforeVat = parseFloat((supplierCost + markup).toFixed(2));
  const vat       = parseFloat((beforeVat * VAT_RATE).toFixed(2));
  return { markup, beforeVat, vat, customerPrice: parseFloat((beforeVat + vat).toFixed(2)), bscProfit: markup };
}

function getDutyRate(category: string, productName: string): number {
  const name = productName.toLowerCase();
  const cat  = category.toLowerCase();
  if (cat === "seafood") {
    if (name.includes("shrimp"))                                        return 0;
    if (name.includes("salmon"))                                        return 0;
    if (name.includes("octopus"))                                       return 0;
    if (name.includes("tuna") && name.includes("canned"))               return 0;
    if (name.includes("sardine"))                                       return 0;
    if (name.includes("fish") && name.includes("canned"))               return 0;
    return 0.35;
  }
  if (cat === "poultry") {
    if (name.includes("duck"))                                          return 0.05;
    if (name.includes("turkey") && name.includes("deli"))               return 0;
    if (name.includes("turkey"))                                        return 0.10;
    if (name.includes("chicken"))                                       return 0.30;
    return 0.10;
  }
  if (cat === "meat") {
    if (name.includes("beef"))                                          return 0;
    if (name.includes("lamb"))                                          return 0;
    if (name.includes("pork"))                                          return 0.10;
    if (name.includes("bacon"))                                         return 0.10;
    return 0.10;
  }
  if (cat === "auto") {
    if (name.includes("tire") || name.includes("tyre"))                 return 0.25;
    if (name.includes("battery"))                                       return 0.60;
    return 0.60;
  }
  if (cat === "vehicle") {
    if (name.includes("hybrid"))                                        return 0.10;
    return 0.45;
  }
  if (cat === "electronics") {
    if (name.includes("computer") || name.includes("laptop"))           return 0;
    if (name.includes("phone"))                                         return 0.10;
    if (name.includes("television") || name.includes("tv"))             return 0.35;
    return 0.35;
  }
  if (cat === "baby")                                                   return 0;
  if (cat === "medical" || cat === "health")                            return 0;
  if (name.includes("rice"))                                            return 0;
  if (name.includes("bread"))                                           return 0;
  if (name.includes("cereal"))                                          return 0;
  if (name.includes("sugar"))                                           return 0;
  if (name.includes("chicken"))                                         return 0.30;
  if (name.includes("clothing") || name.includes("apparel"))            return 0.20;
  if (name.includes("furniture"))                                       return 0.25;
  if (name.includes("wine"))                                            return 0.50;
  if (name.includes("beer"))                                            return 0.10;
  if (name.includes("cigar"))                                           return 2.20;
  return 0.25;
}

function calcPricing(caseCost: string, pieces: string, category: string, name: string, isUS: boolean) {
  const cost         = parseFloat(caseCost) || 0;
  const pcs          = parseFloat(pieces) || 1;
  const dutyRate     = isUS ? getDutyRate(category, name) : 0;
  const dutyAmount   = isUS ? parseFloat((cost * dutyRate).toFixed(2)) : 0;
  const shippingCost = isUS ? 400 : 0;
  const landedCost   = cost + dutyAmount + shippingCost;
  const bscMarkup    = isUS ? parseFloat((landedCost * BSC_US_MARKUP).toFixed(2)) : 0;
  const totalCost    = landedCost + bscMarkup;
  const unitCost     = pcs > 0 ? totalCost / pcs : totalCost;
  return {
    dutyRate, dutyAmount, shippingCost, bscMarkup, landedCost, unitCost,
    nassauPrice:    parseFloat((unitCost * NASSAU_MARGIN).toFixed(2)),
    androsPrice:    parseFloat((unitCost * ANDROS_MARGIN).toFixed(2)),
    onlinePrice:    parseFloat((unitCost * ONLINE_MARGIN).toFixed(2)),
    wholesalePrice: parseFloat((unitCost * WHOLESALE_MARGIN).toFixed(2)),
    retailPrice:    parseFloat((unitCost * ONLINE_MARGIN).toFixed(2)),
  };
}

// ── YIELD LOT HELPERS ──
function buildLotNumber(seq: number): string {
  const now = new Date();
  const y = now.getFullYear().toString();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const s = String(seq).padStart(3, "0");
  return "BSC-" + y + m + d + "-" + s;
}

async function getNextLotSequence(): Promise<number> {
  const now = new Date();
  const y = now.getFullYear().toString();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const prefix = "BSC-" + y + m + d + "-";
  const { data } = await supabase
    .from("yield_lots")
    .select("lot_number")
    .like("lot_number", prefix + "%")
    .order("lot_number", { ascending: false })
    .limit(1);
  if (data && data.length > 0) {
    const parts = data[0].lot_number.split("-");
    return parseInt(parts[parts.length - 1], 10) + 1;
  }
  return 1;
}

function calcYieldChannelPrices(trueCostPerLb: number) {
  return {
    nassau:    +(trueCostPerLb / (1 - YC_NASSAU_MARGIN)).toFixed(2),
    andros:    +(trueCostPerLb / (1 - YC_ANDROS_MARGIN)).toFixed(2),
    online:    +(trueCostPerLb / (1 - YC_ONLINE_MARGIN)).toFixed(2),
    wholesale: +(trueCostPerLb / (1 - YC_WHOLESALE_MARGIN)).toFixed(2),
  };
}

function openPrintWindow(html: string) {
  const w = window.open("", "_blank", "width=900,height=650");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

interface LotRecord {
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

function buildLabelHTML(lot: LotRecord): string {
  const ch = calcYieldChannelPrices(lot.true_cost_per_lb);
  return (
    "<!DOCTYPE html><html><head><title>Label " + lot.lot_number + "</title>" +
    "<style>" +
    "@page{size:100mm 60mm;margin:3mm;}" +
    "body{font-family:Courier New,monospace;font-size:9pt;margin:0;padding:2mm;}" +
    ".lot{font-size:13pt;font-weight:bold;}" +
    "hr{border:none;border-top:1px solid #000;margin:2mm 0;}" +
    ".row{display:flex;justify-content:space-between;margin-bottom:1mm;}" +
    ".grid{display:grid;grid-template-columns:1fr 1fr;gap:1mm;margin-top:2mm;}" +
    ".cell{border:1px solid #333;padding:1mm 2mm;font-size:8pt;}" +
    ".foot{font-size:7pt;color:#666;text-align:center;margin-top:2mm;}" +
    "</style></head><body>" +
    "<div class=lot>" + lot.lot_number + "</div><hr/>" +
    "<div class=row><b>" + lot.product_type + "</b><span>" + new Date(lot.created_at).toLocaleDateString() + "</span></div>" +
    "<div class=row><span>Captain: " + lot.captain_name + "</span><span>Boat: " + lot.boat_reg + "</span></div>" +
    "<div class=row><span>Clean Wt: <b>" + lot.clean_weight_lb + " lbs</b></span><span>Yield: <b>" + lot.yield_pct + "%</b></span></div>" +
    "<hr/><div class=grid>" +
    "<div class=cell><b>Nassau</b><br>$" + ch.nassau + "/lb</div>" +
    "<div class=cell><b>Andros</b><br>$" + ch.andros + "/lb</div>" +
    "<div class=cell><b>Online</b><br>$" + ch.online + "/lb</div>" +
    "<div class=cell><b>Wholesale</b><br>$" + ch.wholesale + "/lb</div>" +
    "</div>" +
    "<div class=foot>BSC Marketplace - bscbahamas.com</div>" +
    "</body></html>"
  );
}

function buildDocHTML(lot: LotRecord): string {
  const ch = calcYieldChannelPrices(lot.true_cost_per_lb);
  const lost = (lot.whole_weight_lb - lot.clean_weight_lb).toFixed(2);
  return (
    "<!DOCTYPE html><html><head><title>Lot " + lot.lot_number + "</title>" +
    "<style>" +
    "@page{margin:20mm;}" +
    "body{font-family:Georgia,serif;font-size:11pt;color:#111;}" +
    "h2{font-size:12pt;border-bottom:2px solid #000;padding-bottom:2mm;margin-top:8mm;}" +
    "table{width:100%;border-collapse:collapse;margin-top:4mm;}" +
    "td,th{border:1px solid #ccc;padding:3mm 4mm;}" +
    "th{background:#f0f0f0;font-weight:bold;text-align:left;}" +
    ".lot{font-family:Courier New,monospace;font-size:22pt;font-weight:bold;}" +
    ".sigs{display:flex;gap:20mm;margin-top:16mm;}" +
    ".sig{flex:1;border-top:1px solid #000;padding-top:2mm;font-size:9pt;}" +
    ".foot{margin-top:12mm;font-size:8pt;color:#888;border-top:1px solid #ccc;padding-top:3mm;}" +
    "</style></head><body>" +
    "<div style=display:flex;justify-content:space-between>" +
    "<div><div style=font-size:9pt;font-weight:bold>BSC MARKETPLACE - YIELD PROCESSING RECORD</div>" +
    "<div class=lot>" + lot.lot_number + "</div></div>" +
    "<div style=text-align:right;font-size:9pt>" +
    "<div><b>bscbahamas.com</b></div><div>+1 (242) 361-3474</div>" +
    "<div>Date: " + new Date(lot.created_at).toLocaleString() + "</div>" +
    "<div>By: " + lot.processed_by + "</div></div></div>" +
    "<h2>Supplier and Catch</h2>" +
    "<table><tr><th>Captain Name</th><td>" + lot.captain_name + "</td><th>Boat Reg</th><td>" + lot.boat_reg + "</td></tr>" +
    "<tr><th>Product Type</th><td colspan=3>" + lot.product_type + "</td></tr></table>" +
    "<h2>Yield Calculation</h2>" +
    "<table>" +
    "<tr><th>Whole Weight In</th><td>" + lot.whole_weight_lb + " lbs</td><th>Clean Weight Out</th><td>" + lot.clean_weight_lb + " lbs</td></tr>" +
    "<tr><th>Weight Lost</th><td>" + lost + " lbs</td><th>Yield %</th><td><b>" + lot.yield_pct + "%</b></td></tr>" +
    "<tr><th>Total Cost Paid</th><td>$" + Number(lot.cost_paid).toFixed(2) + "</td><th>True Cost per lb</th><td><b>$" + Number(lot.true_cost_per_lb).toFixed(2) + "</b></td></tr>" +
    "</table>" +
    "<h2>Channel Pricing</h2>" +
    "<table>" +
    "<tr><th>Nassau POS 38%</th><td><b>$" + ch.nassau + " per lb</b></td></tr>" +
    "<tr><th>Andros POS 43%</th><td><b>$" + ch.andros + " per lb</b></td></tr>" +
    "<tr><th>Online 25%</th><td><b>$" + ch.online + " per lb</b></td></tr>" +
    "<tr><th>Wholesale 15%</th><td><b>$" + ch.wholesale + " per lb</b></td></tr>" +
    "</table>" +
    "<div class=sigs>" +
    "<div class=sig>Operator Signature</div>" +
    "<div class=sig>Supervisor Signature</div>" +
    "<div class=sig>Date Approved</div>" +
    "</div>" +
    "<div class=foot>Lot " + lot.lot_number + " - BSC Marketplace - Bahamian Seafood Connection - All Rights Reserved</div>" +
    "</body></html>"
  );
}

const YIELD_PRESETS = {
  Conch:   { yield: 0.35, icon: "🐚" },
  Fish:    { yield: 0.48, icon: "🐟" },
  Shrimp:  { yield: 0.65, icon: "🦐" },
  Lobster: { yield: 0.40, icon: "🦞" },
  Grouper: { yield: 0.45, icon: "🐠" },
  Meats:   { yield: 0.70, icon: "🥩" },
};

const CATEGORIES = [
  "seafood", "poultry", "meat", "auto", "vehicle",
  "general", "grocery", "electronics", "baby", "medical",
  "health", "clothing", "furniture", "alcohol",
];

const LOCATIONS = [
  { value: "bahamas", label: "🇧🇸 Bahamas (Local Supplier)" },
  { value: "florida", label: "🇺🇸 Florida / USA (Import)"   },
];

type View = "home" | "apply" | "login" | "portal" | "upload" | "edit" | "admin" | "spiny";
type Supplier = {
  id: string; full_name: string; company_name: string;
  email: string; whatsapp: string; category: string;
  status: string; location?: string;
};
type SupplierProduct = {
  id: string; name: string; category: string; sku: string;
  retail_price: number; wholesale_price: number; unit_cost: number;
  duty_rate: number; duty_amount: number; shipping_cost: number;
  case_cost: number; pieces_per_case: number; case_weight_lbs: number;
  supplier_id: string; supplier_name: string; supplier_whatsapp: string;
  photo_url: string; status: string; created_at: string;
  price_per_lb?: number; country_of_origin?: string;
  vin?: string; year_make_model?: string;
};

// ── FULL YIELD CALCULATOR COMPONENT ──
function FullYieldCalculator({ processedBy }: { processedBy: string }) {
  const blankForm = { captain_name: "", boat_reg: "", product_type: "", whole_weight_lb: "", clean_weight_lb: "", cost_paid: "" };
  const [open, setOpen]           = useState(false);
  const [histOpen, setHistOpen]   = useState(false);
  const [form, setForm]           = useState(blankForm);
  const [calcs, setCalcs]         = useState<{ yieldPct: number; trueCost: number; channels: { nassau: number; andros: number; online: number; wholesale: number } } | null>(null);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState<LotRecord | null>(null);
  const [history, setHistory]     = useState<LotRecord[]>([]);
  const [toast, setToast]         = useState("");
  const [openLot, setOpenLot]     = useState<string | null>(null);
  const [search, setSearch]       = useState("");

  useEffect(() => {
    const w    = parseFloat(form.whole_weight_lb);
    const c    = parseFloat(form.clean_weight_lb);
    const cost = parseFloat(form.cost_paid);
    if (w > 0 && c > 0 && c <= w && cost > 0) {
      const yieldPct = +((c / w) * 100).toFixed(1);
      const trueCost = +(cost / c).toFixed(4);
      setCalcs({ yieldPct, trueCost, channels: calcYieldChannelPrices(trueCost) });
    } else {
      setCalcs(null);
    }
  }, [form.whole_weight_lb, form.clean_weight_lb, form.cost_paid]);

  async function loadHistory() {
    const { data } = await supabase
      .from("yield_lots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setHistory(data || []);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function handleSave() {
    if (!calcs) return;
    setSaving(true);
    try {
      const seq = await getNextLotSequence();
      const lot_number = buildLotNumber(seq);
      const record: LotRecord = {
        lot_number,
        captain_name:     form.captain_name.trim(),
        boat_reg:         form.boat_reg.trim(),
        product_type:     form.product_type.trim(),
        whole_weight_lb:  parseFloat(form.whole_weight_lb),
        clean_weight_lb:  parseFloat(form.clean_weight_lb),
        yield_pct:        calcs.yieldPct,
        cost_paid:        parseFloat(form.cost_paid),
        true_cost_per_lb: calcs.trueCost,
        nassau_price:     calcs.channels.nassau,
        andros_price:     calcs.channels.andros,
        online_price:     calcs.channels.online,
        wholesale_price:  calcs.channels.wholesale,
        processed_by:     processedBy,
        created_at:       new Date().toISOString(),
      };
      const { error } = await supabase.from("yield_lots").insert([record]);
      if (error) throw error;
      setSaved(record);
      setHistory((h) => [record, ...h]);
      setForm(blankForm);
      setCalcs(null);
      showToast("Lot " + lot_number + " saved");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error";
      showToast("Save failed: " + msg);
    } finally {
      setSaving(false);
    }
  }

  const inp2: React.CSSProperties = { display: "block", width: "100%", padding: "10px 12px", borderRadius: 8, backgroundColor: "#060d1f", color: "#fff", border: "1px solid #1e3a5f", fontSize: 13, marginBottom: 10, boxSizing: "border-box" as const, outline: "none" };
  const lbl2: React.CSSProperties = { display: "block", color: "#6b7280", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" as const, marginBottom: 4 };

  const filtered = history.filter((h) =>
    !search ||
    h.lot_number.toLowerCase().includes(search.toLowerCase()) ||
    h.captain_name.toLowerCase().includes(search.toLowerCase()) ||
    h.product_type.toLowerCase().includes(search.toLowerCase()) ||
    h.boat_reg.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ marginBottom: 16 }}>
      {toast !== "" && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "10px 20px", borderRadius: 8, background: "#0e6b3a", color: "#fff", fontFamily: "monospace", fontSize: 13 }}>
          {toast}
        </div>
      )}

      <button
        onClick={() => { setOpen((o) => !o); if (!open) loadHistory(); }}
        style={{ width: "100%", padding: "12px 16px", borderRadius: 12, backgroundColor: open ? "#0a1f0a" : "#111c33", border: "1px solid " + (open ? "#4ade80" : "#1e2d4a"), color: open ? "#4ade80" : "#aaa", fontWeight: "bold", fontSize: 14, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <span>🧮 Yield Calculator + Lot Management</span>
        <span style={{ fontSize: 18 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ backgroundColor: "#0a1220", border: "1px solid #1e3a5f", borderRadius: "0 0 12px 12px", padding: "16px 14px" }}>

          {saved && (
            <div style={{ backgroundColor: "#0e2d1e", border: "1px solid #0e6b3a", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <p style={{ margin: "0 0 4px", color: "#3dd68c", fontWeight: "bold", fontFamily: "monospace", fontSize: 15 }}>{saved.lot_number}</p>
              <p style={{ margin: "0 0 10px", color: "#6b7280", fontSize: 12 }}>Saved - {saved.product_type}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                <button onClick={() => openPrintWindow(buildLabelHTML(saved))} style={{ padding: "8px 14px", borderRadius: 8, background: "#1a3a1a", border: "1px solid #0e6b3a", color: "#3dd68c", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Print Label</button>
                <button onClick={() => openPrintWindow(buildDocHTML(saved))}   style={{ padding: "8px 14px", borderRadius: 8, background: "#1a2a3a", border: "1px solid #1e5a8a", color: "#58b4f0", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Print Document</button>
                <button onClick={() => setSaved(null)}                         style={{ padding: "8px 14px", borderRadius: 8, background: "transparent", border: "1px solid #3a2a2a", color: "#8b5a5a", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Dismiss</button>
              </div>
            </div>
          )}

          <p style={{ margin: "0 0 12px", color: "#60a5fa", fontWeight: "bold", fontSize: 13 }}>New Entry</p>

          <label style={lbl2}>Captain Name *</label>
          <input style={inp2} placeholder="Enter captain full name" value={form.captain_name} onChange={(e) => setForm({ ...form, captain_name: e.target.value })} />

          <label style={lbl2}>Boat Registration # *</label>
          <input style={inp2} placeholder="e.g. BS-1234" value={form.boat_reg} onChange={(e) => setForm({ ...form, boat_reg: e.target.value })} />

          <label style={lbl2}>Product Type *</label>
          <input style={inp2} placeholder="Type exact product e.g. Nassau Grouper" value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value })} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={lbl2}>Whole Weight In (lbs) *</label>
              <input style={inp2} type="number" min="0" step="0.01" placeholder="0.00" value={form.whole_weight_lb} onChange={(e) => setForm({ ...form, whole_weight_lb: e.target.value })} />
            </div>
            <div>
              <label style={lbl2}>Clean Weight Out (lbs) *</label>
              <input style={inp2} type="number" min="0" step="0.01" placeholder="0.00" value={form.clean_weight_lb} onChange={(e) => setForm({ ...form, clean_weight_lb: e.target.value })} />
            </div>
          </div>

          <label style={lbl2}>Total Cost Paid ($) *</label>
          <input style={inp2} type="number" min="0" step="0.01" placeholder="0.00" value={form.cost_paid} onChange={(e) => setForm({ ...form, cost_paid: e.target.value })} />

          {calcs && (
            <div style={{ backgroundColor: "#0a1f0a", border: "1px solid #4ade80", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
              <p style={{ margin: "0 0 10px", color: "#4ade80", fontWeight: "bold", fontSize: 12 }}>LIVE RESULTS</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                {[
                  { label: "Yield %",         value: calcs.yieldPct + "%",                                                                              color: "#4ade80" },
                  { label: "True Cost / lb",  value: "$" + calcs.trueCost.toFixed(2),                                                                   color: "#f5c518" },
                  { label: "Weight Lost",     value: (parseFloat(form.whole_weight_lb) - parseFloat(form.clean_weight_lb)).toFixed(2) + " lbs",         color: "#f87171" },
                  { label: "Clean Weight",    value: form.clean_weight_lb + " lbs",                                                                     color: "#60a5fa" },
                ].map((x) => (
                  <div key={x.label} style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "8px 10px" }}>
                    <p style={{ margin: 0, color: "#4a5568", fontSize: 9, letterSpacing: 1 }}>{x.label}</p>
                    <p style={{ margin: "4px 0 0", color: x.color, fontWeight: "bold", fontSize: 15 }}>{x.value}</p>
                  </div>
                ))}
              </div>
              <p style={{ margin: "0 0 8px", color: "#f5c518", fontWeight: "bold", fontSize: 12 }}>BSC CHANNEL PRICES (per lb)</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[
                  { label: "Nassau POS 38%",    value: calcs.channels.nassau,    color: "#60a5fa" },
                  { label: "Andros POS 43%",    value: calcs.channels.andros,    color: "#a78bfa" },
                  { label: "Online 25%",        value: calcs.channels.online,    color: "#4ade80" },
                  { label: "Wholesale 15%",     value: calcs.channels.wholesale, color: "#f5c518" },
                ].map((ch) => (
                  <div key={ch.label} style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "7px 10px" }}>
                    <p style={{ margin: 0, color: "#4a5568", fontSize: 9 }}>{ch.label}</p>
                    <p style={{ margin: "2px 0 0", color: ch.color, fontWeight: "bold", fontSize: 14 }}>${ch.value.toFixed(2)}/lb</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            disabled={!calcs || saving}
            onClick={handleSave}
            style={{ width: "100%", padding: "12px", borderRadius: 10, backgroundColor: calcs && !saving ? "#f5c518" : "#333", color: calcs && !saving ? "#000" : "#666", fontWeight: "bold", border: "none", fontSize: 14, cursor: calcs && !saving ? "pointer" : "not-allowed", marginBottom: 14 }}
          >
            {saving ? "Saving..." : "Save Lot and Generate Lot Number"}
          </button>

          <div style={{ borderTop: "1px solid #1e3a5f", paddingTop: 14 }}>
            <button
              onClick={() => setHistOpen((h) => !h)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, backgroundColor: histOpen ? "#0d1f3c" : "#111c33", border: "1px solid #1e3a5f", color: "#60a5fa", fontWeight: "bold", fontSize: 13, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: histOpen ? 12 : 0 }}
            >
              <span>Lot History ({history.length})</span>
              <span>{histOpen ? "▲" : "▼"}</span>
            </button>

            {histOpen && (
              <>
                <input
                  style={{ ...inp2, marginBottom: 10 }}
                  placeholder="Search lot, captain, product, boat..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {filtered.length === 0 ? (
                  <p style={{ color: "#4a5568", textAlign: "center", fontSize: 13, padding: "20px 0" }}>No lots found.</p>
                ) : (
                  filtered.map((lot) => {
                    const isOpen = openLot === lot.lot_number;
                    const ch = calcYieldChannelPrices(lot.true_cost_per_lb);
                    return (
                      <div key={lot.lot_number} style={{ backgroundColor: "#0e1821", border: "1px solid #1e2d3d", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
                        <div onClick={() => setOpenLot(isOpen ? null : lot.lot_number)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", cursor: "pointer" }}>
                          <div>
                            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: "bold", fontSize: 13, color: "#f5c518" }}>{lot.lot_number}</p>
                            <p style={{ margin: "2px 0 0", color: "#4a5568", fontSize: 11 }}>{lot.product_type} - {lot.captain_name}</p>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ color: "#4ade80", fontSize: 12, fontWeight: "bold" }}>{lot.yield_pct}%</span>
                            <span style={{ color: "#4a5568", fontSize: 11 }}>{isOpen ? "▲" : "▼"}</span>
                          </div>
                        </div>
                        {isOpen && (
                          <div style={{ padding: "12px 14px", borderTop: "1px solid #1e2d3d", background: "#060d1f" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 12px", fontSize: 12, marginBottom: 10 }}>
                              <div><span style={{ color: "#4a5568" }}>Whole:</span> {lot.whole_weight_lb} lbs</div>
                              <div><span style={{ color: "#4a5568" }}>Clean:</span> {lot.clean_weight_lb} lbs</div>
                              <div><span style={{ color: "#4a5568" }}>Cost:</span> ${Number(lot.cost_paid).toFixed(2)}</div>
                              <div><span style={{ color: "#4a5568" }}>Nassau:</span> ${ch.nassau}/lb</div>
                              <div><span style={{ color: "#4a5568" }}>Andros:</span> ${ch.andros}/lb</div>
                              <div><span style={{ color: "#4a5568" }}>Online:</span> ${ch.online}/lb</div>
                              <div><span style={{ color: "#4a5568" }}>Wholesale:</span> ${ch.wholesale}/lb</div>
                              <div><span style={{ color: "#4a5568" }}>By:</span> {lot.processed_by}</div>
                              <div><span style={{ color: "#4a5568" }}>Date:</span> {new Date(lot.created_at).toLocaleDateString()}</div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => openPrintWindow(buildLabelHTML(lot))} style={{ padding: "7px 14px", borderRadius: 8, background: "#1a3a1a", border: "1px solid #0e6b3a", color: "#3dd68c", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Print Label</button>
                              <button onClick={() => openPrintWindow(buildDocHTML(lot))}   style={{ padding: "7px 14px", borderRadius: 8, background: "#1a2a3a", border: "1px solid #1e5a8a", color: "#58b4f0", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Print Document</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>

          <div style={{ backgroundColor: "#111c33", borderRadius: 10, padding: "10px 12px", border: "1px solid #1e2d4a", marginTop: 14 }}>
            <p style={{ margin: "0 0 8px", color: "#6b7280", fontWeight: "bold", fontSize: 11, letterSpacing: 1 }}>INDUSTRY YIELD REFERENCE</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {Object.entries(YIELD_PRESETS).map(([key, val]) => (
                <div key={key} style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "6px 8px", textAlign: "center" as const }}>
                  <p style={{ margin: 0, fontSize: 16 }}>{val.icon}</p>
                  <p style={{ margin: "2px 0 0", color: "#aaa", fontSize: 10, fontWeight: "bold" }}>{key}</p>
                  <p style={{ margin: "1px 0 0", color: "#f5c518", fontSize: 11 }}>~{(val.yield * 100).toFixed(0)}%</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupplierPage() {
  const router = useRouter();
  const [view, setView]                           = useState<View>("home");
  const [supplier, setSupplier]                   = useState<Supplier | null>(null);
  const [isAdmin, setIsAdmin]                     = useState(false);
  const [isControlAdmin, setIsControlAdmin]       = useState(false);
  const [isSpinyAdmin, setIsSpinyAdmin]           = useState(false);
  const [loading, setLoading]                     = useState(false);
  const [success, setSuccess]                     = useState("");
  const [error, setError]                         = useState("");
  const [checkingSession, setCheckingSession]     = useState(true);
  const [processedBy, setProcessedBy]             = useState("Staff");

  const [allSuppliers, setAllSuppliers]           = useState<Supplier[]>([]);
  const [allProducts, setAllProducts]             = useState<SupplierProduct[]>([]);
  const [adminTab, setAdminTab]                   = useState<"suppliers" | "products">("suppliers");
  const [myProducts, setMyProducts]               = useState<SupplierProduct[]>([]);
  const [editingProduct, setEditingProduct]       = useState<SupplierProduct | null>(null);

  const [waOpen, setWaOpen]                       = useState(false);
  const [waTab, setWaTab]                         = useState<"chat" | "qr">("chat");

  const [appName, setAppName]                     = useState("");
  const [appCompany, setAppCompany]               = useState("");
  const [appEmail, setAppEmail]                   = useState("");
  const [appWhatsApp, setAppWhatsApp]             = useState("");
  const [appCategory, setAppCategory]             = useState("seafood");
  const [appLocation, setAppLocation]             = useState("bahamas");

  const [loginEmail, setLoginEmail]               = useState("");
  const [loginPassword, setLoginPassword]         = useState("");
  const [showLoginPw, setShowLoginPw]             = useState(false);

  const [prodName, setProdName]                   = useState("");
  const [prodCategory, setProdCategory]           = useState("seafood");
  const [prodSku, setProdSku]                     = useState("");
  const [prodCaseCost, setProdCaseCost]           = useState("");
  const [prodCaseWeight, setProdCaseWeight]       = useState("");
  const [prodPieces, setProdPieces]               = useState("");
  const [prodPricePerLb, setProdPricePerLb]       = useState("");
  const [prodOrigin, setProdOrigin]               = useState("");
  const [prodPartNumber, setProdPartNumber]       = useState("");
  const [prodVin, setProdVin]                     = useState("");
  const [prodYearMakeModel, setProdYearMakeModel] = useState("");
  const [prodPhoto, setProdPhoto]                 = useState<File | null>(null);
  const [prodPhotoPreview, setProdPhotoPreview]   = useState("");
  const [prodWhatsApp, setProdWhatsApp]           = useState("");
  const [vehicleSupplierCost, setVehicleSupplierCost]           = useState("");
  const [vehicleSupplierDailyRate, setVehicleSupplierDailyRate] = useState("");
  const [vehicleListingType, setVehicleListingType]             = useState<"sale" | "rental">("sale");
  const [partSupplierCost, setPartSupplierCost]                 = useState("");

  const isUSSupplier = supplier?.location === "florida" || supplier?.location === "usa";

  useEffect(() => {
    async function checkSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (user) {
          if (user.email) setProcessedBy(user.email.split("@")[0]);
          const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
          if (profile?.role === "control_admin" || profile?.role === "basic_admin" || profile?.role === "manager") {
            setIsAdmin(true);
            if (profile.role === "control_admin") setIsControlAdmin(true);
            await loadAdminData();
            const { data: spinySupplier } = await supabase.from("suppliers").select("*").eq("email", ADMIN_EMAIL).single();
            if (spinySupplier) { setSupplier(spinySupplier); await loadMyProducts(spinySupplier.id); setIsSpinyAdmin(true); }
            setView("admin"); setCheckingSession(false); return;
          }
          const { data: sup } = await supabase.from("suppliers").select("*").eq("email", user.email).single();
          if (sup && sup.status === "approved") {
            setSupplier(sup); setProdWhatsApp(sup.whatsapp || "");
            await loadMyProducts(sup.id); setView("portal");
          }
        }
      } catch (e) {}
      setCheckingSession(false);
    }
    checkSession();
  }, []);

  async function loadAdminData() {
    const { data: suppliers } = await supabase.from("suppliers").select("*").order("created_at", { ascending: false });
    if (suppliers) setAllSuppliers(suppliers);
    const { data: products } = await supabase.from("supplier_products").select("*").order("created_at", { ascending: false });
    if (products) setAllProducts(products);
  }

  async function loadMyProducts(supplierId: string) {
    const { data } = await supabase.from("supplier_products").select("*").eq("supplier_id", supplierId).order("created_at", { ascending: false });
    if (data) setMyProducts(data);
  }

  async function handleApproveSupplier(id: string) {
    await supabase.from("suppliers").update({ status: "approved" }).eq("id", id);
    setAllSuppliers(prev => prev.map(s => s.id === id ? { ...s, status: "approved" } : s));
  }
  async function handleRejectSupplier(id: string) {
    await supabase.from("suppliers").update({ status: "rejected" }).eq("id", id);
    setAllSuppliers(prev => prev.map(s => s.id === id ? { ...s, status: "rejected" } : s));
  }
  async function handleApproveProduct(id: string) {
    await supabase.from("supplier_products").update({ status: "approved" }).eq("id", id);
    setAllProducts(prev => prev.map(p => p.id === id ? { ...p, status: "approved" } : p));
  }
  async function handleRejectProduct(id: string) {
    await supabase.from("supplier_products").update({ status: "rejected" }).eq("id", id);
    setAllProducts(prev => prev.map(p => p.id === id ? { ...p, status: "rejected" } : p));
  }

  async function handleApply() {
    setError("");
    if (!appName || !appCompany || !appEmail || !appWhatsApp) { setError("All fields required"); return; }
    setLoading(true);
    const { error: err } = await supabase.from("suppliers").insert({
      full_name: appName, company_name: appCompany, email: appEmail,
      whatsapp: appWhatsApp, category: appCategory, status: "pending", location: appLocation,
    });
    setLoading(false);
    if (err) { setError(err.message.includes("unique") ? "Email already registered" : err.message); return; }
    setSuccess("Application submitted! BSC will review and contact you on WhatsApp within 24 hours.");
  }

  async function handleLogin() {
    setError("");
    if (!loginEmail || !loginPassword) { setError("Email and password required"); return; }
    setLoading(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (err) { setError("Invalid credentials"); setLoading(false); return; }
    if (data.user.email) setProcessedBy(data.user.email.split("@")[0]);
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
    if (profile?.role === "control_admin" || profile?.role === "basic_admin" || profile?.role === "manager") {
      setIsAdmin(true);
      if (profile.role === "control_admin") setIsControlAdmin(true);
      await loadAdminData();
      const { data: spinySupplier } = await supabase.from("suppliers").select("*").eq("email", ADMIN_EMAIL).single();
      if (spinySupplier) { setSupplier(spinySupplier); await loadMyProducts(spinySupplier.id); setIsSpinyAdmin(true); }
      setLoading(false); setView("admin"); return;
    }
    const { data: sup } = await supabase.from("suppliers").select("*").eq("email", data.user.email).single();
    setLoading(false);
    if (!sup)                    { setError("No supplier account found. Apply first."); return; }
    if (sup.status === "pending")  { setError("Your application is still pending approval."); return; }
    if (sup.status === "rejected") { setError("Your application was not approved. Contact BSC."); return; }
    setSupplier(sup); setProdWhatsApp(sup.whatsapp || "");
    await loadMyProducts(sup.id); setView("portal");
  }

  async function uploadPhoto(): Promise<string> {
    if (!prodPhoto) return "";
    const fileName = Date.now() + "-" + prodPhoto.name;
    const { error: uploadErr } = await supabase.storage.from("product-images").upload(fileName, prodPhoto);
    if (uploadErr) return "";
    const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(fileName);
    return urlData.publicUrl;
  }

  async function handleUpload() {
    setError("");
    if (!prodName || !prodCategory) { setError("Product name and category required"); return; }
    setLoading(true);
    const photoUrl = await uploadPhoto();
    const existing = editingProduct?.photo_url || "";
    const status   = isAdmin ? "approved" : "pending";
    let payload: Record<string, unknown> = {
      supplier_id:       supplier!.id,
      supplier_name:     supplier!.full_name,
      supplier_whatsapp: prodWhatsApp || supplier!.whatsapp,
      sku: prodSku, name: prodName, category: prodCategory,
      photo_url: photoUrl || existing, status,
    };
    if (prodCategory === "vehicle") {
      if (vehicleListingType === "sale") {
        const cost    = parseFloat(vehicleSupplierCost) || 0;
        const pricing = calcVehicleSalePrice(cost);
        payload = { ...payload, case_cost: cost, unit_cost: cost, retail_price: pricing.customerPrice, wholesale_price: pricing.customerPrice, duty_rate: 0, duty_amount: 0, shipping_cost: 0, pieces_per_case: 1, year_make_model: prodYearMakeModel, vin: prodVin };
      } else {
        const dailyRate = parseFloat(vehicleSupplierDailyRate) || 0;
        const pricing   = calcRentalPrice(dailyRate);
        payload = { ...payload, case_cost: dailyRate, unit_cost: dailyRate, retail_price: pricing.dailyCustomer, wholesale_price: pricing.weeklyCustomer, duty_rate: 0, duty_amount: 0, shipping_cost: 0, pieces_per_case: 1, year_make_model: prodYearMakeModel, vin: prodVin };
      }
    } else if (prodCategory === "auto") {
      const cost    = parseFloat(partSupplierCost) || 0;
      const pricing = calcPartPrice(cost);
      payload = { ...payload, case_cost: cost, unit_cost: cost, retail_price: pricing.customerPrice, wholesale_price: pricing.customerPrice, duty_rate: 0, duty_amount: 0, shipping_cost: 0, pieces_per_case: 1, part_number: prodPartNumber, year_make_model: prodYearMakeModel, vin: prodVin };
    } else {
      const pricing = calcPricing(prodCaseCost, prodPieces, prodCategory, prodName, isUSSupplier);
      payload = {
        ...payload,
        case_cost:         parseFloat(prodCaseCost) || 0,
        case_weight_lbs:   parseFloat(prodCaseWeight) || 0,
        pieces_per_case:   parseFloat(prodPieces) || 1,
        price_per_lb:      parseFloat(prodPricePerLb) || 0,
        country_of_origin: prodOrigin,
        unit_cost:         parseFloat(pricing.unitCost.toFixed(2)),
        retail_price:      pricing.retailPrice,
        wholesale_price:   pricing.wholesalePrice,
        duty_rate:         pricing.dutyRate,
        duty_amount:       parseFloat(pricing.dutyAmount.toFixed(2)),
        shipping_cost:     pricing.shippingCost,
      };
    }
    const { error: err } = editingProduct
      ? await supabase.from("supplier_products").update(payload).eq("id", editingProduct.id)
      : await supabase.from("supplier_products").insert(payload);
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSuccess(isAdmin ? "Product live!" : "Product submitted for BSC approval.");
    if (supplier) await loadMyProducts(supplier.id);
    if (isAdmin) await loadAdminData();
    clearProductFields();
    setEditingProduct(null);
    setView(isAdmin ? "spiny" : "portal");
  }

  function clearProductFields() {
    setProdName(""); setProdSku(""); setProdCaseCost(""); setProdCaseWeight("");
    setProdPieces(""); setProdPricePerLb(""); setProdOrigin("");
    setProdPartNumber(""); setProdVin(""); setProdYearMakeModel("");
    setProdPhoto(null); setProdPhotoPreview("");
    setVehicleSupplierCost(""); setVehicleSupplierDailyRate(""); setPartSupplierCost("");
    setVehicleListingType("sale");
  }

  function startEdit(prod: SupplierProduct) {
    setEditingProduct(prod);
    setProdName(prod.name); setProdCategory(prod.category);
    setProdSku(prod.sku || ""); setProdCaseCost(prod.case_cost?.toString() || "");
    setProdCaseWeight(prod.case_weight_lbs?.toString() || "");
    setProdPieces(prod.pieces_per_case?.toString() || "");
    setProdPricePerLb(prod.price_per_lb?.toString() || "");
    setProdOrigin(prod.country_of_origin || "");
    setProdWhatsApp(prod.supplier_whatsapp || supplier?.whatsapp || "");
    setProdPhotoPreview(prod.photo_url || "");
    setProdVin(prod.vin || "");
    setProdYearMakeModel(prod.year_make_model || "");
    setVehicleSupplierCost(prod.case_cost?.toString() || "");
    setPartSupplierCost(prod.case_cost?.toString() || "");
    setProdPhoto(null); setError(""); setSuccess("");
    setView("edit");
  }

  const pg: React.CSSProperties           = { padding: 18, backgroundColor: "#0a0f1e", minHeight: "100vh", color: "#fff", fontFamily: "sans-serif", paddingBottom: 100, maxWidth: 560, margin: "0 auto", position: "relative" };
  const inp: React.CSSProperties          = { display: "block", width: "100%", padding: "11px 13px", borderRadius: 10, backgroundColor: "#111c33", color: "#fff", border: "1px solid #1e2d4a", fontSize: 14, marginBottom: 12, boxSizing: "border-box" as const, outline: "none" };
  const lbl: React.CSSProperties          = { display: "block", color: "#6b7280", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" as const, marginBottom: 5 };
  const primaryBtn: React.CSSProperties   = { width: "100%", padding: "13px", borderRadius: 10, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", fontSize: 15, cursor: "pointer", marginBottom: 10 };
  const secondaryBtn: React.CSSProperties = { width: "100%", padding: "11px", borderRadius: 10, backgroundColor: "transparent", color: "#6b7280", border: "1px solid #1e2d4a", fontSize: 14, cursor: "pointer", marginBottom: 10 };
  const card: React.CSSProperties         = { backgroundColor: "#111c33", borderRadius: 12, padding: "14px 16px", marginBottom: 12, border: "1px solid #1e2d4a" };
  const statusBadge = (status: string): React.CSSProperties => ({
    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: "bold",
    backgroundColor: status === "approved" ? "#0a1f0a" : status === "rejected" ? "#2d0000" : "#1a1400",
    color:           status === "approved" ? "#4ade80" : status === "rejected" ? "#f87171" : "#f5c518",
    border: "1px solid " + (status === "approved" ? "#4ade80" : status === "rejected" ? "#f87171" : "#f5c518"),
  });

  const BSCBack = () => (
    <button onClick={() => router.push("/")} style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, #1a1200, #2a1e00)", border: "1px solid #f5c518", borderRadius: 10, color: "#f5c518", fontWeight: "bold", fontSize: 12, cursor: "pointer", padding: "7px 14px", marginBottom: 14 }}>
      Back to BSC Control
    </button>
  );

  const WhatsAppSidebar = () => (
    <>
      <button onClick={() => setWaOpen((o) => !o)} style={{ position: "fixed", bottom: 24, right: 18, zIndex: 300, width: 56, height: 56, borderRadius: "50%", backgroundColor: "#25d366", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, boxShadow: "0 4px 20px rgba(37,211,102,0.4)" }}>
        WA
      </button>
      {waOpen && (
        <div style={{ position: "fixed", bottom: 90, right: 12, zIndex: 400, width: 340, maxWidth: "calc(100vw - 24px)", backgroundColor: "#0d1f3c", borderRadius: 20, border: "1px solid #1e3a5f", boxShadow: "0 8px 40px rgba(0,0,0,0.6)", overflow: "hidden" }}>
          <div style={{ background: "linear-gradient(135deg, #25d366, #128c7e)", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, color: "#fff", fontWeight: "bold", fontSize: 15 }}>BSC WhatsApp</p>
              <p style={{ margin: "2px 0 0", color: "rgba(255,255,255,0.8)", fontSize: 11 }}>+1 (242) 361-3474</p>
            </div>
            <button onClick={() => setWaOpen(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", padding: 0 }}>x</button>
          </div>
          <div style={{ display: "flex", borderBottom: "1px solid #1e3a5f" }}>
            {(["chat", "qr"] as const).map((t) => (
              <button key={t} onClick={() => setWaTab(t)} style={{ flex: 1, padding: "10px", border: "none", cursor: "pointer", fontWeight: "bold", fontSize: 12, backgroundColor: waTab === t ? "#0a1f0a" : "#0d1f3c", color: waTab === t ? "#25d366" : "#6b7280", borderBottom: waTab === t ? "2px solid #25d366" : "2px solid transparent" }}>
                {t === "chat" ? "Open Chat" : "QR Code"}
              </button>
            ))}
          </div>
          <div style={{ padding: 16 }}>
            {waTab === "chat" ? (
              <>
                <p style={{ margin: "0 0 12px", color: "#aaa", fontSize: 13 }}>Connect with BSC Admin or Manager.</p>
                {["Hi BSC! I have a question about my product.", "Hi BSC! Can you check my application status?", "Hi BSC! I need help updating my pricing.", "Hi BSC! I have a new product ready."].map((msg) => (
                  <a key={msg} href={"https://api.whatsapp.com/send?phone=" + BSC_WA_NUMBER + "&text=" + encodeURIComponent(msg)} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: 8, padding: "10px 12px", backgroundColor: "#111c33", borderRadius: 10, border: "1px solid #1e3a5f", color: "#fff", textDecoration: "none", fontSize: 12 }}>
                    {msg}
                  </a>
                ))}
                <a href={"https://api.whatsapp.com/send?phone=" + BSC_WA_NUMBER} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 4, padding: "12px", borderRadius: 10, backgroundColor: "#25d366", color: "#fff", fontWeight: "bold", textAlign: "center" as const, textDecoration: "none", fontSize: 14 }}>
                  Open WhatsApp
                </a>
              </>
            ) : (
              <div style={{ backgroundColor: "#fff", borderRadius: 12, padding: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <img src={"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent("https://api.whatsapp.com/send?phone=" + BSC_WA_NUMBER)} alt="QR" style={{ width: 200, height: 200, borderRadius: 8 }} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  const ProductForm = ({ isEdit }: { isEdit: boolean }) => {
    const currentIsUS = isUSSupplier;
    const foodPricing = (prodCategory !== "vehicle" && prodCategory !== "auto" && prodCaseCost && prodPieces)
      ? calcPricing(prodCaseCost, prodPieces, prodCategory, prodName, currentIsUS) : null;
    const salePricing   = prodCategory === "vehicle" && vehicleListingType === "sale" && vehicleSupplierCost
      ? calcVehicleSalePrice(parseFloat(vehicleSupplierCost) || 0) : null;
    const rentalPricing = prodCategory === "vehicle" && vehicleListingType === "rental" && vehicleSupplierDailyRate
      ? calcRentalPrice(parseFloat(vehicleSupplierDailyRate) || 0) : null;
    const partPricing   = prodCategory === "auto" && partSupplierCost
      ? calcPartPrice(parseFloat(partSupplierCost) || 0) : null;
    return (
      <>
        <div style={{ backgroundColor: currentIsUS ? "#1a0a00" : "#0a1f0a", border: "1px solid " + (currentIsUS ? "#f87171" : "#4ade80"), borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
          <p style={{ margin: 0, color: currentIsUS ? "#f87171" : "#4ade80", fontWeight: "bold", fontSize: 13 }}>
            {currentIsUS ? "US/Florida - Customs Duty + $400 shipping + 10% BSC markup applied" : "Bahamas Supplier - No duty, shipping, or BSC markup"}
          </p>
        </div>
        {isAdmin && (
          <div style={{ backgroundColor: "#0a1f0a", border: "1px solid #4ade80", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
            <p style={{ margin: 0, color: "#4ade80", fontWeight: "bold", fontSize: 13 }}>Admin - Changes go live instantly.</p>
          </div>
        )}
        <label style={lbl}>Product Photo</label>
        <div onClick={() => document.getElementById(isEdit ? "photoInputEdit" : "photoInput")?.click()} style={{ width: "100%", height: 140, borderRadius: 12, border: "2px dashed #1e2d4a", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 14, overflow: "hidden", backgroundColor: "#111c33" }}>
          {prodPhotoPreview ? <img src={prodPhotoPreview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ textAlign: "center" as const }}><p style={{ margin: 0, fontSize: 28 }}>Camera</p><p style={{ margin: "6px 0 0", color: "#4a5568", fontSize: 12 }}>Tap to take photo or upload</p></div>}
        </div>
        <input id={isEdit ? "photoInputEdit" : "photoInput"} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) { setProdPhoto(file); setProdPhotoPreview(URL.createObjectURL(file)); } }} />
        <label style={lbl}>Product Name</label>
        <input placeholder="e.g. Grouper Fillet" value={prodName} onChange={(e) => setProdName(e.target.value)} style={inp} />
        <label style={lbl}>Category</label>
        <select value={prodCategory} onChange={(e) => setProdCategory(e.target.value)} style={inp}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        <label style={lbl}>SKU / Product Code</label>
        <input placeholder="Unique product code" value={prodSku} onChange={(e) => setProdSku(e.target.value)} style={inp} />
        <label style={lbl}>WhatsApp Contact</label>
        <input placeholder="242-xxx-xxxx" value={prodWhatsApp} onChange={(e) => setProdWhatsApp(e.target.value)} style={inp} />
        {prodCategory !== "vehicle" && prodCategory !== "auto" && (
          <>
            <div style={{ backgroundColor: "#0a1220", borderRadius: 10, padding: "12px 14px", marginBottom: 14, border: "1px solid #1e2d4a" }}>
              <p style={{ margin: "0 0 10px", color: "#60a5fa", fontSize: 12, fontWeight: "bold" }}>PRODUCT DETAILS</p>
              <label style={lbl}>Case Cost Price ($)</label>
              <input type="number" placeholder="0.00" value={prodCaseCost} onChange={(e) => setProdCaseCost(e.target.value)} style={inp} />
              <label style={lbl}>Total Weight Per Case (lbs)</label>
              <input type="number" placeholder="0" value={prodCaseWeight} onChange={(e) => setProdCaseWeight(e.target.value)} style={inp} />
              <label style={lbl}>Pieces Per Case</label>
              <input type="number" placeholder="0" value={prodPieces} onChange={(e) => setProdPieces(e.target.value)} style={inp} />
              <label style={lbl}>Price Per Pound ($)</label>
              <input type="number" placeholder="0.00" value={prodPricePerLb} onChange={(e) => setProdPricePerLb(e.target.value)} style={inp} />
              <label style={lbl}>Country of Origin</label>
              <input placeholder="e.g. Bahamas, USA" value={prodOrigin} onChange={(e) => setProdOrigin(e.target.value)} style={{ ...inp, marginBottom: 0 }} />
            </div>
            {foodPricing && isAdmin && (
              <div style={{ backgroundColor: "#0a1220", border: "1px solid #f5c518", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                <p style={{ margin: "0 0 10px", color: "#f5c518", fontSize: 12, fontWeight: "bold" }}>CHANNEL PRICING PREVIEW</p>
                <p style={{ margin: "2px 0 8px", color: "#aaa", fontSize: 12 }}>Unit Cost: ${foodPricing.unitCost.toFixed(2)}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { label: "Nassau POS 38%",    value: foodPricing.nassauPrice,    color: "#60a5fa" },
                    { label: "Andros POS 43%",    value: foodPricing.androsPrice,    color: "#a78bfa" },
                    { label: "Online Market 25%", value: foodPricing.onlinePrice,    color: "#4ade80" },
                    { label: "Wholesale 12%",     value: foodPricing.wholesalePrice, color: "#f5c518" },
                  ].map((ch) => (
                    <div key={ch.label} style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "8px 10px" }}>
                      <p style={{ margin: 0, color: "#4a5568", fontSize: 9 }}>{ch.label}</p>
                      <p style={{ margin: "2px 0 0", color: ch.color, fontWeight: "bold", fontSize: 14 }}>${ch.value.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {prodCategory === "auto" && (
          <div style={{ backgroundColor: "#0a1220", borderRadius: 10, padding: "12px 14px", marginBottom: 14, border: "1px solid #a78bfa" }}>
            <p style={{ margin: "0 0 10px", color: "#a78bfa", fontSize: 12, fontWeight: "bold" }}>AUTO PART DETAILS</p>
            <label style={lbl}>Your Cost Price ($)</label>
            <input type="number" placeholder="e.g. 85.00" value={partSupplierCost} onChange={(e) => setPartSupplierCost(e.target.value)} style={{ ...inp, border: "1px solid #a78bfa" }} />
            {partPricing && (
              <div style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><p style={{ margin: 0, fontWeight: "bold", fontSize: 13 }}>Customer Pays</p><p style={{ margin: 0, color: "#4ade80", fontWeight: "bold", fontSize: 16 }}>${partPricing.customerPrice.toFixed(2)}</p></div>
              </div>
            )}
            <label style={lbl}>Part Number</label>
            <input placeholder="OEM/Aftermarket part number" value={prodPartNumber} onChange={(e) => setProdPartNumber(e.target.value)} style={inp} />
            <label style={lbl}>Year / Make / Model</label>
            <input placeholder="e.g. 2018 Toyota Camry" value={prodYearMakeModel} onChange={(e) => setProdYearMakeModel(e.target.value)} style={inp} />
            <label style={lbl}>VIN</label>
            <input placeholder="Vehicle VIN number" value={prodVin} onChange={(e) => setProdVin(e.target.value)} style={{ ...inp, marginBottom: 0 }} />
          </div>
        )}
        {prodCategory === "vehicle" && (
          <div style={{ backgroundColor: "#0a1220", borderRadius: 10, padding: "12px 14px", marginBottom: 14, border: "1px solid #f5c518" }}>
            <p style={{ margin: "0 0 10px", color: "#f5c518", fontSize: 12, fontWeight: "bold" }}>VEHICLE DETAILS</p>
            <label style={lbl}>Listing Type</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {(["sale", "rental"] as const).map((t) => (
                <button key={t} onClick={() => setVehicleListingType(t)} style={{ padding: "10px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: "bold", fontSize: 13, backgroundColor: vehicleListingType === t ? "#f5c518" : "#111c33", color: vehicleListingType === t ? "#000" : "#6b7280" }}>
                  {t === "sale" ? "For Sale" : "For Rent"}
                </button>
              ))}
            </div>
            <label style={lbl}>VIN Number</label>
            <input placeholder="Full VIN number" value={prodVin} onChange={(e) => setProdVin(e.target.value)} style={inp} />
            <label style={lbl}>Year / Make / Model</label>
            <input placeholder="e.g. 2020 Honda Civic" value={prodYearMakeModel} onChange={(e) => setProdYearMakeModel(e.target.value)} style={inp} />
            {vehicleListingType === "sale" ? (
              <>
                <label style={{ ...lbl, color: "#f5c518" }}>Your Cost Price ($)</label>
                <input type="number" placeholder="e.g. 15000.00" value={vehicleSupplierCost} onChange={(e) => setVehicleSupplierCost(e.target.value)} style={{ ...inp, border: "1px solid #f5c518" }} />
                {salePricing && (
                  <div style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><p style={{ margin: 0, fontWeight: "bold", fontSize: 13 }}>Customer Pays</p><p style={{ margin: 0, color: "#4ade80", fontWeight: "bold", fontSize: 18 }}>${salePricing.customerPrice.toLocaleString()}</p></div>
                    <p style={{ margin: "6px 0 0", color: "#f5c518", fontSize: 12 }}>BSC Profit: $650.00</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <label style={{ ...lbl, color: "#60a5fa" }}>Your Daily Rate ($)</label>
                <input type="number" placeholder="e.g. 50.00" value={vehicleSupplierDailyRate} onChange={(e) => setVehicleSupplierDailyRate(e.target.value)} style={{ ...inp, border: "1px solid #60a5fa" }} />
                {rentalPricing && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <div style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "8px 10px" }}>
                      <p style={{ margin: 0, color: "#4a5568", fontSize: 9 }}>DAILY RATE</p>
                      <p style={{ margin: "3px 0 0", color: "#60a5fa", fontWeight: "bold", fontSize: 16 }}>${rentalPricing.dailyCustomer.toFixed(2)}/day</p>
                    </div>
                    <div style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "8px 10px" }}>
                      <p style={{ margin: 0, color: "#4a5568", fontSize: 9 }}>WEEKLY RATE</p>
                      <p style={{ margin: "3px 0 0", color: "#60a5fa", fontWeight: "bold", fontSize: 16 }}>${rentalPricing.weeklyCustomer.toFixed(2)}/wk</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {error && <p style={{ color: "#f87171", fontSize: 13, backgroundColor: "#2d0000", padding: "10px 12px", borderRadius: 8, marginBottom: 12 }}>{error}</p>}
        <button onClick={handleUpload} disabled={loading} style={{ ...primaryBtn, backgroundColor: loading ? "#555" : "#f5c518", cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Saving..." : isAdmin ? "Save and Go Live" : (editingProduct ? "Save and Re-submit for Approval" : "Submit for Approval")}
        </button>
      </>
    );
  };

  if (checkingSession) return (
    <div style={{ ...pg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#4a5568" }}>Loading...</p>
    </div>
  );

  if (view === "admin") return (
    <div style={pg}>
      <WhatsAppSidebar />
      {isControlAdmin && <BSCBack />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, color: "#f5c518", fontSize: 20 }}>Supplier Admin</h2>
          <p style={{ margin: "2px 0 0", color: "#4a5568", fontSize: 11 }}>BSC Management</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => loadAdminData()} style={{ background: "none", border: "1px solid #1e2d4a", color: "#6b7280", fontSize: 12, cursor: "pointer", padding: "6px 12px", borderRadius: 8 }}>Refresh</button>
          <button onClick={async () => { await supabase.auth.signOut(); setIsAdmin(false); setIsControlAdmin(false); setIsSpinyAdmin(false); setSupplier(null); setMyProducts([]); setView("home"); }} style={{ background: "none", border: "1px solid #1e2d4a", color: "#f87171", fontSize: 12, cursor: "pointer", padding: "6px 12px", borderRadius: 8 }}>Sign Out</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { value: allSuppliers.filter((s) => s.status === "pending").length,  label: "PENDING",  color: "#f5c518" },
          { value: allSuppliers.filter((s) => s.status === "approved").length, label: "APPROVED", color: "#4ade80" },
          { value: allProducts.filter((p) => p.status === "pending").length,   label: "AWAITING", color: "#60a5fa" },
        ].map((stat) => (
          <div key={stat.label} style={{ ...card, textAlign: "center" as const, padding: 14 }}>
            <p style={{ margin: 0, color: stat.color, fontSize: 22, fontWeight: "bold" }}>{stat.value}</p>
            <p style={{ margin: "4px 0 0", color: "#4a5568", fontSize: 10 }}>{stat.label}</p>
          </div>
        ))}
      </div>
      {isSpinyAdmin && (
        <div style={{ ...card, borderColor: "#f5c518", background: "linear-gradient(135deg, #1a1200, #2a1e00)", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, color: "#f5c518", fontWeight: "bold", fontSize: 15 }}>Spiny Tails Processing</p>
              <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 12 }}>{myProducts.length} products</p>
            </div>
            <button onClick={() => setView("spiny")} style={{ padding: "9px 16px", borderRadius: 10, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 13 }}>Manage</button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setAdminTab("suppliers")} style={{ flex: 1, padding: "10px", borderRadius: 10, backgroundColor: adminTab === "suppliers" ? "#f5c518" : "#111c33", color: adminTab === "suppliers" ? "#000" : "#6b7280", border: "1px solid #1e2d4a", fontWeight: "bold", cursor: "pointer", fontSize: 12 }}>
          Suppliers ({allSuppliers.length})
        </button>
        <button onClick={() => setAdminTab("products")} style={{ flex: 1, padding: "10px", borderRadius: 10, backgroundColor: adminTab === "products" ? "#f5c518" : "#111c33", color: adminTab === "products" ? "#000" : "#6b7280", border: "1px solid #1e2d4a", fontWeight: "bold", cursor: "pointer", fontSize: 12 }}>
          Products ({allProducts.filter((p) => p.status === "pending").length} pending)
        </button>
      </div>
      {adminTab === "suppliers" && (
        <>
          {allSuppliers.length === 0 && <div style={{ ...card, textAlign: "center" as const, padding: 30 }}><p style={{ color: "#4a5568", margin: 0 }}>No supplier applications yet</p></div>}
          {allSuppliers.map((sup) => {
            const supplierProducts = allProducts.filter((p) => p.supplier_id === sup.id);
            const isUS             = sup.location === "florida" || sup.location === "usa";
            const isOwnAccount     = sup.email === ADMIN_EMAIL;
            return (
              <div key={sup.id} style={{ ...card, borderColor: isOwnAccount ? "#f5c518" : sup.status === "pending" ? "#f5c51866" : "#1e2d4a" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{sup.full_name}</p>
                    <p style={{ margin: "2px 0", color: "#aaa", fontSize: 13 }}>{sup.company_name}</p>
                    <p style={{ margin: "2px 0", color: "#60a5fa", fontSize: 12 }}>{sup.email}</p>
                    <p style={{ margin: "4px 0 0", color: isUS ? "#f87171" : "#4ade80", fontSize: 12, fontWeight: "bold" }}>{isUS ? "Florida / USA - 10% BSC markup" : "Bahamas"}</p>
                  </div>
                  <span style={statusBadge(sup.status)}>{sup.status.toUpperCase()}</span>
                </div>
                {supplierProducts.length > 0 && (
                  <div style={{ marginBottom: sup.status === "pending" ? 12 : 0 }}>
                    <p style={{ margin: "0 0 8px", color: "#6b7280", fontSize: 11 }}>PRODUCTS ({supplierProducts.length})</p>
                    {supplierProducts.map((prod) => (
                      <div key={prod.id} style={{ backgroundColor: "#060d1f", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #1e2d4a" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            {prod.photo_url && <img src={prod.photo_url} alt={prod.name} style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }} />}
                            <div>
                              <p style={{ margin: 0, fontWeight: "bold", fontSize: 13 }}>{prod.name}</p>
                              <p style={{ margin: 0, color: "#4a5568", fontSize: 11 }}>{prod.category} - Cost: ${prod.case_cost?.toFixed(2) || "0.00"}</p>
                            </div>
                          </div>
                          <span style={statusBadge(prod.status)}>{prod.status.toUpperCase()}</span>
                        </div>
                        {prod.status === "pending" && !isOwnAccount && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => handleApproveProduct(prod.id)} style={{ flex: 1, padding: "8px", borderRadius: 8, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 12 }}>Approve</button>
                            <button onClick={() => handleRejectProduct(prod.id)}  style={{ flex: 1, padding: "8px", borderRadius: 8, backgroundColor: "#3b0000", color: "#f87171", border: "1px solid #7f1d1d", cursor: "pointer", fontSize: 12 }}>Reject</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {sup.status === "pending" && !isOwnAccount && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleApproveSupplier(sup.id)} style={{ flex: 1, padding: "10px", borderRadius: 10, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 13 }}>Approve Supplier</button>
                    <button onClick={() => handleRejectSupplier(sup.id)}  style={{ flex: 1, padding: "10px", borderRadius: 10, backgroundColor: "#3b0000", color: "#f87171", border: "1px solid #7f1d1d", cursor: "pointer", fontSize: 13 }}>Reject</button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
      {adminTab === "products" && (
        <>
          {allProducts.length === 0 && <div style={{ ...card, textAlign: "center" as const, padding: 30 }}><p style={{ color: "#4a5568", margin: 0 }}>No products yet</p></div>}
          {allProducts.map((prod) => (
            <div key={prod.id} style={card}>
              <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                {prod.photo_url && <img src={prod.photo_url} alt={prod.name} style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover" }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{prod.name}</p>
                    <span style={statusBadge(prod.status)}>{prod.status.toUpperCase()}</span>
                  </div>
                  <p style={{ margin: "2px 0", color: "#4a5568", fontSize: 12 }}>By {prod.supplier_name}</p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: prod.status === "pending" ? 10 : 0 }}>
                {[
                  { l: "ONLINE",    v: "$" + (prod.retail_price?.toFixed(2) || "0.00"),    c: "#4ade80" },
                  { l: "WHOLESALE", v: "$" + (prod.wholesale_price?.toFixed(2) || "0.00"), c: "#f5c518" },
                  { l: "COST",      v: "$" + (prod.case_cost?.toFixed(2) || "0.00"),       c: "#60a5fa" },
                ].map((x) => (
                  <div key={x.l} style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "8px 10px" }}>
                    <p style={{ margin: 0, color: "#4a5568", fontSize: 10 }}>{x.l}</p>
                    <p style={{ margin: "2px 0 0", color: x.c, fontWeight: "bold", fontSize: 14 }}>{x.v}</p>
                  </div>
                ))}
              </div>
              {prod.status === "pending" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => handleApproveProduct(prod.id)} style={{ flex: 1, padding: "10px", borderRadius: 10, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 13 }}>Approve and Go Live</button>
                  <button onClick={() => handleRejectProduct(prod.id)}  style={{ flex: 1, padding: "10px", borderRadius: 10, backgroundColor: "#3b0000", color: "#f87171", border: "1px solid #7f1d1d", cursor: "pointer", fontSize: 13 }}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );

  if (view === "spiny") return (
    <div style={pg}>
      <WhatsAppSidebar />
      {isControlAdmin && <BSCBack />}
      <button onClick={() => setView("admin")} style={{ background: "none", border: "none", color: "#f5c518", fontSize: 14, cursor: "pointer", padding: 0, marginBottom: 12 }}>Back to Admin</button>
      <h2 style={{ margin: "0 0 4px", color: "#f5c518", fontSize: 20 }}>Spiny Tails Processing</h2>
      <p style={{ margin: "0 0 20px", color: "#4a5568", fontSize: 11 }}>Your products - Changes go live instantly</p>
      {success && <div style={{ backgroundColor: "#0a1f0a", border: "1px solid #4ade80", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}><p style={{ margin: 0, color: "#4ade80", fontSize: 13 }}>{success}</p></div>}
      <FullYieldCalculator processedBy={processedBy} />
      <div style={{ ...card, background: "linear-gradient(135deg, #0a1220, #0d1a2e)", borderColor: "#f5c518", marginBottom: 16 }}>
        <p style={{ margin: "0 0 4px", color: "#f5c518", fontWeight: "bold", fontSize: 13 }}>Admin Pricing Control</p>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>Prices are auto-calculated by BSC margins.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 10 }}>
          {[{ label: "Nassau", value: "38%", color: "#60a5fa" }, { label: "Andros", value: "43%", color: "#a78bfa" }, { label: "Online", value: "25%", color: "#4ade80" }, { label: "Wholesale", value: "15%", color: "#f5c518" }].map((m) => (
            <div key={m.label} style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "8px", textAlign: "center" as const }}>
              <p style={{ margin: 0, color: "#4a5568", fontSize: 9 }}>{m.label}</p>
              <p style={{ margin: "2px 0 0", color: m.color, fontWeight: "bold", fontSize: 14 }}>{m.value}</p>
            </div>
          ))}
        </div>
      </div>
      <button onClick={() => { clearProductFields(); setEditingProduct(null); setSuccess(""); setError(""); setView("upload"); }} style={primaryBtn}>Add New Product</button>
      {myProducts.length === 0
        ? <div style={{ ...card, textAlign: "center" as const, padding: 30 }}><p style={{ margin: 0, color: "#4a5568", fontSize: 13 }}>No products yet.</p></div>
        : myProducts.map((prod) => (
          <div key={prod.id} style={card}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {prod.photo_url && <img src={prod.photo_url} alt={prod.name} style={{ width: 60, height: 60, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{prod.name}</p>
                  <span style={statusBadge(prod.status)}>{prod.status.toUpperCase()}</span>
                </div>
                <p style={{ margin: "0 0 2px", color: "#4a5568", fontSize: 11 }}>{prod.category}{prod.sku ? " - SKU: " + prod.sku : ""}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                  <div style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "6px 10px" }}>
                    <p style={{ margin: 0, color: "#4a5568", fontSize: 9 }}>ONLINE</p>
                    <p style={{ margin: "2px 0 0", color: "#4ade80", fontWeight: "bold", fontSize: 13 }}>${prod.retail_price?.toFixed(2) || "0.00"}</p>
                  </div>
                  <div style={{ backgroundColor: "#060d1f", borderRadius: 8, padding: "6px 10px" }}>
                    <p style={{ margin: 0, color: "#4a5568", fontSize: 9 }}>WHOLESALE</p>
                    <p style={{ margin: "2px 0 0", color: "#f5c518", fontWeight: "bold", fontSize: 13 }}>${prod.wholesale_price?.toFixed(2) || "0.00"}</p>
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => startEdit(prod)} style={{ width: "100%", marginTop: 12, padding: "9px", borderRadius: 10, backgroundColor: "#0d1f3c", color: "#f5c518", border: "1px solid #f5c51866", fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>Edit Product</button>
          </div>
        ))}
    </div>
  );

  if (view === "home") return (
    <div style={pg}>
      <WhatsAppSidebar />
      <div style={{ textAlign: "center" as const, marginBottom: 32, paddingTop: 20 }}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>Ship</div>
        <h1 style={{ margin: 0, color: "#f5c518", fontSize: 22 }}>BSC Supplier Portal</h1>
        <p style={{ margin: "6px 0 0", color: "#4a5568", fontSize: 13 }}>Bahamian Seafood Connection</p>
      </div>
      <div style={{ ...card, marginBottom: 16 }}>
        <p style={{ margin: "0 0 4px", fontWeight: "bold", fontSize: 15 }}>New Supplier?</p>
        <p style={{ margin: "0 0 14px", color: "#4a5568", fontSize: 13 }}>Apply to become a BSC supplier.</p>
        <button onClick={() => setView("apply")} style={primaryBtn}>Apply Now</button>
      </div>
      <div style={{ ...card, marginBottom: 16 }}>
        <p style={{ margin: "0 0 4px", fontWeight: "bold", fontSize: 15 }}>Already Approved?</p>
        <p style={{ margin: "0 0 14px", color: "#4a5568", fontSize: 13 }}>Login to manage your products.</p>
        <button onClick={() => setView("login")} style={secondaryBtn}>Supplier Login</button>
      </div>
      <div style={{ ...card, borderColor: "#f5c518" }}>
        <p style={{ margin: "0 0 4px", fontWeight: "bold", fontSize: 15, color: "#f5c518" }}>BSC Management</p>
        <p style={{ margin: "0 0 14px", color: "#4a5568", fontSize: 13 }}>Review and approve suppliers and products.</p>
        <button onClick={() => setView("login")} style={{ ...secondaryBtn, borderColor: "#f5c518", color: "#f5c518" }}>Admin Login</button>
      </div>
    </div>
  );

  if (view === "apply") return (
    <div style={pg}>
      <WhatsAppSidebar />
      <button onClick={() => { setView("home"); setSuccess(""); setError(""); }} style={{ background: "none", border: "none", color: "#f5c518", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}>Back</button>
      <h2 style={{ color: "#f5c518", marginTop: 0, marginBottom: 4 }}>Supplier Application</h2>
      <p style={{ color: "#4a5568", fontSize: 13, marginBottom: 20 }}>BSC will review and contact you on WhatsApp within 24 hours.</p>
      {success ? (
        <div style={{ backgroundColor: "#0a1f0a", border: "1px solid #4ade80", borderRadius: 12, padding: 20, textAlign: "center" as const }}>
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
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
          <label style={lbl}>Supplier Location</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {LOCATIONS.map((loc) => (
              <button key={loc.value} onClick={() => setAppLocation(loc.value)} style={{ padding: "14px 10px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: "bold", textAlign: "center" as const, backgroundColor: appLocation === loc.value ? (loc.value === "florida" ? "#f87171" : "#4ade80") : "#111c33", color: appLocation === loc.value ? "#000" : "#6b7280" }}>
                {loc.label}
              </button>
            ))}
          </div>
          {error && <p style={{ color: "#f87171", fontSize: 13, backgroundColor: "#2d0000", padding: "10px 12px", borderRadius: 8, marginBottom: 12 }}>{error}</p>}
          <button onClick={handleApply} disabled={loading} style={{ ...primaryBtn, backgroundColor: loading ? "#555" : "#f5c518", cursor: loading ? "not-allowed" : "pointer" }}>{loading ? "Submitting..." : "Submit Application"}</button>
        </>
      )}
    </div>
  );

  if (view === "login") return (
    <div style={pg}>
      <WhatsAppSidebar />
      <button onClick={() => { setView("home"); setError(""); }} style={{ background: "none", border: "none", color: "#f5c518", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}>Back</button>
      <h2 style={{ color: "#f5c518", marginTop: 0, marginBottom: 4 }}>Login</h2>
      <p style={{ color: "#4a5568", fontSize: 13, marginBottom: 20 }}>Staff and approved suppliers login here</p>
      <label style={lbl}>Email</label>
      <input type="email" placeholder="your@email.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} style={inp} />
      <label style={lbl}>Password</label>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <input type={showLoginPw ? "text" : "password"} placeholder="Password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} style={{ ...inp, marginBottom: 0, paddingRight: 46 }} />
        <button onClick={() => setShowLoginPw(!showLoginPw)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#6b7280", padding: 0 }}>{showLoginPw ? "Hide" : "Show"}</button>
      </div>
      {error && <p style={{ color: "#f87171", fontSize: 13, backgroundColor: "#2d0000", padding: "10px 12px", borderRadius: 8, marginBottom: 12 }}>{error}</p>}
      <button onClick={handleLogin} disabled={loading} style={{ ...primaryBtn, backgroundColor: loading ? "#555" : "#f5c518", cursor: loading ? "not-allowed" : "pointer" }}>{loading ? "Signing in..." : "Sign In"}</button>
    </div>
  );

  if (view === "portal") return (
    <div style={pg}>
      <WhatsAppSidebar />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: "#f5c518", fontSize: 18 }}>My Products</h2>
          <p style={{ margin: "2px 0 0", color: "#4a5568", fontSize: 12 }}>{supplier?.company_name}</p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: isUSSupplier ? "#f87171" : "#4ade80", fontWeight: "bold" }}>{isUSSupplier ? "Florida / USA Supplier" : "Bahamas Supplier"}</p>
        </div>
        <button onClick={() => supabase.auth.signOut().then(() => { setSupplier(null); setMyProducts([]); setView("home"); })} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 12, cursor: "pointer" }}>Sign Out</button>
      </div>
      {success && <div style={{ backgroundColor: "#0a1f0a", border: "1px solid #4ade80", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}><p style={{ margin: 0, color: "#4ade80", fontSize: 13 }}>{success}</p></div>}
      <FullYieldCalculator processedBy={processedBy} />
      <button onClick={() => { clearProductFields(); setEditingProduct(null); setSuccess(""); setError(""); setView("upload"); }} style={primaryBtn}>Upload New Product</button>
      {myProducts.length === 0
        ? <div style={{ ...card, textAlign: "center" as const, padding: 30 }}><p style={{ margin: 0, color: "#4a5568", fontSize: 13 }}>No products yet. Upload your first product above.</p></div>
        : myProducts.map((prod) => (
          <div key={prod.id} style={card}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {prod.photo_url && <img src={prod.photo_url} alt={prod.name} style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} />}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <p style={{ margin: 0, fontWeight: "bold", fontSize: 14 }}>{prod.name}</p>
                  <span style={statusBadge(prod.status)}>{prod.status.toUpperCase()}</span>
                </div>
                <p style={{ margin: "2px 0 0", color: "#4a5568", fontSize: 11 }}>{prod.category}</p>
                {prod.sku && <p style={{ margin: "2px 0 0", color: "#4a5568", fontSize: 11 }}>SKU: {prod.sku}</p>}
                <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 11, fontStyle: "italic" }}>Prices are set by BSC management</p>
              </div>
            </div>
            <button onClick={() => startEdit(prod)} style={{ width: "100%", marginTop: 12, padding: "9px", borderRadius: 10, backgroundColor: "#0d1f3c", color: "#60a5fa", border: "1px solid #1e3a5f", fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>Edit Product</button>
          </div>
        ))}
    </div>
  );

  if (view === "upload") return (
    <div style={pg}>
      <WhatsAppSidebar />
      {isControlAdmin && <BSCBack />}
      <button onClick={() => { setView(isAdmin ? "spiny" : "portal"); setSuccess(""); setError(""); }} style={{ background: "none", border: "none", color: "#f5c518", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}>Back</button>
      <h2 style={{ color: "#f5c518", marginTop: 0, marginBottom: 4 }}>{isAdmin ? "Add Product - Spiny Tails" : "Upload Product"}</h2>
      <p style={{ color: "#4a5568", fontSize: 13, marginBottom: 20 }}>{isAdmin ? "Product goes live instantly." : "BSC will auto-calculate all channel prices."}</p>
      {success && <div style={{ backgroundColor: "#0a1f0a", border: "1px solid #4ade80", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}><p style={{ margin: 0, color: "#4ade80", fontSize: 14, fontWeight: "bold" }}>{success}</p></div>}
      <ProductForm isEdit={false} />
    </div>
  );

  if (view === "edit") return (
    <div style={pg}>
      <WhatsAppSidebar />
      {isControlAdmin && <BSCBack />}
      <button onClick={() => { setView(isAdmin ? "spiny" : "portal"); setSuccess(""); setError(""); setEditingProduct(null); clearProductFields(); }} style={{ background: "none", border: "none", color: "#f5c518", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}>Back</button>
      <h2 style={{ color: "#f5c518", marginTop: 0, marginBottom: 4 }}>Edit Product</h2>
      <p style={{ color: "#4a5568", fontSize: 13, marginBottom: 4 }}>{editingProduct?.name}</p>
      {!isAdmin && <p style={{ color: "#f87171", fontSize: 12, marginBottom: 20 }}>Editing will re-submit for BSC approval.</p>}
      {isAdmin && <p style={{ color: "#4ade80", fontSize: 12, marginBottom: 20 }}>Changes go live instantly.</p>}
      {success && <div style={{ backgroundColor: "#0a1f0a", border: "1px solid #4ade80", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}><p style={{ margin: 0, color: "#4ade80", fontSize: 14, fontWeight: "bold" }}>{success}</p></div>}
      <ProductForm isEdit={true} />
    </div>
  );

  return null;
}