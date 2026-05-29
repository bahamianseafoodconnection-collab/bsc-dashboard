'use client';

// /checkout — premium ecommerce flow.
// Tailwind redesign. Three views: summary -> payment -> done.

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  CHANNEL_MARGIN,
  VAT_RATE,
  recordSaleFinancials,
} from '@/lib/finance';
import {
  fetchOverheadMetrics,
  computeProfitSplit,
  ONLINE_MARGIN,
  type OverheadMetrics,
} from '@/lib/profit';
import type { PaymentPayload } from '@/components/CardPaymentModal';
import { priceCartLine, type ProductPriceSnapshot } from '@/lib/cart-pricing';
import type { SaleUnit } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

function fmt(n: number) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

interface CartItem {
  id: string;
  source: 'market' | 'wholesale' | 'us';
  name: string;
  price: number;                    // online_market snapshot (retail — never overridden)
  special_price?: number | null;    // active closed-date special; passed through priceCartLine.promo_price (wins over wholesale)
  wholesale_price?: number | null;  // local_wholesale snapshot — drives auto-upgrade
  unit_type?: string;               // 'lb' | 'case' | 'each'
  qty: number;
  unit: string;
  sku?: string;
  wholesaler?: string;
  image_url?: string;
}

// Same helper as /market — auto-upgrade per line based on qty + unit_type.
// Carts saved before this code lack wholesale_price / unit_type; retail wins.
function linePricing(item: CartItem) {
  const snap: ProductPriceSnapshot = {
    retail_price: item.price,
    wholesale_price: item.wholesale_price ?? null,
    // Active special wins over wholesale auto-upgrade — see lib/cart-pricing.ts.
    promo_price: item.special_price != null && item.special_price > 0 ? item.special_price : null,
  };
  const unit: SaleUnit = item.unit_type === 'lb' ? 'lb' : item.unit_type === 'case' ? 'case' : 'each';
  return priceCartLine(snap, item.qty, unit);
}

type View = 'summary' | 'payment' | 'done';

const ISLANDS = ['Nassau', 'Andros', 'Exuma', 'Grand Bahama', 'Abaco', 'Eleuthera', 'Other'];

// Suspense wrapper required by Next 15 because CheckoutInner calls
// useSearchParams() to read the PnP return-redirect banner params
// (?declined=1 / ?problem=1 / ?msg=...). Without this wrapper the
// prerender pass at build time bails out — same pattern the founder-AI
// intake page uses (per feedback_nextjs_page_exports memory rule).
export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-100 font-sans text-slate-900 antialiased">
        <div className="mx-auto max-w-screen-md px-4 py-12 text-sm text-slate-500">
          Loading checkout…
        </div>
      </div>
    }>
      <CheckoutInner />
    </Suspense>
  );
}

function CheckoutInner() {
  const router = useRouter();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // Item 8 / Task #72: optional email so guests (not signed in) can
  // still receive their receipt + order confirmation. Logged-in users
  // fall back to session?.user?.email when this is blank.
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [island, setIsland] = useState('Nassau');
  const [note, setNote] = useState('');
  // Nassau delivery: GPS pin + house-color/landmark so the driver finds the
  // house. lat/lng → orders.delivery_lat/lng; house color → delivery_directions.
  const [houseColor, setHouseColor] = useState('');
  const [geoLat, setGeoLat] = useState<number | null>(null);
  const [geoLng, setGeoLng] = useState<number | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'capturing' | 'ok' | 'error'>('idle');
  const [geoMsg, setGeoMsg] = useState('');
  // Mailboat shipping: which boat + the date to drop at the dock. Date must
  // be ≥48h out (enforced via min attr + formValid + the proceed guard).
  const [mailboatName, setMailboatName] = useState('');
  const [mailboatDate, setMailboatDate] = useState('');
  const [view, setView] = useState<View>('summary');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [refNo, setRefNo] = useState('');
  const [overhead, setOverhead] = useState<OverheadMetrics | null>(null);

  useEffect(() => {
    fetchOverheadMetrics().then(setOverhead).catch(() => setOverhead(null));
  }, []);
  const [last4, setLast4] = useState('');

  // ─── Plug'n Pay return banner ─────────────────────────────────────
  // When PnP redirects the customer back to /checkout after a declined
  // or problem outcome, /api/payment/return/* attaches ?declined=1 or
  // ?problem=1 along with the human-readable message from
  // lib/plugnpay/rbc-codes.ts. We surface that as a banner above the
  // payment-method picker. Successful payments redirect to
  // /account/orders/[id]?paid=1 and never come back through here.
  const searchParams = useSearchParams();
  const pnpDeclined = searchParams?.get('declined') === '1';
  const pnpProblem  = searchParams?.get('problem');
  const pnpMessage  = searchParams?.get('msg');
  const pnpBanner: { kind: 'declined' | 'problem'; message: string } | null =
    pnpDeclined
      ? { kind: 'declined',
          message: pnpMessage || 'Payment declined by your bank. Please contact your financial institution and try again.' }
      : pnpProblem
      ? { kind: 'problem',
          message: pnpMessage || 'We had a temporary problem reaching your bank. Please try again in a moment.' }
      : null;
  // Launch posture (β 2026-06-08): online card payments are deferred
  // until the real RBC integration ships + AVS-gated card-on-file
  // flow lands. /checkout defaults to (and currently only offers)
  // cash on delivery. The 'card' branch + CardPaymentModal render
  // below stay intact so re-enabling is a single options-array edit.
  const [payMethod, setPayMethod] = useState<'card' | 'cod'>('cod');
  // Where this order is going. 'nassau' = pickup or local delivery in
  // Nassau. 'mailboat' = ship to Family Island via mailboat.
  const [deliveryMethod, setDeliveryMethod] = useState<'nassau' | 'mailboat'>('nassau');

  // Promo code state
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoApplied, setPromoApplied] = useState<{
    promo_id: string;
    code: string;
    discount_amount: number;
  } | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      // Switched from sessionStorage → localStorage so the cart survives
      // tab close. /market writes to the same key on every state change.
      const stored = window.localStorage.getItem('bsc_cart');
      if (stored) setCart(JSON.parse(stored));
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  // Pre-fill name/phone/address from profile + default saved address (if signed in).
  // Only fills empty fields so a customer who started typing isn't overwritten.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const [{ data: prof }, { data: addr }] = await Promise.all([
        supabase.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle(),
        supabase
          .from('customer_addresses')
          .select('street, island, recipient_name, phone, is_default')
          .eq('auth_user_id', user.id)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const profName  = (prof?.full_name as string) || '';
      const profPhone = (prof?.phone as string)     || '';
      const fillName  = addr?.recipient_name || profName;
      const fillPhone = addr?.phone || profPhone;
      setName((n) => n || fillName);
      setPhone((p) => p || fillPhone);
      if (addr?.street) setAddress((a) => a || addr.street);
      if (addr?.island) setIsland((i) => i === 'Nassau' ? addr.island : i);
    })();
    return () => { cancelled = true; };
  }, []);

  // Clear the saved cart once we've reached the done view so the next
  // visit to /market starts fresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (view !== 'done') return;
    try { window.localStorage.removeItem('bsc_cart'); } catch { /* ignore */ }
  }, [view]);

  // Cart subtotal now reflects per-line wholesale auto-upgrade (10+ lbs of
  // one product, or by-the-case). Customers see the wholesale discount
  // automatically without any code-entry friction.
  const subtotal = cart.reduce((s, i) => s + linePricing(i).unit_price * i.qty, 0);
  const wholesaleSavings = cart.reduce((s, i) => {
    const p = linePricing(i);
    if (!p.upgraded_to_wholesale) return s;
    return s + (i.price - p.unit_price) * i.qty;
  }, 0);
  const wholesaleLineCount = cart.filter(i => linePricing(i).upgraded_to_wholesale).length;
  const promoDiscount = promoApplied
    ? Math.min(promoApplied.discount_amount, subtotal)
    : 0;
  // Flat delivery fee on every online order (founder: "all delivery cost is $5.00").
  const DELIVERY_FEE = 5;
  const total = Math.max(0, subtotal - promoDiscount) + DELIVERY_FEE;

  // Re-validate (or drop) an applied promo whenever the cart changes — the
  // discount may have crossed a min_subtotal threshold.
  useEffect(() => {
    if (!promoApplied) return;
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/promos/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoApplied.code, subtotal, email: null, phone: phone || null }),
      });
      const j = await res.json();
      if (cancelled) return;
      if (!j?.valid) {
        setPromoApplied(null);
        setPromoError(j?.reason || 'Promo no longer valid');
      } else {
        setPromoApplied({
          promo_id: j.promo_id,
          code: j.code,
          discount_amount: Number(j.discount_amount || 0),
        });
      }
    })();
    return () => { cancelled = true; };
    // Intentionally only re-run when subtotal flips — the form fields don't
    // affect promo validity day-to-day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  async function applyPromo() {
    setPromoError(null);
    const code = promoCodeInput.trim();
    if (!code) { setPromoError('Enter a code'); return; }
    setPromoBusy(true);
    try {
      const res = await fetch('/api/promos/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal, email: null, phone: phone || null }),
      });
      const j = await res.json();
      if (!j?.valid) {
        setPromoError(j?.reason || 'Code not valid');
        setPromoApplied(null);
      } else {
        setPromoApplied({
          promo_id: j.promo_id,
          code: j.code,
          discount_amount: Number(j.discount_amount || 0),
        });
      }
    } catch {
      setPromoError('Could not check that code');
    } finally {
      setPromoBusy(false);
    }
  }

  function clearPromo() {
    setPromoApplied(null);
    setPromoCodeInput('');
    setPromoError(null);
  }

  // Capture the customer's GPS pin for Nassau delivery. Best-effort: if the
  // browser blocks it, the house-color/landmark field still gets the driver
  // there, so this never blocks checkout.
  function captureLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('error');
      setGeoMsg('Location not supported on this device — type your landmark below.');
      return;
    }
    setGeoStatus('capturing');
    setGeoMsg('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLat(Math.round(pos.coords.latitude * 1e6) / 1e6);
        setGeoLng(Math.round(pos.coords.longitude * 1e6) / 1e6);
        setGeoStatus('ok');
      },
      (err) => {
        setGeoStatus('error');
        setGeoMsg(err.code === err.PERMISSION_DENIED
          ? 'Location permission denied — you can still type your house color/landmark below.'
          : 'Could not get your location — type your house color/landmark below.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  const payload: PaymentPayload = {
    amount: subtotal,
    fees: 0,
    total,
    description: `BSC Market Order - ${cart.length} item${cart.length !== 1 ? 's' : ''}`,
    receiptType: 'shopping',
    orderId: orderId || undefined,
    metadata: {
      items: cart.map((i) => ({
        id: i.id,
        source: i.source,
        sku: i.sku,
        name: i.name,
        qty: i.qty,
        unit: i.unit,
        price: i.price,
      })),
      delivery: { name, phone, address, island, note },
    },
  };

  async function createOrder(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();

    // Customer upsert before order insert (sync, fails-soft).
    let customerIdLinked: string | null = null;
    if (name.trim() || phone.trim() || session?.user) {
      try {
        const upRes = await fetch('/api/customers/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim() || null,
            // Item 8: typed email wins; falls back to session email for
            // logged-in users who didn't retype it.
            email: email.trim() || session?.user?.email || null,
            source: 'online',
            auth_user_id: session?.user?.id || null,
            order_total_bsd: total,
          }),
        });
        const upJson = await upRes.json();
        if (upJson?.customer_id) customerIdLinked = upJson.customer_id;
      } catch (err) {
        console.warn('Customer upsert failed:', err);
      }
    }

    // Stamp every cart line with its applied channel + upgrade flag so the
    // receipt + reports show wholesale auto-upgrades and so per-line
    // unit_price reflects the price the customer actually paid.
    const stampedItems = cart.map((i) => {
      const p = linePricing(i);
      return {
        ...i,
        unit_price:             p.unit_price,
        line_total:             +(p.unit_price * i.qty).toFixed(2),
        retail_unit_price:      i.price,
        applied_channel:        p.applied_channel,
        upgraded_to_wholesale:  p.upgraded_to_wholesale,
      };
    });

    // Driver/dock directions, per method. Nassau = house color/landmark
    // (+ GPS stored separately in delivery_lat/lng); mailboat = boat name +
    // drop-off date. Stored in orders.delivery_directions.
    const deliveryDirections =
      deliveryMethod === 'nassau'
        ? ([
            houseColor.trim() ? `House/landmark: ${houseColor.trim()}` : '',
            geoLat != null && geoLng != null ? `GPS ${geoLat},${geoLng}` : '',
          ].filter(Boolean).join(' · ') || null)
        : `Mailboat: ${mailboatName.trim()} · deliver to dock by ${mailboatDate}`;

    const orderRow: Record<string, unknown> = {
      order_type: 'online_market',
      payment_method: payMethod,
      // 'card' starts as 'payment_pending' — /api/payment/start flips it
      // to 'paid' on a successful PnP return (after hash + Query Tx
      // verify), or back to 'pending' on decline/retry. The simulator's
      // legacy 'processing' state is no longer used.
      payment_status: payMethod === 'cod' ? 'pending' : 'payment_pending',
      // Start the delivery lifecycle. Order enters the driver queue at
      // 'placed'; staff advance it through preparing → … → delivered.
      fulfillment_status: 'placed',
      wholesale_items: stampedItems,
      wholesale_cost_total: total,
      // Populate the canonical total so receipts/tracking/admin show a value
      // (orders.total — NOT total_amount, and there is no user_id column).
      // total = items subtotal − promo + $5 flat delivery. subtotal stored
      // alongside so the $5 delivery line is derivable on receipts/admin.
      subtotal: subtotal,
      total: total,
      customer_name: name.trim() || null,
      customer_phone: phone.trim() || null,
      customer_address: address.trim() || null,
      customer_id: customerIdLinked,
      delivery_type: deliveryMethod,
      delivery_directions: deliveryDirections,
      ...(deliveryMethod === 'nassau' && geoLat != null && geoLng != null
        ? { delivery_lat: geoLat, delivery_lng: geoLng }
        : {}),
      admin_notes: [
        deliveryMethod === 'mailboat'
          ? `Mailboat "${mailboatName.trim()}" to ${island} · deliver to dock by ${mailboatDate}`
          : `Nassau · ${island}`,
        note,
      ].filter(Boolean).join(' · ') || null,
    };
    if (promoApplied && promoDiscount > 0) {
      orderRow.promo_code = promoApplied.code;
      orderRow.promo_discount = promoDiscount;
    }

    if (overhead) {
      const profit = computeProfitSplit(Number(total) || 0, ONLINE_MARGIN, overhead.expense_rate);
      orderRow.expense_allocation = profit.expense_allocation;
      orderRow.bill_casale_share  = profit.bill_casale_share;
      orderRow.net_profit         = profit.net_profit;
    }

    // Create through the service-role endpoint. A direct client insert
    // can't read its own id back after the orders RLS lockdown (the
    // RETURNING select is owner/staff-scoped and checkout's customer_id is
    // a customers-record, not the buyer's auth uid) — which left the order
    // id blank and broke card payment ("Order not found"). The endpoint
    // also forces payment_status server-side.
    let orderIdInserted = '';
    try {
      const placeRes = await fetch('/api/orders/place', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(orderRow),
      });
      const placeJson = await placeRes.json();
      if (!placeRes.ok || !placeJson.ok) throw new Error(placeJson.error || `HTTP ${placeRes.status}`);
      orderIdInserted = placeJson.order_id || '';
    } catch (err) {
      // Returning '' makes the caller (handleProceedToPayment) abort before
      // the payment step instead of starting card payment with no order.
      console.error('Order place failed:', err);
      return '';
    }

    // Record promo redemption (fire-and-forget).
    if (orderIdInserted && promoApplied && promoDiscount > 0) {
      fetch('/api/promos/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promo_id: promoApplied.promo_id,
          promo_code: promoApplied.code,
          order_id: orderIdInserted,
          customer_id: customerIdLinked,
          customer_email: email.trim() || session?.user?.email || null,   // Item 8: typed email wins
          customer_phone: phone.trim() || null,
          applied_amount: promoDiscount,
        }),
      }).catch((err) => console.warn('Promo redemption log failed:', err));
    }

    // Persist a channel-correct financial split. We don't carry per-item cost
    // through to checkout, so we back-compute the cost basis from the cart
    // total assuming online_market sacred pricing. Mathematically exact when
    // the items follow the rule (cost × 1.25 × 1.10), an approximation when
    // wholesale items (different margin) sneak in. Fire-and-forget so a
    // missing financials table can't block the order.
    const onlineToCost =
      1 / ((1 + CHANNEL_MARGIN.online_market) * (1 + VAT_RATE));
    recordSaleFinancials({
      saleAmount: total,
      costBasis: total * onlineToCost,
      channel: 'online_market',
      orderId: orderIdInserted || null,
    }).catch((err) => console.warn('Financials log failed:', err));

    // Decrement inventory for source='market' items (BSC stock). Wholesale
    // items come from local_wholesale_products and aren't in our inventory.
    const marketItems = cart
      .filter((i) => i.source === 'market')
      .map((i) => ({
        product_id: i.id,
        sku: i.sku ?? null,
        qty: i.qty,
        unit: i.unit,
      }));
    if (marketItems.length > 0) {
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
              location_code: 'NASSAU',
              order_id: orderIdInserted || null,
              channel: 'online_market',
              items: marketItems,
            }),
          });
        } catch (err) {
          console.warn('Inventory decrement failed:', err);
        }
      })();
    }

    // Queue an order confirmation. WhatsApp first if we have a phone,
    // email otherwise. Fire-and-forget. Guest checkout now gets email
    // confirmation when they typed one (Item 8 / Task #72) — previously
    // only logged-in users got email when no phone was provided.
    const sessionEmail = (await supabase.auth.getUser()).data?.user?.email ?? null;
    const candidateEmail = email.trim() || sessionEmail;
    // Light shape check so we don't queue garbage. Same regex used elsewhere.
    const validEmail = candidateEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail) ? candidateEmail : null;
    if (name.trim() && (phone.trim() || validEmail)) {
      const channel = phone.trim() ? 'whatsapp' : 'email';
      const body = `Hi ${name.trim()}, thanks for ordering from BSC Marketplace. Total: BSD $${total.toFixed(2)}. ${
        payMethod === 'cod'
          ? "We'll confirm pickup or delivery shortly. Pay cash on arrival."
          : 'Your payment is being processed.'
      } Order #${orderIdInserted ? orderIdInserted.slice(0, 8) : 'pending'}. — BSC`;
      fetch('/api/notifications/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          recipient_phone: phone.trim() || null,
          recipient_email: channel === 'email' ? validEmail : null,
          recipient_name: name.trim(),
          template_key: 'order_confirmation_online',
          subject: 'Your BSC Marketplace order',
          body,
          related_order_id: orderIdInserted || null,
          related_customer_id: customerIdLinked,
        }),
      }).catch((err) => console.warn('Notification queue failed:', err));
    }

    return orderIdInserted;
  }

  async function handleProceedToPayment() {
    if (!name.trim() || !phone.trim() || !address.trim()) return;
    const id = await createOrder();
    if (!id) {
      alert('Sorry — we couldn’t place your order just now. Please try again, or choose Cash on Delivery.');
      return;  // do NOT advance to the payment step with no order
    }
    setOrderId(id);
    // Card flow → 'payment' view renders <PnpRedirect> which POSTs to
    // /api/payment/start and auto-submits the returned form to
    // pay1.plugnpay.com (customer leaves bscbahamas.com).
    setView(payMethod === 'cod' ? 'done' : 'payment');
  }

  // Earliest mailboat drop-off date: the first calendar date whose start is
  // ≥48h from now (founder rule). String compare on YYYY-MM-DD is chronological.
  const minMailboatDateStr = (() => {
    const cutoff = Date.now() + 48 * 60 * 60 * 1000;
    const d = new Date(cutoff);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < cutoff) d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const formValid = Boolean(
    name.trim() && phone.trim() && address.trim() &&
    (deliveryMethod === 'nassau' ? houseColor.trim() : true) &&
    (deliveryMethod === 'mailboat'
      ? (mailboatName.trim() && mailboatDate && mailboatDate >= minMailboatDateStr)
      : true),
  );

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 antialiased">
      {/* ─── Header ─── */}
      <header className="bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-md items-center justify-between px-4 sm:h-16 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            {/* Bahamian flag — inline SVG so it renders identically on every browser */}
            <span
              aria-label="Bahamas"
              role="img"
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-gold bg-white shadow-sm sm:h-10 sm:w-10"
            >
              <svg viewBox="0 0 60 30" className="h-6 w-6 sm:h-7 sm:w-7" xmlns="http://www.w3.org/2000/svg">
                <rect width="60" height="30" fill="#00778B" />
                <rect y="10" width="60" height="10" fill="#FFC72C" />
                <polygon points="0,0 18,15 0,30" fill="#000000" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-extrabold tracking-wide text-gold sm:text-base">
                BSC Checkout
              </div>
              <div className="text-[10px] text-slate-300">Secure order processing</div>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/70">
            🔒 RBC Secured
          </div>
        </div>
      </header>

      {/* ─── Main grid ─── */}
      <div
        className={`mx-auto grid max-w-screen-md gap-5 px-4 py-6 sm:px-6 sm:py-8 lg:max-w-screen-lg ${
          cart.length > 0 ? 'lg:grid-cols-[1fr_360px]' : 'grid-cols-1'
        }`}
      >
        {/* Left column */}
        <div className="space-y-5">
          {view === 'summary' && (
            <>
              <Card title="Delivery details">
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field label="Full name *">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Smith"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Phone *">
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (242) 000-0000"
                      className={INPUT}
                    />
                  </Field>
                </div>
                <Field label="Email (optional — get your receipt + faster reorders)">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    inputMode="email"
                    autoCapitalize="off"
                    autoComplete="email"
                    className={INPUT}
                  />
                </Field>
                <Field label="Delivery address *">
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street, Subdivision, P.O. Box"
                    className={INPUT}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field label="Island">
                    <select
                      value={island}
                      onChange={(e) => setIsland(e.target.value)}
                      className={`${INPUT} appearance-none`}
                    >
                      {ISLANDS.map((i) => (
                        <option key={i}>{i}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Order notes">
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Special instructions"
                      className={INPUT}
                    />
                  </Field>
                </div>
              </Card>

              <Card title="Delivery method">
                <p className="-mt-2 text-xs text-slate-500">
                  Where should we send your order?
                </p>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      {
                        key: 'nassau',
                        emoji: '📍',
                        label: 'Nassau location',
                        sub: 'Pickup or local delivery in Nassau',
                      },
                      {
                        key: 'mailboat',
                        emoji: '🚤',
                        label: 'Mailboat shipping',
                        sub: 'Ship to a Family Island via mailboat',
                      },
                    ] as const
                  ).map((m) => {
                    const active = deliveryMethod === m.key;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setDeliveryMethod(m.key)}
                        className={`flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition ${
                          active
                            ? 'border-navy bg-navy-50/40 shadow-[0_0_0_3px_rgba(26,46,90,0.1)]'
                            : 'border-slate-200 bg-white hover:border-navy'
                        }`}
                      >
                        <span className="text-xl">{m.emoji}</span>
                        <span className="text-sm font-extrabold text-navy">{m.label}</span>
                        <span className="text-xs text-slate-500">{m.sub}</span>
                      </button>
                    );
                  })}
                </div>
                {deliveryMethod === 'nassau' && (
                  <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <p className="text-xs font-extrabold text-navy">📍 Help our driver find you</p>
                    <div>
                      <button
                        type="button"
                        onClick={captureLocation}
                        className="w-full rounded-lg border-2 border-navy bg-white px-3 py-2.5 text-xs font-extrabold text-navy transition hover:bg-navy-50/40"
                      >
                        {geoStatus === 'capturing'
                          ? 'Getting your location…'
                          : geoStatus === 'ok'
                            ? '✓ Location pinned — tap to update'
                            : '📍 Pin my delivery location'}
                      </button>
                      {geoStatus === 'ok' && geoLat != null && geoLng != null && (
                        <a
                          href={`https://maps.google.com/?q=${geoLat},${geoLng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 block text-[11px] font-bold text-emerald-700 underline"
                        >
                          View pinned spot on map ({geoLat.toFixed(5)}, {geoLng.toFixed(5)})
                        </a>
                      )}
                      {geoStatus === 'error' && (
                        <p className="mt-1.5 text-[11px] font-semibold text-amber-700">{geoMsg}</p>
                      )}
                    </div>
                    <Field label="House color / landmark *">
                      <input
                        value={houseColor}
                        onChange={(e) => setHouseColor(e.target.value)}
                        placeholder="e.g. yellow house, blue roof, next to the pink church"
                        className={INPUT}
                      />
                    </Field>
                    <p className="text-[11px] text-slate-500">
                      We&apos;ll call <strong>{phone.trim() || 'your phone'}</strong> to coordinate the drop-off.
                    </p>
                  </div>
                )}
                {deliveryMethod === 'mailboat' && (
                  <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                    <Field label="Mailboat name *">
                      <input
                        value={mailboatName}
                        onChange={(e) => setMailboatName(e.target.value)}
                        placeholder="e.g. Lady Gloria, Captain Moxey…"
                        className={INPUT}
                      />
                    </Field>
                    <Field label="Deliver to mailboat by *">
                      <input
                        type="date"
                        value={mailboatDate}
                        min={minMailboatDateStr}
                        onChange={(e) => setMailboatDate(e.target.value)}
                        className={`${INPUT} appearance-none`}
                      />
                    </Field>
                    {mailboatDate && mailboatDate < minMailboatDateStr && (
                      <p className="text-[11px] font-bold text-red-600">
                        We need at least 48 hours — earliest date is {minMailboatDateStr}.
                      </p>
                    )}
                    <p className="text-[11px] text-amber-800">
                      📅 Earliest drop-off is <strong>{minMailboatDateStr}</strong> — we need 48+ hours to pack and get your order to the dock.
                    </p>
                    <p className="text-[11px] text-amber-700">
                      🚤 Mailboat charges + island freight billed separately at packing.
                    </p>
                  </div>
                )}
              </Card>

              <Card title="Payment method">
                {/* Decline / retry banner — populated when PnP redirects the
                    customer back to /checkout with ?declined=1 or ?problem=1.
                    The message comes from lib/plugnpay/rbc-codes.ts via the
                    return-handler so it matches the founder's PCI spec
                    exactly. */}
                {pnpBanner && (
                  <div
                    className={`mb-3 rounded-lg border-2 px-3.5 py-3 text-sm font-semibold ${
                      pnpBanner.kind === 'declined'
                        ? 'border-red-300 bg-red-50 text-red-900'
                        : 'border-amber-300 bg-amber-50 text-amber-900'
                    }`}
                  >
                    {pnpBanner.kind === 'declined' ? '⚠️ ' : '⏳ '}
                    {pnpBanner.message}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      // Card option — wired to Plug'n Pay (RBC) Smart
                      // Screens v2 hosted page. PAN never touches BSC;
                      // the customer enters their card on pay1.plugnpay.com.
                      // /api/payment/start returns 503 + friendly fallback
                      // if the PNP_* env vars are not set, so this button
                      // is always shown — server enforces the gate.
                      { key: 'card', label: 'Debit / credit card', sub: 'Visa, Mastercard, Discover — secured by RBC' },
                      { key: 'cod',  label: 'Cash on delivery',     sub: 'Pay when your order arrives' },
                    ] as const
                  ).map((m) => {
                    const active = payMethod === m.key;
                    return (
                      <button
                        key={m.key}
                        onClick={() => setPayMethod(m.key)}
                        className={`flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition ${
                          active
                            ? 'border-navy bg-navy-50/40 shadow-[0_0_0_3px_rgba(26,46,90,0.1)]'
                            : 'border-slate-200 bg-white hover:border-navy'
                        }`}
                      >
                        <span className="text-sm font-extrabold text-navy">{m.label}</span>
                        <span className="text-xs text-slate-500">{m.sub}</span>
                      </button>
                    );
                  })}
                </div>
                {payMethod === 'card' && (
                  <div className="mt-3.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
                    🔒 You'll be redirected to RBC's secure payment page to enter your card details. BSC never sees or stores your card number, CVV, or expiry date.
                  </div>
                )}
                {payMethod === 'cod' && (
                  <div className="mt-3.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
                    💵 Cash on delivery — pay the driver at handoff.
                  </div>
                )}
              </Card>
            </>
          )}

          {view === 'payment' && (
            <Card title="Secure card payment">
              <p className="-mt-2 mb-5 text-sm text-slate-500">
                You'll be redirected to RBC's secure payment page to enter your card details. BSC never sees or stores your card number, CVV, or expiry date.
              </p>
              <PnpRedirect
                orderId={orderId ?? ''}
                onBack={() => setView('summary')}
              />
            </Card>
          )}

          {view === 'done' && (
            <DoneView
              payMethod={payMethod}
              total={total}
              cart={cart}
              name={name}
              address={address}
              island={island}
              refNo={refNo}
              last4={last4}
              orderId={orderId}
              onContinue={() => router.push('/market')}
              onHome={() => router.push('/')}
            />
          )}
        </div>

        {/* Right column — order summary */}
        {cart.length > 0 && (
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl bg-white p-5 shadow-card">
              <h2 className="mb-4 text-base font-extrabold text-navy">Order summary</h2>

              <div className="mb-4 max-h-80 space-y-3 overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div
                    key={`${item.source}-${item.id}`}
                    className="flex items-center gap-2.5"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-xs font-bold text-slate-400">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        '📦'
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-navy">
                        {item.name}
                        {(() => {
                          const p = linePricing(item);
                          if (!p.upgraded_to_wholesale) return null;
                          return (
                            <span className="ml-1.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                              style={{ backgroundColor: '#16a34a', color: '#fff' }}>
                              Wholesale
                            </span>
                          );
                        })()}
                      </div>
                      {item.sku && (
                        <div className="font-mono text-[10px] text-slate-400">{item.sku}</div>
                      )}
                      {(() => {
                        const p = linePricing(item);
                        return (
                          <div className="text-[11px] text-slate-500">
                            Qty {item.qty} × BSD ${fmt(p.unit_price)}
                            {p.upgraded_to_wholesale && (
                              <span className="ml-1 line-through text-slate-400">${fmt(item.price)}</span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="shrink-0 text-xs font-extrabold text-navy">
                      BSD ${fmt(linePricing(item).unit_price * item.qty)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-slate-100 pt-3.5">
                {wholesaleLineCount > 0 && (
                  <div className="mb-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800 border border-emerald-200">
                    ✓ Wholesale pricing on {wholesaleLineCount} line{wholesaleLineCount === 1 ? '' : 's'} — you saved <strong>BSD ${fmt(wholesaleSavings)}</strong> automatically.
                  </div>
                )}
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-500">
                    Subtotal ({cart.reduce((s, i) => s + i.qty, 0)} items)
                  </span>
                  <span className="font-bold text-navy">BSD ${fmt(subtotal)}</span>
                </div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-500">Delivery</span>
                  <span className="font-bold text-navy">BSD ${fmt(DELIVERY_FEE)}</span>
                </div>

                {/* Promo code */}
                {view === 'summary' && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-2.5">
                    {promoApplied ? (
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-emerald-700">
                            ✓ {promoApplied.code} applied
                          </div>
                          <div className="text-[11px] text-slate-500">
                            −BSD ${fmt(promoDiscount)} off
                          </div>
                        </div>
                        <button
                          onClick={clearPromo}
                          className="text-[11px] font-bold text-slate-500 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Promo code
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={promoCodeInput}
                            onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); applyPromo(); }
                            }}
                            placeholder="Enter code"
                            className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-navy outline-none placeholder:text-slate-300 placeholder:normal-case focus:border-navy"
                          />
                          <button
                            onClick={applyPromo}
                            disabled={promoBusy || !promoCodeInput.trim()}
                            className="rounded-md bg-navy px-3 py-1.5 text-xs font-black text-gold hover:bg-navy-700 disabled:opacity-50"
                          >
                            {promoBusy ? '…' : 'Apply'}
                          </button>
                        </div>
                        {promoError && (
                          <div className="mt-1.5 text-[11px] text-red-600">
                            {promoError}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {promoApplied && promoDiscount > 0 && (
                  <div className="mt-2 flex justify-between text-xs">
                    <span className="text-slate-500">Promo ({promoApplied.code})</span>
                    <span className="font-bold text-emerald-700">
                      −BSD ${fmt(promoDiscount)}
                    </span>
                  </div>
                )}

                <div className="mt-2 flex items-end justify-between border-t-2 border-navy pt-3">
                  <span className="text-sm font-extrabold text-navy">Total</span>
                  <span className="text-xl font-black text-navy">BSD ${fmt(total)}</span>
                </div>
              </div>
            </div>

            {view === 'summary' && (
              <button
                onClick={handleProceedToPayment}
                disabled={!formValid}
                className={`mt-4 w-full rounded-xl px-4 py-3.5 text-sm font-black transition ${
                  formValid
                    ? 'bg-navy text-gold shadow-md hover:bg-navy-700 hover:-translate-y-0.5'
                    : 'cursor-not-allowed bg-slate-300 text-slate-500'
                }`}
              >
                {payMethod === 'card' ? 'Proceed to card payment' : 'Place COD order'}
              </button>
            )}
          </aside>
        )}

        {cart.length === 0 && view === 'summary' && (
          <div className="rounded-2xl bg-white p-12 text-center shadow-card">
            <div className="mb-3 text-5xl">🛒</div>
            <div className="mb-2 text-lg font-black text-navy">Your cart is empty</div>
            <p className="mb-5 text-sm text-slate-500">
              Add some products from the market to start a checkout.
            </p>
            <button
              onClick={() => router.push('/market')}
              className="rounded-xl bg-navy px-7 py-3 text-sm font-black text-gold transition hover:bg-navy-700"
            >
              Browse market
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────── Subcomponents ─────────── */

const INPUT =
  'w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-navy outline-none transition focus:border-navy focus:shadow-[0_0_0_3px_rgba(26,46,90,0.1)] placeholder:text-slate-300';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="mb-4 text-base font-extrabold text-navy sm:text-lg">{title}</h2>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

/**
 * PnpRedirect — bridges /checkout to Plug'n Pay's Smart Screens v2 HPP.
 *
 * Flow:
 *   1. Mount → POST to /api/payment/start with the order_id.
 *   2. Server validates ownership + amount + env + creates pending
 *      payment_transactions row, returns { action, fields }.
 *   3. We render a hidden <form method="POST" action={action}> with
 *      each field as a hidden input.
 *   4. Auto-submit after ~1.5s OR manual click on the visible button —
 *      whichever fires first. Browser navigates to pay1.plugnpay.com.
 *
 * Errors (env not set, order missing, network) → friendly message + a
 * "Back to summary" link so the customer can pick COD or fix the issue.
 *
 * NO CARD DATA HANDLED HERE. The form fields are the Smart Screens v2
 * non-PCI params (pt_gateway_account, pt_transaction_amount, etc.).
 */
function PnpRedirect({
  orderId,
  onBack,
}: {
  orderId: string;
  onBack: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<{ action: string; fields: Record<string, string> } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Step 1 — call /api/payment/start the moment we mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        const res = await fetch('/api/payment/start', {
          method: 'POST',
          headers,
          body:   JSON.stringify({ order_id: orderId }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (!cancelled) setSubmission({ action: json.action, fields: json.fields });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  // Step 2 — auto-submit ~1.5s after we have the form data. The delay
  // gives the customer a visual confirmation that we're redirecting
  // them (vs. an abrupt blank-tab flash).
  useEffect(() => {
    if (!submission || !formRef.current) return;
    const timer = setTimeout(() => formRef.current?.submit(), 1500);
    return () => clearTimeout(timer);
  }, [submission]);

  if (error) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-900">
          <p className="mb-1 font-extrabold">Could not start card payment</p>
          <p className="text-xs font-medium text-red-700">{error}</p>
          <p className="mt-2 text-xs text-red-600">
            Please choose Cash on Delivery, or contact BSC support at +1 (242) 558-4495.
          </p>
        </div>
        <button
          onClick={onBack}
          className="w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-extrabold text-navy hover:border-navy"
        >
          ← Back to order summary
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="h-8 w-8 shrink-0 animate-spin rounded-full border-4 border-slate-200 border-t-navy" />
        <div className="flex-1">
          <p className="text-sm font-extrabold text-navy">
            {submission ? 'Redirecting to RBC secure payment…' : 'Preparing secure payment…'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Do not close this window. Your browser will navigate to RBC&apos;s payment page.
          </p>
        </div>
      </div>

      {submission && (
        <>
          <form ref={formRef} method="POST" action={submission.action} className="hidden">
            {Object.entries(submission.fields).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          </form>
          <button
            onClick={() => formRef.current?.submit()}
            className="w-full rounded-lg bg-navy px-4 py-3 text-sm font-extrabold text-gold transition hover:opacity-90"
          >
            🔒 Continue to RBC secure payment
          </button>
        </>
      )}

      <button
        onClick={onBack}
        className="w-full rounded-lg border-2 border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 hover:border-slate-400"
      >
        ← Back to order summary (cancel card payment)
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
        {label}
      </label>
      {children}
    </div>
  );
}

function DoneView({
  payMethod,
  total,
  cart,
  name,
  address,
  island,
  refNo,
  last4,
  orderId,
  onContinue,
  onHome,
}: {
  payMethod: 'card' | 'cod';
  total: number;
  cart: CartItem[];
  name: string;
  address: string;
  island: string;
  refNo: string;
  last4: string;
  orderId: string | null;
  onContinue: () => void;
  onHome: () => void;
}) {
  const success = payMethod === 'card';
  const rows: { label: string; value: string; mono?: boolean; bold?: boolean }[] = [];
  if (refNo) rows.push({ label: 'Payment ref', value: refNo, mono: true });
  if (last4) rows.push({ label: 'Card', value: `•••• •••• •••• ${last4}` });
  rows.push({ label: 'Delivery to', value: `${name} · ${address}` });
  rows.push({ label: 'Island', value: island });
  rows.push({
    label: 'Items',
    value: `${cart.length} item${cart.length !== 1 ? 's' : ''}`,
  });
  rows.push({ label: 'Total', value: `BSD $${fmt(total)}`, bold: true });
  rows.push({
    label: 'Payment',
    value: success ? 'Card · Approved' : 'Cash on Delivery',
  });
  rows.push({
    label: 'Date',
    value: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
  });

  return (
    <Card title="">
      <div className="text-center">
        <div
          className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full text-3xl font-black ${
            success ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-navy'
          }`}
        >
          {success ? '✓' : '📦'}
        </div>
        <h3
          className={`mb-1.5 text-xl font-black ${
            success ? 'text-emerald-700' : 'text-navy'
          }`}
        >
          {success ? 'Order paid & confirmed!' : 'Order confirmed!'}
        </h3>
        <p className="mb-5 text-sm text-slate-500">
          {success
            ? `Payment of BSD $${fmt(total)} approved.`
            : `Pay BSD $${fmt(total)} cash when your order arrives.`}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-left">
        <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400">
          Order receipt
        </div>
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex justify-between border-b border-slate-100 py-1.5 last:border-b-0"
          >
            <span className="text-xs font-semibold text-slate-500">{r.label}</span>
            <span
              className={`text-xs text-navy ${
                r.bold ? 'font-black' : 'font-bold'
              } ${r.mono ? 'font-mono' : ''}`}
            >
              {r.value}
            </span>
          </div>
        ))}
        <div className="mt-3 rounded-lg bg-emerald-100 px-3 py-2 text-center text-[11px] font-bold text-emerald-700">
          {success ? 'Saved to your history & BSC dashboard' : 'Order logged to BSC dashboard'}
        </div>
      </div>

      {orderId && (
        <a
          href={`/receipt/${orderId}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block w-full rounded-xl bg-gold px-4 py-3 text-center text-sm font-black text-navy transition hover:bg-gold-300"
        >
          🧾 View &amp; print receipt
        </a>
      )}

      <div className="mt-3 flex gap-3">
        <button
          onClick={onContinue}
          className="flex-1 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:border-navy hover:text-navy"
        >
          Continue shopping
        </button>
        <button
          onClick={onHome}
          className="flex-1 rounded-xl bg-navy px-4 py-3 text-sm font-black text-gold transition hover:bg-navy-700"
        >
          Back to home
        </button>
      </div>
    </Card>
  );
}
