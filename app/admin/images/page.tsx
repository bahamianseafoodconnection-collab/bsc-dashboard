'use client';

import { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

let _supabase: ReturnType<typeof createBrowserClient> | null = null;
function getSupabase() {
if (!_supabase) {
_supabase = createBrowserClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
}
return _supabase;
}

interface Product {
id: string;
sku: string;
name: string;
category: string;
image_url: string | null;
}

export default function AdminImagesPage() {
const supabase = getSupabase();
const [products, setProducts] = useState<Product[]>([]);
const [loading, setLoading] = useState(true);
const [search, setSearch] = useState('');
const [uploading, setUploading] = useState<string | null>(null);
const [saved, setSaved] = useState<string | null>(null);
const [filter, setFilter] = useState<'all' | 'missing' | 'done'>('all');
const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

async function loadProducts() {
setLoading(true);
const { data } = await supabase
.from('products')
.select('id, sku, name, category, image_url')
.eq('sell_online', true)
.eq('status', 'active')
.order('name');
if (data) setProducts(data);
setLoading(false);
}

useEffect(() => { loadProducts(); }, []);

async function handleUpload(productId: string, sku: string, file: File) {
setUploading(productId);
try {
const ext = file.name.split('.').pop() ?? 'jpg';
const path = `products/${sku}-${Date.now()}.${ext}`;

const { error: uploadErr } = await supabase.storage
.from('site-images')
.upload(path, file, { upsert: true, contentType: file.type });

if (uploadErr) throw uploadErr;

const { data: urlData } = supabase.storage
.from('site-images')
.getPublicUrl(path);

const publicUrl = urlData.publicUrl;

const { error: updateErr } = await supabase
.from('products')
.update({ image_url: publicUrl })
.eq('id', productId);

if (updateErr) throw updateErr;

setProducts(prev => prev.map(p =>
p.id === productId ? { ...p, image_url: publicUrl } : p
));
setSaved(productId);
setTimeout(() => setSaved(null), 3000);
} catch (err: any) {
alert('Upload failed: ' + err.message);
} finally {
setUploading(null);
}
}

const filtered = products.filter(p => {
const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
const matchFilter = filter === 'all' || (filter === 'missing' && !p.image_url) || (filter === 'done' && !!p.image_url);
return matchSearch && matchFilter;
});

const doneCount = products.filter(p => p.image_url).length;
const missingCount = products.filter(p => !p.image_url).length;

return (
<div className="min-h-screen bg-gray-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>

{/* Header */}
<header className="sticky top-0 z-40 bg-gray-900 border-b border-gray-800 px-4 py-3">
<h1 className="font-bold text-lg" style={{ color: '#f5c518', fontFamily: "'Playfair Display', serif" }}>
Product Images
</h1>
<p className="text-xs text-gray-400">{doneCount} done · {missingCount} missing · {products.length} total</p>

{/* Progress bar */}
<div className="mt-2 h-1.5 w-full rounded-full bg-gray-800">
<div className="h-1.5 rounded-full transition-all" style={{ width: `${(doneCount / Math.max(products.length, 1)) * 100}%`, backgroundColor: '#f5c518' }} />
</div>
</header>

<div className="p-4 space-y-3">

{/* Search */}
<input
type="search"
placeholder="Search products…"
value={search}
onChange={e => setSearch(e.target.value)}
className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm text-white border border-gray-700 outline-none focus:border-yellow-400 placeholder:text-gray-500"
/>

{/* Filter tabs */}
<div className="flex gap-2">
{(['all', 'missing', 'done'] as const).map(f => (
<button key={f} onClick={() => setFilter(f)}
className="flex-1 rounded-xl py-2 text-xs font-bold capitalize"
style={filter === f
? { backgroundColor: '#f5c518', color: '#060d1f' }
: { backgroundColor: '#1f2937', color: '#9ca3af' }}>
{f === 'all' ? `All (${products.length})` : f === 'missing' ? `Missing (${missingCount})` : `Done (${doneCount})`}
</button>
))}
</div>

{/* Product list */}
{loading ? (
<div className="text-center text-gray-400 text-sm py-12 animate-pulse">Loading products…</div>
) : (
<div className="space-y-3">
{filtered.map(product => (
<div key={product.id}
className="flex items-center gap-3 rounded-xl bg-gray-900 border border-gray-800 p-3">

{/* Image preview / placeholder */}
<div className="relative shrink-0 h-16 w-16 rounded-xl overflow-hidden bg-gray-800">
{product.image_url ? (
<img src={product.image_url} alt={product.name}
className="h-full w-full object-cover" />
) : (
<div className="flex h-full w-full items-center justify-center text-2xl">📦</div>
)}
{saved === product.id && (
<div className="absolute inset-0 flex items-center justify-center bg-green-600/80 text-white text-lg font-bold rounded-xl">✓</div>
)}
</div>

{/* Product info */}
<div className="flex-1 min-w-0">
<p className="text-sm font-bold text-white truncate">{product.name}</p>
<p className="text-xs text-gray-400">{product.sku}</p>
{product.image_url ? (
<p className="text-[10px] text-green-400 mt-0.5">✓ Image uploaded</p>
) : (
<p className="text-[10px] text-yellow-400 mt-0.5">⚠ No image</p>
)}
</div>

{/* Upload button */}
<div className="shrink-0">
<input
ref={el => { fileRefs.current[product.id] = el; }}
type="file"
accept="image/*"
capture="environment"
className="hidden"
onChange={e => {
const file = e.target.files?.[0];
if (file) handleUpload(product.id, product.sku, file);
}}
/>
<button
onClick={() => fileRefs.current[product.id]?.click()}
disabled={uploading === product.id}
className="rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50"
style={{ backgroundColor: product.image_url ? '#1f2937' : '#f5c518', color: product.image_url ? '#9ca3af' : '#060d1f' }}>
{uploading === product.id ? '⏳' : product.image_url ? '↺ Replace' : '📷 Upload'}
</button>
</div>
</div>
))}

{filtered.length === 0 && (
<div className="text-center text-gray-500 text-sm py-12">No products found</div>
)}
</div>
)}
</div>
</div>
);
}
