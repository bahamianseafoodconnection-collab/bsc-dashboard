'use client';

// /account/orders/[id]
//
// Customer-facing order detail page. Lands here after a successful card
// payment (PnP → /api/payment/return/success → redirect here with
// ?paid=1) or from /account → "your orders" list. Shows:
//
//   - Order status (paid / pending / etc.) with a green confirmation
//     banner when arriving fresh from PnP via ?paid=1
//   - Item list + totals (subtotal / VAT / total)
//   - Payment method + card brand + last 4 (only for card payments,
//     pulled from the latest payment_transactions row)
//   - Delivery address + island + type
//
// Auth: must be signed in AND must own the order. Founders + admins
// can view any order. Other roles get a "not found" message rather
// than confirming the order exists.
//
// No card data displayed beyond brand + last 4 (per PCI rule).

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { customerStage, CUSTOMER_PROGRESS_STEPS } from '@/lib/order-status';

export const dynamic = 'force-dynamic';

interface OrderRow {
  id:                 string;
  customer_name:      string | null;
  customer_phone:     string | null;
  customer_address:   string | null;
  total:              number | null;
  subtotal:           number | null;
  vat_amount:         number | null;
  payment_status:     string | null;
  payment_method:     string | null;
  payment_ref:        string | null;
  delivery_type:      string | null;
  admin_notes:        string | null;
  created_at:         string;
  order_type:         string | null;
  fulfillment_status: string | null;
  wholesale_items:    Array<{
    name:        string;
    qty:         number;
    unit_price:  number;
    line_total:  number;
    unit?:       string;
    image_url?:  string;
  }> | null;
}

interface PaymentTxRow {
  attempted_at:      string;
  finalized_at:      string | null;
  outcome_bucket:    string | null;
  customer_message:  string | null;
  card_brand:        string | null;
  card_last4:        string | null;
  pi_response_code:  string | null;
  pt_authorization_code: string | null;
  hash_verified:     boolean | null;
  query_verified:    boolean | null;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '0.00';
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<Shell><p className="text-sm text-slate-500">Loading order…</p></Shell>}>
      <OrderDetailInner />
    </Suspense>
  );
}

function OrderDetailInner() {
  const params       = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const orderId      = params?.id ?? '';
  const justPaid     = searchParams?.get('paid') === '1';

  const [authState, setAuthState] = useState<'checking' | 'no_session' | 'ok'>('checking');
  const [order, setOrder]         = useState<OrderRow | null>(null);
  const [latestTx, setLatestTx]   = useState<PaymentTxRow | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) { setAuthState('no_session'); setLoading(false); return; }
      setAuthState('ok');

      // Load order through the secure server endpoint (orders RLS is
      // locked to staff + owner; this authorizes staff/owner/guest-by-UUID).
      const res = await fetch(`/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const json = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok || !json?.ok) {
        setError(json?.error || 'Order not found — it may have been removed or you may not have access.');
        setLoading(false); return;
      }
      setOrder(json.order as OrderRow);

      // Load the latest payment_transactions row for this order so we
      // can show card brand + last 4 + auth code on the receipt.
      const { data: tx } = await supabase
        .from('payment_transactions')
        .select('attempted_at, finalized_at, outcome_bucket, customer_message, card_brand, card_last4, pi_response_code, pt_authorization_code, hash_verified, query_verified')
        .eq('order_id', orderId)
        .order('attempted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && tx) setLatestTx(tx as PaymentTxRow);

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  if (loading) return <Shell><p className="text-sm text-slate-500">Loading order…</p></Shell>;
  if (authState === 'no_session') {
    return (
      <Shell>
        <p className="mb-3 text-sm font-semibold text-slate-700">Please sign in to view your order.</p>
        <Link href={`/staff-login?next=/account/orders/${orderId}`} className="text-sm font-bold text-navy underline">
          Sign in →
        </Link>
      </Shell>
    );
  }
  if (error || !order) {
    return (
      <Shell>
        <p className="text-sm font-semibold text-red-700">{error || 'Order not found.'}</p>
        <Link href="/account" className="mt-3 inline-block text-sm font-bold text-navy underline">
          ← Back to account
        </Link>
      </Shell>
    );
  }

  const status = (order.payment_status ?? '').toLowerCase();
  const isPaid = status === 'paid';
  const shortId = order.id.slice(0, 8).toUpperCase();
  const created = new Date(order.created_at);

  return (
    <Shell>
      {/* ─── Confirmation banner — only on fresh post-payment landing ── */}
      {justPaid && isPaid && (
        <div className="mb-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5">
          <p className="text-base font-extrabold text-emerald-900">✅ Payment received — thank you!</p>
          <p className="mt-1 text-sm text-emerald-800">
            Your order #{shortId} has been confirmed. We&apos;ll send updates as your order moves to delivery.
          </p>
        </div>
      )}

      {/* ─── Order header ─── */}
      <div className="mb-4 rounded-2xl bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Order</p>
            <h1 className="font-mono text-xl font-extrabold text-navy">#{shortId}</h1>
            <p className="mt-1 text-xs text-slate-500">
              {created.toLocaleDateString('en-US', { dateStyle: 'medium' })} ·{' '}
              {created.toLocaleTimeString('en-US', { timeStyle: 'short' })}
            </p>
          </div>
          <StatusPill status={order.payment_status} />
        </div>
      </div>

      {/* ─── Delivery progress (online orders only) ─── */}
      {order.fulfillment_status && order.fulfillment_status !== 'cancelled' && (
        <DeliveryProgress status={order.fulfillment_status} />
      )}
      {order.fulfillment_status === 'cancelled' && (
        <div className="mb-4 rounded-2xl border-2 border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
          ✖ This order was cancelled. Contact BSC support if this is unexpected.
        </div>
      )}

      {/* ─── Items ─── */}
      <div className="mb-4 rounded-2xl bg-white p-5 shadow-card">
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-slate-600">Items</h2>
        {!order.wholesale_items || order.wholesale_items.length === 0 ? (
          <p className="text-sm text-slate-500">No items on this order.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {order.wholesale_items.map((item, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-xs font-bold text-slate-400">
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                    : '📦'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    {item.qty} {item.unit ?? 'ea'} × ${fmt(item.unit_price)}
                  </p>
                </div>
                <p className="text-sm font-extrabold text-navy">${fmt(item.line_total)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─── Totals ─── */}
      <div className="mb-4 rounded-2xl bg-white p-5 shadow-card">
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-slate-600">Totals</h2>
        {order.subtotal != null && (
          <Row label="Subtotal" value={`$${fmt(order.subtotal)}`} />
        )}
        {order.vat_amount != null && order.vat_amount > 0 && (
          <Row label="VAT" value={`$${fmt(order.vat_amount)}`} />
        )}
        <div className="mt-2 border-t border-slate-200 pt-2">
          <Row label="Total" value={`BSD $${fmt(order.total)}`} emphasis />
        </div>
      </div>

      {/* ─── Payment ─── */}
      <div className="mb-4 rounded-2xl bg-white p-5 shadow-card">
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-slate-600">Payment</h2>
        <Row label="Method" value={order.payment_method === 'card' ? '💳 Card (RBC)' : '💵 Cash on delivery'} />
        <Row label="Status" value={<StatusPill status={order.payment_status} inline />} />
        {latestTx?.card_brand && (
          <Row label="Card" value={`${latestTx.card_brand} •••• ${latestTx.card_last4 ?? '----'}`} />
        )}
        {latestTx?.pt_authorization_code && (
          <Row label="Auth code" value={<span className="font-mono">{latestTx.pt_authorization_code}</span>} />
        )}
        {order.payment_ref && (
          <Row label="Reference" value={<span className="font-mono text-xs">{order.payment_ref}</span>} />
        )}
      </div>

      {/* ─── Delivery ─── */}
      <div className="mb-4 rounded-2xl bg-white p-5 shadow-card">
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-slate-600">Delivery</h2>
        <Row label="Recipient" value={order.customer_name ?? '—'} />
        <Row label="Phone" value={order.customer_phone ?? '—'} />
        <Row label="Address" value={order.customer_address ?? '—'} />
        {order.admin_notes && (
          <Row label="Notes" value={<span className="text-xs">{order.admin_notes}</span>} />
        )}
      </div>

      <div className="flex gap-2">
        <Link href="/market"
          className="flex-1 rounded-xl bg-navy px-4 py-3 text-center text-sm font-extrabold text-gold hover:opacity-90">
          Continue shopping
        </Link>
        <Link href="/account"
          className="rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-center text-sm font-extrabold text-navy hover:border-navy">
          My account
        </Link>
      </div>
    </Shell>
  );
}

/* ─────────── UI primitives ─────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 antialiased">
      <header className="bg-navy shadow-md">
        <div className="mx-auto flex h-14 max-w-screen-md items-center justify-between px-4 sm:h-16 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="text-sm font-extrabold tracking-wide text-gold sm:text-base">BSC Marketplace</span>
          </Link>
          <Link href="/account" className="text-xs font-semibold text-white/70 hover:text-white">
            ← Account
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-screen-md px-4 py-5 sm:py-8">
        {children}
      </main>
    </div>
  );
}

function Row({ label, value, emphasis }: { label: string; value: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={emphasis ? 'text-sm font-bold text-navy' : 'text-xs text-slate-500'}>{label}</span>
      <span className={emphasis ? 'text-base font-extrabold text-navy' : 'text-sm font-semibold text-navy'}>
        {value}
      </span>
    </div>
  );
}

function StatusPill({ status, inline }: { status: string | null; inline?: boolean }) {
  const s = (status ?? '').toLowerCase();
  const palette =
    s === 'paid'             ? { bg: '#d1fae5', fg: '#065f46', label: 'Paid' } :
    s === 'pending'          ? { bg: '#fef3c7', fg: '#92400e', label: 'Pending payment' } :
    s === 'payment_pending'  ? { bg: '#fef3c7', fg: '#92400e', label: 'Awaiting payment' } :
    s === 'declined'         ? { bg: '#fee2e2', fg: '#991b1b', label: 'Declined' } :
    s === 'cancelled'        ? { bg: '#e5e7eb', fg: '#374151', label: 'Cancelled' } :
                                { bg: '#e5e7eb', fg: '#374151', label: status ?? 'Unknown' };
  return (
    <span style={{
      backgroundColor: palette.bg, color: palette.fg,
      padding: inline ? '2px 8px' : '4px 12px',
      borderRadius: 999,
      fontSize: inline ? 11 : 12,
      fontWeight: 800,
      whiteSpace: 'nowrap',
    }}>
      {palette.label}
    </span>
  );
}

// Customer-facing 5-step delivery tracker. Internal states collapse to
// customer stages via customerStage(); the bar lights up through the
// current step. Founder's exact stage message shows under the bar.
function DeliveryProgress({ status }: { status: string }) {
  const cust = customerStage(status);
  const currentStep = cust.step;  // 0..4
  return (
    <div className="mb-4 rounded-2xl bg-white p-5 shadow-card">
      <h2 className="mb-4 text-sm font-extrabold uppercase tracking-wider text-slate-600">Delivery</h2>
      <div className="flex items-start">
        {CUSTOMER_PROGRESS_STEPS.map((step, i) => {
          const done    = i < currentStep;
          const active  = i === currentStep;
          const isLast  = i === CUSTOMER_PROGRESS_STEPS.length - 1;
          return (
            <div key={step.stage} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {/* left connector */}
                <div className={`h-1 flex-1 ${i === 0 ? 'opacity-0' : done || active ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                  done   ? 'bg-emerald-500 text-white' :
                  active ? 'bg-navy text-gold ring-4 ring-navy/15' :
                           'bg-slate-200 text-slate-400'
                }`}>
                  {done ? '✓' : i + 1}
                </div>
                {/* right connector */}
                <div className={`h-1 flex-1 ${isLast ? 'opacity-0' : done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              </div>
              <span className={`mt-1.5 text-center text-[10px] font-bold leading-tight ${
                done || active ? 'text-navy' : 'text-slate-400'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 rounded-lg bg-slate-50 p-3 text-center text-sm font-semibold text-slate-700">
        {cust.message}
      </p>
    </div>
  );
}
