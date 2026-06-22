// lib/procurement/raise-resale-purchase-orders.ts
//
// Resale purchase-order auto-raise. Given a freshly-paid / committed order, group
// its resale line items by source supplier and raise one purchase_orders row per
// supplier (plus its purchase_order_items). Own-processed (Spiny Tail) lines are
// skipped. Best-effort: every failure is logged, never thrown — the order has
// already succeeded / been paid and must stand.
//
// Origin per line:
//   • Stamped line (carries is_bsc_processed / supplier_id, written at placement
//     by /api/orders/place): is_bsc_processed === true → own-processed, skip;
//     is_bsc_processed === false with a supplier_id → resale, raise to it.
//   • Unstamped line (older orders — NEITHER key present): re-derive the supplier
//     by product_id from product_costs(is_current).supplier_id, falling back to
//     products.primary_supplier_id. A resolved supplier === SPINY_TAIL_SUPPLIER_ID
//     is treated as own-processed and skipped.
//   • Lines are read from BOTH `items` and `wholesale_items` — online card orders
//     place resale lines in wholesale_items and may leave items null.
//
// Idempotency: before inserting a PO for (order_id, supplier_id) we check for an
// existing purchase_orders row with that pair and skip if one is present. A UNIQUE
// index on (order_id, supplier_id) WHERE order_id IS NOT NULL also enforces this
// at the database level.

import type { SupabaseClient } from '@supabase/supabase-js';

// Spiny Tail Processing Co. supplier id. Own-processed (in-house) lines route to
// this supplier and are excluded from resale auto-raise.
export const SPINY_TAIL_SUPPLIER_ID = '001cbec9-e4e8-421d-8dc3-3a1ebd7b50a1';

export const r2 = (n: number): number => Math.round(n * 100) / 100;

export async function raiseResalePurchaseOrdersForOrder(
  admin: SupabaseClient,
  orderId: string,
  paidRow: { items?: unknown; wholesale_items?: unknown },
  deliverTo: 'customer' | 'spiny_tail' = 'customer',
): Promise<void> {
  try {
    // Read resale lines from BOTH fields (online card orders put them in
    // wholesale_items; items may be null). Merge into one list.
    const lines: Record<string, unknown>[] = [];
    if (Array.isArray(paidRow.items))           lines.push(...(paidRow.items as Record<string, unknown>[]));
    if (Array.isArray(paidRow.wholesale_items)) lines.push(...(paidRow.wholesale_items as Record<string, unknown>[]));
    if (lines.length === 0) return;

    // A line is "unstamped" only when NEITHER origin key is present (older
    // orders). Collect those product_ids to re-derive in one round-trip.
    const needsDerive: string[] = [];
    for (const it of lines) {
      const productId = String(it.id ?? it.product_id ?? '');
      if (!productId) continue;
      if (!('is_bsc_processed' in it) && !('supplier_id' in it)) needsDerive.push(productId);
    }

    // Re-derived supplier + unit cost per product_id:
    //   supplier = product_costs(is_current).supplier_id, else products.primary_supplier_id
    //   unitCost = product_costs(is_current).cost_per_unit, else 0
    const derivedSupplier = new Map<string, string | null>();
    const derivedCost     = new Map<string, number>();
    if (needsDerive.length > 0) {
      const ids = [...new Set(needsDerive)];
      const [{ data: costRows }, { data: prodRows }] = await Promise.all([
        admin.from('product_costs').select('product_id, supplier_id, cost_per_unit').in('product_id', ids).eq('is_current', true),
        admin.from('products').select('id, primary_supplier_id').in('id', ids),
      ]);
      const costSupplier = new Map<string, string | null>();
      for (const c of (costRows ?? []) as { product_id: string; supplier_id: string | null; cost_per_unit: number | null }[]) {
        if (!costSupplier.has(c.product_id)) {
          costSupplier.set(c.product_id, c.supplier_id ?? null);
          derivedCost.set(c.product_id, c.cost_per_unit != null ? Number(c.cost_per_unit) : 0);
        }
      }
      const primarySupplier = new Map<string, string | null>();
      for (const p of (prodRows ?? []) as { id: string; primary_supplier_id: string | null }[]) {
        primarySupplier.set(p.id, p.primary_supplier_id ?? null);
      }
      for (const pid of ids) {
        derivedSupplier.set(pid, costSupplier.get(pid) ?? primarySupplier.get(pid) ?? null);
      }
    }

    // Group resale lines by supplier_id.
    type Line = { productId: string; qty: number; weightLb: number | null; unitCost: number; lineCost: number };
    const bySupplier = new Map<string, Line[]>();
    const blocked: string[] = [];

    for (const it of lines) {
      const productId = String(it.id ?? it.product_id ?? '');
      if (!productId) continue;

      let supplierId: string | null;
      let unitCost: number;
      if ('is_bsc_processed' in it || 'supplier_id' in it) {
        // Stamped line — trust the stamped origin/supplier/cost.
        if (it.is_bsc_processed === true) continue;             // own-processed — skip
        supplierId = it.supplier_id != null ? String(it.supplier_id) : null;
        unitCost   = it.cost_per_unit != null ? Number(it.cost_per_unit) : 0;
      } else {
        // Unstamped line — use the re-derived supplier + cost.
        supplierId = derivedSupplier.get(productId) ?? null;
        unitCost   = derivedCost.get(productId) ?? 0;
      }

      if (supplierId === SPINY_TAIL_SUPPLIER_ID) continue;       // own-processed by supplier id — skip
      if (!supplierId) { blocked.push(productId); continue; }    // resale with no source

      // qty must resolve to a clean number. A boolean / non-numeric qty (seen on
      // some line shapes) coerces to NaN here and is floored to 0 rather than
      // being written through as true/false into a numeric column.
      const qtyRaw     = Number(it.qty ?? it.quantity ?? 0);
      const qty        = Number.isFinite(qtyRaw) ? qtyRaw : 0;
      const weightRaw  = it.weight_lb != null ? Number(it.weight_lb) : null;
      const weightLb   = weightRaw != null && Number.isFinite(weightRaw) ? weightRaw : null;
      const multiplier = weightLb != null && weightLb > 0 ? weightLb : qty;
      const lineCost   = it.cost != null ? Number(it.cost) : r2(unitCost * multiplier);

      const arr = bySupplier.get(supplierId) ?? [];
      arr.push({ productId, qty, weightLb, unitCost, lineCost });
      bySupplier.set(supplierId, arr);
    }

    if (blocked.length > 0) {
      console.warn(`[procurement] auto-raise blocked (no supplier) order=${orderId} products=${blocked.join(',')}`);
    }
    if (bySupplier.size === 0) return; // nothing to procure

    // Resolve supplier display names once.
    const supplierIds = [...bySupplier.keys()];
    const { data: supRows } = await admin.from('suppliers').select('id, name').in('id', supplierIds);
    const supName = new Map<string, string>();
    for (const s of (supRows ?? []) as { id: string; name: string }[]) supName.set(s.id, s.name);

    for (const [supplierId, group] of bySupplier) {
      // Idempotency: skip this supplier if a PO already exists for (order, supplier).
      const { data: existing } = await admin.from('purchase_orders')
        .select('id')
        .eq('order_id', orderId)
        .eq('supplier_id', supplierId)
        .limit(1);
      if (existing && existing.length > 0) continue;

      const total = r2(group.reduce((s, l) => s + l.lineCost, 0));
      const itemsJson = group.map((l) => ({
        product_id: l.productId,
        qty:        l.qty,
        weight_lb:  l.weightLb,
        unit_cost:  l.unitCost,
        total_cost: l.lineCost,
      }));

      const { data: po, error: poErr } = await admin.from('purchase_orders').insert({
        order_id:      orderId,
        supplier_id:   supplierId,
        supplier_name: supName.get(supplierId) ?? null,
        items:         itemsJson,
        total,
        status:        'pending',
        deliver_to:    deliverTo, // 'customer' (online) | 'spiny_tail' (POS sales)
        created_by:    null,
        notes:         `Auto-raised from ${deliverTo === 'spiny_tail' ? 'POS' : 'online'} order ${orderId.slice(0, 8)}`,
      }).select('id').single();

      if (poErr || !po) {
        console.error(`[procurement] PO insert failed order=${orderId} supplier=${supplierId}: ${poErr?.message ?? 'no id'}`);
        continue;
      }

      const poId = (po as { id: string }).id;
      // Line-item contract — IDENTICAL to /api/orders/place (Writer A):
      //   Weight (lb) items  → units_ordered = null,  weight_lb = <weight>
      //   Fixed-unit items   → units_ordered = <qty>, weight_lb = null
      // Never write a boolean/non-numeric into units_ordered. weightLb/qty were
      // sanitized to finite numbers above.
      const itemRows = group.map((l) => ({
        po_id:         poId,
        product_id:    l.productId,
        units_ordered: l.weightLb == null ? l.qty : null,
        weight_lb:     l.weightLb != null ? l.weightLb : null,
        unit_cost:     l.unitCost,
        total_cost:    l.lineCost,
      }));
      const { error: itemErr } = await admin.from('purchase_order_items').insert(itemRows);
      if (itemErr) {
        console.error(`[procurement] PO items insert failed order=${orderId} po=${poId}: ${itemErr.message}`);
      }
    }
  } catch (e) {
    // Procurement must never fail a paid order.
    console.error(`[procurement] auto-raise unexpected error order=${orderId}:`, e);
  }
}

// Round-robin, load-balanced assignment of an order's purchase orders across the
// (up to 4) drivers. Each unassigned PO goes to the driver with the fewest
// currently-unconfirmed POs — so a multi-supplier order naturally spreads across
// 2+ drivers, and the day's pickups stay balanced. Best-effort; never throws.
export async function assignDriversForOrder(admin: SupabaseClient, orderId: string): Promise<void> {
  try {
    const { data: drivers } = await admin.from('profiles').select('id').eq('role', 'driver').order('id');
    const driverIds = (drivers ?? []).map((d) => (d as { id: string }).id);
    if (driverIds.length === 0) return; // no drivers configured — leave unassigned

    // Current load = unconfirmed POs already assigned to each driver.
    const { data: loadRows } = await admin.from('purchase_orders')
      .select('driver_assigned_to')
      .in('driver_assigned_to', driverIds)
      .is('supplier_confirmed_at', null);
    const load = new Map<string, number>(driverIds.map((id) => [id, 0]));
    for (const r of (loadRows ?? []) as { driver_assigned_to: string | null }[]) {
      if (r.driver_assigned_to) load.set(r.driver_assigned_to, (load.get(r.driver_assigned_to) ?? 0) + 1);
    }

    const { data: pos } = await admin.from('purchase_orders')
      .select('id').eq('order_id', orderId).is('driver_assigned_to', null);
    for (const po of (pos ?? []) as { id: string }[]) {
      let best = driverIds[0];
      for (const id of driverIds) if ((load.get(id) ?? 0) < (load.get(best) ?? 0)) best = id;
      await admin.from('purchase_orders').update({ driver_assigned_to: best }).eq('id', po.id);
      load.set(best, (load.get(best) ?? 0) + 1);
    }
  } catch (e) {
    console.error(`[procurement] driver assignment error order=${orderId}:`, e);
  }
}
