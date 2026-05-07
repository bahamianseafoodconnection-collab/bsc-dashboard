import { redirect } from 'next/navigation';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import PosShell from './pos-shell';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CookieToSet {
name: string;
value: string;
options?: CookieOptions;
}

const ALLOWED_ROLES = ['founder', 'co_founder', 'manager', 'cashier', 'right_hand', 'supervisor', 'processor'];

export default async function PosLayout({ children }: { children: React.ReactNode }) {
const cookieStore = await cookies();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
redirect('/staff-login?next=/pos');
}

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
redirect('/staff-login?next=/pos');
}

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

if (error || !row || !row.is_active || !ALLOWED_ROLES.includes(row.role)) {
redirect('/staff-login?error=role&next=/pos');
}

return (
<PosShell
userId={row.id}
userEmail={row.email}
userRole={row.role}
primaryLocation={row.primary_location}
>
{children}
</PosShell>
);
}
