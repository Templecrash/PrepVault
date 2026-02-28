import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Graceful fallback: if Supabase isn't configured, create a dummy client
// that won't crash the app. Auth features will show "not configured" state.
export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signUp: async () => ({ error: { message: 'Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local' } }),
        signInWithPassword: async () => ({ error: { message: 'Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local' } }),
        signOut: async () => ({}),
      },
      from: () => ({
        select: () => ({ eq: () => ({ is: () => ({ order: async () => ({ data: [], error: null }) }), single: async () => ({ data: null, error: null }) }) }),
        upsert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
      }),
      channel: () => ({
        on: () => ({ subscribe: () => ({}) }),
      }),
    };
