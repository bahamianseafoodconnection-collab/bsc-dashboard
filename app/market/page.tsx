"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { products, type Product } from "../../lib/store";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RETAIL_MARKUP = 1.25;
const DELIVERY_FEE  = 15;

const CATEGORIES = [
  { id: "all",     label: "All"     },
  { id: "seafood", label: "Seafood" },
  { id: "poultry", label: "Poultry" },
  { id: "meat",    label: "Meats"   },
];

type CartItem = { product: Product; qty: number };
type View     = "home" | "shop" | "cart";

export default function MarketPage() {
  const router = useRouter();

  const [view, setView]                   = useState<View>("home");
  const [cart, setCart]                   = useState<CartItem[]>([]);
  const [search, setSearch]               = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [supplierProducts, setSupplierProducts] = useState<any[]>([]);

  const cartCount    = cart.reduce((s, c) => s + c.qty, 0);
  const cartSubtotal = cart.reduce((s, c) => s + c.product.price * RETAIL_MARKUP * c.qty, 0);

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
      price:    sp.retail_price / RETAIL_MARKUP,
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
    backgroundColor: "#060d1f", minHeight: "100vh", color: "#fff",
    fontFamily: "'Inter', sans-serif", paddingBottom: 100,
  };
  const inp: React.CSSProperties = {
    display: "block", width: "100%", padding: "13px 14px", borderRadius: 12,
    backgroundColor: "#0d1f3c", color: "#fff", border: "1px solid #1e3a5f",
    fontSize: 15, marginBottom: 12, boxSizing: "border-box" as const, outline: "none",
  };
  const primaryBtn: React.CSSProperties = {
    width: "100%", padding: "14px", borderRadius: 12, backgroundColor: "#f5c518",
    color: "#000", fontWeight: "bold", border: "none", fontSize: 15,
    cursor: "pointer", marginBottom: 10,
  };
  const ghostBtn: React.CSSProperties = {
    width: "100%", padding: "12px", borderRadius: 12, backgroundColor: "transparent",
    color: "#6b7280", border: "1px solid #1e3a5f", fontSize: 14,
    cursor: "pointer", marginBottom: 10,
  };

  // ── Header ──────────────────────────────────────────────────
  const Header = () => (
    <div style={{ background: "linear-gradient(135deg, #060d1f, #0d1f3c)", borderBottom: "1px solid #1e3a5f", padding: "14px 18px", position: "sticky" as const, top: 0, zIndex: 50 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 640, margin: "0 auto" }}>
        <button onClick={() => setView("home")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <p style={{ margin: 0, color: "#f5c518", fontWeight: "bold", fontSize: 18 }}>🐟 BSC Market</p>
          <p style={{ margin: 0, color: "#4a5568", fontSize: 10 }}>Fresh · Local · Bahamian</p>
        </button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {cartCount > 0 && (
            <button onClick={() => setView("cart")} style={{ padding: "8px 14px", borderRadius: 20, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 13 }}>
              🛒 {cartCount}
            </button>
          )}
          <button onClick={() => router.push("/login")} style={{ padding: "8px 14px", borderRadius: 20, backgroundColor: "#f5c518", color: "#000", border: "none", cursor: "pointer", fontSize: 13, fontWeight: "bold" }}>
            Sign In
          </button>
        </div>
      </div>
    </div>
  );

  // ── Floating cart ────────────────────────────────────────────
  const CartFloat = () => cartCount > 0 ? (
    <div style={{ position: "fixed", bottom: 80, left: 0, right: 0, padding: "0 18px", zIndex: 40 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <button onClick={() => setView("cart")} style={{ ...primaryBtn, marginBottom: 0, boxShadow: "0 8px 32px rgba(245,197,24,0.3)" }}>
          🛒 View Cart · {cartCount} items · ${cartSubtotal.toFixed(2)}
        </button>
      </div>
    </div>
  ) : null;

  // ── Product card ─────────────────────────────────────────────
  const ProductCard = ({ product }: { product: Product }) => {
    const displayPrice = product.price * RETAIL_MARKUP;
    const inCart = cart.find(c => c.product.id === product.id);
    return (
      <div style={{ backgroundColor: "#0d1f3c", borderRadius: 16, overflow: "hidden", border: "1px solid #1e3a5f" }}>
        <div style={{ position: "relative", height: 140 }}>
          <img src={product.image} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", top: 8, right: 8, backgroundColor: "rgba(6,13,31,0.85)", borderRadius: 20, padding: "3px 8px" }}>
            <p style={{ margin: 0, color: "#f5c518", fontWeight: "bold", fontSize: 12 }}>${displayPrice.toFixed(2)}</p>
          </div>
        </div>
        <div style={{ padding: "10px 12px" }}>
          <p style={{ margin: "0 0 8px", fontWeight: "bold", fontSize: 13 }}>{product.name}</p>
          {inCart ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => adjustQty(product.id, -1)} style={{ flex: 1, padding: "7px", borderRadius: 8, backgroundColor: "#1e3a5f", color: "#fff", border: "none", cursor: "pointer", fontSize: 16, fontWeight: "bold" }}>-</button>
              <span style={{ fontWeight: "bold", fontSize: 14, minWidth: 20, textAlign: "center" as const }}>{inCart.qty}</span>
              <button onClick={() => adjustQty(product.id, 1)} style={{ flex: 1, padding: "7px", borderRadius: 8, backgroundColor: "#f5c518", color: "#000", border: "none", cursor: "pointer", fontSize: 16, fontWeight: "bold" }}>+</button>
            </div>
          ) : (
            <button onClick={() => addToCart(product)} style={{ width: "100%", padding: "8px", borderRadius: 8, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 13 }}>Add to Cart</button>
          )}
        </div>
      </div>
    );
  };

  // ── HOME ────────────────────────────────────────────────────
  if (view === "home") return (
    <div style={pg}>
      <Header />
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ position: "relative", overflow: "hidden", height: 220 }}>
          <img src="https://images.unsplash.com/photo-1534482421-64566f976cfa?w=800&q=80" alt="Fresh Seafood" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(6,13,31,0.3), rgba(6,13,31,0.85))" }} />
          <div style={{ position: "absolute", bottom: 24, left: 20, right: 20 }}>
            <p style={{ margin: 0, color: "#f5c518", fontSize: 11, letterSpacing: 2, fontWeight: "bold" }}>BAHAMIAN SEAFOOD CONNECTION</p>
            <p style={{ margin: "6px 0 4px", color: "#fff", fontWeight: "bold", fontSize: 22, lineHeight: 1.2 }}>Fresh From Our Waters<br />To Your Table</p>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.7)", fontSize: 13 }}>Firetrial Road, Nassau · Delivery across the Bahamas</p>
          </div>
        </div>
        <div style={{ padding: "20px 18px 0" }}>
          <p style={{ margin: "0 0 12px", color: "#f5c518", fontWeight: "bold", fontSize: 15 }}>Shop by Category</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => { setActiveCategory(cat.id); setView("shop"); }}
                style={{ padding: "14px 8px", borderRadius: 14, backgroundColor: "#0d1f3c", border: "1px solid #1e3a5f", cursor: "pointer", textAlign: "center" as const }}>
                <p style={{ margin: 0, color: "#fff", fontSize: 11, fontWeight: "bold" }}>{cat.label}</p>
              </button>
            ))}
          </div>
          <p style={{ margin: "0 0 12px", color: "#f5c518", fontWeight: "bold", fontSize: 15 }}>Fresh Today</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            {products.filter(p => p.stock > p.minStock).slice(0, 4).map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <button onClick={() => { setActiveCategory("all"); setView("shop"); }} style={primaryBtn}>View All Products →</button>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 8 }}>
            {[
              { title: "Island Delivery", desc: "All Bahamas islands" },
              { title: "Fresh & Frozen",  desc: "Cold chain guaranteed" },
              { title: "Local & Fresh",   desc: "Caught locally" },
            ].map(info => (
              <div key={info.title} style={{ backgroundColor: "#0d1f3c", borderRadius: 12, padding: "14px 10px", textAlign: "center" as const, border: "1px solid #1e3a5f" }}>
                <p style={{ margin: "0 0 2px", color: "#f5c518", fontWeight: "bold", fontSize: 11 }}>{info.title}</p>
                <p style={{ margin: 0, color: "#4a5568", fontSize: 10 }}>{info.desc}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24, backgroundColor: "#0a1220", border: "1px solid #1e3a5f", borderRadius: 14, padding: "18px 20px", textAlign: "center" as const }}>
            <p style={{ margin: "0 0 6px", color: "#f5c518", fontWeight: "bold", fontSize: 15 }}>Join BSC Market</p>
            <p style={{ margin: "0 0 14px", color: "#4a5568", fontSize: 13 }}>Create a free account to track orders and checkout faster</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => router.push("/login")} style={{ flex: 1, padding: "12px", borderRadius: 10, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 14 }}>Create Account</button>
              <button onClick={() => router.push("/login")} style={{ flex: 1, padding: "12px", borderRadius: 10, backgroundColor: "transparent", color: "#f5c518", border: "1px solid #f5c518", cursor: "pointer", fontSize: 14 }}>Sign In</button>
            </div>
          </div>
        </div>
      </div>
      <CartFloat />
    </div>
  );

  // ── SHOP ────────────────────────────────────────────────────
  if (view === "shop") return (
    <div style={pg}>
      <Header />
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 18px" }}>
        <input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, marginBottom: 12 }} />
        <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto" as const }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
              style={{ padding: "7px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: "bold", whiteSpace: "nowrap" as const, flexShrink: 0, backgroundColor: activeCategory === cat.id ? "#f5c518" : "#0d1f3c", color: activeCategory === cat.id ? "#000" : "#6b7280" }}>
              {cat.label}
            </button>
          ))}
        </div>
        {allProducts.length === 0 && (
          <div style={{ textAlign: "center" as const, padding: 40 }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>🔍</p>
            <p style={{ color: "#4a5568" }}>No products found</p>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {allProducts.map(product => (
            <ProductCard key={product.id} product={product as Product} />
          ))}
        </div>
      </div>
      <CartFloat />
    </div>
  );

  // ── CART ────────────────────────────────────────────────────
  if (view === "cart") return (
    <div style={pg}>
      <Header />
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 18px" }}>
        <h2 style={{ margin: "0 0 16px", color: "#f5c518", fontSize: 20 }}>🛒 Your Cart</h2>
        {cart.length === 0 ? (
          <div style={{ textAlign: "center" as const, padding: 40 }}>
            <p style={{ fontSize: 48, marginBottom: 12 }}>🛒</p>
            <p style={{ color: "#4a5568", marginBottom: 16 }}>Your cart is empty</p>
            <button onClick={() => setView("shop")} style={primaryBtn}>Start Shopping</button>
          </div>
        ) : (
          <>
            {cart.map(c => (
              <div key={c.product.id} style={{ backgroundColor: "#0d1f3c", borderRadius: 14, padding: "12px 14px", marginBottom: 10, border: "1px solid #1e3a5f", display: "flex", gap: 12, alignItems: "center" }}>
                <img src={c.product.image} alt={c.product.name} style={{ width: 60, height: 60, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: "0 0 2px", fontWeight: "bold", fontSize: 14 }}>{c.product.name}</p>
                  <p style={{ margin: "0 0 8px", color: "#f5c518", fontSize: 13 }}>${(c.product.price * RETAIL_MARKUP).toFixed(2)} each</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => adjustQty(c.product.id, -1)} style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "#1e3a5f", color: "#fff", border: "none", cursor: "pointer", fontSize: 16, fontWeight: "bold" }}>-</button>
                    <span style={{ fontWeight: "bold", fontSize: 15 }}>{c.qty}</span>
                    <button onClick={() => adjustQty(c.product.id, 1)} style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "#f5c518", color: "#000", border: "none", cursor: "pointer", fontSize: 16, fontWeight: "bold" }}>+</button>
                  </div>
                </div>
                <p style={{ margin: 0, color: "#4ade80", fontWeight: "bold", fontSize: 16 }}>${(c.product.price * RETAIL_MARKUP * c.qty).toFixed(2)}</p>
              </div>
            ))}
            <div style={{ backgroundColor: "#0d1f3c", borderRadius: 14, padding: "14px 16px", border: "1px solid #1e3a5f", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <p style={{ margin: 0, color: "#aaa", fontSize: 14 }}>Subtotal</p>
                <p style={{ margin: 0, fontSize: 14 }}>${cartSubtotal.toFixed(2)}</p>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <p style={{ margin: 0, color: "#aaa", fontSize: 14 }}>Delivery</p>
                <p style={{ margin: 0, color: "#f5c518", fontSize: 14 }}>+${DELIVERY_FEE}.00</p>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid #1e3a5f" }}>
                <p style={{ margin: 0, fontWeight: "bold", fontSize: 16 }}>Estimated Total</p>
                <p style={{ margin: 0, color: "#4ade80", fontWeight: "bold", fontSize: 18 }}>${(cartSubtotal + DELIVERY_FEE).toFixed(2)}</p>
              </div>
            </div>
            <div style={{ backgroundColor: "#1a1400", border: "1px solid #f5c518", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
              <p style={{ margin: "0 0 4px", color: "#f5c518", fontWeight: "bold", fontSize: 13 }}>Sign in to complete your order</p>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>Your cart is saved. Create a free account to checkout and track your order.</p>
            </div>
            <button onClick={() => router.push("/login")} style={primaryBtn}>Sign In to Checkout →</button>
            <button onClick={() => setView("shop")} style={ghostBtn}>← Continue Shopping</button>
          </>
        )}
      </div>
    </div>
  );

  return null;
}