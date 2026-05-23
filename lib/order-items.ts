// =====================================================================
// lib/order-items.ts
//
// Canonical line-item normalizer for orders.wholesale_items JSONB blob.
// POS (/pos, /pos-andros) writes line items with field `quantity`.
// Older code + the /api/orders/create + /checkout paths use `qty`.
// Same for `unit_price` (POS) vs `price` (legacy). This helper unifies
// the read path so every consumer sees one canonical shape regardless
// of which channel wrote the order. The JSONB blob is never rewritten
// — fix is read-side only.
//
// See app/pos/page.tsx:594 for the canonical POS write shape.
// =====================================================================

export interface NormalizedLineItem {
  name:        string;
  qty:         number;       // canonical — normalized from `quantity` or `qty`
  unit?:       string;
  unit_price?: number;       // canonical — normalized from `unit_price` or `price`
  line_total?: number;
  sku?:        string;
  weight_lb?:  number;
  product_id?: string;
  emoji?:      string;       // legacy items column flair (orders.tsx)
}

export function parseOrderItems(raw: unknown): NormalizedLineItem[] {
  if (!raw) return [];
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return (arr as Array<Record<string, unknown>>).map((it) => ({
    name:       String(it.name ?? it.sku ?? ''),
    qty:        Number(it.quantity ?? it.qty ?? 0),
    unit:       it.unit as string | undefined,
    unit_price: it.unit_price != null ? Number(it.unit_price)
              : it.price      != null ? Number(it.price)
              : undefined,
    line_total: it.line_total != null ? Number(it.line_total) : undefined,
    sku:        it.sku as string | undefined,
    weight_lb:  it.weight_lb  != null ? Number(it.weight_lb)  : undefined,
    product_id: it.product_id as string | undefined,
    emoji:      it.emoji      != null ? String(it.emoji)      : undefined,
  }));
}

export function countOrderItems(raw: unknown): number {
  return parseOrderItems(raw).reduce((s, it) => s + it.qty, 0);
}
