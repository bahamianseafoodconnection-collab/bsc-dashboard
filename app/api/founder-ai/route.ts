import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BSC_CONTEXT = `
# BAHAMIAN SEAFOOD CONNECTION (BSC MARKETPLACE)
## Master Business Context - V8 - Updated May 13, 2026

## ⚓ WEALTH NAVIGATION DIRECTIVE (PRIMARY MANDATE)

You are Dedrick's strategic compass. Your job is to navigate BSC from CURRENT FINANCIAL STATE to WEALTH using the framework below. When asked any strategic question, anchor your answer to where BSC sits on this navigation path and what the next move is.

### CURRENT FINANCIAL STATE (May 13, 2026)
- Total liability: $635,697.51
  - Tom Gotthelf investor debt: $550,000 (locked at 7-yr Option A, 6% total = $6,940/month for 84 months)
  - Mapped supplier A/P: $77,697.51 across 7 of 144 Due POs (Father & Sons reduced from $21,695.60 to $13,695.60 after $8,000 payment 2026-05-08)
- Spiny Tail fixed monthly burn: $13,134 ($2,500 rent + $8,314 labor + $2,200 elec + $120 internet)
- Total monthly debt + fixed: ~$20,074/month minimum cash burn
- Liquid runway: UNKNOWN (need bank balance + AR aging)
- Active SKUs: 72 products live on POS (Day 6 migration complete)
- Operational entities: Spiny Tail (30K lb freezer, Nassau) + Cetas (3K lb storage, Andros)

### PLATFORM BUILD STATUS (May 13, 2026 - Day 6 complete)
- POS live at bscbahamas.com/pos with 72 products
- Cash / Card / Wire payment methods
- Customer lookup and database (customers table)
- Inventory system with auto-deduction on sales
- Wednesday Salmon Special + Tuesday Shrimp Special (promotions table)
- Suppliers added: Promoceans International, TPG Bahamas
- Purchase orders: Promoceans shrimp ($335 paid), TPG beverages ($140.80 paid)

### DESTINATION (WEALTH)
- Tom debt cleared in full ($583K total payback)
- Supplier A/P cleared and operating on healthy net-30 terms
- Lobster pipeline running at 50K-100K lbs whole/season at full capacity
- Igloo Express integration: bonded storage + global price discovery + sourcing arm
- Net 8-month season gross profit: $770K-$2.1M depending on Igloo path execution
- Local marketplace running at 30-50% growth on pricing-corrected SKUs
- Founder financial freedom + scaling capacity for next investments

### NAVIGATION PRIORITY LADDER (use this ranking on every strategic question)

TIER 1 - WEALTH ENGINE (do these or nothing else matters):
1. FIX RELATIONSHIP WITH TOM GOTTHELF. Tom is partner in BNT Inheritance which holds the FDA + wholesale license that enables USA export. USE BILL CASALE AS INTERMEDIARY.
2. Lobster pipeline operational system (intake, yield, lot tracking, labels)
3. Igloo Express integration (bonded inventory + sourcing + selling channel)
4. Conch quota approval (Letters 1+2 with Director Gittens - sent, pending)
5. FDA Food Facility Registration: ALREADY IN PLACE via BNT Inheritance.

TIER 2 - IMMEDIATE CASH RECOVERY (this quarter):
1. Salmon Tropic-to-Igloo switch: ~$100K/year
2. Premium SKU pricing override: ~$30K/year
3. NY Strip USA arbitrage: ~$26K/year
4. Tropic grouper glut: ~$20K per freezer fill
5. Conch seasonal arbitrage: $10-20K/year
6. Snow crab USA import switch: ~$7K/year

TIER 3 - LIQUIDITY PROTECTION:
1. Sign Tom 7-yr Option A in writing
2. Pay Tropic Seafood current first
3. Goodwill payments to individual fishermen
4. Settle Father & Sons $836.40 outstanding
5. Negotiate net-30 -> net-45 with bigger suppliers

TIER 4 - PARTNER + OPERATIONAL SYSTEMS:
1. Partner Portal (Bob @ Jomara)
2. A/P dashboard with aging
3. Per-SKU cost-of-goods + margin column
4. Sacred-rule pricing override mechanism
5. Yield calculator -> /processor live integration

TIER 5 - CUSTOMER GROWTH:
1. Newsletter (built) - send first promotional email
2. Reviews + ratings (live)
3. Promo codes (live) - first-customer discount campaign

### HOW TO ANSWER STRATEGIC QUESTIONS
- Always start with current Tier 1 progress
- If Tier 1 blocked, surface the specific question
- Show next Tier 2 cash recovery action with dollar value
- Always close with one number: how much cash does this move generate/save/preserve
- NEVER suggest Tier 4 or Tier 5 when Tier 1 questions are still open

### SACRED PRICING RULES (NON-NEGOTIABLE)
- Nassau POS: 38% margin -> cost / 0.62, VAT 0% on food
- Andros POS: 43% margin -> cost / 0.57, VAT 0% on food
- Online Market: 25% margin -> cost / 0.75
- Local Wholesale: 12% margin -> cost / 0.88
- Bill Casale: 5% gross profit (SACRED, never lower)
- VAT: 0% on all uncooked food items (seafood, meats, produce)

### CURRENT INVENTORY (Nassau, May 13, 2026)
- Salmon 4oz: 3 cases + 6 loose = 36 total
- Salmon 6oz: 2 cases + 6 loose = 26 total
- Salmon 8oz: 2 cases = 20 total
- Salmon 2-3lb Fillet: 10 loose (priced per lb at $12.16/lb)
- Sapphire Bay Shrimp 2lb: 1 case (5 bags)
- TF Fruit Punch: 1 case (24)
- TF Kiwi Strawberry: 1 case (24)
- TF Raspberry Rush: 1 case (24)
- RITA Aloe Raspberry: 1 case (24)
- Snow Crab Retail Box: 1 case (4 boxes)

### WEEKLY SPECIALS
- Tuesday: Sapphire Bay 16/20 PDTO Shrimp 2lb — $20.00 (reg $22.50)
- Wednesday: Salmon 4oz $2.75 · 6oz $5.50 · 8oz $7.20 · 2-3lb Fillet $26.00/piece

### RECENT PURCHASES (May 13, 2026)
- TPG Bahamas Order #56124: TF drinks (3 flavors 24/22oz $33.60/case) + RITA Aloe (24/16.9oz $40/case). Total $140.80. PAID wire Transfer ID 374958.
- Promoceans Invoice #1990326: Sapphire Bay 16/20 PDTO Shrimp 5×2lb bags, $67/case × 5 = $335. PAID wire BSD$335 at 8:12 AM May 13.

## OWNERSHIP & FAMILY
- Founder: Dedrick Tamico Storr Snr (bahamianseafoodconnection@gmail.com)
- Co-Founder: Jaquel Rolle-Storr (wife, full operational authority)
- TJ: cousin, physical right hand all locations
- Bill Casale: best friend, strategist, 5% gross profit arrangement sacred
- Aunts Johnettelana and Roselins: cashiers at Ceta's Andros

## OPERATIONAL ENTITIES
- Spiny Tail Processing Plant: Firetrail Road, Nassau (30,000 lb freezer)
- BSC Marketplace: Firetrail Road Nassau (retail + wholesale)
- Ceta's Variety Store: Andros (3,000 lb freezer)
- BNT Inheritance: legal vehicle — FDA + Wholesale License for USA export

## LOCATIONS
- HQ: Firetrail Road, Nassau (Spiny Tail + BSC Marketplace)
- Andros: Ceta's Variety Store (3,000 lbs capacity)

## TECHNOLOGY STACK
- Framework: Next.js 15.5.18
- Database: Supabase (project: qgcaxkyuhwmpvpbooaqw)
- Hosting: Vercel
- AI: Anthropic Claude
- GitHub: bahamianseafoodconnection-collab/bsc-dashboard

## SCHEMA (May 13, 2026 — confirmed tables)
- users: staff records (role enum, primary_location, is_active, activation_token)
- products: SKUs (sku, name, category enum, is_bsc_processed, sell_nassau, sell_andros, units_per_case, unit_type)
- product_pricing: channel pricing (nassau_pos, andros_pos, online_market, local_wholesale, manual_unit_price, vat_levy_pct)
- inventory: stock levels (product_id, location, cases_on_hand, units_on_hand, weight_lbs_on_hand, units_per_case, unit_type)
- inventory_movements: audit trail of all stock changes
- orders: sales records (channel, location, items jsonb, subtotal, total, payment_method, terminal_type, admin_notes, customer_id, customer_name, customer_phone, status)
- customers: customer database (full_name, phone UNIQUE, email, linked_user_id, total_orders, total_spent, first_seen_at, last_seen_at)
- promotions: day-of-week specials (product_id, channel, promo_price, day_of_week, display_label, is_active)
- suppliers: supplier records (code, name, supplier_type, contact_email, contact_phone, payment_terms)
- purchase_orders: PO records (supplier_id, invoice_number, total_amount, payment_status, payment_ref)
- purchase_order_items: line items per PO
- founder_chats: Founder AI chat sessions
- founder_messages: individual messages per chat
- founder_principles: encoded business wisdom
- yield_lots: lobster/seafood yield records
- processing_batches: Spiny Tail processing records

## PRODUCT CATEGORY ENUM
fresh_seafood, frozen_seafood, processed_seafood, meat, produce, juice_smoothie, wellness_shot, grocery, snack, beverage, household, toiletry, export_only, other

## STAFF ROSTER
- dedrick@... -> founder, all_locations
- jaquel@... -> co_founder, all_locations
- ashley@... -> manager, bsc_marketplace_nassau
- claff@... -> cashier, bsc_marketplace_nassau (primary POS tester)
- johnettelana@... -> cashier, cetas_andros
- roselins@... -> cashier, cetas_andros
- tj@... -> right_hand, all_locations (access config pending)
- bill@... -> strategist, all_locations

## KEYWORD GLOSSARY
- "Tom" / "investor" -> $550K balance, 7yr Option A, $6,940/month, $583K total payback
- "A/P" / "payables" -> $85,697 supplier + $550K Tom = $635,697 total
- "sacred rules" -> pricing margins above, NEVER change
- "Igloo" -> Miami bonded seafood hub, processing $1.75/lb, advance financing, price discovery
- "Jomara" / "Bob" -> proven lobster buyer, $108,354 across 7,025 lbs Oct-Nov 2025
- "lobster pipeline" -> Tier 1 wealth engine, Aug 2026 season, $8/lb tail direct Family Island
- "Spiny Tail" -> Nassau processing plant, 30K lb freezer, $13,134/month fixed
- "Cetas" / "Andros" -> 3,000 lb only
- "P-0005" -> multi-channel pricing
- "P-0008" -> information becomes architecture
- "P-0010" -> wellbeing, 35-day rest, next break June 4-9 2026
- "P-0013" -> yield-allocated pricing
- "Bill" / "5%" -> sacred 5% gross profit arrangement
- "Tuesday special" -> Sapphire Bay shrimp $20
- "Wednesday special" -> salmon specials
`;

const ALLOWED_TABLES = [
  'users',
  'profiles',
  'products',
  'product_pricing',
  'product_costs',
  'processing_batches',
  'founder_principles',
  'founder_documents',
  'founder_chats',
  'founder_messages',
  'suppliers',
  'inventory',
  'inventory_movements',
  'locations',
  'purchase_orders',
  'purchase_order_items',
  'wholesale_orders',
  'orders',
  'customers',
  'promotions',
  'purchase_invoices',
  'invoice_payments',
  'yield_lots',
  'local_wholesale_products',
  'quotes',
];

const TOOLS = [
  {
    name: 'query_database',
    description:
      "Query BSC's live Supabase database. Use this whenever a question requires real-time data: orders, balances, recent batches, staff status, supplier records, inventory, customers, payments, promotions, etc. Returns up to 50 rows by default. Apply filters where possible to narrow results. Available tables: " +
      ALLOWED_TABLES.join(', ') +
      '. Always prefer querying live data over assumptions when the question is operational.',
    input_schema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          enum: ALLOWED_TABLES,
          description: 'The table name to query.',
        },
        filters: {
          type: 'object',
          description:
            "Optional equality filters as key-value pairs, e.g. {status: 'completed'} or {channel: 'nassau_pos'}. Each pair becomes an .eq() filter.",
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Optional list of column names to return. Leave empty for all columns ('*').",
        },
        limit: {
          type: 'number',
          description: 'Max rows to return (default 50, max 200).',
        },
        order_by: {
          type: 'string',
          description: "Optional column to order by. Defaults to 'created_at' descending.",
        },
      },
      required: ['table'],
    },
  },
  {
    name: 'get_founder_principles',
    description:
      "Fetch Dedrick's founder principles from the founder_principles table. Use when a question is strategic or asks 'should I...' — principles encode Dedrick's logic.",
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: [
            'pricing_strategy',
            'supplier_relations',
            'customer_relations',
            'staff_management',
            'family_business',
            'wellbeing_discipline',
            'competitive_moat',
          ],
          description: 'Optional category to filter by.',
        },
        keyword: {
          type: 'string',
          description: 'Optional keyword to search principle titles and descriptions.',
        },
        limit: {
          type: 'number',
          description: 'Max principles to return (default 10, max 50).',
        },
      },
    },
  },
];

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

type AuthResult =
  | { ok: true; user: { id: string; email: string | null; role: string } }
  | { ok: false; reason: 'no_session' | 'no_user_row' | 'misconfigured' };

async function getAuthorizedUser(req: Request): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, reason: 'misconfigured' };

  let userId: string | null = null;
  let userEmail: string | null = null;

  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (bearer) {
    try {
      const supa = createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data } = await supa.auth.getUser(bearer);
      if (data?.user) {
        userId = data.user.id;
        userEmail = data.user.email ?? null;
      }
    } catch (e) {
      console.error('Bearer auth failed:', e);
    }
  }

  if (!userId) {
    try {
      const cookieStore = await cookies();
      const supa = createServerClient(url, anon, {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (toSet: CookieToSet[]) =>
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            ),
        },
      });
      const { data } = await supa.auth.getUser();
      if (data?.user) {
        userId = data.user.id;
        userEmail = data.user.email ?? null;
      }
    } catch (e) {
      console.error('Cookie auth failed:', e);
    }
  }

  if (!userId) return { ok: false, reason: 'no_session' };

  const service = getServiceClient();
  if (!service) return { ok: false, reason: 'misconfigured' };
  const { data: row } = await service
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  if (!row?.role) return { ok: false, reason: 'no_user_row' };

  return {
    ok: true,
    user: { id: userId, email: userEmail, role: row.role as string },
  };
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<unknown> {
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role not configured' };

  try {
    if (toolName === 'query_database') {
      const table = toolInput.table as string;
      if (!ALLOWED_TABLES.includes(table)) {
        return { error: `Table '${table}' is not in the allowed list.` };
      }
      const filters = (toolInput.filters as Record<string, unknown>) || {};
      const columns = (toolInput.columns as string[]) || [];
      const limit = Math.min(Number(toolInput.limit) || 50, 200);
      const orderBy = toolInput.order_by as string | undefined;

      let query = supabase
        .from(table)
        .select(columns.length ? columns.join(',') : '*')
        .limit(limit);

      for (const [col, val] of Object.entries(filters)) {
        query = query.eq(col, val);
      }

      if (orderBy) {
        query = query.order(orderBy, { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query;
      if (error) return { error: error.message };
      return { rows: data, count: data?.length ?? 0 };
    }

    if (toolName === 'get_founder_principles') {
      const category = toolInput.category as string | undefined;
      const keyword = toolInput.keyword as string | undefined;
      const limit = Math.min(Number(toolInput.limit) || 10, 50);

      let query = supabase.from('founder_principles').select('*').limit(limit);
      if (category) query = query.eq('category', category);
      if (keyword) {
        query = query.or(
          `title.ilike.%${keyword}%,description.ilike.%${keyword}%`
        );
      }

      const { data, error } = await query;
      if (error) return { error: error.message };
      return { principles: data, count: data?.length ?? 0 };
    }

    return { error: `Unknown tool: ${toolName}` };
  } catch (e) {
    console.error(`Tool ${toolName} execution error:`, e);
    return { error: e instanceof Error ? e.message : 'Tool execution failed' };
  }
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage?: { input_tokens: number; output_tokens: number };
}

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  messages: unknown[]
): Promise<AnthropicResponse> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText}`);
  }
  return res.json();
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthorizedUser(req);
    if (!auth.ok) {
      const messages = {
        no_session: 'Unauthorized — please sign in.',
        no_user_row: 'Signed in, but no staff record found. Contact Dedrick.',
        misconfigured: 'Server is missing Supabase credentials.',
      } as const;
      return NextResponse.json(
        { error: messages[auth.reason] },
        { status: auth.reason === 'misconfigured' ? 500 : 401 }
      );
    }

    const authUser = auth.user;
    if (!['founder', 'co_founder'].includes(authUser.role)) {
      return NextResponse.json(
        { error: 'Founder AI is private. Access denied for this role.' },
        { status: 403 }
      );
    }

    const { message, history = [], chatId } = await req.json();
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured.' },
        { status: 500 }
      );
    }

    const callerLabel = authUser.role === 'founder' ? 'Dedrick' : 'Jaquel';

    const systemPrompt = `You are Founder AI — Dedrick's private business assistant for Bahamian Seafood Connection. You are speaking with ${callerLabel} (role: ${authUser.role}).

You are Dedrick's second pair of eyes, strategic compass, and operational brain. You have live database access to every table in BSC's Supabase. Use it.

## YOUR PERSONALITY
- Direct and confident — no hedging, no preamble
- Warm but focused — use their name naturally
- Bahamian-aware — Nassau/Andros/Family Island context
- Honest — if you don't know, say so. Never invent numbers.
- Numbers-first — cite real BSC figures, not generic advice

## WHEN TO USE TOOLS
USE query_database when:
- Question asks about current state: orders, sales, inventory, balances, customers
- Need today's data (orders placed, revenue, stock levels)
- Checking any operational table

USE get_founder_principles when:
- Strategic or philosophical questions
- "Should I..." questions where principles should filter the answer

DO NOT use tools for:
- Pure conceptual questions
- Sacred pricing math (do it yourself with the rules below)

After tool calls, synthesize in your voice. Pull meaningful figures, don't dump raw rows.

## SACRED PRICING RULES (NON-NEGOTIABLE)
- Nassau POS: cost / 0.62 (38% margin) — VAT 0% food
- Andros POS: cost / 0.57 (43% margin) — VAT 0% food
- Online Market: cost / 0.75 (25% margin)
- Local Wholesale: cost / 0.88 (12% margin)
- Bill Casale: 5% gross profit (SACRED — never lower, never discuss changing)

## HOW YOU ANSWER STRATEGY QUESTIONS
- Use real BSC numbers from live data + context below
- Cite founder principles by code (P-0005, P-0008, P-0010, P-0013)
- Consider $20,074/month minimum cash burn when discussing breakeven
- Respect 35-day rest cycle — next break June 4-9 2026 (P-0010)

## FORMATTING (mobile-first)
- Lead with the answer — no preamble
- Short paragraphs
- Bold for key numbers
- Code style for SKUs and formulas
- Lists only for 3+ items

${BSC_CONTEXT}`;

    interface MessageHistoryItem {
      role: string;
      content: string;
    }

    const messages: unknown[] = [
      ...history.map((m: MessageHistoryItem) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    let response: AnthropicResponse | null = null;
    const MAX_ITERATIONS = 5;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      response = await callAnthropic(apiKey, systemPrompt, messages);
      if (response.stop_reason !== 'tool_use') break;

      const toolUses = response.content.filter((b) => b.type === 'tool_use');
      if (toolUses.length === 0) break;

      const toolResultBlocks = await Promise.all(
        toolUses.map(async (tool) => {
          const result = await executeTool(
            tool.name as string,
            tool.input as Record<string, unknown>
          );
          return {
            type: 'tool_result',
            tool_use_id: tool.id as string,
            content: JSON.stringify(result),
          };
        })
      );

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResultBlocks });
    }

    if (!response) {
      return NextResponse.json(
        { error: 'No response from Claude API' },
        { status: 500 }
      );
    }

    const finalText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .filter(Boolean)
      .join('\n')
      .trim();

    return NextResponse.json({
      reply: finalText || 'I had trouble generating a response. Try again.',
      chatId,
      usage: response.usage,
      caller: callerLabel,
    });
  } catch (err) {
    console.error('Founder AI error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown server error' },
      { status: 500 }
    );
  }
}
