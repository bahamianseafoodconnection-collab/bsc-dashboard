'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { label: 'POS', href: '/pos', icon: '🛒' },
  { label: 'Summary', href: '/', icon: '📊' },
  { label: 'Inventory', href: '/inventory', icon: '📦' },
  { label: 'Market', href: '/market', icon: '🏪' },
  { label: 'Report', href: '/report', icon: '📋' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#0a1729]">
      {children}

      {/* Bottom Navigation – Mobile-first */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#0a1729] border-t border-white/10 z-50 max-w-md mx-auto">
        <div className="flex items-center justify-around py-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
                           (item.href === '/' && pathname === '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center w-full py-2 transition-all ${isActive ? 'text-amber-400' : 'text-white/60 hover:text-white/80'}`}
              >
                <span className="text-2xl mb-1">{item.icon}</span>
                <span className="text-xs font-medium tracking-widest">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}