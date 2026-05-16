// Tools the Founder AI can invoke during a conversation.
//
// Each tool has an Anthropic-API JSON-schema definition (TOOLS export)
// and a server-side dispatcher (dispatchTool). The dispatcher runs with
// the service-role Supabase client so the AI can read any public-schema
// table; it is read-only by design (no INSERT/UPDATE/DELETE wired).
//
// Security boundaries:
//   read_file       — only paths under app/, lib/, components/,
//                     supabase/migrations/. No "..", no absolute paths.
//   query_db        — SELECT only. Schema confined to "public".
//                     Filter values are passed to Supabase client which
//                     parametrizes them (no SQL injection vector).
//   recent_orders   — thin wrapper around query_db with sane defaults.
//   health_check    — runs the anomaly scanner; no input, read-only.

import type { SupabaseClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { healthCheck } from './health-check';

const REPO_ROOT = process.cwd();
const ALLOWED_READ_PREFIXES = [
  'app/',
  'lib/',
  'components/',
  'supabase/migrations/',
];
const MAX_FILE_CHARS = 50_000;

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
        table: {
          type: 'string',
          description: 'Table name in the public schema. e.g. "orders", "customers", "expenses".',
        },
        columns: {
          type: 'string',
          description:
            'Comma-separated column list, or "*" for all. Default "*". Example: "id, full_name, current_balance".',
        },
        filters: {
          type: 'object',
          description:
            'Map of column → exact value. Translates to .eq() filters. Example: { is_credit_customer: true }.',
        },
        gte: {
          type: 'object',
          description:
            'Map of column → value for "greater than or equal" filters. Example: { current_balance: 0 } combined with filters.is_credit_customer = true to find anyone owing money.',
        },
        order_by: {
          type: 'string',
          description: 'Column to order by. Prefix with "-" for descending. Example: "-created_at" for newest first.',
        },
        limit: {
          type: 'number',
          description: 'Max rows. Default 20, cap 100.',
        },
      },
      required: ['table'],
    },
  },
  {
    name: 'recent_orders',
    description:
      'Convenience: return the most recent orders. Use this when the founder asks "what sold today" or "show me the last N sales". Equivalent to query_db(table=orders, order_by=-created_at) but cleaner.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'How many. Default 20, cap 100.' },
        order_type: {
          type: 'string',
          description: 'Filter to a channel: pos_sale_nassau, pos_sale_andros, online_market, wholesale.',
        },
      },
    },
  },
  {
    name: 'health_check',
    description:
      'Run the anomaly scanner. Returns a categorized list of findings (schema drift, margin alerts, operational alerts) for everything that looks wrong in the live BSC data right now. Use this when the founder asks "what is broken", "what should I worry about", "anything wrong".',
    input_schema: { type: 'object', properties: {} },
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

export async function dispatchTool(
  name: string,
  input: unknown,
  admin: SupabaseClient,
): Promise<string> {
  try {
    switch (name) {
      case 'read_file':     return await readFileTool(input as ReadFileInput);
      case 'query_db':      return await queryDbTool(input as QueryDbInput, admin);
      case 'recent_orders': return await recentOrdersTool(input as RecentOrdersInput, admin);
      case 'health_check':  return JSON.stringify(await healthCheck(admin));
      default:              return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : 'Tool dispatch failed' });
  }
}

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
