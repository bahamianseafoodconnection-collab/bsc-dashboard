import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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
  '/expenses',
  '/accounts-payable',
  '/captains',
  '/labels',
  '/reports',
  '/payroll',
  '/fleet',
  '/supplier-portal',
  '/notifications',
  '/supplier-purchases',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/staff-login') ||
    pathname.startsWith('/staff/activate') ||
    pathname.startsWith('/market') ||
    pathname.startsWith('/product/') ||
    pathname.startsWith('/track/') ||
    pathname.startsWith('/my-orders') ||
    pathname.startsWith('/receipt/') ||
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
    const loginUrl = new URL('/staff-login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
