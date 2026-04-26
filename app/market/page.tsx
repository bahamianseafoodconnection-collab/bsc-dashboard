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
  photo_url?: string;
  isSupplierProduct?: boolean;
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
  {
    id: "utility",
    label: "Pay Utility Bill",
    icon: "⚡",
    color: "#60a5fa",
    desc: "BEC, Water & Sewage, Cable, Internet",
  },
  {
    id: "retail",
    label: "Shop Local Retail",
    icon: "🐟",
    color: "#4ade80",
    desc: "Fresh seafood, local products",
  },
  {
    id: "wholesale",
    label: "Wholesale & Bulk",
    icon: "📦",
    color: "#f5c518",
    desc: "Bulk orders for businesses",
  },
  {
    id: "usa",
    label: "USA Bulk Import",
    icon: "🇺🇸",
    color: "#f87171",
    desc: "Coming soon",
  },
  {
    id: "auto",
    label: "Auto & Car Parts",
    icon: "🚗",
    color: "#a78bfa",
    desc: "Coming soon",
  },
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

  const [user, setUser] = useState<{
    name: string;
    phone: string;
    email: string;
  } | null>(null);
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

  // Load approved supplier products on mount
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

  const isOutIsland =
    island !== "New Providence (Nassau)" &&
    island !== "Grand Bahama (Freeport)";
  const availableMailboats = MAILBOATS[island] || [];

  // Combine store products + approved supplier products for display
  const storeProductsFormatted = products
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

  const supplierProductsFormatted = supplierProducts
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .map((p) => ({
      id: p.id,
      name: p.name,
      displayPrice: cartType === "retail" ? p.retail_price : p.wholesale_price,
      stock: 999, // supplier manages their own stock
      supplierName: p.supplier_name,
      photo_url: p.photo_url,
      isSupplierProduct: true,
      sku: p.sku,
    }));

  const allProducts = [...storeProductsFormatted, ...supplierProductsFormatted];

  function addToCart(item: {
    id: string;
    name: string;
    displayPrice: number;
    supplierName: string;
    photo_url: string;
    isSupplierProduct: boolean;
  }) {
    setCart((prev) => {
      const ex = prev.find((c) => c.id === item.id);
      return ex
        ? prev.map((c) => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
        : [...prev, {
            id: item.id,
            name: item.name,
            price: item.displayPrice,
            qty: 1,
            supplierName: item.supplierName,
            photo_url: item.photo_url,
            isSupplierProduct: item.isSupplierProduct,
          }];
    });
  }

  function adjustQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => c.id === id ? { ...c, qty: c.qty + delta } : c)
        .filter((c) => c.qty > 0)
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
    if (error) {
      setAuthError(error.message);
      setLoading(false);
      return;
    }
    setUser({ name: authUsername, phone: authPhone, email: authEmail });
    setLoading(false);
    setView("home");
  }

  async function handleLogin() {
    setAuthError("");
    if (!authEmail || !authPassword) {
      setAuthError("Email and password required");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });
    if (error) {
      setAuthError(error.message);
      setLoading(false);
      return;
    }
    const meta = data.user?.user_metadata;
    setUser({
      name: meta?.name || authEmail,
      phone: meta?.phone || "",
      email: authEmail,
    });
    setLoading(false);
    setView("home");
  }

  async function handlePlaceOrder() {
    setCheckoutError("");
    if (fulfillment === "delivery" && !address.trim()) {
      setCheckoutError("Enter your delivery address");
      return;
    }
    if (fulfillment === "delivery" && isOutIsland && !mailboat) {
      setCheckoutError("Select your mailboat");
      return;
    }
    if (fulfillment === "pickup" && !pickupDate) {
      setCheckoutError("Select a pickup date");
      return;
    }
    setLoading(true);

    const deliveryNote =
      fulfillment === "delivery"
        ? "DELIVERY — " + address + ", " + island + (mailboat ? " via " + mailboat : "")
        : "PICKUP — " + pickupDate;

    const saleItems = cart.map((c) => ({
      productId: c.id,
      productName: c.name,
      price: c.price,
      qty: c.qty,
      supplierName: c.supplierName,
    }));

    // For store products use completeSale, for supplier products just record financials
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

  const pg: React.CSSProperties = {
    padding: 18,
    backgroundColor: "#0a0f1e",
    minHeight: "100vh",
    color: "#fff",
    fontFamily: "sans-serif",
    paddingBottom: 100,
  };

  const backBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "#f5c518",
    fontSize: 14,
    cursor: "pointer",
    marginBottom: 14,
    padding: 0,
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
  };

  const card: React.CSSProperties = {
    backgroundColor: "#111c33",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 12,
    border: "1px solid #1e2d4a",
  };

  function qtyBtn(bg: string, color = "#fff"): React.CSSProperties {
    return {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: bg,
      color,
      border: "none",
      fontSize: 18,
      cursor: "pointer",
      fontWeight: "bold",
    };
  }

  // HOME
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
              <button
                onClick={() => setView("cart")}
                style={{ padding: "8px 14px", borderRadius: 10, backgroundColor: "#f5c518", color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: 13 }}
              >
                Cart {cartCount}
              </button>
            )}
            {user ? (
              <button
                onClick={async () => { await supabase.auth.signOut(); setUser(null); }}
                style={{ padding: "8px 12px", borderRadius: 10, backgroundColor: "#111c33", color: "#aaa", border: "1px solid #1e2d4a", cursor: "pointer", fontSize: 12 }}
              >
                {user.name.split(" ")[0]}
              </button>
            ) : (
              <button
                onClick={() => setView("login")}
                style={{ padding: "8px 14px", borderRadius: 10, backgroundColor: "#111c33", color: "#f5c518", border: "1px solid #f5c518", cursor: "pointer", fontSize: 12, fontWeight: "bold" }}
              >
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

        {/* SUPPLIER PRODUCTS BANNER */}
        {supplierProducts.length > 0 && (
          <div style={{ backgroundColor: "#0a1220", border: "1px solid #60a5fa", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
            <p style={{ margin: 0, color: "#60a5fa", fontWeight: "bold", fontSize: 13 }}>
