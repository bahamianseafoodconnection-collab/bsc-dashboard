// File: app/AppShell.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
{ label: 'POS', href: '/pos', icon: '🛒' },
{ label: 'Summary', href: '/', icon: '📊' },
{ label: 'Market', href: '/market', icon: '🏪' },
{ label: 'Supplier', href: '/supplier', icon: '🚢' },
{ label: 'Report', href: '/report', icon: '📋' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
const pathname = usePathname();

const hideNav =
pathname === '/login' ||
pathname === '/reset-password' ||
pathname.startsWith('/supplier') ||
pathname.startsWith('/purchase-orders');

return (
<div className="min-h-screen bg-[#0a1729] flex flex-col">
<main className="flex-1 pb-20">
{children}
</main>

{!hideNav && (
<nav className="fixed bottom-0 left-0 right-0 bg-[#0a1729]/95 backdrop-blur-lg border-t border-white/10 z-50 max-w-md mx-auto w-full">
<div className="flex items-center justify-around py-2">
{navItems.map((item) => {
const isActive = pathname === item.href || (item.href === '/' && pathname === '/');
return (
<Link
key={item.href}
href={item.href}
className={`flex flex-col items-center py-2 flex-1 transition-all ${isActive ? 'text-amber-400 scale-110' : 'text-white/60 hover:text-white/90'}`}
>
<span className="text-3xl mb-0.5">{item.icon}</span>
<span className="text-[10px] font-medium tracking-widest">{item.label}</span>
</Link>
);
})}
</div>
</nav>
)}
</div>
);
}
