// app/shipping/page.tsx — delivery + mailboat policy.

import type { Metadata } from 'next';
import Link from 'next/link';
import PublicShell from '@/components/PublicShell';

export const metadata: Metadata = {
  title: 'Shipping & Delivery · BSC Marketplace',
  description:
    'Nassau pickup, Nassau delivery, and mailboat shipments to Andros, Eleuthera, Exuma, Abaco, and Grand Bahama.',
};

export default function ShippingPage() {
  return (
    <PublicShell
      eyebrow="Logistics"
      title="Shipping & Delivery"
      subtitle="How your BSC order gets to you — Nassau pickup, Nassau delivery, or mailboat to the Family Islands."
    >
      <div className="space-y-6">
        <Card emoji="🏪" title="Nassau pickup">
          <p>
            Pick up your order at our Nassau location. We will WhatsApp you the moment it is
            ready — usually same day for orders placed before 2pm, next morning for evening orders.
          </p>
          <p className="mt-2">
            Bring your order confirmation (or your order ID) and a photo ID. Pickup is free.
          </p>
        </Card>

        <Card emoji="📍" title="Nassau delivery">
          <p>
            We deliver across New Providence — usually same day for orders placed before noon,
            otherwise next business day. Our driver will reach out before arrival.
          </p>
          <p className="mt-2">
            Delivery fees vary by neighborhood and are confirmed before the driver dispatches.
            Save your delivery address in <Link href="/account" className="font-bold text-navy underline">your account</Link> to speed up future checkouts.
          </p>
        </Card>

        <Card emoji="🚤" title="Mailboat to the Family Islands">
          <p>
            For Andros, Eleuthera, Exuma, Abaco, and Grand Bahama, your order goes out on the
            next mailboat sailing to that island. We coordinate with the mailboat schedule so
            cold-chain items go out at the right time.
          </p>
          <p className="mt-2">
            We will confirm the sailing and your pickup location at the receiving dock via
            WhatsApp. Mailboat fees are paid separately at the dock per the operator.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>Andros &mdash; weekly sailings</li>
            <li>Eleuthera, Exuma, Abaco &mdash; multiple sailings per week</li>
            <li>Grand Bahama &mdash; multiple sailings per week</li>
          </ul>
        </Card>

        <Card emoji="❄️" title="Cold-chain integrity">
          <p>
            Seafood and frozen items are handled at our Spiny Tail Processing facility and
            packed in insulated containers with gel packs. For mailboat shipments we coordinate
            timing so frozen goods minimize time out of cold storage.
          </p>
        </Card>

        <Card emoji="💬" title="Questions about a shipment?">
          <p>
            WhatsApp the captain on duty at <a className="font-bold text-navy underline" href="https://wa.me/12423613474">+1 (242) 361-3474</a>,
            or <Link href="/contact" className="font-bold text-navy underline">send us a message</Link>.
          </p>
        </Card>
      </div>
    </PublicShell>
  );
}

function Card({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-black text-navy sm:text-xl">
        <span>{emoji}</span> {title}
      </h2>
      <div className="mt-3 text-sm leading-relaxed text-slate-700 sm:text-base">
        {children}
      </div>
    </section>
  );
}
