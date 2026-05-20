'use client';

// components/AuditViewerShell.tsx
//
// Shared chrome for the public /spinytails/audit/[token] viewer pages.
// Lives outside /app/spinytails/audit so the page files only export their
// default Page component (Next.js 15 rejects sibling exports from page.tsx).

import type { ReactNode } from 'react';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#e2e8f0', fontFamily: "'DM Sans', system-ui, sans-serif", color: '#1a2e5a' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '14px 16px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/bsc-marketplace-logo.png" alt="BSC Market Place" style={{ height: 56, width: 'auto', display: 'block' }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: '#a16207', textTransform: 'uppercase' }}>
                Spiny Tails Processing Co.
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>HACCP · SSOP · Traceability</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
            🔐 Inspector view
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        {children}
      </main>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const colors: Record<string, [string, string]> = {
    received:             ['#fef3c7', '#92400e'],
    in_receiving_freezer: ['#dbeafe', '#1e40af'],
    thawing:              ['#fef3c7', '#92400e'],
    processing:           ['#ede9fe', '#5b21b6'],
    blast_freezing:       ['#dbeafe', '#1e40af'],
    mastered:             ['#dcfce7', '#166534'],
    in_distribution:      ['#dcfce7', '#166534'],
    shipped:              ['#bbf7d0', '#14532d'],
    rejected:             ['#fee2e2', '#991b1b'],
    recalled:             ['#fee2e2', '#991b1b'],
  };
  const [bg, fg] = colors[status] ?? ['#e5e7eb', '#374151'];
  return <span style={{ background: bg, color: fg, padding: '2px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>{status.replace(/_/g, ' ')}</span>;
}
