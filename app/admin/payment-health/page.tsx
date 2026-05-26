'use client';

// /admin/payment-health
//
// Founder-facing UI wrapper around /api/payment/health. The underlying
// route requires Bearer-token auth, so a plain browser visit gets
// "Sign in required". This page reads the signed-in session, attaches
// the Authorization header, calls the API, and renders the result with
// human-readable cues so the founder can confirm RBC env wiring
// without touching curl.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface HealthResult {
  ok?:                 boolean;
  configured?:         boolean;
  ready?:              boolean;
  missing?:            string[];
  api_base?:           string;
  currency?:           string;
  hint?:               string;
  gateway_reachable?:  boolean;
  creds_valid?:        boolean;
  took_ms?:            number;
  gateway_status?:     string;
  gateway_message?:    string;
  error?:              string;
}

type RunState = 'idle' | 'loading' | 'done' | 'error';

export default function PaymentHealthPage() {
  const [authState, setAuthState] = useState<'checking' | 'ok' | 'no_session' | 'wrong_role'>('checking');
  const [checkState, setCheckState] = useState<RunState>('idle');
  const [checkResult, setCheckResult] = useState<HealthResult | null>(null);
  const [pingState, setPingState] = useState<RunState>('idle');
  const [pingResult, setPingResult] = useState<HealthResult | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAuthState('no_session'); return; }
      const { data: prof } = await supabase
        .from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      const role = (prof as { role?: string | null } | null)?.role ?? null;
      if (role === 'founder' || role === 'co_founder') {
        setAuthState('ok');
        // Auto-run the basic check on first load.
        runCheck();
      } else {
        setAuthState('wrong_role');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runCheck() {
    setCheckState('loading');
    setCheckResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/payment/health', {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      setCheckResult(json);
      setCheckState('done');
    } catch (err) {
      setCheckResult({ error: err instanceof Error ? err.message : String(err) });
      setCheckState('error');
    }
  }

  async function runPing() {
    setPingState('loading');
    setPingResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/payment/health?ping=1', {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      setPingResult(json);
      setPingState('done');
    } catch (err) {
      setPingResult({ error: err instanceof Error ? err.message : String(err) });
      setPingState('error');
    }
  }

  if (authState === 'checking') return <Shell><p>Checking session…</p></Shell>;
  if (authState === 'no_session') {
    return (
      <Shell>
        <p style={{ fontWeight: 700, marginBottom: 8 }}>You&apos;re not signed in.</p>
        <a href="/staff-login?next=/admin/payment-health" style={linkStyle}>Sign in →</a>
      </Shell>
    );
  }
  if (authState === 'wrong_role') {
    return (
      <Shell>
        <p style={{ fontWeight: 700 }}>Founder / co-founder only.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 style={h1Style}>RBC / Plug&apos;n Pay — Integration Health</h1>
      <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 24 }}>
        Founder diagnostic for the online card payments wiring. None of the env values are
        ever displayed — this page only confirms presence + verifies the gateway accepts
        them.
      </p>

      {/* ─── Check 1: Env vars ─── */}
      <Section title="Step 1 — Are the env vars set in this deployment?">
        <button onClick={runCheck} disabled={checkState === 'loading'} style={btnStyle}>
          {checkState === 'loading' ? 'Checking…' : '🔄 Re-check env vars'}
        </button>
        {checkResult && <ResultBox kind={checkResult.ok ? 'good' : 'bad'} result={checkResult} />}
      </Section>

      {/* ─── Check 2: Live gateway ping ─── */}
      <Section title="Step 2 — Does the gateway accept our credentials?">
        <p style={hintStyle}>
          This sends a real request to <code style={codeStyle}>pay1.plugnpay.com</code> with a
          deliberately-bogus order ID. The expected result is{' '}
          <strong style={{ color: '#4ade80' }}>creds_valid: true</strong> — the gateway will
          say it can&apos;t find the fake order, which proves it authenticated us first.
        </p>
        <button
          onClick={runPing}
          disabled={pingState === 'loading' || !checkResult?.configured}
          style={!checkResult?.configured ? { ...btnStyle, opacity: 0.5, cursor: 'not-allowed' } : btnStyle}
        >
          {pingState === 'loading' ? 'Pinging gateway…' : '🛰 Ping gateway (live test)'}
        </button>
        {!checkResult?.configured && (
          <p style={{ ...hintStyle, color: '#f87171', marginTop: 6 }}>
            Cannot ping until Step 1 reports all env vars are set.
          </p>
        )}
        {pingResult && (
          <ResultBox
            kind={pingResult.ok ? 'good' : pingResult.gateway_reachable ? 'warn' : 'bad'}
            result={pingResult}
          />
        )}
      </Section>

      <Section title="Quick reference">
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: '#94a3b8', paddingLeft: 18 }}>
          <li><strong style={{ color: '#fff' }}>ok: true / ready: true</strong> in Step 1 = green light to ping</li>
          <li><strong style={{ color: '#fff' }}>creds_valid: true</strong> in Step 2 = ready for a real test transaction (after enabling Testing Mode in the PnP admin panel)</li>
          <li><strong style={{ color: '#fff' }}>creds_valid: false</strong> = re-verify PNP_GATEWAY_ACCOUNT + PNP_PUBLISHER_PASSWORD against the PnP admin panel — one of them is wrong</li>
          <li><strong style={{ color: '#fff' }}>gateway_reachable: false</strong> = Vercel can&apos;t reach pay1.plugnpay.com (rare — check Vercel function logs)</li>
        </ul>
      </Section>
    </Shell>
  );
}

/* ─────────── UI primitives ─────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#060d1f', color: '#fff',
      fontFamily: "'DM Sans', sans-serif", padding: 24,
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {children}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)',
      borderRadius: 12, padding: 18, marginBottom: 16,
    }}>
      <h2 style={{ fontSize: 14, fontWeight: 800, color: '#f5c518', marginBottom: 10 }}>{title}</h2>
      {children}
    </section>
  );
}

function ResultBox({ kind, result }: { kind: 'good' | 'warn' | 'bad'; result: HealthResult }) {
  const palette =
    kind === 'good' ? { bg: 'rgba(74,222,128,0.1)',  border: '#4ade80', text: '#4ade80' } :
    kind === 'warn' ? { bg: 'rgba(245,197,24,0.1)',  border: '#f5c518', text: '#f5c518' } :
                      { bg: 'rgba(248,113,113,0.1)', border: '#f87171', text: '#f87171' };
  return (
    <div style={{
      marginTop: 12, padding: 12, borderRadius: 8,
      background: palette.bg, border: `1px solid ${palette.border}`,
      fontSize: 12, fontFamily: 'monospace', color: '#fff',
    }}>
      <div style={{ color: palette.text, fontWeight: 700, marginBottom: 6 }}>
        {kind === 'good' ? '✅ PASS' : kind === 'warn' ? '⚠️ PARTIAL' : '❌ FAIL'}
      </div>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {JSON.stringify(result, null, 2)}
      </pre>
      {result.hint && (
        <p style={{ marginTop: 8, fontFamily: 'inherit', color: '#cbd5e1', fontSize: 12 }}>
          <strong>Hint:</strong> {result.hint}
        </p>
      )}
    </div>
  );
}

/* ─────────── styles ─────────── */
const h1Style: React.CSSProperties = {
  fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700,
  color: '#f5c518', marginBottom: 6,
};
const btnStyle: React.CSSProperties = {
  background: '#f5c518', color: '#060d1f', border: 'none',
  borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 800,
  cursor: 'pointer', fontFamily: 'inherit',
};
const linkStyle: React.CSSProperties = { color: '#f5c518', fontSize: 14, fontWeight: 700 };
const hintStyle: React.CSSProperties = { fontSize: 12, color: '#94a3b8', marginBottom: 8 };
const codeStyle: React.CSSProperties = {
  background: '#1a2e5a', padding: '1px 6px', borderRadius: 4,
  fontSize: 11, color: '#f5c518',
};
