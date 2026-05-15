'use client';

// Reusable loading indicator. Use anywhere a page or section is fetching
// and the UI would otherwise render empty/blank.
//
// Variants:
//   <LoadingState />                          → centered spinner + "Loading…"
//   <LoadingState label="Loading orders" />   → custom label
//   <LoadingState size="small" />             → inline use, smaller spinner

interface Props {
  label?: string;
  size?: 'small' | 'medium';
}

const GOLD = '#f5c518';

export default function LoadingState({ label = 'Loading…', size = 'medium' }: Props) {
  const dim = size === 'small' ? 16 : 28;
  const pad = size === 'small' ? '8px 12px' : '32px 16px';
  const fontSize = size === 'small' ? 12 : 14;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            10,
        padding:        pad,
        color:          'rgba(255,255,255,0.7)',
        fontSize,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width:           dim,
          height:          dim,
          borderRadius:    '50%',
          border:          `${size === 'small' ? 2 : 3}px solid rgba(245,197,24,0.25)`,
          borderTopColor:  GOLD,
          animation:       'bsc-spin 0.8s linear infinite',
          display:         'inline-block',
        }}
      />
      <span>{label}</span>
      <style>{`
        @keyframes bsc-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
