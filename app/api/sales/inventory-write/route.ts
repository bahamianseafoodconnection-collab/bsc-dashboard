// app/api/sales/inventory-write/route.ts
//
// Decrements inventory after a sale by writing inventory_movements rows.
// One row per line item that has a real product_id.
//
// Wire from POS Nassau, POS Andros, online checkout. Callers fire-and-forget
// with .catch() — a failed inventory write must NEVER block a completed sale.
//
// Schema match (Day 5 inventory_movements):
//   movement_type, product_id, to_location_id, quantity, unit,
//   source_supplier_id, notes, occurred_at, recorded_by, device_info, ip_address
//
// We use to_location_id as "the location whose stock changed" — same column
// the receive flow uses. movement_type='sale' for outbound, distinguishing
// it from 'receive' or 'adjustment'.

import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

type SaleItem = {
  product_id?: string | null;
  sku?: string | null;
  qty: number;
  unit?: string | null;
};

type Body = {
  location_code?: string;
  order_id?: string | null;
  items?: SaleItem[];
  channel?: string; // 'nassau_pos' | 'andros_pos' | 'online_market' (informational)
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const locationCode = (body.location_code || '').trim().toUpperCase();
  const orderId = body.order_id || null;
  const channel = body.channel || null;

  if (!locationCode) {
    return NextResponse.json({ error: 'Missing location_code' }, { status: 400 });
  }

  // Filter to items with a real product_id and positive qty. Wholesale-source
  // cart items (from local_wholesale_products) intentionally have no
  // product_id and are skipped — they don't live in our inventory.
  const decrementable = items
    .filter((it) => it.product_id && Number(it.qty) > 0)
    .map((it) => ({
      product_id: it.product_id as string,
      sku: it.sku ?? null,
      qty: Number(it.qty),
      unit: it.unit ?? 'unit',
    }));

  if (decrementable.length === 0) {
    return NextResponse.json({
      success: true,
      written: 0,
      skipped: items.length,
      note: 'No items with product_id; nothing to decrement.',
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  // Resolve the caller (for recorded_by audit). Try Bearer first, fall back
  // to SSR cookies — same robust pattern as /api/founder-ai.
  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  let recordedBy: string | null = null;

  if (bearer) {
    try {
      const c = createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data } = await c.auth.getUser(bearer);
      recordedBy = data?.user?.id ?? null;
    } catch {
      /* fall through */
    }
  }
  if (!recordedBy) {
    try {
      const cookieStore = await cookies();
      const ssr = createServerClient(url, anon, {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (toSet: CookieToSet[]) =>
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            ),
        },
      });
      const { data } = await ssr.auth.getUser();
      recordedBy = data?.user?.id ?? null;
    } catch {
      /* recordedBy stays null */
    }
  }

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve the location once.
  const { data: locRow, error: locErr } = await admin
    .from('inventory_locations')
    .select('id')
    .eq('code', locationCode)
    .maybeSingle();

  if (locErr || !locRow) {
    return NextResponse.json(
      {
        error: `Location with code '${locationCode}' not found.`,
        details: locErr?.message,
      },
      { status: 404 }
    );
  }
  const toLocationId = locRow.id as string;

  // Audit metadata
  const userAgent = req.headers.get('user-agent') ?? null;
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  const ip =
    (fwd.split(',')[0] || req.headers.get('x-real-ip') || '').trim() || null;
  const nowIso = new Date().toISOString();
  const noteBase = orderId
    ? `Sale${channel ? ` · ${channel}` : ''} · order ${orderId}`
    : `Sale${channel ? ` · ${channel}` : ''}`;

  const rows = decrementable.map((it) => ({
    movement_type: 'sale',
    product_id: it.product_id,
    to_location_id: toLocationId,
    quantity: it.qty,
    unit: it.unit,
    notes: it.sku ? `${noteBase} · ${it.sku}` : noteBase,
    occurred_at: nowIso,
    recorded_by: recordedBy,
    device_info: userAgent,
    ip_address: ip,
  }));

  const { error: insErr, data: inserted } = await admin
    .from('inventory_movements')
    .insert(rows)
    .select('id');

  if (insErr) {
    return NextResponse.json(
      {
        error: `Inventory write failed: ${insErr.message}`,
        attempted: rows.length,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    written: inserted?.length ?? 0,
    skipped: items.length - decrementable.length,
  });
}
