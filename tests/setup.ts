// Dummy Supabase credentials so modules that initialize the client at
// import time (lib/supabase.ts → lib/finance.ts → lib/invoices.ts) don't
// crash. The pure functions under test never actually call out to Supabase.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-key';
