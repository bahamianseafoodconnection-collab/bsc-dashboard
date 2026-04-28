'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { PageErrorBoundary } from './ErrorBoundary';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Staff-only routes — customers redirected to /market
// /customers/dashboard is NOT here — it is customer-safe
// /vehicles is NOT here — it is public
const STAFF_ONLY_PREFIXES = [
  '/pos',
  '/dashboard',
  '/report',
  '/inventory',
  '/ashley',
  '/jaquel',
  '/yield',
  '/staff',
  '/cash',
  '/purchase-orders',
  '/orders',
];

// /customers management page — staff only
// /customers/dashboard — customer safe (excluded below)
function isStaffCustomerRoute(pathname: string): boolean {
  return (
    pathname === '/customers' ||
    (pathname.startsWith('/customers/') && !pathname.startsWith('/customers/dashboard'))
  );
}

// Pages that manage their own full-screen layout — no shell nav
const NO_NAV_PREFIXES = [
  '/login',
  '/reset-password',
  '/legal',
  '/supplier',
  '/purchase-orders',
  '/pos-andros',
  '/pos',
  '/dashboard',
  '/ashley',
  '/jaquel',
  '/report',
  '/yield',
  '/inventory',
  '/staff',
  '/cash',
  '/customers/dashboard',
];

const STAFF_ROLES = new Set([
  'cashier', 'manager', 'basic_admin', 'control_admin', 'andros_staff', 'supplier',
]);

const CUSTOMER_NAV = [
  { label: 'Home',      href: '/',                   icon: '🏠' },
  { label: 'Shop',      href: '/market',              icon: '🛒' },
  { label: 'Pay Bills', href: '/utilities',           icon: '⚡' },
  { label: 'Vehicles',  href: '/vehicles',            icon: '🚗' },
  { label: 'Account',   href: '/customers/dashboard', icon: '👤' },
];

const STAFF_NAV: Record<string, { label: string; href: string; icon: string }[]> = {
  control_admin: [
    { label: 'Control',   href: '/dashboard',  icon: '📊' },
    { label: 'POS',       href: '/pos',         icon: '🛒' },
    { label: 'Market',    href: '/market',      icon: '🏪' },
    { label: 'Vehicles',  href: '/vehicles',    icon: '🚗' },
    { label: 'Pay Bills', href: '/utilities',   icon: '⚡' },
  ],
  basic_admin: [
    { label: 'Dashboard', href: '/jaquel',      icon: '📊' },
    { label: 'POS',       href: '/pos',         icon: '🛒' },
    { label: 'Market',    href: '/market',      icon: '🏪' },
    { label: 'Vehicles',  href: '/vehicles',    icon: '🚗' },
    { label: 'Pay Bills', href: '/utilities',   icon: '⚡' },
  ],
  manager: [
    { label: 'Dashboard', href: '/ashley',      icon: '📊' },
    { label: 'POS',       href: '/pos',         icon: '🛒' },
    { label: 'Orders',    href: '/orders',      icon: '📦' },
    { label: 'Market',    href: '/market',      icon: '🏪' },
    { label: 'Pay Bills', href: '/utilities',   icon: '⚡' },
  ],
  cashier: [
    { label: 'POS',       href: '/pos',         icon: '🛒' },
    { label: 'Market',    href: '/market',      icon: '🏪' },
    { label: 'Vehicles',  href: '/vehicles',    icon: '🚗' },
    { label: 'Pay Bills', href: '/utilities',   icon: '⚡' },
    { label: 'Orders',    href: '/orders',      icon: '📦' },
  ],
  andros_staff: [
    { label: 'Andros POS', href: '/pos-andros', icon: '🛒' },
    { label: 'Market',     href: '/market',     icon: '🏪' },
    { label: 'Pay Bills',  href: '/utilities',  icon: '⚡' },
    { label: 'Orders',     href: '/orders',     icon: '📦' },
    { label: 'Yield',      href: '/yield',      icon: '🧮' },
  ],
  supplier: [
    { label: 'Supplier',  href: '/supplier',    icon: '🚢' },
    { label: 'Market',    href: '/market',      icon: '🏪' },
    { label: 'Yield',     href: '/yield',       icon: '🧮' },
    { label: 'Pay Bills', href: '/utilities',   icon: '⚡' },
    { label: 'Vehicles',  href: '/vehicles',    icon: '🚗' },
  ],
};

// 3 states: loading (unknown), unauthenticated, or a role string
type RoleState = 'loading' | 'unauthenticated' | string;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  const [roleState, setRoleState] = useState<RoleState>('loading');

  useEffect(() => {
    const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);

    async function resolveRoleAndGuard() {
      try {
        // Step 1 — get session
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          // No session — mark unauthenticated THEN guard
          setRoleState('unauthenticated');
          const blocked =
            STAFF_ONLY_PREFIXES.some(p => pathname.startsWith(p)) ||
            isStaffCustomerRoute(pathname);
          if (blocked) router.replace('/login');
          return;
        }

        // Step 2 — fetch profile BEFORE making any routing decision
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        // Step 3 — resolve role (default customer only after fetch completes)
        const role = (!profileErr && profile?.role) ? profile.role : 'customer';
        setRoleState(role);

        // Step 4 — guard staff routes from non-staff users
        if (!STAFF_ROLES.has(role)) {
          const blocked =
            STAFF_ONLY_PREFIXES.some(p => pathname.startsWith(p)) ||
            isStaffCustomerRoute(pathname);
          // Only redirect if actually on a blocked page
          if (blocked) router.replace('/market');
        }
      } catch {
        // On error default to unauthenticated — do not silently route
        setRoleState('unauthenticated');
      }
    }

    resolveRoleAndGuard();

    // Re-run when auth state changes (login / logout)
    const supabase2 = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);
    const { data: { subscription } } = supabase2.auth.onAuthStateChange(() => {
      setRoleState('loading'); // reset to loading before re-fetching
      resolveRoleAndGuard();
    });

    return () => subscription.unsubscribe();
  }, [pathname]); // re-run on every route change

  const hideNav =
    pathname === '/' ||
    NO_NAV_PREFIXES.some(prefix => pathname.startsWith(prefix));

  // While role is unknown, render children (content) but no nav
  // This prevents nav flash and avoids blocking page load
  const navItems =
    roleState !== 'loading' && roleState !== 'unauthenticated' && STAFF_NAV[roleState]
      ? STAFF_NAV[roleState]
      : CUSTOMER_NAV;

  return (
    <PageErrorBoundary>
      <div style={{ minHeight: '100vh', backgroundColor: '#060d1f', display: 'flex', flexDirection: 'column' }}>
        <main style={{ flex: 1, paddingBottom: (hideNav || roleState === 'loading') ? 0 : 80 }}>
          {children}
        </main>

        {/* Nav only renders once role is resolved and page is not full-screen */}
        {!hideNav && roleState !== 'loading' && (
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
            }}>
              {navItems.map(item => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <button
                    key={item.href}
                    onClick={() => router.push(item.href)}
                    style={{
                      flex: 1, minWidth: 44,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      gap: 3, padding: '7px 2px', borderRadius: 12,
                      background: isActive
                        ? 'linear-gradient(135deg, rgba(245,197,24,0.18), rgba(245,197,24,0.08))'
                        : 'transparent',
                      border: isActive ? '1px solid rgba(245,197,24,0.35)' : '1px solid transparent',
                      boxShadow: isActive ? '0 0 12px rgba(245,197,24,0.15)' : 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    <span style={{
                      fontSize: 8, letterSpacing: 0.5,
                      fontWeight: isActive ? 'bold' : '500',
                      color: isActive ? '#f5c518' : 'rgba(255,255,255,0.45)',
                      fontFamily: "'Inter', -apple-system, sans-serif",
                      whiteSpace: 'nowrap' as const,
                    }}>
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