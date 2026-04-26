// File: app/market/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  products,
  completeSale,
  saveCustomer,
  type Product,
} from "../../lib/store";
import { recordSaleFinancials } from "../../lib/finance";
import { createInvoice } from "../../lib/invoices";

const supabase = createClient(
  "https://auqjjrisivhfmpleusyt.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg"
);

const DELIVERY_FEE = 15;
const RETAIL_MARKUP = 1.25;
const WHOLESALE_MARKUP = 1.12;

const BAHAMAS_ISLANDS = [
  "New Providence (Nassau)",
  "Grand Bahama (Freeport)",
  "Abaco",
  "Eleuthera",
  "Exuma",
  "Andros",
  "Long Island",
  "Cat Island",
  "San Salvador",
  "Bimini",
  "Berry Islands",
  "Harbour Island",
  "Spanish Wells",
  "Acklins",
  "Crooked Island",
  "Mayaguana",
  "Inagua",
  "Ragged Island",
];

const MAILBOATS: Record<string, string[]> = {
  "Abaco": ["Marsh Harbour Express", "Legacy"],
  "Eleuthera": ["Current Pride", "Bahamas Daybreak III"],
  "Exuma": ["Grand Master", "Exuma Express"],
  "Andros": ["Lady Rosalind", "Lester Rolle"],
  "Long Island": ["Sherice M", "Long Island Express"],
  "Cat Island": ["Sea Hauler", "New Island Trader"],
  "San Salvador": ["Lady Frances"],
  "Bimini": ["Bimini Express"],
  "Berry Islands": ["Champion II"],
  "Harbour Island": ["Current Pride"],
  "Spanish Wells": ["Current Pride"],
  "Acklins": ["Lady Muriel"],
  "Crooked Island": ["Lady Muriel"],
  "Mayaguana": ["Lady Muriel"],
  "Inagua": ["Lady Mathew"],
  "Ragged Island": ["Lady Muriel"],
  "Grand Bahama (Freeport)": ["Grand Bahama IV"],
};

type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  supplierName: string;
  photo_url: string;
  isSupplierProduct: boolean;
};

type FormattedProduct = {
  id: string;
  name: string;
  displayPrice: number;
  stock: number;
  supplierName: string;
  photo_url: string;
  isSupplierProduct: boolean;
};

type SupplierProduct = {
  id: string;
  name: string;
  category: string;
  sku: string;
  retail_price: number;
  wholesale_price: number;
  unit_cost: number;
  supplier_id: string;
  supplier_name: string;
  supplier_whatsapp: string;
  photo_url: string;
  status: string;
};

type View =
  | "home"
  | "utility"
  | "retail"
  | "wholesale"
  | "usa"
  | "auto"
  | "cart"
  | "login"
  | "checkout";

const CATEGORIES = [
  { id: "utility", label: "Pay Utility Bill", icon: "⚡", color: "#60a5fa", desc: "BEC, Water & Sewage, Cable, Internet" },
  { id: "retail", label: "Shop Local Retail", icon: "🐟", color: "#4ade80", desc: "Fresh seafood, local products" },
  { id: "wholesale", label: "Wholesale & Bulk", icon: "📦", color: "#f5c518", desc: "Bulk orders for businesses" },
  { id: "usa", label: "USA Bulk Import", icon: "🇺🇸", color: "#f87171", desc: "Coming soon" },
  { id: "auto", label: "Auto & Car Parts", icon: "🚗", color: "#a78bfa", desc: "Coming soon" },
];

export default function MarketPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("home");
  const [cartType, setCartType] = useState<"retail" | "wholesale">("retail");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [supplierProductsLoading, setSupplierProductsLoading] = useState(false);

  const [user, setUser] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [address, setAddress] = useState("");
  const [island, setIsland] = useState("New Providence (Nassau)");
  const [mailboat, setMailboat] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    async function loadSupplierProducts() {
      setSupplierProductsLoading(true);
      try {
        const { data } = await supabase
          .from("supplier_products")
          .select("*")
          .eq("status", "approved")
          .order("created_at", { ascending: false });
        if (data) setSupplierProducts(data as SupplierProduct[]);
      } catch (e) {}
      setSupplierProductsLoading(false);
    }
    loadSupplierProducts();
  }, []);

  const markup = cartType === "retail" ? RETAIL_MARKUP : WHOLESALE_MARKUP;
  const cartCount = cart.reduce((sum, c) => sum + c.qty, 0);
  const cartSubtotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  const deliveryCharge = fulfillment === "delivery" ? DELIVERY_FEE : 0;
  const cartTotal = cartSubtotal + deliveryCharge;
  const isOutIsland = island !== "New Providence (Nassau)" && island !== "Grand Bahama (Freeport)";
  const availableMailboats = MAILBOATS[island] || [];

  const storeProductsFormatted: FormattedProduct[] = products
    .filter((p) => p.stock > p.minStock)
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .map((p) => ({
      id: p.id,
      name: p.name,
      displayPrice: cartType === "retail" ? p.price * RETAIL_MARKUP : p.price * WHOLESALE_MARKUP,
      stock: p.stock - p.minStock,
      supplierName: p.supplierName,
      photo_url: "",
      isSupplierProduct: false,
    }));

  const supplierProductsFormatted: FormattedProduct[] = supplierProducts
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .map((p) => ({
      id: p.id,
      name: p.name,
      displayPrice: cartType === "retail" ? p.retail_price : p.wholesale_price,
      stock: 999,
      supplierName: p.supplier_name,
      photo_url: p.photo_url,
      isSupplierProduct: true,
    }));

  function addToCart(product: FormattedProduct) {
    setCart((prev) => {
      const ex = prev.find((c) => c.id === product.id);
      return ex
        ? prev.map((c) => c.id === product.id ? { ...c, qty: c.qty + 1 } : c)
        : [...prev, {
            id: product.id,
            name: product.name,
            price: product.displayPrice,
            qty: 1,
            supplierName: product.supplierName,
            photo_url: product.photo_url,
            isSupplierProduct: product.isSupplierProduct,
          }];
    });
  }

  function adjustQty(id: string, delta: number) {
    setCart((prev) =>
      prev.map((c) => c.id === id ? { ...c, qty: c.qty + delta } : c).filter((c) => c.qty > 0)
    );
  }

  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleRegister() {
    setAuthError("");
    if (!authUsername || !authPhone || !authEmail || !authPassword) {
      setAuthError("All fields required");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
      options: { data: { name: authUsername, phone: authPhone } },
    });
    if (error) { setAuthError(error.message); setLoading(false); return; }
    setUser({ name: authUsername, phone: authPhone, email: authEmail });
    setLoading(false);
    setView("home");
  }

  async function handleLogin() {
    setAuthError("");
    if (!authEmail || !authPassword) { setAuthError("Email and password required"); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) { setAuthError(error.message); setLoading(false); return; }
    const meta = data.user?.user_metadata;
    setUser({ name: meta?.name || authEmail, phone: meta?.phone || "", email: authEmail });
    setLoading(false);
    setView("home");
  }

  async function handlePlaceOrder() {
    setCheckoutError("");
    if (fulfillment === "delivery" && !address.trim()) { setCheckoutError("Enter your delivery address"); return; }
    if (fulfillment === "delivery" && isOutIsland && !mailboat) { setCheckoutError("Select your mailboat"); return; }
    if (fulfillment === "pickup" && !pickupDate) { setCheckoutError("Select a pickup date"); return; }
    setLoading(true);

    const deliveryNote = fulfillment === "delivery"
      ? "DELIVERY — " + address + ", " + island + (mailboat ? " via " + mailboat : "")
      : "PICKUP — " + pickupDate;

    const saleItems = cart.map((c) => ({
      productId: c.id,
      productName: c.name,
      price: c.price,
      qty: c.qty,
      supplierName: c.supplierName,
    }));

    const storeItems = cart.filter((c) => !c.isSupplierProduct);
    if (storeItems.length > 0) {
      const storeItemsMapped = storeItems.map((c) => {
        const orig = products.find((p) => p.id === c.id);
        return {
          productId: c.id,
          productName: c.name,
          price: orig ? orig.price : c.price,
          qty: c.qty,
          supplierName: c.supplierName,
        };
      });
      const result = completeSale({
        customerName: user!.name,
        customerPhone: user!.phone,
        items: storeItemsMapped,
        total: storeItems.reduce((s, c) => s + c.price * c.qty, 0),
      });
      if (!result.success) {
        setCheckoutError(result.error ?? result.message ?? "Checkout failed. Please try again.");
        setLoading(false);
        return;
      }
    }

    saveCustomer({ name: user!.name, phone: user!.phone });
    await recordSaleFinancials(cartTotal);
    const invoice = await createInvoice({
      customerName: user!.name + " | " + deliveryNote,
      customerPhone: user!.phone,
      items: saleItems,
      total: cartTotal,
    });
    setCart([]);
    setLoading(false);
    router.push("/invoice?id=" + encodeURIComponent(invoice.id));
  }

  const pg: React.CSSProperties = { padding: 18, backgroundColor: "#0a0f1e", minHeight: "100vh", color: "#fff", fontFamily: "sans-serif", paddingBottom: 100 };
  const backBtn: React.CSSProperties = { background: "none", border: "none", color: "#f5c518", fontSize: 14, cursor: "pointer", marginBottom: 14, padding: 0 };
  const inp: React.CSSProperties = { display: "block", width: "100%", padding: "11px 13px", borderRadius: 10, backgroundColor: "#111c33", color: "#fff", border: "1px solid #1e2d4a", fontSize: 14, marginBottom: 12, boxSizing: "border-box" };
  const lbl: React.CSSProperties = { display: "block", color: "#6b7280", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 };
  const primaryBtn: React.CSSProperties = { width: "100%", padding: "13px", borderRadius: 10, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", fontSize: 15, cursor: "pointer", marginBottom: 10 };
  const secondaryBtn: React.CSSProperties = { width: "100%", padding: "11px", borderRadius: 10, backgroundColor: "transparent", color: "#6b7280", border: "1px solid #1e2d4a", fontSize: 14, cursor: "pointer" };
  const card: React.CSSProperties = { backgroundColor: "#111c33", borderRadius: 12, padding: "14px 16px", marginBottom: 12, border: "1px solid #1e2d4a" };

  function qtyBtn(bg: string, color = "#fff"): React.CSSProperties {
    return { width: 32, height: 32, borderRadius: 8, backgroundColor: bg, color, border: "none", fontSize: 18, cursor: "pointer", fontWeight: "bold" };
  }

  // ── HOME ──
  if (view === "home") {
    return (
      <div style={pg}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, color: "#f5c518", fontSize: 20 }}>BSC Market</h1>
            <p style={{ margin: "2px 0 0", color: "#4a5568", fontSize: 11 }}>Fresh · Direct · Bahamian</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {cartCount > 0 && (
              <button onClick={() => setView("cart")} style={{ padding: "8px 14px", borderRadius: 10, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 13 }}>
                Cart {cartCount}
              </button>
            )}
            {user ? (
              <button onClick={async () => { await supabase.auth.signOut(); setUser(null); }} style={{ padding: "8px 12px", borderRadius: 10, backgroundColor: "#111c33", color: "#aaa", border: "1px solid #1e2d4a", cursor: "pointer", fontSize: 12 }}>
                {user.name.split(" ")[0]}
              </button>
            ) : (
              <button onClick={() => setView("login")} style={{ padding: "8px 14px", borderRadius: 10, backgroundColor: "#111c33", color: "#f5c518", border: "1px solid #f5c518", cursor: "pointer", fontSize: 12, fontWeight: "bold" }}>
                Login
              </button>
            )}
          </div>
        </div>

        {user && (
          <div style={{ backgroundColor: "#0a1f0a", border: "1px solid #4ade80", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
            <p style={{ margin: 0, color: "#4ade80", fontSize: 13 }}>Welcome back, <b>{user.name}</b></p>
          </div>
        )}

        {supplierProducts.length > 0 && (
          <div style={{ backgroundColor: "#0a1220", border: "1px solid #60a5fa", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
            <p style={{ margin: 0, color: "#60a5fa", fontWeight: "bold", fontSize: 13 }}>
              🚢 {supplierProducts.length} Supplier Product{supplierProducts.length > 1 ? "s" : ""} Available
            </p>
            <p style={{ margin: "4px 0 0", color: "#4a5568", fontSize: 11 }}>Approved supplier products available in Retail & Wholesale</p>
          </div>
        )}

        {CATEGORIES.map((cat) => (
          <div
            key={cat.id}
            onClick={() => {
              if (cat.id === "retail") setCartType("retail");
              if (cat.id === "wholesale") setCartType("wholesale");
              setView(cat.id as View);
            }}
            style={{ backgroundColor: "#111c33", borderRadius: 12, padding: "16px 18px", marginBottom: 10, border: "1px solid #1e2d4a", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}
          >
            <span style={{ fontSize: 26 }}>{cat.icon}</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: "bold", fontSize: 15, color: cat.color }}>{cat.label}</p>
              <p style={{ margin: "2px 0 0", color: "#4a5568", fontSize: 11 }}>{cat.desc}</p>
            </div>
            <span style={{ color: "#2a3550", fontSize: 18 }}>›</span>
          </div>
        ))}
      </div>
    );
  }

  // ── LOGIN ──
  if (view === "login") {
    return (
      <div style={{ ...pg, maxWidth: 420, margin: "0 auto" }}>
        <button onClick={() => setView("home")} style={backBtn}>Back</button>
        <h2 style={{ color: "#f5c518", marginBottom: 4, marginTop: 0 }}>{authMode === "login" ? "Customer Login" : "Create Account"}</h2>
        <p style={{ color: "#4a5568", fontSize: 13, marginBottom: 18 }}>{authMode === "login" ? "Sign in to shop and track orders" : "Join BSC Marketplace"}</p>
        {authMode === "register" && (
          <>
            <label style={lbl}>Username</label>
            <input placeholder="Choose a username" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} style={inp} />
            <label style={lbl}>Phone / WhatsApp</label>
            <input placeholder="242-xxx-xxxx" value={authPhone} onChange={(e) => setAuthPhone(e.target.value)} style={inp} />
          </>
        )}
        <label style={lbl}>Email</label>
        <input type="email" placeholder="your@email.com" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} style={inp} />
        <label style={lbl}>Password</label>
        <input type="password" placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} style={inp} />
        {authError && (
          <p style={{ color: "#f87171", fontSize: 13, backgroundColor: "#2d0000", padding: "10px 12px", borderRadius: 8, marginBottom: 12 }}>{authError}</p>
        )}
        <button onClick={authMode === "login" ? handleLogin : handleRegister} disabled={loading} style={{ ...primaryBtn, backgroundColor: loading ? "#555" : "#f5c518", cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Please wait..." : authMode === "login" ? "Sign In" : "Create Account"}
        </button>
        <button onClick={() => setAuthMode(authMode === "login" ? "register" : "login")} style={secondaryBtn}>
          {authMode === "login" ? "New customer? Register here" : "Already have account? Login"}
        </button>
      </div>
    );
  }

  // ── UTILITY ──
  if (view === "utility") {
    return (
      <div style={pg}>
        <button onClick={() => setView("home")} style={backBtn}>Back</button>
        <h2 style={{ color: "#60a5fa", marginTop: 0, marginBottom: 4 }}>Pay Utility Bill</h2>
        <p style={{ color: "#4a5568", fontSize: 13, marginBottom: 18 }}>Select a provider</p>
        {[
          { name: "BEC — Bahamas Power & Light", icon: "💡" },
          { name: "Water & Sewage Corporation", icon: "💧" },
          { name: "Cable Bahamas", icon: "📺" },
          { name: "Flow Internet", icon: "🌐" },
          { name: "Aliv Mobile", icon: "📱" },
          { name: "BTC Phone & Internet", icon: "☎️" },
        ].map((u) => (
          <div key={u.name} style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>{u.icon}</span>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: "bold" }}>{u.name}</p>
              <p style={{ margin: 0, color: "#4a5568", fontSize: 11 }}>Coming Soon</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── USA / AUTO ──
  if (view === "usa" || view === "auto") {
    return (
      <div style={pg}>
        <button onClick={() => setView("home")} style={backBtn}>Back</button>
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <p style={{ fontSize: 48, margin: "0 0 12px" }}>{view === "usa" ? "🚢" : "🔧"}</p>
          <p style={{ margin: 0, fontWeight: "bold", fontSize: 16 }}>{view === "usa" ? "USA Bulk Import" : "Auto & Car Parts"}</p>
          <p style={{ margin: "8px 0 0", color: "#4a5568", fontSize: 13 }}>Coming soon — next phase</p>
        </div>
      </div>
    );
  }

  // ── SHOP RETAIL / WHOLESALE ──
  if (view === "retail" || view === "wholesale") {
    const isWholesale = view === "wholesale";
    const color = isWholesale ? "#f5c518" : "#4ade80";

    return (
      <div style={pg}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <button onClick={() => setView("home")} style={backBtn}>Back</button>
          <button onClick={() => setView("cart")} style={{ padding: "7px 14px", borderRadius: 10, backgroundColor: cartCount > 0 ? "#f5c518" : "#111c33", color: cartCount > 0 ? "#000" : "#aaa", border: "1px solid #1e2d4a", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>
            Cart {cartCount > 0 ? cartCount : ""}
          </button>
        </div>

        <h2 style={{ color, marginTop: 0, marginBottom: 2 }}>{isWholesale ? "Wholesale & Bulk" : "Local Retail"}</h2>
        <p style={{ color: "#4a5568", fontSize: 12, marginBottom: 14 }}>
          {isWholesale ? "12% BSC margin on bulk orders" : "25% BSC margin on retail"}
          {supplierProducts.length > 0 && <span style={{ color: "#60a5fa" }}> · {supplierProducts.length} supplier products</span>}
        </p>

        <input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inp, marginBottom: 14 }} />

        {supplierProductsLoading && (
          <p style={{ color: "#4a5568", fontSize: 12, textAlign: "center", marginBottom: 12 }}>Loading supplier products...</p>
        )}

        {storeProductsFormatted.length === 0 && supplierProductsFormatted.length === 0 && !supplierProductsLoading && (
          <p style={{ color: "#4a5568", textAlign: "center", marginTop: 40 }}>No products found</p>
        )}

        {storeProductsFormatted.length > 0 && (
          <>
            <p style={{ color: "#4a5568", fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>BSC MARKETPLACE</p>
            {storeProductsFormatted.map((product) => {
              const inCart = cart.find((c) => c.id === product.id);
              return (
                <div key={product.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{product.name}</p>
                      <p style={{ margin: "4px 0 2px", color: "#4ade80", fontSize: 18, fontWeight: "bold" }}>${product.displayPrice.toFixed(2)}</p>
                      <p style={{ margin: 0, color: "#4a5568", fontSize: 11 }}>{product.stock} available</p>
                    </div>
                    {inCart ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button onClick={() => adjustQty(product.id, -1)} style={qtyBtn("#1e2d4a")}>-</button>
                        <span style={{ fontWeight: "bold", fontSize: 16 }}>{inCart.qty}</span>
                        <button onClick={() => adjustQty(product.id, 1)} style={qtyBtn("#f5c518", "#000")}>+</button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(product)} style={{ padding: "9px 16px", borderRadius: 10, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 14 }}>
                        Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {supplierProductsFormatted.length > 0 && (
          <>
            <p style={{ color: "#60a5fa", fontSize: 10, letterSpacing: 2, marginTop: 8, marginBottom: 10 }}>SUPPLIER PRODUCTS</p>
            {supplierProductsFormatted.map((product) => {
              const inCart = cart.find((c) => c.id === product.id);
              return (
                <div key={product.id} style={{ ...card, borderColor: "#1e3a5f" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", gap: 10, flex: 1, alignItems: "center" }}>
                      {product.photo_url ? (
                        <img src={product.photo_url} alt={product.name} style={{ width: 50, height: 50, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                      ) : null}
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: "bold", fontSize: 14 }}>{product.name}</p>
                        <p style={{ margin: "4px 0 2px", color: "#60a5fa", fontSize: 17, fontWeight: "bold" }}>${product.displayPrice.toFixed(2)}</p>
                        <p style={{ margin: 0, color: "#4a5568", fontSize: 10 }}>By {product.supplierName}</p>
                      </div>
                    </div>
                    {inCart ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <button onClick={() => adjustQty(product.id, -1)} style={qtyBtn("#1e2d4a")}>-</button>
                        <span style={{ fontWeight: "bold", fontSize: 15 }}>{inCart.qty}</span>
                        <button onClick={() => adjustQty(product.id, 1)} style={qtyBtn("#60a5fa", "#000")}>+</button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(product)} style={{ padding: "9px 16px", borderRadius: 10, backgroundColor: "#60a5fa", color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>
                        Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

  // ── CART ──
  if (view === "cart") {
    return (
      <div style={pg}>
        <button onClick={() => setView("home")} style={backBtn}>Back</button>
        <h2 style={{ color: "#f5c518", marginTop: 0, marginBottom: 14 }}>Your Cart</h2>

        {!user && (
          <div style={{ backgroundColor: "#1a1400", border: "1px solid #f5c518", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
            <p style={{ margin: 0, color: "#f5c518", fontSize: 13 }}>
              Login required to place order.{" "}
              <span onClick={() => setView("login")} style={{ textDecoration: "underline", cursor: "pointer" }}>Login here</span>
            </p>
          </div>
        )}

        {cart.length === 0 && <p style={{ color: "#4a5568" }}>Your cart is empty</p>}

        {cart.map((c) => (
          <div key={c.id} style={card}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              {c.photo_url ? (
                <img src={c.photo_url} alt={c.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
              ) : null}
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 4px", fontWeight: "bold", fontSize: 14 }}>{c.name}</p>
                <p style={{ margin: "2px 0", color: "#aaa", fontSize: 13 }}>
                  {c.qty} x ${c.price.toFixed(2)} ={" "}
                  <span style={{ color: "#4ade80", fontWeight: "bold" }}>${(c.qty * c.price).toFixed(2)}</span>
                </p>
                <p style={{ margin: 0, color: "#4a5568", fontSize: 10 }}>By {c.supplierName}</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              <button onClick={() => adjustQty(c.id, -1)} style={qtyBtn("#1e2d4a")}>-</button>
              <span style={{ fontWeight: "bold" }}>{c.qty}</span>
              <button onClick={() => adjustQty(c.id, 1)} style={qtyBtn("#f5c518", "#000")}>+</button>
              <button onClick={() => removeFromCart(c.id)} style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 6, backgroundColor: "#3b0000", color: "#f87171", border: "none", cursor: "pointer", fontSize: 12 }}>
                Remove
              </button>
            </div>
          </div>
        ))}

        {cart.length > 0 && (
          <>
            <div style={{ ...card, marginTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <p style={{ margin: 0, color: "#aaa", fontSize: 13 }}>Subtotal</p>
                <p style={{ margin: 0, fontSize: 13 }}>${cartSubtotal.toFixed(2)}</p>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <p style={{ margin: 0, color: "#aaa", fontSize: 13 }}>Delivery</p>
                <p style={{ margin: 0, color: "#f5c518", fontSize: 13 }}>+$15.00</p>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e2d4a" }}>
                <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>Total</p>
                <p style={{ margin: 0, fontWeight: "bold", fontSize: 16, color: "#4ade80" }}>${(cartSubtotal + DELIVERY_FEE).toFixed(2)}</p>
              </div>
            </div>
            <button onClick={() => { if (!user) { setView("login"); } else { setView("checkout"); } }} style={primaryBtn}>
              {user ? "Proceed to Checkout" : "Login to Order"}
            </button>
          </>
        )}

        <button onClick={() => setView("home")} style={secondaryBtn}>Continue Shopping</button>
      </div>
    );
  }

  // ── CHECKOUT ──
  if (view === "checkout") {
    return (
      <div style={pg}>
        <button onClick={() => setView("cart")} style={backBtn}>Back to Cart</button>
        <h2 style={{ color: "#f5c518", marginTop: 0, marginBottom: 4 }}>Checkout</h2>
        <p style={{ color: "#4a5568", fontSize: 13, marginBottom: 18 }}>Choose delivery or pickup</p>

        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <button onClick={() => setFulfillment("delivery")} style={{ flex: 1, padding: "11px", borderRadius: 10, backgroundColor: fulfillment === "delivery" ? "#f5c518" : "#111c33", color: fulfillment === "delivery" ? "#000" : "#aaa", border: fulfillment === "delivery" ? "none" : "1px solid #1e2d4a", fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>
            Delivery +$15
          </button>
          <button onClick={() => setFulfillment("pickup")} style={{ flex: 1, padding: "11px", borderRadius: 10, backgroundColor: fulfillment === "pickup" ? "#f5c518" : "#111c33", color: fulfillment === "pickup" ? "#000" : "#aaa", border: fulfillment === "pickup" ? "none" : "1px solid #1e2d4a", fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>
            Pickup FREE
          </button>
        </div>

        {fulfillment === "delivery" && (
          <>
            <label style={lbl}>Delivery Address</label>
            <input placeholder="Street address, area..." value={address} onChange={(e) => setAddress(e.target.value)} style={inp} />
            <label style={lbl}>Island</label>
            <select value={island} onChange={(e) => { setIsland(e.target.value); setMailboat(""); }} style={inp}>
              {BAHAMAS_ISLANDS.map((isl) => <option key={isl} value={isl}>{isl}</option>)}
            </select>
            {isOutIsland && availableMailboats.length > 0 && (
              <>
                <label style={lbl}>Select Mailboat</label>
                <select value={mailboat} onChange={(e) => setMailboat(e.target.value)} style={inp}>
                  <option value="">-- Select mailboat --</option>
                  {availableMailboats.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <div style={{ backgroundColor: "#1a1400", border: "1px solid #f5c518", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                  <p style={{ margin: 0, color: "#f5c518", fontSize: 12 }}>Orders must be placed 48 hours before mailboat departure</p>
                </div>
              </>
            )}
          </>
        )}

        {fulfillment === "pickup" && (
          <>
            <label style={lbl}>Pickup Date (Next Day Minimum)</label>
            <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} min={new Date(Date.now() + 86400000).toISOString().split("T")[0]} style={inp} />
            <div style={{ backgroundColor: "#0a1f0a", border: "1px solid #4ade80", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
              <p style={{ margin: 0, color: "#4ade80", fontSize: 12 }}>Pickup is FREE at BSC Nassau location</p>
            </div>
          </>
        )}

        <div style={{ ...card, marginBottom: 14 }}>
          <p style={{ margin: "0 0 10px", color: "#f5c518", fontWeight: "bold", fontSize: 13 }}>Order Summary</p>
          {cart.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <p style={{ margin: 0, color: "#aaa", fontSize: 13 }}>{c.name} x{c.qty}</p>
              <p style={{ margin: 0, fontSize: 13 }}>${(c.price * c.qty).toFixed(2)}</p>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #1e2d4a", marginTop: 10, paddingTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <p style={{ margin: 0, color: "#aaa", fontSize: 13 }}>Subtotal</p>
              <p style={{ margin: 0, fontSize: 13 }}>${cartSubtotal.toFixed(2)}</p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <p style={{ margin: 0, color: "#aaa", fontSize: 13 }}>{fulfillment === "delivery" ? "Delivery" : "Pickup"}</p>
              <p style={{ margin: 0, color: fulfillment === "delivery" ? "#f5c518" : "#4ade80", fontSize: 13 }}>
                {fulfillment === "delivery" ? "+$15.00" : "FREE"}
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e2d4a" }}>
              <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>Total</p>
              <p style={{ margin: 0, fontWeight: "bold", fontSize: 16, color: "#4ade80" }}>${cartTotal.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {checkoutError && (
          <p style={{ color: "#f87171", fontSize: 13, backgroundColor: "#2d0000", padding: "10px 12px", borderRadius: 8, marginBottom: 12 }}>{checkoutError}</p>
        )}

        <button onClick={handlePlaceOrder} disabled={loading} style={{ ...primaryBtn, backgroundColor: loading ? "#555" : "#f5c518", cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Processing..." : "Confirm Order"}
        </button>
        <button onClick={() => setView("cart")} style={secondaryBtn}>Back to Cart</button>
      </div>
    );
  }

  return null;
}
