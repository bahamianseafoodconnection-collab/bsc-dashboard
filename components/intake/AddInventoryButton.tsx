'use client';

// components/intake/AddInventoryButton.tsx
//
// Reusable CTA for the Universal Inventory Intake. Three variants per spec:
//   • primary — flat gold button, top-right of a header area
//   • fab     — fixed bottom-right gold circle (POS pages)
//   • card    — full-width card with icon + label + sub-copy (hero section)
//
// All variants link to /founder-ai/products/intake?role=<role> so the
// intake page can tag the submission. The role param is optional — if
// omitted, role-tagging.ts falls back to the session's profile.role.

import Link from 'next/link';
import type { KnownRole } from '@/lib/founder-ai/role-tagging';

export type AddInventoryButtonVariant = 'primary' | 'fab' | 'card';

interface Props {
  role?:      KnownRole | null;
  variant?:   AddInventoryButtonVariant;
  label?:     string;
  subLabel?:  string;
  icon?:      string;
}

export default function AddInventoryButton({
  role,
  variant  = 'primary',
  label    = '+ Add inventory',
  subLabel,
  icon     = '📷',
}: Props) {
  const href = role
    ? `/founder-ai/products/intake?role=${encodeURIComponent(role)}`
    : '/founder-ai/products/intake';

  if (variant === 'fab') {
    return (
      <Link
        href={href}
        aria-label="Add inventory"
        title="Add inventory"
        style={{
          position:    'fixed',
          right:       18,
          bottom:      18,
          width:       60,
          height:      60,
          borderRadius: '50%',
          background:  '#f5c518',
          color:       '#060d1f',
          display:     'flex',
          alignItems:  'center',
          justifyContent: 'center',
          fontSize:    26,
          fontWeight:  900,
          textDecoration: 'none',
          boxShadow:   '0 10px 24px -8px rgba(0,0,0,0.5)',
          zIndex:      40,
        }}>
        {icon}
      </Link>
    );
  }

  if (variant === 'card') {
    return (
      <Link href={href}
        style={{
          display:      'block',
          background:   'linear-gradient(135deg, #0f1f3d 0%, #060d1f 100%)',
          border:       '1px solid rgba(245,197,24,0.4)',
          borderRadius: 12,
          padding:      16,
          textDecoration: 'none',
          color:        '#fff',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 10,
            background: 'rgba(245,197,24,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, flexShrink: 0,
          }}>{icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#f5c518' }}>{label}</div>
            {subLabel && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{subLabel}</div>}
          </div>
          <div style={{ fontSize: 18, color: '#f5c518' }}>→</div>
        </div>
      </Link>
    );
  }

  // primary
  return (
    <Link href={href}
      style={{
        background:   '#f5c518',
        color:        '#060d1f',
        border:       'none',
        borderRadius: 8,
        padding:      '8px 16px',
        fontSize:     13,
        fontWeight:   800,
        textDecoration: 'none',
        display:      'inline-flex',
        alignItems:   'center',
        gap:          6,
      }}>
      {icon} {label}
    </Link>
  );
}
