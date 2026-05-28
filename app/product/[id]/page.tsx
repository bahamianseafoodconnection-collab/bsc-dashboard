'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Product {
id: string;
sku: string;
name: string;
description: string;
category: string;
image_url: string;
sell_online: boolean;
status: string;
}

interface Pricing {
manual_unit_price: number;
channel: string;
}

const TRUST_BADGES: Record<string, { icon: string; label: string; sub: string }[]> = {
fresh_seafood: [
{ icon: '❄️', label: 'KEEP FROZEN', sub: 'Flash frozen for freshness' },
{ icon: '🏆', label: 'PREMIUM QUALITY', sub: 'Carefully selected' },
{ icon: '🎣', label: 'WILD CAUGHT', sub: 'Sustainably sourced' },
{ icon: '✅', label: 'SAFE & INSPECTED', sub: 'USDA inspected for your peace of mind' },
],
frozen_seafood: [
{ icon: '❄️', label: 'KEEP FROZEN', sub: 'Flash frozen for freshness' },
{ icon: '🏆', label: 'PREMIUM QUALITY', sub: 'Carefully selected' },
{ icon: '🎣', label: 'WILD CAUGHT', sub: 'Sustainably sourced' },
{ icon: '✅', label: 'SAFE & INSPECTED', sub: 'USDA inspected for your peace of mind' },
],
processed_seafood: [
{ icon: '❄️', label: 'KEEP FROZEN', sub: 'Flash frozen for freshness' },
{ icon: '🏆', label: 'PREMIUM QUALITY', sub: 'Carefully selected' },
{ icon: '🐚', label: 'BAHAMIAN CAUGHT', sub: 'Fresh from local waters' },
{ icon: '✅', label: 'SAFE & INSPECTED', sub: 'Processed at Spiny Tail Nassau' },
],
meat: [
{ icon: '❄️', label: 'KEEP FROZEN', sub: 'Flash frozen for freshness' },
{ icon: '🏆', label: 'PREMIUM QUALITY', sub: 'Hand selected for the best quality' },
{ icon: '🐄', label: 'USDA CHOICE BEEF', sub: 'Highly marbled for flavor' },
{ icon: '✅', label: 'NO ADDED HORMONES', sub: 'No artificial ingredients' },
],
default: [
{ icon: '❄️', label: 'KEEP FROZEN', sub: 'Flash frozen for freshness' },
{ icon: '🏆', label: 'PREMIUM QUALITY', sub: 'Carefully selected' },
{ icon: '🇧🇸', label: 'BAHAMIAN-OWNED', sub: 'Family-run from Nassau' },
{ icon: '✅', label: 'SAFE & INSPECTED', sub: 'Quality guaranteed' },
],
};

const CATEGORY_LABEL: Record<string, string> = {
fresh_seafood: 'SEAFOOD',
frozen_seafood: 'SEAFOOD',
processed_seafood: 'SEAFOOD',
meat: 'BEEF',
poultry: 'POULTRY',
produce: 'PRODUCE',
beverage: 'BEVERAGE',
grocery: 'GROCERY',
other: 'OTHER',
};

export default function ProductPage() {
const { id } = useParams() as { id: string };
const router = useRouter();

const [product, setProduct] = useState<Product | null>(null);
const [relatedPricing, setRelatedPricing] = useState<{ sku: string; name: string; price: number; id: string; unit_of_measure?: string | null; pack_size?: string | null }[]>([]);
const [selectedId, setSelectedId] = useState<string>(id);
const [price, setPrice] = useState<number>(0);
const [qty, setQty] = useState(1);
const [loading, setLoading] = useState(true);
const [addedToCart, setAddedToCart] = useState(false);
const [mainImage, setMainImage] = useState('');

useEffect(() => {
(async () => {
setLoading(true);

// Fetch product
const { data: p } = await supabase
.from('products')
.select('id, sku, name, description, category, image_url, sell_online, status, unit_of_measure')
.eq('id', id)
.single();

if (!p) { setLoading(false); return; }
setProduct(p);
setMainImage(p.image_url || '');

// Fetch online price
const { data: pricing } = await supabase
.from('product_pricing')
.select('manual_unit_price')
.eq('product_id', id)
.eq('channel', 'online_market')
.eq('is_current', true)
.single();

if (pricing) setPrice(pricing.manual_unit_price);

// Find related size variants — same name prefix, different SKUs
const baseName = p.name.replace(/\s+\d+\s*(oz|lb|lbs|g|kg).*$/i, '').trim();
if (baseName.length > 3) {
const { data: related } = await supabase
.from('products')
.select('id, sku, name, category, unit_of_measure, pack_size')
.ilike('name', `${baseName}%`)
.eq('sell_online', true)
.eq('status', 'active')
.neq('id', id)
.limit(5);

if (related && related.length > 0) {
const ids = related.map(r => r.id);
const { data: rPricing } = await supabase
.from('product_pricing')
.select('product_id, manual_unit_price')
.in('product_id', ids)
.eq('channel', 'online_market')
.eq('is_current', true);

const pMap = new Map((rPricing || []).map((rp: any) => [rp.product_id, rp.manual_unit_price]));

setRelatedPricing([
{ id, sku: p.sku, name: p.name, price: pricing?.manual_unit_price ?? 0, unit_of_measure: (p as any).unit_of_measure, pack_size: (p as any).pack_size },
...related.map((r: any) => ({
id: r.id,
sku: r.sku,
name: r.name,
price: pMap.get(r.id) ?? 0,
unit_of_measure: r.unit_of_measure,
pack_size: r.pack_size,
})),
]);
} else {
setRelatedPricing([{ id, sku: p.sku, name: p.name, price: pricing?.manual_unit_price ?? 0, unit_of_measure: (p as any).unit_of_measure, pack_size: (p as any).pack_size }]);
}
}

setLoading(false);
})();
}, [id]);

function addToCart() {
if (!product) return;
try {
const stored = window.localStorage.getItem('bsc_cart');
const cart = stored ? JSON.parse(stored) : [];
const existing = cart.find((i: any) => i.id === selectedId);
if (existing) {
existing.qty += qty;
} else {
cart.push({
id: selectedId,
source: 'market',
sku: product.sku,
name: product.name,
price,
unit: ((product as any).unit_of_measure === 'lb' ? 'lb' : (product as any).unit_of_measure === 'case' ? 'case' : 'each'),
min_qty: 1,
image_url: product.image_url,
in_stock: true,
featured: false,
qty,
});
}
window.localStorage.setItem('bsc_cart', JSON.stringify(cart));
setAddedToCart(true);
setTimeout(() => setAddedToCart(false), 2500);
} catch {}
}

const badges = product ? (TRUST_BADGES[product.category] ?? TRUST_BADGES.default) : TRUST_BADGES.default;
const categoryLabel = product ? (CATEGORY_LABEL[product.category] ?? 'PRODUCT') : '';

if (loading) {
return (
<div className="min-h-screen bg-white flex items-center justify-center">
<div className="text-center">
<div className="text-4xl mb-3 animate-pulse">🐟</div>
<p className="text-slate-500 text-sm">Loading product…</p>
</div>
</div>
);
}

if (!product) {
return (
<div className="min-h-screen bg-white flex items-center justify-center">
<div className="text-center">
<div className="text-4xl mb-3">😕</div>
<p className="text-slate-700 font-bold">Product not found</p>
<button onClick={() => router.push('/market')}
className="mt-4 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-gold">
Back to Market
</button>
</div>
</div>
);
}

return (
<div className="min-h-screen bg-white font-sans">

{/* Back nav */}
<div className="border-b border-slate-100 px-4 py-3">
<button onClick={() => router.push('/market')}
className="flex items-center gap-1.5 text-sm font-semibold text-navy hover:underline">
← Back to Market
</button>
</div>

<div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
<div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

{/* ── Left: Image gallery ── */}
<div>
{/* Main image */}
<div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
{mainImage ? (
<img src={mainImage} alt={product.name}
className="w-full object-cover aspect-square" />
) : (
<div className="flex aspect-square w-full items-center justify-center bg-slate-100 text-8xl">
🐟
</div>
)}
<button className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md text-slate-600">
🔍
</button>
</div>

{/* Thumbnail strip — show if multiple variants have images */}
{relatedPricing.length > 1 && (
<div className="mt-3 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
{[product.image_url].filter(Boolean).map((img, i) => (
<button key={i}
onClick={() => setMainImage(img)}
className={`shrink-0 h-16 w-16 overflow-hidden rounded-lg border-2 ${
mainImage === img ? 'border-navy' : 'border-slate-200'
}`}>
<img src={img} alt="" className="h-full w-full object-cover" />
</button>
))}
</div>
)}
</div>

{/* ── Right: Product info ── */}
<div className="flex flex-col gap-5">

{/* Category + name + rating */}
<div>
<p className="text-sm font-bold tracking-widest text-blue-600 mb-1">
{categoryLabel}
</p>
<h1 className="text-3xl font-extrabold text-slate-900 leading-tight">
{product.name}
</h1>
<div className="mt-2 flex items-center gap-2">
<div className="flex text-yellow-400 text-lg">★★★★★</div>
<span className="text-sm text-slate-500">(In stock)</span>
</div>
</div>

{/* Description */}
{product.description && (
<p className="text-slate-600 text-sm leading-relaxed border-t border-slate-100 pt-4">
{product.description}
</p>
)}

{/* Size selector — variant cards */}
{relatedPricing.length > 0 && (
<div>
<p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">SIZE</p>
<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
{relatedPricing.map(variant => {
const active = selectedId === variant.id;
// Human size label: size from name (e.g. "4oz"), else pack size, else
// the unit ("Per lb" / "Each") — never the internal SKU.
const sizeMatch = variant.name.match(/(\d+\s*(?:oz|lb|lbs|g|kg))/i);
const isLb = variant.unit_of_measure === 'lb';
const sizeLabel = sizeMatch ? sizeMatch[1]
  : variant.pack_size ? variant.pack_size
  : isLb ? 'Per pound'
  : variant.unit_of_measure === 'case' ? 'Per case'
  : 'Each';
const unitSuffix = isLb ? '/ lb' : variant.unit_of_measure === 'case' ? '/ case' : 'each';
return (
<button key={variant.id}
onClick={() => { setSelectedId(variant.id); setPrice(variant.price); }}
className={`rounded-xl border-2 p-3 text-left transition ${
active
? 'border-navy bg-white shadow-md'
: 'border-slate-200 bg-white hover:border-slate-400'
}`}>
<div className={`text-base font-extrabold ${active ? 'text-navy' : 'text-slate-700'}`}>
{sizeLabel}
</div>
{isLb && (
<div className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-700">⚖ per pound</div>
)}
<div className={`text-sm font-bold ${active ? 'text-navy' : 'text-slate-600'}`}>
BSD ${variant.price.toFixed(2)} <span className={isLb ? 'text-amber-700' : 'text-slate-400'}>{unitSuffix}</span>
</div>
</button>
);
})}
</div>
</div>
)}

{/* Price (if no variants) */}
{relatedPricing.length <= 1 && price > 0 && (
<div>
<p className="text-3xl font-extrabold text-navy">
BSD ${price.toFixed(2)}
{(product as any).unit_of_measure === 'lb'
? <span className="ml-1 text-lg font-extrabold text-amber-700">/ lb</span>
: (product as any).unit_of_measure === 'case'
? <span className="ml-1 text-lg font-semibold text-slate-400">/ case</span>
: null}
</p>
{(product as any).unit_of_measure === 'lb' && (
<p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-amber-800">
⚖ Priced per pound — final price by weight
</p>
)}
</div>
)}

{/* Quantity */}
<div>
<p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">QUANTITY</p>
<div className="flex items-center gap-4">
<div className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2">
<button onClick={() => setQty(q => Math.max(1, q - 1))}
className="w-6 h-6 flex items-center justify-center text-navy font-bold text-lg rounded hover:bg-slate-100">
−
</button>
<span className="w-8 text-center font-bold text-navy">{qty}</span>
<button onClick={() => setQty(q => q + 1)}
className="w-6 h-6 flex items-center justify-center text-navy font-bold text-lg rounded hover:bg-slate-100">
+
</button>
</div>
<span className="text-sm font-semibold text-emerald-600">In stock</span>
</div>
</div>

{/* Add to cart */}
<button onClick={addToCart}
className="flex w-full items-center justify-center gap-3 rounded-xl py-4 text-base font-extrabold transition"
style={addedToCart
? { backgroundColor: '#16a34a', color: 'white' }
: { backgroundColor: '#0f172a', color: 'white' }}>
{addedToCart ? '✓ Added to Cart!' : `ADD TO CART 🛒`}
</button>

{/* Delivery note */}
<div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
<span className="text-xl">🚚</span>
<div>
<div className="text-xs font-bold text-blue-600 uppercase tracking-wide">FAST & RELIABLE DELIVERY</div>
<div className="text-xs text-slate-500">Refrigerated packaging · On-time guarantee</div>
</div>
</div>
</div>
</div>

{/* ── Trust badges ── */}
<div className="mt-10 grid grid-cols-2 gap-4 border-t border-slate-100 pt-8 sm:grid-cols-4">
{badges.map(b => (
<div key={b.label} className="flex flex-col items-center gap-2 text-center">
<div className="text-3xl">{b.icon}</div>
<div>
<div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">{b.label}</div>
<div className="text-[11px] text-slate-500 mt-0.5">{b.sub}</div>
</div>
</div>
))}
</div>

{/* ── Delivery footer ── */}
<div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4">
<span className="text-2xl">🚚</span>
<div>
<div className="text-sm font-bold text-slate-800">Fast & Reliable Delivery</div>
<div className="text-xs text-slate-500">Refrigerated packaging · On-time guarantee · Nassau & Andros</div>
</div>
</div>
</div>
</div>
);
}
