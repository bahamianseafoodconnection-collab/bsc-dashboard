import type { Metadata, Viewport } from 'next';
import AppShell from './AppShell';
import RegisterSW from './RegisterSW';
import { siteUrl } from '@/lib/site-url';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: 'BSC Marketplace — Fresh. Local. Bahamian.',
  description: 'Bahamian Seafood Connection — Nassau & Andros. Fresh seafood, local food, vehicle listings, and bill payments across the Bahamas.',
  authors: [{ name: 'Dedrick Storr Snr' }],
  creator: 'Bahamian Seafood Connection',
  publisher: 'BSC Marketplace',
  keywords: ['Bahamas seafood', 'Nassau food delivery', 'Bahamian marketplace', 'BSC', 'Andros delivery'],
  manifest: '/manifest.json',
  applicationName: 'BSC Marketplace',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BSC',
  },
  icons: {
    icon:    [{ url: '/favicon.png', type: 'image/png' }, { url: '/icon-192.svg', type: 'image/svg+xml' }],
    apple:   [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/favicon.png'],
  },
  openGraph: {
    title: 'BSC Marketplace — Fresh. Local. Bahamian.',
    description: 'Fresh seafood, local food, vehicles, and bill payments across the Bahamas.',
    type: 'website',
    locale: 'en_BS',
    siteName: 'BSC Marketplace',
  },
};

export const viewport: Viewport = {
  themeColor: '#1a2e5a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
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
          html {
            margin: 0;
            padding: 0;
            overflow-x: hidden;
            scroll-behavior: smooth;
            height: 100%;
          }
          body {
            margin: 0;
            padding: 0;
            overflow-x: hidden;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            scroll-behavior: smooth;
            scrollbar-gutter: stable;
            height: 100%;
            background-color: #f8f9fa;
          }
          input, select, textarea, button {
            font-family: inherit;
            touch-action: manipulation;
          }
          /* Smooth scrolling for all scrollable containers */
          [data-scroll], .overflow-y-auto, .overflow-x-auto {
            -webkit-overflow-scrolling: touch;
            scroll-behavior: smooth;
          }
          /* Hide scrollbars on mobile cleanly */
          ::-webkit-scrollbar {
            width: 4px;
            height: 4px;
          }
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          ::-webkit-scrollbar-thumb {
            background: rgba(245,197,24,0.3);
            border-radius: 99px;
          }
          @keyframes bsc-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.35; }
          }
        `}</style>
      </head>
      <body>
        <RegisterSW />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
