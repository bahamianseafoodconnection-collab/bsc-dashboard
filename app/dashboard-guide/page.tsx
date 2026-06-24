'use client';

// app/dashboard-guide/page.tsx
//
// Master instruction table for the entire BSC dashboard. Every page,
// what it does, when to use it, common actions. Searchable.
// Built so Dedrick (or any staff member) can find "how do I X"
// without asking. Founder AI also references this same content
// (mirrored at docs/DASHBOARD-GUIDE.md) when teaching.

import { useMemo, useState } from 'react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Entry = {
  url: string;
  name: string;
  icon: string;
  what: string;
  when: string;
  actions: string[];
  audience: 'founder' | 'staff' | 'cashier' | 'customer';
};

type Section = { title: string; entries: Entry[] };

const SECTIONS: Section[] = [
  {
    title: 'Strategic + Daily Pulse',
    entries: [
      { url: '/dashboard',     name: 'BSC Control',     icon: '🏠', what: 'Main sidebar nav. Every link to every page.', when: 'Start of every session.', actions: ['Click into any page', 'See revenue stream tiles', 'See wholesalers'], audience: 'founder' },
      { url: '/founder-ai',    name: 'Founder AI',      icon: '🤖', what: 'Strategic assistant. Knows full BSC context (V7). Answers strategy + ops questions in plain English.', when: 'Any time you need a decision sanity-checked or want to explain something to a partner.', actions: ['Ask "what should I work on this week"', 'Ask "where do we stand financially"', 'Ask any operational question'], audience: 'founder' },
      { url: '/pulse',         name: 'Pulse',           icon: '🫀', what: 'Live ops cockpit. Auto-refreshes every 30 seconds. Today revenue, channel mix, open orders, low stock, top items, promo redemptions, new customers, recent ticker.', when: 'Quick health check anytime during the day.', actions: ['Glance at today numbers', 'Click Open Orders → /pickup-queue', 'Click Promos → /promos'], audience: 'staff' },
    ],
  },
  {
    title: 'Sales — POS Registers',
    entries: [
      { url: '/pos',                 name: 'Nassau Register',     icon: '🟡', what: 'Main retail register for Nassau. Search products, build cart, take cash or card payment.', when: 'Every retail sale at the Nassau location.', actions: ['Search product', 'Add to cart', 'Customer name + phone (auto-tracks)', 'Complete sale → prints receipt + sends WhatsApp'], audience: 'cashier' },
      { url: '/pos/scan',            name: 'Barcode Scanner',     icon: '📷', what: 'Scan a barcode to onboard new product or update price/cost/channel/status.', when: 'New supply arrives that needs to be added or repriced.', actions: ['Point camera at barcode', 'Fill product details if new', 'Update existing if found'], audience: 'staff' },
      { url: '/pos/inventory',       name: 'POS Inventory',       icon: '📦', what: 'Live inventory levels with inline editing.', when: 'Daily stock review; before reorder decisions.', actions: ['Edit cost, price, channel, status inline', 'Filter by category / status'], audience: 'staff' },
      { url: '/pos/sales-history',   name: 'Sales History',       icon: '🧾', what: 'Every Nassau + Andros POS sale. Filter by date, location, search.', when: 'Reconcile end-of-day cash; look up specific sale.', actions: ['Filter Today / 7d / 30d / All', 'Filter Nassau vs Andros', 'Open per-sale receipt'], audience: 'staff' },
      { url: '/pos-andros',          name: 'Andros Register',     icon: '🟣', what: 'Andros POS. PIN-gated (CETA2024).', when: 'Every retail sale at Andros / Cetas.', actions: ['Enter PIN', 'Same flow as Nassau register'], audience: 'cashier' },
    ],
  },
  {
    title: 'Sales — Orders + Fulfillment',
    entries: [
      { url: '/orders',          name: 'Order Management',    icon: '📦', what: 'Every order across channels. Filter by status, type. Advance status (Pending → Confirmed → Packing → Out for Delivery → Delivered).', when: 'Manage fulfillment for online + wholesale orders.', actions: ['Filter by status', 'Click Move to: → next status', 'Cancel order'], audience: 'staff' },
      { url: '/pickup-queue',    name: 'Pickup Queue',        icon: '🚚', what: 'Fulfillment view. All orders from last 48hrs grouped by destination (Nassau delivery / pickup / mailboat → island).', when: 'Daily packing + dispatch.', actions: ['Print pick tickets', 'Advance status (notifies customer)', 'Toggle hide delivered'], audience: 'staff' },
      { url: '/order-fulfillment', name: 'Order Fulfillment Detail', icon: '📋', what: 'Detailed per-order packing + handoff view.', when: 'Per-order packing details.', actions: ['Mark items packed', 'Set delivery method'], audience: 'staff' },
    ],
  },
  {
    title: 'Lobster Pipeline (Aug–March season)',
    entries: [
      { url: '/lobster-intake',   name: 'Lobster Intake',     icon: '🦞', what: 'Boat receive form. Logs every intake at Spiny Tail door — supplier, captain, boat, source island, weight, cost, optional size-grade breakdown. Auto-generates lot #.', when: 'Every time a fishing boat or supplier delivers product.', actions: ['Pick supplier or new captain', 'Source island', 'Weight + cost/lb', 'Tail size breakdown if lobster', 'Save intake'], audience: 'staff' },
      { url: '/yield-measure',    name: 'Yield Measurement',  icon: '⚖️', what: 'Record real measured yield on a processed batch. Computes yield % + true cost/lb. Per the Yield Discipline Principle: NEVER assumed, always measured.', when: 'After processing finishes for any intake batch.', actions: ['Pick pending lot', 'Enter finished saleable weight', 'Enter waste lbs', 'Per-grade output breakdown', 'Save'], audience: 'staff' },
      { url: '/lobster-labels',   name: 'Lobster Labels',     icon: '🏷️', what: 'Trilingual export-grade case labels (English + Creole + Spanish). 3 printer formats: Zebra 4x6 thermal (P1), Avery 5163 4x2 stickers (P2), Avery 8163 4x3 stickers (P3).', when: 'Before shipping a batch to Igloo or any USA buyer.', actions: ['Pick measured lot', 'Pick format P1/P2/P3', 'Set tail size + copies + net weight + pieces', 'Toggle plant info / sodium sulfate', 'Open Print Preview → Cmd+P'], audience: 'staff' },
      { url: '/igloo',            name: 'Igloo Integration',  icon: '🧊', what: 'BSC ↔ Igloo Miami: shipments out + sales executed by Igloo + per-shipment P&L. Tracks freight + commission + processing fee + storage + advance financing.', when: 'After shipping a cooler to Miami; when Igloo confirms a sale; when reconciling per-shipment profit.', actions: ['Tab: Shipments → log new shipment', 'Tab: Sales → log new sale (gross/comm/processing/storage/net auto-calc)', 'Tab: Shipment P&L'], audience: 'founder' },
    ],
  },
  {
    title: 'Inventory + Supply',
    entries: [
      { url: '/products',           name: 'Product Catalog',          icon: '🍤', what: 'Master product list with image upload, prices per channel, in-stock toggle, featured flag. Bulk CSV import button.', when: 'Add new product, edit existing, change prices, upload photos, bulk-update via CSV.', actions: ['+ Add Product', '📥 Import CSV (bulk)', 'Edit cost/price/photo inline', 'Toggle in_stock + featured'], audience: 'staff' },
      { url: '/inventory',          name: 'Inventory',                icon: '📊', what: 'Inventory levels across locations.', when: 'Stock reconciliation, reorder decisions.', actions: ['Filter by category', 'Edit qty inline'], audience: 'staff' },
      { url: '/supplier',           name: 'Supplier Admin',           icon: '🚢', what: 'Add + manage supplier records. Approve / pending status.', when: 'Onboard new supplier; approve supplier-side product submissions.', actions: ['+ Add supplier', 'Toggle approve / pending', 'Edit supplier details'], audience: 'founder' },
      { url: '/supplier-purchases', name: 'Buy Next (Auto)',          icon: '📥', what: 'Auto-generated purchase queue. Shows what to buy from each supplier next.', when: 'Daily buy planning.', actions: ['+ Draft PO from queue', 'Confirm quantities', 'Send PO'], audience: 'staff' },
      { url: '/purchase-orders',    name: 'Purchase Orders',          icon: '🧾', what: 'PO management — drafts, sent, received, paid status.', when: 'Track supplier purchases through their lifecycle.', actions: ['+ New PO', 'Mark received', 'Add payment', 'Print + send'], audience: 'staff' },
      { url: '/landed-cost',        name: 'Landed-cost calc',         icon: '🧮', what: 'Bahamas import calculator. FOB + freight + duty + stamp tax + environmental levy = landed cost. Shows sacred-rule retail price per channel.', when: 'Before quoting a USA supplier or sourcing a SKU through Igloo.', actions: ['Pick duty category (or manual %)', 'Enter FOB + freight', 'See landed cost + per-channel sell prices'], audience: 'founder' },
      { url: '/yield',              name: 'Yield Calculator',         icon: '📐', what: 'Calculator-only yield tool (no batch tracking). Quick math.', when: 'One-off "what if" yield calculations.', actions: ['Enter input weight', 'Enter output weight', 'See yield % + cost basis'], audience: 'staff' },
      { url: '/labels',             name: 'Print Labels',             icon: '🏷️', what: 'Generic product labels (non-export).', when: 'In-store retail tagging.', actions: ['Pick product + qty', 'Print'], audience: 'staff' },
      { url: '/captains',           name: 'Captains',                 icon: '🎣', what: 'Roster of fishermen relationships.', when: 'Track per-captain history, contact info, boat reg.', actions: ['+ Add captain', 'Edit contact'], audience: 'staff' },
      { url: '/wholesale-orders',   name: 'Wholesale Orders',         icon: '🇧🇸', what: 'Wholesale-side orders + approvals.', when: 'Wholesale buyer placed an order requiring approval.', actions: ['Review pending', 'Approve / reject', 'Confirm shipping'], audience: 'staff' },
      { url: '/wholesale-products', name: 'Wholesale Products',       icon: '📦', what: 'Wholesale-only product catalog with B2B pricing.', when: 'Manage what shows in /local-wholesale public page.', actions: ['+ Add wholesale SKU', 'Edit price'], audience: 'founder' },
    ],
  },
  {
    title: 'Money + People',
    entries: [
      { url: '/expenses',         name: 'Expenses',          icon: '💸', what: 'Operational expense entry + list. Categories: utilities, rent, payroll, supplier_payment, maintenance, supplies, transport, fees, marketing, equipment, taxes, other.', when: 'Every non-POS expense. Mark paid when wired.', actions: ['+ Add expense', 'Mark paid', 'Filter unpaid'], audience: 'staff' },
      { url: '/accounts-payable', name: 'Accounts Payable',  icon: '📋', what: 'Unpaid + overdue expenses sorted by due date. Includes the 7 May-9 supplier balances.', when: 'Daily cash-flow planning; before paying anyone.', actions: ['See aging', 'Mark paid', 'Open per-vendor history'], audience: 'founder' },
      { url: '/payroll',          name: 'Payroll',           icon: '💼', what: 'Per-staff hours + pay tracking. Auto-writes payroll expenses.', when: 'Weekly / bi-weekly payroll runs.', actions: ['Log hours', 'Pay run → mirrors to expenses'], audience: 'founder' },
      { url: '/customers',        name: 'Customers',         icon: '👥', what: 'Customer tracking — every name from POS or online auto-becomes a tracked customer. Aggregate orders, top items, channel mix, recency.', when: 'Customer outreach, lifetime-value review, loyalty decisions.', actions: ['Filter by source / channel', 'Open detail with order aggregate'], audience: 'founder' },
      { url: '/staff',            name: 'Staff Admin',       icon: '🪪', what: 'Founder/co-founder only. Add/remove staff, change roles, regenerate activation links, reset passwords.', when: 'Onboard cashier; change someone\'s role; password reset.', actions: ['+ Add staff (generates activation URL)', 'Change role inline', 'Regenerate activation link → WhatsApp it', 'Reset password'], audience: 'founder' },
      { url: '/partner-tokens',   name: 'Partner Links',     icon: '🔗', what: 'Generate per-partner shareable URLs for the Partner Portal. Each URL is token-protected and shows that partner\'s scoped data.', when: 'Onboard a new partner like Bob @ Jomara; they get a no-login URL.', actions: ['Pick supplier', 'Set label + expiry', 'Generate (URL auto-copied)', 'WhatsApp it'], audience: 'founder' },
      { url: '/promos',           name: 'Promo Codes',       icon: '🎟️', what: 'Manage discount codes for the online market. Active toggle, redemption history, usage limits.', when: 'Run a marketing campaign; offer first-customer discount.', actions: ['+ New code', 'Activate / Deactivate', 'See redemptions'], audience: 'founder' },
      { url: '/reviews-admin',    name: 'Reviews Moderation', icon: '⭐', what: 'Approve / hide / delete customer product reviews.', when: 'New reviews come in; spam needs hiding.', actions: ['Filter approved/pending/rejected', 'Approve / Hide / Delete'], audience: 'staff' },
      { url: '/reports',          name: 'Reports + CSV',     icon: '📈', what: '5 reports: Sales by day, Sales by channel, Expenses by category, Customer LTV, COGS. Each has CSV export.', when: 'Tax prep, accountant requests, monthly review.', actions: ['Set date range', 'Pick report', 'Download CSV'], audience: 'founder' },
      { url: '/notifications',    name: 'Notifications Queue', icon: '🔔', what: 'Outbound message queue (WhatsApp + email). Process queue button fires queued items via Twilio + SendGrid (when creds shipped).', when: 'See what\'s queued; process queue manually if needed.', actions: ['Process queue', 'Filter by status'], audience: 'staff' },
    ],
  },
  {
    title: 'Services, Fleet, Bills',
    entries: [
      { url: '/fleet',     name: 'Fleet (Internal)',  icon: '🚛', what: 'Internal vehicle tracking — registration, maintenance, fuel.', when: 'Manage BSC delivery vehicles.', actions: ['+ Add vehicle', 'Log maintenance / fuel'], audience: 'founder' },
      { url: '/vehicles',  name: 'Vehicles + Parts',  icon: '🚗', what: 'Public-facing vehicle sales + parts catalog.', when: 'Manage what shows on the vehicle marketplace.', actions: ['+ Add vehicle for sale', 'Manage parts inventory'], audience: 'staff' },
      { url: '/utilities', name: 'Bill Payments',     icon: '⚡', what: 'Customer-facing bill payment service (BPL / WSC etc.). 4.5% + $6 service fee.', when: 'Customer pays a utility bill through BSC.', actions: ['Take payment', 'Issue receipt'], audience: 'cashier' },
      { url: '/bills',     name: 'Bills',             icon: '📄', what: 'Internal bill tracking (different from utility-payment service).', when: 'Track BSC own bills.', actions: ['+ Add bill', 'Mark paid'], audience: 'founder' },
    ],
  },
  {
    title: 'Customer-facing (review only)',
    entries: [
      { url: '/',           name: 'Public Home',         icon: '🏝️', what: 'Marketing landing. Hero (Spline 3D when configured), categories, wholesale, US shopping, why-bsc, CTA, newsletter, footer.', when: 'Verify customer-facing presentation.', actions: ['Test on mobile', 'Click Shop Now → /market'], audience: 'customer' },
      { url: '/market',     name: 'Retail Online Market',       icon: '🛒', what: 'Main shop. Categories, brand pills, search, featured carousel, stock urgency badges, ratings.', when: 'Spot-check what customers see.', actions: ['Browse', 'Search', 'Filter category / brand'], audience: 'customer' },
      { url: '/category/seafood', name: 'Category Landing', icon: '🦐', what: 'SEO landing pages per category (also /meat /produce /beverages /dairy /frozen /dry-goods).', when: 'Verify SEO copy + product listings per category.', actions: ['Click product', 'Click Shop on Market'], audience: 'customer' },
      { url: '/help',       name: 'Customer FAQ',        icon: '❓', what: 'Customer FAQ accordion + WhatsApp CTA.', when: 'Verify FAQ content; add to it as questions repeat.', actions: ['Read', 'WhatsApp link'], audience: 'customer' },
      { url: '/shipping',   name: 'Shipping Policy',     icon: '🚚', what: 'Nassau pickup / delivery / mailboat policy.', when: 'Verify wording matches reality.', actions: ['Read'], audience: 'customer' },
      { url: '/returns',    name: 'Returns Policy',      icon: '↩️', what: 'Seafood freshness guarantee + cancellation policy.', when: 'Verify wording.', actions: ['Read'], audience: 'customer' },
      { url: '/contact',    name: 'Contact Form',        icon: '💬', what: 'Public contact form. Submissions land in /notifications addressed to BSC inbox.', when: 'Verify form works; check /notifications for submissions.', actions: ['Test submit', 'Check inbox'], audience: 'customer' },
    ],
  },
];

export default function DashboardGuidePage() {
  const [search, setSearch] = useState('');
  const [audience, setAudience] = useState<'all' | 'founder' | 'staff' | 'cashier' | 'customer'>('all');

  const filtered = useMemo(() => {
    return SECTIONS.map((s) => ({
      ...s,
      entries: s.entries.filter((e) => {
        if (audience !== 'all' && e.audience !== audience) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const hay = [e.url, e.name, e.what, e.when, e.actions.join(' ')].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    })).filter((s) => s.entries.length > 0);
  }, [search, audience]);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>

      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0, marginBottom: 6 }}>
        Dashboard Guide
      </h1>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>
        Every page · what it does · when to use it · key actions. Search anything.
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder='Search e.g. "lobster", "promo", "supplier", "yield"…'
        style={inputStyle}
      />

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['all', 'founder', 'staff', 'cashier', 'customer'] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAudience(a)}
            style={{
              ...pillStyle,
              background: audience === a ? '#f5c518' : '#0d1f3c',
              color:      audience === a ? '#060d1f' : '#cbd5e1',
              border:     audience === a ? 'none'    : '1px solid #1e3a5f',
            }}
          >
            {a === 'all' ? 'All audiences' : a}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ color: '#94a3b8', padding: 16, textAlign: 'center' }}>
          No pages match.
        </div>
      )}

      {filtered.map((section) => (
        <div key={section.title} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#f5c518', marginBottom: 8 }}>
            {section.title}
          </div>
          {section.entries.map((e) => (
            <div key={e.url} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link href={e.url} style={{ color: '#fff', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
                    {e.icon} {e.name}
                  </Link>
                  <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2, fontFamily: 'monospace' }}>
                    {e.url}
                  </div>
                </div>
                <span style={{
                  fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 800,
                  padding: '4px 8px', borderRadius: 999, color: '#060d1f',
                  background:
                    e.audience === 'founder'  ? '#f5c518' :
                    e.audience === 'staff'    ? '#22c55e' :
                    e.audience === 'cashier'  ? '#1a6fb5' :
                    '#a78bfa',
                }}>
                  {e.audience}
                </span>
              </div>

              <div style={{ marginTop: 8, fontSize: 12, color: '#cbd5e1' }}>
                <span style={{ color: '#f5c518', fontWeight: 700 }}>What:</span> {e.what}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#cbd5e1' }}>
                <span style={{ color: '#f5c518', fontWeight: 700 }}>When:</span> {e.when}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                <span style={{ color: '#f5c518', fontWeight: 700 }}>Key actions:</span>
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  {e.actions.map((a, i) => <li key={i} style={{ marginBottom: 2 }}>{a}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      ))}

      <div style={{ marginTop: 24, padding: 14, background: 'rgba(245,197,24,0.05)', border: '1px solid #1e3a5f', borderRadius: 10, fontSize: 11, color: '#94a3b8' }}>
        <div style={{ color: '#f5c518', fontWeight: 800, marginBottom: 4 }}>How to use this guide with Founder AI</div>
        Ask Founder AI any of these and it will explain in detail:
        <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
          <li>&ldquo;How do I add a new cashier?&rdquo;</li>
          <li>&ldquo;Walk me through the lobster pipeline pages in order.&rdquo;</li>
          <li>&ldquo;What page shows me money owed to suppliers?&rdquo;</li>
          <li>&ldquo;Where do I print export labels?&rdquo;</li>
          <li>&ldquo;How do I send Bob a Partner Portal link?&rdquo;</li>
        </ul>
      </div>
    </div>
  );
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 760, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '12px 14px', border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };
const pillStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'capitalize' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
