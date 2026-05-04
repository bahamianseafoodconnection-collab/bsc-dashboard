import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BSC_HARDCODED_CONTEXT = `
# BSC MARKETPLACE — CORE BUSINESS FACTS

## Company
- Bahamian Seafood Connection (BSC Marketplace)
- Owners: Dedrick Tamico Storr Snr & Jaquel Rolle-Storr & Family
- Address: Firetrail Road, Nassau, Bahamas
- Cold storage: Mastic Point, Andros (capacity 30,000 lbs, current stock 9,310 lbs)
- Live website: bscbahamas.com
- Contact: +1 (242) 558-4495 (call), +1 (242) 361-3474 (WhatsApp)

## SACRED PRICING RULES
- Nassau POS: 38% margin
- Andros POS: 43% margin
- Online Market: 25% margin
- Local Wholesale: 12% margin + 10% VAT
- Bill Payments: 4.5% fee + $6 service fee
- Bill Casale: 5% gross profit (sacred)

## Monthly Fixed Costs
- Total: $20,590/month

## Wholesale Partners
1. Asa H Pritchard (AHP)
2. Bahamas International Food (BIF)
3. D'Albenas (DAL)
4. Bahamas Wholesale Agencies (BWA)
5. TPG (TPG)
6. Thompson Trading (TTR)
7. Island Wholesale (ISW)

## Tropic Seafood Wholesale Costs
- Snapper Portion 6/8oz: $11.60/lb -> retail $15.95/lb
- Bulk Whole Grouper: $5.00/lb -> retail $6.88/lb
- #2 Lobster Tail: $7.50/lb -> retail $10.31/lb
- Premium Lobster Tail: $12.50/lb -> retail $17.19/lb
- Snow Crab Clusters: $17.95/lb -> retail $24.68/lb
- Shrimp 16/20: $6.99/lb -> retail $9.61/lb
- NY Strip 8oz: $12.75/lb -> retail $17.53/lb
- Ribeye CAB 9-12oz: $13.75/lb -> retail $18.91/lb
- Mahi Fillet 7/9oz: $2.59/lb -> retail $3.56/lb
- Swai Fillet: $2.59/lb -> retail $3.56/lb

## BSC Direct Suppliers
- Anthony Taylor: 1,000 lbs conch @ $6.00/lb -> retail $8.25/lb

## Spiny Tail Processing Plant
- BSC's own facility at Firetrail Road, Nassau
- Products = "BSC Direct" branded

## Founder Wellbeing
- 35-day rest cycle (non-negotiable)
- Jaquel has authority to enforce breaks
- Next break: June 4-9
`;

export async function POST(req: Request) {
try {
const { message, history = [] } = await req.json();

if (!message || typeof message !== 'string') {
return NextResponse.json({ error: 'Message is required' }, { status: 400 });
}

let dbContext = '';
try {
const { data: docs } = await supabase
.from('founder_documents')
.select('title, content')
.order('created_at', { ascending: false })
.limit(20);

if (docs && docs.length > 0) {
dbContext = '\n\n## Additional Founder Documents\n' +
docs.map(d => `### ${d.title}\n${d.content}`).join('\n\n');
}
} catch {}

const systemPrompt = `You are Founder AI — Dedrick Storr's private business assistant for Bahamian Seafood Connection (BSC Marketplace).

You have deep knowledge of BSC's operations, pricing rules, suppliers, and financial structure. You answer Dedrick's business questions directly, using actual BSC numbers from the context below.

When asked about pricing, ALWAYS apply BSC's sacred pricing rules:
- Nassau POS: cost x 1.38 x 1.10 VAT
- Andros POS: cost x 1.43 x 1.10 VAT
- Online Market: cost x 1.25 x 1.10 VAT
- Local Wholesale: cost x 1.12 x 1.10 VAT

When asked for advice, be direct and confident. Speak naturally and warmly.

=== BSC BUSINESS CONTEXT ===
${BSC_HARDCODED_CONTEXT}
${dbContext}
=== END CONTEXT ===`;

const messages = [
...history.map((m: { role: string; content: string }) => ({
role: m.role,
content: m.content,
})),
{ role: 'user', content: message },
];

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
return NextResponse.json(
{ error: 'ANTHROPIC_API_KEY not configured.' },
{ status: 500 }
);
}

const response = await fetch('https://api.anthropic.com/v1/messages', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'x-api-key': apiKey,
'anthropic-version': '2023-06-01',
},
body: JSON.stringify({
model: 'claude-sonnet-4-20250514',
max_tokens: 2048,
system: systemPrompt,
messages,
}),
});

if (!response.ok) {
const errText = await response.text();
console.error('Claude API error:', errText);
return NextResponse.json(
{ error: `Claude API error: ${response.status}` },
{ status: response.status }
);
}

const data = await response.json();
const reply = data.content?.[0]?.text || 'No response from Claude.';

return NextResponse.json({ reply, usage: data.usage });
} catch (err) {
console.error('Founder AI error:', err);
return NextResponse.json(
{ error: err instanceof Error ? err.message : 'Unknown error' },
{ status: 500 }
);
}
}
