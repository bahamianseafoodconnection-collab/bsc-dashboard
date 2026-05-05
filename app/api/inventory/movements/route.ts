// app/api/inventory/movements/route.ts
// BSC Day 6 — record an inventory movement (receive shipment OR adjustment)
// Schema-matched to Day 5: inventory_movements uses product_id (uuid),
// to_location_id (uuid), quantity (numeric), unit (text), source_supplier_id,
// recorded_by, occurred_at, device_info, ip_address.
// Movement number formatting (IN-2026-XXXXXX) handled by the Day 5 trigger.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

interface CookieToSet {
name: string;
value: string;
options?: CookieOptions;
}

interface MovementBody {
movement_type: 'receive' | 'adjustment';
barcode: string;
product_id: string | null;
sku: string;
name: string;
to_location_id: string;
quantity: number;
unit: string;
notes: string;
create_if_new: boolean;
}

function autoSku(barcode: string): string {
return `PENDING-${barcode}`.slice(0, 50);
}

export async function POST(req: NextRequest) {
let body: MovementBody;
try {
body = (await req.json()) as MovementBody;
} catch {
return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
}

const {
movement_type,
barcode,
sku,
name,
to_location_id,
quantity,
unit,
notes,
create_if_new,
} = body;
let { product_id } = body;

if (!movement_type || !barcode || !to_location_id || !quantity) {
return NextResponse.json(
{ error: 'Missing required fields: movement_type, barcode, to_location_id, quantity' },
{ status: 400 }
);
}

// Auth
const cookieStore = await cookies();
const supa = createServerClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
{
cookies: {
getAll: () => cookieStore.getAll(),
setAll: (toSet: CookieToSet[]) =>
toSet.forEach(({ name: n, value, options }) =>
cookieStore.set(n, value, options)
),
},
}
);

const { data: auth } = await supa.auth.getUser();
if (!auth?.user) {
return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
}
const user_id = auth.user.id;

// Resolve product_id
let productSupplierId: string | null = null;
let createdNew = false;

if (!product_id) {
const { data: existing } = await supa
.from('products')
.select('id, primary_supplier_id')
.eq('barcode', barcode)
.maybeSingle();

if (existing) {
product_id = existing.id;
productSupplierId = existing.primary_supplier_id ?? null;
} else if (create_if_new && name) {
const newSku = (sku || autoSku(barcode)).trim();
const { data: inserted, error: insErr } = await supa
.from('products')
.insert({
sku: newSku,
barcode,
name,
status: 'pending_approval',
requires_yield_calc: false,
created_by: user_id,
})
.select('id, primary_supplier_id')
.single();
if (insErr || !inserted) {
return NextResponse.json(
{ error: `Product create failed: ${insErr?.message ?? 'unknown'}` },
{ status: 500 }
);
}
product_id = inserted.id;
productSupplierId = inserted.primary_supplier_id ?? null;
createdNew = true;
} else {
return NextResponse.json(
{ error: 'Product not in DB and not allowed to create' },
{ status: 400 }
);
}
} else {
// Pull supplier from existing product
const { data: existing } = await supa
.from('products')
.select('primary_supplier_id')
.eq('id', product_id)
.maybeSingle();
productSupplierId = existing?.primary_supplier_id ?? null;
}

// Audit fields
const userAgent = req.headers.get('user-agent') ?? null;
const fwd = req.headers.get('x-forwarded-for') ?? '';
const ip = (fwd.split(',')[0] || req.headers.get('x-real-ip') || '').trim() || null;

// Insert the movement.
// movement_number / formatted IN-2026-XXXXXX populated by Day 5 trigger.
const nowIso = new Date().toISOString();
const { data: mv, error: mvErr } = await supa
.from('inventory_movements')
.insert({
movement_type,
product_id,
to_location_id,
quantity: Number(quantity) || 0,
unit: unit || 'lb',
source_supplier_id: productSupplierId,
notes: notes || null,
occurred_at: nowIso,
recorded_by: user_id,
device_info: userAgent,
ip_address: ip,
})
.select('*')
.single();

if (mvErr) {
return NextResponse.json(
{ error: `Movement save failed: ${mvErr.message}` },
{ status: 500 }
);
}

return NextResponse.json({
success: true,
movement: mv,
created_new_product: createdNew,
});
}
