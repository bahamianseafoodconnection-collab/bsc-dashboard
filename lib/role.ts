'use client';

// Per-session role lookup + lock-permission helpers.
//
// Role values come from the user_role enum on the database. Founder and
// co_founder are the only roles that can lock or unlock records. Manager
// can see the lock icon but cannot toggle it. All other roles see nothing.
//
// The role is fetched once per page mount and cached in module scope so
// repeated calls across components don't re-hit Supabase.

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// control_admin is the de-facto top-tier role in production (the AppShell
// STAFF_ROLES allowlist requires it for dashboard access). founder /
// co_founder kept for forward-compat with any role-schema split.
const LOCK_ROLES      = new Set(['founder', 'co_founder', 'control_admin']);
const VIEW_LOCK_ROLES = new Set(['founder', 'co_founder', 'control_admin', 'manager']);

let cachedRole: string | null | undefined = undefined; // undefined = unfetched
let inflight: Promise<string | null> | null = null;

async function fetchRole(): Promise<string | null> {
  if (cachedRole !== undefined) return cachedRole;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        cachedRole = null;
        return null;
      }
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      cachedRole = (data?.role as string | null) ?? null;
      return cachedRole;
    } catch {
      cachedRole = null;
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useUserRole(): { role: string | null; loading: boolean } {
  const initial = cachedRole === undefined ? null : cachedRole;
  const [role, setRole]       = useState<string | null>(initial);
  const [loading, setLoading] = useState(cachedRole === undefined);

  useEffect(() => {
    if (cachedRole !== undefined) {
      setRole(cachedRole);
      setLoading(false);
      return;
    }
    fetchRole().then((r) => {
      setRole(r);
      setLoading(false);
    });
  }, []);

  return { role, loading };
}

export function canLock(role: string | null): boolean {
  return role !== null && LOCK_ROLES.has(role);
}

export function canSeeLockIcon(role: string | null): boolean {
  return role !== null && VIEW_LOCK_ROLES.has(role);
}
