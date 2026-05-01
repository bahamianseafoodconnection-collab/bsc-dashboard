// ============================================================
// BSC MARKETPLACE — RBC PLUG & PAY PAYMENT ROUTE
// File: app/api/payment/charge/route.ts
// ============================================================
// STATUS: SKELETON READY — awaiting RBC API keys
// MID: 026922 | TID: 02692202 | MCC: 5300 | Currency: BSD
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const RBC_CONFIG = {
merchantId: process.env.RBC_MID || '026922',
terminalId: process.env.RBC_TID || '02692202',
mcc: process.env.RBC_MCC || '5300',
currency: process.env.RBC_CURRENCY || 'BSD',
gatewayUrl: process.env.RBC_GATEWAY_URL || '',
apiKey: process.env.RBC_API_KEY || '',
secretKey: process.env.RBC_SECRET_KEY || '',
};

type PaymentStatus = 'approved' | 'declined' | 'pending' | 'error';

type ChargeResult = {
status: PaymentStatus;
refNumber: string;
approvalCode?: string;
message: string;
amount: number;
currency: string;
};

export async function POST(req: NextRequest) {
try {
const body = await req.json();
const { orderId, amount, cardToken, customerName, customerPhone } = body;

if (!orderId || !amount || !cardToken) {
return NextResponse.json({ error: 'Missing required fields: orderId, amount, cardToken' }, { status: 400 });
}

if (amount <= 0) {
return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
}

const result = RBC_CONFIG.apiKey && RBC_CONFIG.gatewayUrl
? await realCharge(amount, cardToken, orderId, customerName)
: await simulateCharge(amount, orderId);

const cookieStore = cookies();
const supabase = createServerClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
{ cookies: { get: (name: string) => cookieStore.get(name)?.value } }
);

const orderStatus = result.status === 'approved' ? 'paid' :
result.status === 'pending' ? 'payment_pending' : 'payment_failed';

await supabase.from('orders').update({
payment_status: result.status,
payment_ref: result.refNumber,
payment_approval: result.approvalCode || null,
payment_method: 'card',
status: orderStatus,
updated_at: new Date().toISOString(),
}).eq('id', orderId);

if (result.status === 'approved') {
await supabase.from('orders').update({
fulfillment_triggered: true,
fulfillment_at: new Date().toISOString(),
}).eq('id', orderId);

await supabase.from('invoices').insert([{
order_id: orderId,
amount: amount,
currency: RBC_CONFIG.currency,
payment_ref: result.refNumber,
approval_code: result.approvalCode,
status: 'paid',
created_at: new Date().toISOString(),
}]);
}

return NextResponse.json({
success: result.status === 'approved',
status: result.status,
ref: result.refNumber,
message: result.message,
amount: result.amount,
});

} catch (error) {
console.error('BSC Payment Error:', error);
return NextResponse.json({ error: 'Payment processing error. Please try again.' }, { status: 500 });
}
}

async function realCharge(amount: number, cardToken: string, orderId: string, customerName: string): Promise<ChargeResult> {
const refNumber = `BSC-${Date.now()}-${orderId}`;
const response = await fetch(RBC_CONFIG.gatewayUrl, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': `Bearer ${RBC_CONFIG.apiKey}`,
'X-Merchant-ID': RBC_CONFIG.merchantId,
'X-Terminal-ID': RBC_CONFIG.terminalId,
},
body: JSON.stringify({
merchantId: RBC_CONFIG.merchantId,
terminalId: RBC_CONFIG.terminalId,
mcc: RBC_CONFIG.mcc,
currency: RBC_CONFIG.currency,
amount: Math.round(amount * 100),
cardToken, orderId, customerName, reference: refNumber,
}),
});
const data = await response.json();
return {
status: data.status === 'APPROVED' ? 'approved' : data.status === 'PENDING' ? 'pending' : 'declined',
refNumber: data.referenceNumber || refNumber,
approvalCode: data.approvalCode,
message: data.message || data.status,
amount,
currency: RBC_CONFIG.currency,
};
}

async function simulateCharge(amount: number, orderId: string): Promise<ChargeResult> {
await new Promise((r) => setTimeout(r, 1200));
const refNumber = `BSC-SIM-${Date.now()}`;
const isDeclined = String(amount).endsWith('.99');
return {
status: isDeclined ? 'declined' : 'approved',
refNumber,
approvalCode: isDeclined ? undefined : `APR${Math.floor(Math.random() * 999999)}`,
message: isDeclined ? 'Card declined — simulation mode' : 'Payment approved — simulation mode',
amount,
currency: 'BSD',
};
}
