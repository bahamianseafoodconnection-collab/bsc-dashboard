// app/inventory/scan/page.tsx
// BSC Day 6 (Path A) — server-side auth gate for the scanner.

import { redirect } from 'next/navigation';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ScannerClient from './scanner-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

const NAVY = '#060e1c';
const GOLD = '#c8860f';

export default async function ScanPage() {
  const cookieStore = await cookies();
  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: CookieToSet[]) =>
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );

  // Step 1 — must be signed in
  const { data: auth } = await supa.auth.getUser();
  if (!auth?.user) {
    redirect('/staff-login?next=/inventory/scan');
  }

  // Step 2 — must be staff
  const { data: isStaffData, error: isStaffErr } = await supa.rpc('is_staff');
  if (isStaffErr) {
    console.error('is_staff RPC error:', isStaffErr);
  }
  const isStaff = Boolean(isStaffData);

  if (!isStaff) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: NAVY,
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, "DM Sans", sans-serif',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 3,
            color: GOLD,
            fontWeight: 700,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          BSC · Restricted Area
        </div>
        <h1
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 26,
            fontWeight: 700,
            margin: '4px 0 12px',
          }}
        >
          🔒 Staff Access Only
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: '#d6dde8', maxWidth: 360 }}>
          This area is for BSC staff. You are signed in as{' '}
          <strong style={{ color: '#fff' }}>{auth.user.email}</strong>, but your account does not
          have staff access to inventory scanning.
        </p>
        <p style={{ fontSize: 13, marginTop: 14, color: '#999', maxWidth: 360 }}>
          If you should have access, contact Dedrick or Jaquel to confirm your role assignment.
        </p>
        <a
          href="/dashboard"
          style={{
            marginTop: 22,
            padding: '12px 22px',
            background: GOLD,
            color: NAVY,
            border: 'none',
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 1,
            textDecoration: 'none',
          }}
        >
          ← BACK TO DASHBOARD
        </a>
      </div>
    );
  }

  return <ScannerClient />;
}
