'use client';

// /order-confirmed?order=<id>
//
// Branded "Payment confirmed" screen shown after a successful RBC / Plug'n Pay
// card payment. The PnP success return-handler redirects the customer's browser
// here (it used to dump them on /account/orders/[id], where they got stranded).
// Big, clear confirmation → receipt link → auto-forward to the marketplace.
//
// Robust by design: the amount is a best-effort fetch (the cross-site PnP
// redirect can drop the session), so the page is fully clear with just the
// order id from the URL even if that fetch fails.

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const AUTO_REDIRECT_SECONDS = 9;

export default function OrderConfirmedPage() {
  return (
    <Suspense fallback={<Shell><p className="text-sm text-white/70">Loading…</p></Shell>}>
      <OrderConfirmedInner />
    </Suspense>
  );
}

function OrderConfirmedInner() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params?.get('order') ?? '';
  const [total, setTotal] = useState<number | null>(null);
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_REDIRECT_SECONDS);

  const ref = orderNo || (orderId ? orderId.slice(0, 8).toUpperCase() : '');

  // Payment succeeded → empty the cart. The card flow leaves /checkout for the
  // RBC page and returns here, so checkout's own cart-clear never runs.
  useEffect(() => {
    try { window.localStorage.removeItem('bsc_cart'); } catch { /* ignore */ }
  }, []);

  // Best-effort fetch of the amount + order number (degrades silently).
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/orders/${orderId}`, {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const o = json?.order ?? json;
        if (cancelled || !o) return;
        if (typeof o.total === 'number') setTotal(o.total);
        if (o.order_number) setOrderNo(String(o.order_number));
      } catch { /* show the generic confirmation */ }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  // Count down, then forward to the marketplace.
  useEffect(() => {
    const tick = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    const go = setTimeout(() => router.replace('/market'), AUTO_REDIRECT_SECONDS * 1000);
    return () => { clearInterval(tick); clearTimeout(go); };
  }, [router]);

  return (
    <Shell>
      <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/15 ring-4 ring-emerald-400/40">
        <span className="text-5xl">✓</span>
      </div>

      <h1 className="font-display text-3xl font-black text-emerald-400">Payment confirmed!</h1>
      <p className="mt-2 text-base text-white/80">
        Thank you — your order is paid and confirmed. Fresh, local, Bahamian. 🇧🇸
      </p>

      <div className="mx-auto mt-6 w-full rounded-2xl bg-white/5 px-5 py-4 ring-1 ring-gold/20">
        {total != null && (
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <span className="text-sm font-semibold text-white/60">Amount paid</span>
            <span className="text-2xl font-black text-gold">BSD ${total.toFixed(2)}</span>
          </div>
        )}
        {ref && (
          <div className={`flex items-center justify-between ${total != null ? 'pt-3' : ''}`}>
            <span className="text-sm font-semibold text-white/60">Order</span>
            <span className="font-mono text-sm font-bold text-white">#{ref}</span>
          </div>
        )}
        <p className="mt-3 text-xs text-white/50">A receipt has been sent to you. Payment secured by RBC.</p>
      </div>

      <div className="mt-7 space-y-3">
        <Link
          href="/market"
          className="block w-full rounded-xl bg-gold px-5 py-3.5 text-sm font-black text-navy transition hover:bg-gold-300"
        >
          Continue shopping →
        </Link>
        {orderId && (
          <Link
            href={`/track/${orderId}`}
            className="block w-full rounded-xl border border-gold/40 px-5 py-3 text-sm font-bold text-gold transition hover:bg-white/5"
          >
            📦 Track my order
          </Link>
        )}
        <div className="flex gap-3">
          {orderId && (
            <Link
              href={`/receipt/${orderId}`}
              className="flex-1 rounded-xl border border-white/20 px-4 py-2.5 text-xs font-bold text-white/85 transition hover:bg-white/5"
            >
              🧾 Receipt
            </Link>
          )}
          <Link
            href="/my-orders"
            className="flex-1 rounded-xl border border-white/20 px-4 py-2.5 text-xs font-bold text-white/85 transition hover:bg-white/5"
          >
            My orders
          </Link>
        </div>
      </div>

      <p className="mt-6 text-xs text-white/40">
        Taking you to the marketplace in {secondsLeft}s…
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-6 text-center">
      <div className="w-full max-w-sm rounded-3xl bg-white/[0.04] p-8 shadow-[0_8px_40px_rgba(0,0,0,0.4)] ring-1 ring-white/10">
        {children}
      </div>
      <p className="mt-6 text-xs text-white/40">Bahamian Seafood Connection · bscbahamas.com</p>
    </div>
  );
}
