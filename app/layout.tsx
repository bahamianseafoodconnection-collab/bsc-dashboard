// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
title: 'BSC Dashboard | Bahamian Seafood Connection',
description: 'Dashboard for Bahamian Seafood Connection',
};

export default function RootLayout({
children,
}: {
children: React.ReactNode; // This is fine if React is available via Next.js types
}) {
return (
<html lang="en">
<body>
{children}
</body>
</html>
);
}
