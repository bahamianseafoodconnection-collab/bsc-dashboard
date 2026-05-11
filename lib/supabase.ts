// Single browser-side Supabase client for the BSC dashboard.
// Uses createBrowserClient from @supabase/ssr so the session cookie
// is shared correctly across all pages that import this client.
//
// Server routes that need the service-role key build their own admin client
// with `createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, ...)`.

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
