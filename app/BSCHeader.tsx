'use client';

import { useState } from 'react';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';

function BSCLogo({ dark = false, size = 56 }: { dark?: boolean; size?: number }) {
  // dark prop here means "light surface" in the rest of this file
  // (variant === 'public' uses a white header → dark text). Confusing
  // naming inherited; passing-through to BrandLogo's darkSurface.
  const darkSurface = !dark; // staff variant has dark navy bg
  // Approximate the requested pixel size to BrandLogo's enum
  const bucket: 'sm' | 'md' | 'lg' = size <= 36 ? 'sm' : size <= 52 ? 'md' : 'lg';
  return <BrandLogo size={bucket} darkSurface={darkSurface} href="/" />;
}

type Props = {
variant?: 'public' | 'staff';
cartCount?: number;
onCartClick?: () => void;
backHref?: string;
backLabel?: string;
title?: string;
subtitle?: string;
};

export default function BSCHeader({ variant = 'public', cartCount = 0, onCartClick, backHref = '/dashboard', backLabel, title, subtitle }: Props) {
const [menuOpen, setMenuOpen] = useState(false);
const isPublic = variant === 'public';
const bg = isPublic ? '#ffffff' : '#1a2e5a';
const border = isPublic ? '#f0f0f0' : 'rgba(255,255,255,0.08)';
const shadow = isPublic ? '0 1px 4px rgba(0,0,0,0.08)' : 'none';

return (
<header style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: bg, boxShadow: shadow, borderBottom: `1px solid ${border}` }}>
<div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>

{/* LEFT */}
<div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
{backLabel && (
<Link href={backHref} style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, textDecoration: 'none', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px', whiteSpace: 'nowrap' }}>
← {backLabel}
</Link>
)}
{title ? (
<div>
<div style={{ color: isPublic ? '#1a2e5a' : '#fff', fontWeight: 900, fontSize: '16px' }}>{title}</div>
{subtitle && <div style={{ color: isPublic ? '#999' : 'rgba(255,255,255,0.5)', fontSize: '10px' }}>{subtitle}</div>}
</div>
) : (
<BSCLogo dark={isPublic} size={44} />
)}
</div>

{/* CENTER NAV — public only, desktop */}
{isPublic && (
<nav style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
{[
{ label: 'Home', href: '/' },
{ label: 'Shop', href: '/market' },
{ label: 'Services', href: '/utilities' },
{ label: 'About Us', href: '#' },
{ label: 'Help & Support', href: '#' },
].map((item) => (
<Link key={item.label} href={item.href} style={{ color: '#444', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>
{item.label}
</Link>
))}
</nav>
)}

{/* RIGHT */}
<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
{isPublic && onCartClick && (
<button onClick={onCartClick} style={{ backgroundColor: '#1a2e5a', color: '#fff', border: 'none', borderRadius: '10px', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}>
<svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
</svg>
Cart
{cartCount > 0 && (
<span style={{ backgroundColor: '#f4c842', color: '#1a2e5a', borderRadius: '20px', padding: '1px 7px', fontSize: '12px', fontWeight: 900 }}>
{cartCount}
</span>
)}
</button>
)}
{isPublic && !onCartClick && (
<Link href="/login" style={{ backgroundColor: '#1a2e5a', color: '#fff', fontSize: '14px', fontWeight: 700, padding: '9px 22px', borderRadius: '8px', textDecoration: 'none' }}>
Sign In
</Link>
)}
<button onClick={() => setMenuOpen(!menuOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}>
<svg width="22" height="22" fill="none" stroke={isPublic ? '#333' : '#fff'} viewBox="0 0 24 24">
<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
</svg>
</button>
</div>
</div>

{/* Mobile menu */}
{menuOpen && isPublic && (
<div style={{ backgroundColor: '#fff', borderTop: '1px solid #f0f0f0', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
{[
{ label: 'Home', href: '/' },
{ label: 'Shop', href: '/market' },
{ label: 'Services', href: '/utilities' },
{ label: 'About', href: '#' },
{ label: 'Help', href: '#' },
].map((item) => (
<Link key={item.label} href={item.href} onClick={() => setMenuOpen(false)} style={{ color: '#444', fontSize: '15px', fontWeight: 500, textDecoration: 'none', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
{item.label}
</Link>
))}
</div>
)}
</header>
);
}
