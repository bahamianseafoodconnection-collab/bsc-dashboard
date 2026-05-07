'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// TYPES
// ============================================================

type Product = {
id: string;
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
};

type CostInfo = { cost_per_unit: number } | null;

type PricingInfo = {
channel: string;
pricing_mode: string;
margin_multiplier: number;
vat_multiplier: number;
manual_unit_price: number | null;
};

type LookupResult = {
product: Product | null;
cost: CostInfo;
pricing: PricingInfo[];
};

type UserRecord = {
id: string;
email: string;
role: string;
};

const CATEGORY_OPTIONS = [
{ v: 'fresh_seafood', l: '🐟 Fresh Seafood' },
{ v: 'frozen_seafood', l: '🦞 Frozen Seafood' },
{ v: 'processed_seafood', l: '🦐 Processed' },
{ v: 'meat', l: '🥩 Meat' },
{ v: 'produce', l: '🥦 Produce' },
{ v: 'juice_smoothie', l: '🥤 Juice/Smoothie' },
{ v: 'wellness_shot', l: '💪 Wellness' },
{ v: 'grocery', l: '🌾 Grocery' },
{ v: 'snack', l: '🍪 Snack' },
{ v: 'beverage', l: '💧 Beverage' },
{ v: 'household', l: '🧴 Household' },
{ v: 'toiletry', l: '🧼 Toiletry' },
];

const UNIT_OPTIONS = ['lb', 'kg', 'g', 'oz', 'each', 'case', 'bag', 'box'];

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

const EDIT_API = '/api/inventory/movements/update';
const ONBOARD_API = '/api/inventory/onboard';

function getSupabase() {
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Supabase env not configured');
return createBrowserClient(url, key);
}

function computePrice(p: PricingInfo, cost: number | null): number {
if (p.pricing_mode === 'manual_override' && p.manual_unit_price != null) return Number(p.manual_unit_price);
if (cost != null) return cost * Number(p.margin_multiplier) * Number(p.vat_multiplier);
if (p.manual_unit_price != null) return Number(p.manual_unit_price);
return 0;
}

// BarcodeDetector typing for browsers that support it
declare global {
interface Window {
BarcodeDetector?: {
new (config?: { formats: string[] }): {
detect: (source: HTMLVideoElement | ImageBitmap) => Promise<Array<{ rawValue: string }>>;
};
getSupportedFormats?: () => Promise<string[]>;
};
}
}

// ============================================================
// COMPONENT
// ============================================================

export default function ScannerClient() {
const [user, setUser] = useState<UserRecord | null>(null);
const [authLoading, setAuthLoading] = useState(true);

const videoRef = useRef<HTMLVideoElement>(null);
const streamRef = useRef<MediaStream | null>(null);
const detectIntervalRef = useRef<number | null>(null);

const [scanning, setScanning] = useState(false);
const [scannerError, setScannerError] = useState<string | null>(null);
const [scannerSupported, setScannerSupported] = useState<boolean | null>(null);
const [scannedCode, setScannedCode] = useState<string | null>(null);
const [manualBarcode, setManualBarcode] = useState('');
const [lookingUp, setLookingUp] = useState(false);
const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
const [lookupError, setLookupError] = useState<string | null>(null);

// Photo state (for both edit + onboard)
const [photoUploading, setPhotoUploading] = useState(false);
const [photoUrl, setPhotoUrl] = useState<string | null>(null);

// Edit modal
const [editing, setEditing] = useState(false);

// Onboard modal
const [onboarding, setOnboarding] = useState(false);

// ============================================================
// AUTH (just to know role)
// ============================================================
useEffect(() => {
const supabase = getSupabase();
supabase.rpc('get_my_user_record').single<UserRecord>().then(({ data, error }) => {
if (error || !data) {
setAuthLoading(false);
return;
}
setUser(data);
setAuthLoading(false);
});
}, []);

// ============================================================
// CHECK BARCODE DETECTOR SUPPORT
// ============================================================
useEffect(() => {
if (typeof window === 'undefined') return;
setScannerSupported(typeof window.BarcodeDetector === 'function');
}, []);

// ============================================================
// CAMERA SCAN (native BarcodeDetector)
// ============================================================
const stopCamera = useCallback(() => {
if (detectIntervalRef.current) {
window.clearInterval(detectIntervalRef.current);
detectIntervalRef.current = null;
}
if (streamRef.current) {
streamRef.current.getTracks().forEach((t) => t.stop());
streamRef.current = null;
}
if (videoRef.current) {
videoRef.current.srcObject = null;
}
setScanning(false);
}, []);

const lookupProduct = useCallback(async (code: string) => {
setLookingUp(true);
setLookupError(null);
setLookupResult(null);
setPhotoUrl(null);

try {
const supabase = getSupabase();
const { data: products, error } = await supabase
.from('products')
.select('id, sku, barcode, name, description, category, unit_of_measure, pack_size, image_url, status, is_bsc_processed, sell_nassau, sell_andros, sell_online, sell_wholesale')
.or(`barcode.eq.${code},sku.eq.${code}`)
.limit(1);

if (error) throw error;
const product = products && products.length > 0 ? (products[0] as Product) : null;

if (!product) {
setLookupResult({ product: null, cost: null, pricing: [] });
setLookingUp(false);
return;
}

const { data: costRows } = await supabase
.from('product_costs')
.select('cost_per_unit')
.eq('product_id', product.id)
.eq('is_current', true)
.limit(1);
const cost = costRows && costRows.length > 0 ? (costRows[0] as CostInfo) : null;

const { data: pricingRows } = await supabase
.from('product_pricing')
.select('channel, pricing_mode, margin_multiplier, vat_multiplier, manual_unit_price')
.eq('product_id', product.id)
.eq('is_current', true)
.eq('is_active', true);

setLookupResult({
product,
cost,
pricing: (pricingRows || []) as PricingInfo[],
});
setPhotoUrl(product.image_url);
setLookingUp(false);
} catch (e) {
setLookupError(e instanceof Error ? e.message : 'Lookup failed');
setLookingUp(false);
}
}, []);

const startCamera = useCallback(async () => {
setScannerError(null);
setScannedCode(null);
setLookupResult(null);

if (!window.BarcodeDetector) {
setScannerError('Barcode scanning not supported on this browser. Use manual entry or update iOS to 16.4+.');
return;
}

try {
const stream = await navigator.mediaDevices.getUserMedia({
video: { facingMode: 'environment' },
audio: false,
});
streamRef.current = stream;

if (!videoRef.current) {
stream.getTracks().forEach((t) => t.stop());
return;
}

videoRef.current.srcObject = stream;
videoRef.current.setAttribute('playsinline', 'true');
await videoRef.current.play();

setScanning(true);

const detector = new window.BarcodeDetector({
formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
});

detectIntervalRef.current = window.setInterval(async () => {
if (!videoRef.current || videoRef.current.readyState < 2) return;
try {
const codes = await detector.detect(videoRef.current);
if (codes.length > 0) {
const code = codes[0].rawValue;
setScannedCode(code);
stopCamera();
await lookupProduct(code);
}
} catch {
// Per-frame errors are noisy; ignore
}
}, 250);
} catch (e) {
const msg = e instanceof Error ? e.message : 'Camera access failed';
setScannerError(`${msg}. Make sure you allowed camera permission in Safari settings.`);
setScanning(false);
}
}, [lookupProduct, stopCamera]);

useEffect(() => {
return () => stopCamera();
}, [stopCamera]);

// ============================================================
// PHOTO UPLOAD (Supabase Storage)
// ============================================================
async function handlePhotoUpload(file: File) {
if (!user) return;
setPhotoUploading(true);
try {
const supabase = getSupabase();
const ext = file.name.split('.').pop() || 'jpg';
const path = `products/${Date.now()}-${user.id.slice(0, 8)}.${ext}`;
const { error: upErr } = await supabase.storage
.from('bsc-uploads')
.upload(path, file, { contentType: file.type, upsert: false });
if (upErr) throw upErr;

const { data: pubData } = supabase.storage.from('bsc-uploads').getPublicUrl(path);
setPhotoUrl(pubData.publicUrl);
} catch (e) {
alert('Photo upload failed: ' + (e instanceof Error ? e.message : 'unknown'));
} finally {
setPhotoUploading(false);
}
}

function manualLookup() {
const code = manualBarcode.trim();
if (!code) return;
setScannedCode(code);
lookupProduct(code);
}

function reset() {
setScannedCode(null);
setLookupResult(null);
setLookupError(null);
setManualBarcode('');
setPhotoUrl(null);
setEditing(false);
setOnboarding(false);
}

// ============================================================
// PERMISSIONS
// ============================================================
const canEditCostPrice = user && ['founder', 'co_founder', 'manager'].includes(user.role);
const canOnboard = user && ['founder', 'co_founder', 'manager', 'cashier', 'right_hand', 'supervisor', 'processor', 'andros_staff', 'supplier'].includes(user.role);

if (authLoading) {
return (
<div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a2e5a' }}>
Loading…
</div>
);
}

// ============================================================
// RENDER
// ============================================================
return (
<div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

<header style={{ backgroundColor: '#1a2e5a', padding: '0 16px', position: 'sticky', top: 0, zIndex: 40 }}>
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
<Link href="/pos" style={{ color: '#f4c842', fontSize: 13, fontWeight: 700, textDecoration: 'none', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: 8 }}>
← Register
</Link>
<div>
<div style={{ color: '#fff', fontWeight: 900, fontSize: 15 }}>📷 Scanner</div>
<div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
{user ? `${user.role.toUpperCase()} · ${user.email}` : 'Active session'}
</div>
</div>
</div>
</div>
</header>

<div style={{ maxWidth: 600, margin: '0 auto', padding: 16 }}>

{/* INITIAL SCANNER UI */}
{!scannedCode && !lookingUp && !lookupResult && (
<div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

{/* Camera area */}
<div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', backgroundColor: scanning ? '#000' : '#e2e8f0', borderRadius: 12, marginBottom: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
<video
ref={videoRef}
style={{ width: '100%', height: '100%', objectFit: 'cover', display: scanning ? 'block' : 'none' }}
muted
playsInline
/>
{scanning && (
<div style={{ position: 'absolute', top: '50%', left: '10%', right: '10%', height: 2, backgroundColor: '#f4c842', boxShadow: '0 0 8px #f4c842' }} />
)}
{!scanning && (
<div style={{ textAlign: 'center', color: '#94a3b8' }}>
<div style={{ fontSize: 48, marginBottom: 8 }}>📷</div>
<div style={{ fontSize: 13 }}>Tap below to scan a barcode</div>
</div>
)}
</div>

{scannerError && (
<div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 12, color: '#991b1b', fontSize: 12, marginBottom: 12 }}>
{scannerError}
</div>
)}

{scannerSupported === false && (
<div style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: 12, color: '#92400e', fontSize: 12, marginBottom: 12 }}>
⚠️ Native barcode scanning needs iOS 16.4+ or Chrome/Edge desktop. Manual entry below works on any device.
</div>
)}

{!scanning ? (
<button
onClick={startCamera}
disabled={scannerSupported === false}
style={{ width: '100%', backgroundColor: scannerSupported === false ? '#e5e7eb' : '#1a2e5a', color: scannerSupported === false ? '#999' : '#f4c842', border: 'none', borderRadius: 12, padding: 14, fontWeight: 900, fontSize: 14, cursor: scannerSupported === false ? 'not-allowed' : 'pointer', marginBottom: 10 }}
>
📷 Start Camera Scan
</button>
) : (
<button
onClick={stopCamera}
style={{ width: '100%', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontWeight: 900, fontSize: 14, cursor: 'pointer', marginBottom: 10 }}
>
✕ Stop Scanner
</button>
)}

{/* Manual entry */}
<div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 12 }}>
<div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
Or enter barcode / SKU manually
</div>
<div style={{ display: 'flex', gap: 8 }}>
<input
type="text"
value={manualBarcode}
onChange={(e) => setManualBarcode(e.target.value)}
placeholder="Type or paste"
style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }}
/>
<button
onClick={manualLookup}
disabled={!manualBarcode.trim()}
style={{ backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 800, fontSize: 13, cursor: manualBarcode.trim() ? 'pointer' : 'not-allowed', opacity: manualBarcode.trim() ? 1 : 0.5 }}
>
Look up
</button>
</div>
</div>
</div>
)}

{/* LOOKING UP */}
{lookingUp && (
<div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
<div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
<div style={{ color: '#1a2e5a', fontWeight: 700 }}>Looking up {scannedCode}…</div>
</div>
)}

{/* LOOKUP ERROR */}
{lookupError && !lookingUp && (
<div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 16, padding: 20, marginBottom: 16 }}>
<div style={{ fontWeight: 800, color: '#991b1b', marginBottom: 6 }}>Lookup failed</div>
<div style={{ fontSize: 12, color: '#991b1b' }}>{lookupError}</div>
<button onClick={reset} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid #991b1b', backgroundColor: '#fff', color: '#991b1b', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
← Try again
</button>
</div>
)}

{/* PRODUCT FOUND — show + inline edit */}
{lookupResult && lookupResult.product && !lookingUp && !editing && (
<ProductView
product={lookupResult.product}
cost={lookupResult.cost}
pricing={lookupResult.pricing}
photoUrl={photoUrl}
photoUploading={photoUploading}
onPhotoUpload={handlePhotoUpload}
onEditClick={() => setEditing(true)}
onReset={reset}
canEdit={!!canEditCostPrice}
/>
)}

{/* INLINE EDIT */}
{lookupResult && lookupResult.product && editing && (
<ProductEdit
product={lookupResult.product}
cost={lookupResult.cost}
pricing={lookupResult.pricing}
photoUrl={photoUrl}
photoUploading={photoUploading}
onPhotoUpload={handlePhotoUpload}
onCancel={() => setEditing(false)}
onSaved={() => {
if (scannedCode) lookupProduct(scannedCode);
setEditing(false);
}}
/>
)}

{/* PRODUCT NOT FOUND — show onboard CTA */}
{lookupResult && !lookupResult.product && !lookingUp && !onboarding && (
<div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
<div style={{ fontSize: 40, marginBottom: 12 }}>🆕</div>
<div style={{ fontWeight: 900, fontSize: 16, color: '#1a2e5a', marginBottom: 4 }}>New product</div>
<div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
<span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{scannedCode}</span> is not in your catalog.
</div>
<div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 20 }}>
{canEditCostPrice ? 'Onboard it now to make it sellable.' : 'Submit it for Dedrick to review and approve.'}
</div>

{canOnboard ? (
<button
onClick={() => setOnboarding(true)}
style={{ width: '100%', backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 12, padding: 14, fontWeight: 900, fontSize: 14, cursor: 'pointer', marginBottom: 10 }}
>
➕ Onboard New Product
</button>
) : (
<div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>Your role cannot onboard products.</div>
)}

<button onClick={reset} style={{ width: '100%', backgroundColor: '#fff', color: '#1a2e5a', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
← Scan Another
</button>
</div>
)}

{/* INLINE ONBOARD */}
{lookupResult && !lookupResult.product && onboarding && scannedCode && (
<ProductOnboard
barcode={scannedCode}
photoUrl={photoUrl}
photoUploading={photoUploading}
onPhotoUpload={handlePhotoUpload}
userRole={user?.role || ''}
onCancel={() => setOnboarding(false)}
onSaved={() => { reset(); }}
/>
)}
</div>
</div>
);
}

// ============================================================
// PRODUCT VIEW (read mode)
// ============================================================
function ProductView({ product, cost, pricing, photoUrl, photoUploading, onPhotoUpload, onEditClick, onReset, canEdit }: {
product: Product;
cost: CostInfo;
pricing: PricingInfo[];
photoUrl: string | null;
photoUploading: boolean;
onPhotoUpload: (f: File) => void;
onEditClick: () => void;
onReset: () => void;
canEdit: boolean;
}) {
return (
<div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
<span style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', letterSpacing: 1, textTransform: 'uppercase' }}>✓ Found</span>
<span style={{ fontSize: 10, fontWeight: 700, color: '#1a2e5a', backgroundColor: '#f4c842', padding: '3px 8px', borderRadius: 4 }}>{product.status.toUpperCase()}</span>
</div>

{photoUrl ? (
<img src={photoUrl} alt={product.name} style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, marginBottom: 12 }} />
) : (
<div style={{ width: '100%', height: 120, backgroundColor: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: 10, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12 }}>
No product photo
</div>
)}

<div style={{ fontWeight: 900, fontSize: 18, color: '#1a2e5a', marginBottom: 4 }}>{product.name}</div>
<div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', marginBottom: 16 }}>
SKU: {product.sku}{product.barcode ? ` · Barcode: ${product.barcode}` : ''}
</div>

<div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginBottom: 12 }}>
<div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Cost</div>
{cost ? (
<div style={{ fontSize: 16, fontWeight: 900, color: '#1a2e5a' }}>${Number(cost.cost_per_unit).toFixed(4)} per {product.unit_of_measure}</div>
) : (
<div style={{ fontSize: 13, color: '#ef4444', fontWeight: 700 }}>⚠️ No cost recorded</div>
)}
</div>

<div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginBottom: 12 }}>
<div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Selling Prices</div>
{pricing.length === 0 ? (
<div style={{ fontSize: 13, color: '#ef4444', fontWeight: 700 }}>⚠️ No pricing configured</div>
) : (
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
{pricing.map((p) => {
const px = computePrice(p, cost ? Number(cost.cost_per_unit) : null);
return (
<div key={p.channel} style={{ backgroundColor: '#f0f9ff', borderRadius: 8, padding: 10 }}>
<div style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', marginBottom: 2 }}>{CHANNEL_LABELS[p.channel] || p.channel}</div>
<div style={{ fontSize: 14, fontWeight: 900, color: '#1a2e5a' }}>{px > 0 ? `$${px.toFixed(2)}` : '—'}</div>
</div>
);
})}
</div>
)}
</div>

{/* Photo upload — anyone can update product photo */}
<PhotoUploadButton uploading={photoUploading} onFile={onPhotoUpload} hasPhoto={!!photoUrl} />

{/* Edit button — only managers+ */}
{canEdit ? (
<button
onClick={onEditClick}
style={{ width: '100%', marginTop: 10, backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
>
✏️ Edit Cost / Price / Channels
</button>
) : (
<div style={{ marginTop: 10, padding: 10, backgroundColor: '#f8fafc', borderRadius: 8, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
Cost & price editing requires manager role.
</div>
)}

<button onClick={onReset} style={{ width: '100%', marginTop: 8, backgroundColor: '#fff', color: '#1a2e5a', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
← Scan Another
</button>
</div>
);
}

// ============================================================
// PHOTO UPLOAD BUTTON (camera or file)
// ============================================================
function PhotoUploadButton({ uploading, onFile, hasPhoto }: { uploading: boolean; onFile: (f: File) => void; hasPhoto: boolean }) {
const cameraRef = useRef<HTMLInputElement>(null);
const fileRef = useRef<HTMLInputElement>(null);

return (
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 4 }}>
<input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
<input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />

<button
onClick={() => cameraRef.current?.click()}
disabled={uploading}
style={{ backgroundColor: '#fff', color: '#1a2e5a', border: '1.5px solid #1a2e5a', borderRadius: 10, padding: 11, fontWeight: 700, fontSize: 12, cursor: uploading ? 'wait' : 'pointer' }}
>
{uploading ? 'Uploading…' : hasPhoto ? '📸 Replace Photo' : '📸 Take Photo'}
</button>
<button
onClick={() => fileRef.current?.click()}
disabled={uploading}
style={{ backgroundColor: '#fff', color: '#1a2e5a', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: 11, fontWeight: 700, fontSize: 12, cursor: uploading ? 'wait' : 'pointer' }}
>
🖼️ Upload File
</button>
</div>
);
}

// ============================================================
// PRODUCT EDIT (inline)
// ============================================================
function ProductEdit({ product, cost, pricing, photoUrl, photoUploading, onPhotoUpload, onCancel, onSaved }: {
product: Product;
cost: CostInfo;
pricing: PricingInfo[];
photoUrl: string | null;
photoUploading: boolean;
onPhotoUpload: (f: File) => void;
onCancel: () => void;
onSaved: () => void;
}) {
const [costInput, setCostInput] = useState<string>(cost ? String(cost.cost_per_unit) : '');
const [channel, setChannel] = useState<string>('nassau_pos');
const [pricingMode, setPricingMode] = useState<'formula' | 'manual_override'>('formula');
const [margin, setMargin] = useState<string>('1.38');
const [vat, setVat] = useState<string>('1.00');
const [manualPrice, setManualPrice] = useState<string>('');
const [saving, setSaving] = useState(false);
const [err, setErr] = useState<string | null>(null);
const [savedMsg, setSavedMsg] = useState<string | null>(null);

useEffect(() => {
const def = CHANNEL_DEFAULTS[channel];
if (def) { setMargin(def.margin.toFixed(2)); setVat(def.vat.toFixed(2)); }
}, [channel]);

async function callEdit(payload: object) {
setSaving(true);
setErr(null);
setSavedMsg(null);
try {
const res = await fetch(EDIT_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
const json = await res.json();
if (!res.ok) throw new Error(json.error || 'Save failed');
setSavedMsg('Saved ✓');
setTimeout(onSaved, 800);
} catch (e) {
setErr(e instanceof Error ? e.message : 'Save failed');
} finally {
setSaving(false);
}
}

// If photo changed, save it as part of any edit (handled by image_url update — but our update API doesn't have a photo action yet).
// For now: photo persists in scanner state; editing cost/price doesn't touch the photo. Photo updates from the view screen.

return (
<div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
<div>
<div style={{ fontWeight: 900, fontSize: 16, color: '#1a2e5a' }}>{product.name}</div>
<div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{product.sku}</div>
</div>
<button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 22, color: '#64748b', cursor: 'pointer' }}>×</button>
</div>

{/* Cost */}
<div style={{ marginBottom: 14 }}>
<label style={lbl}>Cost per {product.unit_of_measure} ($)</label>
<div style={{ display: 'flex', gap: 8 }}>
<input type="number" step="0.0001" value={costInput} onChange={(e) => setCostInput(e.target.value)} placeholder="e.g. 6.6446" style={{ ...input, marginBottom: 0 }} />
<button
onClick={() => callEdit({ action: 'update_cost', product_id: product.id, cost_per_unit: parseFloat(costInput), unit_of_measure: product.unit_of_measure })}
disabled={saving || !costInput || isNaN(parseFloat(costInput))}
style={{ backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 8, padding: '0 16px', fontWeight: 800, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
>
Save Cost
</button>
</div>
</div>

{/* Pricing per channel */}
<div style={{ marginBottom: 14, padding: 14, backgroundColor: '#f8fafc', borderRadius: 10 }}>
<label style={lbl}>Channel</label>
<select value={channel} onChange={(e) => setChannel(e.target.value)} style={input}>
<option value="nassau_pos">Nassau POS (38%)</option>
<option value="andros_pos">Andros POS (43%)</option>
<option value="online_market">Online (25%)</option>
<option value="local_wholesale">Wholesale (12%)</option>
</select>

<label style={lbl}>Mode</label>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
<button onClick={() => setPricingMode('formula')} style={modeBtn(pricingMode === 'formula')}>Formula</button>
<button onClick={() => setPricingMode('manual_override')} style={modeBtn(pricingMode === 'manual_override')}>Manual</button>
</div>

{pricingMode === 'formula' ? (
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
<div><label style={lbl}>Margin</label><input type="number" step="0.01" value={margin} onChange={(e) => setMargin(e.target.value)} style={input} /></div>
<div><label style={lbl}>VAT</label><input type="number" step="0.01" value={vat} onChange={(e) => setVat(e.target.value)} style={input} /></div>
</div>
) : (
<input type="number" step="0.01" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="Manual price ($)" style={input} />
)}

<button
onClick={() => callEdit({
action: 'update_price',
product_id: product.id,
channel,
pricing_mode: pricingMode,
margin_multiplier: pricingMode === 'formula' ? parseFloat(margin) : null,
vat_multiplier: parseFloat(vat) || 1.0,
manual_unit_price: pricingMode === 'manual_override' ? parseFloat(manualPrice) : null,
})}
disabled={saving}
style={primaryBtn(saving)}
>
{saving ? 'Saving…' : `Save ${CHANNEL_LABELS[channel]} Price`}
</button>
</div>

{/* Channels */}
<ChannelToggle product={product} onSave={callEdit} saving={saving} />

{savedMsg && <div style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: 10, fontSize: 12, color: '#166534', textAlign: 'center', marginTop: 10 }}>{savedMsg}</div>}
{err && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 10, fontSize: 12, color: '#991b1b', marginTop: 10 }}>{err}</div>}

<button onClick={onCancel} style={{ width: '100%', marginTop: 12, backgroundColor: '#fff', color: '#1a2e5a', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
Done
</button>
</div>
);
}

function ChannelToggle({ product, onSave, saving }: { product: Product; onSave: (p: object) => void; saving: boolean }) {
const [n, setN] = useState(product.sell_nassau);
const [a, setA] = useState(product.sell_andros);
const [o, setO] = useState(product.sell_online);
const [w, setW] = useState(product.sell_wholesale);

return (
<div style={{ marginBottom: 14, padding: 14, backgroundColor: '#f8fafc', borderRadius: 10 }}>
<div style={{ ...lbl, marginTop: 0 }}>Sales Channels</div>
{[
{ lab: 'Nassau POS', v: n, s: setN },
{ lab: 'Andros POS', v: a, s: setA },
{ lab: 'Online', v: o, s: setO },
{ lab: 'Wholesale', v: w, s: setW },
].map((c) => (
<label key={c.lab} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer' }}>
<span style={{ fontSize: 13, color: '#1a2e5a', fontWeight: 600 }}>{c.lab}</span>
<input type="checkbox" checked={c.v} onChange={(e) => c.s(e.target.checked)} style={{ width: 18, height: 18 }} />
</label>
))}
<button
onClick={() => onSave({ action: 'update_channels', product_id: product.id, sell_nassau: n, sell_andros: a, sell_online: o, sell_wholesale: w })}
disabled={saving}
style={{ ...primaryBtn(saving), marginTop: 8 }}
>
Save Channels
</button>
</div>
);
}

// ============================================================
// PRODUCT ONBOARD (new product form)
// ============================================================
function ProductOnboard({ barcode, photoUrl, photoUploading, onPhotoUpload, userRole, onCancel, onSaved }: {
barcode: string;
photoUrl: string | null;
photoUploading: boolean;
onPhotoUpload: (f: File) => void;
userRole: string;
onCancel: () => void;
onSaved: () => void;
}) {
const isManager = ['founder', 'co_founder', 'manager'].includes(userRole);

const [name, setName] = useState('');
const [category, setCategory] = useState('frozen_seafood');
const [unit, setUnit] = useState('lb');
const [packSize, setPackSize] = useState('');
const [description, setDescription] = useState('');
const [cost, setCost] = useState('');
const [margin, setMargin] = useState('1.38');
const [saving, setSaving] = useState(false);
const [err, setErr] = useState<string | null>(null);
const [done, setDone] = useState<string | null>(null);

async function submit() {
if (!name.trim() || !category || !unit) {
setErr('Name, category, and unit are required');
return;
}
setSaving(true);
setErr(null);
try {
const payload = {
barcode,
name: name.trim(),
category,
unit_of_measure: unit,
pack_size: packSize.trim() || null,
description: description.trim() || null,
image_url: photoUrl || null,
cost_per_unit: cost ? parseFloat(cost) : null,
pricing: isManager && cost ? [{
channel: 'nassau_pos',
pricing_mode: 'formula',
margin_multiplier: parseFloat(margin) || 1.38,
vat_multiplier: 1.0,
}] : [],
};
const res = await fetch(ONBOARD_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
const json = await res.json();
if (!res.ok) throw new Error(json.error || 'Onboard failed');
setDone(json.message || 'Saved.');
setTimeout(onSaved, 1500);
} catch (e) {
setErr(e instanceof Error ? e.message : 'Onboard failed');
} finally {
setSaving(false);
}
}

return (
<div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
<div>
<div style={{ fontWeight: 900, fontSize: 16, color: '#1a2e5a' }}>➕ Onboard Product</div>
<div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>Barcode: {barcode}</div>
</div>
<button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 22, color: '#64748b', cursor: 'pointer' }}>×</button>
</div>

{photoUrl && (
<img src={photoUrl} alt="product" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 10, marginBottom: 12 }} />
)}
<PhotoUploadButton uploading={photoUploading} onFile={onPhotoUpload} hasPhoto={!!photoUrl} />

<div style={{ borderTop: '1px solid #f0f0f0', marginTop: 12, paddingTop: 12 }}>
<label style={lbl}>Product Name *</label>
<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mahi Fillet 7-9oz" style={input} />

<label style={lbl}>Category *</label>
<select value={category} onChange={(e) => setCategory(e.target.value)} style={input}>
{CATEGORY_OPTIONS.map((c) => (<option key={c.v} value={c.v}>{c.l}</option>))}
</select>

<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
<div>
<label style={lbl}>Unit *</label>
<select value={unit} onChange={(e) => setUnit(e.target.value)} style={input}>
{UNIT_OPTIONS.map((u) => (<option key={u} value={u}>{u}</option>))}
</select>
</div>
<div>
<label style={lbl}>Pack Size</label>
<input value={packSize} onChange={(e) => setPackSize(e.target.value)} placeholder="e.g. 10lb case" style={input} />
</div>
</div>

<label style={lbl}>Description</label>
<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" style={input} />

<label style={lbl}>Initial Cost ($ per {unit})</label>
<input type="number" step="0.0001" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 6.6446" style={input} />

{isManager && cost && (
<>
<label style={lbl}>Nassau Margin (default 1.38 = 38%)</label>
<input type="number" step="0.01" value={margin} onChange={(e) => setMargin(e.target.value)} style={input} />
<div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
Will go LIVE on Nassau POS at <strong>${(parseFloat(cost || '0') * parseFloat(margin || '1.38')).toFixed(2)}</strong>
</div>
</>
)}

{!isManager && (
<div style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: 10, fontSize: 11, color: '#92400e', marginBottom: 12 }}>
⚠️ Your role submits products as <strong>pending approval</strong>. Dedrick will review before it goes live.
</div>
)}

{err && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 10, fontSize: 12, color: '#991b1b', marginBottom: 10 }}>{err}</div>}
{done && <div style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: 10, fontSize: 12, color: '#166534', marginBottom: 10 }}>{done}</div>}

<button onClick={submit} disabled={saving || !name.trim()} style={primaryBtn(saving)}>
{saving ? 'Submitting…' : isManager ? 'Onboard & Make Live' : 'Submit for Approval'}
</button>
<button onClick={onCancel} style={{ width: '100%', marginTop: 8, backgroundColor: '#fff', color: '#1a2e5a', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
Cancel
</button>
</div>
</div>
);
}

// ============================================================
// SHARED STYLES
// ============================================================
const lbl: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginTop: 8 };
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', marginBottom: 8, boxSizing: 'border-box' };
function modeBtn(active: boolean): React.CSSProperties {
return { padding: 9, borderRadius: 8, border: '2px solid', borderColor: active ? '#1a2e5a' : '#e5e7eb', backgroundColor: active ? '#1a2e5a' : '#fff', color: active ? '#f4c842' : '#666', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
}
function primaryBtn(saving: boolean): React.CSSProperties {
return { width: '100%', backgroundColor: saving ? '#e5e7eb' : '#1a2e5a', color: saving ? '#999' : '#f4c842', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', marginTop: 6 };
}
