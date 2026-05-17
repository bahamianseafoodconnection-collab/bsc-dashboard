// app/processor/page.tsx
// Server-side auth gate for the processor workspace.
// Requires a signed-in staff user whose role is processor (or founder/co_founder/manager
// for oversight). Pulls the user's role + name + location so the client UI can greet
// them and show their facility's recent activity.

import { redirect } from 'next/navigation';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ProcessorClient from './processor-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set([
  'processor',
  'founder',
  'co_founder',
  'control_admin',
  'manager',
  'right_hand',
  'supervisor',
]);

const NAVY = '#060e1c';
const GOLD = '#c8860f';

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

export default async function ProcessorPage() {
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

  const { data: auth } = await supa.auth.getUser();
  if (!auth?.user) {
    redirect('/staff-login?next=/processor');
  }

  // Pull role from profiles (canonical source). Best-effort name + location
  // from the users table — those columns may not exist on every install.
  let role: string | null = null;
  let displayName: string | null = null;
  let location: string | null = null;

  const { data: prof } = await supa
    .from('profiles')
    .select('role, full_name')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (prof) {
    role = (prof.role as string | null) ?? null;
    displayName = (prof.full_name as string | null) ?? null;
  }
  // Optional location lookup; ignore failures silently.
  try {
    const { data } = await supa.from('users').select('primary_location').eq('id', auth.user.id).maybeSingle();
    if (data) location = (data as { primary_location?: string | null }).primary_location ?? null;
  } catch { /* schema variance — non-fatal */ }

  if (!role || !ALLOWED_ROLES.has(role)) {
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
          🔒 Processor Access Only
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: '#d6dde8', maxWidth: 360 }}>
          You are signed in as <strong style={{ color: '#fff' }}>{auth.user.email}</strong>,
          but your role does not have access to the processor workspace.
        </p>
        <p style={{ fontSize: 13, marginTop: 14, color: '#999', maxWidth: 360 }}>
          Contact Dedrick or Jaquel if your role assignment is wrong.
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

  return (
    <ProcessorClient
      userId={auth.user.id}
      email={auth.user.email ?? ''}
      displayName={displayName}
      role={role}
      location={location}
    />
  );
}
