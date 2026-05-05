'use client';

// app/inventory/scan/page.tsx
// BSC Day 6 — Phone-camera barcode scanner · receive shipments · adjust counts
// Tri-lingual scaffold (EN live · HT/ES strings stubbed · Day 13 refines)
// Schema-matched to Day 5 SQL: products.barcode, inventory_movements.product_id (uuid),
// to_location_id (uuid), quantity, unit, recorded_by, occurred_at

import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

type Mode = 'idle' | 'scanning' | 'looking_up' | 'review' | 'saving' | 'done' | 'error';
type Lang = 'en' | 'ht' | 'es';
type Action = 'receive' | 'adjustment';

interface ProductData {
id: string | null;
barcode: string;
sku: string;
name: string;
description: string;
image_url: string | null;
status: string | null;
requires_yield_calc: boolean;
category: string | null;
unit_of_measure: string | null;
pack_size: string | null;
primary_supplier_id: string | null;
exists_in_db: boolean;
}

interface Location {
id: string;
code: string;
name: string;
}

const COPY: Record<Lang, Record<string, string>> = {
en: {
title: 'Scan Inventory',
subtitle: 'Phone-camera barcode scanner · Receive · Adjust',
start: 'Start Camera',
stop: 'Stop Camera',
scanning: 'Point at barcode',
looking: 'Looking up product…',
new_label: 'NEW PRODUCT',
existing_label: 'IN DATABASE',
yield_locked_label: 'YIELD-LOCKED',
yield_locked_msg:
'Awaiting Spiny Tail processing — receive at raw weight, yield calc happens at Day 8',
barcode: 'Barcode',
sku: 'SKU',
name: 'Product Name',
location: 'Freezer / Location',
quantity: 'Quantity',
unit: 'Unit',
notes: 'Notes',
receive: 'RECEIVE',
adjust: 'ADJUST',
submit: 'Save Movement',
saving: 'Saving…',
done: 'Saved ✓',
again: 'Scan Another',
error: 'Error',
cam_error: 'Camera not available. Try Chrome or Safari.',
perm_error: 'Allow camera permission to scan',
select: 'Select…',
},
ht: {
title: 'Eskane Envantè',
subtitle: 'Eskane kòd ba ak kamera telefòn',
start: 'Kòmanse Kamera',
stop: 'Sispann',
scanning: 'Pwente sou kòd ba',
looking: 'Ap chèche pwodwi…',
new_label: 'NOUVO PWODWI',
existing_label: 'NAN BAZ DONE',
yield_locked_label: 'BLOKE-RANDMAN',
yield_locked_msg: 'Ap tann pwosesis Spiny Tail',
barcode: 'Kòd Ba',
sku: 'SKU',
name: 'Non Pwodwi',
location: 'Frijidè / Kote',
quantity: 'Kantite',
unit: 'Inite',
notes: 'Nòt',
receive: 'RESEVWA',
adjust: 'AJISTE',
submit: 'Sove',
saving: 'Ap sove…',
done: 'Sove ✓',
again: 'Eskane lòt',
error: 'Erè',
cam_error: 'Kamera pa disponib',
perm_error: 'Pèmèt kamera pou eskane',
select: 'Chwazi…',
},
es: {
title: 'Escanear Inventario',
subtitle: 'Escáner de códigos con cámara',
start: 'Iniciar Cámara',
stop: 'Detener',
scanning: 'Apunte al código',
looking: 'Buscando producto…',
new_label: 'PRODUCTO NUEVO',
existing_label: 'EN BASE DE DATOS',
yield_locked_label: 'BLOQUEADO POR RENDIMIENTO',
yield_locked_msg: 'Esperando procesamiento Spiny Tail',
barcode: 'Código',
sku: 'SKU',
name: 'Nombre del Producto',
location: 'Congelador / Ubicación',
quantity: 'Cantidad',
unit: 'Unidad',
notes: 'Notas',
receive: 'RECIBIR',
adjust: 'AJUSTAR',
submit: 'Guardar',
saving: 'Guardando…',
done: 'Guardado ✓',
again: 'Escanear Otro',
error: 'Error',
cam_error: 'Cámara no disponible',
perm_error: 'Permite el acceso a la cámara',
select: 'Seleccionar…',
},
};

const NAVY = '#060e1c';
const GOLD = '#c8860f';
const CREAM = '#fdf6e8';

export default function ScanPage() {
const [lang, setLang] = useState<Lang>('en');
const t = (k: string) => COPY[lang][k] || k;

const [mode, setMode] = useState<Mode>('idle');
const [action, setAction] = useState<Action>('receive');
const [code, setCode] = useState<string>('');
const [product, setProduct] = useState<ProductData | null>(null);
const [locations, setLocations] = useState<Location[]>([]);
const [error, setError] = useState<string>('');

const [form, setForm] = useState({
location_id: '',
quantity: '',
unit: '',
notes: '',
name: '',
sku: '',
});

const scannerRef = useRef<Html5Qrcode | null>(null);
const scanRegionId = 'bsc-scan-region';

// Load locations on mount
useEffect(() => {
fetch('/api/locations')
.then((r) => r.json())
.then((d) => setLocations(d.locations || []))
.catch(() => {});
}, []);

const stopScanner = async () => {
if (scannerRef.current) {
try {
await scannerRef.current.stop();
await scannerRef.current.clear();
} catch {}
scannerRef.current = null;
}
};

const lookupCode = useCallback(async (barcode: string) => {
setMode('looking_up');
try {
const r = await fetch(`/api/barcode/${encodeURIComponent(barcode)}`);
const data: ProductData = await r.json();
if (!r.ok) throw new Error((data as any).error || 'lookup failed');
setProduct(data);
setForm((f) => ({
...f,
name: data.name || '',
sku: data.sku || '',
unit: data.unit_of_measure || 'lb',
}));
setMode('review');
} catch (e: any) {
setError(e.message || 'lookup failed');
setMode('error');
}
}, []);

const startScanner = useCallback(async () => {
setError('');
setProduct(null);
setMode('scanning');
try {
const scanner = new Html5Qrcode(scanRegionId);
scannerRef.current = scanner;
await scanner.start(
{ facingMode: 'environment' },
{ fps: 10, qrbox: { width: 280, height: 140 } },
async (decodedText) => {
await stopScanner();
setCode(decodedText);
await lookupCode(decodedText);
},
() => {}
);
} catch (e: any) {
console.error(e);
setError(t(e?.name === 'NotAllowedError' ? 'perm_error' : 'cam_error'));
setMode('error');
}
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [lang, lookupCode]);

useEffect(() => {
return () => {
stopScanner();
};
}, []);

const submit = async () => {
if (!product) return;
setMode('saving');
try {
const r = await fetch('/api/inventory/movements', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
movement_type: action,
barcode: product.barcode,
product_id: product.id,
sku: form.sku,
name: form.name,
to_location_id: form.location_id,
quantity: parseFloat(form.quantity) || 0,
unit: form.unit || product.unit_of_measure || 'lb',
notes: form.notes,
create_if_new: !product.exists_in_db,
}),
});
const data = await r.json();
if (!r.ok) throw new Error(data.error || 'save failed');
setMode('done');
} catch (e: any) {
setError(e.message || 'save failed');
setMode('error');
}
};

const resetAll = () => {
setMode('idle');
setProduct(null);
setCode('');
setError('');
setForm({ location_id: '', quantity: '', unit: '', notes: '', name: '', sku: '' });
};

return (
<div
style={{
minHeight: '100vh',
background: NAVY,
color: '#fff',
fontFamily: 'system-ui, -apple-system, "DM Sans", sans-serif',
}}
>
<header
style={{
background: 'linear-gradient(135deg, #060e1c, #1a2a44)',
padding: '20px 18px 16px',
borderBottom: `3px solid ${GOLD}`,
}}
>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
<div>
<div
style={{
fontSize: 10,
letterSpacing: 2.5,
color: GOLD,
fontWeight: 700,
textTransform: 'uppercase',
}}
>
BSC · Inventory
</div>
<h1
style={{
fontFamily: '"Playfair Display", Georgia, serif',
fontSize: 24,
fontWeight: 700,
margin: '4px 0 2px',
}}
>
{t('title')}
</h1>
<div style={{ color: '#d6dde8', fontSize: 13 }}>{t('subtitle')}</div>
</div>
<select
value={lang}
onChange={(e) => setLang(e.target.value as Lang)}
style={{
background: 'rgba(255,255,255,0.08)',
color: '#fff',
border: `1px solid ${GOLD}`,
borderRadius: 4,
padding: '4px 8px',
fontSize: 12,
}}
>
<option value="en" style={{ color: '#000' }}>EN</option>
<option value="ht" style={{ color: '#000' }}>HT</option>
<option value="es" style={{ color: '#000' }}>ES</option>
</select>
</div>
</header>

<main style={{ padding: '18px 18px 80px', maxWidth: 600, margin: '0 auto' }}>
{/* Action toggle */}
<div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
{([
{ v: 'receive' as Action, label: t('receive') },
{ v: 'adjustment' as Action, label: t('adjust') },
]).map(({ v, label }) => (
<button
key={v}
onClick={() => setAction(v)}
style={{
flex: 1,
padding: '10px 8px',
fontSize: 13,
fontWeight: 700,
letterSpacing: 1,
background: action === v ? GOLD : 'transparent',
color: action === v ? NAVY : GOLD,
border: `2px solid ${GOLD}`,
borderRadius: 4,
cursor: 'pointer',
}}
>
{label}
</button>
))}
</div>

{(mode === 'idle' || mode === 'scanning') && (
<div
style={{
background: '#0a1628',
border: `1px solid ${GOLD}33`,
borderRadius: 6,
padding: 14,
marginBottom: 14,
}}
>
<div
id={scanRegionId}
style={{
width: '100%',
minHeight: mode === 'scanning' ? 240 : 0,
marginBottom: 10,
}}
/>
{mode === 'idle' ? (
<button
onClick={startScanner}
style={{
width: '100%',
padding: 14,
fontSize: 15,
fontWeight: 700,
letterSpacing: 1,
background: GOLD,
color: NAVY,
border: 'none',
borderRadius: 4,
cursor: 'pointer',
}}
>
▶ {t('start')}
</button>
) : (
<>
<div style={{ textAlign: 'center', color: GOLD, fontSize: 13, margin: '6px 0' }}>
{t('scanning')}
</div>
<button
onClick={async () => {
await stopScanner();
setMode('idle');
}}
style={{
width: '100%',
padding: 10,
fontSize: 13,
background: 'transparent',
color: GOLD,
border: `1px solid ${GOLD}`,
borderRadius: 4,
cursor: 'pointer',
}}
>
{t('stop')}
</button>
</>
)}
</div>
)}

{mode === 'looking_up' && (
<div style={{ textAlign: 'center', padding: 30, color: GOLD }}>
<div>{t('looking')}</div>
<div style={{ marginTop: 6, fontSize: 12, color: '#999' }}>{code}</div>
</div>
)}

{mode === 'review' && product && (
<div
style={{
background: CREAM,
color: NAVY,
padding: 14,
borderRadius: 6,
marginBottom: 14,
}}
>
<div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
<span
style={{
background: product.exists_in_db ? '#1e5c2e' : GOLD,
color: '#fff',
padding: '2px 8px',
borderRadius: 3,
fontSize: 11,
fontWeight: 700,
letterSpacing: 0.5,
}}
>
{product.exists_in_db ? t('existing_label') : t('new_label')}
</span>
{product.requires_yield_calc && (
<span
style={{
background: '#922b21',
color: '#fff',
padding: '2px 8px',
borderRadius: 3,
fontSize: 11,
fontWeight: 700,
}}
>
{t('yield_locked_label')}
</span>
)}
</div>

{product.image_url && (
// eslint-disable-next-line @next/next/no-img-element
<img
src={product.image_url}
alt=""
style={{
width: 80,
height: 80,
objectFit: 'cover',
borderRadius: 4,
float: 'right',
marginLeft: 10,
marginBottom: 6,
}}
/>
)}

<div style={{ fontSize: 11, color: '#666', letterSpacing: 0.5 }}>{t('barcode')}</div>
<div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
{product.barcode}
</div>

<label style={{ display: 'block', fontSize: 11, color: '#666', letterSpacing: 0.5, marginTop: 6 }}>
{t('sku')}
</label>
<input
value={form.sku}
onChange={(e) => setForm({ ...form, sku: e.target.value })}
placeholder={!product.exists_in_db ? 'auto-generated if blank' : ''}
style={{
width: '100%',
padding: 8,
fontSize: 14,
fontFamily: 'monospace',
border: `1px solid ${NAVY}33`,
borderRadius: 4,
marginBottom: 6,
background: '#fff',
}}
readOnly={product.exists_in_db}
/>

<label style={{ display: 'block', fontSize: 11, color: '#666', letterSpacing: 0.5 }}>
{t('name')}
</label>
<input
value={form.name}
onChange={(e) => setForm({ ...form, name: e.target.value })}
style={{
width: '100%',
padding: 8,
fontSize: 14,
border: `1px solid ${NAVY}33`,
borderRadius: 4,
marginBottom: 6,
background: '#fff',
}}
/>

{product.requires_yield_calc && (
<div
style={{
background: '#fff3d6',
border: `1px solid ${GOLD}`,
padding: 8,
borderRadius: 4,
fontSize: 12,
marginTop: 8,
}}
>
⚠️ {t('yield_locked_msg')}
</div>
)}

<hr style={{ border: 'none', borderTop: `1px solid ${NAVY}22`, margin: '12px 0' }} />

<label style={{ display: 'block', fontSize: 11, color: '#666', letterSpacing: 0.5 }}>
{t('location')}
</label>
<select
value={form.location_id}
onChange={(e) => setForm({ ...form, location_id: e.target.value })}
style={{
width: '100%',
padding: 8,
fontSize: 14,
border: `1px solid ${NAVY}33`,
borderRadius: 4,
marginBottom: 6,
background: '#fff',
}}
>
<option value="">{t('select')}</option>
{locations.map((l) => (
<option key={l.id} value={l.id}>
{l.code} — {l.name}
</option>
))}
</select>

<div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 6 }}>
<div>
<label style={{ display: 'block', fontSize: 11, color: '#666', letterSpacing: 0.5 }}>
{t('quantity')}
</label>
<input
type="number"
step="0.01"
inputMode="decimal"
value={form.quantity}
onChange={(e) => setForm({ ...form, quantity: e.target.value })}
style={{
width: '100%',
padding: 8,
fontSize: 14,
border: `1px solid ${NAVY}33`,
borderRadius: 4,
background: '#fff',
}}
/>
</div>
<div>
<label style={{ display: 'block', fontSize: 11, color: '#666', letterSpacing: 0.5 }}>
{t('unit')}
</label>
<input
value={form.unit}
onChange={(e) => setForm({ ...form, unit: e.target.value })}
placeholder="lb"
style={{
width: '100%',
padding: 8,
fontSize: 14,
border: `1px solid ${NAVY}33`,
borderRadius: 4,
background: '#fff',
}}
/>
</div>
</div>

<label style={{ display: 'block', fontSize: 11, color: '#666', letterSpacing: 0.5, marginTop: 6 }}>
{t('notes')}
</label>
<input
value={form.notes}
onChange={(e) => setForm({ ...form, notes: e.target.value })}
style={{
width: '100%',
padding: 8,
fontSize: 14,
border: `1px solid ${NAVY}33`,
borderRadius: 4,
marginBottom: 10,
background: '#fff',
}}
/>

<button
onClick={submit}
disabled={!form.location_id || !form.quantity}
style={{
width: '100%',
padding: 14,
fontSize: 15,
fontWeight: 700,
letterSpacing: 1,
background: NAVY,
color: GOLD,
border: `2px solid ${GOLD}`,
borderRadius: 4,
cursor: 'pointer',
opacity: !form.location_id || !form.quantity ? 0.4 : 1,
}}
>
{t('submit')}
</button>
</div>
)}

{mode === 'saving' && (
<div style={{ textAlign: 'center', padding: 30, color: GOLD }}>{t('saving')}</div>
)}

{mode === 'done' && (
<div
style={{
background: '#1e5c2e',
color: '#fff',
padding: 18,
borderRadius: 6,
textAlign: 'center',
marginBottom: 14,
}}
>
<div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>✓ {t('done')}</div>
<button
onClick={resetAll}
style={{
marginTop: 10,
padding: '10px 20px',
background: GOLD,
color: NAVY,
border: 'none',
borderRadius: 4,
fontSize: 13,
fontWeight: 700,
cursor: 'pointer',
}}
>
{t('again')}
</button>
</div>
)}

{mode === 'error' && (
<div style={{ background: '#922b21', color: '#fff', padding: 14, borderRadius: 6, marginBottom: 14 }}>
<div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
{t('error')}
</div>
<div style={{ fontSize: 13 }}>{error}</div>
<button
onClick={resetAll}
style={{
marginTop: 10,
padding: '8px 16px',
background: '#fff',
color: '#922b21',
border: 'none',
borderRadius: 4,
fontSize: 12,
fontWeight: 700,
cursor: 'pointer',
}}
>
← {t('again')}
</button>
</div>
)}
</main>
</div>
);
}
