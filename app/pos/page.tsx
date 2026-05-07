'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

// ============================================================
// TYPES
// ============================================================

type ProductRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string;
  unit_of_measure: string;
  pack_size: string | null;
  image_url: string | null;
  is_bsc_processed: boolean;
};

type PricingRow = {
  product_id: string;
  pricing_mode: string;
  margin_multiplier: number;
  vat_multiplier: number;
  manual_unit_price: number | null;
};

type CostRow = {
  product_id: string;
  cost_per_unit: number;
};

type SellableProduct = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: string;
  unit_of_measure: string;
  pack_size: string | null;
  image_url: string | null;
  is_bsc_processed: boolean;
  unit_price: number;
  cost_per_unit: number;
  pricing_mode: string;
};

type CartItem = {
  product_id: string;
  sku: string;
  name: string;
  unit_price: number;
  cost_per_unit: number;
  unit_of_measure: string;
  qty: number;
};

type PaymentMethod = 'cash' | 'card' | 'transfer';

type CompletedSale = {
  ref: string;
  total: number;
  cost_total: number;
  profit: number;
  items: CartItem[];
  customer: string;
  payment_method: PaymentMethod;
  card_ref: string | null;
};

// ============================================================
// CATEGORY EMOJI MAP (visual helper, not business logic)
// ============================================================

const CATEGORY_EMOJI: Record<string, string> = {
  fresh_seafood: '🐟',
  frozen_seafood: '🦞',
  processed_seafood: '🦐',
  meat: '🥩',
  produce: '🥦',
  juice_smoothie: '🥤',
  wellness_shot: '💪',
  grocery: '🌾',
  snack: '🍪',
  beverage: '💧',
  household: '🧴',
  toiletry: '🧼',
};

const CATEGORY_LABEL: Record<string, string> = {
  fresh_seafood: 'Fresh Seafood',
  frozen_seafood: 'Frozen Seafood',
  processed_seafood: 'Processed',
  meat: 'Meat',
  produce: 'Produce',
  juice_smoothie: 'Juice/Smoothie',
  wellness_shot: 'Wellness',
  grocery: 'Grocery',
  snack: 'Snack',
  beverage: 'Beverage',
  household: 'Household',
  toiletry: 'Toiletry',
};

// ============================================================
// HELPERS
// ============================================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase environment variables not configured.');
  }
  return createBrowserClient(url, key);
}

function computePrice(
  pricing: PricingRow,
  cost: CostRow | undefined,
): number {
  // Manual override mode
  if (pricing.pricing_mode === 'manual_override' && pricing.manual_unit_price != null) {
    return Number(pricing.manual_unit_price);
  }
  // Formula mode: cost * margin_multiplier * vat_multiplier
  if (cost) {
    return Number(cost.cost_per_unit) * Number(pricing.margin_multiplier) * Number(pricing.vat_multiplier);
  }
  // Tiered or unconfigured — fallback to manual if present
  if (pricing.manual_unit_price != null) {
    return Number(pricing.manual_unit_price);
  }
  return 0;
}

function genRef(): string {
  return 'BSC-' + Date.now().toString().slice(-8);
}

const ALLOWED_ROLES = ['founder', 'co_founder', 'manager', 'cashier', 'right_hand'];

// ============================================================
// COMPONENT
// ============================================================

export default function NassauPOSPage() {
  const router = useRouter();

  // Auth state
  const [authChecking, setAuthChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');

  // Catalog state
  const [products, setProducts] = useState<SellableProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);

  // POS state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cardRef, setCardRef] = useState('');

  // Receipt state
  const [completing, setCompleting] = useState(false);
  const [lastSale, setLastSale] = useState<CompletedSale | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);

  // ──────────────────────────────────────────────────────────
  // AUTH CHECK
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/staff-login?next=/pos');
          return;
        }
        const { data: row } = await supabase
          .from('users')
          .select('role, email')
          .eq('id', user.id)
          .single();
        if (cancelled) return;
        if (!row?.role || !ALLOWED_ROLES.includes(row.role)) {
          router.replace('/staff-login?error=role');
          return;
        }
        setUserId(user.id);
        setUserRole(row.role);
        setUserEmail(row.email || user.email || '');
        setAuthChecking(false);
      } catch (e) {
        console.error('Auth check failed:', e);
        if (!cancelled) router.replace('/staff-login?next=/pos');
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  // ──────────────────────────────────────────────────────────
  // CATALOG LOAD
  // ──────────────────────────────────────────────────────────
  const loadCatalog = useCallback(async () => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const supabase = getSupabase();

      // 1. Pull active products sellable at Nassau POS
      const { data: prodRows, error: prodErr } = await supabase
        .from('products')
        .select('id, sku, barcode, name, description, category, unit_of_measure, pack_size, image_url, is_bsc_processed')
        .eq('status', 'active')
        .eq('sell_nassau', true)
        .order('category')
        .order('name');

      if (prodErr) throw prodErr;
      if (!prodRows || prodRows.length === 0) {
        setProducts([]);
        setProductsLoading(false);
        return;
      }

      const productIds = prodRows.map((p) => p.id);

      // 2. Pull current Nassau pricing
      const { data: priceRows, error: priceErr } = await supabase
        .from('product_pricing')
        .select('product_id, pricing_mode, margin_multiplier, vat_multiplier, manual_unit_price')
        .eq('channel', 'nassau_pos')
        .eq('is_current', true)
        .eq('is_active', true)
        .in('product_id', productIds);

      if (priceErr) throw priceErr;

      // 3. Pull current costs
      const { data: costRows, error: costErr } = await supabase
        .from('product_costs')
        .select('product_id, cost_per_unit')
        .eq('is_current', true)
        .in('product_id', productIds);

      if (costErr) throw costErr;

      const priceMap = new Map<string, PricingRow>();
      (priceRows || []).forEach((r) => priceMap.set(r.product_id, r as PricingRow));

      const costMap = new Map<string, CostRow>();
      (costRows || []).forEach((r) => costMap.set(r.product_id, r as CostRow));

      // 4. Build sellable list — only products with valid pricing
      const sellable: SellableProduct[] = [];
      (prodRows as ProductRow[]).forEach((p) => {
        const pricing = priceMap.get(p.id);
        if (!pricing) return; // No Nassau price = not sellable on Nassau POS
        const cost = costMap.get(p.id);
        const unit_price = computePrice(pricing, cost);
        if (unit_price <= 0) return; // Computed zero = unsellable
        sellable.push({
          id: p.id,
          sku: p.sku,
          barcode: p.barcode,
          name: p.name,
          category: p.category,
          unit_of_measure: p.unit_of_measure,
          pack_size: p.pack_size,
          image_url: p.image_url,
          is_bsc_processed: p.is_bsc_processed,
          unit_price,
          cost_per_unit: cost ? Number(cost.cost_per_unit) : 0,
          pricing_mode: pricing.pricing_mode,
        });
      });

      setProducts(sellable);
      setProductsLoading(false);
    } catch (e) {
      console.error('Catalog load failed:', e);
      setProductsError(e instanceof Error ? e.message : 'Failed to load catalog');
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authChecking && userId) {
      loadCatalog();
    }
  }, [authChecking, userId, loadCatalog]);

  // ──────────────────────────────────────────────────────────
  // FILTER + SEARCH
  // ──────────────────────────────────────────────────────────
  const categoriesPresent = Array.from(new Set(products.map((p) => p.category))).sort();
  const filtered = products.filter((p) => {
    const matchCat = category === 'all' || p.category === category;
    const q = search.trim().toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  // ──────────────────────────────────────────────────────────
  // CART
  // ──────────────────────────────────────────────────────────
  function addToCart(p: SellableProduct) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        return prev.map((i) => i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [
        ...prev,
        {
          product_id: p.id,
          sku: p.sku,
          name: p.name,
          unit_price: p.unit_price,
          cost_per_unit: p.cost_per_unit,
          unit_of_measure: p.unit_of_measure,
          qty: 1,
        },
      ];
    });
  }

  function changeQty(product_id: string, delta: number) {
    setCart((prev) => prev.map((i) => i.product_id === product_id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
  }

  function removeItem(product_id: string) {
    setCart((prev) => prev.filter((i) => i.product_id !== product_id));
  }

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const costTotal = cart.reduce((s, i) => s + i.cost_per_unit * i.qty, 0);
  const realProfit = subtotal - costTotal;

  // ──────────────────────────────────────────────────────────
  // COMPLETE SALE
  // ──────────────────────────────────────────────────────────
  async function completeSale() {
    if (cart.length === 0 || completing) return;
    if (paymentMethod === 'card' && !cardRef.trim()) {
      alert('Please enter the card payment reference number from the terminal.');
      return;
    }

    setCompleting(true);
    const ref = genRef();

    try {
      const supabase = getSupabase();

      const lineItems = cart.map((i) => ({
        product_id: i.product_id,
        sku: i.sku,
        name: i.name,
        qty: i.qty,
        unit: i.unit_of_measure,
        unit_price: Number(i.unit_price.toFixed(2)),
        cost_per_unit: Number(i.cost_per_unit.toFixed(2)),
        line_total: Number((i.unit_price * i.qty).toFixed(2)),
        line_cost: Number((i.cost_per_unit * i.qty).toFixed(2)),
      }));

      const { error: insertError } = await supabase.from('orders').insert({
        order_type: 'pos_sale_nassau',
        payment_method: paymentMethod,
        payment_status: 'paid_in_full',
        wholesale_items: lineItems,
        wholesale_cost_total: Number(subtotal.toFixed(2)),
        admin_notes: paymentMethod === 'card' && cardRef ? `Card ref: ${cardRef}` : null,
        user_id: userId,
      });

      if (insertError) {
        console.error('Order insert failed:', insertError);
        alert('Sale could not be saved: ' + insertError.message + '\n\nPlease take a photo of this screen and contact Dedrick.');
        setCompleting(false);
        return;
      }

      const sale: CompletedSale = {
        ref,
        total: subtotal,
        cost_total: costTotal,
        profit: realProfit,
        items: [...cart],
        customer: customerName.trim() || 'Walk-in',
        payment_method: paymentMethod,
        card_ref: paymentMethod === 'card' ? cardRef : null,
      };
      setLastSale(sale);
      setCart([]);
      setCustomerName('');
      setCardRef('');
      setCompleting(false);
    } catch (e) {
      console.error('Sale completion error:', e);
      alert('Sale failed: ' + (e instanceof Error ? e.message : 'unknown error'));
      setCompleting(false);
    }
  }

  function newSale() {
    setLastSale(null);
  }

  // ──────────────────────────────────────────────────────────
  // RENDER — auth checking
  // ──────────────────────────────────────────────────────────
  if (authChecking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#1a2e5a' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
          <div style={{ fontWeight: 700 }}>Verifying access…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* HEADER */}
      <header style={{ backgroundColor: '#1a2e5a', padding: '0 16px', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/dashboard" style={{ color: '#f4c842', fontSize: 13, fontWeight: 700, textDecoration: 'none', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: 8 }}>
              ← BSC Control
            </Link>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: 15 }}>Nassau POS</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
                Firetrail Road · {userRole?.toUpperCase()}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setWhatsappOpen(true)} style={{ backgroundColor: '#25D366', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              💬 WhatsApp
            </button>
            <span style={{ backgroundColor: '#f4c842', color: '#1a2e5a', fontSize: 11, fontWeight: 900, padding: '4px 10px', borderRadius: 20 }}>
              🟡 NASSAU
            </span>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT — PRODUCT GRID */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #ebebeb', padding: '10px 16px' }}>
            <input
              type="text"
              placeholder="Search by name, SKU, or barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '9px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
              <button
                onClick={() => setCategory('all')}
                style={{ padding: '6px 14px', borderRadius: 20, border: 'none', backgroundColor: category === 'all' ? '#1a2e5a' : '#f0f0f0', color: category === 'all' ? '#fff' : '#555', fontSize: 12, fontWeight: category === 'all' ? 800 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                All ({products.length})
              </button>
              {categoriesPresent.map((cat) => {
                const count = products.filter((p) => p.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    style={{ padding: '6px 14px', borderRadius: 20, border: 'none', backgroundColor: category === cat ? '#1a2e5a' : '#f0f0f0', color: category === cat ? '#fff' : '#555', fontSize: 12, fontWeight: category === cat ? 800 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {CATEGORY_EMOJI[cat] || '📦'} {CATEGORY_LABEL[cat] || cat} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {productsLoading && (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
                Loading catalog…
              </div>
            )}
            {productsError && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 16, color: '#991b1b' }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Catalog could not load</div>
                <div style={{ fontSize: 12 }}>{productsError}</div>
                <button onClick={loadCatalog} style={{ marginTop: 10, padding: '6px 14px', borderRadius: 8, border: '1px solid #991b1b', backgroundColor: '#fff', color: '#991b1b', fontWeight: 700, cursor: 'pointer' }}>
                  Retry
                </button>
              </div>
            )}
            {!productsLoading && !productsError && filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                <div style={{ fontWeight: 700 }}>No sellable products found</div>
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  Products need a current Nassau POS price entry to appear here.
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  style={{ backgroundColor: '#fff', border: '1.5px solid #ebebeb', borderRadius: 14, padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', textAlign: 'center' }}
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }} />
                  ) : (
                    <span style={{ fontSize: 32 }}>{CATEGORY_EMOJI[p.category] || '📦'}</span>
                  )}
                  <span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, lineHeight: 1.3 }}>
                    {p.name}
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}>{p.sku}</span>
                  <span style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 15 }}>
                    ${p.unit_price.toFixed(2)}
                  </span>
                  <span style={{ color: '#6b7280', fontSize: 10 }}>per {p.unit_of_measure}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — CART PANEL */}
        <div style={{ width: 340, backgroundColor: '#fff', borderLeft: '1px solid #ebebeb', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

          <div style={{ padding: '14px 16px', borderBottom: '1px solid #ebebeb', backgroundColor: '#1a2e5a' }}>
            <div style={{ color: '#f4c842', fontWeight: 900, fontSize: 15 }}>Current Sale</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
              {cart.length} item{cart.length !== 1 ? 's' : ''} · Nassau POS
            </div>
          </div>

          <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <input
              type="text"
              placeholder="Customer name (optional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
            {cart.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#ccc' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🛒</div>
                <div style={{ fontSize: 13 }}>Tap a product to add</div>
              </div>
            )}
            {cart.map((item) => (
              <div key={item.product_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ color: '#999', fontSize: 11 }}>${item.unit_price.toFixed(2)} per {item.unit_of_measure}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => changeQty(item.product_id, -1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e5e7eb', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 900, fontSize: 14 }}>−</button>
                  <span style={{ fontWeight: 800, fontSize: 13, minWidth: 22, textAlign: 'center' }}>{item.qty}</span>
                  <button onClick={() => changeQty(item.product_id, 1)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', backgroundColor: '#1a2e5a', color: '#fff', cursor: 'pointer', fontWeight: 900, fontSize: 14 }}>+</button>
                </div>
                <div style={{ minWidth: 50, textAlign: 'right' }}>
                  <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: 13 }}>${(item.unit_price * item.qty).toFixed(2)}</div>
                  <button onClick={() => removeItem(item.product_id)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 10, cursor: 'pointer', padding: 0 }}>remove</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '14px 16px', borderTop: '1px solid #ebebeb', backgroundColor: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#666', fontSize: 13 }}>Subtotal</span>
              <span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 13 }}>${subtotal.toFixed(2)}</span>
            </div>
            {costTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, padding: '8px 10px', backgroundColor: '#e8f5e9', borderRadius: 8 }}>
                <span style={{ color: '#2e7d32', fontSize: 13, fontWeight: 700 }}>Real Profit</span>
                <span style={{ color: '#2e7d32', fontWeight: 900, fontSize: 14 }}>${realProfit.toFixed(2)}</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
              {(['cash', 'card', 'transfer'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  style={{ padding: 7, borderRadius: 8, border: '2px solid', borderColor: paymentMethod === m ? '#1a2e5a' : '#e5e7eb', backgroundColor: paymentMethod === m ? '#1a2e5a' : '#fff', color: paymentMethod === m ? '#f4c842' : '#666', fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}
                >
                  {m === 'cash' ? '💵' : m === 'card' ? '💳' : '🏦'} {m}
                </button>
              ))}
            </div>

            {paymentMethod === 'card' && (
              <input
                type="text"
                placeholder="Card terminal ref # (required)"
                value={cardRef}
                onChange={(e) => setCardRef(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 12, outline: 'none', boxSizing: 'border-box', marginBottom: 10, fontFamily: 'monospace' }}
              />
            )}

            <button
              onClick={completeSale}
              disabled={cart.length === 0 || completing}
              style={{ width: '100%', backgroundColor: cart.length === 0 || completing ? '#e5e7eb' : '#f4c842', color: cart.length === 0 || completing ? '#999' : '#1a2e5a', border: 'none', borderRadius: 12, padding: 14, fontWeight: 900, fontSize: 15, cursor: cart.length === 0 || completing ? 'not-allowed' : 'pointer' }}
            >
              {completing ? 'Saving…' : cart.length === 0 ? 'Add Items to Sell' : `Complete Sale · $${subtotal.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>

      {/* WHATSAPP SIDEBAR */}
      {whatsappOpen && (
        <>
          <div onClick={() => setWhatsappOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
          <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 320, backgroundColor: '#fff', zIndex: 51, boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ backgroundColor: '#25D366', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 16 }}>💬 WhatsApp</span>
              <button onClick={() => setWhatsappOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: 20, flex: 1, textAlign: 'center' }}>
              <a href="https://wa.me/12425584495" target="_blank" rel="noreferrer" style={{ display: 'block', backgroundColor: '#25D366', color: '#fff', textDecoration: 'none', borderRadius: 12, padding: 14, fontWeight: 800, fontSize: 14, marginBottom: 20 }}>
                Open BSC WhatsApp Chat
              </a>
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://wa.me/12425584495" alt="WhatsApp QR Code" style={{ borderRadius: 12, border: '4px solid #f0f0f0' }} />
              <p style={{ color: '#666', fontSize: 12, marginTop: 10 }}>Scan to open WhatsApp</p>
              <p style={{ color: '#1a2e5a', fontWeight: 800, fontSize: 14 }}>📱 +1 (242) 558-4495</p>
            </div>
          </div>
        </>
      )}

      {/* RECEIPT MODAL */}
      {lastSale && (
        <>
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 60 }} />
          <div style={{ position: 'fixed', inset: 20, maxWidth: 420, margin: '0 auto', backgroundColor: '#fff', borderRadius: 20, zIndex: 61, overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
            <div style={{ backgroundColor: '#1a2e5a', padding: 24, textAlign: 'center', borderRadius: '20px 20px 0 0' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
              <div style={{ color: '#f4c842', fontWeight: 900, fontSize: 20 }}>Sale Complete</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4, fontFamily: 'monospace' }}>{lastSale.ref}</div>
            </div>

            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 12, fontSize: 12, color: '#666' }}>
                <strong>Customer:</strong> {lastSale.customer}<br />
                <strong>Payment:</strong> {lastSale.payment_method.toUpperCase()}{lastSale.card_ref ? ` (Ref: ${lastSale.card_ref})` : ''}<br />
                <strong>Date:</strong> {new Date().toLocaleString()}
              </div>

              {lastSale.items.map((item) => (
                <div key={item.product_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ color: '#444', fontSize: 13 }}>{item.name} × {item.qty}</span>
                  <span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: 13 }}>${(item.unit_price * item.qty).toFixed(2)}</span>
                </div>
              ))}

              <div style={{ marginTop: 16, padding: 14, backgroundColor: '#fef9e7', borderRadius: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: '#666', fontSize: 14, fontWeight: 700 }}>Total</span>
                  <span style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 18 }}>${lastSale.total.toFixed(2)}</span>
                </div>
                {lastSale.cost_total > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#2e7d32', fontSize: 13, fontWeight: 700 }}>Real Profit</span>
                    <span style={{ color: '#2e7d32', fontWeight: 900, fontSize: 15 }}>${lastSale.profit.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(`BSC Marketplace Receipt\nRef: ${lastSale.ref}\nCustomer: ${lastSale.customer}\nTotal: $${lastSale.total.toFixed(2)}\nPayment: ${lastSale.payment_method.toUpperCase()}\n\nThank you for shopping with BSC!`)}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'block', backgroundColor: '#25D366', color: '#fff', textDecoration: 'none', borderRadius: 12, padding: 12, textAlign: 'center', fontWeight: 800, fontSize: 14, marginBottom: 10 }}
              >
                💬 Send Receipt via WhatsApp
              </a>

              <button onClick={newSale} style={{ width: '100%', backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 12, padding: 13, fontWeight: 900, fontSize: 14, cursor: 'pointer' }}>
                + New Sale
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
