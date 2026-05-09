// app/api/products/bulk-import/route.ts
//
// CSV bulk-import for the products catalog. Used by /products → Import CSV.
//
// Headers (first row) — matched case-insensitively, all but `name` optional:
//   name, description, category, price_nassau, price_andros, price_online,
//   price_wholesale, unit, image_url, in_stock, stock_lbs, featured
//
// Match key: lowercase trim of `name`. If a product with the same name
// exists, its row is updated; otherwise a new product is inserted.
//
// Supports a dry_run flag — when true, no writes happen but we still
// return the per-row plan (insert vs update vs error) so the UI can
// preview before applying.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { csv?: string; dry_run?: boolean };

type Row = {
  rowIndex: number;
  values: Record<string, string>;
  action?: 'insert' | 'update' | 'skip';
  productId?: string;
  error?: string;
};

const REQUIRED_HEADERS = ['name'];
const KNOWN_HEADERS = [
  'name', 'description', 'category',
  'price_nassau', 'price_andros', 'price_online', 'price_wholesale',
  'unit', 'image_url', 'in_stock', 'stock_lbs', 'featured',
];
const NUMERIC = new Set([
  'price_nassau', 'price_andros', 'price_online', 'price_wholesale', 'stock_lbs',
]);
const BOOLEAN = new Set(['in_stock', 'featured']);

// Minimal RFC-4180-ish CSV parser. Handles quoted fields, escaped quotes,
// and commas/newlines inside quotes. Returns rows of fields.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQuotes = false; continue; }
      cur += ch; continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(cur); cur = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') {
      row.push(cur); cur = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = []; continue;
    }
    cur += ch;
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  return rows;
}

function coerceBool(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

function coerceNumber(v: string): number {
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 }); }

  if (!body.csv || typeof body.csv !== 'string')
    return NextResponse.json({ ok: false, error: 'csv field required' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service)
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });

  const parsed = parseCSV(body.csv);
  if (parsed.length < 2)
    return NextResponse.json({ ok: false, error: 'CSV is empty' }, { status: 400 });

  const headerRaw = parsed[0].map((h) => h.trim().toLowerCase());
  for (const r of REQUIRED_HEADERS) {
    if (!headerRaw.includes(r))
      return NextResponse.json({ ok: false, error: `Missing required header: ${r}` }, { status: 400 });
  }
  const headerMap: Record<number, string> = {};
  headerRaw.forEach((h, i) => { if (KNOWN_HEADERS.includes(h)) headerMap[i] = h; });

  // Build row plans.
  const dataRows = parsed.slice(1);
  const rows: Row[] = dataRows.map((cells, idx) => {
    const values: Record<string, string> = {};
    cells.forEach((c, i) => {
      const key = headerMap[i];
      if (key) values[key] = c.trim();
    });
    if (!values.name) {
      return { rowIndex: idx + 2, values, error: 'Missing name' };
    }
    return { rowIndex: idx + 2, values };
  });

  const validNames = rows
    .filter((r) => !r.error && r.values.name)
    .map((r) => r.values.name.trim().toLowerCase());

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look up existing products by lowercased name.
  const existing = new Map<string, string>(); // name → id
  if (validNames.length > 0) {
    const { data: existingRows, error: exErr } = await admin
      .from('products')
      .select('id, name')
      .in('name', Array.from(new Set(rows.filter((r) => !r.error).map((r) => r.values.name))));
    if (exErr)
      return NextResponse.json({ ok: false, error: exErr.message }, { status: 500 });
    for (const r of (existingRows || []) as Array<{ id: string; name: string }>) {
      existing.set(r.name.trim().toLowerCase(), r.id);
    }
  }

  // Decide action per row + (if applying) execute.
  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    if (r.error) continue;
    const key = r.values.name.trim().toLowerCase();
    const matchId = existing.get(key);
    r.action = matchId ? 'update' : 'insert';
    r.productId = matchId;
    if (body.dry_run) continue;

    const payload: Record<string, unknown> = {};
    for (const key of KNOWN_HEADERS) {
      if (!(key in r.values)) continue;
      const raw = r.values[key];
      if (raw === '' && key !== 'name') continue;
      if (NUMERIC.has(key))      payload[key] = coerceNumber(raw);
      else if (BOOLEAN.has(key)) payload[key] = coerceBool(raw);
      else                       payload[key] = raw;
    }

    if (matchId) {
      payload.updated_at = new Date().toISOString();
      const { error: upErr } = await admin.from('products').update(payload).eq('id', matchId);
      if (upErr) { r.error = upErr.message; r.action = 'skip'; }
      else { updated += 1; }
    } else {
      payload.created_at = new Date().toISOString();
      const { error: insErr } = await admin.from('products').insert([payload]);
      if (insErr) { r.error = insErr.message; r.action = 'skip'; }
      else { inserted += 1; }
    }
  }

  const errorCount = rows.filter((r) => r.error).length;

  return NextResponse.json({
    ok: true,
    dry_run: !!body.dry_run,
    total: rows.length,
    inserted,
    updated,
    errors: errorCount,
    plan: rows.map((r) => ({
      row: r.rowIndex,
      name: r.values.name || '',
      action: r.action || 'skip',
      productId: r.productId,
      error: r.error,
    })),
  });
}
