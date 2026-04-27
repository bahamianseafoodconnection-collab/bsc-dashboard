// File: app/layout.tsx
import type { Metadata } from "next";
import AppShell from "./AppShell";

export const metadata: Metadata = {
title: "BSC Marketplace — Fresh. Local. Bahamian.",
description: "Bahamian Seafood Connection — Nassau & Andros. Fresh seafood, local food, vehicle listings, and bill payments across the Bahamas.",
authors: [{ name: "Dedrick Storr Snr" }],
creator: "Bahamian Seafood Connection",
publisher: "BSC Marketplace",
keywords: ["Bahamas seafood", "Nassau food delivery", "Bahamian marketplace", "BSC", "Andros delivery"],
viewport: { width: "device-width", initialScale: 1, maximumScale: 1 },
themeColor: "#060d1f",
manifest: "/manifest.json",
icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
openGraph: {
title: "BSC Marketplace — Fresh. Local. Bahamian.",
description: "Fresh seafood, local food, vehicles, and bill payments across the Bahamas.",
type: "website",
locale: "en_BS",
siteName: "BSC Marketplace",
},
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
return (
<html lang="en">
<head>
{/* ── PERFORMANCE: Preconnect to Supabase & external services ── */}
<link rel="preconnect" href="https://auqjjrisivhfmpleusyt.supabase.co" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="dns-prefetch" href="https://api.whatsapp.com" />
<link rel="dns-prefetch" href="https://api.qrserver.com" />
{/* ── MOBILE: Prevent tap highlight on mobile ── */}
<style>{`
* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
body { margin: 0; padding: 0; overscroll-behavior: none; }
input, select, textarea, button { font-family: inherit; }
/* Smooth scrolling system-wide */
html { scroll-behavior: smooth; }
/* Prevent layout shift on scroll */
:root { scrollbar-gutter: stable; }
/* BSC pulse animation for skeletons */
@keyframes bsc-pulse {
0%, 100% { opacity: 1; }
50% { opacity: 0.35; }
}
`}</style>
</head>
<body style={{ margin: 0, backgroundColor: '#060d1f' }}>
<AppShell>{children}</AppShell>
</body>
</html>
);
}
