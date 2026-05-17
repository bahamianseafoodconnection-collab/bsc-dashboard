'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { PageErrorBoundary } from './ErrorBoundary';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const STAFF_ROLES = new Set([
  'founder','co_founder','cashier','manager','basic_admin','control_admin','andros_staff','supplier','receiver'
]);

const STAFF_ONLY_PREFIXES = [
  '/pos','/dashboard','/report','/inventory','/jaquel',
  '/yield','/staff','/cash','/purchase-orders','/orders'
];

function isStaffCustomerRoute(pathname: string): boolean {
  return (
    pathname === '/customers' ||
    (pathname.startsWith('/customers/') && !pathname.startsWith('/customers/dashboard'))
  );
}

const NO_NAV_PREFIXES = [
  // Auth & legal
  '/login','/staff-login','/reset-password','/legal',
  // Staff-only pages (have their own nav)
  '/supplier','/purchase-orders','/pos-andros','/pos','/dashboard',
  '/jaquel','/report','/yield','/inventory','/staff','/cash',
  '/customers/dashboard',
  // Public-facing pages — clean layout, no bottom bar
  '/market','/product','/category','/checkout','/my-orders',
  '/account','/wishlist','/contact','/admin','/founder-ai',
];

const CUSTOMER_NAV = [
  { label: 'Home',     href: '/',                  icon: '🏠' },
  { label: 'Shop',     href: '/market',             icon: '🛒' },
  { label: 'Pay Bills',href: '/utilities',          icon: '⚡' },
  { label: 'Vehicles', href: '/vehicles',           icon: '🚗' },
  { label: 'Account',  href: '/customers/dashboard',icon: '👤' },
];

const STAFF_NAV: Record<string, { label: string; href: string; icon: string }[]> = {
  // founder + co_founder share the top-tier control_admin nav.
  founder: [
    { label: 'Control',  href: '/dashboard', icon: '📊' },
    { label: 'POS',      href: '/pos',       icon: '🛒' },
    { label: 'Market',   href: '/market',    icon: '🏪' },
    { label: 'Vehicles', href: '/vehicles',  icon: '🚗' },
    { label: 'Pay Bills',href: '/utilities', icon: '⚡' },
  ],
  co_founder: [
    { label: 'Control',  href: '/dashboard', icon: '📊' },
    { label: 'POS',      href: '/pos',       icon: '🛒' },
    { label: 'Market',   href: '/market',    icon: '🏪' },
    { label: 'Vehicles', href: '/vehicles',  icon: '🚗' },
    { label: 'Pay Bills',href: '/utilities', icon: '⚡' },
  ],
  control_admin: [
    { label: 'Control',  href: '/dashboard', icon: '📊' },
    { label: 'POS',      href: '/pos',       icon: '🛒' },
    { label: 'Market',   href: '/market',    icon: '🏪' },
    { label: 'Vehicles', href: '/vehicles',  icon: '🚗' },
    { label: 'Pay Bills',href: '/utilities', icon: '⚡' },
  ],
  basic_admin: [
    { label: 'Dashboard',href: '/jaquel',    icon: '📊' },
    { label: 'POS',      href: '/pos',       icon: '🛒' },
    { label: 'Market',   href: '/market',    icon: '🏪' },
    { label: 'Vehicles', href: '/vehicles',  icon: '🚗' },
    { label: 'Pay Bills',href: '/utilities', icon: '⚡' },
  ],
  manager: [
    { label: 'Dashboard',href: '/jaquel',    icon: '📊' },
    { label: 'POS',      href: '/pos',       icon: '🛒' },
    { label: 'Orders',   href: '/orders',    icon: '📦' },
    { label: 'Market',   href: '/market',    icon: '🏪' },
    { label: 'Pay Bills',href: '/utilities', icon: '⚡' },
  ],
  // TJ + Claff work POS cash AND receive/process inventory. 5 tabs total.
  cashier: [
    { label: 'POS',       href: '/pos',                 icon: '🛒' },
    { label: 'Intake',    href: '/intake/scan-invoice', icon: '📥' },
    { label: 'Inventory', href: '/inventory',           icon: '📊' },
    { label: 'Yield',     href: '/yield',               icon: '🧮' },
    { label: 'Pay Bills', href: '/utilities',           icon: '⚡' },
  ],
  // Nicholson: receives + processes inventory, no POS cash.
  receiver: [
    { label: 'Intake',    href: '/intake/scan-invoice', icon: '📥' },
    { label: 'Inventory', href: '/inventory',           icon: '📊' },
    { label: 'Yield',     href: '/yield',               icon: '🧮' },
    { label: 'Market',    href: '/market',              icon: '🏪' },
    { label: 'Pay Bills', href: '/utilities',           icon: '⚡' },
  ],
  andros_staff: [
    { label: 'Andros POS',href: '/pos-andros',icon: '🛒' },
    { label: 'Market',    href: '/market',    icon: '🏪' },
    { label: 'Pay Bills', href: '/utilities', icon: '⚡' },
    { label: 'Orders',    href: '/orders',    icon: '📦' },
    { label: 'Yield',     href: '/yield',     icon: '🧮' },
  ],
  supplier: [
    { label: 'Supplier', href: '/supplier',  icon: '🚢' },
    { label: 'Market',   href: '/market',    icon: '🏪' },
    { label: 'Yield',    href: '/yield',     icon: '🧮' },
    { label: 'Pay Bills',href: '/utilities', icon: '⚡' },
    { label: 'Vehicles', href: '/vehicles',  icon: '🚗' },
  ],
};

type RoleState = 'loading' | 'unauthenticated' | string;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [roleState, setRoleState] = useState<RoleState>('loading');

  useEffect(() => {
    const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);

    async function resolveRoleAndGuard() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          setRoleState('unauthenticated');
          const blocked =
            STAFF_ONLY_PREFIXES.some(p => pathname.startsWith(p)) ||
            isStaffCustomerRoute(pathname);
          if (blocked) router.replace('/staff-login');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role, must_change_password')
          .eq('id', session.user.id)
          .single();

        const role = profile?.role || 'customer';
        setRoleState(role);

        // Force-password-change takes priority over every other guard.
        // If the user is flagged, they're locked to /change-password
        // until they reset (the page itself clears the flag on success).
        if (profile?.must_change_password && pathname !== '/change-password') {
          router.replace('/change-password');
          return;
        }

        if (!STAFF_ROLES.has(role)) {
          const blocked =
            STAFF_ONLY_PREFIXES.some(p => pathname.startsWith(p)) ||
            isStaffCustomerRoute(pathname);
          if (blocked) { router.replace('/market'); return; }
        }
      } catch {
        setRoleState('unauthenticated');
      }
    }

    resolveRoleAndGuard();
  }, [pathname]);

  const hideNav =
    pathname === '/' ||
    NO_NAV_PREFIXES.some(prefix => pathname.startsWith(prefix));

  const navItems =
    roleState !== 'loading' &&
    roleState !== 'unauthenticated' &&
    STAFF_NAV[roleState]
      ? STAFF_NAV[roleState]
      : CUSTOMER_NAV;

  return (
    <PageErrorBoundary>
      <div style={{ minHeight: '100vh', backgroundColor: '#060d1f', display: 'flex', flexDirection: 'column' }}>
        <main style={{ flex: 1, paddingBottom: (hideNav || roleState === 'loading') ? 0 : 'calc(64px + env(safe-area-inset-bottom))' }}>
          {children}
        </main>

        {!hideNav && roleState !== 'loading' && (
          <nav style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'rgba(7,14,29,0.92)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderTop: '1px solid rgba(245,197,24,0.18)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            boxShadow: '0 -2px 12px rgba(0,0,0,0.25)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
              {navItems.map(item => {
                const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href + '/'));
                return (
                  <button key={item.href} onClick={() => router.push(item.href)}
                    aria-label={item.label}
                    aria-current={active ? 'page' : undefined}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                      padding: '8px 4px 10px',
                      minHeight: 60,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: active ? '#f5c518' : 'rgba(255,255,255,0.62)',
                      transition: 'color 120ms ease',
                      position: 'relative',
                    }}>
                    {active && <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 28, height: 3, borderRadius: '0 0 4px 4px', background: '#f5c518' }} />}
                    <span style={{ fontSize: 22, lineHeight: 1, filter: active ? 'none' : 'grayscale(0.25)' }}>{item.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: 0.2, lineHeight: 1.1, marginTop: 2 }}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </PageErrorBoundary>
  );
}
