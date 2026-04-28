'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const STAFF_ROLES = new Set([
'control_admin','basic_admin','manager','cashier','andros_staff','supplier'
]);

function getRouteForRole(role: string): string {
switch (role) {
case 'control_admin':
case 'basic_admin': return '/dashboard';
case 'manager': return '/ashley';
case 'cashier': return '/pos';
case 'andros_staff': return '/pos-andros';
case 'supplier': return '/supplier';
default: return '/market';
}
}

function StaffLoginForm() {
const router = useRouter();
const searchParams = useSearchParams();

const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [loading, setLoading] = useState(false);
const [checking, setChecking] = useState(true);
const [error, setError] = useState('');

const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);

useEffect(() => {
supabase.auth.getSession().then(async ({ data: { session } }) => {
if (session?.user) {
await redirectByRole(session.user.id);
} else {
setChecking(false);
}
}).catch(() => setChecking(false));
}, []);

async function redirectByRole(userId: string) {
let role = 'customer';

try {
const { data } = await supabase
.from('profiles')
.select('role')
.eq('id', userId)
.single();

if (data?.role) role = data.role;
} catch {}

// 🚨 CRITICAL FIX: STAFF ALWAYS → DASHBOARD
if (STAFF_ROLES.has(role)) {
router.replace(getRouteForRole(role));
return;
}

// NON-STAFF → MARKET
router.replace('/market');
}

async function handleLogin() {
setError('');
if (!email || !password) {
setError('Email and password required');
return;
}

setLoading(true);

try {
const { data, error } = await supabase.auth.signInWithPassword({
email,
password
});

if (error || !data?.user) {
setError('Invalid login');
setLoading(false);
return;
}

await redirectByRole(data.user.id);

} catch {
setError('Login failed');
setLoading(false);
}
}

if (checking) {
return (
<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#060d1f'}}>
<p style={{color:'#aaa'}}>Checking session...</p>
</div>
);
}

return (
<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#060d1f',color:'#fff'}}>
<div style={{width:320}}>
<h2 style={{color:'#f5c518'}}>STAFF LOGIN</h2>

{error && <p style={{color:'red'}}>{error}</p>}

<input
placeholder="Email"
value={email}
onChange={e=>setEmail(e.target.value)}
style={{width:'100%',marginBottom:10,padding:10}}
/>

<input
type="password"
placeholder="Password"
value={password}
onChange={e=>setPassword(e.target.value)}
style={{width:'100%',marginBottom:10,padding:10}}
/>

<button onClick={handleLogin} style={{width:'100%',padding:12,background:'#f5c518',border:'none'}}>
{loading ? 'Signing in...' : 'Sign In'}
</button>
</div>
</div>
);
}

export default function Page() {
return (
<Suspense fallback={<div>Loading...</div>}>
<StaffLoginForm />
</Suspense>
);
}
