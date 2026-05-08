'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

type UserRecord = {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  primary_location: string;
};

const ALLOWED_ROLES = ['founder', 'co_founder', 'manager', 'cashier', 'right_hand', 'supervisor', 'processor'];

const NAV_ITEMS = [
  { href: '/pos',                  icon: '$',  label: 'Register',         section: 'Sell' },
  { href: '/pos/scan',             icon: 'C',  label: 'Scanner',          section: 'Sell' },
  { href: '/pos/inventory',        icon: 'B',  label: 'Inventory',        section: 'Stock' },
  { href: '/pos/purchase-orders',  icon: 'P',  label: 'Purchase Orders',  section: 'Stock' },
  { href: '/pos/customers',        icon: 'U',  label: 'Customers',        section: 'Customers' },
  { href: '/pos/sales-history',    icon: 'H',  label: 'Sales History',    section: 'Reports' },
  { href: '/pos/reports',          icon: 'R',  label: 'Reports',          section: 'Reports' },
  { href: '/pos/expenses',         icon: 'E',  label: 'Expenses',         section: 'Money' },
];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured.');
  return createBrowserClient(url, key);
}

export default function PosShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [user, setUser] = useState<UserRecord | null>(null);

  // ----------------------------------------------------------
  // CLIENT-SIDE AUTH (proven retry pattern)
  // ----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();

    async function checkAuth() {
      try {
        let { data: { session } } = await supabase.auth.getSession();
        let attempts = 0;
        while (!session && attempts < 4) {
          await new Promise((r) => setTimeout(r, 350));
          if (cancelled) return;
          const result = await supabase.auth.getSession();
          session = result.data.session;
          attempts++;
        }

        if (!session?.user) {
          if (!cancelled) router.replace('/staff-login?next=/pos');
          return;
        }

        const { data: row, error: roleErr } = await supabase
          .rpc('get_my_user_record')
          .single<UserRecord>();

        if (cancelled) return;

        if (roleErr || !row) {
          setAuthError('Could not look up your account. Please contact Dedrick.');
          setAuthChecking(false);
          return;
        }
        if (!row.is_active) {
          setAuthError('Your account is inactive. Please contact Dedrick.');
          setAuthChecking(false);
          return;
        }
        if (!ALLOWED_ROLES.includes(row.role)) {
          setAuthError(`Your role (${row.role}) does not have POS access.`);
          setAuthChecking(false);
          return;
        }

        setUser(row);
        setAuthChecking(false);
      } catch (e) {
        if (!cancelled) {
          setAuthError(e instanceof Error ? e.message : 'Authentication failed');
          setAuthChecking(false);
        }
      }
    }

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && !cancelled) {
        router.replace('/staff-login?next=/pos');
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router]);

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    router.replace('/staff-login');
  }

  const isActive = (href: string) => {
    if (href === '/pos') return pathname === '/pos';
    return pathname.startsWith(href);
  };

  // ----------------------------------------------------------
  // LOADING / ERROR STATES
  // ----------------------------------------------------------
  if (authChecking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f6f9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#1a2e5a' }}>
          <div style={{ fontWeight: 700 }}>Verifying access...</div>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f6f9', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 24 }}>
        <div style={{ textAlign: 'center', color: '#1a2e5a', maxWidth: 400 }}>
          <div style={{ fontWeight: 800, marginBottom: 12 }}>Access Issue</div>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>{authError}</div>
          <Link href="/dashboard" style={{ color: '#f4c842', backgroundColor: '#1a2e5a', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // redirecting
  }

  // ----------------------------------------------------------
  // SHELL
  // ----------------------------------------------------------
  const sections: Record<string, typeof NAV_ITEMS> = {};
  NAV_ITEMS.forEach((item) => {
    if (!sections[item.section]) sections[item.section] = [];
    sections[item.section].push(item);
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f4f6f9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* MOBILE TOPBAR - lives ABOVE the flex row, full width on mobile */}
      <div
        className="bsc-mobile-topbar"
        style={{ display: 'none' }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 26, cursor: 'pointer', padding: 8, lineHeight: 1 }}
        >
          &#9776;
        </button>
        <Link
          href="/dashboard"
          style={{ color: '#f4c842', fontWeight: 900, fontSize: 15, textDecoration: 'none', letterSpacing: 0.5 }}
        >
          BSC POS
        </Link>
        <Link
          href="/pos/scan"
          aria-label="Scanner"
          style={{ color: '#f4c842', textDecoration: 'none', fontSize: 13, fontWeight: 700, padding: '6px 10px', border: '1px solid #f4c842', borderRadius: 6 }}
        >
          Scan
        </Link>
      </div>

      {/* CONTENT ROW: sidebar + main */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* SIDEBAR */}
        <aside
          className={mobileOpen ? 'bsc-sidebar bsc-sidebar-open' : 'bsc-sidebar'}
          style={{ width: 240, backgroundColor: '#1a2e5a', color: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0 }}
        >
          <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Link href="/dashboard" style={{ textDecoration: 'none' }}>
                <div style={{ color: '#f4c842', fontWeight: 900, fontSize: 16, letterSpacing: 0.5 }}>BSC POS</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 2 }}>
                  {user.primary_location === 'all_locations' ? 'All Locations' : user.primary_location || 'Nassau'}
                </div>
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="bsc-mobile-close"
                style={{ display: 'none', background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}
              >
                &times;
              </button>
            </div>
          </div>

          <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
            {Object.entries(sections).map(([section, items]) => (
              <div key={section} style={{ marginBottom: 16 }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, padding: '8px 18px 6px', textTransform: 'uppercase' }}>
                  {section}
                </div>
                {items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 18px',
                        color: active ? '#f4c842' : 'rgba(255,255,255,0.85)',
                        backgroundColor: active ? 'rgba(244,200,66,0.1)' : 'transparent',
                        textDecoration: 'none', fontSize: 13, fontWeight: active ? 800 : 500,
                        borderLeft: active ? '3px solid #f4c842' : '3px solid transparent',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 800, width: 18, textAlign: 'center', opacity: 0.7 }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 2, wordBreak: 'break-all' }}>{user.email}</div>
            <div style={{ fontSize: 10, color: '#f4c842', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>{user.role}</div>
            <button onClick={handleSignOut} style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Sign out
            </button>
          </div>
        </aside>

        {/* MOBILE OVERLAY (sibling of sidebar, taps to close) */}
        {mobileOpen && (
          <div
            onClick={() => setMobileOpen(false)}
            className="bsc-mobile-overlay"
            style={{ display: 'none' }}
          />
        )}

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, overflowX: 'hidden', minWidth: 0 }}>
          {children}
        </main>
      </div>

      <style jsx global>{`
        @media (max-width: 768px) {
          .bsc-mobile-topbar {
            display: flex !important;
            align-items: center;
            justify-content: space-between;
            background-color: #1a2e5a;
            padding: 0 14px;
            height: 52px;
            position: sticky;
            top: 0;
            z-index: 30;
          }
          .bsc-sidebar {
            position: fixed !important;
            top: 0;
            left: 0;
            bottom: 0;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            z-index: 60;
            box-shadow: 4px 0 20px rgba(0,0,0,0.3);
          }
          .bsc-sidebar-open {
            transform: translateX(0) !important;
          }
          .bsc-mobile-close {
            display: block !important;
          }
          .bsc-mobile-overlay {
            display: block !important;
            position: fixed;
            inset: 0;
            background-color: rgba(0,0,0,0.5);
            z-index: 50;
          }
        }
      `}</style>
    </div>
  );
}
