import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes requiring ANY signed-in user (staff or customer-with-account).
// Customer-only routes like /market are NOT in here (public browsing allowed).
const PROTECTED = [
  '/dashboard',
  '/pos',
  '/pos-andros',
  '/orders',
  '/inventory',
  '/purchase-orders',
  '/report',
  '/yield',
  '/supplier',
  '/vehicles',
  '/ashley',
  '/jaquel',
  '/cash',
  '/bills',
  '/customers',
  '/staff',
  '/processor',
];

// Routes requiring elevated staff (founder, co_founder, manager, supervisor,
// strategist, right_hand). Cashiers/processors do NOT see these.
const ADMIN_ONLY = [
  '/dashboard',
  '/purchase-orders',
  '/report',
  '/cash',
  '/staff',
];

// BSC user_role enum values that count as "admin-tier" for ADMIN_ONLY routes.
const ADMIN_ROLES = new Set([
  'founder',
  'co_founder',
  'manager',
  'supervisor',
  'strategist',
  'right_hand',
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public + auth pages — never gate.
  if (
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/staff-login') ||
    pathname.startsWith('/market') ||
    pathname.startsWith('/utilities') ||
    pathname.startsWith('/legal') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const needsAuth = PROTECTED.some(route => pathname.startsWith(route));
  if (!needsAuth) return NextResponse.next();

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
    // Send to staff sign-in for protected routes (staff door, not customer door).
    const loginUrl = new URL('/staff-login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const needsAdmin = ADMIN_ONLY.some(route => pathname.startsWith(route));
  if (needsAdmin) {
    // Use the get_my_role RPC (SECURITY DEFINER → bypasses RLS).
    // Returns the BSC user_role for the authed user, or null for non-staff.
    const { data: roleData } = await supabase.rpc('get_my_role');
    const role = (roleData as string | null) || '';

    if (!ADMIN_ROLES.has(role)) {
      return NextResponse.redirect(new URL('/staff-login', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
