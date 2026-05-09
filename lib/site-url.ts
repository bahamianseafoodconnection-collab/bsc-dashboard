// lib/site-url.ts
//
// Single source of truth for the canonical public URL of the deployed site.
// Honored, in order:
//   1. NEXT_PUBLIC_SITE_URL  (set in Vercel env to e.g. https://bsc-market.com)
//   2. VERCEL_URL            (auto-injected by Vercel on every deploy)
//   3. http://localhost:3000 (dev fallback)
//
// Always returns a string with no trailing slash. Used by metadataBase,
// the sitemap, and robots.

export function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`;
  return 'http://localhost:3000';
}
