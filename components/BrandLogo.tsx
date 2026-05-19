'use client';

// components/BrandLogo.tsx
//
// Single source of truth for the BSC Market Place watercolor logo.
// Renders the asset at /public/brand/bsc-marketplace-logo.png.
//
// The PNG itself has a white background, so on dark surfaces (POS,
// Andros, dashboard headers) the `darkSurface` prop wraps the logo
// in a white rounded pill so it doesn't clash. On light surfaces
// (public marketplace, receipts, statements) the logo renders
// transparently inline.
//
// Sizes: pick `size` from 'xs' (28px tall) → '2xl' (160px). Width
// is auto so the logo's natural aspect ratio is preserved.

import Link from 'next/link';

const SIZE_PX: Record<string, number> = {
  xs:  28,
  sm:  36,
  md:  48,
  lg:  64,
  xl:  88,
  '2xl': 160,
};

export interface BrandLogoProps {
  size?:        keyof typeof SIZE_PX;
  darkSurface?: boolean;
  href?:        string | null;   // wrap in a Link when set; null disables the link
  alt?:         string;
  showTagline?: boolean;
  /** Inline style override on the outer element */
  style?:       React.CSSProperties;
}

export default function BrandLogo({
  size        = 'md',
  darkSurface = false,
  href        = '/',
  alt         = 'BSC Market Place',
  showTagline = false,
  style,
}: BrandLogoProps) {
  const h = SIZE_PX[size];
  const pad = Math.max(4, Math.round(h * 0.08));

  const inner = (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      gap:           showTagline ? 2 : 0,
      ...style,
    }}>
      <div style={{
        // White rounded pill on dark surfaces, transparent on light
        background:   darkSurface ? '#ffffff' : 'transparent',
        borderRadius: darkSurface ? 12 : 0,
        padding:      darkSurface ? pad : 0,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        // Subtle elevation when pilled
        boxShadow:    darkSurface ? '0 1px 3px rgba(0,0,0,0.18)' : 'none',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/bsc-marketplace-logo.png"
          alt={alt}
          height={h}
          style={{ height: h, width: 'auto', display: 'block' }}
        />
      </div>
      {showTagline && (
        <div style={{
          fontSize:      Math.max(9, Math.round(h * 0.11)),
          letterSpacing: 2,
          fontWeight:    700,
          textTransform: 'uppercase',
          color:         darkSurface ? 'rgba(255,255,255,0.55)' : '#475569',
          marginTop:     4,
        }}>
          Fresh · Local · Reliable
        </div>
      )}
    </div>
  );

  if (href === null) return inner;
  return <Link href={href} style={{ textDecoration: 'none' }}>{inner}</Link>;
}
