import { createClient } from "@supabase/supabase-js"

export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// BACKWARD COMPATIBILITY (fixes your errors instantly)
export const createClientInstance = createBrowserClient

export default createBrowserClient