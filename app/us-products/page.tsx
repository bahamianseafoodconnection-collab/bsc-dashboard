'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

const STORES = [
{ key: 'sams-club', name: "Sam's Club", color: '#0067A0', logo: '🏪' },
{ key: 'bjs', name: "BJ's Wholesale", color: '#CC0000', logo: '🏬' },
{ key: 'costco', name: 'Costco', color: '#005DAA', logo: '🏢' },
{ key: 'walmart', name: 'Walmart', color: '#0071CE', logo: '🛒' },
{ key: 'steakhouse', name: 'FL Steakhouse', color: '#8B1A1A', logo: '🥩' },
];

const DUTY_RATES: Record<string, number> = {
'food-general': 0.45,
'meats': 0.30,
'seafood': 0.35,
'electronics': 0.45,
'clothing': 0.35,
'household': 0.45,
'beverages': 0.75,
'other': 0.45,
};

type Product = {
id: string;
store: string;
name: string;
description: string;
category: string;
original_cost_usd: number;
weight_lbs: number;
shipping_per_lb: number;
customs_duty_pct: number;
bsc_markup_pct: number;
vat_pct: number;
final_price_bsd: number;
image_url: string;
in_stock: boolean;
featured: boolean;
};

type FormData = Omit<Product, 'id'>;

const EMPTY: FormData = {
store: 'sams-club',
name: '',
description: '',
category: 'food-general',
original_cost_usd: 0,
weight_lbs: 1,
shipping_per_lb: 0.60,
customs_duty_pct: 0.45,
bsc_markup_pct: 0.12,
vat_pct: 0.10,
final_price_bsd: 0,
image_url: '',
in_stock: true,
featured: false,
};

function calcFinalPrice(form: FormData): number {
const shipping = form.weight_lbs * form.shipping_per_lb;
const subtotal = form.original_cost_usd + shipping;
const withDuty = subtotal * (1 + form.customs_duty_pct);
const withMarkup = withDuty * (1 + form.bsc_markup_pct);
const withVat = withMarkup * (1 + form.vat_pct);
return Math.round(withVat * 100) / 100;
}

export default function USProductsAdminPage() {
const [activeStore, setActiveStore] = useState('sams-club');
const [products, setProducts] = useState<Product[]>([]);
const [loading, setLoading] = useState(true);
const [modal, setModal] = useState<'add' | 'edit' | null>(null);
const [form, setForm] = useState<FormData>({ ...EMPTY, store: 'sams-club' });
const [editId, setEditId] = useState<string | null>(null);
const [imageFile, setImageFile] = useState<File | null>(null);
const [imagePreview, setImagePreview] = useState('');
const [saving, setSaving] = useState(false);
const [uploading, setUploading] = useState(false);
const [error, setError] = useState('');
const [success, setSuccess] = useState('');
const fileRef = useRef<HTMLInputElement>(null);
const cameraRef = useRef<HTMLInputElement>(null);

useEffect(() => { loadProducts(); }, [activeStore]);

async function loadProducts() {
setLoading(true);
const { data } = await supabase
.from('us_supplier_products')
.select('*')
.eq('store', activeStore)
.order('created_at', { ascending: false });
setProducts(data || []);
setLoading(false);
}

const storeInfo = STORES.find(s => s.key === activeStore)!;

function openAdd() {
setForm({ ...EMPTY, store: activeStore });
setEditId(null);
setImageFile(null);
setImagePreview('');
setError('');
setModal('add');
}

function openEdit(p: Product) {
setForm({
store: p.store, name: p.name, description: p.description || '',
category: p.category, original_cost_usd: p.original_cost_usd,
weight_lbs: p.weight_lbs, shipping_per_lb: p.shipping_per_lb,
customs_duty_pct: p.customs_duty_pct, bsc_markup_pct: p.bsc_markup_pct,
vat_pct: p.vat_pct, final_price_bsd: p.final_price_bsd,
image_url: p.image_url || '', in_stock: p.in_stock, featured: p.featured,
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
const path = `us-products/${Date.now()}.${ext}`;
const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true });
if (error) throw new Error('Upload failed: ' + error.message);
return `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}

function updateForm(key: keyof FormData, value: string | number | boolean) {
setForm((prev) => {
const updated = { ...prev, [key]: value };
// Auto-set duty rate when category changes
if (key === 'category' && typeof value === 'string') {
updated.customs_duty_pct = DUTY_RATES[value] ?? 0.45;
}
updated.final_price_bsd = calcFinalPrice(updated);
return updated;
});
}

async function saveProduct() {
if (!form.name.trim()) { setError('Product name is required.'); return; }
if (form.original_cost_usd <= 0) { setError('US price is required.'); return; }
setSaving(true);
setError('');
try {
let imageUrl = form.image_url;
if (imageFile) {
setUploading(true);
imageUrl = await uploadImage(imageFile);
setUploading(false);
}
const finalPrice = calcFinalPrice(form);
const payload = { ...form, image_url: imageUrl, final_price_bsd: finalPrice, updated_at: new Date().toISOString() };

if (modal === 'edit' && editId) {
const { error } = await supabase.from('us_supplier_products').update(payload).eq('id', editId);
if (error) throw error;
setSuccess('Product updated.');
} else {
const { error } = await supabase.from('us_supplier_products').insert([{ ...payload, created_at: new Date().toISOString() }]);
if (error) throw error;
setSuccess('Product added.');
}
setModal(null);
await loadProducts();
setTimeout(() => setSuccess(''), 3000);
} catch (err: unknown) {
setError(err instanceof Error ? err.message : 'Save failed.');
}
setSaving(false);
}

async function deleteProduct(id: string) {
if (!confirm('Delete this product?')) return;
await supabase.from('us_supplier_products').delete().eq('id', id);
await loadProducts();
}

const previewPrice = calcFinalPrice(form);

return (
<div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, sans-serif' }}>

{/* HEADER */}
<div style={{ backgroundColor: '#1a2e5a', padding: '0 20px', position: 'sticky', top: 0, zIndex: 50 }}>
<div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
<Link href="/dashboard" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Dashboard</Link>
<div style={{ color: '#fff', fontWeight: 900, fontSize: 16 }}>🇺🇸 US Store Products</div>
</div>
<div style={{ display: 'flex', gap: 10 }}>
<Link href="/us-shopping" target="_blank" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
👁️ Preview Store
</Link>
<button onClick={openAdd} style={{ backgroundColor: '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>
+ Add Product
</button>
</div>
</div>
</div>

{/* SUCCESS */}
{success && (
<div style={{ backgroundColor: '#e8f5e9', borderLeft: '4px solid #2e7d32', padding: '12px 20px', margin: '16px 20px 0', borderRadius: 8, color: '#2e7d32', fontWeight: 700 }}>
✅ {success}
</div>
)}

{/* STORE TABS */}
<div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 20px' }}>
<div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: 4, overflowX: 'auto' }}>
{STORES.map((store) => {
const count = products.filter(() => activeStore === store.key).length;
return (
<button
key={store.key}
onClick={() => setActiveStore(store.key)}
style={{
padding: '14px 20px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
borderBottom: activeStore === store.key ? `3px solid ${store.color}` : '3px solid transparent',
backgroundColor: 'transparent',
color: activeStore === store.key ? store.color : '#666',
fontWeight: activeStore === store.key ? 800 : 500, fontSize: 14,
}}
>
{store.logo} {store.name}
</button>
);
})}
</div>
</div>

{/* STATS */}
<div style={{ maxWidth: 1200, margin: '16px auto 0', padding: '0 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
{[
{ label: 'Products', value: products.length, color: '#e8f4fd', text: '#1a2e5a' },
{ label: 'In Stock', value: products.filter(p => p.in_stock).length, color: '#e8f5e9', text: '#2e7d32' },
{ label: 'Featured', value: products.filter(p => p.featured).length, color: '#fef9e7', text: '#d97706' },
].map((s) => (
<div key={s.label} style={{ backgroundColor: s.color, borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
<div style={{ color: '#666', fontSize: 10 }}>{s.label}</div>
<div style={{ color: s.text, fontWeight: 900, fontSize: 22 }}>{s.value}</div>
</div>
))}
</div>

{/* PRODUCT LIST */}
<div style={{ maxWidth: 1200, margin: '20px auto', padding: '0 20px 40px' }}>
{loading ? (
<div style={{ textAlign: 'center', padding: 48, color: '#999' }}>Loading...</div>
) : products.length === 0 ? (
<div style={{ textAlign: 'center', padding: 60 }}>
<div style={{ fontSize: 48, marginBottom: 12 }}>{storeInfo.logo}</div>
<h3 style={{ color: '#1a2e5a', fontWeight: 800 }}>No products yet for {storeInfo.name}</h3>
<p style={{ color: '#999', fontSize: 14, marginBottom: 20 }}>Add products that you can pick up on your next Florida trip.</p>
<button onClick={openAdd} style={{ backgroundColor: storeInfo.color, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
+ Add First Product
</button>
</div>
) : (
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
{products.map((p) => (
<div key={p.id} style={{ backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: p.featured ? `2px solid ${storeInfo.color}` : '1px solid #e5e7eb' }}>
<div style={{ height: 120, backgroundColor: '#f8f9fa', position: 'relative', overflow: 'hidden' }}>
{p.image_url ? (
<img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
) : (
<div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>{storeInfo.logo}</div>
)}
<div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
{p.featured && <span style={{ backgroundColor: '#f4c842', color: '#1a2e5a', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>⭐</span>}
<span style={{ backgroundColor: p.in_stock ? '#e8f5e9' : '#fde8e8', color: p.in_stock ? '#2e7d32' : '#dc2626', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>
{p.in_stock ? '● LIVE' : '● OFF'}
</span>
</div>
</div>
<div style={{ padding: '12px 14px' }}>
<div style={{ color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{p.category} · {p.weight_lbs}lb</div>
<div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{p.name}</div>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
<div>
<div style={{ color: '#94a3b8', fontSize: 11 }}>US: ${p.original_cost_usd.toFixed(2)}</div>
<div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 16 }}>BSD ${p.final_price_bsd.toFixed(2)}</div>
</div>
<div style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>
<div>Duty: {(p.customs_duty_pct * 100).toFixed(0)}%</div>
<div>Ship: ${(p.weight_lbs * p.shipping_per_lb).toFixed(2)}</div>
</div>
</div>
<div style={{ display: 'flex', gap: 8 }}>
<button onClick={() => openEdit(p)} style={{ flex: 1, backgroundColor: storeInfo.color, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
<button onClick={() => deleteProduct(p.id)} style={{ flex: 1, backgroundColor: '#fde8e8', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
</div>
</div>
</div>
))}
</div>
)}
</div>

{/* MODAL */}
{modal && (
<div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '20px 16px' }}>
<div style={{ backgroundColor: '#fff', borderRadius: 18, width: '100%', maxWidth: 540, padding: 24 }}>

<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
<h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 17, margin: 0 }}>
{modal === 'add' ? '+ Add Product' : '✏️ Edit Product'}
</h2>
<button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
</div>

{error && <div style={{ backgroundColor: '#fde8e8', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{error}</div>}

{/* LIVE PRICE PREVIEW */}
<div style={{ backgroundColor: '#1a2e5a', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<div>
<div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Final Price for Customer</div>
<div style={{ color: '#f4c842', fontWeight: 900, fontSize: 24 }}>BSD ${previewPrice.toFixed(2)}</div>
</div>
<div style={{ textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8 }}>
<div>US: ${form.original_cost_usd.toFixed(2)}</div>
<div>Ship: ${(form.weight_lbs * form.shipping_per_lb).toFixed(2)}</div>
<div>Duty: {(form.customs_duty_pct * 100).toFixed(0)}%</div>
<div>BSC: 12% · VAT: 10%</div>
</div>
</div>

{/* STORE SELECTOR */}
<div style={{ marginBottom: 14 }}>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Store</label>
<select value={form.store} onChange={(e) => updateForm('store', e.target.value)} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', backgroundColor: '#fff' }}>
{STORES.map(s => <option key={s.key} value={s.key}>{s.logo} {s.name}</option>)}
</select>
</div>

{/* IMAGE */}
<div style={{ marginBottom: 14 }}>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Product Photo</label>
<input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleImageFile} style={{ display: 'none' }} />
<input ref={fileRef} type="file" accept="image/*" onChange={handleImageFile} style={{ display: 'none' }} />
{imagePreview ? (
<div style={{ position: 'relative', marginBottom: 8 }}>
<img src={imagePreview} alt="Preview" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 10, border: '2px solid #1a2e5a' }} />
<button onClick={() => { setImagePreview(''); setImageFile(null); updateForm('image_url', ''); }} style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Remove</button>
</div>
) : (
<div style={{ border: '2px dashed #e5e7eb', borderRadius: 10, padding: 20, textAlign: 'center', backgroundColor: '#f8f9fa', marginBottom: 8 }}>
<div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
<div style={{ color: '#999', fontSize: 12 }}>No photo yet</div>
</div>
)}
<div style={{ display: 'flex', gap: 8 }}>
<button onClick={() => cameraRef.current?.click()} style={{ flex: 1, backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 8, padding: 10, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>📸 Camera</button>
<button onClick={() => fileRef.current?.click()} style={{ flex: 1, backgroundColor: '#f0f4ff', color: '#1a2e5a', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>📁 Upload</button>
</div>
</div>

{/* NAME */}
<div style={{ marginBottom: 14 }}>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Product Name *</label>
<input value={form.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="e.g. USDA Ribeye Steak 12oz" style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
</div>

{/* DESCRIPTION */}
<div style={{ marginBottom: 14 }}>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Description</label>
<textarea value={form.description} onChange={(e) => updateForm('description', e.target.value)} rows={2} placeholder="Short product description..." style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
</div>

{/* CATEGORY + WEIGHT */}
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
<div>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Category (sets duty rate)</label>
<select value={form.category} onChange={(e) => updateForm('category', e.target.value)} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', backgroundColor: '#fff' }}>
{Object.entries(DUTY_RATES).map(([k, v]) => (
<option key={k} value={k}>{k} ({(v * 100).toFixed(0)}% duty)</option>
))}
</select>
</div>
<div>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Weight (lbs)</label>
<input type="number" step="0.1" value={form.weight_lbs} onChange={(e) => updateForm('weight_lbs', parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
</div>
</div>

{/* US PRICE */}
<div style={{ marginBottom: 14 }}>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>US Store Price (USD $) *</label>
<input type="number" step="0.01" value={form.original_cost_usd} onChange={(e) => updateForm('original_cost_usd', parseFloat(e.target.value) || 0)} placeholder="0.00" style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
</div>

{/* DUTY OVERRIDE */}
<div style={{ marginBottom: 14 }}>
<label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Customs Duty % (auto-set by category)</label>
<input type="number" step="0.01" value={(form.customs_duty_pct * 100).toFixed(0)} onChange={(e) => updateForm('customs_duty_pct', parseFloat(e.target.value) / 100 || 0)} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
</div>

{/* TOGGLES */}
<div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
<button onClick={() => updateForm('in_stock', !form.in_stock)} style={{ flex: 1, backgroundColor: form.in_stock ? '#e8f5e9' : '#fde8e8', color: form.in_stock ? '#2e7d32' : '#dc2626', border: 'none', borderRadius: 10, padding: 11, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
{form.in_stock ? '✅ Available' : '❌ Not Available'}
</button>
<button onClick={() => updateForm('featured', !form.featured)} style={{ flex: 1, backgroundColor: form.featured ? '#fef9e7' : '#f8f9fa', color: form.featured ? '#d97706' : '#94a3b8', border: 'none', borderRadius: 10, padding: 11, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
{form.featured ? '⭐ Featured' : '☆ Not Featured'}
</button>
</div>

<button onClick={saveProduct} disabled={saving} style={{ width: '100%', backgroundColor: saving ? '#94a3b8' : storeInfo.color, color: '#fff', border: 'none', borderRadius: 12, padding: 15, fontWeight: 900, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer', marginBottom: 10 }}>
{uploading ? '⬆️ Uploading Photo...' : saving ? 'Saving...' : modal === 'add' ? '+ Add Product' : '✅ Save Changes'}
</button>

{modal === 'edit' && editId && (
<button onClick={() => { deleteProduct(editId); setModal(null); }} style={{ width: '100%', backgroundColor: '#fde8e8', color: '#dc2626', border: 'none', borderRadius: 12, padding: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
🗑️ Delete Product
</button>
)}
</div>
</div>
)}
</div>
);
}
