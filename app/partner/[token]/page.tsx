'use client';

// app/partner/[token]/page.tsx
//
// Public Partner Portal — token-scoped, no login required. Mobile-first
// because partners open this from WhatsApp links. Per-partner view of:
//   - Outstanding balance (the headline number)
//   - Payment terms BSC commits to (Net-30)
//   - Activity history (paid + outstanding invoices)
//   - Coming-soon hooks for inventory + shipments (lobster pipeline)

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

const STORAGE_BASE =
  'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

type ActivityRow = {
  id: string;
  date: string;
  description: string;
  amount_bsd: number;
  paid: boolean;
  paid_at: string | null;
  payment_method: string | null;
  payment_ref: string | null;
  notes: string | null;
};

type PortalData = {
  ok: boolean;
  error?: string;
  partner?: {
    id: string;
    name: string;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
  };
  token_meta?: { label: string | null; expires_at: string | null };
  balance?: { outstanding_bsd: number; line_count: number };
  payment_terms?: string;
  activity?: ActivityRow[];
  shipments_coming_soon?: boolean;
  inventory_coming_soon?: boolean;
};

export default function PartnerPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch('/api/partner-portal/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const j = (await res.json()) as PortalData;
        setData(j);
      } catch {
        setData({ ok: false, error: 'Network error - please try again' });
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <Shell>
        <div className="py-20 text-center text-slate-500">Loading…</div>
      </Shell>
    );
  }

  if (!data?.ok) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-20 text-center">
          <div className="mb-3 text-5xl">🔒</div>
          <h1 className="font-display text-2xl font-black text-navy">
            {data?.error || 'Link not valid'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            If you received this link from BSC and it isn&rsquo;t working,
            WhatsApp Dedrick at +1 (242) 359-0285.
          </p>
        </div>
      </Shell>
    );
  }

  const partner = data.partner!;
  const balance = data.balance!;
  const activity = data.activity || [];

  return (
    <Shell partnerName={partner.name}>
      {/* Headline balance card */}
      <section className="rounded-2xl bg-gradient-to-br from-navy to-navy-700 p-6 text-white shadow-card sm:p-8">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
          Outstanding balance with BSC
        </div>
        <div className="mt-2 font-display text-5xl font-black sm:text-6xl">
          BSD ${balance.outstanding_bsd.toFixed(2)}
        </div>
        <div className="mt-1 text-sm text-white/70">
          across {balance.line_count} open invoice{balance.line_count === 1 ? '' : 's'}
        </div>
        <div className="mt-4 inline-block rounded-md bg-gold px-3 py-1.5 text-xs font-extrabold text-navy">
          BSC payment terms: {data.payment_terms}
        </div>
      </section>

      {/* Activity table */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow-card sm:p-6">
        <h2 className="mb-4 font-display text-lg font-black text-navy">
          Activity
        </h2>
        {activity.length === 0 ? (
          <p className="text-sm text-slate-500">No activity recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {activity.map((row) => (
              <div
                key={row.id}
                className={`rounded-xl border p-4 ${
                  row.paid ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-navy">
                      {row.description}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {new Date(row.date).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                      {row.payment_method && ` · ${row.payment_method.toUpperCase()}`}
                      {row.payment_ref && ` · ref ${row.payment_ref}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-base font-extrabold ${row.paid ? 'text-emerald-700' : 'text-amber-800'}`}>
                      BSD ${row.amount_bsd.toFixed(2)}
                    </div>
                    <div className={`text-[10px] font-bold uppercase tracking-wider ${row.paid ? 'text-emerald-600' : 'text-amber-700'}`}>
                      {row.paid ? '✓ Paid' : 'Outstanding'}
                    </div>
                  </div>
                </div>
                {row.notes && (
                  <div className="mt-2 text-[11px] italic text-slate-600">
                    {row.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Coming soon */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <ComingSoon
          icon="📦"
          title="Live inventory"
          desc="Real-time view of your product in BSC's freezer. Shipping when the lobster pipeline goes live."
        />
        <ComingSoon
          icon="🚤"
          title="Shipment tracking"
          desc="Per-shipment lot detail with QR-scannable case labels and traceability back to the boat."
        />
      </section>

      {/* Contact + footer */}
      <section className="mt-6 rounded-2xl bg-navy p-6 text-center text-white sm:p-8">
        <h2 className="font-display text-lg font-black text-gold">Questions?</h2>
        <p className="mt-2 text-sm text-white/80">
          WhatsApp Dedrick directly — fastest reply.
        </p>
        <a
          href="https://wa.me/12423590285"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block rounded-xl bg-gold px-6 py-3 text-sm font-black text-navy hover:bg-gold-300"
        >
          💬 WhatsApp +1 (242) 359-0285
        </a>
      </section>
    </Shell>
  );
}

function ComingSoon({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm font-extrabold text-navy">{title}</span>
        <span className="ml-auto rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
          Coming soon
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-600 leading-relaxed">{desc}</p>
    </div>
  );
}

function Shell({ children, partnerName }: { children: React.ReactNode; partnerName?: string }) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="bg-navy">
        <div className="mx-auto flex h-14 max-w-screen-md items-center gap-3 px-4 sm:h-16 sm:px-6">
          <img
            src={`${STORAGE_BASE}/logo.jpg`}
            alt="BSC"
            className="h-9 w-9 rounded-full border-2 border-gold object-cover"
          />
          <div className="text-white">
            <div className="text-sm font-extrabold tracking-wide text-gold">
              BSC Marketplace
            </div>
            {partnerName && (
              <div className="text-[11px] text-white/70">
                Partner Portal · {partnerName}
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-screen-md px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
