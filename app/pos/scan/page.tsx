import { redirect } from 'next/navigation';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import ScannerClient from './scanner-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CookieToSet {
name: string;
value: string;
options?: CookieOptions;
}

const ALLOWED_ROLES = ['founder', 'co_founder', 'manager', 'cashier', 'right_hand', 'supervisor', 'processor'];

export default async function ScanPage() {
const cookieStore = await cookies();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
redirect('/staff-login?next=/pos/scan');
}

// 1. Get session via SSR cookies
const ssr = createServerClient(url, anon, {
cookies: {
getAll: () => cookieStore.getAll(),
setAll: (toSet: CookieToSet[]) =>
toSet.forEach(({ name, value, options }) =>
cookieStore.set(name, value, options)
),
},
});

const { data: { user } } = await ssr.auth.getUser();
if (!user) {
redirect('/staff-login?next=/pos/scan');
}

// 2. Look up role using service client (bypasses RLS recursion completely)
if (!service) {
return (
<div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', color: '#1a2e5a' }}>
<h1>⚠️ Configuration Error</h1>
<p>SUPABASE_SERVICE_ROLE_KEY is not set in Vercel environment variables.</p>
</div>
);
}

const admin = createClient(url, service, {
auth: { autoRefreshToken: false, persistSession: false },
});

const { data: row, error } = await admin
.from('users')
.select('id, email, role, is_active, primary_location')
.eq('id', user.id)
.single();

if (error || !row) {
return (
<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
<div style={{ textAlign: 'center', color: '#1a2e5a', maxWidth: 400 }}>
<div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
<div style={{ fontWeight: 800, marginBottom: 12 }}>Account Not Found</div>
<div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
Your staff record could not be loaded. Please contact Dedrick.
</div>
<a href="/dashboard" style={{ color: '#f4c842', backgroundColor: '#1a2e5a', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>
← Back to Dashboard
</a>
</div>
</div>
);
}

if (!row.is_active) {
return (
<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
<div style={{ textAlign: 'center', color: '#1a2e5a', maxWidth: 400 }}>
<div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
<div style={{ fontWeight: 800, marginBottom: 12 }}>Account Inactive</div>
<a href="/dashboard" style={{ color: '#f4c842', backgroundColor: '#1a2e5a', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, marginTop: 12, display: 'inline-block' }}>
← Back to Dashboard
</a>
</div>
</div>
);
}

if (!ALLOWED_ROLES.includes(row.role)) {
return (
<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
<div style={{ textAlign: 'center', color: '#1a2e5a', maxWidth: 400 }}>
<div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
<div style={{ fontWeight: 800, marginBottom: 12 }}>Scanner Not Available</div>
<div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
Your role ({row.role}) does not have scanner access.
</div>
<a href="/dashboard" style={{ color: '#f4c842', backgroundColor: '#1a2e5a', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>
← Back to Dashboard
</a>
</div>
</div>
);
}

return (
<ScannerClient
userId={row.id}
userEmail={row.email}
userRole={row.role}
/>
);
}
