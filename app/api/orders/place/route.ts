// POST /api/orders/place
//
// Service-role order creation for the online checkout flow. Needed because
// the orders RLS lockdown (20260528120000) scopes the SELECT policy to
// owner/staff — so a client `insert(order).select('id')` succeeds at the
// INSERT but the RETURNING select is blocked (checkout's customer_id is a
// customers-table record, not the buyer's auth uid), leaving checkout with
// a null order id → "Order not found" at payment start.
//
// This inserts with the service role (bypasses RLS) and returns the id.
// It also FORCES payment_status server-side from payment_method, so a
// client can never create an order pre-marked paid (online orders become
// paid only via the service-role payment APIs after RBC verification).

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { priceCartLine, type ProductPriceSnapshot } from '@/lib/cart-pricing';
import { type SaleUnit, ONLINE_DELIVERY_FEE } from '@/lib/pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Columns the online create flow is allowed to set. Anything else in the
// body is ignored (no arbitrary column injection). payment_status + status
// are forced below, never taken from the client.
const ALLOWED = new Set([
  'order_type', 'channel', 'location', 'payment_method',
  'customer_name', 'customer_phone', 'customer_address', 'customer_id',
  'delivery_type', 'delivery_address', 'delivery_directions', 'delivery_lat', 'delivery_lng',
  'admin_notes', 'wholesale_items', 'wholesale_cost_total', 'items',
  'subtotal', 'vat_amount', 'total', 'promo_code', 'promo_discount',
  'expense_allocation', 'bill_casale_share', 'net_profit', 'fulfillment_status',
]);

type RecomputeResult =
  | { ok: true; subtotal: number; promoDiscount: number; deliveryFee: number; total: number }
  | { ok: false; error: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

// Server-authoritative total. The client's total/subtotal/promo_discount are
// NEVER trusted — we re-derive every line's price from the DB (product_pricing
// + products), re-validate the promo, and add the flat delivery fee server-side.
// This closes the money-integrity hole where a crafted request could understate
// the charge that /api/payment/start later bills to the card.
async function recomputeOnlineTotal(admin: SupabaseClient, row: Record<string, unknown>): Promise<RecomputeResult> {
  const rawItems = Array.isArray(row.items) ? row.items
                 : Array.isArray(row.wholesale_items) ? row.wholesale_items
                 : [];
  // Item shapes differ by entry point: /checkout sends {id, qty}; /market sends
  // {product_id, quantity}. Normalize both.
  const items = (rawItems as Record<string, unknown>[]).map((it) => ({
    productId: String(it.id ?? it.product_id ?? ''),
    qty:       Number(it.qty ?? it.quantity ?? 0),
    source:    String(it.source ?? 'market'),
    clientUnitPrice: Number(it.unit_price ?? it.price ?? 0),
  })).filter((x) => x.productId && Number.isFinite(x.qty) && x.qty > 0);

  if (items.length === 0) return { ok: false, error: 'No valid items in order' };

  const isCard = String(row.payment_method ?? 'cod') === 'card';
  const ids = [...new Set(items.map((x) => x.productId))];

  // Authoritative price sources: online_market (retail) + local_wholesale
  // snapshots from product_pricing, plus products.special_price/window +
  // unit_type (drives wholesale qualification).
  const [{ data: pricingRows }, { data: prodRows }] = await Promise.all([
    admin.from('product_pricing').select('product_id, channel, manual_unit_price')
      .in('product_id', ids).in('channel', ['online_market', 'local_wholesale']),
    admin.from('products').select('id, unit_type, special_price, special_starts_at, special_ends_at')
      .in('id', ids),
  ]);

  const retail    = new Map<string, number>();
  const wholesale = new Map<string, number>();
  for (const p of (pricingRows ?? []) as { product_id: string; channel: string; manual_unit_price: number }[]) {
    if (p.channel === 'online_market')   retail.set(p.product_id, Number(p.manual_unit_price));
    else if (p.channel === 'local_wholesale') wholesale.set(p.product_id, Number(p.manual_unit_price));
  }
  type ProdRow = { id: string; unit_type: string | null; special_price: number | null; special_starts_at: string | null; special_ends_at: string | null };
  const prodMap = new Map<string, ProdRow>();
  for (const p of (prodRows ?? []) as ProdRow[]) prodMap.set(p.id, p);

  const nowMs = Date.now();
  let subtotal = 0;
  for (const it of items) {
    const prod        = prodMap.get(it.productId);
    const retailPrice = retail.get(it.productId);
    if (!prod || retailPrice == null) {
      // Not a catalog (products) item — e.g. a B2B local_wholesale brand line.
      // Card charges must be fully authoritative, so refuse. COD is collected
      // in cash on delivery (lower risk), so allow the client line but flag it.
      if (isCard) return { ok: false, error: 'One or more items are unavailable — please refresh your cart and try again.' };
      if (it.clientUnitPrice > 0) { subtotal += it.clientUnitPrice * it.qty; continue; }
      return { ok: false, error: 'One or more items are unavailable — please refresh your cart and try again.' };
    }
    const startMs = prod.special_starts_at ? new Date(prod.special_starts_at).getTime() : -Infinity;
    const endMs   = prod.special_ends_at   ? new Date(prod.special_ends_at).getTime()   :  Infinity;
    const promo   = (prod.special_price != null && Number(prod.special_price) > 0 && startMs <= nowMs && nowMs <= endMs)
      ? Number(prod.special_price) : null;
    const unit: SaleUnit = prod.unit_type === 'lb' ? 'lb' : prod.unit_type === 'case' ? 'case' : 'each';
    const snap: ProductPriceSnapshot = {
      retail_price:    retailPrice,
      wholesale_price: wholesale.get(it.productId) ?? null,
      promo_price:     promo,
    };
    subtotal += priceCartLine(snap, it.qty, unit).unit_price * it.qty;
  }
  subtotal = r2(subtotal);

  // Re-validate the promo server-side (never trust client promo_discount).
  let promoDiscount = 0;
  const code = typeof row.promo_code === 'string' ? row.promo_code.trim() : '';
  if (code) {
    const { data: promo } = await admin.from('promo_codes').select('*').ilike('code', code).maybeSingle();
    const now = new Date();
    const valid = promo && promo.active
      && (!promo.valid_from  || new Date(promo.valid_from)  <= now)
      && (!promo.valid_until || new Date(promo.valid_until) >= now)
      && (!promo.min_subtotal || subtotal >= Number(promo.min_subtotal))
      && (promo.max_uses == null || Number(promo.uses_count || 0) < Number(promo.max_uses));
    if (valid) {
      promoDiscount = promo.discount_type === 'percent'
        ? r2(subtotal * (Number(promo.discount_value) / 100))
        : Math.min(Number(promo.discount_value), subtotal);
      promoDiscount = Math.max(0, Math.min(promoDiscount, subtotal));
    }
    // Invalid/expired/over-limit code → promoDiscount stays 0; the caller drops
    // promo_code from the row so nothing bogus is stored.
  }

  const deliveryFee = deliveryFor(row);
  const total = r2(Math.max(0, subtotal - promoDiscount) + deliveryFee);
  return { ok: true, subtotal, promoDiscount, deliveryFee, total };
}

// $5 flat delivery on orders that picked a delivery method (the full /checkout
// flow sets delivery_type). The /market quick-buy has no delivery_type → $0,
// matching what that screen shows the customer.
function deliveryFor(row: Record<string, unknown>): number {
  return typeof row.delivery_type === 'string' && row.delivery_type.length > 0 ? ONLINE_DELIVERY_FEE : 0;
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  // Whitelist incoming fields
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.has(k)) row[k] = v;
  }

  // Validate: must have items and a positive total.
  const hasItems = Array.isArray(row.items) ? (row.items as unknown[]).length > 0
                 : Array.isArray(row.wholesale_items) ? (row.wholesale_items as unknown[]).length > 0
                 : false;
  const total = Number(row.total);
  if (!hasItems) return NextResponse.json({ ok: false, error: 'No items in order' }, { status: 400 });
  if (!Number.isFinite(total) || total <= 0) {
    return NextResponse.json({ ok: false, error: 'Invalid order total' }, { status: 400 });
  }

  // Force server-controlled fields (never trust the client for these).
  const payMethod = String(row.payment_method ?? 'cod');
  row.order_type     = row.order_type ?? 'online_market';
  row.status         = 'pending';
  row.payment_status = payMethod === 'card' ? 'payment_pending' : 'pending';
  row.fulfillment_status = 'placed';

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Server-authoritative money: re-derive subtotal/promo/delivery/total from
  // the DB. The client-sent total/subtotal/promo_discount are advisory only,
  // so a tampered request cannot understate what /api/payment/start charges.
  const money = await recomputeOnlineTotal(admin, row);
  if (!money.ok) {
    return NextResponse.json({ ok: false, error: money.error }, { status: 409 });
  }
  const clientTotal = Number(row.total);
  if (Number.isFinite(clientTotal) && Math.abs(clientTotal - money.total) > 0.01) {
    console.warn(`[orders/place] total mismatch — client=${clientTotal} server=${money.total} pay=${payMethod} type=${String(row.order_type)}`);
  }
  row.subtotal = money.subtotal;
  row.total    = money.total;
  // wholesale_cost_total is a total snapshot the client mirrors from `total`;
  // keep it on the authoritative value so no tampered amount is stored.
  if (row.wholesale_cost_total !== undefined) row.wholesale_cost_total = money.total;
  if (money.promoDiscount > 0) {
    row.promo_discount = money.promoDiscount;
  } else {
    delete row.promo_discount;
    delete row.promo_code;
  }

  const { data, error } = await admin.from('orders').insert(row).select('id').single();
  if (error) {
    return NextResponse.json({ ok: false, error: `Order create failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, order_id: (data as { id: string }).id });
}
