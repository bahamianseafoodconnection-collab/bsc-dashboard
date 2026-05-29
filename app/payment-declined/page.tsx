'use client';

// /payment-declined?reason=declined|problem
//
// Branded, clear "payment did not go through" screen — the decline-side mirror
// of /order-confirmed. The RBC / Plug'n Pay return-handler redirects here on a
// declined / problem / fraud outcome instead of dropping the customer back on
// the checkout form with a small banner.
//
// Messaging is deliberately generic and safe (never echoes the gateway's
// reason/code/amount): a hard decline → "contact your bank"; a gateway problem
// → "try again in a moment". Fraud uses the decline copy (silent treatment).

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function PaymentDeclinedPage() {
  return (
    <Suspense fallback={<Shell><p className="text-sm text-white/70">Loading…</p></Shell>}>
      <PaymentDeclinedInner />
    </Suspense>
  );
}

function PaymentDeclinedInner() {
  const params = useSearchParams();
  const reason = params?.get('reason') === 'problem' ? 'problem' : 'declined';

  const isProblem = reason === 'problem';
  const title   = isProblem ? "Payment didn't go through" : 'Payment declined';
  const message = isProblem
    ? 'We had a temporary problem reaching your bank. No charge was made — please try again in a moment.'
    : 'Payment declined by your bank. Please contact your financial institution and try again.';

  return (
    <Shell>
      <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-red-500/15 ring-4 ring-red-400/40">
        <span className="text-5xl">{isProblem ? '⚠️' : '✕'}</span>
      </div>

      <h1 className="font-display text-3xl font-black text-red-400">{title}</h1>
      <p className="mt-3 text-base leading-relaxed text-white/85">{message}</p>

      <div className="mt-7 space-y-3">
        <Link
          href="/checkout"
          className="block w-full rounded-xl bg-gold px-5 py-3.5 text-sm font-black text-navy transition hover:bg-gold-300"
        >
          Try again →
        </Link>
        <Link
          href="/market"
          className="block w-full rounded-xl border border-white/20 px-5 py-3 text-sm font-bold text-white/85 transition hover:bg-white/5"
        >
          Back to the marketplace
        </Link>
      </div>

      <p className="mt-6 text-xs text-white/40">
        Your card was not charged. Need help? Call +1 (242) 558-4495.
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
