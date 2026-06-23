import { createClient } from '@supabase/supabase-js';

// Single browser Supabase client used for authentication. The session is
// persisted in localStorage and refreshed automatically. When the public env
// vars are missing the client is null, so the rest of the app (and the
// login button) gracefully degrade to "no auth configured".
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export const AUTH_ENABLED = Boolean(supabase);
