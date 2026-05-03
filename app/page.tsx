// app/page.tsx
// COMPLETE POLISHED HOMEPAGE — Professional E-Commerce Hero Experience
// Matches BSC Master Context Card (May 2, 2026) + provided "Page build out.png" mockup
// Uses existing HeroSection.tsx + SiteFooter.tsx (updated below for perfect match)
// Dark navy #1a2e4a / #0f2137, gold #f5a623 accents, Bahamian seafood theme
// Fully responsive, mobile-first, Tailwind CSS, Next.js 15 App Router
// All sections follow master card order + mockup visual polish
// Links to live routes: /market, /local-wholesale, /us-shopping, /checkout, etc.

import HeroSection from '@/components/HeroSection';
import SiteFooter from '@/components/SiteFooter';
import Image from 'next/image';
import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      {/* STICKY NAV — Professional e-comm header */}
      <nav className="sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#0f2137] rounded-full flex items-center justify-center">
                <span className="text-white text-2xl">🐟</span>
              </div>
              <div>
                <span className="text-2xl font-bold tracking-tighter text-[#0f2137]">BSC</span>
                <span className="text-[#f5a623] text-xl font-semibold">Marketplace</span>
              </div>
              <p className="text-xs text-[#0f2137] font-medium leading-none">
                Fresh.<br />Local.<br />Reliable.
              </p>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-8 text-sm font-medium">
              <Link href="/" className="hover:text-[#f5a623] transition-colors">Home</Link>
              <Link href="/market" className="hover:text-[#f5a623] transition-colors">Shop</Link>
              <Link href="/local-wholesale" className="hover:text-[#f5a623] transition-colors">Shop Local</Link>
              <Link href="/local-wholesale" className="hover:text-[#f5a623] transition-colors">Wholesale</Link>
              <Link href="/us-shopping" className="hover:text-[#f5a623] transition-colors">Shop USA</Link>
              <Link href="/services" className="hover:text-[#f5a623] transition-colors">Services</Link>
              <Link href="/about" className="hover:text-[#f5a623] transition-colors">About Us</Link>
              <Link href="/help" className="hover:text-[#f5a623] transition-colors">Help &amp; Support</Link>
            </div>

            <div className="flex items-center gap-4">
              <Link href="/cart" className="flex items-center gap-1 text-[#0f2137] hover:text-[#f5a623]">
                <span className="text-2xl">🛒</span>
                <span className="text-xs font-medium">0</span>
              </Link>
              <Link 
                href="/login" 
                className="px-6 py-2 text-sm font-semibold text-white bg-[#0f2137] hover:bg-[#f5a623] hover:text-[#0f2137] rounded-xl transition-all"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* HERO — Updated to match mockup + master brand polish */}
      <HeroSection />

      {/* TRUST BAR — #1a2e4a navy background (master spec) */}
      <div className="bg-[#1a2e4a] py-6 text-white">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="w-8 h-8 bg-[#f5a623] rounded-2xl flex items-center justify-center text-[#0f2137] text-xl">🐟</div>
            <div>
              <p className="font-semibold">Fresh &amp; Quality</p>
              <p className="text-xs opacity-75">Premium seafood &amp; meats</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <div className="w-8 h-8 bg-[#f5a623] rounded-2xl flex items-center justify-center text-[#0f2137] text-xl">🔒</div>
            <div>
              <p className="font-semibold">Secure Payments</p>
              <p className="text-xs opacity-75">Your payments are safe</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <div className="w-8 h-8 bg-[#f5a623] rounded-2xl flex items-center justify-center text-[#0f2137] text-xl">🚚</div>
            <div>
              <p className="font-semibold">Fast Delivery</p>
              <p className="text-xs opacity-75">Nassau &amp; Family Islands</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <div className="w-8 h-8 bg-[#f5a623] rounded-2xl flex items-center justify-center text-[#0f2137] text-xl">🇧🇸</div>
            <div>
              <p className="font-semibold">Trusted by Locals</p>
              <p className="text-xs opacity-75">Committed to our community</p>
            </div>
          </div>
        </div>
      </div>

      {/* SHOP. PAY. SAVE. ALL IN ONE PLACE. — 5 service cards */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-bold text-center text-[#0f2137] mb-3 tracking-tighter">
            SHOP. PAY. SAVE. ALL IN ONE PLACE.
          </h2>
          <p className="text-center text-[#0f2137]/70 mb-12 max-w-md mx-auto">
            Everything you need. Delivered fresh to your door.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6">
            {/* Card 1 */}
            <Link href="/market" className="group">
              <div className="bg-white border border-gray-100 rounded-3xl p-8 h-full flex flex-col items-center text-center shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-16 h-16 bg-[#f5a623]/10 rounded-2xl flex items-center justify-center mb-6 text-4xl group-hover:scale-110 transition-transform">🛒</div>
                <h3 className="text-xl font-semibold mb-2">Shop Marketplace</h3>
                <p className="text-sm text-gray-600">Fresh seafood, meats, groceries &amp; more.</p>
                <span className="mt-auto pt-8 text-[#f5a623] font-medium flex items-center gap-2">
                  Shop Now <span className="text-xl">→</span>
                </span>
              </div>
            </Link>

            {/* Card 2 */}
            <Link href="/local-wholesale" className="group">
              <div className="bg-white border border-gray-100 rounded-3xl p-8 h-full flex flex-col items-center text-center shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-16 h-16 bg-[#f5a623]/10 rounded-2xl flex items-center justify-center mb-6 text-4xl group-hover:scale-110 transition-transform">📦</div>
                <h3 className="text-xl font-semibold mb-2">Wholesale &amp; Bulk</h3>
                <p className="text-sm text-gray-600">Bulk orders for businesses and organizations.</p>
                <span className="mt-auto pt-8 text-[#f5a623] font-medium flex items-center gap-2">
                  Order Bulk <span className="text-xl">→</span>
                </span>
              </div>
            </Link>

            {/* Card 3 */}
            <Link href="/utilities" className="group">
              <div className="bg-white border border-gray-100 rounded-3xl p-8 h-full flex flex-col items-center text-center shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-16 h-16 bg-[#f5a623]/10 rounded-2xl flex items-center justify-center mb-6 text-4xl group-hover:scale-110 transition-transform">📄</div>
                <h3 className="text-xl font-semibold mb-2">Pay Utility Bills</h3>
                <p className="text-sm text-gray-600">Water, electricity, internet and more.</p>
                <span className="mt-auto pt-8 text-[#f5a623] font-medium flex items-center gap-2">
                  Pay Bills <span className="text-xl">→</span>
                </span>
              </div>
            </Link>

            {/* Card 4 */}
            <Link href="/order-fulfillment" className="group">
              <div className="bg-white border border-gray-100 rounded-3xl p-8 h-full flex flex-col items-center text-center shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-16 h-16 bg-[#f5a623]/10 rounded-2xl flex items-center justify-center mb-6 text-4xl group-hover:scale-110 transition-transform">🚚</div>
                <h3 className="text-xl font-semibold mb-2">Delivery Services</h3>
                <p className="text-sm text-gray-600">Fast &amp; reliable delivery to your doorstep.</p>
                <span className="mt-auto pt-8 text-[#f5a623] font-medium flex items-center gap-2">
                  Schedule Delivery <span className="text-xl">→</span>
                </span>
              </div>
            </Link>

            {/* Card 5 */}
            <Link href="/vehicles" className="group">
              <div className="bg-white border border-gray-100 rounded-3xl p-8 h-full flex flex-col items-center text-center shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-16 h-16 bg-[#f5a623]/10 rounded-2xl flex items-center justify-center mb-6 text-4xl group-hover:scale-110 transition-transform">⛴️</div>
                <h3 className="text-xl font-semibold mb-2">Mailboat Shipping</h3>
                <p className="text-sm text-gray-600">We ship to all major Family Islands.</p>
                <span className="mt-auto pt-8 text-[#f5a623] font-medium flex items-center gap-2">
                  Ship Now <span className="text-xl">→</span>
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* LOCAL WHOLESALE — 7 Nassau wholesalers (master spec) */}
      <section className="py-16 bg-[#0f2137] text-white">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-center mb-12">Shop Direct from 7 Nassau Wholesalers</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-6">
            {[
              { slug: 'asa-h-pritchard', name: 'Asa H Pritchard' },
              { slug: 'bahamas-international-food', name: 'Bahamas International Food' },
              { slug: 'dalbenas', name: "D'Albenas" },
              { slug: 'bahamas-wholesale-agencies', name: 'Bahamas Wholesale Agencies' },
              { slug: 'tpg', name: 'TPG' },
              { slug: 'thompson-trading', name: 'Thompson Trading' },
              { slug: 'island-wholesale', name: 'Island Wholesale' },
            ].map((wholesaler) => (
              <Link
                key={wholesaler.slug}
                href={`/local-wholesale/${wholesaler.slug}`}
                className="group bg-white/10 backdrop-blur-md rounded-3xl p-6 text-center hover:bg-[#f5a623] hover:text-[#0f2137] transition-all"
              >
                <div className="text-5xl mb-4">🏪</div>
                <p className="font-semibold text-lg">{wholesaler.name}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* US SHOPPING — 5 Florida stores (master spec) */}
      <section className="py-16 bg-[#1a2e4a] text-white">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-center mb-12">Shop USA — Delivered to Nassau</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {[
              { slug: 'sams-club', name: "Sam's Club" },
              { slug: 'bjs', name: "BJ's Wholesale" },
              { slug: 'costco', name: 'Costco' },
              { slug: 'walmart', name: 'Walmart' },
              { slug: 'steakhouse', name: 'FL Steakhouse' },
            ].map((store) => (
              <Link
                key={store.slug}
                href={`/us-shopping/${store.slug}`}
                className="group bg-white/10 backdrop-blur-md rounded-3xl p-6 text-center hover:bg-[#f5a623] hover:text-[#0f2137] transition-all"
              >
                <div className="text-5xl mb-4">🛍️</div>
                <p className="font-semibold">{store.name}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* WHY SHOP WITH BSC? — 5 benefit cards (matches mockup) */}
      <section className="py-16 bg-[#f8fafc]">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-center text-[#0f2137] mb-12">WHY SHOP WITH BSC?</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            <div className="text-center">
              <div className="mx-auto w-14 h-14 bg-[#f5a623] text-[#0f2137] rounded-2xl flex items-center justify-center text-4xl mb-6">🛒</div>
              <h3 className="font-semibold mb-2">Wide Selection</h3>
              <p className="text-sm text-gray-600">Seafood, meats, groceries, essentials &amp; more.</p>
            </div>
            <div className="text-center">
              <div className="mx-auto w-14 h-14 bg-[#f5a623] text-[#0f2137] rounded-2xl flex items-center justify-center text-4xl mb-6">💰</div>
              <h3 className="font-semibold mb-2">Great Prices</h3>
              <p className="text-sm text-gray-600">Competitive prices with quality you can trust.</p>
            </div>
            <div className="text-center">
              <div className="mx-auto w-14 h-14 bg-[#f5a623] text-[#0f2137] rounded-2xl flex items-center justify-center text-4xl mb-6">🔐</div>
              <h3 className="font-semibold mb-2">Secure &amp; Easy</h3>
              <p className="text-sm text-gray-600">Safe payments and easy checkout.</p>
            </div>
            <div className="text-center">
              <div className="mx-auto w-14 h-14 bg-[#f5a623] text-[#0f2137] rounded-2xl flex items-center justify-center text-4xl mb-6">🇧🇸</div>
              <h3 className="font-semibold mb-2">Support Local</h3>
              <p className="text-sm text-gray-600">Empowering Bahamian suppliers &amp; communities.</p>
            </div>
            <div className="text-center">
              <div className="mx-auto w-14 h-14 bg-[#f5a623] text-[#0f2137] rounded-2xl flex items-center justify-center text-4xl mb-6">❤️</div>
              <h3 className="font-semibold mb-2">Customer Support</h3>
              <p className="text-sm text-gray-600">We&apos;re here to help you every step of the way.</p>
            </div>
          </div>
        </div>
      </section>

      {/* DUAL BANNER — Fresh Seafood + Premium Meats (from master storage) */}
      <div className="grid md:grid-cols-2">
        {/* Seafood Banner */}
        <div className="relative bg-[#0f2137] text-white overflow-hidden">
          <Image
            src="/site-images/seafood-banner.jpg" // From Supabase storage: site-images
            alt="Fresh Seafood Delivered Daily"
            width={800}
            height={400}
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
          <div className="relative px-12 py-20 max-w-md">
            <h3 className="text-5xl font-bold leading-none mb-4">FRESH SEAFOOD<br />DELIVERED DAILY</h3>
            <p className="text-lg mb-8">From our waters to your table.</p>
            <Link
              href="/market"
              className="inline-block px-8 py-4 bg-[#f5a623] hover:bg-white hover:text-[#0f2137] text-[#0f2137] font-semibold rounded-2xl transition-all"
            >
              Shop Seafood
            </Link>
          </div>
        </div>

        {/* Meats Banner */}
        <div className="relative bg-[#1a2e4a] text-white overflow-hidden">
          <Image
            src="/site-images/meats-banner.jpg" // From Supabase storage: site-images
            alt="Premium Meats Cut Fresh"
            width={800}
            height={400}
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
          <div className="relative px-12 py-20 max-w-md">
            <h3 className="text-5xl font-bold leading-none mb-4">PREMIUM MEATS<br />CUT FRESH</h3>
            <p className="text-lg mb-8">Quality you can taste.</p>
            <Link
              href="/market"
              className="inline-block px-8 py-4 bg-[#f5a623] hover:bg-white hover:text-[#0f2137] text-[#0f2137] font-semibold rounded-2xl transition-all"
            >
              Shop Meats
            </Link>
          </div>
        </div>
      </div>

      {/* BOTTOM TRUST BAR */}
      <div className="bg-white py-8 border-t">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center text-sm">
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl">🔒</span>
            <div>
              <p className="font-semibold">Secure Checkout</p>
              <p className="text-xs text-gray-500">100% secure payments</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl">✅</span>
            <div>
              <p className="font-semibold">Verified Suppliers</p>
              <p className="text-xs text-gray-500">Trusted local suppliers</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl">⭐</span>
            <div>
              <p className="font-semibold">Quality Guaranteed</p>
              <p className="text-xs text-gray-500">Freshness you can trust</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl">🛡️</span>
            <div>
              <p className="font-semibold">Satisfaction Guaranteed</p>
              <p className="text-xs text-gray-500">We stand behind every order</p>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <SiteFooter />
    </>
  );
}