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

const REPO_ROOT = process.cwd();
const ALLOWED_READ_PREFIXES = [
  'app/',
  'lib/',
  'components/',
  'supabase/migrations/',
];
const MAX_FILE_CHARS = 50_000;

const WRITE_ROLES = new Set(['founder', 'co_founder']);
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
      case 'send_email_blast':     return await sendEmailBlastTool(input as SendEmailBlastInput, admin, callerId);
      case 'list_flyers':          return await listFlyersTool(admin);
      case 'create_flyer':         return await createFlyerTool(input as CreateFlyerInput, admin, callerId);
      case 'set_flyer_active':     return await setFlyerActiveTool(input as SetFlyerActiveInput, admin, callerId);
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
        product: { sku, name, category, unit_of_measure, unit_type, is_bsc_processed, primary_supplier_id, status: 'active', stock_lbs, ...channelFlags },
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
        category,
        unit_of_measure,
        unit_type,
        is_bsc_processed,
        primary_supplier_id,
        status: 'active',
        stock_lbs,
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
