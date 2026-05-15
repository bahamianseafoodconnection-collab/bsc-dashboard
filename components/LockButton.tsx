'use client';

// Lock / unlock control for orders, catch_logs, and processing_logs.
//
// Visibility matrix (per the May 15 2026 spec):
//                       unlocked          locked
//   founder/co_founder  "Lock" button     🔒 + "Unlock" button
//   manager             nothing           🔒 (read-only)
//   anyone else         nothing           nothing
//
// Database write goes straight to the row's table — assumes the caller
// has the correct table prop. Defense-in-depth (RLS) should also be in
// place server-side; this component is the UI surface.

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserRole, canLock, canSeeLockIcon } from '@/lib/role';

const GOLD = '#f5c518';

type LockableTable = 'orders' | 'catch_logs' | 'processing_logs';

interface Props {
  table:    LockableTable;
  id:       string;
  lockedBy: string | null;
  lockedAt: string | null;
  /** Called after a successful lock or unlock so the parent can update its row. */
  onChange?: (next: { locked_by: string | null; locked_at: string | null }) => void;
}

export default function LockButton({ table, id, lockedBy, lockedAt, onChange }: Props) {
  const { role, loading } = useUserRole();
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;

  const isLocked = !!lockedBy;
  const allowed  = canLock(role);
  const canSee   = canSeeLockIcon(role);

  // No surface at all for roles that can't see lock state, and no surface
  // for the unlocked path when the role can't lock.
  if (!canSee) return null;
  if (!isLocked && !allowed) return null;

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    setError(null);

    let payload: { locked_by: string | null; locked_at: string | null };
    if (isLocked) {
      payload = { locked_by: null, locked_at: null };
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      payload = {
        locked_by: user?.id ?? null,
        locked_at: new Date().toISOString(),
      };
    }

    const { error: err } = await supabase.from(table).update(payload).eq('id', id);
    setBusy(false);
    if (err) {
      setError('Could not update lock — try again.');
      return;
    }
    onChange?.(payload);
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {isLocked && (
        <span
          title={lockedAt ? `Locked at ${new Date(lockedAt).toLocaleString()}` : 'Locked'}
          aria-label="Locked"
          style={{ color: GOLD, fontSize: 16, lineHeight: 1 }}
        >
          🔒
        </span>
      )}
      {allowed && (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          style={{
            background:   isLocked ? 'rgba(245,197,24,0.15)' : '#1a2e5a',
            color:        isLocked ? GOLD : '#fff',
            border:       `1px solid ${GOLD}`,
            borderRadius: 6,
            padding:      '3px 10px',
            fontSize:     11,
            fontWeight:   800,
            cursor:       busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? '…' : isLocked ? 'Unlock' : 'Lock'}
        </button>
      )}
      {error && (
        <span style={{ color: '#fca5a5', fontSize: 11 }}>{error}</span>
      )}
    </span>
  );
}
