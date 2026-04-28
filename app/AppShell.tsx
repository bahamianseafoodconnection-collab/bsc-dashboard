'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { PageErrorBoundary } from './ErrorBoundary';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const STAFF_ROLES = new Set([
  'cashier','manager','basic_admin','control_admin','andros_staff','supplier',
]);

const CUSTOMER_NAV = [
  { label: 'Home', href: '/', icon: '🏠' },
  { label: 'Shop', href: '/market', icon: '🛒' },
  { label: 'Pay Bills', href: '/utilities', icon: '⚡' },
  { label: 'Vehicles', href: '/vehicles', icon: '🚗' },
  { label: 'Account', href: '/customers/dashboard', icon: '👤' },
];

const STAFF_NAV: Record<string, any[]> = {
  control_admin: [
    { label: 'Dashboard', href: '/dashboard', icon: '📊' },
    { label: 'POS', href: '/pos', icon: '🛒' },
  ],
  basic_admin: [
    { label: 'Dashboard', href: '/dashboard', icon: '📊' },
  ],
  manager: [
    { label: 'Dashboard', href: '/ashley', icon: '📊' },
  ],
  cashier: [
    { label: 'POS', href: '/pos', icon: '🛒' },
  ],
};

type RoleState = 'loading' | 'unauthenticated' | string;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [roleState, setRoleState] = useState<RoleState>('loading');

  useEffect(() => {
    const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);

    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        setRoleState('unauthenticated');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      const role = profile?.role || 'customer';
      setRoleState(role);

      // 🔥 FORCE STAFF TO THEIR DASHBOARD
      if (STAFF_ROLES.has(role)) {
        const correctRoute =
          role === 'manager' ? '/ashley' :
          role === 'cashier' ? '/pos' :
          role === 'andros_staff' ? '/pos-andros' :
          role === 'supplier' ? '/supplier' :
          '/dashboard';

        if (!pathname.startsWith(correctRoute)) {
          console.log('[AppShell FIX] Redirecting to:', correctRoute);
          router.replace(correctRoute);
        }
      }
    }

    checkUser();
  }, [pathname]);

  const navItems =
    roleState !== 'loading' && STAFF_NAV[roleState]
      ? STAFF_NAV[roleState]
      : CUSTOMER_NAV;

  return (
    <PageErrorBoundary>
      <div style={{ minHeight: '100vh', backgroundColor: '#060d1f' }}>
        <main>{children}</main>
      </div>
    </PageErrorBoundary>
  );
}