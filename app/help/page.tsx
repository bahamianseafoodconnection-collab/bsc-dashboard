// app/help/page.tsx — FAQ.

import type { Metadata } from 'next';
import Link from 'next/link';
import PublicShell from '@/components/PublicShell';

export const metadata: Metadata = {
  title: 'Help & FAQ · BSC Marketplace',
  description:
    'Answers to common questions about ordering, delivery, payment, returns, and BSC Marketplace.',
};

const FAQ: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: 'How do I place an order?',
    a: (
      <>
        Browse the <Link href="/market" className="font-bold text-navy underline">market</Link>, add items to your cart, and check out.
        At checkout you choose Nassau pickup, Nassau delivery, or mailboat shipping to a Family Island.
      </>
    ),
  },
  {
    q: 'What payment methods are accepted?',
    a: 'You can pay by RBC Plug & Pay (Visa / Mastercard) at checkout, or choose Cash on Delivery (COD). RBC card payments are processed securely outside our servers.',
  },
  {
    q: 'How long does delivery take?',
    a: 'Nassau orders are typically fulfilled the same day or next morning. Mailboat shipments to Andros, Eleuthera, Exuma, Abaco, and Grand Bahama go out on the next sailing — we will confirm the schedule with you on WhatsApp.',
  },
  {
    q: 'How do I track my order?',
    a: (
      <>
        Every order has a tracking page. Find it in <Link href="/my-orders" className="font-bold text-navy underline">My orders</Link> after signing in,
        or visit <span className="font-mono">/track/&lt;your order ID&gt;</span> directly. We also send WhatsApp / email updates as your order moves through fulfillment.
      </>
    ),
  },
  {
    q: 'Can I cancel an order?',
    a: 'You can cancel from My orders within 30 minutes of placing it, before we start packing. After that, message us on WhatsApp at +1 (242) 361-3474 and we will help.',
  },
  {
    q: 'Do you have a wholesale program?',
    a: (
      <>
        Yes — visit <Link href="/local-wholesale" className="font-bold text-navy underline">Local Wholesale</Link> to shop our wholesale partners.
        For supplier inquiries (selling through BSC), see <Link href="/supplier" className="font-bold text-navy underline">/supplier</Link>.
      </>
    ),
  },
  {
    q: 'How do reviews work?',
    a: 'Anyone with a BSC account can review a product they have viewed. Reviews are visible on the product page and help future shoppers. We may hide reviews that violate our community guidelines.',
  },
  {
    q: 'How do I save addresses for faster checkout?',
    a: (
      <>
        Sign in and visit your <Link href="/account" className="font-bold text-navy underline">account</Link> to add a default delivery address.
        Future checkouts will pre-fill from your default.
      </>
    ),
  },
  {
    q: 'Are prices in BSD?',
    a: 'Yes. All prices are quoted in Bahamian Dollars (BSD), at par with USD. VAT is included where applicable.',
  },
];

export default function HelpPage() {
  return (
    <PublicShell
      eyebrow="Support"
      title="Help & FAQ"
      subtitle="Quick answers to the questions we hear most. Need something else? Reach out on WhatsApp +1 (242) 361-3474."
    >
      <div className="space-y-3">
        {FAQ.map((item, i) => (
          <details
            key={i}
            className="group rounded-2xl bg-white p-5 shadow-card open:ring-1 open:ring-gold/40"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between font-display text-base font-extrabold text-navy">
              <span>{item.q}</span>
              <span className="ml-3 text-xl text-gold transition group-open:rotate-45">+</span>
            </summary>
            <div className="mt-3 text-sm leading-relaxed text-slate-700 sm:text-base">
              {item.a}
            </div>
          </details>
        ))}
      </div>

      <div className="mt-10 rounded-2xl bg-navy p-6 text-center text-white sm:p-8">
        <h2 className="font-display text-xl font-black text-gold sm:text-2xl">
          Still need help?
        </h2>
        <p className="mt-2 text-sm text-white/80">
          Reach a real Bahamian on WhatsApp — we usually reply within an hour.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <a
            href="https://wa.me/12423613474"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-gold px-6 py-3 text-sm font-black text-navy hover:bg-gold-300"
          >
            💬 WhatsApp +1 (242) 361-3474
          </a>
          <Link
            href="/contact"
            className="rounded-xl border border-gold/50 bg-transparent px-6 py-3 text-sm font-black text-gold hover:bg-white/10"
          >
            Send a message
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
