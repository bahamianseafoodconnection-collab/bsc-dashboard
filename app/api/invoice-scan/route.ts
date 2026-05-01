// ============================================================
// BSC MARKETPLACE — INVOICE SCAN API
// File: app/api/invoice-scan/route.ts
// Reads supplier invoice image, splits wholesale vs retail
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
try {
const { image } = await req.json();
if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

const response = await fetch('https://api.anthropic.com/v1/messages', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'x-api-key': process.env.ANTHROPIC_API_KEY!,
'anthropic-version': '2023-06-01',
},
body: JSON.stringify({
model: 'claude-opus-4-5',
max_tokens: 1024,
messages: [
{
role: 'user',
content: [
{
type: 'image',
source: { type: 'base64', media_type: 'image/jpeg', data: image },
},
{
type: 'text',
text: `You are reading a supplier invoice for BSC Marketplace, Nassau Bahamas.

Analyze this invoice and return ONLY valid JSON in this exact format with no other text:
{
"wholesale": [{"item": "item name", "qty": "quantity", "price": "price"}],
"retail": [{"item": "item name", "qty": "quantity", "price": "price"}],
"supplierOwed": "BSD $0.00",
"bscKeeps": "BSD $0.00",
"summary": "Plain English summary of what this invoice contains and the split"
}

Rules:
- Wholesale: large quantities, bulk pricing, restaurant/business orders
- Retail: individual consumer quantities
- supplierOwed: the cost of goods BSC owes the supplier (total minus BSC margin)
- bscKeeps: BSC profit at 25% margin on total invoice value
- If you cannot read the invoice clearly, still return valid JSON with empty arrays and a summary explaining what you could read`,
},
],
},
],
}),
});

const data = await response.json();
const text = data.content?.[0]?.text || '{}';

let split;
try {
split = JSON.parse(text.replace(/```json|```/g, '').trim());
} catch {
split = {
wholesale: [],
retail: [],
supplierOwed: 'BSD $0.00',
bscKeeps: 'BSD $0.00',
summary: 'Could not fully parse invoice. Please try a clearer photo.',
};
}

return NextResponse.json({ split });
} catch (error) {
console.error('Invoice scan error:', error);
return NextResponse.json({ error: 'Invoice scan failed' }, { status: 500 });
}
}

