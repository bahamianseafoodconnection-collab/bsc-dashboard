'use client';

// Universal Save button — the front-end face of the server-authoritative Save
// standard (D2 / Phase 5). Pair with useServerSave(). Reflects save state
// (idle → saving → saved/error) and disables itself while saving so the user
// can't double-submit. The actual persistence + lock happens server-side.

import type { SaveState } from '@/lib/useServerSave';

export function SaveButton({
  state,
  onClick,
  label = 'Save',
  savedLabel = '✓ Saved',
  disabled = false,
  title,
}: {
  state:       SaveState;
  onClick:     () => void;
  label?:      string;
  savedLabel?: string;
  disabled?:   boolean;
  title?:      string;
}) {
  const busy = state === 'saving';
  const text =
    busy            ? 'Saving…' :
    state === 'saved' ? savedLabel :
    state === 'error' ? '⚠ Retry' :
    label;
  const bg =
    state === 'saved' ? '#16a34a' :
    state === 'error' ? '#dc2626' :
    '#f5c518';
  const color = state === 'saved' || state === 'error' ? '#fff' : '#060d1f';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      title={title}
      style={{
        background:    bg,
        color,
        border:        'none',
        borderRadius:  10,
        padding:       '9px 18px',
        fontWeight:    900,
        fontSize:      13,
        cursor:        busy || disabled ? 'not-allowed' : 'pointer',
        opacity:       disabled ? 0.5 : 1,
        transition:    'background-color 0.15s',
      }}
    >
      {text}
    </button>
  );
}
