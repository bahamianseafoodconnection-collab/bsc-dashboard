'use client';

// /checkout — premium ecommerce flow.
// Tailwind redesign. Three views: summary -> payment -> done.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  CHANNEL_MARGIN,
  VAT_RATE,
  recordSaleFinancials,
} from '@/lib/finance';
import CardPaymentModal, { PaymentPayload } from '@/components/CardPaymentModal';

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
  price: number;
  qty: number;
  unit: string;
  sku?: string;
  wholesaler?: string;
  image_url?: string;
}

type View = 'summary' | 'payment' | 'done';

const ISLANDS = ['Nassau', 'Andros', 'Exuma', 'Grand Bahama', 'Abaco', 'Eleuthera', 'Other'];

export default function CheckoutPage() {
  const router = useRouter();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [island, setIsland] = useState('Nassau');
  const [note, setNote] = useState('');
  const [view, setView] = useState<View>('summary');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [refNo, setRefNo] = useState('');
  const [last4, setLast4] = useState('');
  const [payMethod, setPayMethod] = useState<'card' | 'cod'>('card');
  // Where this order is going. 'nassau' = pickup or local delivery in
  // Nassau. 'mailboat' = ship to Family Island via mailboat.
  const [deliveryMethod, setDeliveryMethod] = useState<'nassau' | 'mailboat'>('nassau');

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

  // Clear the saved cart once we've reached the done view so the next
  // visit to /market starts fresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (view !== 'done') return;
    try { window.localStorage.removeItem('bsc_cart'); } catch { /* ignore */ }
  }, [view]);

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal;

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
            email: session?.user?.email || null,
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

    const { data } = await supabase
      .from('orders')
      .insert({
        order_type: 'online_market',
        payment_method: payMethod,
        payment_status: payMethod === 'cod' ? 'pending' : 'processing',
        wholesale_items: cart,
        wholesale_cost_total: total,
        customer_name: name.trim() || null,
        customer_phone: phone.trim() || null,
        customer_address: address.trim() || null,
        customer_id: customerIdLinked,
        // Captures customer's delivery preference for fulfillment staff.
        // Stored on delivery_type for backward-compat with existing
        // orders queries; admin_notes also gets the human-readable
        // method + island so it shows on receipts/pick tickets.
        delivery_type: deliveryMethod,
        admin_notes: [
          deliveryMethod === 'mailboat' ? `Mailboat to ${island}` : `Nassau · ${island}`,
          note,
        ].filter(Boolean).join(' · ') || null,
        user_id: session?.user.id || null,
      })
      .select('id')
      .single();

    const orderIdInserted = data?.id || '';

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
    // email otherwise. Fire-and-forget.
    if (name.trim() && (phone.trim() || (await supabase.auth.getUser()).data?.user?.email)) {
      const userEmail = (await supabase.auth.getUser()).data?.user?.email ?? null;
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
          recipient_email: channel === 'email' ? userEmail : null,
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
    setOrderId(id);
    setView(payMethod === 'cod' ? 'done' : 'payment');
  }

  const formValid = name.trim() && phone.trim() && address.trim();

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 antialiased">
      {/* ─── Header ─── */}
      <header className="bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-md items-center justify-between px-4 sm:h-16 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <img
              src={`${STORAGE_BASE}/logo.jpg`}
              alt="BSC"
              className="h-9 w-9 rounded-full border-2 border-gold object-cover sm:h-10 sm:w-10"
            />
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
                {deliveryMethod === 'mailboat' && (
                  <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    🚤 Mailboat charges + island freight billed separately at packing.
                  </p>
                )}
              </Card>

              <Card title="Payment method">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      { key: 'card', label: 'Debit / credit card', sub: 'Visa, Mastercard, Discover' },
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
                <div className="mt-3.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
                  BSC does not accept wire transfers for online orders. Card or COD only.
                </div>
              </Card>
            </>
          )}

          {view === 'payment' && (
            <Card title="Card payment">
              <p className="-mt-2 mb-5 text-sm text-slate-500">
                Enter your debit or credit card details to complete your order.
              </p>
              <CardPaymentModal
                payload={payload}
                onApproved={(ref, l4) => {
                  setRefNo(ref);
                  setLast4(l4);
                  setView('done');
                }}
                onDeclined={() => {}}
                onCancel={() => setView('summary')}
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
                      <div className="truncate text-xs font-bold text-navy">{item.name}</div>
                      {item.sku && (
                        <div className="font-mono text-[10px] text-slate-400">{item.sku}</div>
                      )}
                      <div className="text-[11px] text-slate-500">
                        Qty {item.qty} × BSD ${fmt(item.price)}
                      </div>
                    </div>
                    <div className="shrink-0 text-xs font-extrabold text-navy">
                      BSD ${fmt(item.price * item.qty)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-slate-100 pt-3.5">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-500">
                    Subtotal ({cart.reduce((s, i) => s + i.qty, 0)} items)
                  </span>
                  <span className="font-bold text-navy">BSD ${fmt(subtotal)}</span>
                </div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-500">Delivery</span>
                  <span className="font-bold text-emerald-600">Calculated at delivery</span>
                </div>
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
