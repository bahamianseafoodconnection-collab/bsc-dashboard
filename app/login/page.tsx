'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL  = 'https://auqjjrisivhfmpleusyt.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg';

const ROLE_ROUTES: Record<string, string> = {
  control_admin:  '/dashboard',
  manager:        '/ashley',
  basic_admin:    '/jaquel',
  bill:           '/bill',
  automotive:     '/johnette',
  jorge:          '/jorge',
  processor:      '/yield',
  cashier:        '/pos',
  andros_staff:   '/pos-andros',
};

const LANGUAGES = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'es', label: 'Espanol', flag: 'ES' },
  { code: 'ht', label: 'Kreyol', flag: 'HT' },
];

const T: Record<string, Record<string, string>> = {
  title:    { en: 'BSC Staff Login', es: 'Inicio de Sesion BSC', ht: 'Koneksyon Anplwaye BSC' },
  subtitle: { en: 'Bahamian Seafood Connection', es: 'Bahamian Seafood Connection', ht: 'Bahamian Seafood Connection' },
  email:    { en: 'Email Address', es: 'Correo Electronico', ht: 'Adres Imel' },
  password: { en: 'Password', es: 'Contrasena', ht: 'Modpas' },
  signin:   { en: 'Sign In', es: 'Iniciar Sesion', ht: 'Konekte' },
  signing:  { en: 'Signing in...', es: 'Iniciando...', ht: 'Ap konekte...' },
  error:    { en: 'Invalid email or password', es: 'Correo o contrasena incorrectos', ht: 'Imel oswa modpas enkorek' },
};

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [lang, setLang]         = useState('en');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON);
  const t = (key: string) => T[key]?.[lang] || T[key]?.['en'] || key;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) redirectByRole(session.user.id);
    });
  }, []);

  async function redirectByRole(userId: string) {
    const redirect = searchParams.get('redirect');
    if (redirect && redirect.startsWith('/')) {
      router.replace(redirect);
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    const role  = profile?.role || 'cashier';
    const route = ROLE_ROUTES[role] || '/pos';
    router.replace(route);
  }

  async function handleLogin() {
    setError('');
    if (!email || !password) { setError(t('error')); return; }
    setLoading(true);
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr || !data.user) {
        setError(t('error'));
        setLoading(false);
        return;
      }
      await redirectByRole(data.user.id);
    } catch {
      setError(t('error'));
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#060d1f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: '' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {LANGUAGES.map(l => (
          <button key={l.code} onClick={() => setLang(l.code)} style={{ padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', backgroundColor: lang === l.code ? '#f5c518' : '#0d1f3c', color: lang === l.code ? '#000' : '#6b7280', fontWeight: lang === l.code ? 'bold' : 'normal', fontSize: 13 }}>
            {l.flag} {l.label}
          </button>
        ))}
      </div>
      <div style={{ textAlign: 'center' as const, marginBottom: 32 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🐟</div>
        <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 22 }}>{t('title')}</p>
        <p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 13 }}>{t('subtitle')}</p>
      </div>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {error && (
          <div style={{ backgroundColor: '#2d0000', border: '1px solid #f87171', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
            <p style={{ margin: 0, color: '#f87171', fontSize: 13 }}>Error: {error}</p>
          </div>
        )}
        <label style={{ display: 'block', color: '#6b7280', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 6 }}>{t('email')}</label>
        <input type='email' value={email} onChange={e => setEmail(e.target.value)} placeholder='your@email.com' onKeyDown={e => e.key === 'Enter' && handleLogin()} style={{ display: 'block', width: '100%', padding: '14px 16px', borderRadius: 12, backgroundColor: '#0d1f3c', color: '#fff', border: '1px solid #1e3a5f', fontSize: 16, marginBottom: 14, boxSizing: 'border-box' as const, outline: 'none' }} />
        <label style={{ display: 'block', color: '#6b7280', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 6 }}>{t('password')}</label>
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder='password' onKeyDown={e => e.key === 'Enter' && handleLogin()} style={{ display: 'block', width: '100%', padding: '14px 48px 14px 16px', borderRadius: 12, backgroundColor: '#0d1f3c', color: '#fff', border: '1px solid #1e3a5f', fontSize: 16, boxSizing: 'border-box' as const, outline: 'none' }} />
          <button onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6b7280', padding: 0 }}>
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>
        <button onClick={handleLogin} disabled={loading} style={{ width: '100%', padding: '15px', borderRadius: 12, backgroundColor: loading ? '#555' : '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? t('signing') : t('signin')}
        </button>
      </div>
      <p style={{ marginTop: 40, color: '#1e3a5f', fontSize: 11, textAlign: 'center' as const }}>
        2025 BSC Marketplace - Owned by Dedrick Storr Snr and Family
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