"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { products, type Product } from "../../lib/store";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Bahamas pricing ──────────────────────────────────────────
const BS_RETAIL_MARKUP    = 1.25;   // Nassau retail
const BS_WHOLESALE_MARKUP = 1.12;   // Bulk/wholesale
const BS_DELIVERY_FEE     = 15;     // Nassau local delivery

// ── U.S. pricing placeholder ─────────────────────────────────
// Full calculation = supplier cost + state tax + processing fees
//                 + operating cost allocation + BSC margin
// Backend rate not yet connected — UI shows structure only
const US_SHIPPING_MESSAGE = "Calculated after order review";

type Market    = "bahamas" | "us";
type OrderType = "retail" | "wholesale";
type CartItem  = { product: Product; qty: number };
type View      = "home" | "shop" | "cart";

const CATEGORIES = [
  { id: "all",     label: "All Products" },
  { id: "seafood", label: "Seafood"      },
  { id: "poultry", label: "Poultry"      },
  { id: "meat",    label: "Meats"        },
];

export default function MarketPage() {
  const router = useRouter();

  const [view, setView]                   = useState<View>("home");
  const [market, setMarket]               = useState<Market>("bahamas");
  const [orderType, setOrderType]         = useState<OrderType>("retail");
  const [cart, setCart]                   = useState<CartItem[]>([]);
  const [search, setSearch]               = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [supplierProducts, setSupplierProducts] = useState<any[]>([]);
  const [showMarketModal, setShowMarketModal] = useState(false);

  // Active markup depends on market + order type
  const activeMarkup =
    market === "us"         ? null                  // US price shown as "Quote on request"
    : orderType === "wholesale" ? BS_WHOLESALE_MARKUP
    : BS_RETAIL_MARKUP;

  const deliveryFee = market === "bahamas" ? BS_DELIVERY_FEE : 0;

  const cartCount    = cart.reduce((s, c) => s + c.qty, 0);
  const cartSubtotal = market === "bahamas"
    ? cart.reduce((s, c) => s + c.product.price * (activeMarkup ?? BS_RETAIL_MARKUP) * c.qty, 0)
    : 0; // US subtotal shown as "pending quote"

  useEffect(() => {
    supabase
      .from("supplier_products")
      .select("id, name, category, retail_price, photo_url, admin_photo_url, supplier_name, stock_qty")
      .eq("status", "approved")
      .then(({ data }) => { if (data) setSupplierProducts(data); });
  }, []);

  function addToCart(product: Product) {
    setCart(prev => {
      const ex = prev.find(c => c.product.id === product.id);
      return ex
        ? prev.map(c => c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c)
        : [...prev, { product, qty: 1 }];
    });
  }

  function adjustQty(id: string, delta: number) {
    setCart(prev =>
      prev.map(c => c.product.id === id ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0)
    );
  }

  const allProducts = [
    ...products.filter(p => p.stock > p.minStock),
    ...supplierProducts.map(sp => ({
      id:       sp.id,
      name:     sp.name,
      price:    sp.retail_price / BS_RETAIL_MARKUP,
      stock:    sp.stock_qty ?? 999,
      minStock: 0,
      category: sp.category,
      image:    sp.admin_photo_url || sp.photo_url ||
                "https://images.unsplash.com/photo-1534482421-64566f976cfa?w=400&q=80",
    })),
  ].filter(p =>
    (activeCategory === "all" || p.category === activeCategory) &&
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Styles ──────────────────────────────────────────────────
  const pg: React.CSSProperties = {
    backgroundColor: "#04090f", minHeight: "100vh", color: "#fff",
    fontFamily: "'Georgia','Times New Roman',serif", paddingBottom: 100,
  };
  const sans = "'DM Sans',system-ui,sans-serif";
  const serif = "'Playfair Display',Georgia,serif";
  const inp: React.CSSProperties = {
    display: "block", width: "100%", padding: "13px 16px", borderRadius: 10,
    backgroundColor: "#0d1a2a", color: "#fff", border: "1px solid #1e3a5f",
    fontSize: 15, marginBottom: 12, boxSizing: "border-box" as const,
    outline: "none", fontFamily: sans,
  };
  const primaryBtn: React.CSSProperties = {
    padding: "13px 28px", borderRadius: 10, backgroundColor: "#f5c518",
    color: "#000", fontWeight: "bold", border: "none", fontSize: 14,
    cursor: "pointer", fontFamily: sans,
  };
  const outlineBtn: React.CSSProperties = {
    padding: "13px 28px", borderRadius: 10, backgroundColor: "transparent",
    color: "#f5c518", fontWeight: "bold",
    border: "1px solid rgba(245,197,24,0.45)", fontSize: 14,
    cursor: "pointer", fontFamily: sans,
  };
  const ghostBtn: React.CSSProperties = {
    width: "100%", padding: "13px", borderRadius: 10, backgroundColor: "transparent",
    color: "#6b7280", border: "1px solid #1e3a5f", fontSize: 14,
    cursor: "pointer", marginBottom: 10, fontFamily: sans,
  };

  // ── Market selector pill ─────────────────────────────────────
  const MarketPill = () => (
    <button
      onClick={() => setShowMarketModal(true)}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 20, backgroundColor: "rgba(245,197,24,0.1)", border: "1px solid rgba(245,197,24,0.3)", cursor: "pointer" }}
    >
      <span style={{ fontSize: 15 }}>{market === "bahamas" ? "🇧🇸" : "🇺🇸"}</span>
      <span style={{ color: "#f5c518", fontSize: 12, fontWeight: "bold", fontFamily: sans }}>
        {market === "bahamas" ? "Bahamas" : "United States"}
      </span>
      <span style={{ color: "#4a5568", fontSize: 10, fontFamily: sans }}>▼</span>
    </button>
  );

  // ── Market modal ─────────────────────────────────────────────
  const MarketModal = () => !showMarketModal ? null : (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ backgroundColor: "#070d18", borderRadius: 20, border: "1px solid rgba(245,197,24,0.2)", padding: "32px 28px", maxWidth: 480, width: "100%" }}>
        <p style={{ margin: "0 0 6px", color: "#f5c518", fontSize: 11, letterSpacing: "0.3em", fontFamily: sans, fontWeight: "600" }}>SELECT YOUR MARKET</p>
        <h3 style={{ margin: "0 0 8px", color: "#fff", fontFamily: serif, fontSize: 22, fontWeight: 700 }}>Where are you shopping from?</h3>
        <p style={{ margin: "0 0 24px", color: "#4a5568", fontSize: 13, fontFamily: sans }}>This sets your pricing, delivery options, and shipping method.</p>

        {/* Bahamas */}
        <div
          onClick={() => { setMarket("bahamas"); setShowMarketModal(false); }}
          style={{ backgroundColor: market === "bahamas" ? "rgba(245,197,24,0.08)" : "#0a1520", border: "1px solid " + (market === "bahamas" ? "#f5c518" : "rgba(255,255,255,0.06)"), borderRadius: 14, padding: "20px 22px", marginBottom: 12, cursor: "pointer" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
            <span style={{ fontSize: 28 }}>🇧🇸</span>
            <div>
              <p style={{ margin: 0, color: "#fff", fontWeight: "bold", fontSize: 16, fontFamily: serif }}>Bahamas Market</p>
              <p style={{ margin: "2px 0 0", color: "#4a5568", fontSize: 12, fontFamily: sans }}>Nassau, Grand Bahama, Family Islands</p>
            </div>
            {market === "bahamas" && <span style={{ marginLeft: "auto", color: "#f5c518", fontSize: 18 }}>✓</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Retail",    desc: "Standard BSC pricing"      },
              { label: "Wholesale", desc: "Bulk orders for businesses" },
              { label: "Delivery",  desc: "$15 Nassau local delivery"  },
              { label: "Mailboat",  desc: "All Family Islands"         },
            ].map(f => (
              <div key={f.label} style={{ backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 12px" }}>
                <p style={{ margin: "0 0 2px", color: "#f5c518", fontSize: 11, fontWeight: "600", fontFamily: sans }}>{f.label}</p>
                <p style={{ margin: 0, color: "#4a5568", fontSize: 11, fontFamily: sans }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* United States */}
        <div
          onClick={() => { setMarket("us"); setOrderType("retail"); setShowMarketModal(false); }}
          style={{ backgroundColor: market === "us" ? "rgba(96,165,250,0.08)" : "#0a1520", border: "1px solid " + (market === "us" ? "#60a5fa" : "rgba(255,255,255,0.06)"), borderRadius: 14, padding: "20px 22px", marginBottom: 20, cursor: "pointer" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
            <span style={{ fontSize: 28 }}>🇺🇸</span>
            <div>
              <p style={{ margin: 0, color: "#fff", fontWeight: "bold", fontSize: 16, fontFamily: serif }}>United States Market</p>
              <p style={{ margin: "2px 0 0", color: "#4a5568", fontSize: 12, fontFamily: sans }}>Domestic U.S. customers</p>
            </div>
            {market === "us" && <span style={{ marginLeft: "auto", color: "#60a5fa", fontSize: 18 }}>✓</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "No Bahamas Duty",     desc: "U.S. domestic pricing"           },
              { label: "State Tax",           desc: "Included in U.S. price"          },
              { label: "No Mailboat",         desc: "U.S. carrier shipping"           },
              { label: "Shipping",            desc: "Calculated after order review"   },
            ].map(f => (
              <div key={f.label} style={{ backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 12px" }}>
                <p style={{ margin: "0 0 2px", color: "#60a5fa", fontSize: 11, fontWeight: "600", fontFamily: sans }}>{f.label}</p>
                <p style={{ margin: 0, color: "#4a5568", fontSize: 11, fontFamily: sans }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => setShowMarketModal(false)} style={{ width: "100%", padding: "12px", borderRadius: 10, backgroundColor: "transparent", color: "#6b7280", border: "1px solid #1e3a5f", cursor: "pointer", fontFamily: sans }}>
          Cancel
        </button>
      </div>
    </div>
  );

  // ── Header ───────────────────────────────────────────────────
  const Header = () => (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600&display=swap');
        .bsc-card { transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .bsc-card:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.4); }
        .bsc-gold:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(245,197,24,0.35); }
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .fu1 { animation: fadeUp 0.6s 0.1s ease forwards; opacity:0; }
        .fu2 { animation: fadeUp 0.6s 0.25s ease forwards; opacity:0; }
        .fu3 { animation: fadeUp 0.6s 0.4s ease forwards; opacity:0; }
      `}</style>
      <div style={{ background: "rgba(4,9,15,0.96)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(245,197,24,0.1)", padding: "12px 24px", position: "sticky" as const, top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1100, margin: "0 auto", gap: 12, flexWrap: "wrap" as const }}>
          <button onClick={() => setView("home")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" as const }}>
            <p style={{ margin: 0, color: "#f5c518", fontWeight: "bold", fontSize: 19, fontFamily: serif }}>BSC Marketplace</p>
            <p style={{ margin: 0, color: "#4a5568", fontSize: 9, letterSpacing: "0.18em", fontFamily: sans }}>BAHAMIAN SEAFOOD CONNECTION</p>
          </button>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const }}>
            <MarketPill />
            {cartCount > 0 && (
              <button onClick={() => setView("cart")} className="bsc-gold" style={{ padding: "9px 16px", borderRadius: 10, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 13, fontFamily: sans }}>
                Cart {cartCount} · {market === "bahamas" ? "$" + cartSubtotal.toFixed(2) : "Quote"}
              </button>
            )}
            <button onClick={() => router.push("/login")} style={{ padding: "9px 18px", borderRadius: 10, backgroundColor: "transparent", color: "#f5c518", border: "1px solid rgba(245,197,24,0.4)", cursor: "pointer", fontSize: 13, fontFamily: sans }}>
              Sign In
            </button>
            <button onClick={() => router.push("/login")} className="bsc-gold" style={{ ...primaryBtn, padding: "9px 18px", fontSize: 13 }}>
              Create Account
            </button>
          </div>
        </div>
      </div>
    </>
  );

  // ── Floating cart ────────────────────────────────────────────
  const CartFloat = () => cartCount > 0 ? (
    <div style={{ position: "fixed", bottom: 84, left: 0, right: 0, padding: "0 20px", zIndex: 40 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <button onClick={() => setView("cart")} className="bsc-gold" style={{ width: "100%", padding: "15px", borderRadius: 12, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", fontSize: 15, cursor: "pointer", boxShadow: "0 8px 40px rgba(245,197,24,0.35)", fontFamily: sans }}>
          View Cart · {cartCount} item{cartCount !== 1 ? "s" : ""} · {market === "bahamas" ? "$" + cartSubtotal.toFixed(2) : "Quote pending"}
        </button>
      </div>
    </div>
  ) : null;

  // ── Price display ────────────────────────────────────────────
  function priceDisplay(product: Product): string {
    if (market === "us") return "Quote";
    const markup = orderType === "wholesale" ? BS_WHOLESALE_MARKUP : BS_RETAIL_MARKUP;
    return "$" + (product.price * markup).toFixed(2);
  }

  // ── Product card ─────────────────────────────────────────────
  const ProductCard = ({ product }: { product: Product }) => {
    const inCart = cart.find(c => c.product.id === product.id);
    const isLow  = product.stock > 0 && product.stock <= 5;
    return (
      <div className="bsc-card" style={{ backgroundColor: "#0a1520", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column" as const }}>
        <div style={{ position: "relative", height: 170, overflow: "hidden", flexShrink: 0 }}>
          <img src={product.image} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 50%, rgba(4,9,15,0.7))" }} />
          {isLow && (
            <div style={{ position: "absolute", top: 10, left: 10, backgroundColor: "#f87171", borderRadius: 20, padding: "3px 10px" }}>
              <p style={{ margin: 0, color: "#fff", fontSize: 9, fontWeight: "bold", fontFamily: sans }}>LOW STOCK</p>
            </div>
          )}
          <div style={{ position: "absolute", top: 10, right: 10, backgroundColor: "rgba(4,9,15,0.85)", borderRadius: 20, padding: "4px 10px", backdropFilter: "blur(8px)" }}>
            <p style={{ margin: 0, color: market === "us" ? "#60a5fa" : "#f5c518", fontWeight: "bold", fontSize: 13, fontFamily: sans }}>{priceDisplay(product)}</p>
          </div>
        </div>
        <div style={{ padding: "14px 14px 16px", flex: 1, display: "flex", flexDirection: "column" as const, justifyContent: "space-between" }}>
          <p style={{ margin: "0 0 4px", fontWeight: "bold", fontSize: 14, lineHeight: 1.3, fontFamily: serif, color: "#f0e8d0" }}>{product.name}</p>
          {market === "us" && (
            <p style={{ margin: "0 0 10px", color: "#60a5fa", fontSize: 11, fontFamily: sans }}>U.S. pricing — no Bahamas duty</p>
          )}
          {orderType === "wholesale" && market === "bahamas" && (
            <p style={{ margin: "0 0 10px", color: "#a78bfa", fontSize: 11, fontFamily: sans }}>Wholesale rate applied</p>
          )}
          {inCart ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => adjustQty(product.id, -1)} style={{ flex: 1, padding: "8px", borderRadius: 8, backgroundColor: "#1e3a5f", color: "#fff", border: "none", cursor: "pointer", fontSize: 18, fontWeight: "bold" }}>−</button>
              <span style={{ fontWeight: "bold", fontSize: 15, minWidth: 24, textAlign: "center" as const, fontFamily: sans }}>{inCart.qty}</span>
              <button onClick={() => adjustQty(product.id, 1)} style={{ flex: 1, padding: "8px", borderRadius: 8, backgroundColor: "#f5c518", color: "#000", border: "none", cursor: "pointer", fontSize: 18, fontWeight: "bold" }}>+</button>
            </div>
          ) : (
            <button onClick={() => addToCart(product)} style={{ width: "100%", padding: "10px", borderRadius: 8, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 13, fontFamily: sans }}>Add to Cart</button>
          )}
        </div>
      </div>
    );
  };

  // ── Market context banner ────────────────────────────────────
  const ContextBanner = () => (
    <div style={{ backgroundColor: market === "us" ? "rgba(96,165,250,0.06)" : "rgba(245,197,24,0.05)", borderBottom: "1px solid " + (market === "us" ? "rgba(96,165,250,0.15)" : "rgba(245,197,24,0.1)"), padding: "10px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const }}>
        <span style={{ fontSize: 18 }}>{market === "bahamas" ? "🇧🇸" : "🇺🇸"}</span>
        {market === "bahamas" ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
            <span style={{ color: "#f5c518", fontSize: 12, fontFamily: sans, fontWeight: "600" }}>Bahamas Market</span>
            <span style={{ color: "#4a5568", fontSize: 12, fontFamily: sans }}>·</span>
            <button
              onClick={() => setOrderType("retail")}
              style={{ padding: "4px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11, fontWeight: "bold", fontFamily: sans, backgroundColor: orderType === "retail" ? "#f5c518" : "rgba(255,255,255,0.06)", color: orderType === "retail" ? "#000" : "#6b7280" }}
            >
              Retail
            </button>
            <button
              onClick={() => setOrderType("wholesale")}
              style={{ padding: "4px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11, fontWeight: "bold", fontFamily: sans, backgroundColor: orderType === "wholesale" ? "#a78bfa" : "rgba(255,255,255,0.06)", color: orderType === "wholesale" ? "#000" : "#6b7280" }}
            >
              Wholesale / Bulk
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" as const }}>
            <span style={{ color: "#60a5fa", fontSize: 12, fontFamily: sans, fontWeight: "600" }}>U.S. Domestic Market</span>
            <span style={{ color: "#4a5568", fontSize: 11, fontFamily: sans }}>No Bahamas duty · State tax included in quote · Shipping calculated after order review</span>
          </div>
        )}
        <button onClick={() => setShowMarketModal(true)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#4a5568", fontSize: 11, cursor: "pointer", fontFamily: sans }}>Change →</button>
      </div>
    </div>
  );

  // ── HOME ────────────────────────────────────────────────────
  if (view === "home") return (
    <div style={pg}>
      <MarketModal />
      <Header />
      <ContextBanner />

      {/* Hero */}
      <div style={{ position: "relative", minHeight: 500, display: "flex", alignItems: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <img src="https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=1400&q=85" alt="Fresh seafood" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.3)" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(4,9,15,0.92) 0%, rgba(4,9,15,0.4) 60%, rgba(4,9,15,0.75) 100%)" }} />
        </div>
        <div style={{ position: "relative", zIndex: 10, maxWidth: 1100, margin: "0 auto", padding: "72px 24px" }}>
          <p className="fu1" style={{ margin: "0 0 12px", color: "#f5c518", fontSize: 11, letterSpacing: "0.35em", fontFamily: sans, fontWeight: "600" }}>
            {market === "bahamas" ? "NASSAU · BAHAMAS · EST. 2024" : "U.S. DOMESTIC MARKET · BAHAMAS ORIGIN"}
          </p>
          <h1 className="fu2" style={{ margin: "0 0 14px", fontFamily: serif, fontSize: "clamp(2rem,5vw,3.6rem)", fontWeight: 900, lineHeight: 1.1, color: "#fff", letterSpacing: "-0.02em" }}>
            {market === "bahamas" ? <>The Bahamas&apos;<br /><span style={{ color: "#f5c518" }}>Freshest Marketplace</span></> : <>Premium Bahamian<br /><span style={{ color: "#60a5fa" }}>Seafood to the U.S.</span></>}
          </h1>
          <p className="fu2" style={{ margin: "0 0 8px", color: "rgba(255,255,255,0.72)", fontSize: 16, fontFamily: sans }}>
            {market === "bahamas" ? "Seafood. Meats. Essentials. Delivered across the Bahamas." : "Direct from Bahamian waters — no duty, domestic pricing, U.S. shipping."}
          </p>
          <p className="fu2" style={{ margin: "0 0 32px", color: "rgba(255,255,255,0.35)", fontSize: 13, fontFamily: sans }}>
            {market === "bahamas" ? "Nassau · Grand Bahama · All Family Islands via mailboat" : "Pricing includes state tax + processing · Shipping calculated after order review"}
          </p>
          <div className="fu3" style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
            <button onClick={() => { setActiveCategory("all"); setView("shop"); }} className="bsc-gold" style={{ ...primaryBtn, fontSize: 15, padding: "14px 34px" }}>Shop Now</button>
            <button onClick={() => router.push("/login")} style={{ ...outlineBtn, fontSize: 15, padding: "14px 34px" }}>Create Account</button>
            <button onClick={() => setShowMarketModal(true)} style={{ padding: "14px 20px", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)", color: "#aaa", border: "1px solid rgba(255,255,255,0.1)", fontSize: 13, cursor: "pointer", fontFamily: sans }}>
              {market === "bahamas" ? "🇧🇸 Bahamas" : "🇺🇸 U.S. Market"} ▼
            </button>
          </div>
        </div>
      </div>

      {/* Trust bar */}
      <div style={{ backgroundColor: "#070d18", borderTop: "1px solid rgba(245,197,24,0.08)", borderBottom: "1px solid rgba(245,197,24,0.08)", padding: "16px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {(market === "bahamas" ? [
            { label: "Secure Payments",        desc: "Safe & encrypted"          },
            { label: "Fresh & Frozen Quality", desc: "Cold chain guaranteed"      },
            { label: "Nassau & Islands",       desc: "All Bahamas delivery"       },
            { label: "WhatsApp Support",       desc: "+1 (242) 361-3474"         },
          ] : [
            { label: "No Bahamas Duty",        desc: "U.S. domestic pricing"      },
            { label: "U.S. Domestic Pricing",  desc: "Supplier cost + fees + margin" },
            { label: "U.S. Carrier Shipping",  desc: "Calculated after review"    },
            { label: "WhatsApp Support",       desc: "+1 (242) 361-3474"         },
          ]).map(t => (
            <div key={t.label} style={{ textAlign: "center" as const }}>
              <p style={{ margin: "0 0 2px", color: market === "us" ? "#60a5fa" : "#f5c518", fontWeight: "600", fontSize: 10, letterSpacing: "0.12em", fontFamily: sans }}>{t.label.toUpperCase()}</p>
              <p style={{ margin: 0, color: "#4a5568", fontSize: 11, fontFamily: sans }}>{t.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px 0" }}>

        {/* Service tiles */}
        <p style={{ margin: "0 0 6px", color: "#f5c518", fontSize: 10, letterSpacing: "0.3em", fontFamily: sans, fontWeight: "600" }}>OUR SERVICES</p>
        <h2 style={{ margin: "0 0 28px", fontFamily: serif, fontSize: "clamp(1.4rem,3vw,2rem)", color: "#fff", fontWeight: 700 }}>Everything You Need, All In One Place</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, marginBottom: 48 }}>
          {[
            { title: "Shop Seafood",           desc: "Fresh catch — grouper, snapper, conch, lobster",                   accent: "#4ade80", bg: "linear-gradient(135deg,#001a0a,#002a10)", border: "rgba(74,222,128,0.18)",  action: () => { setActiveCategory("seafood"); setView("shop"); } },
            { title: "Pay Utility Bills",      desc: "BEC, Water, Cable, Aliv, BTC, Flow",                               accent: "#60a5fa", bg: "linear-gradient(135deg,#001020,#001830)", border: "rgba(96,165,250,0.18)",  action: () => router.push("/utilities") },
            { title: "Vehicles & Auto Parts",  desc: "Cars, trucks, boats and genuine parts",                             accent: "#a78bfa", bg: "linear-gradient(135deg,#0a0020,#100030)", border: "rgba(167,139,250,0.18)", action: () => router.push("/vehicles") },
            { title: "Family Island Delivery", desc: "Mailboat shipping — Andros, Exuma, Abaco and more",                 accent: "#f5c518", bg: "linear-gradient(135deg,#1a1000,#2a1800)", border: "rgba(245,197,24,0.18)",  action: () => { setActiveCategory("all"); setView("shop"); } },
          ].map(svc => (
            <div key={svc.title} className="bsc-card" onClick={svc.action} style={{ background: svc.bg, border: "1px solid " + svc.border, borderRadius: 16, padding: "22px 18px", cursor: "pointer" }}>
              <p style={{ margin: "0 0 6px", color: svc.accent, fontWeight: "700", fontSize: 14, fontFamily: serif }}>{svc.title}</p>
              <p style={{ margin: "0 0 14px", color: "#6b7280", fontSize: 12, lineHeight: 1.55, fontFamily: sans }}>{svc.desc}</p>
              <p style={{ margin: 0, color: svc.accent, fontSize: 12, fontWeight: "600", fontFamily: sans }}>Explore →</p>
            </div>
          ))}
        </div>

        {/* US pricing info box */}
        {market === "us" && (
          <div style={{ backgroundColor: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 16, padding: "24px 28px", marginBottom: 40 }}>
            <p style={{ margin: "0 0 6px", color: "#60a5fa", fontSize: 11, letterSpacing: "0.2em", fontFamily: sans, fontWeight: "600" }}>U.S. CUSTOMER PRICING STRUCTURE</p>
            <h3 style={{ margin: "0 0 16px", fontFamily: serif, color: "#fff", fontSize: 18, fontWeight: 700 }}>How Your Price Is Calculated</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
              {[
                { item: "Supplier Cost",            note: "Base product cost from BSC suppliers"    },
                { item: "+ State Tax",              note: "Included in U.S. pricing structure"      },
                { item: "+ Processing Fees",        note: "Bank & payment processing fees"          },
                { item: "+ Operating Allocation",   note: "Business operating cost share"           },
                { item: "+ BSC Margin",             note: "BSC profit margin"                       },
                { item: "= Your U.S. Price",        note: "No Bahamas customs duty included"        },
              ].map(r => (
                <div key={r.item} style={{ backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px" }}>
                  <p style={{ margin: "0 0 3px", color: "#60a5fa", fontWeight: "600", fontSize: 12, fontFamily: sans }}>{r.item}</p>
                  <p style={{ margin: 0, color: "#4a5568", fontSize: 11, fontFamily: sans }}>{r.note}</p>
                </div>
              ))}
            </div>
            <p style={{ margin: "14px 0 0", color: "#4a5568", fontSize: 12, fontFamily: sans }}>
              U.S. pricing includes supplier cost, applicable state tax, bank/payment processing fees, business cost allocation, and BSC margin. Final quote confirmed after order review.
            </p>
          </div>
        )}

        {/* Wholesale info box for Bahamas */}
        {market === "bahamas" && orderType === "wholesale" && (
          <div style={{ backgroundColor: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 16, padding: "20px 24px", marginBottom: 32 }}>
            <p style={{ margin: "0 0 4px", color: "#a78bfa", fontSize: 11, letterSpacing: "0.2em", fontFamily: sans, fontWeight: "600" }}>WHOLESALE & BULK</p>
            <p style={{ margin: 0, color: "#aaa", fontSize: 13, fontFamily: sans }}>Bulk pricing applied. Minimum order quantities may apply for certain products. Sign in to access wholesale checkout and credit terms.</p>
          </div>
        )}

        {/* Featured products */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 22 }}>
            <div>
              <p style={{ margin: "0 0 4px", color: "#f5c518", fontSize: 10, letterSpacing: "0.3em", fontFamily: sans, fontWeight: "600" }}>TODAY&apos;S SELECTION</p>
              <h2 style={{ margin: 0, fontFamily: serif, fontSize: "clamp(1.3rem,2.5vw,1.8rem)", color: "#fff", fontWeight: 700 }}>Fresh Today</h2>
            </div>
            <button onClick={() => { setActiveCategory("all"); setView("shop"); }} style={{ background: "none", border: "none", color: "#f5c518", fontSize: 13, cursor: "pointer", fontFamily: sans, fontWeight: "600" }}>View All →</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 14 }}>
            {products.filter(p => p.stock > p.minStock).slice(0, 6).map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>

        {/* Category grid */}
        <div style={{ marginBottom: 48 }}>
          <p style={{ margin: "0 0 6px", color: "#f5c518", fontSize: 10, letterSpacing: "0.3em", fontFamily: sans, fontWeight: "600" }}>BROWSE</p>
          <h2 style={{ margin: "0 0 20px", fontFamily: serif, fontSize: "clamp(1.3rem,2.5vw,1.8rem)", color: "#fff", fontWeight: 700 }}>Shop by Category</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => { setActiveCategory(cat.id); setView("shop"); }} className="bsc-card"
                style={{ padding: "18px 10px", borderRadius: 14, backgroundColor: "#0a1520", border: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", textAlign: "center" as const }}>
                <p style={{ margin: 0, color: "#f0e8d0", fontSize: 13, fontWeight: "bold", fontFamily: serif }}>{cat.label}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Feature split */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 48 }}>
          <div className="bsc-card" onClick={() => { setActiveCategory("seafood"); setView("shop"); }} style={{ position: "relative", borderRadius: 18, overflow: "hidden", minHeight: 220, background: "linear-gradient(135deg,#001a0a,#002a10)", border: "1px solid rgba(74,222,128,0.12)", padding: "28px 24px", display: "flex", flexDirection: "column" as const, justifyContent: "flex-end", cursor: "pointer" }}>
            <div style={{ position: "absolute", top: 16, right: 16, fontSize: 60, opacity: 0.08 }}>🐟</div>
            <p style={{ margin: "0 0 4px", color: "#4ade80", fontSize: 10, letterSpacing: "0.2em", fontFamily: sans, fontWeight: "600" }}>FRESH DAILY</p>
            <h3 style={{ margin: "0 0 14px", color: "#fff", fontFamily: serif, fontSize: "clamp(1rem,2vw,1.3rem)", fontWeight: 700 }}>Premium Seafood<br />From Local Waters</h3>
            <span style={{ padding: "9px 18px", borderRadius: 8, backgroundColor: "#4ade80", color: "#000", fontWeight: "bold", fontSize: 12, alignSelf: "flex-start" as const, fontFamily: sans }}>Shop Seafood</span>
          </div>
          <div className="bsc-card" onClick={() => { setActiveCategory("meat"); setView("shop"); }} style={{ position: "relative", borderRadius: 18, overflow: "hidden", minHeight: 220, background: "linear-gradient(135deg,#1a0e00,#2a1800)", border: "1px solid rgba(245,197,24,0.12)", padding: "28px 24px", display: "flex", flexDirection: "column" as const, justifyContent: "flex-end", cursor: "pointer" }}>
            <div style={{ position: "absolute", top: 16, right: 16, fontSize: 60, opacity: 0.08 }}>🥩</div>
            <p style={{ margin: "0 0 4px", color: "#f5c518", fontSize: 10, letterSpacing: "0.2em", fontFamily: sans, fontWeight: "600" }}>CUT FRESH</p>
            <h3 style={{ margin: "0 0 14px", color: "#fff", fontFamily: serif, fontSize: "clamp(1rem,2vw,1.3rem)", fontWeight: 700 }}>Premium Meats<br />& Poultry</h3>
            <span style={{ padding: "9px 18px", borderRadius: 8, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", fontSize: 12, alignSelf: "flex-start" as const, fontFamily: sans }}>Shop Meats</span>
          </div>
        </div>

        {/* CTA */}
        <div style={{ background: "linear-gradient(135deg,#1a1200,#2a1e00)", borderRadius: 20, border: "1px solid rgba(245,197,24,0.2)", padding: "36px 28px", textAlign: "center" as const, marginBottom: 36 }}>
          <h2 style={{ margin: "0 0 8px", fontFamily: serif, fontSize: "clamp(1.3rem,3vw,1.9rem)", color: "#fff", fontWeight: 900 }}>Ready to Order?</h2>
          <p style={{ margin: "0 0 24px", color: "#6b7280", fontSize: 13, fontFamily: sans }}>
            {market === "us"
              ? "Create a free account to submit your U.S. order and receive your custom quote."
              : "Create a free account to checkout, track orders, and access exclusive deals."}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" as const }}>
            <button onClick={() => router.push("/login")} className="bsc-gold" style={{ ...primaryBtn, fontSize: 15, padding: "14px 36px" }}>Create Free Account</button>
            <button onClick={() => { setActiveCategory("all"); setView("shop"); }} style={{ ...outlineBtn, fontSize: 15, padding: "14px 36px" }}>Browse Products</button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 24, textAlign: "center" as const }}>
          <p style={{ margin: "0 0 4px", color: "#f5c518", fontFamily: serif, fontSize: 15, fontWeight: 700 }}>BSC Marketplace</p>
          <p style={{ margin: "0 0 6px", color: "#4a5568", fontSize: 12, fontFamily: sans }}>Firetrial Road, Nassau, Bahamas · +1 (242) 361-3474</p>
          <p style={{ margin: 0, color: "#1e3a5f", fontSize: 11, fontFamily: sans }}>© 2025 BSC Marketplace · Owned by Dedrick Tamico Storr Snr & Family</p>
        </div>
      </div>
      <CartFloat />
    </div>
  );

  // ── SHOP ────────────────────────────────────────────────────
  if (view === "shop") return (
    <div style={pg}>
      <MarketModal />
      <Header />
      <ContextBanner />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 18, alignItems: "center", flexWrap: "wrap" as const }}>
          <input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, flex: 1, minWidth: 200, marginBottom: 0 }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                style={{ padding: "9px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: "bold", whiteSpace: "nowrap" as const, backgroundColor: activeCategory === cat.id ? "#f5c518" : "#0a1520", color: activeCategory === cat.id ? "#000" : "#6b7280", fontFamily: sans }}>
                {cat.label}
              </button>
            ))}
          </div>
        </div>
        {market === "us" && (
          <div style={{ backgroundColor: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 12, padding: "12px 16px", marginBottom: 18 }}>
            <p style={{ margin: 0, color: "#60a5fa", fontSize: 12, fontFamily: sans }}>
              🇺🇸 U.S. pricing shown as <strong>Quote</strong> — exact price confirmed after order review. No Bahamas duty applied.
            </p>
          </div>
        )}
        {allProducts.length === 0 ? (
          <div style={{ textAlign: "center" as const, padding: "56px 0" }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>🔍</p>
            <p style={{ color: "#4a5568", fontFamily: sans }}>No products found</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 14 }}>
            {allProducts.map(product => <ProductCard key={product.id} product={product as Product} />)}
          </div>
        )}
      </div>
      <CartFloat />
    </div>
  );

  // ── CART ────────────────────────────────────────────────────
  if (view === "cart") return (
    <div style={pg}>
      <MarketModal />
      <Header />
      <ContextBanner />
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 24px" }}>
        <h2 style={{ margin: "0 0 20px", fontFamily: serif, fontSize: 22, color: "#f5c518", fontWeight: 700 }}>Your Cart</h2>

        {cart.length === 0 ? (
          <div style={{ textAlign: "center" as const, padding: "48px 0" }}>
            <p style={{ fontSize: 48, marginBottom: 14 }}>🛒</p>
            <p style={{ color: "#4a5568", marginBottom: 20, fontFamily: sans }}>Your cart is empty</p>
            <button onClick={() => setView("shop")} style={{ ...primaryBtn, fontFamily: sans }}>Start Shopping</button>
          </div>
        ) : (
          <>
            {cart.map(c => (
              <div key={c.product.id} style={{ backgroundColor: "#0a1520", borderRadius: 14, padding: "14px 16px", marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 14, alignItems: "center" }}>
                <img src={c.product.image} alt={c.product.name} style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: "0 0 4px", fontWeight: "bold", fontSize: 14, fontFamily: serif, color: "#f0e8d0" }}>{c.product.name}</p>
                  <p style={{ margin: "0 0 10px", color: market === "us" ? "#60a5fa" : "#f5c518", fontSize: 13, fontFamily: sans }}>
                    {market === "us" ? "U.S. quote pending" : "$" + (c.product.price * (orderType === "wholesale" ? BS_WHOLESALE_MARKUP : BS_RETAIL_MARKUP)).toFixed(2) + " each"}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => adjustQty(c.product.id, -1)} style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#1e3a5f", color: "#fff", border: "none", cursor: "pointer", fontSize: 18, fontWeight: "bold" }}>−</button>
                    <span style={{ fontWeight: "bold", fontSize: 15, fontFamily: sans }}>{c.qty}</span>
                    <button onClick={() => adjustQty(c.product.id, 1)} style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#f5c518", color: "#000", border: "none", cursor: "pointer", fontSize: 18, fontWeight: "bold" }}>+</button>
                  </div>
                </div>
                {market === "bahamas" && (
                  <p style={{ margin: 0, color: "#4ade80", fontWeight: "bold", fontSize: 16, fontFamily: sans }}>${(c.product.price * (orderType === "wholesale" ? BS_WHOLESALE_MARKUP : BS_RETAIL_MARKUP) * c.qty).toFixed(2)}</p>
                )}
              </div>
            ))}

            <div style={{ backgroundColor: "#0a1520", borderRadius: 14, padding: "18px 20px", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 14 }}>
              {market === "bahamas" ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <p style={{ margin: 0, color: "#6b7280", fontSize: 14, fontFamily: sans }}>{orderType === "wholesale" ? "Wholesale Subtotal" : "Subtotal"}</p>
                    <p style={{ margin: 0, fontSize: 14, fontFamily: sans }}>${cartSubtotal.toFixed(2)}</p>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                    <p style={{ margin: 0, color: "#6b7280", fontSize: 14, fontFamily: sans }}>Estimated Delivery</p>
                    <p style={{ margin: 0, color: "#f5c518", fontSize: 14, fontFamily: sans }}>+${deliveryFee}.00</p>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <p style={{ margin: 0, fontWeight: "bold", fontSize: 17, fontFamily: serif }}>Estimated Total</p>
                    <p style={{ margin: 0, color: "#4ade80", fontWeight: "bold", fontSize: 20, fontFamily: sans }}>${(cartSubtotal + deliveryFee).toFixed(2)}</p>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ margin: "0 0 8px", color: "#60a5fa", fontWeight: "bold", fontSize: 14, fontFamily: sans }}>U.S. Order Summary</p>
                  <p style={{ margin: "0 0 12px", color: "#6b7280", fontSize: 12, fontFamily: sans, lineHeight: 1.6 }}>
                    U.S. pricing includes supplier cost, applicable state tax, bank/payment processing fees, business cost allocation, and BSC margin. Final quote confirmed after order review.
                  </p>

                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <p style={{ margin: 0, color: "#6b7280", fontSize: 13, fontFamily: sans }}>Bahamas duty</p>
                    <p style={{ margin: 0, color: "#4ade80", fontSize: 13, fontFamily: sans }}>Not applicable</p>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <p style={{ margin: 0, color: "#6b7280", fontSize: 13, fontFamily: sans }}>Shipping</p>
                    <p style={{ margin: 0, color: "#60a5fa", fontSize: 13, fontFamily: sans }}>{US_SHIPPING_MESSAGE}</p>
                  </div>
                </>
              )}
            </div>

            <div style={{ backgroundColor: "#1a1400", border: "1px solid rgba(245,197,24,0.25)", borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
              <p style={{ margin: "0 0 4px", color: "#f5c518", fontWeight: "bold", fontSize: 13, fontFamily: sans }}>Sign in to complete your order</p>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 12, fontFamily: sans }}>
                {market === "us"
                  ? "Create an account to submit your U.S. order and receive your custom pricing quote."
                  : "Your cart is saved. Create a free account to checkout and track your delivery."}
              </p>
            </div>

            <button onClick={() => router.push("/login")} className="bsc-gold" style={{ width: "100%", padding: "15px", borderRadius: 12, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", fontSize: 16, cursor: "pointer", marginBottom: 10, fontFamily: sans }}>
              {market === "us" ? "Sign In to Submit U.S. Order →" : "Sign In to Checkout →"}
            </button>
            <button onClick={() => setView("shop")} style={{ ...ghostBtn }}>← Continue Shopping</button>
          </>
        )}
      </div>
    </div>
  );

  return null;
}