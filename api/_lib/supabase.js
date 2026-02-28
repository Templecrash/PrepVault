import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with service role key (full access, bypasses RLS)
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Client-safe Supabase client (respects RLS)
export const supabaseClient = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);
