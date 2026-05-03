// components/SiteFooter.tsx
// POLISHED — Matches mockup footer + master card dark navy theme

export default function SiteFooter() {
return (
<footer className="bg-[#1a2e4a] text-white py-16">
<div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-y-12">
<div>
<div className="flex items-center gap-3 mb-6">
<div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-[#0f2137] text-3xl">🐟</div>
<div className="text-3xl font-bold">BSC</div>
</div>
<p className="text-sm opacity-75 max-w-xs">
Bahamian Seafood Connection — Fresh. Local. Reliable.<br />
Proudly Bahamian Owned &amp; Operated.
</p>
</div>

<div>
<h4 className="font-semibold mb-4 text-[#f5a623]">Company</h4>
<ul className="space-y-3 text-sm">
<li><Link href="/about" className="hover:text-[#f5a623]">About Us</Link></li>
<li><Link href="/founder-ai" className="hover:text-[#f5a623]">Our Story</Link></li>
<li><Link href="/market" className="hover:text-[#f5a623]">Marketplace</Link></li>
</ul>
</div>

<div>
<h4 className="font-semibold mb-4 text-[#f5a623]">Quick Links</h4>
<ul className="space-y-3 text-sm">
<li><Link href="/local-wholesale" className="hover:text-[#f5a623]">Local Wholesale</Link></li>
<li><Link href="/us-shopping" className="hover:text-[#f5a623]">US Shopping</Link></li>
<li><Link href="/utilities" className="hover:text-[#f5a623]">Pay Bills</Link></li>
<li><Link href="/pos" className="hover:text-[#f5a623]">POS Systems</Link></li>
</ul>
</div>

<div>
<h4 className="font-semibold mb-4 text-[#f5a623]">Support</h4>
<ul className="space-y-3 text-sm">
<li><Link href="/help" className="hover:text-[#f5a623]">Help Center</Link></li>
<li><Link href="/orders" className="hover:text-[#f5a623]">Track Order</Link></li>
<li><Link href="/contact" className="hover:text-[#f5a623]">Contact Us</Link></li>
<li className="text-[#f5a623] font-medium">+1 (242) 558-4495</li>
</ul>
</div>
</div>

<div className="border-t border-white/10 mt-16 pt-8 text-center text-xs opacity-50">
© 2026 BSC Marketplace. All Rights Reserved. • Proudly Bahamian 🇧🇸<br />
Dedrick Tamico Storr Snr &amp; Jaquel Rolle-Storr &amp; Family
</div>
</footer>
);
}
