'use client'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { plainError } from '@/lib/plain-error'

let _supabase: ReturnType<typeof createBrowserClient> | null = null
function getSupabase() {
if (!_supabase) {
_supabase = createBrowserClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
}
return _supabase
}

interface Captain {
id: string
full_name: string
boat_name: string | null
boat_registration: string | null
registration_expiry: string | null
location: string | null
}

interface Bag {
id: string
weight: string
}

const PRODUCT_TYPES = [
{ value: 'whole_conch', label: '🐚 Whole Conch' },
{ value: 'whole_lobster', label: '🦞 Whole Lobster' },
{ value: 'lane_snapper', label: '🐟 Lane Snapper' },
{ value: 'whole_grouper', label: '🐠 Whole Grouper' },
{ value: 'mutton_snapper', label: '🐡 Mutton Snapper' },
{ value: 'hog_fish', label: '🐟 Hog Fish' },
{ value: 'other', label: '📦 Other' },
]

const ISLAND_SOURCES = [
'Nassau Market',
'Sandy Port, Abaco',
'Andros',
'Moores Island',
'Long Island',
'Exuma',
'Eleuthera',
'Other',
]

const FOUNDER_ID = '7b62672c-9259-4c1b-98d4-3b78369a52ab'

function generateLotNumber(boatName: string, index: number): string {
const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const initials = boatName
.split(' ')
.map(w => w[0])
.join('')
.toUpperCase()
.slice(0, 3)
return `${initials}-${date}-${String(index).padStart(2, '0')}`
}

export default function IntakePage() {
const supabase = getSupabase()

const [step, setStep] = useState(1)
const [captains, setCaptains] = useState<Captain[]>([])
const [loading, setLoading] = useState(true)
const [submitting, setSubmitting] = useState(false)
const [submitted, setSubmitted] = useState(false)
const [submittedRef, setSubmittedRef] = useState('')

// Step 1 — Captain
const [selectedCaptainId, setSelectedCaptainId] = useState('')
const [addingCaptain, setAddingCaptain] = useState(false)
const [newCaptain, setNewCaptain] = useState({
full_name: '', boat_name: '', boat_registration: '',
registration_expiry: '', location: '', phone: '',
})

// Step 2 — Product
const [productType, setProductType] = useState('')
const [islandSource, setIslandSource] = useState('')
const [costPerLb, setCostPerLb] = useState('')

// Step 3 — Bags
const [bags, setBags] = useState<Bag[]>([{ id: '1', weight: '' }])

const loadCaptains = useCallback(async () => {
setLoading(true)
const { data } = await supabase
.from('captains')
.select('id, full_name, boat_name, boat_registration, registration_expiry, location')
.eq('is_active', true)
.order('full_name')
if (data) setCaptains(data)
setLoading(false)
}, [supabase])

useEffect(() => { loadCaptains() }, [loadCaptains])

const selectedCaptain = captains.find(c => c.id === selectedCaptainId)
const isExpired = selectedCaptain?.registration_expiry
? new Date(selectedCaptain.registration_expiry) < new Date()
: false

const totalWeight = bags.reduce((sum, b) => sum + (parseFloat(b.weight) || 0), 0)
const totalCost = totalWeight * (parseFloat(costPerLb) || 0)
const validBags = bags.filter(b => parseFloat(b.weight) > 0)

function addBag() {
setBags(prev => [...prev, { id: Date.now().toString(), weight: '' }])
}

function removeBag(id: string) {
setBags(prev => prev.filter(b => b.id !== id))
}

function updateBag(id: string, weight: string) {
setBags(prev => prev.map(b => b.id === id ? { ...b, weight } : b))
}

async function saveCaptainAndProceed() {
if (!newCaptain.full_name || !newCaptain.boat_name) {
alert('Captain name and boat name are required')
return
}
const { data, error } = await supabase.from('captains').insert({
full_name: newCaptain.full_name,
boat_name: newCaptain.boat_name,
boat_registration: newCaptain.boat_registration || null,
registration_expiry: newCaptain.registration_expiry || null,
location: newCaptain.location || null,
phone: newCaptain.phone || null,
is_active: true,
created_by: FOUNDER_ID,
}).select('id, full_name, boat_name, boat_registration, registration_expiry, location').single()

if (error) { alert('Failed to save captain: ' + plainError(error)); return }
if (data) {
setCaptains(prev => [...prev, data])
setSelectedCaptainId(data.id)
setAddingCaptain(false)
setStep(2)
}
}

async function handleSubmit() {
if (!selectedCaptain || !productType || validBags.length === 0 || !costPerLb) return
setSubmitting(true)

try {
// Create supplier record if not exists
const { data: supplierData } = await supabase
.from('suppliers')
.select('id')
.eq('code', 'CAP-' + selectedCaptain.id.slice(0, 8).toUpperCase())
.maybeSingle()

let supplierId = supplierData?.id

if (!supplierId) {
const { data: newSup } = await supabase.from('suppliers').insert({
code: 'CAP-' + selectedCaptain.id.slice(0, 8).toUpperCase(),
name: selectedCaptain.full_name,
supplier_type: 'bsc_direct',
contact_phone: null,
payment_terms: 'COD',
default_currency: 'BSD',
is_active: true,
notes: `Boat: ${selectedCaptain.boat_name} | Reg: ${selectedCaptain.boat_registration ?? 'N/A'}`,
created_by: FOUNDER_ID,
}).select('id').single()
supplierId = newSup?.id
}

// Create purchase order
const invoiceNum = `INTAKE-${selectedCaptain.boat_registration?.replace(/\s/g, '') ?? 'BOAT'}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
const { data: poData, error: poErr } = await supabase
.from('purchase_orders')
.insert({
supplier_id: supplierId,
supplier_name: selectedCaptain.full_name,
invoice_number: invoiceNum,
invoice_date: new Date().toISOString().split('T')[0],
total: totalCost,
total_amount: totalCost,
subtotal: totalCost,
currency: 'BSD',
payment_status: 'unpaid',
location: 'spiny_tail_nassau',
status: 'received',
notes: `Boat intake — ${selectedCaptain.boat_name} | ${validBags.length} bags / ${totalWeight.toFixed(1)} lbs ${productType.replace(/_/g, ' ')} @ $${costPerLb}/lb | ${islandSource}`,
created_by: FOUNDER_ID,
})
.select('id')
.single()

if (poErr) throw poErr

// Create yield_lots for each bag
const yieldLotInserts = validBags.map((bag, i) => ({
lot_number: generateLotNumber(selectedCaptain.boat_name ?? 'BOAT', i + 1),
captain_name: selectedCaptain.full_name,
boat_reg: selectedCaptain.boat_registration ?? 'UNKNOWN',
product_type: productType,
whole_weight_lb: parseFloat(bag.weight),
clean_weight_lb: 0,
yield_pct: 0,
cost_paid: parseFloat(bag.weight) * parseFloat(costPerLb),
true_cost_per_lb: 0,
nassau_price: 0,
andros_price: 0,
online_price: 0,
wholesale_price: 0,
processed_by: 'pending',
intake_notes: `Bag ${i + 1} of ${validBags.length} — ${selectedCaptain.boat_name} | ${islandSource}`,
received_date: new Date().toISOString().split('T')[0],
source_type: 'boat',
island_source: islandSource,
purchase_order_id: poData.id,
status: 'pending_yield',
}))

const { error: lotsErr } = await supabase
.from('yield_lots')
.insert(yieldLotInserts)

if (lotsErr) throw lotsErr

setSubmittedRef(invoiceNum)
setSubmitted(true)
} catch (err: any) {
alert('Intake failed: ' + plainError(err))
} finally {
setSubmitting(false)
}
}

function resetForm() {
setStep(1)
setSelectedCaptainId('')
setProductType('')
setIslandSource('')
setCostPerLb('')
setBags([{ id: '1', weight: '' }])
setSubmitted(false)
setSubmittedRef('')
}

// ── Success screen ──
if (submitted) {
return (
<div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6"
style={{ fontFamily: "'DM Sans', sans-serif" }}>
<div className="text-center">
<div className="text-6xl mb-4">✅</div>
<h2 className="text-2xl font-bold mb-2" style={{ color: '#f5c518', fontFamily: "'Playfair Display', serif" }}>
Intake Recorded
</h2>
<p className="text-gray-400 text-sm mb-1">Ref: {submittedRef}</p>
<p className="text-gray-400 text-sm mb-2">
{validBags.length} bags · {totalWeight.toFixed(1)} lbs · ${totalCost.toFixed(2)}
</p>
<p className="text-xs text-gray-500 mb-8">
Yield lots created — pending Spiny Tail processing
</p>
<button onClick={resetForm}
className="w-full py-4 rounded-2xl font-bold text-base"
style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
Record Another Intake
</button>
</div>
</div>
)
}

return (
<div className="min-h-screen bg-gray-950 text-white flex flex-col"
style={{ fontFamily: "'DM Sans', sans-serif" }}>

{/* Header */}
<header className="sticky top-0 z-40 bg-gray-900 border-b border-gray-800 px-4 py-3">
<h1 className="font-bold text-lg" style={{ color: '#f5c518', fontFamily: "'Playfair Display', serif" }}>
🚢 Boat Intake
</h1>
<p className="text-xs text-gray-400">Spiny Tail Processing Plant · Nassau</p>

{/* Step indicator */}
<div className="flex gap-2 mt-3">
{['Captain', 'Product', 'Bags', 'Review'].map((label, i) => (
<div key={label} className="flex items-center gap-1">
<div className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center"
style={{
backgroundColor: step > i + 1 ? '#16a34a' : step === i + 1 ? '#f5c518' : '#1f2937',
color: step >= i + 1 ? '#060d1f' : '#9ca3af'
}}>
{step > i + 1 ? '✓' : i + 1}
</div>
<span className="text-xs hidden sm:block"
style={{ color: step === i + 1 ? '#f5c518' : '#6b7280' }}>
{label}
</span>
{i < 3 && <div className="w-4 h-px bg-gray-700" />}
</div>
))}
</div>
</header>

<main className="flex-1 p-4">

{/* ── STEP 1: Captain ── */}
{step === 1 && (
<div className="space-y-4">
<h2 className="font-bold text-base" style={{ fontFamily: "'Playfair Display', serif" }}>
Select Captain
</h2>

{loading ? (
<p className="text-gray-400 text-sm animate-pulse">Loading captains...</p>
) : (
<div className="space-y-2">
{captains.map(captain => {
const expired = captain.registration_expiry
? new Date(captain.registration_expiry) < new Date()
: false
const selected = selectedCaptainId === captain.id
return (
<button key={captain.id}
onClick={() => setSelectedCaptainId(captain.id)}
className="w-full text-left rounded-xl p-4 border transition-colors"
style={{ borderColor: selected ? '#f5c518' : '#374151', backgroundColor: selected ? '#1a1500' : '#111827' }}>
<div className="flex items-start justify-between">
<div>
<p className="font-semibold text-sm">{captain.full_name}</p>
<p className="text-xs text-gray-400 mt-0.5">
{captain.boat_name ?? 'No boat name'} · {captain.boat_registration ?? 'No reg'}
</p>
{captain.location && (
<p className="text-xs text-gray-500">{captain.location}</p>
)}
</div>
<div className="shrink-0 ml-2">
{expired && (
<span className="text-xs px-2 py-0.5 rounded-full bg-red-900 text-red-300">
⚠️ Reg Expired
</span>
)}
{selected && (
<span className="text-xs font-bold ml-1" style={{ color: '#f5c518' }}>✓</span>
)}
</div>
</div>
</button>
)
})}
</div>
)}

{/* Add new captain */}
{!addingCaptain ? (
<button onClick={() => setAddingCaptain(true)}
className="w-full py-3 rounded-xl border border-dashed border-gray-600 text-gray-400 text-sm font-medium">
+ Add New Captain
</button>
) : (
<div className="bg-gray-900 rounded-xl p-4 border border-gray-700 space-y-3">
<h3 className="font-bold text-sm" style={{ color: '#f5c518' }}>New Captain</h3>
{[
{ key: 'full_name', label: 'Full Name *', placeholder: 'e.g. John Smith' },
{ key: 'boat_name', label: 'Boat Name *', placeholder: 'e.g. Lady Paige' },
{ key: 'boat_registration', label: 'Boat Registration', placeholder: 'e.g. AB 031398 SP' },
{ key: 'registration_expiry', label: 'Reg Expiry Date', placeholder: '' },
{ key: 'location', label: 'Home Port', placeholder: 'e.g. Sandy Port, Abaco' },
{ key: 'phone', label: 'Phone', placeholder: 'e.g. 242-555-0100' },
].map(field => (
<div key={field.key}>
<label className="block text-xs text-gray-400 mb-1">{field.label}</label>
<input
type={field.key === 'registration_expiry' ? 'date' : 'text'}
placeholder={field.placeholder}
value={(newCaptain as any)[field.key]}
onChange={e => setNewCaptain(prev => ({ ...prev, [field.key]: e.target.value }))}
className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400"
/>
</div>
))}
<div className="flex gap-3 pt-1">
<button onClick={() => setAddingCaptain(false)}
className="flex-1 bg-gray-800 text-gray-300 rounded-xl py-2.5 text-sm">
Cancel
</button>
<button onClick={saveCaptainAndProceed}
className="flex-1 rounded-xl py-2.5 text-sm font-bold"
style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
Save & Continue
</button>
</div>
</div>
)}

{selectedCaptainId && !addingCaptain && (
<div>
{isExpired && (
<div className="mb-3 p-3 rounded-xl bg-red-900/30 border border-red-700 text-xs text-red-300">
⚠️ Boat registration is expired. Flag for renewal before next delivery.
</div>
)}
<button onClick={() => setStep(2)}
className="w-full py-4 rounded-2xl font-bold text-base"
style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
Continue →
</button>
</div>
)}
</div>
)}

{/* ── STEP 2: Product ── */}
{step === 2 && (
<div className="space-y-5">
<h2 className="font-bold text-base" style={{ fontFamily: "'Playfair Display', serif" }}>
Product Details
</h2>

<div>
<label className="block text-xs text-gray-400 mb-2 uppercase tracking-wide">Product Type</label>
<div className="grid grid-cols-2 gap-2">
{PRODUCT_TYPES.map(pt => (
<button key={pt.value} onClick={() => setProductType(pt.value)}
className="py-3 px-3 rounded-xl text-sm font-medium text-left transition-colors"
style={productType === pt.value
? { backgroundColor: '#f5c518', color: '#060d1f', fontWeight: 700 }
: { backgroundColor: '#1f2937', color: '#d1d5db' }}>
{pt.label}
</button>
))}
</div>
</div>

<div>
<label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Island Source</label>
<select value={islandSource} onChange={e => setIslandSource(e.target.value)}
className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400">
<option value="">Select source...</option>
{ISLAND_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
</select>
</div>

<div>
<label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Cost Per Pound (BSD)</label>
<input type="number" step="0.01" min="0" placeholder="e.g. 5.50"
value={costPerLb}
onChange={e => setCostPerLb(e.target.value)}
className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400"
/>
</div>

<div className="flex gap-3">
<button onClick={() => setStep(1)}
className="flex-1 bg-gray-800 text-gray-300 rounded-xl py-3 text-sm font-medium">
Back
</button>
<button
onClick={() => setStep(3)}
disabled={!productType || !islandSource || !costPerLb}
className="flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-40"
style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
Continue →
</button>
</div>
</div>
)}

{/* ── STEP 3: Bags ── */}
{step === 3 && (
<div className="space-y-4">
<div className="flex items-center justify-between">
<h2 className="font-bold text-base" style={{ fontFamily: "'Playfair Display', serif" }}>
Enter Bag Weights
</h2>
<span className="text-xs text-gray-400">{bags.length} bag{bags.length !== 1 ? 's' : ''}</span>
</div>

<div className="space-y-2">
{bags.map((bag, i) => (
<div key={bag.id} className="flex items-center gap-2">
<span className="text-xs text-gray-500 w-6 text-right shrink-0">{i + 1}</span>
<input
type="number" step="0.1" min="0"
placeholder="lbs e.g. 244.0"
value={bag.weight}
onChange={e => updateBag(bag.id, e.target.value)}
className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400"
autoFocus={i === bags.length - 1}
/>
<span className="text-xs text-gray-500 shrink-0">lbs</span>
{bags.length > 1 && (
<button onClick={() => removeBag(bag.id)}
className="text-red-400 text-xl leading-none w-8 h-8 flex items-center justify-center shrink-0">
×
</button>
)}
</div>
))}
</div>

<button onClick={addBag}
className="w-full py-3 rounded-xl border border-dashed border-gray-600 text-gray-400 text-sm font-medium">
+ Add Bag
</button>

{totalWeight > 0 && (
<div className="rounded-xl p-3" style={{ backgroundColor: '#0d1117', border: '1px solid #374151' }}>
<div className="flex justify-between text-sm text-gray-400 mb-1">
<span>Total weight</span><span>{totalWeight.toFixed(1)} lbs</span>
</div>
<div className="flex justify-between text-sm text-gray-400 mb-1">
<span>Cost/lb</span><span>${parseFloat(costPerLb).toFixed(2)}</span>
</div>
<div className="flex justify-between font-bold text-base">
<span>Total cost</span>
<span style={{ color: '#f5c518' }}>${totalCost.toFixed(2)}</span>
</div>
</div>
)}

<div className="flex gap-3">
<button onClick={() => setStep(2)}
className="flex-1 bg-gray-800 text-gray-300 rounded-xl py-3 text-sm font-medium">
Back
</button>
<button
onClick={() => setStep(4)}
disabled={validBags.length === 0}
className="flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-40"
style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
Review →
</button>
</div>
</div>
)}

{/* ── STEP 4: Review ── */}
{step === 4 && (
<div className="space-y-4">
<h2 className="font-bold text-base" style={{ fontFamily: "'Playfair Display', serif" }}>
Review & Submit
</h2>

<div className="bg-gray-900 rounded-xl p-4 border border-gray-700 space-y-3">
<div className="flex justify-between text-sm">
<span className="text-gray-400">Captain</span>
<span className="font-semibold">{selectedCaptain?.full_name}</span>
</div>
<div className="flex justify-between text-sm">
<span className="text-gray-400">Boat</span>
<span>{selectedCaptain?.boat_name} · {selectedCaptain?.boat_registration}</span>
</div>
<div className="flex justify-between text-sm">
<span className="text-gray-400">Product</span>
<span>{PRODUCT_TYPES.find(p => p.value === productType)?.label}</span>
</div>
<div className="flex justify-between text-sm">
<span className="text-gray-400">Source</span>
<span>{islandSource}</span>
</div>
<div className="flex justify-between text-sm">
<span className="text-gray-400">Cost/lb</span>
<span>${parseFloat(costPerLb).toFixed(2)}</span>
</div>
<div className="border-t border-gray-700 pt-3">
<div className="flex justify-between text-sm text-gray-400 mb-1">
<span>Bags</span><span>{validBags.length}</span>
</div>
<div className="flex justify-between text-sm text-gray-400 mb-1">
<span>Total weight</span><span>{totalWeight.toFixed(1)} lbs</span>
</div>
<div className="flex justify-between font-bold text-lg">
<span>Total cost</span>
<span style={{ color: '#f5c518' }}>${totalCost.toFixed(2)}</span>
</div>
</div>
</div>

<div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
<p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Bag Breakdown</p>
<div className="space-y-1">
{validBags.map((bag, i) => (
<div key={bag.id} className="flex justify-between text-sm">
<span className="text-gray-400">Bag {i + 1}</span>
<span>{parseFloat(bag.weight).toFixed(1)} lbs · ${(parseFloat(bag.weight) * parseFloat(costPerLb)).toFixed(2)}</span>
</div>
))}
</div>
</div>

{isExpired && (
<div className="p-3 rounded-xl bg-red-900/30 border border-red-700 text-xs text-red-300">
⚠️ Boat registration expired — flagged in system
</div>
)}

<p className="text-xs text-gray-500 text-center">
This creates {validBags.length} yield lot{validBags.length !== 1 ? 's' : ''} pending Spiny Tail processing
</p>

<div className="flex gap-3">
<button onClick={() => setStep(3)}
disabled={submitting}
className="flex-1 bg-gray-800 text-gray-300 rounded-xl py-3 text-sm font-medium">
Back
</button>
<button onClick={handleSubmit} disabled={submitting}
className="flex-1 rounded-xl py-4 text-sm font-bold disabled:opacity-50"
style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
{submitting ? 'Saving...' : '✓ Submit Intake'}
</button>
</div>
</div>
)}
</main>
</div>
)
}
