'use client';
// trigger rebuild

import { useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { canLock, useUserRole } from '@/lib/role';

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

async function setProductStatus(p: SupplierProduct, supplierId: string, newStatus: 'active' | 'inactive' | 'out_of_stock') {
if (!canEdit) { showToast('Only founder/co-founder can change product status', false); return; }
if (p.status === newStatus) return;
const { error } = await supabase
.from('products')
.update({ status: newStatus, updated_at: new Date().toISOString() })
.eq('id', p.id);
if (error) { showToast('Update failed: ' + error.message, false); return; }
setProductsBySupplier((prev) => ({
...prev,
[supplierId]: (prev[supplierId] ?? []).map((row) => row.id === p.id ? { ...row, status: newStatus } : row),
}));
showToast(`${p.sku} → ${newStatus}`);
}

async function toggleChannel(p: SupplierProduct, supplierId: string, channel: 'sell_nassau' | 'sell_andros' | 'sell_online' | 'sell_wholesale') {
if (!canEdit) { showToast('Only founder/co-founder can change channels', false); return; }
const newVal = !p[channel];
const { error } = await supabase
.from('products')
.update({ [channel]: newVal, updated_at: new Date().toISOString() })
.eq('id', p.id);
if (error) { showToast('Update failed: ' + error.message, false); return; }
setProductsBySupplier((prev) => ({
...prev,
[supplierId]: (prev[supplierId] ?? []).map((row) => row.id === p.id ? { ...row, [channel]: newVal } : row),
}));
showToast(`${p.sku} · ${channel.replace('sell_', '')} → ${newVal ? 'ON' : 'OFF'}`);
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
<div className="px-4 py-3 border-t" style={{ backgroundColor: '#091632', borderColor: 'rgba(245,197,24,0.15)' }}>
{!canEdit && (
<p className="text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
View-only — founder or co-founder role required to change status or channels.
</p>
)}
{productsLoading === s.id && (
<p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading products…</p>
)}
{productsLoading !== s.id && (productsBySupplier[s.id] ?? []).length === 0 && (
<p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
No products assigned to this supplier yet.
</p>
)}
{productsLoading !== s.id && (productsBySupplier[s.id] ?? []).length > 0 && (
<div className="space-y-2">
{(productsBySupplier[s.id] ?? []).map((p) => {
const statusColor =
p.status === 'active'       ? { bg: 'rgba(22,163,74,0.18)',  fg: '#4ade80' } :
p.status === 'out_of_stock' ? { bg: 'rgba(245,197,24,0.18)', fg: '#f5c518' } :
                              { bg: 'rgba(220,38,38,0.18)',  fg: '#f87171' };
return (
<div key={p.id} className="rounded-lg px-3 py-2 space-y-2"
style={{ backgroundColor: '#0b1d3f', border: '1px solid rgba(255,255,255,0.06)' }}>
<div className="flex items-start justify-between gap-2">
<div className="min-w-0 flex-1">
<p className="text-xs font-bold text-white truncate">{p.name}</p>
<p className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
{p.sku}{p.pack_size ? ` · ${p.pack_size}` : ''}{p.unit_of_measure ? ` · /${p.unit_of_measure}` : ''}
</p>
</div>
<span className="text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap"
style={{ backgroundColor: statusColor.bg, color: statusColor.fg }}>
{p.status === 'out_of_stock' ? 'OUT OF STOCK' : p.status.toUpperCase()}
</span>
</div>
<div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1 text-[11px]">
<div style={{ color: 'rgba(255,255,255,0.55)' }}>
{p.cost_per_unit !== null ? <>Cost <span style={{ color: '#f87171' }}>${p.cost_per_unit.toFixed(2)}</span></> : 'Cost —'}
{' · '}
{p.online_sell_price !== null ? <>Online <span style={{ color: '#7dd3a8' }}>${p.online_sell_price.toFixed(2)}</span></> : 'Online —'}
</div>
</div>

{canEdit && (
<div className="flex flex-wrap gap-1.5">
{/* Status cycler */}
<button onClick={() => setProductStatus(p, s.id, 'active')}
disabled={p.status === 'active'}
className="text-[10px] px-2.5 py-1 rounded-md font-bold"
style={{
backgroundColor: p.status === 'active' ? 'rgba(22,163,74,0.35)' : 'rgba(22,163,74,0.12)',
color: '#4ade80', opacity: p.status === 'active' ? 1 : 0.7,
}}>Active</button>
<button onClick={() => setProductStatus(p, s.id, 'out_of_stock')}
disabled={p.status === 'out_of_stock'}
className="text-[10px] px-2.5 py-1 rounded-md font-bold"
style={{
backgroundColor: p.status === 'out_of_stock' ? 'rgba(245,197,24,0.35)' : 'rgba(245,197,24,0.12)',
color: '#f5c518', opacity: p.status === 'out_of_stock' ? 1 : 0.7,
}}>Out of Stock</button>
<button onClick={() => setProductStatus(p, s.id, 'inactive')}
disabled={p.status === 'inactive'}
className="text-[10px] px-2.5 py-1 rounded-md font-bold"
style={{
backgroundColor: p.status === 'inactive' ? 'rgba(220,38,38,0.35)' : 'rgba(220,38,38,0.12)',
color: '#f87171', opacity: p.status === 'inactive' ? 1 : 0.7,
}}>Inactive</button>

<span className="w-px self-stretch mx-1" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />

{/* Channel toggles */}
{[
{ key: 'sell_nassau'   as const, label: 'Nassau' },
{ key: 'sell_andros'   as const, label: 'Andros' },
{ key: 'sell_online'   as const, label: 'Online' },
{ key: 'sell_wholesale' as const, label: 'W-sale' },
].map(({ key, label }) => (
<button key={key} onClick={() => toggleChannel(p, s.id, key)}
className="text-[10px] px-2.5 py-1 rounded-md font-bold"
style={{
backgroundColor: p[key] ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.06)',
color: p[key] ? '#60a5fa' : 'rgba(255,255,255,0.4)',
}}>
{p[key] ? '✓' : '○'} {label}
</button>
))}
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
