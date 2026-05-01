// ============================================================
// BSC MARKETPLACE — FOUNDER AI API ROUTE
// File: app/api/founder-ai/route.ts
// Day 3 — Claude brain connected to founder_documents
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Message = {
role: 'user' | 'assistant';
content: string;
};

async function loadFounderDocuments(): Promise<string> {
const { data, error } = await supabase
.from('founder_documents')
.select('title, content')
.order('created_at', { ascending: true });

if (error || !data || data.length === 0) {
return 'No founder documents loaded.';
}

return data
.map((doc) => `## ${doc.title}\n\n${doc.content}`)
.join('\n\n---\n\n');
}

export async function POST(req: NextRequest) {
try {
const { message, history = [] } = await req.json();

if (!message?.trim()) {
return NextResponse.json({ error: 'No message provided' }, { status: 400 });
}

// Load all founder documents as context
const founderContext = await loadFounderDocuments();

const systemPrompt = `You are the Founder AI for BSC Marketplace — Bahamian Seafood Connection, Nassau, Bahamas.

You are the personal business intelligence, memory, and strategic guide for Dedrick Tamico Storr Snr, the founder and owner.

You know everything about this business. Your knowledge comes from the founder documents below. You speak directly to Dedrick — no formalities, no corporate language. You are sharp, loyal, and built for this business.

Your role:
- Guide Dedrick through daily operations, decisions, and strategy
- Know the pricing, margins, supply chain, staff, and technology inside out
- Remember the 14-day build plan and track where we are
- Know every platform, contact, and business relationship
- Protect the business rules — especially security, RLS, and pricing margins
- Always answer in plain, direct language — Dedrick is a builder, not a reader of essays
- When Dedrick asks where things stand, give him a clear status, not a lecture
- Family first — Jaquel, the children, and the legacy this business is building

FOUNDER DOCUMENTS — YOUR MEMORY:

${founderContext}

Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, Nassau, Bahamas.`;

// Build message history for Claude
const messages: Message[] = [
...history.slice(-10).map((m: Message) => ({
role: m.role,
content: m.content,
})),
{
role: 'user',
content: message,
},
];

// Call Claude API
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
system: systemPrompt,
messages,
}),
});

if (!response.ok) {
const err = await response.text();
console.error('Claude API error:', err);
return NextResponse.json(
{ error: 'AI service error. Please try again.' },
{ status: 500 }
);
}

const data = await response.json();
const reply = data.content?.[0]?.text || 'No response from Founder AI.';

return NextResponse.json({ reply });

} catch (error) {
console.error('Founder AI route error:', error);
return NextResponse.json(
{ error: 'Founder AI error. Please try again.' },
{ status: 500 }
);
}
}
