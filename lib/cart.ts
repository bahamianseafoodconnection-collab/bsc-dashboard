// lib/cart.ts
//
// Single source of truth for the customer cart's localStorage contract.
// Four surfaces write into bsc_cart (market, product, wishlist, my-orders
// reorder) and one reads it (checkout). Before this helper they all wrote
// slightly different shapes — wishlist and product omitted wholesale_price
// + unit_type, so checkout's per-line wholesale auto-upgrade silently
// short-circuited to retail and customers got overcharged on 10+ lb buys.
//
// CartLine fields that matter for pricing (don't drop them):
//   - price            online_market retail snapshot
//   - wholesale_price  local_wholesale snapshot (drives auto-upgrade @ 10+)
//   - special_price    active closed-date/deal price (wins over wholesale)
//   - unit_type        'lb' | 'case' | 'each' (drives the upgrade rule)
//
// The helper keeps the legacy key name 'bsc_cart' so existing carts from
// before this commit still load.

export const CART_STORAGE_KEY = 'bsc_cart';

export type CartUnitType = 'lb' | 'case' | 'each';

export interface CartLine {
  /** Stable product id (from products table) — used for merge-by-id. */
  id: string;
  /** Where the line was sourced from. 'market' = BSC stock; 'wholesale' = local_wholesale; 'us' = US Shopping. */
  source: 'market' | 'wholesale' | 'us';
  name: string;
  sku?: string | null;
  image_url?: string | null;
  /** Online retail snapshot. Always set. Required for checkout pricing math. */
  price: number;
  /** Local-wholesale snapshot. Set when the product is also sold wholesale; null otherwise. */
  wholesale_price?: number | null;
  /** Active closed-date / deal price. Wins over wholesale auto-upgrade. */
  special_price?: number | null;
  /** Drives the wholesale auto-upgrade rule. 'lb' & 'each' upgrade at 10+; 'case' upgrades on any qty. */
  unit_type?: CartUnitType;
  /** Quantity in this line. Decimals allowed for unit_type='lb'. */
  qty: number;
  /** Unit string shown on the receipt. Usually mirrors unit_type. */
  unit: string;
  /** Optional metadata; safe to omit. */
  category?: string | null;
  description?: string | null;
  wholesaler?: string | null;
  min_qty?: number | null;
  featured?: boolean;
  in_stock?: boolean;
}

/** Safe read — returns [] when storage is unavailable or corrupt. */
export function readCart(): CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
}

/** Replace the whole cart. No-ops on the server. */
export function writeCart(lines: CartLine[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines)); }
  catch { /* quota / disabled storage — fail silently */ }
}

/** Empty the cart. */
export function clearCart(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(CART_STORAGE_KEY); }
  catch { /* ignore */ }
}

/**
 * Add or merge a line into the persisted cart. If a line with the same id
 * + source already exists, its qty is incremented; otherwise the new line
 * is appended. Always preserves the latest pricing snapshot fields, so
 * adding a product twice doesn't downgrade an earlier line that had
 * wholesale_price / special_price populated.
 */
export function addToCart(line: CartLine): CartLine[] {
  const current = readCart();
  const idx = current.findIndex((i) => i.id === line.id && i.source === line.source);
  let next: CartLine[];
  if (idx >= 0) {
    next = current.slice();
    next[idx] = {
      ...current[idx],
      ...line,
      qty: Number(current[idx].qty || 0) + Number(line.qty || 0),
    };
  } else {
    next = [...current, line];
  }
  writeCart(next);
  return next;
}
