// ============================================================
// BSC MARKETPLACE — INVOICE SCANNER COMPONENT
// File: components/InvoiceScanner.tsx
// Multi-page upload, location selection, editable split
// ============================================================

'use client';

import { useState, useRef } from 'react';

type LocationKey = 'nassau' | 'andros' | 'online' | 'all';

type SplitItem = {
item: string;
qty: string;
price: string;
wholesale: boolean;
};

type InvoiceSplit = {
items: SplitItem[];
supplierOwed: string;
bscKeeps: string;
summary: string;
location: LocationKey;
} | null;

const LOCATIONS: { key: LocationKey; label: string; icon: string; margin: number }[] = [
{ key: 'nassau', label: 'Nassau POS', icon: '🟡', margin: 0.38 },
{ key: 'andros', label: 'Andros POS', icon: '🟣', margin: 0.43 },
{ key: 'online', label: 'Online Market', icon: '🛒', margin: 0.25 },
{ key: 'all', label: 'All Locations', icon: '📍', margin: 0.30 },
];

function fmtBSD(n: number) {
return `BSD $${n.toFixed(2)}`;
}

function parsePrice(str: string): number {
return parseFloat(str.replace(/[^0-9.]/g, '')) || 0;
}

export default function InvoiceScanner() {
const [pages, setPages] = useState<string[]>([]);
const [location, setLocation] = useState<LocationKey | null>(null);
const [step, setStep] = useState<'upload' | 'location' | 'review' | 'done'>('upload');
const [loading, setLoading] = useState(false);
const [split, setSplit] = useState<InvoiceSplit>(null);
const [editItems, setEditItems] = useState<SplitItem[]>([]);
const [error, setError] = useState('');
const fileInputRef = useRef<HTMLInputElement>(null);
const cameraInputRef = useRef<HTMLInputElement>(null);

// Add pages from file picker
function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
const files = Array.from(e.target.files || []);
if (!files.length) return;
files.forEach((file) => {
const reader = new FileReader();
reader.onload = () => {
setPages((prev) => [...prev, reader.result as string]);
};
reader.readAsDataURL(file);
});
e.target.value = '';
}

function removePage(idx: number) {
setPages((prev) => prev.filter((_, i) => i !== idx));
}

async function analyzeInvoice() {
if (!pages.length || !location) return;
setLoading(true);
setError('');
try {
const images = pages.map((p) => p.split(',')[1]);
const loc = LOCATIONS.find((l) => l.key === location)!;
const res = await fetch('/api/invoice-scan', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ images, location: loc.label, margin: loc.margin }),
});
const data = await res.json();
if (data.split) {
setSplit({ ...data.split, location });
setEditItems(data.split.items || []);
setStep('review');
} else {
setError('Could not read invoice. Please try a clearer photo.');
}
} catch {
setError('Connection error. Please try again.');
}
setLoading(false);
}

function updateItem(idx: number, field: keyof SplitItem, value: string | boolean) {
setEditItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
}

function addItem() {
setEditItems((prev) => [...prev, { item: '', qty: '', price: '', wholesale: false }]);
}

function removeItem(idx: number) {
setEditItems((prev) => prev.filter((_, i) => i !== idx));
}

const loc = LOCATIONS.find((l) => l.key === location);
const margin = loc?.margin ?? 0.30;
const totalInvoice = editItems.reduce((sum, item) => sum + parsePrice(item.price), 0);
const bscKeeps = totalInvoice * margin;
const supplierOwed = totalInvoice - bscKeeps;

function reset() {
setPages([]);
setLocation(null);
setStep('upload');
setSplit(null);
setEditItems([]);
setError('');
}

// ── STEP 1: UPLOAD ──────────────────────────────────────
if (step === 'upload') {
return (
<div style={s.card}>
<h2 style={s.title}>📷 Invoice Scanner</h2>
<p style={s.sub}>Upload one or multiple pages of a supplier invoice. AI will read and split it.</p>

{/* Hidden inputs */}
<input ref={cameraInputRef} type="file" accept="image/*" capture="environment" multiple onChange={handleFiles} style={{ display: 'none' }} />
<input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: 'none' }} />

{/* Upload buttons */}
<div style={s.btnRow}>
<button style={s.btnDark} onClick={() => cameraInputRef.current?.click()}>
📸 Take Photo
</button>
<button style={s.btnLight} onClick={() => fileInputRef.current?.click()}>
📁 Upload File
</button>
</div>

{/* Page thumbnails */}
{pages.length > 0 && (
<div style={{ marginTop: 16 }}>
<div style={s.pageLabel}>
{pages.length} page{pages.length > 1 ? 's' : ''} added
</div>
<div style={s.thumbRow}>
{pages.map((page, i) => (
<div key={i} style={s.thumb}>
<img src={page} alt={`Page ${i + 1}`} style={s.thumbImg} />
<div style={s.thumbNum}>Page {i + 1}</div>
<button style={s.thumbRemove} onClick={() => removePage(i)}>✕</button>
</div>
))}
{/* Add more pages */}
<button style={s.thumbAdd} onClick={() => cameraInputRef.current?.click()}>
<div style={{ fontSize: 24 }}>+</div>
<div style={{ fontSize: 11, color: '#999' }}>Add Page</div>
</button>
</div>
</div>
)}

{error && <p style={s.error}>{error}</p>}

{pages.length > 0 && (
<button style={s.btnGreen} onClick={() => setStep('location')}>
Next — Select Location →
</button>
)}
</div>
);
}

// ── STEP 2: LOCATION ────────────────────────────────────
if (step === 'location') {
return (
<div style={s.card}>
<button style={s.backBtn} onClick={() => setStep('upload')}>← Back</button>
<h2 style={s.title}>📍 Where Will These Products Be Sold?</h2>
<p style={s.sub}>Select the sales channel so BSC can calculate the correct margin and supplier split.</p>

<div style={s.locationGrid}>
{LOCATIONS.map((loc) => (
<button
key={loc.key}
style={{
...s.locationBtn,
...(location === loc.key ? s.locationBtnActive : {}),
}}
onClick={() => setLocation(loc.key)}
>
<div style={s.locationIcon}>{loc.icon}</div>
<div style={s.locationLabel}>{loc.label}</div>
<div style={s.locationMargin}>{(loc.margin * 100).toFixed(0)}% margin</div>
</button>
))}
</div>

{error && <p style={s.error}>{error}</p>}

<button
style={{ ...s.btnGreen, opacity: location && !loading ? 1 : 0.5 }}
disabled={!location || loading}
onClick={analyzeInvoice}
>
{loading ? '🤖 Reading Invoice...' : '🤖 Analyze Invoice →'}
</button>
</div>
);
}

// ── STEP 3: REVIEW & EDIT ───────────────────────────────
if (step === 'review') {
return (
<div style={s.card}>
<button style={s.backBtn} onClick={() => setStep('location')}>← Back</button>
<h2 style={s.title}>✏️ Review & Edit Invoice Split</h2>
<p style={s.sub}>Check every line. Edit items, quantities, and prices. Toggle Wholesale / Retail per item.</p>

{/* Totals */}
<div style={s.totalsRow}>
<div style={{ ...s.totalBox, backgroundColor: '#e8f5e9' }}>
<div style={s.totalLabel}>BSC Keeps ({(margin * 100).toFixed(0)}%)</div>
<div style={{ ...s.totalValue, color: '#2e7d32' }}>{fmtBSD(bscKeeps)}</div>
</div>
<div style={{ ...s.totalBox, backgroundColor: '#fde8e8' }}>
<div style={s.totalLabel}>Supplier Owed</div>
<div style={{ ...s.totalValue, color: '#dc2626' }}>{fmtBSD(supplierOwed)}</div>
</div>
<div style={{ ...s.totalBox, backgroundColor: '#e8f4fd' }}>
<div style={s.totalLabel}>Invoice Total</div>
<div style={{ ...s.totalValue, color: '#1a2e5a' }}>{fmtBSD(totalInvoice)}</div>
</div>
</div>

{/* Location badge */}
<div style={s.locBadge}>
{loc?.icon} {loc?.label} — {(margin * 100).toFixed(0)}% BSC margin
</div>

{/* Item editor */}
<div style={{ marginBottom: 12 }}>
{editItems.map((item, i) => (
<div key={i} style={s.itemRow}>
<div style={s.itemTop}>
<input
style={s.itemInput}
placeholder="Product name"
value={item.item}
onChange={(e) => updateItem(i, 'item', e.target.value)}
/>
<button style={s.itemRemove} onClick={() => removeItem(i)}>✕</button>
</div>
<div style={s.itemBottom}>
<input
style={{ ...s.itemInput, flex: 1 }}
placeholder="Qty (e.g. 50 lbs)"
value={item.qty}
onChange={(e) => updateItem(i, 'qty', e.target.value)}
/>
<input
style={{ ...s.itemInput, flex: 1 }}
placeholder="Price (e.g. $125.00)"
value={item.price}
onChange={(e) => updateItem(i, 'price', e.target.value)}
/>
<button
style={{
...s.toggleBtn,
backgroundColor: item.wholesale ? '#1a2e5a' : '#f0fde8',
color: item.wholesale ? '#f4c842' : '#2e7d32',
}}
onClick={() => updateItem(i, 'wholesale', !item.wholesale)}
>
{item.wholesale ? '📦 Wholesale' : '🛒 Retail'}
</button>
</div>
</div>
))}
</div>

<button style={s.addItemBtn} onClick={addItem}>+ Add Item</button>

{/* Summary from AI */}
{split?.summary && (
<div style={s.summaryBox}>
<div style={s.summaryLabel}>AI Summary</div>
<div style={s.summaryText}>{split.summary}</div>
</div>
)}

<button style={s.btnGreen} onClick={() => setStep('done')}>
✅ Confirm & Save Split
</button>
</div>
);
}

// ── STEP 4: DONE ────────────────────────────────────────
if (step === 'done') {
return (
<div style={s.card}>
<div style={{ textAlign: 'center', marginBottom: 20 }}>
<div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
<h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 18, margin: 0 }}>Invoice Split Confirmed</h2>
<p style={{ color: '#666', fontSize: 13, marginTop: 6 }}>
{loc?.icon} {loc?.label} · {editItems.length} items
</p>
</div>

<div style={s.totalsRow}>
<div style={{ ...s.totalBox, backgroundColor: '#e8f5e9' }}>
<div style={s.totalLabel}>BSC Keeps</div>
<div style={{ ...s.totalValue, color: '#2e7d32' }}>{fmtBSD(bscKeeps)}</div>
</div>
<div style={{ ...s.totalBox, backgroundColor: '#fde8e8' }}>
<div style={s.totalLabel}>Supplier Owed</div>
<div style={{ ...s.totalValue, color: '#dc2626' }}>{fmtBSD(supplierOwed)}</div>
</div>
</div>

<div style={{ marginBottom: 16 }}>
{editItems.filter(i => !i.wholesale).length > 0 && (
<div style={{ marginBottom: 10 }}>
<div style={s.splitLabel}>🛒 Retail Items</div>
{editItems.filter(i => !i.wholesale).map((item, i) => (
<div key={i} style={{ ...s.doneItem, backgroundColor: '#e8f4fd' }}>
<span style={s.doneItemName}>{item.item}</span>
<span style={s.doneItemDetail}>{item.qty} · {item.price}</span>
</div>
))}
</div>
)}
{editItems.filter(i => i.wholesale).length > 0 && (
<div>
<div style={s.splitLabel}>📦 Wholesale Items</div>
{editItems.filter(i => i.wholesale).map((item, i) => (
<div key={i} style={{ ...s.doneItem, backgroundColor: '#f0fde8' }}>
<span style={s.doneItemName}>{item.item}</span>
<span style={s.doneItemDetail}>{item.qty} · {item.price}</span>
</div>
))}
</div>
)}
</div>

<button style={s.btnDark} onClick={reset}>
📷 Scan Another Invoice
</button>
</div>
);
}

return null;
}

const s: Record<string, React.CSSProperties> = {
card: {
backgroundColor: '#fff',
borderRadius: 16,
padding: 18,
boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
marginBottom: 20,
display: 'flex',
flexDirection: 'column',
gap: 12,
},
title: { color: '#1a2e5a', fontWeight: 900, fontSize: 15, margin: 0 },
sub: { color: '#999', fontSize: 12, margin: 0, lineHeight: 1.5 },
btnRow: { display: 'flex', gap: 10 },
btnDark: {
flex: 1, backgroundColor: '#1a2e5a', color: '#f4c842',
border: 'none', borderRadius: 12, padding: 14,
fontWeight: 800, fontSize: 14, cursor: 'pointer',
},
btnLight: {
flex: 1, backgroundColor: '#f0f4ff', color: '#1a2e5a',
border: '1px solid #e5e7eb', borderRadius: 12, padding: 14,
fontWeight: 800, fontSize: 14, cursor: 'pointer',
},
btnGreen: {
width: '100%', backgroundColor: '#2e7d32', color: '#fff',
border: 'none', borderRadius: 12, padding: 14,
fontWeight: 800, fontSize: 14, cursor: 'pointer',
},
backBtn: {
background: 'none', border: 'none', color: '#1a2e5a',
fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0,
textAlign: 'left',
},
pageLabel: { color: '#1a2e5a', fontWeight: 700, fontSize: 13, marginBottom: 8 },
thumbRow: {
display: 'flex', gap: 10, flexWrap: 'wrap',
},
thumb: {
position: 'relative', width: 80, flexShrink: 0,
display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
},
thumbImg: {
width: 80, height: 100, objectFit: 'cover',
borderRadius: 8, border: '2px solid #1a2e5a',
},
thumbNum: { color: '#666', fontSize: 10, fontWeight: 600 },
thumbRemove: {
position: 'absolute', top: 4, right: 4,
backgroundColor: '#dc2626', color: '#fff',
border: 'none', borderRadius: 6, padding: '2px 6px',
fontSize: 10, fontWeight: 700, cursor: 'pointer',
},
thumbAdd: {
width: 80, height: 100, border: '2px dashed #d1d5db',
borderRadius: 8, backgroundColor: '#f8f9fa',
display: 'flex', flexDirection: 'column',
alignItems: 'center', justifyContent: 'center',
cursor: 'pointer', gap: 4,
},
error: { color: '#dc2626', fontSize: 13, margin: 0, fontWeight: 600 },
locationGrid: {
display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10,
},
locationBtn: {
backgroundColor: '#f8f9fa', border: '2px solid #e5e7eb',
borderRadius: 12, padding: '14px 10px',
display: 'flex', flexDirection: 'column', alignItems: 'center',
gap: 4, cursor: 'pointer',
},
locationBtnActive: {
borderColor: '#1a2e5a', backgroundColor: '#eff6ff',
},
locationIcon: { fontSize: 28 },
locationLabel: { color: '#1a2e5a', fontWeight: 800, fontSize: 13 },
locationMargin: { color: '#2e7d32', fontSize: 11, fontWeight: 600 },
totalsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
totalBox: { borderRadius: 10, padding: '10px 8px', textAlign: 'center' },
totalLabel: { color: '#666', fontSize: 10, marginBottom: 4 },
totalValue: { fontWeight: 900, fontSize: 16 },
locBadge: {
backgroundColor: '#f0f4ff', borderRadius: 8,
padding: '8px 12px', fontSize: 12,
color: '#1a2e5a', fontWeight: 700,
},
itemRow: {
backgroundColor: '#f8f9fa', borderRadius: 10,
padding: '10px 12px', marginBottom: 8,
display: 'flex', flexDirection: 'column', gap: 8,
},
itemTop: { display: 'flex', gap: 8, alignItems: 'center' },
itemBottom: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
itemInput: {
flex: 1, padding: '8px 10px', borderRadius: 8,
border: '1px solid #e5e7eb', fontSize: 13, outline: 'none',
backgroundColor: '#fff', minWidth: 80,
},
itemRemove: {
backgroundColor: '#fde8e8', color: '#dc2626',
border: 'none', borderRadius: 6,
padding: '6px 10px', fontSize: 12,
fontWeight: 700, cursor: 'pointer', flexShrink: 0,
},
toggleBtn: {
border: 'none', borderRadius: 8,
padding: '8px 12px', fontSize: 12,
fontWeight: 700, cursor: 'pointer', flexShrink: 0,
},
addItemBtn: {
backgroundColor: '#f0f4ff', color: '#1a2e5a',
border: '1px dashed #1a2e5a', borderRadius: 10,
padding: '10px', fontSize: 13,
fontWeight: 700, cursor: 'pointer', width: '100%',
},
summaryBox: {
backgroundColor: '#fef9e7', borderRadius: 10,
padding: '12px', borderLeft: '4px solid #f4c842',
},
summaryLabel: { color: '#1a2e5a', fontWeight: 800, fontSize: 12, marginBottom: 4 },
summaryText: { color: '#444', fontSize: 13, lineHeight: 1.6 },
splitLabel: { color: '#1a2e5a', fontWeight: 800, fontSize: 13, marginBottom: 6 },
doneItem: {
display: 'flex', justifyContent: 'space-between',
borderRadius: 8, padding: '8px 12px', marginBottom: 4,
},
doneItemName: { color: '#1a2e5a', fontSize: 13, fontWeight: 600 },
doneItemDetail: { color: '#666', fontSize: 12 },
};
