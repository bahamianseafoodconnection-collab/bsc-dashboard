'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { PageErrorBoundary } from './ErrorBoundary';
import { t, type Lang } from '@/lib/i18n';
import { isStaffSessionExpired, staffSessionBypassesFor, clearSignIn } from '@/lib/staff-session';

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

// Nav entries use translation keys (`nav.*`). AppShell render passes the
// current language and t() resolves them to the right phrase.
const STAFF_NAV: Record<string, { label: string; href: string; icon: string }[]> = {
  founder: [
    { label: 'nav.control',  href: '/dashboard', icon: '📊' },
    { label: 'nav.pos',      href: '/pos',       icon: '🛒' },
    { label: 'nav.market',   href: '/market',    icon: '🏪' },
    { label: 'nav.vehicles', href: '/vehicles',  icon: '🚗' },
    { label: 'nav.payBills', href: '/utilities', icon: '⚡' },
  ],
  co_founder: [
    { label: 'nav.control',  href: '/dashboard', icon: '📊' },
    { label: 'nav.pos',      href: '/pos',       icon: '🛒' },
    { label: 'nav.market',   href: '/market',    icon: '🏪' },
    { label: 'nav.vehicles', href: '/vehicles',  icon: '🚗' },
    { label: 'nav.payBills', href: '/utilities', icon: '⚡' },
  ],
  control_admin: [
    { label: 'nav.control',  href: '/dashboard', icon: '📊' },
    { label: 'nav.pos',      href: '/pos',       icon: '🛒' },
    { label: 'nav.market',   href: '/market',    icon: '🏪' },
    { label: 'nav.vehicles', href: '/vehicles',  icon: '🚗' },
    { label: 'nav.payBills', href: '/utilities', icon: '⚡' },
  ],
  basic_admin: [
    { label: 'nav.dashboard',href: '/jaquel',    icon: '📊' },
    { label: 'nav.pos',      href: '/pos',       icon: '🛒' },
    { label: 'nav.market',   href: '/market',    icon: '🏪' },
    { label: 'nav.vehicles', href: '/vehicles',  icon: '🚗' },
    { label: 'nav.payBills', href: '/utilities', icon: '⚡' },
  ],
  manager: [
    { label: 'nav.dashboard',href: '/jaquel',    icon: '📊' },
    { label: 'nav.pos',      href: '/pos',       icon: '🛒' },
    { label: 'nav.orders',   href: '/orders',    icon: '📦' },
    { label: 'nav.market',   href: '/market',    icon: '🏪' },
    { label: 'nav.payBills', href: '/utilities', icon: '⚡' },
  ],
  cashier: [
    { label: 'nav.pos',       href: '/pos',                 icon: '🛒' },
    { label: 'nav.intake',    href: '/intake/scan-invoice', icon: '📥' },
    { label: 'nav.inventory', href: '/inventory',           icon: '📊' },
    { label: 'nav.yield',     href: '/yield',               icon: '🧮' },
    { label: 'nav.payBills',  href: '/utilities',           icon: '⚡' },
  ],
  receiver: [
    { label: 'nav.intake',    href: '/intake/scan-invoice', icon: '📥' },
    { label: 'nav.inventory', href: '/inventory',           icon: '📊' },
    { label: 'nav.yield',     href: '/yield',               icon: '🧮' },
    { label: 'nav.market',    href: '/market',              icon: '🏪' },
    { label: 'nav.payBills',  href: '/utilities',           icon: '⚡' },
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
  const [lang, setLang] = useState<Lang>('en');

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
          .select('role, must_change_password, language')
          .eq('id', session.user.id)
          .single();

        const role = profile?.role || 'customer';
        setRoleState(role);
        setLang(((profile?.language as Lang | undefined) ?? 'en'));

        // Force-password-change takes priority over every other guard.
        // If the user is flagged, they're locked to /change-password
        // until they reset (the page itself clears the flag on success).
        if (profile?.must_change_password && pathname !== '/change-password') {
          router.replace('/change-password');
          return;
        }

        // 10-hour staff session cap. Founder + co_founder are always-on
        // (bypass via staffSessionBypassesFor). Customers + anyone
        // without a recorded signin timestamp (pre-deploy sessions OR
        // /login customer flow) pass through. Cashiers / managers /
        // andros_staff / supplier / processor / etc. get force-signout
        // when their staff-login signin is > 10h old.
        if (!staffSessionBypassesFor(role) && isStaffSessionExpired()) {
          clearSignIn();
          await supabase.auth.signOut();
          const nextParam = pathname && pathname !== '/staff-login' ? `?next=${encodeURIComponent(pathname)}` : '';
          router.replace(`/staff-login${nextParam}`);
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

  // Periodic 60s check — enforces the 10h staff session cap even when
  // the user stays on a single page (the pathname-change useEffect
  // above only runs on navigation). Founder + co_founder bypass.
  // No-ops cleanly when role is still loading, unauthenticated, or
  // when there's no recorded signin (customer login flow / pre-deploy
  // sessions). See lib/staff-session.ts for the cap logic.
  useEffect(() => {
    if (roleState === 'loading' || roleState === 'unauthenticated') return;
    if (staffSessionBypassesFor(roleState)) return;
    const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);
    const tick = async () => {
      if (isStaffSessionExpired()) {
        clearSignIn();
        await supabase.auth.signOut();
        const nextParam = pathname && pathname !== '/staff-login' ? `?next=${encodeURIComponent(pathname)}` : '';
        router.replace(`/staff-login${nextParam}`);
      }
    };
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [roleState, pathname, router]);

  const hideNav =
    pathname === '/' ||
    NO_NAV_PREFIXES.some(prefix => pathname.startsWith(prefix));

  // Consistent "back to dashboard" control on every admin + founder
  // screen (and dashboard sub-pages). These routes have no bottom nav,
  // so this is the reliable way back to the control center. Hidden on
  // the dashboard home itself.
  const showBackToDashboard =
    pathname !== '/dashboard' && (
      pathname.startsWith('/admin') ||
      pathname.startsWith('/founder-ai') ||
      pathname.startsWith('/dashboard/')
    );

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

        {showBackToDashboard && (
          <button
            onClick={() => router.push('/dashboard')}
            aria-label="Back to dashboard"
            style={{
              position: 'fixed',
              left: 'calc(12px + env(safe-area-inset-left))',
              bottom: 'calc(16px + env(safe-area-inset-bottom))',
              zIndex: 60,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              borderRadius: 9999,
              background: '#1a2e5a',
              color: '#f5c518',
              border: '1px solid rgba(245,197,24,0.35)',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
              WebkitBackdropFilter: 'blur(6px)',
              backdropFilter: 'blur(6px)',
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>←</span>
            Dashboard
          </button>
        )}

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
                // Staff labels are translation keys (nav.*); customer labels
                // are plain English strings — t() falls back to the key if
                // the entry isn't in i18n, so both render fine.
                const label = item.label.startsWith('nav.') ? t(item.label, lang) : item.label;
                return (
                  <button key={item.href} onClick={() => router.push(item.href)}
                    aria-label={label}
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
                      {label}
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
