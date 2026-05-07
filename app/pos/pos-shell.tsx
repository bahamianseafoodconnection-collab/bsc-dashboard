'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

type Props = {
userId: string;
userEmail: string;
userRole: string;
primaryLocation: string;
children: React.ReactNode;
};

const NAV_ITEMS = [
{ href: '/pos', icon: '💵', label: 'Register', section: 'Sell' },
{ href: '/pos/scan', icon: '📷', label: 'Scanner', section: 'Sell' },
{ href: '/pos/inventory', icon: '📦', label: 'Inventory', section: 'Stock' },
{ href: '/pos/purchase-orders', icon: '📑', label: 'Purchase Orders', section: 'Stock' },
{ href: '/pos/customers', icon: '👥', label: 'Customers', section: 'Customers' },
{ href: '/pos/sales-history', icon: '📊', label: 'Sales History', section: 'Reports' },
{ href: '/pos/reports', icon: '📈', label: 'Reports', section: 'Reports' },
{ href: '/pos/expenses', icon: '💸', label: 'Expenses', section: 'Money' },
];

export default function PosShell({ userEmail, userRole, primaryLocation, children }: Props) {
const pathname = usePathname();
const router = useRouter();
const [mobileOpen, setMobileOpen] = useState(false);

const isActive = (href: string) => {
if (href === '/pos') return pathname === '/pos';
return pathname.startsWith(href);
};

async function handleSignOut() {
const supabase = createBrowserClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
await supabase.auth.signOut();
router.replace('/staff-login');
}

// Group nav items by section
const sections: Record<string, typeof NAV_ITEMS> = {};
NAV_ITEMS.forEach((item) => {
if (!sections[item.section]) sections[item.section] = [];
sections[item.section].push(item);
});

return (
<div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f4f6f9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

{/* MOBILE TOPBAR */}
<div className="bsc-mobile-topbar" style={{ display: 'none' }}>
<button
onClick={() => setMobileOpen(true)}
style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', padding: 8 }}
>
☰
</button>
<div style={{ color: '#f4c842', fontWeight: 900, fontSize: 15 }}>BSC POS</div>
<Link href="/pos/scan" style={{ color: '#f4c842', textDecoration: 'none', fontSize: 18 }}>📷</Link>
</div>

{/* SIDEBAR — desktop always, mobile when open */}
<aside
className={mobileOpen ? 'bsc-sidebar bsc-sidebar-open' : 'bsc-sidebar'}
style={{
width: 240,
backgroundColor: '#1a2e5a',
color: '#fff',
display: 'flex',
flexDirection: 'column',
flexShrink: 0,
}}
>
{/* Brand */}
<div style={{ padding: '20px 18px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
<Link href="/dashboard" style={{ textDecoration: 'none' }}>
<div style={{ color: '#f4c842', fontWeight: 900, fontSize: 16, letterSpacing: 0.5 }}>BSC POS</div>
<div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 2 }}>
{primaryLocation === 'all_locations' ? 'All Locations' : primaryLocation || 'Nassau'}
</div>
</Link>
<button
onClick={() => setMobileOpen(false)}
className="bsc-mobile-close"
style={{ display: 'none', background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}
>
×
</button>
</div>
</div>

{/* Nav */}
<nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
{Object.entries(sections).map(([section, items]) => (
<div key={section} style={{ marginBottom: 16 }}>
<div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, padding: '8px 18px 6px', textTransform: 'uppercase' }}>
{section}
</div>
{items.map((item) => {
const active = isActive(item.href);
return (
<Link
key={item.href}
href={item.href}
onClick={() => setMobileOpen(false)}
style={{
display: 'flex',
alignItems: 'center',
gap: 12,
padding: '10px 18px',
color: active ? '#f4c842' : 'rgba(255,255,255,0.85)',
backgroundColor: active ? 'rgba(244,200,66,0.1)' : 'transparent',
textDecoration: 'none',
fontSize: 13,
fontWeight: active ? 800 : 500,
borderLeft: active ? '3px solid #f4c842' : '3px solid transparent',
}}
>
<span style={{ fontSize: 17 }}>{item.icon}</span>
<span>{item.label}</span>
</Link>
);
})}
</div>
))}
</nav>

{/* Footer — user info + sign out */}
<div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '14px 18px' }}>
<div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>{userEmail}</div>
<div style={{ fontSize: 10, color: '#f4c842', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
{userRole}
</div>
<button
onClick={handleSignOut}
style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
>
Sign out
</button>
</div>
</aside>

{/* Mobile overlay */}
{mobileOpen && (
<div
onClick={() => setMobileOpen(false)}
className="bsc-mobile-overlay"
style={{ display: 'none' }}
/>
)}

{/* Main content */}
<main style={{ flex: 1, overflowX: 'hidden', minWidth: 0 }}>
{children}
</main>

{/* Mobile-only CSS */}
<style jsx global>{`
@media (max-width: 768px) {
.bsc-mobile-topbar {
display: flex !important;
align-items: center;
justify-content: space-between;
background-color: #1a2e5a;
padding: 0 14px;
height: 52px;
position: sticky;
top: 0;
z-index: 30;
}
.bsc-sidebar {
position: fixed !important;
top: 0;
left: 0;
bottom: 0;
transform: translateX(-100%);
transition: transform 0.25s ease;
z-index: 50;
}
.bsc-sidebar-open {
transform: translateX(0) !important;
}
.bsc-mobile-close {
display: block !important;
}
.bsc-mobile-overlay {
display: block !important;
position: fixed;
inset: 0;
background-color: rgba(0,0,0,0.5);
z-index: 40;
}
}
`}</style>
</div>
);
}
