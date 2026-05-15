'use client';

// Reusable error block for staff-facing pages. Shows a plain-English
// message and an optional "Try again" button. Never leaks raw error
// strings to the user — pair with lib/plain-error.ts at the call site.

interface Props {
  message: string;
  /** Optional retry handler — renders a "Try again" button when provided. */
  onRetry?: () => void;
  /** Optional rawDetails for development; only shown when NEXT_PUBLIC_DEBUG_ERRORS is "1". */
  rawDetails?: string;
}

export default function ErrorState({ message, onRetry, rawDetails }: Props) {
  const debug = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DEBUG_ERRORS === '1';

  return (
    <div
      role="alert"
      style={{
        background:    'rgba(248,113,113,0.1)',
        border:        '1px solid #f87171',
        borderRadius:  10,
        padding:       12,
        color:         '#fca5a5',
        fontSize:      13,
        fontWeight:    600,
        marginBottom:  10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <span>⚠️ {message}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              background:    'transparent',
              color:         '#fca5a5',
              border:        '1px solid #fca5a5',
              borderRadius:  6,
              padding:       '4px 10px',
              fontSize:      11,
              fontWeight:    700,
              cursor:        'pointer',
              whiteSpace:    'nowrap',
              flexShrink:    0,
            }}
          >
            Try again
          </button>
        )}
      </div>
      {debug && rawDetails && (
        <pre style={{ marginTop: 8, fontSize: 10, opacity: 0.6, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          {rawDetails}
        </pre>
      )}
    </div>
  );
}
