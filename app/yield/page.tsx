"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const NASSAU_MARGIN = 0.38;
const ANDROS_MARGIN = 0.43;
const ONLINE_MARGIN = 0.25;
const WHOLESALE_MARGIN = 0.15;

function buildLotNumber(seq: number): string {
  const now = new Date();
  const y = now.getFullYear().toString();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const s = String(seq).padStart(3, "0");
  return "BSC-" + y + m + d + "-" + s;
}

async function getNextSequence(): Promise<number> {
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

function calcPrices(trueCost: number) {
  return {
    nassau:    +(trueCost / (1 - NASSAU_MARGIN)).toFixed(2),
    andros:    +(trueCost / (1 - ANDROS_MARGIN)).toFixed(2),
    online:    +(trueCost / (1 - ONLINE_MARGIN)).toFixed(2),
    wholesale: +(trueCost / (1 - WHOLESALE_MARGIN)).toFixed(2),
  };
}

function openPrint(html: string) {
  const w = window.open("", "_blank", "width=900,height=650");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

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
  channels: { nassau: number; andros: number; online: number; wholesale: number };
}

function labelHTML(lot: LotRecord): string {
  const ch = calcPrices(lot.true_cost_per_lb);
  return [
    "<!DOCTYPE html><html><head><title>Label " + lot.lot_number + "</title>",
    "<style>",
    "@page{size:100mm 60mm;margin:3mm;}",
    "body{font-family:Courier New,monospace;font-size:9pt;margin:0;padding:2mm;}",
    ".lot{font-size:13pt;font-weight:bold;}",
    "hr{border:none;border-top:1px solid #000;margin:2mm 0;}",
    ".row{display:flex;justify-content:space-between;margin-bottom:1mm;}",
    ".grid{display:grid;grid-template-columns:1fr 1fr;gap:1mm;margin-top:2mm;}",
    ".cell{border:1px solid #333;padding:1mm 2mm;font-size:8pt;}",
    ".foot{font-size:7pt;color:#666;text-align:center;margin-top:2mm;}",
    "</style></head><body>",
    "<div class=lot>" + lot.lot_number + "</div><hr/>",
    "<div class=row><b>" + lot.product_type + "</b><span>" + new Date(lot.created_at).toLocaleDateString() + "</span></div>",
    "<div class=row><span>Captain: " + lot.captain_name + "</span><span>Boat: " + lot.boat_reg + "</span></div>",
    "<div class=row><span>Clean Wt: <b>" + lot.clean_weight_lb + " lbs</b></span><span>Yield: <b>" + lot.yield_pct + "%</b></span></div>",
    "<hr/><div class=grid>",
    "<div class=cell><b>Nassau</b><br>$" + ch.nassau + "/lb</div>",
    "<div class=cell><b>Andros</b><br>$" + ch.andros + "/lb</div>",
    "<div class=cell><b>Online</b><br>$" + ch.online + "/lb</div>",
    "<div class=cell><b>Wholesale</b><br>$" + ch.wholesale + "/lb</div>",
    "</div>",
    "<div class=foot>BSC Marketplace - bscbahamas.com</div>",
    "</body></html>"
  ].join("");
}

function docHTML(lot: LotRecord): string {
  const ch = calcPrices(lot.true_cost_per_lb);
  const lost = (lot.whole_weight_lb - lot.clean_weight_lb).toFixed(2);
  const date = new Date(lot.created_at).toLocaleString();
  return [
    "<!DOCTYPE html><html><head><title>Lot " + lot.lot_number + "</title>",
    "<style>",
    "@page{margin:20mm;}",
    "body{font-family:Georgia,serif;font-size:11pt;color:#111;}",
    "h2{font-size:12pt;border-bottom:2px solid #000;padding-bottom:2mm;margin-top:8mm;}",
    "table{width:100%;border-collapse:collapse;margin-top:4mm;}",
    "td,th{border:1px solid #ccc;padding:3mm 4mm;}",
    "th{background:#f0f0f0;font-weight:bold;text-align:left;}",
    ".lot{font-family:Courier New,monospace;font-size:22pt;font-weight:bold;}",
    ".sigs{display:flex;gap:20mm;margin-top:16mm;}",
    ".sig{flex:1;border-top:1px solid #000;padding-top:2mm;font-size:9pt;}",
    ".foot{margin-top:12mm;font-size:8pt;color:#888;border-top:1px solid #ccc;padding-top:3mm;}",
    "</style></head><body>",
    "<div style=display:flex;justify-content:space-between>",
    "<div><div style=font-size:9pt;font-weight:bold>BSC MARKETPLACE - YIELD PROCESSING RECORD</div>",
    "<div class=lot>" + lot.lot_number + "</div></div>",
    "<div style=text-align:right;font-size:9pt>",
    "<div><b>bscbahamas.com</b></div>",
    "<div>+1 (242) 361-3474</div>",
    "<div>Date: " + date + "</div>",
    "<div>Processed By: " + lot.processed_by + "</div></div></div>",
    "<h2>Supplier and Catch</h2>",
    "<table>",
    "<tr><th>Captain Name</th><td>" + lot.captain_name + "</td><th>Boat Registration</th><td>" + lot.boat_reg + "</td></tr>",
    "<tr><th>Product Type</th><td colspan=3>" + lot.product_type + "</td></tr>",
    "</table>",
    "<h2>Yield Calculation</h2>",
    "<table>",
    "<tr><th>Whole Weight In</th><td>" + lot.whole_weight_lb + " lbs</td><th>Clean Weight Out</th><td>" + lot.clean_weight_lb + " lbs</td></tr>",
    "<tr><th>Weight Lost</th><td>" + lost + " lbs</td><th>Yield %</th><td><b>" + lot.yield_pct + "%</b></td></tr>",
    "<tr><th>Total Cost Paid</th><td>$" + Number(lot.cost_paid).toFixed(2) + "</td><th>True Cost per lb</th><td><b>$" + Number(lot.true_cost_per_lb).toFixed(2) + "</b></td></tr>",
    "</table>",
    "<h2>Channel Pricing</h2>",
    "<table>",
    "<tr><th>Nassau POS 38 percent margin</th><td><b>$" + ch.nassau + " per lb</b></td></tr>",
    "<tr><th>Andros POS 43 percent margin</th><td><b>$" + ch.andros + " per lb</b></td></tr>",
    "<tr><th>Online Marketplace 25 percent margin</th><td><b>$" + ch.online + " per lb</b></td></tr>",
    "<tr><th>Wholesale 15 percent margin</th><td><b>$" + ch.wholesale + " per lb</b></td></tr>",
    "</table>",
    "<div class=sigs>",
    "<div class=sig>Operator Signature</div>",
    "<div class=sig>Supervisor Signature</div>",
    "<div class=sig>Date Approved</div>",
    "</div>",
    "<div class=foot>Lot " + lot.lot_number + " - BSC Marketplace - Bahamian Seafood Connection - All Rights Reserved</div>",
    "</body></html>"
  ].join("");
}

export default function YieldPage() {
  const blank = { captain_name: "", boat_reg: "", product_type: "", whole_weight_lb: "", clean_weight_lb: "", cost_paid: "" };
  const [processedBy, setProcessedBy] = useState("Staff");
  const [form, setForm]       = useState(blank);
  const [calcs, setCalcs]     = useState<Calcs | null>(null);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState<LotRecord | null>(null);
  const [history, setHistory] = useState<LotRecord[]>([]);
  const [tab, setTab]         = useState<"entry" | "history">("entry");
  const [search, setSearch]   = useState("");
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [openLot, setOpenLot] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setProcessedBy(data.user.email.split("@")[0]);
    });
    loadHistory();
  }, []);

  useEffect(() => {
    const w    = parseFloat(form.whole_weight_lb);
    const c    = parseFloat(form.clean_weight_lb);
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
      .from("yield_lots")
      .select("*")
      .order("created_at", { ascending: false })
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
      setForm(blank);
      setCalcs(null);
      showToast("Lot " + lot_number + " saved successfully");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      showToast("Save failed: " + msg, false);
    } finally {
      setSaving(false);
    }
  }

  const filtered = history.filter((h) =>
    !search ||
    h.lot_number.toLowerCase().includes(search.toLowerCase()) ||
    h.captain_name.toLowerCase().includes(search.toLowerCase()) ||
    h.product_type.toLowerCase().includes(search.toLowerCase()) ||
    h.boat_reg.toLowerCase().includes(search.toLowerCase())
  );

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#161b22",
    border: "1px solid #2a3a4a",
    borderRadius: 6,
    padding: "10px 14px",
    color: "#e6edf3",
    fontFamily: "inherit",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
  };

  const cardStyle: React.CSSProperties = {
    background: "#0e1821",
    borderRadius: 10,
    border: "1px solid #1e2d3d",
    padding: 24,
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: ".25em",
    fontFamily: "monospace",
    color: "#c47d00",
    fontWeight: "bold",
    marginBottom: 14,
    textTransform: "uppercase",
  };

  const fieldLabel: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    color: "#8b9ab0",
    marginBottom: 5,
    marginTop: 14,
    fontFamily: "monospace",
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    background: active ? "#c47d00" : "transparent",
    border: "1px solid " + (active ? "#c47d00" : "#2a3a4a"),
    color: active ? "#fff" : "#8b9ab0",
    padding: "8px 20px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: active ? "bold" : "normal",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#e6edf3", fontFamily: "Georgia, serif" }}>

      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 24px", borderRadius: 6, color: "#fff", fontFamily: "monospace", fontSize: 14, background: toast.ok ? "#0e6b3a" : "#9b1c1c" }}>
          {toast.msg}
        </div>
      )}

      <div style={{ background: "#0e1821", borderBottom: "2px solid #c47d00", padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: ".3em", color: "#c47d00", fontFamily: "monospace", fontWeight: "bold" }}>BSC MARKETPLACE</div>
          <div style={{ fontSize: 26, fontWeight: "bold", marginTop: 2 }}>Yield Calculator</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setTab("entry")}   style={tabBtn(tab === "entry")}>New Entry</button>
          <button onClick={() => setTab("history")} style={tabBtn(tab === "history")}>
            Lot History
            {history.length > 0 && <span style={{ background: "#fff", color: "#c47d00", borderRadius: 10, padding: "1px 7px", fontSize: 11, marginLeft: 6, fontWeight: "bold" }}>{history.length}</span>}
          </button>
        </div>
      </div>

      {tab === "entry" && (
        <div style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto" }}>

          {saved && (
            <div style={{ background: "#0e2d1e", border: "1px solid #0e6b3a", borderRadius: 8, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: "bold", color: "#3dd68c" }}>{saved.lot_number}</div>
              <div style={{ color: "#8b9ab0", fontSize: 13, flex: 1 }}>Saved - {saved.product_type}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => openPrint(labelHTML(saved))} style={{ background: "#1a3a1a", border: "1px solid #0e6b3a", color: "#3dd68c", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Print Label</button>
                <button onClick={() => openPrint(docHTML(saved))}   style={{ background: "#1a2a3a", border: "1px solid #1e5a8a", color: "#58b4f0", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Print Document</button>
                <button onClick={() => setSaved(null)}              style={{ background: "transparent", border: "1px solid #3a2a2a", color: "#8b5a5a", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Dismiss</button>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

            <div style={cardStyle}>
              <div style={sectionLabel}>Catch Information</div>
              <label style={fieldLabel}>Captain Name <span style={{ color: "#c47d00" }}>*</span></label>
              <input style={inputStyle} placeholder="Enter captain full name" value={form.captain_name} onChange={(e) => setForm({ ...form, captain_name: e.target.value })} />
              <label style={fieldLabel}>Boat Registration Number <span style={{ color: "#c47d00" }}>*</span></label>
              <input style={inputStyle} placeholder="e.g. BS-1234" value={form.boat_reg} onChange={(e) => setForm({ ...form, boat_reg: e.target.value })} />
              <label style={fieldLabel}>Product Type <span style={{ color: "#c47d00" }}>*</span></label>
              <input style={inputStyle} placeholder="Type exact product e.g. Nassau Grouper" value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value })} />
              <div style={{ ...sectionLabel, marginTop: 24 }}>Weight and Cost</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={fieldLabel}>Whole Weight In lbs <span style={{ color: "#c47d00" }}>*</span></label>
                  <input style={inputStyle} type="number" min="0" step="0.01" placeholder="0.00" value={form.whole_weight_lb} onChange={(e) => setForm({ ...form, whole_weight_lb: e.target.value })} />
                </div>
                <div>
                  <label style={fieldLabel}>Clean Weight Out lbs <span style={{ color: "#c47d00" }}>*</span></label>
                  <input style={inputStyle} type="number" min="0" step="0.01" placeholder="0.00" value={form.clean_weight_lb} onChange={(e) => setForm({ ...form, clean_weight_lb: e.target.value })} />
                </div>
              </div>
              <label style={fieldLabel}>Total Cost Paid dollars <span style={{ color: "#c47d00" }}>*</span></label>
              <input style={inputStyle} type="number" min="0" step="0.01" placeholder="0.00" value={form.cost_paid} onChange={(e) => setForm({ ...form, cost_paid: e.target.value })} />
              <div style={{ fontSize: 12, color: "#5a7a9a", fontFamily: "monospace", marginTop: 16, paddingTop: 12, borderTop: "1px solid #1e2d3d" }}>
                Processed by: <b>{processedBy}</b>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={sectionLabel}>Live Results</div>
              {!calcs ? (
                <div style={{ textAlign: "center", color: "#3a5a7a", padding: "48px 20px", fontStyle: "italic", lineHeight: 1.8 }}>
                  Fill in all fields to see yield and channel prices
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                    {[
                      { label: "Yield Percent", val: calcs.yieldPct + "%", color: "#0e6b3a" },
                      { label: "Weight Lost", val: (parseFloat(form.whole_weight_lb) - parseFloat(form.clean_weight_lb)).toFixed(2) + " lbs", color: "#7a4000" },
                      { label: "True Cost per lb", val: "$" + calcs.trueCost.toFixed(2), color: "#00427a" },
                      { label: "Clean Weight", val: form.clean_weight_lb + " lbs", color: "#4a0070" },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ background: "#161b22", border: "1px solid " + color, borderRadius: 8, padding: "14px 16px", textAlign: "center" }}>
                        <div style={{ fontSize: 22, fontWeight: "bold", fontFamily: "monospace", color }}>{val}</div>
                        <div style={{ fontSize: 11, color: "#5a7a9a", marginTop: 4 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={sectionLabel}>Channel Prices per lb</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                    {[
                      { label: "Nassau POS", margin: "38%", price: calcs.channels.nassau,    color: "#c47d00" },
                      { label: "Andros POS", margin: "43%", price: calcs.channels.andros,    color: "#6b2fa0" },
                      { label: "Online",     margin: "25%", price: calcs.channels.online,    color: "#005f8a" },
                      { label: "Wholesale",  margin: "15%", price: calcs.channels.wholesale, color: "#2a6a2a" },
                    ].map(({ label, margin, price, color }) => (
                      <div key={label} style={{ background: "#161b22", borderRadius: 6, padding: "12px 14px", border: "1px solid #1e2d3d", borderLeft: "4px solid " + color }}>
                        <div style={{ fontSize: 12, fontWeight: "bold", fontFamily: "monospace", color }}>{label}</div>
                        <div style={{ fontSize: 10, color: "#5a7a9a", margin: "2px 0 6px" }}>{margin} margin</div>
                        <div style={{ fontSize: 20, fontWeight: "bold", fontFamily: "monospace", color }}>${price.toFixed(2)}<span style={{ fontSize: 12, opacity: .6 }}>/lb</span></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <button
                disabled={!calcs || saving}
                onClick={handleSave}
                style={{ width: "100%", background: "#c47d00", color: "#fff", border: "none", borderRadius: 8, padding: 14, fontSize: 15, fontWeight: "bold", fontFamily: "inherit", marginTop: 4, cursor: calcs && !saving ? "pointer" : "not-allowed", opacity: calcs && !saving ? 1 : 0.4 }}
              >
                {saving ? "Saving..." : "Save Lot and Generate Lot Number"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <input
              style={{ ...inputStyle, maxWidth: 380 }}
              placeholder="Search lot, captain, product, boat..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span style={{ color: "#5a7a9a", fontFamily: "monospace", fontSize: 13 }}>{filtered.length} lots</span>
          </div>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", color: "#3a5a7a", padding: "48px 20px", fontStyle: "italic" }}>No lots found.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map((lot) => {
                const isOpen = openLot === lot.lot_number;
                const ch = calcPrices(lot.true_cost_per_lb);
                return (
                  <div key={lot.lot_number} style={{ background: "#0e1821", border: "1px solid #1e2d3d", borderRadius: 8, overflow: "hidden" }}>
                    <div onClick={() => setOpenLot(isOpen ? null : lot.lot_number)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", cursor: "pointer" }}>
                      <div>
                        <div style={{ fontFamily: "monospace", fontWeight: "bold", fontSize: 15, color: "#c47d00" }}>{lot.lot_number}</div>
                        <div style={{ fontSize: 13, color: "#5a7a9a", marginTop: 3 }}>{lot.product_type} - {lot.captain_name} - {lot.boat_reg}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, color: "#5a7a9a", fontFamily: "monospace" }}>{new Date(lot.created_at).toLocaleDateString()}</span>
                        <span style={{ fontSize: 13, color: "#3dd68c", fontFamily: "monospace", fontWeight: "bold" }}>{lot.yield_pct}% yield</span>
                        <span style={{ color: "#5a7a9a" }}>{isOpen ? "v" : ">"}</span>
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ padding: "16px 20px", borderTop: "1px solid #1e2d3d", background: "#0a1117" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px 16px", fontSize: 13, marginBottom: 14 }}>
                          <div><span style={{ color: "#5a7a9a" }}>Whole Wt:</span> {lot.whole_weight_lb} lbs</div>
                          <div><span style={{ color: "#5a7a9a" }}>Clean Wt:</span> {lot.clean_weight_lb} lbs</div>
                          <div><span style={{ color: "#5a7a9a" }}>Cost Paid:</span> ${Number(lot.cost_paid).toFixed(2)}</div>
                          <div><span style={{ color: "#5a7a9a" }}>True Cost/lb:</span> ${Number(lot.true_cost_per_lb).toFixed(2)}</div>
                          <div><span style={{ color: "#5a7a9a" }}>Nassau:</span> ${ch.nassau}/lb</div>
                          <div><span style={{ color: "#5a7a9a" }}>Andros:</span> ${ch.andros}/lb</div>
                          <div><span style={{ color: "#5a7a9a" }}>Online:</span> ${ch.online}/lb</div>
                          <div><span style={{ color: "#5a7a9a" }}>Wholesale:</span> ${ch.wholesale}/lb</div>
                          <div><span style={{ color: "#5a7a9a" }}>By:</span> {lot.processed_by}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => openPrint(labelHTML(lot))} style={{ background: "#1a3a1a", border: "1px solid #0e6b3a", color: "#3dd68c", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Print Label</button>
                          <button onClick={() => openPrint(docHTML(lot))}   style={{ background: "#1a2a3a", border: "1px solid #1e5a8a", color: "#58b4f0", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Print Document</button>
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
    </div>
  );
}