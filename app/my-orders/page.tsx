'use client';

// app/my-orders/page.tsx
//
// Signed-in customer's order history. Fetches /api/orders/mine (service-role:
// orders RLS is owner/staff-locked and orders.customer_id is split between the
// auth uid and a customers-record id, so the server resolves both). For guests
// / not-signed-in, shows the lookup form pointing at /track/[orderId].

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { parseOrderItems } from '@/lib/order-items';

export const dynamic = 'force-dynamic';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

type Order = {
  id: string;
  created_at: string;
  order_type: string;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  total: number | null;
  wholesale_cost_total: number | null;
  delivery_type: string | null;
  customer_address: string | null;
  wholesale_items: unknown;
};

const CANCEL_WINDOW_MS = 30 * 60 * 1000;
const CANCELLABLE = new Set([
  'Pending', 'Confirmed', 'pending', 'processing', 'payment_pending',
]);

function canCancel(o: Order): boolean {
  const live = o.status || o.payment_status || '';
  if (!CANCELLABLE.has(live)) return false;
  return Date.now() - new Date(o.created_at).getTime() < CANCEL_WINDOW_MS;
}

type LineItem = {
  id?: string;
  source?: 'market' | 'wholesale' | 'us';
  sku?: string;
  name?: string;
  price?: number;
  qty?: number;
  quantity?: number;
  unit?: string;
  image_url?: string;
};

function statusTone(s: string | null): { bg: string; text: string; label: string } {
  const v = (s || '').toLowerCase();
  if (v === 'processing')        return { bg: 'bg-blue-100',    text: 'text-blue-800',    label: 'Processing' };
  if (v === 'paid')              return { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Paid' };
  if (v === 'delivered')         return { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Delivered' };
  if (v === 'payment_pending')   return { bg: 'bg-amber-100',   text: 'text-amber-800',   label: 'Payment pending' };
  if (v === 'payment_failed')    return { bg: 'bg-red-100',     text: 'text-red-800',     label: 'Payment failed' };
  if (v === 'cancelled')         return { bg: 'bg-red-100',     text: 'text-red-800',     label: 'Cancelled' };
  if (v === 'pending')           return { bg: 'bg-amber-100',   text: 'text-amber-800',   label: 'Pending' };
  return { bg: 'bg-slate-100', text: 'text-slate-700', label: s || 'Unknown' };
}

export default function MyOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [trackId, setTrackId] = useState('');

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function cancelOrder(orderId: string) {
    if (!confirm('Cancel this order? This cannot be undone.')) return;
    setCancellingId(orderId);
    setCancelError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers,
        body: JSON.stringify({ order_id: orderId }),
      });
      const j = await res.json();
      if (j.ok) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'Cancelled' } : o)));
      } else {
        setCancelError(j.error || 'Could not cancel');
      }
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setCancellingId(null);
    }
  }

  function reorder(items: LineItem[]) {
    if (typeof window === 'undefined' || items.length === 0) return;
    try {
      const stored = window.localStorage.getItem('bsc_cart');
      const current: LineItem[] = stored ? JSON.parse(stored) : [];
      for (const it of items) {
        if (!it.id || !it.name || typeof it.price !== 'number') continue;
        const qty = it.qty || 1;
        const source = (it.source as 'market' | 'wholesale' | 'us') || 'market';
        const idx = current.findIndex((c) => c.id === it.id && c.source === source);
        if (idx >= 0) {
          current[idx].qty = Number(current[idx].qty ?? current[idx].quantity ?? 1) + qty;
        } else {
          current.push({
            id: it.id,
            source,
            sku: it.sku,
            name: it.name,
            price: it.price,
            qty,
            unit: it.unit || 'each',
            image_url: it.image_url,
          });
        }
      }
      window.localStorage.setItem('bsc_cart', JSON.stringify(current));
      router.push('/checkout');
    } catch { /* ignore */ }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.user) {
        setSignedIn(false);
        setLoading(false);
        return;
      }
      setSignedIn(true);

      let list: Order[] = [];
      try {
        const res = await fetch('/api/orders/mine', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (res.ok && json?.ok) list = (json.orders ?? []) as Order[];
      } catch { /* leave empty — UI shows the empty state */ }
      if (cancelled) return;
      setOrders(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="sticky top-0 z-30 bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-md items-center gap-3 px-4 sm:h-16 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <img
              src={`${STORAGE_BASE}/logo.jpg`}
              alt="BSC"
              className="h-9 w-9 rounded-full border-2 border-gold object-cover"
            />
            <div className="hidden text-white sm:block">
              <div className="text-sm font-extrabold tracking-wide text-gold">BSC Marketplace</div>
              <div className="text-[10px] text-slate-300">Your orders</div>
            </div>
          </Link>
          <Link
            href="/account"
            className="ml-auto rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
          >
            Account
          </Link>
          <Link
            href="/wishlist"
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
          >
            ♡
          </Link>
          <Link
            href="/market"
            className="rounded-lg bg-gold px-3 py-2 text-xs font-bold text-navy hover:bg-gold-300"
          >
            Shop more →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-screen-md px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="mb-1 font-display text-3xl font-black text-navy sm:text-4xl">
          Your orders
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Every order you&rsquo;ve placed, with its current status and your receipt.
        </p>

        {/* Track-by-id form (always visible) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const id = trackId.trim();
            if (id) window.location.href = `/track/${id}`;
          }}
          className="mb-6 rounded-2xl border border-gold/30 bg-amber-50 p-4"
        >
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-900">
            Looking up an order without signing in?
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              placeholder="Paste your order ID"
              className="flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-mono"
            />
            <button
              type="submit"
              className="rounded-lg bg-navy px-5 py-2 text-sm font-bold text-gold hover:bg-navy-700"
            >
              Track
            </button>
          </div>
        </form>

        {loading && <p className="text-slate-500">Loading…</p>}

        {!loading && signedIn === false && (
          <div className="rounded-2xl bg-white p-6 text-center shadow-card">
            <p className="mb-4 text-sm text-slate-700">
              Sign in to see your full order history. Or use the tracker above
              to look up a single order by ID.
            </p>
            <Link
              href="/login"
              className="inline-block rounded-xl bg-navy px-6 py-3 text-sm font-black text-gold hover:bg-navy-700"
            >
              Sign in
            </Link>
          </div>
        )}

        {!loading && signedIn && orders.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-card">
            <div className="mb-3 text-5xl">🛒</div>
            <p className="mb-4 text-sm text-slate-600">
              You haven&rsquo;t placed any orders yet.
            </p>
            <Link
              href="/market"
              className="inline-block rounded-xl bg-navy px-6 py-3 text-sm font-black text-gold hover:bg-navy-700"
            >
              Browse the market
            </Link>
          </div>
        )}

        {!loading && orders.map((o) => {
          const tone = statusTone(o.status || o.payment_status);
          const total = Number(o.total ?? o.wholesale_cost_total ?? 0);
          const items = parseOrderItems(o.wholesale_items);
          const refNo = `INV-${o.id.slice(0, 8).toUpperCase()}`;
          return (
            <div key={o.id} className="mb-3 rounded-2xl bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="font-mono text-xs text-slate-500">{refNo}</div>
                  <div className="mt-0.5 text-sm text-slate-700">
                    {new Date(o.created_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone.bg} ${tone.text}`}>
                  {tone.label}
                </span>
              </div>
              <div className="mt-3 text-sm text-slate-700">
                {items.length} item{items.length === 1 ? '' : 's'} ·{' '}
                <span className="font-bold text-navy">BSD ${total.toFixed(2)}</span>
                {o.delivery_type && (
                  <span className="ml-2 text-slate-500">
                    · {o.delivery_type === 'mailboat' ? '🚤 Mailboat' : '📍 Nassau'}
                  </span>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/track/${o.id}`}
                  className="rounded-lg bg-navy px-4 py-2 text-xs font-bold text-gold hover:bg-navy-700"
                >
                  Track order
                </Link>
                <Link
                  href={`/receipt/${o.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:border-navy"
                >
                  🧾 Receipt
                </Link>
                <button
                  onClick={() => reorder(items)}
                  disabled={items.length === 0}
                  className="rounded-lg bg-gold px-4 py-2 text-xs font-bold text-navy hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ↻ Re-order
                </button>
                {canCancel(o) && (
                  <button
                    onClick={() => cancelOrder(o.id)}
                    disabled={cancellingId === o.id}
                    className="rounded-lg border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-700 hover:border-red-500 disabled:opacity-60"
                  >
                    {cancellingId === o.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}
              </div>
              {cancelError && cancellingId === null && (
                <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                  {cancelError}
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}
