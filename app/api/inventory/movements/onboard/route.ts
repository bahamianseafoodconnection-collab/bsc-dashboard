import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CookieToSet {
name: string;
value: string;
options?: CookieOptions;
}

const ROLES_GO_LIVE = ['founder', 'co_founder', 'manager'];
const ROLES_PENDING = ['cashier', 'right_hand', 'supervisor', 'processor', 'andros_staff', 'supplier'];

export async function POST(req: Request) {
try {
const cookieStore = await cookies();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
return NextResponse.json({ error: 'Server not configured.' }, { status: 500 });
}

const ssr = createServerClient(url, anon, {
cookies: {
getAll: () => cookieStore.getAll(),
setAll: (toSet: CookieToSet[]) =>
toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
},
});

const { data: { user } } = await ssr.auth.getUser();
if (!user) {
return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

const admin = createClient(url, service, {
auth: { autoRefreshToken: false, persistSession: false },
});

const { data: userRow } = await admin
.from('users')
.select('role, is_active')
.eq('id', user.id)
.single();

if (!userRow || !userRow.is_active) {
return NextResponse.json({ error: 'Account inactive' }, { status: 403 });
}

const goLive = ROLES_GO_LIVE.includes(userRow.role);
const isPending = ROLES_PENDING.includes(userRow.role);
if (!goLive && !isPending) {
return NextResponse.json({ error: 'Your role cannot onboard products' }, { status: 403 });
}

const body = await req.json();
const {
barcode,
sku,
name,
category,
unit_of_measure,
pack_size,
description,
image_url,
cost_per_unit,
pricing,
supplier_id,
is_bsc_processed,
} = body;

if (!name || !category || !unit_of_measure) {
return NextResponse.json({ error: 'name, category, and unit_of_measure required' }, { status: 400 });
}

let resolvedSupplierId = supplier_id || null;
if (userRow.role === 'supplier') {
const { data: supRow } = await admin
.from('suppliers')
.select('id')
.eq('portal_user_id', user.id)
.single();
if (!supRow) {
return NextResponse.json({ error: 'Supplier record not found' }, { status: 403 });
}
resolvedSupplierId = supRow.id;
}

const targetStatus = goLive ? 'active' : 'pending_approval';

const finalSku = (sku || `BSC-${Date.now().toString().slice(-8)}`).trim();

const { data: created, error: prodErr } = await admin
.from('products')
.insert({
sku: finalSku,
barcode: barcode || null,
name,
description: description || null,
category,
unit_of_measure,
pack_size: pack_size || null,
image_url: image_url || null,
is_bsc_processed: !!is_bsc_processed,
primary_supplier_id: resolvedSupplierId,
status: targetStatus,
sell_nassau: goLive,
sell_andros: goLive,
sell_online: false,
sell_wholesale: false,
created_by: user.id,
})
.select()
.single();

if (prodErr || !created) {
return NextResponse.json({ error: `Product creation failed: ${prodErr?.message || 'unknown'}` }, { status: 500 });
}

if (cost_per_unit != null && cost_per_unit > 0) {
const { error: costErr } = await admin
.from('product_costs')
.insert({
product_id: created.id,
supplier_id: resolvedSupplierId,
cost_type: 'standard',
cost_per_unit: Number(cost_per_unit),
unit_of_measure,
shipping_per_lb: 0,
customs_duty_pct: 0,
vat_levy_pct: 0,
processing_fee: 0,
effective_from: new Date().toISOString(),
is_current: true,
recorded_by: user.id,
});
if (costErr) {
return NextResponse.json({
warning: `Product created but cost insert failed: ${costErr.message}`,
product: created,
});
}
}

if (Array.isArray(pricing) && pricing.length > 0 && goLive) {
for (const p of pricing) {
if (!p.channel) continue;
await admin.from('product_pricing').insert({
product_id: created.id,
channel: p.channel,
pricing_mode: p.pricing_mode || 'formula',
margin_multiplier: p.pricing_mode === 'formula' ? (p.margin_multiplier ?? 1.38) : 1.0,
vat_multiplier: p.vat_multiplier ?? 1.0,
manual_unit_price: p.pricing_mode === 'manual_override' ? p.manual_unit_price : null,
shipping_per_lb: 0,
customs_duty_pct: 0,
vat_levy_pct: 0,
per_transaction_fee: 0,
service_fee_pct: 0,
effective_from: new Date().toISOString(),
is_current: true,
is_active: true,
recorded_by: user.id,
});
}
}

return NextResponse.json({
success: true,
product: created,
status: targetStatus,
message: goLive
? 'Product is live and sellable.'
: 'Product submitted for approval — Dedrick will review before it goes live.',
});
} catch (e) {
console.error('Onboard error:', e);
return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error' }, { status: 500 });
}
}
