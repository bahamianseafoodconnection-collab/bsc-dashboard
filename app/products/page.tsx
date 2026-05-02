// ============================================================
// BSC MARKETPLACE — PRODUCT IMAGE MANAGER
// File: app/products/page.tsx
// Route: /products
// Upload, update, manage all market product photos
// ============================================================

'use client';

import { useState, useEffect, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';

const supabase = createBrowserClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

const CATEGORIES = [
'All', 'seafood', 'meats', 'groceries', 'essentials', 'beverages', 'produce', 'other'
];

type Product = {
id: string;
name: string;
description: string;
category: string;
price_nassau: number;
price_andros: number;
price_online: number;
price_wholesale: number;
unit: string;
image_url: string;
in_stock: boolean;
stock_lbs: number;
featured: boolean;
created_at: string;
};

const EMPTY: Omit<Product, 'id' | 'created_at'> = {
name: '',
description: '',
category: 'seafood',
price_nassau: 0,
price_andros: 0,
price_online: 0,
price_wholesale: 0,
unit: 'lb',
image_url: '',
in_stock: true,
stock_lbs: 0,
featured: false,
};

function fmtBSD(n: number) {
return `BSD $${Number(n).toFixed(2)}`;
}

export default function ProductsPage() {
const [products, setProducts] = useState<Product[]>([]);
const [loading, setLoading] = useState(true);
const [category, setCategory] = useState('All');
const [search, setSearch] = useState('');
const [modal, setModal] = useState<'add' | 'edit' | null>(null);
const [form, setForm] = useState<Omit<Product, 'id' | 'created_at'>>(EMPTY);
const [editId, setEditId] = useState<string | null>(null);
const [imageFile, setImageFile] = useState<File | null>(null);
const [imagePreview, setImagePreview] = useState<string>('');
const [uploading, setUploading] = useState(false);
const [saving, setSaving] = useState(false);
const [error, setError] = useState('');
const [success, setSuccess] = useState('');
const fileRef = useRef<HTMLInputElement>(null);
const cameraRef = useRef<HTMLInputElement>(null);

useEffect(() => { loadProducts(); }, []);

async function loadProducts() {
setLoading(true);
const { data } = await supabase
.from('products')
.select('*')
.order('created_at', { ascending: false });
setProducts(data || []);
setLoading(false);
}

const filtered = products.filter((p) => {
const matchCat = category === 'All' || p.category === category;
const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
return matchCat && matchSearch;
});

function openAdd() {
setForm(EMPTY);
setEditId(null);
setImageFile(null);
setImagePreview('');
setError('');
setModal('add');
}

function openEdit(p: Product) {
setForm({
name: p.name,
description: p.description || '',
category: p.category || 'seafood',
price_nassau: p.price_nassau || 0,
price_andros: p.price_andros || 0,
price_online: p.price_online || 0,
price_wholesale: p.price_wholesale || 0,
unit: p.unit || 'lb',
image_url: p.image_url || '',
in_stock: p.in_stock ?? true,
stock_lbs: p.stock_lbs || 0,
featured: p.featured || false,
});
setEditId(p.id);
setImageFile(null);
setImagePreview(p.image_url || '');
setError('');
setModal('edit');
}

function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
const file = e.target.files?.[0];
if (!file) return;
setImageFile(file);
const reader = new FileReader();
reader.onload = () => setImagePreview(reader.result as string);
reader.readAsDataURL(file);
e.target.value = '';
}

async function uploadImage(file: File): Promise<string> {
const ext = file.name.split('.').pop() || 'jpg';
const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
const { error } = await supabase.storage
.from('product-images')
.upload(path, file, { upsert: true });
if (error) throw new Error('Image upload failed: ' + error.message);
return `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}

async function saveProduct() {
if (!form.name.trim()) { setError('Product name is required.'); return; }
setSaving(true);
setError('');
try {
let imageUrl = form.image_url;

if (imageFile) {
setUploading(true);
imageUrl = await uploadImage(imageFile);
setUploading(false);
}

const payload = { ...form, image_url: imageUrl, updated_at: new Date().toISOString() };

if (modal === 'edit' && editId) {
const { error } = await supabase.from('products').update(payload).eq('id', editId);
if (error) throw error;
setSuccess('Product updated successfully.');
} else {
const { error } = await supabase.from('products').insert([{ ...payload, created_at: new Date().toISOString() }]);
if (error) throw error;
setSuccess('Product added successfully.');
}

setModal(null);
await loadProducts();
setTimeout(() => setSuccess(''), 3000);
} catch (err: unknown) {
setError(err instanceof Error ? err.message : 'Save failed. Please try again.');
}
setSaving(false);
}

async function toggleStock(id: string, current: boolean) {
await supabase.from('products').update({ in_stock: !current }).eq('id', id);
await loadProducts();
}

async function toggleFeatured(id: string, current: boolean) {
await supabase.from('products').update({ featured: !current }).eq('id', id);
await loadProducts();
}

async function deleteProduct(id: string) {
if (!confirm('Delete this product?')) return;
await supabase.from('products').delete().eq('id', id);
await loadProducts();
}

return (
<div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, sans-serif' }}>

{/* HEADER */}
<div style={{ backgroundColor: '#1a2e5a', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
<Link href="/dashboard" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Dashboard</Link>
<div style={{ color: 'rgba(255,255,255,0.3)' }}>|</div>
<div>
<div style={{ color: '#fff', fontWeight: 900, fontSize: 16 }}>🛒 Product Manager</div>
<div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>Photos · Prices · Stock · BSC Marketplace</div>
</div>
</div>
<button onClick={openAdd} style={{ backgroundColor: '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 900, fontSize: 14, cursor: 'pointer' }}>
+ Add Product
</button>
</div>

{/* SUCCESS TOAST */}
{success && (
<div style={{ backgroundColor: '#e8f5e9', borderLeft: '4px solid #2e7d32', padding: '12px 20px', margin: '16px 20px 0', borderRadius: 8, color: '#2e7d32', fontWeight: 700, fontSize: 14 }}>
✅ {success}
</div>
)}

{/* FILTERS */}
<div style={{ padding: '16px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
<input
value={search}
onChange={(e) => setSearch(e.target.value)}
placeholder="Search products..."
style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', flex: 1, minWidth: 200, backgroundColor: '#fff' }}
/>
<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
{CATEGORIES.map((cat) => (
<button key={cat} onClick={() => setCategory(cat)} style={{ backgroundColor: category === cat ? '#1a2e5a' : '#fff', color: category === cat ? '#f4c842' : '#666', border: '1px solid #e5e7eb', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
{cat}
</button>
))}
</div>
</div>

{/* STATS */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '0 20px 16px' }}>
{[
{ label: 'Total Products', value: products.length, color: '#e8f4fd', text: '#1a2e5a' },
{ label: 'In Stock', value: products.filter(p => p.in_stock).length, color: '#e8f5e9', text: '#2e7d32' },
{ label: 'Out of Stock', value: products.filter(p => !p.in_stock).length, color: '#fde8e8', text: '#dc2626' },
{ label: 'Featured', value: products.filter(p => p.featured).length, color: '#fef9e7', text: '#d97706' },
].map((s) => (
<div key={s.label} style={{ backgroundColor: s.color, borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
<div style={{ color: '#666', fontSize: 10, marginBottom: 4 }}>{s.label}</div>
<div style={{ color: s.text, fontWeight: 900, fontSize: 22 }}>{s.value}</div>
</div>
))}
</div>

{/* PRODUCT GRID */}
<div style={{ padding: '0 20px 40px' }}>
{loading ? (
<div style={{ textAlign: 'center', padding: 48, color: '#999' }}>Loading products...</div>
) : filtered.length === 0 ? (
<div style={{ textAlign: 'center', padding: 48 }}>
<div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
<div style={{ color: '#999', fontSize: 14 }}>No products found. Add your first product.</div>
<button onClick={openAdd} style={{ marginTop: 16, backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
+ Add First Product
</button>
</div>
) : (
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14 }}>
{filtered.map((product) => (
<div key={product.id} style={{ backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: product.featured ? '2px solid #f4c842' : '1px solid #e5e7eb', position: 'relative' }}>

{/* Featured badge */}
{product.featured && (
<div style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#f4c842', color: '#1a2e5a', fontSize: 9, fontWeight: 900, padding: '3px 8px', borderRadius: 20, zIndex: 2 }}>⭐ FEATURED</div>
)}

{/* Stock badge */}
<div style={{ position: 'absolute', top: 8, right: 8, backgroundColor: product.in_stock ? '#e8f5e9' : '#fde8e8', color: product.in_stock ? '#2e7d32' : '#dc2626', fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 20, zIndex: 2 }}>
{product.in_stock ? '● IN STOCK' : '● OUT'}
</div>

{/* Product image */}
<div style={{ height: 140, backgroundColor: '#f8f9fa', overflow: 'hidden', position: 'relative' }}>
{product.image_url ? (
<img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
) : (
<div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
<span style={{ fontSize: 32 }}>📷</span>
<span style={{ color: '#999', fontSize: 11 }}>No photo</span>
</div>
)}
{/* Photo overlay button */}
<button
onClick={() => openEdit(product)}
style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', opacity: 0, transition: 'opacity 0.2s' }}
onMouseEnter={(e) => (e.currentTarget.style.opacity = '1') && (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.45)')}
onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0)'; }}
>
<span style={{ color: '#fff', fontSize: 12, fontWeight: 700, backgroundColor: 'rgba(0,0,0,0.5)', padding: '6px 12px', borderRadius: 8 }}>📷 Update Photo</span>
</button>
</div>

{/* Product info */}
<div style={{ padding: '10px 12px' }}>
<div style={{ fontWeight: 800, fontSize: 13, color: '#1a2e5a', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</div>
<div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'capitalize', marginBottom: 6 }}>{product.category}</div>
<div style={{ fontSize: 12, color: '#2e7d32', fontWeight: 700, marginBottom: 8 }}>{fmtBSD(product.price_online)}/{product.unit}</div>

{/* Action buttons */}
<div style={{ display: 'flex', gap: 6 }}>
<button onClick={() => openEdit(product)} style={{ flex: 1, backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
Edit
</button>
<button onClick={() => toggleStock(product.id, product.in_stock)} style={{ flex: 1, backgroundColor: product.in_stock ? '#fde8e8' : '#e8f5e9', color: product.in_stock ? '#dc2626' : '#2e7d32', border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
{product.in_stock ? 'Stock Off' : 'Stock On'}
</button>
</div>
</div>
</div>
))}
</div>
)}
</div>

{/* ── MODAL ── */}
{modal && (
<div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '20px 16px' }}>
<div style={{ backgroundColor: '#fff', borderRadius: 18, width: '100%', maxWidth: 520, padding: 24, position: 'relative' }}>

{/* Modal header */}
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
<h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 17, margin: 0 }}>
{modal === 'add' ? '+ Add New Product' : '✏️ Edit Product'}
</h2>
<button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
</div>

{error && <div style={{ backgroundColor: '#fde8e8', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{error}</div>}

{/* IMAGE UPLOAD */}
<div style={{ marginBottom: 18 }}>
<div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: 13, marginBottom: 10 }}>📷 Product Photo</div>
<input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleImageFile} style={{ display: 'none' }} />
<input ref={fileRef} type="file" accept="image/*" onChange={handleImageFile} style={{ display: 'none' }} />

{imagePreview ? (
<div style={{ position: 'relative', marginBottom: 10 }}>
<img src={imagePreview} alt="Preview" style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 12, border: '2px solid #1a2e5a' }} />
<button onClick={() => { setImagePreview(''); setImageFile(null); setForm(f => ({ ...f, image_url: '' })); }} style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
Remove
</button>
</div>
) : (
<div style={{ border: '2px dashed #e5e7eb', borderRadius: 12, padding: 24, textAlign: 'center', backgroundColor: '#f8f9fa', marginBottom: 10 }}>
<div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
<div style={{ color: '#999', fontSize: 13, marginBottom: 12 }}>No photo yet</div>
</div>
)}

<div style={{ display: 'flex', gap: 10 }}>
<button onClick={() => cameraRef.current?.click()} style={{ flex: 1, backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
📸 Take Photo
</button>
<button onClick={() => fileRef.current?.click()} style={{ flex: 1, backgroundColor: '#f0f4ff', color: '#1a2e5a', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
📁 Upload File
</button>
</div>
</div>

{/* PRODUCT NAME */}
<div style={{ marginBottom: 14 }}>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Product Name *</label>
<input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Fresh Grouper" style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
</div>

{/* DESCRIPTION */}
<div style={{ marginBottom: 14 }}>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Description</label>
<textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short product description..." rows={2} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
</div>

{/* CATEGORY + UNIT */}
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
<div>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Category</label>
<select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', backgroundColor: '#fff' }}>
{CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
</select>
</div>
<div>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Unit</label>
<select value={form.unit} onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', backgroundColor: '#fff' }}>
{['lb', 'kg', 'each', 'pack', 'box', 'dozen', 'gallon', 'litre'].map(u => <option key={u} value={u}>{u}</option>)}
</select>
</div>
</div>

{/* PRICES */}
<div style={{ marginBottom: 14 }}>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 8 }}>Prices (BSD $)</label>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
{[
{ label: '🟡 Nassau (38%)', key: 'price_nassau' },
{ label: '🟣 Andros (43%)', key: 'price_andros' },
{ label: '🛒 Online (25%)', key: 'price_online' },
{ label: '📦 Wholesale', key: 'price_wholesale' },
].map(({ label, key }) => (
<div key={key}>
<div style={{ color: '#666', fontSize: 10, marginBottom: 4 }}>{label}</div>
<input
type="number"
step="0.01"
value={form[key as keyof typeof form] as number}
onChange={(e) => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
/>
</div>
))}
</div>
</div>

{/* STOCK */}
<div style={{ marginBottom: 14 }}>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Stock (lbs)</label>
<input
type="number"
value={form.stock_lbs}
onChange={(e) => setForm(f => ({ ...f, stock_lbs: parseFloat(e.target.value) || 0 }))}
style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
/>
</div>

{/* TOGGLES */}
<div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
<button
onClick={() => setForm(f => ({ ...f, in_stock: !f.in_stock }))}
style={{ flex: 1, backgroundColor: form.in_stock ? '#e8f5e9' : '#fde8e8', color: form.in_stock ? '#2e7d32' : '#dc2626', border: 'none', borderRadius: 10, padding: '11px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
>
{form.in_stock ? '✅ In Stock' : '❌ Out of Stock'}
</button>
<button
onClick={() => setForm(f => ({ ...f, featured: !f.featured }))}
style={{ flex: 1, backgroundColor: form.featured ? '#fef9e7' : '#f8f9fa', color: form.featured ? '#d97706' : '#94a3b8', border: 'none', borderRadius: 10, padding: '11px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
>
{form.featured ? '⭐ Featured' : '☆ Not Featured'}
</button>
</div>

{/* SAVE BUTTON */}
<button
onClick={saveProduct}
disabled={saving}
style={{ width: '100%', backgroundColor: saving ? '#94a3b8' : '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 12, padding: '15px', fontWeight: 900, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer', marginBottom: 10 }}
>
{uploading ? '⬆️ Uploading Photo...' : saving ? 'Saving...' : modal === 'add' ? '+ Add Product' : '✅ Save Changes'}
</button>

{/* DELETE */}
{modal === 'edit' && editId && (
<button onClick={() => { deleteProduct(editId); setModal(null); }} style={{ width: '100%', backgroundColor: '#fde8e8', color: '#dc2626', border: 'none', borderRadius: 12, padding: '12px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
🗑️ Delete Product
</button>
)}
</div>
</div>
)}
</div>
);
}
