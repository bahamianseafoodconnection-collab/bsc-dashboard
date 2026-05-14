import type { Metadata, Viewport } from 'next';
import AppShell from './AppShell';
import { siteUrl } from '@/lib/site-url';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: 'BSC Marketplace — Fresh. Local. Bahamian.',
  description: 'Bahamian Seafood Connection — Nassau & Andros. Fresh seafood, local food, vehicle listings, and bill payments across the Bahamas.',
  authors: [{ name: 'Dedrick Storr Snr' }],
  creator: 'Bahamian Seafood Connection',
  publisher: 'BSC Marketplace',
  keywords: ['Bahamas seafood', 'Nassau food delivery​​​​​​​​​​​​​​​​
