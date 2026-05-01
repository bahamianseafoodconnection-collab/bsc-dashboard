// ============================================================
// BSC MARKETPLACE — RBC PLUG & PAY WEBHOOK HANDLER
// File: app/api/payment/webhook/route.ts
// Webhook URL: https://bscbahamas.com/api/payment/webhook
// Send this URL to RBC: bctmsr@rbc.com
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
try {
const body = await req.json();
const signature = req.headers.get('x-rbc-signature') || '';

if (process.env.RBC_WEBHOOK_SECRET) {
const isValid = verifySignature(JSON.stringify(body), signature, process.env.RBC_WEBHOOK_SECRET);
if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
}

const { orderId, status, referenceNumber, approvalCode, merchantId } = body;

if (merchantId && merchantId !== '026922') {
return NextResponse.json({ error: 'Unknown merchant' }, { status: 400 });
}

const cookieStore = cookies();
const supabase = createServerClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
{ cookies: { get: (name: string) => cookieStore.get(name)?.value } }
);

const paymentStatus = status === 'APPROVED' ? 'approved' : status === 'PENDING' ? 'pending' : 'declined';
const orderStatus = paymentStatus === 'approved' ? 'paid' : paymentStatus === 'pending' ? 'payment_pending' : 'payment_failed';

await supabase.from('orders').update({
payment_status: paymentStatus,
payment_ref: referenceNumber,
payment_approval: approvalCode || null,
status: orderStatus,
updated_at: new Date().toISOString(),
}).eq('id', orderId);

if (paymentStatus === 'approved') {
await supabase.from('orders').update({
fulfillment_triggered: true,
fulfillment_at: new Date().toISOString(),
}).eq('id', orderId);
}

console.log(`BSC Webhook: Order ${orderId} → ${status} | Ref: ${referenceNumber}`);
return NextResponse.json({ received: true });

} catch (error) {
console.error('BSC Webhook Error:', error);
return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
}
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
const crypto = require('crypto');
const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
return signature === expected;
}
