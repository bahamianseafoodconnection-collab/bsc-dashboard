// app/returns/page.tsx — refund / replacement policy.

import type { Metadata } from 'next';
import Link from 'next/link';
import PublicShell from '@/components/PublicShell';

export const metadata: Metadata = {
  title: 'Returns & Refunds · BSC Marketplace',
  description:
    'How returns and refunds work at BSC Marketplace, including our seafood freshness guarantee.',
};

export default function ReturnsPage() {
  return (
    <PublicShell
      eyebrow="Customer Care"
      title="Returns & Refunds"
      subtitle="Our promise: if it isn't fresh, you don't pay for it."
    >
      <div className="space-y-6">
        <section className="rounded-2xl bg-emerald-50 p-5 shadow-card ring-1 ring-emerald-200 sm:p-6">
          <h2 className="font-display text-lg font-black text-emerald-900 sm:text-xl">
            🐟 Seafood freshness guarantee
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-emerald-900/90 sm:text-base">
            If any seafood arrives outside our freshness standard, photograph the item, message
            us on WhatsApp within 24 hours of receipt, and we will replace it on the next run or
            refund it &mdash; your choice.
          </p>
        </section>

        <Card title="Order cancellations">
          <p>
            You can cancel an order from <Link href="/my-orders" className="font-bold text-navy underline">My orders</Link> within
            30 minutes of placing it, before we begin packing. After 30 minutes, message us on
            WhatsApp and we will work with you on a case-by-case basis.
          </p>
        </Card>

        <Card title="Damaged or wrong items">
          <p>
            If something arrives damaged or you received the wrong item, contact us within 48 hours
            of delivery. Send a photo of the issue and your order ID. We will refund the affected
            item or send a replacement on the next delivery.
          </p>
        </Card>

        <Card title="Refund timelines">
          <p>
            Refunds for card payments are issued through RBC Plug &amp; Pay and typically take
            5&ndash;10 business days to appear on your statement. Cash refunds happen on your next
            order or by store credit, whichever you prefer.
          </p>
        </Card>

        <Card title="What we cannot return">
          <p>
            For health and safety reasons, fully delivered seafood, meats, and produce that have
            left our cold-chain custody cannot be returned for re-sale. The freshness guarantee
            above covers issues with quality on arrival.
          </p>
        </Card>

        <div className="rounded-2xl bg-navy p-6 text-center text-white sm:p-8">
          <h2 className="font-display text-xl font-black text-gold sm:text-2xl">
            Need to start a return?
          </h2>
          <p className="mt-2 text-sm text-white/80">
            WhatsApp us with your order ID + photos of the issue and we will sort it.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <a
              href="https://wa.me/12423613474"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-gold px-6 py-3 text-sm font-black text-navy hover:bg-gold-300"
            >
              💬 WhatsApp Customer Care
            </a>
            <Link
              href="/contact"
              className="rounded-xl border border-gold/50 bg-transparent px-6 py-3 text-sm font-black text-gold hover:bg-white/10"
            >
              Send a message
            </Link>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="font-display text-lg font-black text-navy sm:text-xl">{title}</h2>
      <div className="mt-3 text-sm leading-relaxed text-slate-700 sm:text-base">{children}</div>
    </section>
  );
}
