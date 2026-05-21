'use client';

// app/pos-andros/page.tsx
//
// Andros POS — DB-backed catalog mirror of /pos (Nassau), with the
// andros_pos channel (43% margin) and the existing CETA2024 PIN gate.
//
// Architecture is intentionally a near-twin of the Nassau register so the
// same fixes / features land in both with one PR. Differences vs Nassau:
//   - PIN screen (Ceta's Variety Store local lockout)
//   - get_pos_catalog channel = 'andros_pos'
//   - splitSale / financials channel = 'andros_pos'
//   - inventory-write location_code = 'ANDROS'
//   - order_type = 'pos_sale_andros'
//   - Purple chrome instead of navy/gold

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { plainError } from '@/lib/plain-error';
import { splitSale, recordSaleFinancials } from '@/lib/finance';
import AddInventoryButton from '@/components/intake/AddInventoryButton';
import {
  fetchOverheadMetrics,
  computeProfitSplit,
  ANDROS_POS_MARGIN,
  type OverheadMetrics,
} from '@/lib/profit';

export const dynamic = 'force-dynamic';

const ANDROS_PIN = 'CETA2024';

type CatalogRow = {
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
  pricing_mode: string | null;
  margin_multiplier: number | null;
  vat_multiplier: number | null;
  manual_unit_price: number | null;
  cost_per_unit: number | null;
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

type PaymentMethod = 'cash' | 'card' | 'transfer' | 'account';

interface CashierSession {
  id: string;
  cashier_user_id: string;
  location: string;
  status: 'open' | 'closed';
  opened_at: string;
  opening_float_cents: number;
}

type CompletedSale = {
  ref: string;
  total: number;
  cost_total: number;
  profit: number;
  items: CartItem[];
  customer: string;
  customer_phone: string;
  payment_method: PaymentMethod;
  card_ref: string | null;
};

const CATEGORY_EMOJI: Record<string, string> = {
  fresh_seafood: '🐟', frozen_seafood: '🦞', processed_seafood: '🦐',
  meat: '🥩', produce: '🥦', juice_smoothie: '🥤',
  wellness_shot: '💪', grocery: '🌾', snack: '🍪',
  beverage: '💧', household: '🧴', toiletry: '🧼',
};

const CATEGORY_LABEL: Record<string, string> = {
  fresh_seafood: 'Fresh Seafood', frozen_seafood: 'Frozen Seafood',
  processed_seafood: 'Processed', meat: 'Meat', produce: 'Produce',
  juice_smoothie: 'Juice/Smoothie', wellness_shot: 'Wellness',
  grocery: 'Grocery', snack: 'Snack', beverage: 'Beverage',
  household: 'Household', toiletry: 'Toiletry',
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured.');
  return createBrowserClient(url, key);
}

function computePrice(r: CatalogRow): number {
  if (r.pricing_mode === 'manual_override' && r.manual_unit_price != null) {
    return Number(r.manual_unit_price);
  }
  if (
    r.pricing_mode === 'formula' &&
    r.cost_per_unit != null &&
    r.margin_multiplier != null &&
    r.vat_multiplier != null
  ) {
    return Number(r.cost_per_unit) * Number(r.margin_multiplier) * Number(r.vat_multiplier);
  }
  if (r.manual_unit_price != null) return Number(r.manual_unit_price);
  return 0;
}

function genRef() {
  return 'BSC-AND-' + Date.now().toString().slice(-8);
}

export default function AndrosPOSPage() {
  // ─── PIN gate ─────────────────────────────────────────────────────
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  function tryPin() {
    if (pinInput === ANDROS_PIN) {
      setUnlocked(true);
      setPinError('');
    } else {
      setPinError('Incorrect PIN. Try again.');
      setPinInput('');
    }
  }
  function addPinDigit(d: string) {
    if (pinInput.length < 8) setPinInput((p) => p + d);
  }

  // ─── Register state ───────────────────────────────────────────────
  const [products, setProducts] = useState<SellableProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [unsellableCount, setUnsellableCount] = useState(0);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cardRef, setCardRef] = useState('');
  const [completing, setCompleting] = useState(false);
  const [lastSale, setLastSale] = useState<CompletedSale | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [overhead, setOverhead] = useState<OverheadMetrics | null>(null);

  // Cashier shift / cash drawer (parity with /pos Nassau)
  const [cashierSession, setCashierSession]   = useState<CashierSession | null>(null);
  const [shiftOpenModal, setShiftOpenModal]   = useState(false);
  const [shiftCloseModal, setShiftCloseModal] = useState(false);
  const [openFloat, setOpenFloat]             = useState('');
  const [openNotes, setOpenNotes]             = useState('');
  const [closeCounted, setCloseCounted]       = useState('');
  const [closeNotes, setCloseNotes]           = useState('');
  const [shiftBusy, setShiftBusy]             = useState(false);

  async function loadAndrosSession() {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('cash_drawer_sessions')
      .select('id, cashier_user_id, location, status, opened_at, opening_float_cents')
      .eq('cashier_user_id', user.id)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setCashierSession((data as CashierSession | null) ?? null);
  }
  useEffect(() => { if (unlocked) loadAndrosSession(); }, [unlocked]);

  async function handleOpenAndrosShift() {
    const dollars = parseFloat(openFloat);
    if (isNaN(dollars) || dollars < 0) { alert('Enter the opening float (BSD).'); return; }
    setShiftBusy(true);
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('open_cashier_session', {
      p_location:    'andros',
      p_float_cents: Math.round(dollars * 100),
      p_notes:       openNotes.trim() || null,
    });
    setShiftBusy(false);
    if (error) { alert('Open shift failed: ' + error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    setCashierSession(row as CashierSession);
    setShiftOpenModal(false);
    setOpenFloat(''); setOpenNotes('');
  }

  async function handleCloseAndrosShift() {
    if (!cashierSession) return;
    const counted = parseFloat(closeCounted);
    if (isNaN(counted) || counted < 0) { alert('Enter the counted cash (BSD).'); return; }
    setShiftBusy(true);
    const supabase = getSupabase();
    const sessionId = cashierSession.id;
    const { error } = await supabase.rpc('close_cashier_session', {
      p_session_id:    sessionId,
      p_counted_cents: Math.round(counted * 100),
      p_notes:         closeNotes.trim() || null,
    });
    setShiftBusy(false);
    if (error) { alert('Close shift failed: ' + error.message); return; }
    fetch('/api/cashiers/variance-alert', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({ session_id: sessionId }),
    }).catch((err) => console.warn('Variance alert failed:', err));
    setCashierSession(null);
    setShiftCloseModal(false);
    setCloseCounted(''); setCloseNotes('');
    alert('Shift closed. Variance saved — see /dashboard/cashiers.');
  }

  useEffect(() => {
    fetchOverheadMetrics().then(setOverhead).catch(() => setOverhead(null));
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user.id || null);
    });
  }, [unlocked]);

  const loadCatalog = useCallback(async () => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const supabase = getSupabase();
      const { data: rows, error } = await supabase.rpc('get_pos_catalog', {
        p_channel: 'andros_pos',
      });
      if (error) throw error;

      // Side-fetch closed-date specials and override unit_price when a
      // product is currently inside its special window. Same rule as
      // /market + /pos (Nassau).
      const catalogIds = ((rows as CatalogRow[]) || []).map(r => r.id);
      const specialMap = new Map<string, number>();
      if (catalogIds.length > 0) {
        const { data: specials } = await supabase
          .from('products')
          .select('id, special_price, special_starts_at, special_ends_at')
          .in('id', catalogIds)
          .not('special_price', 'is', null);
        const nowMs = Date.now();
        for (const s of (specials ?? []) as Array<{ id: string; special_price: number | null; special_starts_at: string | null; special_ends_at: string | null }>) {
          const startMs = s.special_starts_at ? new Date(s.special_starts_at).getTime() : -Infinity;
          const endMs   = s.special_ends_at   ? new Date(s.special_ends_at).getTime()   :  Infinity;
          if (s.special_price != null && startMs <= nowMs && nowMs <= endMs) {
            specialMap.set(s.id, Number(s.special_price));
          }
        }
      }

      const sellable: SellableProduct[] = [];
      let unsellable = 0;
      ((rows as CatalogRow[]) || []).forEach((r) => {
        const regular_price = computePrice(r);
        const special = specialMap.get(r.id);
        const unit_price = special != null ? special : regular_price;
        if (unit_price <= 0) {
          unsellable++;
          return;
        }
        sellable.push({
          id: r.id,
          sku: r.sku,
          barcode: r.barcode,
          name: r.name,
          category: r.category,
          unit_of_measure: r.unit_of_measure,
          pack_size: r.pack_size,
          image_url: r.image_url,
          is_bsc_processed: r.is_bsc_processed,
          unit_price,
          cost_per_unit: r.cost_per_unit ? Number(r.cost_per_unit) : 0,
        });
      });
      setProducts(sellable);
      setUnsellableCount(unsellable);
    } catch (e) {
      setProductsError(e instanceof Error ? e.message : 'Failed to load catalog');
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked) loadCatalog();
  }, [unlocked, loadCatalog]);

  const categoriesPresent = Array.from(new Set(products.map((p) => p.category))).sort();
  const filtered = products.filter((p) => {
    const matchCat = category === 'all' || p.category === category;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  function addToCart(p: SellableProduct) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing)
        return prev.map((i) =>
          i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i
        );
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
  function changeQty(id: string, delta: number) {
    setCart((prev) =>
      prev.map((i) => (i.product_id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i))
    );
  }
  function removeItem(id: string) {
    setCart((prev) => prev.filter((i) => i.product_id !== id));
  }

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const costTotal = cart.reduce((s, i) => s + i.cost_per_unit * i.qty, 0);
  // splitSale strips VAT before computing BSC profit (the prior `subtotal *
  // 0.43` overstated profit by ~57%).
  const realProfit = splitSale(subtotal, costTotal, 'andros_pos').bsc_profit;

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

      const customerNameClean = customerName.trim();
      const customerPhoneClean = customerPhone.trim();

      // Customer upsert (sync, fails-soft) — see Nassau POS for rationale.
      let customerIdLinked: string | null = null;
      if (customerNameClean || customerPhoneClean) {
        try {
          const upRes = await fetch('/api/customers/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: customerNameClean,
              phone: customerPhoneClean || null,
              source: 'pos_andros',
              order_total_bsd: Number(subtotal.toFixed(2)),
            }),
          });
          const upJson = await upRes.json();
          if (upJson?.customer_id) customerIdLinked = upJson.customer_id;
        } catch (err) {
          console.warn('Customer upsert failed:', err);
        }
      }

      const profit = overhead
        ? computeProfitSplit(Number(subtotal.toFixed(2)), ANDROS_POS_MARGIN, overhead.expense_rate)
        : null;

      const paymentStatus = paymentMethod === 'account' ? 'unpaid' : 'paid_in_full';
      const { data: insertedOrder, error: insertError } = await supabase
        .from('orders')
        .insert({
          order_type: 'pos_sale_andros',
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          wholesale_items: lineItems,
          wholesale_cost_total: Number(subtotal.toFixed(2)),
          customer_name: customerNameClean || 'Walk-in',
          customer_phone: customerPhoneClean || null,
          customer_id: customerIdLinked,
          admin_notes:
            paymentMethod === 'card' && cardRef ? `Card ref: ${cardRef}` : null,
          user_id: userId,
          // Andros cashier shift linkage — admin dashboard joins these.
          cashier_session_id: cashierSession?.id ?? null,
          cashier_user_id:    userId,
          expense_allocation: profit?.expense_allocation ?? null,
          bill_casale_share:  profit?.bill_casale_share  ?? null,
          net_profit:         profit?.net_profit         ?? null,
        })
        .select('id')
        .single();
      if (insertError) {
        alert('Sale could not be saved: ' + plainError(insertError));
        setCompleting(false);
        return;
      }

      const orderId = insertedOrder?.id ?? null;

      // Channel-correct financial split. Fire-and-forget.
      recordSaleFinancials({
        saleAmount: subtotal,
        costBasis: costTotal,
        channel: 'andros_pos',
        orderId,
      }).catch((err) => console.warn('Financials log failed:', err));

      // Inventory decrement at ANDROS location. Fire-and-forget.
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (session?.access_token) {
            headers.Authorization = `Bearer ${session.access_token}`;
          }
          await fetch('/api/sales/inventory-write', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              location_code: 'ANDROS',
              order_id: orderId,
              channel: 'andros_pos',
              items: lineItems.map((i) => ({
                product_id: i.product_id,
                sku: i.sku,
                qty: i.qty,
                unit: i.unit,
              })),
            }),
          });
        } catch (err) {
          console.warn('Inventory decrement failed:', err);
        }
      })();

      // Queue order confirmation if we have a phone. Fire-and-forget.
      if (customerPhoneClean && customerNameClean && customerNameClean !== 'Walk-in') {
        fetch('/api/notifications/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: 'whatsapp',
            recipient_phone: customerPhoneClean,
            recipient_name: customerNameClean,
            template_key: 'order_confirmation_pos_andros',
            body: `Hi ${customerNameClean}, thanks for shopping at BSC Marketplace Andros (Ceta's Variety). Your receipt: BSD $${subtotal.toFixed(2)} (${ref}). — BSC`,
            related_order_id: orderId,
            related_customer_id: customerIdLinked,
          }),
        }).catch((err) => console.warn('Notification queue failed:', err));
      }

      setLastSale({
        ref,
        total: subtotal,
        cost_total: costTotal,
        profit: realProfit,
        items: [...cart],
        customer: customerNameClean || 'Walk-in',
        customer_phone: customerPhoneClean,
        payment_method: paymentMethod,
        card_ref: paymentMethod === 'card' ? cardRef : null,
      });
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setCardRef('');
    } catch (e) {
      alert('Sale failed: ' + plainError(e));
    } finally {
      setCompleting(false);
    }
  }

  /* ─── PIN SCREEN ─── */
  if (!unlocked) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#1a0a2e',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <div style={{ width: '100%', maxWidth: '340px' }}>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '20px',
                backgroundColor: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                fontSize: '20px',
                fontWeight: 900,
                color: '#fff',
              }}
            >
              POS
            </div>
            <h1 style={{ color: '#fff', fontWeight: 900, fontSize: '22px', margin: '0 0 4px' }}>
              Andros POS
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px', margin: '0 0 4px' }}>
              {"Ceta's Variety Store · Mastic Point"}
            </p>
            <p style={{ color: '#a78bfa', fontSize: '12px', fontWeight: 700, margin: 0 }}>
              43% BSC Margin
            </p>
          </div>

          <div
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '14px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                color: 'rgba(255,255,255,0.4)',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '2px',
                marginBottom: '14px',
              }}
            >
              Enter Staff PIN
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '10px',
                marginBottom: '10px',
              }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: '13px',
                    height: '13px',
                    borderRadius: '50%',
                    backgroundColor:
                      i < pinInput.length ? '#7c3aed' : 'rgba(255,255,255,0.15)',
                  }}
                />
              ))}
            </div>
            {pinError && (
              <div style={{ color: '#f87171', fontSize: '13px', fontWeight: 600 }}>
                {pinError}
              </div>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
              gap: '10px',
              marginBottom: '16px',
            }}
          >
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].map((key) => (
              <button
                key={key}
                onClick={() => {
                  if (key === 'C') {
                    setPinInput('');
                    setPinError('');
                  } else if (key === 'OK') tryPin();
                  else addPinDigit(key);
                }}
                style={{
                  height: '58px',
                  borderRadius: '14px',
                  border: 'none',
                  backgroundColor:
                    key === 'OK'
                      ? '#7c3aed'
                      : key === 'C'
                        ? 'rgba(239,68,68,0.2)'
                        : 'rgba(255,255,255,0.08)',
                  color: key === 'C' ? '#f87171' : '#fff',
                  fontSize: key === 'OK' ? '15px' : '20px',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                {key}
              </button>
            ))}
          </div>

          <Link
            href="/dashboard"
            style={{
              display: 'block',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.3)',
              fontSize: '12px',
              textDecoration: 'none',
            }}
          >
            ← Back to BSC Control
          </Link>
        </div>
      </div>
    );
  }

  /* ─── REGISTER ─── */
  return (
    <>
    <AddInventoryButton role="andros_staff" variant="fab" />
    <div
      style={{
        display: 'flex',
        height: '100vh',
        backgroundColor: '#f5f0ff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* LEFT — products */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            backgroundColor: '#7c3aed',
            padding: '14px 20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ height: 44, padding: 4, background: '#fff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.18)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/bsc-marketplace-logo.png" alt="BSC Market Place" style={{ height: 36, width: 'auto', display: 'block' }} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#c4b5fd' }}>
                  💜 Andros Register
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                  Ceta&rsquo;s Variety · Mastic Point
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {cashierSession ? (
                <button onClick={() => setShiftCloseModal(true)}
                  style={{ background: 'rgba(34,197,94,0.18)', color: '#4ade80', border: '1px solid #16a34a', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                  title={`Open · float $${(cashierSession.opening_float_cents/100).toFixed(2)}`}>
                  🟢 Shift open
                </button>
              ) : (
                <button onClick={() => setShiftOpenModal(true)}
                  style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid #f87171', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                  🔴 No shift
                </button>
              )}
              <Link
                href="/dashboard"
                style={{
                  color: '#c4b5fd',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  padding: '6px 12px',
                  borderRadius: 8,
                }}
              >
                ← BSC Control
              </Link>
            </div>
          </div>

          <input
            type="text"
            placeholder="Search by name, SKU, or barcode…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 10,
              border: 'none',
              fontSize: 14,
              outline: 'none',
              marginBottom: 10,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            <button
              onClick={() => setCategory('all')}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: 'none',
                backgroundColor: category === 'all' ? '#fff' : 'rgba(255,255,255,0.15)',
                color: category === 'all' ? '#7c3aed' : '#fff',
                fontSize: 12,
                fontWeight: category === 'all' ? 800 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              All ({products.length})
            </button>
            {categoriesPresent.map((cat) => {
              const count = products.filter((p) => p.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 20,
                    border: 'none',
                    backgroundColor:
                      category === cat ? '#fff' : 'rgba(255,255,255,0.15)',
                    color: category === cat ? '#7c3aed' : '#fff',
                    fontSize: 12,
                    fontWeight: category === cat ? 800 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {CATEGORY_EMOJI[cat] || ''} {CATEGORY_LABEL[cat] || cat} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Product grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {productsLoading && (
            <div style={{ color: '#7c3aed', textAlign: 'center', padding: 40 }}>
              Loading catalog…
            </div>
          )}
          {!productsLoading && productsError && (
            <div
              style={{
                backgroundColor: '#fde8e8',
                border: '1px solid #f5b5b5',
                color: '#dc2626',
                padding: 14,
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              ⚠️ Could not load catalog: {productsError}
            </div>
          )}
          {!productsLoading && !productsError && filtered.length === 0 && (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40, fontSize: 13 }}>
              No products match. {unsellableCount > 0 && `(${unsellableCount} skipped — no price set)`}
            </div>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10,
            }}
          >
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                style={{
                  background: '#fff',
                  border: '1.5px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 12,
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ fontSize: 22 }}>
                  {CATEGORY_EMOJI[p.category] || '📦'}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: '#4c1d95',
                    lineHeight: 1.2,
                  }}
                >
                  {p.name}
                </div>
                {p.sku && (
                  <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#94a3b8' }}>
                    {p.sku}
                  </div>
                )}
                <div style={{ marginTop: 'auto', fontWeight: 900, color: '#7c3aed' }}>
                  BSD ${p.unit_price.toFixed(2)}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT — cart */}
      <div
        style={{
          width: 360,
          background: '#fff',
          borderLeft: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            background: '#4c1d95',
            color: '#fff',
            padding: '14px 18px',
            fontWeight: 900,
            fontSize: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Cart</span>
          <span style={{ color: '#c4b5fd', fontWeight: 700, fontSize: 12 }}>
            {cart.reduce((s, i) => s + i.qty, 0)} items
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {cart.length === 0 && (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40, fontSize: 13 }}>
              Tap a product to add it.
            </div>
          )}
          {cart.map((it) => (
            <div
              key={it.product_id}
              style={{
                display: 'flex',
                gap: 8,
                padding: '8px 0',
                borderBottom: '1px solid #f1f5f9',
                alignItems: 'center',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4c1d95' }}>
                  {it.name}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  ${it.unit_price.toFixed(2)} × {it.qty} = ${(it.unit_price * it.qty).toFixed(2)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => changeQty(it.product_id, -1)}
                  style={qtyBtn}
                >
                  −
                </button>
                <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700 }}>
                  {it.qty}
                </span>
                <button
                  onClick={() => changeQty(it.product_id, +1)}
                  style={qtyBtn}
                >
                  +
                </button>
                <button
                  onClick={() => removeItem(it.product_id)}
                  style={{ ...qtyBtn, color: '#dc2626' }}
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Customer + payment */}
        <div style={{ borderTop: '1px solid #e5e7eb', padding: 14 }}>
          <input
            type="text"
            placeholder="Customer name (optional)"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            style={inputStyle}
          />
          <input
            type="tel"
            placeholder="Customer phone (optional, enables tracking)"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            style={{ ...inputStyle, marginTop: 8 }}
          />

          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {(['cash', 'card', 'transfer', 'account'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 8,
                  border:
                    paymentMethod === m
                      ? '2px solid #7c3aed'
                      : '1.5px solid #e5e7eb',
                  background: paymentMethod === m ? '#f5f0ff' : '#fff',
                  fontWeight: 800,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  color: paymentMethod === m ? '#4c1d95' : '#64748b',
                }}
              >
                {m}
              </button>
            ))}
          </div>

          {paymentMethod === 'card' && (
            <input
              type="text"
              placeholder="Card terminal reference number"
              value={cardRef}
              onChange={(e) => setCardRef(e.target.value)}
              style={{ ...inputStyle, marginTop: 8 }}
            />
          )}

          <div
            style={{
              borderTop: '1px solid #e5e7eb',
              marginTop: 14,
              paddingTop: 12,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 18,
              fontWeight: 900,
              color: '#4c1d95',
            }}
          >
            <span>Total</span>
            <span>BSD ${subtotal.toFixed(2)}</span>
          </div>
          {costTotal > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: '#16a34a',
                marginTop: 4,
              }}
            >
              <span>Live profit (excl VAT)</span>
              <span style={{ fontWeight: 900 }}>${realProfit.toFixed(2)}</span>
            </div>
          )}

          <button
            onClick={completeSale}
            disabled={completing || cart.length === 0}
            style={{
              marginTop: 14,
              width: '100%',
              padding: 14,
              borderRadius: 10,
              border: 'none',
              background:
                completing || cart.length === 0 ? '#cbd5e1' : '#7c3aed',
              color: '#fff',
              fontWeight: 900,
              fontSize: 15,
              cursor: completing || cart.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {completing ? 'Saving…' : 'Complete sale'}
          </button>
        </div>
      </div>

      {/* Last sale receipt overlay */}
      {lastSale && (
        <div
          onClick={() => setLastSale(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 200,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 22,
              maxWidth: 360,
              width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 30 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#4c1d95' }}>
                Sale recorded
              </div>
              <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                {lastSale.ref}
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                marginBottom: 4,
                color: '#475569',
              }}
            >
              <span>Customer</span>
              <span>{lastSale.customer}</span>
            </div>
            {lastSale.customer_phone && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  marginBottom: 4,
                  color: '#475569',
                }}
              >
                <span>Phone</span>
                <span>{lastSale.customer_phone}</span>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                marginBottom: 4,
                color: '#475569',
              }}
            >
              <span>Payment</span>
              <span style={{ textTransform: 'capitalize' }}>{lastSale.payment_method}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 16,
                fontWeight: 900,
                color: '#4c1d95',
                borderTop: '1px solid #e5e7eb',
                paddingTop: 8,
                marginTop: 8,
              }}
            >
              <span>Total</span>
              <span>BSD ${lastSale.total.toFixed(2)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: '#16a34a',
                marginTop: 4,
              }}
            >
              <span>BSC profit (excl VAT)</span>
              <span style={{ fontWeight: 900 }}>${lastSale.profit.toFixed(2)}</span>
            </div>
            <button
              onClick={() => setLastSale(null)}
              style={{
                marginTop: 14,
                width: '100%',
                padding: 12,
                borderRadius: 10,
                border: 'none',
                background: '#7c3aed',
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Next sale
            </button>
          </div>
        </div>
      )}

      {/* ── OPEN SHIFT MODAL (Andros) ── */}
      {shiftOpenModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 380, width: '100%', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 900, color: '#4c1d95' }}>Open Andros Shift</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 0, marginBottom: 14 }}>Count the cash already in the drawer — that becomes your float.</p>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Opening float (BSD)</label>
            <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="e.g. 200.00"
              value={openFloat} onChange={(e) => setOpenFloat(e.target.value)} autoFocus
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 18, marginBottom: 10, boxSizing: 'border-box' }} />
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Notes (optional)</label>
            <input type="text" placeholder="any context for this shift…"
              value={openNotes} onChange={(e) => setOpenNotes(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShiftOpenModal(false)} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', background: '#e5e7eb', color: '#475569', fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleOpenAndrosShift} disabled={shiftBusy} style={{ flex: 2, padding: '12px 0', borderRadius: 10, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 900, cursor: 'pointer', opacity: shiftBusy ? 0.5 : 1 }}>
                {shiftBusy ? 'Opening…' : '✓ Open Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CLOSE SHIFT MODAL (Andros) ── */}
      {shiftCloseModal && cashierSession && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 380, width: '100%', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 900, color: '#4c1d95' }}>Close Andros Shift</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 0, marginBottom: 4 }}>
              Float opened: <strong style={{ color: '#4c1d95' }}>${(cashierSession.opening_float_cents/100).toFixed(2)}</strong>
            </p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 0, marginBottom: 14 }}>
              Count the cash in the drawer NOW (including the original float). System computes variance against cash sales.
            </p>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Counted cash (BSD)</label>
            <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="e.g. 1245.50"
              value={closeCounted} onChange={(e) => setCloseCounted(e.target.value)} autoFocus
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 18, marginBottom: 10, boxSizing: 'border-box' }} />
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Close notes (optional)</label>
            <input type="text" placeholder="missing receipts, voids, anything to flag…"
              value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShiftCloseModal(false)} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', background: '#e5e7eb', color: '#475569', fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCloseAndrosShift} disabled={shiftBusy} style={{ flex: 2, padding: '12px 0', borderRadius: 10, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 900, cursor: 'pointer', opacity: shiftBusy ? 0.5 : 1 }}>
                {shiftBusy ? 'Closing…' : '✓ Close Shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

const qtyBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  border: '1px solid #e5e7eb',
  background: '#fff',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1.5px solid #e5e7eb',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};
