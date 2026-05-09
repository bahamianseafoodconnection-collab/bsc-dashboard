// app/supplier-portal/page.tsx
//
// Authenticated supplier dashboard. Server-side gates to users with role
// 'supplier' or 'partner_us'. Resolves the suppliers row by portal_user_id
// and renders the client view with their personal data: products,
// invoices, payments, outstanding balance.
//
// Distinct from /supplier which is the public marketing + application
// flow.

import { redirect } from 'next/navigation';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import SupplierPortalClient from './client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['supplier', 'partner_us']);

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

const NAVY = '#060e1c';
const GOLD = '#c8860f';

export default async function SupplierPortalPage() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supa = createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet: CookieToSet[]) =>
        toSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        ),
    },
  });

  const { data: auth } = await supa.auth.getUser();
  if (!auth?.user) {
    redirect('/staff-login?next=/supplier-portal');
  }

  // Service role for the role + supplier resolution (bypasses RLS).
  if (!service) {
    return <Forbidden email={auth.user.email ?? ''} reason="server_misconfigured" />;
  }
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userRow } = await admin
    .from('users')
    .select('role, full_name, is_active')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!userRow || !userRow.is_active) {
    return <Forbidden email={auth.user.email ?? ''} reason="inactive" />;
  }
  if (!ALLOWED_ROLES.has(userRow.role as string)) {
    return <Forbidden email={auth.user.email ?? ''} reason={`role_${userRow.role}`} />;
  }

  // Resolve their suppliers row.
  const { data: supplier } = await admin
    .from('suppliers')
    .select('id, business_name, contact_name, phone, email, status, applied_at')
    .eq('portal_user_id', auth.user.id)
    .maybeSingle();

  if (!supplier) {
    return <Forbidden email={auth.user.email ?? ''} reason="no_supplier_record" />;
  }

  return (
    <SupplierPortalClient
      supplierId={supplier.id as string}
      supplierName={(supplier.business_name as string) || (supplier.contact_name as string) || 'Supplier'}
      supplierEmail={(supplier.email as string) ?? null}
      role={userRow.role as string}
      displayName={(userRow.full_name as string) ?? null}
    />
  );
}

function Forbidden({ email, reason }: { email: string; reason: string }) {
  const messages: Record<string, string> = {
    inactive: 'Your account is inactive. Contact Dedrick to reactivate.',
    no_supplier_record:
      'You are signed in, but no supplier record is linked to your account. Contact Dedrick to link your supplier profile.',
    server_misconfigured: 'Server is missing Supabase credentials.',
  };
  const msg =
    messages[reason] ||
    `Your role (${reason.replace('role_', '')}) does not have access to the supplier portal.`;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: NAVY,
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
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
        BSC · Supplier Portal
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '4px 0 12px' }}>🔒 Access denied</h1>
      <p style={{ fontSize: 14, color: '#d6dde8', maxWidth: 360, lineHeight: 1.5 }}>
        Signed in as <strong style={{ color: '#fff' }}>{email}</strong>. {msg}
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
