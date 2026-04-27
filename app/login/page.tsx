// File: app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
'https://auqjjrisivhfmpleusyt.supabase.co',
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg'
);

const ROLE_ROUTES: Record<string, string> = {
control_admin: '/dashboard',
manager: '/ashley',
basic_admin: '/jaquel',
bill: '/bill',
automotive: '/johnette',
jorge: '/jorge',
processor: '/yield',
cashier: '/pos',
andros_staff: '/pos-andros',
};

const LANGUAGES = [
{ code: 'en', label: 'English', flag: '🇧🇸' },
{ code: 'es', label: 'Español', flag: '🇪🇸' },
{ code: 'ht', label: 'Kreyòl', flag: '🇭🇹' },
];

const T: Record<string, Record<string, string>> = {
title: { en: 'BSC Staff Login', es: 'Inicio de Sesión BSC', ht: 'Koneksyon Anplwaye BSC' },
subtitle: { en: 'Bahamian Seafood Connection', es: 'Bahamian Seafood Connection', ht: 'Bahamian Seafood Connection' },
email: { en: 'Email Address', es: 'Correo Electrónico', ht: 'Adrès Imèl' },
password: { en: 'Password', es: 'Contraseña', ht: 'Modpas' },
signin: { en: 'Sign In', es: 'Iniciar Sesión', ht: 'Konekte' },
signing: { en: 'Signing in...', es: 'Iniciando...', ht: 'Ap konekte...' },
error: { en: 'Invalid email or password', es: 'Correo o contraseña incorrectos', ht: 'Imèl oswa modpas enkòrèk' },
welcome: { en: 'Welcome back', es: 'Bienvenido', ht: 'Byenveni' },
};

export default function LoginPage() {
const router = useRouter();
const [lang, setLang] = useState('en');
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [showPw, setShowPw] = useState(false);
const [loading, setLoading] = useState(false);
const [error, setError] = useState('');

const t = (key: string) => T[key]?.[lang] || T[key]?.['en'] || key;

async function handleLogin() {
setError('');
if (!email || !password) { setError(t('error')); return; }
setLoading(true);
try {
const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
if (authErr || !data.user) { setError(t('error')); setLoading(false); return; }
const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
const role = profile?.role || 'cashier';
const route = ROLE_ROUTES[role] || '/pos';
router.push(route);
} catch {
setError(t('error'));
setLoading(false);
}
}

const pg: React.CSSProperties = {
minHeight: '100vh', backgroundColor: '#060d1f',
display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
padding: 24, fontFamily: "'Inter', -apple-system, sans-serif",
};

return (
<div style={pg}>
{/* LANGUAGE SELECTOR */}
<div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
{LANGUAGES.map(l => (
<button key={l.code} onClick={() => setLang(l.code)} style={{
padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
backgroundColor: lang === l.code ? '#f5c518' : '#0d1f3c',
color: lang === l.code ? '#000' : '#6b7280',
fontWeight: lang === l.code ? 'bold' : 'normal', fontSize: 13,
}}>
{l.flag} {l.label}
</button>
))}
</div>

{/* LOGO */}
<div style={{ textAlign: 'center', marginBottom: 32 }}>
<div style={{ fontSize: 56, marginBottom: 12 }}>🐟</div>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 22 }}>{t('title')}</p>
<p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 13 }}>{t('subtitle')}</p>
</div>

{/* FORM */}
<div style={{ width: '100%', maxWidth: 400 }}>
{error && (
<div style={{ backgroundColor: '#2d0000', border: '1px solid #f87171', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
<p style={{ margin: 0, color: '#f87171', fontSize: 13 }}>⚠️ {error}</p>
</div>
)}
<label style={{ display: 'block', color: '#6b7280', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{t('email')}</label>
<input
type="email" value={email} onChange={e => setEmail(e.target.value)}
placeholder="your@email.com"
onKeyDown={e => e.key === 'Enter' && handleLogin()}
style={{ display: 'block', width: '100%', padding: '14px 16px', borderRadius: 12, backgroundColor: '#0d1f3c', color: '#fff', border: '1px solid #1e3a5f', fontSize: 16, marginBottom: 14, boxSizing: 'border-box', outline: 'none' }}
/>
<label style={{ display: 'block', color: '#6b7280', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{t('password')}</label>
<div style={{ position: 'relative', marginBottom: 24 }}>
<input
type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
placeholder="••••••••"
onKeyDown={e => e.key === 'Enter' && handleLogin()}
style={{ display: 'block', width: '100%', padding: '14px 48px 14px 16px', borderRadius: 12, backgroundColor: '#0d1f3c', color: '#fff', border: '1px solid #1e3a5f', fontSize: 16, boxSizing: 'border-box', outline: 'none' }}
/>
<button onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280', padding: 0 }}>
{showPw ? '🙈' : '👁'}
</button>
</div>
<button onClick={handleLogin} disabled={loading} style={{ width: '100%', padding: '15px', borderRadius: 12, backgroundColor: loading ? '#555' : '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer' }}>
{loading ? t('signing') : t('signin')}
</button>
</div>

{/* FOOTER */}
<p style={{ marginTop: 40, color: '#1e3a5f', fontSize: 11, textAlign: 'center' }}>
© 2025 BSC Marketplace · Owned by Dedrick Storr Snr & Family
</p>
</div>
);
}
