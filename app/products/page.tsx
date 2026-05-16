'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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

const FOUNDER_ID = '7b62672c-9259-4c1b-98d4-3b78369a52ab';

const CHANNELS = [
  { key: 'nassau_pos',     label: 'Nassau POS',    emoji: '🟡', margin: 0.38 },
  { key: 'andros_pos',     label: 'Andros POS',    emoji: '🟣', margin: 0.43 },
  { key: 'online_market',  label: 'Online Market', emoji: '🛒', margin: 0.25 },
  { key: 'local_wholesale',label: 'Wholesale',     emoji: '📦', margin: 0.15 },
];

// Per-channel sell-price math.
//   Nassau / Andros / Wholesale: sell = cost / (1 - margin)
//   Online Market:               sell = cost / (1 - margin) * 1.10 (10% VAT on top)
// Reverse (cost from a typed sell price) is the inverse.
function chSellFromCost(channel: string, cost: number): number {
  switch (channel) {
    case 'nassau_pos':      return cost / 0.62;
    case 'andros_pos':      return cost / 0.57;
    case 'online_market':   return cost / 0.75 * 1.10;
    case 'local_wholesale': return cost / 0.85;
    default:                return cost;
  }
}
function chCostFromSell(channel: string, sell: number): number {
  switch (channel) {
    case 'nassau_pos':      return sell * 0.62;
    case 'andros_pos':      return sell * 0.57;
    case 'online_market':   return sell / 1.10 * 0.75;
    case 'local_wholesale': return sell * 0.85;
    default:                return sell;
  }
}

const CATEGORIES = [
  'fresh_seafood','frozen_seafood','processed_seafood',
  'meat','poultry','produce','grocery','beverage',
  'juice_smoothie','wellness_shot','snack','household','toiletry','other',
];

const CATEGORY_LABELS: Record<string, string> = {
  fresh_seafood: 'Fresh Seafood', frozen_seafood: 'Frozen Seafood',
  processed_seafood: 'Processed Seafood', meat: 'Meat', poultry: 'Poultry',
  produce: 'Produce', grocery: 'Grocery', beverage: 'Beverage',
  juice_smoothie: 'Juice/Smoothie', wellness_shot: 'Wellness Shot',
  snack: 'Snack', household: 'Household', toiletry: 'Toiletry', other: 'Other',
};

interface Supplier {
  id: string;
  name: string;
  code: string;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  is_bsc_processed: boolean;
  unit_type: string | null;
  unit_of_measure: string | null;
  status: string;
  sell_nassau: boolean;
  sell_andros: boolean;
  sell_online: boolean;
  sell_wholesale: boolean;
  image_url: string | null;
  primary_supplier_id: string | null;
  supplier_sku: string | null;
  pricing: Record<string, number>;
}

interface NewProduct {
  sku: string;
  name: string;
  description: string;
  category: string;
  is_bsc_processed: boolean;
  unit_type: string;
  sell_nassau: boolean;
  sell_andros: boolean;
  sell_online: boolean;
  sell_wholesale: boolean;
  cost_per_unit: string;
  prices: Record<string, string>;
  image_file: File | null;
  image_preview: string;
  primary_supplier_id: string;
  supplier_sku: string;
}

const BLANK_NEW: NewProduct = {
  sku: '', name: '', description: '', category: 'fresh_seafood',
  is_bsc_processed: false, unit_type: 'each',
  sell_nassau: true, sell_andros: false, sell_online: true, sell_wholesale: false,
  cost_per_unit: '',
  prices: { nassau_pos: '', andros_pos: '', online_market: '', local_wholesale: '' },
  image_file: null, image_preview: '',
  primary_supplier_id: '', supplier_sku: '',
};

export default function ProductsPage() {
  const supabase = getSupabase();
  const [products, setProducts]               = useState<Product[]>([]);
  const [suppliers, setSuppliers]             = useState<Supplier[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [search, setSearch]                   = useState('');
  const [filterCat, setFilterCat]             = useState('all');
  const [filterChan, setFilterChan]           = useState('all');
  const [selected, setSelected]               = useState<Product | null>(null);
  const [editPrices, setEditPrices]           = useState<Record<string, string>>({});
  const [editCost, setEditCost]               = useState<string>('');
  const [editChannels, setEditChannels]       = useState<Record<string, boolean>>({});
  const [editImageFile, setEditImageFile]     = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState('');
  const [editSupplierId, setEditSupplierId]   = useState('');
  const [editSupplierSku, setEditSupplierSku] = useState('');
  const [saving, setSaving]                   = useState(false);
  const [newProduct, setNewProduct]           = useState<NewProduct>(BLANK_NEW);
  const [adding, setAdding]                   = useState(false);
  const [toast, setToast]                     = useState<{ msg: string; ok: boolean } | null>(null);
  const [tab, setTab]                         = useState<'list' | 'add'>('list');

  // 3 image-source refs per form: Files / Gallery / Camera. All three write to
  // the same state — only the input element's `accept` + `capture` attributes
  // change what the browser surfaces to the user.
  const newFileRef    = useRef<HTMLInputElement>(null);
  const newGalleryRef = useRef<HTMLInputElement>(null);
  const newCameraRef  = useRef<HTMLInputElement>(null);
  const editFileRef    = useRef<HTMLInputElement>(null);
  const editGalleryRef = useRef<HTMLInputElement>(null);
  const editCameraRef  = useRef<HTMLInputElement>(null);

  // Legacy refs — some downstream callers still reference these names.
  const newImageRef  = newGalleryRef;
  const editImageRef = editGalleryRef;

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');
    setSuppliers(data ?? []);
  }, [supabase]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const { data: prods } = await supabase
      .from('products')
      .select('id, sku, name, description, category, is_bsc_processed, unit_type, unit_of_measure, status, sell_nassau, sell_andros, sell_online, sell_wholesale, image_url, primary_supplier_id, supplier_sku')
      .in('status', ['active', 'draft', 'pending_approval'])
      .order('name');

    const { data: pricing } = await supabase
      .from('product_pricing')
      .select('product_id, channel, manual_unit_price')
      .eq('is_current', true)
      .eq('is_active', true);

    const priceMap: Record<string, Record<string, number>> = {};
    for (const row of pricing ?? []) {
      if (!priceMap[row.product_id]) priceMap[row.product_id] = {};
      priceMap[row.product_id][row.channel] = Number(row.manual_unit_price);
    }

    setProducts((prods ?? []).map((p: any) => ({ ...p, pricing: priceMap[p.id] ?? {} })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadProducts();
    loadSuppliers();
  }, [loadProducts, loadSuppliers]);

  function openProduct(p: Product) {
    setSelected(p);
    setEditPrices({
      nassau_pos:      String(p.pricing['nassau_pos']      ?? ''),
      andros_pos:      String(p.pricing['andros_pos']      ?? ''),
      online_market:   String(p.pricing['online_market']   ?? ''),
      local_wholesale: String(p.pricing['local_wholesale'] ?? ''),
    });
    setEditChannels({
      nassau_pos:      p.sell_nassau,
      andros_pos:      p.sell_andros,
      online_market:   p.sell_online,
      local_wholesale: p.sell_wholesale,
    });
    setEditImageFile(null);
    setEditImagePreview('');
    setEditSupplierId(p.primary_supplier_id ?? '');
    setEditSupplierSku(p.supplier_sku ?? '');
    // Seed edit cost from any one channel's price (back-calc — use Nassau if available).
    const seedFrom = p.pricing['nassau_pos'] ?? p.pricing['online_market'] ?? p.pricing['andros_pos'] ?? p.pricing['local_wholesale'];
    if (seedFrom != null && Number(seedFrom) > 0) {
      const seedChan = p.pricing['nassau_pos'] != null ? 'nassau_pos'
                     : p.pricing['online_market'] != null ? 'online_market'
                     : p.pricing['andros_pos'] != null ? 'andros_pos'
                     : 'local_wholesale';
      setEditCost(chCostFromSell(seedChan, Number(seedFrom)).toFixed(2));
    } else {
      setEditCost('');
    }
  }

  // Auto-fill all 4 channel prices from a cost string. Returns the new
  // prices map; caller decides what to do (overwrite or merge).
  function pricesFromCost(cost: string, current: Record<string, string>): Record<string, string> {
    const c = parseFloat(cost);
    if (isNaN(c) || c <= 0) return current;
    return {
      ...current,
      nassau_pos:      chSellFromCost('nassau_pos',      c).toFixed(2),
      andros_pos:      chSellFromCost('andros_pos',      c).toFixed(2),
      online_market:   chSellFromCost('online_market',   c).toFixed(2),
      local_wholesale: chSellFromCost('local_wholesale', c).toFixed(2),
    };
  }

  // User typed in one channel's price → back-calc cost, then re-fill the OTHER
  // 3 channel prices from that cost. Source channel keeps the user's exact
  // input so they aren't fighting the calculator.
  function recalcFromChannelPrice(
    channel: string,
    sellStr: string,
    current: Record<string, string>,
  ): { cost: string; prices: Record<string, string> } {
    const s = parseFloat(sellStr);
    if (isNaN(s) || s <= 0) {
      return { cost: '', prices: { ...current, [channel]: sellStr } };
    }
    const cost = chCostFromSell(channel, s);
    const filled = pricesFromCost(cost.toFixed(2), current);
    return { cost: cost.toFixed(2), prices: { ...filled, [channel]: sellStr } };
  }

  // Back-compat shim for any callers that still pass `calcFromCost`.
  function calcFromCost(cost: string, setter: (p: Record<string, string>) => void, current: Record<string, string>) {
    const next = pricesFromCost(cost, current);
    if (next !== current) setter(next);
  }

  async function uploadImage(file: File, sku: string): Promise<string | null> {
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `products/${sku.toLowerCase()}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('site-images')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) { showToast('Image upload failed: ' + error.message, false); return null; }
    const { data } = supabase.storage.from('site-images').getPublicUrl(path);
    return data.publicUrl;
  }

  async function saveProduct() {
    if (!selected) return;
    setSaving(true);
    try {
      let imageUrl = selected.image_url;
      if (editImageFile) {
        const url = await uploadImage(editImageFile, selected.sku);
        if (url) imageUrl = url;
      }

      await supabase.from('products').update({
        sell_nassau:         editChannels['nassau_pos'],
        sell_andros:         editChannels['andros_pos'],
        sell_online:         editChannels['online_market'],
        sell_wholesale:      editChannels['local_wholesale'],
        image_url:           imageUrl,
        primary_supplier_id: editSupplierId || null,
        supplier_sku:        editSupplierSku.trim() || null,
      }).eq('id', selected.id);

      for (const ch of CHANNELS) {
        const price = parseFloat(editPrices[ch.key]);
        if (isNaN(price) || price <= 0) continue;
        await supabase.from('product_pricing').delete()
          .eq('product_id', selected.id).eq('channel', ch.key);
        await supabase.from('product_pricing').insert({
          product_id: selected.id, channel: ch.key,
          pricing_mode: 'manual', manual_unit_price: price,
          is_current: true, is_active: true,
          recorded_by: FOUNDER_ID, recorded_at: new Date().toISOString(),
        });
      }

      showToast('✓ Product updated');
      setSelected(null);
      loadProducts();
    } catch (err: any) {
      showToast('Save failed: ' + err.message, false);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddProduct() {
    if (!newProduct.name.trim() || !newProduct.sku.trim()) {
      showToast('Name and SKU are required', false);
      return;
    }
    setAdding(true);
    try {
      let imageUrl: string | null = null;
      if (newProduct.image_file) {
        imageUrl = await uploadImage(newProduct.image_file, newProduct.sku);
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('products')
        .insert({
          sku:                 newProduct.sku.trim().toUpperCase(),
          name:                newProduct.name.trim(),
          description:         newProduct.description.trim() || null,
          category:            newProduct.category,
          is_bsc_processed:    newProduct.is_bsc_processed,
          unit_type:           newProduct.unit_type,
          unit_of_measure:     newProduct.unit_type,
          sell_nassau:         newProduct.sell_nassau,
          sell_andros:         newProduct.sell_andros,
          sell_online:         newProduct.sell_online,
          sell_wholesale:      newProduct.sell_wholesale,
          image_url:           imageUrl,
          primary_supplier_id: newProduct.primary_supplier_id || null,
          supplier_sku:        newProduct.supplier_sku.trim() || null,
          status:              'active',
          created_by:          FOUNDER_ID,
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      for (const ch of CHANNELS) {
        const price = parseFloat(newProduct.prices[ch.key]);
        if (isNaN(price) || price <= 0) continue;
        await supabase.from('product_pricing').insert({
          product_id: inserted.id, channel: ch.key,
          pricing_mode: 'manual', manual_unit_price: price,
          is_current: true, is_active: true,
          recorded_by: FOUNDER_ID, recorded_at: new Date().toISOString(),
        });
      }

      showToast('✓ Product added successfully');
      setNewProduct(BLANK_NEW);
      setTab('list');
      loadProducts();
    } catch (err: any) {
      showToast('Failed: ' + err.message, false);
    } finally {
      setAdding(false);
    }
  }

  const filtered = products.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat  = filterCat === 'all' || p.category === filterCat;
    const matchChan =
      filterChan === 'all' ||
      (filterChan === 'nassau_pos'      && p.sell_nassau) ||
      (filterChan === 'andros_pos'      && p.sell_andros) ||
      (filterChan === 'online_market'   && p.sell_online) ||
      (filterChan === 'local_wholesale' && p.sell_wholesale);
    return matchSearch && matchCat && matchChan;
  });

  const activeCount  = products.filter(p => p.status === 'active').length;
  const nassauCount  = products.filter(p => p.sell_nassau).length;
  const onlineCount  = products.filter(p => p.sell_online).length;
  const androsCount  = products.filter(p => p.sell_andros).length;
  const noImageCount = products.filter(p => !p.image_url).length;

  // Supplier selector component used in both add + edit
  function SupplierSection({
    supplierId, supplierSku,
    onSupplierChange, onSkuChange,
  }: {
    supplierId: string; supplierSku: string;
    onSupplierChange: (v: string) => void; onSkuChange: (v: string) => void;
  }) {
    const selectedSupplier = suppliers.find(s => s.id === supplierId);
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#f5c518' }}>
            Supplier (Internal Only)
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
            style={{ backgroundColor: '#1a2e5a', color: 'rgba(255,255,255,0.5)' }}>
            🔒 Never shown to customers
          </span>
        </div>

        <select value={supplierId} onChange={e => onSupplierChange(e.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
          style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }}>
          <option value="">— No supplier assigned —</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
          ))}
        </select>

        {supplierId && (
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {selectedSupplier?.name} SKU / Item Code
            </label>
            <input value={supplierSku} onChange={e => onSkuChange(e.target.value)}
              placeholder="Supplier's own code for this product"
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white font-mono outline-none"
              style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
            <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Used on purchase orders and order fulfillment — not visible to customers
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#060d1f', fontFamily: "'DM Sans', sans-serif" }}>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl font-bold text-sm shadow-xl"
          style={{ backgroundColor: toast.ok ? '#16a34a' : '#dc2626', color: 'white' }}>
          {toast.msg}
        </div>
      )}

      <header className="sticky top-0 z-40 border-b px-4 py-3"
        style={{ backgroundColor: '#1a2e5a', borderColor: 'rgba(245,197,24,0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-bold text-lg" style={{ color: '#f5c518' }}>Product Management</h1>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {activeCount} active · {nassauCount} Nassau · {onlineCount} Online · {androsCount} Andros
              {noImageCount > 0 && <span style={{ color: '#f5c518' }}> · {noImageCount} missing images</span>}
            </p>
          </div>
          <button onClick={() => setTab(tab === 'add' ? 'list' : 'add')}
            className="px-4 py-2 rounded-xl font-bold text-sm"
            style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
            {tab === 'add' ? '← Back' : '+ Add Product'}
          </button>
        </div>
        <div className="flex gap-2">
          {(['list', 'add'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold"
              style={tab === t
                ? { backgroundColor: '#f5c518', color: '#060d1f' }
                : { backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
              {t === 'list' ? '📋 All Products' : '➕ Add New'}
            </button>
          ))}
        </div>
      </header>

      {/* ── ADD PRODUCT TAB ── */}
      {tab === 'add' && (
        <div className="p-4 max-w-xl mx-auto space-y-4">

          {/* Image upload — Files / Gallery / Camera */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#0f1f3d' }}>
            <input ref={newFileRef}    type="file" accept="image/*"                       className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setNewProduct(p => ({ ...p, image_file: f, image_preview: URL.createObjectURL(f) })); }} />
            <input ref={newGalleryRef} type="file" accept="image/*"                       className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setNewProduct(p => ({ ...p, image_file: f, image_preview: URL.createObjectURL(f) })); }} />
            <input ref={newCameraRef}  type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setNewProduct(p => ({ ...p, image_file: f, image_preview: URL.createObjectURL(f) })); }} />

            {newProduct.image_preview ? (
              <div className="relative">
                <img src={newProduct.image_preview} alt="Preview"
                  className="w-full object-cover" style={{ maxHeight: '240px' }} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-8"
                style={{ backgroundColor: '#1a2e5a' }}>
                <div className="text-5xl">📷</div>
                <p className="font-bold text-white text-sm">Add Product Photo</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Pick a source below</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 p-3" style={{ backgroundColor: '#0f1f3d' }}>
              <button type="button" onClick={() => newCameraRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl text-xs font-bold"
                style={{ backgroundColor: '#1a2e5a', color: '#f5c518', border: '1px solid rgba(245,197,24,0.25)' }}>
                <span className="text-xl">📸</span>
                <span>Camera</span>
              </button>
              <button type="button" onClick={() => newGalleryRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl text-xs font-bold"
                style={{ backgroundColor: '#1a2e5a', color: '#f5c518', border: '1px solid rgba(245,197,24,0.25)' }}>
                <span className="text-xl">🖼️</span>
                <span>Gallery</span>
              </button>
              <button type="button" onClick={() => newFileRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl text-xs font-bold"
                style={{ backgroundColor: '#1a2e5a', color: '#f5c518', border: '1px solid rgba(245,197,24,0.25)' }}>
                <span className="text-xl">📁</span>
                <span>Files</span>
              </button>
            </div>

            {newProduct.image_preview && (
              <div className="px-4 py-2 flex items-center justify-between border-t"
                style={{ borderColor: 'rgba(245,197,24,0.15)' }}>
                <span className="text-xs" style={{ color: '#4ade80' }}>✓ Photo selected</span>
                <button onClick={() => setNewProduct(p => ({ ...p, image_file: null, image_preview: '' }))}
                  className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Remove</button>
              </div>
            )}
          </div>

          {/* Product details */}
          <div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: '#0f1f3d' }}>
            <h2 className="font-bold text-white">Product Details</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>BSC SKU *</label>
                <input value={newProduct.sku}
                  onChange={e => setNewProduct(p => ({ ...p, sku: e.target.value }))}
                  placeholder="e.g. LBTAIL-P3"
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white font-mono outline-none"
                  style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Unit Type</label>
                <select value={newProduct.unit_type}
                  onChange={e => setNewProduct(p => ({ ...p, unit_type: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                  style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }}>
                  <option value="each">Each (unit)</option>
                  <option value="lb">Per lb (weight)</option>
                  <option value="bag">Bag</option>
                  <option value="case">Case</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Product Name *</label>
              <input value={newProduct.name}
                onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Lobster Tail Premium #1"
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
            </div>

            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Description</label>
              <input value={newProduct.description}
                onChange={e => setNewProduct(p => ({ ...p, description: e.target.value }))}
                placeholder="Short description for online market"
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
            </div>

            <div>
              <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Category</label>
              <select value={newProduct.category}
                onChange={e => setNewProduct(p => ({ ...p, category: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ backgroundColor: '#1a2e5a' }}>
              <div>
                <p className="text-sm font-bold text-white">BSC Processed</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Processed at Spiny Tail</p>
              </div>
              <button onClick={() => setNewProduct(p => ({ ...p, is_bsc_processed: !p.is_bsc_processed }))}
                className="w-12 h-6 rounded-full transition-colors relative"
                style={{ backgroundColor: newProduct.is_bsc_processed ? '#f5c518' : '#374151' }}>
                <div className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ left: newProduct.is_bsc_processed ? '26px' : '4px' }} />
              </button>
            </div>
          </div>

          {/* Supplier — internal only */}
          <div className="rounded-2xl p-5" style={{ backgroundColor: '#0f1f3d' }}>
            <SupplierSection
              supplierId={newProduct.primary_supplier_id}
              supplierSku={newProduct.supplier_sku}
              onSupplierChange={v => setNewProduct(p => ({ ...p, primary_supplier_id: v }))}
              onSkuChange={v => setNewProduct(p => ({ ...p, supplier_sku: v }))}
            />
          </div>

          {/* Channels */}
          <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#0f1f3d' }}>
            <h2 className="font-bold text-white">Sales Channels</h2>
            {CHANNELS.map(ch => {
              const isOn =
                ch.key === 'nassau_pos'      ? newProduct.sell_nassau :
                ch.key === 'andros_pos'      ? newProduct.sell_andros :
                ch.key === 'online_market'   ? newProduct.sell_online :
                newProduct.sell_wholesale;
              return (
                <div key={ch.key} className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ backgroundColor: '#1a2e5a' }}>
                  <div>
                    <p className="text-sm font-bold text-white">{ch.emoji} {ch.label}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Margin: {(ch.margin * 100).toFixed(0)}%
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (ch.key === 'nassau_pos')      setNewProduct(p => ({ ...p, sell_nassau: !p.sell_nassau }));
                      if (ch.key === 'andros_pos')      setNewProduct(p => ({ ...p, sell_andros: !p.sell_andros }));
                      if (ch.key === 'online_market')   setNewProduct(p => ({ ...p, sell_online: !p.sell_online }));
                      if (ch.key === 'local_wholesale') setNewProduct(p => ({ ...p, sell_wholesale: !p.sell_wholesale }));
                    }}
                    className="w-12 h-6 rounded-full transition-colors relative"
                    style={{ backgroundColor: isOn ? '#f5c518' : '#374151' }}>
                    <div className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                      style={{ left: isOn ? '26px' : '4px' }} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Pricing — type in ANY field, the others auto-fill from channel margins */}
          <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#0f1f3d' }}>
            <h2 className="font-bold text-white">Pricing</h2>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Type either the cost OR any channel price — the rest auto-calculate from BSC margins
              (Nassau 38% · Andros 43% · Online 25% + 10% VAT · Wholesale 15%).
            </p>
            <div className="rounded-xl px-4 py-3" style={{ backgroundColor: '#1a2e5a' }}>
              <label className="text-xs font-bold mb-2 block" style={{ color: '#f5c518' }}>
                Cost Per Unit
              </label>
              <input type="number" step="0.01" min="0" placeholder="e.g. 6.50"
                value={newProduct.cost_per_unit}
                onChange={e => {
                  const v = e.target.value;
                  setNewProduct(p => ({ ...p, cost_per_unit: v, prices: pricesFromCost(v, p.prices) }));
                }}
                className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
                style={{ backgroundColor: '#060d1f', border: '1px solid rgba(245,197,24,0.3)' }} />
            </div>
            {CHANNELS.map(ch => (
              <div key={ch.key}>
                <label className="text-xs font-bold mb-1 block" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {ch.emoji} {ch.label} Price (BSD $)
                </label>
                <input type="number" step="0.01" min="0" placeholder="0.00"
                  value={newProduct.prices[ch.key]}
                  onChange={e => {
                    const v = e.target.value;
                    setNewProduct(p => {
                      const { cost, prices } = recalcFromChannelPrice(ch.key, v, p.prices);
                      return { ...p, cost_per_unit: cost || p.cost_per_unit, prices };
                    });
                  }}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                  style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
              </div>
            ))}
          </div>

          <button onClick={handleAddProduct} disabled={adding}
            className="w-full py-4 rounded-2xl font-bold text-base disabled:opacity-50"
            style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
            {adding ? 'Adding…' : '➕ Add Product'}
          </button>
        </div>
      )}

      {/* ── PRODUCT LIST TAB ── */}
      {tab === 'list' && (
        <div className="p-4 space-y-3">
          <input type="search" placeholder="Search by name or SKU…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
            style={{ backgroundColor: '#0f1f3d', border: '1px solid rgba(245,197,24,0.2)' }} />

          <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
            {[{ key: 'all', label: 'All' }, ...CHANNELS].map(ch => (
              <button key={ch.key} onClick={() => setFilterChan(ch.key)}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold"
                style={filterChan === ch.key
                  ? { backgroundColor: '#f5c518', color: '#060d1f' }
                  : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
                {'emoji' in ch ? `${ch.emoji} ` : ''}{ch.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
            <button onClick={() => setFilterCat('all')}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold"
              style={filterCat === 'all'
                ? { backgroundColor: '#f5c518', color: '#060d1f' }
                : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
              All Categories
            </button>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setFilterCat(c)}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold"
                style={filterCat === c
                  ? { backgroundColor: '#f5c518', color: '#060d1f' }
                  : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{filtered.length} products</p>

          {loading ? (
            <div className="text-center py-12 text-sm animate-pulse" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Loading products…
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(p => {
                const supplier = suppliers.find(s => s.id === p.primary_supplier_id);
                return (
                  <button key={p.id} onClick={() => openProduct(p)}
                    className="w-full text-left rounded-xl border transition"
                    style={{ backgroundColor: '#0f1f3d', borderColor: 'rgba(245,197,24,0.15)' }}>
                    <div className="flex items-stretch">
                      <div className="shrink-0 w-20 h-20 rounded-l-xl overflow-hidden"
                        style={{ backgroundColor: '#1a2e5a' }}>
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                        )}
                      </div>
                      <div className="flex flex-1 items-start justify-between gap-3 p-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: '#1a2e5a', color: 'rgba(255,255,255,0.5)' }}>
                              {p.sku}
                            </span>
                            {p.is_bsc_processed && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900 text-blue-300">BSC</span>
                            )}
                            {p.unit_type === 'lb' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900 text-amber-300">/lb</span>
                            )}
                            {!p.image_url && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900 text-red-300">No image</span>
                            )}
                          </div>
                          <p className="text-sm font-bold text-white truncate">{p.name}</p>
                          {supplier && (
                            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                              🔒 {supplier.name}{p.supplier_sku ? ` · ${p.supplier_sku}` : ''}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="flex gap-1 flex-wrap justify-end mb-1">
                            {p.sell_nassau    && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-900 text-yellow-300">🟡</span>}
                            {p.sell_andros    && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-900 text-purple-300">🟣</span>}
                            {p.sell_online    && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-900 text-blue-300">🛒</span>}
                            {p.sell_wholesale && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900 text-green-300">📦</span>}
                          </div>
                          <div className="text-xs space-y-0.5" style={{ color: '#f5c518' }}>
                            {p.sell_nassau  && p.pricing['nassau_pos']    && <div>${p.pricing['nassau_pos'].toFixed(2)}</div>}
                            {p.sell_online  && p.pricing['online_market']  && <div>${p.pricing['online_market'].toFixed(2)}</div>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── EDIT PRODUCT MODAL ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border overflow-y-auto"
            style={{ backgroundColor: '#0f1f3d', borderColor: 'rgba(245,197,24,0.2)', maxHeight: '92dvh' }}>

            <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b"
              style={{ backgroundColor: '#0f1f3d', borderColor: 'rgba(245,197,24,0.2)' }}>
              <div>
                <p className="font-bold text-white">{selected.name}</p>
                <p className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>{selected.sku}</p>
              </div>
              <button onClick={() => setSelected(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-lg"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'white' }}>×</button>
            </div>

            <div className="p-5 space-y-5">

              {/* Image — Files / Gallery / Camera */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#f5c518' }}>
                  Product Photo
                </h3>
                <input ref={editFileRef}    type="file" accept="image/*"                       className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setEditImageFile(f); setEditImagePreview(URL.createObjectURL(f)); } }} />
                <input ref={editGalleryRef} type="file" accept="image/*"                       className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setEditImageFile(f); setEditImagePreview(URL.createObjectURL(f)); } }} />
                <input ref={editCameraRef}  type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setEditImageFile(f); setEditImagePreview(URL.createObjectURL(f)); } }} />

                <div className="overflow-hidden rounded-xl"
                  style={{ backgroundColor: '#1a2e5a' }}>
                  {editImagePreview || selected.image_url ? (
                    <img src={editImagePreview || selected.image_url!} alt={selected.name}
                      className="w-full object-cover" style={{ maxHeight: '200px' }} />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-6">
                      <div className="text-3xl">📷</div>
                      <p className="text-sm font-bold text-white">Add Photo</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Pick a source below</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 mt-2">
                  <button type="button" onClick={() => editCameraRef.current?.click()}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold"
                    style={{ backgroundColor: '#1a2e5a', color: '#f5c518', border: '1px solid rgba(245,197,24,0.25)' }}>
                    <span className="text-lg">📸</span><span>Camera</span>
                  </button>
                  <button type="button" onClick={() => editGalleryRef.current?.click()}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold"
                    style={{ backgroundColor: '#1a2e5a', color: '#f5c518', border: '1px solid rgba(245,197,24,0.25)' }}>
                    <span className="text-lg">🖼️</span><span>Gallery</span>
                  </button>
                  <button type="button" onClick={() => editFileRef.current?.click()}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold"
                    style={{ backgroundColor: '#1a2e5a', color: '#f5c518', border: '1px solid rgba(245,197,24,0.25)' }}>
                    <span className="text-lg">📁</span><span>Files</span>
                  </button>
                </div>

                {editImagePreview && (
                  <p className="text-xs mt-1.5" style={{ color: '#4ade80' }}>✓ New photo selected — save to apply</p>
                )}
              </div>

              {/* Supplier */}
              <div className="rounded-xl p-4" style={{ backgroundColor: '#1a2e5a' }}>
                <SupplierSection
                  supplierId={editSupplierId}
                  supplierSku={editSupplierSku}
                  onSupplierChange={setEditSupplierId}
                  onSkuChange={setEditSupplierSku}
                />
              </div>

              {/* Channels */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#f5c518' }}>
                  Sales Channels
                </h3>
                <div className="space-y-2">
                  {CHANNELS.map(ch => (
                    <div key={ch.key} className="flex items-center justify-between rounded-xl px-4 py-3"
                      style={{ backgroundColor: '#1a2e5a' }}>
                      <p className="text-sm font-bold text-white">{ch.emoji} {ch.label}</p>
                      <button
                        onClick={() => setEditChannels(prev => ({ ...prev, [ch.key]: !prev[ch.key] }))}
                        className="w-12 h-6 rounded-full transition-colors relative"
                        style={{ backgroundColor: editChannels[ch.key] ? '#f5c518' : '#374151' }}>
                        <div className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                          style={{ left: editChannels[ch.key] ? '26px' : '4px' }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pricing */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#f5c518' }}>
                  Prices (BSD $)
                </h3>
                <p className="text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Type cost OR any channel price — the rest auto-fill from BSC margins.
                </p>
                <div className="rounded-xl px-4 py-3 mb-3" style={{ backgroundColor: '#1a2e5a' }}>
                  <label className="text-xs font-bold mb-2 block" style={{ color: '#f5c518' }}>
                    Cost Per Unit
                  </label>
                  <input type="number" step="0.01" min="0"
                    placeholder="Cost per unit"
                    value={editCost}
                    onChange={e => {
                      const v = e.target.value;
                      setEditCost(v);
                      setEditPrices(prev => pricesFromCost(v, prev));
                    }}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
                    style={{ backgroundColor: '#060d1f', border: '1px solid rgba(245,197,24,0.3)' }} />
                </div>
                <div className="space-y-2">
                  {CHANNELS.map(ch => (
                    <div key={ch.key} className="flex items-center gap-3">
                      <label className="text-xs font-semibold w-28 shrink-0"
                        style={{ color: 'rgba(255,255,255,0.6)' }}>
                        {ch.emoji} {ch.label}
                      </label>
                      <input type="number" step="0.01" min="0" placeholder="0.00"
                        value={editPrices[ch.key]}
                        onChange={e => {
                          const v = e.target.value;
                          const { cost, prices } = recalcFromChannelPrice(ch.key, v, editPrices);
                          setEditPrices(prices);
                          if (cost) setEditCost(cost);
                        }}
                        className="flex-1 rounded-xl px-3 py-2 text-sm text-white outline-none"
                        style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setSelected(null)}
                  className="flex-1 py-3 rounded-xl text-sm font-bold"
                  style={{ backgroundColor: '#1f2937', color: '#9ca3af' }}>
                  Cancel
                </button>
                <button onClick={saveProduct} disabled={saving}
                  className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-50"
                  style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                  {saving ? 'Saving…' : '✓ Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
