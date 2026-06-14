// lib/supabase.ts
//
// The app-wide browser Supabase client (anon key, RLS-enforced). Imported as
// `import { supabase } from '@/lib/supabase'` across pages and components.
//
// Server routes that need the service-role key build their own admin client
// with `createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, ...)` — they
// do NOT use this browser client.
//
// LAZY INIT (2026-06-14): the client is constructed on FIRST property access,
// not at module import. createBrowserClient() throws if url/key are absent —
// and during `next build` page-data collection (where NEXT_PUBLIC_* may be
// unset) any SERVER route that transitively imports this module (e.g.
// /api/landed-cost/calculate and the three /api/payment/return/* routes, via
// lib/finance) would otherwise throw at import time:
//   "@supabase/ssr: Your project's URL and API key are required..."
// Deferring construction to first use keeps the import side-effect-free while
// leaving the `import { supabase }` API unchanged for every caller. The Proxy
// forwards every property access to the real, lazily-built singleton and binds
// methods so `supabase.from(...)` / `supabase.auth.getSession()` keep the
// correct `this`.

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return _client;
}

// Single exported client. The Proxy defers construction to first property
// access so importing this module has no side effects (safe during build),
// while every caller's `import { supabase }` and `supabase.xxx` usage is
// unchanged. Methods are bound to the real client so `this` is preserved.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabase();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
