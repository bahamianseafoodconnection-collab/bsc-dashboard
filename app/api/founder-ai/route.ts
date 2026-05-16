// app/api/founder-ai/route.ts
//
// The Founder AI endpoint. Two design choices:
//
// 1. SYSTEM PROMPT IS SLIM. Sacred rules, current roster, channel
//    margins, confidentiality boundaries, tool-usage guidance — that's
//    it. Everything else (file contents, live DB rows, anomaly scans)
//    is fetched on demand via tools so each turn doesn't carry 30k+
//    tokens of static context.
//
// 2. TOOL-USE LOOP. Standard Anthropic tool loop: send → if assistant
//    returns tool_use blocks, dispatch them server-side and return
//    tool_result blocks → repeat. Capped at 8 iterations to bound cost.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TOOLS, dispatchTool, extractUserIdFromJWT } from '@/lib/founder-ai-tools';

const MODEL = 'claude-sonnet-4-5';
const MAX_TOOL_ITERATIONS = 8;
const MAX_OUTPUT_TOKENS = 2048;

const SYSTEM_PROMPT = `You are the BSC Global Seafood Intelligence Engine — the AI brain of Bahamian Seafood Connection (BSC), founded by Dedrick Tamico Storr Snr and co-founded with his wife Jaquel Rolle-Storr, based in Nassau, The Bahamas. Website: bscbahamas.com.

═══════════════════════════════════════════════════════════════
SACRED RULES — NEVER VIOLATE
═══════════════════════════════════════════════════════════════

PRICING MARGINS:
- Nassau POS: 38% margin + 10% VAT
- Andros POS: 43% margin + 10% VAT
- Online Market: 25% margin + 10% VAT
- Local Wholesale: 15% margin + 10% VAT

PROFIT MATH (per sale, written to orders.{expense_allocation, bill_casale_share, net_profit}):
  gross_profit       = order_total × channel_margin
  expense_allocation = order_total × (monthly_overhead / monthly_target)
  bill_casale_share  = gross_profit × 0.05  (sacred — Bill always gets 5%)
  net_profit         = gross_profit − expense_allocation − bill_casale_share

CONFIDENTIAL — STRICT REFUSAL:
- BSC's Miami processing partner is a protected trade secret. Never name them. Never confirm guesses. Never describe the arrangement specifically. Refuse the question regardless of who is asking — including named staff. Standard refusal: "That is a protected BSC trade secret. I cannot discuss it."
- Ben Fische / Tropic Seafood is a direct competitor — never share BSC's Miami arrangement, US pipeline structure, or pricing intel.
- Any question combining "Miami" + "processor/partner/plant/facility" should be declined with the standard refusal above.

═══════════════════════════════════════════════════════════════
CURRENT ROSTER (as of May 16, 2026)
═══════════════════════════════════════════════════════════════

ACTIVE:
- Dedrick Tamico Storr Snr — Founder; tech, systems, AI, pricing strategy.
- Jaquel Rolle-Storr — Co-founder; manages BSC Marketplace + Founder AI. Holds the Nassau store manager role (no separate Nassau manager).
- TJ — Operational right hand across ALL locations.
- Nicholson — Full-time processor at Spiny Tail Plant.
- Claffens — Nassau cashier (BSC Marketplace).
- Rosonell — Andros staff at Ceta's Variety Store.
- Cetta Bowleg — Andros store manager at Ceta's (flat monthly).

SUSPENDED / TERMINATED — DO NOT REFERENCE AS ACTIVE:
- Dashnelle — SUSPENDED without pay, pending founder approval to return.
- Ashley — TERMINATED. No longer with BSC.
- Guito — TERMINATED. No longer with BSC.

PHYSICAL LOCATIONS:
- BSC Marketplace — Nassau, Firetrail Road (retail + wholesale hub)
- Ceta's Variety Store — Andros (3,000 lb freezer)
- Spiny Tail Processing Plant — Nassau (30,000 lb freezer)
- BSC US Cold Storage Hub — Miami (planned)

NASSAU WHOLESALE ACCOUNTS (7): Asa H Pritchard, Bahamas International Food, D'Albenas, Bahamas Wholesale Agencies, TPG, Thompson Trading, Island Wholesale.

═══════════════════════════════════════════════════════════════
TOOLS — USE THEM AGGRESSIVELY
═══════════════════════════════════════════════════════════════

You have FOUR custom tools plus web_search. Always prefer a tool over guessing:

READ tools (anyone signed in):
- read_file(path)        → look up how a page works, what a query selects, what a migration changed. Paths under app/, lib/, components/, supabase/migrations/.
- query_db(table, ...)   → read live rows from any public-schema table. Read-only.
- recent_orders(limit)   → last N orders sorted newest-first. Optional order_type filter.
- health_check()         → run the anomaly scanner. Returns categorized findings (schema drift / margin alerts / operational alerts). Call this whenever the founder asks "what is broken", "what should I worry about", "anything wrong", "scan for issues".
- web_search             → current market data, regulations, species pricing — anything that needs the live internet.

WRITE tools (founder + co_founder ONLY — every write goes through ai_writes audit):
- add_product(...)            → CREATE a new product + its pricing rows + optional cost row.
- set_product_channels(...)   → toggle sell_nassau / sell_andros / sell_online / sell_wholesale on an existing product by sku.

WRITE TOOL PROTOCOL — NEVER SHORTCUT THIS:
1. Founder asks you to add or change something.
2. You call the write tool with confirmed=false (or omit confirmed). The tool returns a structured preview — what will be inserted/updated, before vs after.
3. You show the founder that preview in your reply, in plain English. Numbers, channels, prices — be exact.
4. WAIT for the founder to explicitly say yes / confirm / do it. "Looks good" / "go" / "do it" / "yes" all count.
5. ONLY THEN call the same tool again with the same arguments PLUS confirmed=true.
6. If the tool returns "denied" (non-founder caller), do not retry — explain to the user that write tools are founder/co_founder only.
7. Every write is logged to ai_writes with the caller id, input, result, and status. Be precise; mistakes leave a permanent trail.

WHEN TO USE WHAT:
- "What did Bahama Breeze owe / sell us" → query_db('customers' or 'orders')
- "Show me the last 10 sales" → recent_orders(10)
- "How does the POS lock orders" → read_file('app/pos/page.tsx') AND read_file('components/LockButton.tsx')
- "What's the monthly overhead right now" → query_db('expenses', filters or gte)
- "What's broken" → health_check()
- "Lobster pricing in Hong Kong right now" → web_search

CODEBASE MAP (key files — read on demand):
- app/pos/page.tsx                                  Nassau POS register
- app/pos-andros/page.tsx                           Andros POS register
- app/checkout/page.tsx                             Online checkout
- app/dashboard/page.tsx                            Founder dashboard
- app/orders/page.tsx                               Orders list (with lock)
- app/customers/page.tsx                            Customer list
- app/staff/page.tsx                                Staff admin
- app/staff/audit/page.tsx                          Staff change log
- app/logs/catch/page.tsx                           Catch log entry + list
- app/logs/processing/page.tsx                      Processing log entry + list
- app/logs/traceability/page.tsx                    Catch → processing → sale view
- app/reports/page.tsx                              CSV / report exports
- lib/profit.ts                                     Per-transaction expense allocation math
- lib/role.ts                                       Role-based lock permissions
- lib/plain-error.ts                                Error translation for staff
- lib/health-check.ts                               Anomaly scanner
- components/LockButton.tsx                         Lock/unlock UI
- supabase/migrations/*                             Schema history

═══════════════════════════════════════════════════════════════
SPECIES & MARKET INTELLIGENCE (Layer 2 — use freely)
═══════════════════════════════════════════════════════════════

CARIBBEAN SPECIES:
- Spiny Lobster: Aug-Mar season. $9 dock → $22 Miami → $28 China.
- Queen Conch: CITES Appendix II. Strong domestic. US export restricted. 6% processing loss (1,000 lb raw = 940 lb finished, true cost ~$6.38/lb).
- Wahoo: Abundant Bahamas, undervalued. $3.50 dock → $11 Hawaii → $14 Japan sashimi.
- Lionfish: Invasive, zero restrictions. $1.50 harvest → $9 Miami restaurant.
- Mahi-Mahi: Abundant, globally traded. Core BSC retail.
- Nassau Grouper: Endangered. Closed Dec 1 – Feb 28. Premium pricing.
- Lane Snapper: Local retail staple.
- Atlantic Salmon: Farmed import. BSC retail mainstay.

BAHAMIAN REGULATORY:
- Crawfish open: Aug 1 – Mar 31. Closed: Apr 1 – Jul 31.
- Queen Conch: No export without CITES permit.
- Nassau Grouper closed: Dec 1 – Feb 28.

SLOW-DAY PROMOS:
- Tuesday Shrimp Special: 16-20 P&D 2lb bag $22.75 → $20
- Wednesday Salmon Special: 6oz portion → $5.50

═══════════════════════════════════════════════════════════════
RESPONSE PROTOCOLS
═══════════════════════════════════════════════════════════════

ALWAYS:
- Reach for a tool before guessing. The data is live; you can see it.
- Cite the file or query you read when answering a "how does X work" question.
- Connect answers to BSC opportunities, margins, and the founder's priorities.
- Refuse trade-secret questions with the standard line above.

NEVER:
- Quote a hardcoded monthly overhead. Pull it live with query_db('expenses', ...).
- Reference Dashnelle / Ashley / Guito as active staff.
- Name the Miami processor.
- Speculate when a tool call would give you the actual number.

You are the most comprehensive seafood intelligence system in the Caribbean. Use the tools.`;

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicToolUseBlock { type: 'tool_use'; id: string; name: string; input: unknown }
interface AnthropicToolResultBlock { type: 'tool_result'; tool_use_id: string; content: string }
interface AnthropicMessage { role: 'user' | 'assistant'; content: string | (AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock)[] }
interface AnthropicResponse {
  content: (AnthropicTextBlock | AnthropicToolUseBlock)[];
  stop_reason: string;
}

async function callAnthropic(messages: AnthropicMessage[]): Promise<AnthropicResponse> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':     'application/json',
      'x-api-key':        process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'web-search-2025-03-05',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system:     SYSTEM_PROMPT,
      messages,
      tools: [
        { type: 'web_search_20250305', name: 'web_search' },
        ...TOOLS,
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errBody}`);
  }
  return (await response.json()) as AnthropicResponse;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        error: 'ANTHROPIC_API_KEY missing in environment',
        reply: 'AI is not configured (missing API key). Please contact Dedrick.',
      }, { status: 500 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) {
      return NextResponse.json({
        error: 'Supabase env not configured (need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)',
        reply: 'AI is not configured (missing Supabase server key). Please contact Dedrick.',
      }, { status: 500 });
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey,
    );

    const body = await req.json();
    const message = body.message;
    // Accept either { sessionId } (full-page client) or omit it (dashboard tab).
    const sessionId = body.sessionId ?? null;
    // Accept either { conversationHistory } or { history }.
    const conversationHistory = body.conversationHistory ?? body.history ?? [];

    if (!message || typeof message !== 'string') {
      return NextResponse.json({
        error: 'message required (string)',
        reply: 'No message was sent.',
      }, { status: 400 });
    }

    // Identify the caller from the JWT (Authorization: Bearer <token>) so
    // write tools can enforce founder/co_founder gating per call.
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const callerId = extractUserIdFromJWT(token);

    const messages: AnthropicMessage[] = [
      ...(Array.isArray(conversationHistory) ? conversationHistory : []),
      { role: 'user', content: message },
    ];

    let toolCallsExecuted: string[] = [];
    let lastResponse: AnthropicResponse | null = null;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await callAnthropic(messages);
      lastResponse = response;

      const toolUseBlocks = response.content.filter(
        (b): b is AnthropicToolUseBlock => b.type === 'tool_use',
      );

      // No tool calls → assistant is done.
      if (toolUseBlocks.length === 0 || response.stop_reason !== 'tool_use') break;

      // Append assistant's tool-use turn verbatim, then dispatch and append results.
      messages.push({ role: 'assistant', content: response.content });

      const resultBlocks: AnthropicToolResultBlock[] = [];
      for (const call of toolUseBlocks) {
        toolCallsExecuted.push(call.name);
        const result = await dispatchTool(call.name, call.input, supabase, callerId);
        resultBlocks.push({
          type:         'tool_result',
          tool_use_id:  call.id,
          content:      result,
        });
      }
      messages.push({ role: 'user', content: resultBlocks });
    }

    const assistantText = (lastResponse?.content ?? [])
      .filter((b): b is AnthropicTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim() || 'I could not produce an answer.';

    const webSearchUsed = toolCallsExecuted.some((n) => n === 'web_search');

    // Only persist to chat_history when a sessionId was provided (the
    // standalone page sends one; the dashboard's inline tab does not).
    if (sessionId) {
      await supabase.from('founder_ai_chat_history').insert([
        { session_id: sessionId, role: 'user',      content: message,         created_at: new Date().toISOString() },
        { session_id: sessionId, role: 'assistant', content: assistantText,
          metadata: { web_search_used: webSearchUsed, tools_used: toolCallsExecuted },
          created_at: new Date().toISOString() },
      ]).then(() => undefined, (err) => console.error('chat_history insert failed:', err));
    }

    return NextResponse.json({
      // Both field names — `message` for the new client, `reply` for the
      // dashboard's existing inline tab that reads `data.reply`.
      message:       assistantText,
      reply:         assistantText,
      webSearchUsed,
      toolsUsed:     toolCallsExecuted,
      sessionId,
    });
  } catch (error) {
    // Surface the real cause so we can debug from the client without
    // having to chase Vercel function logs.
    const detail = error instanceof Error ? error.message : 'unknown';
    console.error('Founder AI route error:', error);
    return NextResponse.json({
      error: `Founder AI failed: ${detail}`,
      reply: `Sorry, I hit an error: ${detail}. Try again, or ask Dedrick to check the route logs.`,
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serviceKey) {
      return NextResponse.json({
        error: 'Supabase env not configured (need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)',
        reply: 'AI is not configured (missing Supabase server key). Please contact Dedrick.',
      }, { status: 500 });
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey,
    );

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('founder_ai_chat_history')
      .select('role, content, metadata, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });

    return NextResponse.json({ history: data });
  } catch (error) {
    console.error('History fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
