'use client';

// /dashboard/process-flow — single-page reference doc that walks through
// the full vendor → batch → label → trace lifecycle. Every stage links
// directly to the live page that performs that step + describes what
// data is captured, who's allowed to touch it, and what the next
// transition is. Useful for onboarding Bill, Nicholson, Spiny Tail
// operators, and for the founder to audit the chain.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const ADMIN_ROLES = new Set(['founder','co_founder','control_admin','manager','basic_admin']);

interface Stage {
  num:       number;
  emoji:     string;
  title:     string;
  who:       string;
  where:     string;
  href:      string;
  inputs:    string[];
  outputs:   string[];
  notes?:    string;
  artifact?: string;          // e.g. "vendor_listings row created"
}

const STAGES: Stage[] = [
  {
    num: 1, emoji: '🤝',
    title: 'Vendor application',
    who:   'Fisherman / Farmer / Other',
    where: '/vendor/signup',
    href:  '/vendor/signup',
    inputs: [
      'Business name + vendor type',
      'Contact name, phone, email, location',
      'Government ID + license numbers',
      'Government ID photo + 3+ operation photos + optional video',
      'Bank account info (kept private)',
    ],
    outputs: [
      'vendors row inserted (approval_status = pending)',
      'vendor_documents rows (IDs + photos linked to vendor)',
      'Multi-channel notification to Dedrick + Jaquel (email + SMS + dashboard)',
    ],
    notes: 'Anyone can apply; no auth required. Documents upload to vendor-documents bucket scoped to <auth.uid>/.',
    artifact: 'vendors (status=pending)',
  },
  {
    num: 2, emoji: '✓',
    title: 'Admin approval — vendor',
    who:   'Founder / Co-founder / Control Admin / Manager',
    where: '/dashboard/vendors/pending',
    href:  '/dashboard/vendors/pending',
    inputs: [
      'Review applicant info + uploaded documents',
      'Tap-to-call / WhatsApp / SMS / email from card',
    ],
    outputs: [
      'vendors.approval_status → approved | rejected | suspended',
      'vendors.approved_by + approved_at + approval_notes',
    ],
    notes: 'Approved vendors gain access to /vendor/dashboard + /vendor/listings/new. Suspended/rejected vendors are notified on their dashboard.',
    artifact: 'vendors (status=approved)',
  },
  {
    num: 3, emoji: '📝',
    title: 'Listing + 3-phase traceability',
    who:   'Approved vendor',
    where: '/vendor/listings/new',
    href:  '/vendor/listings/new',
    inputs: [
      'Title, product type, scientific name, description',
      'Quantity / unit / price / bags-boxes count',
      'Harvest status + harvest_or_catch_time + dropoff_expected_at',
      'PHASE 1 — Harbour departure / Seeding (photo OR video + GPS + timestamp)',
      'PHASE 2 — First catch / First ready crop (photo OR video + GPS + timestamp)',
      'PHASE 3 — Final fishing day / Final harvest (photo OR video + GPS + timestamp)',
    ],
    outputs: [
      'vendor_listings row (status = pending_approval)',
      '3 × traceability_phases rows tied to listing',
      'Media in vendor-listings bucket (public for live listings)',
      'Multi-channel notification to admins',
    ],
    notes: 'Submission blocked client-side AND server-side until all 3 phases are uploaded.',
    artifact: 'vendor_listings (status=pending_approval) + traceability_phases × 3',
  },
  {
    num: 4, emoji: '🏷',
    title: 'Admin approval — generate batch',
    who:   'Founder / Co-founder / Control Admin / Manager',
    where: '/dashboard/listings/pending',
    href:  '/dashboard/listings/pending',
    inputs: [
      'Preview all 3 phases + GPS map links',
      'Shelf-life days (defaults by vendor type: 5d fish · 7d crop · 365d frozen lobster/conch)',
      'Optional rejection reason',
    ],
    outputs: [
      'RPC generate_batch_number(vendor_type) → BSC-FISH-YYYYMMDD-NNN',
      'RPC generate_lot_code() → YYYY/NNNN (regulator-friendly)',
      'traceability_batches row inserted with snapshots: vessel/farm context, vendor_payout_snapshot, shelf_life_days, default FDA #, plant #, ingredients, wild_caught',
      'vendor_listings.status → live',
      'Urgent multi-channel notification to Spiny Tail',
    ],
    notes: 'Approve is disabled if fewer than 3 phases exist. Approval is the single point that mints the batch + lot code.',
    artifact: 'traceability_batches (status=pending_processing) · listing goes live on /shop/fresh-catch or /shop/farm-fresh',
  },
  {
    num: 5, emoji: '🏭',
    title: 'Spiny Tail intake — raw weight',
    who:   'Processor / Receiver / Control Admin / Manager',
    where: '/dashboard/processing-batches',
    href:  '/dashboard/processing-batches',
    inputs: [
      'Search/scan by batch number',
      'Record raw_weight_lbs at receiving dock',
    ],
    outputs: [
      'traceability_batches.raw_weight_lbs set',
      'status flips → at_processing',
    ],
    notes: 'Operator sees full vendor + vessel/farm context + all 3 phases with GPS at receipt.',
    artifact: 'traceability_batches (status=at_processing)',
  },
  {
    num: 6, emoji: '🔬',
    title: 'Processing + finish — yield, cost, expiry auto-stamp',
    who:   'Processor / Receiver / Control Admin / Manager',
    where: '/dashboard/processing-batches',
    href:  '/dashboard/processing-batches',
    inputs: [
      'finished_boxes (count of final packages)',
      'finished_weight_lbs (post-processing weight)',
      'production_date (defaults to today)',
      'final_qc_notes (temperature, quality, packaging)',
    ],
    outputs: [
      'DB trigger set_batch_derived_fields() computes:',
      '  • yield_pct           = finished / raw × 100',
      '  • product_cost_per_lb = vendor_payout_snapshot / finished_weight_lbs',
      '  • expiry_date         = production_date + shelf_life_days',
      '  • master_cases_count  = finished_weight_lbs / master_case_lbs',
      'processing_operator_id stamped from auth.uid()',
      'status → processed',
    ],
    notes: 'Live preview of yield / cost / expiry / master cases renders as the operator types, before save.',
    artifact: 'traceability_batches (status=processed) with full math',
  },
  {
    num: 7, emoji: '🖨',
    title: 'Print FDA-compliant Spiny Tails labels',
    who:   'Processor / Receiver / Control Admin / Manager',
    where: '/dashboard/processing-batches/[id]/labels',
    href:  '/dashboard/processing-batches',
    inputs: [
      'Number of finished boxes (one label per box)',
      'Auto-pulled: product, scientific name, lot code, ingredients, FDA #, plant #, packed/best-used dates, allergens, wild-caught flag, size grade',
    ],
    outputs: [
      'Printed Spiny Tails Co. labels matching the regulator-approved layout',
      'Each label carries: Code 128 barcode of lot code + QR code linking to /trace/<batch_number>',
    ],
    notes: 'Layout matches the founder\'s reference sticker exactly: SPINY LOBSTER TAILS / (Panulirus Argus) / Firetrail Road / FDA # · Processing Plant 45 / Ingredients / LOT CODE / Packed By / Best Used by / SEAFOOD IS AN ALLERGEN / WILD CAUGHT PRODUCT OF THE BAHAMAS.',
    artifact: 'Physical printed labels, sticker-ready',
  },
  {
    num: 8, emoji: '📱',
    title: 'Customer scans QR → public trace',
    who:   'Anyone — customer, regulator, retail buyer',
    where: '/trace/[batch_number]',
    href:  '/trace/BSC-FISH-EXAMPLE',
    inputs: [
      'Scan QR with phone camera → opens the trace URL',
      'Or paste a batch number into the URL directly',
    ],
    outputs: [
      'Public page rendered via SECURITY DEFINER fn get_public_trace()',
      'Shows: product identity, Bahamas origin, vessel reg # OR farm license #, production + expiry, allergens, cooking guidance, all 3 phase photos/videos + GPS map links',
      'Never exposes: captain name, owner name, vendor phone/email, bank info',
    ],
    notes: 'The function is SECURITY DEFINER + GRANT EXECUTE to anon, so it bypasses RLS on traceability_batches without leaking PII (only the curated column list returns).',
    artifact: 'Public verification page',
  },
];

export default function ProcessFlowPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/process-flow'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !ADMIN_ROLES.has(prof.role as string)) { window.location.href = '/market'; return; }
      setAuthed(true);

      // Live counts per stage so the doc feels like a dashboard, not a PDF.
      const [pendingVendors, pendingListings, atProcessing, processed, liveListings] = await Promise.all([
        supabase.from('vendors').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
        supabase.from('vendor_listings').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
        supabase.from('traceability_batches').select('id', { count: 'exact', head: true }).in('status', ['pending_processing','at_processing']),
        supabase.from('traceability_batches').select('id', { count: 'exact', head: true }).eq('status', 'processed'),
        supabase.from('vendor_listings').select('id', { count: 'exact', head: true }).eq('status', 'live'),
      ]);
      setCounts({
        pending_vendors:    pendingVendors.count    ?? 0,
        pending_listings:   pendingListings.count   ?? 0,
        in_processing:      atProcessing.count      ?? 0,
        processed_batches:  processed.count         ?? 0,
        live_listings:      liveListings.count      ?? 0,
      });
    })();
  }, []);

  if (authed === null) return <div style={pg}>Loading…</div>;

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <Link href="/dashboard" style={{ color: '#f5c518', fontSize: 12, textDecoration: 'none' }}>← Dashboard</Link>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' }}>
            🧭 Vendor → Batch → Label → Trace · Process Flow
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            Every stage in order, who touches it, what data is captured, and the single live dashboard page that performs it.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
        {/* Live snapshot strip */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 18 }}>
          <Stat label="Pending vendors"   value={counts.pending_vendors   ?? 0} href="/dashboard/vendors/pending" />
          <Stat label="Pending listings"  value={counts.pending_listings  ?? 0} href="/dashboard/listings/pending" />
          <Stat label="Live listings"     value={counts.live_listings     ?? 0} href="/shop/fresh-catch" external />
          <Stat label="In processing"     value={counts.in_processing     ?? 0} href="/dashboard/processing-batches" />
          <Stat label="Processed batches" value={counts.processed_batches ?? 0} href="/dashboard/processing-batches" />
        </section>

        {STAGES.map((s, idx) => (
          <article key={s.num} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 22 }}>{s.emoji}</span>
                  <span style={{ fontSize: 11, color: '#f5c518', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>STAGE {s.num}</span>
                </div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#fff', margin: '4px 0 4px' }}>{s.title}</h2>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                  <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Who:</strong> {s.who} &nbsp;·&nbsp;
                  <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Where:</strong> <code style={{ color: '#f5c518' }}>{s.where}</code>
                </p>
              </div>
              <Link href={s.href} style={cta}>Open ↗</Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginTop: 14 }}>
              <Block label="Inputs"  items={s.inputs} />
              <Block label="Outputs" items={s.outputs} />
            </div>

            {s.notes && (
              <div style={{ marginTop: 10, padding: 10, background: 'rgba(245,197,24,0.06)', borderLeft: '3px solid #f5c518', borderRadius: 4, fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
                {s.notes}
              </div>
            )}
            {s.artifact && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                <strong style={{ color: '#f5c518' }}>Produces:</strong> <code style={{ color: '#fff' }}>{s.artifact}</code>
              </div>
            )}

            {/* Connector arrow between stages */}
            {idx < STAGES.length - 1 && (
              <div style={{ textAlign: 'center', color: 'rgba(245,197,24,0.4)', fontSize: 26, margin: '6px 0 0' }}>↓</div>
            )}
          </article>
        ))}

        {/* Supporting docs / glossary */}
        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: '#f5c518', marginBottom: 8 }}>📚 Glossary + supporting docs</h2>
          <Row k="Batch number"     v="BSC-FISH-YYYYMMDD-NNN · BSC-FARM-YYYYMMDD-NNN · BSC-VEND-… — daily per-type sequence, generated at admin approval." />
          <Row k="Lot code"         v="YYYY/NNNN — regulator-friendly per-year sequence. Printed on every label. Also accepted by /trace/." />
          <Row k="Trust tier"       v="1–3 per vendor. Set by admin. Higher tier = priority surfacing on /shop/." />
          <Row k="Master case"      v="Lobster: 40 lbs of tails per master case. Conch: 50 lbs per master case (5 lb boxes × 10)." />
          <Row k="Yield % (auto)"   v="finished_weight_lbs / raw_weight_lbs × 100" />
          <Row k="Cost / lb (auto)" v="vendor_payout_snapshot / finished_weight_lbs · drives true product cost in the founder dashboard" />
          <Row k="Shelf life"       v="Defaults: 5d fish · 7d crops · 365d frozen lobster/conch. Editable at admin approval." />
          <Row k="Public trace"     v={"Powered by SECURITY DEFINER fn get_public_trace(batch_number). Never exposes captain / owner / vendor phone / vendor email / bank info."} />
          <Row k="Beta mode"        v="BETA_MODE_VENDORS=true → 15% commission disabled · vendors keep 100% of sale until founder flips the env." />
          <Row k="QC blocked goods" v="Reject at /dashboard/quality-control increments vendor.quality_rejections_count + flags the vendor for admin review at Tier 1." />
          <Row k="PII boundary"     v="Customer pages read from vendor_public_profiles VIEW. Base vendors table SELECT is REVOKEd from anon + authenticated."  />
        </section>
      </main>
    </div>
  );
}

const pg: React.CSSProperties   = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif" };
const hdr: React.CSSProperties  = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const card: React.CSSProperties = { background: '#0b1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, marginBottom: 10 };
const cta: React.CSSProperties  = { padding: '8px 14px', borderRadius: 8, background: '#f5c518', color: '#060d1f', fontWeight: 800, fontSize: 12, textDecoration: 'none' };

function Block({ label, items }: { label: string; items: string[] }) {
  return (
    <div style={{ background: '#060d1f', borderRadius: 8, padding: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
      <p style={{ fontSize: 10, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>{label}</p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
        {items.map((t, i) => <li key={i} style={{ marginBottom: 2 }}>{t}</li>)}
      </ul>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ fontSize: 11, color: '#f5c518', fontWeight: 700 }}>{k}</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{v}</div>
    </div>
  );
}
function Stat({ label, value, href, external }: { label: string; value: number; href: string; external?: boolean }) {
  return (
    <Link href={href} target={external ? '_blank' : undefined} style={{ display: 'block', padding: 12, background: '#0b1628', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', textDecoration: 'none', color: '#fff' }}>
      <div style={{ fontSize: 10, color: '#f5c518', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#fff', marginTop: 2 }}>{value}</div>
    </Link>
  );
}
