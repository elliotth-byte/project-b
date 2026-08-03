import { createClient } from "@supabase/supabase-js";

// These two values come from your Supabase project settings
// (Project Settings → API). They get set in Vercel as Environment
// Variables — see the README for exactly where.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // This just gives you a clear error instead of a confusing crash
  // if someone forgets to set the environment variables.
  console.warn(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — check your .env.local file."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
