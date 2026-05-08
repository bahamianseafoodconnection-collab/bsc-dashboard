// Single browser-side Supabase client for the BSC dashboard.
// Connection comes from NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// in .env.local — no project URLs or keys are baked into source.
//
// Server routes that need the service-role key build their own admin client
// with `createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, ...)`.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
