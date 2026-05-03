// components/HeroSection.tsx
// FIXED — Complete file with all required imports
// This resolves the Vercel build error: "JSX element class does not support attributes because it does not have a 'props' property."

import Image from 'next/image';
import Link from 'next/link';

export default function HeroSection() {
  return (
    <section className="relative h-screen flex items-center bg-black overflow-hidden">
      {/* Background image — seafood & meats (matches your mockup) */}
      <Image
        src="/site-images/hero.jpg" // From Supabase storage: site-images/hero.jpg
        alt="BSC Marketplace Hero"
        fill
        className="object-cover brightness-75"
        priority
      />
      
      {/* Dark gradient overlay for perfect text readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-transparent" />
      
      <div className="relative max-w-7xl mx-auto px-6 z-10">
        <div className="max-w-2xl">
          <h1 className="text-6xl md:text-7xl font-bold text-white tracking-tighter leading-none mb-4">
            Welcome to<br />
            <span className="text-[#f5a623]">BSC Marketplace</span>
          </h1>
          
          <p className="text-3xl text-white font-medium mb-2">
            Seafood. Meats. Essentials. Services.
          </p>
          
          <p className="text-xl text-white/90 mb-10">
            Everything you need. All in one place.
          </p>
          
          {/* CTA Buttons — exact mockup style */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/login?mode=register"
              className="px-10 py-6 bg-[#f5a623] hover:bg-white text-[#0f2137] font-semibold text-xl rounded-3xl text-center transition-all shadow-xl hover:shadow-2xl flex-1"
            >
              Create Account
            </Link>
            
            <Link
              href="/login"
              className="px-10 py-6 border-2 border-white text-white hover:bg-white hover:text-[#0f2137] font-semibold text-xl rounded-3xl text-center transition-all flex-1"
            >
              Sign In
            </Link>
          </div>
          
          {/* Trust line */}
          <div className="mt-12 flex items-center gap-8 text-white/80 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🚚</span>
              <span>Nassau &amp; Family Islands</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🇧🇸</span>
              <span>Proudly Bahamian</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-10 left-1/2 flex flex-col items-center text-white/60">
        <div className="text-xs tracking-[2px] mb-2">SCROLL FOR MORE</div>
        <div className="w-6 h-10 border border-white/60 rounded-3xl flex items-center justify-center">
          <div className="w-1 h-3 bg-white/60 rounded-full animate-bounce" />
        </div>
      </div>
    </section>
  );
}