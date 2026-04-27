// File: app/Skeleton.tsx
'use client';

import React, { useEffect, useState } from 'react';

// ── PULSE ANIMATION ──
const pulseStyle = (delay = 0): React.CSSProperties => ({
backgroundColor: '#0d1f3c',
borderRadius: 8,
animation: `bsc-pulse 1.6s ease-in-out ${delay}s infinite`,
});

// Inject keyframes once
if (typeof document !== 'undefined') {
const id = 'bsc-skeleton-styles';
if (!document.getElementById(id)) {
const style = document.createElement('style');
style.id = id;
style.innerHTML = `
@keyframes bsc-pulse {
0%, 100% { opacity: 1; }
50% { opacity: 0.35; }
}
`;
document.head.appendChild(style);
}
}

const bar = (w: string | number, h: number, delay = 0, radius = 8): React.CSSProperties => ({
...pulseStyle(delay),
width: w, height: h, borderRadius: radius, flexShrink: 0,
});

// ── INDIVIDUAL SKELETONS ──

export function SkeletonKPI() {
return (
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
{[0, 0.1, 0.2].map((d, i) => (
<div key={i} style={{ backgroundColor: '#0d1f3c', borderRadius: 16, padding: 18, border: '1px solid #1e3a5f' }}>
<div style={bar('60%', 10, d)} />
<div style={{ ...bar('80%', 24, d + 0.1), marginTop: 10 }} />
<div style={{ ...bar('50%', 10, d + 0.2), marginTop: 8 }} />
</div>
))}
</div>
);
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
return (
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 16, padding: 18, border: '1px solid #1e3a5f', marginBottom: 14 }}>
<div style={bar('45%', 14, 0)} />
<div style={{ marginTop: 14 }}>
{Array.from({ length: rows }).map((_, i) => (
<div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid #1e3a5f' }}>
<div style={{ flex: 1 }}>
<div style={bar('60%', 13, i * 0.1)} />
<div style={{ ...bar('40%', 10, i * 0.1 + 0.1), marginTop: 6 }} />
</div>
<div style={bar(60, 20, i * 0.1)} />
</div>
))}
</div>
</div>
);
}

export function SkeletonOrderCard() {
return (
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 16, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 12 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
<div style={{ flex: 1 }}>
<div style={bar('55%', 13, 0)} />
<div style={{ ...bar('40%', 11, 0.1), marginTop: 6 }} />
<div style={{ ...bar('35%', 10, 0.2), marginTop: 6 }} />
</div>
<div style={{ textAlign: 'right' as const }}>
<div style={bar(70, 20, 0)} />
<div style={{ ...bar(50, 11, 0.1), marginTop: 6 }} />
</div>
</div>
<div style={{ ...pulseStyle(0.15), height: 4, borderRadius: 4, width: '100%' }} />
</div>
);
}

export function SkeletonProductCard() {
return (
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 16, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 12 }}>
<div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
<div style={{ ...pulseStyle(0), width: 56, height: 56, borderRadius: 8, flexShrink: 0 }} />
<div style={{ flex: 1 }}>
<div style={bar('70%', 14, 0)} />
<div style={{ ...bar('45%', 11, 0.1), marginTop: 6 }} />
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
<div style={bar('100%', 32, 0.2, 8)} />
<div style={bar('100%', 32, 0.3, 8)} />
</div>
</div>
</div>
</div>
);
}

export function SkeletonPOSGrid() {
return (
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
{Array.from({ length: 6 }).map((_, i) => (
<div key={i} style={{ backgroundColor: '#0d1f3c', borderRadius: 14, padding: 14, border: '1px solid #1e3a5f' }}>
<div style={{ ...pulseStyle(i * 0.08), width: '100%', height: 80, borderRadius: 8, marginBottom: 10 }} />
<div style={bar('70%', 13, i * 0.08)} />
<div style={{ ...bar('45%', 12, i * 0.08 + 0.1), marginTop: 6 }} />
<div style={{ ...bar('100%', 36, i * 0.08 + 0.2, 10), marginTop: 10 }} />
</div>
))}
</div>
);
}

export function SkeletonDashboard() {
return (
<div style={{ padding: '24px 20px', fontFamily: "'Inter', sans-serif" }}>
{/* Header strip */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 }}>
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 18, padding: 20, border: '1px solid #1e5a9f' }}>
<div style={bar('60%', 10, 0)} />
<div style={{ ...bar('80%', 18, 0.1), marginTop: 8 }} />
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
<div style={bar('100%', 48, 0.2, 10)} />
<div style={bar('100%', 48, 0.3, 10)} />
</div>
<div style={{ ...bar('100%', 38, 0.2, 10), marginTop: 12 }} />
</div>
<div style={{ backgroundColor: '#0d1f3c', borderRadius: 18, padding: 20, border: '1px solid #7c3aed' }}>
<div style={bar('60%', 10, 0.1)} />
<div style={{ ...bar('80%', 18, 0.2), marginTop: 8 }} />
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
<div style={bar('100%', 48, 0.3, 10)} />
<div style={bar('100%', 48, 0.4, 10)} />
</div>
<div style={{ ...bar('100%', 38, 0.3, 10), marginTop: 12 }} />
</div>
</div>
<SkeletonKPI />
<SkeletonCard rows={5} />
<SkeletonCard rows={3} />
</div>
);
}

export function SkeletonPage({ label }: { label?: string }) {
return (
<div style={{
minHeight: '100vh', backgroundColor: '#060d1f',
display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
fontFamily: "'Inter', sans-serif",
}}>
<div style={{ fontSize: 48, marginBottom: 16, animation: 'bsc-pulse 1.6s ease-in-out infinite' }}>🐟</div>
<div style={{ ...bar(120, 14, 0), marginBottom: 8 }} />
{label && <p style={{ color: '#4a5568', fontSize: 12, marginTop: 8 }}>{label}</p>}
</div>
);
}

// ── SMART LOADER ──
// Shows skeleton for `delay` ms then renders children
export function WithSkeleton({
loading,
skeleton,
children,
}: {
loading: boolean;
skeleton: React.ReactNode;
children: React.ReactNode;
}) {
return <>{loading ? skeleton : children}</>;
}

// ── SUSPENSE WRAPPER ──
// Drop-in replacement for React.Suspense with BSC skeleton
export function BSCSuspense({
children,
fallback,
}: {
children: React.ReactNode;
fallback?: React.ReactNode;
}) {
return (
<React.Suspense fallback={fallback || <SkeletonPage />}>
{children}
</React.Suspense>
);
}
