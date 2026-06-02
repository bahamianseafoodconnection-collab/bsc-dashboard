'use client';

// components/DailyProtocolChecklist.tsx
//
// Per-role "today's protocol" checklist. Render on each role's
// landing page so the moment someone signs in they see exactly
// what they're supposed to do today — no guessing, no missed
// steps, same shape every day.
//
// Persisted in localStorage with a daily key so checks survive
// page reloads but auto-reset at midnight (next day's date
// produces a new key).
//
// Add or edit items per role in PROTOCOL_BY_ROLE below — that
// keeps the component a single source of truth.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

export type ProtocolItem = {
  key:    string;       // stable id for localStorage
  icon:   string;
  label:  string;       // imperative action
  href?:  string;       // where to do it
  note?:  string;       // optional secondary line
};

// Daily-protocol cards per role. Order = priority Dedrick wants
// staff to follow each morning.
const PROTOCOL_BY_ROLE: Record<string, ProtocolItem[]> = {
  founder: [
    { key: 'review-supplier-cogs', icon: '💸', label: 'Review live supplier COGS · WhatsApp reorder lists', href: '/dashboard/supplier-cogs', note: 'Buy back exactly what sold today.' },
    { key: 'approve-pending',      icon: '✅', label: 'Approve any pending products',                          href: '/founder-ai/products/pending', note: 'New intakes need a founder ✓ before going live.' },
    { key: 'cashier-variance',     icon: '🪙', label: 'Review cashier shifts + drawer variance',              href: '/dashboard/cashiers',          note: 'Yesterday\'s close — flag anything > $5 off.' },
    { key: 'ar-overdue',           icon: '🚨', label: 'Chase any overdue AR (credit customers)',              href: '/dashboard/ar-aging',          note: 'Whatsapp the customer if 30+ days late.' },
    { key: 'specials-flyer',       icon: '📣', label: 'Update today\'s special / flyer if new',               href: '/founder-ai/flyer-maker',      note: '"build a flyer X $Y today only" in Founder AI.' },
    { key: 'briefing',             icon: '📧', label: 'Read the morning Daily Briefing email',                                                      note: 'Drops at 6 am AST — covers customer pulse + lot consumption.' },
  ],
  co_founder: [
    { key: 'review-supplier-cogs', icon: '💸', label: 'Review live supplier COGS · WhatsApp reorder lists', href: '/dashboard/supplier-cogs' },
    { key: 'approve-pending',      icon: '✅', label: 'Approve any pending products',                          href: '/founder-ai/products/pending' },
    { key: 'cashier-variance',     icon: '🪙', label: 'Review cashier shifts + drawer variance',              href: '/dashboard/cashiers' },
    { key: 'briefing',             icon: '📧', label: 'Read the morning Daily Briefing email' },
  ],
  manager: [
    { key: 'open-shop',            icon: '🔑', label: 'Confirm Nassau POS shift open + drawer counted',     href: '/pos' },
    { key: 'pickups',              icon: '🚚', label: 'Process pickup-queue orders (Nassau)',                href: '/pickup-queue' },
    { key: 'wholesale',            icon: '🏭', label: 'Review wholesale orders to purchase',                 href: '/wholesale-orders' },
    { key: 'supplier-cogs',        icon: '💸', label: 'Review live supplier COGS (founder will reorder)',    href: '/dashboard/supplier-cogs' },
    { key: 'close-shop',           icon: '🔒', label: 'End of day — close shift + count drawer',             href: '/pos',                          note: '10-hour cap auto-closes if forgotten.' },
  ],
  cashier: [
    { key: 'open-shift',           icon: '🔑', label: 'Open cashier shift + enter opening float',           href: '/pos' },
    { key: 'capture-customers',    icon: '📞', label: 'Capture each customer\'s name + phone before ringing', href: '/pos',                          note: 'Required so receipts go to WhatsApp.' },
    { key: 'ring-sales',           icon: '🛒', label: 'Ring sales · pick WhatsApp receipt per sale',         href: '/pos' },
    { key: 'card-ref',             icon: '💳', label: 'Type RBC terminal ref on every card sale',           href: '/pos',                          note: 'Reconciliation depends on this match.' },
    { key: 'close-shift',          icon: '🔒', label: 'End of day — close shift + count drawer',             href: '/pos',                          note: 'Count cash; system computes variance.' },
  ],
  operations: [
    { key: 'log-intake',           icon: '🦞', label: 'Log any lobster / fish received today',               href: '/lobster-intake',                note: 'Vessel + GPS photo + raw weight (Step 1).' },
    { key: 'log-production',       icon: '🏭', label: 'Log production (freezer + batch) for any intake',                                              note: 'Step 2/3 — case packing + grading.' },
    { key: 'pickup-pick',          icon: '🚚', label: 'Pick + stage pickup-queue orders',                    href: '/pickup-queue' },
    { key: 'freezer-temps',        icon: '🌡', label: 'Log freezer temperature reading',                     href: '/spinytails/lots',               note: 'CCP requirement — twice daily.' },
    { key: 'labels',               icon: '🏷', label: 'Print any case labels needed',                        href: '/labels' },
  ],
  processor: [
    { key: 'log-production',       icon: '🏭', label: 'Log today\'s production batches',                                                              note: 'Spiny Tail step 2/3 logs.' },
    { key: 'freezer-temps',        icon: '🌡', label: 'Log freezer temperature reading (CCP)',               href: '/spinytails/lots' },
    { key: 'ssop',                 icon: '🧽', label: 'SSOP cleaning + sanitation log',                      href: '/spinytails/documents' },
    { key: 'case-pack',            icon: '📦', label: 'Case-pack + label any finished batches',              href: '/spinytails/lots' },
  ],
  andros_staff: [
    { key: 'open-shift',           icon: '🔑', label: 'Open Andros POS shift + opening float',              href: '/pos-andros' },
    { key: 'capture-customers',    icon: '📞', label: 'Capture customer name + phone before ringing',        href: '/pos-andros' },
    { key: 'close-shift',          icon: '🔒', label: 'End of day — close shift + count drawer',             href: '/pos-andros' },
  ],
  supplier: [
    { key: 'submit-products',      icon: '➕', label: 'Submit new products / update pricing',                href: '/supplier-portal' },
    { key: 'mark-stock',           icon: '⏸', label: 'Pause any product you\'re out of (so BSC stops selling)', href: '/supplier-portal' },
    { key: 'check-invoices',       icon: '🧾', label: 'Check open BSC invoices + payments',                  href: '/supplier-portal' },
  ],
};

function todayKey(role: string): string {
  const d = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Nassau' }); // YYYY-MM-DD Bahamas
  return `bsc_protocol_${role}_${d}`;
}

export default function DailyProtocolChecklist({ role }: { role: string | null | undefined }) {
  const items = useMemo(() => (role ? PROTOCOL_BY_ROLE[role] ?? null : null), [role]);
  const storageKey = useMemo(() => (role ? todayKey(role) : ''), [role]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Load persisted state on mount / when key changes.
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      setChecked(raw ? JSON.parse(raw) : {});
    } catch { setChecked({}); }
  }, [storageKey]);

  function toggle(k: string) {
    setChecked((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }

  if (!items || items.length === 0) return null;

  const done = items.filter((it) => checked[it.key]).length;
  const pct  = Math.round((done / items.length) * 100);
  const collapsed = done === items.length;

  return (
    <div style={{
      background: collapsed ? '#dcfce7' : '#fff',
      border: '1px solid ' + (collapsed ? '#86efac' : '#e2e8f0'),
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      boxShadow: collapsed ? 'none' : '0 2px 12px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed ? 0 : 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{collapsed ? '🎉' : '📋'}</span>
          <div style={{ fontWeight: 800, fontSize: 13, color: collapsed ? '#166534' : '#1a2e5a', letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {collapsed ? `All done for today — ${role} protocol complete` : `Today's protocol · ${role}`}
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: collapsed ? '#166534' : '#64748b' }}>
          {done} / {items.length} {!collapsed && `(${pct}%)`}
        </div>
      </div>
      {!collapsed && (
        <>
          <div style={{ height: 4, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#1a2e5a', transition: 'width 0.3s' }} />
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {items.map((it) => {
              const isOn = !!checked[it.key];
              return (
                <li key={it.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 8px', borderRadius: 8, background: isOn ? '#f0fdf4' : 'transparent' }}>
                  <button
                    onClick={() => toggle(it.key)}
                    aria-label={isOn ? `Mark "${it.label}" not done` : `Mark "${it.label}" done`}
                    style={{
                      width: 22, height: 22, borderRadius: 6, border: `2px solid ${isOn ? '#16a34a' : '#cbd5e1'}`,
                      background: isOn ? '#16a34a' : '#fff', color: '#fff', fontWeight: 900, fontSize: 13,
                      cursor: 'pointer', flexShrink: 0, marginTop: 1, lineHeight: 1,
                    }}
                  >
                    {isOn ? '✓' : ''}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: isOn ? '#15803d' : '#0f172a', fontWeight: 700, textDecoration: isOn ? 'line-through' : 'none' }}>
                      <span style={{ marginRight: 6 }}>{it.icon}</span>
                      {it.label}
                      {it.href && !isOn && (
                        <Link href={it.href} style={{ marginLeft: 8, color: '#1a2e5a', fontSize: 11, fontWeight: 800, textDecoration: 'none', borderBottom: '1px dashed #1a2e5a' }}>
                          open →
                        </Link>
                      )}
                    </div>
                    {it.note && (
                      <div style={{ fontSize: 11, color: isOn ? '#94a3b8' : '#64748b', marginTop: 1 }}>{it.note}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
