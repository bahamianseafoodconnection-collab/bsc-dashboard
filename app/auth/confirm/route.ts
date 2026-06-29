// /auth/confirm
//
// Server-side email-link verification (Supabase's recommended token_hash flow).
// Signup-confirmation + password-reset emails point here:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/auth/confirmed
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
//
// We exchange the token for a session (set in cookies) then redirect. This is
// far more robust than the implicit hash-fragment flow against email clients +
// security scanners, and works hand-in-hand with custom SMTP (Resend).
//
// Public route (the customer isn't signed in yet). The token IS the auth.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TYPES: EmailOtpType[] = ['signup', 'recovery', 'invite', 'magiclink', 'email', 'email_change'];

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const tokenHash = url.searchParams.get('token_hash') ?? '';
  const type = (url.searchParams.get('type') ?? '') as EmailOtpType;

  // Where to land after verification. Only same-site relative paths allowed.
  let next = url.searchParams.get('next') ?? '';
  if (!next.startsWith('/')) next = type === 'recovery' ? '/reset-password' : '/auth/confirmed';

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !anon) return NextResponse.redirect(new URL('/login?error=server', url.origin));

  if (!tokenHash || !VALID_TYPES.includes(type)) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', url.origin));
  }

  // Build the redirect first so the verified session cookies attach to it.
  const response = NextResponse.redirect(new URL(next, url.origin));
  const supabase = createServerClient(supaUrl, anon, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]));
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    // Expired / already-used / wrong token → send to login with a clear reason.
    return NextResponse.redirect(new URL(`/login?error=link_expired`, url.origin));
  }
  return response;
}
