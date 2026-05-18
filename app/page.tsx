import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#060d1f', fontFamily: "'DM Sans', sans-serif" }}>

      {/* Header */}
      <header className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full font-black text-xl"
            style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
            🇧🇸
          </div>
          <div>
            <div className="font-extrabold text-sm tracking-wide" style={{ color: '#f5c518' }}>
              BSC Marketplace
            </div>
            <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Nassau · Bahamas
            </div>
          </div>
        </div>
        <Link href="/market"
          className="px-4 py-2 rounded-xl text-xs font-bold"
          style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
          Shop Now
        </Link>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="text-6xl mb-6">🇧🇸</div>
        <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-4"
          style={{ color: '#ffffff' }}>
          Fresh. Local.<br />
          <span style={{ color: '#f5c518' }}>Bahamian.</span>
        </h1>
        <p className="text-base mb-10 max-w-sm leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.55)' }}>
          Premium seafood, meats and groceries delivered across Nassau and Andros.
        </p>

        {/* Three main CTAs — BSC Direct, Fresh Catch, Farm Fresh */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-3xl">
          <Link href="/market"
            className="flex flex-col items-center gap-2 rounded-2xl py-6 px-4 font-bold transition active:scale-95"
            style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
            <span className="text-4xl">🛒</span>
            <div className="text-center">
              <div className="font-black text-lg">BSC Direct</div>
              <div className="text-xs font-semibold opacity-70">Wholesale brands · Catalog · Delivery</div>
            </div>
          </Link>

          <Link href="/shop/fresh-catch"
            className="flex flex-col items-center gap-2 rounded-2xl py-6 px-4 font-bold border transition active:scale-95"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(245,197,24,0.35)', color: '#fff' }}>
            <span className="text-4xl">🐟</span>
            <div className="text-center">
              <div className="font-black text-lg" style={{ color: '#f5c518' }}>Fresh Catch</div>
              <div className="text-xs font-semibold opacity-70">Direct from Bahamian fishermen</div>
            </div>
          </Link>

          <Link href="/shop/farm-fresh"
            className="flex flex-col items-center gap-2 rounded-2xl py-6 px-4 font-bold border transition active:scale-95"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(245,197,24,0.35)', color: '#fff' }}>
            <span className="text-4xl">🌱</span>
            <div className="text-center">
              <div className="font-black text-lg" style={{ color: '#f5c518' }}>Farm Fresh</div>
              <div className="text-xs font-semibold opacity-70">Direct from Bahamian farmers</div>
            </div>
          </Link>
        </div>

        {/* Secondary CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-3xl mt-3">
          <Link href="/utilities"
            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 px-4 font-bold border transition active:scale-95"
            style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}>
            <span className="text-lg">⚡</span><span className="text-sm">Pay Bills</span>
          </Link>
          <Link href="/vendor/signup"
            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 px-4 font-bold border transition active:scale-95"
            style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}>
            <span className="text-lg">🤝</span><span className="text-sm">Sell on BSC</span>
          </Link>
        </div>
      </section>

      {/* Category quick links */}
      <section className="px-5 pb-10">
        <p className="text-xs font-bold uppercase tracking-widest mb-4 text-center"
          style={{ color: 'rgba(255,255,255,0.35)' }}>
          Browse by category
        </p>
        <div className="grid grid-cols-4 gap-3">
          {[
            { emoji: '🦐', label: 'Seafood',    href: '/market?category=Seafood' },
            { emoji: '🥩', label: 'Meat',       href: '/market?category=Meat' },
            { emoji: '🥦', label: 'Produce',    href: '/market?category=Produce' },
            { emoji: '🥤', label: 'Beverages',  href: '/market?category=Beverages' },
          ].map(cat => (
            <Link key={cat.label} href={cat.href}
              className="flex flex-col items-center gap-2 rounded-2xl py-4 transition active:scale-95"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-2xl">{cat.emoji}</span>
              <span className="text-[11px] font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {cat.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-t px-5 py-6" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex justify-around">
          {[
            { icon: '🇧🇸', label: 'Bahamian-owned' },
            { icon: '❄️',  label: 'Cold-chain fresh' },
            { icon: '🚚',  label: 'Fast delivery' },
            { icon: '💬',  label: 'WhatsApp support' },
          ].map(item => (
            <div key={item.label} className="flex flex-col items-center gap-1 text-center">
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-5 py-4 text-center border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
          © 2026 Bahamian Seafood Connection · Nassau, Bahamas
        </p>
      </footer>
    </div>
  );
}
