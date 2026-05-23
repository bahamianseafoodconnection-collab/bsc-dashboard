'use client';

// app/track/[orderId]/page.tsx
//
// Public order tracking page — anyone with the order UUID can see its
// status. Customer-facing, no login required. Shows the standard
// fulfillment timeline (Pending → Processing → Ready → Delivered) and
// a link to the printable receipt.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { parseOrderItems } from '@/lib/order-items';

export const dynamic = 'force-dynamic';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

type Order = {
  id: string;
  created_at: string;
  updated_at: string | null;
  order_type: string;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  total: number | null;
  wholesale_cost_total: number | null;
  delivery_type: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  wholesale_items: unknown;
  promo_code: string | null;
  promo_discount: number | null;
  user_id: string | null;
  admin_notes: string | null;
};

type LineItem = {
  name?: string;
  qty?: number;
  quantity?: number;
  unit?: string;
  price?: number;
};

const STATUS_FLOW = ['Pending', 'Confirmed', 'Packing', 'Out for Delivery', 'Delivered'];
const PICKUP_FLOW = ['Pending', 'Confirmed', 'Ready for Pickup', 'Delivered'];
const CANCEL_WINDOW_MS = 30 * 60 * 1000;
const CANCELLABLE = new Set([
  'Pending', 'Confirmed', 'pending', 'processing', 'payment_pending',
]);

function flowFor(o: Order): string[] {
  const dt = (o.delivery_type || '').toLowerCase();
  return dt === 'pickup' ? PICKUP_FLOW : STATUS_FLOW;
}

// Maps the live status to a step index in the chosen flow + a friendly
// label + a tone color. Negative step => terminal cancelled state.
function timelineStep(o: Order, flow: string[]): { step: number; label: string; color: string } {
  const live = (o.status || o.payment_status || '').trim();
  if (live === 'Cancelled' || live === 'cancelled' || live === 'payment_failed')
    return { step: -1, label: 'Cancelled', color: '#ef4444' };
  const idx = flow.indexOf(live);
  if (idx >= 0) {
    const palette = ['#94a3b8', '#1a6fb5', '#a78bfa', '#fb923c', '#22c55e'];
    return { step: idx, label: live, color: palette[idx] || '#22c55e' };
  }
  // Common synonyms from POS / payment_status — best-effort map.
  const v = live.toLowerCase();
  if (v === 'delivered')                       return { step: flow.length - 1, label: 'Delivered', color: '#22c55e' };
  if (v === 'paid' || v === 'processing')      return { step: 1, label: 'Confirmed', color: '#1a6fb5' };
  return { step: 0, label: live || 'Received', color: '#94a3b8' };
}

export default function TrackOrderPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const [{ data }, { data: { user } }] = await Promise.all([
        supabase
          .from('orders')
          .select(
            'id, created_at, updated_at, order_type, status, payment_status, payment_method, total, wholesale_cost_total, delivery_type, customer_name, customer_phone, customer_address, wholesale_items, promo_code, promo_discount, user_id, admin_notes'
          )
          .eq('id', orderId)
          .maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (cancelled) return;
      setOrder((data as Order) ?? null);
      setAuthUserId(user?.id ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  async function handleCancel() {
    if (!order) return;
    if (!confirm('Cancel this order? This cannot be undone.')) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/orders/cancel', {
        method: 'POST', headers,
        body: JSON.stringify({ order_id: order.id }),
      });
      const j = await res.json();
      if (j.ok) setOrder({ ...order, status: 'Cancelled' });
      else setCancelError(j.error || 'Could not cancel');
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <Centered>Looking up your order…</Centered>;
  if (!order) return <NotFound id={orderId} />;

  const flow = flowFor(order);
  const tl = timelineStep(order, flow);
  const total = Number(order.total ?? order.wholesale_cost_total ?? 0);
  const items = parseOrderItems(order.wholesale_items);
  const itemsHavePrice = items.some((it) => typeof it.unit_price === 'number');
  const subtotal = itemsHavePrice
    ? items.reduce((s, it) => s + (it.unit_price ?? 0) * it.qty, 0)
    : null;
  const discount = Number(order.promo_discount || 0);
  const refNo = `INV-${order.id.slice(0, 8).toUpperCase()}`;
  const ageMs = Date.now() - new Date(order.created_at).getTime();
  const live = order.status || order.payment_status || '';
  const canCancel =
    !!authUserId &&
    order.user_id === authUserId &&
    CANCELLABLE.has(live) &&
    ageMs < CANCEL_WINDOW_MS;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="bg-navy">
        <div className="mx-auto flex h-14 max-w-screen-md items-center gap-3 px-4 sm:h-16 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <img
              src={`${STORAGE_BASE}/logo.jpg`}
              alt="BSC"
              className="h-9 w-9 rounded-full border-2 border-gold object-cover"
            />
            <div className="text-sm font-extrabold tracking-wide text-gold">
              BSC Marketplace
            </div>
          </Link>
          <Link
            href="/my-orders"
            className="ml-auto rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
          >
            All my orders →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-screen-md px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-gold-700">
          Order {refNo}
        </div>
        <h1 className="font-display text-3xl font-black text-navy sm:text-4xl">
          {tl.label}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Placed {new Date(order.created_at).toLocaleString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
          {order.updated_at && order.updated_at !== order.created_at && (
            <>
              {' · last updated '}
              {new Date(order.updated_at).toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </>
          )}
        </p>

        {/* Timeline */}
        {tl.step >= 0 && (
          <div className="mt-6 rounded-2xl bg-white p-5 shadow-card">
            <div className="flex items-center justify-between gap-2">
              {flow.map((stage, i) => {
                const reached = tl.step >= i;
                return (
                  <div key={stage} className="flex flex-1 flex-col items-center gap-1.5">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                        reached ? 'bg-navy text-gold' : 'bg-slate-200 text-slate-400'
                      }`}
                    >
                      {reached ? '✓' : i + 1}
                    </div>
                    <span className={`text-center text-[10px] font-bold uppercase tracking-wider ${reached ? 'text-navy' : 'text-slate-400'}`}>
                      {stage}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="relative mt-3 h-1 rounded-full bg-slate-200">
              <div
                className="absolute left-0 top-0 h-1 rounded-full bg-gold transition-all"
                style={{ width: `${(Math.max(0, tl.step) / Math.max(1, flow.length - 1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {tl.step < 0 && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            This order is marked <strong>{tl.label}</strong>. Need help? WhatsApp us at +1 (242) 361-3474 with your reference {refNo}.
          </div>
        )}

        {/* Delivery info */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-card">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Delivery
          </div>
          <div className="mt-1 text-sm font-bold text-navy">
            {order.delivery_type === 'mailboat' ? '🚤 Mailboat shipping (Family Island)' :
             order.delivery_type === 'nassau'   ? '📍 Nassau location' :
             order.delivery_type === 'pickup'   ? '🏪 Pickup' :
             '📦 Delivery'}
          </div>
          {order.customer_name && (
            <div className="mt-1 text-sm text-slate-700">
              For {order.customer_name}
            </div>
          )}
          {order.customer_address && (
            <div className="mt-0.5 text-sm text-slate-600">
              {order.customer_address}
            </div>
          )}
        </div>

        {/* Items + pricing */}
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-card">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
            Items
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">No line items recorded.</p>
          ) : (
            items.map((it, i) => {
              const qty = it.qty;
              const lineTotal = typeof it.unit_price === 'number' ? it.unit_price * qty : null;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-slate-700">{it.name || 'Item'}</div>
                    <div className="text-[11px] text-slate-500">
                      {qty}{it.unit ? ` ${it.unit}` : ''}
                      {typeof it.unit_price === 'number' && (
                        <> · BSD ${it.unit_price.toFixed(2)} each</>
                      )}
                    </div>
                  </div>
                  {lineTotal !== null && (
                    <div className="shrink-0 font-bold text-navy">
                      BSD ${lineTotal.toFixed(2)}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Pricing breakdown */}
          <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
            {subtotal !== null && (
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-bold text-navy">BSD ${subtotal.toFixed(2)}</span>
              </div>
            )}
            {order.promo_code && discount > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">
                  Promo (<span className="font-mono text-emerald-700">{order.promo_code}</span>)
                </span>
                <span className="font-bold text-emerald-700">−BSD ${discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-100 pt-2 text-base">
              <span className="font-extrabold text-navy">Total</span>
              <span className="font-black text-navy">BSD ${total.toFixed(2)}</span>
            </div>
            {order.payment_method && (
              <div className="pt-1 text-[11px] text-slate-500">
                Paid via {order.payment_method.toUpperCase()}
                {order.payment_status && ` · ${order.payment_status}`}
              </div>
            )}
          </div>
        </div>

        {cancelError && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            {cancelError}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/receipt/${order.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-xl bg-navy px-4 py-3 text-center text-sm font-black text-gold hover:bg-navy-700"
          >
            🧾 View &amp; print receipt
          </Link>
          <a
            href="https://wa.me/12423613474"
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-black text-white hover:bg-emerald-700"
          >
            💬 WhatsApp BSC
          </a>
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-bold text-red-700 hover:border-red-500 disabled:opacity-60"
            >
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500 font-sans">
      {children}
    </div>
  );
}

function NotFound({ id }: { id?: string | null }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center font-sans">
      <div className="mb-3 text-5xl">🔍</div>
      <h1 className="font-display text-2xl font-black text-navy">Order not found</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        We couldn&rsquo;t find an order with that ID
        {id ? ` (${id.slice(0, 8)}…)` : ''}. Double-check the link, or
        WhatsApp us at +1 (242) 361-3474.
      </p>
      <Link
        href="/my-orders"
        className="mt-6 rounded-xl bg-navy px-6 py-3 text-sm font-black text-gold hover:bg-navy-700"
      >
        ← All my orders
      </Link>
    </div>
  );
}
