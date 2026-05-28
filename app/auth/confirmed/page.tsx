'use client';

// /auth/confirmed
//
// Branded landing for the email-confirmation link. Supabase's confirm link
// (with Site URL = https://bscbahamas.com) verifies the token then redirects
// here with the session in the URL. The shared browser client auto-detects
// it (detectSessionInUrl), so we poll getSession briefly, then welcome the
// customer into the shop. Replaces the old "can't reach localhost" dead end.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type State = 'confirming' | 'ok' | 'error';

export default function AuthConfirmedPage() {
  const router = useRouter();
  const [state, setState] = useState<State>('confirming');
  const [name, setName] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    let tries = 0;

    async function check() {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.user) {
        setName((session.user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? '');
        setState('ok');
        // Give them a beat to read the welcome, then into the shop.
        setTimeout(() => { if (!cancelled) router.replace('/market'); }, 2200);
        return;
      }
      tries += 1;
      if (tries < 8) {
        setTimeout(check, 600);   // session may still be settling from the URL
      } else {
        setState('error');
      }
    }
    check();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-6 text-center">
      <div className="w-full max-w-sm rounded-2xl bg-white/5 p-8 ring-1 ring-gold/20">
        <div className="mb-4 text-5xl">{state === 'error' ? '⚠️' : '🐚'}</div>

        {state === 'confirming' && (
          <>
            <h1 className="font-display text-xl font-extrabold text-gold">Confirming your email…</h1>
            <p className="mt-2 text-sm text-white/70">One moment while we verify your BSC Marketplace account.</p>
            <div className="mx-auto mt-5 h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-gold" />
          </>
        )}

        {state === 'ok' && (
          <>
            <h1 className="font-display text-2xl font-extrabold text-gold">
              {name ? `Welcome, ${name}!` : 'Welcome to BSC Marketplace!'}
            </h1>
            <p className="mt-2 text-sm text-white/80">
              Your email is confirmed. Taking you to the market — fresh, local, Bahamian. 🇧🇸
            </p>
            <Link href="/market" className="mt-5 inline-block rounded-lg bg-gold px-5 py-2.5 text-sm font-extrabold text-navy hover:bg-gold-300">
              Start shopping →
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <h1 className="font-display text-xl font-extrabold text-white">Link expired or already used</h1>
            <p className="mt-2 text-sm text-white/70">
              This confirmation link is no longer valid. Please sign in, or request a new confirmation email.
            </p>
            <Link href="/login" className="mt-5 inline-block rounded-lg bg-gold px-5 py-2.5 text-sm font-extrabold text-navy hover:bg-gold-300">
              Go to sign in →
            </Link>
          </>
        )}
      </div>
      <p className="mt-6 text-xs text-white/40">Bahamian Seafood Connection · bscbahamas.com</p>
    </div>
  );
}
