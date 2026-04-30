"use client";

import { useState } from "react";
import Link from "next/link";

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* ─── HEADER ─── */}
      <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-[#1a2e5a] flex items-center justify-center overflow-hidden">
                <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
                  <circle cx="20" cy="20" r="20" fill="#1a2e5a" />
                  <path d="M8 22c3-5 8-8 14-7s10 5 10 9c0 0-5-3-10-2s-9 4-14 0z" fill="#f4c842" />
                  <ellipse cx="27" cy="18" rx="5" ry="3.5" fill="#38bdf8" opacity="0.7" />
                  <circle cx="29" cy="17" r="1" fill="white" />
                  <path d="M32 20 l4-3 l-1 3 l1 3z" fill="#f4c842" />
                </svg>
              </div>
              <div className="leading-tight">
                <div className="text-[#1a2e5a] font-black text-lg tracking-tight">BSC</div>
                <div className="text-[#1a2e5a] font-bold text-[10px] tracking-widest uppercase -mt-1">Marketplace</div>
                <div className="text-gray-400 text-[8px] tracking-wide">Fresh. Local. Reliable.</div>
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-7">
              {["Home", "Shop", "Services", "About Us", "Help & Support"].map((item) => (
                <Link
                  key={item}
                  href={item === "Shop" ? "/market" : item === "Services" ? "/utilities" : "#"}
                  className="text-sm font-medium text-gray-700 hover:text-[#1a2e5a] transition-colors"
                >
                  {item}
                </Link>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* Cart */}
              <Link href="/market" className="relative p-2 text-gray-600 hover:text-[#1a2e5a]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </Link>
              <Link
                href="/login"
                className="bg-[#1a2e5a] text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#243d78] transition-colors"
              >
                Sign In
              </Link>
              {/* Mobile hamburger */}
              <button
                className="md:hidden p-2 text-gray-600"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-3 flex flex-col gap-3">
            {["Home", "Shop", "Services", "About Us", "Help & Support"].map((item) => (
              <Link key={item} href="#" className="text-sm font-medium text-gray-700 py-1">
                {item}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* ─── HERO ─── */}
      <section className="relative h-[580px] md:h-[640px] overflow-hidden">
        {/* Background image — replace src with your actual hero image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=1600&q=80')",
          }}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/55 to-black/30" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-4">
          <p className="text-white/70 text-sm uppercase tracking-widest mb-3 font-medium">
            Nassau & Andros, Bahamas 🇧🇸
          </p>
          <h1 className="text-white font-black text-4xl md:text-6xl leading-tight mb-3">
            Welcome to
            <br />
            <span className="text-white">BSC Marketplace</span>
          </h1>
          <p className="text-[#f4c842] text-xl md:text-2xl font-bold mb-2 tracking-wide">
            Seafood. Meats. Essentials. Services.
          </p>
          <p className="text-white/80 text-base md:text-lg mb-8">
            Everything you need. All in one place.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
            <Link
              href="/login"
              className="flex-1 bg-[#f4c842] text-[#1a2e5a] font-bold py-3.5 px-6 rounded-lg text-center hover:bg-[#f0bb2a] transition-colors text-base shadow-lg"
            >
              Create Account
            </Link>
            <Link
              href="/login"
              className="flex-1 border-2 border-white text-white font-bold py-3.5 px-6 rounded-lg text-center hover:bg-white/10 transition-colors text-base"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ─── TRUST BAR ─── */}
      <section className="bg-[#1a2e5a] py-5">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                ),
                label: "Fresh & Quality",
                sub: "Premium seafood & meats",
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                ),
                label: "Secure Payments",
                sub: "Your payments are safe",
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                ),
                label: "Fast Delivery",
                sub: "Nassau & Family Islands",
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                ),
                label: "Trusted by Locals",
                sub: "Committed to our community",
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#f4c842]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {item.icon}
                  </svg>
                </div>
                <div>
                  <div className="text-white font-bold text-sm">{item.label}</div>
                  <div className="text-white/60 text-xs">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SERVICES ─── */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-center text-[#1a2e5a] font-black text-2xl md:text-3xl tracking-wider mb-10 uppercase">
            Shop. Pay. Save. All in One Place.
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
            {[
              {
                emoji: "🛒",
                title: "Shop Marketplace",
                desc: "Fresh seafood, meats, groceries and more.",
                cta: "Shop Now",
                href: "/market",
              },
              {
                emoji: "📦",
                title: "Wholesale & Bulk",
                desc: "Bulk orders for businesses and organizations.",
                cta: "Order Bulk",
                href: "/market",
              },
              {
                emoji: "🧾",
                title: "Pay Utility Bills",
                desc: "Pay water, electricity, internet and more.",
                cta: "Pay Bills",
                href: "/utilities",
              },
              {
                emoji: "🚚",
                title: "Delivery Services",
                desc: "Fast & reliable delivery to your doorstep.",
                cta: "Schedule Delivery",
                href: "/market",
              },
              {
                emoji: "🚢",
                title: "Mailboat Shipping",
                desc: "We ship to all major Family Islands.",
                cta: "Ship Now",
                href: "/market",
              },
            ].map((s) => (
              <div
                key={s.title}
                className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col items-center text-center shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="text-4xl mb-3">{s.emoji}</div>
                <h3 className="font-bold text-[#1a2e5a] text-sm mb-2">{s.title}</h3>
                <p className="text-gray-500 text-xs mb-4 leading-relaxed">{s.desc}</p>
                <Link
                  href={s.href}
                  className="mt-auto border border-gray-300 text-[#1a2e5a] text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#1a2e5a] hover:text-white transition-colors"
                >
                  {s.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHY BSC ─── */}
      <section className="py-14 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-center text-[#1a2e5a] font-black text-2xl md:text-3xl tracking-wider mb-10 uppercase">
            Why Shop with BSC?
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {[
              { emoji: "🐟", title: "Wide Selection", desc: "Seafood, meats, groceries, essentials & more." },
              { emoji: "💰", title: "Great Prices", desc: "Competitive prices with quality you can trust." },
              { emoji: "🔒", title: "Secure & Easy", desc: "Safe payments and easy checkout." },
              { emoji: "🇧🇸", title: "Support Local", desc: "Empowering Bahamian suppliers & communities." },
              { emoji: "💬", title: "Customer Support", desc: "We're here to help you every step of the way." },
            ].map((w) => (
              <div key={w.title} className="flex flex-col items-center text-center">
                <div className="text-3xl mb-3">{w.emoji}</div>
                <h3 className="font-bold text-[#1a2e5a] text-sm mb-1">{w.title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DUAL BANNER ─── */}
      <section className="grid md:grid-cols-2 min-h-[280px]">
        {/* Seafood */}
        <div
          className="relative overflow-hidden flex items-end p-8 md:p-12 min-h-[220px]"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1534482421-64566f976cfa?w=800&q=80')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-[#1a2e5a]/70" />
          <div className="relative z-10">
            <h3 className="text-white font-black text-2xl md:text-3xl uppercase leading-tight mb-1">
              Fresh Seafood
              <br />
              Delivered Daily
            </h3>
            <p className="text-white/75 text-sm mb-5">From our waters to your table.</p>
            <Link
              href="/market"
              className="inline-block bg-[#f4c842] text-[#1a2e5a] font-bold px-6 py-2.5 rounded-lg hover:bg-[#f0bb2a] transition-colors text-sm"
            >
              Shop Seafood
            </Link>
          </div>
        </div>

        {/* Meats */}
        <div
          className="relative overflow-hidden flex items-end p-8 md:p-12 min-h-[220px]"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=800&q=80')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10">
            <h3 className="text-white font-black text-2xl md:text-3xl uppercase leading-tight mb-1">
              Premium Meats
              <br />
              Cut Fresh
            </h3>
            <p className="text-white/75 text-sm mb-5">Quality you can taste.</p>
            <Link
              href="/market"
              className="inline-block bg-[#f4c842] text-[#1a2e5a] font-bold px-6 py-2.5 rounded-lg hover:bg-[#f0bb2a] transition-colors text-sm"
            >
              Shop Meats
            </Link>
          </div>
        </div>
      </section>

      {/* ─── TRUST FOOTER BADGES ─── */}
      <section className="py-10 px-4 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { emoji: "🔒", title: "Secure Checkout", sub: "100% secure payments" },
            { emoji: "✅", title: "Verified Suppliers", sub: "Trusted local suppliers" },
            { emoji: "⭐", title: "Quality Guaranteed", sub: "Freshness you can trust" },
            { emoji: "🤝", title: "Satisfaction Guaranteed", sub: "We stand behind every order" },
          ].map((b) => (
            <div key={b.title} className="flex flex-col items-center text-center">
              <div className="text-2xl mb-2">{b.emoji}</div>
              <div className="font-bold text-[#1a2e5a] text-sm">{b.title}</div>
              <div className="text-gray-500 text-xs mt-0.5">{b.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-white border-t border-gray-100 py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap justify-center gap-6 mb-5">
            {[
              { label: "About Us", href: "#" },
              { label: "How It Works", href: "#" },
              { label: "FAQs", href: "#" },
              { label: "Contact Us", href: "#" },
              { label: "Terms & Conditions", href: "/legal" },
              { label: "Privacy Policy", href: "/legal" },
            ].map((l) => (
              <Link key={l.label} href={l.href} className="text-gray-500 text-xs hover:text-[#1a2e5a] transition-colors">
                {l.label}
              </Link>
            ))}
          </div>
          <p className="text-center text-gray-400 text-xs">
            © 2025 BSC Marketplace. All Rights Reserved.{" "}
            <span className="ml-1">Proudly Bahamian 🇧🇸</span>
          </p>
        </div>
      </footer>
    </div>
  );
}