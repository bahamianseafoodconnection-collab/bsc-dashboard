// File: app/purchase-orders/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
'https://auqjjrisivhfmpleusyt.supabase.co',
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg'
);

type Screen = 'list' | 'new' | 'review';

type POItem = {
name: string;
cases: number;
unitDescription: string;
totalLbs: number;
costPerCase: number;
totalCost: number;
};

type PurchaseOrder = {
id: string;
supplier_name: string;
invoice_photo_url: string;
ai_summary: string;
items: POItem[];
total_cost: number;
retail_physical: number;
retail_online: number;
wholesale_physical: number;
wholesale_online: number;
status: string;
allocated_by: string;
created_at: string;
};

type Allocation = {
retail_physical: number;
retail_online: number;
wholesale_physical: number;
wholesale_online: number;
};

export default function PurchaseOrdersPage() {
const router = useRouter();
const [screen, setScreen] = useState<Screen>('list');
const [orders, setOrders] = useState<PurchaseOrder[]>([]);
const [loading, setLoading] = useState(true);
const [processing, setProcessing] = useState(false);
const [success, setSuccess] = useState('');
const [error, setError] = useState('');

// NEW PO STATE
const [supplierName, setSupplierName] = useState('');
const [photo, setPhoto] = useState<File | null>(null);
const [photoPreview, setPhotoPreview] = useState('');
const [aiSummary, setAiSummary] = useState('');
const [aiItems, setAiItems] = useState<POItem[]>([]);
const [aiLoading, setAiLoading] = useState(false);
const [manualItems, setManualItems] = useState<POItem[]>([
{ name: '', cases: 0, unitDescription: '', totalLbs: 0, costPerCase: 0, totalCost: 0 }
]);
const [useManual, setUseManual] = useState(false);
const [allocation, setAllocation] = useState<Allocation>({
retail_physical: 0,
retail_online: 0,
wholesale_physical: 0,
wholesale_online: 0,
});
const [allocatedBy, setAllocatedBy] = useState('Dedrick Storr');

useEffect(() => {
loadOrders();
}, []);

async function loadOrders() {
setLoading(true);
try {
const { data } = await supabase
.from('purchase_orders')
.select('*')
.order('created_at', { ascending: false });
if (data) setOrders(data as PurchaseOrder[]);
} catch (e) {}
setLoading(false);
}

async function handlePhotoUpload(file: File) {
setPhoto(file);
setPhotoPreview(URL.createObjectURL(file));
setAiLoading(true);
setAiSummary('');
setAiItems([]);

try {
const reader = new FileReader();
reader.onload = async (e) => {
const base64 = (e.target?.result as string).split(',')[1];
const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const res = await fetch('/api/ai', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
system: `You are an invoice reading assistant for BSC Marketplace (Bahamian Seafood Connection), a seafood and food distribution business in Nassau, Bahamas.
Analyze the invoice image and extract all line items.
Respond ONLY with a valid JSON object in this exact format, no other text:
{
"supplier": "supplier name from invoice",
"summary": "brief 1-2 sentence summary of the invoice",
"items": [
{
"name": "product name",
"cases": 5,
"unitDescription": "e.g. 33lb case, 10lb bag, etc",
"totalLbs": 165,
"costPerCase": 45.00,
"totalCost": 225.00
}
],
"totalCost": 225.00
}
If you cannot read the invoice clearly, still return valid JSON with your best estimate and note uncertainty in the summary.`,
messages: [
{
role: 'user',
content: [
{
type: 'image',
source: {
type: 'base64',
media_type: mediaType,
data: base64,
}
},
{
type: 'text',
text: 'Please read this invoice and extract all line items.'
}
]
}
],
}),
});

const data = await res.json();
const text = data.content?.[0]?.text || '';

try {
const clean = text.replace(/```json|```/g, '').trim();
const parsed = JSON.parse(clean);
if (parsed.supplier && !supplierName) setSupplierName(parsed.supplier);
setAiSummary(parsed.summary || 'Invoice processed');
setAiItems(parsed.items || []);
if (parsed.items?.length > 0) {
const totalCases = parsed.items.reduce((s: number, i: POItem) => s + i.cases, 0);
setAllocation({
retail_physical: Math.round(totalCases * 0.4),
retail_online: Math.round(totalCases * 0.2),
wholesale_physical: Math.round(totalCases * 0.3),
wholesale_online: Math.round(totalCases * 0.1),
});
}
} catch {
setAiSummary('Could not fully parse invoice. Please verify items manually.');
setUseManual(true);
}
setAiLoading(false);
};
reader.readAsDataURL(file);
} catch (e) {
setAiLoading(false);
setUseManual(true);
}
}

function updateManualItem(index: number, field: keyof POItem, value: string | number) {
setManualItems(prev => {
const updated = [...prev];
updated[index] = { ...updated[index], [field]: value };
if (field === 'cases' || field === 'costPerCase') {
updated[index].totalCost = updated[index].cases * updated[index].costPerCase;
}
return updated;
});
}

function addManualItem() {
setManualItems(prev => [...prev, { name: '', cases: 0, unitDescription: '', totalLbs: 0, costPerCase: 0, totalCost: 0 }]);
}

function removeManualItem(index: number) {
setManualItems(prev => prev.filter((_, i) => i !== index));
}

const activeItems = useManual ? manualItems : aiItems;
const totalCost = activeItems.reduce((s, i) => s + i.totalCost, 0);
const totalCases = activeItems.reduce((s, i) => s + i.cases, 0);
const allocatedCases = Object.values(allocation).reduce((s, v) => s + v, 0);
const unallocated = totalCases - allocatedCases;

async function handleSubmit() {
if (!supplierName) { setError('Supplier name required'); return; }
if (activeItems.length === 0 || !activeItems[0].name) { setError('At least one item required'); return; }

setProcessing(true);
setError('');

let photoUrl = '';
if (photo) {
const fileName = Date.now() + '-po-' + photo.name;
const { error: uploadErr } = await supabase.storage.from('product-images').upload(fileName, photo);
if (!uploadErr) {
const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
photoUrl = urlData.publicUrl;
}
}

const { error: insertErr } = await supabase.from('purchase_orders').insert({
supplier_name: supplierName,
invoice_photo_url: photoUrl,
ai_summary: aiSummary || 'Manual entry',
items: JSON.stringify(activeItems),
total_cost: totalCost,
retail_physical: allocation.retail_physical,
retail_online: allocation.retail_online,
wholesale_physical: allocation.wholesale_physical,
wholesale_online: allocation.wholesale_online,
status: 'allocated',
allocated_by: allocatedBy,
});

setProcessing(false);
if (insertErr) {
setError(insertErr.message);
return;
}

setSuccess('Purchase order saved and inventory allocated!');
await loadOrders();
setTimeout(() => {
setSuccess('');
setScreen('list');
setPhoto(null);
setPhotoPreview('');
setAiSummary('');
setAiItems([]);
setSupplierName('');
setUseManual(false);
setManualItems([{ name: '', cases: 0, unitDescription: '', totalLbs: 0, costPerCase: 0, totalCost: 0 }]);
setAllocation({ retail_physical: 0, retail_online: 0, wholesale_physical: 0, wholesale_online: 0 });
}, 2000);
}

const pg: React.CSSProperties = {
padding: 18, backgroundColor: '#060d1f', minHeight: '100vh',
color: '#fff', fontFamily: 'sans-serif', paddingBottom: 80,
maxWidth: 620, margin: '0 auto',
};

const card: React.CSSProperties = {
backgroundColor: '#0d1f3c', borderRadius: 14, padding: '16px 18px',
border: '1px solid #1e3a5f', marginBottom: 14,
};

const inp: React.CSSProperties = {
display: 'block', width: '100%', padding: '11px 13px',
borderRadius: 10, backgroundColor: '#060d1f', color: '#fff',
border: '1px solid #1e3a5f', fontSize: 14, marginBottom: 10,
boxSizing: 'border-box' as const, outline: 'none',
};

const lbl: React.CSSProperties = {
display: 'block', color: '#6b7280', fontSize: 10,
letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 5,
};

const primaryBtn: React.CSSProperties = {
width: '100%', padding: '14px', borderRadius: 12,
backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold',
border: 'none', fontSize: 15, cursor: 'pointer', marginBottom: 10,
};

const secondaryBtn: React.CSSProperties = {
width: '100%', padding: '12px', borderRadius: 12,
backgroundColor: 'transparent', color: '#6b7280',
border: '1px solid #1e3a5f', fontSize: 14, cursor: 'pointer', marginBottom: 10,
};

const statusColor = (status: string) => ({
pending: '#f5c518', allocated: '#4ade80', processed: '#60a5fa'
})[status] || '#aaa';

// ── LIST SCREEN ──
if (screen === 'list') return (
<div style={pg}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
<div>
<button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 4, display: 'block' }}>
← Dashboard
</button>
<h1 style={{ margin: 0, color: '#f5c518', fontSize: 20, fontWeight: 'bold' }}>📦 Purchase Orders</h1>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>Spiny Tails Processing · BSC Marketplace</p>
</div>
<button onClick={() => setScreen('new')} style={{
backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold',
border: 'none', borderRadius: 12, padding: '10px 18px', fontSize: 14, cursor: 'pointer',
}}>
+ New PO
</button>
</div>

{/* QUICK STATS */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
{[
{ label: 'TOTAL ORDERS', value: orders.length, color: '#fff' },
{ label: 'ALLOCATED', value: orders.filter(o => o.status === 'allocated').length, color: '#4ade80' },
{ label: 'TOTAL SPENT', value: '$' + orders.reduce((s, o) => s + (o.total_cost || 0), 0).toFixed(0), color: '#60a5fa' },
].map(stat => (
<div key={stat.label} style={{ ...card, textAlign: 'center', padding: 14, marginBottom: 0 }}>
<p style={{ margin: 0, color: stat.color, fontSize: 20, fontWeight: 'bold' }}>{stat.value}</p>
<p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>{stat.label}</p>
</div>
))}
</div>

{loading && <p style={{ color: '#4a5568', textAlign: 'center', padding: 30 }}>Loading orders...</p>}

{!loading && orders.length === 0 && (
<div style={{ ...card, textAlign: 'center', padding: 40 }}>
<p style={{ fontSize: 40, marginBottom: 12 }}>📦</p>
<p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 16, marginBottom: 6 }}>No Purchase Orders Yet</p>
<p style={{ color: '#4a5568', fontSize: 13, marginBottom: 20 }}>Snap a supplier invoice to create your first order</p>
<button onClick={() => setScreen('new')} style={{ ...primaryBtn, width: 'auto', padding: '12px 28px' }}>
Create First PO
</button>
</div>
)}

{orders.map(order => {
let items: POItem[] = [];
try { items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items; } catch {}
return (
<div key={order.id} style={card}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
<div style={{ flex: 1 }}>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>{order.supplier_name}</p>
<p style={{ margin: '2px 0', color: '#4a5568', fontSize: 12 }}>
{new Date(order.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
{order.allocated_by && ' · By ' + order.allocated_by}
</p>
{order.ai_summary && (
<p style={{ margin: '4px 0 0', color: '#aaa', fontSize: 12, fontStyle: 'italic' }}>{order.ai_summary}</p>
)}
</div>
<div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
<span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 'bold', backgroundColor: order.status === 'allocated' ? '#0a1f0a' : '#1a1400', color: statusColor(order.status), border: '1px solid ' + statusColor(order.status) }}>
{order.status.toUpperCase()}
</span>
<p style={{ margin: '6px 0 0', color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>${order.total_cost?.toFixed(2) || '0.00'}</p>
</div>
</div>

{/* PRODUCTS */}
{items.length > 0 && (
<div style={{ marginBottom: 12 }}>
<p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>ITEMS ({items.length})</p>
{items.map((item, i) => (
<div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #1e3a5f' }}>
<div>
<p style={{ margin: 0, fontSize: 13, fontWeight: 'bold' }}>{item.name}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>
{item.cases} cases {item.unitDescription && '· ' + item.unitDescription}
{item.totalLbs > 0 && ' · ' + item.totalLbs + ' lbs'}
</p>
</div>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>${item.totalCost.toFixed(2)}</p>
</div>
))}
</div>
)}

{/* ALLOCATION */}
<div style={{ backgroundColor: '#060d1f', borderRadius: 10, padding: '10px 12px' }}>
<p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>CASE ALLOCATION</p>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
{[
{ label: '🏬 Retail Physical', value: order.retail_physical, color: '#4ade80' },
{ label: '🌐 Retail Online', value: order.retail_online, color: '#60a5fa' },
{ label: '📦 Wholesale Physical', value: order.wholesale_physical, color: '#f5c518' },
{ label: '🇺🇸 Wholesale Online', value: order.wholesale_online, color: '#a78bfa' },
].map(ch => (
<div key={ch.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{ch.label}</p>
<p style={{ margin: 0, color: ch.color, fontWeight: 'bold', fontSize: 12 }}>{ch.value} cs</p>
</div>
))}
</div>
</div>
</div>
);
})}
</div>
);

// ── NEW PO SCREEN ──
if (screen === 'new') return (
<div style={pg}>
<button onClick={() => setScreen('list')} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 14, cursor: 'pointer', marginBottom: 14, padding: 0 }}>
← Back
</button>
<h2 style={{ margin: '0 0 4px', color: '#f5c518', fontSize: 20 }}>📸 New Purchase Order</h2>
<p style={{ margin: '0 0 20px', color: '#4a5568', fontSize: 13 }}>Snap an invoice or enter manually · AI will read and extract items</p>

{success && (
<div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 12, padding: '14px 16px', marginBottom: 16, textAlign: 'center' }}>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>✅ {success}</p>
</div>
)}

{/* SUPPLIER */}
<div style={card}>
<label style={lbl}>Supplier Name</label>
<input placeholder="e.g. Miami Fish Co, US Foods..." value={supplierName} onChange={(e) => setSupplierName(e.target.value)} style={inp} />

<label style={lbl}>Allocated By</label>
<select value={allocatedBy} onChange={(e) => setAllocatedBy(e.target.value)} style={{ ...inp }}>
<option>Dedrick Storr</option>
<option>Ashley Rolle</option>
</select>
</div>

{/* PHOTO UPLOAD */}
<div style={card}>
<p style={{ margin: '0 0 12px', color: '#60a5fa', fontWeight: 'bold', fontSize: 13 }}>📷 Invoice Photo (AI will read it)</p>
<div
onClick={() => document.getElementById('poPhotoInput')?.click()}
style={{
width: '100%', height: photoPreview ? 200 : 130, borderRadius: 12,
border: '2px dashed ' + (photoPreview ? '#4ade80' : '#1e3a5f'),
display: 'flex', alignItems: 'center', justifyContent: 'center',
cursor: 'pointer', overflow: 'hidden', backgroundColor: '#060d1f', marginBottom: 10,
}}
>
{photoPreview ? (
<img src={photoPreview} alt="Invoice" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
) : (
<div style={{ textAlign: 'center' }}>
<p style={{ margin: 0, fontSize: 32 }}>📷</p>
<p style={{ margin: '8px 0 0', color: '#4a5568', fontSize: 13 }}>Tap to photograph invoice</p>
<p style={{ margin: '4px 0 0', color: '#2a3a5a', fontSize: 11 }}>AI will extract all line items automatically</p>
</div>
)}
</div>
<input
id="poPhotoInput"
type="file"
accept="image/*"
capture="environment"
style={{ display: 'none' }}
onChange={(e) => {
const file = e.target.files?.[0];
if (file) handlePhotoUpload(file);
}}
/>
{photoPreview && (
<button onClick={() => { setPhoto(null); setPhotoPreview(''); setAiSummary(''); setAiItems([]); }}
style={{ ...secondaryBtn, marginBottom: 0 }}>
Remove Photo
</button>
)}
</div>

{/* AI LOADING */}
{aiLoading && (
<div style={{ ...card, textAlign: 'center', padding: 24 }}>
<p style={{ margin: '0 0 8px', fontSize: 32 }}>🤖</p>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>AI Reading Invoice...</p>
<p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 12 }}>Extracting line items and costs</p>
</div>
)}

{/* AI RESULTS */}
{!aiLoading && aiItems.length > 0 && !useManual && (
<div style={card}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>🤖 AI Extracted {aiItems.length} Items</p>
<button onClick={() => setUseManual(true)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer' }}>
Edit Manually
</button>
</div>
{aiSummary && <p style={{ margin: '0 0 12px', color: '#aaa', fontSize: 12, fontStyle: 'italic' }}>{aiSummary}</p>}
{aiItems.map((item, i) => (
<div key={i} style={{ backgroundColor: '#060d1f', borderRadius: 10, padding: '10px 12px', marginBottom: 8, border: '1px solid #1e3a5f' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
<div style={{ flex: 1 }}>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{item.name}</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>
{item.cases} cases {item.unitDescription && '· ' + item.unitDescription}
{item.totalLbs > 0 && ' · ' + item.totalLbs + ' lbs'}
</p>
</div>
<div style={{ textAlign: 'right', flexShrink: 0 }}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>${item.totalCost.toFixed(2)}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>${item.costPerCase.toFixed(2)}/cs</p>
</div>
</div>
</div>
))}
<div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #1e3a5f' }}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>Total Cost</p>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>${totalCost.toFixed(2)}</p>
</div>
</div>
)}

{/* MANUAL ENTRY */}
{(useManual || (!aiLoading && aiItems.length === 0 && !photo)) && (
<div style={card}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>📝 Manual Item Entry</p>
{useManual && aiItems.length > 0 && (
<button onClick={() => setUseManual(false)} style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}>
Use AI Results
</button>
)}
</div>
{manualItems.map((item, i) => (
<div key={i} style={{ backgroundColor: '#060d1f', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #1e3a5f' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
<p style={{ margin: 0, color: '#6b7280', fontSize: 11 }}>Item {i + 1}</p>
{manualItems.length > 1 && (
<button onClick={() => removeManualItem(i)} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 12, cursor: 'pointer' }}>Remove</button>
)}
</div>
<input placeholder="Product name *" value={item.name} onChange={(e) => updateManualItem(i, 'name', e.target.value)} style={inp} />
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
<div>
<label style={lbl}>Cases</label>
<input type="number" placeholder="0" value={item.cases || ''} onChange={(e) => updateManualItem(i, 'cases', parseFloat(e.target.value) || 0)} style={{ ...inp, marginBottom: 0 }} />
</div>
<div>
<label style={lbl}>Cost Per Case ($)</label>
<input type="number" placeholder="0.00" value={item.costPerCase || ''} onChange={(e) => updateManualItem(i, 'costPerCase', parseFloat(e.target.value) || 0)} style={{ ...inp, marginBottom: 0 }} />
</div>
<div>
<label style={lbl}>Unit (e.g. 33lb case)</label>
<input placeholder="33lb case" value={item.unitDescription} onChange={(e) => updateManualItem(i, 'unitDescription', e.target.value)} style={{ ...inp, marginBottom: 0 }} />
</div>
<div>
<label style={lbl}>Total lbs</label>
<input type="number" placeholder="0" value={item.totalLbs || ''} onChange={(e) => updateManualItem(i, 'totalLbs', parseFloat(e.target.value) || 0)} style={{ ...inp, marginBottom: 0 }} />
</div>
</div>
{item.cases > 0 && item.costPerCase > 0 && (
<p style={{ margin: '8px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>
Total: ${(item.cases * item.costPerCase).toFixed(2)}
</p>
)}
</div>
))}
<button onClick={addManualItem} style={{ ...secondaryBtn, borderColor: '#f5c518', color: '#f5c518' }}>
+ Add Another Item
</button>
<div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #1e3a5f' }}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>Total Cost</p>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>${totalCost.toFixed(2)}</p>
</div>
</div>
)}

{/* CASE ALLOCATION */}
{(aiItems.length > 0 || manualItems[0]?.name) && (
<div style={card}>
<p style={{ margin: '0 0 4px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>📊 Allocate Cases</p>
<p style={{ margin: '0 0 14px', color: '#4a5568', fontSize: 12 }}>
Total: <b style={{ color: '#fff' }}>{totalCases} cases</b> · Allocated: <b style={{ color: unallocated === 0 ? '#4ade80' : '#f87171' }}>{allocatedCases}</b> · Remaining: <b style={{ color: unallocated === 0 ? '#4ade80' : '#f87171' }}>{unallocated}</b>
</p>

{[
{ key: 'retail_physical' as keyof Allocation, label: 'Retail — Physical Store', icon: '🏬', color: '#4ade80' },
{ key: 'retail_online' as keyof Allocation, label: 'Retail — Online Market', icon: '🌐', color: '#60a5fa' },
{ key: 'wholesale_physical' as keyof Allocation, label: 'Wholesale — Physical', icon: '📦', color: '#f5c518' },
{ key: 'wholesale_online' as keyof Allocation, label: 'Wholesale — US/Online', icon: '🇺🇸', color: '#a78bfa' },
].map(ch => (
<div key={ch.key} style={{ backgroundColor: '#060d1f', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #1e3a5f' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
<p style={{ margin: 0, color: ch.color, fontWeight: 'bold', fontSize: 13 }}>{ch.icon} {ch.label}</p>
<p style={{ margin: 0, color: ch.color, fontWeight: 'bold', fontSize: 14 }}>{allocation[ch.key]} cases</p>
</div>
<input
type="number"
min={0}
value={allocation[ch.key] || ''}
onChange={(e) => setAllocation(prev => ({ ...prev, [ch.key]: parseInt(e.target.value) || 0 }))}
style={{ ...inp, marginBottom: 0, fontSize: 16, fontWeight: 'bold' }}
/>
</div>
))}

{unallocated !== 0 && (
<div style={{ backgroundColor: unallocated > 0 ? '#1a1400' : '#2d0000', border: '1px solid ' + (unallocated > 0 ? '#f5c518' : '#f87171'), borderRadius: 10, padding: '10px 14px' }}>
<p style={{ margin: 0, color: unallocated > 0 ? '#f5c518' : '#f87171', fontSize: 13 }}>
{unallocated > 0 ? `⚠️ ${unallocated} cases unallocated` : `⚠️ Over-allocated by ${Math.abs(unallocated)} cases`}
</p>
</div>
)}
</div>
)}

{error && (
<p style={{ color: '#f87171', fontSize: 13, backgroundColor: '#2d0000', padding: '10px 14px', borderRadius: 10, marginBottom: 12 }}>
{error}
</p>
)}

<button
onClick={handleSubmit}
disabled={processing || (!supplierName) || (aiItems.length === 0 && !manualItems[0]?.name)}
style={{
...primaryBtn,
backgroundColor: processing ? '#555' : '#f5c518',
cursor: processing ? 'not-allowed' : 'pointer',
}}
>
{processing ? '⏳ Saving...' : '✅ Save Purchase Order'}
</button>
<button onClick={() => setScreen('list')} style={secondaryBtn}>Cancel</button>
</div>
);

return null;
}
