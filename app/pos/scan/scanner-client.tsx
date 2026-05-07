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

const ALLOWED_ROLES_FULL = ['founder', 'co_founder', 'manager'];
const ALLOWED_ROLES_PHOTO = ['founder', 'co_founder', 'manager', 'cashier', 'right_hand', 'supervisor', 'processor', 'andros_staff'];

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
return NextResponse.json({ error: 'Unauthorized — please sign in.' }, { status: 401 });
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
return NextResponse.json({ error: 'Account inactive.' }, { status: 403 });
}

const body = await req.json();
const { action, product_id } = body;

if (!action || !product_id) {
return NextResponse.json({ error: 'action and product_id are required' }, { status: 400 });
}

// ============================================================
// UPDATE IMAGE — broader role access (any staff can take photos)
// ============================================================
if (action === 'update_image') {
if (!ALLOWED_ROLES_PHOTO.includes(userRow.role)) {
return NextResponse.json({ error: 'Your role cannot update product photos.' }, { status: 403 });
}
const { image_url } = body;
if (!image_url || typeof image_url !== 'string') {
return NextResponse.json({ error: 'image_url is required' }, { status: 400 });
}
const { error } = await admin
.from('products')
.update({ image_url, updated_at: new Date().toISOString() })
.eq('id', product_id);

if (error) {
return NextResponse.json({ error: `Failed to update image: ${error.message}` }, { status: 500 });
}
return NextResponse.json({ success: true });
}

// ============================================================
// ALL OTHER ACTIONS — manager+ only
// ============================================================
if (!ALLOWED_ROLES_FULL.includes(userRow.role)) {
return NextResponse.json({ error: 'Your role does not have permission to edit cost or pricing.' }, { status: 403 });
}

if (action === 'update_cost') {
const { cost_per_unit, unit_of_measure, supplier_id, source_invoice_number, notes, cost_type } = body;

if (cost_per_unit == null || cost_per_unit < 0) {
return NextResponse.json({ error: 'cost_per_unit must be >= 0' }, { status: 400 });
}

const { error: e1 } = await admin
.from('product_costs')
.update({ is_current: false, effective_to: new Date().toISOString() })
.eq('product_id', product_id)
.eq('is_current', true);

if (e1) {
return NextResponse.json({ error: `Failed to retire previous cost: ${e1.message}` }, { status: 500 });
}

const { data, error } = await admin
.from('product_costs')
.insert({
product_id,
supplier_id: supplier_id || null,
cost_type: cost_type || 'standard',
cost_per_unit,
unit_of_measure: unit_of_measure || 'lb',
shipping_per_lb: 0,
customs_duty_pct: 0,
vat_levy_pct: 0,
processing_fee: 0,
effective_from: new Date().toISOString(),
is_current: true,
source_invoice_number: source_invoice_number || null,
notes: notes || null,
recorded_by: user.id,
})
.select()
.single();

if (error) {
return NextResponse.json({ error: `Failed to insert cost: ${error.message}` }, { status: 500 });
}
return NextResponse.json({ success: true, cost: data });
}

if (action === 'update_price') {
const { channel, pricing_mode, margin_multiplier, vat_multiplier, manual_unit_price, notes } = body;

if (!channel) {
return NextResponse.json({ error: 'channel is required' }, { status: 400 });
}
if (!pricing_mode || !['formula', 'manual_override', 'tiered_quantity'].includes(pricing_mode)) {
return NextResponse.json({ error: 'pricing_mode must be formula, manual_override, or tiered_quantity' }, { status: 400 });
}

const { error: e1 } = await admin
.from('product_pricing')
.update({ is_current: false, effective_to: new Date().toISOString() })
.eq('product_id', product_id)
.eq('channel', channel)
.eq('is_current', true);

if (e1) {
return NextResponse.json({ error: `Failed to retire previous pricing: ${e1.message}` }, { status: 500 });
}

const insertPayload = {
product_id,
channel,
pricing_mode,
margin_multiplier: pricing_mode === 'formula' ? (margin_multiplier ?? 1.38) : 1.0,
vat_multiplier: vat_multiplier ?? 1.0,
manual_unit_price: pricing_mode === 'manual_override' ? manual_unit_price : null,
manual_case_price: null,
shipping_per_lb: 0,
customs_duty_pct: 0,
vat_levy_pct: 0,
per_transaction_fee: 0,
service_fee_pct: 0,
effective_from: new Date().toISOString(),
is_current: true,
is_active: true,
notes: notes || null,
recorded_by: user.id,
};

const { data, error } = await admin
.from('product_pricing')
.insert(insertPayload)
.select()
.single();

if (error) {
return NextResponse.json({ error: `Failed to insert pricing: ${error.message}` }, { status: 500 });
}
return NextResponse.json({ success: true, pricing: data });
}

if (action === 'update_status') {
const { status } = body;
const VALID = ['draft', 'pending_approval', 'active', 'discontinued', 'archived'];
if (!status || !VALID.includes(status)) {
return NextResponse.json({ error: `status must be one of: ${VALID.join(', ')}` }, { status: 400 });
}

const { error } = await admin
.from('products')
.update({ status, updated_at: new Date().toISOString() })
.eq('id', product_id);

if (error) {
return NextResponse.json({ error: `Failed to update status: ${error.message}` }, { status: 500 });
}
return NextResponse.json({ success: true });
}

if (action === 'update_channels') {
const { sell_nassau, sell_andros, sell_online, sell_wholesale, sell_export } = body;

const updates: Record<string, boolean> = {};
if (typeof sell_nassau === 'boolean') updates.sell_nassau = sell_nassau;
if (typeof sell_andros === 'boolean') updates.sell_andros = sell_andros;
if (typeof sell_online === 'boolean') updates.sell_online = sell_online;
if (typeof sell_wholesale === 'boolean') updates.sell_wholesale = sell_wholesale;
if (typeof sell_export === 'boolean') updates.sell_export = sell_export;

if (Object.keys(updates).length === 0) {
return NextResponse.json({ error: 'No channel changes provided' }, { status: 400 });
}

const { error } = await admin
.from('products')
.update({ ...updates, updated_at: new Date().toISOString() })
.eq('id', product_id);

if (error) {
return NextResponse.json({ error: `Failed to update channels: ${error.message}` }, { status: 500 });
}
return NextResponse.json({ success: true });
}

return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

} catch (e) {
console.error('Inventory update error:', e);
return NextResponse.json(
{ error: e instanceof Error ? e.message : 'Internal server error' },
{ status: 500 }
);
}
}
