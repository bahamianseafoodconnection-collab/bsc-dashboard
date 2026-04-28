'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getRouteForRole(role: string): string {
  switch (role) {
    case 'control_admin': return '/dashboard';
    case 'basic_admin':   return '/dashboard';
    case 'manager':       return '/ashley';
    case 'cashier':       return '/pos';
    case 'andros_staff':  return '/pos-andros';
    case 'supplier':      return '/supplier';
    case 'customer':
    default:              return '/market';
  }
}

const LANGUAGES = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'es', label: 'Espanol', flag: 'ES' },
  { code: 'ht', label: 'Kreyol',  flag: 'HT' },
];

const T: Record<string, Record<string, string>> = {
  title:    { en: 'BSC Staff Login',            es: 'Inicio de Sesion BSC',            ht: 'Koneksyon Anplwaye BSC'    },
  subtitle: { en: 'Bahamian Seafood Connection', es: 'Bahamian Seafood Connection',     ht: 'Bahamian Seafood Connection' },
  email:    { en: 'Email Address',              es: 'Correo Electronico',              ht: 'Adres Imel'                },
  password: { en: 'Password',                   es: 'Contrasena',                      ht: 'Modpas'                    },
  signin:   { en: 'Sign In',                    es: 'Iniciar Sesion',                  ht: 'Konekte'                   },
  signing:  { en: 'Signing in...',              es: 'Iniciando...',                    ht: 'Ap konekte...'             },
  error:    { en: 'Invalid email or password',  es: 'Correo o contrasena incorrectos', ht: 'Imel oswa modpas enkorek'  },
};

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [lang, setLang]         = useState('en');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError]       = useState('');

  const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);
  const t = (key: string) => T[key]?.[lang] || T[key]?.['en'] || key;

  useEffect(() => {
    async function checkExistingSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await redirectByRole(session.user.id);
        } else {
          setChecking(false);
        }
      } catch (err) {
        console.error('Session check error:', err);
        setChecking(false);
      }
    }
    checkExistingSession();
  }, []);

  // ── THE ONLY PLACE routing happens ──────────────────────────
  // Step 1: receive userId
  // Step 2: fetch role from profiles — AWAIT this fully
  // Step 3: log everything for live verification
  // Step 4: call router.replace ONLY after role is confirmed
  async function redirectByRole(userId: string) {
    console.log('[BSC Login] USER ID:', userId);

    let role = 'customer'; // safe default — overwritten if fetch succeeds

    try {
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (profileErr) {
        console.error('[BSC Login] Profile fetch error:', profileErr.message);
      } else if (profile?.role) {
        role = profile.role;
      } else {
        console.warn('[BSC Login] Profile row found but role is empty — defaulting to customer');
      }
    } catch (err) {
      console.error('[BSC Login] Profile fetch threw:', err);
    }

    console.log('[BSC Login] ROLE:', role);

    // Honour middleware ?redirect= only for staff — never send staff to customer pages
    const redirectParam = searchParams.get('redirect');
    if (redirectParam && redirectParam.startsWith('/') && role !== 'customer') {
      console.log('[BSC Login] REDIRECTING TO (middleware param):', redirectParam);
      router.replace(redirectParam);
      return;
    }

    const destination = getRouteForRole(role);
    console.log('[BSC Login] REDIRECTING TO:', destination);
    router.replace(destination);
  }

  async function handleLogin() {
    setError('');
    if (!email.trim() || !password) {
      setError(t('error'));
      return;
    }

    setLoading(true);

    try {
      // Step 1 — authenticate
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email:    email.trim(),
        password: password,
      });

      if (authErr || !data?.user) {
        console.error('[BSC Login] Auth error:', authErr?.message);
        setError(t('error'));
        setLoading(false);
        return;
      }

      // Step 2 — auth confirmed, now fetch role and route
      // Do NOT call setLoading(false) — keep spinner until redirect completes
      await redirectByRole(data.user.id);

    } catch (err) {
      console.error('[BSC Login] Unexpected error:', err);
      setError(t('error'));
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#060d1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' as const }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🐟</div>
          <p style={{ color: '#4a5568', fontSize: 14, fontFamily: 'sans-serif' }}>Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#060d1f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* Language selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {LANGUAGES.map(l => (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            style={{ padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', backgroundColor: lang === l.code ? '#f5c518' : '#0d1f3c', color: lang === l.code ? '#000' : '#6b7280', fontWeight: lang === l.code ? 'bold' : 'normal', fontSize: 13 }}
          >
            {l.flag} {l.label}
          </button>
        ))}
      </div>

      {/* Logo */}
      <div style={{ textAlign: 'center' as const, marginBottom: 32 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🐟</div>
        <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 22 }}>{t('title')}</p>
        <p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 13 }}>{t('subtitle')}</p>
      </div>

      {/* Form */}
      <div style={{ width: '100%', maxWidth: 400 }}>
        {error && (
          <div style={{ backgroundColor: '#2d0000', border: '1px solid #f87171', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
            <p style={{ margin: 0, color: '#f87171', fontSize: 13 }}>⚠️ {error}</p>
          </div>
        )}

        <label style={{ display: 'block', color: '#6b7280', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 6 }}>{t('email')}</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          onKeyDown={e => e.key === 'Enter' && !loading && handleLogin()}
          disabled={loading}
          style={{ display: 'block', width: '100%', padding: '14px 16px', borderRadius: 12, backgroundColor: '#0d1f3c', color: '#fff', border: '1px solid #1e3a5f', fontSize: 16, marginBottom: 14, boxSizing: 'border-box' as const, outline: 'none', opacity: loading ? 0.6 : 1 }}
        />

        <label style={{ display: 'block', color: '#6b7280', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 6 }}>{t('password')}</label>
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            onKeyDown={e => e.key === 'Enter' && !loading && handleLogin()}
            disabled={loading}
            style={{ display: 'block', width: '100%', padding: '14px 48px 14px 16px', borderRadius: 12, backgroundColor: '#0d1f3c', color: '#fff', border: '1px solid #1e3a5f', fontSize: 16, boxSizing: 'border-box' as const, outline: 'none', opacity: loading ? 0.6 : 1 }}
          />
          <button
            onClick={() => setShowPw(!showPw)}
            style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#6b7280', padding: 0 }}
          >
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{ width: '100%', padding: '15px', borderRadius: 12, backgroundColor: loading ? '#1a2a1a' : '#f5c518', color: loading ? '#4ade80' : '#000', fontWeight: 'bold', border: loading ? '1px solid #4ade80' : 'none', fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #4ade80', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              {t('signing')}
            </span>
          ) : t('signin')}
        </button>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      <p style={{ marginTop: 40, color: '#1e3a5f', fontSize: 11, textAlign: 'center' as const }}>
        2025 BSC Marketplace — Owned by Dedrick Storr Snr and Family
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#060d1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#4a5568', fontSize: 14 }}>Loading...</p>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}