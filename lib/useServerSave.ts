'use client';

// Universal server-authoritative Save primitive (D2 / Phase 5).
//
// The front-end is a thin view; the backend is the lock. This hook NEVER writes
// to the DB directly — it posts the payload to a role-gated server route (which
// uses the service-role client + writes an ai_writes audit row), and surfaces a
// save state the UI can reflect (idle → saving → saved/error). Point every
// "Save" affordance on the platform at this hook so persistence is consistent,
// audited, and enforced server-side everywhere.
//
// Usage:
//   const { save, state, error } = useServerSave('/api/supplier/save-extract-draft');
//   <SaveButton state={state} onClick={() => save({ supplier_id, rows })} />

import { useCallback, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveResult<T = unknown> {
  ok:    boolean;
  data?: T;
  error?: string;
}

export function useServerSave(endpoint: string) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const save = useCallback(async <T = unknown>(payload: unknown): Promise<SaveResult<T>> => {
    setState('saving');
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setState('error');
        setError('Sign-in expired — refresh.');
        return { ok: false, error: 'Sign-in expired — refresh.' };
      }
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(payload),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Record<string, unknown>;
      if (!res.ok || j.ok === false) {
        const msg = j.error || `HTTP ${res.status}`;
        setState('error');
        setError(msg);
        return { ok: false, error: msg };
      }
      setState('saved');
      // Auto-revert the "✓ Saved" badge after 2s.
      setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 2000);
      return { ok: true, data: j as T };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'save failed';
      setState('error');
      setError(msg);
      return { ok: false, error: msg };
    }
  }, [endpoint, supabase]);

  return { save, state, error };
}
