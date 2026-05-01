// ============================================================
// BSC MARKETPLACE — INVOICE SCAN API
// File: app/api/invoice-scan/route.ts
// Multi-page, location-aware, wholesale/retail split
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
try {
const { images, location, margin } = await req.json();

if (!images || !images.length) {
return NextResponse.json({ error: 'No images provided' }, { status: 400 });
}

// Build content array — one image block per page
const imageBlocks = images.map((img: string) => ({
type: 'image',
source: { type: 'base64', media_type: 'image/jpeg', data: img },
}));

const response = await fetch('https://api.anthropic.com/v1/messages', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'x-api-key': process.env.ANTHROPIC_API_KEY!,
'anthropic-version': '2023-06-01',
},
body: JSON.stringify({
model: 'claude-opus-4-5',
max_tokens: 2048,
messages: [
{
role: 'user',
content: [
...imageBlocks,
{
type: 'text',
text: `You are reading a supplier invoice for BSC Marketplace, Nassau Bahamas.

This invoice has ${images.length} page(s). Read ALL pages carefully.

Sales channel: ${location}
BSC margin: ${(margin * 100).toFixed(0)}%

Return ONLY valid JSON — no other text, no markdown, no backticks:
{
"items": [
{
"item": "product name",
"qty": "quantity with unit e.g. 50 lbs",
"price": "BSD $0.00",
"wholesale": true or false
}
],
"supplierOwed": "BSD $0.00",
"bscKeeps": "BSD $0.00",
"summary": "Plain English summary of invoice contents, total value, and split breakdown"
}

Rules:
- Read every line item from every page
- wholesale: true = large bulk quantities for business/restaurant resale
- wholesale: false = retail consumer quantities
- supplierOwed = total invoice value × ${(1 - margin).toFixed(2)} (BSC cost of goods)
- bscKeeps = total invoice value × ${margin.toFixed(2)} (BSC profit margin)
- If a page is unclear, extract what you can and note it in the summary
- Always return valid JSON even if pages are partially unreadable`,
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
split = JSON.parse(text.trim());
} catch {
split = {
items: [],
supplierOwed: 'BSD $0.00',
bscKeeps: 'BSD $0.00',
summary: 'Could not fully parse invoice. Please check the photos are clear and try again.',
};
}

return NextResponse.json({ split });

} catch (error) {
console.error('Invoice scan error:', error);
return NextResponse.json({ error: 'Invoice scan failed' }, { status: 500 });
}
}

