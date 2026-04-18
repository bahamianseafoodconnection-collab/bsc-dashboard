// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
title: 'BSC Dashboard | Bahamian Seafood Connection',
description: 'Dashboard for Bahamian Seafood Connection',
icons: {
icon: '/favicon.ico',
},
};

export default function RootLayout({
children,
}: {
children: React.ReactNode;
}) {
return (
<html lang="en">
<body>
{children}
</body>
</html>
);
}
