// ============================================================
// BSC MARKETPLACE - PRODUCT IMAGE MANAGER
// File: app/products/page.tsx
// Route: /products
// Upload, update, manage all market product photos
// ============================================================

'use client';

import { useState, useEffect, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';

// Skip prerendering. Product manager is per-staff, runtime only.
export const dynamic = 'force-dynamic';

// Lazy-init Supabase. Module-scope createBrowserClient crashes the build
// at static prerender because env vars are not loaded yet.
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createBrowserClient(url, key);
}

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');
  return url;
}

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
  const [showImport, setShowImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      setProducts(data || []);
    } catch {
      setProducts([]);
    }
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
    const supabase = getSupabase();
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, file, { upsert: true });
    if (error) throw new Error('Image upload failed: ' + error.message);
    return `${getSupabaseUrl()}/storage/v1/object/public/product-images/${path}`;
  }

  async function saveProduct() {
    if (!form.name.trim()) { setError('Product name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const supabase = getSupabase();
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
    try {
      const supabase = getSupabase();
      await supabase.from('products').update({ in_stock: !current }).eq('id', id);
      await loadProducts();
    } catch {}
  }

  async function deleteProduct(id: string) {
    if (!confirm('Delete this product?')) return;
    try {
      const supabase = getSupabase();
      await supabase.from('products').delete().eq('id', id);
      await loadProducts();
    } catch {}
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ backgroundColor: '#1a2e5a', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dashboard" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>&larr; Dashboard</Link>
          <div style={{ color: 'rgba(255,255,255,0.3)' }}>|</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: 16 }}>Product Manager</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>Photos - Prices - Stock - BSC Marketplace</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowImport(true)} style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            📥 Import CSV
          </button>
          <button onClick={openAdd} style={{ backgroundColor: '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 900, fontSize: 14, cursor: 'pointer' }}>
            + Add Product
          </button>
        </div>
      </div>

      {showImport && (
        <BulkImportPanel
          onClose={() => setShowImport(false)}
          onApplied={() => { setShowImport(false); loadProducts(); }}
        />
      )}

      {success && (
        <div style={{ backgroundColor: '#e8f5e9', borderLeft: '4px solid #2e7d32', padding: '12px 20px', margin: '16px 20px 0', borderRadius: 8, color: '#2e7d32', fontWeight: 700, fontSize: 14 }}>
          {success}
        </div>
      )}

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

      <div style={{ padding: '0 20px 40px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>Loading products...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ color: '#999', fontSize: 14 }}>No products found. Add your first product.</div>
            <button onClick={openAdd} style={{ marginTop: 16, backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              + Add First Product
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14 }}>
            {filtered.map((product) => (
              <div key={product.id} style={{ backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: product.featured ? '2px solid #f4c842' : '1px solid #e5e7eb', position: 'relative' }}>

                {product.featured && (
                  <div style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#f4c842', color: '#1a2e5a', fontSize: 9, fontWeight: 900, padding: '3px 8px', borderRadius: 20, zIndex: 2 }}>FEATURED</div>
                )}

                <div style={{ position: 'absolute', top: 8, right: 8, backgroundColor: product.in_stock ? '#e8f5e9' : '#fde8e8', color: product.in_stock ? '#2e7d32' : '#dc2626', fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 20, zIndex: 2 }}>
                  {product.in_stock ? 'IN STOCK' : 'OUT'}
                </div>

                <div style={{ height: 140, backgroundColor: '#f8f9fa', overflow: 'hidden', position: 'relative' }}>
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <span style={{ color: '#999', fontSize: 11 }}>No photo</span>
                    </div>
                  )}
                </div>

                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#1a2e5a', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'capitalize', marginBottom: 6 }}>{product.category}</div>
                  <div style={{ fontSize: 12, color: '#2e7d32', fontWeight: 700, marginBottom: 8 }}>{fmtBSD(product.price_online)}/{product.unit}</div>

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

      {modal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '20px 16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 18, width: '100%', maxWidth: 520, padding: 24, position: 'relative' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 17, margin: 0 }}>
                {modal === 'add' ? '+ Add New Product' : 'Edit Product'}
              </h2>
              <button onClick={() => setModal(null)} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>x</button>
            </div>

            {error && <div style={{ backgroundColor: '#fde8e8', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{error}</div>}

            <div style={{ marginBottom: 18 }}>
              <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: 13, marginBottom: 10 }}>Product Photo</div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleImageFile} style={{ display: 'none' }} />
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImageFile} style={{ display: 'none' }} />

              {imagePreview ? (
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="Preview" style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 12, border: '2px solid #1a2e5a' }} />
                  <button onClick={() => { setImagePreview(''); setImageFile(null); setForm(f => ({ ...f, image_url: '' })); }} style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Remove
                  </button>
                </div>
              ) : (
                <div style={{ border: '2px dashed #e5e7eb', borderRadius: 12, padding: 24, textAlign: 'center', backgroundColor: '#f8f9fa', marginBottom: 10 }}>
                  <div style={{ color: '#999', fontSize: 13, marginBottom: 12 }}>No photo yet</div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => cameraRef.current?.click()} style={{ flex: 1, backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                  Take Photo
                </button>
                <button onClick={() => fileRef.current?.click()} style={{ flex: 1, backgroundColor: '#f0f4ff', color: '#1a2e5a', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                  Upload File
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Product Name *</label>
              <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Fresh Grouper" style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Description</label>
              <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short product description..." rows={2} style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
            </div>

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

            <div style={{ marginBottom: 14 }}>
              <label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 8 }}>Prices (BSD $)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Nassau (38%)', key: 'price_nassau' },
                  { label: 'Andros (43%)', key: 'price_andros' },
                  { label: 'Online (25%)', key: 'price_online' },
                  { label: 'Wholesale', key: 'price_wholesale' },
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

            <div style={{ marginBottom: 14 }}>
              <label style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6 }}>Stock (lbs)</label>
              <input
                type="number"
                value={form.stock_lbs}
                onChange={(e) => setForm(f => ({ ...f, stock_lbs: parseFloat(e.target.value) || 0 }))}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button
                onClick={() => setForm(f => ({ ...f, in_stock: !f.in_stock }))}
                style={{ flex: 1, backgroundColor: form.in_stock ? '#e8f5e9' : '#fde8e8', color: form.in_stock ? '#2e7d32' : '#dc2626', border: 'none', borderRadius: 10, padding: '11px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
              >
                {form.in_stock ? 'In Stock' : 'Out of Stock'}
              </button>
              <button
                onClick={() => setForm(f => ({ ...f, featured: !f.featured }))}
                style={{ flex: 1, backgroundColor: form.featured ? '#fef9e7' : '#f8f9fa', color: form.featured ? '#d97706' : '#94a3b8', border: 'none', borderRadius: 10, padding: '11px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
              >
                {form.featured ? 'Featured' : 'Not Featured'}
              </button>
            </div>

            <button
              onClick={saveProduct}
              disabled={saving}
              style={{ width: '100%', backgroundColor: saving ? '#94a3b8' : '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 12, padding: '15px', fontWeight: 900, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer', marginBottom: 10 }}
            >
              {uploading ? 'Uploading Photo...' : saving ? 'Saving...' : modal === 'add' ? '+ Add Product' : 'Save Changes'}
            </button>

            {modal === 'edit' && editId && (
              <button onClick={() => { deleteProduct(editId); setModal(null); }} style={{ width: '100%', backgroundColor: '#fde8e8', color: '#dc2626', border: 'none', borderRadius: 12, padding: '12px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                Delete Product
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Bulk CSV import ───────────── */

const TEMPLATE_HEADERS = [
  'name', 'description', 'category',
  'price_nassau', 'price_andros', 'price_online', 'price_wholesale',
  'unit', 'image_url', 'in_stock', 'stock_lbs', 'featured',
];
const TEMPLATE_SAMPLE = [
  ['Snapper - Yellowtail', 'Fresh whole snapper', 'seafood', '12.50', '13.99', '14.99', '8.50', 'lb', '', 'true', '40', 'true'],
  ['Conch - Cleaned', 'Cleaned conch meat', 'seafood', '11.00', '12.50', '13.50', '7.50', 'lb', '', 'true', '25', 'false'],
];

function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS.join(','), ...TEMPLATE_SAMPLE.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bsc-products-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

type ImportPlanRow = {
  row: number;
  name: string;
  action: 'insert' | 'update' | 'skip';
  productId?: string;
  error?: string;
};

type ImportResult = {
  ok: boolean;
  dry_run: boolean;
  total: number;
  inserted: number;
  updated: number;
  errors: number;
  plan: ImportPlanRow[];
  error?: string;
};

function BulkImportPanel({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(dry: boolean) {
    if (!csv.trim()) { setError('Paste a CSV first.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/products/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, dry_run: dry }),
      });
      const j = (await res.json()) as ImportResult;
      if (!j.ok) { setError(j.error || 'Import failed'); setResult(null); }
      else { setResult(j); if (!dry && j.errors === 0) setTimeout(onApplied, 1200); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ''));
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, padding: 16, overflow: 'auto' }}>
      <div style={{ background: '#fff', maxWidth: 720, margin: '20px auto', borderRadius: 14, padding: 22, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#1a2e5a' }}>📥 Bulk import products</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: 12, fontSize: 13, color: '#1e3a8a', marginBottom: 14 }}>
          Match key is <strong>name</strong>. Existing products get updated; new names get inserted. Run a dry-run first.
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button onClick={downloadTemplate} style={btnSecondary}>↓ Download template</button>
          <label style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
            📂 Upload .csv
            <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} />
          </label>
        </div>

        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={`Paste CSV here. First line must be a header.\n${TEMPLATE_HEADERS.join(',')}`}
          rows={8}
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, fontFamily: 'monospace', boxSizing: 'border-box' }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => run(true)}  disabled={busy} style={btnSecondary}>
            {busy ? '…' : '🔍 Dry run'}
          </button>
          <button onClick={() => run(false)} disabled={busy} style={btnPrimary}>
            {busy ? 'Applying…' : '✓ Apply changes'}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 6, fontSize: 12, marginBottom: 10 }}>
              <Pill color="#1a6fb5" label={`Total: ${result.total}`} />
              <Pill color="#2e7d32" label={`Insert: ${result.plan.filter((p) => p.action === 'insert' && !p.error).length}`} />
              <Pill color="#7c3aed" label={`Update: ${result.plan.filter((p) => p.action === 'update' && !p.error).length}`} />
              {result.errors > 0 && <Pill color="#dc2626" label={`Errors: ${result.errors}`} />}
              <Pill color={result.dry_run ? '#94a3b8' : '#2e7d32'} label={result.dry_run ? 'DRY RUN' : 'APPLIED'} />
            </div>
            <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
              {result.plan.map((p) => (
                <div key={p.row} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                  <span style={{ color: '#475569' }}>row {p.row} · {p.name || '(no name)'}</span>
                  <span style={{
                    color:
                      p.error ? '#dc2626' :
                      p.action === 'insert' ? '#2e7d32' :
                      p.action === 'update' ? '#7c3aed' :
                      '#94a3b8',
                    fontWeight: 700,
                  }}>
                    {p.error ? `⚠ ${p.error}` : (p.action || 'skip')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ background: color, color: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 800 }}>
      {label}
    </span>
  );
}

const btnPrimary: React.CSSProperties = { background: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { background: '#fff', color: '#1a2e5a', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };

