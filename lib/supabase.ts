// File: lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://auqjjrisivhfmpleusyt.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
