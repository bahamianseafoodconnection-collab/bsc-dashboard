'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { PageErrorBoundary } from './ErrorBoundary';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const STAFF_ROLES = new Set([
  'cashier','manager','basic_admin','control_admin','andros_staff','supplier'
]);

const STAFF_ONLY_PREFIXES = [
  '/pos','/dashboard','/report','/inventory','/ashley','/jaquel',
  '/yield','/staff','/cash','/purchase-orders','/orders'
];

function isStaffCustomerRoute(pathname: string): boolean {
  return (
    pathname === '/customers' ||
    (pathname.startsWith('/customers/') && !pathname.startsWith('/customers/dashboard'))
  );
}

const NO_NAV_PREFIXES = [
  '/login','/staff-login','/reset-password','/legal','/supplier',
  '/purchase-orders','/pos-andros','/pos','/dashboard','/ashley',
  '/jaquel','/report','/yield','/inventory','/staff','/cash',
  '/customers/dashboard'
];

const CUSTOMER_NAV = [
  { label: 'Home', href: '/', icon: '🏠' },
  { label: 'Shop', href: '/market', icon: '🛒' },
  { label: 'Pay Bills', href: '/utilities', icon: '⚡' },
  { label: 'Vehicles', href: '/vehicles', icon: '🚗' },
  { label: 'Account', href: '/customers/dashboard', icon: '👤' },
];

const STAFF_NAV: Record<string, { label: string; href: string; icon: string }[]> = {
  control_admin: [
    { label: 'Control', href: '/dashboard', icon: '📊' },
    { label: 'POS', href: '/pos', icon: '🛒' },
    { label: 'Market', href: '/market', icon: '🏪' },
    { label: 'Vehicles', href: '/vehicles', icon: '🚗' },
    { label: 'Pay Bills', href: '/utilities', icon: '⚡' },
  ],
  basic_admin: [
    { label: 'Dashboard', href: '/jaquel', icon: '📊' },
    { label: 'POS', href: '/pos', icon: '🛒' },
    { label: 'Market', href: '/market', icon: '🏪' },
    { label: 'Vehicles', href: '/vehicles', icon: '🚗' },
    { label: 'Pay Bills', href: '/utilities', icon: '⚡' },
  ],
  manager: [
    { label: 'Dashboard', href: '/ashley', icon: '📊' },
    { label: 'POS', href: '/pos', icon: '🛒' },
    { label: 'Orders', href: '/orders', icon: '📦' },
    { label: 'Market', href: '/market', icon: '🏪' },
    { label: 'Pay Bills', href: '/utilities', icon: '⚡' },
  ],
  cashier: [
    { label: 'POS', href: '/pos', icon: '🛒' },
    { label: 'Market', href: '/market', icon: '🏪' },
    { label: 'Vehicles', href: '/vehicles', icon: '🚗' },
    { label: 'Pay Bills', href: '/utilities', icon: '⚡' },
    { label: 'Orders', href: '/orders', icon: '📦' },
  ],
  andros_staff: [
    { label: 'Andros POS', href: '/pos-andros', icon: '🛒' },
    { label: 'Market', href: '/market', icon: '🏪' },
    { label: 'Pay Bills', href: '/utilities', icon: '⚡' },
    { label: 'Orders', href: '/orders', icon: '📦' },
    { label: 'Yield', href: '/yield', icon: '🧮' },
  ],
  supplier: [
    { label: 'Supplier', href: '/supplier', icon: '🚢' },
    { label: 'Market', href: '/market', icon: '🏪' },
    { label: 'Yield', href: '/yield', icon: '🧮' },
    { label: 'Pay Bills', href: '/utilities', icon: '⚡' },
    { label: 'Vehicles', href: '/vehicles', icon: '🚗' },
  ],
};

type RoleState = 'loading' | 'unauthenticated' | string;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
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
          .select('role')
          .eq('id', session.user.id)
          .single();

        const role = profile?.role || 'customer';
        setRoleState(role);

        // Customer protection — keep customers out of staff-only routes
        if (!STAFF_ROLES.has(role)) {
          const blocked =
            STAFF_ONLY_PREFIXES.some(p => pathname.startsWith(p)) ||
            isStaffCustomerRoute(pathname);

          if (blocked) {
            router.replace('/market');
            return;
          }
        }

        // Staff are authenticated and authorized — let them navigate freely.
        // Login pages handle initial landing; AppShell only protects boundaries.

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
        <main style={{ flex: 1, paddingBottom: (hideNav || roleState === 'loading') ? 0 : 80 }}>
          {children}
        </main>

        {!hideNav && roleState !== 'loading' && (
          <nav style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#070e1d',
            borderTop: '1px solid rgba(245,197,24,0.15)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              {navItems.map(item => (
                <button key={item.href} onClick={() => router.push(item.href)}>
                  {item.icon}
                  <div>{item.label}</div>
                </button>
              ))}
            </div>
          </nav>
        )}
      </div>
    </PageErrorBoundary>
  );
}
