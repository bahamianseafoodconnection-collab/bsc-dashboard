'use client';

import { usePathname, useRouter } from 'next/navigation';

// ── SVG icon set — clean line icons, premium feel ────────────────────────────
const ICONS = {
home: (active: boolean) => (
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
<path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1v-9.5z" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
</svg>
),
shop: (active: boolean) => (
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
<path d="M5 8h14l-1 11.5a1.5 1.5 0 01-1.5 1.4h-9A1.5 1.5 0 016 19.5L5 8z" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
<path d="M8.5 8V6a3.5 3.5 0 117 0v2" />
</svg>
),
bill: (active: boolean) => (
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
<path d="M9 8h6M9 12h6M9 16h3" />
</svg>
),
vehicle: (active: boolean) => (
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
<path d="M3 13l1.5-5.5A2 2 0 016.4 6h11.2a2 2 0 011.9 1.5L21 13v5h-2v-2H5v2H3v-5z" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
<circle cx="7.5" cy="15" r="1.4" fill="currentColor" />
<circle cx="16.5" cy="15" r="1.4" fill="currentColor" />
</svg>
),
account: (active: boolean) => (
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
<circle cx="12" cy="8.5" r="3.8" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
<path d="M4.5 20.5c1.4-3.8 4.4-5.8 7.5-5.8s6.1 2 7.5 5.8" />
</svg>
),
};

// ── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
{ key: 'home', label: 'Home', route: '/', paths: ['/'] },
{ key: 'shop', label: 'Shop', route: '/market', paths: ['/market', '/local-wholesale', '/us-shopping', '/checkout'] },
{ key: 'bill', label: 'Pay Bill', route: '/utilities', paths: ['/utilities'] },
{ key: 'vehicle', label: 'Vehicles', route: '/vehicles', paths: ['/vehicles'] },
{ key: 'account', label: 'Account', route: '/login', paths: ['/login', '/dashboard', '/profile'] },
] as const;

export default function BottomNav() {
const router = useRouter();
const pathname = usePathname() || '/';

const isActive = (paths: readonly string[]) =>
paths.some(p => p === '/' ? pathname === '/' : pathname.startsWith(p));

return (
<>
<style>{`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,500;9..40,600;9..40,700&display=swap');

.bsc-bnav-spacer {
height: calc(72px + env(safe-area-inset-bottom, 0px));
}

.bsc-bnav {
position: fixed;
bottom: 0; left: 0; right: 0;
z-index: 250;
background: linear-gradient(180deg, rgba(10,21,32,0.92) 0%, rgba(6,14,28,0.98) 100%);
backdrop-filter: blur(18px);
-webkit-backdrop-filter: blur(18px);
border-top: 1px solid rgba(212,168,67,0.18);
padding-bottom: env(safe-area-inset-bottom, 0px);
font-family: 'DM Sans', sans-serif;
box-shadow: 0 -4px 24px rgba(0,0,0,0.32);
}

/* Subtle gold top glow */
.bsc-bnav::before {
content: '';
position: absolute; top: 0; left: 0; right: 0; height: 1px;
background: linear-gradient(90deg, transparent 0%, rgba(212,168,67,0.5) 50%, transparent 100%);
}

.bsc-bnav-inner {
display: flex;
align-items: stretch;
justify-content: space-around;
height: 72px;
max-width: 720px;
margin: 0 auto;
padding: 0 8px;
}

.bsc-bnav-tab {
flex: 1;
background: none;
border: none;
cursor: pointer;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
gap: 4px;
padding: 10px 4px 12px;
color: rgba(255,255,255,0.42);
position: relative;
transition: color 0.22s ease;
font-family: inherit;
-webkit-tap-highlight-color: transparent;
}

.bsc-bnav-tab:hover { color: rgba(255,255,255,0.65); }

.bsc-bnav-tab.active { color: #f5c842; }

/* Icon wrapper — handles scale animation */
.bsc-bnav-icon {
display: flex;
align-items: center;
justify-content: center;
width: 26px; height: 26px;
transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.bsc-bnav-tab.active .bsc-bnav-icon { transform: translateY(-1px) scale(1.06); }
.bsc-bnav-tab:active .bsc-bnav-icon { transform: scale(0.92); }

/* Label */
.bsc-bnav-label {
font-size: 10.5px;
font-weight: 600;
letter-spacing: 0.04em;
line-height: 1;
transition: font-weight 0.2s ease;
}
.bsc-bnav-tab.active .bsc-bnav-label {
font-weight: 700;
}

/* Top dot indicator for active */
.bsc-bnav-dot {
position: absolute;
top: 4px;
width: 4px;
height: 4px;
border-radius: 50%;
background: #f5c842;
box-shadow: 0 0 8px rgba(245,200,66,0.6);
opacity: 0;
transform: scale(0);
transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.bsc-bnav-tab.active .bsc-bnav-dot {
opacity: 1;
transform: scale(1);
}

/* Subtle background glow behind active icon */
.bsc-bnav-glow {
position: absolute;
top: 12px;
width: 38px;
height: 38px;
border-radius: 50%;
background: radial-gradient(circle, rgba(245,200,66,0.18) 0%, transparent 70%);
opacity: 0;
transition: opacity 0.3s ease;
pointer-events: none;
}
.bsc-bnav-tab.active .bsc-bnav-glow { opacity: 1; }

/* Hide on tablet/desktop — bottom nav is mobile-only */
@media (min-width: 768px) {
.bsc-bnav, .bsc-bnav-spacer { display: none; }
}
`}</style>

{/* Spacer — prevents content being hidden behind the fixed nav */}
<div className="bsc-bnav-spacer" aria-hidden="true" />

<nav className="bsc-bnav" role="navigation" aria-label="Bottom navigation">
<div className="bsc-bnav-inner">
{TABS.map(tab => {
const active = isActive(tab.paths);
const Icon = ICONS[tab.key];
return (
<button
key={tab.key}
className={`bsc-bnav-tab ${active ? 'active' : ''}`}
onClick={() => router.push(tab.route)}
aria-label={tab.label}
aria-current={active ? 'page' : undefined}
>
<span className="bsc-bnav-dot" aria-hidden="true" />
<span className="bsc-bnav-glow" aria-hidden="true" />
<span className="bsc-bnav-icon">{Icon(active)}</span>
<span className="bsc-bnav-label">{tab.label}</span>
</button>
);
})}
</div>
</nav>
</>
);
}
