import type { Metadata, Viewport } from 'next';
import AppShell from './AppShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'BSC Marketplace — Fresh. Local. Bahamian.',
  description: 'Bahamian Seafood Connection — Nassau & Andros. Fresh seafood, local food, vehicle listings, and bill payments across the Bahamas.',
  authors: [{ name: 'Dedrick Storr Snr' }],
  creator: 'Bahamian Seafood Connection',
  publisher: 'BSC Marketplace',
  keywords: ['Bahamas seafood', 'Nassau food delivery', 'Bahamian marketplace', 'BSC', 'Andros delivery'],
  manifest: '/manifest.json',
  icons: { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
  openGraph: {
    title: 'BSC Marketplace — Fresh. Local. Bahamian.',
    description: 'Fresh seafood, local food, vehicles, and bill payments across the Bahamas.',
    type: 'website',
    locale: 'en_BS',
    siteName: 'BSC Marketplace',
  },
};

// themeColor moved out of `metadata` per Next 15. The earlier viewport meta
// tag is also kept inline in <head> below for older browsers / PWA chrome.
export const viewport: Viewport = {
  themeColor: '#1a2e5a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* ACTIVE Supabase project — fixed from old URL */}
        <link rel="preconnect" href="https://qgcaxkyuhwmpvpbooaqw.supabase.co" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://api.whatsapp.com" />
        <link rel="dns-prefetch" href="https://api.qrserver.com" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <style>{`
          *, *::before, *::after {
            -webkit-tap-highlight-color: transparent;
            box-sizing: border-box;
          }
          html, body {
            margin: 0;
            padding: 0;
            overflow-x: hidden;
            overscroll-behavior: none;
            scroll-behavior: smooth;
            scrollbar-gutter: stable;
          }
          input, select, textarea, button {
            font-family: inherit;
          }
          @keyframes bsc-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.35; }
          }
        `}</style>
      </head>
      <body style={{ margin: 0, padding: 0, overflowX: 'hidden', backgroundColor: '#f8f9fa' }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}