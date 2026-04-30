'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export default function LoginPage() {
  const [mode, setMode] = useState<'customer' | 'register'>('customer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
      await new Promise((r) => setTimeout(r, 400));
      window.location.href = '/market';
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name, phone } } });
      if (error) { setError(error.message); setLoading(false); return; }
      if (data.user) {
        await supabase.from('profiles').upsert({ id: data.user.id, full_name: name, phone, role: 'customer' });
      }
      await new Promise((r) => setTimeout(r, 400));
      window.location.href = '/market';
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* HEADER */}
      <header style={{ backgroundColor: '#1a2e5a', padding: '0 20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 44 44" width="32" height="32" fill="none">
                <circle cx="22" cy="22" r="22" fill="transparent" />
                <path d="M10 24c3-5 9-8 15-7s11 5 11 9c0 0-5-3-11-2s-10 4-15 0z" fill="#f4c842" />
                <ellipse cx="28" cy="19" rx="6" ry="4" fill="#38bdf8" opacity="0.9" />
                <circle cx="30" cy="18" r="1.2" fill="white" />
                <path d="M34 21 l5-3 l-1.5 3 l1.5 3z" fill="#f4c842" />
              </svg>
            </div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '18px' }}>BSC</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: '9px', letterSpacing: '3px', textTransform: 'uppercase' }}>MARKETPLACE</div>
            </div>
          </Link>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <Link href="/market" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', textDecoration: 'none' }}>Browse Market</Link>
            <Link href="/staff-login" style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>Staff Login →</Link>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>

          {/* Card */}
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', boxShadow: '0 8px 40px rgba(0,0,0,0.10)', overflow: 'hidden' }}>

            {/* Card header */}
            <div style={{ backgroundColor: '#1a2e5a', padding: '28px 32px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🐟</div>
              <h1 style={{ color: '#fff', fontWeight: 900, fontSize: '22px', margin: '0 0 4px' }}>
                {mode === 'customer' ? 'Welcome Back' : 'Create Account'}
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '14px', margin: 0 }}>
                {mode === 'customer' ? 'Sign in to your BSC account' : 'Join BSC Marketplace today'}
              </p>
            </div>

            {/* Tab switcher */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #f0f0f0' }}>
              {[
                { key: 'customer', label: 'Sign In' },
                { key: 'register', label: 'Register' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setMode(tab.key as 'customer' | 'register'); setError(''); }}
                  style={{
                    padding: '14px',
                    border: 'none',
                    borderBottom: mode === tab.key ? '3px solid #f4c842' : '3px solid transparent',
                    backgroundColor: mode === tab.key ? '#fafafa' : '#fff',
                    color: mode === tab.key ? '#1a2e5a' : '#999',
                    fontWeight: mode === tab.key ? 800 : 500,
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Form */}
            <div style={{ padding: '28px 32px' }}>
              {error && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', color: '#dc2626', fontSize: '13px', fontWeight: 600 }}>
                  ⚠️ {error}
                </div>
              )}

              <form onSubmit={mode === 'customer' ? handleLogin : handleRegister}>
                {mode === 'register' && (
                  <>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', color: '#374151', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Full Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your full name"
                        required
                        style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', color: '#374151', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>WhatsApp Number</label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+1 (242) 000-0000"
                        style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                      />
                      <p style={{ color: '#9ca3af', fontSize: '11px', margin: '4px 0 0' }}>Receipts sent here via WhatsApp 💬</p>
                    </div>
                  </>
                )}

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: '#374151', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', color: '#374151', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{ width: '100%', backgroundColor: loading ? '#94a3b8' : '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: '12px', padding: '14px', fontWeight: 900, fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer', marginBottom: '12px' }}
                >
                  {loading ? 'Please wait...' : mode === 'customer' ? 'Sign In to BSC' : 'Create My Account'}
                </button>

                <Link
                  href="/market"
                  style={{ display: 'block', textAlign: 'center', color: '#6b7280', fontSize: '13px', textDecoration: 'none', padding: '8px' }}
                >
                  Continue browsing without account →
                </Link>
              </form>
            </div>
          </div>

          {/* Trust note */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '24px' }}>
            {['🔒 Secure Login', '💬 WhatsApp Receipts', '🇧🇸 Local & Trusted'].map((item) => (
              <span key={item} style={{ color: '#9ca3af', fontSize: '12px' }}>{item}</span>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ backgroundColor: '#fff', borderTop: '1px solid #ebebeb', padding: '16px 20px', textAlign: 'center' }}>
        <p style={{ color: '#aaa', fontSize: '12px', margin: 0 }}>
          2025 BSC Marketplace · Bahamian Seafood Connection · Proudly Bahamian 🇧🇸
        </p>
      </footer>

    </div>
  );
}