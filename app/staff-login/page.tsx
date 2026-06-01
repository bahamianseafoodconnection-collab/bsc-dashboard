'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { recordSignIn, clearSignIn } from '@/lib/staff-session';

export default function StaffLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      const cleanEmail = email.trim().toLowerCase();

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError) {
        setError('Invalid email or password.');
        setLoading(false);
        return;
      }

      await new Promise((r) => setTimeout(r, 600));

      const { data: roleData, error: roleErr } = await supabase.rpc('get_my_role');

      if (roleErr) {
        clearSignIn();
        await supabase.auth.signOut();
        setError('Could not verify your staff role. Contact Dedrick or Jaquel.');
        setLoading(false);
        return;
      }

      const role = roleData as string | null;

      if (!role) {
        clearSignIn();
        await supabase.auth.signOut();
        setError('This sign-in is for BSC staff only. Customers: use the customer sign-in page.');
        setLoading(false);
        return;
      }

      // Record the signin timestamp so AppShell can enforce the 10-hour
      // staff session cap (founder + co_founder bypass — see lib/staff-session.ts).
      recordSignIn();

      const dashboardRoles = ['control_admin', 'founder', 'co_founder', 'manager', 'cashier', 'right_hand', 'supervisor'];

      if (role === 'processor' || role === 'operations') {
        // operations (TJ-style fulfillment) shares the processor landing
        // page until a dedicated /operations dashboard ships.
        window.location.href = '/processor';
      } else if (role === 'supplier') {
        window.location.href = '/supplier';
      } else if (role === 'driver') {
        window.location.href = '/driver';
      } else if (dashboardRoles.includes(role)) {
        window.location.href = '/dashboard';
      } else {
        window.location.href = '/dashboard';
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#060d1f', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>

      <header style={{ padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: '#1a2e5a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 44 44" width="30" height="30" fill="none">
                <path d="M10 24c3-5 9-8 15-7s11 5 11 9c0 0-5-3-11-2s-10 4-15 0z" fill="#f4c842" />
                <ellipse cx="28" cy="19" rx="6" ry="4" fill="#38bdf8" opacity="0.9" />
                <circle cx="30" cy="18" r="1.2" fill="white" />
                <path d="M34 21 l5-3 l-1.5 3 l1.5 3z" fill="#f4c842" />
              </svg>
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '16px' }}>BSC Control</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase' }}>Staff Portal</div>
            </div>
          </Link>
          <Link href="/market" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', textDecoration: 'none' }}>
            ← Back to Market
          </Link>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <div style={{ backgroundColor: '#0f1a2e', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>

            <div style={{ padding: '32px 32px 24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#f4c842', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '26px' }}>
                🔐
              </div>
              <h1 style={{ color: '#fff', fontWeight: 900, fontSize: '22px', margin: '0 0 6px' }}>Staff Login</h1>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px', margin: 0 }}>BSC Control · Authorized Personnel Only</p>
            </div>

            <div style={{ padding: '28px 32px' }}>
              {error && (
                <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', color: '#f87171', fontSize: '13px', fontWeight: 600 }}>
                  ⚠️ {error}
                </div>
              )}

              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '12px', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    EMAIL
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@bahamianseafoodconnection.com"
                    required
                    autoComplete="email"
                    inputMode="email"
                    style={{ width: '100%', padding: '13px 16px', borderRadius: '10px', border: '1.5px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ marginBottom: '28px' }}>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '12px', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    PASSWORD
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    style={{ width: '100%', padding: '13px 16px', borderRadius: '10px', border: '1.5px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{ width: '100%', backgroundColor: loading ? '#4b5563' : '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: '12px', padding: '14px', fontWeight: 900, fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer', marginBottom: '16px' }}
                >
                  {loading ? 'Signing in...' : 'Sign In to BSC Control'}
                </button>
              </form>

              <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
                  Role → Lands At
                </div>
                {[
                  { role: 'Founder · Manager · Cashier', route: '/dashboard', color: '#f4c842' },
                  { role: 'Processor', route: '/processor', color: '#38bdf8' },
                  { role: 'Supplier', route: '/supplier', color: '#a78bfa' },
                  { role: 'Driver', route: '/driver', color: '#34d399' },
                ].map((r) => (
                  <div key={r.role} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>{r.role}</span>
                    <span style={{ color: r.color, fontSize: '12px', fontWeight: 700 }}>{r.route}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '12px', marginTop: '24px' }}>
            🇧🇸 Bahamian Seafood Connection · Confidential
          </p>
        </div>
      </div>
    </div>
  );
}
