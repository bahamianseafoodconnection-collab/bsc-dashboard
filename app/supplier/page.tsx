'use client';
// trigger rebuild

import { useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { canLock, useUserRole } from '@/lib/role';
import AddInventoryButton from '@/components/intake/AddInventoryButton';

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

const SUPPLIER_TYPES = [
{ value: 'bsc_direct', label: 'BSC Direct (Boat Captain)' },
{ value: 'wholesale_partner', label: 'Wholesale Partner' },
{ value: 'us_partner', label: 'US Partner' },
{ value: 'local_farm', label: 'Local Farm' },
{ value: 'other', label: 'Other' },
];

const EMOJI_OPTIONS = [
'🏪','🚢','🎣','🏭','🌴','🛒','🤝','📦','🍱','🥩','🦐','🐟',
'🌱','🇧🇸','🇺🇸','⚡','🔧','🚗','❄️','🧊','🐚','🦞',
];

const COLOR_OPTIONS = [
'#1B4F72','#1E5C2E','#784212','#1A5276','#2C3E50',
'#922B21','#196F3D','#1a2e5a','#7c3aed','#0369a1',
'#047857','#b45309','#be123c','#6d28d9','#0f766e',
];

interface SupplierForm {
code: string;
name: string;
supplier_type: string;
brand_color: string;
brand_emoji: string;
brand_name: string;
contact_name: string;
contact_email: string;
contact_phone: string;
contact_whatsapp: string;
address: string;
country: string;
payment_terms: string;
website: string;
phone: string;
is_active: boolean;
notes: string;
}

interface Supplier extends SupplierForm {
id: string;
product_count?: number;
}

// Product summary used by the expanded "Products" section under each supplier card.
interface SupplierProduct {
id: string;
sku: string;
name: string;
category: string | null;
unit_of_measure: string | null;
pack_size: string | null;
status: string;
sell_nassau: boolean;
sell_andros: boolean;
sell_online: boolean;
sell_wholesale: boolean;
cost_per_unit: number | null;
online_sell_price: number | null;
}

interface Toast { msg: string; ok: boolean; }

const BLANK: SupplierForm = {
code: '', name: '', supplier_type: 'wholesale_partner',
brand_color: '#1a2e5a', brand_emoji: '🏪', brand_name: '',
contact_name: '', contact_email: '', contact_phone: '',
contact_whatsapp: '', address: '', country: 'Bahamas',
payment_terms: '', website: '', phone: '', is_active: true, notes: '',
};

export default function SupplierPage() {
const supabase = getSupabase();
const [suppliers, setSuppliers] = useState<Supplier[]>([]);
const [loading, setLoading] = useState(true);
const [search, setSearch] = useState('');
const [filterType, setFilterType] = useState('all');
const [selected, setSelected] = useState<Supplier | null>(null);
const [form, setForm] = useState<SupplierForm>({ ...BLANK });
const [tab, setTab] = useState<'list' | 'add'>('list');
const [saving, setSaving] = useState(false);
const [toast, setToast] = useState<Toast | null>(null);

// Per-supplier products expansion state.
const [expandedId, setExpandedId] = useState<string | null>(null);
const [productsBySupplier, setProductsBySupplier] = useState<Record<string, SupplierProduct[]>>({});
const [productsLoading, setProductsLoading] = useState<string | null>(null);

// Role gate: only founder + co_founder can flip status / channel toggles.
const { role } = useUserRole();
const canEdit = canLock(role);

function showToast(msg: string, ok = true) {
setToast({ msg, ok });
setTimeout(() => setToast(null), 3000);
}

const loadSuppliers = useCallback(async () => {
setLoading(true);
const { data: sups } = await supabase.from('suppliers').select('*').order('name');
const { data: prodCounts } = await supabase
.from('products').select('primary_supplier_id')
.not('primary_supplier_id', 'is', null);
const countMap: Record<string, number> = {};
for (const p of (prodCounts ?? []) as { primary_supplier_id: string | null }[]) {
if (p.primary_supplier_id) {
countMap[p.primary_supplier_id] = (countMap[p.primary_supplier_id] ?? 0) + 1;
}
}
const list = (sups ?? []) as Supplier[];
setSuppliers(list.map((s: Supplier) => ({ ...s, product_count: countMap[s.id] ?? 0 })));
setLoading(false);
}, [supabase]);

useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

function openAdd() { setForm({ ...BLANK }); setTab('add'); setSelected(null); }
function openEdit(s: Supplier) { setSelected(s); setForm({ ...s }); setTab('add'); }

async function handleSave() {
if (!form.name?.trim() || !form.code?.trim()) {
showToast('Name and Code are required', false); return;
}
setSaving(true);
try {
const payload = {
code: form.code?.trim().toUpperCase(),
name: form.name?.trim(),
supplier_type: form.supplier_type,
brand_color: form.brand_color,
brand_emoji: form.brand_emoji,
brand_name: form.brand_name?.trim() || null,
contact_name: form.contact_name?.trim() || null,
contact_email: form.contact_email?.trim() || null,
contact_phone: form.contact_phone?.trim() || null,
contact_whatsapp: form.contact_whatsapp?.trim() || null,
address: form.address?.trim() || null,
country: form.country?.trim() || 'Bahamas',
payment_terms: form.payment_terms?.trim() || null,
website: form.website?.trim() || null,
phone: form.phone?.trim() || null,
is_active: form.is_active ?? true,
notes: form.notes?.trim() || null,
updated_at: new Date().toISOString(),
};
if (selected) {
const { error } = await supabase.from('suppliers').update(payload).eq('id', selected.id);
if (error) throw error;
showToast('Supplier updated');
} else {
const { error } = await supabase.from('suppliers').insert({ ...payload, created_by: FOUNDER_ID });
if (error) throw error;
showToast('Supplier added');
}
setTab('list'); setSelected(null); setForm({ ...BLANK }); loadSuppliers();
} catch (err) {
showToast('Failed: ' + (err instanceof Error ? err.message : String(err)), false);
} finally {
setSaving(false);
}
}

async function toggleActive(s: Supplier) {
await supabase.from('suppliers')
.update({ is_active: !s.is_active, updated_at: new Date().toISOString() })
.eq('id', s.id);
loadSuppliers();
}

// ── Per-supplier product management ──

async function loadProductsFor(supplierId: string) {
setProductsLoading(supplierId);
try {
const { data: prods, error } = await supabase
.from('products')
.select('id, sku, name, category, unit_of_measure, pack_size, status, sell_nassau, sell_andros, sell_online, sell_wholesale')
.eq('primary_supplier_id', supplierId)
.order('status', { ascending: true })
.order('sku',    { ascending: true });
if (error) throw error;
const rows = (prods ?? []) as Array<Omit<SupplierProduct, 'cost_per_unit' | 'online_sell_price'>>;
const ids  = rows.map((r) => r.id);
const costMap: Record<string, number> = {};
const priceMap: Record<string, number> = {};
if (ids.length > 0) {
const { data: costs } = await supabase
.from('product_costs')
.select('product_id, cost_per_unit')
.in('product_id', ids)
.eq('is_current', true);
for (const c of (costs ?? []) as { product_id: string; cost_per_unit: number | null }[]) {
if (c.cost_per_unit !== null) costMap[c.product_id] = Number(c.cost_per_unit);
}
const { data: prices } = await supabase
.from('product_pricing')
.select('product_id, manual_unit_price, channel')
.in('product_id', ids)
.eq('channel', 'online_market')
.eq('is_current', true);
for (const p of (prices ?? []) as { product_id: string; manual_unit_price: number | null }[]) {
if (p.manual_unit_price !== null) priceMap[p.product_id] = Number(p.manual_unit_price);
}
}
const merged: SupplierProduct[] = rows.map((r) => ({
...r,
cost_per_unit:     costMap[r.id]  ?? null,
online_sell_price: priceMap[r.id] ?? null,
}));
setProductsBySupplier((prev) => ({ ...prev, [supplierId]: merged }));
} catch (err) {
showToast('Failed to load products: ' + (err instanceof Error ? err.message : String(err)), false);
} finally {
setProductsLoading(null);
}
}

function toggleExpanded(s: Supplier) {
const isOpen = expandedId === s.id;
if (isOpen) {
setExpandedId(null);
return;
}
setExpandedId(s.id);
if (!productsBySupplier[s.id]) loadProductsFor(s.id);
}

// Single-tap toggle: flip sell_online on/off. The product_status enum
// only has 'active' (no 'inactive' value), so we use the sell_online flag
// as the user-facing Enabled/Disabled lever — that's also what gates the
// product from showing on the online_market channel.
async function toggleProductActive(p: SupplierProduct, supplierId: string) {
if (!canEdit) { showToast('Founder / co-founder only', false); return; }
const newOnline = !p.sell_online;
const { error } = await supabase.from('products').update({ sell_online: newOnline }).eq('id', p.id);
if (error) { showToast('Update failed: ' + error.message, false); return; }
setProductsBySupplier((prev) => ({
...prev,
[supplierId]: (prev[supplierId] ?? []).map((row) => row.id === p.id ? { ...row, sell_online: newOnline } : row),
}));
showToast(`${p.sku} → ${newOnline ? 'Enabled' : 'Disabled'}`);
}

// ─── Phase 1A: Active/Disabled + per-channel picker ─────────────────
// Replaces the legacy single-tap sell_online toggle. "Active" = any of
// the 4 sell_* flags is true. "Disable" instantly clears all 4 flags
// (no confirmation per founder direction). "Enable / Channels" opens
// the picker modal with current state pre-checked.
const [channelPicker, setChannelPicker] = useState<{
  product: SupplierProduct;
  supplierId: string;
  channels: { nassau: boolean; andros: boolean; online: boolean; wholesale: boolean };
} | null>(null);
const [channelSaving, setChannelSaving] = useState(false);

function isProductActive(p: SupplierProduct): boolean {
  return p.sell_nassau || p.sell_andros || p.sell_online || p.sell_wholesale;
}

function activeChannelsLabel(p: SupplierProduct): string {
  const chans: string[] = [];
  if (p.sell_nassau)    chans.push('Nassau');
  if (p.sell_andros)    chans.push('Andros');
  if (p.sell_online)    chans.push('Online');
  if (p.sell_wholesale) chans.push('Wholesale');
  if (chans.length === 0) return 'Disabled';
  if (chans.length === 4) return 'Active · All channels';
  return `Active · ${chans.join(' + ')}`;
}

async function disableProduct(p: SupplierProduct, supplierId: string) {
  if (!canEdit) { showToast('Founder / co-founder only', false); return; }
  const { error } = await supabase.from('products').update({
    sell_nassau: false, sell_andros: false, sell_online: false, sell_wholesale: false,
  }).eq('id', p.id);
  if (error) { showToast('Disable failed: ' + error.message, false); return; }
  setProductsBySupplier((prev) => ({
    ...prev,
    [supplierId]: (prev[supplierId] ?? []).map((row) => row.id === p.id ? {
      ...row,
      sell_nassau: false, sell_andros: false, sell_online: false, sell_wholesale: false,
    } : row),
  }));
  showToast(`${p.sku} → Disabled (all channels off)`);
}

function openChannelPicker(p: SupplierProduct, supplierId: string) {
  if (!canEdit) { showToast('Founder / co-founder only', false); return; }
  setChannelPicker({
    product: p, supplierId,
    channels: {
      nassau:    p.sell_nassau,
      andros:    p.sell_andros,
      online:    p.sell_online,
      wholesale: p.sell_wholesale,
    },
  });
}

async function saveChannels() {
  if (!channelPicker) return;
  const { product: p, supplierId, channels } = channelPicker;
  setChannelSaving(true);
  try {
    const { error } = await supabase.from('products').update({
      sell_nassau:    channels.nassau,
      sell_andros:    channels.andros,
      sell_online:    channels.online,
      sell_wholesale: channels.wholesale,
    }).eq('id', p.id);
    if (error) throw error;
    const updatedRow: SupplierProduct = {
      ...p,
      sell_nassau:    channels.nassau,
      sell_andros:    channels.andros,
      sell_online:    channels.online,
      sell_wholesale: channels.wholesale,
    };
    setProductsBySupplier((prev) => ({
      ...prev,
      [supplierId]: (prev[supplierId] ?? []).map((row) => row.id === p.id ? updatedRow : row),
    }));
    showToast(`${p.sku} → ${activeChannelsLabel(updatedRow)}`);
    setChannelPicker(null);
  } catch (err) {
    showToast('Save failed: ' + (err instanceof Error ? err.message : String(err)), false);
  } finally {
    setChannelSaving(false);
  }
}

// ─── Phase 1B: Add Product (2026-05-26) ─────────────────────────────
// Per-supplier "+ Add product" button + modal. Posts to
// /api/supplier/add-product (service-role admin client server-side so
// RLS on products / product_costs / product_pricing doesn't block).
// Founder direction: real SKU (no auto-gen), required fields match
// the actual products table schema, instant save.
type AddProductForm = {
  sku: string; name: string; category: string;
  unit_of_measure: string; pack_size: string;
  cost_per_unit: string; online_sell_price: string;
  channels: { nassau: boolean; andros: boolean; online: boolean; wholesale: boolean };
};
const BLANK_PRODUCT: AddProductForm = {
  sku: '', name: '', category: '',
  unit_of_measure: 'lb', pack_size: '',
  cost_per_unit: '', online_sell_price: '',
  channels: { nassau: true, andros: true, online: true, wholesale: false },
};

// Category list — covers everything the live POS / online market uses
// today. Founder can add more in the DB enum later; this dropdown is
// the safe-known subset.
const PRODUCT_CATEGORIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'fresh_seafood',     label: '🐟 Fresh seafood' },
  { value: 'frozen_seafood',    label: '🧊 Frozen seafood' },
  { value: 'processed_seafood', label: '📦 Processed seafood (HACCP)' },
  { value: 'meat',              label: '🥩 Meat' },
  { value: 'produce',           label: '🥬 Produce' },
  { value: 'juice_smoothie',    label: '🥤 Juice / smoothie' },
  { value: 'wellness_shot',     label: '💪 Wellness shot' },
  { value: 'grocery',           label: '🛒 Grocery' },
  { value: 'snack',             label: '🍪 Snack' },
  { value: 'beverage',          label: '🥃 Beverage' },
  { value: 'household',         label: '🏠 Household' },
  { value: 'toiletry',          label: '🧴 Toiletry' },
];

const UNIT_OPTIONS = ['lb', 'each', 'case', 'bag', 'portion', 'kit', 'dozen', 'oz'];

const [addProduct, setAddProduct] = useState<{ supplier: Supplier } | null>(null);
const [addProductForm, setAddProductForm] = useState<AddProductForm>({ ...BLANK_PRODUCT });
const [addProductSaving, setAddProductSaving] = useState(false);

function openAddProduct(supplier: Supplier) {
  if (!canEdit) { showToast('Founder / co-founder only', false); return; }
  setAddProduct({ supplier });
  setAddProductForm({ ...BLANK_PRODUCT });
}

async function submitAddProduct() {
  if (!addProduct) return;
  const f = addProductForm;
  const sku            = f.sku.trim();
  const name           = f.name.trim();
  const category       = f.category;
  const unitOfMeasure  = f.unit_of_measure.trim();
  const packSize       = f.pack_size.trim();
  const costPerUnit    = f.cost_per_unit    === '' ? null : Number(f.cost_per_unit);
  const onlinePrice    = f.online_sell_price === '' ? null : Number(f.online_sell_price);

  if (!sku)            { showToast('SKU is required',             false); return; }
  if (!name)           { showToast('Name is required',            false); return; }
  if (!category)       { showToast('Category is required',        false); return; }
  if (!unitOfMeasure)  { showToast('Unit of measure is required', false); return; }
  if (costPerUnit !== null && (Number.isNaN(costPerUnit) || costPerUnit < 0)) {
    showToast('Cost must be a non-negative number', false); return;
  }
  if (onlinePrice !== null && (Number.isNaN(onlinePrice) || onlinePrice < 0)) {
    showToast('Online price must be a non-negative number', false); return;
  }

  setAddProductSaving(true);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not signed in');

    const res = await fetch('/api/supplier/add-product', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        supplier_id:       addProduct.supplier.id,
        sku, name, category,
        unit_of_measure:   unitOfMeasure,
        pack_size:         packSize || undefined,
        cost_per_unit:     costPerUnit,
        online_sell_price: onlinePrice,
        channels:          f.channels,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

    // Optimistic local insert so the founder sees the new product without
    // a full reload. Use a minimal SupplierProduct shape — the next
    // toggleExpanded refresh will pull the canonical row.
    const newRow: SupplierProduct = {
      id: json.product_id, sku, name, category,
      unit_of_measure: unitOfMeasure,
      pack_size: packSize || null,
      status: 'active',
      sell_nassau:    f.channels.nassau,
      sell_andros:    f.channels.andros,
      sell_online:    f.channels.online,
      sell_wholesale: f.channels.wholesale,
      cost_per_unit:     costPerUnit,
      online_sell_price: onlinePrice && f.channels.online ? onlinePrice : null,
    };
    setProductsBySupplier((prev) => ({
      ...prev,
      [addProduct.supplier.id]: [newRow, ...(prev[addProduct.supplier.id] ?? [])],
    }));
    // Bump the supplier's product_count badge.
    setSuppliers((prev) => prev.map((s) =>
      s.id === addProduct.supplier.id
        ? { ...s, product_count: (s.product_count ?? 0) + 1 }
        : s,
    ));

    showToast(`Added ${sku}`);
    setAddProduct(null);
  } catch (err) {
    showToast('Add failed: ' + (err instanceof Error ? err.message : String(err)), false);
  } finally {
    setAddProductSaving(false);
  }
}

// Edit modal: name / cost / online sell price. Save fans out to three tables.
const [editing, setEditing] = useState<{ product: SupplierProduct; supplierId: string } | null>(null);
const [editForm, setEditForm] = useState<{ name: string; cost: string; online_price: string }>({ name: '', cost: '', online_price: '' });
const [editSaving, setEditSaving] = useState(false);

function openEditProduct(p: SupplierProduct, supplierId: string) {
if (!canEdit) { showToast('Founder / co-founder only', false); return; }
setEditing({ product: p, supplierId });
setEditForm({
name: p.name,
cost: p.cost_per_unit !== null ? String(p.cost_per_unit) : '',
online_price: p.online_sell_price !== null ? String(p.online_sell_price) : '',
});
}

async function saveProductEdit() {
if (!editing) return;
const { product: p, supplierId } = editing;
const newName  = editForm.name.trim();
const newCost  = editForm.cost  === '' ? null : Number(editForm.cost);
const newPrice = editForm.online_price === '' ? null : Number(editForm.online_price);
if (!newName)                                              { showToast('Name is required', false); return; }
if (newCost  !== null && (Number.isNaN(newCost)  || newCost  < 0)) { showToast('Cost must be a non-negative number', false); return; }
if (newPrice !== null && (Number.isNaN(newPrice) || newPrice < 0)) { showToast('Online price must be a non-negative number', false); return; }

setEditSaving(true);
try {
if (newName !== p.name) {
const { error } = await supabase.from('products').update({ name: newName }).eq('id', p.id);
if (error) throw new Error('products: ' + error.message);
}
if (newCost !== null && newCost !== p.cost_per_unit) {
const { error } = await supabase.from('product_costs')
.update({ cost_per_unit: newCost })
.eq('product_id', p.id).eq('is_current', true);
if (error) throw new Error('product_costs: ' + error.message);
}
if (newPrice !== null && newPrice !== p.online_sell_price) {
const { error } = await supabase.from('product_pricing')
.update({ manual_unit_price: newPrice })
.eq('product_id', p.id).eq('channel', 'online_market').eq('is_current', true);
if (error) throw new Error('product_pricing: ' + error.message);
}

setProductsBySupplier((prev) => ({
...prev,
[supplierId]: (prev[supplierId] ?? []).map((row) => row.id === p.id ? {
...row,
name: newName,
cost_per_unit:     newCost  ?? row.cost_per_unit,
online_sell_price: newPrice ?? row.online_sell_price,
} : row),
}));
showToast('Saved');
setEditing(null);
} catch (err) {
showToast('Save failed: ' + (err instanceof Error ? err.message : String(err)), false);
} finally {
setEditSaving(false);
}
}

const filtered = suppliers.filter((s: Supplier) => {
const matchSearch = !search ||
s.name.toLowerCase().includes(search.toLowerCase()) ||
s.code.toLowerCase().includes(search.toLowerCase()) ||
(s.contact_name ?? '').toLowerCase().includes(search.toLowerCase());
const matchType = filterType === 'all' || s.supplier_type === filterType;
return matchSearch && matchType;
});

const activeCount = suppliers.filter((s: Supplier) => s.is_active).length;
const totalProducts = suppliers.reduce((n: number, s: Supplier) => n + (s.product_count ?? 0), 0);

function F(label: string, field: keyof SupplierForm, placeholder = '', type = 'text') {
return (
<div>
<label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>{label}</label>
<input
type={type}
placeholder={placeholder}
value={String(form[field] ?? '')}
onChange={e => setForm(p => ({ ...p, [field]: e.target.value } as SupplierForm))}
className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }}
/>
</div>
);
}

return (
<div className="min-h-screen text-white" style={{ backgroundColor: '#060d1f', fontFamily: "'DM Sans', sans-serif" }}>

<AddInventoryButton role="supplier" variant="fab" />

{toast && (
<div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl font-bold text-sm shadow-xl"
style={{ backgroundColor: toast.ok ? '#16a34a' : '#dc2626', color: 'white' }}>
{toast.msg}
</div>
)}

{editing && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4"
style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
onClick={() => !editSaving && setEditing(null)}>
<div className="w-full max-w-md rounded-lg bg-white"
style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}
onClick={(e) => e.stopPropagation()}>
<div className="px-5 py-3 border-b" style={{ borderColor: '#e7e7e7' }}>
<h2 className="text-base font-bold" style={{ color: '#0F1111' }}>Edit product</h2>
<p className="text-xs font-mono mt-0.5" style={{ color: '#565959' }}>{editing.product.sku}</p>
</div>
<div className="px-5 py-4 space-y-3">
<div>
<label className="text-xs font-bold block mb-1" style={{ color: '#0F1111' }}>Name</label>
<input type="text" value={editForm.name}
onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
className="w-full text-sm px-3 py-2 rounded-md focus:outline-none focus:ring-2"
style={{ border: '1px solid #d5d9d9', color: '#0F1111' }} />
</div>
<div className="grid grid-cols-2 gap-3">
<div>
<label className="text-xs font-bold block mb-1" style={{ color: '#0F1111' }}>
Cost ({editing.product.unit_of_measure ?? 'each'})
</label>
<div className="relative">
<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#565959' }}>$</span>
<input type="number" step="0.01" min="0" value={editForm.cost}
onChange={(e) => setEditForm((f) => ({ ...f, cost: e.target.value }))}
className="w-full text-sm pl-7 pr-3 py-2 rounded-md focus:outline-none focus:ring-2"
style={{ border: '1px solid #d5d9d9', color: '#0F1111' }} />
</div>
</div>
<div>
<label className="text-xs font-bold block mb-1" style={{ color: '#0F1111' }}>
Online sell price
</label>
<div className="relative">
<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#565959' }}>$</span>
<input type="number" step="0.01" min="0" value={editForm.online_price}
onChange={(e) => setEditForm((f) => ({ ...f, online_price: e.target.value }))}
className="w-full text-sm pl-7 pr-3 py-2 rounded-md focus:outline-none focus:ring-2"
style={{ border: '1px solid #d5d9d9', color: '#0F1111' }} />
</div>
</div>
</div>
<p className="text-[11px]" style={{ color: '#565959' }}>
Suggested at 25% margin + 10% VAT:{' '}
<span className="font-bold">
{editForm.cost && !Number.isNaN(Number(editForm.cost))
? '$' + (Number(editForm.cost) / 0.75 * 1.10).toFixed(2)
: '—'}
</span>
</p>
</div>
<div className="px-5 py-3 flex justify-end gap-2 border-t" style={{ backgroundColor: '#f7f8f8', borderColor: '#e7e7e7' }}>
<button onClick={() => setEditing(null)} disabled={editSaving}
className="text-sm px-4 py-1.5 rounded-full bg-white"
style={{ color: '#0F1111', border: '1px solid #d5d9d9' }}>
Cancel
</button>
<button onClick={saveProductEdit} disabled={editSaving}
className="text-sm font-bold px-5 py-1.5 rounded-full"
style={{ backgroundColor: '#FFD814', color: '#0F1111', border: '1px solid #FCD200' }}>
{editSaving ? 'Saving…' : 'Save changes'}
</button>
</div>
</div>
</div>
)}

{/* ─── Phase 1A: Channel picker modal ─── */}
{channelPicker && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4"
  style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
  onClick={() => !channelSaving && setChannelPicker(null)}>
  <div className="w-full max-w-md rounded-lg bg-white"
    style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}
    onClick={(e) => e.stopPropagation()}>

    <div className="px-5 py-3 border-b" style={{ borderColor: '#e7e7e7' }}>
      <h2 className="text-base font-bold" style={{ color: '#0F1111' }}>Where should this sell?</h2>
      <p className="text-xs mt-0.5" style={{ color: '#565959' }}>
        <span className="font-mono">{channelPicker.product.sku}</span> · {channelPicker.product.name}
      </p>
    </div>

    <div className="px-5 py-4 space-y-1">
      {([
        { key: 'nassau',    label: '📍 Nassau POS' },
        { key: 'andros',    label: '🟣 Andros POS' },
        { key: 'online',    label: '🛒 Online Market' },
        { key: 'wholesale', label: '📦 Wholesale' },
      ] as const).map((c) => (
        <label key={c.key}
          className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50 cursor-pointer"
          style={{ userSelect: 'none' }}>
          <input type="checkbox"
            checked={channelPicker.channels[c.key]}
            onChange={(e) => setChannelPicker((p) => p ? {
              ...p,
              channels: { ...p.channels, [c.key]: e.target.checked },
            } : null)}
            className="w-4 h-4" />
          <span className="text-sm" style={{ color: '#0F1111' }}>{c.label}</span>
        </label>
      ))}

      <div className="flex gap-2 pt-3">
        <button onClick={() => setChannelPicker((p) => p ? {
          ...p, channels: { nassau: true, andros: true, online: true, wholesale: true },
        } : null)}
          className="text-xs font-medium px-3 py-1.5 rounded-full"
          style={{ backgroundColor: '#FFD814', color: '#0F1111', border: '1px solid #FCD200' }}>
          ⭐ Select All
        </button>
        <button onClick={() => setChannelPicker((p) => p ? {
          ...p, channels: { nassau: false, andros: false, online: false, wholesale: false },
        } : null)}
          className="text-xs font-medium px-3 py-1.5 rounded-full bg-white"
          style={{ color: '#0F1111', border: '1px solid #d5d9d9' }}>
          Clear
        </button>
      </div>

      <p className="text-[11px] mt-3 px-1" style={{ color: '#565959' }}>
        Save with zero channels checked = Disabled (same as the Disable button).
      </p>
    </div>

    <div className="px-5 py-3 border-t flex justify-end gap-2"
      style={{ borderColor: '#e7e7e7', backgroundColor: '#f7f8f8' }}>
      <button onClick={() => setChannelPicker(null)} disabled={channelSaving}
        className="text-sm px-4 py-1.5 rounded-full bg-white"
        style={{ color: '#0F1111', border: '1px solid #d5d9d9' }}>
        Cancel
      </button>
      <button onClick={saveChannels} disabled={channelSaving}
        className="text-sm font-bold px-5 py-1.5 rounded-full"
        style={{ backgroundColor: '#FFD814', color: '#0F1111', border: '1px solid #FCD200' }}>
        {channelSaving ? 'Saving…' : 'Save'}
      </button>
    </div>

  </div>
</div>
)}

{/* ─── Phase 1B: Add Product modal ─── */}
{addProduct && (
<div className="fixed inset-0 z-50 flex items-center justify-center p-4"
  style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
  onClick={() => !addProductSaving && setAddProduct(null)}>
  <div className="w-full max-w-lg rounded-lg bg-white max-h-[90vh] overflow-y-auto"
    style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}
    onClick={(e) => e.stopPropagation()}>

    <div className="px-5 py-3 border-b sticky top-0 bg-white" style={{ borderColor: '#e7e7e7' }}>
      <h2 className="text-base font-bold" style={{ color: '#0F1111' }}>
        Add product to {addProduct.supplier.brand_name || addProduct.supplier.name}
      </h2>
      <p className="text-xs mt-0.5" style={{ color: '#565959' }}>
        Founder enters real SKU — no auto-generate. Fields marked * are required.
      </p>
    </div>

    <div className="px-5 py-4 space-y-3">

      {/* SKU + Name */}
      <div>
        <label className="text-xs font-bold block mb-1" style={{ color: '#0F1111' }}>SKU *</label>
        <input type="text" value={addProductForm.sku}
          onChange={(e) => setAddProductForm((f) => ({ ...f, sku: e.target.value }))}
          placeholder="e.g. SCALLOPS-10LB-CASE"
          className="w-full text-sm px-3 py-2 rounded-md font-mono"
          style={{ border: '1px solid #d5d9d9', color: '#0F1111' }} />
      </div>

      <div>
        <label className="text-xs font-bold block mb-1" style={{ color: '#0F1111' }}>Name *</label>
        <input type="text" value={addProductForm.name}
          onChange={(e) => setAddProductForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Sea Scallops 10/20 — 10lb Case"
          className="w-full text-sm px-3 py-2 rounded-md"
          style={{ border: '1px solid #d5d9d9', color: '#0F1111' }} />
      </div>

      {/* Category + Unit */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color: '#0F1111' }}>Category *</label>
          <select value={addProductForm.category}
            onChange={(e) => setAddProductForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full text-sm px-3 py-2 rounded-md bg-white"
            style={{ border: '1px solid #d5d9d9', color: '#0F1111' }}>
            <option value="">Select…</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color: '#0F1111' }}>Unit *</label>
          <input list="bsc-uom-options" value={addProductForm.unit_of_measure}
            onChange={(e) => setAddProductForm((f) => ({ ...f, unit_of_measure: e.target.value }))}
            className="w-full text-sm px-3 py-2 rounded-md"
            style={{ border: '1px solid #d5d9d9', color: '#0F1111' }} />
          <datalist id="bsc-uom-options">
            {UNIT_OPTIONS.map((u) => <option key={u} value={u} />)}
          </datalist>
        </div>
      </div>

      {/* Pack size */}
      <div>
        <label className="text-xs font-bold block mb-1" style={{ color: '#0F1111' }}>
          Pack size <span className="font-normal" style={{ color: '#565959' }}>(optional)</span>
        </label>
        <input type="text" value={addProductForm.pack_size}
          onChange={(e) => setAddProductForm((f) => ({ ...f, pack_size: e.target.value }))}
          placeholder="e.g. 10 lb case, 6×500ml"
          className="w-full text-sm px-3 py-2 rounded-md"
          style={{ border: '1px solid #d5d9d9', color: '#0F1111' }} />
      </div>

      {/* Cost + Online price */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color: '#0F1111' }}>
            Cost <span className="font-normal" style={{ color: '#565959' }}>(optional)</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#565959' }}>$</span>
            <input type="number" step="0.01" min="0" value={addProductForm.cost_per_unit}
              onChange={(e) => setAddProductForm((f) => ({ ...f, cost_per_unit: e.target.value }))}
              className="w-full text-sm pl-7 pr-3 py-2 rounded-md"
              style={{ border: '1px solid #d5d9d9', color: '#0F1111' }} />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color: '#0F1111' }}>
            Online price <span className="font-normal" style={{ color: '#565959' }}>(optional)</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#565959' }}>$</span>
            <input type="number" step="0.01" min="0" value={addProductForm.online_sell_price}
              onChange={(e) => setAddProductForm((f) => ({ ...f, online_sell_price: e.target.value }))}
              className="w-full text-sm pl-7 pr-3 py-2 rounded-md"
              style={{ border: '1px solid #d5d9d9', color: '#0F1111' }} />
          </div>
        </div>
      </div>

      {addProductForm.cost_per_unit && !Number.isNaN(Number(addProductForm.cost_per_unit)) && (
        <p className="text-[11px]" style={{ color: '#565959' }}>
          Online suggested @ 25% margin + 10% VAT:{' '}
          <span className="font-bold">
            ${(Number(addProductForm.cost_per_unit) / 0.75 * 1.10).toFixed(2)}
          </span>
        </p>
      )}

      {/* Channels */}
      <div className="pt-2 border-t" style={{ borderColor: '#e7e7e7' }}>
        <label className="text-xs font-bold block mb-2" style={{ color: '#0F1111' }}>Sell on which channels?</label>
        <div className="space-y-1">
          {([
            { key: 'nassau',    label: '📍 Nassau POS' },
            { key: 'andros',    label: '🟣 Andros POS' },
            { key: 'online',    label: '🛒 Online Market' },
            { key: 'wholesale', label: '📦 Wholesale' },
          ] as const).map((c) => (
            <label key={c.key} className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer">
              <input type="checkbox"
                checked={addProductForm.channels[c.key]}
                onChange={(e) => setAddProductForm((f) => ({
                  ...f, channels: { ...f.channels, [c.key]: e.target.checked },
                }))}
                className="w-4 h-4" />
              <span className="text-sm" style={{ color: '#0F1111' }}>{c.label}</span>
            </label>
          ))}
        </div>
        <p className="text-[11px] mt-2 px-1" style={{ color: '#565959' }}>
          You can change channels anytime via the Channels button on the product row.
        </p>
      </div>

    </div>

    <div className="px-5 py-3 border-t flex justify-end gap-2 sticky bottom-0 bg-white"
      style={{ borderColor: '#e7e7e7', backgroundColor: '#f7f8f8' }}>
      <button onClick={() => setAddProduct(null)} disabled={addProductSaving}
        className="text-sm px-4 py-1.5 rounded-full bg-white"
        style={{ color: '#0F1111', border: '1px solid #d5d9d9' }}>
        Cancel
      </button>
      <button onClick={submitAddProduct} disabled={addProductSaving}
        className="text-sm font-bold px-5 py-1.5 rounded-full"
        style={{ backgroundColor: '#FFD814', color: '#0F1111', border: '1px solid #FCD200' }}>
        {addProductSaving ? 'Adding…' : 'Add product'}
      </button>
    </div>

  </div>
</div>
)}

<header className="sticky top-0 z-40 border-b px-4 py-3"
style={{ backgroundColor: '#1a2e5a', borderColor: 'rgba(245,197,24,0.2)' }}>
<div className="flex items-center justify-between mb-3">
<div>
<h1 className="font-bold text-lg" style={{ color: '#f5c518' }}>Suppliers</h1>
<p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
{activeCount} active · {suppliers.length} total · {totalProducts} products assigned
</p>
</div>
<button onClick={openAdd}
className="px-4 py-2 rounded-xl font-bold text-sm"
style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
+ Add Supplier
</button>
</div>
{tab === 'list' && (
<div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
{[{ value: 'all', label: 'All' }, ...SUPPLIER_TYPES].map(t => (
<button key={t.value} onClick={() => setFilterType(t.value)}
className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold"
style={filterType === t.value
? { backgroundColor: '#f5c518', color: '#060d1f' }
: { backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
{t.label}
</button>
))}
</div>
)}
</header>

{tab === 'add' && (
<div className="p-4 max-w-xl mx-auto space-y-4">
<button onClick={() => { setTab('list'); setSelected(null); setForm({ ...BLANK }); }}
className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>
Back to suppliers
</button>
<h2 className="font-bold text-xl text-white">
{selected ? `Edit — ${selected.name}` : 'Add New Supplier'}
</h2>

<div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: '#0f1f3d' }}>
<h3 className="font-bold text-white">Brand Identity</h3>
<div className="flex items-center gap-3 rounded-xl px-4 py-3"
style={{ backgroundColor: form.brand_color ?? '#1a2e5a' }}>
<span className="text-3xl">{form.brand_emoji ?? '🏪'}</span>
<div>
<p className="font-bold text-white text-sm">{form.brand_name || form.name || 'Supplier Name'}</p>
<p className="text-[10px] text-white/60">{form.code || 'CODE'}</p>
</div>
</div>
<div>
<label className="text-xs font-bold mb-2 block" style={{ color: '#f5c518' }}>Brand Emoji</label>
<div className="flex gap-2 flex-wrap">
{EMOJI_OPTIONS.map(e => (
<button key={e} onClick={() => setForm(p => ({ ...p, brand_emoji: e }))}
className="w-10 h-10 rounded-xl text-xl flex items-center justify-center"
style={{
backgroundColor: form.brand_emoji === e ? '#f5c518' : '#1a2e5a',
border: form.brand_emoji === e ? '2px solid #fff' : '2px solid transparent',
}}>
{e}
</button>
))}
</div>
</div>
<div>
<label className="text-xs font-bold mb-2 block" style={{ color: '#f5c518' }}>Brand Color</label>
<div className="flex gap-2 flex-wrap">
{COLOR_OPTIONS.map(c => (
<button key={c} onClick={() => setForm(p => ({ ...p, brand_color: c }))}
className="w-8 h-8 rounded-lg"
style={{
backgroundColor: c,
border: form.brand_color === c ? '3px solid #f5c518' : '3px solid transparent',
}} />
))}
</div>
</div>
{F('Brand Display Name', 'brand_name', 'e.g. Tropic Seafood Co.')}
</div>

<div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: '#0f1f3d' }}>
<h3 className="font-bold text-white">Supplier Details</h3>
<div className="grid grid-cols-2 gap-3">
{F('Code *', 'code', 'e.g. TROPIC')}
<div>
<label className="text-xs font-bold mb-1 block" style={{ color: '#f5c518' }}>Type</label>
<select value={form.supplier_type ?? 'wholesale_partner'}
onChange={e => setForm(p => ({ ...p, supplier_type: e.target.value }))}
className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }}>
{SUPPLIER_TYPES.map(t => (
<option key={t.value} value={t.value}>{t.label}</option>
))}
</select>
</div>
</div>
{F('Supplier Name *', 'name', 'e.g. Tropic Seafood')}
{F('Website', 'website', 'https://...')}
{F('Address', 'address', 'Street, City')}
{F('Country', 'country', 'Bahamas')}
{F('Payment Terms', 'payment_terms', 'e.g. Net 30, Cash on delivery')}
<div className="flex items-center justify-between rounded-xl px-4 py-3"
style={{ backgroundColor: '#1a2e5a' }}>
<div>
<p className="text-sm font-bold text-white">Active Supplier</p>
<p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
Inactive suppliers won't appear in product dropdowns
</p>
</div>
<button onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
className="w-12 h-6 rounded-full transition-colors relative"
style={{ backgroundColor: form.is_active ? '#f5c518' : '#374151' }}>
<div className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
style={{ left: form.is_active ? '26px' : '4px' }} />
</button>
</div>
</div>

<div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: '#0f1f3d' }}>
<h3 className="font-bold text-white">Contact</h3>
{F('Contact Name', 'contact_name', 'e.g. Jorge Caragol')}
{F('Contact Email', 'contact_email', 'email@example.com', 'email')}
{F('Contact Phone', 'contact_phone', '+1 (242) 555-0100', 'tel')}
{F('WhatsApp', 'contact_whatsapp', '+1 (242) 555-0100', 'tel')}
</div>

<div className="rounded-2xl p-5" style={{ backgroundColor: '#0f1f3d' }}>
<label className="text-xs font-bold mb-2 block" style={{ color: '#f5c518' }}>Notes</label>
<textarea
placeholder="Supplier notes, terms, special arrangements..."
value={form.notes ?? ''}
onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
rows={4}
className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none resize-none"
style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }}
/>
</div>

<div className="flex gap-3 pb-8">
<button onClick={handleSave} disabled={saving}
className="flex-1 py-3 rounded-xl font-bold text-sm"
style={{ backgroundColor: '#f5c518', color: '#060d1f', opacity: saving ? 0.6 : 1 }}>
{saving ? 'Saving...' : selected ? 'Update Supplier' : 'Add Supplier'}
</button>
<button onClick={() => { setTab('list'); setSelected(null); setForm({ ...BLANK }); }}
className="px-6 py-3 rounded-xl font-bold text-sm"
style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
Cancel
</button>
</div>
</div>
)}

{tab === 'list' && (
<div className="p-4 space-y-3">
<input
placeholder="Search suppliers, codes, contacts..."
value={search}
onChange={e => setSearch(e.target.value)}
className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.2)' }}
/>
{loading && (
<p className="text-center py-10 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
Loading suppliers...
</p>
)}
{!loading && filtered.length === 0 && (
<div className="text-center py-16">
<p className="text-4xl mb-3">🏭</p>
<p className="font-bold text-white mb-1">No suppliers found</p>
<p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
{search ? 'Try a different search' : 'Add your first supplier above'}
</p>
</div>
)}
{!loading && filtered.map((s: Supplier) => (
<div key={s.id} className="rounded-2xl overflow-hidden"
style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
<div className="px-4 py-3 flex items-center gap-3"
style={{ backgroundColor: s.brand_color ?? '#1a2e5a' }}>
<span className="text-2xl">{s.brand_emoji ?? '🏪'}</span>
<div className="flex-1 min-w-0">
<p className="font-bold text-white text-sm truncate">{s.brand_name || s.name}</p>
<p className="text-[10px] text-white/60 font-mono">{s.code}</p>
</div>
<div className="flex items-center gap-2">
{!s.is_active && (
<span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: 'rgba(255,255,255,0.5)' }}>
INACTIVE
</span>
)}
<span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-black/20 text-white/70">
{SUPPLIER_TYPES.find(t => t.value === s.supplier_type)?.label ?? s.supplier_type}
</span>
</div>
</div>
<div className="px-4 py-3 space-y-2" style={{ backgroundColor: '#0f1f3d' }}>
{(s.contact_name || s.contact_phone || s.contact_email) && (
<div className="flex flex-wrap gap-x-4 gap-y-1">
{s.contact_name && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{s.contact_name}</p>}
{s.contact_phone && <a href={`tel:${s.contact_phone}`} className="text-xs" style={{ color: '#f5c518' }}>{s.contact_phone}</a>}
{s.contact_whatsapp && (
<a href={`https://wa.me/${s.contact_whatsapp.replace(/\D/g, '')}`}
target="_blank" rel="noopener noreferrer"
className="text-xs" style={{ color: '#4ade80' }}>WhatsApp</a>
)}
{s.contact_email && <a href={`mailto:${s.contact_email}`} className="text-xs" style={{ color: '#60a5fa' }}>{s.contact_email}</a>}
</div>
)}
{s.address && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.address}{s.country ? `, ${s.country}` : ''}</p>}
{s.payment_terms && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.payment_terms}</p>}
{s.notes && (
<p className="text-xs rounded-lg px-3 py-2"
style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)' }}>
{s.notes}
</p>
)}
<div className="flex items-center justify-between pt-1 flex-wrap gap-2">
<p className="text-xs font-bold" style={{ color: '#f5c518' }}>
{s.product_count ?? 0} product{(s.product_count ?? 0) !== 1 ? 's' : ''} assigned
</p>
<div className="flex gap-2 flex-wrap">
<button onClick={() => toggleExpanded(s)}
className="text-xs px-3 py-1.5 rounded-lg font-bold"
style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
{expandedId === s.id ? '▴ Hide Products' : `▾ Products (${s.product_count ?? 0})`}
</button>
<button onClick={() => toggleActive(s)}
className="text-xs px-3 py-1.5 rounded-lg font-bold"
style={{
backgroundColor: s.is_active ? 'rgba(220,38,38,0.15)' : 'rgba(22,163,74,0.15)',
color: s.is_active ? '#f87171' : '#4ade80'
}}>
{s.is_active ? 'Deactivate' : 'Activate'}
</button>
<button onClick={() => openEdit(s)}
className="text-xs px-3 py-1.5 rounded-lg font-bold"
style={{ backgroundColor: 'rgba(245,197,24,0.15)', color: '#f5c518' }}>
Edit
</button>
</div>
</div>
</div>

{expandedId === s.id && (
<div className="px-3 py-3 border-t" style={{ backgroundColor: '#f5f5f7', borderColor: 'rgba(245,197,24,0.15)' }}>
{!canEdit && (
<p className="text-xs mb-2 px-2" style={{ color: '#565959' }}>
View-only — founder or co-founder role required to enable, disable, or edit products.
</p>
)}
{canEdit && (
<div className="flex items-center justify-between mb-3 px-1">
<p className="text-xs font-bold" style={{ color: '#565959' }}>
Products under {s.brand_name || s.name}
</p>
<button onClick={() => openAddProduct(s)}
className="text-xs font-bold px-3 py-1.5 rounded-full"
style={{ backgroundColor: '#FFD814', color: '#0F1111', border: '1px solid #FCD200' }}>
+ Add Product
</button>
</div>
)}
{productsLoading === s.id && (
<p className="text-xs text-center py-6" style={{ color: '#565959' }}>Loading products…</p>
)}
{productsLoading !== s.id && (productsBySupplier[s.id] ?? []).length === 0 && (
<p className="text-xs text-center py-6" style={{ color: '#565959' }}>
No products assigned to this supplier yet.
</p>
)}
{productsLoading !== s.id && (productsBySupplier[s.id] ?? []).length > 0 && (
<div className="space-y-2">
{(productsBySupplier[s.id] ?? []).map((p) => {
const isActive = isProductActive(p);
const channelsLabel = activeChannelsLabel(p);
return (
<div key={p.id} className="rounded-lg bg-white px-3 py-3"
style={{ border: '1px solid #d5d9d9', boxShadow: '0 1px 2px rgba(15,17,17,0.05)' }}>
<div className="flex items-start gap-3">
{/* Thumbnail placeholder — emoji for now */}
<div className="rounded-md flex-shrink-0 flex items-center justify-center text-2xl"
style={{ width: 56, height: 56, backgroundColor: '#f7f8f8', border: '1px solid #e7e7e7' }}>
{p.category?.includes('seafood') ? '🐟' : p.category === 'meat' ? '🥩' : '📦'}
</div>
<div className="flex-1 min-w-0">
<a href="#" onClick={(e) => { e.preventDefault(); openEditProduct(p, s.id); }}
className="text-sm font-medium leading-tight block hover:underline"
style={{ color: '#007185' }}>
{p.name}
</a>
<p className="text-[11px] mt-0.5" style={{ color: '#565959' }}>
<span className="font-mono">{p.sku}</span>
{p.pack_size && <span> · {p.pack_size}</span>}
{p.unit_of_measure && <span> · /{p.unit_of_measure}</span>}
</p>
<div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
{p.online_sell_price !== null && (
<span className="text-base font-bold" style={{ color: '#0F1111' }}>
<span className="text-xs align-top">$</span>{p.online_sell_price.toFixed(2)}
</span>
)}
{p.cost_per_unit !== null && (
<span className="text-xs" style={{ color: '#565959' }}>
cost ${p.cost_per_unit.toFixed(2)}
</span>
)}
</div>
</div>
<span className="text-[11px] font-bold px-2 py-0.5 rounded whitespace-nowrap self-start"
style={{
backgroundColor: isActive ? '#067D62' : '#565959',
color: '#fff',
}}
title={isActive ? 'Tap "Channels" to adjust where this sells' : 'Tap Enable to activate channels'}>
{channelsLabel}
</span>
</div>

{canEdit && (
<div className="flex gap-2 mt-3 pt-3 border-t flex-wrap" style={{ borderColor: '#e7e7e7' }}>
{isActive ? (
  <>
    <button onClick={() => disableProduct(p, s.id)}
      className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors bg-white"
      style={{ color: '#0F1111', border: '1px solid #d5d9d9' }}>
      Disable
    </button>
    <button onClick={() => openChannelPicker(p, s.id)}
      className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors bg-white"
      style={{ color: '#007185', border: '1px solid #d5d9d9' }}>
      Channels
    </button>
  </>
) : (
  <button onClick={() => openChannelPicker(p, s.id)}
    className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
    style={{ backgroundColor: '#FFD814', color: '#0F1111', border: '1px solid #FCD200' }}>
    Enable
  </button>
)}
<button onClick={() => openEditProduct(p, s.id)}
className="text-xs font-medium px-3 py-1.5 rounded-full bg-white"
style={{ color: '#0F1111', border: '1px solid #d5d9d9' }}>
Edit
</button>
</div>
)}
</div>
);
})}
</div>
)}
</div>
)}
</div>
))}
</div>
)}
</div>
);
}
