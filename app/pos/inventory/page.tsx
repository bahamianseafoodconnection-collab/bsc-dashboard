'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

type InventoryRow = {
product_id: string;
sku: string;
barcode: string | null;
name: string;
description: string | null;
category: string;
unit_of_measure: string;
pack_size: string | null;
image_url: string | null;
status: string;
is_bsc_processed: boolean;
sell_nassau: boolean;
sell_andros: boolean;
sell_online: boolean;
sell_wholesale: boolean;
current_cost: number | null;
cost_recorded_at: string | null;
pricing_channels_count: number;
primary_supplier_id: string | null;
created_at: string;
updated_at: string;
};

type EditMode = 'cost' | 'price' | 'channels' | 'status' | null;

const CATEGORY_EMOJI: Record<string, string> = {
fresh_seafood: '🐟', frozen_seafood: '🦞', processed_seafood: '🦐',
meat: '🥩', produce: '🥦', juice_smoothie: '🥤',
wellness_shot: '💪', grocery: '🌾', snack: '🍪',
beverage: '💧', household: '🧴', toiletry: '🧼',
};

const CATEGORY_LABEL: Record<string, string> = {
fresh_seafood: 'Fresh Seafood', frozen_seafood: 'Frozen Seafood',
processed_seafood: 'Processed', meat: 'Meat', produce: 'Produce',
juice_smoothie: 'Juice/Smoothie', wellness_shot: 'Wellness',
grocery: 'Grocery', snack: 'Snack', beverage: 'Beverage',
household: 'Household', toiletry: 'Toiletry',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
draft: { bg: '#fef3c7', text: '#92400e' },
pending_approval: { bg: '#fde68a', text: '#92400e' },
active: { bg: '#dcfce7', text: '#166534' },
discontinued: { bg: '#fee2e2', text: '#991b1b' },
archived: { bg: '#f1f5f9', text: '#475569' },
};

const CHANNEL_LABELS: Record<string, string> = {
nassau_pos: 'Nassau POS',
andros_pos: 'Andros POS',
online_market: 'Online',
local_wholesale: 'Wholesale',
};

const CHANNEL_DEFAULTS: Record<string, { margin: number; vat: number }> = {
nassau_pos: { margin: 1.38, vat: 1.00 },
andros_pos: { margin: 1.43, vat: 1.00 },
online_market: { margin: 1.25, vat: 1.00 },
local_wholesale: { margin: 1.12, vat: 1.00 },
};

const API_URL = '/api/inventory/movements/update';

function getSupabase() {
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Supabase env not configured.');
return createBrowserClient(url, key);
}

export default function InventoryPage() {
const [rows, setRows] = useState<InventoryRow[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

const [search, setSearch] = useState('');
const [categoryFilter, setCategoryFilter] = useState<string>('all');
const [statusFilter, setStatusFilter] = useState<string>('all');
const [hideArchived, setHideArchived] = useState(true);

const [editing, setEditing] = useState<{ row: InventoryRow; mode: EditMode } | null>(null);

const loadInventory = useCallback(async () => {
setLoading(true);
setError(null);
try {
const supabase = getSupabase();
const { data, error: rpcError } = await supabase.rpc('get_inventory_overview');
if (rpcError) throw rpcError;
setRows((data as InventoryRow[]) || []);
} catch (e) {
setError(e instanceof Error ? e.message : 'Failed to load inventory');
} finally {
setLoading(false);
}
}, []);

useEffect(() => { loadInventory(); }, [loadInventory]);

const categories = Array.from(new Set(rows.map((r) => r.category))).sort();
const statuses = Array.from(new Set(rows.map((r) => r.status))).sort();

const filtered = rows.filter((r) => {
if (hideArchived && r.status === 'archived') return false;
if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
if (statusFilter !== 'all' && r.status !== statusFilter) return false;
const q = search.trim().toLowerCase();
if (q) {
return r.name.toLowerCase().includes(q)
|| r.sku.toLowerCase().includes(q)
|| (r.barcode || '').toLowerCase().includes(q);
}
return true;
});

const totalCount = rows.length;
const activeCount = rows.filter((r) => r.status === 'active').length;
const noCostCount = rows.filter((r) => r.current_cost == null).length;
const noPricingCount = rows.filter((r) => r.pricing_channels_count === 0).length;

return (
<div style={{ padding: 20, fontFamily: 'system-ui, -apple-system, sans-serif' }}>

<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
<div>
<div style={{ fontWeight: 900, fontSize: 22, color: '#1a2e5a' }}>📦 Inventory</div>
<div style={{ fontSize: 12, color: '#94a3b8' }}>
{totalCount} products · {activeCount} active · {noCostCount} missing cost · {noPricingCount} unpriced
</div>
</div>
<div style={{ display: 'flex', gap: 8 }}>
<Link href="/pos/scan" style={{ backgroundColor: '#1a2e5a', color: '#f4c842', textDecoration: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 800 }}>
📷 Scan to onboard
</Link>
<button onClick={loadInventory} style={{ backgroundColor: '#fff', color: '#1a2e5a', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
↻ Refresh
</button>
</div>
</div>

<div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginBottom: 16 }}>
<input
type="text"
placeholder="Search by name, SKU, or barcode…"
value={search}
onChange={(e) => setSearch(e.target.value)}
style={{ width: '100%', padding: '9px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
/>
<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
<select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 12, fontWeight: 700, backgroundColor: '#fff' }}>
<option value="all">All categories ({rows.length})</option>
{categories.map((c) => (
<option key={c} value={c}>
{CATEGORY_EMOJI[c] || '📦'} {CATEGORY_LABEL[c] || c} ({rows.filter((r) => r.category === c).length})
</option>
))}
</select>
<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 12, fontWeight: 700, backgroundColor: '#fff' }}>
<option value="all">All statuses</option>
{statuses.map((s) => (
<option key={s} value={s}>{s}</option>
))}
</select>
<label style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
<input type="checkbox" checked={hideArchived} onChange={(e) => setHideArchived(e.target.checked)} />
Hide archived
</label>
</div>
</div>

{loading && (
<div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
<div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>Loading inventory…
</div>
)}

{error && (
<div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 16, color: '#991b1b' }}>
<div style={{ fontWeight: 800, marginBottom: 4 }}>Could not load inventory</div>
<div style={{ fontSize: 12 }}>{error}</div>
<button onClick={loadInventory} style={{ marginTop: 10, padding: '6px 14px', borderRadius: 8, border: '1px solid #991b1b', backgroundColor: '#fff', color: '#991b1b', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
</div>
)}

{!loading && !error && filtered.length === 0 && (
<div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
<div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
<div style={{ fontWeight: 700 }}>No matches</div>
</div>
)}

{!loading && !error && filtered.length > 0 && (
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
{filtered.map((r) => {
const statusColor = STATUS_COLORS[r.status] || STATUS_COLORS.archived;
const channelTags = [];
if (r.sell_nassau) channelTags.push('Nassau');
if (r.sell_andros) channelTags.push('Andros');
if (r.sell_online) channelTags.push('Online');
if (r.sell_wholesale) channelTags.push('Wholesale');

return (
<div key={r.product_id} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>

<div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
<div style={{ fontSize: 28, flexShrink: 0 }}>{CATEGORY_EMOJI[r.category] || '📦'}</div>
<div style={{ flex: 1, minWidth: 0 }}>
<div style={{ fontWeight: 800, fontSize: 14, color: '#1a2e5a', marginBottom: 2 }}>{r.name}</div>
<div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
{r.sku}{r.barcode ? ` · ${r.barcode}` : ''}
</div>
</div>
<span style={{ fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 6, backgroundColor: statusColor.bg, color: statusColor.text, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
{r.status === 'pending_approval' ? 'Pending' : r.status}
</span>
</div>

<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
<div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: 8 }}>
<div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Cost</div>
{r.current_cost != null ? (
<div style={{ fontWeight: 800, fontSize: 13, color: '#1a2e5a' }}>${Number(r.current_cost).toFixed(2)}/{r.unit_of_measure}</div>
) : (
<div style={{ fontWeight: 700, fontSize: 11, color: '#dc2626' }}>⚠️ No cost</div>
)}
</div>
<div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: 8 }}>
<div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Pricing</div>
{r.pricing_channels_count > 0 ? (
<div style={{ fontWeight: 800, fontSize: 13, color: '#1a2e5a' }}>{r.pricing_channels_count} channel{r.pricing_channels_count !== 1 ? 's' : ''}</div>
) : (
<div style={{ fontWeight: 700, fontSize: 11, color: '#dc2626' }}>⚠️ Unpriced</div>
)}
</div>
</div>

{channelTags.length > 0 && (
<div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
{channelTags.map((c) => (
<span key={c} style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: 4, fontWeight: 700 }}>
✓ {c}
</span>
))}
</div>
)}

<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 5 }}>
<button onClick={() => setEditing({ row: r, mode: 'cost' })} style={btnSmall}>💰 Edit Cost</button>
<button onClick={() => setEditing({ row: r, mode: 'price' })} style={btnSmall}>🏷️ Edit Price</button>
<button onClick={() => setEditing({ row: r, mode: 'channels' })} style={btnSmall}>📍 Channels</button>
<button onClick={() => setEditing({ row: r, mode: 'status' })} style={btnSmall}>⚙️ Status</button>
</div>
</div>
);
})}
</div>
)}

{editing && (
<EditModal
row={editing.row}
mode={editing.mode}
onClose={() => setEditing(null)}
onSaved={() => { setEditing(null); loadInventory(); }}
/>
)}
</div>
);
}

const btnSmall: React.CSSProperties = {
padding: '7px 8px',
borderRadius: 7,
border: '1.5px solid #e5e7eb',
backgroundColor: '#fff',
color: '#1a2e5a',
fontSize: 11,
fontWeight: 700,
cursor: 'pointer',
textAlign: 'center',
};

function EditModal({ row, mode, onClose, onSaved }: { row: InventoryRow; mode: EditMode; onClose: () => void; onSaved: () => void }) {
const [saving, setSaving] = useState(false);
const [err, setErr] = useState<string | null>(null);

const [cost, setCost] = useState<string>(row.current_cost != null ? String(row.current_cost) : '');
const [costNotes, setCostNotes] = useState('');

const [channel, setChannel] = useState<string>('nassau_pos');
const [pricingMode, setPricingMode] = useState<'formula' | 'manual_override'>('formula');
const [margin, setMargin] = useState<string>('1.38');
const [vat, setVat] = useState<string>('1.00');
const [manualPrice, setManualPrice] = useState<string>('');

const [chNassau, setChNassau] = useState(row.sell_nassau);
const [chAndros, setChAndros] = useState(row.sell_andros);
const [chOnline, setChOnline] = useState(row.sell_online);
const [chWholesale, setChWholesale] = useState(row.sell_wholesale);

const [status, setStatus] = useState(row.status);

useEffect(() => {
const def = CHANNEL_DEFAULTS[channel];
if (def) {
setMargin(def.margin.toFixed(2));
setVat(def.vat.toFixed(2));
}
}, [channel]);

async function callApi(payload: object) {
setSaving(true);
setErr(null);
try {
const res = await fetch(API_URL, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(payload),
});
const json = await res.json();
if (!res.ok) throw new Error(json.error || 'Save failed');
onSaved();
} catch (e) {
setErr(e instanceof Error ? e.message : 'Save failed');
} finally {
setSaving(false);
}
}

const computedPrice = (() => {
if (pricingMode === 'manual_override') {
const p = parseFloat(manualPrice);
return isNaN(p) ? null : p;
}
const c = row.current_cost ? Number(row.current_cost) : null;
const m = parseFloat(margin);
const v = parseFloat(vat);
if (c == null || isNaN(m) || isNaN(v)) return null;
return c * m * v;
})();

return (
<>
<div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 60 }} />
<div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: 460, width: 'calc(100% - 32px)', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto', backgroundColor: '#fff', borderRadius: 16, zIndex: 61, boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>

<div style={{ padding: 20, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
<div>
<div style={{ fontWeight: 900, fontSize: 16, color: '#1a2e5a' }}>{row.name}</div>
<div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>{row.sku}</div>
</div>
<button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: '#64748b', cursor: 'pointer', lineHeight: 1 }}>×</button>
</div>

<div style={{ padding: 20 }}>

{mode === 'cost' && (
<>
<div style={{ fontWeight: 800, fontSize: 14, color: '#1a2e5a', marginBottom: 12 }}>💰 Update Cost</div>
{row.current_cost != null && (
<div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
Current: <strong>${Number(row.current_cost).toFixed(4)}/{row.unit_of_measure}</strong>
</div>
)}
<label style={lbl}>New cost per {row.unit_of_measure} ($)</label>
<input type="number" step="0.0001" value={cost} onChange={(e) => setCost(e.target.value)} style={input} placeholder="e.g. 6.6446" />

<label style={lbl}>Notes (optional)</label>
<input type="text" value={costNotes} onChange={(e) => setCostNotes(e.target.value)} style={input} placeholder="e.g. Father & Son invoice 5/6" />

<button
disabled={saving || !cost || isNaN(parseFloat(cost)) || parseFloat(cost) < 0}
onClick={() => callApi({
action: 'update_cost',
product_id: row.product_id,
cost_per_unit: parseFloat(cost),
unit_of_measure: row.unit_of_measure,
supplier_id: row.primary_supplier_id,
notes: costNotes || null,
})}
style={primaryBtn(saving)}
>
{saving ? 'Saving…' : 'Save Cost'}
</button>
</>
)}

{mode === 'price' && (
<>
<div style={{ fontWeight: 800, fontSize: 14, color: '#1a2e5a', marginBottom: 12 }}>🏷️ Update Selling Price</div>

<label style={lbl}>Channel</label>
<select value={channel} onChange={(e) => setChannel(e.target.value)} style={input}>
<option value="nassau_pos">Nassau POS (38% margin)</option>
<option value="andros_pos">Andros POS (43% margin)</option>
<option value="online_market">Online (25% margin)</option>
<option value="local_wholesale">Wholesale (15% margin)</option>
</select>

<label style={lbl}>Pricing Mode</label>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
<button
onClick={() => setPricingMode('formula')}
style={{ padding: 10, borderRadius: 8, border: '2px solid', borderColor: pricingMode === 'formula' ? '#1a2e5a' : '#e5e7eb', backgroundColor: pricingMode === 'formula' ? '#1a2e5a' : '#fff', color: pricingMode === 'formula' ? '#f4c842' : '#666', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
>
Formula (cost × margin)
</button>
<button
onClick={() => setPricingMode('manual_override')}
style={{ padding: 10, borderRadius: 8, border: '2px solid', borderColor: pricingMode === 'manual_override' ? '#1a2e5a' : '#e5e7eb', backgroundColor: pricingMode === 'manual_override' ? '#1a2e5a' : '#fff', color: pricingMode === 'manual_override' ? '#f4c842' : '#666', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
>
Manual price
</button>
</div>

{pricingMode === 'formula' && (
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
<div>
<label style={lbl}>Margin multiplier</label>
<input type="number" step="0.01" value={margin} onChange={(e) => setMargin(e.target.value)} style={input} />
</div>
<div>
<label style={lbl}>Tax multiplier</label>
<input type="number" step="0.01" value={vat} onChange={(e) => setVat(e.target.value)} style={input} />
</div>
</div>
)}

{pricingMode === 'manual_override' && (
<>
<label style={lbl}>Manual unit price ($)</label>
<input type="number" step="0.01" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} style={input} placeholder="e.g. 16.50" />
</>
)}

{computedPrice != null && computedPrice > 0 && (
<div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
<div style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', marginBottom: 2 }}>Will sell at</div>
<div style={{ fontSize: 20, fontWeight: 900, color: '#1a2e5a' }}>${computedPrice.toFixed(2)}</div>
{pricingMode === 'formula' && row.current_cost && (
<div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
${Number(row.current_cost).toFixed(4)} × {margin} × {vat}
</div>
)}
</div>
)}

{pricingMode === 'formula' && row.current_cost == null && (
<div style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 11, color: '#92400e' }}>
⚠️ This product has no cost yet. Formula pricing will compute $0 until you set a cost.
</div>
)}

<button
disabled={saving || (pricingMode === 'manual_override' && (!manualPrice || isNaN(parseFloat(manualPrice))))}
onClick={() => callApi({
action: 'update_price',
product_id: row.product_id,
channel,
pricing_mode: pricingMode,
margin_multiplier: pricingMode === 'formula' ? parseFloat(margin) : null,
vat_multiplier: parseFloat(vat) || 1.0,
manual_unit_price: pricingMode === 'manual_override' ? parseFloat(manualPrice) : null,
})}
style={primaryBtn(saving)}
>
{saving ? 'Saving…' : `Save ${CHANNEL_LABELS[channel]} Price`}
</button>
</>
)}

{mode === 'channels' && (
<>
<div style={{ fontWeight: 800, fontSize: 14, color: '#1a2e5a', marginBottom: 12 }}>📍 Sales Channels</div>
<div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>Toggle which sales channels this product is available on.</div>

{[
{ key: 'sell_nassau', label: 'Nassau POS', val: chNassau, set: setChNassau },
{ key: 'sell_andros', label: 'Andros POS', val: chAndros, set: setChAndros },
{ key: 'sell_online', label: 'Retail Online Market', val: chOnline, set: setChOnline },
{ key: 'sell_wholesale', label: 'Local Wholesale', val: chWholesale, set: setChWholesale },
].map((c) => (
<label key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
<span style={{ fontSize: 13, color: '#1a2e5a', fontWeight: 600 }}>{c.label}</span>
<input type="checkbox" checked={c.val} onChange={(e) => c.set(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
</label>
))}

<button
disabled={saving}
onClick={() => callApi({
action: 'update_channels',
product_id: row.product_id,
sell_nassau: chNassau,
sell_andros: chAndros,
sell_online: chOnline,
sell_wholesale: chWholesale,
})}
style={{ ...primaryBtn(saving), marginTop: 16 }}
>
{saving ? 'Saving…' : 'Save Channels'}
</button>
</>
)}

{mode === 'status' && (
<>
<div style={{ fontWeight: 800, fontSize: 14, color: '#1a2e5a', marginBottom: 12 }}>⚙️ Product Status</div>

<label style={lbl}>Status</label>
<select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
<option value="draft">Draft (not visible anywhere)</option>
<option value="pending_approval">Pending approval</option>
<option value="active">Active (sellable)</option>
<option value="discontinued">Discontinued</option>
<option value="archived">Archived (hidden)</option>
</select>

<button
disabled={saving || status === row.status}
onClick={() => callApi({
action: 'update_status',
product_id: row.product_id,
status,
})}
style={primaryBtn(saving)}
>
{saving ? 'Saving…' : status === row.status ? 'No change' : `Change to ${status}`}
</button>
</>
)}

{err && (
<div style={{ marginTop: 14, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, fontSize: 12, color: '#991b1b' }}>
{err}
</div>
)}
</div>
</div>
</>
);
}

const lbl: React.CSSProperties = {
display: 'block',
fontSize: 10,
fontWeight: 700,
color: '#64748b',
textTransform: 'uppercase',
letterSpacing: 0.5,
marginBottom: 4,
marginTop: 8,
};

const input: React.CSSProperties = {
width: '100%',
padding: '10px 12px',
borderRadius: 8,
border: '1.5px solid #e5e7eb',
fontSize: 13,
outline: 'none',
marginBottom: 8,
boxSizing: 'border-box',
};

function primaryBtn(saving: boolean): React.CSSProperties {
return {
width: '100%',
backgroundColor: saving ? '#e5e7eb' : '#1a2e5a',
color: saving ? '#999' : '#f4c842',
border: 'none',
borderRadius: 10,
padding: 12,
fontWeight: 800,
fontSize: 13,
cursor: saving ? 'not-allowed' : 'pointer',
marginTop: 8,
};
}
