'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const STAFF_ROLES = new Set([
  'control_admin',
  'basic_admin',
  'manager',
  'cashier',
  'andros_staff',
  'supplier'
]);

function getStaffRoute(role: string): string {
  switch (role) {
    case 'control_admin':
    case 'basic_admin':  return '/dashboard';
    case 'manager':      return '/ashley';
    case 'cashier':      return '/pos';
    case 'andros_staff': return '/pos-andros';
    case 'supplier':     return '/supplier';
    default:             return '/market';
  }
}

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError]       = useState('');

  const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);

  useEffect(() => {
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user) {
          await handlePostLogin(session.user.id);
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, []);

  async function handlePostLogin(userId: string) {
    let role = 'customer';

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (profile?.role) role = profile.role;
    } catch {}

    console.log('[LOGIN] ROLE:', role);

    // 🔥 STAFF → DASHBOARD
    if (STAFF_ROLES.has(role)) {
      router.replace(getStaffRoute(role));
      return;
    }

    // 👇 CUSTOMER FLOW
    const redirectParam = searchParams.get('redirect');
    if (redirectParam && redirectParam.startsWith('/')) {
      router.replace(redirectParam);
      return;
    }

    router.replace('/market');
  }

  async function handleLogin() {
    setError('');

    if (!email.trim() || !password) {
      setError('Email and password required');
      return;
    }

    setLoading(true);

    try {
      const { data, error: authErr } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authErr || !data?.user) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }

      await handlePostLogin(data.user.id);

    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#060d1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#4a5568' }}>Checking session...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#060d1f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>

      <h2 style={{ color: '#f5c518', marginBottom: 20 }}>BSC Marketplace Login</h2>

      <div style={{ width: '100%', maxWidth: 400 }}>

        {error && (
          <div style={{ color: '#f87171', marginBottom: 10 }}>{error}</div>
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', marginBottom: 10 }}
        />

        <input
          type={showPw ? 'text' : 'password'}
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', marginBottom: 10 }}
        />

        <button onClick={handleLogin} disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <div style={{ marginTop: 10 }}>
          <button onClick={() => router.push('/staff-login')}>
            Staff Login
          </button>
        </div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}