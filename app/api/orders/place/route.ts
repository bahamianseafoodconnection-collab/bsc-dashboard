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
//
// COST-ONLY PROFIT MODEL (2026-06-14):
//   The order stores FACTS, not derived profit. Each line is stamped with its
//   server-snapshotted cost (cost_per_unit from product_costs, multiplied by
//   the unit rule). net_profit / expense_allocation / bill_casale_share are
//   NEVER written here — they are derived later in dashboard reporting against
//   real monthly overhead. bill_casale_share is a human, post-overhead matter
//   and has no place on an order row. This also closes the points-minting hole:
//   the award trigger now reads gross margin (line_total - cost) from items,
//   not a client-forgeable net_profit.
//
// LIST-THEN-ORDER AUTO-RAISE (#6):
//   After a successful insert, resale lines (is_bsc_processed = false) are
//   grouped by their source supplier (product_costs.supplier_id) and one
//   purchase_orders row is raised per supplier, with purchase_order_items
//   carrying the snapshotted cost. Spiny Tail (in-house) lines are NOT raised
//   here — they are part of the seafood-catalog reconciliation project and
//   will be folded in once that data is clean. PO creation is best-effort:
//   a failure is logged but NEVER fails the customer's paid order.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { priceCartLine, type ProductPriceSnapshot } from '@/lib/cart-pricing';
import { type SaleUnit, ONLINE_DELIVERY_FEE } from '@/lib/pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Columns the online create flow is allowed to set. Anything else in the
// body is ignored (no arbitrary column injection). payment_status + status
// are forced below, never taken from the client.
//
// NOTE: expense_allocation / bill_casale_share / net_profit are deliberately
// NOT in this set anymore. They were previously client-supplied and trusted,
// which let a crafted request forge net_profit and (via the award trigger on
// delivery) mint loyalty points. Profit is now derived in reporting, never
// stored on the order. Do not re-add these without revisiting that hole.
const ALLOWED = new Set([
  'order_type', 'channel', 'location', 'payment_method',
  'customer_name', 'customer_phone', 'customer_address', 'customer_id',
  'delivery_type', 'delivery_address', 'delivery_directions', 'delivery_lat', 'delivery_lng',
  'admin_notes', 'wholesale_items', 'wholesale_cost_total', 'items',
  'subtotal', 'vat_amount', 'total', 'promo_code', 'promo_discount',
  'fulfillment_status',
]);

// Spiny Tail Processing Co. supplier id. Its lines are own-processed (in-house)
// and are excluded from resale auto-raise until the seafood-catalog
// reconciliation project flags them in. Kept as a named constant so the
// exclusion is explicit and auditable.
const SPINY_TAIL_SUPPLIER_ID = '001cbec9-e4e8-421d-8dc3-3a1ebd7b50a1';

type RecomputeResult =
  | { ok: true; subtotal: number; promoDiscount: number; deliveryFee: number; total: number }
  | { ok: false; error: string };

// Per-line cost snapshot + procurement metadata, keyed by productId. Built in
// the reprice loop and reused for (a) stamping cost onto items and (b) grouping
// resale lines into purchase orders.
interface CostInfo {
  costPerUnit: number;        // product_costs.cost_per_unit (current row)
  supplierId: string | null;  // product_costs.supplier_id (current row)
  isBscProcessed: boolean;    // products.is_bsc_processed (in-house vs resale)
  unit: SaleUnit;             // 'lb' | 'case' | 'each'
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// The cart lines can arrive under either `items` (checkout) or `wholesale_items`
// (market quick-buy / wholesale). recomputeOnlineTotal already reads both for
// pricing; cost-stamping and auto-raise must operate on the SAME field the lines
// actually live in, and stamp cost back onto that field. Returns the field key
// in use plus the array, or null if neither holds lines.
function activeItemsField(row: Record<string, unknown>): { key: 'items' | 'wholesale_items'; arr: Record<string, unknown>[] } | null {
  if (Array.isArray(row.items) && (row.items as unknown[]).length > 0) {
    return { key: 'items', arr: row.items as Record<string, unknown>[] };
  }
  if (Array.isArray(row.wholesale_items) && (row.wholesale_items as unknown[]).length > 0) {
    return { key: 'wholesale_items', arr: row.wholesale_items as Record<string, unknown>[] };
  }
  return null;
}

// Server-authoritative total. The client's total/subtotal/promo_discount are
// NEVER trusted — we re-derive every line's price from the DB (product_pricing
// + products), re-validate the promo, and add the flat delivery fee server-side.
// This closes the money-integrity hole where a crafted request could understate
// the charge that /api/payment/start later bills to the card.
//
// It ALSO populates `costMap` (out-param) with each product's snapshotted cost,
// supplier, and origin — the single product_costs fetch that serves both the
// per-line cost stamp and the resale auto-raise grouping.
async function recomputeOnlineTotal(
  admin: SupabaseClient,
  row: Record<string, unknown>,
  costMap: Map<string, CostInfo>,
): Promise<RecomputeResult> {
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
  // unit_type (drives wholesale qualification AND cost-by-unit), plus
  // products.is_bsc_processed (origin), plus the current product_costs row
  // (cost_per_unit + supplier_id) for the cost snapshot and PO routing.
  const [{ data: pricingRows }, { data: prodRows }, { data: costRows }] = await Promise.all([
    admin.from('product_pricing').select('product_id, channel, manual_unit_price')
      .in('product_id', ids).in('channel', ['online_market', 'local_wholesale']),
    admin.from('products').select('id, unit_type, special_price, special_starts_at, special_ends_at, is_bsc_processed')
      .in('id', ids),
    admin.from('product_costs').select('product_id, cost_per_unit, supplier_id')
      .in('product_id', ids).eq('is_current', true),
  ]);

  const retail    = new Map<string, number>();
  const wholesale = new Map<string, number>();
  for (const p of (pricingRows ?? []) as { product_id: string; channel: string; manual_unit_price: number }[]) {
    if (p.channel === 'online_market')   retail.set(p.product_id, Number(p.manual_unit_price));
    else if (p.channel === 'local_wholesale') wholesale.set(p.product_id, Number(p.manual_unit_price));
  }
  type ProdRow = { id: string; unit_type: string | null; special_price: number | null; special_starts_at: string | null; special_ends_at: string | null; is_bsc_processed: boolean | null };
  const prodMap = new Map<string, ProdRow>();
  for (const p of (prodRows ?? []) as ProdRow[]) prodMap.set(p.id, p);

  // Cost lookup (current row per product). If a product has more than one
  // is_current row (should not happen under the immutability design), the last
  // one wins — acceptable, and the dashboard surfaces any such anomaly.
  type CostRow = { product_id: string; cost_per_unit: number | null; supplier_id: string | null };
  const costRowMap = new Map<string, CostRow>();
  for (const c of (costRows ?? []) as CostRow[]) costRowMap.set(c.product_id, c);

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

    // Record cost + origin for this product (used for the line cost stamp and
    // resale auto-raise). Only set once per product id.
    if (!costMap.has(it.productId)) {
      const costRow = costRowMap.get(it.productId);
      costMap.set(it.productId, {
        costPerUnit:    costRow?.cost_per_unit != null ? Number(costRow.cost_per_unit) : 0,
        supplierId:     costRow?.supplier_id ?? null,
        isBscProcessed: prod.is_bsc_processed === true,
        unit,
      });
    }
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

// Stamp each item line with its snapshotted cost. Mutates the items array on
// `row` in place so the stored order carries cost-per-line. Cost basis:
//   lb   → cost_per_unit × weight_lb  (actual weight sold; falls back to qty
//          if weight_lb is missing, which should not happen for lb items)
//   each/case → cost_per_unit × quantity
// gross margin for any line is then (line_total - cost), derivable anywhere.
function stampLineCosts(row: Record<string, unknown>, costMap: Map<string, CostInfo>): void {
  const active = activeItemsField(row);
  if (!active) return;
  for (const it of active.arr) {
    const productId = String(it.id ?? it.product_id ?? '');
    const info = costMap.get(productId);
    if (!info) { it.cost_per_unit = null; it.cost = null; continue; }
    const qty      = Number(it.qty ?? it.quantity ?? 0);
    const weightLb = it.weight_lb != null ? Number(it.weight_lb) : null;
    const multiplier = info.unit === 'lb'
      ? (weightLb != null && weightLb > 0 ? weightLb : qty)
      : qty;
    it.cost_per_unit = info.costPerUnit;
    it.cost = r2(info.costPerUnit * multiplier);
  }
}

// Resale auto-raise: group resale lines by supplier and raise one purchase
// order per supplier against the customer's order. In-house (Spiny Tail) lines
// are skipped. Best-effort: any failure is logged and swallowed so the paid
// order is never lost. Returns nothing — the order has already succeeded.
async function raiseResalePurchaseOrders(
  admin: SupabaseClient,
  orderId: string,
  row: Record<string, unknown>,
  costMap: Map<string, CostInfo>,
): Promise<void> {
  try {
    const active = activeItemsField(row);
    const items = active ? active.arr : [];
    // Group resale lines by supplier_id.
    type Line = { productId: string; qty: number; weightLb: number | null; lineCost: number; unitCost: number };
    const bySupplier = new Map<string, Line[]>();
    const blocked: string[] = [];

    for (const it of items) {
      const productId = String(it.id ?? it.product_id ?? '');
      const info = costMap.get(productId);
      if (!info) continue;                       // non-catalog line (COD brand line) — no PO
      if (info.isBscProcessed) continue;         // in-house — skipped this phase
      if (info.supplierId === SPINY_TAIL_SUPPLIER_ID) continue; // belt-and-suspenders
      if (!info.supplierId) { blocked.push(productId); continue; } // resale with no source

      const qty      = Number(it.qty ?? it.quantity ?? 0);
      const weightLb = it.weight_lb != null ? Number(it.weight_lb) : null;
      const multiplier = info.unit === 'lb' ? (weightLb != null && weightLb > 0 ? weightLb : qty) : qty;
      const line: Line = {
        productId,
        qty,
        weightLb,
        unitCost: info.costPerUnit,
        lineCost: r2(info.costPerUnit * multiplier),
      };
      const arr = bySupplier.get(info.supplierId) ?? [];
      arr.push(line);
      bySupplier.set(info.supplierId, arr);
    }

    if (blocked.length > 0) {
      // A resale SKU with no current supplier cannot be auto-sourced. The order
      // still stands; surface it for staff rather than dropping it silently.
      console.warn(`[orders/place] procurement_blocked order=${orderId} products=${blocked.join(',')}`);
    }

    if (bySupplier.size === 0) return; // nothing to procure

    // Resolve supplier display names once.
    const supplierIds = [...bySupplier.keys()];
    const { data: supRows } = await admin.from('suppliers').select('id, name').in('id', supplierIds);
    const supName = new Map<string, string>();
    for (const s of (supRows ?? []) as { id: string; name: string }[]) supName.set(s.id, s.name);

    for (const [supplierId, lines] of bySupplier) {
      const total = r2(lines.reduce((s, l) => s + l.lineCost, 0));
      const { data: po, error: poErr } = await admin.from('purchase_orders').insert({
        order_id:      orderId,
        supplier_id:   supplierId,
        supplier_name: supName.get(supplierId) ?? null,
        status:        'raised',
        total,
        notes:         `Auto-raised from online order ${orderId.slice(0, 8)}`,
      }).select('id').single();

      if (poErr || !po) {
        console.error(`[orders/place] PO insert failed order=${orderId} supplier=${supplierId}: ${poErr?.message ?? 'no id'}`);
        continue;
      }

      const poId = (po as { id: string }).id;
      // Weight (lb) items: store the actual weight in weight_lb (queryable,
      // numeric) and leave units_ordered null. Fixed-unit items: store the
      // count in units_ordered and leave weight_lb null. This keeps PO line
      // data as honest and reportable as the order line data.
      const itemRows = lines.map((l) => ({
        po_id:         poId,
        product_id:    l.productId,
        units_ordered: l.weightLb == null ? l.qty : null,
        weight_lb:     l.weightLb != null ? l.weightLb : null,
        unit_cost:     l.unitCost,
        total_cost:    l.lineCost,
      }));
      const { error: itemErr } = await admin.from('purchase_order_items').insert(itemRows);
      if (itemErr) {
        console.error(`[orders/place] PO items insert failed order=${orderId} po=${poId}: ${itemErr.message}`);
      }
    }
  } catch (e) {
    // Procurement must never fail the customer's order.
    console.error(`[orders/place] auto-raise unexpected error order=${orderId}:`, e);
  }
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

  // Server-authoritative money + per-line cost snapshot in one pass. costMap is
  // populated as a side effect (single product_costs fetch serving cost stamp
  // and auto-raise).
  const costMap = new Map<string, CostInfo>();
  const money = await recomputeOnlineTotal(admin, row, costMap);
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

  // Stamp per-line cost onto items BEFORE insert so the order carries cost facts.
  stampLineCosts(row, costMap);

  const { data, error } = await admin.from('orders').insert(row).select('id').single();
  if (error) {
    return NextResponse.json({ ok: false, error: `Order create failed: ${error.message}` }, { status: 500 });
  }

  const orderId = (data as { id: string }).id;

  // List-then-order: raise resale purchase orders. Best-effort — the customer's
  // order has already succeeded and must not fail if procurement hiccups.
  await raiseResalePurchaseOrders(admin, orderId, row, costMap);

  return NextResponse.json({ ok: true, order_id: orderId });
}
