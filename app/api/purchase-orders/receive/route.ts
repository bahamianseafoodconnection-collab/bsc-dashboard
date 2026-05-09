// app/api/purchase-orders/receive/route.ts
//
// Hook fired after a purchase order is processed (weight in/out captured).
//
// What it does:
//   1. Looks up the matching public.products row for the linked supplier
//      product by name (best-effort)
//   2. Updates products.cost_per_unit to the freshly-computed
//      true_cost_per_lb so POS COGS stays current
//   3. Posts a receive-type inventory_movements row at the configured
//      location (default NASSAU) for the finished weight
//
// Fire-and-forget from the client. Failures here are logged in the response
// but don't poison the PO's processing-save flow.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  purchase_order_id?: string;
  product_name?: string;       // canonical product name to match in products
  finished_weight_lbs?: number;
  true_cost_per_lb?: number;
  unit?: string;
  location_code?: string;       // default NASSAU
  recorded_by?: string | null;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const finishedWeight = Number(body.finished_weight_lbs ?? 0);
  const truecost = Number(body.true_cost_per_lb ?? 0);
  const productName = (body.product_name || '').trim();
  const locationCode = (body.location_code || 'NASSAU').trim().toUpperCase();
  const unit = (body.unit || 'lb').trim();
  const poId = body.purchase_order_id || null;
  const recordedBy = body.recorded_by || null;

  if (!productName || finishedWeight <= 0 || truecost <= 0) {
    return NextResponse.json(
      { error: 'product_name, finished_weight_lbs, true_cost_per_lb required' },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve location
  const { data: locRow, error: locErr } = await admin
    .from('inventory_locations')
    .select('id')
    .eq('code', locationCode)
    .maybeSingle();
  if (locErr || !locRow) {
    return NextResponse.json(
      { error: `Location '${locationCode}' not found`, details: locErr?.message },
      { status: 404 }
    );
  }
  const toLocationId = locRow.id as string;

  // Try to match a product by exact name (case-insensitive). Best-effort —
  // if no match, we still post the inventory movement with a null product_id
  // so the receive is captured for audit, just not linked to a SKU.
  const { data: prodRow } = await admin
    .from('products')
    .select('id, name, cost_per_unit')
    .ilike('name', productName)
    .limit(1)
    .maybeSingle();

  const productId = (prodRow?.id as string) ?? null;
  const oldCost = prodRow?.cost_per_unit != null ? Number(prodRow.cost_per_unit) : null;

  const result: {
    success: boolean;
    inventory_movement_id?: string;
    product_matched?: { id: string; name: string; old_cost: number | null; new_cost: number };
    product_match_warning?: string;
    cost_update_warning?: string;
  } = { success: true };

  // Update product cost basis if matched
  if (productId) {
    const { error: updErr } = await admin
      .from('products')
      .update({ cost_per_unit: round4(truecost), updated_at: new Date().toISOString() })
      .eq('id', productId);
    if (updErr) {
      result.cost_update_warning = updErr.message;
    } else {
      result.product_matched = {
        id: productId,
        name: prodRow!.name as string,
        old_cost: oldCost,
        new_cost: round4(truecost),
      };
    }
  } else {
    result.product_match_warning = `No product matched name '${productName}' — receive logged unlinked.`;
  }

  // Post inventory_movements row for the finished output
  const noteParts = ['Receive from PO processing'];
  if (poId) noteParts.push(`po=${poId}`);
  noteParts.push(`true_cost=${round4(truecost)}/lb`);

  const { data: mv, error: mvErr } = await admin
    .from('inventory_movements')
    .insert({
      movement_type: 'receive',
      product_id: productId,
      to_location_id: toLocationId,
      quantity: finishedWeight,
      unit,
      notes: noteParts.join(' · '),
      occurred_at: new Date().toISOString(),
      recorded_by: recordedBy,
    })
    .select('id')
    .single();

  if (mvErr) {
    return NextResponse.json(
      { ...result, success: false, inventory_movement_error: mvErr.message },
      { status: 500 }
    );
  }
  result.inventory_movement_id = mv.id as string;

  return NextResponse.json(result);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
