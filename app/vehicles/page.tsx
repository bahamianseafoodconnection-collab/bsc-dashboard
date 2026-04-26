// File: app/vehicles/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
'https://auqjjrisivhfmpleusyt.supabase.co',
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg'
);

const BSC_WHATSAPP = '12424777506';
const BSC_WHATSAPP_DISPLAY = '+1 (242) 477-7506';
const VAT_RATE = 0.10; // 10% Bahamas VAT
const CAR_SALE_MARKUP = 650; // flat $650 markup on supplier cost
const RENTAL_DAY_MARKUP = 10; // $10/day markup on supplier daily cost
const PARTS_MARKUP_RATE = 0.10; // 10% markup on supplier cost

// ── PRICING ENGINES ──
function calcSalePrice(supplierCost: number) {
const beforeVat = supplierCost + CAR_SALE_MARKUP;
const vat = parseFloat((beforeVat * VAT_RATE).toFixed(2));
const total = parseFloat((beforeVat + vat).toFixed(2));
return { beforeVat, vat, total, markup: CAR_SALE_MARKUP, bscProfit: CAR_SALE_MARKUP };
}

function calcRentalPrice(supplierDailyRate: number) {
const dailyBeforeVat = supplierDailyRate + RENTAL_DAY_MARKUP;
const dailyVat = parseFloat((dailyBeforeVat * VAT_RATE).toFixed(2));
const dailyTotal = parseFloat((dailyBeforeVat + dailyVat).toFixed(2));
const weeklyBeforeVat = dailyBeforeVat * 7;
const weeklyVat = parseFloat((weeklyBeforeVat * VAT_RATE).toFixed(2));
const weeklyTotal = parseFloat((weeklyBeforeVat + weeklyVat).toFixed(2));
return {
dailyBeforeVat, dailyVat, dailyTotal,
weeklyBeforeVat, weeklyVat, weeklyTotal,
bscProfitPerDay: RENTAL_DAY_MARKUP,
};
}

function calcPartPrice(supplierCost: number) {
const markup = parseFloat((supplierCost * PARTS_MARKUP_RATE).toFixed(2));
const beforeVat = parseFloat((supplierCost + markup).toFixed(2));
const vat = parseFloat((beforeVat * VAT_RATE).toFixed(2));
const total = parseFloat((beforeVat + vat).toFixed(2));
return { markup, beforeVat, vat, total, bscProfit: markup };
}

type Tab = 'vehicles' | 'parts';
type ListingType = 'all' | 'sale' | 'rental';

type Vehicle = {
id: string;
listing_type: string;
year: number;
make: string;
model: string;
mileage: number;
vin: string;
// Stored supplier costs
supplier_cost: number;
supplier_daily_rate: number;
supplier_weekly_rate: number;
// Computed customer-facing prices (stored for display)
price: number;
rental_rate_daily: number;
rental_rate_weekly: number;
deposit: number;
// VAT amounts stored
vat_amount: number;
bsc_markup: number;
color: string;
condition: string;
description: string;
photos: string[];
whatsapp_contact: string;
status: string;
created_at: string;
};

type AutoPart = {
id: string;
name: string;
part_number: string;
brand: string;
compatibility: string;
condition: string;
supplier_cost: number;
price: number;
vat_amount: number;
bsc_markup: number;
stock: number;
description: string;
photos: string[];
ships_only: boolean;
whatsapp_contact: string;
status: string;
created_at: string;
};

type AdminForm = {
listing_type: string;
year: string;
make: string;
model: string;
mileage: string;
vin: string;
supplier_cost: string;
supplier_daily_rate: string;
supplier_weekly_rate: string;
deposit: string;
color: string;
condition: string;
description: string;
};

type PartForm = {
name: string;
part_number: string;
brand: string;
compatibility: string;
condition: string;
supplier_cost: string;
stock: string;
description: string;
};

export default function VehiclesPage() {
const router = useRouter();
const [tab, setTab] = useState<Tab>('vehicles');
const [listingFilter, setListingFilter] = useState<ListingType>('all');
const [vehicles, setVehicles] = useState<Vehicle[]>([]);
const [parts, setParts] = useState<AutoPart[]>([]);
const [loading, setLoading] = useState(true);
const [isAdmin, setIsAdmin] = useState(false);
const [isControlAdmin, setIsControlAdmin] = useState(false);
const [showAdminForm, setShowAdminForm] = useState(false);
const [showPartForm, setShowPartForm] = useState(false);
const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
const [editingPart, setEditingPart] = useState<AutoPart | null>(null);
const [saving, setSaving] = useState(false);
const [success, setSuccess] = useState('');
const [error, setError] = useState('');
const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
const [selectedPart, setSelectedPart] = useState<AutoPart | null>(null);
const [photoFiles, setPhotoFiles] = useState<File[]>([]);
const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

const [form, setForm] = useState<AdminForm>({
listing_type: 'sale', year: '', make: '', model: '', mileage: '',
vin: '', supplier_cost: '', supplier_daily_rate: '', supplier_weekly_rate: '',
deposit: '', color: '', condition: 'used', description: '',
});

const [partForm, setPartForm] = useState<PartForm>({
name: '', part_number: '', brand: '', compatibility: '',
condition: 'new', supplier_cost: '', stock: '1', description: '',
});

// Live price previews for admin form
const salePricing = form.supplier_cost ? calcSalePrice(parseFloat(form.supplier_cost) || 0) : null;
const rentalPricing = form.supplier_daily_rate ? calcRentalPrice(parseFloat(form.supplier_daily_rate) || 0) : null;
const partPricing = partForm.supplier_cost ? calcPartPrice(parseFloat(partForm.supplier_cost) || 0) : null;

useEffect(() => { checkAuth(); loadVehicles(); loadParts(); }, []);

async function checkAuth() {
const { data: { session } } = await supabase.auth.getSession();
const user = session?.user;
if (user) {
const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
if (profile?.role === 'control_admin' || profile?.role === 'basic_admin' || profile?.role === 'manager') {
setIsAdmin(true);
if (profile.role === 'control_admin') setIsControlAdmin(true);
}
}
}

async function loadVehicles() {
const { data } = await supabase.from('vehicles').select('*').eq('status', 'active').order('created_at', { ascending: false });
if (data) setVehicles(data);
setLoading(false);
}

async function loadParts() {
const { data } = await supabase.from('auto_parts').select('*').eq('status', 'active').order('created_at', { ascending: false });
if (data) setParts(data);
}

async function uploadPhotos(): Promise<string[]> {
const urls: string[] = [];
for (const file of photoFiles) {
const fileName = Date.now() + '-vehicle-' + file.name;
const { error: uploadErr } = await supabase.storage.from('product-images').upload(fileName, file);
if (!uploadErr) {
const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
urls.push(urlData.publicUrl);
}
}
return urls;
}

async function handleSaveVehicle() {
setError(''); setSaving(true);
if (!form.make || !form.model || !form.year) { setError('Year, make and model required'); setSaving(false); return; }

const photos = await uploadPhotos();
const existing = editingVehicle?.photos || [];

let payload: any = {
listing_type: form.listing_type,
year: parseInt(form.year) || 0,
make: form.make,
model: form.model,
mileage: parseInt(form.mileage) || 0,
vin: form.vin,
color: form.color,
condition: form.condition,
description: form.description,
photos: [...existing, ...photos],
whatsapp_contact: BSC_WHATSAPP,
status: 'active',
};

if (form.listing_type === 'sale') {
const supplierCost = parseFloat(form.supplier_cost) || 0;
const pricing = calcSalePrice(supplierCost);
payload = {
...payload,
supplier_cost: supplierCost,
supplier_daily_rate: 0,
supplier_weekly_rate: 0,
price: pricing.total,
rental_rate_daily: 0,
rental_rate_weekly: 0,
deposit: parseFloat(form.deposit) || 0,
vat_amount: pricing.vat,
bsc_markup: pricing.markup,
};
} else {
const supplierDaily = parseFloat(form.supplier_daily_rate) || 0;
const supplierWeekly = parseFloat(form.supplier_weekly_rate) || supplierDaily * 7;
const pricing = calcRentalPrice(supplierDaily);
payload = {
...payload,
supplier_cost: 0,
supplier_daily_rate: supplierDaily,
supplier_weekly_rate: supplierWeekly,
price: 0,
rental_rate_daily: pricing.dailyTotal,
rental_rate_weekly: pricing.weeklyTotal,
deposit: parseFloat(form.deposit) || 0,
vat_amount: pricing.dailyVat,
bsc_markup: RENTAL_DAY_MARKUP,
};
}

if (editingVehicle) {
await supabase.from('vehicles').update(payload).eq('id', editingVehicle.id);
} else {
await supabase.from('vehicles').insert(payload);
}
setSaving(false);
setSuccess(editingVehicle ? 'Vehicle updated!' : 'Vehicle listed!');
setShowAdminForm(false); setEditingVehicle(null); resetVehicleForm();
await loadVehicles();
setTimeout(() => setSuccess(''), 3000);
}

async function handleSavePart() {
setError(''); setSaving(true);
if (!partForm.name || !partForm.supplier_cost) { setError('Name and supplier cost required'); setSaving(false); return; }
const photos = await uploadPhotos();
const existing = editingPart?.photos || [];
const supplierCost = parseFloat(partForm.supplier_cost) || 0;
const pricing = calcPartPrice(supplierCost);
const payload = {
name: partForm.name,
part_number: partForm.part_number,
brand: partForm.brand,
compatibility: partForm.compatibility,
condition: partForm.condition,
supplier_cost: supplierCost,
price: pricing.total,
vat_amount: pricing.vat,
bsc_markup: pricing.markup,
stock: parseInt(partForm.stock) || 1,
description: partForm.description,
photos: [...existing, ...photos],
ships_only: true,
whatsapp_contact: BSC_WHATSAPP,
status: 'active',
};
if (editingPart) {
await supabase.from('auto_parts').update(payload).eq('id', editingPart.id);
} else {
await supabase.from('auto_parts').insert(payload);
}
setSaving(false);
setSuccess(editingPart ? 'Part updated!' : 'Part listed!');
setShowPartForm(false); setEditingPart(null); resetPartForm();
await loadParts();
setTimeout(() => setSuccess(''), 3000);
}

async function handleDeleteVehicle(id: string) {
if (!confirm('Delete this vehicle listing?')) return;
await supabase.from('vehicles').update({ status: 'inactive' }).eq('id', id);
await loadVehicles();
}

async function handleDeletePart(id: string) {
if (!confirm('Delete this part listing?')) return;
await supabase.from('auto_parts').update({ status: 'inactive' }).eq('id', id);
await loadParts();
}

function resetVehicleForm() {
setForm({ listing_type: 'sale', year: '', make: '', model: '', mileage: '', vin: '', supplier_cost: '', supplier_daily_rate: '', supplier_weekly_rate: '', deposit: '', color: '', condition: 'used', description: '' });
setPhotoFiles([]); setPhotoPreviews([]);
}

function resetPartForm() {
setPartForm({ name: '', part_number: '', brand: '', compatibility: '', condition: 'new', supplier_cost: '', stock: '1', description: '' });
setPhotoFiles([]); setPhotoPreviews([]);
}

function startEditVehicle(v: Vehicle) {
setForm({
listing_type: v.listing_type,
year: v.year?.toString() || '',
make: v.make || '',
model: v.model || '',
mileage: v.mileage?.toString() || '',
vin: v.vin || '',
supplier_cost: v.supplier_cost?.toString() || '',
supplier_daily_rate: v.supplier_daily_rate?.toString() || '',
supplier_weekly_rate: v.supplier_weekly_rate?.toString() || '',
deposit: v.deposit?.toString() || '',
color: v.color || '',
condition: v.condition || 'used',
description: v.description || '',
});
setEditingVehicle(v); setPhotoFiles([]); setPhotoPreviews([]);
setShowAdminForm(true);
}

function startEditPart(p: AutoPart) {
setPartForm({
name: p.name || '',
part_number: p.part_number || '',
brand: p.brand || '',
compatibility: p.compatibility || '',
condition: p.condition || 'new',
supplier_cost: p.supplier_cost?.toString() || '',
stock: p.stock?.toString() || '1',
description: p.description || '',
});
setEditingPart(p); setPhotoFiles([]); setPhotoPreviews([]);
setShowPartForm(true);
}

function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
const files = Array.from(e.target.files || []);
setPhotoFiles(prev => [...prev, ...files]);
files.forEach(f => setPhotoPreviews(prev => [...prev, URL.createObjectURL(f)]));
}

function whatsappInquiry(item: Vehicle | AutoPart, type: 'vehicle' | 'part') {
let text = '';
if (type === 'vehicle') {
const v = item as Vehicle;
const isRental = v.listing_type === 'rental';
text = `Hi BSC! I'm interested in the ${v.year} ${v.make} ${v.model} ${isRental ? 'for rental' : 'for sale'}.\n\n` +
`${isRental
? `Daily Rate: $${v.rental_rate_daily?.toFixed(2)}/day\nWeekly Rate: $${v.rental_rate_weekly?.toFixed(2)}/week\nDeposit: $${v.deposit?.toFixed(2)}`
: `Price: $${v.price?.toLocaleString()} (incl. 10% VAT)`
}\n\nColor: ${v.color || 'N/A'}\nMileage: ${v.mileage?.toLocaleString() || 'N/A'} miles\n\nPlease contact me. Thank you!`;
} else {
const p = item as AutoPart;
text = `Hi BSC! I'd like to order the following auto part:\n\nPart: ${p.name}\nBrand: ${p.brand || 'N/A'}\nPart #: ${p.part_number || 'N/A'}\nFits: ${p.compatibility || 'N/A'}\nPrice: $${p.price?.toFixed(2)} (incl. 10% VAT + shipping)\n\nPlease advise on shipping. Thank you!`;
}
window.open(`https://api.whatsapp.com/send?phone=${BSC_WHATSAPP}&text=${encodeURIComponent(text)}`, '_blank');
}

const filteredVehicles = vehicles.filter(v => listingFilter === 'all' || v.listing_type === listingFilter);

// ── STYLES ──
const pg: React.CSSProperties = { backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: "'Inter', sans-serif", paddingBottom: 30 };
const card: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 16, border: '1px solid #1e3a5f', marginBottom: 14, overflow: 'hidden' };
const inp: React.CSSProperties = { display: 'block', width: '100%', padding: '11px 13px', borderRadius: 10, backgroundColor: '#060d1f', color: '#fff', border: '1px solid #1e3a5f', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' as const, outline: 'none' };
const lbl: React.CSSProperties = { display: 'block', color: '#6b7280', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 5 };
const primaryBtn: React.CSSProperties = { width: '100%', padding: '13px', borderRadius: 12, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', fontSize: 15, cursor: 'pointer', marginBottom: 10 };
const ghostBtn: React.CSSProperties = { width: '100%', padding: '11px', borderRadius: 12, backgroundColor: 'transparent', color: '#6b7280', border: '1px solid #1e3a5f', fontSize: 14, cursor: 'pointer', marginBottom: 10 };

// ── PRICING PREVIEW BLOCK (admin only) ──
const PricingPreview = ({ type }: { type: 'sale' | 'rental' | 'part' }) => {
if (type === 'sale' && salePricing && parseFloat(form.supplier_cost) > 0) {
return (
<div style={{ backgroundColor: '#0a1220', border: '2px solid #f5c518', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
<p style={{ margin: '0 0 10px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>📊 PRICING BREAKDOWN — Customer Sees</p>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
<p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>Supplier Cost</p>
<p style={{ margin: 0, color: '#fff', fontSize: 13 }}>${parseFloat(form.supplier_cost).toFixed(2)}</p>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
<p style={{ margin: 0, color: '#4ade80', fontSize: 13 }}>BSC Markup (flat)</p>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>+$650.00</p>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
<p style={{ margin: 0, color: '#a78bfa', fontSize: 13 }}>VAT (10%)</p>
<p style={{ margin: 0, color: '#a78bfa', fontWeight: 'bold', fontSize: 13 }}>+${salePricing.vat.toFixed(2)}</p>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1e3a5f', paddingTop: 8 }}>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>Customer Price</p>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 20 }}>${salePricing.total.toLocaleString()}</p>
</div>
<div style={{ marginTop: 8, backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px' }}>
<p style={{ margin: 0, color: '#f5c518', fontSize: 12 }}>💰 BSC Profit per sale: <b>$650.00</b></p>
</div>
</div>
);
}
if (type === 'rental' && rentalPricing && parseFloat(form.supplier_daily_rate) > 0) {
return (
<div style={{ backgroundColor: '#0a1220', border: '2px solid #60a5fa', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
<p style={{ margin: '0 0 10px', color: '#60a5fa', fontWeight: 'bold', fontSize: 13 }}>📊 RENTAL PRICING BREAKDOWN</p>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
<div style={{ backgroundColor: '#060d1f', borderRadius: 10, padding: '10px 12px' }}>
<p style={{ margin: '0 0 6px', color: '#4a5568', fontSize: 10, letterSpacing: 1 }}>DAILY RATE</p>
<p style={{ margin: '0 0 2px', color: '#aaa', fontSize: 11 }}>Supplier: ${parseFloat(form.supplier_daily_rate).toFixed(2)}</p>
<p style={{ margin: '0 0 2px', color: '#4ade80', fontSize: 11 }}>+ $10 markup</p>
<p style={{ margin: '0 0 2px', color: '#a78bfa', fontSize: 11 }}>+ 10% VAT</p>
<p style={{ margin: '6px 0 0', color: '#60a5fa', fontWeight: 'bold', fontSize: 18 }}>${rentalPricing.dailyTotal.toFixed(2)}<span style={{ fontSize: 11 }}>/day</span></p>
</div>
<div style={{ backgroundColor: '#060d1f', borderRadius: 10, padding: '10px 12px' }}>
<p style={{ margin: '0 0 6px', color: '#4a5568', fontSize: 10, letterSpacing: 1 }}>WEEKLY RATE</p>
<p style={{ margin: '0 0 2px', color: '#aaa', fontSize: 11 }}>7 days bundled</p>
<p style={{ margin: '0 0 2px', color: '#4ade80', fontSize: 11 }}>+ $70 markup</p>
<p style={{ margin: '0 0 2px', color: '#a78bfa', fontSize: 11 }}>+ 10% VAT</p>
<p style={{ margin: '6px 0 0', color: '#60a5fa', fontWeight: 'bold', fontSize: 18 }}>${rentalPricing.weeklyTotal.toFixed(2)}<span style={{ fontSize: 11 }}>/wk</span></p>
</div>
</div>
<div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px' }}>
<p style={{ margin: 0, color: '#f5c518', fontSize: 12 }}>💰 BSC Profit: <b>$10/day · $70/week</b></p>
</div>
</div>
);
}
if (type === 'part' && partPricing && parseFloat(partForm.supplier_cost) > 0) {
return (
<div style={{ backgroundColor: '#0a1220', border: '2px solid #4ade80', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
<p style={{ margin: '0 0 10px', color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>📊 PART PRICING BREAKDOWN</p>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
<p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>Supplier Cost</p>
<p style={{ margin: 0, color: '#fff', fontSize: 13 }}>${parseFloat(partForm.supplier_cost).toFixed(2)}</p>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
<p style={{ margin: 0, color: '#4ade80', fontSize: 13 }}>BSC Markup (10%)</p>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>+${partPricing.markup.toFixed(2)}</p>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
<p style={{ margin: 0, color: '#a78bfa', fontSize: 13 }}>VAT (10%)</p>
<p style={{ margin: 0, color: '#a78bfa', fontWeight: 'bold', fontSize: 13 }}>+${partPricing.vat.toFixed(2)}</p>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1e3a5f', paddingTop: 8 }}>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>Customer Price</p>
<p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 20 }}>${partPricing.total.toFixed(2)}</p>
</div>
<div style={{ marginTop: 8, backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px' }}>
<p style={{ margin: 0, color: '#f5c518', fontSize: 12 }}>💰 BSC Profit per unit: <b>${partPricing.bscProfit.toFixed(2)}</b></p>
</div>
</div>
);
}
return null;
};

// ── VEHICLE DETAIL MODAL ──
if (selectedVehicle) {
const v = selectedVehicle;
const isRental = v.listing_type === 'rental';
const photos = Array.isArray(v.photos) ? v.photos : [];
return (
<div style={pg}>
<div style={{ background: 'linear-gradient(135deg, #070e1d, #0d1f3c)', borderBottom: '1px solid #1e3a5f', padding: '14px 18px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 640, margin: '0 auto' }}>
<button onClick={() => setSelectedVehicle(null)} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 22, cursor: 'pointer', padding: 0 }}>←</button>
<div>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>{v.year} {v.make} {v.model}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{isRental ? '🔑 For Rent' : '🏷️ For Sale'}</p>
</div>
</div>
</div>
<div style={{ maxWidth: 640, margin: '0 auto', padding: '0 0 30px' }}>
{photos.length > 0 ? (
<div style={{ position: 'relative', height: 260, overflow: 'hidden' }}>
<img src={photos[0]} alt={v.make} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
<div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 50%, rgba(6,13,31,0.8))' }} />
{photos.length > 1 && (
<div style={{ position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, padding: '4px 10px' }}>
<p style={{ margin: 0, color: '#fff', fontSize: 11 }}>+{photos.length - 1} photos</p>
</div>
)}
</div>
) : (
<div style={{ height: 200, backgroundColor: '#0d1f3c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
<p style={{ fontSize: 64 }}>🚗</p>
</div>
)}
{photos.length > 1 && (
<div style={{ display: 'flex', gap: 8, padding: '10px 18px', overflowX: 'auto' as const }}>
{photos.slice(1).map((p, i) => <img key={i} src={p} alt="" style={{ width: 80, height: 60, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />)}
</div>
)}
<div style={{ padding: '18px 18px 0' }}>
{isRental ? (
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
<div style={{ background: 'linear-gradient(135deg, #001a2a, #002a3a)', border: '1px solid #1e5a9f', borderRadius: 14, padding: '14px 16px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10, letterSpacing: 1 }}>DAILY RATE</p>
<p style={{ margin: '6px 0 0', color: '#60a5fa', fontWeight: 'bold', fontSize: 24 }}>${v.rental_rate_daily?.toFixed(2)}<span style={{ fontSize: 12, fontWeight: 'normal' }}>/day</span></p>
<p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 10 }}>Incl. 10% VAT</p>
</div>
<div style={{ background: 'linear-gradient(135deg, #001a2a, #002a3a)', border: '1px solid #1e5a9f', borderRadius: 14, padding: '14px 16px' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10, letterSpacing: 1 }}>WEEKLY RATE</p>
<p style={{ margin: '6px 0 0', color: '#60a5fa', fontWeight: 'bold', fontSize: 24 }}>${v.rental_rate_weekly?.toFixed(2)}<span style={{ fontSize: 12, fontWeight: 'normal' }}>/wk</span></p>
<p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 10 }}>Incl. 10% VAT</p>
</div>
<div style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', border: '1px solid #f5c51866', borderRadius: 14, padding: '14px 16px', gridColumn: '1 / -1' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10, letterSpacing: 1 }}>SECURITY DEPOSIT</p>
<p style={{ margin: '6px 0 0', color: '#f5c518', fontWeight: 'bold', fontSize: 20 }}>${v.deposit?.toLocaleString()}</p>
</div>
</div>
) : (
<div style={{ background: 'linear-gradient(135deg, #0a1f0a, #0d2b14)', border: '1px solid #4ade8066', borderRadius: 14, padding: '18px 20px', marginBottom: 14 }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10, letterSpacing: 1 }}>ASKING PRICE</p>
<p style={{ margin: '6px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 32 }}>${v.price?.toLocaleString()}</p>
<p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 11 }}>Incl. 10% VAT · All-in price</p>
</div>
)}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
{[
{ label: 'YEAR', value: v.year?.toString() || 'N/A', color: '#fff' },
{ label: 'MILEAGE', value: v.mileage ? v.mileage.toLocaleString() + ' mi' : 'N/A', color: '#aaa' },
{ label: 'COLOR', value: v.color || 'N/A', color: '#aaa' },
{ label: 'CONDITION', value: (v.condition || 'N/A').toUpperCase(), color: v.condition === 'new' ? '#4ade80' : '#f5c518' },
{ label: 'TYPE', value: isRental ? 'RENTAL' : 'FOR SALE', color: isRental ? '#60a5fa' : '#4ade80' },
{ label: 'VAT', value: '10% Incl.', color: '#a78bfa' },
].map(x => (
<div key={x.label} style={{ backgroundColor: '#0d1f3c', borderRadius: 10, padding: '10px 12px', border: '1px solid #1e3a5f' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>{x.label}</p>
<p style={{ margin: '4px 0 0', color: x.color, fontWeight: 'bold', fontSize: 12 }}>{x.value}</p>
</div>
))}
</div>
{v.description && (
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 14, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 14 }}>
<p style={{ margin: '0 0 8px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>Description</p>
<p style={{ margin: 0, color: '#aaa', fontSize: 14, lineHeight: 1.6 }}>{v.description}</p>
</div>
)}
<div style={{ backgroundColor: '#0a0f1e', border: '1px solid #1e3a5f', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>⚖️ All prices include 10% Bahamas VAT remitted to the government.</p>
</div>
<button onClick={() => whatsappInquiry(v, 'vehicle')} style={{ ...primaryBtn, backgroundColor: '#25d366', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
💬 WhatsApp Inquiry — {BSC_WHATSAPP_DISPLAY}
</button>
{isAdmin && (
<button onClick={() => { setSelectedVehicle(null); startEditVehicle(v); }} style={{ ...ghostBtn, color: '#f5c518', borderColor: '#f5c51866' }}>
✏️ Edit Listing
</button>
)}
</div>
</div>
</div>
);
}

// ── PART DETAIL MODAL ──
if (selectedPart) {
const p = selectedPart;
const photos = Array.isArray(p.photos) ? p.photos : [];
return (
<div style={pg}>
<div style={{ background: 'linear-gradient(135deg, #070e1d, #0d1f3c)', borderBottom: '1px solid #1e3a5f', padding: '14px 18px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 640, margin: '0 auto' }}>
<button onClick={() => setSelectedPart(null)} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 22, cursor: 'pointer', padding: 0 }}>←</button>
<div>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>{p.name}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>🔧 Auto Part · Ships Only</p>
</div>
</div>
</div>
<div style={{ maxWidth: 640, margin: '0 auto', padding: '0 0 30px' }}>
{photos.length > 0 ? (
<div style={{ height: 220, overflow: 'hidden' }}>
<img src={photos[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
</div>
) : (
<div style={{ height: 160, backgroundColor: '#0d1f3c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
<p style={{ fontSize: 64 }}>🔧</p>
</div>
)}
<div style={{ padding: '18px 18px 0' }}>
<div style={{ background: 'linear-gradient(135deg, #0a1f0a, #0d2b14)', border: '1px solid #4ade8066', borderRadius: 14, padding: '16px 18px', marginBottom: 14 }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10, letterSpacing: 1 }}>PRICE (INCL. 10% VAT)</p>
<p style={{ margin: '6px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 28 }}>${p.price?.toFixed(2)}</p>
<p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 11 }}>+ shipping · {p.stock} in stock</p>
</div>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
{[
{ label: 'BRAND', value: p.brand || 'N/A', color: '#fff' },
{ label: 'PART NUMBER', value: p.part_number || 'N/A', color: '#60a5fa' },
{ label: 'CONDITION', value: (p.condition || 'new').toUpperCase(), color: p.condition === 'new' ? '#4ade80' : '#f5c518' },
{ label: 'VAT', value: '10% Incl.', color: '#a78bfa' },
].map(x => (
<div key={x.label} style={{ backgroundColor: '#0d1f3c', borderRadius: 10, padding: '10px 12px', border: '1px solid #1e3a5f' }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>{x.label}</p>
<p style={{ margin: '4px 0 0', color: x.color, fontWeight: 'bold', fontSize: 13 }}>{x.value}</p>
</div>
))}
</div>
{p.compatibility && (
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 12, padding: '12px 14px', border: '1px solid #1e3a5f', marginBottom: 14 }}>
<p style={{ margin: '0 0 4px', color: '#f5c518', fontWeight: 'bold', fontSize: 12 }}>FITS</p>
<p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{p.compatibility}</p>
</div>
)}
{p.description && (
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 12, padding: '12px 14px', border: '1px solid #1e3a5f', marginBottom: 14 }}>
<p style={{ margin: '0 0 4px', color: '#f5c518', fontWeight: 'bold', fontSize: 12 }}>DESCRIPTION</p>
<p style={{ margin: 0, color: '#aaa', fontSize: 13, lineHeight: 1.6 }}>{p.description}</p>
</div>
)}
<div style={{ backgroundColor: '#1a1400', border: '1px solid #f5c51866', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
<p style={{ margin: 0, color: '#f5c518', fontSize: 12 }}>📦 Ships only. WhatsApp us for shipping quote and timeline.</p>
</div>
<div style={{ backgroundColor: '#0a0f1e', border: '1px solid #1e3a5f', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>⚖️ Price includes 10% Bahamas VAT remitted to the government.</p>
</div>
<button onClick={() => whatsappInquiry(p, 'part')} style={{ ...primaryBtn, backgroundColor: '#25d366', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
💬 Order via WhatsApp — {BSC_WHATSAPP_DISPLAY}
</button>
</div>
</div>
</div>
);
}

// ── ADMIN VEHICLE FORM ──
if (showAdminForm && isAdmin) return (
<div style={pg}>
<div style={{ background: 'linear-gradient(135deg, #070e1d, #0d1f3c)', borderBottom: '1px solid #1e3a5f', padding: '14px 18px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 640, margin: '0 auto' }}>
<button onClick={() => { setShowAdminForm(false); setEditingVehicle(null); resetVehicleForm(); }} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 22, cursor: 'pointer', padding: 0 }}>←</button>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>{editingVehicle ? 'Edit Vehicle' : 'Add Vehicle Listing'}</p>
</div>
</div>
<div style={{ maxWidth: 640, margin: '0 auto', padding: '18px 18px' }}>
{error && <p style={{ color: '#f87171', backgroundColor: '#2d0000', padding: '10px 12px', borderRadius: 8, marginBottom: 12 }}>{error}</p>}

{/* INFO BANNER */}
<div style={{ backgroundColor: '#0a1220', border: '1px solid #60a5fa44', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
<p style={{ margin: '0 0 4px', color: '#60a5fa', fontWeight: 'bold', fontSize: 13 }}>💡 BSC Pricing Engine</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 12 }}>Enter your supplier cost. BSC markup and 10% VAT are calculated automatically.</p>
<p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 12 }}>Car Sale: +$650 · Car Rental: +$10/day · Both + 10% VAT</p>
</div>

<label style={lbl}>Listing Type</label>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
{['sale', 'rental'].map(t => (
<button key={t} onClick={() => setForm(f => ({ ...f, listing_type: t }))} style={{ padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 14, backgroundColor: form.listing_type === t ? '#f5c518' : '#0d1f3c', color: form.listing_type === t ? '#000' : '#6b7280' }}>
{t === 'sale' ? '🏷️ For Sale' : '🔑 For Rent'}
</button>
))}
</div>

<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
<div><label style={lbl}>Year</label><input type="number" placeholder="2020" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} style={{ ...inp, marginBottom: 0 }} /></div>
<div><label style={lbl}>Make</label><input placeholder="Toyota" value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} style={{ ...inp, marginBottom: 0 }} /></div>
<div><label style={lbl}>Model</label><input placeholder="Camry" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} style={{ ...inp, marginBottom: 0 }} /></div>
<div><label style={lbl}>Color</label><input placeholder="Silver" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ ...inp, marginBottom: 0 }} /></div>
<div><label style={lbl}>Mileage</label><input type="number" placeholder="45000" value={form.mileage} onChange={e => setForm(f => ({ ...f, mileage: e.target.value }))} style={{ ...inp, marginBottom: 0 }} /></div>
<div><label style={lbl}>VIN (optional)</label><input placeholder="VIN number" value={form.vin} onChange={e => setForm(f => ({ ...f, vin: e.target.value }))} style={{ ...inp, marginBottom: 0 }} /></div>
</div>

<label style={{ ...lbl, marginTop: 12 }}>Condition</label>
<select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))} style={inp}>
<option value="new">New</option>
<option value="used">Used — Excellent</option>
<option value="good">Used — Good</option>
<option value="fair">Used — Fair</option>
</select>

{form.listing_type === 'sale' ? (
<>
<div style={{ backgroundColor: '#060d1f', border: '2px solid #f5c518', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
<label style={{ ...lbl, color: '#f5c518' }}>Supplier Cost Price ($) — REQUIRED</label>
<input type="number" placeholder="e.g. 12000.00" value={form.supplier_cost} onChange={e => setForm(f => ({ ...f, supplier_cost: e.target.value }))} style={{ ...inp, fontSize: 20, fontWeight: 'bold', marginBottom: 0, border: '1px solid #f5c518' }} />
<p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 11 }}>What BSC paid the supplier. Customer price = cost + $650 markup + 10% VAT.</p>
</div>
<PricingPreview type="sale" />
<label style={lbl}>Security Deposit ($)</label>
<input type="number" placeholder="0.00" value={form.deposit} onChange={e => setForm(f => ({ ...f, deposit: e.target.value }))} style={inp} />
</>
) : (
<>
<div style={{ backgroundColor: '#060d1f', border: '2px solid #60a5fa', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
<label style={{ ...lbl, color: '#60a5fa' }}>Supplier Daily Rate ($) — REQUIRED</label>
<input type="number" placeholder="e.g. 50.00" value={form.supplier_daily_rate} onChange={e => setForm(f => ({ ...f, supplier_daily_rate: e.target.value }))} style={{ ...inp, fontSize: 20, fontWeight: 'bold', marginBottom: 0, border: '1px solid #60a5fa' }} />
<p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 11 }}>What BSC pays supplier per day. Customer price = supplier rate + $10 markup + 10% VAT.</p>
</div>
<label style={lbl}>Supplier Weekly Rate (optional — auto-calculates as daily × 7)</label>
<input type="number" placeholder="Leave blank to auto-calculate" value={form.supplier_weekly_rate} onChange={e => setForm(f => ({ ...f, supplier_weekly_rate: e.target.value }))} style={inp} />
<PricingPreview type="rental" />
<label style={lbl}>Security Deposit ($)</label>
<input type="number" placeholder="0.00" value={form.deposit} onChange={e => setForm(f => ({ ...f, deposit: e.target.value }))} style={inp} />
</>
)}

<label style={lbl}>Description</label>
<textarea placeholder="Describe the vehicle — features, history, extras..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} style={{ ...inp, resize: 'vertical' as const }} />

<label style={lbl}>Photos</label>
<div onClick={() => document.getElementById('vehiclePhotos')?.click()} style={{ width: '100%', minHeight: 100, borderRadius: 12, border: '2px dashed #1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 12, backgroundColor: '#060d1f', flexWrap: 'wrap' as const, gap: 8, padding: 12, boxSizing: 'border-box' as const }}>
{photoPreviews.length > 0
? photoPreviews.map((url, i) => <img key={i} src={url} alt="" style={{ width: 80, height: 60, borderRadius: 8, objectFit: 'cover' }} />)
: <p style={{ margin: 0, color: '#4a5568', fontSize: 13 }}>📷 Tap to add photos</p>}
</div>
<input id="vehiclePhotos" type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoSelect} />
{editingVehicle?.photos && editingVehicle.photos.length > 0 && (
<div style={{ marginBottom: 12 }}>
<p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 11 }}>EXISTING PHOTOS ({editingVehicle.photos.length})</p>
<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
{editingVehicle.photos.map((url, i) => <img key={i} src={url} alt="" style={{ width: 80, height: 60, borderRadius: 8, objectFit: 'cover' }} />)}
</div>
</div>
)}

<button onClick={handleSaveVehicle} disabled={saving} style={{ ...primaryBtn, backgroundColor: saving ? '#555' : '#f5c518', cursor: saving ? 'not-allowed' : 'pointer' }}>
{saving ? 'Saving...' : editingVehicle ? '✅ Update Listing' : '✅ Publish Listing'}
</button>
<button onClick={() => { setShowAdminForm(false); setEditingVehicle(null); resetVehicleForm(); }} style={ghostBtn}>Cancel</button>
</div>
</div>
);

// ── ADMIN PART FORM ──
if (showPartForm && isAdmin) return (
<div style={pg}>
<div style={{ background: 'linear-gradient(135deg, #070e1d, #0d1f3c)', borderBottom: '1px solid #1e3a5f', padding: '14px 18px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 640, margin: '0 auto' }}>
<button onClick={() => { setShowPartForm(false); setEditingPart(null); resetPartForm(); }} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 22, cursor: 'pointer', padding: 0 }}>←</button>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>{editingPart ? 'Edit Part' : 'Add Auto Part'}</p>
</div>
</div>
<div style={{ maxWidth: 640, margin: '0 auto', padding: '18px 18px' }}>
{error && <p style={{ color: '#f87171', backgroundColor: '#2d0000', padding: '10px 12px', borderRadius: 8, marginBottom: 12 }}>{error}</p>}

<div style={{ backgroundColor: '#0a1220', border: '1px solid #4ade8044', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
<p style={{ margin: '0 0 4px', color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>💡 Auto Parts Pricing Engine</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 12 }}>Enter supplier cost. Customer price = supplier cost + 10% BSC markup + 10% VAT.</p>
</div>

<label style={lbl}>Part Name</label>
<input placeholder="e.g. Alternator, Brake Pads" value={partForm.name} onChange={e => setPartForm(f => ({ ...f, name: e.target.value }))} style={inp} />

<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
<div><label style={lbl}>Brand</label><input placeholder="Toyota, OEM..." value={partForm.brand} onChange={e => setPartForm(f => ({ ...f, brand: e.target.value }))} style={{ ...inp, marginBottom: 0 }} /></div>
<div><label style={lbl}>Part Number</label><input placeholder="OEM/aftermarket #" value={partForm.part_number} onChange={e => setPartForm(f => ({ ...f, part_number: e.target.value }))} style={{ ...inp, marginBottom: 0 }} /></div>
<div><label style={lbl}>Stock Qty</label><input type="number" placeholder="1" value={partForm.stock} onChange={e => setPartForm(f => ({ ...f, stock: e.target.value }))} style={{ ...inp, marginBottom: 0 }} /></div>
</div>

<div style={{ backgroundColor: '#060d1f', border: '2px solid #4ade80', borderRadius: 12, padding: '12px 14px', marginBottom: 12, marginTop: 12 }}>
<label style={{ ...lbl, color: '#4ade80' }}>Supplier Cost Price ($) — REQUIRED</label>
<input type="number" placeholder="e.g. 85.00" value={partForm.supplier_cost} onChange={e => setPartForm(f => ({ ...f, supplier_cost: e.target.value }))} style={{ ...inp, fontSize: 20, fontWeight: 'bold', marginBottom: 0, border: '1px solid #4ade80' }} />
<p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 11 }}>What BSC paid the supplier. Customer pays: cost + 10% markup + 10% VAT.</p>
</div>

<PricingPreview type="part" />

<label style={lbl}>Condition</label>
<select value={partForm.condition} onChange={e => setPartForm(f => ({ ...f, condition: e.target.value }))} style={inp}>
<option value="new">New</option>
<option value="used">Used — Good</option>
<option value="refurbished">Refurbished</option>
</select>
<label style={lbl}>Compatibility / Fits</label>
<input placeholder="e.g. 2015-2020 Toyota Camry, Honda Civic" value={partForm.compatibility} onChange={e => setPartForm(f => ({ ...f, compatibility: e.target.value }))} style={inp} />
<label style={lbl}>Description</label>
<textarea placeholder="Additional details..." value={partForm.description} onChange={e => setPartForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' as const }} />
<label style={lbl}>Photos</label>
<div onClick={() => document.getElementById('partPhotos')?.click()} style={{ width: '100%', minHeight: 80, borderRadius: 12, border: '2px dashed #1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 12, backgroundColor: '#060d1f', flexWrap: 'wrap' as const, gap: 8, padding: 12, boxSizing: 'border-box' as const }}>
{photoPreviews.length > 0 ? photoPreviews.map((url, i) => <img key={i} src={url} alt="" style={{ width: 80, height: 60, borderRadius: 8, objectFit: 'cover' }} />) : <p style={{ margin: 0, color: '#4a5568', fontSize: 13 }}>📷 Tap to add photos</p>}
</div>
<input id="partPhotos" type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoSelect} />
<button onClick={handleSavePart} disabled={saving} style={{ ...primaryBtn, backgroundColor: saving ? '#555' : '#f5c518', cursor: saving ? 'not-allowed' : 'pointer' }}>
{saving ? 'Saving...' : editingPart ? '✅ Update Part' : '✅ Publish Part'}
</button>
<button onClick={() => { setShowPartForm(false); setEditingPart(null); resetPartForm(); }} style={ghostBtn}>Cancel</button>
</div>
</div>
);

// ── MAIN LIST VIEW ──
return (
<div style={pg}>
<div style={{ background: 'linear-gradient(135deg, #070e1d, #0d1f3c)', borderBottom: '1px solid #1e3a5f', padding: '14px 18px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
<div style={{ maxWidth: 640, margin: '0 auto' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
<div>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 18 }}>🚗 BSC Vehicles</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>Cars for sale · Rentals · Auto parts · All prices incl. 10% VAT</p>
</div>
{isControlAdmin && (
<button onClick={() => router.push('/')} style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', border: '1px solid #f5c518', borderRadius: 10, color: '#f5c518', fontWeight: 'bold', fontSize: 11, cursor: 'pointer', padding: '7px 14px' }}>
← BSC Control
</button>
)}
</div>
<div style={{ display: 'flex', gap: 8 }}>
{(['vehicles', 'parts'] as Tab[]).map(t => (
<button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 13, backgroundColor: tab === t ? '#f5c518' : '#0d1f3c', color: tab === t ? '#000' : '#6b7280' }}>
{t === 'vehicles' ? '🚗 Vehicles' : '🔧 Auto Parts'}
</button>
))}
</div>
</div>
</div>

<div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 18px' }}>
{success && <div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}><p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold' }}>{success}</p></div>}

{tab === 'vehicles' && (
<>
<div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
{(['all', 'sale', 'rental'] as ListingType[]).map(f => (
<button key={f} onClick={() => setListingFilter(f)} style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 12, backgroundColor: listingFilter === f ? '#f5c518' : '#0d1f3c', color: listingFilter === f ? '#000' : '#6b7280' }}>
{f === 'all' ? 'All' : f === 'sale' ? '🏷️ For Sale' : '🔑 For Rent'}
</button>
))}
</div>

{isAdmin && (
<button onClick={() => { resetVehicleForm(); setEditingVehicle(null); setShowAdminForm(true); }} style={{ ...primaryBtn, marginBottom: 16 }}>
+ Add Vehicle Listing
</button>
)}

{loading && <p style={{ color: '#4a5568', textAlign: 'center', padding: 30 }}>Loading...</p>}

{!loading && filteredVehicles.length === 0 && (
<div style={{ textAlign: 'center', padding: 50 }}>
<p style={{ fontSize: 56, marginBottom: 12 }}>🚗</p>
<p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 18, marginBottom: 6 }}>No Vehicles Listed Yet</p>
<p style={{ color: '#4a5568', fontSize: 13, marginBottom: 20 }}>Check back soon or WhatsApp us for available inventory.</p>
<a href={`https://api.whatsapp.com/send?phone=${BSC_WHATSAPP}&text=${encodeURIComponent("Hi BSC! I'm looking for a vehicle. Do you have anything available?")}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '12px 24px', borderRadius: 12, backgroundColor: '#25d366', color: '#fff', fontWeight: 'bold', textDecoration: 'none', fontSize: 14 }}>
💬 Ask on WhatsApp
</a>
</div>
)}

{filteredVehicles.map(v => {
const isRental = v.listing_type === 'rental';
const photos = Array.isArray(v.photos) ? v.photos : [];
return (
<div key={v.id} style={card}>
<div style={{ position: 'relative', height: 200, cursor: 'pointer' }} onClick={() => setSelectedVehicle(v)}>
{photos[0] ? (
<img src={photos[0]} alt={v.make} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
) : (
<div style={{ width: '100%', height: '100%', backgroundColor: '#0a1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
<p style={{ fontSize: 56 }}>🚗</p>
</div>
)}
<div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(6,13,31,0.9))' }} />
<div style={{ position: 'absolute', top: 12, left: 12 }}>
<span style={{ backgroundColor: isRental ? '#1e3a7f' : '#0a1f0a', color: isRental ? '#60a5fa' : '#4ade80', border: '1px solid ' + (isRental ? '#60a5fa' : '#4ade80'), borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 'bold' }}>
{isRental ? '🔑 For Rent' : '🏷️ For Sale'}
</span>
</div>
<div style={{ position: 'absolute', top: 12, right: 12 }}>
<span style={{ backgroundColor: 'rgba(167,139,250,0.2)', color: '#a78bfa', border: '1px solid #a78bfa66', borderRadius: 20, padding: '3px 8px', fontSize: 9, fontWeight: 'bold' }}>
VAT INCL.
</span>
</div>
<div style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
<p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{v.year} {v.make} {v.model}</p>
<p style={{ margin: '4px 0 0', color: isRental ? '#60a5fa' : '#4ade80', fontWeight: 'bold', fontSize: 18 }}>
{isRental
? `$${v.rental_rate_daily?.toFixed(2)}/day · $${v.rental_rate_weekly?.toFixed(2)}/wk`
: `$${v.price?.toLocaleString()}`}
</p>
</div>
{photos.length > 1 && (
<div style={{ position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, padding: '3px 8px' }}>
<p style={{ margin: 0, color: '#fff', fontSize: 10 }}>📷 {photos.length}</p>
</div>
)}
</div>
<div style={{ padding: '12px 14px' }}>
<div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' as const }}>
{[
v.color && { label: v.color, color: '#aaa' },
v.mileage && { label: v.mileage.toLocaleString() + ' mi', color: '#6b7280' },
v.condition && { label: v.condition.toUpperCase(), color: v.condition === 'new' ? '#4ade80' : '#f5c518' },
].filter(Boolean).map((tag: any, i) => (
<span key={i} style={{ backgroundColor: '#0a1220', color: tag.color, borderRadius: 20, padding: '3px 10px', fontSize: 11, border: '1px solid #1e3a5f' }}>{tag.label}</span>
))}
</div>
{isAdmin && v.supplier_cost > 0 && (
<div style={{ backgroundColor: '#0a1f0a', borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>
<p style={{ margin: 0, color: '#4ade80', fontSize: 11 }}>
💰 BSC Profit: {isRental ? `$10/day · $70/week` : `$650.00`} · Supplier cost: ${(isRental ? v.supplier_daily_rate : v.supplier_cost)?.toFixed(2)}
</p>
</div>
)}
<div style={{ display: 'flex', gap: 8 }}>
<button onClick={() => setSelectedVehicle(v)} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#0d1f3c', color: '#f5c518', border: '1px solid #f5c51866', fontWeight: 'bold', fontSize: 13, cursor: 'pointer' }}>View Details</button>
<button onClick={() => whatsappInquiry(v, 'vehicle')} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#25d366', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: 13, cursor: 'pointer' }}>💬 Inquire</button>
{isAdmin && <button onClick={() => handleDeleteVehicle(v.id)} style={{ padding: '10px 14px', borderRadius: 10, backgroundColor: '#2d0000', color: '#f87171', border: '1px solid #7f1d1d', cursor: 'pointer', fontSize: 13 }}>🗑</button>}
</div>
</div>
</div>
);
})}
</>
)}

{tab === 'parts' && (
<>
{isAdmin && (
<button onClick={() => { resetPartForm(); setEditingPart(null); setShowPartForm(true); }} style={{ ...primaryBtn, marginBottom: 16 }}>
+ Add Auto Part
</button>
)}
{parts.length === 0 && (
<div style={{ textAlign: 'center', padding: 50 }}>
<p style={{ fontSize: 56, marginBottom: 12 }}>🔧</p>
<p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 18, marginBottom: 6 }}>No Parts Listed Yet</p>
<p style={{ color: '#4a5568', fontSize: 13, marginBottom: 20 }}>WhatsApp us with what you need and we'll source it for you.</p>
<a href={`https://api.whatsapp.com/send?phone=${BSC_WHATSAPP}&text=${encodeURIComponent("Hi BSC! I'm looking for an auto part. Can you help?")}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '12px 24px', borderRadius: 12, backgroundColor: '#25d366', color: '#fff', fontWeight: 'bold', textDecoration: 'none', fontSize: 14 }}>
💬 Request a Part
</a>
</div>
)}
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
{parts.map(p => {
const photos = Array.isArray(p.photos) ? p.photos : [];
return (
<div key={p.id} style={{ ...card, marginBottom: 0, cursor: 'pointer' }} onClick={() => setSelectedPart(p)}>
<div style={{ height: 120, overflow: 'hidden', position: 'relative' }}>
{photos[0] ? (
<img src={photos[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
) : (
<div style={{ width: '100%', height: '100%', backgroundColor: '#0a1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
<p style={{ fontSize: 36 }}>🔧</p>
</div>
)}
<div style={{ position: 'absolute', top: 6, left: 6, backgroundColor: p.condition === 'new' ? '#0a1f0a' : '#1a1400', border: '1px solid ' + (p.condition === 'new' ? '#4ade80' : '#f5c518'), borderRadius: 20, padding: '2px 8px' }}>
<p style={{ margin: 0, color: p.condition === 'new' ? '#4ade80' : '#f5c518', fontSize: 9, fontWeight: 'bold' }}>{(p.condition || 'new').toUpperCase()}</p>
</div>
<div style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(167,139,250,0.2)', borderRadius: 6, padding: '2px 6px' }}>
<p style={{ margin: 0, color: '#a78bfa', fontSize: 8, fontWeight: 'bold' }}>VAT INCL.</p>
</div>
</div>
<div style={{ padding: '10px 12px' }}>
<p style={{ margin: '0 0 2px', fontWeight: 'bold', fontSize: 13, lineHeight: 1.3 }}>{p.name}</p>
{p.brand && <p style={{ margin: '0 0 4px', color: '#6b7280', fontSize: 11 }}>{p.brand}{p.part_number && ' · #' + p.part_number}</p>}
<p style={{ margin: '0 0 4px', color: '#4ade80', fontWeight: 'bold', fontSize: 16 }}>${p.price?.toFixed(2)}</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>📦 Ships only · {p.stock} in stock</p>
{isAdmin && p.supplier_cost > 0 && (
<p style={{ margin: '4px 0 0', color: '#4ade80', fontSize: 10 }}>💰 Profit: ${p.bsc_markup?.toFixed(2)}</p>
)}
{isAdmin && (
<button onClick={(e) => { e.stopPropagation(); handleDeletePart(p.id); }} style={{ marginTop: 8, width: '100%', padding: '6px', borderRadius: 8, backgroundColor: '#2d0000', color: '#f87171', border: '1px solid #7f1d1d', cursor: 'pointer', fontSize: 11 }}>
🗑 Remove
</button>
)}
</div>
</div>
);
})}
</div>
</>
)}

{/* VAT NOTICE */}
<div style={{ marginTop: 20, backgroundColor: '#0a0f1e', border: '1px solid #1e3a5f', borderRadius: 12, padding: '12px 14px' }}>
<p style={{ margin: '0 0 4px', color: '#a78bfa', fontWeight: 'bold', fontSize: 12 }}>⚖️ VAT Notice</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11, lineHeight: 1.6 }}>All vehicle and auto parts prices include 10% Bahamas Value Added Tax (VAT) remitted to the Bahamas Government. Car sales include a flat $650 BSC service fee. Rental rates include a $10/day BSC management fee. Auto parts include a 10% BSC markup.</p>
</div>

{/* WHATSAPP CTA */}
<div style={{ marginTop: 14, background: 'linear-gradient(135deg, #001a0a, #002a14)', border: '1px solid #4ade8066', borderRadius: 16, padding: '18px 20px' }}>
<p style={{ margin: '0 0 4px', color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>💬 Don't see what you need?</p>
<p style={{ margin: '0 0 14px', color: '#4a5568', fontSize: 13 }}>WhatsApp us and we'll source it for you.</p>
<a href={`https://api.whatsapp.com/send?phone=${BSC_WHATSAPP}`} target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: '12px', borderRadius: 12, backgroundColor: '#25d366', color: '#fff', fontWeight: 'bold', fontSize: 14, textAlign: 'center', textDecoration: 'none' }}>
💬 WhatsApp BSC — {BSC_WHATSAPP_DISPLAY}
</a>
</div>

<div style={{ marginTop: 20, padding: '14px 0', borderTop: '1px solid #1e3a5f', textAlign: 'center' as const }}>
<p style={{ margin: 0, color: '#2a3a5a', fontSize: 10 }}>© 2025 BSC Marketplace — Bahamian Seafood Connection</p>
<p style={{ margin: '2px 0 0', color: '#2a3a5a', fontSize: 10 }}>Owned by Dedrick Storr Snr & Family · All Rights Reserved</p>
</div>
</div>
</div>
);
}
