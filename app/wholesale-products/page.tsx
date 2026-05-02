'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Wholesaler master config ──────────────────────────────────────────────────
const WHOLESALERS = [
  { key: 'asa-h-pritchard',           name: 'Asa H Pritchard',           color: '#1B4F72', light: '#d6eaf8', prefix: 'AHP', emoji: '🏪' },
  { key: 'bahamas-international-food', name: 'Bahamas International Food', color: '#1E5C2E', light: '#d5f5e3', prefix: 'BIF', emoji: '🍱' },
  { key: 'dalbenas',                   name: "D'Albenas",                  color: '#784212', light: '#fdebd0', prefix: 'DAL', emoji: '🏭' },
  { key: 'bahamas-wholesale-agencies', name: 'Bahamas Wholesale Agencies', color: '#1A5276', light: '#d6eaf8', prefix: 'BWA', emoji: '📦' },
  { key: 'tpg',                        name: 'TPG',                        color: '#2C3E50', light: '#d5d8dc', prefix: 'TPG', emoji: '🛒' },
  { key: 'thompson-trading',           name: 'Thompson Trading',           color: '#922B21', light: '#fadbd8', prefix: 'TTR', emoji: '🤝' },
  { key: 'island-wholesale',           name: 'Island Wholesale',           color: '#196F3D', light: '#d5f5e3', prefix: 'ISW', emoji: '🌴' },
];

const CATEGORIES = [
  { label: 'Seafood',    code: 'SEA' },
  { label: 'Meat',       code: 'MEA' },
  { label: 'Produce',    code: 'PRD' },
  { label: 'Dry Goods',  code: 'DRY' },
  { label: 'Beverages',  code: 'BEV' },
  { label: 'Dairy',      code: 'DAI' },
  { label: 'Frozen',     code: 'FRZ' },
  { label: 'Other',      code: 'OTH' },
];

const UNITS = ['lb', 'kg', 'each', 'case', 'box', 'bag', 'dozen', 'gallon', 'litre', 'pack'];

const BSC_MARKUP = 12;
const VAT = 10;

interface Product {
  id: string;
  sku: string;
  wholesaler: string;
  name: string;
  description: string;
  category: string;
  wholesale_cost_bsd: number;
  bsc_markup_pct: number;
  vat_pct: number;
  final_price_bsd: number;
  unit: string;
  min_order_qty: number;
  image_url: string;
  in_stock: boolean;
  featured: boolean;
  created_at?: string;
}

const BLANK: Omit<Product, 'id' | 'sku' | 'created_at'> = {
  wholesaler: '',
  name: '',
  description: '',
  category: 'Seafood',
  wholesale_cost_bsd: 0,
  bsc_markup_pct: BSC_MARKUP,
  vat_pct: VAT,
  final_price_bsd: 0,
  unit: 'lb',
  min_order_qty: 1,
  image_url: '',
  in_stock: true,
  featured: false,
};

export default function WholesaleProductsPage() {
  const router = useRouter();
  const [authed, setAuthed]         = useState(false);
  const [activeTab, setActiveTab]   = useState(WHOLESALERS[0].key);
  const [products, setProducts]     = useState<Product[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState({ ...BLANK, wholesaler: WHOLESALERS[0].key });
  const [msg, setMsg]               = useState('');
  const [deleteId, setDeleteId]     = useState<string | null>(null);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push('/login'); return; }
      supabase
        .from('profiles')
        .select('role')
        .eq('id', data.session.user.id)
        .single()
        .then(({ data: p }) => {
          if (!p || !['control_admin', 'manager'].includes(p.role)) {
            router.push('/'); return;
          }
          setAuthed(true);
        });
    });
  }, [router]);

  // ── Load products for active supplier ────────────────────────────────────────
  useEffect(() => {
    if (!authed) return;
    loadProducts();
  }, [authed, activeTab]);

  async function loadProducts() {
    setLoading(true);
    const { data } = await supabase
      .from('local_wholesale_products')
      .select('*')
      .eq('wholesaler', activeTab)
      .order('created_at', { ascending: false });
    setProducts(data || []);
    setLoading(false);
  }

  // ── Auto-calculate final price ───────────────────────────────────────────────
  function calcFinal(cost: number, markup: number, vat: number) {
    const withMarkup = cost * (1 + markup / 100);
    return parseFloat((withMarkup * (1 + vat / 100)).toFixed(2));
  }

  // ── Auto-generate SKU ────────────────────────────────────────────────────────
  function generateSKU(wholesalerKey: string, category: string, existingCount: number) {
    const w = WHOLESALERS.find(w => w.key === wholesalerKey);
    const c = CATEGORIES.find(c => c.label === category);
    const prefix  = w?.prefix  || 'BSC';
    const catCode = c?.code    || 'OTH';
    const seq     = String(existingCount + 1).padStart(3, '0');
    return `${prefix}-${catCode}-${seq}`;
  }

  // ── Form handlers ────────────────────────────────────────────────────────────
  function handleChange(field: string, value: string | number | boolean) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (['wholesale_cost_bsd', 'bsc_markup_pct', 'vat_pct'].includes(field)) {
        next.final_price_bsd = calcFinal(
          field === 'wholesale_cost_bsd' ? +value : next.wholesale_cost_bsd,
          field === 'bsc_markup_pct'     ? +value : next.bsc_markup_pct,
          field === 'vat_pct'            ? +value : next.vat_pct,
        );
      }
      return next;
    });
  }

  function openNew() {
    const w = WHOLESALERS.find(w => w.key === activeTab)!;
    setForm({ ...BLANK, wholesaler: activeTab });
    setEditId(null);
    setShowForm(true);
    setMsg('');
  }

  function openEdit(p: Product) {
    setForm({
      wholesaler:        p.wholesaler,
      name:              p.name,
      description:       p.description,
      category:          p.category,
      wholesale_cost_bsd: p.wholesale_cost_bsd,
      bsc_markup_pct:    p.bsc_markup_pct,
      vat_pct:           p.vat_pct,
      final_price_bsd:   p.final_price_bsd,
      unit:              p.unit,
      min_order_qty:     p.min_order_qty,
      image_url:         p.image_url || '',
      in_stock:          p.in_stock,
      featured:          p.featured,
    });
    setEditId(p.id);
    setShowForm(true);
    setMsg('');
  }

  async function handleSave() {
    if (!form.name.trim() || !form.wholesale_cost_bsd) {
      setMsg('❌ Name and cost are required.'); return;
    }
    setSaving(true);

    const sku = editId
      ? (products.find(p => p.id === editId)?.sku || '')
      : generateSKU(activeTab, form.category, products.length);

    const payload = { ...form, sku, final_price_bsd: calcFinal(form.wholesale_cost_bsd, form.bsc_markup_pct, form.vat_pct) };

    const { error } = editId
      ? await supabase.from('local_wholesale_products').update(payload).eq('id', editId)
      : await supabase.from('local_wholesale_products').insert(payload);

    setSaving(false);
    if (error) { setMsg('❌ ' + error.message); return; }

    setMsg(editId ? '✅ Product updated.' : '✅ Product added.');
    setShowForm(false);
    setEditId(null);
    loadProducts();
  }

  async function handleDelete(id: string) {
    await supabase.from('local_wholesale_products').delete().eq('id', id);
    setDeleteId(null);
    loadProducts();
  }

  async function toggleStock(p: Product) {
    await supabase.from('local_wholesale_products').update({ in_stock: !p.in_stock }).eq('id', p.id);
    loadProducts();
  }

  async function toggleFeatured(p: Product) {
    await supabase.from('local_wholesale_products').update({ featured: !p.featured }).eq('id', p.id);
    loadProducts();
  }

  if (!authed) return null;

  const activeW = WHOLESALERS.find(w => w.key === activeTab)!;
  const catProducts = (cat: string) => products.filter(p => p.category === cat);

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; }
        .btn { border: none; cursor: pointer; border-radius: 8px; font-weight: 700; transition: opacity 0.15s, transform 0.15s; }
        .btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .btn:active { transform: translateY(0); }
        input, select, textarea { font-family: inherit; font-size: 14px; }
        .tab-btn { border: none; cursor: pointer; transition: all 0.2s; font-family: inherit; }
        .product-row:hover { background: #f8fafc !important; }
        .toggle { width: 40px; height: 22px; border-radius: 11px; border: none; cursor: pointer; transition: background 0.2s; position: relative; }
        .toggle::after { content: ''; position: absolute; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left 0.2s; }
        .toggle.on { background: #22c55e; }
        .toggle.on::after { left: 21px; }
        .toggle.off { background: #cbd5e1; }
        .toggle.off::after { left: 3px; }
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal { background: #fff; border-radius: 16px; width: 100%; max-width: 640px; max-height: 90vh; overflow-y: auto; }
        .sku-badge { font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; letter-spacing: 0.05em; }
      `}</style>

      <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>

        {/* ── Header ── */}
        <div style={{ backgroundColor: '#1a2e4a', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#f5a623', fontWeight: 900, fontSize: 18, letterSpacing: 1 }}>BSC Admin</div>
            <div style={{ color: '#94a3b8', fontSize: 12 }}>Wholesale Product Manager</div>
          </div>
          <button className="btn" onClick={() => router.push('/dashboard')} style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', padding: '8px 16px', fontSize: 13 }}>
            ← Dashboard
          </button>
        </div>

        {/* ── SQL reminder ── */}
        <div style={{ backgroundColor: '#fef3c7', borderLeft: '4px solid #f5a623', padding: '10px 24px', fontSize: 12, color: '#92400e' }}>
          <strong>One-time SQL required:</strong> Run in Supabase → <code style={{ backgroundColor: '#fde68a', padding: '1px 6px', borderRadius: 4 }}>ALTER TABLE local_wholesale_products ADD COLUMN IF NOT EXISTS sku text;</code>
        </div>

        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>

          {/* ── Wholesaler tabs ── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
            {WHOLESALERS.map(w => (
              <button
                key={w.key}
                className="tab-btn"
                onClick={() => { setActiveTab(w.key); setShowForm(false); setMsg(''); }}
                style={{
                  padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  backgroundColor: activeTab === w.key ? w.color : '#fff',
                  color: activeTab === w.key ? '#fff' : '#475569',
                  border: activeTab === w.key ? 'none' : '1.5px solid #e2e8f0',
                  boxShadow: activeTab === w.key ? `0 4px 12px ${w.color}55` : 'none',
                }}
              >
                {w.emoji} {w.name}
              </button>
            ))}
          </div>

          {/* ── Supplier header card ── */}
          <div style={{ backgroundColor: activeW.color, borderRadius: 16, padding: '24px 32px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
                {activeW.emoji} Managing Products For
              </div>
              <div style={{ color: '#fff', fontSize: 24, fontWeight: 900 }}>{activeW.name}</div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  SKU Prefix: <strong style={{ fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: 4 }}>{activeW.prefix}</strong>
                </span>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  {products.length} product{products.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <button className="btn" onClick={openNew} style={{ backgroundColor: '#f5a623', color: '#1a2e4a', padding: '12px 28px', fontSize: 14 }}>
              + Add Product
            </button>
          </div>

          {msg && (
            <div style={{ padding: '12px 16px', borderRadius: 8, marginBottom: 16, backgroundColor: msg.startsWith('✅') ? '#d1fae5' : '#fee2e2', color: msg.startsWith('✅') ? '#065f46' : '#991b1b', fontWeight: 600, fontSize: 14 }}>
              {msg}
            </div>
          )}

          {/* ── Products table ── */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Loading products…</div>
          ) : products.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, backgroundColor: '#fff', borderRadius: 16, color: '#94a3b8' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No products yet for {activeW.name}</div>
              <button className="btn" onClick={openNew} style={{ backgroundColor: activeW.color, color: '#fff', padding: '10px 24px', fontSize: 14, marginTop: 8 }}>
                Add First Product
              </button>
            </div>
          ) : (
            <div style={{ backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.9fr 0.8fr 0.8fr 0.8fr 0.8fr 0.7fr 0.7fr 1fr', gap: 12, padding: '12px 20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <div>Product</div><div>SKU</div><div>Category</div><div>Cost (BSD)</div><div>Final Price</div><div>Unit</div><div>In Stock</div><div>Featured</div><div>Actions</div>
              </div>

              {products.map((p, i) => (
                <div key={p.id} className="product-row" style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.9fr 0.8fr 0.8fr 0.8fr 0.8fr 0.7fr 0.7fr 1fr', gap: 12, padding: '14px 20px', borderBottom: i < products.length - 1 ? '1px solid #f1f5f9' : 'none', alignItems: 'center', transition: 'background 0.15s' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2e4a' }}>{p.name}</div>
                    {p.description && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{p.description}</div>}
                  </div>
                  <div>
                    {p.sku ? (
                      <span className="sku-badge" style={{ backgroundColor: activeW.light, color: activeW.color }}>
                        {p.sku}
                      </span>
                    ) : <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569' }}>{p.category}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>${p.wholesale_cost_bsd?.toFixed(2)}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1a2e4a' }}>${p.final_price_bsd?.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>/{p.unit}</div>
                  <div>
                    <button className={`toggle ${p.in_stock ? 'on' : 'off'}`} onClick={() => toggleStock(p)} title={p.in_stock ? 'In stock' : 'Out of stock'} />
                  </div>
                  <div>
                    <button className={`toggle ${p.featured ? 'on' : 'off'}`} onClick={() => toggleFeatured(p)} title={p.featured ? 'Featured' : 'Not featured'} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn" onClick={() => openEdit(p)} style={{ backgroundColor: '#e2e8f0', color: '#1a2e4a', padding: '6px 12px', fontSize: 12 }}>Edit</button>
                    <button className="btn" onClick={() => setDeleteId(p.id)} style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '6px 12px', fontSize: 12 }}>Del</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Summary by category ── */}
          {products.length > 0 && (
            <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {CATEGORIES.filter(c => catProducts(c.label).length > 0).map(c => (
                <div key={c.code} style={{ backgroundColor: '#fff', border: `2px solid ${activeW.color}33`, borderRadius: 10, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="sku-badge" style={{ backgroundColor: activeW.light, color: activeW.color }}>{c.code}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1a2e4a' }}>{c.label}</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{catProducts(c.label).length} item{catProducts(c.label).length !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="modal">
            {/* Modal header */}
            <div style={{ backgroundColor: activeW.color, padding: '20px 24px', borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: 16 }}>
                  {editId ? 'Edit Product' : 'Add New Product'}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
                  {activeW.emoji} {activeW.name} · SKU prefix: <strong style={{ fontFamily: 'monospace' }}>{activeW.prefix}</strong>
                </div>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 18, fontWeight: 700 }}>×</button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* SKU preview */}
              {!editId && (
                <div style={{ backgroundColor: activeW.light, border: `1.5px solid ${activeW.color}44`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: '#475569' }}>Auto-generated SKU:</span>
                  <span className="sku-badge" style={{ backgroundColor: activeW.color, color: '#fff', fontSize: 13 }}>
                    {generateSKU(activeTab, form.category, products.length)}
                  </span>
                </div>
              )}

              {/* Name */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>PRODUCT NAME *</label>
                <input
                  value={form.name}
                  onChange={e => handleChange('name', e.target.value)}
                  placeholder="e.g. Fresh Grouper Fillet"
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none' }}
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>DESCRIPTION</label>
                <textarea
                  value={form.description}
                  onChange={e => handleChange('description', e.target.value)}
                  placeholder="Product details, size, grade…"
                  rows={2}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', resize: 'vertical' }}
                />
              </div>

              {/* Category + Unit */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>CATEGORY *</label>
                  <select
                    value={form.category}
                    onChange={e => handleChange('category', e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', backgroundColor: '#fff' }}
                  >
                    {CATEGORIES.map(c => <option key={c.code} value={c.label}>{c.label} ({c.code})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>UNIT</label>
                  <select
                    value={form.unit}
                    onChange={e => handleChange('unit', e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', backgroundColor: '#fff' }}
                  >
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* Pricing */}
              <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pricing</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>WHOLESALE COST (BSD) *</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={form.wholesale_cost_bsd || ''}
                      onChange={e => handleChange('wholesale_cost_bsd', parseFloat(e.target.value) || 0)}
                      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 14, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>BSC MARKUP (%)</label>
                    <input
                      type="number" step="0.1" min="0"
                      value={form.bsc_markup_pct}
                      onChange={e => handleChange('bsc_markup_pct', parseFloat(e.target.value) || 0)}
                      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 14, outline: 'none' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>VAT (%)</label>
                    <input
                      type="number" step="0.1" min="0"
                      value={form.vat_pct}
                      onChange={e => handleChange('vat_pct', parseFloat(e.target.value) || 0)}
                      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 14, outline: 'none' }}
                    />
                  </div>
                </div>
                <div style={{ backgroundColor: activeW.color, borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Final Customer Price (incl. markup + VAT)</span>
                  <span style={{ color: '#f5a623', fontWeight: 900, fontSize: 20 }}>
                    BSD ${calcFinal(form.wholesale_cost_bsd, form.bsc_markup_pct, form.vat_pct).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Min order + image */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>MIN ORDER QTY</label>
                  <input
                    type="number" min="1"
                    value={form.min_order_qty}
                    onChange={e => handleChange('min_order_qty', parseInt(e.target.value) || 1)}
                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>IMAGE URL</label>
                  <input
                    value={form.image_url}
                    onChange={e => handleChange('image_url', e.target.value)}
                    placeholder="https://… or Supabase storage URL"
                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none' }}
                  />
                </div>
              </div>

              {/* Toggles */}
              <div style={{ display: 'flex', gap: 24 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <button className={`toggle ${form.in_stock ? 'on' : 'off'}`} onClick={() => handleChange('in_stock', !form.in_stock)} type="button" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>In Stock</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <button className={`toggle ${form.featured ? 'on' : 'off'}`} onClick={() => handleChange('featured', !form.featured)} type="button" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Featured on Market</span>
                </label>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
                <button className="btn" onClick={handleSave} disabled={saving} style={{ flex: 1, backgroundColor: activeW.color, color: '#fff', padding: '13px', fontSize: 14 }}>
                  {saving ? 'Saving…' : editId ? '✅ Update Product' : '✅ Add Product'}
                </button>
                <button className="btn" onClick={() => setShowForm(false)} style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '13px 20px', fontSize: 14 }}>
                  Cancel
                </button>
              </div>

              {msg && (
                <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: msg.startsWith('✅') ? '#d1fae5' : '#fee2e2', color: msg.startsWith('✅') ? '#065f46' : '#991b1b', fontSize: 13, fontWeight: 600 }}>
                  {msg}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteId && (
        <div className="overlay">
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#1a2e4a', marginBottom: 8 }}>Delete Product?</div>
            <div style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>This cannot be undone. The product will be removed from this supplier and the market.</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn" onClick={() => handleDelete(deleteId!)} style={{ flex: 1, backgroundColor: '#ef4444', color: '#fff', padding: '12px' }}>Yes, Delete</button>
              <button className="btn" onClick={() => setDeleteId(null)} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#475569', padding: '12px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}