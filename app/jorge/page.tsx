// File: app/jorge/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

// ── CONSTANTS ──
const MAILBOAT_PER_LB = 0.50; // Florida → Nassau mailboat freight per lb
const BSC_MARKUP = 0.10; // 10% BSC markup on landed cost
const BSC_WA_NUMBER = '12423613474';

// ── BAHAMAS CUSTOMS DUTY RATE ENGINE ──
// Full official schedule — matches app/supplier/page.tsx exactly
function getDutyRate(category: string, productName: string): number {
const name = productName.toLowerCase();
const cat = category.toLowerCase();

if (cat === 'seafood') {
if (name.includes('shrimp')) return 0;
if (name.includes('salmon')) return 0;
if (name.includes('octopus')) return 0;
if (name.includes('tuna') && name.includes('canned')) return 0;
if (name.includes('sardine')) return 0;
if (name.includes('fish') && name.includes('canned')) return 0;
if (name.includes('grouper')) return 0.35;
if (name.includes('snapper')) return 0.35;
if (name.includes('tuna')) return 0.35;
if (name.includes('mahi')) return 0.35;
if (name.includes('swai')) return 0.35;
if (name.includes('lobster')) return 0.35;
if (name.includes('mussel')) return 0.35;
if (name.includes('squid')) return 0.35;
if (name.includes('crab')) return 0.35;
if (name.includes('clam')) return 0.35;
if (name.includes('scallop')) return 0.35;
if (name.includes('tilapia')) return 0.35;
if (name.includes('catfish')) return 0.35;
if (name.includes('flounder')) return 0.35;
if (name.includes('halibut')) return 0.35;
if (name.includes('sea bass')) return 0.35;
if (name.includes('fillet')) return 0.35;
return 0.35;
}

if (cat === 'poultry') {
if (name.includes('duck')) return 0.05;
if (name.includes('turkey') && name.includes('deli')) return 0;
if (name.includes('turkey')) return 0.10;
if (name.includes('chicken')) return 0.30;
return 0.10;
}

if (cat === 'meat') {
if (name.includes('beef')) return 0;
if (name.includes('lamb')) return 0;
if (name.includes('veal')) return 0;
if (name.includes('corned beef')) return 0;
if (name.includes('sausage')) return 0;
if (name.includes('deli')) return 0;
if (name.includes('pork')) return 0.10;
if (name.includes('deer') || name.includes('venison')) return 0.10;
if (name.includes('spareribs') || name.includes('ribs')) return 0.10;
if (name.includes('bacon')) return 0.10;
if (name.includes('ham')) return 0.10;
return 0.10;
}

if (cat === 'electronics') {
if (name.includes('computer') || name.includes('laptop') ||
name.includes('monitor') || name.includes('printer')) return 0;
if (name.includes('ipad') || name.includes('tablet')) return 0;
if (name.includes('camera') || name.includes('camcorder')) return 0;
if (name.includes('drone')) return 0;
if (name.includes('ebook')) return 0;
if (name.includes('solar')) return 0;
if (name.includes('phone') || name.includes('cellular')) return 0.10;
if (name.includes('ipod')) return 0.35;
if (name.includes('television') || name.includes('tv')) return 0.35;
if (name.includes('amplifier') || name.includes('speaker')) return 0.45;
if (name.includes('video game')) return 0.45;
return 0.35;
}

if (cat === 'baby') return 0;
if (cat === 'medical' || cat === 'health') return 0;

// GENERAL / GROCERY — 0%
if (name.includes('rice')) return 0;
if (name.includes('bread')) return 0;
if (name.includes('cereal')) return 0;
if (name.includes('pasta') || name.includes('noodle')) return 0;
if (name.includes('peanut butter') || name.includes('nut spread')) return 0;
if (name.includes('mayonnaise') || name.includes('mayo')) return 0;
if (name.includes('ketchup')) return 0;
if (name.includes('cooking oil') || name.includes('coconut oil')) return 0;
if (name.includes('sugar')) return 0;
if (name.includes('grits')) return 0;
if (name.includes('juice') && name.includes('100%')) return 0;
if (name.includes('condensed milk')) return 0;
if (name.includes('soup')) return 0;
if (name.includes('tea')) return 0;
if (name.includes('coffee')) return 0;
if (name.includes('detergent') || name.includes('soap')) return 0;
if (name.includes('toothpaste') || name.includes('toothbrush')) return 0;
if (name.includes('vitamin') || name.includes('supplement')) return 0;
if (name.includes('medicine') || name.includes('medical')) return 0;
if (name.includes('insecticide') || name.includes('pesticide')) return 0;
if (name.includes('fertilizer')) return 0;
if (name.includes('lumber') || name.includes('plywood')) return 0;
if (name.includes('led light') || name.includes('led bulb')) return 0;
if (name.includes('deodorant')) return 0;
if (name.includes('perfume')) return 0;
if (name.includes('jewelry') || name.includes('jewellery')) return 0;
if (name.includes('watch')) return 0;
// 5%
if (name.includes('dryer')) return 0.05;
if (name.includes('freezer')) return 0.05;
if (name.includes('generator')) return 0.05;
if (name.includes('washer')) return 0.05;
if (name.includes('stove')) return 0.05;
if (name.includes('refrigerator')) return 0.05;
if (name.includes('copy paper')) return 0.05;
// 10%
if (name.includes('phone') || name.includes('cellular')) return 0.10;
// 20%
if (name.includes('biscuit') || name.includes('cookie')) return 0.20;
if (name.includes('cake') || name.includes('pastry')) return 0.20;
if (name.includes('ice cream')) return 0.20;
if (name.includes('clothing') || name.includes('apparel')) return 0.20;
if (name.includes('shoe') || name.includes('slipper')) return 0.20;
if (name.includes('sock')) return 0.20;
if (name.includes('toy')) return 0.20;
if (name.includes('lock')) return 0.20;
// 25%
if (name.includes('furniture')) return 0.25;
if (name.includes('garbage bag')) return 0.25;
if (name.includes('pots') || name.includes('pans')) return 0.25;
if (name.includes('toilet paper') || name.includes('tissue')) return 0.25;
if (name.includes('shampoo')) return 0.25;
if (name.includes('tire') || name.includes('tyre')) return 0.25;
// 30%
if (name.includes('aluminum foil')) return 0.30;
if (name.includes('curtain')) return 0.30;
if (name.includes('towel')) return 0.30;
if (name.includes('tile')) return 0.30;
// 35%
if (name.includes('blender')) return 0.35;
if (name.includes('microwave')) return 0.35;
if (name.includes('oven')) return 0.35;
if (name.includes('television') || name.includes('tv')) return 0.35;
if (name.includes('radio')) return 0.35;
if (name.includes('makeup') || name.includes('cosmetic')) return 0.35;
if (name.includes('lawn mower')) return 0.35;
if (name.includes('paint')) return 0.35;
// 45%
if (name.includes('air freshener')) return 0.45;
if (name.includes('amplifier')) return 0.45;
if (name.includes('carpet') || name.includes('rug')) return 0.45;
if (name.includes('broom')) return 0.45;
if (name.includes('dish') || name.includes('ceramic')) return 0.45;
if (name.includes('degreaser')) return 0.45;
if (name.includes('firework')) return 0.45;
if (name.includes('garden hose')) return 0.45;
if (name.includes('glassware')) return 0.45;
if (name.includes('hat')) return 0.45;
if (name.includes('pillow')) return 0.45;
if (name.includes('motor oil') || name.includes('body oil')) return 0.45;
if (name.includes('video game')) return 0.45;
// 50%
if (name.includes('wine')) return 0.50;
if (name.includes('rum') || name.includes('spirits')) return 0.50;
if (name.includes('cigarette')) return 0.50;
// 55%
if (name.includes('energy drink')) return 0.55;
// 60%
if (name.includes('candy') || name.includes('sweets')) return 0.60;
if (name.includes('plastic bag') || name.includes('shopping bag')) return 0.60;
if (name.includes('mattress')) return 0.60;
if (name.includes('beer')) return 0.10;
if (name.includes('cigar')) return 2.20;

return 0.25;
}

// ── JORGE PRICING ENGINE ──
// Jorge enters his cost price (purchase + his freight to mailboat)
// System calculates everything else automatically
function calcJorgePricing(costPerLb: number, weightLbs: number, category: string, productName: string) {
const mailboat = MAILBOAT_PER_LB; // $0.50/lb fixed
const subtotal = costPerLb + mailboat; // cost + mailboat
const dutyRate = getDutyRate(category, productName);
const dutyAmount = parseFloat((subtotal * dutyRate).toFixed(2)); // duty on subtotal
const landedCost = parseFloat((subtotal + dutyAmount).toFixed(2)); // full landed cost/lb
const bscMarkup = parseFloat((landedCost * BSC_MARKUP).toFixed(2)); // 10% BSC
const sellingPrice = parseFloat((landedCost + bscMarkup).toFixed(2)); // final marketplace price/lb
const totalLanded = parseFloat((landedCost * weightLbs).toFixed(2));
const totalSelling = parseFloat((sellingPrice * weightLbs).toFixed(2));

return {
costPerLb,
mailboat,
subtotal,
dutyRate,
dutyAmount,
landedCost,
bscMarkup,
sellingPrice,
totalLanded,
totalSelling,
};
}

const CATEGORIES = [
{ value: 'seafood', label: '🐟 Seafood' },
{ value: 'poultry', label: '🍗 Poultry' },
{ value: 'meat', label: '🥩 Meat' },
{ value: 'electronics', label: '📱 Electronics' },
{ value: 'grocery', label: '🛒 Grocery' },
{ value: 'general', label: '📦 General' },
{ value: 'baby', label: '👶 Baby' },
{ value: 'medical', label: '💊 Medical' },
{ value: 'clothing', label: '👕 Clothing' },
{ value: 'furniture', label: '🪑 Furniture' },
];

type Tab = 'overview' | 'upload' | 'products' | 'lobster' | 'sales';

export default function JorgeDashboard() {
const router = useRouter();
const [tab, setTab] = useState<Tab>('overview');
const [myProducts, setMyProducts] = useState<any[]>([]);
const [lobsterBatches, setLobsterBatches] = useState<any[]>([]);
const [myPayouts, setMyPayouts] = useState<any[]>([]);
const [supplierId, setSupplierId] = useState('');
const [supplierName, setSupplierName] = useState('Jorge Caragol');
const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [success, setSuccess] = useState('');
const [error, setError] = useState('');

// Upload form state
const [prodName, setProdName] = useState('');
const [prodCategory, setProdCategory] = useState('seafood');
const [prodCostPerLb, setProdCostPerLb] = useState('');
const [prodWeightLbs, setProdWeightLbs] = useState('');
const [prodSku, setProdSku] = useState('');
const [prodPhoto, setProdPhoto] = useState<File | null>(null);
const [prodPhotoPreview, setProdPhotoPreview] = useState('');

// Live pricing preview
const costNum = parseFloat(prodCostPerLb) || 0;
const weightNum = parseFloat(prodWeightLbs) || 1;
const pricing = costNum > 0 ? calcJorgePricing(costNum, weightNum, prodCategory, prodName || prodCategory) : null;

const totalSales = myPayouts.reduce((s, p) => s + (parseFloat(p.cogs_total) || 0), 0);
const lobsterAvail = lobsterBatches.reduce((s, b) => s + (b.weight_out_lbs || 0), 0);

useEffect(() => { checkAuth(); }, []);

async function checkAuth() {
const { data: { session } } = await supabase.auth.getSession();
if (!session?.user) { router.push('/login'); return; }
const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
if (!['jorge', 'control_admin'].includes(profile?.role)) { router.push('/login'); return; }
await loadData(session.user.email || '');
}

async function loadData(email: string) {
try {
const { data: sup } = await supabase.from('suppliers').select('*').eq('contact_email', email).single();
if (sup) {
setSupplierId(sup.id);
setSupplierName(sup.name || sup.contact_name || 'Jorge Caragol');
}
const supId = sup?.id;

const [prRes, lbRes, pyRes] = await Promise.all([
supId
? supabase.from('supplier_products').select('*').eq('supplier_id', supId).order('created_at', { ascending: false })
: Promise.resolve({ data: [] }),
supabase.from('yield_batches').select('*').or('product_name.ilike.%lobster%,category.eq.seafood').eq('status', 'processed').order('created_at', { ascending: false }).limit(30),
supId
? supabase.from('supplier_payouts').select('*').eq('supplier_id', supId).order('created_at', { ascending: false })
: Promise.resolve({ data: [] }),
]);

if (prRes.data) setMyProducts(prRes.data);
if (lbRes.data) setLobsterBatches(lbRes.data.filter((b: any) => b.product_name?.toLowerCase().includes('lobster')));
if (pyRes.data) setMyPayouts(pyRes.data);
} catch (e) {}
setLoading(false);
}

async function uploadPhoto(): Promise<string> {
if (!prodPhoto) return '';
const fileName = 'jorge-' + Date.now() + '-' + prodPhoto.name;
const { error: uploadErr } = await supabase.storage.from('product-images').upload(fileName, prodPhoto);
if (uploadErr) return '';
const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
return urlData.publicUrl;
}

async function handleUpload() {
setError('');
if (!prodName.trim()) { setError('Enter product name'); return; }
if (!prodCostPerLb) { setError('Enter your cost price per lb'); return; }
if (!prodWeightLbs) { setError('Enter total weight in lbs'); return; }
if (!supplierId) { setError('Supplier account not found — contact Dedrick'); return; }
setSaving(true);

try {
const p = calcJorgePricing(costNum, weightNum, prodCategory, prodName);
const photoUrl = await uploadPhoto();

const payload = {
supplier_id: supplierId,
supplier_name: supplierName,
name: prodName,
category: prodCategory,
sku: prodSku,
photo_url: photoUrl,
// Jorge's cost (what he paid including his freight to mailboat)
case_cost: parseFloat(costNum.toFixed(2)),
case_weight_lbs: weightNum,
pieces_per_case: weightNum, // weight = qty for lb-based products
// Landed cost breakdown
unit_cost: p.landedCost, // landed cost per lb (cost + mailboat + duty)
duty_rate: p.dutyRate,
duty_amount: p.dutyAmount,
shipping_cost: p.mailboat * weightNum, // total mailboat cost
// BSC marketplace selling price (landed + 10% BSC)
retail_price: p.sellingPrice,
wholesale_price: parseFloat((p.sellingPrice * 0.90).toFixed(2)), // slight wholesale discount
// Traceability
country_of_origin: 'USA',
status: 'pending', // Dedrick approves before going live
};

const { error: err } = await supabase.from('supplier_products').insert(payload);
if (err) { setError(err.message); setSaving(false); return; }

setSuccess('✅ Product submitted! Dedrick will review and approve.');
setProdName(''); setProdCategory('seafood'); setProdCostPerLb('');
setProdWeightLbs(''); setProdSku(''); setProdPhoto(null); setProdPhotoPreview('');
setTab('products');
if (supplierId) {
const { data } = await supabase.from('supplier_products').select('*').eq('supplier_id', supplierId).order('created_at', { ascending: false });
if (data) setMyProducts(data);
}
} catch (e) { setError('Upload failed — try again'); }
setSaving(false);
}

const pg: React.CSSProperties = { backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: "'Inter', sans-serif", paddingBottom: 80 };
const card: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 14, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 12 };
const inp: React.CSSProperties = { display: 'block', width: '100%', padding: '13px 14px', borderRadius: 12, backgroundColor: '#0a1220', color: '#fff', border: '1px solid #1e3a5f', fontSize: 15, marginBottom: 4, boxSizing: 'border-box' as const, outline: 'none' };
const lbl: React.CSSProperties = { display: 'block', color: '#6b7280', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 6, marginTop: 14 };

if (loading) {
return (
<div style={{ ...pg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
<div style={{ textAlign: 'center' }}>
<div style={{ fontSize: 48, marginBottom: 12 }}>🇺🇸</div>
<p style={{ color: '#4a5568' }}>Loading Jorge Dashboard...</p>
</div>
</div>
);
}

return (
<div style={pg}>
{/* HEADER */}
<div style={{ background: 'linear-gradient(135deg, #070e1d, #0d1f3c)', borderBottom: '1px solid #1e3a5f', padding: '14px 18px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 640, margin: '0 auto' }}>
<div>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>🇺🇸 Jorge's Dashboard</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{supplierName} · US Supplier & Lobster Sales</p>
</div>
<button
onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
style={{ padding: '7px 12px', borderRadius: 10, backgroundColor: '#0d1f3c', color: '#6b7280', border: '1px solid #1e3a5f', fontSize: 12, cursor: 'pointer' }}
>
Sign Out
</button>
</div>
</div>

<div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 18px' }}>

{/* SUCCESS / ERROR */}
{success && (
<div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>{success}</p>
</div>
)}
{error && (
<div style={{ backgroundColor: '#2d0000', border: '1px solid #f87171', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
<p style={{ margin: 0, color: '#f87171', fontSize: 13 }}>⚠️ {error}</p>
</div>
)}

{/* KPI STRIP */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
{[
{ label: 'MY PRODUCTS', value: String(myProducts.length), color: '#f5c518' },
{ label: 'LOBSTER LBS', value: lobsterAvail.toFixed(1) + ' lbs', color: '#4ade80' },
{ label: 'TOTAL SALES', value: '$' + totalSales.toFixed(0), color: '#60a5fa' },
].map(k => (
<div key={k.label} style={{ ...card, textAlign: 'center' as const, marginBottom: 0 }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>{k.label}</p>
<p style={{ margin: '4px 0 0', color: k.color, fontWeight: 'bold', fontSize: 18 }}>{k.value}</p>
</div>
))}
</div>

{/* TABS */}
<div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto' as const }}>
{[
{ key: 'overview', label: '📊 Overview' },
{ key: 'upload', label: '+ Upload' },
{ key: 'products', label: '📦 Products' },
{ key: 'lobster', label: '🦞 Lobster' },
{ key: 'sales', label: '💰 Sales' },
].map(t => (
<button
key={t.key}
onClick={() => { setTab(t.key as Tab); setSuccess(''); setError(''); }}
style={{ flex: 1, padding: '9px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap' as const, backgroundColor: tab === t.key ? '#f5c518' : '#0d1f3c', color: tab === t.key ? '#000' : '#6b7280' }}
>
{t.label}
</button>
))}
</div>

{/* ── OVERVIEW ── */}
{tab === 'overview' && (
<>
<div style={card}>
<p style={{ margin: '0 0 12px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>📋 How Your Pricing Works</p>
<div style={{ backgroundColor: '#060d1f', borderRadius: 12, padding: '14px 16px', marginBottom: 14, border: '1px solid #1e3a5f' }}>
<p style={{ margin: '0 0 10px', color: '#60a5fa', fontWeight: 'bold', fontSize: 12 }}>💡 Jorge's Cost Engine — Example: Grouper Fillet</p>
{[
{ label: 'Your cost (purchase + your freight to mailboat)', value: '$11.33/lb', color: '#fff' },
{ label: 'Mailboat freight (Florida → Nassau)', value: '+$0.50/lb', color: '#f5c518' },
{ label: 'Subtotal', value: '$11.83/lb', color: '#aaa' },
{ label: 'Bahamas customs duty (35% on grouper)', value: '+$4.14/lb', color: '#f87171' },
{ label: 'Landed cost', value: '$15.97/lb', color: '#4ade80' },
{ label: 'BSC 10% markup', value: '+$1.60/lb', color: '#a78bfa' },
{ label: 'BSC marketplace selling price', value: '$17.57/lb', color: '#f5c518' },
].map((row, i) => (
<div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #1e3a5f' }}>
<p style={{ margin: 0, color: '#6b7280', fontSize: 12 }}>{row.label}</p>
<p style={{ margin: 0, color: row.color, fontWeight: 'bold', fontSize: 13 }}>{row.value}</p>
</div>
))}
</div>
<div style={{ backgroundColor: '#0a1220', borderRadius: 10, padding: '12px 14px', border: '1px solid #1e3a5f' }}>
<p style={{ margin: '0 0 6px', color: '#4ade80', fontWeight: 'bold', fontSize: 12 }}>✅ Your profit</p>
<p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>Whatever margin you build into your cost price is yours. BSC applies the formula on top of your entered cost — it never touches your profit.</p>
</div>
</div>

<div style={card}>
<p style={{ margin: '0 0 12px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>📋 My Responsibilities</p>
{[
{ icon: '🇺🇸', task: 'Upload US products — enter your cost (purchase + your freight to mailboat)' },
{ icon: '🧮', task: 'System auto-calculates: $0.50/lb mailboat + Bahamas duty + 10% BSC markup' },
{ icon: '✅', task: 'Dedrick approves every product before it goes live on BSC marketplace' },
{ icon: '🦞', task: 'Access and sell lobster from Spiny Tails processing — lobster-only view' },
{ icon: '💰', task: 'Your profit is built into your cost price — BSC never touches it' },
].map((r, i) => (
<div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #1e3a5f' }}>
<span style={{ fontSize: 16, flexShrink: 0 }}>{r.icon}</span>
<p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{r.task}</p>
</div>
))}
</div>

{/* WHATSAPP BSC */}
<a href={`https://api.whatsapp.com/send?phone=${BSC_WA_NUMBER}&text=${encodeURIComponent('Hi Dedrick! I have a question about my product upload.')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: '14px', borderRadius: 14, backgroundColor: '#0a2010', color: '#4ade80', border: '1px solid #4ade80', fontWeight: 'bold', fontSize: 14, textAlign: 'center' as const, textDecoration: 'none', marginBottom: 12 }}>
💬 WhatsApp BSC (Dedrick)
</a>
</>
)}

{/* ── UPLOAD ── */}
{tab === 'upload' && (
<>
<p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 15, marginBottom: 4 }}>+ Upload US Product</p>
<p style={{ color: '#4a5568', fontSize: 13, marginBottom: 16 }}>Enter your cost price. System calculates everything else automatically.</p>

{/* US SUPPLIER BANNER */}
<div style={{ backgroundColor: '#1a0a00', border: '1px solid #f87171', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
<p style={{ margin: 0, color: '#f87171', fontWeight: 'bold', fontSize: 13 }}>🇺🇸 US / Florida Import</p>
<p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 12 }}>$0.50/lb mailboat + Bahamas customs duty + 10% BSC markup — all auto-applied</p>
</div>

{/* PHOTO */}
<label style={lbl}>Product Photo</label>
<div
onClick={() => document.getElementById('jorgePhotoInput')?.click()}
style={{ width: '100%', height: 140, borderRadius: 12, border: '2px dashed #1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 14, overflow: 'hidden', backgroundColor: '#0a1220' }}
>
{prodPhotoPreview
? <img src={prodPhotoPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
: <div style={{ textAlign: 'center' as const }}><p style={{ margin: 0, fontSize: 28 }}>📷</p><p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 12 }}>Tap to upload photo</p></div>
}
</div>
<input id="jorgePhotoInput" type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setProdPhoto(f); setProdPhotoPreview(URL.createObjectURL(f)); } }} />

{/* PRODUCT NAME */}
<label style={lbl}>Product Name</label>
<input placeholder="e.g. Grouper Fillet 6/8oz" value={prodName} onChange={e => setProdName(e.target.value)} style={inp} />

{/* CATEGORY */}
<label style={lbl}>Category</label>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 4 }}>
{CATEGORIES.map(cat => (
<button
key={cat.value}
onClick={() => setProdCategory(cat.value)}
style={{ padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 'bold', backgroundColor: prodCategory === cat.value ? '#f5c518' : '#0a1220', color: prodCategory === cat.value ? '#000' : '#6b7280' }}
>
{cat.label}
</button>
))}
</div>

{/* SKU */}
<label style={lbl}>SKU / Product Code (optional)</label>
<input placeholder="e.g. GF-608-10LB" value={prodSku} onChange={e => setProdSku(e.target.value)} style={inp} />

{/* COST */}
<label style={lbl}>Your Cost Price ($/lb) — includes your freight to mailboat</label>
<div style={{ backgroundColor: '#060d1f', border: '2px solid #f5c518', borderRadius: 12, padding: '16px', marginBottom: 4 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
<span style={{ color: '#f5c518', fontSize: 28, fontWeight: 'bold' }}>$</span>
<input
type="number" inputMode="decimal" placeholder="0.00"
value={prodCostPerLb} onChange={e => setProdCostPerLb(e.target.value)}
style={{ ...inp, fontSize: 36, fontWeight: 'bold', textAlign: 'center' as const, color: '#f5c518', backgroundColor: 'transparent', border: 'none', outline: 'none', marginBottom: 0, flex: 1 }}
/>
<span style={{ color: '#4a5568', fontSize: 14 }}>/lb</span>
</div>
<p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 11, textAlign: 'center' as const }}>
Your purchase cost + your freight from supplier to Florida mailboat terminal
</p>
</div>

{/* WEIGHT */}
<label style={lbl}>Total Weight (lbs)</label>
<input
type="number" inputMode="decimal" placeholder="0.0"
value={prodWeightLbs} onChange={e => setProdWeightLbs(e.target.value)}
style={{ ...inp, fontSize: 22, fontWeight: 'bold', textAlign: 'center' as const }}
/>

{/* LIVE PRICING PREVIEW */}
{pricing && prodName && (
<div style={{ backgroundColor: '#0a1220', border: '1px solid #f5c518', borderRadius: 14, padding: '16px', marginBottom: 16 }}>
<p style={{ margin: '0 0 12px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>📊 Automatic Price Calculation</p>

{/* DUTY RATE BADGE */}
<div style={{ marginBottom: 10 }}>
{pricing.dutyRate === 0
? <span style={{ backgroundColor: '#0a1f0a', color: '#4ade80', border: '1px solid #4ade80', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 'bold' }}>✅ Duty FREE — 0% Bahamas Customs</span>
: <span style={{ backgroundColor: '#2d0000', color: '#f87171', border: '1px solid #f87171', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 'bold' }}>⚖️ Bahamas Duty: {(pricing.dutyRate * 100).toFixed(0)}%</span>
}
</div>

{/* BREAKDOWN */}
<div style={{ backgroundColor: '#060d1f', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
{[
{ label: 'Your cost price', value: '$' + pricing.costPerLb.toFixed(2) + '/lb', color: '#fff' },
{ label: 'Mailboat (Florida → Nassau)', value: '+$' + pricing.mailboat.toFixed(2) + '/lb', color: '#f5c518' },
{ label: 'Subtotal', value: '$' + pricing.subtotal.toFixed(2) + '/lb', color: '#aaa' },
{ label: `Duty (${(pricing.dutyRate * 100).toFixed(0)}%)`, value: pricing.dutyRate === 0 ? 'FREE' : '+$' + pricing.dutyAmount.toFixed(2) + '/lb', color: pricing.dutyRate === 0 ? '#4ade80' : '#f87171' },
{ label: 'Landed cost', value: '$' + pricing.landedCost.toFixed(2) + '/lb', color: '#4ade80' },
{ label: 'BSC markup (10%)', value: '+$' + pricing.bscMarkup.toFixed(2) + '/lb', color: '#a78bfa' },
].map((row, i) => (
<div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #1e3a5f' }}>
<p style={{ margin: 0, color: '#6b7280', fontSize: 12 }}>{row.label}</p>
<p style={{ margin: 0, color: row.color, fontWeight: 'bold', fontSize: 13 }}>{row.value}</p>
</div>
))}
</div>

{/* SELLING PRICE — BIG */}
<div style={{ backgroundColor: '#1a1200', borderRadius: 12, padding: '16px', border: '1px solid #f5c518', textAlign: 'center' as const }}>
<p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 10, letterSpacing: 1 }}>BSC MARKETPLACE SELLING PRICE</p>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 32 }}>${pricing.sellingPrice.toFixed(2)}<span style={{ fontSize: 14, color: '#4a5568' }}>/lb</span></p>
<p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 11 }}>
Total for {weightNum} lbs: <span style={{ color: '#4ade80', fontWeight: 'bold' }}>${pricing.totalSelling.toFixed(2)}</span>
</p>
</div>
</div>
)}

<button
onClick={handleUpload}
disabled={saving || !prodName || !prodCostPerLb || !prodWeightLbs}
style={{ width: '100%', padding: '15px', borderRadius: 12, backgroundColor: saving || !prodName || !prodCostPerLb || !prodWeightLbs ? '#1e3a5f' : '#f5c518', color: saving || !prodName || !prodCostPerLb || !prodWeightLbs ? '#4a5568' : '#000', fontWeight: 'bold', border: 'none', fontSize: 16, cursor: saving || !prodName || !prodCostPerLb || !prodWeightLbs ? 'not-allowed' : 'pointer' }}
>
{saving ? 'Uploading...' : '📤 Submit for Approval'}
</button>
<p style={{ margin: '8px 0 0', color: '#4a5568', fontSize: 11, textAlign: 'center' as const }}>Dedrick reviews and approves before product goes live</p>
</>
)}

{/* ── PRODUCTS ── */}
{tab === 'products' && (
<>
<p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>My Products ({myProducts.length})</p>
{myProducts.length === 0 ? (
<div style={{ ...card, textAlign: 'center' as const, padding: 32 }}>
<p style={{ color: '#4a5568', marginBottom: 14 }}>No products yet.</p>
<button onClick={() => setTab('upload')} style={{ padding: '12px 24px', borderRadius: 12, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 14 }}>
+ Upload First Product
</button>
</div>
) : (
myProducts.map(p => {
const dutyRate = p.duty_rate || 0;
return (
<div key={p.id} style={{ ...card, borderColor: p.status === 'approved' ? '#4ade8033' : '#f5c51833' }}>
<div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
{p.photo_url && <img src={p.photo_url} alt={p.name} style={{ width: 60, height: 60, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />}
<div style={{ flex: 1 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{p.name}</p>
<span style={{ backgroundColor: p.status === 'approved' ? '#0a1f0a' : '#1a1400', color: p.status === 'approved' ? '#4ade80' : '#f5c518', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 'bold' }}>
{p.status?.toUpperCase()}
</span>
</div>
<p style={{ margin: '0 0 2px', color: '#4a5568', fontSize: 11 }}>{p.category}</p>
{dutyRate === 0
? <p style={{ margin: 0, color: '#4ade80', fontSize: 10 }}>✅ Duty FREE</p>
: <p style={{ margin: 0, color: '#f87171', fontSize: 10 }}>⚖️ Duty: {(dutyRate * 100).toFixed(0)}%</p>
}
</div>
</div>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 10 }}>
{[
{ label: 'MY COST', value: '$' + p.case_cost?.toFixed(2) + '/lb', color: '#fff' },
{ label: 'LANDED', value: '$' + p.unit_cost?.toFixed(2) + '/lb', color: '#4ade80' },
{ label: 'SELLS FOR', value: '$' + p.retail_price?.toFixed(2) + '/lb', color: '#f5c518' },
{ label: 'WEIGHT', value: (p.case_weight_lbs || 0) + ' lbs', color: '#60a5fa' },
].map(x => (
<div key={x.label} style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '7px 8px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>{x.label}</p>
<p style={{ margin: '2px 0 0', color: x.color, fontWeight: 'bold', fontSize: 11 }}>{x.value}</p>
</div>
))}
</div>
</div>
);
})
)}
</>
)}

{/* ── LOBSTER ── */}
{tab === 'lobster' && (
<>
<p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 15, marginBottom: 4 }}>🦞 Lobster from Spiny Tails</p>
<p style={{ color: '#4a5568', fontSize: 13, marginBottom: 16 }}>Processed lobster ready for sale. You see only lobster — not the full plant inventory.</p>

<div style={{ ...card, background: 'linear-gradient(135deg, #001a3a, #002a5a)', borderColor: '#1e5a9f', marginBottom: 16 }}>
<p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 10, letterSpacing: 1 }}>TOTAL LOBSTER AVAILABLE</p>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 28 }}>{lobsterAvail.toFixed(1)} lbs</p>
<p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 12 }}>Yield-processed · Ready for sale</p>
</div>

{lobsterBatches.length === 0 ? (
<div style={{ ...card, textAlign: 'center' as const, padding: 32 }}>
<p style={{ color: '#4a5568' }}>No lobster batches available yet.</p>
<p style={{ color: '#4a5568', fontSize: 12 }}>Contact Dedrick if you expect lobster to be available.</p>
</div>
) : (
lobsterBatches.map(b => (
<div key={b.id} style={card}>
<p style={{ margin: '0 0 4px', color: '#f5c518', fontSize: 12, fontFamily: 'monospace' }}>{b.batch_number}</p>
<p style={{ margin: '0 0 2px', fontWeight: 'bold', fontSize: 14 }}>{b.product_name}</p>
<p style={{ margin: '0 0 10px', color: '#4a5568', fontSize: 12 }}>
Producer: {b.producer_name} · {new Date(b.date_received).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
</p>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
{[
{ label: 'AVAILABLE', value: b.weight_out_lbs + ' lbs', color: '#4ade80' },
{ label: 'COST/LB', value: '$' + (b.cost_per_lb_processed?.toFixed(2) || '0.00'), color: '#f5c518' },
{ label: 'NASSAU/LB', value: '$' + (b.nassau_price_per_lb?.toFixed(2) || '0.00'), color: '#60a5fa' },
{ label: 'ONLINE/LB', value: '$' + (b.online_price_per_lb?.toFixed(2) || '0.00'), color: '#a78bfa' },
].map(x => (
<div key={x.label} style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>{x.label}</p>
<p style={{ margin: '2px 0 0', color: x.color, fontWeight: 'bold', fontSize: 13 }}>{x.value}</p>
</div>
))}
</div>
{/* CONTACT BSC TO PURCHASE */}
<a
href={`https://api.whatsapp.com/send?phone=${BSC_WA_NUMBER}&text=${encodeURIComponent('Hi Dedrick! I want to purchase lobster from batch ' + b.batch_number + ' (' + b.weight_out_lbs + ' lbs). Please confirm availability.')}`}
target="_blank" rel="noopener noreferrer"
style={{ display: 'block', marginTop: 10, padding: '9px', borderRadius: 10, backgroundColor: '#0a2010', color: '#4ade80', border: '1px solid #4ade80', textDecoration: 'none', fontWeight: 'bold', fontSize: 13, textAlign: 'center' as const }}
>
💬 WhatsApp Dedrick to Purchase
</a>
</div>
))
)}
</>
)}

{/* ── SALES ── */}
{tab === 'sales' && (
<>
<p style={{ color: '#4ade80', fontWeight: 'bold', fontSize: 15, marginBottom: 12 }}>💰 Sales History</p>
<div style={{ ...card, background: 'linear-gradient(135deg, #0a1f0a, #0d2b14)', borderColor: '#4ade8066', marginBottom: 16 }}>
<p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 10, letterSpacing: 1 }}>TOTAL SALES VALUE</p>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 28 }}>${totalSales.toFixed(2)}</p>
<p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 12 }}>{myPayouts.length} transactions recorded</p>
</div>

{myPayouts.length === 0 ? (
<div style={{ ...card, textAlign: 'center' as const, padding: 32 }}>
<p style={{ color: '#4a5568' }}>No sales recorded yet.</p>
<p style={{ color: '#4a5568', fontSize: 12 }}>Sales are recorded automatically when a customer order is marked PAID.</p>
</div>
) : (
myPayouts.map(p => (
<div key={p.id} style={card}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{p.product_name}</p>
<p style={{ margin: '2px 0', color: '#4a5568', fontSize: 12 }}>Order: {p.order_number}</p>
<p style={{ margin: '2px 0', color: '#4a5568', fontSize: 11 }}>Qty: {p.qty_sold} lbs · ${parseFloat(p.cost_per_unit || '0').toFixed(2)}/lb</p>
</div>
<div style={{ textAlign: 'right' as const }}>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 16 }}>${parseFloat(p.cogs_total).toFixed(2)}</p>
<span style={{ backgroundColor: p.paid ? '#0a1f0a' : '#1a1400', color: p.paid ? '#4ade80' : '#f5c518', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 'bold' }}>
{p.paid ? '✅ PAID' : '⏳ PENDING'}
</span>
</div>
</div>
</div>
))
)}
</>
)}

</div>
</div>
);
}
