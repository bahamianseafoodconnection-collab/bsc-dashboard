// Tools the Founder AI can invoke during a conversation.
//
// READ tools (anyone authenticated):
//   read_file       — only paths under app/, lib/, components/,
//                     supabase/migrations/. No "..", no absolute paths.
//   query_db        — SELECT only. Schema confined to "public".
//                     Filter values are passed to Supabase client which
//                     parametrizes them (no SQL injection vector).
//   recent_orders   — thin wrapper around query_db with sane defaults.
//   health_check    — runs the anomaly scanner; no input, read-only.
//
// WRITE tools (founder + co_founder only — verified per call):
//   add_product            — INSERTs into products + product_pricing
//                            (+ optional product_costs). Two-step:
//                            confirmed=false returns a preview;
//                            confirmed=true performs the insert.
//   set_product_channels   — UPDATEs sell_nassau / sell_andros /
//                            sell_online / sell_wholesale on an
//                            existing product. Same confirm pattern.
//
// Every write attempt is logged to ai_writes (success | denied | error)
// regardless of outcome, so nothing the AI does is off the record.

import type { SupabaseClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { healthCheck } from './health-check';
import { buildBlastHtml, sendBatch } from './email';
import { calculatePrice, vatPctForCategory, type PricingChannel, type SaleUnit } from './pricing';

const REPO_ROOT = process.cwd();
const ALLOWED_READ_PREFIXES = [
  'app/',
  'lib/',
  'components/',
  'supabase/migrations/',
];
const MAX_FILE_CHARS = 50_000;

// Roles that can call write tools (add_product, set_product_channels,
// send_email_blast, create_flyer, set_flyer_active).
//
// control_admin is the actual role on Dedrick's + Jaquel's profiles in
// production (the AppShell STAFF_ROLES allowlist requires it for dashboard
// access). 'founder' / 'co_founder' kept for forward-compat if the role
// schema ever splits.
const WRITE_ROLES = new Set(['founder', 'co_founder', 'control_admin']);
const VALID_CHANNELS = new Set(['nassau_pos', 'andros_pos', 'online_market', 'local_wholesale', 'wholesale']);

export const TOOLS = [
  {
    name: 'read_file',
    description:
      'Read the contents of a file in the BSC dashboard codebase. Use this to look up how a page works, what columns a query selects, what business rule a function enforces, or what a migration changed. Only paths under app/, lib/, components/, supabase/migrations/ are readable.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Path relative to the repo root. Examples: "app/pos/page.tsx", "lib/profit.ts", "supabase/migrations/20260515220000_enforce_lock_trigger.sql".',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'query_db',
    description:
      'Run a SELECT against any table in the public schema. Use this when the founder asks about live data — customers, orders, expenses, products, staff, catch_logs, processing_logs, etc. Read-only. Returns up to 100 rows.',
    input_schema: {
      type: 'object',
      properties: {
        table:    { type: 'string', description: 'Table name in the public schema. e.g. "orders", "customers", "expenses".' },
        columns:  { type: 'string', description: 'Comma-separated column list, or "*" for all. Default "*".' },
        filters:  { type: 'object', description: 'Map of column → exact value. Translates to .eq() filters.' },
        gte:      { type: 'object', description: 'Map of column → value for "greater than or equal" filters.' },
        order_by: { type: 'string', description: 'Column to order by. Prefix "-" for descending. Example: "-created_at".' },
        limit:    { type: 'number', description: 'Max rows. Default 20, cap 100.' },
      },
      required: ['table'],
    },
  },
  {
    name: 'recent_orders',
    description:
      'Convenience: return the most recent orders. Use this when the founder asks "what sold today" or "show me the last N sales".',
    input_schema: {
      type: 'object',
      properties: {
        limit:      { type: 'number', description: 'How many. Default 20, cap 100.' },
        order_type: { type: 'string', description: 'Filter to a channel: pos_sale_nassau, pos_sale_andros, online_market, wholesale.' },
      },
    },
  },
  {
    name: 'health_check',
    description:
      'Run the anomaly scanner. Returns a categorized list of findings (schema drift, margin alerts, operational alerts). Use this when the founder asks "what is broken", "what should I worry about", "anything wrong".',
    input_schema: { type: 'object', properties: {} },
  },

  // ── WRITE TOOLS — founder/co_founder only, two-step confirmation ────

  {
    name: 'add_product',
    description:
      'CREATE a new product. Founder/co_founder ONLY. TWO-STEP: first call with confirmed=false to get a preview of what will be inserted; show that preview to the founder; only call again with confirmed=true after the founder explicitly says yes. Channels in `pricing` determine which sell_* flags get turned on automatically.',
    input_schema: {
      type: 'object',
      properties: {
        name:             { type: 'string', description: 'Product display name. e.g. "Pig Feet".' },
        sku:              { type: 'string', description: 'Unique SKU. e.g. "PIG-FEET-BB".' },
        category:         { type: 'string', description: 'product_category enum value. Common: "fresh_seafood", "frozen_seafood", "meat", "produce", "grocery".' },
        unit_of_measure:  { type: 'string', description: 'Storage unit. "each", "lb", "case", or "kit".' },
        unit_type:        { type: 'string', description: 'Optional. Set to "lb" for per-pound items (POS shows weight input). Omit for fixed-price.' },
        is_bsc_processed: { type: 'boolean', description: 'True if Spiny Tail processes it.' },
        primary_supplier_id: { type: 'string', description: 'Optional UUID of the supplier. Leave out if no supplier link.' },
        pricing: {
          type: 'array',
          description: 'One entry per channel the product should be sold on. Each: {channel, price}. Valid channels: nassau_pos, andros_pos, online_market, local_wholesale.',
          items: {
            type: 'object',
            properties: {
              channel: { type: 'string' },
              price:   { type: 'number' },
            },
            required: ['channel', 'price'],
          },
        },
        cost_per_unit: { type: 'number', description: 'Optional. Product cost. Used for cost reporting + per-transaction allocation math.' },
        stock_lbs:     { type: 'number', description: 'Optional starting inventory in lbs.' },
        image_url:     { type: 'string', description: 'Optional. Public URL of the product photo. When the founder uploads a photo in chat, the persisted URL appears in a "📷 Uploaded image" text block in the user turn — pass that URL here so /market displays the photo on the product card. Must be a fully-qualified https:// URL.' },
        description:   { type: 'string', description: 'Optional. Short customer-facing description shown on /market and product pages. Extract from any photo you were shown (label text, ingredients, weight, brand) when relevant.' },
        vat_category:  { type: 'string', description: 'Bahamas tax classification. "uncooked_food" (default — zero-rated, covers raw seafood/produce/grocery), "cooked_prepared" (taxable category — juice bar smoothies, kitchen-prepped meals), or "service" (zero-rated — labour). When the photo shows a smoothie / juice / hot food, pass "cooked_prepared". For raw seafood, frozen seafood, packaged grocery, or produce, omit or pass "uncooked_food".' },
        confirmed:     { type: 'boolean', description: 'MUST be true to perform the insert. False (or omitted) returns a preview only.' },
      },
      required: ['name', 'sku', 'category', 'unit_of_measure', 'pricing'],
    },
  },
  {
    name: 'set_product_channels',
    description:
      'Toggle which channels (Nassau POS / Andros POS / Online Market / Wholesale) an EXISTING product is sold on. Founder/co_founder ONLY. Two-step confirm.',
    input_schema: {
      type: 'object',
      properties: {
        sku:            { type: 'string' },
        sell_nassau:    { type: 'boolean' },
        sell_andros:    { type: 'boolean' },
        sell_online:    { type: 'boolean' },
        sell_wholesale: { type: 'boolean' },
        confirmed:      { type: 'boolean', description: 'MUST be true to perform the update. False returns a preview.' },
      },
      required: ['sku'],
    },
  },
  {
    name: 'list_flyers',
    description:
      'List the marketplace flyers (live + scheduled + inactive). Read-only. Use this before create_flyer / set_flyer_active so you can show the founder what already exists and avoid duplicates.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'create_flyer',
    description:
      'CREATE a new marketplace flyer (promotional banner shown on /market). Founder/co_founder ONLY. TWO-STEP: first call with confirmed=false to get a preview (the rendered fields); show the founder; only call again with confirmed=true after explicit yes. Multiple live flyers rotate in the carousel sorted by display_order DESC.',
    input_schema: {
      type: 'object',
      properties: {
        title:            { type: 'string', description: 'Bold headline. 3-8 words.' },
        body:             { type: 'string', description: 'One-line supporting text. Keep under 120 chars for mobile.' },
        image_url:        { type: 'string', description: 'Optional. Background image URL (overlaid on background_color).' },
        cta_label:        { type: 'string', description: 'Button label. Defaults to "Shop Now".' },
        cta_url:          { type: 'string', description: 'Where the banner links to. Defaults to "/market". Use "/market?category=Seafood" etc. for filtered views.' },
        background_color: { type: 'string', description: 'CSS color. Defaults to "#060d1f" (BSC navy).' },
        text_color:       { type: 'string', description: 'CSS color for title/body. Defaults to "#f5c518" (BSC gold).' },
        valid_from:       { type: 'string', description: 'Optional ISO 8601 timestamp. If omitted, flyer is live immediately.' },
        valid_to:         { type: 'string', description: 'Optional ISO 8601 timestamp. If omitted, flyer stays live until manually disabled.' },
        display_order:    { type: 'number', description: 'Higher = shown first in the carousel. Default 0.' },
        confirmed:        { type: 'boolean', description: 'MUST be true to insert. False (or omitted) returns a preview.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'set_flyer_active',
    description:
      'Toggle a flyer ON or OFF (changes is_active). Founder/co_founder ONLY. Use list_flyers first to find the flyer_id.',
    input_schema: {
      type: 'object',
      properties: {
        flyer_id:  { type: 'string', description: 'UUID of the flyer.' },
        is_active: { type: 'boolean', description: 'true to enable, false to disable.' },
      },
      required: ['flyer_id', 'is_active'],
    },
  },
  {
    name: 'demand_pattern',
    description:
      'Read-only behavioral analytics. Returns either (a) top products that sell on a given day-of-week, or (b) a single customer\'s buying pattern across all 7 days + their most-bought items. Use this when the founder asks things like "what sells on Wednesday", "who buys snapper", "show me Jaquel\'s pattern", or "what does the Smith family always order".',
    input_schema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: '"product_by_day" for top products on a given DOW, or "customer" for a single customer\'s full pattern.',
        },
        day_of_week: { type: 'number', description: 'Required when mode=product_by_day. 0=Sunday, 1=Monday, …, 6=Saturday.' },
        customer_id: { type: 'string', description: 'Required when mode=customer. UUID of the customer.' },
        lookback_days: { type: 'number', description: 'Optional window. Defaults to 90 days.' },
      },
      required: ['mode'],
    },
  },
  {
    name: 'send_email_blast',
    description:
      'Send an email blast to BSC customers who opted in. Founder/co_founder ONLY. TWO-STEP: first call with confirmed=false to get a preview (recipient count + the rendered HTML); the founder must explicitly say YES; only then call again with confirmed=true. The blast body is wrapped in the standard BSC layout with a CAN-SPAM-compliant footer + one-click unsubscribe link. Filter the audience by `audience` — recommend `all_opted_in` unless the founder is targeting a specific cohort.',
    input_schema: {
      type: 'object',
      properties: {
        subject:    { type: 'string', description: 'Email subject line. Keep under 60 chars for inbox preview.' },
        headline:   { type: 'string', description: 'Big bold headline at the top of the email. e.g. "This Week\'s Catch."' },
        body_html:  { type: 'string', description: 'HTML body (already in <p>/<a> tags). Will be wrapped in the BSC layout. Keep it short — 2-4 paragraphs max.' },
        audience:   { type: 'string', description: 'Which opted-in customers to target. Options: "all_opted_in" (everyone with consent=true), "nassau_pos_opted_in" (consent_source=nassau_pos), "newsletter_opted_in" (consent_source=newsletter), "signup_opted_in" (consent_source=signup). Default: all_opted_in.' },
        confirmed:  { type: 'boolean', description: 'MUST be true to actually send. False (or omitted) returns a preview only (recipient count + rendered HTML for first customer).' },
      },
      required: ['subject', 'headline', 'body_html'],
    },
  },
  {
    name: 'list_customers',
    description:
      'Filtered list of BSC customers with their lifetime stats. Use when the founder asks things like "show me my top spenders", "who has email consent", "list customers from Nassau POS", "who hasn\'t ordered in 90 days". Read-only. Returns up to 50 rows by default. Excludes the singleton Walk-In Anonymous record.',
    input_schema: {
      type: 'object',
      properties: {
        search:          { type: 'string', description: 'Optional substring match on full_name / phone / phone_e164 / email.' },
        opted_in_only:   { type: 'boolean', description: 'If true, only customers with email_marketing_consent=true. Default false.' },
        consent_source:  { type: 'string', description: 'Filter by where consent was captured: "nassau_pos","newsletter","signup".' },
        origin_channel:  { type: 'string', description: 'Filter by the channel that first created the customer: "nassau_pos","andros_pos","online","qr_scan","wholesale","imported".' },
        min_total_spent: { type: 'number', description: 'Only customers with total_spent >= this BSD amount.' },
        min_total_orders:{ type: 'number', description: 'Only customers with total_orders >= this count.' },
        last_seen_within_days: { type: 'number', description: 'Only customers active within the last N days.' },
        last_seen_before_days: { type: 'number', description: 'Only customers whose last_seen_at is OLDER than N days (use to find dormant / lost customers).' },
        sort_by:         { type: 'string', description: '"total_spent" (default) | "total_orders" | "last_seen" | "name".' },
        limit:           { type: 'number', description: 'Default 50, max 200.' },
      },
    },
  },
  {
    name: 'segment_customers',
    description:
      'Group BSC customers into segments with counts + dollar totals. Use when the founder asks "how many customers are big spenders", "which cohort is lapsing", "break down customers by recency / frequency / origin / consent". Read-only. Each segment returns: name, count, total_spent_sum, avg_spent, plus up to 5 sample customer ids.',
    input_schema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: '"recency" (active<30d, dormant 30-90d, lapsed 90-180d, lost 180d+) · "frequency" (occasional 1-2 orders, regular 3-9, loyal 10+) · "monetary" (small <$50, mid $50-200, big $200+) · "origin" (group by origin_channel) · "consent" (opted-in vs not, by source).',
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'suggest_product_sku',
    description:
      'READ-ONLY. Generate up to 3 candidate SKUs for a NEW product and collision-check each against existing products.sku. ALWAYS call this BEFORE add_product when creating a product from a chat photo so the founder picks a SKU that matches BSC conventions and is guaranteed unique. If a barcode is provided and an existing product already has it, that match is returned so the AI can ask whether to update the existing product instead of creating a duplicate. Conventions: prefix with supplier code (BWA / SYSCO / BSC / LS), then name slug, then a short random tag if needed to avoid collisions.',
    input_schema: {
      type: 'object',
      properties: {
        name:          { type: 'string', description: 'Product name. Required. Example: "Pig Feet 5lb bag".' },
        supplier_code: { type: 'string', description: 'Optional short supplier code (BWA, SYSCO, BSC, LS, etc.). Drives the SKU prefix. If omitted and supplier_id is provided, looked up from suppliers.code. Default prefix: BSC.' },
        supplier_id:   { type: 'string', description: 'Optional supplier UUID. Used only if supplier_code is not given.' },
        barcode:       { type: 'string', description: 'Optional UPC/EAN/numeric barcode read off the label. Used (1) to detect an existing product with this barcode, (2) as a fallback SKU shape using the last 8 digits.' },
        category:      { type: 'string', description: 'Optional product category. Reserved for future shape rules (currently ignored).' },
      },
      required: ['name'],
    },
  },
  {
    name: 'explode_product',
    description:
      'EXPLODE a wholesale/case parent product into one or more retail-portion child products. Founder/co_founder ONLY. TWO-STEP: first call with confirmed=false to get a preview (every child SKU, derived cost, and computed sell prices per retail channel); the founder must explicitly say yes; only then call again with confirmed=true. Children are inserted in PENDING state — all sell_* flags off — so they are NOT live until the founder visits /founder-ai/products/pending and clicks ✓ Approve on each one. ALWAYS tell the founder to go to /founder-ai/products/pending after a successful explode. Use this tool when the founder says things like "take SKU SYSCO-PORK-001 and sell it as 5 × 2lb bags", "make the 40lb halibut available as 1lb portions", "diversify the 10lb pasta case into 26 × 6oz retail portions". Each child product is linked to the parent via parent_product_id; child cost_per_unit = parent_cost / count_per_parent. Sell prices flow through calculatePrice() — markups per channel (nassau_pos 40% · andros_pos 40% · online_retail 35%) — so the founder never hand-calculates.',
    input_schema: {
      type: 'object',
      properties: {
        parent_sku: { type: 'string', description: 'SKU of the wholesale/case parent product (e.g. "BWA-118-3900" or "SYSCO-PORK-CASE-001"). Must already exist; must NOT itself be a child.' },
        divisions: {
          type: 'array',
          description: 'One entry per retail variant to create. Example: [{"portion_size":2,"portion_unit":"lb","count_per_parent":5,"sale_unit":"bag"}, {"portion_size":6,"portion_unit":"oz","count_per_parent":26,"sale_unit":"portion"}].',
          items: {
            type: 'object',
            properties: {
              portion_size:     { type: 'number', description: 'Numeric size of one retail unit. e.g. 2 (for 2lb) or 6 (for 6oz).' },
              portion_unit:     { type: 'string', description: 'Unit the portion_size is measured in: "lb" | "oz" | "each".' },
              count_per_parent: { type: 'number', description: 'How many retail units come out of one parent. child_cost = parent_cost / this number.' },
              sale_unit:        { type: 'string', description: 'How the retail unit is sold. "lb" | "bag" | "portion" | "pack" | "each". Drives calculatePrice() and POS display.' },
              sku_suffix:       { type: 'string', description: 'Optional override for the child SKU suffix. Default is "<portion_size><PORTION_UNIT>" e.g. "2LB".' },
              name_suffix:      { type: 'string', description: 'Optional override for the child product name suffix. Default is "<portion_size> <portion_unit> <sale_unit>" e.g. "2 lb bag".' },
            },
            required: ['portion_size', 'portion_unit', 'count_per_parent', 'sale_unit'],
          },
        },
        retail_channels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Which channels to sell the child products on. Valid: "nassau_pos","andros_pos","online_retail". Default: all three (retail set). Wholesale channels are intentionally excluded — parent already handles wholesale.',
        },
        confirmed: { type: 'boolean', description: 'MUST be true to insert. False (or omitted) returns a preview only.' },
      },
      required: ['parent_sku', 'divisions'],
    },
  },
  {
    name: 'customer_history',
    description:
      'Full deep-dive on one customer: lifetime stats + recent orders + top items + first/last seen + consent status. Use when the founder asks "what does Sarah usually buy", "show me history for 242-555-0100", or "pull everything on customer X". Read-only. Look up by customer_id (UUID) OR phone OR email — at least one required. Returns up to 30 most-recent orders + the top 15 items by frequency.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'UUID — most precise. Use when known.' },
        phone:       { type: 'string', description: 'Phone in any format. Will normalize to E.164 via bsc_normalize_phone() and match phone_e164 first, then legacy phone column.' },
        email:       { type: 'string', description: 'Email — case-insensitive match.' },
        order_limit: { type: 'number', description: 'How many recent orders to include. Default 30, max 100.' },
      },
    },
  },
] as const;

interface ReadFileInput { path?: unknown }
interface QueryDbInput {
  table?: unknown;
  columns?: unknown;
  filters?: unknown;
  gte?: unknown;
  order_by?: unknown;
  limit?: unknown;
}
interface RecentOrdersInput {
  limit?: unknown;
  order_type?: unknown;
}
interface AddProductInput {
  name?: unknown;
  sku?: unknown;
  category?: unknown;
  unit_of_measure?: unknown;
  unit_type?: unknown;
  is_bsc_processed?: unknown;
  primary_supplier_id?: unknown;
  pricing?: unknown;
  cost_per_unit?: unknown;
  stock_lbs?: unknown;
  image_url?: unknown;
  description?: unknown;
  vat_category?: unknown;
  confirmed?: unknown;
}
interface SetProductChannelsInput {
  sku?: unknown;
  sell_nassau?: unknown;
  sell_andros?: unknown;
  sell_online?: unknown;
  sell_wholesale?: unknown;
  confirmed?: unknown;
}
interface DemandPatternInput {
  mode?:          unknown;
  day_of_week?:   unknown;
  customer_id?:   unknown;
  lookback_days?: unknown;
}
interface ListCustomersInput {
  search?:                unknown;
  opted_in_only?:         unknown;
  consent_source?:        unknown;
  origin_channel?:        unknown;
  min_total_spent?:       unknown;
  min_total_orders?:      unknown;
  last_seen_within_days?: unknown;
  last_seen_before_days?: unknown;
  sort_by?:               unknown;
  limit?:                 unknown;
}
interface SegmentCustomersInput {
  mode?: unknown;
}
interface CustomerHistoryInput {
  customer_id?: unknown;
  phone?:       unknown;
  email?:       unknown;
  order_limit?: unknown;
}
interface ExplodeDivisionInput {
  portion_size?:     unknown;
  portion_unit?:     unknown;
  count_per_parent?: unknown;
  sale_unit?:        unknown;
  sku_suffix?:       unknown;
  name_suffix?:      unknown;
}
interface ExplodeProductInput {
  parent_sku?:      unknown;
  divisions?:       unknown;
  retail_channels?: unknown;
  confirmed?:       unknown;
}
interface SuggestProductSkuInput {
  name?:          unknown;
  supplier_code?: unknown;
  supplier_id?:   unknown;
  barcode?:       unknown;
  category?:      unknown;
}
interface SendEmailBlastInput {
  subject?:   unknown;
  headline?:  unknown;
  body_html?: unknown;
  audience?:  unknown;
  confirmed?: unknown;
}
interface CreateFlyerInput {
  title?:            unknown;
  body?:             unknown;
  image_url?:        unknown;
  cta_label?:        unknown;
  cta_url?:          unknown;
  background_color?: unknown;
  text_color?:       unknown;
  valid_from?:       unknown;
  valid_to?:         unknown;
  display_order?:    unknown;
  confirmed?:        unknown;
}
interface SetFlyerActiveInput {
  flyer_id?:  unknown;
  is_active?: unknown;
}

/** Extract auth.users.id from a Supabase JWT. */
export function extractUserIdFromJWT(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return decoded.sub || null;
  } catch {
    return null;
  }
}

interface WritePerms {
  ok: boolean;
  role?: string;
  error?: string;
}

async function checkWritePerms(admin: SupabaseClient, callerId: string | null): Promise<WritePerms> {
  if (!callerId) {
    return { ok: false, error: 'Authentication required for write operations. Sign in as founder or co_founder.' };
  }
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  const role = profile?.role as string | undefined;
  if (!role || !WRITE_ROLES.has(role)) {
    return { ok: false, error: `Write tools are founder/co_founder only. Caller role: ${role ?? 'unknown'}.` };
  }
  return { ok: true, role };
}

async function logWrite(
  admin: SupabaseClient,
  tool: string,
  callerId: string | null,
  input: unknown,
  result: unknown,
  status: 'success' | 'denied' | 'error',
  error: string | null,
): Promise<void> {
  await admin.from('ai_writes').insert({
    tool,
    caller_id: callerId,
    input,
    result,
    status,
    error,
  }).then(() => undefined, (err) => console.error('ai_writes insert failed:', err));
}

export async function dispatchTool(
  name: string,
  input: unknown,
  admin: SupabaseClient,
  callerId: string | null,
): Promise<string> {
  try {
    switch (name) {
      case 'read_file':            return await readFileTool(input as ReadFileInput);
      case 'query_db':             return await queryDbTool(input as QueryDbInput, admin);
      case 'recent_orders':        return await recentOrdersTool(input as RecentOrdersInput, admin);
      case 'health_check':         return JSON.stringify(await healthCheck(admin));
      case 'add_product':          return await addProductTool(input as AddProductInput, admin, callerId);
      case 'set_product_channels': return await setProductChannelsTool(input as SetProductChannelsInput, admin, callerId);
      case 'demand_pattern':       return await demandPatternTool(input as DemandPatternInput, admin);
      case 'send_email_blast':     return await sendEmailBlastTool(input as SendEmailBlastInput, admin, callerId);
      case 'list_flyers':          return await listFlyersTool(admin);
      case 'create_flyer':         return await createFlyerTool(input as CreateFlyerInput, admin, callerId);
      case 'set_flyer_active':     return await setFlyerActiveTool(input as SetFlyerActiveInput, admin, callerId);
      case 'list_customers':       return await listCustomersTool(input as ListCustomersInput, admin);
      case 'segment_customers':    return await segmentCustomersTool(input as SegmentCustomersInput, admin);
      case 'customer_history':     return await customerHistoryTool(input as CustomerHistoryInput, admin);
      case 'explode_product':      return await explodeProductTool(input as ExplodeProductInput, admin, callerId);
      case 'suggest_product_sku':  return await suggestProductSkuTool(input as SuggestProductSkuInput, admin);
      default:                     return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : 'Tool dispatch failed' });
  }
}

// ── READ TOOL IMPLEMENTATIONS ────────────────────────────────────────

async function readFileTool({ path: relPath }: ReadFileInput): Promise<string> {
  if (typeof relPath !== 'string' || !relPath) {
    return JSON.stringify({ error: 'path is required (string)' });
  }
  if (relPath.includes('..') || relPath.startsWith('/') || relPath.startsWith('~') || relPath.startsWith('.git') || relPath.includes('.env') || relPath.startsWith('node_modules')) {
    return JSON.stringify({ error: 'Path not allowed.' });
  }
  if (!ALLOWED_READ_PREFIXES.some((p) => relPath.startsWith(p))) {
    return JSON.stringify({
      error: `Not readable. Allowed prefixes: ${ALLOWED_READ_PREFIXES.join(', ')}`,
    });
  }
  try {
    const full = path.resolve(REPO_ROOT, relPath);
    if (!full.startsWith(REPO_ROOT)) {
      return JSON.stringify({ error: 'Path escapes repo root' });
    }
    const raw = await readFile(full, 'utf-8');
    if (raw.length > MAX_FILE_CHARS) {
      return JSON.stringify({
        path: relPath,
        truncated: true,
        total_chars: raw.length,
        contents: raw.slice(0, MAX_FILE_CHARS),
      });
    }
    return JSON.stringify({ path: relPath, contents: raw });
  } catch (e) {
    return JSON.stringify({
      error: `Could not read ${relPath}: ${e instanceof Error ? e.message : 'unknown'}`,
    });
  }
}

async function queryDbTool(input: QueryDbInput, admin: SupabaseClient): Promise<string> {
  const table = typeof input.table === 'string' ? input.table : '';
  if (!table || !/^[a-z_][a-z0-9_]*$/i.test(table)) {
    return JSON.stringify({ error: 'table must be a valid identifier' });
  }
  const columns =
    typeof input.columns === 'string' && input.columns.trim()
      ? input.columns
      : '*';
  const limit = Math.min(
    100,
    Math.max(1, Number(input.limit ?? 20) || 20),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = admin.from(table).select(columns);

  if (input.filters && typeof input.filters === 'object') {
    for (const [col, val] of Object.entries(input.filters as Record<string, unknown>)) {
      q = q.eq(col, val);
    }
  }
  if (input.gte && typeof input.gte === 'object') {
    for (const [col, val] of Object.entries(input.gte as Record<string, unknown>)) {
      q = q.gte(col, val);
    }
  }
  if (typeof input.order_by === 'string' && input.order_by) {
    const desc = input.order_by.startsWith('-');
    const col = desc ? input.order_by.slice(1) : input.order_by;
    q = q.order(col, { ascending: !desc });
  }
  q = q.limit(limit);

  const { data, error } = await q;
  if (error) {
    return JSON.stringify({ error: error.message, table });
  }
  return JSON.stringify({
    table,
    count: data?.length ?? 0,
    rows: data ?? [],
  });
}

async function recentOrdersTool(input: RecentOrdersInput, admin: SupabaseClient): Promise<string> {
  const limit = Math.min(100, Math.max(1, Number(input.limit ?? 20) || 20));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = admin
    .from('orders')
    .select('id, created_at, order_type, status, payment_status, payment_method, customer_name, customer_phone, total, net_profit, expense_allocation, bill_casale_share, locked_by')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (typeof input.order_type === 'string' && input.order_type) {
    q = q.eq('order_type', input.order_type);
  }
  const { data, error } = await q;
  if (error) return JSON.stringify({ error: error.message });
  return JSON.stringify({ count: data?.length ?? 0, rows: data ?? [] });
}

// ── WRITE TOOL IMPLEMENTATIONS ───────────────────────────────────────

interface PricingEntry { channel: string; price: number }

async function addProductTool(
  input: AddProductInput,
  admin: SupabaseClient,
  callerId: string | null,
): Promise<string> {
  // Permission gate.
  const perms = await checkWritePerms(admin, callerId);
  if (!perms.ok) {
    await logWrite(admin, 'add_product', callerId, input, null, 'denied', perms.error ?? 'denied');
    return JSON.stringify({ error: perms.error });
  }

  // Coerce + validate.
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const sku  = typeof input.sku  === 'string' ? input.sku.trim()  : '';
  const category = typeof input.category === 'string' ? input.category.trim() : '';
  const unit_of_measure = typeof input.unit_of_measure === 'string' ? input.unit_of_measure.trim() : '';
  const unit_type = typeof input.unit_type === 'string' ? input.unit_type.trim() : null;
  const is_bsc_processed = input.is_bsc_processed === true;
  const primary_supplier_id = typeof input.primary_supplier_id === 'string' ? input.primary_supplier_id : null;
  const stock_lbs = typeof input.stock_lbs === 'number' ? input.stock_lbs : null;
  const cost_per_unit = typeof input.cost_per_unit === 'number' ? input.cost_per_unit : null;
  const image_url = typeof input.image_url === 'string' && /^https?:\/\//.test(input.image_url) ? input.image_url : null;
  const description = typeof input.description === 'string' ? input.description.trim() : null;
  const VAT_CATS = new Set(['uncooked_food','cooked_prepared','service']);
  const vat_category = typeof input.vat_category === 'string' && VAT_CATS.has(input.vat_category)
    ? input.vat_category
    : 'uncooked_food';
  const confirmed = input.confirmed === true;

  if (!name || !sku || !category || !unit_of_measure) {
    const err = 'name, sku, category, and unit_of_measure are all required.';
    await logWrite(admin, 'add_product', callerId, input, null, 'error', err);
    return JSON.stringify({ error: err });
  }

  // Validate pricing.
  const rawPricing = Array.isArray(input.pricing) ? input.pricing : [];
  const pricing: PricingEntry[] = [];
  for (const p of rawPricing as unknown[]) {
    if (!p || typeof p !== 'object') continue;
    const ch = (p as { channel?: unknown }).channel;
    const pr = (p as { price?: unknown }).price;
    if (typeof ch !== 'string' || typeof pr !== 'number') continue;
    if (!VALID_CHANNELS.has(ch)) continue;
    pricing.push({ channel: ch, price: pr });
  }
  if (pricing.length === 0) {
    const err = 'At least one pricing entry required. Valid channels: nassau_pos, andros_pos, online_market, local_wholesale.';
    await logWrite(admin, 'add_product', callerId, input, null, 'error', err);
    return JSON.stringify({ error: err });
  }

  const channelFlags = {
    sell_nassau:    pricing.some((p) => p.channel === 'nassau_pos'),
    sell_andros:    pricing.some((p) => p.channel === 'andros_pos'),
    sell_online:    pricing.some((p) => p.channel === 'online_market'),
    sell_wholesale: pricing.some((p) => p.channel === 'local_wholesale' || p.channel === 'wholesale'),
  };

  // Preview path (no write).
  if (!confirmed) {
    return JSON.stringify({
      preview: true,
      will_create: {
        product: { sku, name, description, category, unit_of_measure, unit_type, is_bsc_processed, primary_supplier_id, status: 'active', stock_lbs, image_url, ...channelFlags },
        pricing_rows: pricing.map((p) => ({ channel: p.channel, manual_unit_price: p.price, mode: 'manual_override' })),
        cost_row: cost_per_unit !== null ? { cost_per_unit, unit_of_measure, supplier_id: primary_supplier_id } : null,
      },
      next_step: 'Show the founder this preview. If they confirm, call add_product again with the same arguments plus confirmed=true.',
    });
  }

  // Commit path.
  try {
    const { data: product, error: prodErr } = await admin
      .from('products')
      .insert({
        sku,
        name,
        description,
        category,
        unit_of_measure,
        unit_type,
        is_bsc_processed,
        primary_supplier_id,
        status: 'active',
        stock_lbs,
        image_url,
        vat_category,
        ...channelFlags,
        created_by: callerId,
      })
      .select('id, sku, name')
      .single();
    if (prodErr || !product) {
      const err = prodErr?.message || 'product insert returned no row';
      await logWrite(admin, 'add_product', callerId, input, null, 'error', err);
      return JSON.stringify({ error: err });
    }

    const productId = product.id as string;
    const nowIso = new Date().toISOString();

    // Insert pricing rows.
    const pricingRows = pricing.map((p) => ({
      product_id: productId,
      channel: p.channel,
      pricing_mode: 'manual_override',
      margin_multiplier: 1.0,
      vat_multiplier: 1.0,
      manual_unit_price: p.price,
      shipping_per_lb: 0,
      customs_duty_pct: 0,
      vat_levy_pct: 0,
      per_transaction_fee: 0,
      service_fee_pct: 0,
      effective_from: nowIso,
      is_current: true,
      is_active: true,
      recorded_by: callerId,
    }));
    const { error: priceErr } = await admin.from('product_pricing').insert(pricingRows);
    if (priceErr) {
      // Rollback the product row so we never leave half-created inventory.
      await admin.from('products').delete().eq('id', productId);
      const err = `pricing insert failed: ${priceErr.message} (rolled back product)`;
      await logWrite(admin, 'add_product', callerId, input, null, 'error', err);
      return JSON.stringify({ error: err });
    }

    // Optional cost row.
    if (cost_per_unit !== null) {
      const { error: costErr } = await admin.from('product_costs').insert({
        product_id: productId,
        supplier_id: primary_supplier_id,
        cost_type: 'opening_balance',
        cost_per_unit,
        unit_of_measure,
        shipping_per_lb: 0,
        customs_duty_pct: 0,
        vat_levy_pct: 0,
        processing_fee: 0,
        effective_from: nowIso,
        is_current: true,
        recorded_by: callerId,
      });
      if (costErr) {
        // Cost is non-critical; log a warning but keep the product.
        console.warn('product_costs insert failed:', costErr.message);
      }
    }

    const result = {
      ok: true,
      product_id: productId,
      sku: product.sku,
      name: product.name,
      channels: pricing.map((p) => p.channel),
      cost_recorded: cost_per_unit !== null,
    };
    await logWrite(admin, 'add_product', callerId, input, result, 'success', null);
    return JSON.stringify(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'add_product failed';
    await logWrite(admin, 'add_product', callerId, input, null, 'error', msg);
    return JSON.stringify({ error: msg });
  }
}

async function setProductChannelsTool(
  input: SetProductChannelsInput,
  admin: SupabaseClient,
  callerId: string | null,
): Promise<string> {
  const perms = await checkWritePerms(admin, callerId);
  if (!perms.ok) {
    await logWrite(admin, 'set_product_channels', callerId, input, null, 'denied', perms.error ?? 'denied');
    return JSON.stringify({ error: perms.error });
  }

  const sku = typeof input.sku === 'string' ? input.sku.trim() : '';
  if (!sku) {
    const err = 'sku is required';
    await logWrite(admin, 'set_product_channels', callerId, input, null, 'error', err);
    return JSON.stringify({ error: err });
  }

  const patch: Record<string, boolean> = {};
  for (const key of ['sell_nassau', 'sell_andros', 'sell_online', 'sell_wholesale'] as const) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === 'boolean') patch[key] = v;
  }
  if (Object.keys(patch).length === 0) {
    const err = 'Provide at least one of sell_nassau, sell_andros, sell_online, sell_wholesale.';
    await logWrite(admin, 'set_product_channels', callerId, input, null, 'error', err);
    return JSON.stringify({ error: err });
  }

  // Verify product exists + show current state.
  const { data: existing, error: lookupErr } = await admin
    .from('products')
    .select('id, sku, name, sell_nassau, sell_andros, sell_online, sell_wholesale')
    .eq('sku', sku)
    .maybeSingle();
  if (lookupErr) {
    await logWrite(admin, 'set_product_channels', callerId, input, null, 'error', lookupErr.message);
    return JSON.stringify({ error: lookupErr.message });
  }
  if (!existing) {
    const err = `No product with sku "${sku}".`;
    await logWrite(admin, 'set_product_channels', callerId, input, null, 'error', err);
    return JSON.stringify({ error: err });
  }

  if (input.confirmed !== true) {
    return JSON.stringify({
      preview: true,
      product: { sku: existing.sku, name: existing.name },
      before: {
        sell_nassau:    existing.sell_nassau,
        sell_andros:    existing.sell_andros,
        sell_online:    existing.sell_online,
        sell_wholesale: existing.sell_wholesale,
      },
      after: { ...existing, ...patch, id: undefined, sku: undefined, name: undefined },
      next_step: 'Show the founder this before/after preview. If they confirm, call set_product_channels again with the same args plus confirmed=true.',
    });
  }

  const { error: updErr } = await admin
    .from('products')
    .update(patch)
    .eq('id', existing.id);
  if (updErr) {
    await logWrite(admin, 'set_product_channels', callerId, input, null, 'error', updErr.message);
    return JSON.stringify({ error: updErr.message });
  }

  const result = { ok: true, sku, name: existing.name, applied: patch };
  await logWrite(admin, 'set_product_channels', callerId, input, result, 'success', null);
  return JSON.stringify(result);
}

// ── send_email_blast ──────────────────────────────────────────────────
//
// Two-step write tool. confirmed=false returns a preview (recipient count
// + rendered HTML for the first recipient). confirmed=true fans out via
// Resend in batches of 100. Founder + co_founder only.
async function sendEmailBlastTool(
  input: SendEmailBlastInput,
  admin: SupabaseClient,
  callerId: string | null,
): Promise<string> {
  const perms = await checkWritePerms(admin, callerId);
  if (!perms.ok) {
    await logWrite(admin, 'send_email_blast', callerId, input, null, 'denied', perms.error ?? 'denied');
    return JSON.stringify({ error: perms.error });
  }

  const subject   = typeof input.subject   === 'string' ? input.subject.trim()   : '';
  const headline  = typeof input.headline  === 'string' ? input.headline.trim()  : '';
  const body_html = typeof input.body_html === 'string' ? input.body_html        : '';
  const audience  = typeof input.audience  === 'string' ? input.audience         : 'all_opted_in';
  const confirmed = input.confirmed === true;

  if (!subject)   return JSON.stringify({ error: 'subject is required' });
  if (!headline)  return JSON.stringify({ error: 'headline is required' });
  if (!body_html) return JSON.stringify({ error: 'body_html is required' });

  // Resolve audience filter into a Supabase query.
  let q = admin.from('customers')
    .select('id, full_name, email')
    .eq('email_marketing_consent', true)
    .not('email', 'is', null);

  if (audience === 'nassau_pos_opted_in') q = q.eq('email_consent_source', 'nassau_pos');
  else if (audience === 'newsletter_opted_in') q = q.eq('email_consent_source', 'newsletter');
  else if (audience === 'signup_opted_in')     q = q.eq('email_consent_source', 'signup');
  // 'all_opted_in' (default) — no extra filter

  const { data: recipients, error: qErr } = await q;
  if (qErr) {
    await logWrite(admin, 'send_email_blast', callerId, input, null, 'error', qErr.message);
    return JSON.stringify({ error: 'customer query failed: ' + qErr.message });
  }
  const list = (recipients ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
  const valid = list.filter((c): c is { id: string; full_name: string | null; email: string } => !!c.email);

  // PREVIEW
  if (!confirmed) {
    const sample = valid[0]
      ? buildBlastHtml({ headline, body_html, customer_id: valid[0].id })
      : buildBlastHtml({ headline, body_html });
    const preview = {
      preview: true,
      audience,
      recipient_count: valid.length,
      sample_recipient: valid[0]?.email ?? null,
      sample_subject:  subject,
      sample_rendered_html: sample.slice(0, 2000) + (sample.length > 2000 ? '… [truncated]' : ''),
      note: 'No emails sent. Confirm by calling again with confirmed=true to actually send.',
    };
    return JSON.stringify(preview);
  }

  // COMMIT — send in 100-recipient batches
  if (valid.length === 0) {
    await logWrite(admin, 'send_email_blast', callerId, input, { sent: 0 }, 'success', null);
    return JSON.stringify({ ok: true, sent: 0, note: 'No opted-in customers matched this audience.' });
  }

  const errors: string[] = [];
  let sent = 0;
  const CHUNK = 100;
  for (let i = 0; i < valid.length; i += CHUNK) {
    const slice = valid.slice(i, i + CHUNK);
    const emails = slice.map(c => ({
      to:      c.email,
      subject,
      html:    buildBlastHtml({ headline, body_html, customer_id: c.id }),
    }));
    const { ids, error } = await sendBatch(emails);
    if (error) {
      errors.push(`batch ${i / CHUNK + 1}: ${error}`);
    } else if (ids) {
      sent += ids.length;
    }
  }

  const status = errors.length === 0 ? 'success' : 'error';
  const result = { ok: errors.length === 0, sent, attempted: valid.length, errors };
  await logWrite(admin, 'send_email_blast', callerId, input, result, status, errors.join('; ') || null);
  return JSON.stringify(result);
}

// ── list_flyers ───────────────────────────────────────────────────────
async function listFlyersTool(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin
    .from('flyers')
    .select('id, title, body, cta_label, cta_url, is_active, valid_from, valid_to, display_order, created_at')
    .order('is_active',     { ascending: false })
    .order('display_order', { ascending: false })
    .order('created_at',    { ascending: false })
    .limit(50);
  if (error) return JSON.stringify({ error: error.message });
  const now = new Date();
  const annotated = (data ?? []).map((f) => {
    const vf = f.valid_from ? new Date(f.valid_from) : null;
    const vt = f.valid_to   ? new Date(f.valid_to)   : null;
    const live = f.is_active && (!vf || vf <= now) && (!vt || vt >= now);
    return { ...f, live };
  });
  return JSON.stringify({ count: annotated.length, flyers: annotated });
}

// ── create_flyer ──────────────────────────────────────────────────────
async function createFlyerTool(
  input: CreateFlyerInput,
  admin: SupabaseClient,
  callerId: string | null,
): Promise<string> {
  const perms = await checkWritePerms(admin, callerId);
  if (!perms.ok) {
    await logWrite(admin, 'create_flyer', callerId, input, null, 'denied', perms.error ?? 'denied');
    return JSON.stringify({ error: perms.error });
  }

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return JSON.stringify({ error: 'title is required' });

  const row = {
    title,
    body:             typeof input.body             === 'string' ? input.body.trim()             : null,
    image_url:        typeof input.image_url        === 'string' ? input.image_url.trim()        : null,
    cta_label:        typeof input.cta_label        === 'string' && input.cta_label.trim()        ? input.cta_label.trim()        : 'Shop Now',
    cta_url:          typeof input.cta_url          === 'string' && input.cta_url.trim()          ? input.cta_url.trim()          : '/market',
    background_color: typeof input.background_color === 'string' && input.background_color.trim() ? input.background_color.trim() : '#060d1f',
    text_color:       typeof input.text_color       === 'string' && input.text_color.trim()       ? input.text_color.trim()       : '#f5c518',
    valid_from:       typeof input.valid_from       === 'string' && input.valid_from              ? input.valid_from              : null,
    valid_to:         typeof input.valid_to         === 'string' && input.valid_to                ? input.valid_to                : null,
    display_order:    typeof input.display_order    === 'number' ? input.display_order            : 0,
    is_active:        true,
    created_by:       callerId,
  };

  if (input.confirmed !== true) {
    return JSON.stringify({ preview: true, would_insert: row, note: 'Call again with confirmed=true to insert.' });
  }

  const { data, error } = await admin.from('flyers').insert(row).select('id').single();
  if (error) {
    await logWrite(admin, 'create_flyer', callerId, input, null, 'error', error.message);
    return JSON.stringify({ error: error.message });
  }
  const result = { ok: true, id: data?.id, title, live_now: !row.valid_from };
  await logWrite(admin, 'create_flyer', callerId, input, result, 'success', null);
  return JSON.stringify(result);
}

// ── set_flyer_active ──────────────────────────────────────────────────
async function setFlyerActiveTool(
  input: SetFlyerActiveInput,
  admin: SupabaseClient,
  callerId: string | null,
): Promise<string> {
  const perms = await checkWritePerms(admin, callerId);
  if (!perms.ok) {
    await logWrite(admin, 'set_flyer_active', callerId, input, null, 'denied', perms.error ?? 'denied');
    return JSON.stringify({ error: perms.error });
  }
  const flyerId  = typeof input.flyer_id  === 'string'  ? input.flyer_id  : '';
  const isActive = typeof input.is_active === 'boolean' ? input.is_active : null;
  if (!flyerId)         return JSON.stringify({ error: 'flyer_id is required' });
  if (isActive === null) return JSON.stringify({ error: 'is_active (true/false) is required' });

  const { data, error } = await admin.from('flyers')
    .update({ is_active: isActive })
    .eq('id', flyerId)
    .select('id, title, is_active')
    .single();
  if (error) {
    await logWrite(admin, 'set_flyer_active', callerId, input, null, 'error', error.message);
    return JSON.stringify({ error: error.message });
  }
  const result = { ok: true, flyer: data };
  await logWrite(admin, 'set_flyer_active', callerId, input, result, 'success', null);
  return JSON.stringify(result);
}

// ── demand_pattern (READ-ONLY) ────────────────────────────────────────
//
// Two modes:
//   • product_by_day(day_of_week) — top SKUs for a given DOW
//   • customer(customer_id)       — that customer's per-DOW visits + top items
//
// Both aggregate from orders.wholesale_items (JSONB) in JS, using a single
// scan of the last `lookback_days` (default 90) of orders. No SQL CTEs.

import { parseOrderItems } from './order-items';
interface OrderRow {
  id: string;
  created_at: string;
  customer_id: string | null;
  customer_name: string | null;
  total: number | null;
  wholesale_items: unknown;
}

async function demandPatternTool(input: DemandPatternInput, admin: SupabaseClient): Promise<string> {
  const mode = typeof input.mode === 'string' ? input.mode : '';
  if (mode !== 'product_by_day' && mode !== 'customer') {
    return JSON.stringify({ error: 'mode must be "product_by_day" or "customer"' });
  }
  const lookback = Math.max(7, Math.min(365, Number(input.lookback_days ?? 90)));
  const since = new Date();
  since.setDate(since.getDate() - lookback);

  let q = admin.from('orders')
    .select('id, created_at, customer_id, customer_name, total, wholesale_items')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(2000);

  if (mode === 'customer') {
    const cid = typeof input.customer_id === 'string' ? input.customer_id : '';
    if (!cid) return JSON.stringify({ error: 'customer_id is required for mode=customer' });
    q = q.eq('customer_id', cid);
  }

  const { data, error } = await q;
  if (error) return JSON.stringify({ error: error.message });
  const orders = (data ?? []) as OrderRow[];

  if (mode === 'product_by_day') {
    const dow = Number(input.day_of_week);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      return JSON.stringify({ error: 'day_of_week must be an integer 0-6 (0=Sunday)' });
    }
    const dayOrders = orders.filter(o => new Date(o.created_at).getDay() === dow);
    const byKey = new Map<string, { sku?: string; name: string; times: number; total_qty: number; total_revenue: number }>();
    for (const o of dayOrders) {
      const items = parseOrderItems(o.wholesale_items);
      for (const it of items) {
        const key = it.sku ?? it.name ?? 'unknown';
        const ex  = byKey.get(key) ?? { sku: it.sku, name: it.name || 'Unknown item', times: 0, total_qty: 0, total_revenue: 0 };
        ex.times         += 1;
        ex.total_qty     += it.weight_lb ?? it.qty;
        ex.total_revenue += it.line_total ?? 0;
        byKey.set(key, ex);
      }
    }
    const top = Array.from(byKey.values()).sort((a, b) => b.total_qty - a.total_qty).slice(0, 15);
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow];
    return JSON.stringify({
      mode:           'product_by_day',
      day_of_week:    dow,
      day_name:       dayName,
      lookback_days:  lookback,
      order_count:    dayOrders.length,
      top_products:   top,
    });
  }

  // mode === 'customer'
  const byDow = [0,1,2,3,4,5,6].map((dow) => {
    const dowOrders = orders.filter(o => new Date(o.created_at).getDay() === dow);
    return {
      day_of_week: dow,
      day_name:    ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow],
      visits:      dowOrders.length,
      total_spend: dowOrders.reduce((s, o) => s + Number(o.total ?? 0), 0),
    };
  });
  const itemMap = new Map<string, { sku?: string; name: string; times: number; total_qty: number }>();
  for (const o of orders) {
    const items = parseOrderItems(o.wholesale_items);
    for (const it of items) {
      const key = it.sku ?? it.name ?? 'unknown';
      const ex  = itemMap.get(key) ?? { sku: it.sku, name: it.name || 'Unknown item', times: 0, total_qty: 0 };
      ex.times    += 1;
      ex.total_qty += it.weight_lb ?? it.qty;
      itemMap.set(key, ex);
    }
  }
  return JSON.stringify({
    mode:          'customer',
    customer_id:   input.customer_id,
    customer_name: orders[0]?.customer_name ?? null,
    lookback_days: lookback,
    total_visits:  orders.length,
    total_spend:   orders.reduce((s, o) => s + Number(o.total ?? 0), 0),
    by_day:        byDow,
    top_items:     Array.from(itemMap.values()).sort((a, b) => b.times - a.times).slice(0, 15),
  });
}

// ────────────────────────────────────────────────────────────────────
// Phase 4 — customer-base introspection tools
// All READ-only. Skip the singleton Walk-In Anonymous record so it doesn't
// pollute counts / segments.
// ────────────────────────────────────────────────────────────────────

interface CustomerSummary {
  id: string;
  full_name: string | null;
  phone: string | null;
  phone_e164: string | null;
  email: string | null;
  origin_channel: string | null;
  source: string | null;
  email_marketing_consent: boolean | null;
  email_consent_source: string | null;
  total_orders: number | null;
  total_spent: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  is_walk_in_anonymous: boolean | null;
}

async function listCustomersTool(input: ListCustomersInput, admin: SupabaseClient): Promise<string> {
  const limit = Math.min(200, Math.max(1, Number(input.limit ?? 50)));
  let q = admin.from('customers')
    .select('id, full_name, phone, phone_e164, email, origin_channel, source, email_marketing_consent, email_consent_source, total_orders, total_spent, first_seen_at, last_seen_at, is_walk_in_anonymous')
    .or('is_walk_in_anonymous.is.null,is_walk_in_anonymous.eq.false');

  if (typeof input.search === 'string' && input.search.trim()) {
    const s = input.search.trim().replace(/[%_]/g, m => `\\${m}`);
    q = q.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,phone_e164.ilike.%${s}%,email.ilike.%${s}%`);
  }
  if (input.opted_in_only === true)                                  q = q.eq('email_marketing_consent', true);
  if (typeof input.consent_source === 'string' && input.consent_source) q = q.eq('email_consent_source', input.consent_source);
  if (typeof input.origin_channel === 'string' && input.origin_channel) q = q.eq('origin_channel', input.origin_channel);
  if (Number.isFinite(Number(input.min_total_spent)))                q = q.gte('total_spent', Number(input.min_total_spent));
  if (Number.isFinite(Number(input.min_total_orders)))               q = q.gte('total_orders', Number(input.min_total_orders));
  if (Number.isFinite(Number(input.last_seen_within_days))) {
    const cutoff = new Date(Date.now() - Number(input.last_seen_within_days) * 86_400_000).toISOString();
    q = q.gte('last_seen_at', cutoff);
  }
  if (Number.isFinite(Number(input.last_seen_before_days))) {
    const cutoff = new Date(Date.now() - Number(input.last_seen_before_days) * 86_400_000).toISOString();
    q = q.lte('last_seen_at', cutoff);
  }

  const sortBy = typeof input.sort_by === 'string' ? input.sort_by : 'total_spent';
  switch (sortBy) {
    case 'total_orders': q = q.order('total_orders', { ascending: false, nullsFirst: false }); break;
    case 'last_seen':    q = q.order('last_seen_at', { ascending: false, nullsFirst: false }); break;
    case 'name':         q = q.order('full_name',    { ascending: true,  nullsFirst: false }); break;
    case 'total_spent':
    default:             q = q.order('total_spent',  { ascending: false, nullsFirst: false }); break;
  }

  const { data, error } = await q.limit(limit);
  if (error) return JSON.stringify({ error: error.message });

  const rows = (data ?? []) as CustomerSummary[];
  return JSON.stringify({
    count: rows.length,
    sort_by: sortBy,
    customers: rows.map(c => ({
      id: c.id,
      full_name: c.full_name,
      phone: c.phone_e164 ?? c.phone,
      email: c.email,
      origin: c.origin_channel ?? c.source,
      consent: !!c.email_marketing_consent,
      consent_source: c.email_consent_source,
      total_orders: Number(c.total_orders ?? 0),
      total_spent:  Number(c.total_spent ?? 0),
      first_seen:   c.first_seen_at,
      last_seen:    c.last_seen_at,
    })),
  });
}

async function segmentCustomersTool(input: SegmentCustomersInput, admin: SupabaseClient): Promise<string> {
  const mode = typeof input.mode === 'string' ? input.mode : '';
  if (!['recency','frequency','monetary','origin','consent'].includes(mode)) {
    return JSON.stringify({ error: 'mode must be one of: recency, frequency, monetary, origin, consent' });
  }

  // Pull everyone (capped at 5000 to be safe). For BSC scale this is fine.
  const { data, error } = await admin.from('customers')
    .select('id, total_orders, total_spent, last_seen_at, origin_channel, source, email_marketing_consent, email_consent_source, is_walk_in_anonymous')
    .or('is_walk_in_anonymous.is.null,is_walk_in_anonymous.eq.false')
    .limit(5000);
  if (error) return JSON.stringify({ error: error.message });
  const rows = (data ?? []) as CustomerSummary[];

  type Seg = { name: string; count: number; total_spent_sum: number; avg_spent: number; sample_customer_ids: string[] };
  const segs = new Map<string, Seg>();
  function bump(name: string, c: CustomerSummary) {
    const s = segs.get(name) ?? { name, count: 0, total_spent_sum: 0, avg_spent: 0, sample_customer_ids: [] };
    s.count += 1;
    s.total_spent_sum += Number(c.total_spent ?? 0);
    if (s.sample_customer_ids.length < 5) s.sample_customer_ids.push(c.id);
    segs.set(name, s);
  }

  const now = Date.now();
  for (const c of rows) {
    if (mode === 'recency') {
      if (!c.last_seen_at) { bump('never_seen', c); continue; }
      const days = Math.floor((now - new Date(c.last_seen_at).getTime()) / 86_400_000);
      if      (days <  30) bump('active_under_30d', c);
      else if (days <  90) bump('dormant_30_90d',   c);
      else if (days < 180) bump('lapsed_90_180d',   c);
      else                 bump('lost_180d_plus',   c);
    } else if (mode === 'frequency') {
      const n = Number(c.total_orders ?? 0);
      if      (n === 0)  bump('no_orders_yet', c);
      else if (n <= 2)   bump('occasional_1_2', c);
      else if (n <= 9)   bump('regular_3_9',   c);
      else               bump('loyal_10_plus', c);
    } else if (mode === 'monetary') {
      const spent = Number(c.total_spent ?? 0);
      if      (spent === 0)  bump('no_spend_yet', c);
      else if (spent <  50)  bump('small_under_50',     c);
      else if (spent < 200)  bump('mid_50_to_200',      c);
      else                   bump('big_200_plus',       c);
    } else if (mode === 'origin') {
      bump((c.origin_channel ?? c.source ?? 'unknown'), c);
    } else if (mode === 'consent') {
      if (!c.email_marketing_consent) bump('not_opted_in', c);
      else                            bump(`opted_in_via_${c.email_consent_source ?? 'unknown'}`, c);
    }
  }

  const out = Array.from(segs.values()).map(s => ({
    ...s,
    avg_spent: s.count > 0 ? Math.round((s.total_spent_sum / s.count) * 100) / 100 : 0,
    total_spent_sum: Math.round(s.total_spent_sum * 100) / 100,
  })).sort((a, b) => b.count - a.count);

  return JSON.stringify({
    mode,
    universe_size: rows.length,
    segments: out,
  });
}

async function customerHistoryTool(input: CustomerHistoryInput, admin: SupabaseClient): Promise<string> {
  const orderLimit = Math.min(100, Math.max(1, Number(input.order_limit ?? 30)));

  // Resolve to a single customer row via id → phone (E.164 or legacy) → email.
  let customer: CustomerSummary | null = null;
  if (typeof input.customer_id === 'string' && input.customer_id) {
    const { data } = await admin.from('customers').select('*').eq('id', input.customer_id).maybeSingle();
    customer = (data ?? null) as CustomerSummary | null;
  }
  if (!customer && typeof input.phone === 'string' && input.phone.trim()) {
    const raw = input.phone.trim();
    const { data: viaRpc } = await admin.rpc('bsc_lookup_customer_by_phone', { p_raw_phone: raw });
    const match = Array.isArray(viaRpc) && viaRpc.length > 0 ? (viaRpc[0] as { id: string }) : null;
    if (match) {
      const { data } = await admin.from('customers').select('*').eq('id', match.id).maybeSingle();
      customer = (data ?? null) as CustomerSummary | null;
    } else {
      // Fall back to legacy phone column substring match
      const { data } = await admin.from('customers').select('*').or(`phone.eq.${raw},phone_e164.eq.${raw}`).maybeSingle();
      customer = (data ?? null) as CustomerSummary | null;
    }
  }
  if (!customer && typeof input.email === 'string' && input.email.trim()) {
    const e = input.email.trim().toLowerCase();
    const { data } = await admin.from('customers').select('*').ilike('email', e).maybeSingle();
    customer = (data ?? null) as CustomerSummary | null;
  }

  if (!customer) {
    return JSON.stringify({ error: 'customer not found. Provide customer_id (uuid), phone, or email.' });
  }
  if (customer.is_walk_in_anonymous) {
    return JSON.stringify({ error: 'this is the shared Walk-In Anonymous record — no individual history available.' });
  }

  type HistoryOrderRow = {
    id: string; created_at: string; order_type: string | null; channel: string | null;
    location: string | null; payment_method: string | null; payment_status: string | null;
    total: number | null; wholesale_items: unknown;
  };
  const { data: orderRows } = await admin.from('orders')
    .select('id, created_at, order_type, channel, location, payment_method, payment_status, total, wholesale_items')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(orderLimit);
  const orders = (orderRows ?? []) as HistoryOrderRow[];

  // Top items across all orders
  const itemMap = new Map<string, { sku?: string; name: string; times: number; total_qty: number; total_revenue: number }>();
  for (const o of orders) {
    const items = parseOrderItems(o.wholesale_items);
    for (const it of items) {
      const key = it.sku ?? it.name ?? 'unknown';
      const ex = itemMap.get(key) ?? { sku: it.sku, name: it.name || 'Unknown item', times: 0, total_qty: 0, total_revenue: 0 };
      ex.times         += 1;
      ex.total_qty     += it.weight_lb ?? it.qty;
      ex.total_revenue += it.line_total ?? 0;
      itemMap.set(key, ex);
    }
  }
  const topItems = Array.from(itemMap.values()).sort((a, b) => b.times - a.times).slice(0, 15);

  // Channel mix
  const byChannel: Record<string, { orders: number; revenue: number }> = {};
  for (const o of orders) {
    const ch = o.channel ?? o.order_type ?? 'unknown';
    const e  = byChannel[ch] ?? { orders: 0, revenue: 0 };
    e.orders  += 1;
    e.revenue += Number(o.total ?? 0);
    byChannel[ch] = e;
  }

  return JSON.stringify({
    customer: {
      id: customer.id,
      full_name: customer.full_name,
      phone: customer.phone_e164 ?? customer.phone,
      email: customer.email,
      origin: customer.origin_channel ?? customer.source,
      consent: !!customer.email_marketing_consent,
      consent_source: customer.email_consent_source,
      lifetime_orders: Number(customer.total_orders ?? 0),
      lifetime_spent:  Number(customer.total_spent ?? 0),
      first_seen:      customer.first_seen_at,
      last_seen:       customer.last_seen_at,
    },
    recent_orders: orders.map(o => ({
      id: o.id,
      created_at: o.created_at,
      channel: o.channel ?? o.order_type,
      payment_method: o.payment_method,
      payment_status: o.payment_status,
      total: Number(o.total ?? 0),
      line_count: Array.isArray(o.wholesale_items) ? o.wholesale_items.length : 0,
    })),
    channel_mix: byChannel,
    top_items: topItems,
  });
}

// ── EXPLODE PRODUCT ──────────────────────────────────────────────────
//
// Takes a wholesale/case parent product and creates N retail child
// products derived from how the parent divides — e.g. a 10lb case →
// 5 × 2lb bags, or a 40lb item → 26 × 6oz portions. Two-step preview /
// confirm. Children get cost_per_unit = parent_cost / count_per_parent
// and sell prices computed via lib/pricing.ts calculatePrice() so the
// founder never hand-calculates retail markups.

const VALID_RETAIL_CHANNELS = new Set<PricingChannel>(['nassau_pos', 'andros_pos', 'online_retail']);
const VALID_PORTION_UNITS   = new Set(['lb', 'oz', 'each']);
const VALID_SALE_UNITS      = new Set<SaleUnit>(['lb', 'bag', 'portion', 'each']);

interface DivisionSpec {
  portion_size:     number;
  portion_unit:     string;
  count_per_parent: number;
  sale_unit:        SaleUnit;
  sku_suffix?:      string;
  name_suffix?:     string;
}

async function explodeProductTool(
  input: ExplodeProductInput,
  admin: SupabaseClient,
  callerId: string | null,
): Promise<string> {
  const perms = await checkWritePerms(admin, callerId);
  if (!perms.ok) {
    await logWrite(admin, 'explode_product', callerId, input, null, 'denied', perms.error ?? 'denied');
    return JSON.stringify({ error: perms.error });
  }

  const parentSku = typeof input.parent_sku === 'string' ? input.parent_sku.trim() : '';
  const confirmed = input.confirmed === true;
  if (!parentSku) {
    const err = 'parent_sku is required.';
    await logWrite(admin, 'explode_product', callerId, input, null, 'error', err);
    return JSON.stringify({ error: err });
  }

  // Validate + normalize divisions.
  const raw = Array.isArray(input.divisions) ? input.divisions : [];
  const divisions: DivisionSpec[] = [];
  for (const d of raw as unknown[]) {
    if (!d || typeof d !== 'object') continue;
    const obj = d as ExplodeDivisionInput;
    const size  = typeof obj.portion_size === 'number' ? obj.portion_size : NaN;
    const unit  = typeof obj.portion_unit === 'string' ? obj.portion_unit.toLowerCase().trim() : '';
    const count = typeof obj.count_per_parent === 'number' ? obj.count_per_parent : NaN;
    const sale  = typeof obj.sale_unit === 'string' ? obj.sale_unit.toLowerCase().trim() as SaleUnit : 'each';
    if (!Number.isFinite(size) || size <= 0)               continue;
    if (!VALID_PORTION_UNITS.has(unit))                    continue;
    if (!Number.isFinite(count) || count <= 0 || !Number.isInteger(count)) continue;
    if (!VALID_SALE_UNITS.has(sale))                       continue;
    divisions.push({
      portion_size:     size,
      portion_unit:     unit,
      count_per_parent: count,
      sale_unit:        sale,
      sku_suffix:       typeof obj.sku_suffix  === 'string' ? obj.sku_suffix.trim()  : undefined,
      name_suffix:      typeof obj.name_suffix === 'string' ? obj.name_suffix.trim() : undefined,
    });
  }
  if (divisions.length === 0) {
    const err = 'At least one division required. Each division needs: portion_size>0, portion_unit (lb|oz|each), count_per_parent (positive integer), sale_unit (lb|bag|portion|each).';
    await logWrite(admin, 'explode_product', callerId, input, null, 'error', err);
    return JSON.stringify({ error: err });
  }

  // Channels — default to the retail set.
  const channelInput = Array.isArray(input.retail_channels) ? input.retail_channels : null;
  const channels: PricingChannel[] = channelInput
    ? channelInput.filter((c): c is PricingChannel => typeof c === 'string' && VALID_RETAIL_CHANNELS.has(c as PricingChannel))
    : ['nassau_pos', 'andros_pos', 'online_retail'];
  if (channels.length === 0) {
    const err = 'No valid retail channels. Pick from: nassau_pos, andros_pos, online_retail.';
    await logWrite(admin, 'explode_product', callerId, input, null, 'error', err);
    return JSON.stringify({ error: err });
  }

  // Look up parent product.
  const { data: parent, error: parentErr } = await admin
    .from('products')
    .select('id, sku, name, category, primary_supplier_id, parent_product_id, unit_of_measure, vat_category')
    .eq('sku', parentSku)
    .maybeSingle();
  if (parentErr || !parent) {
    const err = `Parent SKU "${parentSku}" not found in products.`;
    await logWrite(admin, 'explode_product', callerId, input, null, 'error', err);
    return JSON.stringify({ error: err });
  }
  if (parent.parent_product_id) {
    const err = `SKU "${parentSku}" is itself a child product (parent_product_id is set). Pick a wholesale/case parent.`;
    await logWrite(admin, 'explode_product', callerId, input, null, 'error', err);
    return JSON.stringify({ error: err });
  }

  // Parent's current cost.
  const { data: parentCost } = await admin
    .from('product_costs')
    .select('cost_per_unit, unit_of_measure, supplier_id')
    .eq('product_id', parent.id)
    .eq('is_current', true)
    .maybeSingle();
  if (!parentCost || parentCost.cost_per_unit == null) {
    const err = `Parent "${parentSku}" has no current product_costs row. Add a cost first, then explode.`;
    await logWrite(admin, 'explode_product', callerId, input, null, 'error', err);
    return JSON.stringify({ error: err });
  }
  const parentCostPerUnit = Number(parentCost.cost_per_unit);

  // Compute every child SKU, cost, and per-channel sell prices.
  // Inherit parent's vat_category so child pricing respects Bahamas VAT law.
  const parentVatPct = vatPctForCategory((parent as { vat_category?: string | null }).vat_category ?? 'uncooked_food');
  const previews = divisions.map(d => {
    const suffix    = d.sku_suffix  ?? `${d.portion_size}${d.portion_unit.toUpperCase()}`;
    const childSku  = `${parentSku}-${suffix}`;
    const nameSfx   = d.name_suffix ?? `${d.portion_size} ${d.portion_unit} ${d.sale_unit}`;
    const childName = `${parent.name} · ${nameSfx}`;
    const childCost = Math.round((parentCostPerUnit / d.count_per_parent) * 10000) / 10000;
    const prices    = channels.map(ch => {
      const r = calculatePrice({ cost: childCost, channel: ch, quantity: 1, unit: d.sale_unit, vatPct: parentVatPct });
      return {
        channel:      ch,
        markup_pct:   r.markupPct,
        unit_price:   Math.round(r.finalPrice * 100) / 100,
        margin_dollars: Math.round(r.marginDollars * 100) / 100,
      };
    });
    return {
      child_sku:           childSku,
      child_name:          childName,
      portion_size:        d.portion_size,
      portion_unit:        d.portion_unit,
      portions_per_parent: d.count_per_parent,
      sale_unit:           d.sale_unit,
      child_cost_per_unit: childCost,
      channel_prices:      prices,
    };
  });

  // Detect any child SKUs that would collide with existing products.
  const childSkus = previews.map(p => p.child_sku);
  const { data: existing } = await admin
    .from('products')
    .select('sku')
    .in('sku', childSkus);
  const existingSet = new Set((existing ?? []).map((r: { sku: string }) => r.sku));
  const collisions  = childSkus.filter(s => existingSet.has(s));

  // Preview path.
  if (!confirmed) {
    return JSON.stringify({
      preview: true,
      parent: {
        sku:                parentSku,
        name:               parent.name,
        category:           parent.category,
        cost_per_unit:      parentCostPerUnit,
        unit_of_measure:    parentCost.unit_of_measure ?? parent.unit_of_measure,
        primary_supplier_id: parent.primary_supplier_id,
      },
      channels,
      children: previews,
      collisions: collisions.length > 0 ? collisions : undefined,
      next_step: collisions.length > 0
        ? `One or more child SKUs already exist: ${collisions.join(', ')}. Resolve before retrying (use sku_suffix to differentiate).`
        : 'Show the founder this preview. If they confirm, call explode_product again with the same arguments plus confirmed=true.',
    });
  }

  if (collisions.length > 0) {
    const err = `Refusing to insert — child SKU collision(s): ${collisions.join(', ')}.`;
    await logWrite(admin, 'explode_product', callerId, input, null, 'error', err);
    return JSON.stringify({ error: err });
  }

  // Commit path.
  const created: Array<{ sku: string; name: string; id: string }> = [];
  const nowIso = new Date().toISOString();

  for (const p of previews) {
    const division = divisions.find(d =>
      `${parentSku}-${d.sku_suffix ?? `${d.portion_size}${d.portion_unit.toUpperCase()}`}` === p.child_sku,
    );
    if (!division) continue;

    // 1. INSERT product (child) in PENDING state — all sell_* flags off
    //    until founder reviews + approves at /founder-ai/products/pending.
    //    Child inherits parent's vat_category (Bahamas tax law).
    const { data: childRow, error: prodErr } = await admin
      .from('products')
      .insert({
        sku:                 p.child_sku,
        name:                p.child_name,
        category:            parent.category,
        unit_of_measure:     division.sale_unit,
        unit_type:           division.sale_unit === 'lb' ? 'lb' : null,
        is_bsc_processed:    false,
        primary_supplier_id: parent.primary_supplier_id,
        status:              'active',
        sell_nassau:         false,
        sell_andros:         false,
        sell_online:         false,
        sell_wholesale:      false,
        parent_product_id:   parent.id,
        portion_size:        p.portion_size,
        portion_unit:        p.portion_unit,
        portions_per_parent: p.portions_per_parent,
        vat_category:        (parent as { vat_category?: string | null }).vat_category ?? 'uncooked_food',
        created_by:          callerId,
      })
      .select('id, sku, name')
      .single();
    if (prodErr || !childRow) {
      const err = `Failed to insert child SKU ${p.child_sku}: ${prodErr?.message ?? 'no row'}. Aborting (already created: ${created.map(c => c.sku).join(', ') || 'none'}).`;
      await logWrite(admin, 'explode_product', callerId, input, { created }, 'error', err);
      return JSON.stringify({ error: err, partial_created: created });
    }
    const childId = childRow.id as string;

    // 2. INSERT product_costs (immutable; trigger expires nothing since
    //    this is the first cost row for the new product).
    const { error: costErr } = await admin.from('product_costs').insert({
      product_id:      childId,
      supplier_id:     parentCost.supplier_id ?? parent.primary_supplier_id,
      cost_type:       'opening_balance',
      cost_per_unit:   p.child_cost_per_unit,
      unit_of_measure: division.sale_unit,
      shipping_per_lb: 0,
      customs_duty_pct: 0,
      vat_levy_pct:    0,
      processing_fee:  0,
      effective_from:  nowIso,
      is_current:      true,
      recorded_by:     callerId,
    });
    if (costErr) {
      console.warn(`product_costs insert failed for ${p.child_sku}:`, costErr.message);
    }

    // 3. INSERT product_pricing rows per channel.
    //    Note: lib/pricing uses 'online_retail' as the markup-channel name
    //    but product_pricing.channel stores 'online_market' (canonical DB
    //    value queried by /market + /checkout). Map at write time.
    const pricingRows = p.channel_prices.map(cp => ({
      product_id:         childId,
      channel:            cp.channel === 'online_retail' ? 'online_market' : cp.channel,
      pricing_mode:       'manual_override',
      margin_multiplier:  1.0,
      vat_multiplier:     1.0,
      manual_unit_price:  cp.unit_price,
      shipping_per_lb:    0,
      customs_duty_pct:   0,
      vat_levy_pct:       0,
      per_transaction_fee: 0,
      service_fee_pct:    0,
      effective_from:     nowIso,
      is_current:         true,
      is_active:          true,
      recorded_by:        callerId,
    }));
    const { error: priceErr } = await admin.from('product_pricing').insert(pricingRows);
    if (priceErr) {
      // Roll back the child product so we don't leave a costed-but-unpriced row.
      await admin.from('products').delete().eq('id', childId);
      const err = `product_pricing insert failed for ${p.child_sku}: ${priceErr.message} (rolled back child).`;
      await logWrite(admin, 'explode_product', callerId, input, { created }, 'error', err);
      return JSON.stringify({ error: err, partial_created: created });
    }

    created.push({ sku: p.child_sku, name: p.child_name, id: childId });
  }

  const result = {
    ok: true,
    parent_sku: parentSku,
    parent_cost_per_unit: parentCostPerUnit,
    channels,
    children_created: created.length,
    children: created,
    pending_review: true,
    review_url: '/founder-ai/products/pending',
    next_step: `${created.length} child product(s) created in PENDING state (all sell_* flags off). The founder must visit /founder-ai/products/pending to edit + approve before any are live for sale. Tell the founder this.`,
  };
  await logWrite(admin, 'explode_product', callerId, input, result, 'success', null);
  return JSON.stringify(result);
}

// ── SUGGEST PRODUCT SKU ───────────────────────────────────────────────
//
// Read-only. Generates 1–3 candidate SKUs from name + supplier + barcode,
// collision-checks all of them in one bulk SELECT, returns the best
// non-colliding option plus alternates. Conventions match the existing
// catalog: <SUPPLIER>-<NAMESLUG>(-<RAND4|BARCODE>).
//
// If a barcode is provided and an existing product has it on file, the
// match is returned so the AI can ask the founder whether to add a NEW
// product or update the existing one — preventing duplicates.

function slugifyForSku(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'PRODUCT';
}
function rand4(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // skip 0/O/1/I/l for clarity
  let out = '';
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function suggestProductSkuTool(input: SuggestProductSkuInput, admin: SupabaseClient): Promise<string> {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return JSON.stringify({ error: 'name is required' });

  const supplierCodeIn = typeof input.supplier_code === 'string' ? input.supplier_code.trim().toUpperCase() : '';
  const supplierId     = typeof input.supplier_id   === 'string' ? input.supplier_id.trim() : '';
  const barcodeRaw     = typeof input.barcode       === 'string' ? input.barcode.trim()    : '';
  const barcode        = barcodeRaw.replace(/\s+/g, '');

  // Resolve supplier code: explicit input wins, then suppliers.code lookup by id, then default BSC.
  let supplierCode = supplierCodeIn || 'BSC';
  if (!supplierCodeIn && supplierId) {
    const { data: sup } = await admin
      .from('suppliers').select('code').eq('id', supplierId).maybeSingle();
    if (sup && typeof (sup as { code?: string }).code === 'string') {
      const c = (sup as { code: string }).code.trim().toUpperCase();
      if (c) supplierCode = c;
    }
  }
  // Final sanity — supplier code stays short + alnum.
  supplierCode = supplierCode.replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'BSC';

  // If a barcode was given, see whether a product already owns it.
  let barcodeMatch: { id: string; sku: string; name: string } | null = null;
  if (barcode) {
    const { data: existing } = await admin
      .from('products')
      .select('id, sku, name')
      .eq('barcode', barcode)
      .limit(1)
      .maybeSingle();
    if (existing) barcodeMatch = existing as { id: string; sku: string; name: string };
  }

  // Build candidate SKUs (shortest/most-readable first).
  const nameSlug = slugifyForSku(name);
  const tag = rand4();
  const candidates: string[] = [];
  candidates.push(`${supplierCode}-${nameSlug}`.slice(0, 40));
  candidates.push(`${supplierCode}-${nameSlug}-${tag}`.slice(0, 40));
  if (barcode && /^\d{6,}$/.test(barcode)) {
    candidates.push(`${supplierCode}-${barcode.slice(-8)}`.slice(0, 40));
  }
  // De-dupe
  const seen = new Set<string>();
  const uniqueCandidates = candidates.filter(c => !seen.has(c) && seen.add(c));

  // Bulk collision check.
  const { data: collisionRows } = await admin
    .from('products')
    .select('sku')
    .in('sku', uniqueCandidates);
  const colliding = new Set((collisionRows ?? []).map((r: { sku: string }) => r.sku));

  // Primary = first non-colliding. If everything collides, regenerate with a fresh tag.
  let primary = uniqueCandidates.find(c => !colliding.has(c));
  if (!primary) {
    primary = `${supplierCode}-${nameSlug}-${rand4()}`.slice(0, 40);
  }
  const alternates = uniqueCandidates.filter(c => c !== primary);

  return JSON.stringify({
    suggested_sku:  primary,
    alternates,
    supplier_code:  supplierCode,
    name_slug:      nameSlug,
    barcode_match:  barcodeMatch,
    collisions:     Array.from(colliding),
    note: barcodeMatch
      ? `⚠ Barcode ${barcode} is already on file → SKU "${barcodeMatch.sku}" (${barcodeMatch.name}). Ask the founder whether to UPDATE the existing product (no add_product call) or add a NEW one with a different SKU.`
      : `Primary suggestion: ${primary}. Show this to the founder for confirmation before calling add_product. Alternates are also collision-free.`,
  });
}
