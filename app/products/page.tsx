'use client';

import { useEffect, useState, useCallback } from 'react';
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
  { key: 'nassau_pos',    label: 'Nassau POS',    emoji: '🟡', margin: 0.38 },
  { key: 'andros_pos',    label: 'Andros POS',    emoji: '🟣', margin: 0.43 },
  { key: 'online_market', label: 'Online Market', emoji: '🛒', margin: 0.12 },
  { key: 'local_wholesale', label: 'Wholesale',   emoji: '📦', margin: 0.12 },
];

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
  pricing: Record<string, number>; // channel -> price
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
}

const BLANK_NEW: NewProduct = {
  sku: '', name: '', description: '', category: 'fresh_seafood',
  is_bsc_processed: false, unit_type: 'each',
  sell_nassau: true, sell_andros: false, sell_online: true, sell_wholesale: false,
  cost_per_unit: '',
  prices: { nassau_pos: '', andros_pos: '', online_market: '', local_wholesale: '' },
};

export default function ProductsPage() {
  const supabase = getSupabase();
  const [products, setProducts]       = useState<Product[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filterCat, setFilterCat]     = useState('all');
  const [filterChan, setFilterChan]   = useState('all');
  const [selected, setSelected]       = useState<Product | null>(null);
  const [editPrices, setEditPrices]   = useState<Record<string, string>>({});
  const [editChannels, setEditChannels] = useState<Record<string, boolean>>({});
  const [saving, setSaving]           = useState(false);
  const [showAdd, setShowAdd]         = useState(false);
  const [newProduct, setNewProduct]   = useState<NewProduct>(BLANK_NEW);
  const [adding, setAdding]           = useState(false);
  const [toast, setToast]             = useState<string | null>(null);
  const [tab, setTab]                 = useState<'list' | 'add'>('list');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const { data: prods } = await supabase
      .from('products')
      .select('id, sku, name, description, category, is_bsc_processed, unit_type, unit_of_measure, status, sell_nassau, sell_andros, sell_online, sell_wholesale, image_url')
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

    setProducts((prods ?? []).map((p: any) => ({
      ...p,
      pricing: priceMap[p.id] ?? {},
    })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  function openProduct(p: Product) {
    setSelected(p);
    setEditPrices({
      nassau_pos:     String(p.pricing['nassau_pos']     ?? ''),
      andros_pos:     String(p.pricing['andros_pos']     ?? ''),
      online_market:  String(p.pricing['online_market']  ?? ''),
      local_wholesale:String(p.pricing['local_wholesale']?? ''),
    });
    setEditChannels({
      nassau_pos:     p.sell_nassau,
      andros_pos:     p.sell_andros,
      online_market:  p.sell_online,
      local_wholesale:p.sell_wholesale,
    });
  }

  // Auto-calculate prices from cost
  function calcFromCost(cost: string, setter: (prices: Record<string, string>) => void, current: Record<string, string>) {
    const c = parseFloat(cost);
    if (isNaN(c) || c <= 0) return;
    setter({
      ...current,
      nassau_pos:      (c / (1 - 0.38)).toFixed(2),
      andros_pos:      (c / (1 - 0.43)).toFixed(2),
      online_market:   (c / (1 - 0.12)).toFixed(2),
      local_wholesale: (c / (1 - 0.12)).toFixed(2),
    });
  }

  async function saveProduct() {
    if (!selected) return;
    setSaving(true);
    try {
      // Update channel flags
      await supabase.from('products').update({
        sell_nassau:    editChannels['nassau_pos'],
        sell_andros:    editChannels['andros_pos'],
        sell_online:    editChannels['online_market'],
        sell_wholesale: editChannels['local_wholesale'],
      }).eq('id', selected.id);

      // Update prices — delete old then insert new (unique constraint workaround)
      for (const ch of CHANNELS) {
        const price = parseFloat(editPrices[ch.key]);
        if (isNaN(price) || price <= 0) continue;

        await supabase.from('product_pricing')
          .delete()
          .eq('product_id', selected.id)
          .eq('channel', ch.key);

        await supabase.from('product_pricing').insert({
          product_id:        selected.id,
          channel:           ch.key,
          pricing_mode:      'manual',
          manual_unit_price: price,
          is_current:        true,
          is_active:         true,
          recorded_by:       FOUNDER_ID,
          recorded_at:       new Date().toISOString(),
        });
      }

      showToast('✓ Product updated');
      setSelected(null);
      loadProducts();
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddProduct() {
    if (!newProduct.name.trim() || !newProduct.sku.trim()) {
      alert('Name and SKU are required');
      return;
    }
    setAdding(true);
    try {
      const { data: inserted, error: insertErr } = await supabase
        .from('products')
        .insert({
          sku:              newProduct.sku.trim().toUpperCase(),
          name:             newProduct.name.trim(),
          description:      newProduct.description.trim() || null,
          category:         newProduct.category,
          is_bsc_processed: newProduct.is_bsc_processed,
          unit_type:        newProduct.unit_type,
          unit_of_measure:  newProduct.unit_type,
          sell_nassau:      newProduct.sell_nassau,
          sell_andros:      newProduct.sell_andros,
          sell_online:      newProduct.sell_online,
          sell_wholesale:   newProduct.sell_wholesale,
          status:           'active',
          created_by:       FOUNDER_ID,
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      const productId = inserted.id;

      // Insert pricing for each enabled channel with a price
      for (const ch of CHANNELS) {
        const price = parseFloat(newProduct.prices[ch.key]);
        if (isNaN(price) || price <= 0) continue;

        await supabase.from('product_pricing').insert({
          product_id:        productId,
          channel:           ch.key,
          pricing_mode:      'manual',
          manual_unit_price: price,
          is_current:        true,
          is_active:         true,
          recorded_by:       FOUNDER_ID,
          recorded_at:       new Date().toISOString(),
        });
      }

      showToast('✓ Product added successfully');
      setNewProduct(BLANK_NEW);
      setTab('list');
      loadProducts();
    } catch (err: any) {
      alert('Failed to add product: ' + err.message);
    } finally {
      setAdding(false);
    }
  }

  const filtered = products.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'all' || p.category === filterCat;
    const matchChan =
      filterChan === 'all' ||
      (filterChan === 'nassau_pos'     && p.sell_nassau) ||
      (filterChan === 'andros_pos'     && p.sell_andros) ||
      (filterChan === 'online_market'  && p.sell_online) ||
      (filterChan === 'local_wholesale'&& p.sell_wholesale);
    return matchSearch && matchCat && matchChan;
  });

  const activeCount  = products.filter(p => p.status === 'active').length;
  const nassauCount  = products.filter(p => p.sell_nassau).length;
  const onlineCount  = products.filter(p => p.sell_online).length;
  const androsCount  = products.filter(p => p.sell_andros).length;

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#060d1f', fontFamily: "'DM Sans', sans-serif" }}>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl font-bold text-sm shadow-xl"
          style={{ backgroundColor: '#16a34a', color: 'white' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 border-b px-4 py-3"
        style={{ backgroundColor: '#1a2e5a', borderColor: 'rgba(245,197,24,0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-bold text-lg" style={{ color: '#f5c518' }}>Product Management</h1>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {activeCount} active · {nassauCount} Nassau · {onlineCount} Online · {androsCount} Andros
            </p>
          </div>
          <button onClick={() => setTab(tab === 'add' ? 'list' : 'add')}
            className="px-4 py-2 rounded-xl font-bold text-sm"
            style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
            {tab === 'add' ? '← Back' : '+ Add Product'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(['list', 'add'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold capitalize"
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
          <div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: '#0f1f3d' }}>
            <h2 className="font-bold text-white">Product Details</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>SKU *</label>
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

            {/* BSC Processed toggle */}
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

          {/* Channel toggles */}
          <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#0f1f3d' }}>
            <h2 className="font-bold text-white">Sales Channels</h2>
            {CHANNELS.map(ch => {
              const chanKey = ch.key as keyof NewProduct;
              const isOn = newProduct[chanKey] as boolean;
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

          {/* Pricing */}
          <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: '#0f1f3d' }}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">Pricing</h2>
            </div>

            {/* Cost auto-calc */}
            <div className="rounded-xl px-4 py-3" style={{ backgroundColor: '#1a2e5a' }}>
              <label className="text-xs font-bold mb-2 block" style={{ color: '#f5c518' }}>
                Cost Per Unit (auto-calculate prices)
              </label>
              <div className="flex gap-2">
                <input
                  type="number" step="0.01" min="0"
                  placeholder="e.g. 6.50"
                  value={newProduct.cost_per_unit}
                  onChange={e => setNewProduct(p => ({ ...p, cost_per_unit: e.target.value }))}
                  className="flex-1 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  style={{ backgroundColor: '#060d1f', border: '1px solid rgba(245,197,24,0.3)' }} />
                <button
                  onClick={() => calcFromCost(
                    newProduct.cost_per_unit,
                    prices => setNewProduct(p => ({ ...p, prices })),
                    newProduct.prices
                  )}
                  className="px-4 py-2 rounded-xl text-xs font-bold"
                  style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                  Calculate
                </button>
              </div>
            </div>

            {CHANNELS.map(ch => (
              <div key={ch.key}>
                <label className="text-xs font-bold mb-1 block" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {ch.emoji} {ch.label} Price (BSD $)
                </label>
                <input
                  type="number" step="0.01" min="0"
                  placeholder="0.00"
                  value={newProduct.prices[ch.key]}
                  onChange={e => setNewProduct(p => ({
                    ...p,
                    prices: { ...p.prices, [ch.key]: e.target.value }
                  }))}
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

          {/* Search + filters */}
          <input type="search" placeholder="Search by name or SKU…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
            style={{ backgroundColor: '#0f1f3d', border: '1px solid rgba(245,197,24,0.2)' }} />

          {/* Channel filter */}
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

          {/* Category filter */}
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

          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {filtered.length} products
          </p>

          {loading ? (
            <div className="text-center py-12 text-sm animate-pulse" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Loading products…
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(p => (
                <button key={p.id} onClick={() => openProduct(p)}
                  className="w-full text-left rounded-xl p-4 border transition"
                  style={{ backgroundColor: '#0f1f3d', borderColor: 'rgba(245,197,24,0.15)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
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
                      </div>
                      <p className="text-sm font-bold text-white truncate">{p.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {CATEGORY_LABELS[p.category] ?? p.category}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {/* Channel badges */}
                      <div className="flex gap-1 flex-wrap justify-end mb-1">
                        {p.sell_nassau    && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-900 text-yellow-300">🟡 Nassau</span>}
                        {p.sell_andros    && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-900 text-purple-300">🟣 Andros</span>}
                        {p.sell_online    && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-900 text-blue-300">🛒 Online</span>}
                        {p.sell_wholesale && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900 text-green-300">📦 Wholesale</span>}
                      </div>
                      {/* Prices */}
                      <div className="text-xs space-y-0.5" style={{ color: '#f5c518' }}>
                        {p.sell_nassau    && p.pricing['nassau_pos']     && <div>🟡 ${p.pricing['nassau_pos'].toFixed(2)}</div>}
                        {p.sell_online    && p.pricing['online_market']  && <div>🛒 ${p.pricing['online_market'].toFixed(2)}</div>}
                        {p.sell_andros    && p.pricing['andros_pos']     && <div>🟣 ${p.pricing['andros_pos'].toFixed(2)}</div>}
                        {p.sell_wholesale && p.pricing['local_wholesale']&& <div>📦 ${p.pricing['local_wholesale'].toFixed(2)}</div>}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
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

              {/* Channel toggles */}
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

              {/* Price editing */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#f5c518' }}>
                  Prices (BSD $)
                </h3>

                {/* Auto-calc from cost */}
                <div className="rounded-xl px-4 py-3 mb-3" style={{ backgroundColor: '#1a2e5a' }}>
                  <label className="text-xs font-bold mb-2 block" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    Recalculate from cost
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="cost-input-edit"
                      type="number" step="0.01" min="0"
                      placeholder="Cost per unit"
                      className="flex-1 rounded-xl px-3 py-2 text-sm text-white outline-none"
                      style={{ backgroundColor: '#060d1f', border: '1px solid rgba(245,197,24,0.3)' }} />
                    <button
                      onClick={() => {
                        const costEl = document.getElementById('cost-input-edit') as HTMLInputElement;
                        calcFromCost(costEl?.value ?? '', setEditPrices, editPrices);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold"
                      style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                      Calculate
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {CHANNELS.map(ch => (
                    <div key={ch.key} className="flex items-center gap-3">
                      <label className="text-xs font-semibold w-28 shrink-0" style={{ color: 'rgba(255,255,255,0.6)' }}>
                        {ch.emoji} {ch.label}
                      </label>
                      <input
                        type="number" step="0.01" min="0"
                        placeholder="0.00"
                        value={editPrices[ch.key]}
                        onChange={e => setEditPrices(prev => ({ ...prev, [ch.key]: e.target.value }))}
                        className="flex-1 rounded-xl px-3 py-2 text-sm text-white outline-none"
                        style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Save */}
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
