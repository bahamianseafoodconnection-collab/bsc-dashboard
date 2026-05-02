import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
try {
const cookieStore = await cookies();
const supabase = createServerClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
{
cookies: {
getAll() { return cookieStore.getAll(); },
setAll(cookiesToSet) {
try {
cookiesToSet.forEach(({ name, value, options }) =>
cookieStore.set(name, value, options)
);
} catch {}
},
},
}
);

const body = await req.json();

const {
customer_name,
customer_email,
customer_phone,
customer_address,
items,
subtotal,
delivery_fee,
total,
payment_method,
payment_status,
payment_ref,
payment_approval,
order_type,
wholesaler,
wholesale_items,
wholesale_cost_total,
notes,
} = body;

// Validate required fields
if (!items || !Array.isArray(items) || items.length === 0) {
return NextResponse.json({ error: 'No items in order' }, { status: 400 });
}
if (!total || total <= 0) {
return NextResponse.json({ error: 'Invalid order total' }, { status: 400 });
}

// Build order payload
const orderPayload: Record<string, unknown> = {
created_at: new Date().toISOString(),
updated_at: new Date().toISOString(),
customer_name: customer_name || null,
customer_email: customer_email || null,
customer_phone: customer_phone || null,
customer_address: customer_address || null,
items: items,
subtotal: subtotal || total,
delivery_fee: delivery_fee || 0,
total: total,
payment_method: payment_method || 'cash_on_delivery',
payment_status: payment_status || 'unpaid',
payment_ref: payment_ref || null,
payment_approval: payment_approval || null,
status: 'pending',
channel: 'online',
order_type: order_type || 'retail',
notes: notes || null,
};

// Wholesale-specific fields
if (order_type === 'wholesale' && wholesaler) {
orderPayload.wholesaler = wholesaler;
orderPayload.wholesale_items = wholesale_items || items;
orderPayload.wholesale_cost_total = wholesale_cost_total || 0;
orderPayload.admin_purchased = false;
}

const { data, error } = await supabase
.from('orders')
.insert([orderPayload])
.select()
.single();

if (error) {
console.error('Order create error:', error);
return NextResponse.json({ error: error.message }, { status: 500 });
}

return NextResponse.json({
success: true,
order_id: data.id,
order: data,
});

} catch (err) {
console.error('Order create exception:', err);
return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
}
