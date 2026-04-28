'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const STAFF_ROLES = new Set([
  'control_admin',
  'basic_admin',
  'manager',
  'cashier',
  'andros_staff',
  'supplier',
]);

function getDestination(role: string): string {
  switch (role) {
    case 'control_admin':
    case 'basic_admin':
      return '/dashboard';
    case 'manager':
      return '/ashley';
    case 'cashier':
      return '/pos';
    case 'andros_staff':
      return '/pos-andros';
    case 'supplier':
      return '/supplier';
    default:
      return '/market';
  }
}

function hardRedirect(destination: string) {
  console.log('[AUTH /login] REDIRECT:', destination);
  window.location.href = destination;
}

function LoginForm() {
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);

  useEffect(() => {
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          await resolveAndRedirect(session.user.id);
        } else {
          setChecking(false);
        }
      } catch {
        setChecking(false);
      }
    }

    init();
  }, []);

  async function resolveAndRedirect(userId: string) {
    console.log('[AUTH /login] USER:', userId);

    let role = 'customer';

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (!error && profile?.role) {
        role = profile.role;
      } else if (error) {
        console.error('[AUTH /login] Profile error:', error.message);
      }
    } catch (err) {
      console.error('[AUTH /login] Profile fetch failed:', err);
    }

    console.log('[AUTH /login] ROLE:', role);

    if (STAFF_ROLES.has(role)) {
      hardRedirect(getDestination(role));
      return;
    }

    const redirectParam = searchParams.get('redirect');
    if (redirectParam && redirectParam.startsWith('/')) {
      hardRedirect(redirectParam);
      return;
    }

    hardRedirect('/market');
  }

  function handleEmailBlur() {
    const lower = email.toLowerCase();

    const looksLikeStaff =
      lower.includes('@bsc') ||
      lower.includes('@bahamianseafood');

    if (looksLikeStaff) {
      window.location.href = '/staff-login';
    }
  }

  async function handleLogin() {
    setError('');

    if (!email.trim() || !password) {
      setError('Email and password required');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data?.user) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }

      await resolveAndRedirect(data.user.id);

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
      <h2 style={{ color: '#f5c518' }}>BSC Marketplace Login</h2>

      <div style={{ width: '100%', maxWidth: 400 }}>
        {error && <p style={{ color: 'red' }}>{error}</p>}

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={handleEmailBlur}
          placeholder="email"
        />

        <input
          type={showPw ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
        />

        <button onClick={handleLogin} disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <p>
          Staff? <a href="/staff-login">Go to staff login</a>
        </p>
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