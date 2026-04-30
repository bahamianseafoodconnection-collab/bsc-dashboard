"use client";

import { useState } from "react";
import Link from "next/link";

// ─── YOUR IMAGE URLS (after uploading to Supabase bucket "site-images") ───
const HERO_IMAGE =
  "https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images/hero.jpg";
const SEAFOOD_BANNER =
  "https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images/seafood-banner.jpg";
const MEATS_BANNER =
  "https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images/meats-banner.jpg";
// ─────────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#ffffff", fontFamily: "system-ui, -apple-system, sans-serif", margin: 0, padding: 0 }}>

      {/* ─── HEADER ─── */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, backgroundColor: "#ffffff", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", borderBottom: "1px solid #f0f0f0" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "64px" }}>

          {/* Logo */}
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "50%", backgroundColor: "#1a2e5a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg viewBox="0 0 44 44" width="36" height="36" fill="none">
                <circle cx="22" cy="22" r="22" fill="#1a2e5a" />
                <path d="M10 24c3-5 9-8 15-7s11 5 11 9c0 0-5-3-11-2s-10 4-15 0z" fill="#f4c842" />
                <ellipse cx="28" cy="19" rx="6" ry="4" fill="#38bdf8" opacity="0.85" />
                <circle cx="30" cy="18" r="1.2" fill="white" />
                <circle cx="30.4" cy="17.6" r="0.5" fill="#1a2e5a" />
                <path d="M34 21 l5-3 l-1.5 3 l1.5 3z" fill="#f4c842" />
                <path d="M8 30 q3-2 6 0 q3 2 6 0 q3-2 6 0" stroke="#38bdf8" strokeWidth="1.2" fill="none" opacity="0.6" />
              </svg>
            </div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ color: "#1a2e5a", fontWeight: 900, fontSize: "18px", letterSpacing: "-0.5px" }}>BSC</div>
              <div style={{ color: "#1a2e5a", fontWeight: 700, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase" }}>MARKETPLACE</div>
              <div style={{ color: "#999", fontSize: "8px", letterSpacing: "1px" }}>Fresh. Local. Reliable.</div>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav style={{ display: menuOpen ? "none" : "flex", alignItems: "center", gap: "28px" }}>
            {[
              { label: "Home", href: "/" },
              { label: "Shop", href: "/market" },
              { label: "Services", href: "/utilities" },
              { label: "About Us", href: "#" },
              { label: "Help & Support", href: "#" },
            ].map((item) => (
              <Link key={item.label} href={item.href} style={{ color: "#444", fontSize: "14px", fontWeight: 500, textDecoration: "none" }}>
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Link href="/market" style={{ color: "#555", padding: "8px", display: "flex" }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </Link>
            <Link href="/login" style={{ backgroundColor: "#1a2e5a", color: "#fff", fontSize: "14px", fontWeight: 700, padding: "9px 22px", borderRadius: "8px", textDecoration: "none" }}>
              Sign In
            </Link>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div style={{ backgroundColor: "#fff", borderTop: "1px solid #f0f0f0", padding: "12px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {[
              { label: "Home", href: "/" },
              { label: "Shop", href: "/market" },
              { label: "Services", href: "/utilities" },
              { label: "About Us", href: "#" },
              { label: "Help & Support", href: "#" },
            ].map((item) => (
              <Link key={item.label} href={item.href} style={{ color: "#444", fontSize: "14px", fontWeight: 500, textDecoration: "none", padding: "4px 0" }}>{item.label}</Link>
            ))}
          </div>
        )}
      </header>

      {/* ─── HERO ─── */}
      {/* Photo: hero.jpg — mixed seafood & meats spread on dark background */}
      <section style={{ position: "relative", height: "580px", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `url('${HERO_IMAGE}')`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
        }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.58) 50%, rgba(0,0,0,0.38) 100%)" }} />
        <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", padding: "0 20px" }}>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", letterSpacing: "3px", textTransform: "uppercase", marginBottom: "12px", fontWeight: 500 }}>
            Nassau & Andros, Bahamas 🇧🇸
          </p>
          <h1 style={{ color: "#fff", fontWeight: 900, fontSize: "clamp(32px, 6vw, 58px)", lineHeight: 1.1, margin: "0 0 10px" }}>
            Welcome to<br />BSC Marketplace
          </h1>
          <p style={{ color: "#f4c842", fontSize: "clamp(16px, 3vw, 22px)", fontWeight: 800, margin: "0 0 8px", letterSpacing: "0.5px" }}>
            Seafood. Meats. Essentials. Services.
          </p>
          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "16px", margin: "0 0 32px" }}>
            Everything you need. All in one place.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%", maxWidth: "320px" }}>
            <Link href="/login" style={{ backgroundColor: "#f4c842", color: "#1a2e5a", fontWeight: 800, fontSize: "15px", padding: "14px 0", borderRadius: "10px", textDecoration: "none", textAlign: "center", boxShadow: "0 4px 16px rgba(244,200,66,0.4)" }}>
              Create Account
            </Link>
            <Link href="/login" style={{ border: "2px solid rgba(255,255,255,0.8)", color: "#fff", fontWeight: 700, fontSize: "15px", padding: "13px 0", borderRadius: "10px", textDecoration: "none", textAlign: "center" }}>
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ─── TRUST BAR ─── */}
      <section style={{ backgroundColor: "#1a2e5a", padding: "20px 20px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          {[
            { icon: "✅", label: "Fresh & Quality", sub: "Premium seafood & meats" },
            { icon: "🔒", label: "Secure Payments", sub: "Your payments are safe" },
            { icon: "⚡", label: "Fast Delivery", sub: "Nassau & Family Islands" },
            { icon: "🤝", label: "Trusted by Locals", sub: "Committed to our community" },
          ].map((item) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>
                {item.icon}
              </div>
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: "13px" }}>{item.label}</div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "11px" }}>{item.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── SERVICES ─── */}
      <section style={{ padding: "60px 20px", backgroundColor: "#fff" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", color: "#1a2e5a", fontWeight: 900, fontSize: "22px", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "40px" }}>
            Shop. Pay. Save. All in One Place.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px" }}>
            {[
              { emoji: "🛒", title: "Shop Marketplace", desc: "Fresh seafood, meats, groceries and more.", cta: "Shop Now", href: "/market" },
              { emoji: "📦", title: "Wholesale & Bulk", desc: "Bulk orders for businesses and organizations.", cta: "Order Bulk", href: "/market" },
              { emoji: "🧾", title: "Pay Utility Bills", desc: "Pay water, electricity, internet and more.", cta: "Pay Bills", href: "/utilities" },
              { emoji: "🚚", title: "Delivery Services", desc: "Fast & reliable delivery to your doorstep.", cta: "Schedule Delivery", href: "/market" },
              { emoji: "🚢", title: "Mailboat Shipping", desc: "We ship to all major Family Islands.", cta: "Ship Now", href: "/market" },
            ].map((s) => (
              <div key={s.title} style={{ backgroundColor: "#fff", border: "1px solid #ebebeb", borderRadius: "16px", padding: "22px 14px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: "38px", marginBottom: "12px" }}>{s.emoji}</div>
                <h3 style={{ color: "#1a2e5a", fontWeight: 800, fontSize: "13px", margin: "0 0 8px" }}>{s.title}</h3>
                <p style={{ color: "#777", fontSize: "11px", lineHeight: 1.6, margin: "0 0 18px", flex: 1 }}>{s.desc}</p>
                <Link href={s.href} style={{ border: "1px solid #ccc", color: "#1a2e5a", fontSize: "11px", fontWeight: 700, padding: "7px 16px", borderRadius: "8px", textDecoration: "none" }}>
                  {s.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHY BSC ─── */}
      <section style={{ padding: "50px 20px", backgroundColor: "#f8f9fa" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", color: "#1a2e5a", fontWeight: 900, fontSize: "22px", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "40px" }}>
            Why Shop with BSC?
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "24px" }}>
            {[
              { emoji: "🐟", title: "Wide Selection", desc: "Seafood, meats, groceries, essentials & more." },
              { emoji: "💰", title: "Great Prices", desc: "Competitive prices with quality you can trust." },
              { emoji: "🔒", title: "Secure & Easy", desc: "Safe payments and easy checkout." },
              { emoji: "🇧🇸", title: "Support Local", desc: "Empowering Bahamian suppliers & communities." },
              { emoji: "💬", title: "Customer Support", desc: "We're here to help you every step of the way." },
            ].map((w) => (
              <div key={w.title} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div style={{ fontSize: "30px", marginBottom: "10px" }}>{w.emoji}</div>
                <h3 style={{ color: "#1a2e5a", fontWeight: 800, fontSize: "13px", margin: "0 0 6px" }}>{w.title}</h3>
                <p style={{ color: "#777", fontSize: "11px", lineHeight: 1.5, margin: 0 }}>{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DUAL BANNER ─── */}
      {/* seafood-banner.jpg: salmon steaks + shrimp + whole fish */}
      {/* meats-banner.jpg: tomahawk ribeye on wood board */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ position: "relative", overflow: "hidden", minHeight: "280px", display: "flex", alignItems: "flex-end", padding: "40px" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: `url('${SEAFOOD_BANNER}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(26,46,90,0.70)" }} />
          <div style={{ position: "relative", zIndex: 10 }}>
            <h3 style={{ color: "#fff", fontWeight: 900, fontSize: "clamp(18px, 2.5vw, 28px)", textTransform: "uppercase", lineHeight: 1.15, margin: "0 0 6px" }}>
              Fresh Seafood<br />Delivered Daily
            </h3>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", margin: "0 0 18px" }}>From our waters to your table.</p>
            <Link href="/market" style={{ display: "inline-block", backgroundColor: "#f4c842", color: "#1a2e5a", fontWeight: 800, fontSize: "13px", padding: "10px 22px", borderRadius: "8px", textDecoration: "none" }}>
              Shop Seafood
            </Link>
          </div>
        </div>

        <div style={{ position: "relative", overflow: "hidden", minHeight: "280px", display: "flex", alignItems: "flex-end", padding: "40px" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: `url('${MEATS_BANNER}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.60)" }} />
          <div style={{ position: "relative", zIndex: 10 }}>
            <h3 style={{ color: "#fff", fontWeight: 900, fontSize: "clamp(18px, 2.5vw, 28px)", textTransform: "uppercase", lineHeight: 1.15, margin: "0 0 6px" }}>
              Premium Meats<br />Cut Fresh
            </h3>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", margin: "0 0 18px" }}>Quality you can taste.</p>
            <Link href="/market" style={{ display: "inline-block", backgroundColor: "#f4c842", color: "#1a2e5a", fontWeight: 800, fontSize: "13px", padding: "10px 22px", borderRadius: "8px", textDecoration: "none" }}>
              Shop Meats
            </Link>
          </div>
        </div>
      </section>

      {/* ─── TRUST BADGES ─── */}
      <section style={{ padding: "40px 20px", backgroundColor: "#fff", borderTop: "1px solid #f0f0f0" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px" }}>
          {[
            { emoji: "🔒", title: "Secure Checkout", sub: "100% secure payments" },
            { emoji: "✅", title: "Verified Suppliers", sub: "Trusted local suppliers" },
            { emoji: "⭐", title: "Quality Guaranteed", sub: "Freshness you can trust" },
            { emoji: "🤝", title: "Satisfaction Guaranteed", sub: "We stand behind every order" },
          ].map((b) => (
            <div key={b.title} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>{b.emoji}</div>
              <div style={{ color: "#1a2e5a", fontWeight: 800, fontSize: "13px", marginBottom: "4px" }}>{b.title}</div>
              <div style={{ color: "#999", fontSize: "11px" }}>{b.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer style={{ backgroundColor: "#fff", borderTop: "1px solid #ebebeb", padding: "28px 20px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "24px", marginBottom: "16px" }}>
            {["About Us", "How It Works", "FAQs", "Contact Us", "Terms & Conditions", "Privacy Policy"].map((l) => (
              <Link key={l} href="#" style={{ color: "#888", fontSize: "12px", textDecoration: "none" }}>{l}</Link>
            ))}
          </div>
          <p style={{ textAlign: "center", color: "#aaa", fontSize: "12px", margin: 0 }}>
            © 2025 BSC Marketplace. All Rights Reserved. &nbsp; Proudly Bahamian 🇧🇸
          </p>
        </div>
      </footer>
    </div>
  );