// File: app/AppShell.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { label: 'POS',       href: '/pos',       icon: '🛒' },
  { label: 'Summary',   href: '/',          icon: '📊' },
  { label: 'Market',    href: '/market',    icon: '🏪' },
  { label: 'Vehicles',  href: '/vehicles',  icon: '🚗' },
  { label: 'Pay Bills', href: '/utilities', icon: '⚡' },
  { label: 'Customers', href: '/customers', icon: '👥' },
  { label: 'Report',    href: '/report',    icon: '📋' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const hideNav =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/supplier') ||
    pathname.startsWith('/purchase-orders') ||
    pathname.startsWith('/pos-andros') ||
    pathname.startsWith('/vehicles') ||
    pathname.startsWith('/utilities') ||
    pathname.startsWith('/legal');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#060d1f', display: 'flex', flexDirection: 'column' }}>
      <main style={{ flex: 1, paddingBottom: hideNav ? 0 : 80 }}>
        {children}
      </main>

      {!hideNav && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          background: 'rgba(7,14,29,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(245,197,24,0.15)',
          padding: '6px 8px 10px',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-around', alignItems: 'stretch',
            maxWidth: 640, margin: '0 auto', gap: 4,
            overflowX: 'auto' as const,
          }}>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    flex: 1, minWidth: 44,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 3, padding: '7px 2px', borderRadius: 12, textDecoration: 'none',
                    background: isActive
                      ? 'linear-gradient(135deg, rgba(245,197,24,0.18), rgba(245,197,24,0.08))'
                      : 'transparent',
                    border: isActive ? '1px solid rgba(245,197,24,0.35)' : '1px solid transparent',
                    boxShadow: isActive ? '0 0 12px rgba(245,197,24,0.15)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <span style={{
                    fontSize: 8, letterSpacing: 0.5, fontWeight: isActive ? 'bold' : '500',
                    color: isActive ? '#f5c518' : 'rgba(255,255,255,0.45)',
                    fontFamily: "'Inter', -apple-system, sans-serif",
                    whiteSpace: 'nowrap' as const,
                  }}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
