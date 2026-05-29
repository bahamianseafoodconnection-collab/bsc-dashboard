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

// Client-safe canonical URL for building auth-email redirect links from the
// browser. Auth links MUST point at a domain that's on Supabase's Redirect
// URLs allowlist, or Supabase silently falls back to the (localhost) Site URL
// and the confirm link 404s. So prefer the build-time canonical domain, then
// the live origin; never localhost in prod. (VERCEL_URL isn't exposed to the
// client, so siteUrl() can't be used here.)
export function publicSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return 'https://bscbahamas.com';
}
