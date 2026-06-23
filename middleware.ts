import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/staff-login',
  '/staff/activate',
  '/market',
  '/product/',
  '/track/',
  '/partner/',
  '/my-orders',
  '/receipt/',
  '/utilities',
  '/legal',
  '/onboarding',
  '/api/',
  '/_next',
  '/favicon',
  '/local-wholesale',
  '/us-shopping',
  '/help',
  '/shipping',
  '/returns',
  '/contact',
  '/sitemap',
  '/robots',
];

const ROLE_ROUTES: Record<string, string[]> = {
  control_admin: ['*'],
  founder:       ['*'],
  co_founder:    ['*'],
  manager:       ['/ashley', '/cashier', '/supplier-handler', '/credit', '/pos', '/orders', '/pickup-queue', '/pulse', '/wholesale-orders', '/inventory', '/supplier', '/purchase-orders', '/supplier-purchases', '/yield', '/labels', '/captains', '/accounts-payable', '/customers', '/reports', '/notifications', '/products', '/wholesale-products', '/landed-cost', '/lobster-intake', '/yield-measure', '/lobster-labels', '/igloo', '/promos', '/reviews-admin', '/partner-tokens', '/dashboard-guide'],
  cashier:       ['/cashier', '/pos', '/pos-andros', '/orders', '/pickup-queue', '/documents', '/purchase-orders', '/credit'],
  // Internal staff who manage suppliers/catalogue (NOT the external supplier
  // portal). Add the role to a profile and they land on /supplier-handler.
  supplier_handler: ['/supplier-handler', '/supplier', '/products', '/documents', '/purchase-orders'],
  andros_staff:  ['/pos-andros'],
  right_hand:    ['/ashley', '/supplier-handler', '/credit', '/pos', '/pos-andros', '/orders', '/pickup-queue', '/inventory', '/supplier', '/purchase-orders', '/yield', '/labels', '/wholesale-orders', '/products'],
  strategist:    ['/ashley', '/reports', '/accounts-payable', '/founder-ai'],
  processor:     ['/processor', '/spinytails', '/labels', '/lobster-intake'],
  // 'operations' = TJ-style fulfillment role. Spiny Tail processing,
  // inventory movement, freezer, delivery picking, label printing.
  // Explicitly NO customers / pricing / costs / founder-chat / reports
  // (per memory project_operations_role_spec — keeps PII + money in
  // founder/admin hands while letting ops run the warehouse).
  operations:    ['/processor', '/spinytails', '/inventory', '/pickup-queue',
                  '/labels', '/lobster-labels', '/yield', '/yield-measure',
                  '/lobster-intake', '/igloo', '/orders'],
  supplier:      ['/supplier-portal'],
  partner_us:    ['/supplier-portal'],
};

function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route));
}

function roleCanAccess(role: string, pathname: string): boolean {
  const allowed = ROLE_ROUTES[role];
  if (!allowed) return false;
  if (allowed.includes('*')) return true;
  return allowed.some(route => pathname === route || pathname.startsWith(route));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
          });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const loginUrl = new URL('/staff-login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check profiles table first, then fall back to users table
  let role: string | null = null;

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  role = profileRow?.role as string | null;

  if (!role) {
    const { data: userRow } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single();
    role = userRow?.role as string | null;
  }

  if (!role) {
    return NextResponse.redirect(new URL('/staff-login', request.url));
  }

  if (!roleCanAccess(role, pathname)) {
    const homeMap: Record<string, string> = {
      manager:      '/ashley',
      right_hand:   '/ashley',
      strategist:   '/ashley',
      cashier:      '/cashier',
      supplier_handler: '/supplier-handler',
      andros_staff: '/pos-andros',
      processor:    '/spinytails',
      operations:   '/processor',
      supplier:     '/supplier-portal',
      partner_us:   '/supplier-portal',
    };
    const home = homeMap[role] || '/staff-login';
    return NextResponse.redirect(new URL(home, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico).*)'],
};
