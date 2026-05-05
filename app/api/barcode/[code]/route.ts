// app/api/barcode/[code]/route.ts
// BSC Day 6 — barcode lookup
// Order: (1) Auth check (2) BSC products.barcode lookup (3) Open Food Facts fallback
// Schema-matched to Day 5: products.barcode (text), unit_of_measure, primary_supplier_id

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
params: Promise<{ code: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
const { code } = await params;
const barcode = (code || '').trim();

if (!barcode) {
return NextResponse.json({ error: 'Missing barcode' }, { status: 400 });
}

const cookieStore = await cookies();
const supa = createServerClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
{
cookies: {
getAll: () => cookieStore.getAll(),
setAll: (toSet) =>
toSet.forEach(({ name, value, options }) =>
cookieStore.set(name, value, options)
),
},
}
);

const { data: auth } = await supa.auth.getUser();
if (!auth?.user) {
return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
}

// 1. Look in BSC products by barcode
const { data: existing, error: dbErr } = await supa
.from('products')
.select(
'id, sku, barcode, name, description, image_url, status, requires_yield_calc, category, unit_of_measure, pack_size, primary_supplier_id'
)
.eq('barcode', barcode)
.maybeSingle();

if (dbErr) console.error('Products lookup error:', dbErr);

if (existing) {
return NextResponse.json({
id: existing.id,
sku: existing.sku,
barcode: existing.barcode,
name: existing.name,
description: existing.description,
image_url: existing.image_url,
status: existing.status,
requires_yield_calc: existing.requires_yield_calc ?? false,
category: existing.category,
unit_of_measure: existing.unit_of_measure,
pack_size: existing.pack_size,
primary_supplier_id: existing.primary_supplier_id,
exists_in_db: true,
});
}

// 2. Fall back to Open Food Facts (free public API, no key)
try {
const off = await fetch(
`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
{
headers: { 'User-Agent': 'BSC-Marketplace/1.0 (bscbahamas.com)' },
next: { revalidate: 3600 },
}
);

if (off.ok) {
const offData: any = await off.json();
if (offData?.status === 1 && offData.product) {
const p = offData.product;
return NextResponse.json({
id: null,
sku: '',
barcode,
name: p.product_name || p.product_name_en || '',
description: p.generic_name || p.categories || (p.brands ? `Brand: ${p.brands}` : ''),
image_url: p.image_front_url || p.image_url || null,
status: null,
requires_yield_calc: false,
category: null,
unit_of_measure: p.quantity || null,
pack_size: null,
primary_supplier_id: null,
exists_in_db: false,
});
}
}
} catch (e) {
console.error('OFF lookup failed', e);
}

// 3. Unknown — return shell so staff can fill it in manually
return NextResponse.json({
id: null,
sku: '',
barcode,
name: '',
description: '',
image_url: null,
status: null,
requires_yield_calc: false,
category: null,
unit_of_measure: null,
pack_size: null,
primary_supplier_id: null,
exists_in_db: false,
});
}
