import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BSC_CONTEXT = `
# BAHAMIAN SEAFOOD CONNECTION (BSC MARKETPLACE)
## Master Business Context - V6 - Updated May 6, 2026 (Day 6.7 of 14)

## OWNERSHIP & FAMILY
- Founder: Dedrick Tamico Storr Snr (bahamianseafoodconnection@gmail.com, mobile +1-242-359-0285)
- Co-Founder: Jaquel Rolle-Storr (wife, full operational authority)
- Family-owned & operated, proudly Bahamian
- Live website: bscbahamas.com
- Repo: github.com/bahamianseafoodconnection-collab/bsc-dashboard

## OPERATIONAL ENTITIES
- Spiny Tail Processing Plant: Firetrail Road, Nassau (operations face)
- BSC Marketplace: retail/wholesale arm (public face)
- Bahamian Seafood Connection: parent entity (kept quiet, reveals stronger later)

## LOCATIONS
- HQ & Processing Plant: Firetrail Road, Nassau, Bahamas (Spiny Tail facility)
- Cold Storage: Mastic Point, North Andros (capacity 30,000 lbs, current 9,310 lbs = 31%)
- Service Areas: Nassau (primary) + Andros (Family Island)

## CONTACT
- Office: +1 (242) 558-4495
- Mobile: +1 (242) 359-0285
- WhatsApp: +1 (242) 361-3474
- Recovery number being reactivated: +1 (242) 821-6180 (BTC suspended)
- Primary email: bahamianseafoodconnection@gmail.com

## BUILD CADENCE
- 14-day sprint, currently Day 6.7 (~48% complete)
- Operations mode: iPhone Safari only (NO laptop)
- All deploys: GitHub web -> commit -> Vercel auto-deploy
- Mobile-only ergonomics: full file replacements only, no partial edits

## SACRED PRICING RULES (NON-NEGOTIABLE)
- Nassau POS: 38% margin -> cost x 1.38 x 1.10 VAT
- Andros POS: 43% margin -> cost x 1.43 x 1.10 VAT
- Online Market: 25% margin -> cost x 1.25 x 1.10 VAT
- Local Wholesale: 12% margin + 10% VAT -> cost x 1.12 x 1.10
- US Stores resale: cost + $0.60/lb shipping + duty + 12% margin + VAT
- Bill Payments: 4.5% cost-of-doing-business fee + $6 service fee
- Bill Casale: 5% gross profit (SACRED, never lower)

## MONTHLY FIXED COSTS
- Total: $20,590/month

## SUPPLY CHAIN

### Tropic Seafood (PRIMARY WHOLESALE SUPPLIER to BSC)
- Address: Gladstone Road, Nassau
- Snapper Portion 6/8oz CO: cost $11.60
- Bulk Whole Grouper: cost $5.00
- #2 Lobster Tail Meat: cost $7.50
- Premium Lobster Tail Meat: cost $12.50
- Snow Crab Clusters: cost $17.95
- 16/20 P&D T/On Shrimp: cost $6.99
- Beef NY Strip 8oz: cost $12.75
- Beef Ribeye CAB 9-12oz: cost $13.75
- Mahi Fillet 7/9oz: cost $2.59
- Swai Fillet: cost $2.59

### Active Promo
- Tuesday Shrimp: TROPIC-SHRIMP-1620 active SKU (activated Day 6.5)

### BSC Direct Suppliers
- Anthony Taylor: 1,000 lbs conch @ $6.00/lb on May 4, 2026 ($6,000)
- Manny: supplier diversification target. Letter sent 2026-05-05. Phone 1-242-359-0285. Last name + boat reg PENDING.
- Ben Fische: 50,000 lb bulk grouper opportunity. Projection: 27,880 steaks / 15,165 head / 6,955 loss. Small batch test pending.
- Father and Sons: joint grouper purchase May 6, 2026. 2,986 lbs total. F&S share 951.60 lbs. Outstanding balance $836.40 after credits and delivery.

### 7 Local Wholesale Partners
1. Asa H Pritchard - AHP - #1B4F72
2. Bahamas International Food - BIF - #1E5C2E
3. D'Albenas - DAL - #784212
4. Bahamas Wholesale Agencies - BWA - #1A5276
5. TPG - TPG - #2C3E50
6. Thompson Trading - TTR - #922B21
7. Island Wholesale - ISW - #196F3D

## US SHOPPING SERVICE (Florida)
- Sam's Club, BJ's Wholesale, Costco, Walmart, FL Steakhouse
- US partner: Jorge (jorge@fnsfoods.com, role partner_us)
- BSC US standalone brand naming: post Day 14
- Igloo Express contract terms: pre-Aug 2026

## TECHNOLOGY STACK
- Framework: Next.js 14
- Database: Supabase Postgres (project: qgcaxkyuhwmpvpbooaqw)
- Hosting: Vercel
- AI: Anthropic Claude
- Styling: inline styles (NO Tailwind)

## SCHEMA INTELLIGENCE
- users: staff records (role enum, primary_location, is_active, last_login_at, activation_token)
- profiles: customer records (SEPARATE from staff)
- products: SKUs (.barcode column for scanner, NOT .upc)
- product_costs: 23 columns, supports yield-allocated cost basis
- processing_batches: 31 columns, raw -> finished conversions, auto batch_number trigger
- founder_principles: 17 columns, CHECK on confidentiality_level (public/internal/confidential/trade_secret)
- suppliers: is_fleet_owner + yield_data_visible flags
- purchase_invoices: invoice_ref, location, total_amount, balance_owed, status, items, summary
- invoice_payments: invoice_id, amount, note, order_id
- yield_lots: lot_number, captain_name, boat_reg, product_type, whole_weight_lb, clean_weight_lb, yield_pct, cost_paid, true_cost_per_lb, channel pricing columns

## ENUMS
- user_role: founder, co_founder, manager, supervisor, processor, cashier, right_hand, strategist, supplier, partner_us
- batch_status: draft, in_progress, completed, approved, rejected, reversed
- pricing_channel: nassau_pos, andros_pos, online_market, local_wholesale, us_resale, bill_payments, bill_casale
- supplier_type: tropic_seafood, wholesale_partner, bsc_direct, us_partner

## STAFF ROSTER (11 USERS)
- dedrick@... -> founder, all_locations (last login 2026-05-06)
- jaquel@... -> co_founder, all_locations
- ashley@... -> manager, bsc_marketplace_nassau
- claff@... -> cashier, bsc_marketplace_nassau
- johnettelana@... -> cashier, cetas_andros
- roselins@... -> cashier, cetas_andros
- johnette@... -> manager, all_locations
- tj@... -> right_hand, all_locations
- bill@... -> strategist, all_locations
- jorge@fnsfoods.com -> partner_us
9 staff inactive. Activation flow planned at /staff/activate.

## REAL OPERATIONAL DATA

### BSC's 2nd-ever yield (May 5, 2026 - batch 2026-0001)
- Whole grouper input: 79.8 lb @ $5.00/lb + $57.48 cutting = $456.48
- Steaks: 44.5 lb (55.76%), Head: 24.2 lb (30.33%), Loss: 11.1 lb (13.91%)
- Equal-weight cost basis: $6.6446/lb
- Sacred pricing per channel:
  - Nassau POS: $10.09/lb
  - Andros POS: $10.45/lb
  - Online Market: $9.14/lb
  - Wholesale: $8.18/lb

### Father and Sons grouper transaction (May 6, 2026)
- Total grouper purchased: 2,986.00 lbs (Spiny Tail 2,034.40 + F&S 951.60)
- Spiny Tail cost basis: $10,172.00 @ $5.00/lb
- F&S payments: $5,000 cash to fisherman + $951.60 processing fee = $5,951.60
- F&S product credits: 140 lbs grouper fillet @ $15.99 + 180.9 lbs whole conch @ $6.00 = $3,324.00
- Conch delivery $60 paid by F&S (credit)
- Outstanding F&S balance: $836.40

## STRATEGIC DECISION PENDING - GROUPER HEAD PRICING
Equal-weight values head at $6.6446/lb. Nassau soup market pays $3-5/lb. Decision: equal-weight (audit-clean) vs value-allocated (market-realistic).

## CURRENT BUILD STATE (Day 6.7)

### SHIPPED
- Day 5: Schema discovery (17 enums, 5 RPCs, 11 staff)
- Day 6: Phone barcode scanner code in repo (BUGGED in prod)
- Day 6.5: Grouper yield captured (batch 2026-0001)
- Day 6.7 Phase 1: Staff sign-in works at /staff-login
- Middleware simplified to session-only check
- is_staff() rebuilt with plpgsql + recursion-safe pattern
- Activation token columns added
- Manny letter sent 2026-05-05
- May 6, 2026: Founder AI build error fixed (createClient inside handler)
- May 6, 2026: Multiple build fixes shipped (login, market, invoice-save dynamic rendering)
- May 6, 2026: Conch export permit Letter 1 of 2 drafted (firm + escalation)
- May 6, 2026: Conch quota Letter 2 of 2 drafted to Director Lester Gittens (50,000 lbs request, warm tone, PDF generated)

### ACTIVE BUGS
1. /inventory/scan crashes - is_staff() called 99x per request (recursion). Bisect plan: replace page.tsx with Hello World.
2. Multiple pages need 'force-dynamic' export (still being audited): /orders confirmed, others probable.

### Day 6.7 PHASES REMAINING
- Phase 2 (3 files): dashboard scanner tile + /inventory hub + hub nav
- Phase 3 (2 files): /processor server gate + client UI
- Phase 4: approval workflow (processor entries -> draft -> founder review)
- Activation flow: /staff/activate page

### Day 7-14 QUEUED
- Day 7: Invoice scanner enhancement
- Day 8: Yield calculator surfacing
- Day 9: Customer wholesale orders + approval queue
- Day 10: Vehicle + bills + utilities
- Day 11: Supplier portal
- Day 12: Notification infrastructure (email + WhatsApp + SMS)
- Day 13: Reports & analytics + Founder AI integration
- Day 14: Polish + V7 prompt

## STRATEGIC DECISIONS LOCKED
- Approval workflow: processor submits -> draft -> founder review -> accept/reject
- Sign-in doors: 3 separate per audience (locked)
- Brand strategy: Spiny Tail + BSC Marketplace public, BSC Connection quiet for now

## FOUNDER PRINCIPLES ENCODED
- P-0005: Multi-channel pricing (encoded in pricing_channel enum)
- P-0008: Information becomes architecture
- P-0010: Wellbeing discipline (35-day rest cycle, next break June 4-9 2026, Jaquel enforcement)
- P-0013: Yield-allocated pricing (captured 2026-05-05 from grouper)

## OUTSTANDING OPERATIONAL ITEMS
- Conch export permit Letter 1 (sent)
- Conch quota Letter 2 to Director Gittens (sent)
- Manny letter SENT 2026-05-05 (watch reply)
- Strategic head pricing decision PENDING
- BTC phone reactivation PENDING
- Facebook account recovery PENDING
- RBC API keys PENDING (bctmsr@rbc.com)
- Old Vercel failed builds cleanup PENDING
- Father and Sons balance $836.40 awaiting settlement

## KEYWORD ACTIVATION GLOSSARY
When Dedrick uses these terms, immediately activate the related context:
- "yield" / "grouper" / "batch" / "P-0013" -> batch 2026-0001, $6.6446/lb basis, 4-channel pricing, head decision pending
- "Father and Sons" / "F&S" -> May 6 joint grouper, $836.40 outstanding, 2,034.40 lbs Spiny Tail share
- "head pricing" / "value-allocated" / "equal-weight" -> decision pending; $3-5/lb Nassau soup vs $6.6446 equal
- "Manny" -> letter sent 2026-05-05, diversification clock, captures pending
- "Ben Fische" -> 50,000 lb bulk grouper, projection 27,880/15,165/6,955, small batch test pending
- "conch" / "Director Gittens" / "quota" / "permit" -> Letters 1 and 2 of 2 sent, 50,000 lbs request, awaiting reply
- "Spiny Tail" -> Firetrail Rd Nassau, processing plant, 9,310/30,000 lb freezer
- "scanner" / "/inventory/scan" -> BUGGED, recursion 99x is_staff calls, bisect plan ready
- "founder-ai" / "Founder AI" -> this AI, integrated with Supabase live data via tools as of Day 6.7+
- "Bill" / "Bill Casale" -> strategist, bill_casale channel (5% gross profit SACRED)
- "Jaquel" -> co-founder, full operational + P-0010 enforcement authority
- "Ashley" / "TJ" / "Jorge" -> staff awaiting activation
- "P-0005" -> multi-channel pricing
- "P-0008" -> information becomes architecture
- "P-0010" -> wellbeing, 35-day rest, Jaquel enforces, next break June 4-9
- "P-0013" -> yield-allocated pricing
- "processor" / "approval queue" -> Phase 4 workflow draft->review
- "activation" / "must_change_password" -> /staff/activate, 9 staff inactive
- "is_staff" -> RPC rebuilt 2026-05-06 plpgsql recursion-safe
- "RBC" -> Plug & Pay, keys pending bctmsr@rbc.com
- "BTC" -> phone reactivation pending
- "iOS" / "phone debugging" -> mobile-only ops, full file replacements, ASCII straight quotes only
- "V6" / "V7" -> migration prompt versioning

## RECENT BUSINESS NOTES
- May 4, 2026: Anthony Taylor conch (1,000 lbs @ $6.00)
- May 5, 2026: Grouper yield captured, P-0013 encoded, Manny letter sent, Tuesday Shrimp activated
- May 6, 2026: Day 6.7 Phase 1 staff sign-in shipped, is_staff() rebuilt
- May 6, 2026: Founder AI build error fixed
- May 6, 2026: Multiple build fixes (login/market/invoice-save dynamic)
- May 6, 2026: invoice-save schema mismatch caught - yield_lots inserts had been silently failing
- May 6, 2026: Conch permit + quota letters drafted
- May 6, 2026: Father and Sons reconciliation completed
- May 6, 2026: Founder AI v2 brain dump deployed and tested
- May 6, 2026: Founder AI live database integration deployed (this version)
`;

const ALLOWED_TABLES = [
  'users',
  'profiles',
  'products',
  'product_costs',
  'processing_batches',
  'founder_principles',
  'founder_documents',
  'suppliers',
  'inventory_movements',
  'locations',
  'purchase_orders',
  'wholesale_orders',
  'orders',
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
      "Query BSC's live Supabase database. Use this whenever a question requires real-time data: balances, recent batches, staff status, supplier records, inventory, orders, payments, etc. Returns up to 50 rows by default. Apply filters where possible to narrow results. Available tables: " +
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
            "Optional equality filters as key-value pairs, e.g. {status: 'unpaid'} or {role: 'founder'}. Each pair becomes an .eq() filter. Leave empty to fetch all rows up to limit.",
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Optional list of column names to return. Leave empty for all columns ('*'). Useful for keeping responses focused.",
        },
        limit: {
          type: 'number',
          description: 'Max rows to return (default 50, max 200).',
        },
        order_by: {
          type: 'string',
          description: "Optional column to order by. Defaults to 'created_at' descending if column exists.",
        },
      },
      required: ['table'],
    },
  },
  {
    name: 'get_founder_principles',
    description:
      "Fetch Dedrick's founder principles (business wisdom encoded in the founder_principles table). Use this when a question is strategic, philosophical, or asks 'should I...' — the principles encode Dedrick's logic and should filter the answer. Returns principle codes, descriptions, and confidentiality levels.",
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

// Result codes so the POST handler can return distinct error messages
// instead of one generic "Unauthorized" that hides what actually broke.
type AuthResult =
  | { ok: true; user: { id: string; email: string | null; role: string } }
  | { ok: false; reason: 'no_session' | 'no_user_row' | 'misconfigured' };

async function getAuthorizedUser(req: Request): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, reason: 'misconfigured' };

  // Try two paths in order:
  //   1. Authorization: Bearer <jwt>  — works when the client passes the
  //      access token explicitly (see app/dashboard/page.tsx). Most robust;
  //      doesn't depend on cookie chunking or whatever Supabase did with
  //      the SSR cookie format this week.
  //   2. SSR cookies — works for server components and pages that signed
  //      in via @supabase/ssr's createBrowserClient.
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

  // Role lookup uses the service client (bypasses RLS).
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
  if (!supabase) {
    return { error: 'Service role not configured' };
  }

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
        // try created_at if not specified; ignore failure
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

      let query = supabase
        .from('founder_principles')
        .select('*')
        .limit(limit);

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
      model: 'claude-sonnet-4-5',
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
    // 1. AUTH GATE — only Dedrick or Jaquel
    const auth = await getAuthorizedUser(req);
    if (!auth.ok) {
      const messages = {
        no_session: 'Unauthorized — please sign in.',
        no_user_row:
          'Signed in, but no staff record found for your account. Contact Dedrick.',
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

    // 2. Parse request
    const { message, history = [], chatId } = await req.json();
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // 3. API key check
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured.' },
        { status: 500 }
      );
    }

    // 4. Build system prompt + messages
    const callerLabel = authUser.role === 'founder' ? 'Dedrick' : 'Jaquel';
    const systemPrompt = `You are Founder AI - a private business assistant for Bahamian Seafood Connection (BSC Marketplace). You are speaking right now with ${callerLabel} (role: ${authUser.role}).

You are Dedrick's second pair of eyes, ears, and thinking. You see what he sees through live database access. You think through his principles. You make his vision and goals operational reality.

## YOUR PERSONALITY
- Direct and confident - the founders built this business, they don't need hedging
- Warm but focused - address them by name when natural
- Bahamian-aware - Nassau/Andros context, Family Island culture
- Honest - if you don't know something, say so. Never make up numbers.
- Numbers-first when relevant - cite real BSC figures, not generic advice

## WHEN TO USE TOOLS
You have two tools that read BSC's live Supabase database:
- query_database: read any operational table (invoices, batches, products, suppliers, orders, etc.)
- get_founder_principles: fetch the principles that encode Dedrick's logic

USE TOOLS when:
- The question asks about current state, balances, who, what, when, how much
- Strategic questions where principles should filter the answer
- Anything that changed recently (don't rely only on the V6 context dated May 6)

DO NOT use tools when:
- Pure conceptual / explanatory questions
- The V6 context already has the exact answer (e.g., sacred pricing margins)

After tool calls, synthesize the answer in your voice using the live data. Don't dump raw rows — pull the meaningful figures and explain them.

## HOW YOU ANSWER PRICING QUESTIONS
ALWAYS apply Dedrick's sacred pricing rules exactly:
- Nassau POS: cost x 1.38 x 1.10 VAT
- Andros POS: cost x 1.43 x 1.10 VAT
- Online Market: cost x 1.25 x 1.10 VAT
- Local Wholesale: cost x 1.12 x 1.10 VAT
- Bill Casale: 5% gross profit (SACRED — never lower)
For grouper: use Day 6.5 yield-allocated $6.6446/lb unless head pricing decision changes.

## HOW YOU ANSWER STRATEGY QUESTIONS
- Use real BSC numbers from live data + V6 context
- Cite founder principles by code (P-0005, P-0008, P-0010, P-0013)
- Consider $20,590/month fixed cost when discussing breakeven
- Respect the 35-day rest cycle when stress signals appear

## HOW YOU ANSWER WELLBEING QUESTIONS (P-0010)
If Dedrick mentions feeling defeated, overworked, or stressed:
- Acknowledge without dismissing
- Reference the 35-day rest cycle (next break: June 4-9, 2026)
- Remind him Jaquel has full enforcement authority
- Cite P-0010 explicitly when appropriate
- Brief, real, supportive — not preachy

## FORMATTING
- Lead with the answer, no preamble
- Short paragraphs on phone screens
- Markdown bold for key numbers
- Code style for SKUs, formulas, enum values
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

    // 5. Tool loop (max 5 iterations)
    let response: AnthropicResponse | null = null;
    const MAX_ITERATIONS = 5;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      response = await callAnthropic(apiKey, systemPrompt, messages);

      if (response.stop_reason !== 'tool_use') break;

      const toolUses = response.content.filter((b) => b.type === 'tool_use');
      if (toolUses.length === 0) break;

      // Execute each tool
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

    // 6. Extract final text
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
