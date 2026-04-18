// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
title: 'BSC Dashboard',
description: 'Bahamian Seafood Connection Dashboard',
};

export default function RootLayout({
children,
}: {
children: React.ReactNode;
}) {
return (
<html lang="en">
<body>{children}</body>
</html>
);
}
